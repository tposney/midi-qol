import { describe, expect, it } from "vitest";
import { damageOutcome } from "../src/module/lib/outcomes.js";

const d = (type: string, value: number) => ({ type, value, properties: new Set<string>() });

// M26: a target's damage outcome from its damage entries
describe("damageOutcome (M26)", () => {
  it("none without entries", () => {
    expect(damageOutcome([])).toBeUndefined();
  });
  it("rolled, applied and prevented by type; dropped to 0", () => {
    const outcome = damageOutcome([{ damages: [d("fire", 10), d("slashing", 6)], calculatedDamages: [d("fire", 5), d("slashing", 6)],
      hpDamage: 11, tempDamage: 0, oldHP: 11, newHP: 0 }]);
    expect(outcome).toEqual({ rolled: { fire: 10, slashing: 6 }, applied: { fire: 5, slashing: 6 }, prevented: { fire: 5 },
      hp: 11, temp: 0, healed: 0, droppedToZero: true });
  });
  it("two lists (other damage): summed, HP before from the first, after from the last", () => {
    const outcome = damageOutcome([
      { damages: [d("piercing", 4)], calculatedDamages: [d("piercing", 4)], hpDamage: 4, tempDamage: 0, oldHP: 7, newHP: 3 },
      { damages: [d("poison", 6)], calculatedDamages: [d("poison", 0)], hpDamage: 0, tempDamage: 0, oldHP: 3, newHP: 3 }]);
    expect(outcome?.prevented).toEqual({ poison: 6 });
    expect(outcome?.droppedToZero).toBe(false);
    expect(outcome?.hp).toBe(4);
  });
  it("healing is healed, not prevented", () => {
    const outcome = damageOutcome([{ damages: [d("healing", 8)], calculatedDamages: [d("healing", -8)], hpDamage: -8, tempDamage: 0, oldHP: 2, newHP: 10 }]);
    expect(outcome).toMatchObject({ hp: 0, healed: 8, prevented: {}, droppedToZero: false });
  });
});

import { rowFor } from "../src/module/lib/tableRows.js";

// M28: an inline table's row for a total
describe("rowFor (M28)", () => {
  const rows = [{ range: [1, 2] as [number, number], label: "low" }, { range: [3, 6] as [number, number], label: "high" }];
  it("the row a total falls in", () => {
    expect(rowFor(rows, 1)).toBe(0);
    expect(rowFor(rows, 6)).toBe(1);
  });
  it("-1 outside every row", () => {
    expect(rowFor(rows, 7)).toBe(-1);
  });
});
