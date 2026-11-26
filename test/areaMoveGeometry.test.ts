import { describe, expect, it } from "vitest";
import { snappedOffset } from "../src/module/lib/areaMoveGeometry.js";

// 100 px spaces of 5 ft; distances measured as 5/5/5 (the longer axis)
const chebyshev = (o: { x: number, y: number }) => Math.max(Math.abs(o.x), Math.abs(o.y));
const euclid = (o: { x: number, y: number }) => Math.hypot(o.x, o.y);

describe("moving an area to a picked point", () => {
  it("whole spaces, within the distance", () => {
    expect(snappedOffset({ x: 240, y: 30 }, 1200, 100, chebyshev)).toEqual({ x: 200, y: 0 });
    expect(snappedOffset({ x: 0, y: 0 }, 1200, 100, chebyshev)).toEqual({ x: 0, y: 0 });
  });
  it("a point beyond the distance is brought back along its line", () => {
    expect(snappedOffset({ x: 3000, y: 0 }, 1200, 100, chebyshev)).toEqual({ x: 1200, y: 0 });
    const diagonal = snappedOffset({ x: 2000, y: 2000 }, 600, 100, euclid);
    expect(euclid(diagonal)).toBeLessThanOrEqual(600);
    expect(diagonal.x % 100).toBe(0);
  });
  it("rounding up past the distance steps back a space", () => {
    expect(snappedOffset({ x: 560, y: 0 }, 560, 100, chebyshev)).toEqual({ x: 500, y: 0 });
  });
});
