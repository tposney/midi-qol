import type { BonusCost } from "./rules.js";

/*
 * M15 stage 3b: one bonus session per roll, across its phases (preRoll, preResult, postResult): what was spent (a later
 * bonus must still fit), the service bonuses applied (not offered again), and what the roller was offered and didn't
 * take (not asked again). A bonus that first appears in a later phase (a flag's `.fail.` value after a miss) is still
 * offered. Flags are governed by their counts, as before. Kept in memory for the use's life.
 */

export interface BonusSession {
  spent: BonusCost;
  /** Service bonuses applied to this roll, by candidate id */
  applied: Set<string>;
  /** Offered in an earlier phase and not taken */
  declined: Set<string>;
}

const sessions = new WeakMap<object, Map<string, BonusSession>>();

/** The session of a roll: `owner` is the use (or the object a roll without a use is asked for), `key` the roll */
export function bonusSession(owner: object, key: string): BonusSession {
  let byRoll = sessions.get(owner);
  if (!byRoll) sessions.set(owner, byRoll = new Map());
  let session = byRoll.get(key);
  if (!session) byRoll.set(key, session = { spent: {}, applied: new Set(), declined: new Set() });
  return session;
}
