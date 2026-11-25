import { describe, expect, it } from "vitest";
import { besideSpots, freeSpot, insideSpot, isInside } from "../src/module/lib/carryGeometry.js";

const huge = { x: 300, y: 300, width: 300, height: 300 };
const medium = { width: 100, height: 100 };

describe("carry geometry", () => {
  it("inside: centred in the outer token's space", () => {
    expect(insideSpot(huge, medium)).toEqual({ x: 400, y: 400 });
    expect(insideSpot({ x: 0, y: 0, width: 100, height: 100 }, medium)).toEqual({ x: 0, y: 0 });
    expect(isInside(huge, { x: 400, y: 400, ...medium })).toBe(true);
    expect(isInside(huge, { x: 300, y: 400, ...medium })).toBe(false);
  });

  it("beside: every touching space once, sides before corners", () => {
    const spots = besideSpots(huge, medium, 100);
    expect(spots).toHaveLength(16);
    expect(new Set(spots.map(s => `${s.x},${s.y}`)).size).toBe(16);
    expect(spots.slice(0, 4).map(s => `${s.x},${s.y}`).sort()).toEqual(["200,400", "400,200", "400,600", "600,400"]);
    for (const s of spots) expect(s.x >= 300 && s.x < 600 && s.y >= 300 && s.y < 600).toBe(false);
  });

  it("beside: nearest to a preferred point first", () => {
    expect(besideSpots(huge, medium, 100, { x: 0, y: 0 })[0]).toEqual({ x: 200, y: 200 });
  });

  it("the first free spot skips taken spaces and what walls refuse", () => {
    const spots = besideSpots({ x: 100, y: 100, width: 100, height: 100 }, medium, 100, { x: 0, y: 150 });
    expect(spots[0]).toEqual({ x: 0, y: 100 });
    expect(freeSpot(spots, medium, [{ x: 0, y: 100, ...medium }])).not.toEqual({ x: 0, y: 100 });
    expect(freeSpot(spots, medium, [], s => s.x !== 0)!.x).not.toBe(0);
    expect(freeSpot(spots, medium, [], () => false)).toBeUndefined();
  });
});
