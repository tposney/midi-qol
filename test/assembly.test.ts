import { describe, expect, it } from "vitest";
import { assembleSteps, stepAfterInFlow } from "../src/module/steps/assembly.js";

describe("assembleSteps", () => {
  it("inserts before and after their anchors: global before call, then priority, then order", () => {
    const { anchors } = assembleSteps([
      { kind: "insert", step: "call.a", after: "midi-qol.damage", layer: "call" },
      { kind: "insert", step: "g.low", after: "midi-qol.damage", layer: "global", priority: 0 },
      { kind: "insert", step: "g.high", after: "midi-qol.damage", layer: "global", priority: 5 },
      { kind: "insert", step: "g.before", before: "midi-qol.saves", layer: "global" }
    ]);
    expect(anchors["midi-qol.damage"].after).toEqual(["g.high", "g.low", "call.a"]);
    expect(anchors["midi-qol.saves"].before).toEqual(["g.before"]);
  });

  it("a replacement from the call beats a global one; the loser is reported", () => {
    const { anchors, conflicts } = assembleSteps([
      { kind: "replace", target: "midi-qol.saves", step: "g.saves", layer: "global", priority: 10 },
      { kind: "replace", target: "midi-qol.saves", step: "call.saves", layer: "call" }
    ]);
    expect(anchors["midi-qol.saves"].replacement).toBe("call.saves");
    expect(conflicts).toEqual([{ anchor: "midi-qol.saves", kind: "replace", winner: "call.saves", losers: ["g.saves"] }]);
  });

  it("within a layer the higher priority wins, then the earlier", () => {
    expect(assembleSteps([
      { kind: "replace", target: "x", step: "a", layer: "global", priority: 1 },
      { kind: "replace", target: "x", step: "b", layer: "global", priority: 2 }
    ]).anchors.x.replacement).toBe("b");
    expect(assembleSteps([
      { kind: "replace", target: "x", step: "a", layer: "global" },
      { kind: "replace", target: "x", step: "b", layer: "global" }
    ]).anchors.x.replacement).toBe("a");
  });

  it("remove and replace compete by the same rule", () => {
    const { anchors, conflicts } = assembleSteps([
      { kind: "replace", target: "x", step: "r", layer: "global" },
      { kind: "remove", target: "x", layer: "call", source: "my-call" }
    ]);
    expect(anchors.x.removed).toBe(true);
    expect(anchors.x.replacement).toBeUndefined();
    expect(conflicts[0]).toEqual({ anchor: "x", kind: "remove", winner: "my-call", losers: ["r"] });
  });

  it("wraps in run order, outermost first", () => {
    const { anchors } = assembleSteps([
      { kind: "wrap", target: "x", wrapper: "call.w", layer: "call" },
      { kind: "wrap", target: "x", wrapper: "g.w", layer: "global" }
    ]);
    expect(anchors.x.wraps).toEqual(["g.w", "call.w"]);
  });

  it("stepAfterInFlow", () => {
    expect(stepAfterInFlow(["a", "b", "c"], "b")).toBe("c");
    expect(stepAfterInFlow(["a", "b"], "b")).toBeUndefined();
    expect(stepAfterInFlow(["a"], "z")).toBeUndefined();
  });
});
