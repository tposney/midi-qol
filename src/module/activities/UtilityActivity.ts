import { debugEnabled, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { areMidiKeysPressed, asyncHooksCall, isAutoFastDamage } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export var MidiUtilityActivity;
export var MidiUtilitySheet;

export function setupUtilityActivity() {
  if (debugEnabled > 0) warn("MidiQOL | UtilityActivity | setupUtilityActivity | Called");
  //@ts-expect-error
  const GameSystemConfig = game.system.config;
  //@ts-expect-error
  MidiUtilitySheet = defineMidiUtilitySheetClass(game.system.applications.activity.UtilitySheet);

  MidiUtilityActivity = defineMidiUtilityActivityClass(GameSystemConfig.activityTypes.utility.documentClass);
  if (ReplaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eUtility"] = GameSystemConfig.activityTypes.utility;
    GameSystemConfig.activityTypes.utility = { documentClass: MidiUtilityActivity };
  } else {
    GameSystemConfig.activityTypes["midiUtility"] = { documentClass: MidiUtilityActivity };
  }
}

let defineMidiUtilityActivityClass = (ActivityClass: any) => {
  return class MidiUtilityActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.UTILITY", ...super.LOCALIZATION_PREFIXES];

    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.UTILITY.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiUtilitySheet,
        usage: {
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
          actions: {
            rollFormula: MidiUtilityActivity.#rollFormula
          }
        }
      }, { inplace: false, insertKeys: true, insertValues: true });

      static defineSchema() {
        const { StringField, ArrayField, BooleanField, SchemaField, ObjectField } = foundry.data.fields;
        //@ts-expect-error
        const dataModels = game.system.dataModels;
        const { ActivationField: ActivationField, CreatureTypeField, CurrencyTemplate, DamageData,
          DamageField, DurationField, MovementField, RangeField, RollConfigField, SensesField,
          SourceField, TargetField, UsesField } = dataModels.shared
  
        const schema = {
          ...super.defineSchema(),
          otherActivityId: new StringField({ name: "otherActivity", initial: "none" }),
        };
        return schema;
      }
    static #rollFormula(event, target, message) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;

      //@ts-expect-error
      return this.rollFormula({ event, workflow }, {}, {});
    }

    get possibleOtherActivity() {
      return true;
    }

    get selfTriggerableOnly() {
      return false;
    }

    async rollFormula(config, dialog, message: any = {}) {
      if (debugEnabled > 0)
        warn("UtilityActivity | rollFormula | Called", config, dialog, message);
      config ??= {};
      dialog ??= {};
      message ??= {}
      const workflow = config.workflow;
      if (!workflow) {
        const errorMessage = "MidiUtilityActivity | rollFormula | No workflow found";
        console.error(errorMessage);
        TroubleShooter.recordError(new Error("No Workflow Found"), errorMessage);
        return;
      }
      config.midiOptions ??= {};
      config.midiOptions.fastForward ??= isAutoFastDamage(workflow)
      if (debugEnabled > 0) {
        warn("MidiUtilityActivity | rollFormula | Called", config, dialog, message);
      }
      if (await asyncHooksCall("midi-qol.preFormulaRoll", workflow) === false
        || await asyncHooksCall(`midi-qol.preFormulaRoll.${this.item.uuid}`, workflow) === false
        || await asyncHooksCall(`midi-qol.preFormulaRoll.${this.uuid}`, workflow) === false) {
        console.warn("midi-qol | UtilityActivity | Formula roll blocked via pre-hook");
        return;
      }

      //@ts-expect-error
      const areKeysPressed = game.system.utils.areKeysPressed;
      const keys = {
        normal: areKeysPressed(config.event, "skipDialogNormal") || areKeysPressed(config.event, "skipDialogAdvantage") || areKeysPressed(config.event, "skipDialogDisadvantage")
      };
      if (Object.values(keys).some(k => k)) dialog.configure = this.midiProperties.forceDialog;
      else dialog.configure ??= !config.midiOptions.fastForward || this.midiProperties.forceDialog;
      if (workflow?.rollOptions?.rollToggle) dialog.configure = !!!dialog.configure;
      const rollToggle = areMidiKeysPressed(config.event, "RollToggle");
      if (workflow) workflow.rollOptions.rollToggle = rollToggle;
      if (rollToggle) dialog.configure = !!!dialog.configure;
      message.create ??= false;
      let result = await super.rollFormula(config, dialog, message);
      if (result && workflow && config.midiOptions.updateWorkflow !== false) await workflow.setUtilityRolls(result);

      // result = await postProcessUtilityRoll(this, config, result);
      if (config.midiOptions.updateWorkflow !== false && workflow) {
        workflow.utilityRolls = result;
        if (workflow.suspended)
          workflow.unSuspend.bind(workflow)({ utilityRolls: result });
      }
      return result;
    }
    async _usageChatContext(message) {
      const context = await super._usageChatContext(message);
      context.hasRollFormula = true; // TODO fix this when able to do a proper card !!this.roll?.formula;
      return context;
    }
  }
}

export function defineMidiUtilitySheetClass(baseClass: any) {
  return class MidiUtilitySheet extends MidiActivityMixinSheet(baseClass) {
    static PARTS = {
      ...super.PARTS,
      effect: {
        template: "modules/midi-qol/templates/activity/utility-effect.hbs",
        templates: [
          ...super.PARTS.effect.templates
        ]
      }
    };
  }
}