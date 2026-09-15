import { AnyMutableObject } from "fvtt-types/utils";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { replaceDefaultActivities, configSettings } from "../settings.js";
import { isAutoFastForward } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export let MidiHealActivity: ReturnType<typeof defineMidiHealActivityClass>;
export let MidiHealSheet: ReturnType<typeof defineMidiHealSheetClass>;

export function setupHealActivity() {
  if (debugEnabled > 0) warn("MidiQOL | HealActivity | setupHealActivity | Called");
  //@ts-expect-error
  MidiHealSheet = defineMidiHealSheetClass(game.system.applications.activity.HealSheet);
  MidiHealActivity = defineMidiHealActivityClass(GameSystemConfig.activityTypes.heal.documentClass as Activity);
  if (replaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eHeal"] = GameSystemConfig.activityTypes.heal;
    GameSystemConfig.activityTypes.heal = { documentClass: MidiHealActivity };
  } else {
    GameSystemConfig.activityTypes["midiHeal"] = { documentClass: MidiHealActivity };
  }
}

let defineMidiHealActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiHealActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.HEAL", ...super.LOCALIZATION_PREFIXES];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.HEAL.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiHealSheet,
        usage: {
          /*
           * No `chatCard`. Supplying one keeps the activity on dnd5e's legacy content path — the
           * system renders the template into `message.content` and `MidiUsageMessageData`'s own
           * template short-circuits on it, so the card face never runs. Deprecated in dnd5e 6.0 and
           * removed in 6.2 (`activity/mixin.mjs#legacyUsageContent`) regardless. See AttackActivity.
           */
          actions: {
            rollHealing: MidiHealActivity.#rollHealing
          }
        },
      }, { inplace: false, insertKeys: true, insertValues: true })

    static #rollHealing(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      return this.rollDamage({event, workflow}, {}, {});
    }
    get possibleOtherActivity() { 
      return true;
    }
    
    async rollDamage(config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      config.midiOptions ??= {};
      config.midiOptions.fastForwardHeal ??= isAutoFastForward("damage");
      config.midiOptions.fastForwardDamage ??= isAutoFastForward("damage");
      return super.rollDamage(config, dialog, message);
    }
    
    /*
    getDamageConfig(config: any ={}) {
      if ( !this.healing.formula ) return foundry.utils.mergeObject({ rolls: [] }, config);
  
      const rollConfig:any = foundry.utils.mergeObject({ critical: { allow: false }, scaling: 0 }, config);
      const rollData = this.getRollData();
      rollConfig.rolls = [this._processDamagePart(this.healing, rollConfig, rollData)].concat(config.rolls ?? []);
  
      return rollConfig;
    }
    */
    async _triggerSubsequentActions(config, results) {
    }
  }
}

export function defineMidiHealSheetClass(baseClass: any) {
  return class MidiHealSheet extends MidiActivityMixinSheet(baseClass) {
    static PARTS = {
      ...super.PARTS,
      effect: {
        template: "modules/midi-qol/templates/activity/heal-effect.hbs",
        templates: [
          ...super.PARTS.effect.templates
        ]
      }
    };
  }
}