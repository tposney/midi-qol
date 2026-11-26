import { describe, expect, it } from "vitest";
import { spacesEntered } from "../src/module/lib/spaceEntry.js";

const g = 100;
const sq = (cx: number, cy: number, size = 1) => ({ x: cx * g, y: cy * g, width: size * g, height: size * g });

describe("spacesEntered", () => {
  it("the creatures a straight move passes through, in order", () => {
    const others = [{ key: "far", rect: sq(4, 0) }, { key: "near", rect: sq(2, 0) }, { key: "aside", rect: sq(2, 1) }];
    expect(spacesEntered(sq(0, 0), [{ x: 5 * g, y: 0 }], others, g)).toEqual(["near", "far"]);
  });

  it("a Large mover enters what its whole space covers", () => {
    const others = [{ key: "below", rect: sq(2, 1) }, { key: "outside", rect: sq(2, 2) }];
    expect(spacesEntered(sq(0, 0, 2), [{ x: 3 * g, y: 0 }], others, g)).toEqual(["below"]);
  });

  it("each creature once, along a path with turns; not one it started over", () => {
    const others = [{ key: "start", rect: sq(0, 0) }, { key: "corner", rect: sq(2, 0) }, { key: "down", rect: sq(2, 2) }];
    const path = [{ x: 2 * g, y: 0 }, { x: 2 * g, y: 3 * g }, { x: 2 * g, y: 0 }];
    expect(spacesEntered(sq(0, 0), path, others, g)).toEqual(["corner", "down"]);
  });

  it("passing alongside (touching edges) enters nothing", () => {
    expect(spacesEntered(sq(0, 0), [{ x: 3 * g, y: 0 }], [{ key: "beside", rect: sq(1, 1) }], g)).toEqual([]);
  });
});
