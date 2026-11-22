export interface BonusSource {
    label: string;
    value?: string;
    img?: string;
}
/** The label of dnd5e's combined roll bonus term (its `@ruleBonus` part), which the bonus sources break down */
export declare function rollBonusLabel(): string;
/**
 * dnd5e's d20 roll parts (`@mod`, `@prof`, `@bonus`, …) with a label in brackets, which each evaluated term keeps as
 * its flavor. Parts that aren't one of these references are left as they are.
 */
export declare function labelD20Parts(parts: string[], ability: string | undefined): string[];
/**
 * The sources behind a combined bonus: each active effect's change to one of `keys` (its own value resolved against
 * the actor's data; an override or custom change without one), the sheet's own value at `fieldPaths` (`<path>.bonus`),
 * and dnd5e's rules for `category` (`<category>:bonus`).
 */
export declare function bonusSources(actor: Actor.Implementation | undefined | null, keys: string[], { fieldPaths, category, item }?: {
    fieldPaths?: string[];
    category?: string;
    item?: Item.Implementation;
}): BonusSource[];
/** The sources behind an attack's `@ruleBonus`: the attack roll fields for all attacks, the action type and the ability */
export declare function attackBonusSources(activity: {
    actor?: Actor.Implementation | null;
    item?: Item.Implementation | null;
} | undefined, ability: string | undefined, actionType: string | undefined): BonusSource[];
/** A change made to a roll after it was made (an optional or contributed bonus, a reroll): the bonuses and the total before */
export interface RollChange {
    labels: string[];
    before?: number;
}
/**
 * Record on `roll` that `labels` changed it from `before`, whether or not the change is displayed: a reroll or a
 * replacement leaves no term to label. Earlier changes (on `before`) are kept.
 */
export declare function recordRollChange(roll: Roll, before: Roll, labels: string[]): void;
/** Put the sources on the roll being built (kept only when there are some) */
export declare function setBonusSources(rollConfig: {
    options?: object;
}, sources: BonusSource[]): void;
/** Saves and damage labelled as dnd5e builds them (attacks: rolls/attack.ts, per use) */
export declare function registerRollPartLabels(): void;
