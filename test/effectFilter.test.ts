import { describe, expect, it } from "vitest";
import { isEffectFilter, judgeEffect, type EffectFacts } from "../src/module/lib/entries/effectFilter.js";

const facts = (f: Partial<EffectFacts> = {}): EffectFacts => ({ statuses: [], changeKeys: [], ...f });

describe("judgeEffect", () => {
  it("Dispel Magic: at or below its level ends, above it a check at that level, unknown asked", () => {
    const dispel = { spell: true, maxLevel: 3, check: true };
    expect(judgeEffect(facts({ spell: { level: 2 } }), dispel)).toEqual({ verdict: "end" });
    expect(judgeEffect(facts({ spell: { level: 3 } }), dispel)).toEqual({ verdict: "end" });
    expect(judgeEffect(facts({ spell: { level: 5 } }), dispel)).toEqual({ verdict: "check", level: 5 });
    expect(judgeEffect(facts({ spell: {} }), dispel)).toEqual({ verdict: "ask" });
    expect(judgeEffect(facts({ spell: { level: 5 } }), { spell: true, maxLevel: 3 })).toEqual({ verdict: "keep" });
  });

  it("not a spell, an instantaneous spell, the creature's concentration or its item's effect: kept", () => {
    const dispel = { spell: true, maxLevel: 9 };
    expect(judgeEffect(facts(), dispel).verdict).toBe("keep");
    expect(judgeEffect(facts({ spell: { level: 1, instantaneous: true } }), dispel).verdict).toBe("keep");
    expect(judgeEffect(facts({ spell: { level: 1 }, concentration: true }), dispel).verdict).toBe("keep");
    expect(judgeEffect(facts({ spell: { level: 1 }, fromOwnItem: true }), dispel).verdict).toBe("keep");
  });

  it("Remove Curse: the Cursed status; Dispel Evil and Good: Charmed or Frightened from those types", () => {
    expect(judgeEffect(facts({ statuses: ["cursed"] }), { statuses: ["cursed"] }).verdict).toBe("end");
    expect(judgeEffect(facts({ statuses: ["poisoned"] }), { statuses: ["cursed"] }).verdict).toBe("keep");
    const evil = { statuses: ["charmed", "frightened"], fromTypes: ["fiend", "undead"] };
    expect(judgeEffect(facts({ statuses: ["charmed"], originType: "fiend" }), evil).verdict).toBe("end");
    expect(judgeEffect(facts({ statuses: ["charmed"], originType: "humanoid" }), evil).verdict).toBe("keep");
  });

  it("changes: an effect lowering an ability score", () => {
    const filter = { changes: ["system.abilities."] };
    expect(judgeEffect(facts({ changeKeys: ["system.abilities.str.value"] }), filter).verdict).toBe("end");
    expect(judgeEffect(facts({ changeKeys: ["system.attributes.ac.bonus"] }), filter).verdict).toBe("keep");
  });

  it("a filter is told from a status, a name and { origin }", () => {
    expect(isEffectFilter({ spell: true })).toBe(true);
    expect(isEffectFilter({ origin: "this item" })).toBe(false);
    expect(isEffectFilter("cursed")).toBe(false);
  });
});
