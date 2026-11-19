import { debug, debugEnabled, error, i18nFormat, warn } from "../../midi-qol.js";
import { isTransformActivity, transformActor } from "../activities/transform.js";
import { isMidiActivityType } from "../activities/midiActivity.js";
import { placeEmanationTemplate } from "../activities/regions.js";
import { setupCanSeeSense } from "../activities/useChecks.js";
import { activityHasScaledTargetCount, postTemplateConfirmTargets } from "../activities/activityHelpers.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { checkMechanic, configSettings, safeGetGameSetting } from "../settings.js";
import { saveTargetsUndoData } from "../undo.js";
import { activityHasAreaTarget, activityHasAutoPlaceTemplate, activityHasEmanationNoTemplate, checkActivityRange, checkIncapacitated, getActivityAutoTargetAction, getAutoRollAttack, getToken, isActivityType, isRangeCheckable, setRangedTargets, validTargetTokens } from "../utils.js";
import { setStepRun } from "../steps/steps.js";
import type { Activity, ActivityUseConfiguration } from "../../globals.js";
import { Workflow, workflowStepHost, type WorkflowState } from "../Workflow.js";

/** A Transform activity transforms its targets (midi's); a chosen form (form mode) is dnd5e's subsequent action */
function needsTransform(workflow: Workflow): boolean {
  const activity = workflow.activity;
  return isTransformActivity(activity) && activity.transform?.mode !== "form";
}

/** The use places an emanation around its token (activityHasAutoPlaceTemplate / activityHasEmanationNoTemplate) */
function needsEmanation(workflow: Workflow): boolean {
  const activity = workflow.activity;
  if (!activity || !(workflow.token ?? getToken(activity.item?.parent))) return false;
  return activityHasAutoPlaceTemplate(activity) || activityHasEmanationNoTemplate(activity);
}

async function placeEmanation(workflow: Workflow): Promise<void> {
  const activity = workflow.activity;
  const token = workflow.token ?? getToken(activity.item?.parent);
  if (!token) return;
  if (activityHasAutoPlaceTemplate(activity)) {
    const templates = isMidiActivityType(activity) ? await placeEmanationTemplate(activity, workflow) : undefined;
    if (templates?.length) await workflow.processPlacedTemplates(templates, activity);
  }
  if (activityHasEmanationNoTemplate(activity)) {
    setRangedTargets(token, activity.target);
    workflow.setTargets(validTargetTokens(new Set(game.user?.targets)));
    // dnd5e's targets on the card (its effects tray), as the card would have had them
    const card = workflow.chatCard;
    const TargetsField = globalThis.dnd5e?.dataModels?.chatMessage?.fields?.TargetsField;
    if (card && TargetsField) await workflow.performThrottledUpdate(card, { "system.targets": TargetsField.getDescriptors() } as ChatMessage.UpdateData);
  }
}

/** Start's next step: targets from the emanation, a template to wait for, or straight to confirming targets */
function afterStart(workflow: Workflow): WorkflowState {
  // Targets from an emanation with no template: set
  if (workflow.rangeTargeting) return "midi-qol.AoETargetConfirmation";
  if (debugEnabled > 1) debug("WORKFLOW NONE", getActivityAutoTargetAction(workflow.activity), activityHasAreaTarget(workflow.activity));
  if (workflow.tempTargetConfirmation) return "midi-qol.AwaitTemplate";
  return "midi-qol.AoETargetConfirmation";
}

/** midi's steps (M5): the preamble: from a new workflow to the end of its pre-roll checks. Moved from Workflow's WorkflowState_<name> methods; `this` is `workflow`. */
export function registerPreambleSteps(): void {
  setStepRun("midi-qol.Suspend", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    const message = `${workflow.workflowName} Workflow ${workflow.id} suspend should never be called`;
    error(message);
    TroubleShooter.recordError(new Error(message), message);
    return undefined;
  });

  setStepRun("midi-qol.NoAction", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (debugEnabled > 0) warn("WorkflowState_NoAction");
    return "midi-qol.Suspend";
  });

  setStepRun("midi-qol.Start", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (needsTransform(workflow)) return "midi-qol.Transform";
    if (needsEmanation(workflow)) return "midi-qol.PlaceEmanation";
    return afterStart(workflow);
  });

  // A Transform activity transforms the use's targets (M14: was a _finalizeUsage override). First, where it ran
  // before; a step, so it can be moved later in the flow (after saves, say)
  setStepRun("midi-qol.Transform", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    const activity = workflow.activity;
    const card = workflow.chatCard;
    if (isTransformActivity(activity) && card) await transformActor(activity, { workflow }, card);
    if (needsEmanation(workflow)) return "midi-qol.PlaceEmanation";
    return afterStart(workflow);
  });

  // An emanation (a template or range targets around the user) placed once the card exists (M14 D1: a step, not the
  // card's creation, so it can be changed like any step)
  setStepRun("midi-qol.PlaceEmanation", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    await placeEmanation(workflow);
    return afterStart(workflow);
  });

  setStepRun("midi-qol.AwaitTemplate", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (debugEnabled > 0) warn("WorkflowState_AwaitTemplate started");
    if (workflow.templateUuids.length >= workflow.expectedTemplateCount) {
      if (debugEnabled > 0) warn("WorkflowState_AwaitTemplate context - template placed", "needTemplate", workflow.needTemplate, "needItemCard", workflow.needItemCard, "itemUseComplete", workflow.itemUseComplete);
      return "midi-qol.TemplatePlaced";
    }
    if (!workflow.needTemplate) {
      if (debugEnabled > 0) warn("WorkflowState_AwaitTemplate no template needed", "needTemplate", workflow.needTemplate, "needItemCard", workflow.needItemCard, "itemUseComplete", workflow.itemUseComplete);
      return "midi-qol.AoETargetConfirmation";
    }
    if (debugEnabled > 0) warn("WorkflowState_AwaitTemplate suspending", "needTemplate", workflow.needTemplate, "needItemCard", workflow.needItemCard, "itemUseComplete", workflow.itemUseComplete);
    return "midi-qol.Suspend";
  });

  setStepRun("midi-qol.TemplatePlaced", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (configSettings.allowUseMacro && workflow.workflowOptions.noOnUseMacro !== true) {
      await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("templatePlaced"), "OnUse", "templatePlaced");
      if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("templatePlaced"), "OnUse", "templatePlaced");
    }
    if (!workflow.itemCardUuid) return "midi-qol.AoETargetConfirmation";

    const chatMessage = workflow.chatCard;
    if (!chatMessage) return "midi-qol.AoETargetConfirmation";
    workflow.targets = validTargetTokens(workflow.targets);
    workflow.hitTargets = new Set()
    workflow.hitTargetsEC = new Set();
    return "midi-qol.AoETargetConfirmation";
  });

  setStepRun("midi-qol.AoETargetConfirmation", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    // postTemplateConfirmTargets uses requiresTargetConfirmation to decide whether to show
    // the confirmation dialog — covers AoE templates, scaled counts, activity/global settings,
    // and workflowOptions.targetConfirmation overrides.
    if (!await postTemplateConfirmTargets(workflow.activity, { workflowOptions: workflow.workflowOptions }, workflow)) {
      await workflow.refundConsumption();
      return "midi-qol.Abort";
    }
    const hasScaledTargetCount = activityHasScaledTargetCount(workflow.activity);
    if (hasScaledTargetCount) {
      const allowedTargets = Number(workflow.activity.target?.affects?.count);
      if (allowedTargets && workflow.targets.count > allowedTargets) {
        ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
        await workflow.refundConsumption();
        return "midi-qol.Abort";
      }
    }
    return "midi-qol.ValidateRoll";
  });

  setStepRun("midi-qol.ValidateRoll", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (configSettings.allowUseMacro && workflow.workflowOptions.noTargetOnUseMacro !== true) {
      await workflow.triggerTargetMacros(["isTargeted"]);
      if (workflow.aborted) return "midi-qol.Abort";
    }

    // Range: melee weapons too (a thrown weapon is mwak; checkActivityRange keeps the long range only for those)
    if (checkMechanic("checkRange") !== "none" && !workflow.AoO && isRangeCheckable(workflow.activity) && workflow.tokenUuid) {
      const { result, attackingToken } = checkActivityRange(workflow.activity, getToken(workflow.token) ?? "invalid", new Set(workflow.targets.tokens));
      switch (result) {
        case "fail": workflow.outcome = "invalid"; return "midi-qol.RollFinished";
        case "dis": workflow.longRangeAttack = true;
      }
      if (attackingToken && workflow.token !== attackingToken) {
        // changed the attacking token so update the canSee data
        workflow.token = attackingToken;
        if (isMidiActivityType(workflow.activity)) await setupCanSeeSense(workflow.activity, { workflow });
      }
    }
    if (!workflow.workflowOptions.allowIncapacitated && checkMechanic("incapacitated") !== "nothing" && checkIncapacitated(workflow.actor, debugEnabled > 0, true)) {
      if (checkMechanic("incapacitated") === "enforce") { workflow.outcome = "invalid"; return "midi-qol.RollFinished"; }
    }
    return "midi-qol.PreambleComplete";
  });

  setStepRun("midi-qol.PreambleComplete", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (configSettings.undoWorkflow) await saveTargetsUndoData(workflow);
    workflow.effectsAlreadyExpired = [];

    if (await workflow.callCancellableHooks("midi-qol.targetingComplete") === false) {
      ui.notifications?.warn(`midi-qol | Targeting complete hook cancelled roll`);
      return "midi-qol.Abort";
    }
    await workflow.beginDeferredConcentration();
    if ((!getAutoRollAttack(workflow) && workflow.activity.attack) || isActivityType(workflow.activity, "transform")) {
      // Not auto rolling so display targets
      const rollMode = safeGetGameSetting("core", "messageMode") as string;
      workflow.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === "blind" || rollMode === "gm";
      if (workflow.activity.target?.affects?.type !== "self") {
        await workflow.displayHitTargets(workflow.whisperAttackCard);
      }
    }
    return "midi-qol.WaitForAttackRoll";
  });
}
