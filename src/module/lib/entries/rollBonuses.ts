import { register } from "../../api/services.js";
import type { BonusCandidate, BonusCost, BonusEffect, BonusPhase, BonusRollKind, RollBonusQuery } from "../../services/rollBonuses/service.js";
import { collectEntries, conditionDataFor, entryHolds, holds, limitAllows, spendEntryLimit, type MomentContext } from "./engine.js";
import type { FoundEntry } from "./types.js";
import { askOffers, offerOption, toggleOn } from "./offers.js";
import { hasUsedReaction } from "../../utils.js";

/*
 * M15 stage 3e: "offer as a roll bonus". An entry on a roll moment (`roll.preRoll`, `roll.preResult`,
 * `roll.postResult`) with a `bonus` action is a rollBonuses candidate, so it has the bonus engine's session, costs,
 * prompt and approval: `offer: "ask"` is optional, "always" automatic; its `activity` is its cost (the activity's
 * uses, else the item's: Lucky's Luck Points); its `limit` is checked when it is offered and spent when it is chosen.
 * `bonus.rolls` names the roll kinds it is for (all when absent). Its `if` is evaluated when the roll's bonuses are
 * collected, with `event.kind` the roll's kind (not yet the roll itself).
 * Stage 4e: `toggle` while on; `reaction` asked as `ask`, costing the reaction too; someone else's entry (a near one,
 * `who: { within }`) is decided by its holder (asked for ask/reaction, through the request core) and paid by them.
 */

const PHASE_OF: Record<string, BonusPhase> = { "roll.preRoll": "preRoll", "roll.preResult": "preResult", "roll.postResult": "postResult" };
const ROLL_MOMENTS = Object.keys(PHASE_OF);

type Activityish = { id?: string, uuid?: string, name?: string, item?: Item.Implementation, uses?: { max?: number | string | null, value?: number } };

/** The activity named by an entry: on the entry's own item (an activity home is its own) */
function entryActivity(f: FoundEntry): Activityish | undefined {
  const document = f.document as { item?: Item.Implementation, system?: { activities?: { get(id: string): unknown } }, parent?: unknown };
  const item = document instanceof Item ? document : (document.item ?? (document.parent instanceof Item ? document.parent : undefined));
  if (!f.entry.activity) return "item" in document && document.item ? document as Activityish : undefined;
  // @ts-expect-error no dnd5e-types
  return item?.system.activities?.get(f.entry.activity) as Activityish | undefined;
}

/** What taking the entry costs: its activity's uses, else its item's (an entry on an item without an activity: the item's) */
function costOf(activity: Activityish | undefined, item: Item.Implementation | undefined): BonusCost | undefined {
  if (activity?.uses?.max && activity.uuid) return { activityUses: { [activity.uuid]: { cost: 1, available: activity.uses.value ?? 0 } } };
  // @ts-expect-error no dnd5e-types
  const uses = item?.system.uses as { max?: number | string | null, value?: number } | undefined;
  if (uses?.max && item?.uuid) return { itemUses: { [item.uuid]: { cost: 1, available: uses.value ?? 0 } } };
  return undefined;
}

/** A reaction offer also costs the reaction */
function withReaction(cost: BonusCost | undefined, reaction: boolean): BonusCost | undefined {
  return reaction ? { ...cost, actions: { ...cost?.actions, reaction: { cost: 1, available: 1 } } } : cost;
}

/** The roll bonuses the actor's entries offer for this roll */
async function entryCandidates(query: RollBonusQuery): Promise<BonusCandidate[]> {
  const context: MomentContext = { actor: query.actor, workflow: query.workflow, activity: query.activity, item: query.item, event: { kind: query.kind } };
  const byEntry = new Map<string, { found: FoundEntry, phases: BonusPhase[] }>();
  for (const moment of ROLL_MOMENTS) {
    for (const f of collectEntries(moment, context)) {
      const key = `${(f.document as { uuid?: string }).uuid ?? ""}#${f.entry.id}`;
      const known = byEntry.get(key);
      if (known) known.phases.push(PHASE_OF[moment]);
      else byEntry.set(key, { found: f, phases: [PHASE_OF[moment]] });
    }
  }
  const candidates: BonusCandidate[] = [];
  for (const [key, { found: f, phases }] of byEntry) {
    const offer = f.entry.offer ?? "always";
    if (offer === "toggle" ? !toggleOn(f) : !["always", "ask", "reaction"].includes(offer)) continue;
    // Someone else's entry (a near one: an ally's, an enemy's): its holder decides (asked for ask/reaction) and pays
    const holder = f.actor && f.actor !== query.actor ? f.actor : undefined;
    if (offer === "reaction" && hasUsedReaction(f.actor ?? query.actor)) continue;
    if (!limitAllows(f, context)) continue;
    const conditionData = conditionDataFor(f, context);
    if (!await entryHolds(f, conditionData)) continue;
    const activity = entryActivity(f);
    const item = activity?.item ?? (f.document instanceof Item ? f.document : undefined);
    f.entry.do.forEach((action, index) => {
      const bonus = action.bonus as BonusEffect | undefined;
      if (!bonus || typeof bonus !== "object" || !("kind" in bonus)) return;
      const rolls = action.rolls === undefined ? undefined : [action.rolls].flat() as BonusRollKind[];
      if (rolls && !rolls.includes(query.kind)) return;
      const label = (typeof action.label === "string" ? action.label : undefined) ?? activity?.name ?? (f.document as { name?: string }).name ?? f.entry.id;
      const asks = offer === "ask" || offer === "reaction";
      const cost = withReaction(costOf(activity, item), offer === "reaction");
      candidates.push({
        id: `${key}#${index}`, label, phases, effect: bonus, cost,
        optional: asks && !holder,
        ...(holder ? { spender: holder.uuid ?? undefined } : {}),
        ...(holder && asks ? { approve: async () => (await askOffers(holder, `${holder.name}: ${label} (${query.actor.name})`, [offerOption(f, "take")])).length > 0 } : {}),
        onChosen: () => spendEntryLimit(f, context)
      });
    });
  }
  return candidates;
}

/** Entries' roll bonuses as a rollBonuses contributor (after the service is defined) */
export function registerEntryRollBonuses() {
  register("rollBonuses", "midi-qol.entries", { for: entryCandidates });
}
