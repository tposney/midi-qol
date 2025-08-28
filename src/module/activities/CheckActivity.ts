import { AnyMutableObject } from "fvtt-types/utils";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { replaceDefaultActivities, autoCheckSavesOptions, configSettings } from "../settings.js";
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
  if (replaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eAttack"] = GameSystemConfig.activityTypes.attack;
    GameSystemConfig.activityTypes.check = { documentClass: MidiCheckActivity };
  } else {
    GameSystemConfig.activityTypes["midiCheck"] = { documentClass: MidiCheckActivity };
  }
}

let defineMidiCheckActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiCheckActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = [ ...super.LOCALIZATION_PREFIXES, "midi-qol.SAVE", "midi-qol.CHECK", "DND5E.DAMAGE"];
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
      const FormulaField = dataModels.fields.FormulaField;

      const schema = {
        ...super.defineSchema(),
        otherActivityId: new StringField({ name: "otherActivity", initial: "none" }),
        otherActivityAsParentType: new BooleanField({
          name: "otherActivityAsParentType",
          initial: true,
          required: false,
          label: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.label"),
          hint: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.hint")
        }),
        damage: new SchemaField({
          onSave: new StringField({
            initial: "half",
            default: "half",
            name: "onSave",
            hint: i18n("DND5E.SAVE.FIELDS.damage.onSave.hint"),
            label: i18n("DND5E.SAVE.FIELDS.damage.onSave.label")
          }),
          parts: new ArrayField(new DamageField()),
          critical: new SchemaField({
            allow: new BooleanField(),
            bonus: new FormulaField(),
          }),
        }),
        friendlySave: new StringField({ initial: "default", name: "friendlySave" })
        // WIP
        // saveDisplay: new StringField({initial: "default"}),
      };
      return schema;
    }

    static async #rollCheck(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      let workflow = message ? Workflow.getWorkflow(message.uuid) : null;
      if (workflow) workflow.activity = this;
      // return ActivityClass.#rollCheck return ActivityClass.#rollCheck.bind(this)(event, target);
      // Can't do this as it's private
      const targets: Array<foundry.canvas.placeables.Token.Implementation | Actor.Implementation> = getSceneTargets();
      if (!targets.length && game.user?.character) targets.push(game.user?.character);
      if (!targets.length) ui.notifications?.warn("DND5E.ActionWarningNoToken", { localize: true });
      let { ability, dc: dcStr, skill, tool } = target.dataset;
      let dc = parseInt(dcStr ?? "0");
      const check = this.check;
      const item = this.item;
      const rollData: AnyMutableObject = { event, target: Number.isFinite(dc) ? dc : check!.dc.value };
      if (ability && (ability in globalThis.dnd5e.config.abilities)) rollData.ability = ability;

      for (const token of targets) {
        const actor = token instanceof Actor ? token : token.actor;
        const speaker = ChatMessage.getSpeaker({ actor, scene: canvas.scene, token: token instanceof Token ? token.document : null });
        const messageData: AnyMutableObject = { data: { speaker } };
        if (!actor) continue;
        if (["none", "allShow"].includes(configSettings.autoCheckSaves) || actor?.hasPlayerOwner) messageData.rollMode = game.settings.get("core", "rollMode");
        else messageData.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
        if (!game.user?.isGM) {
          if (configSettings.playerRollSaves === "noneDialogPublic") messageData.rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
          else if (configSettings.playerRollSaves === "noneDialogPrivate") messageData.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
          else if (configSettings.playerRollSaves === "noneDialogSelf") messageData.rollMode = CONST.DICE_ROLL_MODES.SELF;
          else if (configSettings.playerRollSaves === "noneDialogBlind") messageData.rollMode = CONST.DICE_ROLL_MODES.BLIND;
          else messageData.rollMode = game.settings.get("core", "rollMode");
        }
        //@ts-expect-error no dnd5e types
        if (skill) await actor.rollSkill({ ...rollData, skill }, {}, messageData);
        else if (tool) {
          rollData.tool = tool;
          // @ts-expect-error no dnd5e-types
          if ((item.type === "tool") && !check!.associated.size) {
            // @ts-expect-error no dnd5e-types
            rollData.bonus = item.system.bonus;
            // @ts-expect-error no dnd5e-types
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

    async _triggerSubsequentActions(config, results) {
    }

    async rollDamage(config: RollProcessConfig, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      message = foundry.utils.mergeObject({
        "data.flags.dnd5e.roll": {
          damageOnSave: this.damage?.onSave
        }
      }, message);
      return super.rollDamage(config, dialog, message);
    }

    prepareFinalData(rollData) {
      super.prepareFinalData(rollData);
    }

    _usageChatButtons(message) {
      const buttons: any[] = [];
      if (this.damage!.parts.length) buttons.push({
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
        { value: "default", label: i18n("midi-qol.SAVE.FriendlySave.Default") },
        { value: "friendlySuccess", label: i18n("midi-qol.SAVE.FriendlySave.FriendlySuccess") },
        { value: "friendlyFail", label: i18n("midi-qol.SAVE.FriendlySave.FriendlyFail") },
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