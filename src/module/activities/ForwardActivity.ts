import { adoptActivityType } from "./graft.js";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { configSettings } from "../settings.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export let MidiForwardActivity: ReturnType<typeof defineMidiForwardActivityClass>;
export let MidiForwardSheet: ReturnType<typeof defineMidiForwardSheetClass>;

export function setupForwardActivity() {
  if (debugEnabled > 0) warn("MidiQOL | ForwardActivity | setupForwardActivity | Called");
  //@ts-expect-error
  MidiForwardSheet = defineMidiForwardSheetClass(game.system.applications.activity.ForwardSheet);
  MidiForwardActivity = defineMidiForwardActivityClass(GameSystemConfig.activityTypes.forward.documentClass as Activity);
  adoptActivityType("forward", MidiForwardActivity, MidiForwardSheet);
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
        midiTitle: "midi-qol.FORWARD.Title.one",
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





    async _triggerSubsequentActions(config, results) {
    }
  }
}
