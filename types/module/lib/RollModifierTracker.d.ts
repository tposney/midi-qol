/**
 * Tracks roll modifiers: advantage/disadvantage, auto-fail/success, min/max with attribution.
 */
import { RollDialogConfig, RollProcessConfig } from "../../globals.js";
import { MidiOptions } from "../utils.js";
/** Attribution types for roll modifier tracking */
export type AdvantageAttributionType = 'ADV' | 'DIS' | 'NOADV' | 'NODIS' | 'CRIT' | 'NOCRIT' | 'FUMBLE' | 'NOFUMBLE' | 'SUCCESS' | 'FAIL' | 'MIN' | 'MAX';
/** Attribution map: type -> source -> displayName */
export type AdvantageAttributionMap = Partial<Record<AdvantageAttributionType, Record<string, string>>>;
/** Callback type for adding attributions */
type AttributionCallback = (type: AdvantageAttributionType, source: string, displayName: string) => void;
export interface RollModifierFlags {
    failFlags: string[];
    successFlags: string[];
    maxFlags: string[];
    minFlags: string[];
}
export interface CriticalModifierFlags {
    criticalFlags: string[];
    noCriticalFlags: string[];
    fumbleFlags: string[];
    noFumbleFlags: string[];
}
export interface RollModifierResult {
    autoFail: boolean;
    autoSuccess: boolean;
    max: number | undefined;
    min: number | undefined;
}
export interface AdvantageFlags {
    advantageFlags: string[];
    disadvantageFlags: string[];
    systemRollModeFields: string[];
    noAdvantageFlags?: string[];
    noDisadvantageFlags?: string[];
    sourceAdvantageFlags?: string[];
    sourceDisadvantageFlags?: string[];
    sourceNoAdvantageFlags?: string[];
    sourceNoDisadvantageFlags?: string[];
    deprecatedFlags?: Set<string>;
}
export declare function getFlagDisplayName(flag: string): string;
type AdvantageType = 'ADV' | 'DIS';
/**
 * Tracks a single advantage or disadvantage state with attribution.
 */
export declare class AdvantageDisadvantageTracker {
    #private;
    constructor(type: AdvantageType, addAttribution: AttributionCallback);
    /** Get complete state snapshot */
    get get(): Readonly<{
        active: boolean;
        suppressed: boolean;
        override: boolean;
    }>;
    /** Whether at least one source has been added */
    get isAdded(): boolean;
    /** Whether suppressed by a blocking flag */
    get isSuppressed(): boolean;
    /** Whether override is set (bypasses suppression) */
    get hasOverride(): boolean;
    /**
     * Computed final state.
     * Returns true if active and not suppressed (or if override is set).
     * Returns undefined if not active or if suppressed.
     */
    get isActive(): true | undefined;
    /**
     * Add a source of advantage/disadvantage.
     * @param source - Optional source identifier for attribution
     * @param displayName - Optional human-readable display name
     */
    add(source?: string, displayName?: string): void;
    /**
     * Clear active state.
     * Preserves suppression state.
     */
    clear(): void;
    /**
     * Suppress this modifier.
     * When suppressed, isActive returns undefined.
     * @param source - Optional source identifier for attribution
     * @param displayName - Optional human-readable display name
     */
    suppress(source?: string, displayName?: string): void;
    /**
     * Force this modifier, bypassing suppression.
     * @param source - Optional source identifier for attribution
     * @param displayName - Optional human-readable display name
     */
    setOverride(source?: string, displayName?: string): void;
    /**
     * Clear override state.
     */
    clearOverride(): void;
    /**
     * Reset all state to initial values.
     */
    reset(): void;
    /** Restore state from serialized data */
    restore(state: {
        active: boolean;
        suppressed: boolean;
        override: boolean;
    }): void;
}
type CritType = 'CRIT' | 'FUMBLE';
/**
 * Tracks critical or fumble state with attribution.
 */
export declare class CriticalFumbleTracker {
    #private;
    constructor(type: CritType, addAttribution: AttributionCallback);
    /** Get complete state snapshot */
    get get(): Readonly<{
        natural: boolean;
        forced: boolean;
        suppressed: boolean;
        override: boolean | undefined;
    }>;
    /** Whether natural crit/fumble occurred from dice */
    get isNatural(): boolean;
    /** Whether forced by a flag */
    get isForced(): boolean;
    /** Whether suppressed by a blocking flag */
    get isSuppressed(): boolean;
    /** Whether override is set */
    get hasOverride(): boolean;
    /** Get override value (undefined if not set) */
    get overrideValue(): boolean | undefined;
    /**
     * Computed final state.
     * Priority: override > suppressed > (natural || forced)
     */
    get isActive(): boolean;
    /**
     * Set natural crit/fumble from dice roll.
     * @param source - Source identifier for attribution
     * @param displayName - Human-readable display name
     */
    setNatural(source: string, displayName?: string): void;
    /**
     * Force crit/fumble from a flag.
     * @param source - Source identifier for attribution
     * @param displayName - Human-readable display name
     */
    force(source: string, displayName?: string): void;
    /**
     * Suppress (prevent) crit/fumble.
     * @param source - Source identifier for attribution
     * @param displayName - Human-readable display name
     */
    suppress(source: string, displayName?: string): void;
    /**
     * Override crit/fumble state absolutely.
     * @param value - true to force, false to prevent
     * @param source - Source identifier for attribution
     * @param displayName - Human-readable display name
     */
    setOverride(value: boolean, source: string, displayName?: string): void;
    /**
     * Reset all state to initial values.
     */
    reset(): void;
    /** Restore state from serialized data */
    restore(state: {
        natural: boolean;
        forced: boolean;
        suppressed: boolean;
        override: boolean | undefined;
    }): void;
}
/**
 * Tracks roll value modifiers: auto-fail, auto-success, min, max.
 */
export declare class RollValueTracker {
    #private;
    constructor(addAttribution: AttributionCallback);
    /** Get complete state snapshot */
    get get(): Readonly<{
        willFail: boolean;
        willSucceed: boolean;
        minValue: number;
        maxValue: number;
    }>;
    get willFail(): boolean;
    get willSucceed(): boolean;
    get minValue(): number;
    get maxValue(): number;
    get hasMin(): boolean;
    get hasMax(): boolean;
    /**
     * Set auto-fail for this roll.
     * @param source - Source identifier for attribution
     * @param displayName - Human-readable display name
     */
    fail(source: string, displayName?: string): void;
    /**
     * Set auto-success for this roll.
     * @param source - Source identifier for attribution
     * @param displayName - Human-readable display name
     */
    succeed(source: string, displayName?: string): void;
    /**
     * Set minimum roll value (only if higher than current).
     * @param value - Minimum roll value
     * @param source - Source identifier for attribution
     * @param displayName - Human-readable display name
     */
    min(value: number, source: string, displayName?: string): void;
    /**
     * Force set minimum roll value, ignoring current value.
     * @param value - Minimum roll value
     * @param source - Source identifier for attribution
     * @param displayName - Human-readable display name
     */
    forceMin(value: number, source: string, displayName?: string): void;
    /**
     * Set maximum roll value (only if lower than current).
     * @param value - Maximum roll value
     * @param source - Source identifier for attribution
     * @param displayName - Human-readable display name
     */
    max(value: number, source: string, displayName?: string): void;
    /**
     * Force set maximum roll value, ignoring current value.
     * @param value - Maximum roll value
     * @param source - Source identifier for attribution
     * @param displayName - Human-readable display name
     */
    forceMax(value: number, source: string, displayName?: string): void;
    /**
     * Reset all state to initial values.
     */
    reset(): void;
    /** Restore state from serialized data */
    restore(state: {
        willFail: boolean;
        willSucceed: boolean;
        minValue: number;
        maxValue: number;
    }): void;
}
export declare class RollModifierTracker {
    #private;
    readonly advantage: AdvantageDisadvantageTracker;
    readonly disadvantage: AdvantageDisadvantageTracker;
    readonly critical: CriticalFumbleTracker;
    readonly fumble: CriticalFumbleTracker;
    readonly modifiers: RollValueTracker;
    constructor();
    /**
     * Add an attribution entry.
     * @param type - Attribution type (ADV, DIS, NOADV, NODIS, CRIT, etc.)
     * @param source - Source identifier (e.g., 'flanking', 'invisible')
     * @param displayName - Human-readable display name
     */
    addAttribution(type: AdvantageAttributionType, source: string, displayName: string): void;
    /** Get the attribution map */
    get attribution(): AdvantageAttributionMap;
    /** Get legacy Set format: "${type}:${displayName}" */
    get legacyAttribution(): Set<string>;
    /** Get legacy Set format for adv-reminder: "${type}:${source}" */
    get advReminderAttribution(): Set<string>;
    /**
     * Get the combined advantage/disadvantage mode.
     * @returns ADV_MODE.ADVANTAGE, ADV_MODE.DISADVANTAGE, or ADV_MODE.NORMAL
     */
    get advantageMode(): number;
    /** Check if there's effective advantage */
    get hasAdvantage(): true | undefined;
    /** Check if there's effective disadvantage */
    get hasDisadvantage(): true | undefined;
    /** Computed final critical state */
    get isCritical(): boolean;
    /** Computed final fumble state */
    get isFumble(): boolean;
    /**
     * Reset all state to initial values.
     */
    reset(): void;
    /** Serialize tracker state to a plain object for persistence */
    toJSON(): object;
    /** Restore tracker state from serialized data */
    restore(data: ReturnType<RollModifierTracker["toJSON"]> & Record<string, any>): void;
    processKeys(config?: RollProcessConfig): void;
}
/**
 * Centralized function for processing advantage/disadvantage flags.
 * Handles both actor flags and source actor grants flags.
 * Populates and returns a RollModifierTracker instance with attribution tracking.
 */
export declare function computeAdvantageFlags(actor: Actor.Implementation, flags: AdvantageFlags, options: MidiOptions, tracker?: RollModifierTracker): Promise<RollModifierTracker>;
/**
 * Evaluate roll modifier flags and populate the tracker with autoFail/autoSuccess/min/max.
 * This is the flag evaluation step - call applyRollModifiers afterwards to apply to config.
 *
 * @param actor - The actor to evaluate flags for
 * @param flags - The flags to evaluate (failFlags, successFlags, minFlags, maxFlags)
 * @param tracker - The RollModifierTracker to populate
 * @param options - Additional options including workflow for condition evaluation
 */
export declare function computeRollModifiers(actor: Actor.Implementation, flags: RollModifierFlags, tracker: RollModifierTracker, options?: {
    workflow?: any;
}): void;
/**
 * Apply roll modifiers from tracker state to the roll config.
 * Call computeRollModifiers first to populate the tracker, or set values directly.
 * Returns the modifier results so callers can check autoFail/autoSuccess.
 *
 * @param tracker - The RollModifierTracker with populated state
 * @param config - The roll config to modify
 * @param dialog - The dialog config to modify
 * @param options - Values for auto-fail (default 1) and auto-success (default 99)
 */
export declare function applyRollModifiers(tracker: RollModifierTracker, config: RollProcessConfig, dialog: RollDialogConfig, options?: {
    failValue?: number;
    successValue?: number;
}): RollModifierResult;
/**
 * Evaluate critical/fumble modifier flags and populate the tracker.
 * Handles actor flags for critical/noCritical/fumble/noFumble.
 *
 * @param actor - The actor to evaluate flags for
 * @param flags - The flags to evaluate
 * @param tracker - The RollModifierTracker to populate
 * @param options - Additional options including workflow for condition evaluation
 */
export declare function computeCriticalModifiers(actor: Actor.Implementation, flags: CriticalModifierFlags, tracker: RollModifierTracker, options?: {
    workflow?: any;
    actionType?: string;
}): Promise<void>;
/**
 * Evaluate target grants critical/fumble flags and populate the tracker.
 * Handles grants.critical, grants.noCritical, grants.fumble, grants.noFumble.
 *
 * @param targetActor - The target actor to evaluate grants flags on
 * @param targetName - Display name for attribution
 * @param flags - The grants flags to evaluate
 * @param tracker - The RollModifierTracker to populate
 * @param options - Additional options including workflow and source actor for condition evaluation
 */
export declare function computeTargetCriticalModifiers(targetActor: Actor.Implementation, targetName: string, flags: CriticalModifierFlags, tracker: RollModifierTracker, options?: {
    workflow?: any;
    sourceActor?: Actor.Implementation;
}): Promise<void>;
export {};
