import { describe, expect, it } from "vitest";
import { applyRollModifiers, type ModifierTarget, type RollModifier } from "../src/module/rules/rollModifiers.js";

function recorder() {
  const calls: string[] = [];
  const side = (name: string) => ({
    add: (source?: string, label?: string) => calls.push(`${name}.add ${source} ${label}`),
    suppress: (source?: string, label?: string) => calls.push(`${name}.suppress ${source} ${label}`)
  });
  const crit = (name: string) => ({
    force: (source: string, label?: string) => calls.push(`${name}.force ${source} ${label}`),
    suppress: (source: string, label?: string) => calls.push(`${name}.suppress ${source} ${label}`)
  });
  const tracker: ModifierTarget = {
    advantage: side("advantage"), disadvantage: side("disadvantage"), critical: crit("critical"), fumble: crit("fumble"),
    modifiers: {
      fail: (source, label) => calls.push(`fail ${source} ${label}`),
      succeed: (source, label) => calls.push(`succeed ${source} ${label}`),
      min: (value, source, label) => calls.push(`min ${value} ${source} ${label}`),
      max: (value, source, label) => calls.push(`max ${value} ${source} ${label}`)
    }
  };
  return { tracker, calls };
}

describe("applyRollModifiers", () => {
  it("maps each effect to its tracker call, attributed to provider and source", () => {
    const { tracker, calls } = recorder();
    const modifiers: RollModifier[] = [
      { effect: "advantage", label: "Help", source: "Effect.abc" },
      { effect: "disadvantage", label: "Poisoned" },
      { effect: "noAdvantage", label: "Cursed" },
      { effect: "noDisadvantage", label: "Steady" },
      { effect: "critical", label: "Paralyzed target" },
      { effect: "noCritical", label: "Adamantine" },
      { effect: "fumble", label: "Clumsy" },
      { effect: "noFumble", label: "Lucky" },
      { effect: "success", label: "Indomitable" },
      { effect: "fail", label: "Stunned" },
      { effect: "min", value: 10, label: "Reliable Talent" },
      { effect: "max", value: 5, label: "Hexed" }
    ];
    expect(applyRollModifiers(tracker, modifiers, "my-module")).toEqual([]);
    expect(calls).toEqual([
      "advantage.add my-module:Effect.abc Help",
      "disadvantage.add my-module:Poisoned Poisoned",
      "advantage.suppress my-module:Cursed Cursed",
      "disadvantage.suppress my-module:Steady Steady",
      "critical.force my-module:Paralyzed target Paralyzed target",
      "critical.suppress my-module:Adamantine Adamantine",
      "fumble.force my-module:Clumsy Clumsy",
      "fumble.suppress my-module:Lucky Lucky",
      "succeed my-module:Indomitable Indomitable",
      "fail my-module:Stunned Stunned",
      "min 10 my-module:Reliable Talent Reliable Talent",
      "max 5 my-module:Hexed Hexed"
    ]);
  });

  it("uses an exact key in place of provider:source when given", () => {
    const { tracker, calls } = recorder();
    applyRollModifiers(tracker, [{ effect: "disadvantage", key: "nearbyFoe", label: "Nearby foe" }], "midi-qol.nearbyFoe");
    expect(calls).toEqual(["disadvantage.add nearbyFoe Nearby foe"]);
  });

  it("skips and reports min/max without a number and unknown effects, applying the rest", () => {
    const { tracker, calls } = recorder();
    const problems = applyRollModifiers(tracker, [
      { effect: "min", label: "No value" },
      { effect: "max", value: Number.NaN, label: "NaN" },
      { effect: "sideways" as RollModifier["effect"], label: "Odd" },
      { effect: "advantage", label: "Still applied" }
    ], "p");
    expect(problems).toHaveLength(3);
    expect(calls).toEqual(["advantage.add p:Still applied Still applied"]);
  });
});
