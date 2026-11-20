import { MidiActivity } from "./midiActivity.js";
import { issuePolicy, issues } from "../services/economy/issues.js";
import { getDistance } from "../services/distance/service.js";
import { ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { MODULE_ID, debugEnabled, error, i18n, i18nFormat, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { checkMechanic, configSettings } from "../settings.js";
import { saveUndoData } from "../undo.js";
import { activityHasAreaTarget, callActivityHooks, canSee, canSense, checkActivityRange, checkTargetsSeen, checkTotalCover, checkIncapacitated, createConditionData, evalActivationCondition, evalCondition, getSpeaker, getToken, activityHasAutoPlaceTemplate, hasUsedBonusAction, hasUsedReaction, isInCombat, logIncapacitatedCheckResult, needsBonusActionCheck, needsReactionCheck, setBonusActionUsed, hasNoReactionsMarker, activityHasEmanationNoTemplate, needsAOOCheck, getConsumptionData } from "../utils.js";
import { activityHasScaledTargetCount, shouldEnforceSingleTarget } from "./activityHelpers.js";

/*
 * The checks a use makes before targeting, before its card and once its card exists: hooks and macros, incapacitation, reaction and bonus action, components, targets, range, cover and sight.
 * (M14: from MidiActivityMixin.ts, midi's activity class layer until then.)
 */

export async function setupCanSeeSense(activity: MidiActivity, usage: { workflow?: Workflow }) {
  const workflow = usage.workflow;
  if (!workflow) return;
  // Sight between canvas tokens: a target with no canvas token is neither seen nor sensed
  for (let target of workflow.targets.tokens) {
    // TODO: This is odd - if `!workflow.token` then `true`, but then we're adding `undefined` to `targetsCanSense`
    const tokenCanSense = workflow.token ? canSense(workflow.token, target, globalThis.MidiQOL.InvisibleDisadvantageVisionModes, { forceVision: true }) : true;
    const targetCanSense = workflow.token ? canSense(target, workflow.token, globalThis.MidiQOL.InvisibleDisadvantageVisionModes, { forceVision: true }) : false;
    // Per target: the targets that sense the actor (they held the actor's token, set by each target in turn)
    if (targetCanSense) workflow.targetsCanSense.add(target);
    else workflow.targetsCanSense.delete(target);
    if (tokenCanSense) workflow.tokenCanSense.add(target);
    else workflow.tokenCanSense.delete(target);
    const tokenCanSee = workflow.token ? canSee(workflow.token, target, { forceVision: true }) : true;
    const targetCanSee = workflow.token ? canSee(target, workflow.token, { forceVision: true }) : false;
    if (targetCanSee) workflow.targetsCanSee.add(target);
    else workflow.targetsCanSee.delete(target);
    if (tokenCanSee) workflow.tokenCanSee.add(target);
    else workflow.tokenCanSee.delete(target);
  }

  // Blood Sense: treat wounded targets within bloodsense range as sensed/seen
  if (workflow.token?.actor) {
    const bloodsenseRange = Number(foundry.utils.getProperty(workflow.token.actor, `flags.${MODULE_ID}.bloodsense`) ?? 0);
    if (bloodsenseRange > 0) {
      for (const target of workflow.targets.tokens) {
        if (workflow.tokenCanSense.has(target) && workflow.tokenCanSee.has(target)) continue;
        const targetToken = getToken(target);
        if (!targetToken?.actor) continue;
        // @ts-expect-error no dnd5e-types
        const hp = targetToken.actor.system.attributes?.hp;
        if (!hp || hp.value >= hp.max) continue; // not wounded
        const distance = getDistance(workflow.token, targetToken, { wallsBlock: false });
        if (distance >= 0 && distance <= bloodsenseRange) {
          workflow.tokenCanSense.add(target);
          workflow.tokenCanSee.add(target);
        }
      }
    }
  }
  workflow.recordSight();
}

export async function preTargetingChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig: any = {}): Promise<boolean> {
  const workflow = usage.workflow;
  const removeWorkflow = (workflow) => {
    return false;
  }
  if (!workflow) return false;
  let options: any = { none: false, checkAoO: true, checkReaction: true, checkBonusAction: true, checkAllowIncapacitated: false, callMacros: true, callHooks: true, checkTargets: true, checkComponents: true, checkUse: true }
  if (optionsConfig.none) options = optionsConfig;
  options = foundry.utils.mergeObject(options, optionsConfig, { insertKeys: true, overwrite: true });
  if (usage.midiOptions?.proceedChecks?.none) options = usage.midiOptions!.proceedChecks;
  options = foundry.utils.mergeObject(options, usage.midiOptions?.proceedChecks ?? {}, { insertKeys: true, overwrite: true });
  let cancelWorkflow: boolean | undefined;

  if (options.checkAllowIncapacitated && !usage.midiOptions?.workflowOptions?.allowIncapacitated && activity.actor) {
    const [incapacitated] = await issues(activity, { workflow, only: ["incapacitated"] });
    if (incapacitated) {
      logIncapacitatedCheckResult(activity.actor.name ?? "", incapacitated.label, debugEnabled > 0, true);
      if (issuePolicy(incapacitated, activity.actor) === "enforce") return removeWorkflow(usage.workflow);
    }
  }

  if (options.callHooks) {
    cancelWorkflow = await callActivityHooks(activity, "midi-qol.preTargeting", { activity: activity, token: workflow.token, config: usage, dialog, message }) === false;
    cancelWorkflow ||= await callActivityHooks(activity, "midi-qol.preTargetingV2", { workflow, usage, dialog, message }) === false;
  }

  if (options.callMacros && configSettings.allowUseMacro) {
    const results = await workflow?.callMacros(activity.item, workflow?.onUseMacros?.getMacros("preTargeting"), "OnUse", "preTargeting", { usage, dialog, message });
    cancelWorkflow ||= results?.some(i => i === false) ?? false;
  }
  if (cancelWorkflow) return removeWorkflow(usage.workflow);
  return true;
}

export async function preChatChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig: any = {}): Promise<boolean> {
  const workflow = usage.workflow;
  const removeWorkflow = (workflow) => {
    return false;
  }
  if (!workflow) return false;
  let options: any = { none: false, checkReaction: true, checkBonusAction: true, checkAllowIncapacitated: false, callMacros: true, callHooks: true, checkTargets: true, checkComponents: true, checkUse: true }
  if (optionsConfig.none) options = optionsConfig;
  else
    options = foundry.utils.mergeObject(options, optionsConfig, { insertKeys: true, overwrite: true });
  if (usage.midiOptions?.proceedChecks?.none) options = usage.midiOptions.proceedChecks;
  else
    options = foundry.utils.mergeObject(options, usage.midiOptions?.proceedChecks ?? {}, { insertKeys: true, overwrite: true });

  if (options.callHooks) {
    let hookAbort = await callActivityHooks(activity, "midi-qol.preItemRoll", { activity: activity, token: workflow.token, config: usage, dialog, message }) === false;
    hookAbort ||= await callActivityHooks(activity, "midi-qol.preItemRollV2", { workflow, usage, dialog, message }) === false;
    if (hookAbort || workflow.aborted) {
      console.warn("midi-qol | attack roll blocked by preItemRoll hook");
      workflow.aborted = true;
      await workflow.performState("midi-qol.Abort")
      return removeWorkflow(workflow);
    }
  }

  if (options.callMacros && configSettings.allowUseMacro) {
    const results = await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preItemRoll"), "OnUse", "preItemRoll", { usage, dialog, message });
    if (workflow.aborted || results.some(i => i === false)) {
      console.warn("midi-qol | item roll blocked by preItemRoll macro");
      workflow.aborted = true;
      await workflow.performState("midi-qol.Abort")
      return removeWorkflow(workflow);
    }
  }

  if (options.checkUse && activity.useCondition && activity.effectiveActivationType !== "reaction") { // reactions condition evaluation is handled elsewhere
    if (!(await evalActivationCondition(workflow, activity.useCondition, workflow.targets.documents[0], { async: true }))) {
      const message = `${activity.useConditionReason} ${activity.actor?.name} unable to use ${activity.item.name}:${activity.name}`;
      if (!(usage.midiOptions?.noUseWarning || usage.midiOptions?.workflowOptions?.noUseWarning))
        ui.notifications?.warn(message);
      else
        console.warn(`midi-qol | preChatChecks | ${message} `);
      return removeWorkflow(workflow);
    }
  }

  // A spell's components and spells the caster can't cast: the economy's issue contributors (M4)
  const componentIds = options.checkComponents ? ["noSpell", "noVerbal", "noSomatic", "noMaterial"] : ["noSpell"];
  const [refused] = await issues(activity, { workflow, only: componentIds });
  if (refused) {
    ui.notifications?.warn(refused.label);
    return removeWorkflow(usage.workflow);
  }
  workflow.AoO = false;
  workflow.itemUsesReaction = false;
  const reactingActor = activity.actor;
  const inReactionContext = !usage.midiOptions?.workflowOptions?.notReaction && !!reactingActor?.inCombat;
  // Classified unless the caller says otherwise; follows checkReaction when not given. An attack per target's
  // per-target uses check no reactions (the first use did) but classify every target.
  if (inReactionContext && reactingActor && (options.checkAoO ?? options.checkReaction)) {
    const isTurn = game.combat?.combatant === (reactingActor.id ? game.combat?.getCombatantsByActor(reactingActor.id) : undefined)?.[0];
    if (!isTurn && needsAOOCheck(reactingActor) && activity.attack && activity.effectiveActivationType !== "special")
      workflow.AoO = true;
  }
  if (inReactionContext && reactingActor && options.checkReaction) {
    if (["reaction", "reactiondamage", "reactionmanual", "reactionpreattack"].includes(activity.effectiveActivationType ?? "")
      && (activity.activation?.cost ?? 1) > 0) {
      workflow.itemUsesReaction = true;
    }

    if (workflow.AoO) workflow.itemUsesReaction = true;

    // The budget issue and its policy (M4): warn asks, enforce refuses, show and off let it go
    const [reactionUsed] = workflow.itemUsesReaction && reactingActor.inCombat ? await issues(activity, { workflow, only: ["reactionUsed"] }) : [];
    const reactionPolicy = reactionUsed ? issuePolicy(reactionUsed, reactingActor) : "off";
    if (reactionUsed && reactionPolicy === "enforce") {
      ui.notifications?.warn(reactionUsed.label);
      await workflow.performState("midi-qol.Abort");
      return removeWorkflow(usage.workflow);
    }
    if (reactionPolicy === "warn") {
      const shouldRoll = await foundry.applications.api.DialogV2.confirm({
        window: {
          title: "midi-qol.EnforceReactions.Title"
        },
        content: i18n("midi-qol.EnforceReactions.Content")
      });
      if (!shouldRoll) {
        await workflow.performState("midi-qol.Abort");
        return removeWorkflow(usage.workflow); // user aborted roll TODO should the workflow be deleted?
      }
    }
  }

  workflow.itemUsesBonusAction = false;
  // needsBonusActionCheck() is deliberately NOT part of activity condition: it is false for
  // "displayOnly", which would stop itemUsesBonusAction ever being set and so stop the used-
  // bonus-action marker being applied at all. setBonusActionUsed() already admits "displayOnly"
  // explicitly, and the reaction branch above gates the same way - only the prompt below is
  // conditional on needsBonusActionCheck.
  if (!usage.midiOptions?.workflowOptions?.notBonusAction && options.checkBonusAction && activity.actor?.inCombat) {
    workflow.itemUsesBonusAction = ["bonus"].includes(activity.effectiveActivationType ?? "");
    const [bonusUsed] = workflow.itemUsesBonusAction ? await issues(activity, { workflow, only: ["bonusActionUsed"] }) : [];
    const bonusPolicy = bonusUsed ? issuePolicy(bonusUsed, activity.actor) : "off";
    if (bonusUsed && bonusPolicy === "enforce") {
      ui.notifications?.warn(bonusUsed.label);
      await workflow.performState("midi-qol.Abort");
      return removeWorkflow(usage.workflow);
    }
    if (bonusPolicy === "warn") {
      const shouldRoll = await foundry.applications.api.DialogV2.confirm({
        window: {
          title: "midi-qol.EnforceBonusActions.Title"
        },
        content: i18n("midi-qol.EnforceBonusActions.Content")
      });
      if (!shouldRoll) {
        await workflow.performState("midi-qol.Abort"); // user aborted roll TODO should the workflow be deleted?
        return removeWorkflow(usage.workflow);
      }
    }
  }
  return true;
}

export async function postChatCardChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig: any = {}): Promise<boolean> {
  const workflow = usage.workflow;
  const removeWorkflow = async (workflow: Workflow) => {
    Workflow.removeWorkflow(workflow.id);
    const consumed = getConsumptionData(workflow.chatCard);
    if (!foundry.utils.isEmpty(consumed)) {
      await workflow.activity.refund(consumed);
    }
    await Workflow.deleteAbortedCard(workflow.chatCard);
    return false
  };
  if (debugEnabled > 0)
    warn("MidiQOL | postChatCardChecks | Called", activity);
  if (!workflow) return false;
  let options: any = { none: false, checkAoO: true, checkReaction: true, checkBonusAction: true, checkAllowIncapacitated: false, callMacros: true, callHooks: true, checkTargets: true, checkComponents: true, checkUse: true }
  if (optionsConfig.none) options = optionsConfig;
  else
    options = foundry.utils.mergeObject(options, optionsConfig, { insertKeys: true, overwrite: true });
  if (usage.midiOptions?.proceedChecks?.none) options = usage.midiOptions.proceedChecks;
  else
    options = foundry.utils.mergeObject(options, usage.midiOptions?.proceedChecks ?? {}, { insertKeys: true, overwrite: true });
  try {
    // Needs to be after chat card as requires targets

    let isEmanationTargeting = activityHasAutoPlaceTemplate(activity) || activityHasEmanationNoTemplate(activity);
    let isAoETargeting = !isEmanationTargeting && activityHasAreaTarget(activity);
    let selfTarget = activity.target?.affects.type === "self";
    const inCombat = activity.actor && isInCombat(activity.actor);
    const requiresTargets = configSettings.requiresTargets === "always"
      || (configSettings.requiresTargets === "tokens" && (canvas?.scene?.tokens.size ?? 0) > 0)
      || (configSettings.requiresTargets === "combat" && inCombat);
    let speaker = getSpeaker(activity.actor!);

    let shouldAllowRoll = !options.checkTargets || !requiresTargets // we don't care about targets
      || (workflow.targets.count > 0) // there are some target selected
      || (activity.target?.affects.type ?? "") === "" // no target required
      || selfTarget
      || isAoETargeting // area effect spell and we will auto target
      || isEmanationTargeting // range target and will autoTarget
      || (!activity.attack && !activity.hasDamage && !activity.hasSave); // does not do anything - need to check dynamic effects

    if (!shouldAllowRoll) {
      ui.notifications?.warn(i18n("midi-qol.noTargets"));
      return removeWorkflow(workflow);
    }

    // Determine allowed number of targets
    // Skip count enforcement for scaled target counts — deferred to WorkflowState_AoETargetConfirmation
    // where the user will have a chance to adjust targets after seeing the scaled count.
    let allowedTargets: number;
    const hasExplicitCount = activity.target?.affects?.count && activity.target.affects.count !== "";
    if (hasExplicitCount && !activityHasScaledTargetCount(activity)) {
      allowedTargets = Number(activity.target.affects.count);
    } else if (options.checkTargets && requiresTargets && shouldEnforceSingleTarget(activity)) {
      // Enforce single target for weapons when the setting is enabled
      allowedTargets = 1;
    } else {
      allowedTargets = Infinity;
    }

    // Check for no targets when creature-type targeting requires them
    const creatureTargetTypes = ["creature", "enemy", "ally", "willing"];
    if (options.checkTargets && requiresTargets && !isEmanationTargeting && !isAoETargeting
        && creatureTargetTypes.includes(activity.target?.affects?.type) && workflow.targets.count === 0) {
      ui.notifications?.warn(i18n("midi-qol.noTargets"));
      if (debugEnabled > 0) warn(`${game.user?.name} attempted to roll with no targets selected`);
      return removeWorkflow(workflow);
    }

    // Check for too many targets
    if (options.checkTargets && requiresTargets && workflow.targets.count > allowedTargets) {
      ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
      if (debugEnabled > 0) warn(`${game.user?.name} ${i18nFormat(`midi-qol.${MODULE_ID}.wrongNumberTargets`, { allowedTargets })}`);
      return removeWorkflow(workflow);
    }

    let tokenToUse: foundry.canvas.placeables.Token.Implementation | undefined;
    if (speaker.token) tokenToUse = canvas.tokens?.get(speaker.token);
    // Range, cover and sight are measured to the targets with a canvas token
    const rangeDetails = checkActivityRange(activity, tokenToUse, new Set(workflow.targets.tokens), checkMechanic("checkRange") !== "none" && !isAoETargeting && !workflow.AoO)
    if (checkMechanic("checkRange") !== "none" && !isAoETargeting && !isEmanationTargeting && !workflow.AoO && speaker.token) {
      if (tokenToUse && workflow.targets.tokens.length > 0) {
        if (rangeDetails.result === "fail")
          return removeWorkflow(workflow);
        else {
          tokenToUse = rangeDetails.attackingToken;
        }
      }
    }


    const targetsCreatures = !!activity.attack || !["", "self"].includes(activity.target?.affects?.type ?? "");
    if (!isAoETargeting && !isEmanationTargeting && targetsCreatures && !checkTotalCover(activity, tokenToUse, workflow.targets.tokens))
      return removeWorkflow(workflow);
    if (!isAoETargeting && !isEmanationTargeting && !checkTargetsSeen(activity, tokenToUse, workflow.targets.tokens))
      return removeWorkflow(workflow);

    if (!workflow) return false;
    workflow.token = tokenToUse;
    workflow.rangeDetails = rangeDetails;

    if (configSettings.undoWorkflow) await saveUndoData(workflow);

    // if showing a full card we don't want to auto roll attacks or damage.
    // Check if activity consumes ammunition
    const ammoConsumption = activity.consumption?.targets?.find(t => t.type === "ammo");
    if (ammoConsumption?.target) {
      workflow.ammunition = activity.actor?.items.get(ammoConsumption.target);
    }
    // Need concentration removal to complete before allowing workflow to continue so have workflow wait for item use to complete
  } catch (err) {
    const message = `postChatCardChecks error for ${activity.actor?.name} ${activity.name} ${activity.uuid}`;
    TroubleShooter.recordError(err, message);
    throw err;
  }
  return true;
}
