import { unTimedExecuteAsGM } from "../GMAction.js";
import { configSettings } from "../settings.js";
import { clearUpdatesCache } from "../utils.js";
import { addCardNote } from "../lib/cardNotes.js";
import { i18nFormat } from "../../midi-qol.js";
import { setStepRun } from "../steps/steps.js";
import { Workflow, workflowStepHost, type WorkflowState } from "../Workflow.js";

/** midi's steps (M5): abort and cancel. Moved from Workflow's WorkflowState_<name> methods; `this` is `workflow`. */
export function registerAbortSteps(): void {
  setStepRun("midi-qol.Abort", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    workflow.aborted = true;
    workflow.outcome = workflow.failure ? "failed" : "aborted";
    if (workflow.postSummonHookId) Hooks.off("dnd5e.postSummon", workflow.postSummonHookId);
    if (workflow.itemCardUuid && fromUuidSync(workflow.itemCardUuid)) {
      // A failed use (Workflow#fail: countered) keeps its card, marked with why; an aborted one is as if never used
      if (workflow.failure) {
        const text = foundry.utils.escapeHTML(i18nFormat("midi-qol.UseFailedBy", { reason: workflow.failure.reason }));
        await addCardNote(workflow.chatCard, `<p>${text}</p>`, { anchor: "top", key: "midi-qol.failed", cssClass: "midi-qol-use-failed" });
      } else await Workflow.deleteAbortedCard(workflow.chatCard);
      clearUpdatesCache(workflow.itemCardUuid);
    }

    for (const tUuid of workflow.templateUuids) {
      const templateToDelete = await fromUuid(tUuid) as MeasuredTemplateDocument | undefined;
      if (templateToDelete) await templateToDelete.delete();
    }
    return "midi-qol.Cleanup";
  });

  setStepRun("midi-qol.Cancel", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    // cancel will undo the workflow if it exists
    if (configSettings.undoWorkflow) await unTimedExecuteAsGM("undoTillWorkflow", workflow.uuid, true, true);
    return "midi-qol.Abort"
  });
}
