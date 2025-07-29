import { AnyObject } from "fvtt-types/utils";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { asyncHooksCall } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export let MidiCastActivity: ReturnType<typeof defineMidiCastActivityClass>;
export let MidiCastSheet: ReturnType<typeof defineMidiCastSheetClass>;

export function setupCastActivity() {
  if (debugEnabled > 0) warn("MidiQOL | CastActivity | setupCastActivity | Called");
  //@ts-expect-error
  MidiCastSheet = defineMidiCastSheetClass(game.system.applications.activity.CastSheet);
  MidiCastActivity = defineMidiCastActivityClass(GameSystemConfig.activityTypes.cast.documentClass as Activity);
  if (ReplaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eCast"] = GameSystemConfig.activityTypes.cast;
    GameSystemConfig.activityTypes.cast = { documentClass: MidiCastActivity };
  } else {
    GameSystemConfig.activityTypes["midiCast"] = { documentClass: MidiCastActivity };
  }
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
        title: configSettings.activityNamePrefix ? "midi-qol.CAST.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiCastSheet,
        usage: {
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
          dialog: ActivityClass.metadata.usage.dialog,
        },
      }, { inplace: false, insertKeys: true, insertValues: true });

    async use(usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig) {
      // @ts-expect-error
      return ActivityClass.prototype.use.bind(this)(usage, dialog, message);
    }

    get possibleOtherActivity() {
      return false;
    }

    get isSelfTriggerableOnly() {
      return false;
    }

    get isTriggerableActivity() {
      return true;
    }
    
    get forcedTargetConfirmation() {
      return "never";
    }
  }
}
