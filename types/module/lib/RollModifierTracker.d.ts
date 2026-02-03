/**
 * Tracks roll modifiers: advantage/disadvantage, auto-fail/success, min/max with attribution.
 * Modeled on dnd5e's AdvantageModeField pattern.
 *
 * Mode values: -1 = disadvantage, 0 = normal, 1 = advantage
 */

import { RollDialogConfig, RollProcessConfig } from "../../globals";
import { MidiOptions } from "../utils";

/** Attribution types for roll modifier tracking */
export type AdvantageAttributionType = 'ADV' | 'DIS' | 'NOADV' | 'NODIS' | 'CRIT' | 'NOCRIT' | 'FUMBLE' | 'NOFUMBLE' | 'SUCCESS' | 'FAIL' | 'MIN' | 'MAX';

/** Attribution map: type -> source -> displayName */
export type AdvantageAttributionMap = Partial<Record<AdvantageAttributionType, Record<string, string>>>;

/** Options for RollModifierTracker constructor/reset */
export interface RollModifierTrackerOptions {
    /** Legacy Set format: "${type}:${source}" - reference to external Set */
    legacyAttribution?: Set<string>;
    /** Legacy Set format for adv-reminder: "${type}:${source}" - reference to external Set */
    advReminderAttribution?: Set<string>;
}

export interface RollModifierFlags {
    failFlags: string[];
    successFlags: string[];
    maxFlags: string[];
    minFlags: string[];
}

export interface RollModifierResult {
    autoFail: boolean;
    autoSuccess: boolean;
    max: number | undefined;
    min: number | undefined;
}

/** Interface for advantage/disadvantage flag configuration */
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

export declare class RollModifierTracker {
    #private;
    constructor(options?: RollModifierTrackerOptions);
    /**
     * Add an attribution entry.
     * @param type - Attribution type (ADV, DIS, NOADV, NODIS, CRIT, etc.)
     * @param source - Source identifier (e.g., 'flanking', 'invisible')
     * @param displayName - Human-readable display name
     */
    addAttribution(type: AdvantageAttributionType, source: string, displayName: string): void;
    /**
     * Get the attribution map.
     */
    get attribution(): AdvantageAttributionMap;
    /**
     * Get legacy Set format: "${type}:${displayName}"
     */
    get legacyAttribution(): Set<string>;
    /**
     * Get legacy Set format for adv-reminder: "${type}:${source}"
     */
    get advReminderAttribution(): Set<string>;
    /**
     * Add a source of advantage.
     * @param source - Optional source identifier for attribution
     * @param displayName - Optional human-readable display name
     */
    addAdvantage(source?: string, displayName?: string): void;
    /**
     * Clear advantage.
     * Preserves suppression state.
     */
    clearAdvantage(): void;
    /**
     * Suppress advantage.
     * When suppressed, hasAdvantage returns undefined (helps with dnd5e key processing).
     * @param source - Optional source identifier for attribution
     * @param displayName - Optional human-readable display name
     */
    suppressAdvantage(source?: string, displayName?: string): void;
    /**
     * Check if advantage is suppressed.
     */
    get advantageSuppressed(): boolean;
    /**
     * Check if there's effective advantage.
     * Returns true if advantage has been added and is not suppressed (or if override is set).
     * Returns undefined if never assigned or if suppressed.
     */
    get hasAdvantage(): true | undefined;
    /**
     * Add a source of disadvantage.
     * @param source - Optional source identifier for attribution
     * @param displayName - Optional human-readable display name
     */
    addDisadvantage(source?: string, displayName?: string): void;
    /**
     * Clear disadvantage.
     * Preserves suppression state.
     */
    clearDisadvantage(): void;
    /**
     * Suppress disadvantage.
     * When suppressed, hasDisadvantage returns undefined (helps with dnd5e key processing).
     * @param source - Optional source identifier for attribution
     * @param displayName - Optional human-readable display name
     */
    suppressDisadvantage(source?: string, displayName?: string): void;
    /**
     * Check if disadvantage is suppressed.
     */
    get disadvantageSuppressed(): boolean;
    /**
     * Check if there's effective disadvantage.
     * Returns true if disadvantage has been added and is not suppressed (or if override is set).
     * Returns undefined if never assigned or if suppressed.
     */
    get hasDisadvantage(): true | undefined;
    /**
     * Force advantage, bypassing suppression.
     * Sets advantage to true and marks it as an override.
     * @param source - Optional source identifier for attribution
     * @param displayName - Optional human-readable display name
     */
    setAdvantageOverride(source?: string, displayName?: string): void;
    /**
     * Force disadvantage, bypassing suppression.
     * Sets disadvantage to true and marks it as an override.
     * @param source - Optional source identifier for attribution
     * @param displayName - Optional human-readable display name
     */
    setDisadvantageOverride(source?: string, displayName?: string): void;
    /**
     * Force a specific mode, ignoring suppression.
     * @param mode -1 = disadvantage, 0 = normal, 1 = advantage
     */
    setOverride(mode: -1 | 0 | 1): void;
    /**
     * Check if advantage override is active.
     */
    get advantageOverride(): boolean;
    /**
     * Check if disadvantage override is active.
     */
    get disadvantageOverride(): boolean;
    /**
     * Check if any override is active.
     */
    get hasOverride(): boolean;
    get mode(): number;
    /**
     * Reset all state to initial values.
     * @param options - Optional new references for legacy Sets
     */
    reset(options?: RollModifierTrackerOptions): void;
}

/**
 * Centralized function for processing advantage/disadvantage flags.
 * Handles both actor flags and source actor grants flags.
 * Populates and returns a RollModifierTracker instance with attribution tracking.
 */
export declare function computeAdvantageFlags(
    actor: Actor.Implementation,
    flags: AdvantageFlags,
    options: MidiOptions,
    tracker?: RollModifierTracker
): Promise<RollModifierTracker>;

/**
 * Evaluate roll modifier flags and apply them to the roll config.
 * Returns the modifier results so callers can check autoFail/autoSuccess.
 * If tracker is provided, adds auto fail/success attribution to it.
 */
export declare function applyRollModifiers(
    actor: Actor.Implementation,
    flags: RollModifierFlags,
    config: RollProcessConfig,
    dialog: RollDialogConfig,
    options?: { workflow?: any; failValue?: number; successValue?: number; tracker?: RollModifierTracker }
): RollModifierResult;
