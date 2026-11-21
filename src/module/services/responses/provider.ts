import type { Activity } from "../../../globals.js";
import { configSettings } from "../../settings.js";
import { debugEnabled, warn } from "../../../midi-qol.js";
import { evalReactionActivationCondition, isActivityType, maxCastLevel, reactionTriggerLabelFor } from "../../utils.js";
import type { ResponseContributor } from "./service.js";
import { TroubleShooter } from "../../apps/TroubleShooter.js";
import { eventDataFor } from "../../lib/entries/responseEvents.js";

/*
 * midi's own reaction contributor: the creature's items with a reaction activity it can use now (attuned, prepared,
 * a slot or uses left, the reaction not spent unless it costs none) whose reaction condition is met (no condition: the
 * attack hit). Moved from utils doReactions (M3 stage 4). Its condition also has `event` and `event` (M15 4f), as an
 * entry's has; the activity is still used on the reacting player's client (its slot, its targets), not as an entry.
 */
export const midiItemReactions: ResponseContributor = {
  async for({ target, usedReaction, triggerType, options, eventId }) {
    if (!target.actor) return [];
    const reactions: Activity[] = [];
    const maxLevel = maxCastLevel(target.actor);
    const items = target.actor.items;
    for (let item of items) {
      // @ts-expect-error no clue when this can happen
      const theItem: Item.Implementation = item instanceof Item ? item : item.baseItem;
      // @ts-expect-error no dnd5e-types
      if (!theItem.system.activities) continue;
      // If the spell is a proxy for a cast ativity skip
      if (!!item.getFlag("dnd5e", "cachedFor")) continue;
      // @ts-expect-error no dnd5e-types
      for (let activity of theItem.system.activities) {
        try {
          const activationType = activity.effectiveActivationType ?? activity.activation?.type;
          if (!activationType?.includes("reaction")) continue;
          // What dnd5e would refuse (a spell under 6.1's antimagic status, its own visibility rules) isn't offered
          if (activity.canUse === false) continue;
          if (activationType !== "reaction") {
            console.warn(`midi-qol | itemReaction | item ${item.name} ${activity.name} has a reaction type of ${activationType} which is deprecated - please update to reaction and reaction conditions`)
          }
          // Item uses a reaction and actor has used a reaction.
          if ((activity.activation?.value ?? 1) > 0 && usedReaction) continue; // TODO can't specify 0 cost reactions in dnd5e 4.x - have to find another way
          // @ts-expect-error no dnd5e-types
          if (!item.system.attuned && item.system.attunement === "required") continue;
          let reactionCondition = activity.reactionCondition;
          // For cast activities, also check the spell's reaction condition from the activity that will be used
          if (isActivityType(activity, "cast") && activity.cachedSpell) {
            const spell = activity.cachedSpell;
            // Get the first usable activity - this is what spell.use() will use
            const spellActivity = spell.system?.activities?.filter((a: any) => a.canUse)?.[0];
            const spellCondition = spellActivity?.reactionCondition || "";
            if (reactionCondition && spellCondition) {
              reactionCondition = `(${reactionCondition}) && (${spellCondition})`;
            } else {
              reactionCondition = reactionCondition || spellCondition;
            }
          }
          // A forward (dnd5e's free casting of a granted spell) is checked as the activity it forwards to (14.6.15)
          // @ts-expect-error no dnd5e-types
          const forwarded = activity.type === "forward" ? theItem.system.activities.get(activity.activity?.id) : undefined;
          if (activity.type === "forward" && !forwarded) continue;
          if (forwarded?.reactionCondition)
            reactionCondition = reactionCondition ? `(${reactionCondition}) && (${forwarded.reactionCondition})` : forwarded.reactionCondition;
          // @ts-expect-error no dnd5e-types
          const isSpell = item.type === "spell";
          if (isSpell) {
            if (configSettings.ignoreSpellReactionRestriction) {
              // Skip all validation for spells when this setting is enabled
              reactions.push(activity);
              continue;
            }
            // Filter out unprepared spells
            // @ts-expect-error no dnd5e-types
            if (item.system.prepared === 0 && item.system.method === "spell") continue;
            // Filter spells that can't be cast due to no available slots of required level
            // @ts-expect-error no dnd5e-types
            if (!forwarded && item.system.level > 0 && !["atwill", "innate"].includes(item.system.method) && item.system.level > maxLevel) continue;
          }

          // Use dnd5e's consumption checks for all items/spells
          // As dnd5e's forward use: the forwarded activity pays the forward's consumption, not its own
          const checked = forwarded ?? activity;
          const config = checked._prepareUsageConfig(forwarded
            ? { create: false, cause: { activity: activity.relativeUUID }, consume: { resources: false, spellSlot: false } }
            : { create: false });
          if (isSpell) foundry.utils.setProperty(config, "consume.spellSlot", false);
          const canUse = await checked._prepareUsageUpdates(config, { returnErrors: true });
          if (canUse instanceof Array) continue; // insufficient uses available
          // If no condition is specified, default to requiring isHit
          if (!reactionCondition) {
            reactionCondition = 'reaction === "isHit"';
          }
          // The event and its event (M15 4f: attack total and AC, the save, the damage worked out) as entries see them
          const returnvalue = await evalReactionActivationCondition(options.workflow, reactionCondition, target, { async: true,
            extraData: { reaction: reactionTriggerLabelFor(triggerType), eventId, event: eventDataFor(options.workflow, target, eventId) ?? {} } });
          if (debugEnabled > 0) warn(`for ${target.actor.name} ${theItem.name} using condition ${reactionCondition} condition ${returnvalue}`, options.workflow?.conditionData);
          if (!returnvalue) continue;
          reactions.push(activity);
        } catch (err) {
          // One activity that can't be checked doesn't cost the actor its other reactions
          const message = `midi-qol | fetching reactions: ${item.name}, ${activity.name} could not be checked`;
          console.error(message, err);
          TroubleShooter.recordError(err, message);
        }
      }
    }
    return reactions.map(activity => ({ activityUuid: activity.uuid }));
  }
};
