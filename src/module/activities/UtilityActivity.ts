import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, i18n, warn, error, GameSystemConfig } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { replaceDefaultActivities, configSettings } from "../settings.js";
import { heldKeys } from "../lib/rollKeys.js";
import { areMidiKeysPressed, callActivityHooks, isAutoFastForward } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { displayDSNForRoll } from "../utils.js";

export let MidiUtilityActivity: ReturnType<typeof defineMidiUtilityActivityClass>;
export let MidiUtilitySheet: ReturnType<typeof defineMidiUtilitySheetClass>;

export function setupUtilityActivity() {
  if (debugEnabled > 0) warn("MidiQOL | UtilityActivity | setupUtilityActivity | Called");
  //@ts-expect-error
  MidiUtilitySheet = defineMidiUtilitySheetClass(game.system.applications.activity.UtilitySheet);

  MidiUtilityActivity = defineMidiUtilityActivityClass(GameSystemConfig.activityTypes.utility.documentClass as Activity);
  if (replaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eUtility"] = GameSystemConfig.activityTypes.utility;
    GameSystemConfig.activityTypes.utility = { documentClass: MidiUtilityActivity };
  } else {
    GameSystemConfig.activityTypes["midiUtility"] = { documentClass: MidiUtilityActivity };
  }
}

let defineMidiUtilityActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiUtilityActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.UTILITY", ...super.LOCALIZATION_PREFIXES];

    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.UTILITY.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiUtilitySheet,
        usage: {
          /*
           * No `chatCard`. Supplying one keeps the activity on dnd5e's legacy content path — the
           * system renders the template into `message.content` and `MidiUsageMessageData`'s own
           * template short-circuits on it, so the card face never runs. Deprecated in dnd5e 6.0 and
           * removed in 6.2 (`activity/mixin.mjs#legacyUsageContent`) regardless. See AttackActivity.
           */
          actions: {
            rollFormula: MidiUtilityActivity.#rollFormula
          }
        }
      }, { inplace: false, insertKeys: true, insertValues: true });

      static defineSchema() {
        const { BooleanField } = foundry.data.fields;
  
        const schema = {
          ...super.defineSchema(),
          otherActivityAsParentType: new BooleanField({
            name: "otherActivityAsParentType",
            initial: true,
            required: false,
            label: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.label"),
            hint: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.hint")
          }),
        };
        return schema;
      }
    static #rollFormula(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;

      return this.rollFormula?.({ event, workflow }, {}, {});
    }

    get possibleOtherActivity() {
      return true;
    }

    async _triggerSubsequentActions(config, results) {
    }
    
    async rollFormula(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) {
      if (debugEnabled > 0)
        warn("UtilityActivity | rollFormula | Called", config, dialog, message);
      config ??= {};
      dialog ??= {};
      message ??= {}
      const workflow = config.workflow as Workflow;
      if (!workflow) {
        const errorMessage = "MidiUtilityActivity | rollFormula | No workflow found";
        error(errorMessage);
        TroubleShooter.recordError(new Error("No Workflow Found"), errorMessage);
        return;
      }
      config.midiOptions ??= {};
      config.midiOptions.fastForwardDamage ??= isAutoFastForward("damage", { workflow })
      if (debugEnabled > 0) {
        warn("MidiUtilityActivity | rollFormula | Called", config, dialog, message);
      }
      if (await callActivityHooks(this, "midi-qol.preFormulaRoll", workflow) === false) {
        console.warn("midi-qol | UtilityActivity | Formula roll blocked via pre-hook");
        return;
      }

      const keys = heldKeys(config.event);
      if (keys.normal || keys.advantage || keys.disadvantage) dialog.configure = this.midiProperties?.forceDamageDialog !== "always";
      else if (dialog.configure === undefined) {
          switch (this.midiProperties?.forceDamageDialog) {
            case "always":
              dialog.configure = true;
              break;
            case "never":
              dialog.configure = false;
              break;
            default:
              dialog.configure = !(config.midiOptions?.fastForwardDamage ?? config.workflow?.workflowOptions.fastForwardDamage ?? false);
          }
      }
      if (workflow.rollOptions?.rollToggle) dialog.configure = !!!dialog.configure;
      const rollToggle = areMidiKeysPressed(config.event, "RollToggle");
      if (workflow) workflow.rollOptions.rollToggle = rollToggle;
      if (rollToggle) dialog.configure = !!!dialog.configure;
      message.create ??= false;
      let result = await super.rollFormula!(config, dialog, message) as Roll[] | undefined;
      if (result && workflow.workflowOptions?.formulaDSN !== false) await displayDSNForRoll(result[0], "formulaD20", undefined, undefined, workflow?.actor);

      if (config.midiOptions.updateWorkflow !== false && workflow) {
        if (result) await workflow.setUtilityRolls(result);
        if (workflow.suspended)
          workflow.resume(result ? "utilityRolled" : undefined);
      }
      return result;
    }
    async _midiUsageContext(message) {
      const context = await super._midiUsageContext(message);
      context.hasRollFormula = true; // TODO fix this when able to do a proper card !!this.roll?.formula;
      return context;
    }
  }
}

export function defineMidiUtilitySheetClass(baseClass: any) {
  return class MidiUtilitySheet extends MidiActivityMixinSheet(baseClass) {};
}