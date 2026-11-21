import type { Activity, DND5ETargetDescriptor, Dnd5eSystem, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { applyDamageTypeChoice } from "../lib/choices.js";
import { onActivityTypeAdopted } from "../activities/activityPrototype.js";
import { hasConsumption } from "../activities/use.js";
import { isMidiActivityType } from "../activities/midiActivity.js";
import { GameSystemConfig, MODULE_ID, debugEnabled, error, i18n, i18nFormat, warn } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { cardOtherConsumption } from "../lib/cardState.js";
import { heldKeys } from "../lib/rollKeys.js";
import { averageDice } from "../patching.js";
import { configSettings, safeGetGameSetting } from "../settings.js";
import { addRollTo, areMidiKeysPressed, callActivityHooks, displayDSNForRoll, evalActivationCondition, getSpeaker, isAutoFastForward, itemMagicAvailable, setMessageTargets, sumRolls } from "../utils.js";
import { Workflow } from "../Workflow.js";
import { setDamageRollMinTerms } from "../activities/activityHelpers.js";
import { isRollOf } from "./common.js";

/*
 * midi's damage roll (M13): a libWrapper MIXED wrap (some paths don't roll: a blocked roll, a re-roll after the use, an
 * aborted use) on each activity type's `rollDamage` (dnd5e's own, Heal's and Save's
 * overrides included) around dnd5e's roll, in place of the methods graft.ts installed. dnd5e 6.1 has no awaited roll
 * hook, so midi's async work before and after the roll (pre-roll hooks and macros, the dialog decision, max/min and
 * reroll flags, bonus prompts, Dice So Nice, other and ammunition damage, resuming the workflow) stays here; what used
 * to be midi's `getDamageConfig` (damage rules, roll modifiers, ammunition properties, Save's critical) is a
 * `dnd5e.preRollDamage` handler registered at init, so it runs before other modules' handlers, as it did, and only for
 * real rolls (dnd5e also calls getDamageConfig for labels and enrichers).
 */

type RollDamage = (config?: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig) => Promise<Roll[] | void>;

/** Before the shared part, per activity type: what each type's own override did */
const BEFORE_ROLL: Record<string, (activity: Activity, config: RollProcessConfig, message: RollMessageConfig) => RollMessageConfig> = {
  attack(activity, config, message) {
    if (!config.ammunition) {
      let ammunition = activity.ammunitionItem;
      if (!ammunition) ammunition = config.workflow?.ammunition;
      // Spent and deleted: rolled with the data the use kept
      const data = !ammunition ? config.workflow?.spentAmmunitionData : undefined;
      if (data) ammunition = new Item.implementation(data, { parent: activity.actor });
      config.ammunition = ammunition;
      activity.ammunitionItem = ammunition;
    }
    return message;
  },
  check(activity, _config, message) {
    // As dnd5e's Save: the message carries what a save does to the damage
    return foundry.utils.mergeObject({ "data.system.onSave": activity.damage?.onSave ?? null }, message);
  },
  damage: fastForwardByDefault,
  heal: fastForwardByDefault,
  save: fastForwardByDefault
};

function fastForwardByDefault(_activity: Activity, config: RollProcessConfig, message: RollMessageConfig): RollMessageConfig {
  config.midiOptions!.fastForwardDamage ??= isAutoFastForward("damage");
  return message;
}

/** The MIXED wrap registered on `type`'s rollDamage */
export function rollDamageWrapper(type: string) {
  return async function (this: Activity, wrapped: RollDamage, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
    config ??= {};
    // The workflow's options for every type (user, 2026-11-19, M13 D3: Damage, Heal and Save card buttons used to
    // start with empty options, so the workflow's never applied)
    if (config.workflow) config.midiOptions ??= config.workflow.workflowOptions ?? {};
    config.midiOptions ??= {};
    message = BEFORE_ROLL[type]?.(this, config, message ?? {}) ?? message ?? {};
    const workflow = config.workflow as Workflow | undefined;
    if (!workflow) {
      // No use given (a sheet button, a macro): this user's use waiting for this damage roll takes it, as its card's button
      const waiting = Workflow.awaitingRoll(this, "damage");
      if (waiting) return waiting.activityFor(this).rollDamage({ event: config.event, workflow: waiting,
        midiOptions: { isCritical: waiting.workflowOptions?.isCritical || waiting.isCritical } }, {}, { create: false });
      return wrapped(config, dialog, message);
    }
    return workflow.whileExecuting(() => midiRollDamage(this, wrapped, config, dialog ?? {}, message));
  };
}

async function midiRollDamage(activity: Activity, wrapped: RollDamage, config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | void> {
  const workflow = config.workflow as Workflow;
  // @ts-expect-error no dnd5e-types
  if (workflow.currentStep === "midi-qol.Abort") return activity.use(config, dialog, {});
  // Damage again for a completed use: a damage roll of its own, as dnd5e's
  if (workflow.readOnly || workflow.currentStep === "midi-qol.Completed")
    return Workflow.rerollDamage(workflow, activity, config, dialog, message);
  if (config.midiOptions?.updateWorkflow !== false) workflow.clearDamageRules();
  if (debugEnabled > 0) warn("rollDamage | Called", config, dialog, message);
  let result: Roll[] | void | undefined;
  let otherResult: Roll[] | undefined;
  let preRollDamageHookId: number | undefined;
  let rollDamageHookId: number | undefined;
  try {
    if (await callActivityHooks(activity, "midi-qol.preDamageRoll", workflow, activity, config, dialog, message) === false) {
      console.warn("midi-qol | Damage roll blocked via pre-hook");
      return;
    }
    if (configSettings.allowUseMacro) {
      const results = await workflow.callMacros(activity.item, workflow.onUseMacros?.getMacros("preDamageRollConfig"), "OnUse", "preDamageRollConfig", { config, dialog, message });
      if (results?.some(i => i === false)) {
        console.warn("midi-qol | Damage roll blocked by preDamageRollConfig onUseMacro");
        return;
      }
    }
    const held = heldKeys(config.event);
    const keys = { normal: held.normal || held.disadvantage, critical: held.advantage };

    config.midiOptions!.isCritical ??= workflow.workflowOptions?.isCritical || workflow.isCritical;
    config.isCritical ??= config.midiOptions!.isCritical;
    config.midiOptions!.fastForwardDamage ??= workflow.workflowOptions?.fastForwardDamage;
    if (activity.hasDamage || activity.hasHealing) {
      if (Object.values(keys).some(k => k)) dialog.configure = activity.midiProperties?.forceDamageDialog !== "never";
      else if (dialog.configure === undefined) dialog.configure = dialogByProperty(activity, config);
      if (areMidiKeysPressed(config.event, "RollToggle")) workflow.rollOptions.rollToggle = !workflow.rollOptions.rollToggle;
      // @ts-expect-error no dnd5e-types
      if (activity.item.isVersatile && areMidiKeysPressed(config.event ?? workflow.rollOptions.event, "Versatile")) {
        workflow.attackMode = "twoHanded";
      }
      if (workflow.rollOptions?.rollToggle) dialog.configure = !dialog.configure;
      // This roll's own (another roll may come in between: the hook is guarded by its subject)
      preRollDamageHookId = Hooks.on("dnd5e.preRollDamage", (rollConfig: RollProcessConfig, dialogConfig: RollDialogConfig, messageConfig: RollMessageConfig) => {
        if (!isRollOf(rollConfig.subject, activity)) return;
        Hooks.off("dnd5e.preRollDamage", preRollDamageHookId!);
        const targetDescriptors = foundry.utils.getProperty(messageConfig, "data.system.targets") as Array<DND5ETargetDescriptor>;
        // since saves might have been rolled merge the target descriptors
        if (targetDescriptors) {
          workflow.targetDescriptors ??= [];
          for (const targetDetails of targetDescriptors) {
            const existing = workflow.targetDescriptors.find(td => td.actor === targetDetails.actor);
            if (existing) Object.assign(existing, foundry.utils.mergeObject(existing, targetDetails));
            else workflow.targetDescriptors.push(targetDetails);
          }
        }
        // The damage bonuses chosen before the roll (M15 5d) are parts of it
        if (rollConfig.rolls) workflow.addDamageBonusParts(rollConfig.rolls as { parts?: string[], data?: object, options?: Record<string, unknown> }[]);
        if (keys.critical) rollConfig.isCritical = true;
        else if (keys.normal) rollConfig.isCritical = false;
        else if (!dialogConfig.configure) rollConfig.isCritical ||= rollConfig.midiOptions?.isCritical;
        // A choice of damage types needs the dialog, unless the use's choices made it (M28)
        if (applyDamageTypeChoice(workflow, rollConfig.rolls ?? [])) { /* chosen */ }
        else if (activity.damage?.parts.some(part => part.types.size > 1)) dialogConfig.configure = true;
        // @ts-expect-error no dnd5e-types
        else if ((rollConfig.ammunition?.system.damage.base?.types.size ?? 0) > 1) dialogConfig.configure = true;
        else if ((activity.healing?.types?.size ?? 0) > 1) dialogConfig.configure = true;
        if (dialogConfig.configure) {
          dialogConfig.options ??= {};
          dialogConfig.options.defaultButton = rollConfig.isCritical || rollConfig.midiOptions?.isCritical ? "critical" : "normal";
        }
        return true;
      });
      rollDamageHookId = Hooks.on("dnd5e.rollDamage", (rolls, data) => {
        if (!isRollOf(data?.subject, activity)) return;
        Hooks.off("dnd5e.rollDamage", rollDamageHookId!);
        if (rolls[0] && config.midiOptions?.updateWorkflow !== false)
          // @ts-expect-error no dnd5e-types
          workflow.isCritical = rolls[0].options.isCritical;
      });
      message.create ??= false;
      setMessageTargets(message, workflow);
      // The workflow's attack mode as of the roll (hooks and macros above may change it); dnd5e builds the roll data from it
      config.attackMode = workflow.attackMode;
      // Damage choices before the roll (M15 5d): the use's own damage roll only
      if (config.midiOptions?.updateWorkflow !== false) await workflow.chooseDamageBonusesBeforeRoll();
      result = await workflow.keepRollMessageFlags(activity, () => wrapped(config, dialog, message));
      if (!result) { // user backed out of roll
        workflow.beforeDamageBonuses = [];
        workflow.currentAction = "midi-qol.WaitForDamageRoll";
        return;
      }
      if (config.midiOptions?.updateWorkflow !== false) await workflow.settleBeforeDamageBonuses(result[0]);
      result = await postProcessDamageRoll(activity, config, result);
      if (config.midiOptions?.updateWorkflow !== false) await workflow.setDamageRolls(result);
    }
    // Ammunition counts here too: it is no longer resolved as otherActivity, and rollOtherDamage
    // sources from it when the item has no other activity of its own.
    if ((activity.otherActivity ?? activity.ammunitionActivity) && workflow.otherActivity !== activity
      && config.midiOptions?.updateWorkflow !== false) {
      // Check if we need to defer rolling until after consumption is confirmed
      if (!deferOtherDamage(activity, config, dialog)) otherResult = await rollOtherDamage(activity, config, dialog);
    }
    if (config.midiOptions?.updateWorkflow !== false) {
      // Neither the activity nor its other activity rolled: noDamage advances the workflow past WaitForDamageRoll
      // (as opposed to the user cancelling the roll)
      const noDamage = !result?.[0] && !otherResult?.[0] && !(activity.hasDamage || activity.hasHealing);
      workflow.resume(result?.[0] || otherResult?.[0] ? "damageRolled" : noDamage ? "noDamage" : undefined);
    }
  } catch (err) {
    const message = "doDamageRoll error";
    TroubleShooter.recordError(err, message);
    error(message, err);
    // The workflow waits for this roll: stop it rather than leave it suspended.
    if (config.midiOptions?.updateWorkflow !== false && !workflow.aborted) {
      ui.notifications?.error(i18nFormat("midi-qol.DamageRollFailed", { item: activity.item?.name ?? "", error: (err as Error)?.message ?? String(err) }));
      workflow.aborted = true;
      // A step awaiting this roll goes to Abort itself; otherwise start the abort here
      if (!workflow.inStepRoll) await workflow.performState("midi-qol.Abort");
    }
  } finally {
    if (preRollDamageHookId) Hooks.off("dnd5e.preRollDamage", preRollDamageHookId);
    if (rollDamageHookId) Hooks.off("dnd5e.rollDamage", rollDamageHookId);
  }
  return result ?? [];
}

/** The damage (and formula) dialog by the activity's Force damage dialog property, else by fast-forward */
export function dialogByProperty(activity: Activity, config: RollProcessConfig): boolean {
  switch (activity.midiProperties?.forceDamageDialog) {
    case "always": return true;
    case "never": return false;
    default: return !(config.midiOptions?.fastForwardDamage ?? config.workflow?.workflowOptions.fastForwardDamage ?? false);
  }
}

/**
 * Check if other activity damage should be deferred until after consumption is confirmed: only when hits or saves
 * are checked. Stores the config and dialog for later rolling.
 */
function deferOtherDamage(activity: Activity, config: RollProcessConfig, dialog: RollDialogConfig): boolean {
  const workflow = config.workflow;
  if (!activity.otherActivity || !workflow) return false;
  if (!isMidiActivityType(activity.otherActivity) || !hasConsumption(activity.otherActivity)) return false;
  const checkingHits = activity.attack && configSettings.autoCheckHit !== "none";
  const checkingSaves = (activity.otherActivity.save || activity.otherActivity.check) && configSettings.autoCheckSaves !== "none";
  if (!checkingHits && !checkingSaves) return false;
  // rollOtherDamage clones config before changing it; dialog.configure may be changed
  workflow.otherDamageConfig = config;
  workflow.otherDamageDialog = { ...dialog };
  return true;
}

/**
 * Roll the other damage: the item's own other activity and the loaded ammunition's activity both roll. Ammunition is
 * resolved separately from otherActivity, and SRD ammunition such as Arrow of Slaying carries its damage on an activity
 * of its own.
 * @returns The other damage rolls, or undefined if none were rolled
 */
export async function rollOtherDamage(activity: Activity, config: RollProcessConfig, dialog: RollDialogConfig): Promise<Roll[] | undefined> {
  const workflow = config.workflow as Workflow | undefined;
  if (!workflow) return undefined;
  // Build the other activity's and the ammunition's target matches (no-op if already built)
  await workflow.buildOtherDamageMatches();
  // A source whose condition matched no target is not rolled.
  const sources = ([activity.otherActivity, activity.ammunitionActivity] as (Activity | undefined)[]).filter((source, index, all): source is Activity =>
    !!source && all.indexOf(source) === index
    && !!(source.hasDamage || source.hasHealing || source.roll?.formula)
    && (source === activity.ammunitionActivity
      ? !source.useCondition || !!workflow.ammunitionDamageMatches?.count
      : !activity.otherCondition || !!workflow.otherDamageMatches?.count));
  if (!sources.length) return undefined;

  const otherConfig = {
    ...config,
    midiOptions: {
      ...config.midiOptions,
      fastForward: config.midiOptions?.fastForwardDamage,
      updateWorkflow: false, // rollFormula will try and restart the workflow
      addOptionalBonuses: false // don't apply optional bonus flags to other activity damage
    }
  };
  // Undo the roll toggle since rollFormula will look at it as well
  if (sources[0].ac && workflow.rollOptions?.rollToggle) dialog.configure = !dialog.configure;

  const otherResult: Roll[] = [];
  for (const source of sources) {
    otherResult.push(...(await rollOtherDamageSource(activity, source, source === activity.ammunitionActivity, otherConfig, dialog, config) ?? []));
  }
  if (!otherResult.length) return undefined;
  if (config.midiOptions?.updateWorkflow !== false) await workflow.setOtherDamageRolls(otherResult);
  return otherResult;
}

/** Roll one source of other damage. */
async function rollOtherDamageSource(activity: Activity, source: Activity, isAmmunition: boolean, otherConfig: RollProcessConfig,
  dialog: RollDialogConfig, config: RollProcessConfig): Promise<Roll[] | undefined> {
  let otherActivity = source;
  // Scaling of the item's own other activity, stored on the chat card by checkOtherActivityConsumption
  const scaling = isAmmunition ? undefined : cardOtherConsumption(config.workflow?.chatCard).scaling;
  if (scaling) {
    const item = otherActivity.item.clone({ flags: { dnd5e: { scaling } } }, { keepId: true });
    // @ts-expect-error no dnd5e-types
    otherActivity = item.system.activities.get(otherActivity.id);
  }
  /*
   * Ammunition base damage is dnd5e's to add, not ours: AttackActivity#getDamageConfig has already spliced
   * `ammo.system.damage.base` into the weapon's damage rolls, and a consumable of type "ammo" reports
   * offersBaseDamage === true. An activity on the ammunition with damage.includeBase left at its schema default would
   * pull the same base damage in twice.
   */
  // @ts-expect-error no dnd5e-types
  if (isAmmunition && otherActivity?.damage?.includeBase) {
    const item = otherActivity.item.clone({ [`system.activities.${otherActivity.id}.damage.includeBase`]: false }, { keepId: true });
    // @ts-expect-error no dnd5e-types
    otherActivity = item.system.activities.get(otherActivity.id);
  }

  let rolls: Roll[] | undefined;
  if (otherActivity?.hasDamage) {
    rolls = await otherActivity.rollDamage(otherConfig, dialog, { create: false }) as Roll[] | undefined;
  } else if (otherActivity?.roll?.formula) {
    // @ts-expect-error no dnd5e-types
    rolls = await otherActivity.rollFormula(otherConfig, dialog, { create: false }) as Roll[] | undefined;
    if (rolls) {
      if (!(rolls instanceof Array)) rolls = [rolls];
      rolls = rolls.map(roll => new (game.system as Dnd5eSystem).dice.DamageRoll(roll.formula, {}, {}));
    }
  }
  // Apply parent activity type to damage properties if configured
  if (rolls && activity.otherActivityAsParentType) {
    rolls.forEach(r => {
      const properties = new Set<string>((r.options as { properties?: string[] }).properties ?? []);
      properties.delete(source.actionType);
      properties.add(activity.actionType);
      (r.options as { properties?: string[] }).properties = Array.from(properties);
    });
  }
  // The ammunition's damage applies by its own condition and save (Workflow#otherDamageFor).
  if (rolls && isAmmunition) rolls.forEach(r => foundry.utils.setProperty(r, `options.${MODULE_ID}.ammunition`, true));
  return rolls;
}

/** The roll modifiers (flags.midi-qol.rollModifiers.damage.<action or item type>.<damage type>) for a damage roll */
function damageRollModifiers(activity: Activity, damageTypes: string[]): string[] {
  const modifiers: string[] = [];
  const actionType = activity.actionType;
  const itemType = activity.item.type;
  const changes: { key: string, value: string, priority: number }[] = [];
  if (activity.actor) for (const effect of activity.actor.allApplicableEffects()) {
    if (effect.disabled || effect.isSuppressed) continue;
    // @ts-expect-error fvtt-types v14 ActiveEffect
    for (const change of effect.system.changes) {
      if (!change.key.startsWith("flags.midi-qol.rollModifiers.damage.")) continue;
      changes.push(change);
    }
  }
  changes.sort((a, b) => a.priority - b.priority);
  for (const change of changes) {
    const [, , , , actionOrItem, damageType] = change.key.split(".");
    if (actionOrItem === "all" || actionOrItem === actionType || actionOrItem === itemType) {
      if (damageType === "all" || damageTypes.includes(damageType)) modifiers.push(change.value);
    }
  }
  return modifiers;
}

/**
 * What midi's getDamageConfig did, now on dnd5e.preRollDamage (registered at init: before other modules' handlers):
 * Save's critical settings, the ammunition's properties, roll modifiers and magical damage for every activity damage
 * roll; for a workflow's roll, the attacker's damage rules and the workflow's roll state.
 */
function configureDamageRoll(rollConfig: RollProcessConfig): void {
  const activity = rollConfig.subject as Activity | undefined;
  if (!(activity?.item instanceof Item) || typeof activity.rollDamage !== "function") return;
  try {
    if (activity.type === "save") {
      rollConfig.critical ??= { allow: false };
      rollConfig.critical.allow = activity.damage?.critical.allow ?? false;
      // @ts-expect-error no dnd5e-types
      rollConfig.critical.bonusDamage = activity.damage?.critical.bonus;
    }
    for (const roll of rollConfig.rolls ?? []) {
      roll.options ??= {};
      // The ammunition's properties: dnd5e copies only the physical ones
      // @ts-expect-error no dnd5e-types
      if (rollConfig.ammunition) roll.options.properties = Array.from(new Set<string>(roll.options.properties).union(rollConfig.ammunition.system.properties));
      roll.options["midi-qol"] ??= {};
      // @ts-expect-error no dnd5e-types
      const damageTypes: string[] = roll.options.types ?? [];
      roll.options["midi-qol"].modifiers = (roll.options["midi-qol"].modifiers ?? []).concat(damageRollModifiers(activity, damageTypes));
      if (roll.options.properties && activity.midiProperties?.magicDamage && !roll.options.properties.includes("mgc")) roll.options.properties.push("mgc");
    }
    const workflow = rollConfig.workflow as Workflow | undefined;
    if (!workflow) return;
    applyDamageTypeChoice(workflow, rollConfig.rolls ?? []);
    // dnd5e 6.1's attacker ignore/downgrade rules for this roll: the use's damage applies them
    if (rollConfig.midiOptions?.updateWorkflow !== false) workflow.addDamageRules(rollConfig.applicationOptions);
    if (workflow.workflowType === "TrapWorkflow") workflow.rollOptions.fastForward = true;
    if (workflow.currentStep !== "midi-qol.WaitForDamageRoll" && workflow.noAutoAttack) {
      // TODO NW check this allow damage roll to go ahead if it's an ordinary roll
      workflow.currentAction = "midi-qol.WaitForDamageRoll";
    }
    if (workflow.currentStep !== "midi-qol.WaitForDamageRoll") {
      if (workflow.currentStep === "midi-qol.AwaitTemplate") ui.notifications?.warn(i18n("midi-qol.noTemplateSeen"));
      else if (workflow.currentStep === "midi-qol.WaitForAttackRoll") ui.notifications?.warn(i18n("midi-qol.noAttackRoll"));
    }
    if (debugEnabled > 0) warn("rolling damage  ", activity.name, activity);
    if (rollConfig.midiOptions?.isCritical !== undefined) workflow.isCritical = rollConfig.midiOptions.isCritical;
    rollConfig.midiOptions ??= {};
    rollConfig.midiOptions.fastForwardDamage ??= workflow.workflowOptions?.fastForwardDamage ?? workflow.rollOptions.fastForwardDamage;
    workflow.damageRollCount += 1;
  } catch (err) {
    const message = "Configure Damage Roll error";
    TroubleShooter.recordError(err, message);
    error(message, err);
  }
}

async function postProcessDamageRoll(activity: Activity, config: RollProcessConfig, result: Roll[]): Promise<Roll[]> {
  const DamageRoll = (game.system as Dnd5eSystem).dice.DamageRoll;
  const workflow = config.workflow as Workflow | undefined;
  try {
    if (!workflow) return result;
    let magicalDamage: boolean = !!itemMagicAvailable(activity.item);
    magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && Number(activity.attackBonus ?? 0) > 0);
    // @ts-expect-error no dnd5e-types
    magicalDamage ||= configSettings.requireMagical === "off" && (config.ammunition?.system.magicalBonus ?? 0) > 0;
    magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && (activity.attack?.type.classification ?? "none") !== "weapon");
    magicalDamage = magicalDamage || (configSettings.requireMagical === "nonspell" && !!activity.isSpell);

    for (const roll of result ?? []) {
      const droll = roll as Roll & { options: { properties?: string[] }, data: { actorType?: string } };
      droll.options.properties ??= [];
      if (activity.isSpell) droll.options.properties.push("spell");
      if (magicalDamage && !droll.options.properties.includes("mgc")) droll.options.properties.push("mgc");
      droll.options.properties.push(activity.actionType);
      if (droll.data.actorType === configSettings.averageDamage || configSettings.averageDamage === "all") averageDice(droll);
    }
    const firstTarget = workflow.hitTargets.documents[0] ?? workflow.targets?.documents[0];
    const firstTargetActor = firstTarget?.actor;
    const condition = (expression: string | undefined) => expression ? evalActivationCondition(workflow, expression, firstTarget, { async: true, errorReturn: false }) : false;
    const targetMaxFlags = firstTargetActor?.flags?.[MODULE_ID]?.grants?.max?.damage ?? {};
    const maxFlags = workflow.actor.flags?.[MODULE_ID]?.max ?? {};
    let needsMaxDamage = (await condition(maxFlags.damage?.all)) || (await condition(maxFlags.damage?.[activity.actionType]));
    needsMaxDamage = needsMaxDamage || (await condition(targetMaxFlags.all)) || (await condition(targetMaxFlags[activity.actionType]));
    const targetMinFlags = firstTargetActor?.flags?.[MODULE_ID]?.grants?.min?.damage ?? {};
    const minFlags = workflow.actor.flags?.[MODULE_ID]?.min ?? {};
    let needsMinDamage = (await condition(minFlags.damage?.all)) || (await condition(minFlags.damage?.[activity.actionType]));
    needsMinDamage = needsMinDamage || (await condition(targetMinFlags.all)) || (await condition(targetMinFlags[activity.actionType]));
    if (needsMaxDamage && needsMinDamage) {
      needsMaxDamage = false;
      needsMinDamage = false;
    }
    const bonusDamageFlags = firstTargetActor?.flags?.[MODULE_ID]?.grants?.bonus?.damage ?? {};
    if (bonusDamageFlags.all || bonusDamageFlags[activity.actionType]) {
      const newDamageRoll = bonusDamageFlags[activity.actionType] ?? bonusDamageFlags.all;
      const bonusDamage = await new DamageRoll(`${newDamageRoll}`, firstTargetActor?.getRollData()).roll();
      result[0] = addRollTo(result[0], bonusDamage);
    }

    const title = activity.name;
    let flavor = title;
    // @ts-expect-error no dnd5e-types
    if (activity.item.labels.damages?.length > 0) flavor = `${title} (${activity.item.labels.damages.map(d => d.damageType)})`;
    const messageData = {
      title,
      flavor,
      speaker: getSpeaker(activity.actor!),
      type: "damage",
      // As dnd5e's own damage messages: dnd5e renders one with an item from its activity
      system: Object.assign({}, activity.messageSources)
    };
    const damageFlags = activity.actor?.flags?.[MODULE_ID]?.damage;
    if (needsMaxDamage) {
      for (let i = 0; i < result.length; i++) result[i] = await result[i].reroll({ maximize: true });
    } else if (needsMinDamage) {
      for (let i = 0; i < result.length; i++) result[i] = await result[i].reroll({ minimize: true });
    } else if (damageFlags?.["reroll-kh"] || damageFlags?.["reroll-kl"]) {
      let result2: Roll[] = [];
      for (const roll of result) result2.push(await roll.reroll());
      if ((damageFlags?.["reroll-kh"] && (sumRolls(result2) > sumRolls(result)))
        || (damageFlags?.["reroll-kl"] && (sumRolls(result2) < sumRolls(result)))) {
        [result, result2] = [result2, result];
      }
      // display roll not being used.
      if (workflow.workflowOptions?.damageRollDSN !== false)
        await Promise.all(result2.map(r => displayDSNForRoll(r, "damageRoll", undefined, undefined, activity.actor)));
      // @ts-expect-error no dnd5e-types
      await DamageRoll.toMessage(result2, messageData, { rollMode: safeGetGameSetting("core", "messageMode") });
    }
    setDamageRollMinTerms(result);

    if (activity.actionType === "heal" && !Object.keys(GameSystemConfig.healingTypes).includes(workflow.defaultDamageType ?? "")) workflow.defaultDamageType = "healing";
    if (workflow.workflowOptions?.damageRollDSN !== false) {
      // Thrown with the rest of the damage step's dice (Workflow.flushDamageThrow)
      if (config.midiOptions?.updateWorkflow !== false) {
        workflow.beginDamageThrow();
        await workflow.throwDamageDice(result);
      } else await Promise.all(result.map(r => displayDSNForRoll(r, "damageRoll", undefined, undefined, activity.actor)));
    }
    if (config.midiOptions?.addOptionalBonuses !== false) result = await workflow.processDamageRollBonusFlags(result);
    return result;
  } catch (err) {
    const message = `doDamageRoll error for item ${activity?.name} ${activity.uuid}`;
    TroubleShooter.recordError(err, message);
    throw err;
  }
}

type LibWrapperRegister = { register(packageId: string, target: string, fn: (...args: never[]) => unknown, type: string): unknown };

/** midi's damage roll on each type it adopted, and its damage configuration; once, from setupActivities */
export function installDamageRolls(): void {
  const libWrapper = (globalThis as { libWrapper?: LibWrapperRegister }).libWrapper;
  onActivityTypeAdopted(type =>
    libWrapper?.register("midi-qol", `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype.rollDamage`, rollDamageWrapper(type), "MIXED"));
  Hooks.on("dnd5e.preRollDamage", configureDamageRoll);
}
