import { describe, expect, it } from "vitest";
import { rangeBand, rangeInGridUnits } from "../src/module/rules/range.js";

describe("rangeBand", () => {
  it("normal, long and beyond with a long range", () => {
    expect(rangeBand(30, 30, 120)).toBe("normal");
    expect(rangeBand(31, 30, 120)).toBe("long");
    expect(rangeBand(120, 30, 120)).toBe("long");
    expect(rangeBand(121, 30, 120)).toBe("beyond");
  });
  it("without a long range, past range is beyond", () => {
    expect(rangeBand(5, 5, 0)).toBe("normal");
    expect(rangeBand(6, 5, 0)).toBe("beyond");
  });
});

describe("rangeInGridUnits", () => {
  it("miles to feet or yards, kilometres to metres, others unchanged", () => {
    expect(rangeInGridUnits(1, "mi", "ft")).toBe(5280);
    expect(rangeInGridUnits(1, "mi", "Yards")).toBe(1760);
    expect(rangeInGridUnits(2, "km", "m")).toBe(2000);
    expect(rangeInGridUnits(60, "ft", "ft")).toBe(60);
    expect(rangeInGridUnits(1, "mi", "m")).toBe(1);
  });
});
