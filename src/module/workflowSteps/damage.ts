import { debug, debugEnabled } from "../../midi-qol.js";
import { configSettings } from "../settings.js";
import { processDamageRoll } from "../utils.js";
import { setStepRun } from "../steps/steps.js";
import { Workflow, workflowStepHost, type WorkflowState } from "../Workflow.js";

/** midi's steps (M5): the damage calculation. Moved from Workflow's WorkflowState_<name> methods; `this` is `workflow`. */
export function registerDamageSteps(): void {
  setStepRun("midi-qol.AllRollsComplete", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    const host = workflowStepHost(workflow);
    await workflow.offerDeferredDamageBonuses();

    // Skip other damage processing entirely if consumption was already declined
    if (workflow.otherConsumed === false) {
      // Consumption was declined - the other activity's damage is dropped, the ammunition's kept
      workflow.dropOtherActivityDamage();
    } else {
      // Process consumption for other activity if it will be applied
      await workflow.buildOtherDamageMatches();
      if (workflow.otherDamageMatches!.count > 0 && !workflow.damageOnly) {
        await workflow.checkOtherActivityConsumption();
      }
    }
    // Build the matches not yet built (no-op if rollOtherDamage already built them)
    await workflow.buildOtherDamageMatches();

    if (workflow.rawDamageDetail && (workflow.rawDamageDetail?.length || workflow.rawOtherDamageDetail?.length)) await processDamageRoll(workflow, workflow.rawDamageDetail[0]?.type ?? workflow.defaultDamageType)
    // Now that the damage calculation has run, the card can report what it applied.
    if (workflow.ownsCard && workflow.chatCard && workflow.midiTargetDetail) {
      await workflow.performThrottledUpdate(workflow.chatCard, host.targetsUpdate() as ChatMessage.UpdateData);
    }
    workflow.recordDamageStats();
    // If a damage card is going to be created don't call the isDamaged macro - wait for the damage card calculations to do a better job
    if (configSettings.allowUseMacro && workflow.workflowOptions.noTargetOnUseMacro !== true && !configSettings.autoApplyDamage.includes("Card"))
      await workflow.triggerTargetMacros(["isDamaged"], workflow.hitTargets);
    if (debugEnabled > 1) debug("all rolls complete ", foundry.utils.duplicate(workflow.rawDamageDetail));
    return "midi-qol.ApplyDynamicEffects";
  });
}
