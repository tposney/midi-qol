import { templates } from "handlebars";
import { debugEnabled, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { asyncHooksCall, evalActivationCondition } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet, MidiConditionField } from "./MidiActivityMixin.js";
export var MidiOverTimeActivity;
export var MidiOverTimeSheet;

// Not currently used
export function setupOvertimeActivity() {
  if (debugEnabled > 0) warn("MidiQOL | ForwardActivity | setupOverTimeActivity | Called");
  //@ts-expect-error
  const GameSystemConfig = game.system.config;
  //@ts-expect-error
  MidiOverTimeSheet = defineMidiOverTimeSheetClass(game.system.applications.activity.ForwardSheet);
  MidiOverTimeActivity = defineMidiOverTimeActivityClass(GameSystemConfig.activityTypes.forward.documentClass);
  GameSystemConfig.activityTypes.overTime = { documentClass: MidiOverTimeActivity };
}
let defineMidiOverTimeSheetClass = (baseClass: any) => {
  return class MidiOverTimeSheet extends MidiActivityMixinSheet(baseClass) {
    static PARTS = {
      ...super.PARTS,
      identity: {
        template: "systems/dnd5e/templates/activity/forward-identity.hbs",
        templates: super.PARTS.identity.templates
      },
      activation: {
        template: "systems/dnd5e/templates/activity/forward-activation.hbs",
        templates: [
          "systems/dnd5e/templates/activity/parts/activity-consumption.hbs"
        ]
      },
      effect: {
        template: "modules/midi-qol/templates/activity/overtime-effect.hbs",
        templates: [
          "modules/midi-qol/templates/activity/parts/overtime-extras.hbs",
        ],
      }
    };
    async _prepareEffectContext(context) {
      const activity = this.activity;
      context = await super._prepareEffectContext(context);
      context.turnChoiceOptions = [{ value: "start", label: i18n("midi-qol.OVERTIME.FIELDS.turnChoice.start") }, { value: "end", label: i18n("midi-qol.OVERTIME.FIELDS.turnChoice.end") }];
      return context;
    }
  }

}

let defineMidiOverTimeActivityClass = (ActivityClass: any) => {
  return class MidiOverTimeActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "midi-qol.OVERTIME"];
    static defineSchema() {
      const { StringField, ArrayField, BooleanField, SchemaField, ObjectField, NumberField, DocumentIdField } = foundry.data.fields;

      const schema = {
        ...super.defineSchema(),
        turnChoice: new StringField({ blank: false, choices: ["start", "end"], default: "start" }),
        saveRemoves: new BooleanField({ initial: true }),
        removeConditionBeforeActivity: new BooleanField({ initial: false }),
        removeConditionText: new MidiConditionField({ name: "removeCondition", initial: "" }),
      };
      return schema;
    }
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: "midi-qol.OVERTIME.Title.one",
        dnd5eTitle: "midi-qol.OVERTIME.Title.one",
        sheetClass: MidiOverTimeSheet,
        usage: {
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
        },
      }, { inplace: false, insertKeys: true, insertValues: true });

    get possibleOtherActivity() {
      return false;
    }
    
    get isTriggerableActivity() {
      return false;
    }
    async confirmCanProceed(config, dialog, message): Promise<boolean> {
      if (this.useCondition) { // reactions condition evaluation is handled elsewhere
        if (!(await evalActivationCondition(this.workflow, this.useCondition, this.targets.first(), { async: true }))) {
          return this.removeWorkflow();
        }
      }
      return super.confirmCanProceed(config, dialog, message);
    }
  }
}
