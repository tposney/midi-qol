/*
 * How a damageModifiers contributor's change lands on one target's damage parts. Pure: no Foundry globals.
 *
 * Stages run in this order inside dnd5e's damage calculation:
 * - bonus: extra damage of one type (a new part, so resistances still apply to it);
 * - flatReduction: a fixed amount off the matching parts, before resistances (spread proportionally, never below 0);
 * - percentReduction: the matching parts scaled, after resistances;
 * - complete: a last flat or scaled change, after everything else.
 */

export type DamageStage = "bonus" | "flatReduction" | "percentReduction" | "complete";
export const DAMAGE_STAGES: readonly DamageStage[] = ["bonus", "flatReduction", "percentReduction", "complete"];

export interface DamagePart { type: string; value: number }

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

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Adds `amount` across `parts` in proportion to their values (negative never takes a part below 0); returns what was applied. */
function distribute(parts: DamagePart[], amount: number): number {
  const positive = parts.filter(p => p.value > 0);
  const total = positive.reduce((sum, p) => sum + p.value, 0);
  if (total <= 0) return 0;
  const applied = amount < 0 ? Math.max(amount, -total) : amount;
  for (const part of positive) part.value += (part.value / total) * applied;
  return applied;
}

/**
 * Applies one change for a stage to `parts` (mutated in place). `counts` says which parts are damage a change may touch
 * (not healing, temp HP or display-only entries).
 */
export function applyDamageChange(stage: DamageStage, parts: DamagePart[], change: DamageChange, counts: (part: DamagePart) => boolean = () => true): ChangeResult {
  const matching = parts.filter(p => counts(p) && (!change.types || change.types.includes(p.type)));
  const { amount, multiplier } = change;
  switch (stage) {
    case "bonus": {
      if (!finite(amount) || amount <= 0) return { applied: 0, problem: "a bonus needs a positive amount" };
      if (change.types?.length !== 1) return { applied: 0, problem: "a bonus names exactly one damage type" };
      return { applied: amount, added: { type: change.types[0], value: amount } };
    }
    case "flatReduction": {
      if (!finite(amount) || amount >= 0) return { applied: 0, problem: "a flat reduction needs a negative amount" };
      return { applied: distribute(matching, amount) };
    }
    case "percentReduction": {
      if (!finite(multiplier) || multiplier < 0) return { applied: 0, problem: "a percent reduction needs a multiplier of 0 or more" };
      let applied = 0;
      for (const part of matching) {
        const before = part.value;
        part.value = before * multiplier;
        applied += part.value - before;
      }
      return { applied };
    }
    case "complete": {
      if (finite(multiplier) && multiplier >= 0) return applyDamageChange("percentReduction", parts, change, counts);
      if (finite(amount) && amount !== 0) return { applied: distribute(matching, amount) };
      return { applied: 0, problem: "a complete-stage change needs an amount or a multiplier" };
    }
  }
}
