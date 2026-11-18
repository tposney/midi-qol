import { adoptActivityType } from "./graft.js";
import { registerCardActions } from "./cardActions.js";
import { cardRollDamage } from "./SaveActivity.js";
import { AnyMutableObject } from "fvtt-types/utils";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { autoCheckSavesOptions, configSettings, safeGetGameSetting } from "../settings.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { MidiSaveActivity } from "./SaveActivity.js";
import { getSceneTargets } from "./activityHelpers.js";

export let MidiCheckActivity: ReturnType<typeof defineMidiCheckActivityClass>;
export let MidiCheckSheet: ReturnType<typeof defineMidiCheckSheetClass>;

export function setupCheckActivity() {
  if (debugEnabled > 0) warn("MidiQOL | CheckActivity | setupCheckActivity | Called");
  //@ts-expect-error
  MidiCheckSheet = defineMidiCheckSheetClass(game.system.applications.activity.CheckSheet);
  MidiCheckActivity = defineMidiCheckActivityClass(GameSystemConfig.activityTypes.check.documentClass as Activity);
  adoptActivityType("check", MidiCheckActivity, MidiCheckSheet);
  registerCardActions(["check"], {
    rollDamage: cardRollDamage
  });
}

let defineMidiCheckActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiCheckActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = [ ...super.LOCALIZATION_PREFIXES, "midi-qol.SAVE", "midi-qol.CHECK", "DND5E.DAMAGE"];
    static superMetadata = super.metadata;
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        midiTitle: "midi-qol.CHECK.Title.one",
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiCheckSheet,
        usage: {
          /*
           * No `chatCard`. Supplying one keeps the activity on dnd5e's legacy content path — the
           * system renders the template into `message.content` and `MidiUsageMessageData`'s own
           * template short-circuits on it, so the card face never runs. Deprecated in dnd5e 6.0 and
           * removed in 6.2 (`activity/mixin.mjs#legacyUsageContent`) regardless. See AttackActivity.
           */
          actions: {
            // Needed so the workflow can be inserted
          }
        },
      }, { inplace: false, insertKeys: true, insertValues: true })







    async rollDamage(config: RollProcessConfig, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      message = foundry.utils.mergeObject({ "data.system.onSave": this.damage?.onSave ?? null }, message);
      return super.rollDamage(config, dialog, message);
    }

    prepareFinalData(rollData) {
      super.prepareFinalData(rollData);
    }

  }

}

export function defineMidiCheckSheetClass(baseClass: any) {
  return class MidiCheckSheet extends MidiActivityMixinSheet(baseClass) {

    static PARTS = {
      ...super.PARTS,
      effect: {
        template: "modules/midi-qol/templates/activity/check-effect.hbs",
        templates: [
          ...super.PARTS.effect.templates,
          "modules/midi-qol/templates/activity/parts/save-extras.hbs",
          "modules/midi-qol/templates/activity/parts/save-damage.hbs",
          "systems/dnd5e/templates/activity/parts/damage-part.hbs",
          "systems/dnd5e/templates/activity/parts/damage-parts.hbs",
        ]
      }
    };

    async _prepareEffectContext(context) {
      context = await super._prepareEffectContext(context);
      context.FriendlySaveOptions = [
        { value: "default", label: i18n("midi-qol.SAVE.friendlySave.default") },
        { value: "friendlySuccess", label: i18n("midi-qol.SAVE.friendlySave.friendlySuccess") },
        { value: "friendlyFail", label: i18n("midi-qol.SAVE.friendlySave.friendlyFail") },
      ];
      context.onSaveOptions = [
        { value: "none", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.None") },
        { value: "half", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.Half") },
        { value: "full", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.Full") }
      ];
      // WIP
      let autoCheckOptions = foundry.utils.duplicate(autoCheckSavesOptions);
      delete autoCheckOptions["none"];
      context.SaveDisplayOptions = Object.keys(autoCheckOptions).reduce((acc: any, key: string) => {
        acc.push({ value: key, label: autoCheckOptions[key] });
        return acc;
      }, [{ value: "default", label: i18n("Default") }]);
      return context;
    }
  }
}

