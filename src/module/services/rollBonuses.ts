import type { Activity } from "../../globals.js";
import { defineService, entries, reportServiceProblem } from "../api/services.js";
import type { Workflow } from "../Workflow.js";
import { addRollToAsync } from "../utils.js";
import { canAfford, type BonusCost, type BonusEffect, type BonusPhase, type BonusRollKind, type Outcome } from "../rules/rollBonuses.js";

/*
 * rollBonuses (contributors): optional (or automatic) bonuses a module offers on a roll, in phases (design:
 * ~/Documents/midi-next-rollBonuses-design-2026-11-18.md). Stage 2: attack and damage rolls, shown in midi's bonus
 * dialog next to the flags.midi-qol.optional bonuses; flags keep their own path until they become a contributor.
 *
 *   MidiQOL.services.register("rollBonuses", "my-module.bless", {
 *     kinds: ["attack"],
 *     for: q => [{ id: "bless", label: "Bless", phases: ["preResult"], effect: { kind: "add", formula: "1d4" }, optional: false }]
 *   });
 */

export type { BonusCost, BonusEffect, BonusPhase, BonusRollKind, Outcome } from "../rules/rollBonuses.js";

export interface RollBonusQuery {
  kind: BonusRollKind;
  actor: Actor.Implementation;
  token?: TokenDocument.Implementation;
  /** Attack: the target (single target only). */
  target?: TokenDocument.Implementation;
  workflow?: Workflow;
  activity?: Activity;
  item?: Item.Implementation;
  /** mwak, rsak, save, heal... */
  actionType?: string;
}

export interface BonusContext {
  query: RollBonusQuery;
  phase: BonusPhase;
  roll: Roll;
  outcome?: Outcome;
}

export interface BonusCandidate {
  /** Unique within the contributor; midi prefixes the contributor's id. */
  id: string;
  label: string;
  img?: string;
  phases: readonly BonusPhase[];
  effect: BonusEffect;
  /** False: applied without asking. */
  optional: boolean;
  priority?: number;
  /** Declared costs; a candidate whose cost does not fit what is available is not offered. */
  cost?: BonusCost;
  /** Offered on a natural 1 (attack fumble). */
  onFumble?: boolean;
  /** True, or why it is not offered now. */
  validate?: (ctx: BonusContext) => true | string;
  /** After it was applied: its consumption and side effects. */
  onChosen?: (ctx: BonusContext & { roll: Roll }) => Promise<void> | void;
}

export interface RollBonusContributor {
  /** Roll kinds it may offer bonuses for (a cheap filter); all when omitted. */
  kinds?: readonly BonusRollKind[];
  for(query: RollBonusQuery): readonly BonusCandidate[] | undefined | Promise<readonly BonusCandidate[] | undefined>;
}

declare module "../api/services.js" {
  interface MidiServices { rollBonuses: RollBonusContributor }
}

export let rollBonusesService: ReturnType<typeof defineService<RollBonusContributor>>;

export function defineRollBonusesService() {
  rollBonusesService = defineService<RollBonusContributor>("rollBonuses", {
    kind: "contributors",
    description: "Bonuses offered on a roll (added dice, rerolls, a changed result), optional or automatic, by phase"
  });
}

/** A contributor's candidate, its id prefixed with the contributor's. */
export type OfferedBonus = BonusCandidate & { contributor: string };

/** Asks every contributor for the roll's candidates for `phase`, keeping those valid now and affordable. */
export async function collectBonusCandidates(query: RollBonusQuery, phase: BonusPhase, roll: Roll, outcome?: Outcome): Promise<OfferedBonus[]> {
  if (!rollBonusesService) return [];
  const offered: OfferedBonus[] = [];
  for (const { id: contributor, provider } of entries<RollBonusContributor>("rollBonuses")) {
    if (provider.kinds && !provider.kinds.includes(query.kind)) continue;
    let candidates: readonly BonusCandidate[] | undefined;
    try {
      candidates = await provider.for(query);
    } catch (err) {
      reportServiceProblem("rollBonuses", contributor, `failed for a ${query.kind} roll`, err);
      continue;
    }
    for (const candidate of candidates ?? []) {
      if (!candidate.phases.includes(phase)) continue;
      if (outcome?.isFumble && !candidate.onFumble) continue;
      if (!canAfford(candidate.cost)) continue;
      try {
        if (candidate.validate && candidate.validate({ query, phase, roll, outcome }) !== true) continue;
      } catch (err) {
        reportServiceProblem("rollBonuses", contributor, `${candidate.label}: validate failed`, err);
        continue;
      }
      offered.push({ ...candidate, id: `${contributor}:${candidate.id}`, contributor });
    }
  }
  return offered;
}

/** The roll after one bonus's effect, from the roll data of the use. */
export async function applyBonusEffect(roll: Roll, effect: BonusEffect, rollData: object, label: string): Promise<Roll> {
  const nameTerms = (bonusRoll: Roll) => {
    for (const term of bonusRoll.terms) if (!(term instanceof foundry.dice.terms.OperatorTerm)) term.options.flavor ||= label;
  };
  switch (effect.kind) {
    case "add": {
      const bonus = await new Roll(effect.formula, { ...roll.data, ...rollData }).evaluate();
      nameTerms(bonus);
      return addRollToAsync(roll, bonus);
    }
    case "reroll": {
      const options = effect.dice === "max" ? { maximize: true } : effect.dice === "min" ? { minimize: true } : {};
      let rerolled: Roll = await roll.reroll(options);
      if (effect.addFormula) {
        const RollClass = roll.constructor as typeof Roll;
        rerolled = await new RollClass(`${roll.formula} ${effect.addFormula}`, { ...roll.data, ...rollData }, roll.options).evaluate();
      }
      if (effect.keep === "higher") return (rerolled.total ?? 0) >= (roll.total ?? 0) ? rerolled : roll;
      if (effect.keep === "lower") return (rerolled.total ?? 0) <= (roll.total ?? 0) ? rerolled : roll;
      return rerolled;
    }
    case "replace": {
      const RollClass = roll.constructor as typeof Roll;
      return new RollClass(effect.formula, { ...roll.data, ...rollData }, roll.options).evaluate();
    }
    case "outcome": {
      const changed = await roll.clone().evaluate();
      foundry.utils.setProperty(changed, "options", foundry.utils.duplicate(roll.options));
      foundry.utils.setProperty(changed, "options.success", effect.success);
      return changed;
    }
    case "critical": {
      const term = roll.terms[0];
      if (term instanceof foundry.dice.terms.DiceTerm) {
        const result = term.results.find(r => r.active)?.result ?? roll.total;
        foundry.utils.setProperty(term, "options.critical", result);
        foundry.utils.setProperty(roll, "options.criticalSuccess", result);
      }
      return roll;
    }
    case "rider":
      return roll;
  }
}

/** Applies a bonus and runs its onChosen; a failure is reported and leaves the roll unchanged. */
export async function applyOfferedBonus(bonus: OfferedBonus, ctx: BonusContext, rollData: object): Promise<Roll> {
  let roll = ctx.roll;
  try {
    roll = await applyBonusEffect(ctx.roll, bonus.effect, rollData, bonus.label);
    const used: string[] = foundry.utils.getProperty(roll, "flags.midi-qol.optionalsUsed") as string[] ?? [];
    used.push(bonus.id);
    foundry.utils.setProperty(roll, "flags.midi-qol.optionalsUsed", used);
    await bonus.onChosen?.({ ...ctx, roll });
  } catch (err) {
    reportServiceProblem("rollBonuses", bonus.contributor, `${bonus.label}: applying it failed`, err);
  }
  return roll;
}
