/**
 * Tracks roll modifiers: advantage/disadvantage, auto-fail/success, min/max with attribution.
 */

import { RollDialogConfig, RollProcessConfig } from "../../globals.js";
import { i18n } from "../../midi-qol.js";
import { createConditionData, evalAllConditions, evalAllConditionsAsync, tokenForActor, MidiOptions } from "../utils.js";

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

// Interface for advantage/disadvantage flag configuration
export interface AdvantageFlags {
  advantageFlags: string[];
  disadvantageFlags: string[];
  systemRollModeFields: string[];
  // Actor noAdvantage/noDisadvantage flags (prevent advantage/disadvantage on actor's own rolls)
  noAdvantageFlags?: string[];
  noDisadvantageFlags?: string[];
  // Source actor grants flags (checked on workflow.actor, e.g., caster)
  sourceAdvantageFlags?: string[];
  sourceDisadvantageFlags?: string[];
  sourceNoAdvantageFlags?: string[];
  sourceNoDisadvantageFlags?: string[];
  // Track deprecated flags for warning generation
  deprecatedFlags?: Set<string>;
}

// Helper to get flag path with midi-qol prefix
function midiFlag(flag: string): string {
  return `flags.midi-qol.${flag}`;
}

// Helper to emit deprecation warning for deprecated midi-qol flags
function emitDeprecatedFlagWarning(flag: string): void {
  const newFlag = flag
    .replace("advantage.ability.save.", "advantage.save.")
    .replace("advantage.ability.check.", "advantage.check.")
    .replace("disadvantage.ability.save.", "disadvantage.save.")
    .replace("disadvantage.ability.check.", "disadvantage.check.");

  foundry.utils.logCompatibilityWarning(
    `midi-qol | The flag "flags.midi-qol.${flag}" is deprecated. Use "flags.midi-qol.${newFlag}" instead.`,
    { since: "13.0.38", until: "14", once: true }
  );
}

export class RollModifierTracker {

  // ─────────────────────────────────────────────────────────────────
  // Private State
  // ─────────────────────────────────────────────────────────────────

  #advantage: true | undefined = undefined;
  #disadvantage: true | undefined = undefined;
  #advantageSuppressed: boolean = false;
  #disadvantageSuppressed: boolean = false;
  #advantageOverride: boolean = false;
  #disadvantageOverride: boolean = false;
  #autoFail: boolean = false;
  #autoSuccess: boolean = false;
  #min: number = -Infinity;
  #max: number = Infinity;
  #attribution: AdvantageAttributionMap = {};
  /** Legacy Set format: "${type}:${source}" - reference to external Set */
  #legacyAttribution: Set<string>;
  /** Legacy Set format for adv-reminder: "${type}:${source}" - reference to external Set */
  #advReminderAttribution: Set<string>;

  constructor(options?: RollModifierTrackerOptions) {
    this.#legacyAttribution = options?.legacyAttribution ?? new Set();
    this.#advReminderAttribution = options?.advReminderAttribution ?? new Set();
  }

  // ─────────────────────────────────────────────────────────────────
  // Attribution Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Add an attribution entry.
   * @param type - Attribution type (ADV, DIS, NOADV, NODIS, CRIT, etc.)
   * @param source - Source identifier (e.g., 'flanking', 'invisible')
   * @param displayName - Human-readable display name
   */
  addAttribution(type: AdvantageAttributionType, source: string, displayName: string): void {
    // Structured attribution
    this.#attribution[type] ??= {};
    this.#attribution[type]![source] = displayName;
    // Legacy Set formats for backward compatibility
    this.#legacyAttribution.add(`${type}:${source}`);
    this.#advReminderAttribution.add(`${type}:${source}`);
  }

  /**
   * Get the attribution map.
   */
  get attribution(): AdvantageAttributionMap {
    return this.#attribution;
  }

  /**
   * Get legacy Set format: "${type}:${displayName}"
   */
  get legacyAttribution(): Set<string> {
    return this.#legacyAttribution;
  }

  /**
   * Get legacy Set format for adv-reminder: "${type}:${source}"
   */
  get advReminderAttribution(): Set<string> {
    return this.#advReminderAttribution;
  }

  // ─────────────────────────────────────────────────────────────────
  // Advantage Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Add a source of advantage.
   * @param source - Optional source identifier for attribution
   * @param displayName - Optional human-readable display name
   */
  addAdvantage(source?: string, displayName?: string): void {
    this.#advantage = true;
    if (source !== undefined) {
      this.addAttribution('ADV', source, displayName ?? source);
    }
  }

  /**
   * Clear advantage.
   * Preserves suppression state.
   */
  clearAdvantage(): void {
    this.#advantage = undefined;
  }

  /**
   * Suppress advantage.
   * When suppressed, hasAdvantage returns undefined (helps with dnd5e key processing).
   * @param source - Optional source identifier for attribution
   * @param displayName - Optional human-readable display name
   */
  suppressAdvantage(source?: string, displayName?: string): void {
    this.#advantageSuppressed = true;
    if (source !== undefined) {
      this.addAttribution('NOADV', source, displayName ?? source);
    }
  }

  /**
   * Check if advantage is suppressed.
   */
  get advantageSuppressed(): boolean {
    return this.#advantageSuppressed;
  }

  /**
   * Check if there's effective advantage.
   * Returns true if advantage has been added and is not suppressed (or if override is set).
   * Returns undefined if never assigned or if suppressed.
   */
  get hasAdvantage(): true | undefined {
    // Override bypasses suppression
    if (this.#advantageOverride) return this.#advantage;
    if (this.#advantageSuppressed) return undefined;
    return this.#advantage;
  }

  // ─────────────────────────────────────────────────────────────────
  // Disadvantage Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Add a source of disadvantage.
   * @param source - Optional source identifier for attribution
   * @param displayName - Optional human-readable display name
   */
  addDisadvantage(source?: string, displayName?: string): void {
    this.#disadvantage = true;
    if (source !== undefined) {
      this.addAttribution('DIS', source, displayName ?? source);
    }
  }

  /**
   * Clear disadvantage.
   * Preserves suppression state.
   */
  clearDisadvantage(): void {
    this.#disadvantage = undefined;
  }

  /**
   * Suppress disadvantage.
   * When suppressed, hasDisadvantage returns undefined (helps with dnd5e key processing).
   * @param source - Optional source identifier for attribution
   * @param displayName - Optional human-readable display name
   */
  suppressDisadvantage(source?: string, displayName?: string): void {
    this.#disadvantageSuppressed = true;
    if (source !== undefined) {
      this.addAttribution('NODIS', source, displayName ?? source);
    }
  }

  /**
   * Check if disadvantage is suppressed.
   */
  get disadvantageSuppressed(): boolean {
    return this.#disadvantageSuppressed;
  }

  /**
   * Check if there's effective disadvantage.
   * Returns true if disadvantage has been added and is not suppressed (or if override is set).
   * Returns undefined if never assigned or if suppressed.
   */
  get hasDisadvantage(): true | undefined {
    // Override bypasses suppression
    if (this.#disadvantageOverride) return this.#disadvantage;
    if (this.#disadvantageSuppressed) return undefined;
    return this.#disadvantage;
  }

  // ─────────────────────────────────────────────────────────────────
  // Override Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Force advantage, bypassing suppression.
   * Sets advantage to true and marks it as an override.
   * @param source - Optional source identifier for attribution
   * @param displayName - Optional human-readable display name
   */
  setAdvantageOverride(source?: string, displayName?: string): void {
    this.#advantage = true;
    this.#advantageOverride = true;
    if (source !== undefined) {
      this.addAttribution('ADV', source, displayName ?? source);
    }
  }


  /**
   * Force disadvantage, bypassing suppression.
   * Sets disadvantage to true and marks it as an override.
   * @param source - Optional source identifier for attribution
   * @param displayName - Optional human-readable display name
   */
  setDisadvantageOverride(source?: string, displayName?: string): void {
    this.#disadvantage = true;
    this.#disadvantageOverride = true;
    if (source !== undefined) {
      this.addAttribution('DIS', source, displayName ?? source);
    }
  }

  /**
   * Force a specific mode, ignoring suppression.
   * @param mode -1 = disadvantage, 0 = normal, 1 = advantage
   */
  setOverride(mode: -1 | 0 | 1): void {
    // @ts-expect-error CONFIG.Dice.D20Roll not typed
    const ADV_MODE: { DISADVANTAGE, NORMAL, ADVANTAGE } = CONFIG.Dice.D20Roll.ADV_MODE;

    if (mode === ADV_MODE.ADVANTAGE) {
      this.setAdvantageOverride();
    } else if (mode === ADV_MODE.DISADVANTAGE) {
      this.setDisadvantageOverride();
    }
    // mode === 0 (NORMAL) clears both overrides
    if (mode === ADV_MODE.NORMAL) {
      this.#advantageOverride = false;
      this.#disadvantageOverride = false;
    }
  }

  /**
   * Check if advantage override is active.
   */
  get advantageOverride(): boolean {
    return this.#advantageOverride;
  }

  /**
   * Check if disadvantage override is active.
   */
  get disadvantageOverride(): boolean {
    return this.#disadvantageOverride;
  }

  /**
   * Check if any override is active.
   */
  get hasOverride(): boolean {
    return this.#advantageOverride || this.#disadvantageOverride;
  }

  get mode(): number {
    // @ts-expect-error CONFIG.Dice.D20Roll not typed
    const ADV_MODE: { DISADVANTAGE, NORMAL, ADVANTAGE } = CONFIG.Dice.D20Roll.ADV_MODE;
    if (this.#advantageOverride && !this.#disadvantageOverride) return ADV_MODE.ADVANTAGE;
    if (this.#disadvantageOverride && !this.#advantageOverride) return ADV_MODE.DISADVANTAGE;
    if (this.#advantageOverride && this.#disadvantageOverride) return ADV_MODE.NORMAL;
    if (this.hasAdvantage && !this.hasDisadvantage) return ADV_MODE.ADVANTAGE;
    if (this.hasDisadvantage && !this.hasAdvantage) return ADV_MODE.DISADVANTAGE;
    return ADV_MODE.NORMAL;
  }

  // ─────────────────────────────────────────────────────────────────
  // Auto-Fail/Success Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Set auto-fail for this roll.
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  setAutoFail(source: string, displayName?: string): void {
    this.#autoFail = true;
    this.addAttribution('FAIL', source, displayName ?? source);
  }

  /**
   * Check if auto-fail is set.
   */
  get autoFail(): boolean {
    return this.#autoFail;
  }

  /**
   * Set auto-success for this roll.
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  setAutoSuccess(source: string, displayName?: string): void {
    this.#autoSuccess = true;
    this.addAttribution('SUCCESS', source, displayName ?? source);
  }

  /**
   * Check if auto-success is set.
   */
  get autoSuccess(): boolean {
    return this.#autoSuccess;
  }

  // ─────────────────────────────────────────────────────────────────
  // Min/Max Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Set minimum roll value.
   * Only updates if newMin is higher than current min.
   * @param value - Minimum roll value
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  setMin(value: number, source: string, displayName?: string): void {
    if (value > this.#min) {
      this.#min = value;
      this.addAttribution('MIN', source, displayName ?? `${source} (${value})`);
    }
  }

  /**
   * Get minimum roll value.
   * Returns -Infinity if not set.
   */
  get min(): number {
    return this.#min;
  }

  /**
   * Check if a minimum is set.
   */
  get hasMin(): boolean {
    return this.#min > -Infinity;
  }

  /**
   * Force set minimum roll value, ignoring current value.
   * @param value - Minimum roll value
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  overrideMin(value: number, source: string, displayName?: string): void {
    this.#min = value;
    this.addAttribution('MIN', source, displayName ?? `${source} (${value})`);
  }

  /**
   * Set maximum roll value.
   * Only updates if newMax is lower than current max.
   * @param value - Maximum roll value
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  setMax(value: number, source: string, displayName?: string): void {
    if (value < this.#max) {
      this.#max = value;
      this.addAttribution('MAX', source, displayName ?? `${source} (${value})`);
    }
  }

  /**
   * Get maximum roll value.
   * Returns Infinity if not set.
   */
  get max(): number {
    return this.#max;
  }

  /**
   * Force set maximum roll value, ignoring current value.
   * @param value - Maximum roll value
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  overrideMax(value: number, source: string, displayName?: string): void {
    this.#max = value;
    this.addAttribution('MAX', source, displayName ?? `${source} (${value})`);
  }

  /**
   * Check if a maximum is set.
   */
  get hasMax(): boolean {
    return this.#max < Infinity;
  }

  // ─────────────────────────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Reset all state to initial values.
   * @param options - Optional new references for legacy Sets
   */
  reset(options?: RollModifierTrackerOptions): void {
    this.#advantage = undefined;
    this.#disadvantage = undefined;
    this.#advantageSuppressed = false;
    this.#disadvantageSuppressed = false;
    this.#advantageOverride = false;
    this.#disadvantageOverride = false;
    this.#autoFail = false;
    this.#autoSuccess = false;
    this.#min = -Infinity;
    this.#max = Infinity;
    this.#attribution = {};
    // Handle legacy attribution Set
    if (options?.legacyAttribution) {
      if (options.legacyAttribution !== this.#legacyAttribution) {
        this.#legacyAttribution.clear();
        this.#legacyAttribution = options.legacyAttribution;
      }
    } else {
      this.#legacyAttribution.clear();
    }
    // Handle advReminder attribution Set
    if (options?.advReminderAttribution) {
      if (options.advReminderAttribution !== this.#advReminderAttribution) {
        this.#advReminderAttribution.clear();
        this.#advReminderAttribution = options.advReminderAttribution;
      }
    } else {
      this.#advReminderAttribution.clear();
    }
  }
  processKeys(config: RollProcessConfig = {}) {
    if (!config?.event) return;
    //@ts-expect-error - game.system.utils not typed
    const areKeysPressed = game.system.utils.areKeysPressed;

    const keys = {
      normal: areKeysPressed(config.event, "skipDialogNormal"),
      advantage: areKeysPressed(config.event, "skipDialogAdvantage"),
      disadvantage: areKeysPressed(config.event, "skipDialogDisadvantage")
    };
    // Special case handling so that shift+alt+ctl will force a normal roll
    if (keys.advantage && keys.disadvantage && keys.normal) {
      console.error("Overriding advantage/disadvantage");
      this.setAdvantageOverride("forcedKeyPress", i18n("midi-qol.ForcedKeyPress"));
      this.setDisadvantageOverride("forcedKeyPress", i18n("midi-qol.ForcedKeyPress"));
      config.advantage = false;
      config.disadvantage = false;
      config.event = undefined;
    } else {
      if (keys.disadvantage) {
        const source = keys.normal ? "forcedKeyPress" : "keyPress";
        if (keys.normal)
          this.setDisadvantageOverride(source, i18n("midi-qol.KeyPress"));
        else
          this.addDisadvantage(source, i18n("midi-qol.KeyPress"));
      }
      if (keys.advantage) {
        const source = keys.normal ? "forcedKeyPress" : "keyPress";
        if (keys.normal)
          this.setAdvantageOverride(source, i18n("midi-qol.ForcedKeyPress"));
        else
          this.addAdvantage(source, i18n("midi-qol.KeyPress"));
      }
    }

  }
}

/**
 * Centralized function for processing advantage/disadvantage flags.
 * Handles both actor flags and source actor grants flags.
 * Populates and returns a RollModifierTracker instance with attribution tracking.
 */
export async function computeAdvantageFlags(
  actor: Actor.Implementation,
  flags: AdvantageFlags,
  options: MidiOptions,
  tracker?: RollModifierTracker
): Promise<RollModifierTracker> {
  tracker ??= new RollModifierTracker();

  // Seed with any pre-existing advantage/disadvantage from options
  if (options.advantage) {
    tracker.addAdvantage("options", "Options");
  }
  if (options.disadvantage) {
    tracker.addDisadvantage("options", "Options");
  }

  const conditionData = createConditionData({
    workflow: options.workflow,
    target: tokenForActor(actor),
    actor,
    item: options.item ?? options.itemUuid ?? options.saveItem ?? options.saveItemUuid
  });

  // Check actor's advantage flags
  for (const flag of flags.advantageFlags) {
    if (await evalAllConditionsAsync(actor, midiFlag(flag), conditionData, false)) {
      if (flags.deprecatedFlags?.has(flag)) {
        emitDeprecatedFlagWarning(flag);
      }
      const source = flag.replace(/^advantage\./, '');
      tracker.addAdvantage(source, flag);
      break;
    }
  }

  // Check actor's disadvantage flags
  for (const flag of flags.disadvantageFlags) {
    if (await evalAllConditionsAsync(actor, midiFlag(flag), conditionData, false)) {
      if (flags.deprecatedFlags?.has(flag)) {
        emitDeprecatedFlagWarning(flag);
      }
      const source = flag.replace(/^disadvantage\./, '');
      tracker.addDisadvantage(source, flag);
      break;
    }
  }

  // Check source actor grants flags
  const sourceActor = options.sourceActor ?? options.workflow?.actor;
  const sourceToken = options.sourceToken ?? (sourceActor ? tokenForActor(sourceActor) : undefined);

  // Check actor's noAdvantage flags
  if (flags.noAdvantageFlags?.length) {
    for (const flag of flags.noAdvantageFlags) {
      if (await evalAllConditionsAsync(actor, midiFlag(flag), conditionData, false)) {
        tracker.suppressAdvantage(flag, flag);
        break;
      }
    }
  }

  // Check actor's noDisadvantage flags
  if (flags.noDisadvantageFlags?.length) {
    for (const flag of flags.noDisadvantageFlags) {
      if (await evalAllConditionsAsync(actor, midiFlag(flag), conditionData, false)) {
        tracker.suppressDisadvantage(flag, flag);
        break;
      }
    }
  }

  if (sourceActor) {
    const sourceConditionData = createConditionData({
      workflow: options.workflow,
      target: tokenForActor(actor),
      actor: sourceActor,
      token: sourceToken,
      item: options.item ?? options.itemUuid ?? options.saveItem ?? options.saveItemUuid
    });

    const sourceName = sourceToken?.name ?? sourceActor.name ?? "";

    if (flags.sourceAdvantageFlags?.length) {
      for (const flag of flags.sourceAdvantageFlags) {
        if (await evalAllConditionsAsync(sourceActor, midiFlag(flag), sourceConditionData, false)) {
          tracker.addAdvantage(`${flag} ${sourceName}`, `${flag} ${sourceName}`);
          break;
        }
      }
    }

    if (flags.sourceDisadvantageFlags?.length) {
      for (const flag of flags.sourceDisadvantageFlags) {
        if (await evalAllConditionsAsync(sourceActor, midiFlag(flag), sourceConditionData, false)) {
          tracker.addDisadvantage(`${flag} ${sourceName}`, `${flag} ${sourceName}`);
          break;
        }
      }
    }

    if (flags.sourceNoAdvantageFlags?.length) {
      for (const flag of flags.sourceNoAdvantageFlags) {
        if (await evalAllConditionsAsync(sourceActor, midiFlag(flag), sourceConditionData, false)) {
          tracker.suppressAdvantage(`${flag} ${sourceName}`, `${flag} ${sourceName}`);
          break;
        }
      }
    }

    if (flags.sourceNoDisadvantageFlags?.length) {
      for (const flag of flags.sourceNoDisadvantageFlags) {
        if (await evalAllConditionsAsync(sourceActor, midiFlag(flag), sourceConditionData, false)) {
          tracker.suppressDisadvantage(`${flag} ${sourceName}`, `${flag} ${sourceName}`);
          break;
        }
      }
    }
  }

  // Check system roll mode fields
  if (flags.systemRollModeFields?.length) {
    for (const field of flags.systemRollModeFields) {
      const rollMode = foundry.utils.getProperty(actor.system, field);
      if (rollMode === 1) {
        tracker.addAdvantage("system.rollMode", "System Roll Mode");
      } else if (rollMode === -1) {
        tracker.addDisadvantage("system.rollMode", "System Roll Mode");
      }
    }
  }

  return tracker;
}

/**
 * Evaluate roll modifier flags and populate the tracker with autoFail/autoSuccess/min/max.
 * This is the flag evaluation step - call applyRollModifiers afterwards to apply to config.
 *
 * @param actor - The actor to evaluate flags for
 * @param flags - The flags to evaluate (failFlags, successFlags, minFlags, maxFlags)
 * @param tracker - The RollModifierTracker to populate
 * @param options - Additional options including workflow for condition evaluation
 */
export function computeRollModifiers(
  actor: Actor.Implementation,
  flags: RollModifierFlags,
  tracker: RollModifierTracker,
  options?: { workflow?: any }
): void {
  const conditionData = createConditionData({ workflow: options?.workflow, actor, target: tokenForActor(actor) });

  // Evaluate auto-fail flags
  for (const flag of flags.failFlags) {
    if (evalAllConditions(actor, midiFlag(flag), conditionData, false)) {
      tracker.setAutoFail(flag, flag);
      break;
    }
  }

  // Evaluate auto-success flags
  for (const flag of flags.successFlags) {
    if (evalAllConditions(actor, midiFlag(flag), conditionData, false)) {
      tracker.setAutoSuccess(flag, flag);
      break;
    }
  }

  // Evaluate max flags
  for (const flag of flags.maxFlags) {
    const value = evalAllConditions(actor, midiFlag(flag), conditionData, Infinity);
    if (typeof value !== "boolean" && Number.isNumeric(value)) {
      const numValue = Number(value);
      tracker.setMax(numValue, flag);
    }
  }

  // Evaluate min flags
  for (const flag of flags.minFlags) {
    const value = evalAllConditions(actor, midiFlag(flag), conditionData, -Infinity);
    if (typeof value !== "boolean" && Number.isNumeric(value)) {
      const numValue = Number(value);
      tracker.setMin(numValue, flag);
    }
  }
}

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
export function applyRollModifiers(
  tracker: RollModifierTracker,
  config: RollProcessConfig,
  dialog: RollDialogConfig,
  options?: { failValue?: number, successValue?: number }
): RollModifierResult {
  const failValue = options?.failValue ?? 1;
  const successValue = options?.successValue ?? 99;

  // Get values from tracker
  const autoFail = tracker.autoFail;
  const autoSuccess = tracker.autoSuccess;
  const max = tracker.max;
  const min = tracker.min;

  const modifiers: RollModifierResult = {
    autoFail,
    autoSuccess,
    max: max === Infinity ? undefined : max,
    min: min === -Infinity ? undefined : min
  };

  // Apply modifiers to roll config
  config.rolls ??= [];
  if (!config.rolls.length) {
    config.rolls.push({ options: {} });
  }

  if (autoFail) {
    dialog.configure = false;
    config.rolls = [{ options: { maximum: failValue }, parts: [] }];
  } else if (autoSuccess) {
    dialog.configure = false;
    config.rolls = [{ options: { minimum: successValue }, parts: [] }];
  } else {
    for (const roll of config.rolls) {
      roll.options ??= {};
      if (max < Infinity) {
        roll.options.maximum = Math.min(roll.options.maximum ?? Infinity, max);
      }
      if (min > -Infinity) {
        roll.options.minimum = Math.max(roll.options.minimum ?? -Infinity, min);
      }
    }
  }

  return modifiers;
}
