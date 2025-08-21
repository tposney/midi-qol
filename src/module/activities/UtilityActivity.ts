import { AnyMutableObject } from "fvtt-types/utils";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, i18n, warn, error, GameSystemConfig } from "../../midi-qol.js";
import { AugmentedEvent, Workflow } from "../Workflow.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { areMidiKeysPressed, asyncHooksCall, isAutoFastDamage } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { displayDSNForRoll } from "../utils.js";

export let MidiUtilityActivity: ReturnType<typeof defineMidiUtilityActivityClass>;
export let MidiUtilitySheet: ReturnType<typeof defineMidiUtilitySheetClass>;

export function setupUtilityActivity() {
  if (debugEnabled > 0) warn("MidiQOL | UtilityActivity | setupUtilityActivity | Called");
  //@ts-expect-error
  MidiUtilitySheet = defineMidiUtilitySheetClass(game.system.applications.activity.UtilitySheet);

  MidiUtilityActivity = defineMidiUtilityActivityClass(GameSystemConfig.activityTypes.utility.documentClass as Activity);
  if (ReplaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eUtility"] = GameSystemConfig.activityTypes.utility;
    GameSystemConfig.activityTypes.utility = { documentClass: MidiUtilityActivity };
  } else {
    GameSystemConfig.activityTypes["midiUtility"] = { documentClass: MidiUtilityActivity };
  }
}

let defineMidiUtilityActivityClass = <T extends Activity>(ActivityClass: T) => {
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
    static #rollFormula(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;

      return this.rollFormula?.({ event, workflow }, {}, {});
    }

    get possibleOtherActivity() {
      return true;
    }

    get selfTriggerableOnly() {
      return false;
    }

    // @ts-expect-error weird types stuff
    async rollFormula(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) {
      if (debugEnabled > 0)
        warn("UtilityActivity | rollFormula | Called", config, dialog, message);
      config ??= {};
      dialog ??= {};
      message ??= {}
      const workflow = config.workflow as Workflow;
      if (!workflow) {
        const errorMessage = "MidiUtilityActivity | rollFormula | No workflow found";
        error(errorMessage);
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
      if (Object.values(keys).some(k => k)) dialog.configure = this.midiProperties?.forceRollDialog !== "always";
      else dialog.configure ??= !config.midiOptions.fastForward || this.midiProperties?.forceRollDialog === "always";
      if (workflow.rollOptions?.rollToggle) dialog.configure = !!!dialog.configure;
      const rollToggle = areMidiKeysPressed(config.event as AugmentedEvent, "RollToggle");
      if (workflow) workflow.rollOptions.rollToggle = rollToggle;
      if (rollToggle) dialog.configure = !!!dialog.configure;
      message.create ??= false;
      let result = await super.rollFormula!(config, dialog, message) as Roll[] | undefined;
      if (result && workflow.workflowOptions?.formulaDSN !== false) await displayDSNForRoll(result[0], "formulaD20");

      if (config.midiOptions.updateWorkflow !== false && workflow) {
        if (result) await workflow.setUtilityRolls(result);
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