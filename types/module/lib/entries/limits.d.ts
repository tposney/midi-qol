import type { EntryLimit } from "./types.js";
export interface CombatPosition {
    id: string;
    round: number;
    turn: number;
}
export interface LimitRecord {
    stamp: string;
    count: number;
}
/** As stored on the actor: an array, which an update replaces whole (stale records go in the same write) */
export type StoredLimit = LimitRecord & {
    key: string;
};
/** The stamp a limit's count is kept under now; undefined: the limit doesn't apply now (turn/round outside combat) */
export declare function limitStamp(per: EntryLimit["per"], combat: CombatPosition | undefined): string | undefined;
/** How many times the entry was taken under this stamp */
export declare function usedUnder(record: LimitRecord | undefined, stamp: string): number;
/** May the entry run again (max defaults to 1)? */
export declare function withinLimit(limit: EntryLimit | undefined, record: LimitRecord | undefined, stamp: string | undefined): boolean;
/** The record after one more use under this stamp */
export declare function spendLimit(record: LimitRecord | undefined, stamp: string): LimitRecord;
/** The stored records whose stamp is still current (this turn's or this round's) */
export declare function pruneLimits(records: readonly StoredLimit[], combat: CombatPosition | undefined): StoredLimit[];
/** The stored records after one more use of `key` under `stamp` (pruned to the current combat event) */
export declare function spendStoredLimit(records: readonly StoredLimit[], key: string, stamp: string, combat: CombatPosition | undefined): StoredLimit[];
/** The key of an entry on a document */
export declare function limitKey(documentUuid: string, entryId: string): string;
/**
 * One entry of a group per event, unless it stacks: the first of a group in order is kept, and later entries of that
 * group only if they say `stacks` (Empowered Spell combines with another Metamagic). Entries with no group all run.
 */
export declare function selectGroups<T extends {
    entry: {
        group?: string;
        stacks?: boolean;
    };
}>(found: readonly T[]): T[];
