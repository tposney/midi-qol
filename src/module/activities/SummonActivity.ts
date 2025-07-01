import { debugEnabled, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { asyncHooksCall } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export var MidiSummonActivity;
export var MidiSummonSheet;

export function setupSummonActivity() {
  if (debugEnabled > 0) warn("MidiQOL | SummonActivity | setupSummonActivity | Called");
  //@ts-expect-error
  const GameSystemConfig = game.system.config;
  //@ts-expect-error
  MidiSummonSheet = defineMidiSummonSheetClass(game.system.applications.activity.SummonSheet);
  MidiSummonActivity = defineMidiSummonActivityClass(GameSystemConfig.activityTypes.summon.documentClass);
  if (ReplaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eSummon"] = GameSystemConfig.activityTypes.summon;
    GameSystemConfig.activityTypes.summon = { documentClass: MidiSummonActivity };
  } else {
    GameSystemConfig.activityTypes["midiSummon"] = { documentClass: MidiSummonActivity };
  }
}
let defineMidiSummonSheetClass = (baseClass: any) => {
  return class MidiSummonSheet extends MidiActivityMixinSheet(baseClass) {
  }
}

let defineMidiSummonActivityClass = (ActivityClass: any) => {
  return class MidiSummonActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.SUMMON", ...super.LOCALIZATION_PREFIXES];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.SUMMON.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiSummonSheet,
        usage: {
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
          dialog: ActivityClass.metadata.usage.dialog,
          actions: {
            // placeSummons: MidiSummonActivity.#placeSummons 
            // not doing this as it would require a physical copy of the dnd5e #placeSummons code
            // Downside is that the summons button on the activity card will not create a remove summoned creature effect since there is no workflow looked up
          },
        },
      }, { inplace: false, insertKeys: true, insertValues: true });

    get possibleOtherActivity() {
      return false;
    }
    get isTriggerableActivity() {
      return true;
    }

    get selfTriggerableOnly() {
      return false;
    }
  }
}
