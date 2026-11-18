export type DamageStage = "bonus" | "flatReduction" | "percentReduction" | "complete";
export declare const DAMAGE_STAGES: readonly DamageStage[];
export interface DamagePart {
    type: string;
    value: number;
}
export interface DamageChange {
    /** Damage types it applies to; omitted = every damage part. A bonus names exactly one. */
    types?: readonly string[];
    /** Flat change: positive adds (bonus, complete), negative reduces (flatReduction, complete). */
    amount?: number;
    /** Scale factor (percentReduction, complete): 0.5 halves, 0 removes. */
    multiplier?: number;
    /** Shown on the damage card. */
    label: string;
}
export interface ChangeResult {
    /** Net change to the damage (negative = less damage). */
    applied: number;
    /** A new part to add (bonus). */
    added?: DamagePart;
    /** Why the change was not applied. */
    problem?: string;
}
/**
 * Applies one change for a stage to `parts` (mutated in place). `counts` says which parts are damage a change may touch
 * (not healing, temp HP or display-only entries).
 */
export declare function applyDamageChange(stage: DamageStage, parts: DamagePart[], change: DamageChange, counts?: (part: DamagePart) => boolean): ChangeResult;
