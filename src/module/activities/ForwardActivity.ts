import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { replaceDefaultActivities, configSettings } from "../settings.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export let MidiForwardActivity: ReturnType<typeof defineMidiForwardActivityClass>;
export let MidiForwardSheet: ReturnType<typeof defineMidiForwardSheetClass>;

export function setupForwardActivity() {
  if (debugEnabled > 0) warn("MidiQOL | ForwardActivity | setupForwardActivity | Called");
  //@ts-expect-error
  MidiForwardSheet = defineMidiForwardSheetClass(game.system.applications.activity.ForwardSheet);
  MidiForwardActivity = defineMidiForwardActivityClass(GameSystemConfig.activityTypes.forward.documentClass as Activity);
  if (replaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eForward"] = GameSystemConfig.activityTypes.forward;
    GameSystemConfig.activityTypes.forward = { documentClass: MidiForwardActivity };
  } else {
    GameSystemConfig.activityTypes["midiForward"] = { documentClass: MidiForwardActivity };
  }
}
let defineMidiForwardSheetClass = (baseClass: any) => {
  return class MidiForwardSheet extends MidiActivityMixinSheet(baseClass) {
    // Forward has no time/targeting - keep dnd5e's narrower activation part, which registers only the partials it uses.
    static PARTS = {
      ...super.PARTS,
      activation: baseClass.PARTS.activation,
    };
  }
}

let defineMidiForwardActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiForwardActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.FORWARD", ...super.LOCALIZATION_PREFIXES];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.FORWARD.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiForwardSheet,
        usage: {
          /*
           * No `chatCard`. Supplying one keeps the activity on dnd5e's legacy content path — the
           * system renders the template into `message.content` and `MidiUsageMessageData`'s own
           * template short-circuits on it, so the card face never runs. Deprecated in dnd5e 6.0 and
           * removed in 6.2 (`activity/mixin.mjs#legacyUsageContent`) regardless. See AttackActivity.
           */
        },
      }, { inplace: false, insertKeys: true, insertValues: true });

    get possibleOtherActivity() {
      return false;
    }

    /** @override */
    async use(usage: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      const usageConfig = foundry.utils.mergeObject({
        cause: {
          activity: this.relativeUUID
        },
        consume: {
          resources: false,
          spellSlot: false
        }
      }, usage);

      // @ts-expect-error no dnd5e-types
      const activity = this.item.system.activities.get(this.activity.id);
      if (!activity) ui.notifications?.error("DND5E.FORWARD.Warning.NoActivity", { localize: true });
      return activity?.use(usageConfig, dialog, message);
    }
    get isSelfTriggerableOnly() {
      return false;
    }

    get isTriggerableActivity() {
      return false;
    }

    get forcedTargetConfirmation() {
      return "never";
    }

    async _triggerSubsequentActions(config, results) {
    }
  }
}
