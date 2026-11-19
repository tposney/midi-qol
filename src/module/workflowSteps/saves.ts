import { debug, debugEnabled, error, gameStats } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { saveDisplayMode } from "../lib/saveVisibility.js";
import { TokenDocumentSet } from "../lib/tokenDocumentSet.js";
import { configSettings } from "../settings.js";
import { expireMyEffects, userTargetsKeepingUndrawn } from "../utils.js";
import { setStepRun } from "../steps/steps.js";
import { Workflow, workflowStepHost, type WorkflowState } from "../Workflow.js";

/** midi's steps (M5): the saves. Moved from Workflow's WorkflowState_<name> methods; `this` is `workflow`. */
export function registerSavesSteps(): void {
  setStepRun("midi-qol.WaitForSaves", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    const host = workflowStepHost(workflow);
    if (workflow.damageOnly) return "midi-qol.AllRollsComplete";
    // If the save is from the other activity, check consumption first
    // If consumption fails or is cancelled, skip the save entirely
    if (workflow.saveActivity === workflow.otherActivity && workflow.otherActivity) {
      // For attacks, skip other activity if nothing was hit (don't consume resources for a miss)
      if (workflow.activity.attack && workflow.hitTargets.count === 0 && workflow.hitTargetsEC.count === 0) {
        host.setOtherConsumption(false);
        workflow.rawOtherDamageDetail = [];
        workflow.initSaveResults();
        return "midi-qol.SavesComplete";
      }
      const consumptionSuccess = await workflow.checkOtherActivityConsumption();
      if (!consumptionSuccess) {
        workflow.initSaveResults();
        return "midi-qol.SavesComplete";
      }
    }

    if (configSettings.allowUseMacro) {
      if (workflow.workflowOptions.noOnUseMacro !== true) await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preSave"), "OnUse", "preSave");
      if (workflow.workflowOptions.noTargetOnUseMacro !== true) await workflow.triggerTargetMacros(["isAboutToSave"]); // ??
      if (workflow.ammunition && workflow.workflowOptions.noOnUseMacro !== true) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("preSave"), "OnUse", "preSave");
    }
    // Allow editing of targets if there is no attack that has already been processed: for a use the player drives and
    // was shown the targets of (an automated use's are its own: user-targets plan stage 2)
    if (workflow.workflowType === "BaseWorkflow" && workflow.showsTargetsToUser && !workflow.activity.attack && workflow.activity.target?.affects.type !== "self") {
      workflow.targets = userTargetsKeepingUndrawn(workflow.targets);
      workflow.hitTargets = new TokenDocumentSet(workflow.targets);
    }
    workflow.failedSaves = new TokenDocumentSet(workflow.hitTargets);
    if (!workflow.hasSave) {
      workflow.initSaveResults();  // Ensure saveResults is initialized even without a save
      return "midi-qol.SavesComplete";
    }
    await workflow.displaySaveTargets();
    workflow.initSaveResults();
    if (configSettings.autoCheckSaves !== "none") {
      await workflow.callMidiHooks("midi-qol.preCheckSaves");
      if (workflow.aborted) return "midi-qol.Abort";
      // The saveRequests providers listen for their own answers while the saves are out (M5b)
      try {
        const saveDisplay = saveDisplayMode();
        // The saveRequests service (checkSaves); a module may still have replaced the deprecated requestSaves port
      const replaced = workflow.replacedPort("requestSaves");
      if (replaced) await replaced(workflow, saveDisplay !== "allShow");
      else await workflow.checkSaves(saveDisplay !== "allShow");
      } catch (err) {
        const message = ("midi-qol | checkSaves error")
        TroubleShooter.recordError(err, message);
        error(message, err)
      }
      if (debugEnabled > 1) debug("Check Saves: ", workflow.pendingSaves.keys(), workflow.saves);
      if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks.events["renderChatMessageHTML"]?.length)
      await workflow.callMidiHooks("midi-qol.postCheckSaves");
      if (workflow.aborted) return "midi-qol.Abort";
      const saveDisplay = saveDisplayMode();
      if (workflow.ownsCard) await Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeDnd5eSaveButtons: configSettings.autoCheckSaves !== "none" });
      await workflow.displaySaves(saveDisplay === "whisper");
    } else {// has saves but we are not checking so do nothing with the damage
      workflow.effectTargets = workflow.failedSaves;
      workflow.outcome = "manualSaves";
      return "midi-qol.RollFinished";
    }
    return "midi-qol.SavesComplete";
  });

  setStepRun("midi-qol.SavesComplete", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    expireMyEffects.bind(workflow)(["1Action", "1Spell"]);
    if (configSettings.allowUseMacro && workflow.workflowOptions.noOnUseMacro !== true) {
      await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("postSave"), "OnUse", "postSave");
      if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("postSave"), "OnUse", "postSave");
    }
    if (configSettings.keepRollStats && workflow.item && workflow.hasSave) {
      gameStats.addSaveResult(
        workflow.saves.count + workflow.failedSaves.count,
        workflow.saves.count,
        workflow.failedSaves.count,
        workflow.item
      );
    }
    return "midi-qol.AllRollsComplete";
  });
}
