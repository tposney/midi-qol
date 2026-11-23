import { MidiActivity } from "./midiActivity.js";
import { chargeUse } from "../services/economy/cost.js";
import { multiattackAfterCharge } from "../services/multiattack/service.js";
import { postChatCardChecks, preChatChecks, preTargetingChecks, setupCanSeeSense } from "./useChecks.js";
import { setupTargets } from "./useTargets.js";
import { skipConcentrationActorUuids } from "../patching.js";
import { TokenDocumentSet, memberCount } from "../lib/tokenDocumentSet.js";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { MODULE_ID, debugEnabled, error, i18n, i18nFormat, warn } from "../../midi-qol.js";
import { ActiveDefenceWorkflow, AugmentedEvent, TrapWorkflow, Workflow, SavesFirstWorkflow } from "../Workflow.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { checkRule, configSettings, safeGetGameSetting } from "../settings.js";
import { saveUndoData } from "../undo.js";
import { clearAbandonedUse, type UseState } from "./useRelaunch.js";
import { activityHasAreaTarget, activityTargetsSelf, activityHasAutoPlaceTemplate, confirmUseOffScene, hasUsedBonusAction, hasUsedReaction, autoConsumeResource, setBonusActionUsed, setReactionUsed, validTargetTokens, activityHasEmanationNoTemplate, areMidiKeysPressed, getActor, toMessageMode, isActivityType, speakerFor } from "../utils.js";
import { removeFlanking } from "./activityHelpers.js";
import { raiseUseConfigure } from "../lib/entries/useEvents.js";

/*
 * A use of an activity (M10's restart, useRelaunch.ts): midi's work before dnd5e's use (prepareUse), during it (onUsePreUse, onUseConsumption) and after it (finishUse); consumption choices; using as another actor.
 * (M14: from MidiActivityMixin.ts, midi's activity class layer until then.)
 */

/** The player's targets now are the use's pre-selection (user-targets plan stage 3): its snapshot and the workflow's */
export function retakeUserTargets(workflow: Workflow, usage?: ActivityUseConfiguration): void {
  const uuids = Array.from(game.user?.targets ?? []).map(t => t.document.uuid).filter((uuid): uuid is string => !!uuid);
  // setupTargets reads the use's own options; the workflow keeps its merged copy
  if (usage?.midiOptions?.workflowOptions) usage.midiOptions.workflowOptions.preSelectedTargetUuids = uuids;
  workflow.workflowOptions.preSelectedTargetUuids = uuids;
  workflow.preSelectedTargets = new TokenDocumentSet(uuids);
}

export async function useAs(used: MidiActivity, actor: Actor.Implementation | null | undefined, usage: ActivityUseConfiguration = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  // itemData._id = used.item._id;
  actor = getActor(usage.midiOptions?.rollAs);
  if (usage.midiOptions?.rollAs) delete usage.midiOptions.rollAs;
  if (!actor || actor === used.actor || used.isSelfTriggerableOnly) return used.use?.(usage, dialog, message);
  const itemData = used.item.toObject();
  // @ts-expect-error
  delete itemData._id;
  foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.syntheticItem`, true);
  let item = new CONFIG.Item.documentClass(itemData, { parent: actor });
  item.prepareData();
  //@ts-expect-error no dnd5e-types
  item.prepareFinalAttributes(); // Since actor prepareData is not being called need to do used here
  // @ts-expect-error no dnd5e-types
  const activity = item.system.activities.get(used.id);
  return activity.use(usage, dialog, message);
}

/**
 * midi's use (M10, activities/useRelaunch.ts): calls dnd5e's use with a use key, which midi's preUseActivity
 * listener cancels and restarts after midi's pre-use work; returns the restart's result. The restarted call
 * (marked) is dnd5e's use itself, so other listeners see one use.
 */

export async function prepareUse(used: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<{ done: true, result: unknown } | { done: false, state: UseState }> {
  const stop = (result?: unknown) => ({ done: true as const, result });
  if (usage.midiOptions?.rollAs) return stop(await useAs(used, usage.midiOptions.rollAs, usage, dialog, message));
  if (!used.item.isEmbedded) return stop();
  if (!used.item.isOwner) {
    ui.notifications?.error("DND5E.DocumentUseWarn", { localize: true });
    return stop();
  }
  if (!used.canUse) {
    ui.notifications?.error("DND5E.ACTIVITY.Warning.UsageNotAllowed", { localize: true });
    return stop();
  }
  // A GM's own use (a click, not a macro, reaction or another module's call)
  const interactive = !!usage.event && !usage.workflow && !usage.midiOptions?.workflowOptions?.forceCompletion;
  const offScene = interactive ? await confirmUseOffScene(used.actor) : "here";
  if (offScene === "cancel") return stop();
  // Copies: a caller may reuse one options object across uses, and used snapshot belongs to used use alone.
  usage.midiOptions = { ...usage.midiOptions };
  usage.midiOptions.workflowOptions = { ...usage.midiOptions.workflowOptions };
  // The view moved to the creature's scene, which clears the user's targets: an attack or creature targets (not an
  // area or self) are confirmed there
  const choosesCreatures = !used.target?.template?.type && (!!used.attack || !["", "self", undefined].includes(used.target?.affects?.type));
  if (offScene === "viewed" && choosesCreatures) usage.midiOptions.workflowOptions.targetConfirmation ??= "always";
  // Capture current targets before template placement can replace them
  // The player's targets as the use starts (a use told to ignore them has none from the player)
  const snapshotFromUser = usage.midiOptions.workflowOptions.preSelectedTargetUuids === undefined && !usage.midiOptions.ignoreUserTargets;
  usage.midiOptions.workflowOptions.preSelectedTargetUuids ??= (usage.midiOptions.ignoreUserTargets ? [] : Array.from(game.user?.targets ?? []))
    .map(t => t.document.uuid).filter((uuid): uuid is string => !!uuid);
  if (debugEnabled > 0) warn("MidiQOL | MidiActivity | use | Called", usage, dialog, message);
  let item = used.item.clone({}, { keepId: true });
  // @ts-expect-error no dnd5e-types
  let activity = item.system.activities.get(used.id);
  let workflowClass = usage?.midi?.workflowClass ?? globalThis.MidiQOL.workflowClass;
  if (game.user?.isGM && checkRule("activeDefence")) {
    workflowClass = ActiveDefenceWorkflow;
  }
  if (!(workflowClass.prototype instanceof Workflow)) workflowClass = Workflow;
  const workflowOptions = { ...usage.midiOptions, ...(usage.midiOptions?.workflowOptions ?? {}), event: usage.event as AugmentedEvent | undefined };
  delete workflowOptions.workflowOptions;
  if (usage.workflow)
    usage.midiOptions.workflowOptions.autoRollAttack = true;
  if (!(usage.workflow instanceof TrapWorkflow)) {
    //TODO stupidly the constructor for TrapWorkflow is not compatible with the workflow constructor - will need to clean that up
    // Active Defence wins over saves before damage for an attack (user, 2026-11-19): the defence roll is the attack
    const activeDefence = workflowClass === ActiveDefenceWorkflow && !!activity.attack;
    if (configSettings.savesBeforeDamage && !activeDefence)
      usage.workflow = new SavesFirstWorkflow(activity.actor ?? null, activity, speakerFor({ actor: activity.item.actor }), null, { workflowOptions });
    else usage.workflow = new workflowClass(activity.actor ?? null, activity, speakerFor({ actor: activity.item.actor }), null, { workflowOptions });
  }
  Workflow.setUse(activity, usage.workflow!);
  usage.workflow!.sequenceId = usage.sequenceId;
  usage.workflow!.systemCard = message.systemCard;
  if ((activity.midiProperties?.rollMode ?? "default") !== "default") message.rollMode = toMessageMode(activity.midiProperties!.rollMode) as keyof CONFIG.Dice.RollModes;
  if (activity.midiProperties?.skipConcentrationCheck && used.actor &&
      activity.consumption.targets.some(t => t.target === "attributes.hp.value"))
    skipConcentrationActorUuids.add(used.actor.uuid);
  if (item.parent) await removeFlanking(item.parent);
  if (!usage.workflow) return stop(undefined);
  if (usage.midiOptions.isCritical) {
    usage.workflow.isCritical = true;
    usage.workflow.attackRollModifierTracker.addAttribution("CRIT", "activity.use", i18n("midi-qol.ActivityUse"));
  }
  if (usage.midiOptions.isFumble) {
    usage.workflow.isFumble = true;
    usage.workflow.attackRollModifierTracker.addAttribution("FUMBLE", "activity.use", i18n("midi-qol.ActivityUse"));
  }
  const autoCreateTemplate = activityHasAutoPlaceTemplate(activity);
  const emanationNoTemplate = activityHasEmanationNoTemplate(activity);
  const isTrapWorkflow = usage.workflow instanceof TrapWorkflow;
  if (autoCreateTemplate || emanationNoTemplate || isTrapWorkflow) {
    usage.create ??= {};
    usage.create.measuredTemplate = false;
    // dnd5e's usage dialog doesn't offer it either (M14: was midi's dialog class): its display option for the section
    dialog.options = foundry.utils.mergeObject(dialog.options ?? {}, { display: { create: { measuredTemplate: false } } }, { inplace: false });
  }

  foundry.utils.setProperty(message, "data.flags.midi-qol.messageType", "attack");
  if (usage.midiOptions?.configureDialog === false) dialog.configure = false;
  if (!await checkAutoConsume(activity, usage, dialog)) {
    if (used.midiProperties?.forceConsumeDialog === "always") dialog.configure = true;
    else if (used.midiProperties?.forceConsumeDialog === "never") dialog.configure = false;
  }
  const rollToggle = areMidiKeysPressed(usage.event as AugmentedEvent, "RollToggle");
  if (rollToggle && usage.workflow) {
    foundry.utils.setProperty(usage.workflow, "rollOptions.rollToggle", true);
    dialog.configure = !dialog.configure; // toggle the configure dialog
  }
  // Synthetic items can't be resolved by uuid, so the card keeps a snapshot to rebuild them from.
  // Not dnd5e's `item.data` flag: dnd5e 6 moves that into `system.deltas.deleted`, and a refund
  // recreates everything listed there on the actor.
  if (!activity.item._id || foundry.utils.getProperty(activity.item, `flags.${MODULE_ID}.syntheticItem`))
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.itemData`, activity.item.toObject());
  /*
   * Activity#use begins concentration, and ends the one it replaces, before midi's checks run,
   * so a use midi then cancels would cost the caster their existing concentration. Take the
   * player's choice from dnd5e's working copy of the config - after the dialog and dnd5e's own
   * concentration validation - and begin it once the use can no longer be backed out of
   * (Workflow#beginDeferredConcentration).
   * Transform-to-form links the new form to the concentration effect inside Activity#use, so
   * it is left to dnd5e.
   */
  const deferConcentration = activity.requiresConcentration
    && !safeGetGameSetting("dnd5e", "disableConcentration")
    && !(isActivityType(activity, "transform") && activity.transform?.mode === "form");
  // Stopped after the workflow was made: the caller's config is left without it, so a resubmitted config starts afresh
  const abandon = () => { clearAbandonedUse(usage); return stop(false); };
  // M15 stage 4: use.configure entries (an abort stops the use before its checks and costs)
  if (!await raiseUseConfigure(usage.workflow!, usage)) return abandon();
  if (!await preTargetingChecks(activity, usage, dialog, message)) return abandon();
  // A preTargeting macro or hook may have set the player's targets: the use takes them (user-targets plan stage 3,
  // C1). Safe now that automated uses never write the player's targets.
  if (snapshotFromUser && !memberCount(usage.midiOptions.targetsToUse)) retakeUserTargets(usage.workflow!, usage);
  // Save/clear targets BEFORE setupTargets changes game.user.targets for self-targeting
  const isSelfTarget = activityTargetsSelf(used)
    // @ts-expect-error item.type includes "tool" at runtime
    || (used.item.type === "tool" && !used.target?.affects?.type);
  // Self-targeting no longer writes the player's targets (M2 stage 7), so there is nothing to save and restore
  if (isSelfTarget) usage.workflow!.selfTargeted = true;
  if (!await setupTargets(activity, usage, dialog, message)) {
    ui.notifications?.warn(i18n("midi-qol.noTargets"));
    return abandon();
  }
  if (!await preChatChecks(activity, usage, dialog, message)) return abandon();
  // If midiOptions.spellLevel is provided, set the spell slot key so that
  // dnd5e's _prepareUsageScaling derives the correct scaling from it.
  if (usage.midiOptions?.spellLevel && activity.item?.type === "spell") {
    usage.spell ??= {} as { slot: string };
    usage.spell.slot = `spell${usage.midiOptions.spellLevel}`;
  }
  return { done: false, state: { usage, dialog, message, activity, deferConcentration } };
}

/** dnd5e's preUseActivity for used use (its workflow): the scaled activity dnd5e uses, and dnd5e's copy of the usage */

export function onUsePreUse(activity: MidiActivity, state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): boolean {
  // Only activity use's: dnd5e's copy of `usage` keeps its workflow (deepClone keeps class instances). Another use of the
  // same activity running meanwhile has its own state.
  if (usageConfig.workflow !== state.usage.workflow) return true;
  state.dnd5eUsageConfig = usageConfig;
  state.usage.workflow!.activity = newActivity;
  Workflow.setUse(newActivity, state.usage.workflow!);
  return true;
}

/** dnd5e's activityConsumption for activity use: the activity consumption and the card run on, deferred concentration */
export function onUseConsumption(activity: MidiActivity, state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): void {
  if (usageConfig.workflow !== state.usage.workflow) return;
  state.usageData = usageConfig;
  usageConfig.workflow!.activity = newActivity;
  usageConfig.activity = newActivity;
  // Scaling (an upcast) rebuilds the item's activities: consumption and the card run on activity new object, so
  // Workflow.workflowFor needs it too (emanation placement, the early filing under the card, template flags)
  Workflow.setUse(newActivity, state.usage.workflow!);
  if (state.deferConcentration && usageConfig.concentration?.begin) {
    state.usage.workflow!.deferredConcentration = { scaling: usageConfig.scaling || undefined, end: usageConfig.concentration.end ?? undefined };
    usageConfig.concentration.begin = false;
  }
  // The player changed their targets while dnd5e's usage dialog was open: the use takes them, as valid targets (user-
  // targets plan stage 3, C2). Not an area (its template decides), self, or a use the player doesn't drive. This hook is
  // synchronous, so there is no confirmation from here.
  const workflow = state.usage.workflow!;
  if (state.dialog?.configure && workflow.showsTargetsToUser && !workflow.selfTargeted && !activityHasAreaTarget(newActivity)
    && !memberCount(state.usage.midiOptions?.targetsToUse) && canvas?.scene) {
    const now = validTargetTokens(new Set(game.user?.targets ?? []));
    if (!workflow.targets.equals(now)) {
      workflow.setTargets(now);
      retakeUserTargets(workflow, state.usage);
    }
  }
}

/**
 * midi's work after dnd5e's use (M10 stage 1): the card's workflow, the checks after the card, templates, undo data,
 * the reaction and bonus action markers, cast data, then the workflow's first step. Returns what use() returns.
 */
export async function finishUse(used: MidiActivity, state: UseState, useResults: any): Promise<unknown> {
  const { usage, dialog, message } = state;
  // Cleanup skipConcentrationCheck flag in case workflow was interrupted before concentration check
  if (used.actor) skipConcentrationActorUuids.delete(used.actor.uuid);
  if (!usage.workflow) return false;
  if (!useResults) { // activity use was aborted
    Workflow.removeWorkflow(usage.workflow?.id);
    clearAbandonedUse(usage, state.dnd5eUsageConfig);
    return false;
  }
  // A use's workflow is registered only once its card exists, under the card's uuid.
  // Force a few values to be added to the updates cache now we have the chat card.
  usage.workflow.itemCardUuid = useResults.message.uuid;
  usage.workflow.id = useResults.message.uuid ?? usage.workflow.id;
  usage.workflow.activity = usage.workflow.activity;
  usage.workflow.item = usage.workflow!.activity?.item;
  const activity: MidiActivity = usage.workflow!.activity!;
  Workflow.addWorkflow(usage.workflow);
  try {
    if (await postChatCardChecks(activity, usage, dialog, message) !== true) return;
    await setupCanSeeSense(activity, usage)
    // Process any templates placed (via the dialog's checkbox; an emanation is placed by the PlaceEmanation step)
    // processPlacedTemplates handles validation, cleanup if incomplete, and workflow integration
    const allTemplates = (useResults.templates ?? []).flat() as MeasuredTemplateDocument[];
    if (allTemplates.length > 0) {
      await usage.workflow.processPlacedTemplates(allTemplates, activity);
    }
    if (configSettings.undoWorkflow) await saveUndoData(usage.workflow);
  } catch (err) {
    // The card exists and the workflow waits for used use: stop it rather than leave it suspended
    TroubleShooter.recordError(err, `${used.item?.name} use`);
    error(`${used.item?.name} use failed`, err);
    ui.notifications?.error(i18nFormat("midi-qol.UseFailed", { item: used.item?.name ?? "", error: (err as Error)?.message ?? String(err) }));
    const concentration = usage.workflow.concentrationId ? used.actor?.effects.get(usage.workflow.concentrationId) : undefined;
    if (!usage.workflow.aborted) {
      usage.workflow.aborted = true;
      await usage.workflow.performState("midi-qol.Abort");
    }
    await concentration?.delete();
    return false;
  }

  usage.workflow.itemUseComplete = true;

  usage.workflow.id = useResults.message.uuid;
  const usageData = state.usageData;
  // @ts-expect-error no dnd5e-types
  if (activity.item?.type === "spell" || activity.item.flags?.dnd5e?.spellLevel) {
    usage.workflow.castData = {
      // @ts-expect-error no dnd5e-types
      baseLevel: activity.item.system.level ?? activity.item.flags?.dnd5e?.spellLevel?.base,
      // @ts-expect-error no dnd5e-types
      castLevel: activity.item.system.level !== undefined ? activity.item.system.level + (usageData?.scaling ?? 0) : activity.item.flags?.dnd5e?.spellLevel?.value,
      scaling: (usageData?.scaling ?? activity.item.flags?.dnd5e?.scaling) || 0,
      itemUuid: activity.item.uuid
    };
  }
  // The use's action, bonus action or reaction on the economy ledger (M4); after castData: the spell slot rule reads the
  // level cast
  await chargeUse(usage.workflow);
  // M21b: the multiattack provider (midi's: a Multiattack opens its plan; a use that fits it is recorded)
  await multiattackAfterCharge(usage.workflow);
  // Scaling is now handled by the workflow's activity getter (reads from chat card flags).
  await usage.workflow.performState("midi-qol.Start");
  return useResults;
}

/**
 * Check if used activity has consumption configured.
 * @returns true if used activity has consumption targets configured
 */

export function hasConsumption(activity: MidiActivity): boolean {
  return (activity.consumption?.targets?.length ?? 0) > 0;
}

/**
 * Determines whether activity activity should auto-consume resources without showing a dialog.
 * @param workflow - The workflow for getting auto-consume settings
 * @returns true if consumption should be automatic, false if a dialog should be shown
 */
export function shouldAutoConsume(activity: MidiActivity, workflow?: Workflow): boolean {
  const forceConsumeDialog = activity.midiProperties?.forceConsumeDialog ?? "default";

  // Check activity-level overrides first
  if (forceConsumeDialog === "always") {
    return false;
  }
  if (forceConsumeDialog === "never" || activity.midiProperties?.autoConsume) {
    return true;
  }

  // Use global setting
  const autoConsumeSetting = autoConsumeResource(workflow);
  // @ts-expect-error no dnd5e-types
  const isSpell = activity.item?.type === "spell";

  if (autoConsumeSetting === "none") {
    return false;
  }
  if (autoConsumeSetting === "spell" && !isSpell) {
    return false;
  }
  if (autoConsumeSetting === "item" && isSpell) {
    return false;
  }
  // "both" means auto-consume
  return true;
}

export async function checkAutoConsume(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig = {}): Promise<boolean> {
  if (dialog.configure === true) return false;
  if (!shouldAutoConsume(activity, usage.workflow)) return false;

  const consumption = activity._prepareUsageConfig(usage);
  const autoConsume = await activity._prepareUsageUpdates(consumption, { returnErrors: true });
  // If consumption would fail _prepareUsageUpdates will return an array of errors and on success an object of updates
  if ((autoConsume.length ?? 0) > 0) {
    dialog.configure = true;
    return true;
  }
  dialog.configure = false;

  if (activity.hasAreaTarget && activity.actor?.sheet) {
    setTimeout(() => {
      activity.actor?.sheet?.minimize();
    }, 100)
  }
  return true;
}
