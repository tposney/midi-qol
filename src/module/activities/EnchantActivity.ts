import { registerMidiActivityType } from "../utils.js";
import { Activity } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { replaceDefaultActivities, configSettings } from "../settings.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export let MidiEnchantActivity: ReturnType<typeof defineMidiEnchantActivityClass>;
export let MidiEnchantSheet: ReturnType<typeof defineMidiEnchantSheetClass>;

export function setupEnchantActivity() {
  if (debugEnabled > 0) warn("MidiQOL | EnchantActivity | setupEnchantActivity | Called");
  //@ts-expect-error
  MidiEnchantSheet = defineMidiEnchantSheetClass(game.system.applications.activity.EnchantSheet);
  MidiEnchantActivity = defineMidiEnchantActivityClass(GameSystemConfig.activityTypes.enchant.documentClass as Activity);
  if (replaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eEnchant"] = GameSystemConfig.activityTypes.enchant;
    GameSystemConfig.activityTypes.enchant = { documentClass: MidiEnchantActivity };
  } else {
    registerMidiActivityType("midiEnchant", MidiEnchantActivity, "enchant");
  }
}

let defineMidiEnchantActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiEnchantActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.ENCHANT", ...super.LOCALIZATION_PREFIXES];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.ENCHANT.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiEnchantSheet,
        usage: {
          dialog: ActivityClass.metadata.usage.dialog,
        },
      }, { inplace: false, insertKeys: true, insertValues: true })

    get possibleOtherActivity() { 
      return false;
    }
    get isTriggerableActivity() {
      return true;
    }

    async _triggerSubsequentActions(config, results) {
      // for enchantment activities we do want to support the dnd5e default behaviour
      await super._triggerSubsequentActions(config, results);
    }
  }
}

// The effect part is dnd5e's own: midi's copy of the template included a partial dnd5e 6 removed.
export function defineMidiEnchantSheetClass(baseClass: any) {
  return class MidiEnchantSheet extends MidiActivityMixinSheet(baseClass) {};
}