import { describe, expect, it } from "vitest";
import { actionKindOf, movementBudget } from "../src/module/services/economy/movementRules.js";

describe("movement budget", () => {
  it("allows a speed per dash, never below nothing remaining", () => {
    expect(movementBudget(10, 30, 0)).toEqual({ allowed: 30, remaining: 20 });
    expect(movementBudget(40, 30, 1)).toEqual({ allowed: 60, remaining: 20 });
    expect(movementBudget(70, 30, 1)).toEqual({ allowed: 60, remaining: 0 });
    expect(movementBudget(0, 0, 2)).toEqual({ allowed: 0, remaining: 0 });
  });
  it("recognises a Dash or Disengage by the activity's identifier or name, or its item's when it is the only one", () => {
    expect(actionKindOf({ name: "Dash" })).toBe("dash");
    expect(actionKindOf({ identifier: "disengage", name: "Use" })).toBe("disengage");
    const only = { system: { identifier: "dash", activities: { size: 1 } } } as any;
    expect(actionKindOf({ name: "Use", item: only })).toBe("dash");
    const several = { system: { identifier: "cunning-action", activities: { size: 3 } } } as any;
    expect(actionKindOf({ name: "Hide", item: several })).toBeUndefined();
    expect(actionKindOf({ name: "Disengage", item: several })).toBe("disengage");
    expect(actionKindOf(undefined)).toBeUndefined();
  });
});
