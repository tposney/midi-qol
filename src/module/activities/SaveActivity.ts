import { debugEnabled, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { getSceneTargets } from "./activityHelpers.js";

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
    static LOCALIZATION_PREFIXES = ["DND5E.DAMAGE", "midi-qol.SAVE", "midi-qol.DAMAGE", ...super.LOCALIZATION_PREFIXES];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.SAVE.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiSaveSheet,
        usage: {
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
          actions: {
            rollDamage: MidiSaveActivity.#rollDamage,
            rollSave: MidiSaveActivity.#rollSave, // Having this means needing to track the dnd5e SaveActivity.#rollSave changes
            // Currently needed to tag the request id for midi-qol to pick up chat card saves as being for the current activity
          }
        },
      }, { inplace: false, overwrite: true, insertKeys: true, insertValues: true });

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
        otherActivityId: new StringField({ name: "otherActivity", initial: "" }),
        damage: new SchemaField({
          onSave: new StringField(),
          parts: new ArrayField(new DamageField()),
          critical: new SchemaField({
            allow: new BooleanField(),
            bonus: new FormulaField(),
          }),
        }),
        // WIP
        // saveDisplay: new StringField({initial: "default"})
      }
    }

    static #rollDamage(event, target, message) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      //@ts-expect-error
      return this.rollDamage({event, workflow});
    }

    static async #rollSave(event, target, message) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      // return ActivityClass.#rollSave.bind(this)(event, target, message);
      // Can't call ActivityClass.#rollSave.bind(this)(event, target, message) as it's private
      const targets: Array<Token | Actor> = getSceneTargets();
      if (!targets.length && game.user?.character) targets.push(game.user?.character);
      if (!targets.length) ui.notifications?.warn("DND5E.ActionWarningNoToken", { localize: true });
      const dc = parseInt(target.dataset.dc);
      for (const token of targets) {
        const actor = token instanceof Actor ? token : token.actor;
        const speaker = ChatMessage.getSpeaker({ actor, scene: canvas?.scene, token: token instanceof Token ? token.document : null });
        const message: any = { data: { speaker } };
        // if (!actor?.hasPlayerOwner && workflow) message.create = false - this breaks save checking from chat card
        if (token instanceof Token) foundry.utils.setProperty(message, "flags.midi-qol.requestId", token.document.uuid);
        else foundry.utils.setProperty(message, "flags.midi-qol.requestId", token?.uuid);
        if (["none", "allShow"].includes(configSettings.autoCheckSaves) || actor?.hasPlayerOwner) message.rollMode = game.settings?.get("core", "rollMode");
        else message.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
        if (!game.user?.isGM) {
          if (configSettings.playerRollSaves === "noneDialogPublic") message.rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
          else if (configSettings.playerRollSaves === "noneDialogPrivate") message.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
          else if (configSettings.playerRollSaves === "noneDialogSelf") message.rollMode = CONST.DICE_ROLL_MODES.SELF;
          else if (configSettings.playerRollSaves === "noneDialogBlind") message.rollMode = CONST.DICE_ROLL_MODES.BLIND;
          else message.rollMode = game.settings?.get("core", "rollMode");
        }
        

        //@ts-expect-error no dnd5e types
        await actor?.rollSavingThrow({
          event,
          workflow, 
          //@ts-expect-error this has been bound to an activity
          ability: target.dataset.ability ?? this.save.ability.first(),
          //@ts-expect-error this has been bound to an activity
          target: configSettings.autoCheckSaves === "whisper" ? undefined : (Number.isFinite(dc) ? dc : this.save.dc.value)
        }, {}, message);
      }
    }

    use(config = {}, dialog = {}, message = {}) {
      return super.use(config, dialog, message);
    }

    get possibleOtherActivity() {
      return true;
    }
    get selfTriggerableOnly() {
      return false;
    }
    get canUseOtherActivity() {
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