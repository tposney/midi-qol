import { AnyMutableObject } from "fvtt-types/utils";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, warn, i18n, GameSystemConfig } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { replaceDefaultActivities, configSettings, safeGetGameSetting } from "../settings.js";
import { getTokenDocument, isAutoFastForward, registerMidiActivityType } from "../utils.js";
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
    registerMidiActivityType("midiSave", MidiSaveActivity, "save");
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
          /*
           * No `chatCard`. Supplying one keeps the activity on dnd5e's legacy content path — the
           * system renders the template into `message.content` and `MidiUsageMessageData`'s own
           * template short-circuits on it, so the card face never runs. Deprecated in dnd5e 6.0 and
           * removed in 6.2 (`activity/mixin.mjs#legacyUsageContent`) regardless. See AttackActivity.
           */
          actions: {
            rollDamage: MidiSaveActivity.#rollDamage,
            rollSave: MidiSaveActivity.#rollSave, // Having this means needing to track the dnd5e SaveActivity.#rollSave changes
            // Currently needed to tag the request id for midi-qol to pick up chat card saves as being for the current activity
          }
        },
      }, { inplace: false, overwrite: true, insertKeys: true, insertValues: true });

    static defineSchema() {
      const { StringField, ArrayField, BooleanField, SchemaField } = foundry.data.fields;

      //@ts-expect-error
      const dataModels = game.system.dataModels;
      const { DamageField } = dataModels.shared
      const FormulaField = dataModels.fields.FormulaField;

      return {
        ...super.defineSchema(),
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
      }
    }

    static #rollDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.forDamageButton(message);
      if (workflow === false) return;
      const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
      return activity.rollDamage({ event, workflow }, {}, {});
    }

    static async #rollSave(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.findWorkflow(message?.uuid);
      const activity = workflow ? workflow.activityFor(this) : this;
      // return ActivityClass.#rollSave.bind(this)(event, target, message);
      // Can't call ActivityClass.#rollSave.bind(this)(event, target, message) as it's private
      // As dnd5e 6: the card's targets (honouring its targeted/selected toggle) and the clicked button's data from
      // the card, which is all a grouped (dropdown) button carries.
      const targets: Array<foundry.canvas.placeables.Token.Implementation | TokenDocument.Implementation | Actor.Implementation> =
        // @ts-expect-error no dnd5e-types
        [...(message?.system?.evaluatedTargets ?? getSceneTargets())];
      if (!targets.length && game.user?.character) targets.push(game.user?.character);
      if (!targets.length) ui.notifications?.warn("DND5E.ActionWarningNoToken", { localize: true });
      // @ts-expect-error no dnd5e-types
      const button: Record<string, string | number | undefined> = message?.system?.getButton?.(target)?.dataset ?? target.dataset;
      const dc = (button.dc === undefined || button.dc === "") ? NaN : Number(button.dc);
      for (const token of targets) {
        const actor = token instanceof Actor ? token : token.actor;
        const tokenDocument = token instanceof foundry.canvas.placeables.Token ? token.document : token instanceof TokenDocument ? token : null;
        const speaker = ChatMessage.getSpeaker({ actor, scene: canvas.scene, token: tokenDocument });
        const message: AnyMutableObject = { data: { speaker } };
        // if (!actor?.hasPlayerOwner && workflow) message.create = false - this breaks save checking from chat card
        if (token instanceof foundry.canvas.placeables.Token) foundry.utils.setProperty(message, "flags.midi-qol.requestId", token.document.uuid);
        else foundry.utils.setProperty(message, "flags.midi-qol.requestId", token?.uuid);
        // Its row on the card, whoever the save message's speaker is (an actor with no token, another of its tokens)
        const targetUuid = tokenDocument?.uuid ?? getTokenDocument(actor)?.uuid;
        if (targetUuid) foundry.utils.setProperty(message, "data.flags.midi-qol.targetUuid", targetUuid);
        // v14 message-mode strings (CONFIG.ChatMessage.modes keys) so the value matches the roll dialog's options
        if (["none", "allShow"].includes(configSettings.autoCheckSaves) || actor?.hasPlayerOwner) message.rollMode = safeGetGameSetting("core", "messageMode");
        else message.rollMode = "gm";
        if (!game.user?.isGM) {
          if (configSettings.playerRollSaves === "noneDialogPublic") message.rollMode = "public";
          else if (configSettings.playerRollSaves === "noneDialogPrivate") message.rollMode = "gm";
          else if (configSettings.playerRollSaves === "noneDialogSelf") message.rollMode = "self";
          else if (configSettings.playerRollSaves === "noneDialogBlind") message.rollMode = "blind";
          else message.rollMode = safeGetGameSetting("core", "messageMode");
        }


        //@ts-expect-error no dnd5e types
        await actor?.rollSavingThrow({
          event,
          workflow,
          //@ts-expect-error this has been bound to an activity
          ability: button.ability ?? activity.save.ability.first(),
          //@ts-expect-error this has been bound to an activity
          target: configSettings.autoCheckSaves === "whisper" ? undefined : (Number.isFinite(dc) ? dc : activity.save.dc.value)
        }, {}, message);
      }
    }

    use(config: ActivityUseConfiguration = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      return super.use(config, dialog, message);
    }

    get possibleOtherActivity() {
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