/*
 * M15: an entry's limit and group, pure (no Foundry globals). A per-turn or per-round limit is a count stamped with
 * the combat, round and turn it was spent in: a stale stamp counts as zero and is dropped on the next write, so the
 * record resets when the turn or round does and cleans itself up. Outside combat there are no turns: per-turn and
 * per-round limits don't apply (as M4 charges no action outside combat).
 */
import type { EntryLimit } from "./types.js";

export interface CombatPosition { id: string, round: number, turn: number }
export interface LimitRecord { stamp: string, count: number }
/** As stored on the actor: an array, which an update replaces whole (stale records go in the same write) */
export type StoredLimit = LimitRecord & { key: string };

/** The stamp a limit's count is kept under now; undefined: the limit doesn't apply now (turn/round outside combat) */
export function limitStamp(per: EntryLimit["per"], combat: CombatPosition | undefined): string | undefined {
  switch (per) {
    case "turn": return combat ? `${combat.id}:${combat.round}:${combat.turn}` : undefined;
    case "round": return combat ? `${combat.id}:${combat.round}` : undefined;
    default: return per;
  }
}

/** How many times the entry was taken under this stamp */
export function usedUnder(record: LimitRecord | undefined, stamp: string): number {
  return record && record.stamp === stamp ? record.count : 0;
}

/** May the entry run again (max defaults to 1)? */
export function withinLimit(limit: EntryLimit | undefined, record: LimitRecord | undefined, stamp: string | undefined): boolean {
  if (!limit || stamp === undefined) return true;
  return usedUnder(record, stamp) < (limit.max ?? 1);
}

/** The record after one more use under this stamp */
export function spendLimit(record: LimitRecord | undefined, stamp: string): LimitRecord {
  return { stamp, count: usedUnder(record, stamp) + 1 };
}

/** The stored records whose stamp is still current (this turn's or this round's) */
export function pruneLimits(records: readonly StoredLimit[], combat: CombatPosition | undefined): StoredLimit[] {
  if (!combat) return [];
  const turn = limitStamp("turn", combat), round = limitStamp("round", combat);
  return records.filter(record => record.stamp === turn || record.stamp === round);
}

/** The stored records after one more use of `key` under `stamp` (pruned to the current combat event) */
export function spendStoredLimit(records: readonly StoredLimit[], key: string, stamp: string, combat: CombatPosition | undefined): StoredLimit[] {
  const kept = pruneLimits(records, combat).filter(record => record.key !== key);
  return [...kept, { key, ...spendLimit(records.find(record => record.key === key), stamp) }];
}

/** The key of an entry on a document */
export function limitKey(documentUuid: string, entryId: string): string {
  return `${documentUuid}#${entryId}`;
}

/**
 * One entry of a group per event, unless it stacks: the first of a group in order is kept, and later entries of that
 * group only if they say `stacks` (Empowered Spell combines with another Metamagic). Entries with no group all run.
 */
export function selectGroups<T extends { entry: { group?: string, stacks?: boolean } }>(found: readonly T[]): T[] {
  const taken = new Set<string>();
  return found.filter(({ entry }) => {
    if (!entry.group) return true;
    if (!taken.has(entry.group)) { taken.add(entry.group); return true; }
    return !!entry.stacks;
  });
}
