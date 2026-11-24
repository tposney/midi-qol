import { describe, expect, it } from "vitest";
import { crossesOppositeSides, opposedByAngle, segmentsIntersect } from "../src/rules/flanking/math.js";

// A 1x1 target on a 100px grid: cell (1,1), box from (100,100) to (200,200). Cell centres are at 50, 150, 250.
const target = { x: 100, y: 100, width: 100, height: 100 };
const centre = (col: number, row: number) => ({ x: col * 100 + 50, y: row * 100 + 50 });

describe("segmentsIntersect (Foundry's lineSegmentIntersection, ends included)", () => {
  it("crossing, touching at an end, parallel and zero-length", () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(false);
  });
});

describe("crossesOppositeSides", () => {
  it("flanks from opposite edges and opposite corners", () => {
    expect(crossesOppositeSides(target, centre(0, 1), centre(2, 1))).toBe(true);   // west / east
    expect(crossesOppositeSides(target, centre(1, 0), centre(1, 2))).toBe(true);   // north / south
    expect(crossesOppositeSides(target, centre(0, 0), centre(2, 2))).toBe(true);   // diagonal through the corners
  });

  it("does not flank from adjacent or same-side cells", () => {
    expect(crossesOppositeSides(target, centre(0, 1), centre(1, 0))).toBe(false);  // west / north
    expect(crossesOppositeSides(target, centre(0, 0), centre(0, 2))).toBe(false);  // both west
    expect(crossesOppositeSides(target, centre(0, 0), centre(2, 1))).toBe(false);  // north-west / east
  });

  it("a large target: opposite sides of a 2x2 box", () => {
    const big = { x: 100, y: 100, width: 200, height: 200 };
    expect(crossesOppositeSides(big, centre(0, 1), centre(3, 2))).toBe(true);
    expect(crossesOppositeSides(big, centre(0, 1), centre(1, 0))).toBe(false);
  });
});

describe("opposedByAngle", () => {
  const c = { x: 0, y: 0 };
  it("150 degrees or more apart flanks", () => {
    expect(opposedByAngle(c, { x: -10, y: 0 }, { x: 10, y: 0 })).toBe(true);                 // 180
    const at = (deg: number) => ({ x: Math.cos(deg * Math.PI / 180), y: Math.sin(deg * Math.PI / 180) });
    expect(opposedByAngle(c, at(0), at(150))).toBe(true);
    expect(opposedByAngle(c, at(0), at(149))).toBe(false);
    expect(opposedByAngle(c, at(170), at(-170))).toBe(false);                                  // 20 apart across the seam
    expect(opposedByAngle(c, at(100), at(-100))).toBe(true);                                   // 160 apart across the seam
  });
});
