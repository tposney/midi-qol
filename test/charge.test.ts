import { describe, expect, it } from "vitest";
import { straightRunToward } from "../src/module/lib/charge.js";

const slack = 75;
const target = { x: 1000, y: 500 };

describe("straightRunToward (Ram: moved straight toward the target just before)", () => {
  it("a straight run toward the target: from its start to where the mover is", () => {
    expect(straightRunToward([{ x: 100, y: 500 }, { x: 300, y: 500 }, { x: 900, y: 500 }], target, { slack })).toEqual({ start: { x: 100, y: 500 }, end: { x: 900, y: 500 } });
  });
  it("only the last straight leg counts after a turn", () => {
    expect(straightRunToward([{ x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 500 }, { x: 900, y: 500 }], target, { slack })).toEqual({ start: { x: 500, y: 500 }, end: { x: 900, y: 500 } });
  });
  it("a grid path's small steps stay one run", () => {
    const steps = [{ x: 100, y: 100 }, { x: 200, y: 200 }, { x: 300, y: 200 }, { x: 400, y: 300 }, { x: 500, y: 300 }];
    expect(straightRunToward(steps, { x: 800, y: 450 }, { slack })?.start).toEqual({ x: 100, y: 100 });
  });
  it("a run away from the target is none", () => {
    expect(straightRunToward([{ x: 900, y: 500 }, { x: 300, y: 500 }], target, { slack })).toBeUndefined();
  });
  it("no movement is none", () => {
    expect(straightRunToward([{ x: 900, y: 500 }, { x: 900, y: 500 }], target, { slack })).toBeUndefined();
    expect(straightRunToward([], target, { slack })).toBeUndefined();
  });
});
