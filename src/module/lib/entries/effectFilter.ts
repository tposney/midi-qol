/*
 * Ending effects by what they are (pure; lib/entries/useChanges.ts gathers the facts and acts): `{ effect: "remove",
 * what: <filter> }` with a filter of
 *  - `spell: true` (an ongoing spell's effect), `maxLevel` (ended at or below it), `check` (above it: the caller's
 *    check, DC 10 + its level; Dispel Magic);
 *  - `statuses: [...]` (it carries one of them: dnd5e's Cursed for Remove Curse, Charmed or Frightened);
 *  - `fromTypes: [...]` (its creator is one of these creature types: Dispel Evil and Good);
 *  - `changes: [...]` (one of its changes' keys starts with one of these: an ability score, the hit point maximum).
 * Every part given must hold. Never the creature's own concentration marker or an item's effect on it. A spell
 * effect whose level isn't known is asked about (the GM decides, user 2026-11-27); an instantaneous spell's effects
 * aren't sustained by magic and aren't ended (Sage Advice SA180).
 */

export interface EffectFilter {
  spell?: boolean;
  maxLevel?: number;
  check?: boolean;
  statuses?: readonly string[];
  fromTypes?: readonly string[];
  changes?: readonly string[];
}

export interface EffectFacts {
  statuses: readonly string[];
  changeKeys: readonly string[];
  /** A spell made it: its level (cast, else base) when known, and whether the spell is instantaneous */
  spell?: { level?: number, instantaneous?: boolean };
  /** The creature type of the creature that made it */
  originType?: string;
  /** The creature's own concentration marker */
  concentration?: boolean;
  /** An item's effect on its holder (a transfer effect) */
  fromOwnItem?: boolean;
}

export type EffectVerdict = { verdict: "end" } | { verdict: "check", level: number } | { verdict: "ask" } | { verdict: "keep" };

export function judgeEffect(facts: EffectFacts, filter: EffectFilter): EffectVerdict {
  const keep: EffectVerdict = { verdict: "keep" };
  if (facts.concentration || facts.fromOwnItem) return keep;
  if (filter.statuses?.length && !filter.statuses.some(s => facts.statuses.includes(s))) return keep;
  if (filter.fromTypes?.length && !(facts.originType && filter.fromTypes.includes(facts.originType))) return keep;
  if (filter.changes?.length && !facts.changeKeys.some(key => filter.changes!.some(prefix => key.startsWith(prefix)))) return keep;
  if (!filter.spell) return { verdict: "end" };
  if (!facts.spell || facts.spell.instantaneous) return keep;
  const level = facts.spell.level;
  if (level === undefined) return { verdict: "ask" };
  if (level <= (filter.maxLevel ?? 9)) return { verdict: "end" };
  return filter.check ? { verdict: "check", level } : keep;
}

/** Whether `what` is a filter (not a status, an effect's name, or `{ origin }`) */
export function isEffectFilter(what: unknown): what is EffectFilter {
  if (!what || typeof what !== "object" || "origin" in what) return false;
  return ["spell", "statuses", "fromTypes", "changes"].some(key => key in what);
}
