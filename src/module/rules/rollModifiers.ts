/*
 * What a rollModifiers contributor says about a roll, and how that lands on midi's RollModifierTracker.
 * Pure: no Foundry globals (test/purity.test.ts).
 */

export type RollKind = "attack" | "save" | "check" | "skill" | "tool" | "death" | "concentration";

export type RollModifierEffect =
  | "advantage" | "disadvantage" | "noAdvantage" | "noDisadvantage"
  | "critical" | "noCritical" | "fumble" | "noFumble"
  | "success" | "fail" | "min" | "max";

export interface RollModifier {
  effect: RollModifierEffect;
  /** The die value for min/max. */
  value?: number;
  /** Shown in the roll dialog and on the card. */
  label: string;
  /** What gave it (an effect's uuid, a rule's name); attribution is per provider + source. */
  source?: string;
}

interface SideTracker { add(source?: string, displayName?: string): void; suppress(source?: string, displayName?: string): void }
interface CritTracker { force(source: string, displayName?: string): void; suppress(source: string, displayName?: string): void }
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
export function applyRollModifiers(tracker: ModifierTarget, modifiers: readonly RollModifier[], providerId: string): string[] {
  const problems: string[] = [];
  for (const modifier of modifiers) {
    const source = `${providerId}:${modifier.source ?? modifier.label}`;
    const label = modifier.label;
    switch (modifier.effect) {
      case "advantage": tracker.advantage.add(source, label); break;
      case "disadvantage": tracker.disadvantage.add(source, label); break;
      case "noAdvantage": tracker.advantage.suppress(source, label); break;
      case "noDisadvantage": tracker.disadvantage.suppress(source, label); break;
      case "critical": tracker.critical.force(source, label); break;
      case "noCritical": tracker.critical.suppress(source, label); break;
      case "fumble": tracker.fumble.force(source, label); break;
      case "noFumble": tracker.fumble.suppress(source, label); break;
      case "success": tracker.modifiers.succeed(source, label); break;
      case "fail": tracker.modifiers.fail(source, label); break;
      case "min":
      case "max":
        if (typeof modifier.value !== "number" || !Number.isFinite(modifier.value)) {
          problems.push(`${label}: ${modifier.effect} needs a numeric value`);
          break;
        }
        if (modifier.effect === "min") tracker.modifiers.min(modifier.value, source, label);
        else tracker.modifiers.max(modifier.value, source, label);
        break;
      default:
        problems.push(`${label}: unknown effect "${String((modifier as { effect: unknown }).effect)}"`);
    }
  }
  return problems;
}
