import { speakerFor } from "../utils.js";
import { adoptActivityType } from "./graft.js";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { MidiActivityMixin, MidiActivityMixinSheet, isMidiActivityType, preChatChecks, preTargetingChecks, type MidiActivity } from "./MidiActivityMixin.js";
import { setCastChecks } from "./useRelaunch.js";

export let MidiCastActivity: ReturnType<typeof defineMidiCastActivityClass>;
export let MidiCastSheet: ReturnType<typeof defineMidiCastSheetClass>;

export function setupCastActivity() {
  if (debugEnabled > 0) warn("MidiQOL | CastActivity | setupCastActivity | Called");
  //@ts-expect-error
  MidiCastSheet = defineMidiCastSheetClass(game.system.applications.activity.CastSheet);
  MidiCastActivity = defineMidiCastActivityClass(GameSystemConfig.activityTypes.cast.documentClass as Activity);
  adoptActivityType("cast", MidiCastActivity, MidiCastSheet);
  setCastChecks(async (activity, usage, dialog, message) => !isMidiActivityType(activity) || castPreChecks(activity, usage, dialog, message));
}
let defineMidiCastSheetClass = (baseClass: any) => {
  return class MidiCastSheet extends MidiActivityMixinSheet(baseClass) {
  }
}

let defineMidiCastActivityClass =  <T extends Activity>(ActivityClass: T) => {
  return class MidiCastActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.CAST", ...super.LOCALIZATION_PREFIXES];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        midiTitle: "midi-qol.CAST.Title.one",
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiCastSheet,
        usage: {
          /*
           * No `chatCard`. Supplying one keeps the activity on dnd5e's legacy content path — the
           * system renders the template into `message.content` and `MidiUsageMessageData`'s own
           * template short-circuits on it, so the card face never runs. Deprecated in dnd5e 6.0 and
           * removed in 6.2 (`activity/mixin.mjs#legacyUsageContent`) regardless. See AttackActivity.
           */
          dialog: ActivityClass.metadata.usage.dialog,
        },
      }, { inplace: false, insertKeys: true, insertValues: true });







    
  }
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

