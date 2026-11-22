export type BonusPhase = "preRoll" | "preResult" | "postResult";
export declare const BONUS_PHASES: readonly BonusPhase[];
export type BonusRollKind = "attack" | "damage" | "save" | "check" | "skill" | "tool" | "death" | "concentration" | "ac";
/** What a cost draws on. Keys within a type: an item/activity uuid, `spellN`, an attribute path, a die size, an effect key. */
export type ResourceType = "actions" | "itemUses" | "activityUses" | "spellSlots" | "attribute" | "material" | "hitDice" | "effectCount" | "oncePer";
export declare const RESOURCE_TYPES: readonly ResourceType[];
export interface CostEntry {
    cost: number;
    available: number;
}
export type BonusCost = Partial<Record<ResourceType, Record<string, CostEntry>>>;
export type BonusEffect = {
    kind: "add";
    formula: string;
    damageType?: string;
    critical?: "double" | "never" | "force";
}
/**
 * dice "choose": only some dice are rerolled, up to `max` (a number or formula; default 1) of those below their
 * average, lowest first (Empowered Spell: the best choice for the roller); `keep` is then "new"
 */
 | {
    kind: "reroll";
    keep: "new" | "higher" | "lower" | "ask";
    dice?: "max" | "min" | "choose";
    max?: number | string;
    addFormula?: string;
}
/** Advantage or disadvantage given after the roll (2024 Lucky): another d20, the higher or lower kept; with the other mode they cancel */
 | {
    kind: "mode";
    mode: "advantage" | "disadvantage";
} | {
    kind: "replace";
    formula: string;
} | {
    kind: "outcome";
    success: boolean;
} | {
    kind: "critical";
}
/** No change to the roll: the bonus's own code does the work. */
 | {
    kind: "rider";
};
export interface Outcome {
    success?: boolean;
    isCritical?: boolean;
    isFumble?: boolean;
    noDC?: boolean;
}
/** Whether `cost` fits what is left after `spent` (the CAT budget rule: each resource's spent + cost within its available). */
export declare function canAfford(cost: BonusCost | undefined, spent?: BonusCost): boolean;
/** `spent` with `cost` added (a new object); availability is the latest known. */
export declare function addCosts(spent: BonusCost, cost: BonusCost | undefined): BonusCost;
/**
 * The selection in order, keeping each that still fits the running budget. A third party's bonus spends someone else's
 * resources, so it neither counts against nor adds to this roller's budget.
 */
export declare function fitSelection<T extends {
    id: string;
    cost?: BonusCost;
    thirdParty?: boolean;
}>(ordered: readonly T[], spent?: BonusCost): {
    accepted: T[];
    refused: {
        id: string;
        reason: "resources";
    }[];
};
/**
 * Whether to open the prompt for a phase: only with optional bonuses on offer, never after the user dismissed the
 * prompt, not before the result on a natural 1 (unless a bonus is offered on fumbles), and after the result only when
 * there is something left to change (a failure, or a roll with no DC).
 */
export declare function shouldPrompt(phase: BonusPhase, s: {
    hasOptional: boolean;
    dismissed: boolean;
    outcome?: Outcome;
    fumbleOffered?: boolean;
}): boolean;
/** Where a kind of effect comes in the application order (orderForApplication); unknown kinds last */
export declare function effectOrder(kind: string | undefined): number;
/**
 * The order chosen bonuses are applied in within a phase: replace, reroll/mode, add, outcome/critical, riders; higher
 * priority first within each. A reroll rerolls the whole roll, so it comes before adds or it would drop them.
 */
export declare function orderForApplication<T extends {
    effect: BonusEffect;
    priority?: number;
}>(chosen: readonly T[]): T[];
/**
 * How far a bonus can scale: each step costs `step` more than the `base` cost; with `available` of the resource the
 * limit is floor((available - base) / step) + 1 steps (CAT's #getMaxScaling), 0 when even the base is unaffordable.
 */
export declare function maxScaling(base: number, step: number, available: number, cap?: number): number;
/**
 * M15 stage 5b: whether adding between `min` and `max` to `total` could change success against `target` (total >=
 * target succeeds): an add that can't reach the target, or a hit an add can't undo, can't matter.
 */
export declare function addCanMatter(total: number, target: number, min: number, max: number): boolean;
