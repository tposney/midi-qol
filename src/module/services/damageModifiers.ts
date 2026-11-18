import type { DamageApplicationOptions, DamageDescription } from "../../globals.js";
import { defineService, entries, reportServiceProblem } from "../api/services.js";
import { applyDamageChange, DamageChange, DamageStage } from "../rules/damageModifiers.js";

/*
 * damageModifiers (contributors): changes to the damage one target takes, in stages, inside dnd5e's damage calculation.
 * midi does the arithmetic (spread across the matching parts, never below 0), keeps the HP figures right, and lists each
 * change on the damage card under its label. dnd5e's calculation is synchronous, so contributors answer synchronously.
 *
 *   MidiQOL.services.register("damageModifiers", "my-module.heavyArmorMaster", {
 *     stage: "flatReduction",
 *     for({ actor, damage }) { return [{ types: ["bludgeoning", "piercing", "slashing"], amount: -3, label: "Heavy Armor Master" }]; }
 *   });
 */

export type { DamageChange, DamageStage } from "../rules/damageModifiers.js";

export interface DamageQuery {
  stage: DamageStage;
  /** The actor taking the damage. */
  actor: Actor.Implementation;
  /** Whoever dealt it, when known. */
  sourceActor?: Actor.Implementation;
  /** This target's damage parts as they stand at this stage (copies: change them through the returned changes). */
  damage: readonly { type: string, value: number, properties: ReadonlySet<string> }[];
  /** dnd5e's damage application options (options.midi carries midi's). */
  options: DamageApplicationOptions;
}

export interface DamageModifierContributor {
  /** The stage or stages it answers for. */
  stage: DamageStage | readonly DamageStage[];
  for(query: DamageQuery): readonly DamageChange[] | undefined;
}

declare module "../api/services.js" {
  interface MidiServices { damageModifiers: DamageModifierContributor }
}

export let damageModifiersService: ReturnType<typeof defineService<DamageModifierContributor>>;

export function defineDamageModifiersService() {
  damageModifiersService = defineService<DamageModifierContributor>("damageModifiers", {
    kind: "contributors",
    description: "Damage bonuses and reductions per target, in stages (bonus, flat reduction, percent reduction, complete), shown on the damage card"
  });
}

function displayEntry(label: string, applied: number): DamageDescription {
  // Display only (value 0, inlined): the change is already in the parts; the card shows displayValue and the label
  return {
    type: "none", value: 0, displayValue: applied, potential: {}, allActives: [label], properties: new Set(),
    active: { multiplier: 1, inlined: true, type: { modification: true } }
  };
}

/**
 * Runs the contributors for one stage over a target's damage (mutated in place: parts changed, bonus parts and display
 * entries added). `counts` says which entries are damage a change may touch.
 */
export function applyDamageModifierStage(stage: DamageStage, actor: Actor.Implementation, sourceActor: Actor.Implementation | undefined,
  damages: DamageDescription[], options: DamageApplicationOptions, counts: (damage: DamageDescription) => boolean): void {
  if (!damageModifiersService) return;
  for (const { id, provider } of entries<DamageModifierContributor>("damageModifiers")) {
    const stages: readonly DamageStage[] = typeof provider.stage === "string" ? [provider.stage] : provider.stage;
    if (!stages.includes(stage)) continue;
    let changes: unknown;
    try {
      changes = provider.for({
        stage, actor, sourceActor, options,
        damage: damages.filter(counts).map(d => ({ type: d.type, value: d.value, properties: new Set(d.properties ?? []) }))
      });
    } catch (err) {
      reportServiceProblem("damageModifiers", id, `failed at ${stage}`, err);
      continue;
    }
    if (changes instanceof Promise) {
      reportServiceProblem("damageModifiers", id, "answered with a promise; damage is calculated synchronously, so it is ignored");
      continue;
    }
    if (!Array.isArray(changes)) continue;
    for (const change of changes as DamageChange[]) {
      const result = applyDamageChange(stage, damages, change, part => counts(part as DamageDescription));
      if (result.problem) {
        reportServiceProblem("damageModifiers", id, `${change.label}: ${result.problem}`);
        continue;
      }
      if (result.added) damages.push({ type: result.added.type, value: result.added.value, properties: new Set(), allActives: [change.label] });
      else if (result.applied) damages.push(displayEntry(change.label, result.applied));
    }
  }
}
