import { debugEnabled, warn } from "../../midi-qol.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export var MidiSaveActivity;
export var MidiSaveSheet;

export function setupSaveActivity() {
  if (debugEnabled > 0) warn("MidiQOL | SaveActivity | setupSaveActivity | Called");
  //@ts-expect-error
  const GameSystemConfig = game.system.config;
  //@ts-expect-error
  MidiSaveSheet = defineMidiSaveSheetClass(game.system.applications.activity.SaveSheet);
  MidiSaveActivity = defineMidiSaveActivityClass(GameSystemConfig.activityTypes.save.documentClass);
  if (ReplaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eSave"] = GameSystemConfig.activityTypes.save;
    GameSystemConfig.activityTypes.save = { documentClass: MidiSaveActivity };
  } else {
    GameSystemConfig.activityTypes["midiSave"] = { documentClass: MidiSaveActivity };
  }
}

let defineMidiSaveActivityClass = (ActivityClass: any) => {
  return class MidiSaveActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "DND5E.DAMAGE", "midi-qol.SAVE", "midi-qol.DAMAGE"];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.SAVE.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiSaveSheet,
        usage: {
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
        },
      }, { inplace: false, insertKeys: true, insertValues: true });

    static defineSchema() {
      const { StringField, ArrayField, BooleanField, SchemaField, ObjectField } = foundry.data.fields;
      //@ts-expect-error
      const dataModels = game.system.dataModels;
      const { ActivationField: ActivationField, CreatureTypeField, CurrencyTemplate, DamageData,
        DamageField, DurationField, MovementField, RangeField, RollConfigField, SensesField,
        SourceField, TargetField, UsesField } = dataModels.shared
      const FormulaField = dataModels.fields.FormulaField;

      return {
        ...super.defineSchema(),
        damage: new SchemaField({
          onSave: new StringField(),
          parts: new ArrayField(new DamageField()),
          critical: new SchemaField({
            allow: new BooleanField(),
            bonus: new FormulaField(),
          }),
        })
      }
    }

    get possibleOtherActivity() {
      return true;
    }
    getDamageConfig(config = {}) {
      const rollConfig = super.getDamageConfig(config);

      rollConfig.critical ??= {};
      rollConfig.critical.allow = this.damage.critical.allow;
      rollConfig.critical.bonusDamage = this.damage.critical.bonus;

      return rollConfig;
    }
    async rollDamage(config: any = {}, dialog = {}, message = {}) {
      message = foundry.utils.mergeObject({
        "data.flags.dnd5e.roll": {
          damageOnSave: this.damage.onSave
        }
      }, message);
      config.midiOptions ??= {};
      config.midiOptions.fastForwardDamage ??= game.user?.isGM ? configSettings.gmAutoFastForwardDamage : ["all", "damage"].includes(configSettings.autoFastForward);
      return super.rollDamage(config, dialog, message);
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
          "modules/midi-qol/templates/activity/parts/save-damage.hbs",
        ]
      }
    };

    static DEFAULT_OPTIONS = {
      ...super.DEFAULT_OPTIONS,
      classes: ["save-activity", "damage-activity"]
    }
    async _prepareContext(options) {
      await this.activity.prepareData({});
      const returnvalue = await super._prepareContext(options);
      return returnvalue;
    }
  }
}