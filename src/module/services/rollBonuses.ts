import type { Activity } from "../../globals.js";
import { defineService, entries, reportServiceProblem } from "../api/services.js";
import type { Workflow } from "../Workflow.js";
import { addRollToAsync, setBonusActionUsed, setReactionUsed, setActionUsed } from "../utils.js";
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
  /** Saves and checks: the ability; skills: the skill (when the roll names one). */
  ability?: string;
  skill?: string;
  tool?: string;
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
  /** Declared costs; a candidate whose cost does not fit what is available is not offered. midi spends them when chosen. */
  cost?: BonusCost;
  /** Its onChosen spends the cost itself (as CAT's bonuses do): midi only checks it. */
  spendsOwnCost?: boolean;
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

/**
 * Spends a declared cost from `actor`: actions through midi's economy markers, item/activity uses, spell slots, an
 * attribute, hit dice. effectCount and oncePer are midi-flag bookkeeping (the flags spend their own); material is not
 * spent (reported).
 */
export async function spendBonusCost(actor: Actor.Implementation, cost: BonusCost | undefined, label: string): Promise<void> {
  if (!cost) return;
  const report = (message: string) => reportServiceProblem("rollBonuses", "midi-qol", `${label}: ${message}`);
  for (const [key, entry] of Object.entries(cost.actions ?? {})) {
    if (!entry.cost) continue;
    if (key === "reaction") await setReactionUsed(actor);
    else if (key === "bonus") await setBonusActionUsed(actor);
    else if (key === "action") await setActionUsed(actor);
    else report(`unknown action cost "${key}"`);
  }
  for (const [uuid, entry] of Object.entries(cost.itemUses ?? {})) {
    const item = fromUuidSync(uuid);
    if (!(item instanceof Item)) { report(`no item ${uuid}`); continue; }
    // @ts-expect-error no dnd5e-types
    await item.update({ "system.uses.spent": (item.system.uses?.spent ?? 0) + entry.cost });
  }
  for (const [uuid, entry] of Object.entries(cost.activityUses ?? {})) {
    const activity = fromUuidSync(uuid) as { uses?: { spent?: number }, update?: (data: object) => Promise<unknown> } | null;
    if (!activity?.update) { report(`no activity ${uuid}`); continue; }
    await activity.update({ "uses.spent": (activity.uses?.spent ?? 0) + entry.cost });
  }
  for (const [slot, entry] of Object.entries(cost.spellSlots ?? {})) {
    const value = foundry.utils.getProperty(actor, `system.spells.${slot}.value`);
    if (typeof value !== "number") { report(`no spell slot ${slot}`); continue; }
    await actor.update({ [`system.spells.${slot}.value`]: Math.max(0, value - entry.cost) });
  }
  for (const [path, entry] of Object.entries(cost.attribute ?? {})) {
    const value = foundry.utils.getProperty(actor, path);
    if (typeof value !== "number") { report(`no number at ${path}`); continue; }
    await actor.update({ [path]: value - entry.cost });
  }
  for (const [die, entry] of Object.entries(cost.hitDice ?? {})) {
    // A class whose hit die is `die` with enough left
    // @ts-expect-error no dnd5e-types
    const cls = actor.items.find(i => i.type === "class" && i.system.hd?.denomination === die && (i.system.hd?.value ?? 0) >= entry.cost);
    if (!cls) { report(`no ${die} hit die left`); continue; }
    // @ts-expect-error no dnd5e-types
    await cls.update({ "system.hd.spent": (cls.system.hd.spent ?? 0) + entry.cost });
  }
  if (Object.keys(cost.material ?? {}).length) report("material costs are not spent by midi");
}

/** Applies a bonus and runs its onChosen; a failure is reported and leaves the roll unchanged. */
export async function applyOfferedBonus(bonus: OfferedBonus, ctx: BonusContext, rollData: object): Promise<Roll> {
  let roll = ctx.roll;
  try {
    roll = await applyBonusEffect(ctx.roll, bonus.effect, rollData, bonus.label);
    const used: string[] = foundry.utils.getProperty(roll, "flags.midi-qol.optionalsUsed") as string[] ?? [];
    used.push(bonus.id);
    foundry.utils.setProperty(roll, "flags.midi-qol.optionalsUsed", used);
    if (!bonus.spendsOwnCost) await spendBonusCost(ctx.query.actor, bonus.cost, bonus.label);
    await bonus.onChosen?.({ ...ctx, roll });
  } catch (err) {
    reportServiceProblem("rollBonuses", bonus.contributor, `${bonus.label}: applying it failed`, err);
  }
  return roll;
}
