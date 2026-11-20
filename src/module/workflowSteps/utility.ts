import { getAutoRollDamage } from "../utils.js";
import { rollUseTable, tableDeclaration } from "../lib/tables.js";
import { runActivityActions } from "../lib/entries/useChanges.js";
import type { EntryAction } from "../lib/entries/types.js";
import { setStepRun } from "../steps/steps.js";
import { Workflow, workflowStepHost, type WorkflowState } from "../Workflow.js";

/** midi's steps (M5): the utility (formula) roll. Moved from Workflow's WorkflowState_<name> methods; `this` is `workflow`. */
export function registerUtilitySteps(): void {
  setStepRun("midi-qol.WaitForUtilityRoll", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (!workflow.activity.roll?.formula) return "midi-qol.UtilityRollComplete";
    workflow.waitOnPlayerRoll("utility");
    if (getAutoRollDamage(workflow) !== "none") {
      let rolls: unknown;
      await workflow.rollInStep(async () => { rolls = await workflow.activity.rollFormula!({ event: workflow.rollOptions.event, workflow: workflow, midiOptions: { ...workflow.rollOptions, workflowOptions: workflow.workflowOptions } }, {}, { create: false }); });
      if (!rolls || workflow.abort) {
        return "midi-qol.Abort";
      }
      return "midi-qol.UtilityRollComplete";
    }
    return "midi-qol.Suspend";
  });

  setStepRun("midi-qol.UtilityRollComplete", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (workflow.itemCardUuid) {
      workflow.displayUtilityRolls();
    }
    return tableDeclaration(workflow.activity) ? "midi-qol.RollTable" : "midi-qol.WaitForDamageRoll";
  });

  // M28: the activity's random table (lib/tables.ts), after its utility roll; only a use with a table meets it
  setStepRun("midi-qol.RollTable", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    const drawn = await rollUseTable(workflow);
    // M15: the drawn row's actions, as the activity's
    if (drawn?.do?.length) await runActivityActions(workflow, `table.${tableDeclaration(workflow.activity)?.id}`, drawn.do as EntryAction[]);
    return workflow.activity.roll?.formula ? "midi-qol.WaitForDamageRoll" : workflow.postAttackRollState;
  });
}
