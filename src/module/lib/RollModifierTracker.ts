/**
 * Tracks roll modifiers: advantage/disadvantage, auto-fail/success, min/max with attribution.
 */

import { RollDialogConfig, RollProcessConfig } from "../../globals.js";
import { GameSystemConfig, i18n, i18nFormat } from "../../midi-qol.js";
import { createConditionData, evalAllConditions, evalAllConditionsAsync, tokenForActor, MidiOptions } from "../utils.js";

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
}

// Helper to get flag path with midi-qol prefix
function midiFlag(flag: string): string {
  return `flags.midi-qol.${flag}`;
}


// Helper to resolve a short key (e.g., "mwak", "str", "acr") to a human-readable label
function resolveKeyLabel(key: string): string {
  if (key === "all") return "All";
  const abilityLabel = GameSystemConfig.abilities?.[key]?.label;
  if (abilityLabel) return abilityLabel;
  const skillLabel = GameSystemConfig.skills?.[key]?.label;
  if (skillLabel) return skillLabel;
  const actionLabel = GameSystemConfig.itemActionTypes?.[key];
  if (actionLabel) return actionLabel;
  const dmgLabel = GameSystemConfig.damageTypes?.[key]?.label;
  if (dmgLabel) return dmgLabel;
  const toolLabel = globalThis.dnd5e?.documents?.Trait?.keyLabel?.(`tool:${key}`);
  if (toolLabel) return toolLabel;
  return key;
}

// Helper to get a human-readable display name for a midi-qol flag path
export function getFlagDisplayName(flag: string): string {
  // Tier 1: Check DAE localizationMap (covers ~95% of template-generated flags)
  const lmEntry = globalThis.DAE?.localizationMap?.[midiFlag(flag)];
  if (lmEntry?.name) return lmEntry.name;

  if (!game.i18n) return flag;

  // Tier 2: Check for exact flagTemplate i18n key
  const exactKey = `midi-qol.flagTemplate.${flag}.name`;
  const exactResult = game.i18n.localize(exactKey);
  if (exactResult !== exactKey) {
    // If the template contains {label} but we have no label segment, strip the placeholder
    if (exactResult.includes("{label}")) return exactResult.replace(/\s*\(\{label\}\)/, "");
    return exactResult;
  }

  // Tier 3: Split on last "." and try prefix template + resolved label
  const lastDot = flag.lastIndexOf(".");
  if (lastDot > 0) {
    const prefix = flag.substring(0, lastDot);
    const lastElement = flag.substring(lastDot + 1);
    const prefixKey = `midi-qol.flagTemplate.${prefix}.name`;
    const prefixResult = game.i18n.localize(prefixKey);
    if (prefixResult !== prefixKey) {
      const label = resolveKeyLabel(lastElement);
      return i18nFormat(prefixKey, { label });
    }
  }

  // Tier 4: Fallback to raw flag
  return flag;
}

// ─────────────────────────────────────────────────────────────────
// AdvantageDisadvantageTracker Class
// ─────────────────────────────────────────────────────────────────

type AdvantageType = 'ADV' | 'DIS';
type SuppressionType = 'NOADV' | 'NODIS';

/**
 * Tracks a single advantage or disadvantage state with attribution.
 */
export class AdvantageDisadvantageTracker {
  #active = false;
  #suppressed = false;
  #override = false;

  readonly #type: AdvantageType;
  readonly #suppressionType: SuppressionType;
  readonly #addAttribution: AttributionCallback;

  constructor(type: AdvantageType, addAttribution: AttributionCallback) {
    this.#type = type;
    this.#suppressionType = type === 'ADV' ? 'NOADV' : 'NODIS';
    this.#addAttribution = addAttribution;
  }

  // ─────────────────────────────────────────────────────────────────
  // State Inspection
  // ─────────────────────────────────────────────────────────────────

  /** Get complete state snapshot */
  get get(): Readonly<{ active: boolean; suppressed: boolean; override: boolean }> {
    return { active: this.#active, suppressed: this.#suppressed, override: this.#override };
  }

  // ─────────────────────────────────────────────────────────────────
  // Query Methods
  // ─────────────────────────────────────────────────────────────────

  /** Whether at least one source has been added */
  get isAdded(): boolean { return this.#active; }

  /** Whether suppressed by a blocking flag */
  get isSuppressed(): boolean { return this.#suppressed; }

  /** Whether override is set (bypasses suppression) */
  get hasOverride(): boolean { return this.#override; }

  /**
   * Computed final state.
   * Returns true if active and not suppressed (or if override is set).
   * Returns undefined if not active or if suppressed.
   */
  get isActive(): true | undefined {
    if (this.#override) return this.#active || undefined;
    if (this.#suppressed) return undefined;
    return this.#active || undefined;
  }

  // ─────────────────────────────────────────────────────────────────
  // Mutation Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Add a source of advantage/disadvantage.
   * @param source - Optional source identifier for attribution
   * @param displayName - Optional human-readable display name
   */
  add(source?: string, displayName?: string): void {
    this.#active = true;
    if (source !== undefined) {
      this.#addAttribution(this.#type, source, displayName ?? source);
    }
  }

  /**
   * Clear active state.
   * Preserves suppression state.
   */
  clear(): void {
    this.#active = false;
  }

  /**
   * Suppress this modifier.
   * When suppressed, isActive returns undefined.
   * @param source - Optional source identifier for attribution
   * @param displayName - Optional human-readable display name
   */
  suppress(source?: string, displayName?: string): void {
    this.#suppressed = true;
    if (source !== undefined) {
      this.#addAttribution(this.#suppressionType, source, displayName ?? source);
    }
  }

  /**
   * Force this modifier, bypassing suppression.
   * @param source - Optional source identifier for attribution
   * @param displayName - Optional human-readable display name
   */
  setOverride(source?: string, displayName?: string): void {
    this.#active = true;
    this.#override = true;
    if (source !== undefined) {
      this.#addAttribution(this.#type, source, displayName ?? source);
    }
  }

  /**
   * Clear override state.
   */
  clearOverride(): void {
    this.#override = false;
  }

  /**
   * Reset all state to initial values.
   */
  reset(): void {
    this.#active = false;
    this.#suppressed = false;
    this.#override = false;
  }

  /** Restore state from serialized data */
  restore(state: { active: boolean; suppressed: boolean; override: boolean }): void {
    this.#active = state.active;
    this.#suppressed = state.suppressed;
    this.#override = state.override;
  }
}

// ─────────────────────────────────────────────────────────────────
// CriticalFumbleTracker Class
// ─────────────────────────────────────────────────────────────────

type CritType = 'CRIT' | 'FUMBLE';
type NoCritType = 'NOCRIT' | 'NOFUMBLE';

/**
 * Tracks critical or fumble state with attribution.
 */
export class CriticalFumbleTracker {
  #natural = false;
  #forced = false;
  #suppressed = false;
  #override: boolean | undefined = undefined;

  readonly #type: CritType;
  readonly #noType: NoCritType;
  readonly #addAttribution: AttributionCallback;

  constructor(type: CritType, addAttribution: AttributionCallback) {
    this.#type = type;
    this.#noType = type === 'CRIT' ? 'NOCRIT' : 'NOFUMBLE';
    this.#addAttribution = addAttribution;
  }

  // ─────────────────────────────────────────────────────────────────
  // State Inspection
  // ─────────────────────────────────────────────────────────────────

  /** Get complete state snapshot */
  get get(): Readonly<{ natural: boolean; forced: boolean; suppressed: boolean; override: boolean | undefined }> {
    return {
      natural: this.#natural,
      forced: this.#forced,
      suppressed: this.#suppressed,
      override: this.#override
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Query Methods
  // ─────────────────────────────────────────────────────────────────

  /** Whether natural crit/fumble occurred from dice */
  get isNatural(): boolean { return this.#natural; }

  /** Whether forced by a flag */
  get isForced(): boolean { return this.#forced; }

  /** Whether suppressed by a blocking flag */
  get isSuppressed(): boolean { return this.#suppressed; }

  /** Whether override is set */
  get hasOverride(): boolean { return this.#override !== undefined; }

  /** Get override value (undefined if not set) */
  get overrideValue(): boolean | undefined { return this.#override; }

  /**
   * Computed final state.
   * Priority: override > suppressed > (natural || forced)
   */
  get isActive(): boolean {
    if (this.#override !== undefined) return this.#override;
    if (this.#suppressed) return false;
    return this.#natural || this.#forced;
  }

  // ─────────────────────────────────────────────────────────────────
  // Mutation Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Set natural crit/fumble from dice roll.
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  setNatural(source: string, displayName?: string): void {
    this.#natural = true;
    this.#addAttribution(this.#type, source, displayName ?? source);
  }

  /**
   * Force crit/fumble from a flag.
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  force(source: string, displayName?: string): void {
    this.#forced = true;
    this.#addAttribution(this.#type, source, displayName ?? source);
  }

  /**
   * Suppress (prevent) crit/fumble.
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  suppress(source: string, displayName?: string): void {
    this.#suppressed = true;
    this.#addAttribution(this.#noType, source, displayName ?? source);
  }

  /**
   * Override crit/fumble state absolutely.
   * @param value - true to force, false to prevent
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  setOverride(value: boolean, source: string, displayName?: string): void {
    this.#override = value;
    this.#addAttribution(value ? this.#type : this.#noType, source, displayName ?? source);
  }

  /**
   * Reset all state to initial values.
   */
  reset(): void {
    this.#natural = false;
    this.#forced = false;
    this.#suppressed = false;
    this.#override = undefined;
  }

  /** Restore state from serialized data */
  restore(state: { natural: boolean; forced: boolean; suppressed: boolean; override: boolean | undefined }): void {
    this.#natural = state.natural;
    this.#forced = state.forced;
    this.#suppressed = state.suppressed;
    this.#override = state.override;
  }
}

// ─────────────────────────────────────────────────────────────────
// RollValueTracker Class
// ─────────────────────────────────────────────────────────────────

/**
 * Tracks roll value modifiers: auto-fail, auto-success, min, max.
 */
export class RollValueTracker {
  #autoFail = false;
  #autoSuccess = false;
  #min = -Infinity;
  #max = Infinity;

  readonly #addAttribution: AttributionCallback;

  constructor(addAttribution: AttributionCallback) {
    this.#addAttribution = addAttribution;
  }

  // ─────────────────────────────────────────────────────────────────
  // State Inspection
  // ─────────────────────────────────────────────────────────────────

  /** Get complete state snapshot */
  get get(): Readonly<{ willFail: boolean; willSucceed: boolean; minValue: number; maxValue: number }> {
    return {
      willFail: this.#autoFail,
      willSucceed: this.#autoSuccess,
      minValue: this.#min,
      maxValue: this.#max
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Query Methods
  // ─────────────────────────────────────────────────────────────────

  get willFail(): boolean { return this.#autoFail; }
  get willSucceed(): boolean { return this.#autoSuccess; }
  get minValue(): number { return this.#min; }
  get maxValue(): number { return this.#max; }
  get hasMin(): boolean { return this.#min > -Infinity; }
  get hasMax(): boolean { return this.#max < Infinity; }

  // ─────────────────────────────────────────────────────────────────
  // Mutation Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Set auto-fail for this roll.
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  fail(source: string, displayName?: string): void {
    this.#autoFail = true;
    this.#addAttribution('FAIL', source, displayName ?? source);
  }

  /**
   * Set auto-success for this roll.
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  succeed(source: string, displayName?: string): void {
    this.#autoSuccess = true;
    this.#addAttribution('SUCCESS', source, displayName ?? source);
  }

  /**
   * Set minimum roll value (only if higher than current).
   * @param value - Minimum roll value
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  min(value: number, source: string, displayName?: string): void {
    if (value > this.#min) {
      this.#min = value;
      this.#addAttribution('MIN', source, displayName ?? `${source} (${value})`);
    }
  }

  /**
   * Force set minimum roll value, ignoring current value.
   * @param value - Minimum roll value
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  forceMin(value: number, source: string, displayName?: string): void {
    this.#min = value;
    this.#addAttribution('MIN', source, displayName ?? `${source} (${value})`);
  }

  /**
   * Set maximum roll value (only if lower than current).
   * @param value - Maximum roll value
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  max(value: number, source: string, displayName?: string): void {
    if (value < this.#max) {
      this.#max = value;
      this.#addAttribution('MAX', source, displayName ?? `${source} (${value})`);
    }
  }

  /**
   * Force set maximum roll value, ignoring current value.
   * @param value - Maximum roll value
   * @param source - Source identifier for attribution
   * @param displayName - Human-readable display name
   */
  forceMax(value: number, source: string, displayName?: string): void {
    this.#max = value;
    this.#addAttribution('MAX', source, displayName ?? `${source} (${value})`);
  }

  /**
   * Reset all state to initial values.
   */
  reset(): void {
    this.#autoFail = false;
    this.#autoSuccess = false;
    this.#min = -Infinity;
    this.#max = Infinity;
  }

  /** Restore state from serialized data */
  restore(state: { willFail: boolean; willSucceed: boolean; minValue: number; maxValue: number }): void {
    this.#autoFail = state.willFail;
    this.#autoSuccess = state.willSucceed;
    this.#min = state.minValue;
    this.#max = state.maxValue;
  }
}

// ─────────────────────────────────────────────────────────────────
// RollModifierTracker Class
// ─────────────────────────────────────────────────────────────────

export class RollModifierTracker {

  // ─────────────────────────────────────────────────────────────────
  // Sub-trackers
  // ─────────────────────────────────────────────────────────────────

  readonly advantage: AdvantageDisadvantageTracker;
  readonly disadvantage: AdvantageDisadvantageTracker;
  readonly critical: CriticalFumbleTracker;
  readonly fumble: CriticalFumbleTracker;
  readonly modifiers: RollValueTracker;

  // ─────────────────────────────────────────────────────────────────
  // Attribution
  // ─────────────────────────────────────────────────────────────────

  #attribution: AdvantageAttributionMap = {};
  /** Legacy Set format: "${type}:${source}" */
  #legacyAttribution: Set<string> = new Set();
  /** Legacy Set format for adv-reminder: "${type}:${source}" */
  #advReminderAttribution: Set<string> = new Set();

  constructor() {

    // Create sub-trackers with bound attribution method
    const addAttr = this.addAttribution.bind(this);
    this.advantage = new AdvantageDisadvantageTracker('ADV', addAttr);
    this.disadvantage = new AdvantageDisadvantageTracker('DIS', addAttr);
    this.critical = new CriticalFumbleTracker('CRIT', addAttr);
    this.fumble = new CriticalFumbleTracker('FUMBLE', addAttr);
    this.modifiers = new RollValueTracker(addAttr);
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
    this.#attribution[type] ??= {};
    this.#attribution[type]![source] = displayName;
    this.#legacyAttribution.add(`${type}:${source}`);
    this.#advReminderAttribution.add(`${type}:${source}`);
  }

  /** Get the attribution map */
  get attribution(): AdvantageAttributionMap {
    return this.#attribution;
  }

  /** Get legacy Set format: "${type}:${displayName}" */
  get legacyAttribution(): Set<string> {
    return this.#legacyAttribution;
  }

  /** Get legacy Set format for adv-reminder: "${type}:${source}" */
  get advReminderAttribution(): Set<string> {
    return this.#advReminderAttribution;
  }

  // ─────────────────────────────────────────────────────────────────
  // Combined Mode
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the combined advantage/disadvantage mode.
   * @returns ADV_MODE.ADVANTAGE, ADV_MODE.DISADVANTAGE, or ADV_MODE.NORMAL
   */
  get advantageMode(): number {
    // @ts-expect-error CONFIG.Dice.D20Roll not typed
    const ADV_MODE: { DISADVANTAGE: number, NORMAL: number, ADVANTAGE: number } = CONFIG.Dice.D20Roll.ADV_MODE;
    if (this.advantage.hasOverride && !this.disadvantage.hasOverride) return ADV_MODE.ADVANTAGE;
    if (this.disadvantage.hasOverride && !this.advantage.hasOverride) return ADV_MODE.DISADVANTAGE;
    if (this.advantage.hasOverride && this.disadvantage.hasOverride) return ADV_MODE.NORMAL;
    if (this.advantage.isActive && !this.disadvantage.isActive) return ADV_MODE.ADVANTAGE;
    if (this.disadvantage.isActive && !this.advantage.isActive) return ADV_MODE.DISADVANTAGE;
    return ADV_MODE.NORMAL;
  }

  // ─────────────────────────────────────────────────────────────────
  // Convenience Getters (delegate to sub-trackers)
  // ─────────────────────────────────────────────────────────────────

  /** Check if there's effective advantage */
  get hasAdvantage(): true | undefined {
    return this.advantage.isActive;
  }

  /** Check if there's effective disadvantage */
  get hasDisadvantage(): true | undefined {
    return this.disadvantage.isActive;
  }

  /** Computed final critical state */
  get isCritical(): boolean {
    return this.critical.isActive;
  }

  /** Computed final fumble state */
  get isFumble(): boolean {
    return this.fumble.isActive;
  }

  // ─────────────────────────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Reset all state to initial values.
   */
  reset(): void {
    this.advantage.reset();
    this.disadvantage.reset();
    this.critical.reset();
    this.fumble.reset();
    this.modifiers.reset();
    this.#attribution = {};
    this.#legacyAttribution.clear();
    this.#advReminderAttribution.clear();
  }

  // ─────────────────────────────────────────────────────────────────
  // Serialization
  // ─────────────────────────────────────────────────────────────────

  /** Serialize tracker state to a plain object for persistence */
  toJSON(): object {
    return {
      advantage: this.advantage.get,
      disadvantage: this.disadvantage.get,
      critical: this.critical.get,
      fumble: this.fumble.get,
      modifiers: this.modifiers.get,
      attribution: this.#attribution,
      legacyAttribution: Array.from(this.#legacyAttribution),
      advReminderAttribution: Array.from(this.#advReminderAttribution)
    };
  }

  /** Restore tracker state from serialized data */
  restore(data: ReturnType<RollModifierTracker["toJSON"]> & Record<string, any>): void {
    if (!data) return;
    if (data.advantage) this.advantage.restore(data.advantage);
    if (data.disadvantage) this.disadvantage.restore(data.disadvantage);
    if (data.critical) this.critical.restore(data.critical);
    if (data.fumble) this.fumble.restore(data.fumble);
    if (data.modifiers) this.modifiers.restore(data.modifiers);
    if (data.attribution) this.#attribution = data.attribution;
    if (data.legacyAttribution) this.#legacyAttribution = new Set(data.legacyAttribution);
    if (data.advReminderAttribution) this.#advReminderAttribution = new Set(data.advReminderAttribution);
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
      this.advantage.setOverride("forcedKeyPress", i18n("midi-qol.ForcedKeyPress"));
      this.disadvantage.setOverride("forcedKeyPress", i18n("midi-qol.ForcedKeyPress"));
      config.advantage = false;
      config.disadvantage = false;
      config.event = undefined;
    } else {
      if (keys.disadvantage) {
        const source = keys.normal ? "forcedKeyPress" : "keyPress";
        if (keys.normal)
          this.disadvantage.setOverride(source, i18n("midi-qol.KeyPress"));
        else
          this.disadvantage.add(source, i18n("midi-qol.KeyPress"));
      }
      if (keys.advantage) {
        const source = keys.normal ? "forcedKeyPress" : "keyPress";
        if (keys.normal)
          this.advantage.setOverride(source, i18n("midi-qol.ForcedKeyPress"));
        else
          this.advantage.add(source, i18n("midi-qol.KeyPress"));
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
    tracker.advantage.add("options", "Options");
  }
  if (options.disadvantage) {
    tracker.disadvantage.add("options", "Options");
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
      const source = flag.replace(/^advantage\./, '');
      tracker.advantage.add(source, getFlagDisplayName(flag));
      break;
    }
  }

  // Check actor's disadvantage flags
  for (const flag of flags.disadvantageFlags) {
    if (await evalAllConditionsAsync(actor, midiFlag(flag), conditionData, false)) {
      const source = flag.replace(/^disadvantage\./, '');
      tracker.disadvantage.add(source, getFlagDisplayName(flag));
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
        tracker.advantage.suppress(flag, getFlagDisplayName(flag));
        break;
      }
    }
  }

  // Check actor's noDisadvantage flags
  if (flags.noDisadvantageFlags?.length) {
    for (const flag of flags.noDisadvantageFlags) {
      if (await evalAllConditionsAsync(actor, midiFlag(flag), conditionData, false)) {
        tracker.disadvantage.suppress(flag, getFlagDisplayName(flag));
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
          tracker.advantage.add(`${flag} ${sourceName}`, `${getFlagDisplayName(flag)} (${sourceName})`);
          break;
        }
      }
    }

    if (flags.sourceDisadvantageFlags?.length) {
      for (const flag of flags.sourceDisadvantageFlags) {
        if (await evalAllConditionsAsync(sourceActor, midiFlag(flag), sourceConditionData, false)) {
          tracker.disadvantage.add(`${flag} ${sourceName}`, `${getFlagDisplayName(flag)} (${sourceName})`);
          break;
        }
      }
    }

    if (flags.sourceNoAdvantageFlags?.length) {
      for (const flag of flags.sourceNoAdvantageFlags) {
        if (await evalAllConditionsAsync(sourceActor, midiFlag(flag), sourceConditionData, false)) {
          tracker.advantage.suppress(`${flag} ${sourceName}`, `${getFlagDisplayName(flag)} (${sourceName})`);
          break;
        }
      }
    }

    if (flags.sourceNoDisadvantageFlags?.length) {
      for (const flag of flags.sourceNoDisadvantageFlags) {
        if (await evalAllConditionsAsync(sourceActor, midiFlag(flag), sourceConditionData, false)) {
          tracker.disadvantage.suppress(`${flag} ${sourceName}`, `${getFlagDisplayName(flag)} (${sourceName})`);
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
        tracker.advantage.add("system.rollMode", "System Roll Mode");
      } else if (rollMode === -1) {
        tracker.disadvantage.add("system.rollMode", "System Roll Mode");
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
      tracker.modifiers.fail(flag, getFlagDisplayName(flag));
      break;
    }
  }

  // Evaluate auto-success flags
  for (const flag of flags.successFlags) {
    if (evalAllConditions(actor, midiFlag(flag), conditionData, false)) {
      tracker.modifiers.succeed(flag, getFlagDisplayName(flag));
      break;
    }
  }

  // Evaluate max flags
  for (const flag of flags.maxFlags) {
    const value = evalAllConditions(actor, midiFlag(flag), conditionData, Infinity);
    if (typeof value !== "boolean" && Number.isNumeric(value)) {
      const numValue = Number(value);
      tracker.modifiers.max(numValue, getFlagDisplayName(flag));
    }
  }

  // Evaluate min flags
  for (const flag of flags.minFlags) {
    const value = evalAllConditions(actor, midiFlag(flag), conditionData, -Infinity);
    if (typeof value !== "boolean" && Number.isNumeric(value)) {
      const numValue = Number(value);
      tracker.modifiers.min(numValue, getFlagDisplayName(flag));
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
  const autoFail = tracker.modifiers.willFail;
  const autoSuccess = tracker.modifiers.willSucceed;
  const max = tracker.modifiers.maxValue;
  const min = tracker.modifiers.minValue;

  const result: RollModifierResult = {
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

  return result;
}

/**
 * Evaluate critical/fumble modifier flags and populate the tracker.
 * Handles actor flags for critical/noCritical/fumble/noFumble.
 *
 * @param actor - The actor to evaluate flags for
 * @param flags - The flags to evaluate
 * @param tracker - The RollModifierTracker to populate
 * @param options - Additional options including workflow for condition evaluation
 */
export async function computeCriticalModifiers(
  actor: Actor.Implementation,
  flags: CriticalModifierFlags,
  tracker: RollModifierTracker,
  options?: { workflow?: any, actionType?: string }
): Promise<void> {
  const conditionData = createConditionData({ workflow: options?.workflow, actor, target: tokenForActor(actor) });

  // Evaluate critical flags - force critical
  for (const flag of flags.criticalFlags) {
    if (await evalAllConditionsAsync(actor, midiFlag(flag), conditionData, false)) {
      tracker.critical.force(flag, getFlagDisplayName(flag));
      break;
    }
  }

  // Evaluate noCritical flags - suppress critical
  for (const flag of flags.noCriticalFlags) {
    if (await evalAllConditionsAsync(actor, midiFlag(flag), conditionData, false)) {
      tracker.critical.suppress(flag, getFlagDisplayName(flag));
      break;
    }
  }

  // Evaluate fumble flags - force fumble
  for (const flag of flags.fumbleFlags) {
    if (await evalAllConditionsAsync(actor, midiFlag(flag), conditionData, false)) {
      tracker.fumble.force(flag, getFlagDisplayName(flag));
      break;
    }
  }

  // Evaluate noFumble flags - suppress fumble
  for (const flag of flags.noFumbleFlags) {
    if (await evalAllConditionsAsync(actor, midiFlag(flag), conditionData, false)) {
      tracker.fumble.suppress(flag, getFlagDisplayName(flag));
      break;
    }
  }
}

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
export async function computeTargetCriticalModifiers(
  targetActor: Actor.Implementation,
  targetName: string,
  flags: CriticalModifierFlags,
  tracker: RollModifierTracker,
  options?: { workflow?: any, sourceActor?: Actor.Implementation }
): Promise<void> {
  const conditionData = createConditionData({
    workflow: options?.workflow,
    actor: options?.sourceActor,
    target: tokenForActor(targetActor)
  });

  // Evaluate grants.critical flags
  for (const flag of flags.criticalFlags) {
    if (await evalAllConditionsAsync(targetActor, midiFlag(flag), conditionData, false)) {
      tracker.critical.force(flag, `${getFlagDisplayName(flag)} (${targetName})`);
      break;
    }
  }

  // Evaluate grants.noCritical flags
  for (const flag of flags.noCriticalFlags) {
    if (await evalAllConditionsAsync(targetActor, midiFlag(flag), conditionData, false)) {
      tracker.critical.suppress(flag, `${getFlagDisplayName(flag)} (${targetName})`);
      break;
    }
  }

  // Evaluate grants.fumble flags
  for (const flag of flags.fumbleFlags) {
    if (await evalAllConditionsAsync(targetActor, midiFlag(flag), conditionData, false)) {
      tracker.fumble.force(flag, `${getFlagDisplayName(flag)} (${targetName})`);
      break;
    }
  }

  // Evaluate grants.noFumble flags
  for (const flag of flags.noFumbleFlags) {
    if (await evalAllConditionsAsync(targetActor, midiFlag(flag), conditionData, false)) {
      tracker.fumble.suppress(flag, `${getFlagDisplayName(flag)} (${targetName})`);
      break;
    }
  }
}
