import type { BonusEffect, BonusPhase, ResourceType } from "../services/rollBonuses/rules.js";
/** A flag value: a roll change, or a macro to run instead. */
export type ParsedFlagValue = {
    effect: BonusEffect;
} | {
    macro: string;
};
/**
 * The value of an optional bonus key (`flags.midi-qol.optional.NAME.attack.all` etc.), as bonusDialog has always read
 * it: reroll forms, success/fail/critical, `replace <formula>`, `reroll-withBonus <bonus>`, a macro, else a formula to add.
 */
export declare function parseFlagValue(value: unknown): ParsedFlagValue | undefined;
/** What a `count`/`countAlt` value draws on, for the cost model. `every`/absent: nothing. */
export type FlagCountCost = {
    type: ResourceType;
    key: string;
} | undefined;
export declare function countCost(count: unknown, flagKey: string): FlagCountCost;
/**
 * The phase an optional key applies in by default (`optional.NAME.phase` overrides): attack and d20 bonuses before the
 * result, `.fail.` bonuses and damage after it, acOnAttack before the attack's result, acOnHit after it.
 */
export declare function defaultPhase(selector: string): BonusPhase;
/** A phase named in `optional.NAME.phase`, else undefined. */
export declare function flagPhase(value: unknown): BonusPhase | undefined;
/**
 * The value an optional bonus (the `optional.NAME` object) offers for a roll, as collectBonusFlags matches it: the
 * category as a plain string applies to every detail; else the detail's own key, then `all`. Failure bonuses are
 * `<category>.fail.<type>` (type an ability or "all"). Undefined when it offers nothing for this roll.
 */
export declare function flagValueFor(entry: Record<string, unknown> | undefined, category: string, detail: string, fail?: boolean): unknown;
