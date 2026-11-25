import { describe, expect, it } from "vitest";
import { scriptedFace, uniformFor } from "../src/module/lib/fixedDice.js";

// Foundry's face for a uniform value u (DiceTerm#mapRandomFace with minValue 1)
const face = (u: number, faces: number) => Math.ceil((1 - u) * faces);

describe("fixed dice (M25)", () => {
  for (const faces of [4, 6, 8, 10, 12, 20]) {
    it(`d${faces}: min, average, max and positions`, () => {
      expect(face(uniformFor("min"), faces)).toBe(1);
      expect(face(uniformFor("max"), faces)).toBe(faces);
      expect(face(uniformFor("average"), faces)).toBe(Math.ceil(faces / 2));
      expect(face(uniformFor(0), faces)).toBe(1);
      expect(face(uniformFor(1), faces)).toBe(faces);
      expect(face(uniformFor(0.5), faces)).toBe(Math.ceil(faces / 2));
    });
  }
  it("every value is a valid uniform (in [0, 1))", () => {
    for (const value of ["min", "average", "max", 0, 0.25, 1, -1, 2] as const) {
      const u = uniformFor(value);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
  it("a dice script (M23): faces per die size in the order rolled, then none", () => {
    const script = { faces: { d20: [17, 4], d8: 8 } };
    expect(scriptedFace(script, 20)).toBe(17);
    expect(scriptedFace(script, 8)).toBe(8);
    expect(scriptedFace(script, 20)).toBe(4);
    expect(scriptedFace(script, 20)).toBeUndefined();
    expect(scriptedFace(script, 8)).toBeUndefined();
    expect(scriptedFace(script, 6)).toBeUndefined();
    expect(scriptedFace({ faces: { d20: 20 } }, 20), "a new script starts again").toBe(20);
  });
});
