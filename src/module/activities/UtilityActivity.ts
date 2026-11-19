import { adoptActivityType } from "./graft.js";
import { registerCardActions } from "./cardActions.js";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, i18n, warn, error, GameSystemConfig } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { heldKeys } from "../lib/rollKeys.js";
import { areMidiKeysPressed, callActivityHooks, isAutoFastForward, setMessageTargets } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { displayDSNForRoll } from "../utils.js";

export let MidiUtilityActivity: ReturnType<typeof defineMidiUtilityActivityClass>;
export let MidiUtilitySheet: ReturnType<typeof defineMidiUtilitySheetClass>;

export function setupUtilityActivity() {
  if (debugEnabled > 0) warn("MidiQOL | UtilityActivity | setupUtilityActivity | Called");
  //@ts-expect-error
  MidiUtilitySheet = defineMidiUtilitySheetClass(game.system.applications.activity.UtilitySheet);

  MidiUtilityActivity = defineMidiUtilityActivityClass(GameSystemConfig.activityTypes.utility.documentClass as Activity);
  adoptActivityType("utility", MidiUtilityActivity, MidiUtilitySheet);
  registerCardActions(["utility"], {
    rollFormula: cardRollFormula
  });
}

let defineMidiUtilityActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiUtilityActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.UTILITY", ...super.LOCALIZATION_PREFIXES];

    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        midiTitle: "midi-qol.UTILITY.Title.one",
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiUtilitySheet,
        usage: {
          /*
           * No `chatCard`. Supplying one keeps the activity on dnd5e's legacy content path — the
           * system renders the template into `message.content` and `MidiUsageMessageData`'s own
           * template short-circuits on it, so the card face never runs. Deprecated in dnd5e 6.0 and
           * removed in 6.2 (`activity/mixin.mjs#legacyUsageContent`) regardless. See AttackActivity.
           */
        }
      }, { inplace: false, insertKeys: true, insertValues: true });

      static defineSchema() {
        const { BooleanField } = foundry.data.fields;
  
        const schema = {
          ...super.defineSchema(),
          otherActivityAsParentType: new BooleanField({
            name: "otherActivityAsParentType",
            initial: true,
            required: false,
            label: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.label"),
            hint: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.hint")
          }),
        };
        return schema;
      }


    
  }
}

export function defineMidiUtilitySheetClass(baseClass: any) {
  return class MidiUtilitySheet extends MidiActivityMixinSheet(baseClass) {};
}

function cardRollFormula(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.findWorkflow(message?.uuid);
  const activity = workflow ? workflow.activityFor(this) : this;

  return activity.rollFormula?.({ event, workflow }, {}, {});
}

