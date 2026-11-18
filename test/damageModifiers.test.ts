import { describe, expect, it } from "vitest";
import { applyDamageChange, type DamagePart } from "../src/module/rules/damageModifiers.js";

const parts = (...p: [string, number][]): DamagePart[] => p.map(([type, value]) => ({ type, value }));
const total = (p: DamagePart[]) => p.reduce((s, x) => s + x.value, 0);

describe("applyDamageChange", () => {
  it("bonus: a new part of its one type, parts untouched", () => {
    const p = parts(["slashing", 10]);
    expect(applyDamageChange("bonus", p, { types: ["radiant"], amount: 4, label: "Smite" })).toEqual({ applied: 4, added: { type: "radiant", value: 4 } });
    expect(p).toEqual(parts(["slashing", 10]));
    expect(applyDamageChange("bonus", p, { amount: 4, label: "x" }).problem).toMatch(/one damage type/);
    expect(applyDamageChange("bonus", p, { types: ["fire"], amount: -1, label: "x" }).problem).toMatch(/positive/);
  });

  it("flatReduction: spread over the matching parts in proportion, never below 0", () => {
    const p = parts(["slashing", 6], ["piercing", 2], ["fire", 10]);
    expect(applyDamageChange("flatReduction", p, { types: ["slashing", "piercing"], amount: -4, label: "HAM" }).applied).toBe(-4);
    expect(p).toEqual(parts(["slashing", 3], ["piercing", 1], ["fire", 10]));
    const q = parts(["slashing", 3]);
    expect(applyDamageChange("flatReduction", q, { amount: -10, label: "DR" }).applied).toBe(-3);
    expect(total(q)).toBe(0);
    expect(applyDamageChange("flatReduction", q, { amount: 2, label: "x" }).problem).toMatch(/negative/);
  });

  it("percentReduction: scales the matching parts", () => {
    const p = parts(["fire", 10], ["cold", 8]);
    expect(applyDamageChange("percentReduction", p, { types: ["fire"], multiplier: 0.5, label: "Half" }).applied).toBe(-5);
    expect(p).toEqual(parts(["fire", 5], ["cold", 8]));
    expect(applyDamageChange("percentReduction", p, { multiplier: -1, label: "x" }).problem).toBeDefined();
  });

  it("complete: a multiplier or a flat amount either way", () => {
    const p = parts(["fire", 10]);
    expect(applyDamageChange("complete", p, { multiplier: 2, label: "Double" }).applied).toBe(10);
    expect(applyDamageChange("complete", p, { amount: -5, label: "Less" }).applied).toBe(-5);
    expect(total(p)).toBe(15);
    expect(applyDamageChange("complete", p, { label: "Nothing" }).problem).toBeDefined();
  });

  it("a change gives an amount or a multiplier, not both; spread parts stay fractional", () => {
    const p = parts(["fire", 10]);
    expect(applyDamageChange("complete", p, { amount: -2, multiplier: 0.5, label: "Both" }).problem).toMatch(/not both/);
    expect(total(p)).toBe(10);
    const q = parts(["slashing", 5], ["fire", 5], ["cold", 5]);
    expect(applyDamageChange("flatReduction", q, { amount: -4, label: "DR" }).applied).toBe(-4);
    expect(q.map(part => part.value)).toEqual([5 - 4 / 3, 5 - 4 / 3, 5 - 4 / 3]);
  });

  it("only touches parts `counts` allows", () => {
    const p = parts(["healing", 10], ["fire", 10]);
    applyDamageChange("flatReduction", p, { amount: -4, label: "DR" }, part => part.type !== "healing");
    expect(p).toEqual(parts(["healing", 10], ["fire", 6]));
  });
});
