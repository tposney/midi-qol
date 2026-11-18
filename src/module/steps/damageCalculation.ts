import { Registry } from "../api/registry.js";

/*
 * midi's damage calculation as steps (M2 stage 6): what midi does to a target's damage inside dnd5e's calculation,
 * each step registered by id so it can be replaced or turned off. They run in dnd5e's two calculation hooks
 * (preCalculateDamage, then calculateDamage after dnd5e's resistances), in the order the "save / DR order" setting
 * picks. The damageModifiers stages (bonus, flat and percent reduction, complete) are steps here too. No Foundry here.
 */

export type DamageCalculationPhase = "pre" | "calculate";
/** The setting: DRSaveDr = DR, then saves; SaveDRDr = saves, then DR (both before resistances); SaveDrDR = saves, then DR after resistances. */
export type SaveDROrder = "DRSaveDr" | "SaveDRDr" | "SaveDrDR" | string;

/** A step's run: false cancels the damage application. */
export type DamageCalculationRun<P> = (params: P) => boolean | void;

/** The steps of each phase, in order, for a save / DR order. */
export function damageCalculationOrder(phase: DamageCalculationPhase, order: SaveDROrder): string[] {
  if (phase === "pre") {
    const savesAndDR = order === "DRSaveDr" ? ["midi-qol.damageReduction"]
      : order === "SaveDRDr" ? ["midi-qol.saves", "midi-qol.damageReduction"]
      : order === "SaveDrDR" ? ["midi-qol.saves"] : [];
    return ["midi-qol.sourceIgnores", "midi-qol.dropUnmatchedOtherDamage", "midi-qol.uncannyDodge", "midi-qol.modifiers.bonus",
      ...savesAndDR, "midi-qol.modifiers.flatReduction", "midi-qol.absorption"];
  }
  return ["midi-qol.restoreAbsorption", ...(order === "DRSaveDr" ? ["midi-qol.saves"] : []), "midi-qol.traitMultipliers",
    "midi-qol.customResistances", "midi-qol.modifiers.percentReduction", ...(order === "SaveDrDR" ? ["midi-qol.damageReduction"] : []),
    "midi-qol.modifiers.complete"];
}

const steps = new Registry<DamageCalculationRun<any>>();

/** Register (or replace, by id) a damage calculation step. */
export function registerDamageCalculationStep<P>(id: string, run: DamageCalculationRun<P>): void {
  steps.set(id, run);
}

/** A registered step's run (to wrap or restore it). */
export function getDamageCalculationStep<P>(id: string): DamageCalculationRun<P> | undefined {
  return steps.get(id)?.value;
}

/** Turn a step off: it is skipped. */
export function removeDamageCalculationStep(id: string): boolean {
  return steps.delete(id);
}

/** Runs a phase's steps in order; false when one cancels. Unregistered steps are skipped. */
export function runDamageCalculation<P>(phase: DamageCalculationPhase, order: SaveDROrder, params: P): boolean {
  for (const id of damageCalculationOrder(phase, order)) {
    const run = steps.get(id)?.value;
    if (run && run(params) === false) return false;
  }
  return true;
}
