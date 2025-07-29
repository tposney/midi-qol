import { Activity } from "../../globals.js";
import { debugEnabled, GameSystemConfig, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { getTokenDocument } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export let MidiSummonActivity: ReturnType<typeof defineMidiSummonActivityClass>;
export let MidiSummonSheet: ReturnType<typeof defineMidiSummonSheetClass>;

export function setupSummonActivity() {
  if (debugEnabled > 0) warn("MidiQOL | SummonActivity | setupSummonActivity | Called");
  //@ts-expect-error
  MidiSummonSheet = defineMidiSummonSheetClass(game.system.applications.activity.SummonSheet);
  MidiSummonActivity = defineMidiSummonActivityClass(GameSystemConfig.activityTypes.summon.documentClass as Activity);
  if (ReplaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eSummon"] = GameSystemConfig.activityTypes.summon;
    GameSystemConfig.activityTypes.summon = { documentClass: MidiSummonActivity };
  } else {
    GameSystemConfig.activityTypes["midiSummon"] = { documentClass: MidiSummonActivity };
  }
  //@ts-expect-error
  Hooks.on("dnd5e.summonToken", (activity, profile, tokenData, options) => {
    if (!activity.friendlySummon) return;
    const caster = getTokenDocument(activity.actor);
    if (caster) tokenData.disposition = caster.disposition;
  });
}
let defineMidiSummonSheetClass = (baseClass: any) => {
  return class MidiSummonSheet extends MidiActivityMixinSheet(baseClass) {
  }
}

let defineMidiSummonActivityClass = <T extends Activity>(ActivityClass: T) => {
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

    static defineSchema() {
      return {
        ...super.defineSchema(),
        friendlySummon: new foundry.data.fields.BooleanField({ initial: false, name: "friendlySummon", required: false })
      }
    }
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
