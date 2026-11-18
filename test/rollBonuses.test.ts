import { describe, expect, it } from "vitest";
import { addCosts, canAfford, fitSelection, maxScaling, orderForApplication, shouldPrompt, type BonusCost, type BonusEffect } from "../src/module/rules/rollBonuses.js";
import { countCost, defaultPhase, flagPhase, flagValueFor, parseFlagValue } from "../src/module/rules/optionalFlags.js";

const uses = (cost: number, available: number): BonusCost => ({ itemUses: { "Item.lucky": { cost, available } } });

describe("costs", () => {
  it("canAfford and addCosts keep a running budget per resource", () => {
    expect(canAfford(uses(1, 1))).toBe(true);
    const spent = addCosts({}, uses(1, 1));
    expect(spent).toEqual(uses(1, 1));
    expect(canAfford(uses(1, 1), spent)).toBe(false);
    expect(canAfford({ actions: { reaction: { cost: 1, available: 1 } } }, spent)).toBe(true);
    expect(addCosts(spent, uses(1, 3)).itemUses?.["Item.lucky"]).toEqual({ cost: 2, available: 3 });
  });

  it("fitSelection refuses a second bonus on a spent pool, ignores third parties, counts earlier phases", () => {
    const a = { id: "a", cost: uses(1, 1) }, b = { id: "b", cost: uses(1, 1) }, c = { id: "c", cost: uses(1, 1), thirdParty: true };
    expect(fitSelection([a, b, c])).toEqual({ accepted: [a, c], refused: [{ id: "b", reason: "resources" }] });
    expect(fitSelection([a], uses(1, 1)).refused).toEqual([{ id: "a", reason: "resources" }]);
  });

  it("maxScaling: CAT's limit from base and step cost", () => {
    expect(maxScaling(1, 1, 3)).toBe(3);
    expect(maxScaling(1, 2, 4)).toBe(2);
    expect(maxScaling(2, 1, 1)).toBe(0);
    expect(maxScaling(1, 1, 10, 4)).toBe(4);
  });
});

describe("phases and order", () => {
  it("shouldPrompt", () => {
    expect(shouldPrompt("preResult", { hasOptional: false, dismissed: false })).toBe(false);
    expect(shouldPrompt("preResult", { hasOptional: true, dismissed: true })).toBe(false);
    expect(shouldPrompt("preResult", { hasOptional: true, dismissed: false, outcome: { isFumble: true } })).toBe(false);
    expect(shouldPrompt("preResult", { hasOptional: true, dismissed: false, outcome: { isFumble: true }, fumbleOffered: true })).toBe(true);
    expect(shouldPrompt("postResult", { hasOptional: true, dismissed: false, outcome: { success: true } })).toBe(false);
    expect(shouldPrompt("postResult", { hasOptional: true, dismissed: false, outcome: { success: false } })).toBe(true);
    expect(shouldPrompt("postResult", { hasOptional: true, dismissed: false, outcome: { success: true, noDC: true } })).toBe(true);
  });

  it("orderForApplication: replace, reroll, add, outcome, rider; priority within", () => {
    const b = (id: string, effect: BonusEffect, priority?: number) => ({ id, effect, priority });
    const ordered = orderForApplication([
      b("rider", { kind: "rider" }), b("add-low", { kind: "add", formula: "1" }, 1), b("crit", { kind: "critical" }),
      b("add-high", { kind: "add", formula: "2" }, 9), b("reroll", { kind: "reroll", keep: "new" }), b("replace", { kind: "replace", formula: "20" })
    ]);
    expect(ordered.map(o => o.id)).toEqual(["replace", "reroll", "add-high", "add-low", "crit", "rider"]);
  });
});

describe("midi's optional flags", () => {
  it("parseFlagValue reads every value form", () => {
    expect(parseFlagValue("1d4")).toEqual({ effect: { kind: "add", formula: "1d4" } });
    expect(parseFlagValue(2)).toEqual({ effect: { kind: "add", formula: "2" } });
    expect(parseFlagValue("reroll")).toEqual({ effect: { kind: "reroll", keep: "new" } });
    expect(parseFlagValue("reroll-kh")).toEqual({ effect: { kind: "reroll", keep: "higher" } });
    expect(parseFlagValue("reroll-kl")).toEqual({ effect: { kind: "reroll", keep: "lower" } });
    expect(parseFlagValue("reroll-query")).toEqual({ effect: { kind: "reroll", keep: "ask" } });
    expect(parseFlagValue("reroll-max")).toEqual({ effect: { kind: "reroll", keep: "new", dice: "max" } });
    expect(parseFlagValue("reroll-withBonus 2")).toEqual({ effect: { kind: "reroll", keep: "new", addFormula: "+2" } });
    expect(parseFlagValue("replace 1d20")).toEqual({ effect: { kind: "replace", formula: "1d20" } });
    expect(parseFlagValue("success")).toEqual({ effect: { kind: "outcome", success: true } });
    expect(parseFlagValue("fail")).toEqual({ effect: { kind: "outcome", success: false } });
    expect(parseFlagValue("critical")).toEqual({ effect: { kind: "critical" } });
    expect(parseFlagValue("ItemMacro.Lucky")).toEqual({ macro: "ItemMacro.Lucky" });
    expect(parseFlagValue("Macro.Foo")).toEqual({ macro: "Macro.Foo" });
    expect(parseFlagValue("")).toBeUndefined();
    expect(parseFlagValue(true)).toBeUndefined();
  });

  it("countCost maps count values to resources", () => {
    expect(countCost(undefined, "k")).toBeUndefined();
    expect(countCost("every", "k")).toBeUndefined();
    expect(countCost(3, "k")).toEqual({ type: "effectCount", key: "k" });
    expect(countCost("reaction", "k")).toEqual({ type: "actions", key: "reaction" });
    expect(countCost("bonusAction", "k")).toEqual({ type: "actions", key: "bonus" });
    expect(countCost("each-round", "k")).toEqual({ type: "oncePer", key: "k:each-round" });
    expect(countCost("ItemUses.Lucky", "k")).toEqual({ type: "itemUses", key: "Lucky" });
    expect(countCost("ActivityUses.Inspire", "k")).toEqual({ type: "activityUses", key: "Inspire" });
    expect(countCost("@resources.primary.value", "k")).toEqual({ type: "attribute", key: "resources.primary.value" });
  });

  it("flagValueFor matches as collectBonusFlags does", () => {
    const entry = { attack: { mwak: "1d4", all: "1" }, save: "1d6", check: { fail: { dex: "reroll", all: "1d4" } } };
    expect(flagValueFor(entry, "attack", "mwak")).toBe("1d4");
    expect(flagValueFor(entry, "attack", "rwak")).toBe("1");
    expect(flagValueFor(entry, "save", "dex")).toBe("1d6");
    expect(flagValueFor(entry, "check", "dex", true)).toBe("reroll");
    expect(flagValueFor(entry, "check", "all", true)).toBe("1d4");
    expect(flagValueFor(entry, "check", "str", true)).toBeUndefined();
    expect(flagValueFor(entry, "skill", "prc")).toBeUndefined();
  });

  it("phases: default by selector, overridden by optional.NAME.phase", () => {
    expect(defaultPhase("attack.all")).toBe("preResult");
    expect(defaultPhase("save.fail.dex")).toBe("postResult");
    expect(defaultPhase("damage.all")).toBe("postResult");
    expect(defaultPhase("acOnAttack")).toBe("preResult");
    expect(defaultPhase("acOnHit")).toBe("postResult");
    expect(flagPhase("preRoll")).toBe("preRoll");
    expect(flagPhase("sometime")).toBeUndefined();
  });
});
