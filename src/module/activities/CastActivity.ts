import { speakerFor } from "../utils.js";
import { adoptActivityType } from "./graft.js";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { setCastChecks } from "./useRelaunch.js";

export let MidiCastActivity: ReturnType<typeof defineMidiCastActivityClass>;
export let MidiCastSheet: ReturnType<typeof defineMidiCastSheetClass>;

export function setupCastActivity() {
  if (debugEnabled > 0) warn("MidiQOL | CastActivity | setupCastActivity | Called");
  //@ts-expect-error
  MidiCastSheet = defineMidiCastSheetClass(game.system.applications.activity.CastSheet);
  MidiCastActivity = defineMidiCastActivityClass(GameSystemConfig.activityTypes.cast.documentClass as Activity);
  adoptActivityType("cast", MidiCastActivity, MidiCastSheet);
  setCastChecks(async (activity, usage, dialog, message) => !isCheckedCast(activity) || castPreChecks(activity, usage, dialog, message));
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

    /** Resolve the effective activation type for Cast activities.
     *  1. If activation.override is set, use the Cast activity's own activation type.
     *  2. Otherwise, use the linked spell's first usable activity's activation type.
     *  3. Fall back to the parent item's activation type.
     */
    get effectiveActivationType(): string | undefined {
      // @ts-expect-error activation.override exists on dnd5e activities but not typed
      if (this.activation?.override) return this.activation.type;
      const spell = this.cachedSpell;
      if (spell) {
        const activities = spell.system?.activities;
        const activityList = (activities instanceof Collection) ? activities.contents : Object.values(activities ?? {});
        const spellActivity = activityList.find((a: any) => a.canUse) ?? activityList[0];
        if (spellActivity?.activation?.type) return spellActivity.activation.type;
      }
      // @ts-expect-error item.system.activation not typed
      return this.item?.system?.activation?.type ?? this.activation?.type;
    }






    
  }
}

/** A Cast activity as midi uses it: its pre-checks are midi's (MidiActivityMixin) */
interface CheckedCastActivity extends Activity {
  preTargetingChecks(usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean>;
  preChatChecks(usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, options?: object): Promise<boolean>;
}

function isCheckedCast(activity: Activity): activity is CheckedCastActivity {
  return typeof (activity as Partial<CheckedCastActivity>).preTargetingChecks === "function"
    && typeof (activity as Partial<CheckedCastActivity>).preChatChecks === "function";
}

/**
 * midi's checks before a Cast activity hands its use to the spell (M14: were an override of Cast's `use`; run from
 * `dnd5e.preUseLinkedSpell` through the restart, useRelaunch.ts): the hooks, macros and reaction/bonus action
 * enforcement of the Cast activity itself, on a temporary workflow. The spell's own workflow then marks the reaction
 * or bonus action as used and skips checking them again. False: the use stops.
 */
export async function castPreChecks(activity: CheckedCastActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean> {
  if (!activity.item.isEmbedded || !activity.item.isOwner || !activity.canUse) return true;
  usage.midiOptions ??= {};
  usage.midiOptions.workflowOptions ??= {};
  usage.midiOptions.proceedChecks ??= {};
  const speaker = speakerFor({ actor: activity.item.actor });
  const tempWorkflow = new Workflow(activity.actor ?? null, activity, speaker, null, { storeWorkflow: false });
  usage.workflow = tempWorkflow;
  try {
    if (!await activity.preTargetingChecks(usage, dialog, message)) return false;
    // Spell component checks are the spell's, not the Cast activity's
    if (!await activity.preChatChecks(usage, dialog, message, { checkComponents: false })) return false;
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

