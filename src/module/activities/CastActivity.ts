import { registerMidiActivityType } from "../utils.js";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { replaceDefaultActivities, configSettings } from "../settings.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";

export let MidiCastActivity: ReturnType<typeof defineMidiCastActivityClass>;
export let MidiCastSheet: ReturnType<typeof defineMidiCastSheetClass>;

export function setupCastActivity() {
  if (debugEnabled > 0) warn("MidiQOL | CastActivity | setupCastActivity | Called");
  //@ts-expect-error
  MidiCastSheet = defineMidiCastSheetClass(game.system.applications.activity.CastSheet);
  MidiCastActivity = defineMidiCastActivityClass(GameSystemConfig.activityTypes.cast.documentClass as Activity);
  if (replaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eCast"] = GameSystemConfig.activityTypes.cast;
    GameSystemConfig.activityTypes.cast = { documentClass: MidiCastActivity };
  } else {
    registerMidiActivityType("midiCast", MidiCastActivity, "cast");
  }
}
let defineMidiCastSheetClass = (baseClass: any) => {
  return class MidiCastSheet extends MidiActivityMixinSheet(baseClass) {
  }
}

let defineMidiCastActivityClass =  <T extends Activity>(ActivityClass: T) => {
  return class MidiCastActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.CAST", ...super.LOCALIZATION_PREFIXES];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.CAST.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiCastSheet,
        usage: {
          /*
           * No `chatCard`. Supplying one keeps the activity on dnd5e's legacy content path — the
           * system renders the template into `message.content` and `MidiUsageMessageData`'s own
           * template short-circuits on it, so the card face never runs. Deprecated in dnd5e 6.0 and
           * removed in 6.2 (`activity/mixin.mjs#legacyUsageContent`) regardless. See AttackActivity.
           */
          dialog: ActivityClass.metadata.usage.dialog,
        },
      }, { inplace: false, insertKeys: true, insertValues: true });

    /** Resolve the effective activation type for Cast activities.
     *  1. If activation.override is set, use the Cast activity's own activation type.
     *  2. Otherwise, use the linked spell's first usable activity's activation type.
     *  3. Fall back to the parent item's activation type.
     */
    get effectiveActivationType(): string | undefined {
      // @ts-expect-error activation.override exists on dnd5e activities but not typed
      if (this.activation?.override) return this.activation.type;
      const spell = this.cachedSpell;
      if (spell) {
        const activities = spell.system?.activities;
        const activityList = (activities instanceof Collection) ? activities.contents : Object.values(activities ?? {});
        const spellActivity = activityList.find((a: any) => a.canUse) ?? activityList[0];
        if (spellActivity?.activation?.type) return spellActivity.activation.type;
      }
      // @ts-expect-error item.system.activation not typed
      return this.item?.system?.activation?.type ?? this.activation?.type;
    }

    async use(usage: ActivityUseConfiguration = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      if (!this.item.isEmbedded || !this.item.isOwner || !this.canUse) {
        // @ts-expect-error
        return ActivityClass.prototype.use.bind(this)(usage, dialog, message);
      }

      usage.midiOptions ??= {};
      usage.midiOptions.workflowOptions ??= {};
      usage.midiOptions.proceedChecks ??= {};

      // Create a temporary workflow so pre-checks (hooks, macros, reaction/bonus enforcement) can run
      const speaker = ChatMessage.getSpeaker({ actor: this.item.actor });
      const tempWorkflow = new Workflow(this.actor ?? null, this, speaker, null, { storeWorkflow: false });
      usage.workflow = tempWorkflow;

      try {
        // Run preTargetingChecks (incapacitated, preTargeting hooks/macros)
        if (!await this.preTargetingChecks(usage, dialog, message)) return false;

        // Run preChatChecks for the Cast activity (hooks, macros, reaction/bonus enforcement)
        // Skip spell component checks — those apply to the spell, not the Cast activity
        if (!await this.preChatChecks(usage, dialog, message, { checkComponents: false })) return false;

        // Extract reaction/bonus action state determined by preChatChecks
        const castUsesReaction = tempWorkflow.itemUsesReaction;
        const castUsesBonusAction = tempWorkflow.itemUsesBonusAction;

        // Clean up the temporary workflow before delegating to dnd5e CastActivity
        Workflow.removeWorkflow(tempWorkflow.id);
        delete usage.workflow;

        // Tell the downstream spell activity's preChatChecks to skip reaction/bonus re-checking
        usage.midiOptions.proceedChecks.checkReaction = false;
        usage.midiOptions.proceedChecks.checkBonusAction = false;

        // Pass Cast activity's enforcement results so the spell workflow can mark them as used
        usage.midiOptions.workflowOptions.castUsesReaction = castUsesReaction;
        usage.midiOptions.workflowOptions.castUsesBonusAction = castUsesBonusAction;
      } catch (err) {
        Workflow.removeWorkflow(tempWorkflow.id);
        delete usage.workflow;
        throw err;
      }
      // Delegate to dnd5e CastActivity.use() which fetches/creates the cached spell and calls spell.use()
      // @ts-expect-error
      return ActivityClass.prototype.use.bind(this)(usage, dialog, message);
    }

    prepareFinalData(rollData: any) {
      super.prepareFinalData(rollData);
      // dnd5e handles CastActivity overrides via an enchantment effect on the cached spell
      // (see getSpellChanges/getCachedSpellData) — no need to copy spell values onto the
      // CastActivity here. The spell's own workflow uses the spell's activity data directly.
    }

    get possibleOtherActivity() {
      return false;
    }

    get isSelfTriggerableOnly() {
      return false;
    }

    get isTriggerableActivity() {
      return true;
    }
    
    get forcedTargetConfirmation() {
      return "never";
    }
    async _triggerSubsequentActions(config, results) {
    }
  }
}
