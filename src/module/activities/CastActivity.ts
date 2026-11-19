import { speakerFor } from "../utils.js";
import { adoptActivityType } from "./activityPrototype.js";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { isMidiActivityType, preChatChecks, preTargetingChecks, type MidiActivity } from "./MidiActivityMixin.js";
import { setCastChecks } from "./useRelaunch.js";


export function setupCastActivity() {
  if (debugEnabled > 0) warn("MidiQOL | CastActivity | setupCastActivity | Called");
  adoptActivityType("cast");
  setCastChecks(async (activity, usage, dialog, message) => !isMidiActivityType(activity) || castPreChecks(activity, usage, dialog, message));
}



/**
 * midi's checks before a Cast activity hands its use to the spell (M14: were an override of Cast's `use`; run from
 * `dnd5e.preUseLinkedSpell` through the restart, useRelaunch.ts): the hooks, macros and reaction/bonus action
 * enforcement of the Cast activity itself, on a temporary workflow. The spell's own workflow then marks the reaction
 * or bonus action as used and skips checking them again. False: the use stops.
 */
export async function castPreChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean> {
  if (!activity.item.isEmbedded || !activity.item.isOwner || !activity.canUse) return true;
  usage.midiOptions ??= {};
  usage.midiOptions.workflowOptions ??= {};
  usage.midiOptions.proceedChecks ??= {};
  const speaker = speakerFor({ actor: activity.item.actor });
  const tempWorkflow = new Workflow(activity.actor ?? null, activity, speaker, null, { storeWorkflow: false });
  usage.workflow = tempWorkflow;
  try {
    if (!await preTargetingChecks(activity, usage, dialog, message)) return false;
    // Spell component checks are the spell's, not the Cast activity's
    if (!await preChatChecks(activity, usage, dialog, message, { checkComponents: false })) return false;
    usage.midiOptions.proceedChecks.checkReaction = false;
    usage.midiOptions.proceedChecks.checkBonusAction = false;
    usage.midiOptions.workflowOptions.castUsesReaction = tempWorkflow.itemUsesReaction;
    usage.midiOptions.workflowOptions.castUsesBonusAction = tempWorkflow.itemUsesBonusAction;
    return true;
  } finally {
    Workflow.removeWorkflow(tempWorkflow.id);
    delete usage.workflow;
  }
}

