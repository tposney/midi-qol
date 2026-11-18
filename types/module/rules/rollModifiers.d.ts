export type RollKind = "attack" | "save" | "check" | "skill" | "tool" | "death" | "concentration";
export type RollModifierEffect = "advantage" | "disadvantage" | "noAdvantage" | "noDisadvantage" | "critical" | "noCritical" | "fumble" | "noFumble" | "success" | "fail" | "min" | "max";
export interface RollModifier {
    effect: RollModifierEffect;
    /** The die value for min/max. */
    value?: number;
    /** Shown in the roll dialog and on the card. */
    label: string;
    /** What gave it (an effect's uuid, a rule's name); attribution is per provider + source. */
    source?: string;
    /** The exact attribution key instead of provider:source, for a key other modules already rely on (midi's own rules). */
    key?: string;
}
interface SideTracker {
    add(source?: string, displayName?: string): void;
    suppress(source?: string, displayName?: string): void;
}
interface CritTracker {
    force(source: string, displayName?: string): void;
    suppress(source: string, displayName?: string): void;
}
interface ValueTracker {
    fail(source: string, displayName?: string): void;
    succeed(source: string, displayName?: string): void;
    min(value: number, source: string, displayName?: string): void;
    max(value: number, source: string, displayName?: string): void;
}
/** The parts of RollModifierTracker the modifiers write to. */
export interface ModifierTarget {
    advantage: SideTracker;
    disadvantage: SideTracker;
    critical: CritTracker;
    fumble: CritTracker;
    modifiers: ValueTracker;
}
/** Applies one contributor's modifiers; returns the ones it could not apply, with why. */
export declare function applyRollModifiers(tracker: ModifierTarget, modifiers: readonly RollModifier[], providerId: string): string[];
export {};
