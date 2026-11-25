import { describe, expect, it } from "vitest";
import { conditionsPresent, planConditionRemoval } from "../src/module/lib/entries/conditionRemoval.js";

const riders = (status: string) => status === "paralyzed" ? ["incapacitated"] : status === "unconscious" ? ["incapacitated", "prone"] : [];

describe("ending a condition", () => {
  it("the bare status and an effect that is only the condition are deleted", () => {
    const plan = planConditionRemoval([
      { id: "bare", statuses: ["poisoned"], hasChanges: false },
      { id: "spell", statuses: ["poisoned"], hasChanges: false },
      { id: "other", statuses: ["blinded"], hasChanges: false }
    ], "poisoned", riders);
    expect(plan).toEqual({ delete: ["bare", "spell"], strip: [] });
  });

  it("an effect that carries more keeps the rest and loses the status", () => {
    const plan = planConditionRemoval([
      { id: "venom", statuses: ["poisoned"], hasChanges: true },
      { id: "two", statuses: ["poisoned", "blinded"], hasChanges: false }
    ], "poisoned", riders);
    expect(plan).toEqual({ delete: [], strip: [{ id: "venom", statuses: [] }, { id: "two", statuses: ["blinded"] }] });
  });

  it("whole: every carrier ends", () => {
    const plan = planConditionRemoval([{ id: "venom", statuses: ["poisoned"], hasChanges: true }], "poisoned", riders, true);
    expect(plan).toEqual({ delete: ["venom"], strip: [] });
  });

  it("a status listed with its own riders is still only that condition", () => {
    const plan = planConditionRemoval([{ id: "hold", statuses: ["paralyzed", "incapacitated"], hasChanges: false }], "paralyzed", riders);
    expect(plan).toEqual({ delete: ["hold"], strip: [] });
  });

  it("a stripped effect's rider effects go, unless a status that stays brings the same rider", () => {
    const effects = [
      { id: "curse", uuid: "Actor.a.ActiveEffect.curse", statuses: ["paralyzed", "frightened"], hasChanges: false },
      { id: "rider", statuses: ["incapacitated"], hasChanges: false, dependsOn: "Actor.a.ActiveEffect.curse" },
      { id: "unrelated", statuses: ["incapacitated"], hasChanges: false }
    ];
    expect(planConditionRemoval(effects, "paralyzed", riders)).toEqual({ delete: ["rider"], strip: [{ id: "curse", statuses: ["frightened"] }] });
    const both = [
      { id: "sleep", statuses: ["paralyzed", "unconscious"], hasChanges: false },
      { id: "rider", statuses: ["incapacitated"], hasChanges: false, dependsOn: "sleep" }
    ];
    expect(planConditionRemoval(both, "paralyzed", riders)).toEqual({ delete: [], strip: [{ id: "sleep", statuses: ["unconscious"] }] });
  });

  it("the conditions a creature has, of those asked about, in their order", () => {
    expect(conditionsPresent(["blinded", "deafened", "paralyzed", "poisoned"], [new Set(["poisoned", "prone"]), ["blinded"]])).toEqual(["blinded", "poisoned"]);
    expect(conditionsPresent(["blinded"], [new Set(["prone"])])).toEqual([]);
  });
});
