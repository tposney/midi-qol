import { debugEnabled, geti18nOptions, i18n, warn } from "../../midi-qol.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { MidiSaveActivity } from "./SaveActivity.js";

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
function getSceneTargets() {
  if (!canvas?.tokens) return [];
  const controlledTokens: Token[] | undefined = canvas?.tokens?.controlled;
  let targets: Token[] | undefined = controlledTokens?.filter(t => t.actor);
  //@ts-expect-error getActiveTokens should actually be an array of tokens - not just linked and not document
  if (!targets?.length && game.user?.character) targets = game.user?.character?.getActiveTokens(false, false);
  return targets;
}
let defineMidiCheckActivityClass = (ActivityClass: any) => {
  return class MidiCheckActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "DND5E.SAVE", "DND5E.CHECK", "midi-qol.CHECK"];
    static supermetadata = super.metadata;
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.CHECK.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiCheckSheet,
        usage: {
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
          actions: {
            // rollCheck: this.#rollCheck, // CheckActivity.metadata.usage.actions.rollCheck,
            rollDamage: MidiSaveActivity.metadata.usage.actions.rollDamage
          }
        },
      }, { inplace: false, insertKeys: true, invsertValues: true })

    static defineSchema() {
      const { StringField, ArrayField, BooleanField, SchemaField, ObjectField } = foundry.data.fields;
      //@ts-expect-error
      const dataModels = game.system.dataModels;
      const { ActivationField: ActivationField, CreatureTypeField, CurrencyTemplate, DamageData,
        DamageField, DurationField, MovementField, RangeField, RollConfigField, SensesField,
        SourceField, TargetField, UsesField } = dataModels.shared

      const schema = {
        ...super.defineSchema(),
        damage: new SchemaField({
          onSave: new StringField({name: "onSave", initial: "half"}),
          parts: new ArrayField(new DamageField())
        }),
        // WIP
        // saveDisplay: new StringField({initial: "default"}),
      };
      return schema;
    }

    static async #rollCheck(event, target, message) {
      const targets = getSceneTargets();
      if (!targets?.length) ui.notifications?.warn("DND5E.ActionWarningNoToken", { localize: true });
      let { ability, dc, skill, tool } = target.dataset;
      dc = parseInt(dc);
      //@ts-expect-error
      let item = this.item;
      //@ts-expect-error
      let check = this.check;
      const data: any = { event, targetValue: Number.isFinite(dc) ? dc : check.dc.value };

      if (targets) for (const token of targets) {
        data.speaker = ChatMessage.getSpeaker({ scene: canvas?.scene ?? undefined, token: token.document });
        if (skill) {
          const actor: Actor | null = token.actor;
          if (!actor) return;
          // @ts-expect-error no dnd5e-types
          await actor.rollSkill(skill, { ...data, ability });
        } else if (tool) {
          const checkData = { ...data, ability };
          if ((item.type === "tool") && !check.associated.size) {
            checkData.bonus = item.system.bonus;
            checkData.prof = item.system.prof;
            checkData.item = item;
          }
          const actor: Actor | null = token.actor;
          if (!actor) return;
          // @ts-expect-error no dnd5e-types
          await actor.rollToolCheck(tool, checkData);
        } else {
          const actor: Actor | null = token.actor;
          if (!actor) return;
          // @ts-expect-error no dnd5e-types
          await actor.rollAbilityTest(ability, data);
        }
      }
    }
    get possibleOtherActivity() {
      return true;
    }
    async rollDamage(config={}, dialog={}, message={}) {
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
      }, [{value: "default", label: i18n("Default")}]);
      return context;
    }
  }
}