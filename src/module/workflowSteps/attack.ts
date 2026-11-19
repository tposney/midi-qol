import { attackEachTarget } from "../rolls/attack.js";
import { error, i18n } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { TokenDocumentSet } from "../lib/tokenDocumentSet.js";
import { configSettings, safeGetGameSetting } from "../settings.js";
import { expireMyEffects, getAutoRollAttack, getAutoRollDamage, isActivityType, isAutoFastForward } from "../utils.js";
import { setStepRun } from "../steps/steps.js";
import { Workflow, workflowStepHost, type WorkflowState } from "../Workflow.js";

/** midi's steps (M5): the attack roll and the hits. Moved from Workflow's WorkflowState_<name> methods; `this` is `workflow`. */
export function registerAttackSteps(): void {
  setStepRun("midi-qol.WaitForAttackRoll", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    // Attack per target: this use has its targets (template, confirmation) and its cost; each target gets its own use
    if (isActivityType(workflow.activity, "attack") && workflow.activity.attacksEachTarget
      && workflow.targets.count > 1 && !workflow.workflowOptions?.attackSplit) {
      if (workflow.chatCard) await workflow.performThrottledUpdate(workflow.chatCard, { "system.midi.progress.attacksSplit": true } as ChatMessage.UpdateData);
      // The targets, filled in with each one's hit or miss as its own use resolves (addSplitAttackResult)
      const rollMode = safeGetGameSetting("core", "messageMode") as string;
      workflow.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === "blind" || rollMode === "gm";
      if (configSettings.autoCheckHit !== "none") await workflow.displayHitTargets(workflow.whisperAttackCard);
      workflow.needsHitTargetsDisplayed = false;
      await attackEachTarget(workflow.activity, workflow);
      workflow.outcome = "split";
      return "midi-qol.RollFinished";
    }
    if (!workflow.activity.attack) {
      workflow.hitTargets = new TokenDocumentSet(workflow.targets);
      workflow.hitTargetsEC = new Set();
      if (workflow.hasSave) {
        workflow.needsHitTargetsDisplayed = false;
      } else if (workflow.targets.count > 0 && workflow.activity.target?.affects?.type !== "self") {
        await workflow.displayHitTargets(false);
      }
      if (workflow.activity.roll?.formula) return "midi-qol.WaitForUtilityRoll";
      return workflow.postAttackRollState;
    }

    const isFastRoll = workflow.rollOptions.fastForwardAttack ?? workflow.workflowOptions.fastForwardAttack ?? isAutoFastForward("attack", { workflow: workflow });
    workflow.rollOptions.fastForwardAttack ||= isFastRoll;
    const autoRollAttack = getAutoRollAttack(workflow);
    if (!autoRollAttack) {
      const chatMessage = workflow.chatCard;
      if (!chatMessage) {
        const message = `WaitForAttackRoll | no chat message`;
        error(message);
        TroubleShooter.recordError(new Error(message), message);
      } else if (!isFastRoll) {
        const hasAdvantage = workflow.advantage && !workflow.disadvantage;
        const hasDisadvantage = workflow.disadvantage && !workflow.advantage;
        const attackBtnText = i18n(hasAdvantage ? "DND5E.Advantage" : hasDisadvantage ? "DND5E.Disadvantage" : "DND5E.Attack");
        await workflow.performThrottledUpdate(chatMessage, { "system.midi.attackBtnText": attackBtnText } as ChatMessage.UpdateData);
      }
    }

    if (workflow.activity.roll?.formula) return "midi-qol.WaitForUtilityRoll";
    if (!autoRollAttack || !isFastRoll) workflow.waitOnPlayerRoll("attack");
    if (autoRollAttack) {
      workflow.rollOptions.fastForwardAttack ||= isFastRoll;
      return workflow.rollInStep(() => workflow.activity.rollAttack!({ event: workflow.rollOptions.event, workflow: workflow, midiOptions: { ...workflow.rollOptions, workflowOptions: workflow.workflowOptions } }, {}, {}));
    }
    return "midi-qol.Suspend";
  });

  setStepRun("midi-qol.AttackRollComplete", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (configSettings.allowUseMacro && workflow.workflowOptions.noTargetOnUseMacro !== true) await workflow.triggerTargetMacros(["isAttacked"]);
    await workflow.processAttackRoll();
    await workflow.callMidiHooks("midi-qol.preCheckHits");
    if (workflow.aborted) return "midi-qol.Abort";

    if (configSettings.allowUseMacro && workflow.workflowOptions.noOnUseMacro !== true) {
      await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preCheckHits"), "OnUse", "preCheckHits");
      if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("preCheckHits"), "OnUse", "preCheckHits");
    }

    await workflow.processAttackRoll();
    workflow.recordAttackStats();

    if (configSettings.autoCheckHit !== "none") {
      await workflow.displayAttackRoll({ GMOnlyAttackRoll: true });
      workflow.recordTargetACModifiers();
      await workflow.checkHits();
      await workflow.displayAttackRoll();
      const rollMode = safeGetGameSetting("core", "messageMode") as string;
      workflow.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === "blind" || rollMode === "gm";
      await workflow.callMidiHooks("midi-qol.hitsChecked");
      if (workflow.aborted) return "midi-qol.Abort";
      await workflow.displayHits(workflow.whisperAttackCard);
    } else {
      await workflow.displayAttackRoll();
    }
    await workflow.expireTargetEffects(["isAttacked"]);

    await workflow.callMidiHooks("midi-qol.AttackRollComplete");
    if (workflow.aborted) return "midi-qol.Abort";

    if (configSettings.allowUseMacro && workflow.workflowOptions.noOnUseMacro !== true) {
      await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("postAttackRoll"), "OnUse", "postAttackRoll");
      if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("postAttackRoll"), "OnUse", "postAttackRoll");
      if (workflow.aborted) return "midi-qol.Abort";
    }

    if (configSettings.autoCheckHit === "none") {
      workflow.hitTargets = new Set();
      workflow.hitTargetsEC = new Set();
      if (workflow.targets.count > 0 && workflow.activity.target?.affects?.type !== "self") {
        await workflow.displayHitTargets(false);
      }
      return workflow.postAttackRollState;
    }
    if (getAutoRollDamage(workflow) === "always") return workflow.postAttackRollState;
    const noHits = workflow.hitTargets.count === 0 && workflow.hitTargetsEC.count === 0;
    const allMissed = noHits && workflow.targets.count !== 0;
    if (!allMissed && workflow.outcome === "allMissed") workflow.outcome = "ok"; // a re-rolled attack that hits
    if (allMissed) {
      workflow.outcome = "allMissed";
      if (configSettings.confirmAttackDamage !== "none" && !workflow.workflowOptions.forceCompletion)
        return "midi-qol.ConfirmRoll";
      if (workflow.workflowOptions.forceCompletion || configSettings.autoCompleteWorkflow) {
        expireMyEffects.bind(workflow)(["1Attack", "1Action", "1Spell", "1Critical", "1Fumble"])
        // Nothing to roll, but the effects stage still runs: "apply to self always" effects, its macro passes and hooks
        return "midi-qol.ApplyDynamicEffects";
      }
      // if (configSettings.autoRollDamage !== "always") return "midi-qol.RollFinished";
      // else return "midi-qol.WaitForDamageRoll";
    }
    return workflow.postAttackRollState;
  });
}
