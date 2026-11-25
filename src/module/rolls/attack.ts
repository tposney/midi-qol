import { tokenFor, tokenOf } from "../lib/tokenResolver.js";
import { AdvantageFlags, RollModifierTracker, computeAdvantageFlags } from "../lib/RollModifierTracker.js";
import { attackBonusSources, labelD20Parts, setBonusSources } from "../lib/rollParts.js";
import { GameSystemConfig } from "../../midi-qol.js";
import { MidiOptions } from "../utils.js";
import type { Activity, ActivityUseConfiguration, DND5ETargetDescriptor, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { MODULE_ID, busyWait, debug, debugEnabled, error, i18n, i18nFormat, warn } from "../../midi-qol.js";
import { OnUseMacros } from "../apps/Item.js";
import { USAGE_MESSAGE_TYPE } from "../ChatClasses/UsageCardMessage.js";
import { doActivityReactions } from "../activities/activityHelpers.js";
import { findAmmunitionActivity } from "../activities/midiActivity.js";
import { deprecation } from "../lib/compatLine.js";
import { applyRollModifiers, applyTrackerAdvantage, computeRollModifiers, type RollModifierFlags } from "../lib/RollModifierTracker.js";
import { decideRollDialog, dialogShown, heldKeys } from "../lib/rollKeys.js";
import { TokenDocumentSet } from "../lib/tokenDocumentSet.js";
import { configSettings } from "../settings.js";
import { addAttribution, areMidiKeysPressed, callActivityHooks, displayDSNForRoll, getSpeaker, getToken, isAutoFastForward, setMessageTargets, tokenSourceCenter, updateUserTargets } from "../utils.js";
import { Workflow } from "../Workflow.js";
import { isRollOf } from "./common.js";

/*
 * midi's attack roll (M13): a libWrapper MIXED wrap (attacking again after the use, a blocked roll: no dnd5e roll) on
 * dnd5e's AttackActivity#rollAttack around dnd5e's roll, in place
 * of the methods graft.ts installed; Attack's own getters are installed on dnd5e's Attack class (installAttackRolls).
 * dnd5e 6.1's roll hooks are synchronous, so the async work (reactions, isPreAttacked macros, the pre-attack hooks and
 * macros, ammunition confirmation, bonuses, Dice So Nice, resuming the workflow) stays in the wrap. The per-roll hook
 * listeners are registered when the roll starts so they run after other modules' (cover modules adjust AC first) and
 * are guarded by the roll's subject.
 */


/** The Attack activity properties these functions read (midi's schema fields and its Attack getters, below) */
interface AttackActivityLike extends Activity {
  ability: string;
  attackMode?: string;
  ammunition?: string;
  ammunitionPerTarget?: string;
  attackRollPerTarget?: string;
  confirmAmmunition: { reason?: string, confirm: boolean, proceed: boolean };
  requireAmmunition: boolean;
  getActionType?(attackMode?: string): string;
  update(data: object): Promise<unknown>;
  _ammunitionItem?: Item.Implementation;
  _ammunitionActivity?: Activity;
  _otherActivity?: Activity;
}

type RollAttack = (config?: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig) => Promise<Roll[] | null | undefined>;

/**
 * Show the player which token an attack dialog is for: give the attack's targets the targeting reticle and pan the
 * canvas to them (their centre, for several).
 */
function showAttackTargets(workflow: Workflow) {
  if (!canvas?.ready) return;
  const tokens = (workflow.targets?.tokens ?? []).map(target => tokenOf(tokenFor(target)))
    .filter((token): token is Token.Implementation => !!token && token.scene === canvas.scene);
  if (!tokens.length) return;
  updateUserTargets(tokens.map(token => token.id));
  const centres = tokens.map(token => tokenSourceCenter(token));
  canvas.animatePan({
    x: centres.reduce((sum, c) => sum + c.x, 0) / centres.length,
    y: centres.reduce((sum, c) => sum + c.y, 0) / centres.length,
    duration: 250
  });
}

/**
 * Resolves with the workflow started with `sequenceId` when it has cleaned up (`aborted` if it was), or with nothing if
 * its card or the first use's card (`leadCardId`) is deleted first. No timeout: the use may wait at its attack button.
 * `cancel()` stops waiting (the use never started).
 */
function workflowFinished(sequenceId: string, leadCardId: string | undefined): Promise<Workflow | undefined> & { cancel: () => void } {
  let done!: (workflow?: Workflow) => void;
  let cardId: string | undefined;
  const promise = new Promise<Workflow | undefined>(resolve => {
    const onFinish = async (workflow: Workflow) => { if (workflow.sequenceId === sequenceId) done(workflow); };
    const onCreate = (message: ChatMessage.Implementation) => {
      // @ts-expect-error no dnd5e-types
      const origin = message.system?.origin;
      if (!cardId && [USAGE_MESSAGE_TYPE].includes(message.type) && (origin?.id ?? origin) === leadCardId) cardId = message.id ?? undefined;
    };
    const onDelete = (message: ChatMessage.Implementation) => { if (message.id === cardId || message.id === leadCardId) done(); };
    const cleanupId = Hooks.on("midi-qol.postCleanup", onFinish);
    const createId = Hooks.on("createChatMessage", onCreate);
    const deleteId = Hooks.on("deleteChatMessage", onDelete);
    done = (workflow?: Workflow) => {
      Hooks.off("midi-qol.postCleanup", cleanupId);
      Hooks.off("createChatMessage", createId);
      Hooks.off("deleteChatMessage", deleteId);
      resolve(workflow);
    };
  });
  return Object.assign(promise, { cancel: () => done() });
}

/** Resolves when the workflow's attack is rolled, or it ends or its card is deleted first. No timeout: it waits for the user. */
function attackRolled(workflow: Workflow): Promise<void> {
  return new Promise(resolve => {
    const attackId = Hooks.on("midi-qol.AttackRollComplete", async (w: Workflow) => { if (w === workflow) done(); });
    const cleanupId = Hooks.on("midi-qol.postCleanup", async (w: Workflow) => { if (w === workflow) done(); });
    const deleteId = Hooks.on("deleteChatMessage", (message: ChatMessage.Implementation) => { if (message.uuid === workflow.itemCardUuid) done(); });
    const done = () => {
      Hooks.off("midi-qol.AttackRollComplete", attackId);
      Hooks.off("midi-qol.postCleanup", cleanupId);
      Hooks.off("deleteChatMessage", deleteId);
      resolve();
    };
  });
}

/** The activity's Force roll dialog: "always" | "never" | "default" */
function effectiveForceRollDialog(activity: Activity): "always" | "never" | "default" {
  const setting = activity.midiProperties?.forceRollDialog;
  return setting === "always" || setting === "never" ? setting : "default";
}

function isAttackRoll(config: unknown): boolean {
  const hookNames: unknown = config && typeof config === "object" && "hookNames" in config ? config.hookNames : undefined;
  return Array.isArray(hookNames) && hookNames.includes("attack");
}

/**
 * A finished use's attack rolled again (its card's Attack button, or a macro's rollAttack) is a new use at its
 * targets, on a new card; the finished card loses its buttons. The new workflow is left on `usage.workflow`.
 */
export async function attackAgain(activity: Activity, workflow: Workflow | undefined, event?: Event): Promise<ActivityUseConfiguration> {
  if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
  const usage: ActivityUseConfiguration = { event, workflow };
  // A copy: the finished workflow keeps its own options
  usage.midiOptions = { ...(workflow?.rollOptions ?? {}) };
  usage.midiOptions.workflowOptions = { ...(usage.midiOptions.workflowOptions ?? {}) };
  if (workflow?.targets.count) {
    // Every target of the finished use, with a canvas token or not
    usage.midiOptions.targetsToUse = new Set(workflow.targets.documents);
    usage.midiOptions.ignoreUserTargets = true;
  }
  if (workflow) usage.midiOptions.workflowOptions.autoRollAttack = true;
  // @ts-expect-error no dnd5e-types
  await activity.use(usage, {}, {});
  return usage;
}

/**
 * Attack per target: this use has placed its template, chosen and confirmed its targets and spent its cost. Each
 * target is attacked by its own use of a copy of this activity that targets only that creature, in turn; each card
 * is linked to this use's card (started inside its workflow). The copies spend no uses and repeat no reaction or
 * bonus action checks; ammunition is spent by their attack rolls as the activity's Ammunition setting says.
 */
export async function attackEachTarget(activity: Activity, workflow: Workflow): Promise<void> {
  // Every target, with a canvas token or not: one on another level or scene is attacked too
  const targets = workflow.targets.documents;
  const savedTargetIds = Array.from(game.user?.targets ?? []).map(t => t.id);
  let ammunition: string | undefined;
  for (const [index, target] of targets.entries()) {
    const item = workflow.item.clone({
      [`system.activities.${activity.id}.target.template.type`]: "",
      [`system.activities.${activity.id}.target.affects.type`]: "creature",
      [`system.activities.${activity.id}.target.affects.count`]: "1",
      [`system.activities.${activity.id}.target.prompt`]: false,
      // dnd5e's attack roll defaults to the activity's last ammunition: the first target's choice
      ...(ammunition ? { [`flags.dnd5e.last.${activity.id}.ammunition`]: ammunition } : {})
    }, { keepId: true });
    // @ts-expect-error no dnd5e-types
    const copy = item.system.activities.get(activity.id);
    const sequenceId = foundry.utils.randomID();
    const finished = workflowFinished(sequenceId, workflow.itemCardId ?? undefined);
    const usage = {
      sequenceId,
      event: workflow.rollOptions.event,
      consume: { action: false, resources: false, spellSlot: false },
      concentration: { begin: false, end: null },
      create: { measuredTemplate: false },
      midiOptions: {
        targetsToUse: new TokenDocumentSet([target]),
        ignoreUserTargets: true,
        spellLevel: workflow.spellLevel || undefined,
        proceedChecks: { checkReaction: false, checkBonusAction: false, checkAoO: true },
        workflowOptions: {
          ...(workflow.workflowOptions ?? {}),
          targetConfirmation: "never",
          rollAttackPerTarget: true,
          attackSplit: { index, count: targets.length, ammunition }
        }
      }
    };
    // Linked to this use's card: the previous target's workflow may still count as executing
    const started = await copy.use(usage, { configure: false }, { data: { system: { origin: workflow.itemCardId } } });
    if (!started) {
      finished.cancel();
      break;
    }
    const done = await finished;
    // A target's use cancelled (e.g. no ammunition) or its card deleted: the remaining targets are not attacked
    if (!done || done.aborted) break;
    await workflow.addSplitAttackResult(done);
    // Later targets use the ammunition the first one chose
    ammunition ??= done.ammunition?.id ?? undefined;
  }
  updateUserTargets(savedTargetIds);
}

/**
 * How many pieces of ammunition this attack roll spends, by the activity's Ammunition setting: by default one per
 * attack roll; one per use (a later target of an attack per target spends none); or one per target (each target's
 * own attack spends one, a single roll spends one for each of its targets).
 */
export function ammunitionToSpend(activity: AttackActivityLike, workflow: Workflow | undefined): number {
  const mode = activity.ammunitionPerTarget ?? "default";
  const split = workflow?.workflowOptions?.attackSplit;
  if (split) return mode === "use" && split.index > 0 ? 0 : 1;
  if (mode === "target") return Math.max(1, workflow?.targets?.count ?? 1);
  return 1;
}

/** The MIXED wrap on dnd5e's AttackActivity#rollAttack */
async function rollAttackWrapper(this: AttackActivityLike, wrapped: RollAttack, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}): Promise<Roll[] | null | undefined> {
  config ??= {};
  dialog ??= {};
  message ??= {};
  const workflow = config.workflow as Workflow | undefined;
  if (!workflow) {
    // No use given (a sheet button, a macro): this user's use waiting for this attack takes the roll, as its card's button
    const waiting = Workflow.awaitingRoll(this, "attack");
    if (waiting) {
      waiting.advantage = undefined;
      waiting.disadvantage = undefined;
      return waiting.activityFor(this).rollAttack?.({ event: config.event, workflow: waiting }, {}, {}) ?? null;
    }
    return midiRollAttack(this, wrapped, config, dialog, message);
  }
  if (workflow.currentStep === "midi-qol.Completed" || workflow.currentStep === "midi-qol.Abort") {
    const usage = await attackAgain(this, workflow, config.event);
    config.workflow = usage.workflow;
    // Not fast-forwarded, the new use waits at its attack button: its roll, once made
    if (usage.workflow && !usage.workflow.attackRoll && !usage.workflow.aborted) await attackRolled(usage.workflow);
    return usage.workflow?.attackRoll ? [usage.workflow.attackRoll] : null;
  }
  return workflow.whileExecuting(() => midiRollAttack(this, wrapped, config, dialog, message));
}

async function midiRollAttack(activity: AttackActivityLike, wrapped: RollAttack, config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | null | undefined> {
  const hookIds: Record<string, number | undefined> = {};
  let rolls: Roll[] | null | undefined;
  const workflow = config.workflow as Workflow | undefined;
  config.midiOptions ??= {};
  if (workflow) workflow.rollConfigs.attack = { config, dialog, message };

  try {
    if (debugEnabled > 0) warn("rollAttack | Called", config, dialog, message);
    if (workflow) workflow.rollOptions.rollToggle = heldKeys(config.event).toggle;

    // No workflow: dnd5e's roll
    if (!await configureAttackRoll(activity, config)) return await wrapped(config, dialog, message) ?? [];
    if (!workflow || workflow.aborted) return [];
    if (configSettings.allowUseMacro && workflow.workflowOptions.noOnUseMacro !== true) {
      await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preAttackRoll"), "OnUse", "preAttackRoll");
      if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("preAttackRoll"), "OnUse", "preAttackRoll");
    }
    // Ensure config.event is set for dnd5e key handling
    config.event ??= workflow.rollOptions.event;

    let requiresAmmoConfirmation = false;
    // A later target of an attack per target uses the ammunition the first chose (its copy's last ammunition)
    const split = workflow.workflowOptions?.attackSplit;
    // @ts-expect-error no dnd5e-types
    if (activity.item.system.properties?.has("amm") && !(split?.index && split.ammunition)) {
      const ammoConfirmation = activity.confirmAmmunition;
      if (ammoConfirmation.reason) ui.notifications?.warn(ammoConfirmation.reason);
      if (!ammoConfirmation.proceed) workflow.aborted = true;
      requiresAmmoConfirmation = ammoConfirmation.confirm;
    }
    const forceRollDialog = effectiveForceRollDialog(activity);

    // The caller's dialog setting is not used for attacks
    dialog.configure = decideRollDialog({ force: forceRollDialog, toggle: !!workflow.rollOptions?.rollToggle,
      fastForward: isAutoFastForward("attack", { workflow }) });
    // Ammo confirmation always requires dialog
    if (requiresAmmoConfirmation) dialog.configure = true;

    // A caller can name the attack mode up front - automation and macros have no user to ask.
    // dnd5e validates it against the item's own attackModes and falls back to the first one, so
    // an unrecognised mode degrades to a normal attack rather than reinstating the prompt.
    const suppliedAttackMode = config.midiOptions?.workflowOptions?.attackMode;
    if (suppliedAttackMode) config.attackMode = suppliedAttackMode;

    // Thrown weapons normally require dialog to choose attack mode, but respect forceRollDialog="never"
    // @ts-expect-error no dnd5e-types
    if (activity.item?.system.properties.has("thr") && forceRollDialog !== "never" && !suppliedAttackMode) dialog.configure = true;

    dialog.options ??= {};

    let raisedWait = false;
    hookIds["dnd5e.preRollAttack"] = Hooks.on("dnd5e.preRollAttack", (rollConfig, dialogConfig) => {
      if (!isRollOf(rollConfig?.subject, activity)) return true;
      if (workflow.aborted) return false;
      if (configSettings.checkTwoHanded && ["twoHanded", "offhand"].includes(rollConfig.attackMode)) {
        // check equipment - shield other weapons for equipped status
        // @ts-expect-error no dnd5e-types
        if (activity.actor.system.attributes.ac?.shield > 0) {
          ui.notifications?.warn(i18n("midi-qol.TwoHandedShieldWarning"));
          workflow.aborted = true;
          return false;
        }
      } else if (!rollConfig.attackMode && dialogConfig.options?.attackModeOptions?.length) dialogConfig.configure = true;

      // Apply roll modifiers (auto-fail/success, min/max) for attack rolls
      const actType = activity.actionType;
      const attackModifierFlags: RollModifierFlags = {
        failFlags: ["fail.all"],
        successFlags: ["success.all"],
        maxFlags: [],
        minFlags: [],
        fieldPaths: [`abilities.${activity.ability}.attack.roll`, "rolls.attack", `rolls.attack.${actType}`]
      };
      if (workflow.attackRollModifierTracker) {
        // Again now dnd5e has built the rolls: a denial has to clear the advantage it put in their options.
        applyTrackerAdvantage(rollConfig, workflow.attackRollModifierTracker);
        computeRollModifiers(activity.actor!, attackModifierFlags, workflow.attackRollModifierTracker, { workflow });
        applyRollModifiers(workflow.attackRollModifierTracker, rollConfig, dialogConfig);
      }
      // A single target's flanking and granted attack bonuses, labelled in the roll; the reasons go with the roll
      // for its display (ChatMessageMidi)
      const { parts: extraParts, modifiers } = workflow.attackRollParts() ?? { parts: [], modifiers: [] };
      for (const roll of rollConfig.rolls ?? []) {
        if (extraParts.length) roll.parts = [...(roll.parts ?? []), ...extraParts];
        if (modifiers.length) foundry.utils.setProperty(roll, `options.${MODULE_ID}.attackModifiers`, modifiers);
      }
      if (dialogConfig.configure) {
        showAttackTargets(workflow);
        // After the last line that can open the dialog: the player's roll is waited for while it is open
        raisedWait = workflow.ensureRollWait("attack") || raisedWait;
      }
      return true;
    });
    // dnd5e adds its own parts when it builds each roll (with or without the dialog, and again when the dialog
    // rebuilds it): label them then, so the roll's display can name every term, with the effects behind the
    // combined roll bonus
    hookIds["dnd5e.postBuildAttackRollConfig"] = Hooks.on("dnd5e.postBuildAttackRollConfig", (process, rollConfig) => {
      const subject = process?.subject as { uuid?: string } | undefined;
      if (subject?.uuid && subject.uuid !== activity.uuid) return;
      const options = (rollConfig.options ?? {}) as { ability?: string, attackMode?: string };
      const ability = options.ability ?? process?.ability ?? activity.ability;
      rollConfig.parts = labelD20Parts(rollConfig.parts ?? [], ability);
      setBonusSources(rollConfig, attackBonusSources(activity, ability, activity.getActionType?.(options.attackMode ?? process?.attackMode) ?? activity.actionType));
    });
    hookIds["dnd5e.rollAttack"] = Hooks.on("dnd5e.rollAttack", (_rolls, { ammoUpdate, subject }) => {
      if (!isRollOf(subject, activity)) return;
      if (ammoUpdate) {
        // dnd5e spends one; the activity's Ammunition setting may spend none (a later target, one per use) or one each
        const ammo = activity.actor?.items.get(ammoUpdate.id);
        // @ts-expect-error no dnd5e-types
        const quantity: number = ammo?.system.quantity ?? 0;
        ammoUpdate.quantity = Math.max(0, quantity - ammunitionToSpend(activity, workflow));
        // @ts-expect-error no dnd5e-types
        ammoUpdate.destroy = !!ammo?.system.uses?.autoDestroy && ammoUpdate.quantity === 0 && quantity > 0;
      }
      if (ammoUpdate?.destroy) workflow.spentAmmunitionData = activity.actor?.items.get(ammoUpdate.id)?.toObject();
    });
    hookIds["dnd5e.postAttackRollConfiguration"] = Hooks.on("dnd5e.postAttackRollConfiguration", (rolls, rollConfig) => {
      if (!isRollOf(rollConfig?.subject, activity)) return true;
      if (rolls?.length === 0) return false;
      // @ts-expect-error no dnd5e-types
      if (configSettings.checkTwoHanded && ["twoHanded", "offhand"].includes(rolls?.[0]?.options?.attackMode)) {
        // check equipment - shield other weapons for equipped status
        // @ts-expect-error no dnd5e-types
        if (activity.actor.system.attributes.ac?.shield > 0) {
          ui.notifications?.warn(i18n("midi-qol.TwoHandedShieldWarning"));
          if (rollConfig.workflow) rollConfig.workflow.aborted = true;
          return false;
        }
      }
      // @ts-expect-error no dnd5e-types
      if (activity.requireAmmunition && activity.item.system.properties?.has("amm")) {
        // @ts-expect-error no dnd5e-types
        const chosenAmmunition = activity.actor.items.get(rolls?.[0]?.options?.ammunition);
        const needed = ammunitionToSpend(activity, rollConfig.workflow);
        // @ts-expect-error no dnd5e-types
        const quantity: number = chosenAmmunition?.system.quantity ?? 0;
        const enough = quantity >= needed;
        const name = chosenAmmunition?.name ?? "Ammunition";
        if (!enough) ui.notifications?.error(quantity > 0
          ? i18nFormat("midi-qol.NotEnoughAmmunition", { name, needed, quantity })
          : i18nFormat("midi-qol.NoAmmunition", { name }));
        else activity.ammunitionItem = chosenAmmunition;
        return enough;
      }
      return true;
    });
    // Capture target descriptors last, after all other modules have had a chance to modify AC (e.g. cover)
    hookIds["dnd5e.postRollConfiguration"] = Hooks.on("dnd5e.postRollConfiguration", (_rolls, rollConfig, _dialog, messageConfig) => {
      if (!isRollOf(rollConfig?.subject, activity) || !isAttackRoll(rollConfig)) return true;
      const targetDescriptors = foundry.utils.getProperty(messageConfig, "data.system.targets") as DND5ETargetDescriptor[] | undefined;
      // Don't mutate td.ac — it's a shared reference with the chat message data.
      // null AC (coverTotal) is handled downstream in checkHits() as auto-miss.
      if (targetDescriptors) workflow.targetDescriptors = targetDescriptors;
    });
    // Active defence resolves by triggering saving throws and returns early
    if (workflow.useActiveDefence) message.create = false; // go through the roll process but don't show the attack roll.

    message.create ??= config.midiOptions.chatMessage;
    // A mode the caller named (workflowOptions.attackMode or versatile, config.attackMode)
    const callerAttackMode = config.attackMode;
    // dnd5e's last used mode for this activity, else the activity's own; an off-hand activity stays off-hand (14.6.15)
    const lastAttackMode: string | undefined = (activity.item.flags as { dnd5e?: { last?: Record<string, { attackMode?: string }> } }).dnd5e?.last?.[activity.id ?? ""]?.attackMode;
    const keepsLastMode = !activity.attackMode?.endsWith("offhand") || !!lastAttackMode?.endsWith("offhand");
    config.attackMode ??= (keepsLastMode ? lastAttackMode : undefined) ?? activity.attackMode ?? "oneHanded";
    // Without the dialog dnd5e spends its last-used or first ammunition, not midi's choice
    // @ts-expect-error no dnd5e-types
    if (activity.item.system.properties?.has("amm")) config.ammunition ??= split?.ammunition || activity.ammunition || undefined;
    let versatileKey = false;
    // @ts-expect-error no dnd5e-types
    if (config.event && areMidiKeysPressed(config.event, "Versatile") && activity.item.isVersatile) {
      config.attackMode = "twoHanded";
      versatileKey = true;
    }
    // A named or Versatile-key mode is rolled once: dnd5e's remembered mode (its flag update after the roll) is kept
    const forcedMode = versatileKey ? "twoHanded" : callerAttackMode;
    const keepLastMode = forcedMode ? Hooks.on("preUpdateItem", (item: Item.Implementation, changes: { flags?: { dnd5e?: { last?: Record<string, { attackMode?: string }> } } }) => {
      if (item.uuid !== activity.item.uuid) return;
      const last = changes.flags?.dnd5e?.last?.[activity.id ?? ""];
      if (!last || last.attackMode !== forcedMode) return;
      if (lastAttackMode) last.attackMode = lastAttackMode;
      else delete last.attackMode;
    }) : undefined;
    setMessageTargets(message, workflow);
    // rollBonuses' automatic preRoll bonuses join the formula (attackRollParts)
    // Optional ones: in dnd5e's roll dialog when it shows (M32c), else asked first
    await workflow.collectPreRollBonuses("attack", { inDialog: dialogShown(dialog.configure, config.event) });
    try {
      rolls = await workflow.keepRollMessageFlags(activity, () => wrapped(config, dialog, message));
    } finally {
      if (keepLastMode !== undefined) Hooks.off("preUpdateItem", keepLastMode);
      workflow.takeDialogBonuses("attack");
    }
    // The roll is made: the wait raised for its dialog ends (backed out of, the use still waits for it)
    if (rolls?.length && raisedWait) workflow.endRollWait();

    if (!rolls || rolls.length === 0) return null;
    // @ts-expect-error no dnd5e-types
    const rolledAmmunition: string | undefined = rolls[0]?.options?.ammunition;
    if (rolledAmmunition && rolledAmmunition !== activity.ammunition) {
      await activity.update({ ammunition: rolledAmmunition });
      activity.ammunition = rolledAmmunition;
      activity.ammunitionItem = activity.actor?.items.get(activity.ammunition);
      activity._otherActivity = undefined; // reset this in case ammunition changed
    }

    workflow.attackRollModifierTracker.reconcileWithRoll(rolls[0]?.options?.advantageMode, dialogShown(dialog.configure, config.event));
    // @ts-expect-error no dnd5e-types
    workflow.attackMode = rolls[0].options.attackMode ?? config.attackMode;
    if (activity.ammunition && !activity.ammunitionItem) { // assume it was deleted
      const storedData = workflow.spentAmmunitionData;
      if (storedData) workflow.ammunition = new Item.implementation(storedData, { parent: activity.actor });
    } else workflow.ammunition = activity.ammunitionItem;
    /*
     * Resolve from workflow.ammunition, not the live item. When the last piece is spent and the ammunition has
     * uses.autoDestroy, dnd5e deletes the item during the attack roll — the live lookup is then empty, but
     * workflow.ammunition has just been rebuilt from the copy stashed on the chat card. Reading the live item here
     * would drop the ammunition's activity on exactly the shot that used the last piece.
     */
    workflow.ammunitionActivity = activity.ammunitionActivity ?? findAmmunitionActivity(workflow.ammunition);
    if (activity.ammunition) activity.update({ ammunition: activity.ammunitionItem?.id ?? "" });
    if (configSettings.allowUseMacro) workflow.ammunitionOnUseMacros = workflow.ammunition?.flags?.[MODULE_ID]?.onUseMacroParts ?? new OnUseMacros();
    await workflow.settlePreRollBonuses("attack", rolls[0]);
    if (workflow.workflowOptions?.attackRollDSN !== false) await displayDSNForRoll(rolls[0], "attackRollD20", undefined, undefined, workflow.actor);
    await workflow.setAttackRoll(rolls[0]);
    rolls[0] = await workflow.processAttackRollBonusFlags();
    // Always add attribution to roll for indicator/tooltip display
    addAttribution(rolls[0], workflow.attackAttribution);
    await workflow.setAttackRoll(rolls[0]);
    if (debugEnabled > 0) warn("rollAttack | setAttackRolls completed ", rolls, `workflow is suspended ${workflow.suspended}`);
    // resume takes a roll that finished before the workflow suspended (it may still be writing its card)
    workflow.resume(rolls[0] ? "attackRolled" : undefined);
  } catch (err) {
    error("AttackActivity | rollAttack | Error configuring dialog", err);
  } finally {
    for (const [hookName, hookId] of Object.entries(hookIds)) {
      if (hookId !== undefined) Hooks.off(hookName as Hooks.HookName, hookId);
    }
  }
  return rolls;
}

/** midi's preparation of a workflow's attack roll; false: no workflow (dnd5e's roll) or blocked */
async function configureAttackRoll(activity: Activity, config: RollProcessConfig): Promise<boolean> {
  if (debugEnabled > 0) warn("configureAttackRoll", activity, config);
  if (!config.workflow) return false;
  const workflow: Workflow = config.workflow;
  config.midiOptions ??= {};

  if (debugEnabled > 1) debug("Entering configure attack roll", config.event, workflow, config.rollOptions);
  if (workflow.workflowType === "TrapWorkflow") workflow.workflowOptions.fastForward = true;

  await doActivityReactions(activity, workflow);
  await busyWait(10);
  if (configSettings.allowUseMacro && workflow.workflowOptions.noTargetOnUseMacro !== true) {
    await workflow.triggerTargetMacros(["isPreAttacked"]);
    if (workflow.aborted) {
      console.warn(`midi-qol | item ${workflow.item.name ?? ""} roll blocked by isPreAttacked macro`);
      await workflow.performState("midi-qol.Abort");
      return false;
    }
  }

  // preAttackRoll hooks may modify flags; checkAttackAdvantage() runs after them (below)
  if (await callActivityHooks(activity, "midi-qol.preAttackRoll", workflow) === false) {
    console.warn("midi-qol | attack roll blocked by preAttackRoll hook");
    return false;
  }
  await workflow.checkAttackAdvantage();
  // Process keyboard modifiers (ctrl/alt for advantage/disadvantage) after flag processing
  if (await callActivityHooks(activity, "midi-qol.preAttackRollConfig", workflow) === false) {
    console.warn("midi-qol | attack roll blocked by preAttackRollConfig hook");
    return false;
  }
  if (configSettings.allowUseMacro && workflow.workflowOptions?.noOnUseMacro !== true) {
    await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preAttackRollConfig"), "OnUse", "preAttackRollConfig");
    if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("preAttackRollConfig"), "OnUse", "preAttackRollConfig");
  }

  // Set config advantage/disadvantage from tracker (after all hooks/macros have had a chance to modify)
  applyTrackerAdvantage(config, workflow.attackRollModifierTracker);

  workflow.attackRollCount += 1;
  if (workflow.attackRollCount > 1) workflow.damageRollCount = 0;

  // create an options object to pass to the roll.
  config.midiOptions = foundry.utils.mergeObject(config.midiOptions, {
    chatMessage: (["TrapWorkflow", "Workflow"].includes(workflow.workflowType)) ? false : config.midiOptions.chatMessage,
    fastForward: workflow.workflowOptions?.fastForwardAttack ?? workflow.rollOptions.fastForwardAttack ?? config.midiOptions.fastForward,
    messageData: { speaker: getSpeaker(activity.actor!) }
  }, { insertKeys: true, overwrite: true });
  if (workflow.rollOptions.rollToggle) config.midiOptions.fastForward = !config.midiOptions.fastForward;

  // Setup labels for advantage reminder
  const advantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("ADV:")).map(s => s.replace("ADV:", ""));
  if (advantageLabels.length > 0) foundry.utils.setProperty(config.midiOptions, "dialogOptions.adv-reminder.advantageLabels", advantageLabels);
  const disadvantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("DIS:")).map(s => s.replace("DIS:", ""));
  if (disadvantageLabels.length > 0) foundry.utils.setProperty(config.midiOptions, "dialogOptions.adv-reminder.disadvantageLabels", disadvantageLabels);

  if (config.midiOptions.fumble === true || config.midiOptions.fumble === false) delete config.midiOptions.fumble;

  config.midiOptions.chatMessage = false;
  if (config.midiOptions?.workflowOptions?.versatile) config.attackMode = "twoHanded";
  return true;
}

/** Attack's own getters (were members of midi's Attack class), installed on dnd5e's Attack class */
const attackGetters: Record<string, PropertyDescriptor & ThisType<AttackActivityLike>> = {
  actionType: {
    get(this: AttackActivityLike) {
      const type = this.attack!.type;
      return `${type.value === "ranged" ? "r" : "m"}${type.classification === "spell" ? "sak" : "wak"}`;
    }
  },
  ammunitionItem: {
    get(this: AttackActivityLike) {
      if (this._ammunitionItem) return this._ammunitionItem;
      if (!this.ammunition) return undefined;
      return this.actor?.items?.get(this.ammunition);
    },
    set(this: AttackActivityLike, value: Item.Implementation | undefined) {
      this._ammunitionItem = value;
      this._ammunitionActivity = undefined; // resolved again from the new ammunition
    }
  },
  /** Whether each target gets its own attack: the activity's Attack Roll Per Target, else the world setting. */
  attacksEachTarget: {
    get(this: AttackActivityLike) {
      const own = this.attackRollPerTarget ?? "default";
      return own === "always" || (own !== "never" && !!configSettings.attackPerTarget);
    }
  },
  confirmAmmunition: {
    get(this: AttackActivityLike): { reason?: string, confirm: boolean, proceed: boolean } {
      // @ts-expect-error no dnd5e-types
      const ammunitionOptions: { disabled?: boolean, value?: string }[] = this.item.system.ammunitionOptions;
      let ammoAutoSelected = false;
      const ammoCount = (ammunitionOptions?.filter(ammo => !ammo.disabled) ?? []).length;
      if ((ammoCount ?? 0) > 0 && (this.ammunition ?? "") === "") {
        this.ammunition = ammunitionOptions?.find(ammo => !ammo.disabled)?.value ?? "";
        ammoAutoSelected = true;
      }
      if (this.requireAmmunition && ammoCount === 0) return { reason: i18n("midi-qol.NoAmmunitionAvailable"), proceed: false, confirm: true };
      if (this.requireAmmunition && !this.ammunition) return { reason: i18n("midi-qol.NoAmmunitionSelected"), proceed: true, confirm: true };
      if (ammunitionOptions.some(ammo => ammo.value === this.ammunition && ammo.disabled)) return { reason: game.i18n?.format("midi-qol.NoAmmunition", { name: this.ammunitionItem?.name ?? "" }), proceed: true, confirm: true };
      if (game.user?.isGM) return { confirm: configSettings.gmConfirmAmmunition && (ammoCount > 1 || ammoAutoSelected), proceed: true };
      return { confirm: configSettings.confirmAmmunition && (ammoCount > 1 || ammoAutoSelected), proceed: true };
    }
  },
  requireAmmunition: {
    get(): boolean {
      return game.user?.isGM ? configSettings.gmRequireAmmunition : configSettings.playerRequireAmmunition;
    }
  }
};

type LibWrapperRegister = { register(packageId: string, target: string, fn: (...args: never[]) => unknown, type: string): unknown };

/** midi's attack roll and Attack's getters on dnd5e's Attack class; once, from setupActivities */
export function installAttackRolls(): void {
  const libWrapper = (globalThis as { libWrapper?: LibWrapperRegister }).libWrapper;
  libWrapper?.register("midi-qol", "CONFIG.DND5E.activityTypes.attack.documentClass.prototype.rollAttack", rollAttackWrapper, "MIXED");
  const attackClass = CONFIG.DND5E.activityTypes.attack?.documentClass as { prototype: object } | undefined;
  if (!attackClass) return;
  for (const [name, descriptor] of Object.entries(attackGetters)) Object.defineProperty(attackClass.prototype, name, { ...descriptor, configurable: true });
  // Was a static of midi's Attack class (MidiQOL.activityTypes.attack.attackAgain)
  Object.defineProperty(attackClass, "attackAgain", {
    configurable: true, writable: true,
    value: (activity: Activity, workflow: Workflow | undefined, event?: Event) => {
      deprecation("midi-qol | MidiQOL.activityTypes.attack.attackAgain is deprecated: use activity.rollAttack({ workflow }) on a finished use", { since: "15.0.0", until: "15.1.0", once: true });
      return attackAgain(activity, workflow, event);
    }
  });
}

/* The attack roll's advantage and bonus labels (M14: from AttackActivity.ts) */

/**
 * Compute attack advantage/disadvantage from actor flags and target grants flags.
 * This handles the flag-based advantage checks for attacks.
 * Special rules (flanking, invisible, nearby foe, heavy weapons) are handled separately in Workflow.
 *
 * @param actor - The attacking actor
 * @param actionType - The action type (mwak, rwak, msak, rsak, etc.)
 * @param options - MidiOptions including workflow, target info
 * @param abilityId - Optional ability ID for ability-based attack flags (e.g., "str", "dex")
 * @param tracker - Optional existing RollModifierTracker to populate
 * @returns RollModifierTracker with attack advantage attribution
 */
export async function computeAttackAdvantage(
  actor: Actor.Implementation,
  actionType: string,
  options: MidiOptions,
  abilityId?: string,
  tracker?: RollModifierTracker
): Promise<RollModifierTracker> {
  tracker ??= new RollModifierTracker();

  // Spell school for school-specific attack flags
  // @ts-expect-error no dnd5e-types
  const attackSchool: string | undefined = options.item?.system?.school;

  // Define attack advantage flags
  const attackFlags: AdvantageFlags = {
    advantageFlags: [
      "advantage.all",
      "advantage.attack.all",
      `advantage.attack.${actionType}`,
      // Include ability-based attack flags if abilityId is provided
      ...(abilityId ? [`advantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`advantage.attack.school.${attackSchool}`] : [])
    ],
    disadvantageFlags: [
      "disadvantage.all",
      "disadvantage.attack.all",
      `disadvantage.attack.${actionType}`,
      ...(abilityId ? [`disadvantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`disadvantage.attack.school.${attackSchool}`] : [])
    ],
    noAdvantageFlags: [
      "noAdvantage.all",
      "noAdvantage.attack.all",
      `noAdvantage.attack.${actionType}`,
      ...(abilityId ? [`noAdvantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`noAdvantage.attack.school.${attackSchool}`] : [])
    ],
    noDisadvantageFlags: [
      "noDisadvantage.all",
      "noDisadvantage.attack.all",
      `noDisadvantage.attack.${actionType}`,
      ...(abilityId ? [`noDisadvantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`noDisadvantage.attack.school.${attackSchool}`] : [])
    ],
    systemRollModeFields: [...(abilityId ? [`abilities.${abilityId}.attack.roll.mode`] : []), "rolls.attack.mode", `rolls.attack.${actionType}.mode`],
    ...(options.workflow?.activity ? { systemRules: { category: "attack" as const, item: options.workflow.activity.item,
      // @ts-expect-error no dnd5e-types
      rollData: options.workflow.activity.getRollData({ roll: { ability: abilityId, attackMode: options.workflow.attackMode } }) } } : {}),
    // Target grants flags (checked on target actor)
    sourceAdvantageFlags: [
      "grants.advantage.all",
      "grants.advantage.attack.all",
      `grants.advantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.advantage.attack.school.${attackSchool}`] : [])
    ],
    sourceDisadvantageFlags: [
      "grants.disadvantage.all",
      "grants.disadvantage.attack.all",
      `grants.disadvantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.disadvantage.attack.school.${attackSchool}`] : [])
    ],
    sourceNoAdvantageFlags: [
      "grants.noAdvantage.attack.all",
      `grants.noAdvantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.noAdvantage.attack.school.${attackSchool}`] : [])
    ],
    sourceNoDisadvantageFlags: [
      "grants.noDisadvantage.attack.all",
      `grants.noDisadvantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.noDisadvantage.attack.school.${attackSchool}`] : [])
    ]
  };

  // For attacks, the entity that grants advantage/disadvantage is the defender (target)
  const targetToken = options.workflow?.targets?.documents[0];
  const targetActor = targetToken?.actor ?? undefined;

  await computeAdvantageFlags(actor, attackFlags, {
    ...options,
    grantsActor: targetActor,
    grantsToken: targetToken
  }, tracker);

  return tracker;
}


