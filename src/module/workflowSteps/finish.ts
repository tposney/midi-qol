import { debugEnabled, error, log, warn } from "../../midi-qol.js";
import { autoTeleport, isTeleportActivity } from "../activities/TeleportActivity.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { offerFollowUps } from "../followUps.js";
import { configSettings } from "../settings.js";
import { getOrCreateTokenForActor, isActivityType } from "../utils.js";
import { setStepRun } from "../steps/steps.js";
import { Workflow, workflowStepHost, type WorkflowState } from "../Workflow.js";

/** midi's steps (M5): the use's end: roll finished, clean-up, completed. Moved from Workflow's WorkflowState_<name> methods; `this` is `workflow`. */
export function registerFinishSteps(): void {
  /*
   * The end of the roll, step by step. The state keeps its name, order, hooks, macro passes and exits; each step is
   * one job of the old single method, moved unchanged.
   */
  setStepRun("midi-qol.RollFinished", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (workflow.aborted) {
      const message = `${workflow.workflowName} Workflow ${workflow.id} RollFinished called when aborted`;
      error(message);
      TroubleShooter.recordError(new Error(message), message);
    }
    // A teleport planned with the workflow: after its effects and damage, before RollComplete
    if (!workflow.aborted && !workflow.damageOnly && isTeleportActivity(workflow.activity)) await autoTeleport(workflow.activity, workflow);
    const specialExpiries = [
      "isDamaged",
      "isHealed",
      "1Reaction",
    ];
    await workflow.expireTargetEffects(specialExpiries)
    let selfTarget = workflow.token ?? getOrCreateTokenForActor(workflow.actor);
    await workflow.finishHitDisplay();
    await workflow.finishCardProgress();
    await workflow.finishSummonedCreatures(selfTarget);
    await workflow.finishTransformations(selfTarget);
    if (!workflow.damageOnly) {
      await workflow.callMidiHooks("midi-qol.postActiveEffects");
      // Call onUseMacro if not already called
      if (configSettings.allowUseMacro && workflow.workflowOptions.noOnUseMacro !== true) {
        await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("postActiveEffects"), "OnUse", "postActiveEffects");
        if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("postActiveEffects"), "OnUse", "postActiveEffects");
      }
      if (workflow.aborted) return "midi-qol.Abort";  // TODO This is wrong
    }

    await workflow.callMidiHooks("midi-qol.RollComplete");
    if (workflow.aborted) return "midi-qol.Abort";  // TODO This is wrong
    if (!workflow.damageOnly) await workflow.finishTurnBookkeeping();
    return "midi-qol.Cleanup";
  });

  setStepRun("midi-qol.Cleanup", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    const blfxActive = game.modules.get("boss-loot-assets-premium")?.active ||
      game.modules.get("boss-loot-assets-free")?.active;
    const AAActive = game.modules.get("autoanimations")?.active;
    const elapsedTimeRequired = 5000;
    if (configSettings.autoRemoveInstantaneousTemplate && workflow.templateUuids.length > 0 && workflow.activity.duration?.units === "inst") {
      for (const tUuid of workflow.templateUuids) {
        if (!blfxActive) {
          const elapsed = Date.now() - (workflow.workflowStartTime ?? 0);
          // if auto animations is active we need to allow enough time for it to have grabbed the template data before deleting it.
          let timeout = AAActive ? Math.max(elapsedTimeRequired - elapsed, 1) : 1;
          timeout = Math.max(elapsedTimeRequired, timeout);
          setTimeout(() => {
            (fromUuidSync(tUuid) as MeasuredTemplateDocument | null)?.delete()
          }, timeout);
        } else {
          setTimeout(() => {
            (fromUuidSync(tUuid) as MeasuredTemplateDocument | null)?.delete()
          }, elapsedTimeRequired);
          log("Not auto removing instantaneous template because boss loot assets active")
        }
      }
    }
    if (workflow.postSummonHookId) Hooks.off("dnd5e.postSummon", workflow.postSummonHookId);
    if (workflow.activity.target?.affects.type !== "" || workflow.targets.count !== 0) {
      // moved inside RollFinished if (configSettings.autoItemEffects === "applyRemove") await workflow.removeEffectsButton();
    }

    // Restore user targets if this was a self-target workflow

    return "midi-qol.Completed";
  });

  setStepRun("midi-qol.Completed", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    await workflow.completeCard();
    if (debugEnabled > 0) warn("Workflow complete ", workflow.id, "elapsed time", Date.now() - (workflow.workflowStartTime ?? 0));

    if (!workflow.damageOnly) {
      await offerFollowUps(workflow);
      await workflow.runTriggeredActivity();
    }
    workflowStepHost(workflow).fileFinished();
    return "midi-qol.Suspend";
  });
}
