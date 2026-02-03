import { AnyMutableObject } from "fvtt-types/utils";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, warn, i18n, GameSystemConfig } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { replaceDefaultActivities, configSettings } from "../settings.js";
import { isAutoFastForward } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { getSceneTargets } from "./activityHelpers.js";

export let MidiSaveActivity: ReturnType<typeof defineMidiSaveActivityClass>;
export let MidiSaveSheet: ReturnType<typeof defineMidiSaveSheetClass>;

export function setupSaveActivity() {
  if (debugEnabled > 0) warn("MidiQOL | SaveActivity | setupSaveActivity | Called");
  //@ts-expect-error
  MidiSaveSheet = defineMidiSaveSheetClass(game.system.applications.activity.SaveSheet);
  MidiSaveActivity = defineMidiSaveActivityClass(GameSystemConfig.activityTypes.save.documentClass as Activity);
  if (replaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eSave"] = GameSystemConfig.activityTypes.save;
    GameSystemConfig.activityTypes.save = { documentClass: MidiSaveActivity };
  } else {
    GameSystemConfig.activityTypes["midiSave"] = { documentClass: MidiSaveActivity };
  }
  // Localization.localizeDataModel(MidiSaveActivity);
}

let defineMidiSaveActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiSaveActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "DND5E.DAMAGE", "midi-qol.SAVE"];
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
          critical: new SchemaField({
            allow: new BooleanField(),
            bonus: new FormulaField(),
          }),
          parts: new ArrayField(new DamageField()),
        }),
        friendlySave: new StringField({ initial: "default", name: "friendlySave" }),
        // WIP
        // saveDisplay: new StringField({initial: "default"})
      }
    }

    static #rollDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      return this.rollDamage({ event, workflow }, {}, {});
    }

    static async #rollSave(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      // return ActivityClass.#rollSave.bind(this)(event, target, message);
      // Can't call ActivityClass.#rollSave.bind(this)(event, target, message) as it's private
      const targets: Array<foundry.canvas.placeables.Token.Implementation | Actor.Implementation> = getSceneTargets();
      if (!targets.length && game.user?.character) targets.push(game.user?.character);
      if (!targets.length) ui.notifications?.warn("DND5E.ActionWarningNoToken", { localize: true });
      const dc = parseInt(target.dataset.dc ?? "0");
      for (const token of targets) {
        const actor = token instanceof Actor ? token : token.actor;
        const speaker = ChatMessage.getSpeaker({ actor, scene: canvas.scene, token: token instanceof Token ? token.document : null });
        const message: AnyMutableObject = { data: { speaker } };
        // if (!actor?.hasPlayerOwner && workflow) message.create = false - this breaks save checking from chat card
        if (token instanceof foundry.canvas.placeables.Token) foundry.utils.setProperty(message, "flags.midi-qol.requestId", token.document.uuid);
        else foundry.utils.setProperty(message, "flags.midi-qol.requestId", token?.uuid);
        if (["none", "allShow"].includes(configSettings.autoCheckSaves) || actor?.hasPlayerOwner) message.rollMode = game.settings.get("core", "rollMode");
        else message.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
        if (!game.user?.isGM) {
          if (configSettings.playerRollSaves === "noneDialogPublic") message.rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
          else if (configSettings.playerRollSaves === "noneDialogPrivate") message.rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
          else if (configSettings.playerRollSaves === "noneDialogSelf") message.rollMode = CONST.DICE_ROLL_MODES.SELF;
          else if (configSettings.playerRollSaves === "noneDialogBlind") message.rollMode = CONST.DICE_ROLL_MODES.BLIND;
          else message.rollMode = game.settings.get("core", "rollMode");
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

    use(config: ActivityUseConfiguration = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
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

    async _triggerSubsequentActions(config, results) {
    }
    
    getDamageConfig(config: RollProcessConfig = {}) {
      const rollConfig = super.getDamageConfig(config);

      rollConfig.critical ??= {};
      rollConfig.critical.allow = this.damage?.critical.allow;
      rollConfig.critical.bonusDamage = this.damage?.critical.bonus;

      return rollConfig;
    }
    async rollDamage(config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      message = foundry.utils.mergeObject({
        "data.flags.dnd5e.roll": {
          damageOnSave: this.damage?.onSave
        }
      }, message);
      config.midiOptions ??= {};
      config.midiOptions.fastForwardDamage ??= isAutoFastForward("damage");
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
          "modules/midi-qol/templates/activity/parts/save-extras.hbs",
          "modules/midi-qol/templates/activity/parts/save-damage.hbs"
        ]

      }
    };

    static DEFAULT_OPTIONS = {
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