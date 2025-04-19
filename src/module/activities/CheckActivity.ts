import { debugEnabled, geti18nOptions, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { MidiSaveActivity } from "./SaveActivity.js";
import { getSceneTargets } from "./activityHelpers.js";

export var MidiCheckActivity;
export var MidiCheckSheet;
var CheckActivity;
export function setupCheckActivity() {
  if (debugEnabled > 0) warn("MidiQOL | CheckActivity | setupCheckActivity | Called");
  //@ts-expect-error
  const GameSystemConfig = game.system.config;
  CheckActivity = GameSystemConfig.activityTypes.check.documentClass;
  //@ts-expect-error
  MidiCheckSheet = defineMidiCheckSheetClass(game.system.applications.activity.CheckSheet);
  MidiCheckActivity = defineMidiCheckActivityClass(CheckActivity);
  if (ReplaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eAttack"] = GameSystemConfig.activityTypes.attack;
    GameSystemConfig.activityTypes.check = { documentClass: MidiCheckActivity };
  } else {
    GameSystemConfig.activityTypes["midiCheck"] = { documentClass: MidiCheckActivity };
  }
}

let defineMidiCheckActivityClass = (ActivityClass: any) => {
  return class MidiCheckActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["DND5E.SAVE", "DND5E.CHECK", "midi-qol.CHECK", ...super.LOCALIZATION_PREFIXES,];
    static superMetadata = super.metadata;
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.CHECK.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiCheckSheet,
        usage: {
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
          actions: {
            rollCheck: MidiCheckActivity.#rollCheck, // Having this means having to track CheckActivity.#rollCheck code changes
            // Needed so the workflow can be inserted
            rollDamage: MidiSaveActivity.metadata.usage.actions.rollDamage,
          }
        },
      }, { inplace: false, insertKeys: true, insertValues: true })

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
        damage: new SchemaField({
          onSave: new StringField({ name: "onSave", initial: "half" }),
          parts: new ArrayField(new DamageField())
        }),
        // WIP
        // saveDisplay: new StringField({initial: "default"}),
      };
      return schema;
    }

    static async #rollCheck(event, target, message) {
      let workflow = message ? Workflow.getWorkflow(message._uuid) : null;
      if (workflow) workflow.activity = this;
      // return ActivityClass.#rollCheck return ActivityClass.#rollCheck.bind(this)(event, target);
      // Can't do this as it's private
      const targets: Array<Token | Actor> = getSceneTargets();
      if (!targets.length && game.user?.character) targets.push(game.user?.character);
      if (!targets.length) ui.notifications?.warn("DND5E.ActionWarningNoToken", { localize: true });
      let { ability, dc, skill, tool } = target.dataset;
      dc = parseInt(dc);
      //@ts-expect-error this is bound to an activity instance. There are no dnd5e types so make it any
      const check: any = this.check;
      //@ts-expect-error this is bound to an activity instance. There are no dnd5e types so make it any
      const item: any = this.item;
      const rollData: any = { event, target: Number.isFinite(dc) ? dc : check.dc.value };
      if (ability in globalThis.dnd5e.config.abilities) rollData.ability = ability;
      
      for (const token of targets) {
        const actor = token instanceof Actor ? token : token.actor;
        const speaker = ChatMessage.getSpeaker({ actor, scene: canvas?.scene, token: token instanceof Token ? token.document : null });
        const messageData: any = { data: { speaker } };
        if (!actor) continue;
        if (configSettings.autoCheckSaves !== "none") messageData.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
        if (configSettings.autoCheckSaves === "allShow") messageData.rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
        else messageData.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
        if (!game.user?.isGM) {
          if (configSettings.playerRollSaves === "noneDialogPublic") messageData.rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
          else if (configSettings.playerRollSaves === "noneDialogPrivate") messageData.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
          else if (configSettings.playerRollSaves === "noneDialogSelf") messageData.rollMode = CONST.DICE_ROLL_MODES.SELF;
          else if (configSettings.playerRollSaves === "noneDialogBlind") messageData.rollMode = CONST.DICE_ROLL_MODES.BLIND;
        }
        //@ts-expect-error no dnd5e types
        if (skill) await actor.rollSkill({ ...rollData, skill }, {}, messageData);
        else if (tool) {
          rollData.tool = tool;
          if ((item.type === "tool") && !check.associated.size) {
            rollData.bonus = item.system.bonus;
            rollData.prof = item.system.prof;
            rollData.item = item;
          }
          //@ts-expect-error no dnd5e types
          await actor.rollToolCheck(rollData, {}, messageData);
        }
        // @ts-expect-error no dnd5e types
        else await actor.rollAbilityCheck(rollData, {}, messageData);
      }
    }

    get possibleOtherActivity() {
      return true;
    }

    get canUseOtherActivity() {
      return true;
    }
    
    get isSelfTriggerableOnly() {
      return false;
    }

    async rollDamage(config = {}, dialog = {}, message = {}) {
      message = foundry.utils.mergeObject({
        "data.flags.dnd5e.roll": {
          damageOnSave: this.damage.onSave
        }
      }, message);
      return super.rollDamage(config, dialog, message);
    }


    prepareFinalData(rollData) {
      super.prepareFinalData(rollData);
    }

    _usageChatButtons(message) {
      const buttons: any[] = [];
      if (this.damage.parts.length) buttons.push({
        label: i18n("DND5E.Damage"),
        icon: '<i class="fas fa-burst" inert></i>',
        dataset: {
          action: "rollDamage"
        }
      });
      return buttons.concat(super._usageChatButtons(message));
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
          "systems/dnd5e/templates/activity/parts/save-damage.hbs",
          "systems/dnd5e/templates/activity/parts/damage-part.hbs",
          "systems/dnd5e/templates/activity/parts/damage-parts.hbs",
        ]
      }
    };

    async _prepareEffectContext(context) {
      context = await super._prepareEffectContext(context);
      context.onSaveOptions = [
        { value: "none", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.None") },
        { value: "half", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.Half") },
        { value: "full", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.Full") }
      ];
      // WIP
      let autoCheckOptions = foundry.utils.duplicate(geti18nOptions("autoCheckSavesOptions"));
      delete autoCheckOptions["none"];
      context.SaveDisplayOptions = Object.keys(autoCheckOptions).reduce((acc: any, key: string) => {
        acc.push({ value: key, label: autoCheckOptions[key] });
        return acc;
      }, [{ value: "default", label: i18n("Default") }]);
      return context;
    }
  }
}