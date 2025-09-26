import { Activity } from "../../globals.js";
import { debugEnabled, GameSystemConfig, i18n, i18nFormat, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { replaceDefaultActivities, configSettings } from "../settings.js";
import { getTokenDocument } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import type { ActivityUseConfiguration } from "../../globals.js";

export let MidiTransformActivity: ReturnType<typeof defineMidiTransformActivityClass>;
export let MidiTransformSheet: ReturnType<typeof defineMidiTransformSheetClass>;

export function setupTransformActivity() {
  if (debugEnabled > 0) warn("MidiQOL | TransformActivity | setupTransformActivity | Called");
  //@ts-expect-error
  MidiTransformSheet = defineMidiTransformSheetClass(game.system.applications.activity.TransformSheet);
  MidiTransformActivity = defineMidiTransformActivityClass(GameSystemConfig.activityTypes.transform.documentClass as Activity);
  if (replaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eTransform"] = GameSystemConfig.activityTypes.Transform;
    GameSystemConfig.activityTypes.transform = { documentClass: MidiTransformActivity };
  } else {
    GameSystemConfig.activityTypes["midiTransform"] = { documentClass: MidiTransformActivity };
  }
  //@ts-expect-error
  Hooks.on("dnd5e.TransformToken", (activity, profile, tokenData, options) => {
    if (!activity.friendlyTransform) return;
    const caster = getTokenDocument(activity.actor);
    if (caster) tokenData.disposition = caster.disposition;
  });
}
let defineMidiTransformSheetClass = (baseClass: any) => {
  return class MidiTransformSheet extends MidiActivityMixinSheet(baseClass) {
  }
}

let defineMidiTransformActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiTransformActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.TRANSFORM", ...super.LOCALIZATION_PREFIXES];
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.TRANSFORM.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiTransformSheet,
        usage: {
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
          dialog: ActivityClass.metadata.usage.dialog
        },
      }, { inplace: false, insertKeys: true, insertValues: true });

    async _finalizeUsage(config, results) {
      // Nasty kludge since TransformActivity._finalizeUsage does not wait result.message.update
      const profile = this.profiles.find(p => p._id === config.transform?.profile);
      if (profile) {
        const uuid = !this.transform.mode ? profile.uuid : await this.queryActor(profile);
        if (uuid) {
          if (results.message instanceof ChatMessage) await results.message.setFlag("dnd5e", "transform.uuid", uuid);
          else foundry.utils.setProperty(results.message, "flags.dnd5e.transform.uuid", uuid);
        }
      }
      // since we are skipping the TransformActivity _finalizeUsage call, the grandparent _finalizeUsage needs to be called
      const grandParent = Object.getPrototypeOf(ActivityClass);
      await grandParent.prototype._finalizeUsage.call(this, config, results);
      return this.transformActor(config, results.message);
    }

    static async #transformActor(event, target, message) {

    }
    async transformActor(config: ActivityUseConfiguration, message: ChatMessage) {
      const targets = Array.from(config.midiOptions?.targetsToUse ?? config.workflow?.targets ?? game.user?.targets ?? new Set());
      if (!targets.length) {
        ui.notifications?.warn("DND5E.ActionWarningNoToken", { localize: true });
        return;
      }

      const profileId = message.getFlag("dnd5e", "transform.profile");
      const profile = this.profiles.find(p => p._id === profileId) || this.profiles[0];
      const uuid = message.getFlag("dnd5e", "transform.uuid") ?? await this.queryActor(profile);
      const source = await fromUuid(uuid);
      if (!source) {
        ui.notifications?.warn("DND5E.TRANSFORM.Warning.SourceActor", { localize: true });
        return;
      }

      const transformedActorUuids: string[] = [];
      for (const token of targets) {
        //@ts-expect-error
        const actor = token instanceof Actor ? token : token.actor;
        if (actor.isPolymorphed) {
          ui.notifications?.warn(i18nFormat("midi-qol.TRANSFORM.AlreadyTransformed", { name: actor.name }));
          continue;
        }
        const transformedTokens: TokenDocument[] | TokenDocument | undefined= await actor.transformInto(source, this.settings);
        if (transformedTokens instanceof Array && transformedTokens[0]?.actor?.uuid) 
          transformedActorUuids.push(transformedTokens[0].actor.uuid);
        else if (transformedTokens instanceof TokenDocument && transformedTokens.actor?.uuid)
          transformedActorUuids.push(transformedTokens.actor.uuid);
        // TODO: Create message for transformed actors
      }
      if (config.workflow) config.workflow.transformedActorUuids = transformedActorUuids;
    }
    static defineSchema() {
      return {
        ...super.defineSchema()
      }
    }
    get possibleOtherActivity() {
      return false;
    }
    get isTriggerableActivity() {
      return true;
    }

    get selfTriggerableOnly() {
      return false;
    }

    async _triggerSubsequentActions(config, results) {
    }
  }
}
