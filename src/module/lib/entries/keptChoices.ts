import { MODULE_ID } from "../../../midi-qol.js";
import type { EventContext } from "./engine.js";
import type { FoundEntry } from "./types.js";

/*
 * An entry's choice kept beyond its use (`choose.keep`): Careful Spell's protected creatures are chosen once when the
 * spell is cast and hold for the spell's other saves that turn (an area's saves as creatures enter it), without being
 * asked or paid for again. Kept on the entry's holder for the item it was made for:
 *
 *   keep: "turn"   until the current turn ends: in combat, while it is the same combat, round and turn; out of combat,
 *                  while the world time hasn't moved on (and no combat has started)
 */

export interface KeptChoice { item: string, value: unknown, time: number, combat?: string, round?: number, turn?: number }
type Kept = KeptChoice;
const FLAG = "keptChoices";
const keyOf = (entryId: string) => entryId.replace(/\./g, "_");

function stillCurrent(kept: Kept): boolean {
  const combat = game.combat;
  if (kept.combat) return !!combat && combat.id === kept.combat && combat.round === kept.round && combat.turn === kept.turn;
  return !combat?.started && game.time.worldTime === kept.time;
}

function itemOf(context: EventContext): string | undefined {
  return context.workflow?.item?.uuid ?? context.item?.uuid ?? undefined;
}

/** The entry's kept choice for this use's item, while it is still current */
export function keptChoice(f: FoundEntry, context: EventContext): { value: unknown } | undefined {
  const keep = (f.entry.choose as { keep?: unknown } | undefined)?.keep;
  const item = itemOf(context);
  if (keep !== "turn" || !f.actor || !item) return undefined;
  const kept = (f.actor.getFlag(MODULE_ID, FLAG) as Record<string, Kept> | undefined)?.[keyOf(f.entry.id)];
  return kept && kept.item === item && stillCurrent(kept) ? { value: kept.value } : undefined;
}

/** Keep a choice just made (an entry whose choose has `keep`) */
export async function keepChoice(f: FoundEntry, context: EventContext, value: unknown): Promise<void> {
  const keep = (f.entry.choose as { keep?: unknown } | undefined)?.keep;
  const item = itemOf(context);
  if (keep !== "turn" || !f.actor || !item) return;
  const combat = game.combat?.started ? game.combat : undefined;
  const kept: Kept = { item, value, time: game.time.worldTime, ...(combat ? { combat: combat.id!, round: combat.round, turn: combat.turn ?? 0 } : {}) };
  try { await f.actor.setFlag(MODULE_ID, FLAG, { [keyOf(f.entry.id)]: kept }); }
  catch (err) { console.warn(`midi-qol | entry ${f.entry.id}: its choice could not be kept`, err); }
}
