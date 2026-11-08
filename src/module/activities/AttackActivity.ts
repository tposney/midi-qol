import { TokenDocumentSet } from "../lib/tokenDocumentSet.js";
import { debugEnabled, warn, error, busyWait, GameSystemConfig, debug, i18n, MODULE_ID, i18nFormat } from "../../midi-qol.js";
import { unTimedExecuteAsGM } from "../GMAction.js";
import { Workflow } from "../Workflow.js";
import { decideRollDialog, dialogShown, heldKeys } from "../lib/rollKeys.js";
import { RollModifierTracker, AdvantageFlags, computeAdvantageFlags, computeRollModifiers, applyRollModifiers, RollModifierFlags, applyTrackerAdvantage } from "../lib/RollModifierTracker.js";
import { MidiOptions } from "../utils.js";
import { replaceDefaultActivities, configSettings, confirmTargetOptions, ammunitionPerTargetOptions } from "../settings.js";
import { addAttribution, areMidiKeysPressed, callActivityHooks, addUpdatesCache, displayDSNForRoll, getSpeaker, isAutoFastForward, updateUserTargets, validTargetTokens, getToken, tokenSourceCenter } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet, findAmmunitionActivity } from "./MidiActivityMixin.js";
import { doActivityReactions } from "./activityHelpers.js";
import { OnUseMacros } from "../apps/Item.js";
import { USAGE_MESSAGE_TYPE } from "../ChatClasses/UsageCardMessage.js";
import { Activity, ActivityUseConfiguration, DND5ETargetDescriptor, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";

export let MidiAttackSheet: ReturnType<typeof defineMidiAttackSheetClass>;
/**
 * Show the player which token an attack dialog is for: give the attack's targets the targeting reticle and pan the
 * canvas to them (their centre, for several).
 */
function showAttackTargets(workflow: Workflow) {
  if (!canvas?.ready) return;
  const tokens = (workflow.targets?.tokens ?? []).map(target => getToken(target))
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

export let MidiAttackActivity: ReturnType<typeof defineMidiAttackActivityClass>;
// export let MidiAttackActivityData;

/**
 * Get the effective forceRollDialog setting for an activity.
 * Returns "always" | "never" | "default"
 */
function getEffectiveForceRollDialog(activity: any): "always" | "never" | "default" {
  const activitySetting = activity.midiProperties?.forceRollDialog;
  if (activitySetting === "always" || activitySetting === "never") {
    return activitySetting;
  }
  return "default";
}

export function setupAttackActivity() {
  if (debugEnabled > 0) warn("MidiQOL | AttackActivity | setupAttackActivity | Called");

  //@ts-expect-error
  MidiAttackSheet = defineMidiAttackSheetClass(game.system.applications.activity.AttackSheet);
  MidiAttackActivity = defineMidiAttackActivityClass(GameSystemConfig.activityTypes.attack.documentClass as Activity);
  if (replaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eAttack"] = GameSystemConfig.activityTypes.attack;
    GameSystemConfig.activityTypes.attack = { documentClass: MidiAttackActivity };
  } else {
    GameSystemConfig.activityTypes["midiAttack"] = { documentClass: MidiAttackActivity };
  }
}

let defineMidiAttackSheetClass = (baseClass: any) => {
  return class MidiAttackActivitySheet extends MidiActivityMixinSheet(baseClass) {

    static PARTS = {
      ...super.PARTS,
      effect: {
        template: "modules/midi-qol/templates/activity/attack-effect.hbs",
        templates: [
          ...super.PARTS.effect.templates,
          "modules/midi-qol/templates/activity/parts/attack-extras.hbs",
        ]
      }
    }

    async _prepareEffectContext(context) {
      const activity = this.activity;
      context = await super._prepareEffectContext(context);
      context.attackModeOptions = this.item.system.attackModes;
      context.hasAmmunition = this.item.system.properties.has("amm");
      context.ammunitionOptions = this.item.system.ammunitionOptions ?? [];
      context.ammunitionOptions?.forEach(option => {
        option.selected = option.value === this.activity.ammunition;
      });
      if (activity.otherActivityUuid) {
        ui.notifications?.warn("Please update other activity. otherActivityUuid is deprecated");
        activity.otherActivityUuid = undefined;
      }
      // Add healing types to the existing damageParts typeOptions (dnd5e only includes damageTypes)
      if (context.damageParts?.length) {
        const healingTypes = Object.entries(GameSystemConfig.healingTypes).map(([value, config]) => ({
          value, label: config.label, selected: false
        }));
        for (const part of context.damageParts) {
          // Mark existing healing type selections (types may be a Set or undefined)
          const typesSet = part.data?.types instanceof Set ? part.data.types : new Set();
          for (const healingType of healingTypes) {
            healingType.selected = typesSet.has(healingType.value);
          }
          // Add healing types to the end of typeOptions
          part.typeOptions = [...(part.typeOptions ?? []), ...healingTypes.map(h => ({ ...h }))];
        }
      }
      context.ConfirmTargetOptions = Object.entries(confirmTargetOptions).map(([value, label]) => ({ value, label }));
      context.AmmunitionPerTargetOptions = Object.entries(ammunitionPerTargetOptions).map(([value, label]) => ({ value, label }));

      if (debugEnabled > 0) {
        warn(("prepareEffectContext | context"), context);
      }
      return context;
    }

    _prepareSubmitData(event, formData) {
      let submitData = super._prepareSubmitData(event, formData);
      submitData.otherActivityUuid = "";
      return submitData;
    }

  }
}

let defineMidiAttackActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiAttackActivity extends MidiActivityMixin(ActivityClass) {
    _otherActivity: Activity | undefined;

    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "midi-qol.ATTACK"];

    static defineSchema() {
      const { StringField, BooleanField, NumberField } = foundry.data.fields;

      const schema = {
        ...super.defineSchema(),
        otherActivityAsParentType: new BooleanField({
          name: "otherActivityAsParentType",
          initial: true,
          required: false,
          label: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.label"),
          hint: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.hint")
        }),
        attackMode: new StringField({ name: "attackMode", initial: "oneHanded" }),
        ammunition: new StringField({ name: "ammunition", initial: "" }),
        // deprecated 
        otherActivityUuid: new StringField({ name: "otherActivityUuid", required: false, initial: "" }),
        attackRollPerTarget: new StringField({ name: "attackRollPerTarget", initial: "default", required: true }),
        // Ammunition spent when the attack has several targets: default (one per attack roll), use (one), target (one each)
        ammunitionPerTarget: new StringField({ name: "ammunitionPerTarget", initial: "default", required: true }),
        fumbleThreshold: new NumberField({ name: "fumbleThreshold", initial: 1, required: false }),
      };
      return schema;
    }
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        sheetClass: MidiAttackSheet,
        title: configSettings.activityNamePrefix ? "midi-qol.ATTACK.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        usage: {
          /*
           * No `chatCard`. Supplying one puts the activity on dnd5e's legacy content path
           * (`activity/mixin.mjs#legacyUsageContent`), which renders the template into
           * `message.content` — and `usage-card.hbs` short-circuits on `content`, so the system's own
           * card face never runs. That is what cost the card its background, its colours and the
           * damage tray. The card is now rendered by `MidiUsageMessageData` from stored state.
           *
           * `usage.chatCard` is deprecated in dnd5e 6.0 and removed in 6.2, so this had to go anyway.
           */
          actions: {
            rollAttack: MidiAttackActivity.#rollAttack,
            rollAttackAdvantage: MidiAttackActivity.#rollAttackAdvantage,
            rollAttackDisadvantage: MidiAttackActivity.#rollAttackDisadvantage,
            rollDamage: MidiAttackActivity.#rollDamage,
            rollDamageNoCritical: MidiAttackActivity.#rollDamageNoCritical,
            rollDamageCritical: MidiAttackActivity.#rollDamageCritical,
          }
        },
      }, { inplace: false, insertKeys: true, insertValues: true })

    /**
     * A finished use's attack rolled again (its card's Attack button, or a macro's rollAttack) is a new use at its
     * targets, on a new card; the finished card loses its buttons. The new workflow is left on `usage.workflow`.
     */
    static async attackAgain(activity: Activity, workflow: Workflow | undefined, event?: Event): Promise<ActivityUseConfiguration> {
      if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
      const usage: ActivityUseConfiguration = { event, workflow };
      usage.midiOptions = workflow?.rollOptions ?? {};
      usage.midiOptions.workflowOptions ??= {};
      usage.midiOptions.targets = new TokenDocumentSet(workflow?.targets);
      if (workflow) usage.midiOptions.workflowOptions.autoRollAttack = true;
      // @ts-expect-error
      await activity.use(usage, {}, {});
      return usage;
    }

    static #rollAttack(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.findWorkflow(message?.uuid);

      if (!message || !workflow || (workflow.currentAction && [workflow.WorkflowState_Abort, workflow.WorkflowState_Completed].includes(workflow.currentAction))) {
        MidiAttackActivity.attackAgain(this, workflow, event);
      } else {
        const attackConfig: ActivityUseConfiguration = { workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
        workflow.advantage = undefined;
        workflow.disadvantage = undefined;
        attackConfig.midiOptions.advantage = undefined;
        attackConfig.midiOptions.disadvantage = undefined;
        workflow.activity = this;
        // Update targets if user has selected new ones; preserve existing targets otherwise
        // (e.g. template-derived targets, programmatic targetsToUse, or no selection)
        const currentTargets = validTargetTokens(new Set(game.user?.targets));
        if (currentTargets.count > 0) workflow.setTargets(currentTargets);
        // @ts-expect-error
        return this.rollAttack({ workflow }, {}, {});
      }
    }

    static #rollAttackAdvantage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.findWorkflow(message?.uuid);
      if (!message || !workflow || (workflow.currentAction && [workflow.WorkflowState_Abort, workflow.WorkflowState_Completed].includes(workflow.currentAction))) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: any = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.workflow = workflow;
        if (workflow) {
          attackConfig.midiOptions.workflowOptions ??= {};
          attackConfig.midiOptions.workflowOptions.advantage = true;
          attackConfig.midiOptions.workflowOptions.disadvantage = false;
          attackConfig.midiOptions.workflowOptions.autoRollAttack = true;
        }
        //@ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        const attackConfig: ActivityUseConfiguration = { workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
        // User explicitly chose advantage — set workflowOptions so checkAttackAdvantage processes it
        attackConfig.midiOptions.workflowOptions.advantage = true;
        attackConfig.midiOptions.workflowOptions.disadvantage = false;
        workflow.activity = this;
        // Update targets if user has selected new ones; preserve existing targets otherwise
        const currentTargets = validTargetTokens(new Set(game.user?.targets));
        if (currentTargets.count > 0) workflow.setTargets(currentTargets);
        //@ts-expect-error
        return this.rollAttack(attackConfig, {}, {});
      }
    }

    static #rollAttackDisadvantage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.findWorkflow(message?.uuid);
      if (!message || !workflow || (workflow.currentAction && [workflow.WorkflowState_Abort, workflow.WorkflowState_Completed].includes(workflow.currentAction))) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: ActivityUseConfiguration = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.workflow = workflow;
        if (workflow) {
          attackConfig.midiOptions.workflowOptions ??= {};
          attackConfig.midiOptions.workflowOptions.autoRollAttack = true;
          attackConfig.midiOptions.advantage = false;
          attackConfig.midiOptions.disadvantage = true;
        }
        //@ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        const attackConfig: any = { workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
        // User explicitly chose disadvantage — set workflowOptions so checkAttackAdvantage processes it
        attackConfig.midiOptions.workflowOptions.advantage = false;
        attackConfig.midiOptions.workflowOptions.disadvantage = true;
        workflow.activity = this;
        // Update targets if user has selected new ones; preserve existing targets otherwise
        const currentTargets = validTargetTokens(new Set(game.user?.targets));
        if (currentTargets.count > 0) workflow.setTargets(currentTargets);
        //@ts-expect-error
        return this.rollAttack(attackConfig, {}, {});
      }
    }

    static #rollDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.forDamageButton(message);
      if (workflow === false) return;
      if (workflow && !workflow.readOnly) workflow.activity = this;
      // @ts-expect-error
      return this.rollDamage({ event, workflow, midiOptions: { isCritical: workflow?.workflowOptions?.isCritical || workflow?.isCritical } }, {}, message);
    }

    static #rollDamageNoCritical(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.forDamageButton(message);
      if (workflow === false) return;
      if (workflow && !workflow.readOnly) workflow.activity = this;
      // @ts-expect-error
      return this.rollDamage({ event, workflow, critical: { allow: false }, midiOptions: { isCritical: false } }, {}, message);
    }

    static #rollDamageCritical(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.forDamageButton(message);
      if (workflow === false) return;
      if (workflow && !workflow.readOnly) workflow.activity = this;
      // @ts-expect-error
      return this.rollDamage({ event, workflow, midiOptions: { isCritical: true } }, {}, message);
    }

    async rollDamage(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) {
      if (!config.ammunition) {
        let ammunition = this.ammunitionItem;
        if (!ammunition) ammunition = config.workflow?.ammunition;
        // Spent and deleted: rolled with the data the use kept
        const data = !ammunition ? config.workflow?.spentAmmunitionData : undefined;
        if (data) ammunition = new Item.implementation(data, { parent: this.actor });
        config.ammunition = ammunition;
        this.ammunitionItem = ammunition;
      }
      return super.rollDamage(config, dialog, message);
    }

    async _triggerSubsequentActions(config, results) {
    }

    /** Whether each target gets its own attack: the activity's Attack Roll Per Target, else the world setting. */
    get attacksEachTarget(): boolean {
      const own = this.attackRollPerTarget ?? "default";
      return own === "always" || (own !== "never" && !!configSettings.attackPerTarget);
    }

    /**
     * Attack per target: this use has placed its template, chosen and confirmed its targets and spent its cost. Each
     * target is attacked by its own use of a copy of this activity that targets only that creature, in turn; each card
     * is linked to this use's card (started inside its workflow). The copies spend no uses and repeat no reaction or
     * bonus action checks; ammunition is spent by their attack rolls as the activity's Ammunition setting says.
     */
    async attackEachTarget(workflow: Workflow): Promise<void> {
      // Every target, drawn or not: one on another level or scene is attacked too
      const targets = workflow.targets.documents;
      const savedTargetIds = Array.from(game.user?.targets ?? []).map(t => t.id);
      let ammunition: string | undefined;
      for (const [index, target] of targets.entries()) {
        const item = workflow.item.clone({
          [`system.activities.${this.id}.target.template.type`]: "",
          [`system.activities.${this.id}.target.affects.type`]: "creature",
          [`system.activities.${this.id}.target.affects.count`]: "1",
          [`system.activities.${this.id}.target.prompt`]: false,
          // dnd5e's attack roll defaults to the activity's last ammunition: the first target's choice
          ...(ammunition ? { [`flags.dnd5e.last.${this.id}.ammunition`]: ammunition } : {})
        }, { keepId: true });
        // @ts-expect-error no dnd5e-types
        const activity = item.system.activities.get(this.id);
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
        const started = await activity.use(usage, { configure: false }, { data: { system: { origin: workflow.itemCardId } } });
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

    async rollAttack(config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}): Promise<Roll[] | null> {
      const workflow = config.workflow;
      if (!workflow) return this._midiRollAttack(config, dialog, message);
      if (workflow.currentAction === workflow.WorkflowState_Completed || workflow.currentAction === workflow.WorkflowState_Abort) {
        const usage = await MidiAttackActivity.attackAgain(this, workflow, config.event);
        config.workflow = usage.workflow;
        // Not fast-forwarded, the new use waits at its attack button: its roll, once made
        if (usage.workflow && !usage.workflow.attackRoll && !usage.workflow.aborted) await attackRolled(usage.workflow);
        return usage.workflow?.attackRoll ? [usage.workflow.attackRoll] : null;
      }
      return workflow.whileExecuting(() => this._midiRollAttack(config, dialog, message));
    }

    async _midiRollAttack(config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}): Promise<Roll[] | null> {
      const hookIds: Record<string, number | undefined> = {};
      let rolls;
      const workflow = config.workflow;
      config.midiOptions ??= {};

      try {
        if (debugEnabled > 0) warn("MidiQOL | AttackActivity | rollAttack | Called", config, dialog, message);

        if (workflow) 
          workflow.rollOptions.rollToggle = heldKeys(config.event).toggle;

        let returnValue = await this.configureAttackRoll(config);
        // Check returnValue first - if false (no workflow), fall through to dnd5e base behavior
        if (!returnValue)
          return super.rollAttack?.(config, dialog, message) ?? [];

        if (!workflow || workflow?.aborted) return [];
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
        if (this.item.system.properties?.has("amm") && !(split?.index && split.ammunition)) {
          const ammoConfirmation = this.confirmAmmunition;
          if (ammoConfirmation.reason) {
            ui.notifications?.warn(ammoConfirmation.reason);
          }
          if (!ammoConfirmation.proceed) {
            if (workflow) workflow.aborted = true;
          }
          requiresAmmoConfirmation = ammoConfirmation.confirm;
        }
        const effectiveForceRollDialog = getEffectiveForceRollDialog(this);

        // The caller's dialog setting is not used for attacks
        dialog.configure = decideRollDialog({ force: effectiveForceRollDialog, toggle: !!workflow?.rollOptions?.rollToggle,
          fastForward: isAutoFastForward("attack", { workflow }) });

        // Ammo confirmation always requires dialog
        if (requiresAmmoConfirmation) {
          dialog.configure = true;
        }

        // A caller can name the attack mode up front - automation and macros have no user to ask.
        // dnd5e validates it against the item's own attackModes and falls back to the first one, so
        // an unrecognised mode degrades to a normal attack rather than reinstating the prompt.
        const suppliedAttackMode = config.midiOptions?.workflowOptions?.attackMode;
        if (suppliedAttackMode) config.attackMode = suppliedAttackMode;

        // Thrown weapons normally require dialog to choose attack mode, but respect forceRollDialog="never"
        //@ts-expect-error no dnd5e-types
        if (this.item?.system.properties.has("thr") && effectiveForceRollDialog !== "never"
          && !suppliedAttackMode) {
          dialog.configure = true;
        }

        dialog.options ??= {};

        hookIds["dnd5e.preRollAttack"] = Hooks.once("dnd5e.preRollAttack", (rollConfig, dialogConfig, messageConfig) => {
          if (workflow?.aborted) return false;
          if (configSettings.checkTwoHanded && ["twoHanded", "offhand"].includes(rollConfig.attackMode)) {
            // check equipment - shield other weapons for equipped status
            // @ts-expect-error no dnd5e-types
            if (this.actor.system.attributes.ac?.shield > 0) {
              ui.notifications?.warn(i18n("midi-qol.TwoHandedShieldWarning"));
              if (workflow) workflow.aborted = true;
              return false;
            }
          } else if (!rollConfig.attackMode && dialogConfig.options?.attackModeOptions?.length) dialogConfig.configure = true;

          // Apply roll modifiers (auto-fail/success, min/max) for attack rolls
          const actType = this.actionType;
          const attackModifierFlags: RollModifierFlags = {
            failFlags: ["fail.all"],
            successFlags: ["success.all"],
            maxFlags: [],
            minFlags: [],
            fieldPaths: [`abilities.${this.ability}.attack.roll`, "rolls.attack", `rolls.attack.${actType}`]
          };
          if (workflow?.attackRollModifierTracker) {
            // Again now dnd5e has built the rolls: a denial has to clear the advantage it put in their options.
            applyTrackerAdvantage(rollConfig, workflow.attackRollModifierTracker);
            computeRollModifiers(this.actor!, attackModifierFlags, workflow.attackRollModifierTracker, { workflow });
            applyRollModifiers(workflow.attackRollModifierTracker, rollConfig, dialogConfig);
          }
          // A single target's flanking and granted attack bonuses, labelled in the roll; the reasons go with the roll
          // for its display (ChatMessageMidi)
          const { parts: extraParts, modifiers } = workflow?.attackRollParts() ?? { parts: [], modifiers: [] };
          for (const roll of rollConfig.rolls ?? []) {
            if (extraParts.length) roll.parts = [...(roll.parts ?? []), ...extraParts];
            if (modifiers.length) foundry.utils.setProperty(roll, `options.${MODULE_ID}.attackModifiers`, modifiers);
          }

          if (dialogConfig.configure && workflow) showAttackTargets(workflow);
          return true;
        });
        // dnd5e adds its own parts when it builds each roll (with or without the dialog, and again when the dialog
        // rebuilds it): label them then, so the roll's display can name every term, with the effects behind the
        // combined roll bonus
        hookIds["dnd5e.postBuildAttackRollConfig"] = Hooks.on("dnd5e.postBuildAttackRollConfig", (process, config) => {
          const subject = process?.subject as { uuid?: string } | undefined;
          if (subject?.uuid && subject.uuid !== this.uuid) return;
          const options = (config.options ?? {}) as { ability?: string, attackMode?: string };
          const ability = options.ability ?? process?.ability ?? this.ability;
          config.parts = labelAttackParts(config.parts ?? [], ability);
          const sources = rollBonusSources(this, ability, this.getActionType?.(options.attackMode ?? process?.attackMode) ?? this.actionType);
          foundry.utils.setProperty(config, `options.${MODULE_ID}.rollBonusSources`, sources);
        });
        hookIds["dnd5e.rollAttack"] = Hooks.once("dnd5e.rollAttack", (rolls, { ammoUpdate, subject }) => {
          if (ammoUpdate) {
            // dnd5e spends one; the activity's Ammunition setting may spend none (a later target, one per use) or one each
            const ammo = this.actor?.items.get(ammoUpdate.id);
            // @ts-expect-error no dnd5e-types
            const quantity: number = ammo?.system.quantity ?? 0;
            ammoUpdate.quantity = Math.max(0, quantity - this.ammunitionToSpend(workflow));
            // @ts-expect-error no dnd5e-types
            ammoUpdate.destroy = !!ammo?.system.uses?.autoDestroy && ammoUpdate.quantity === 0 && quantity > 0;
          }
          if (ammoUpdate?.destroy) {
            // @ts-expect-error no dnd5e-types
            if (workflow) workflow.spentAmmunitionData = this.actor.items.get(ammoUpdate.id).toObject();
          }
        });
        hookIds["dnd5e.postAttackRollConfiguration"] = Hooks.once("dnd5e.postAttackRollConfiguration", (rolls, config, dialog, message) => {
          if (rolls?.length === 0) {
            // if (config.workflow) config.workflow.aborted = true;
            return false;
          }
          // @ts-expect-error no dnd5e-types
          if (configSettings.checkTwoHanded && ["twoHanded", "offhand"].includes(rolls?.[0]?.options?.attackMode)) {
            // check equipment - shield other weapons for equipped status
            // @ts-expect-error no dnd5e-types
            if (this.actor.system.attributes.ac?.shield > 0) {
              ui.notifications?.warn(i18n("midi-qol.TwoHandedShieldWarning"));
              if (config.workflow) config.workflow.aborted = true;
              return false;
            }
          }
          // @ts-expect-error no dnd5e-types
          if (this.requireAmmunition && this.item.system.properties?.has("amm")) {
            // @ts-expect-error no dnd5e-types
            const chosenAmmunition = this.actor.items.get(rolls?.[0]?.options?.ammunition);
            const needed = this.ammunitionToSpend(config.workflow);
            // @ts-expect-error no dnd5e-types
            const quantity: number = chosenAmmunition?.system.quantity ?? 0;
            const enough = quantity >= needed;
            const name = chosenAmmunition?.name ?? "Ammunition";
            if (!enough) ui.notifications?.error(quantity > 0
              ? i18nFormat("midi-qol.NotEnoughAmmunition", { name, needed, quantity })
              : i18nFormat("midi-qol.NoAmmunition", { name }));
            else this.ammunitionItem = chosenAmmunition;
            return enough;
          }
          return true;
        })
        // Capture target descriptors last, after all other modules have had a chance to modify AC (e.g. cover)
        hookIds["dnd5e.postRollConfiguration"] = Hooks.once("dnd5e.postRollConfiguration", (rolls, config, dialog, message) => {
          const targetDescriptors = foundry.utils.getProperty(message, "data.system.targets") as DND5ETargetDescriptor[] | undefined;
          if (targetDescriptors && workflow) {
            // Don't mutate td.ac — it's a shared reference with the chat message data.
            // null AC (coverTotal) is handled downstream in checkHits() as auto-miss.
            workflow.targetDescriptors = targetDescriptors as DND5ETargetDescriptor[];
          }
        });
        // Active defence resolves by triggering saving throws and returns early
        if (workflow.useActiveDefence) {
          message.create = false; // go through the roll process but don't show the attack roll.
        }

        message ??= {};
        message.create ??= config.midiOptions.chatMessage;
        config.attackMode ??= this.attackMode ?? "oneHanded";
        // Without the dialog dnd5e spends its last-used or first ammunition, not midi's choice
        // @ts-expect-error no dnd5e-types
        if (this.item.system.properties?.has("amm")) config.ammunition ??= split?.ammunition || this.ammunition || undefined;
        // @ts-expect-error isVersatile is a dnd5e getter
        if (config.event && areMidiKeysPressed(config.event, "Versatile") && this.item.isVersatile) {
          config.attackMode = "twoHanded";
        }
        // @ts-expect-error weirdness with how I did the types
        const rollAttack = (): Promise<Roll[] | null> => super.rollAttack(config, dialog, message);
        rolls = workflow ? await workflow.keepRollMessageFlags(this, rollAttack) : await rollAttack();

        if (!rolls || rolls.length === 0) {
          // if (workflow) workflow.aborted = true;
          return null;
        }
        if (rolls[0]?.options?.ammunition && rolls[0].options.ammunition !== this.ammunition) {
          await this.update({ ammunition: rolls[0].options.ammunition });
          this.ammunition = rolls[0].options.ammunition;
          this.ammunitionItem = this.actor?.items.get(this.ammunition);
          this._otherActivity = undefined; // reset this in case ammunition changed
        }

        if (workflow) {
          workflow.attackRollModifierTracker.reconcileWithRoll(rolls[0]?.options?.advantageMode, dialogShown(dialog.configure, config.event));

          workflow.attackMode = rolls[0].options.attackMode ?? config.attackMode;
          if (this.ammunition && !this.ammunitionItem) { // assume it was deleted
            const storedData = workflow.spentAmmunitionData;
            if (storedData) workflow.ammunition = new Item.implementation(storedData, { parent: this.actor })
          } else workflow.ammunition = this.ammunitionItem;
          /*
           * Resolve from workflow.ammunition, not the live item. When the last piece is spent and
           * the ammunition has uses.autoDestroy, dnd5e deletes the item during the attack roll — the
           * live lookup is then empty, but workflow.ammunition has just been rebuilt from the copy
           * stashed on the chat card. Reading the live item here would drop the ammunition's
           * activity on exactly the shot that used the last piece.
           */
          workflow.ammunitionActivity = this.ammunitionActivity
            ?? findAmmunitionActivity(workflow.ammunition);
          if (this.ammunition) this.update({ ammunition: this.ammunitionItem?.id ?? "" });
          if (configSettings.allowUseMacro) {
            workflow.ammunitionOnUseMacros = workflow.ammunition?.flags?.[MODULE_ID]?.onUseMacroParts ?? new OnUseMacros();
          }
          if (workflow.workflowOptions?.attackRollDSN !== false) await displayDSNForRoll(rolls[0], "attackRollD20", undefined, undefined, workflow?.actor);
          await workflow?.setAttackRoll(rolls[0]);
          rolls[0] = await workflow.processAttackRollBonusFlags();
          // Always add attribution to roll for indicator/tooltip display
          addAttribution(rolls[0], workflow.attackAttribution);
          await workflow?.setAttackRoll(rolls[0]);
        }
        if (debugEnabled > 0) {
          warn("AttackActivity | rollAttack | setAttackRolls completed ", rolls);
          warn(`Attack Activity | workflow is suspended ${workflow?.suspended}`);
        }
        // resume takes a roll that finished before the workflow suspended (it may still be writing its card)
        workflow?.resume(rolls[0] ? "attackRolled" : undefined);
      } catch (err) {
        error("AttackActivity | rollAttack | Error configuring dialog", err);
      } finally {
        for (const [hookName, hookId] of Object.entries(hookIds)) {
          //@ts-expect-error 
          if (hookId !== undefined) Hooks.off(hookName, hookId);
        }
      }
      return rolls;
    }

    async configureAttackRoll(this: Activity, config: RollProcessConfig): Promise<boolean> {
      if (debugEnabled > 0) warn("configureAttackRoll", this, config);
      if (!config.workflow) return false;
      let workflow: Workflow = config.workflow;
      config.midiOptions ??= {};

      if (debugEnabled > 1) debug("Entering configure attack roll", config.event, workflow, config.rollOptions);
      if (workflow.workflowType === "TrapWorkflow") workflow.workflowOptions.fastForward = true;

      await doActivityReactions(this, workflow);
      await busyWait(10);
      if (configSettings.allowUseMacro && workflow.workflowOptions.noTargetOnUseMacro !== true) {
        await workflow.triggerTargetMacros(["isPreAttacked"]);
        if (workflow.aborted) {
          console.warn(`midi-qol | item ${workflow.item.name ?? ""} roll blocked by isPreAttacked macro`);
          await workflow.performState(workflow.WorkflowState_Abort);
          return false;
        }
      }

      // preAttackRoll hooks may modify flags; checkAttackAdvantage() runs after them (below)
      if (await callActivityHooks(this, "midi-qol.preAttackRoll", workflow) === false) {
        console.warn("midi-qol | attack roll blocked by preAttackRoll hook");
        return false;
      }
      await workflow.checkAttackAdvantage();
      // Process keyboard modifiers (ctrl/alt for advantage/disadvantage) after flag processing
      if (await callActivityHooks(this, "midi-qol.preAttackRollConfig", workflow) === false) {
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
        messageData: {
          speaker: getSpeaker(this.actor!)
        }
      },
        { insertKeys: true, overwrite: true });
      if (workflow.rollOptions.rollToggle) config.midiOptions.fastForward = !config.midiOptions.fastForward;

      // Setup labels for advantage reminder
      const advantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("ADV:")).map(s => s.replace("ADV:", ""));
      if (advantageLabels.length > 0) foundry.utils.setProperty(config.midiOptions, "dialogOptions.adv-reminder.advantageLabels", advantageLabels);
      const disadvantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("DIS:")).map(s => s.replace("DIS:", ""));
      if (disadvantageLabels.length > 0) foundry.utils.setProperty(config.midiOptions, "dialogOptions.adv-reminder.disadvantageLabels", disadvantageLabels);

      if (config.midiOptions.fumble === true || config.midiOptions.fumble === false)
        delete config.midiOptions.fumble;

      config.midiOptions.chatMessage = false;
      if (config.midiOptions?.workflowOptions?.versatile) config.attackMode = "twoHanded";
      return true;
    }
    getDamageConfig(config: RollProcessConfig) {
      const rollConfig = super.getDamageConfig(config);
      for (let roll of rollConfig.rolls) {
        if (rollConfig.ammunition) { // add ammunition properties to the damage roll
          let rollProperties = new Set(roll.options.properties);
          const ammunitionProperties = rollConfig.ammunition.system.properties;
          roll.options.properties = Array.from(rollProperties.union(ammunitionProperties));
        }
        // critical/fumble will be inserted when roll.build is called.
      }
      return rollConfig;
    }
    /** @override */
    get actionType() {
      const type = this.attack!.type;
      return `${type.value === "ranged" ? "r" : "m"}${type.classification === "spell" ? "sak" : "wak"}`;
    }

    set ammunitionItem(value) {
      this._ammunitionItem = value;
      this._ammunitionActivity = undefined; // resolved again from the new ammunition
    }

    get ammunitionItem() {
      if (this._ammunitionItem) return this._ammunitionItem;
      if (!this.ammunition) return undefined;
      const ammunitionItem = this.actor?.items?.get(this.ammunition);
      return ammunitionItem
    }
    get possibleOtherActivity() {
      return false;
    }
    get isOtherActivityCompatible() {
      return false;
    }


    prepareData() {
      super.prepareData();
      if (this.otherActivityUuid && this.otherActivityUuid !== "") {
        console.warn(`midi-qol | otherActivityUuid is deprecated. Edit ${this.actor?.name ?? ""} ${this.item?.name ?? ""} ${this.name} and reset other activity. Currently ${this.otherActivityUuid}`);
      }
    }
    get confirmAmmunition(): { reason?: string, confirm: boolean, proceed: boolean } {
      // @ts-expect-error no dnd5e-types
      const ammunitionOptions = this.item.system.ammunitionOptions;
      let ammoAutoSelected = false;
      const ammoCount = (ammunitionOptions?.filter(ammo => !ammo.disabled) ?? []).length;
      if ((ammoCount ?? 0) > 0 && (this.ammunition ?? "") === "") {
        this.ammunition = ammunitionOptions?.find((ammo: { disabled?: boolean; value?: string }) => !ammo.disabled)?.value ?? "";
        ammoAutoSelected = true;
      }
      if (this.requireAmmunition && ammoCount === 0) return { reason: i18n("midi-qol.NoAmmunitionAvailable"), proceed: false, confirm: true };
      if (this.requireAmmunition && !this.ammunition) return { reason: i18n("midi-qol.NoAmmunitionSelected"), proceed: true, confirm: true };
      if (ammunitionOptions.some(ammo => ammo.value === this.ammunition && ammo.disabled)) return { reason: game.i18n?.format("midi-qol.NoAmmunition", { name: this.ammunitionItem?.name }), proceed: true, confirm: true };
      if (game.user?.isGM) return { confirm: configSettings.gmConfirmAmmunition && (ammoCount > 1 || ammoAutoSelected), proceed: true };
      return { confirm: configSettings.confirmAmmunition && (ammoCount > 1 || ammoAutoSelected), proceed: true };
    }

    /**
     * How many pieces of ammunition this attack roll spends, by the activity's Ammunition setting: by default one per
     * attack roll; one per use (a later target of an attack per target spends none); or one per target (each target's
     * own attack spends one, a single roll spends one for each of its targets).
     */
    ammunitionToSpend(workflow: Workflow | undefined): number {
      const mode = this.ammunitionPerTarget ?? "default";
      const split = workflow?.workflowOptions?.attackSplit;
      if (split) return mode === "use" && split.index > 0 ? 0 : 1;
      if (mode === "target") return Math.max(1, workflow?.targets?.count ?? 1);
      return 1;
    }

    get requireAmmunition(): boolean {
      return game.user?.isGM ? configSettings.gmRequireAmmunition : configSettings.playerRequireAmmunition;
    }
    async _midiUsageContext(message) {
      const context = await super._midiUsageContext(message);

      context.hasAttack = !!this.attack; // && !minimalCard && (systemCard || needAttackButton || configSettings.confirmAttackDamage !== "none"),
      return context;
    }
  }
}

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
/** The label of dnd5e's combined roll bonus term (its `@ruleBonus` part), which rollBonusSources breaks down. */
export function rollBonusLabel(): string {
  return i18n("midi-qol.AttackTerm.RollBonus");
}

/**
 * dnd5e's attack roll parts (getAttackData: `@mod`, `@prof`, `@bonus`, …) with a label in brackets, which each
 * evaluated term keeps as its flavor. Parts that aren't one of these references are left as they are.
 */
export function labelAttackParts(parts: string[], ability: string | undefined): string[] {
  const labels: Record<string, string | undefined> = {
    mod: ability ? GameSystemConfig.abilities[ability]?.label : undefined,
    prof: i18n("DND5E.Proficiency"),
    bonus: i18n("DND5E.BonusAttack"),
    weaponMagic: i18n("DND5E.MagicalBonus"),
    ammoMagic: i18n("DND5E.ConsumeAmmunition"),
    ruleBonus: rollBonusLabel(),
    situational: i18n("midi-qol.AttackTerm.Situational")
  };
  return parts.map(part => {
    const key = /^@([\w.]+)$/.exec(part)?.[1];
    if (!key) return part;
    const label = key.startsWith("reductions.") ? i18n("DND5E.Exhaustion") : labels[key];
    return label ? `${part}[${label.replace(/[[\]]/g, "")}]` : part;
  });
}

/**
 * The effects behind dnd5e's combined roll bonus for this attack (`@ruleBonus`: the attack roll bonuses for the
 * ability, all attacks and the action type), each with its own value resolved against the actor's data. Only adding
 * changes have a value of their own; an override or custom change is listed without one.
 */
export function rollBonusSources(activity: any, ability: string | undefined, actionType: string | undefined): Array<{ label: string, value?: string, img?: string }> {
  const actor = activity?.actor;
  if (!actor) return [];
  const keys = new Set([
    "system.rolls.attack.bonus",
    ...(actionType ? [`system.rolls.attack.${actionType}.bonus`, `system.bonuses.${actionType}.attack`] : []),
    ...(ability ? [`system.abilities.${ability}.attack.roll.bonus`] : [])
  ]);
  const rollData = actor.getRollData();
  const sources: Array<{ label: string, value?: string, img?: string }> = [];
  for (const effect of actor.allApplicableEffects()) {
    if (!effect.active) continue;
    for (const change of effect.system.changes ?? []) {
      if (!keys.has(change.key)) continue;
      if (change.type !== "add") {
        sources.push({ label: effect.name, img: effect.img ?? undefined });
        continue;
      }
      const resolved = Roll.replaceFormulaData(`${change.value}`.trim(), rollData).replace(/^\+\s*/, "");
      sources.push({ label: effect.name, value: resolved.startsWith("-") ? resolved : `+${resolved}`, img: effect.img ?? undefined });
    }
  }
  return sources;
}
