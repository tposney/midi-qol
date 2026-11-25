import { describe, expect, it } from "vitest";
import { barrierSegments, circleSegments, lineAxis, polygonSegments } from "../src/module/lib/barrierGeometry.js";

describe("barrier geometry", () => {
  it("a line's axis runs from its origin along its rotation", () => {
    expect(lineAxis({ type: "line", x: 100, y: 200, length: 300, rotation: 0 })).toEqual([100, 200, 400, 200]);
    expect(lineAxis({ type: "line", x: 100, y: 200, length: 300, rotation: 90 })).toEqual([100, 200, 100, 500]);
    expect(lineAxis({ type: "line", x: 0, y: 0, length: 100, rotation: 180 })).toEqual([0, 0, -100, 0]);
  });

  it("a polygon's edges close it; zero-length edges are dropped", () => {
    expect(polygonSegments([0, 0, 100, 0, 100, 100, 0, 100])).toEqual([[0, 0, 100, 0], [100, 0, 100, 100], [100, 100, 0, 100], [0, 100, 0, 0]]);
    expect(polygonSegments([0, 0, 0, 0, 50, 0])).toEqual([[0, 0, 50, 0], [50, 0, 0, 0]]);
  });

  it("a polygon of many points is thinned to the cap and still closed", () => {
    const flat: number[] = [];
    for (let i = 0; i < 120; i++) flat.push(Math.cos(2 * Math.PI * i / 120) * 500, Math.sin(2 * Math.PI * i / 120) * 500);
    const segments = polygonSegments(flat, 32);
    expect(segments).toHaveLength(32);
    for (let i = 0; i < segments.length; i++) {
      const next = segments[(i + 1) % segments.length];
      expect([segments[i][2], segments[i][3]]).toEqual([next[0], next[1]]);
    }
  });

  it("a circle as closed segments", () => {
    const segments = circleSegments({ type: "ring", x: 0, y: 0, radius: 100 }, 8);
    expect(segments).toHaveLength(8);
    expect(segments[0].slice(0, 2)).toEqual([100, 0]);
    expect(segments.at(-1)!.slice(2)).toEqual([100, 0]);
  });

  it("auto: lines give their axes, a ring its circle, anything else the outline", () => {
    const square = [[0, 0, 100, 0, 100, 100, 0, 100]];
    expect(barrierSegments([{ type: "line", x: 0, y: 0, length: 200, rotation: 0 }], square)).toEqual([[0, 0, 200, 0]]);
    expect(barrierSegments([{ type: "ring", x: 0, y: 0, radius: 50 }], square)).toHaveLength(24);
    expect(barrierSegments([{ type: "rectangle" }], square)).toHaveLength(4);
    expect(barrierSegments([{ type: "line", x: 0, y: 0, length: 200, rotation: 0 }, { type: "circle" }], square)).toHaveLength(4);
  });

  it("a trace asked for is used when the area has the shape for it, else the outline", () => {
    const square = [[0, 0, 100, 0, 100, 100, 0, 100]];
    expect(barrierSegments([{ type: "line", x: 0, y: 0, length: 200, rotation: 0 }], square, "outline")).toHaveLength(4);
    expect(barrierSegments([{ type: "rectangle" }], square, "axis")).toHaveLength(4);
  });
});
