import { adoptActivityType } from "./graft.js";
import { registerCardActions } from "./cardActions.js";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, warn, i18n, GameSystemConfig } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export let MidiSaveActivity: ReturnType<typeof defineMidiSaveActivityClass>;
export let MidiSaveSheet: ReturnType<typeof defineMidiSaveSheetClass>;

export function setupSaveActivity() {
  if (debugEnabled > 0) warn("MidiQOL | SaveActivity | setupSaveActivity | Called");
  //@ts-expect-error
  MidiSaveSheet = defineMidiSaveSheetClass(game.system.applications.activity.SaveSheet);
  MidiSaveActivity = defineMidiSaveActivityClass(GameSystemConfig.activityTypes.save.documentClass as Activity);
  adoptActivityType("save", MidiSaveActivity, MidiSaveSheet);
  // Localization.localizeDataModel(MidiSaveActivity);
  registerCardActions(["save"], {
    rollDamage: cardRollDamage
  });
}

let defineMidiSaveActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiSaveActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "DND5E.DAMAGE", "midi-qol.SAVE"];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        midiTitle: "midi-qol.SAVE.Title.one",
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiSaveSheet,
        usage: {
          /*
           * No `chatCard`. Supplying one keeps the activity on dnd5e's legacy content path — the
           * system renders the template into `message.content` and `MidiUsageMessageData`'s own
           * template short-circuits on it, so the card face never runs. Deprecated in dnd5e 6.0 and
           * removed in 6.2 (`activity/mixin.mjs#legacyUsageContent`) regardless. See AttackActivity.
           */
          actions: {
            // Currently needed to tag the request id for midi-qol to pick up chat card saves as being for the current activity
          }
        },
      }, { inplace: false, overwrite: true, insertKeys: true, insertValues: true });




    async _triggerSubsequentActions(config, results) {
    }
    
  }
}

let defineMidiSaveSheetClass = (baseClass: any) => {
  return class MidiSaveSheet extends MidiActivityMixinSheet(baseClass) {
    static PARTS = {
      ...super.PARTS,
      effect: {
        template: "modules/midi-qol/templates/activity/save-effect.hbs",
        templates: [
          ...super.PARTS.effect.templates,
          "modules/midi-qol/templates/activity/parts/save-extras.hbs",
          "modules/midi-qol/templates/activity/parts/save-damage.hbs"
        ]

      }
    };

    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions = {
      ...super.DEFAULT_OPTIONS,
      classes: ["save-activity", "damage-activity"]
    }
    async _prepareContext(options) {
      await this.activity.prepareData({});
      const context = await super._prepareContext(options);
      context.FriendlySaveOptions = [
        { value: "default", label: i18n("midi-qol.SAVE.friendlySave.default") },
        { value: "friendlySuccess", label: i18n("midi-qol.SAVE.friendlySave.friendlySuccess") },
        { value: "friendlyFail", label: i18n("midi-qol.SAVE.friendlySave.friendlyFail") },
      ];
      return context;
    }
  }
}

export function cardRollDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  return activity.rollDamage({ event, workflow }, {}, {});
}

