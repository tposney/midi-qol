import { AnyMutableObject } from "fvtt-types/utils";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, i18n, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export let MidiHealActivity: ReturnType<typeof defineMidiHealActivityClass>;
export let MidiHealSheet: ReturnType<typeof defineMidiHealSheetClass>;

export function setupHealActivity() {
  if (debugEnabled > 0) warn("MidiQOL | HealActivity | setupHealActivity | Called");
  //@ts-expect-error
  MidiHealSheet = defineMidiHealSheetClass(game.system.applications.activity.HealSheet);
  MidiHealActivity = defineMidiHealActivityClass(GameSystemConfig.activityTypes.heal.documentClass as Activity);
  if (ReplaceDefaultActivities) {
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
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
          actions: {
            rollHealing: MidiHealActivity.#rollHealing
          }
        },
      }, { inplace: false, insertKeys: true, insertValues: true })

    static #rollHealing(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      return this.rollDamage({event, workflow}, {}, {});
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
    
    async rollDamage(config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      config.midiOptions ??= {};
      config.midiOptions.fastForwardHeal ??= game.user?.isGM ? configSettings.gmAutoFastForwardDamage : ["all", "damage"].includes(configSettings.autoFastForward);
      config.midiOptions.fastForwardDamage ??= game.user?.isGM ? configSettings.gmAutoFastForwardDamage : ["all", "damage"].includes(configSettings.autoFastForward);
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