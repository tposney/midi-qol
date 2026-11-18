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
} | {
    kind: "reroll";
    keep: "new" | "higher" | "lower" | "ask";
    dice?: "max" | "min";
    addFormula?: string;
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
/**
 * The order chosen bonuses are applied in within a phase: replace, reroll, add, outcome/critical, riders; higher
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
