/*
 * Optional roll bonuses: phases, costs and the order chosen bonuses are applied in. Pure: no Foundry globals.
 *
 * The cost budget (canAfford, addCosts, fitSelection) and the scaling limit are adapted from Coven's Automation
 * Toolkit 0.1.8 (lib/optionalBonus.mjs, RollBonus.CheckCost / AddCosts / #getMaxScaling) by chrisk123999,
 * ISC licence: "Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee
 * is hereby granted, provided that the above copyright notice and this permission notice appear in all copies."
 */

export type BonusPhase = "preRoll" | "preResult" | "postResult";
export const BONUS_PHASES: readonly BonusPhase[] = ["preRoll", "preResult", "postResult"];

export type BonusRollKind = "attack" | "damage" | "save" | "check" | "skill" | "tool" | "death" | "concentration" | "ac";

/** What a cost draws on. Keys within a type: an item/activity uuid, `spellN`, an attribute path, a die size, an effect key. */
export type ResourceType = "actions" | "itemUses" | "activityUses" | "spellSlots" | "attribute" | "material" | "hitDice"
  | "effectCount" | "oncePer";
export const RESOURCE_TYPES: readonly ResourceType[] = ["actions", "itemUses", "activityUses", "spellSlots", "attribute", "material", "hitDice", "effectCount", "oncePer"];

export interface CostEntry { cost: number; available: number }
export type BonusCost = Partial<Record<ResourceType, Record<string, CostEntry>>>;

export type BonusEffect =
  | { kind: "add"; formula: string; damageType?: string; critical?: "double" | "never" | "force" }
  | { kind: "reroll"; keep: "new" | "higher" | "lower" | "ask"; dice?: "max" | "min"; addFormula?: string }
  | { kind: "replace"; formula: string }
  | { kind: "outcome"; success: boolean }
  | { kind: "critical" }
  /** No change to the roll: the bonus's own code does the work. */
  | { kind: "rider" };

export interface Outcome { success?: boolean; isCritical?: boolean; isFumble?: boolean; noDC?: boolean }

/** Whether `cost` fits what is left after `spent` (the CAT budget rule: each resource's spent + cost within its available). */
export function canAfford(cost: BonusCost | undefined, spent: BonusCost = {}): boolean {
  for (const type of RESOURCE_TYPES) {
    for (const [key, entry] of Object.entries(cost?.[type] ?? {})) {
      if (entry.cost + (spent[type]?.[key]?.cost ?? 0) > entry.available) return false;
    }
  }
  return true;
}

/** `spent` with `cost` added (a new object); availability is the latest known. */
export function addCosts(spent: BonusCost, cost: BonusCost | undefined): BonusCost {
  const result: BonusCost = {};
  for (const type of RESOURCE_TYPES) {
    const merged: Record<string, CostEntry> = { ...(spent[type] ?? {}) };
    for (const [key, entry] of Object.entries(cost?.[type] ?? {})) {
      merged[key] = { cost: (merged[key]?.cost ?? 0) + entry.cost, available: entry.available };
    }
    if (Object.keys(merged).length) result[type] = merged;
  }
  return result;
}

/**
 * The selection in order, keeping each that still fits the running budget. A third party's bonus spends someone else's
 * resources, so it neither counts against nor adds to this roller's budget.
 */
export function fitSelection<T extends { id: string; cost?: BonusCost; thirdParty?: boolean }>(
  ordered: readonly T[], spent: BonusCost = {}): { accepted: T[]; refused: { id: string; reason: "resources" }[] } {
  const accepted: T[] = [];
  const refused: { id: string; reason: "resources" }[] = [];
  let budget = spent;
  for (const candidate of ordered) {
    if (candidate.thirdParty) { accepted.push(candidate); continue; }
    if (!canAfford(candidate.cost, budget)) { refused.push({ id: candidate.id, reason: "resources" }); continue; }
    accepted.push(candidate);
    budget = addCosts(budget, candidate.cost);
  }
  return { accepted, refused };
}

/**
 * Whether to open the prompt for a phase: only with optional bonuses on offer, never after the user dismissed the
 * prompt, not before the result on a natural 1 (unless a bonus is offered on fumbles), and after the result only when
 * there is something left to change (a failure, or a roll with no DC).
 */
export function shouldPrompt(phase: BonusPhase, s: { hasOptional: boolean; dismissed: boolean; outcome?: Outcome; fumbleOffered?: boolean }): boolean {
  if (!s.hasOptional || s.dismissed) return false;
  if (s.outcome?.isFumble && !s.fumbleOffered) return false;
  if (phase === "postResult" && s.outcome && !s.outcome.noDC && s.outcome.success) return false;
  return true;
}

const EFFECT_ORDER: Record<BonusEffect["kind"], number> = { replace: 0, reroll: 1, add: 2, outcome: 3, critical: 3, rider: 4 };

/** Where a kind of effect comes in the application order (orderForApplication); unknown kinds last */
export function effectOrder(kind: string | undefined): number {
  return kind && kind in EFFECT_ORDER ? EFFECT_ORDER[kind as BonusEffect["kind"]] : 5;
}

/**
 * The order chosen bonuses are applied in within a phase: replace, reroll, add, outcome/critical, riders; higher
 * priority first within each. A reroll rerolls the whole roll, so it comes before adds or it would drop them.
 */
export function orderForApplication<T extends { effect: BonusEffect; priority?: number }>(chosen: readonly T[]): T[] {
  return [...chosen].sort((a, b) => (EFFECT_ORDER[a.effect.kind] - EFFECT_ORDER[b.effect.kind]) || ((b.priority ?? 0) - (a.priority ?? 0)));
}

/**
 * How far a bonus can scale: each step costs `step` more than the `base` cost; with `available` of the resource the
 * limit is floor((available - base) / step) + 1 steps (CAT's #getMaxScaling), 0 when even the base is unaffordable.
 */
export function maxScaling(base: number, step: number, available: number, cap = Infinity): number {
  if (available < base) return 0;
  if (step <= 0) return cap === Infinity ? 0 : cap;
  return Math.min(cap, Math.floor((available - base) / step) + 1);
}
