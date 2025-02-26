import { debugEnabled, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { asyncHooksCall } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export var MidiCastActivity;
export var MidiCastSheet;

export function setupCastActivity() {
  if (debugEnabled > 0) warn("MidiQOL | CastActivity | setupCastActivity | Called");
  //@ts-expect-error
  const GameSystemConfig = game.system.config;
  //@ts-expect-error
  MidiCastSheet = defineMidiCastSheetClass(game.system.applications.activity.CastSheet);
  MidiCastActivity = defineMidiCastActivityClass(GameSystemConfig.activityTypes.cast.documentClass);
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

let defineMidiCastActivityClass = (ActivityClass: any) => {
  return class MidiCastActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "midi-qol.CAST"];
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

    async use(config?: any, dialog?: any, message?: any) {
      // if (config.midiOptions?.workflowOptions?.targetConfirmation) delete config.midiOptions.workflowOptions.targetConfirmation;
      return super.use(config, dialog, message);
    }

    get possibleOtherActivity() {
      return false;
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
  }
}
