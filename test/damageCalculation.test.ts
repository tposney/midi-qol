import { describe, expect, it } from "vitest";
import { damageCalculationOrder, registerDamageCalculationStep, removeDamageCalculationStep, runDamageCalculation } from "../src/module/steps/damageCalculation.js";

describe("damageCalculationOrder", () => {
  it("DR before saves, both before resistances", () => {
    expect(damageCalculationOrder("pre", "DRSaveDr")).toEqual(["midi-qol.sourceIgnores", "midi-qol.dropUnmatchedOtherDamage", "midi-qol.uncannyDodge",
      "midi-qol.modifiers.bonus", "midi-qol.damageReduction", "midi-qol.modifiers.flatReduction", "midi-qol.absorption"]);
    expect(damageCalculationOrder("calculate", "DRSaveDr")).toEqual(["midi-qol.restoreAbsorption", "midi-qol.saves", "midi-qol.traitMultipliers",
      "midi-qol.customResistances", "midi-qol.modifiers.percentReduction", "midi-qol.modifiers.complete"]);
  });
  it("saves then DR before resistances", () => {
    expect(damageCalculationOrder("pre", "SaveDRDr")).toContain("midi-qol.saves");
    expect(damageCalculationOrder("pre", "SaveDRDr").indexOf("midi-qol.saves")).toBeLessThan(damageCalculationOrder("pre", "SaveDRDr").indexOf("midi-qol.damageReduction"));
    expect(damageCalculationOrder("calculate", "SaveDRDr")).not.toContain("midi-qol.damageReduction");
  });
  it("saves before resistances, DR after them", () => {
    expect(damageCalculationOrder("pre", "SaveDrDR")).not.toContain("midi-qol.damageReduction");
    const calc = damageCalculationOrder("calculate", "SaveDrDR");
    expect(calc.indexOf("midi-qol.damageReduction")).toBe(calc.indexOf("midi-qol.modifiers.percentReduction") + 1);
  });
});

describe("runDamageCalculation", () => {
  it("runs registered steps in order, skips missing ones, stops on false; a step can be replaced or removed", () => {
    const seen: string[] = [];
    for (const id of damageCalculationOrder("calculate", "SaveDrDR")) registerDamageCalculationStep(id, () => { seen.push(id); });
    removeDamageCalculationStep("midi-qol.traitMultipliers");
    registerDamageCalculationStep("midi-qol.customResistances", () => { seen.push("replaced"); });
    expect(runDamageCalculation("calculate", "SaveDrDR", {})).toBe(true);
    expect(seen).toEqual(["midi-qol.restoreAbsorption", "replaced", "midi-qol.modifiers.percentReduction", "midi-qol.damageReduction", "midi-qol.modifiers.complete"]);
    registerDamageCalculationStep("midi-qol.damageReduction", () => false);
    seen.length = 0;
    expect(runDamageCalculation("calculate", "SaveDrDR", {})).toBe(false);
    expect(seen).not.toContain("midi-qol.modifiers.complete");
  });
});
