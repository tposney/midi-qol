/**
 * Tracks roll modifiers: advantage/disadvantage, auto-fail/success, min/max with attribution.
 */

import { RollDialogConfig, RollProcessConfig } from "../../globals.js";
import { GameSystemConfig, i18n, i18nFormat } from "../../midi-qol.js";
import { rollFieldName } from "../rollFields.js";
import { createConditionData, evalAllConditions, evalAllConditionsAsync, tokenForActor, MidiOptions } from "../utils.js";
import { ADVANTAGE, DISADVANTAGE, NORMAL } from "./rollKeys.js";

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
  /** dnd5e roll fields (e.g. "abilities.dex.save.roll") whose fail/success conditions apply to the roll */
  fieldPaths?: string[];
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
  // dnd5e advantage rules (`dnd5e.advantage` changes) for this roll, filtered by its roll data
  systemRules?: { category: "save" | "check" | "attack", rollData: object, item?: Item.Implementation };
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
  // keyLabel returns the key itself for an unknown tool
  if (toolLabel && toolLabel !== `tool:${key}`) return toolLabel;
  return key;
}

// Helper to get a human-readable display name for a midi-qol flag path
export function getFlagDisplayName(flag: string): string {
  const fieldName = rollFieldName(flag);
  if (fieldName) return fieldName;

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

/**
 * Build attribution display name, prefixing with active effect name(s) if available.
 * Format: "Effect Name - flag display" when an effect set the flag, otherwise just "flag display".
 */
function getAttributionDisplayName(actor: Actor.Implementation, flag: string, flagDisplayName: string): string {
  const evalKey = `flags.midi-qol.${flag}`.replace("flags.midi-qol.", "flags.midi.evaluated.");
  const result = foundry.utils.getProperty(actor, `${evalKey}.effects`);
  const effectNames: string[] = Array.isArray(result) ? result : [];
  // Filter out the generic "flag" entry which means it was set directly, not by an effect
  const realEffects = effectNames.filter(name => name !== "flag");
  if (realEffects.length > 0) {
    const uniqueNames = [...new Set(realEffects)];
    return `${uniqueNames.join(", ")} - ${flagDisplayName}`;
  }
  return flagDisplayName;
}

// ─────────────────────────────────────────────────────────────────
// AdvantageDisadvantageTracker Class
// ─────────────────────────────────────────────────────────────────

type AdvantageType = 'ADV' | 'DIS';
type SuppressionType = 'NOADV' | 'NODIS';

/**
 * One side (advantage or disadvantage) of a roll: midi's sources for it as dnd5e counts them (sources, a suppression,
 * an override), with attribution. Whether the roll has the side is the owning tracker's verdict.
 */
export class AdvantageDisadvantageTracker {
  #count = 0;
  #suppressed = false;
  #override = false;

  readonly #type: AdvantageType;
  readonly #suppressionType: SuppressionType;
  readonly #addAttribution: AttributionCallback;
  readonly #verdict: () => boolean;

  constructor(type: AdvantageType, addAttribution: AttributionCallback, verdict: () => boolean) {
    this.#type = type;
    this.#suppressionType = type === 'ADV' ? 'NOADV' : 'NODIS';
    this.#addAttribution = addAttribution;
    this.#verdict = verdict;
  }

  get get(): Readonly<{ active: boolean; count: number; suppressed: boolean; override: boolean }> {
    return { active: this.#count > 0, count: this.#count, suppressed: this.#suppressed, override: this.#override };
  }

  /** Whether at least one source has been added */
  get isAdded(): boolean { return this.#count > 0; }

  get count(): number { return this.#count; }

  get isSuppressed(): boolean { return this.#suppressed; }

  get hasOverride(): boolean { return this.#override; }

  /** Whether the roll has this side */
  get isActive(): true | undefined {
    return this.#verdict() || undefined;
  }

  add(source?: string, displayName?: string): void {
    this.#count++;
    if (source !== undefined) this.#addAttribution(this.#type, source, displayName ?? source);
  }

  /** Remove every source; a suppression or override stays */
  clear(): void {
    this.#count = 0;
  }

  suppress(source?: string, displayName?: string): void {
    this.#suppressed = true;
    if (source !== undefined) this.#addAttribution(this.#suppressionType, source, displayName ?? source);
  }

  /** Force this side, as a dnd5e override does: a suppression of it still applies */
  setOverride(source?: string, displayName?: string): void {
    this.#override = true;
    if (source !== undefined) this.#addAttribution(this.#type, source, displayName ?? source);
  }

  clearOverride(): void {
    this.#override = false;
  }

  reset(): void {
    this.#count = 0;
    this.#suppressed = false;
    this.#override = false;
  }

  /** Restore from toJSON's `get`; older data has `active` instead of a count */
  restore(state: { active?: boolean; count?: number; suppressed: boolean; override: boolean }): void {
    this.#count = state.count ?? (state.active ? 1 : 0);
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
  /** "${type}:${source}", the legacy and adv-reminder format */
  #attributionKeys: Set<string> = new Set();

  // ─────────────────────────────────────────────────────────────────
  // Advantage verdict inputs besides midi's sources
  // ─────────────────────────────────────────────────────────────────

  /** The roll's dnd5e roll mode fields and advantage rules, which dnd5e combines with midi's sources */
  #dnd5e: { actor: Actor.Implementation, fields: string[], rules?: AdvantageFlags["systemRules"] } | undefined;
  /** The mode the roll was made with, when held keys or the roll dialog changed it */
  #finalMode: number | undefined;
  /** dnd5e's verdict when this tracker was saved; a restored tracker has no actor to ask */
  #savedVerdict: { advantage: boolean, disadvantage: boolean } | undefined;

  constructor() {

    // Create sub-trackers with bound attribution method
    const addAttr = this.addAttribution.bind(this);
    this.advantage = new AdvantageDisadvantageTracker('ADV', addAttr, () => this.#sides().advantage);
    this.disadvantage = new AdvantageDisadvantageTracker('DIS', addAttr, () => this.#sides().disadvantage);
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
    this.#attributionKeys.add(`${type}:${source}`);
  }

  /** Get the attribution map */
  get attribution(): AdvantageAttributionMap {
    return this.#attribution;
  }

  /** Get legacy Set format: "${type}:${displayName}" */
  get legacyAttribution(): Set<string> {
    return this.#attributionKeys;
  }

  /** Get legacy Set format for adv-reminder: "${type}:${source}" */
  get advReminderAttribution(): Set<string> {
    return this.#attributionKeys;
  }

  // ─────────────────────────────────────────────────────────────────
  // Combined Mode
  // ─────────────────────────────────────────────────────────────────

  /** midi's sources as dnd5e's advantage counts */
  get counts(): AdvantageCounts {
    const advantage = this.advantage.get;
    const disadvantage = this.disadvantage.get;
    return {
      override: advantage.override && disadvantage.override ? NORMAL : advantage.override ? ADVANTAGE : disadvantage.override ? DISADVANTAGE : null,
      advantages: { count: advantage.count, suppressed: advantage.suppressed },
      disadvantages: { count: disadvantage.count, suppressed: disadvantage.suppressed }
    };
  }

  /** The roll's dnd5e roll mode fields and advantage rules take part in the verdict */
  useDnd5eSources(actor: Actor.Implementation, fields: string[], rules?: AdvantageFlags["systemRules"]): void {
    const known = this.#dnd5e?.actor === actor ? this.#dnd5e.fields : [];
    this.#dnd5e = { actor, fields: [...new Set([...known, ...fields])], rules: rules ?? this.#dnd5e?.rules };
  }

  /** dnd5e's verdict on midi's sources with the roll's own, before held keys: what midi gives the roll config */
  get dnd5eVerdict(): { advantage: boolean, disadvantage: boolean } {
    let counts = this.counts;
    if (!this.#dnd5e) {
      if (this.#savedVerdict) return this.#savedVerdict;
      // dnd5e's rules for counts alone (AdvantageModeField.combineFields with no fields)
      const side = (data: { count: number, suppressed: boolean }, mode: number) =>
        ((data.count > 0 && counts.override === null) || counts.override === mode) && !data.suppressed;
      return { advantage: side(counts.advantages, ADVANTAGE), disadvantage: side(counts.disadvantages, DISADVANTAGE) };
    }
    const { actor, fields, rules } = this.#dnd5e;
    if (rules) {
      // @ts-expect-error no dnd5e-types
      counts = dnd5e.documents.AppliedRules.collect(`${rules.category}:advantage`, actor, rules.item).filterWith(rules.rollData).toAdvantageCounts(counts);
    }
    // @ts-expect-error no dnd5e-types
    const { advantage, disadvantage } = dnd5e.dataModels.fields.AdvantageModeField.combineFields(actor.system, fields, counts);
    return { advantage, disadvantage };
  }

  /** The sides any of the roll's known sources (midi's, its dnd5e roll mode fields and rules) asks for, before suppression */
  get claims(): { advantage: boolean, disadvantage: boolean } {
    const claims = { advantage: false, disadvantage: false };
    const add = (counts: AdvantageCounts) => {
      claims.advantage ||= counts.advantages.count > 0 || counts.override === ADVANTAGE;
      claims.disadvantage ||= counts.disadvantages.count > 0 || counts.override === DISADVANTAGE;
    };
    add(this.counts);
    if (!this.#dnd5e) return claims;
    const { actor, fields, rules } = this.#dnd5e;
    if (rules) {
      // @ts-expect-error no dnd5e-types
      add(dnd5e.documents.AppliedRules.collect(`${rules.category}:advantage`, actor, rules.item).filterWith(rules.rollData).toAdvantageCounts());
    }
    for (const field of fields) {
      // @ts-expect-error no dnd5e-types
      const counts: AdvantageCounts = dnd5e.dataModels.fields.AdvantageModeField.getCounts(actor.system, field);
      // @ts-expect-error no dnd5e-types
      const own = foundry.utils.getProperty(actor.system._source, field);
      add({ ...counts, advantages: { ...counts.advantages, count: counts.advantages.count + Number(own === 1) },
        disadvantages: { ...counts.disadvantages, count: counts.disadvantages.count + Number(own === -1) } });
    }
    return claims;
  }

  /** The roll's sides: dnd5e's verdict, or the mode the roll was made with once reconciled */
  #sides(): { advantage: boolean, disadvantage: boolean } {
    const mode = this.#finalMode;
    if (mode !== undefined) return { advantage: mode === ADVANTAGE, disadvantage: mode === DISADVANTAGE };
    return this.dnd5eVerdict;
  }

  /** ADV_MODE: ADVANTAGE, DISADVANTAGE or NORMAL */
  get advantageMode(): number {
    const sides = this.#sides();
    return sides.advantage === sides.disadvantage ? NORMAL : sides.advantage ? ADVANTAGE : DISADVANTAGE;
  }

  /**
   * The roll as made, where it differs from the verdict: dnd5e adds held keys to the roll after everything else, and
   * the roll dialog's choice replaces it.
   */
  reconcileWithRoll(mode: number | undefined, dialogShown: boolean): void {
    if (mode === undefined || mode === this.advantageMode) return;
    if (dialogShown) this.setFinalMode(mode, "config-buttons", i18n("midi-qol.ConfigButtons"));
    else this.setFinalMode(mode, "keyPress", i18n("midi-qol.KeyPress"));
  }

  setFinalMode(mode: number, source: string, displayName: string): void {
    this.#finalMode = mode;
    if (mode === ADVANTAGE) this.addAttribution("ADV", source, displayName);
    else if (mode === DISADVANTAGE) this.addAttribution("DIS", source, displayName);
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
    this.#attributionKeys.clear();
    this.#dnd5e = undefined;
    this.#finalMode = undefined;
    this.#savedVerdict = undefined;
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
      legacyAttribution: Array.from(this.#attributionKeys),
      finalMode: this.#finalMode,
      verdict: this.dnd5eVerdict
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
    if (data.legacyAttribution) this.#attributionKeys = new Set(data.legacyAttribution);
    if (data.finalMode !== undefined) this.#finalMode = data.finalMode;
    if (data.verdict) this.#savedVerdict = data.verdict;
  }


}

/** One kind of advantage flag: the first of `flags` that holds adds to or suppresses `side`; grants are the opponent's */
type AdvantageFlagCheck = { flags?: string[], side: AdvantageDisadvantageTracker, action: "add" | "suppress", grants: boolean, prefix?: RegExp };

function advantageFlagChecks(flags: AdvantageFlags, tracker: RollModifierTracker): AdvantageFlagCheck[] {
  const { advantage, disadvantage } = tracker;
  return [
    { flags: flags.advantageFlags, side: advantage, action: "add", grants: false, prefix: /^advantage\./ },
    { flags: flags.disadvantageFlags, side: disadvantage, action: "add", grants: false, prefix: /^disadvantage\./ },
    { flags: flags.noAdvantageFlags, side: advantage, action: "suppress", grants: false },
    { flags: flags.noDisadvantageFlags, side: disadvantage, action: "suppress", grants: false },
    { flags: flags.sourceAdvantageFlags, side: advantage, action: "add", grants: true },
    { flags: flags.sourceDisadvantageFlags, side: disadvantage, action: "add", grants: true },
    { flags: flags.sourceNoAdvantageFlags, side: advantage, action: "suppress", grants: true },
    { flags: flags.sourceNoDisadvantageFlags, side: disadvantage, action: "suppress", grants: true }
  ];
}

/** Who the flags are read from and with what condition data: the roller, and the opponent for grants */
function advantageFlagContext(actor: Actor.Implementation, options: MidiOptions) {
  // The opposing entity that grants advantage/disadvantage.
  // For attacks: the defender. For saves: the caster. Falls back to actor's own token.
  const grantsActor = options.grantsActor ?? options.workflow?.actor;
  const grantsToken = options.grantsToken ?? (grantsActor ? tokenForActor(grantsActor) : undefined);
  const item = options.item ?? options.itemUuid ?? options.saveItem ?? options.saveItemUuid;
  return {
    actor, grantsActor,
    grantsName: grantsToken?.name ?? grantsActor?.name ?? "",
    conditionData: createConditionData({ workflow: options.workflow, target: grantsToken ?? tokenForActor(actor), actor, item }),
    grantsConditionData: grantsActor
      ? createConditionData({ workflow: options.workflow, target: tokenForActor(actor), actor: grantsActor, token: grantsToken, item })
      : undefined
  };
}

/** midi's flags are named without their prefix; other modules' (dnd5e's initiative flags) in full */
const flagKey = (flag: string) => flag.startsWith("flags.") ? flag : midiFlag(flag);

function recordAdvantageFlag(check: AdvantageFlagCheck, flag: string, context: ReturnType<typeof advantageFlagContext>): void {
  const subject = check.grants ? context.grantsActor! : context.actor;
  const name = getAttributionDisplayName(subject, flag, getFlagDisplayName(flag));
  if (check.grants) check.side[check.action](`${flag} ${context.grantsName}`, `${name} (${context.grantsName})`);
  else check.side[check.action](check.prefix ? flag.replace(check.prefix, "") : flag, name);
}

function startAdvantageFlags(options: MidiOptions, tracker?: RollModifierTracker): RollModifierTracker {
  tracker ??= new RollModifierTracker();
  // Advantage the caller passed in is one more source
  if (options.advantage) tracker.advantage.add("options", "Options");
  if (options.disadvantage) tracker.disadvantage.add("options", "Options");
  return tracker;
}

function finishAdvantageFlags(actor: Actor.Implementation, flags: AdvantageFlags, tracker: RollModifierTracker): RollModifierTracker {
  tracker.useDnd5eSources(actor, flags.systemRollModeFields, flags.systemRules);
  attributeDnd5eSources(actor, flags, tracker);
  return tracker;
}

/**
 * The roll's advantage sources on a tracker: midi's flags (each kind's first that holds), the opponent's grants, and
 * the roll's dnd5e roll mode fields and advantage rules, which dnd5e combines with them.
 */
export async function computeAdvantageFlags(
  actor: Actor.Implementation,
  flags: AdvantageFlags,
  options: MidiOptions,
  tracker?: RollModifierTracker
): Promise<RollModifierTracker> {
  tracker = startAdvantageFlags(options, tracker);
  const context = advantageFlagContext(actor, options);
  for (const check of advantageFlagChecks(flags, tracker)) {
    const subject = check.grants ? context.grantsActor : actor;
    const data = check.grants ? context.grantsConditionData : context.conditionData;
    if (!subject || !data) continue;
    for (const flag of check.flags ?? []) {
      if (await evalAllConditionsAsync(subject, flagKey(flag), data, false)) {
        recordAdvantageFlag(check, flag, context);
        break;
      }
    }
  }
  return finishAdvantageFlags(actor, flags, tracker);
}

/** computeAdvantageFlags for a synchronous hook (initiative); conditions are evaluated synchronously */
export function computeAdvantageFlagsSync(
  actor: Actor.Implementation,
  flags: AdvantageFlags,
  options: MidiOptions,
  tracker?: RollModifierTracker
): RollModifierTracker {
  tracker = startAdvantageFlags(options, tracker);
  const context = advantageFlagContext(actor, options);
  for (const check of advantageFlagChecks(flags, tracker)) {
    const subject = check.grants ? context.grantsActor : actor;
    const data = check.grants ? context.grantsConditionData : context.conditionData;
    if (!subject || !data) continue;
    const flag = (check.flags ?? []).find(flag => evalAllConditions(subject, flagKey(flag), data, false));
    if (flag) recordAdvantageFlag(check, flag, context);
  }
  return finishAdvantageFlags(actor, flags, tracker);
}

type AdvantageCounts = { override: number | null, advantages: { count: number, suppressed: boolean }, disadvantages: { count: number, suppressed: boolean } };

/**
 * Name the roll's dnd5e sources in the attribution, for display only (dnd5e counts them itself): the actor's own roll
 * mode values, each change dnd5e applied to them (one whose conditions failed is not applied), and the advantage rules.
 */
function attributeDnd5eSources(actor: Actor.Implementation, flags: AdvantageFlags, tracker: RollModifierTracker): void {
  const attribute = (type: AdvantageAttributionType, source: string, name: string) => tracker.addAttribution(type, source, name);
  for (const field of flags.systemRollModeFields) {
    // @ts-expect-error no dnd5e-types
    const own = foundry.utils.getProperty(actor.system._source, field);
    if (own === 1 || own === -1) attribute(own === 1 ? "ADV" : "DIS", `${field}:actor`, i18n("midi-qol.Dnd5eRollMode.Actor"));
    for (const effect of actor.appliedEffects) {
      // @ts-expect-error fvtt-types v14 ActiveEffect
      for (const change of effect.system.changes as { key: string, type: string, value: unknown, applied?: boolean | null }[]) {
        if (change.key !== `system.${field}` || !change.applied) continue;
        const value = Number(change.value);
        const source = `${field}:${effect.id}`;
        const name = i18nFormat("midi-qol.Dnd5eRollMode.Effect", { name: effect.name });
        switch (change.type) {
          case "add":
            if (value === 1) attribute("ADV", source, name);
            else if (value === -1) attribute("DIS", source, name);
            break;
          case "downgrade":
            attribute("NOADV", source, name);
            if (value === -1) attribute("DIS", source, name);
            break;
          case "upgrade":
            attribute("NODIS", source, name);
            if (value === 1) attribute("ADV", source, name);
            break;
          case "override":
            if (value === 1) attribute("ADV", source, name);
            else if (value === -1) attribute("DIS", source, name);
            else {
              attribute("NOADV", source, name);
              attribute("NODIS", source, name);
            }
            break;
        }
      }
    }
  }
  if (!flags.systemRules) return;
  const { category, rollData, item } = flags.systemRules;
  // @ts-expect-error no dnd5e-types
  const rules: Iterable<{ value?: unknown, effect?: { name: string } }> = dnd5e.documents.AppliedRules
    .collect(`${category}:advantage`, actor, item).filterWith(rollData);
  for (const rule of rules) {
    const name = rule.effect?.name ?? "System Rule";
    const type = ({ "1": "ADV", "+1": "ADV", "=1": "ADV", "=+1": "ADV", "-1": "DIS", "=-1": "DIS", "<=0": "NOADV", ">=0": "NODIS" } as const)[String(rule.value)];
    if (type) attribute(type, `rule:${name}`, name);
  }
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

  // Evaluate auto-fail: the dnd5e roll fields, then midi flags
  const failField = (flags.fieldPaths ?? []).find(path => evalAllConditions(actor, `system.${path}.fail`, conditionData, false));
  if (failField) tracker.modifiers.fail(`${failField}.fail`, rollFieldName(`${failField}.fail`) ?? `${failField}.fail`);
  else for (const flag of flags.failFlags) {
    if (evalAllConditions(actor, midiFlag(flag), conditionData, false)) {
      tracker.modifiers.fail(flag, getFlagDisplayName(flag));
      break;
    }
  }

  // Evaluate auto-success: the dnd5e roll fields, then midi flags
  const successField = (flags.fieldPaths ?? []).find(path => evalAllConditions(actor, `system.${path}.success`, conditionData, false));
  if (successField) tracker.modifiers.succeed(`${successField}.success`, rollFieldName(`${successField}.success`) ?? `${successField}.success`);
  else for (const flag of flags.successFlags) {
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
    config.rolls = [{ options: { maximum: failValue, midiAutoResult: "fail" }, parts: [] }];
  } else if (autoSuccess) {
    dialog.configure = false;
    config.rolls = [{ options: { minimum: successValue, midiAutoResult: "success" }, parts: [] }];
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
  options?: { workflow?: any, grantsActor?: Actor.Implementation }
): Promise<void> {
  const conditionData = createConditionData({
    workflow: options?.workflow,
    actor: options?.grantsActor,
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

/**
 * Hand midi's advantage verdict to dnd5e without discarding the system's own.
 *
 * dnd5e 6.0 derives advantage from `D20RollModificationField` and then merges the caller's config
 * over the top, so writing a falsy value here silently erases native advantage. midi's tracker has
 * three states and only two are ours to assert: granted, denied (a `noAdvantage`/`noDisadvantage`
 * flag), and no opinion.
 *
 * No opinion must leave the key completely untouched. Assigning `undefined` is not neutral —
 * `mergeObject` treats it as an own key and it overwrites native advantage as surely as `false`.
 * Deleting is not neutral either: called from a `preRoll*` hook the key already holds the value
 * dnd5e derived, and before the call it may hold an explicit request from the caller. Either way
 * it is not ours to discard.
 */
export function applyTrackerAdvantage(config: RollProcessConfig, tracker: RollModifierTracker): void {
  const claims = tracker.claims;
  for (const [key, side] of [["advantage", tracker.advantage], ["disadvantage", tracker.disadvantage]] as const) {
    if (side.isActive) config[key] = true;
    // A side a known source asks for but the verdict denies; dnd5e's sources midi does not model (e.g. travel pace) stay
    else if (claims[key]) {
      config[key] = false;
      // dnd5e ORs this with each built roll's own verdict, so a denial has to clear those too.
      for (const roll of config.rolls ?? []) if (roll.options) roll.options[key] = false;
    }
  }
}
