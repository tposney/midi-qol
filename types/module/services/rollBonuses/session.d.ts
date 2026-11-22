import type { BonusCost } from "./rules.js";
export interface BonusSession {
    spent: BonusCost;
    /** Service bonuses applied to this roll, by candidate id */
    applied: Set<string>;
    /** Offered in an earlier phase and not taken */
    declined: Set<string>;
}
/** The session of a roll: `owner` is the use (or the object a roll without a use is asked for), `key` the roll */
export declare function bonusSession(owner: object, key: string): BonusSession;
