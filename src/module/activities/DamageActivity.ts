import { adoptActivityType } from "./graft.js";
import { registerCardActions } from "./cardActions.js";
import { AnyMutableObject } from "fvtt-types/utils";
import { Activity } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export let MidiDamageActivity: ReturnType<typeof defineMidiDamageActivityClass>;
export let MidiDamageSheet: ReturnType<typeof defineMidiDamageSheetClass>;

export function setupDamageActivity() {
  if (debugEnabled > 0) warn("MidiQOL | DamageActivity | setupDamageActivity | Called");
  //@ts-expect-error
  MidiDamageSheet = defineMidiDamageSheetClass(game.system.applications.activity.DamageSheet);
  MidiDamageActivity = defineMidiDamageActivityClass(GameSystemConfig.activityTypes.damage.documentClass as Activity);
  adoptActivityType("damage", MidiDamageActivity, MidiDamageSheet);
  registerCardActions(["damage"], {
    rollDamage: cardRollDamage
  });
}

let defineMidiDamageActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiDamageActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        midiTitle: "midi-qol.DAMAGE.Title.one",
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiDamageSheet,
        usage: {
          /*
           * No `chatCard`. Supplying one keeps the activity on dnd5e's legacy content path — the
           * system renders the template into `message.content` and `MidiUsageMessageData`'s own
           * template short-circuits on it, so the card face never runs. Deprecated in dnd5e 6.0 and
           * removed in 6.2 (`activity/mixin.mjs#legacyUsageContent`) regardless. See AttackActivity.
           */
        }
      }, { inplace: false, insertKeys: true, insertValues: true });


    

  }
}

export function defineMidiDamageSheetClass(baseClass: any) {
  return class MidiDamageSheet extends MidiActivityMixinSheet(baseClass) {};
}

function cardRollDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  activity.rollDamage({ event, workflow }, {}, {});
}

