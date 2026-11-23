import { describe, expect, it } from "vitest";
import { limitStamp, pruneLimits, selectGroups, spendStoredLimit, withinLimit, type StoredLimit, currentKept, keepRecord, keepStamp } from "../src/module/lib/entries/limits.js";

const combat = { id: "c1", round: 2, turn: 1 };

describe("entry limits", () => {
  it("stamps a turn and a round with the combat; none outside combat", () => {
    expect(limitStamp("turn", combat)).toBe("c1:2:1");
    expect(limitStamp("round", combat)).toBe("c1:2");
    expect(limitStamp("turn", undefined)).toBeUndefined();
    expect(limitStamp("use", undefined)).toBe("use");
  });

  it("allows up to max under the current stamp; a stale stamp counts as none", () => {
    expect(withinLimit({ per: "turn" }, undefined, "c1:2:1")).toBe(true);
    expect(withinLimit({ per: "turn" }, { stamp: "c1:2:1", count: 1 }, "c1:2:1")).toBe(false);
    expect(withinLimit({ per: "turn", max: 2 }, { stamp: "c1:2:1", count: 1 }, "c1:2:1")).toBe(true);
    expect(withinLimit({ per: "turn" }, { stamp: "c1:2:0", count: 1 }, "c1:2:1")).toBe(true);
    expect(withinLimit({ per: "turn" }, { stamp: "c1:2:1", count: 5 }, undefined)).toBe(true);
  });

  it("spending keeps only this turn's and this round's records", () => {
    const stored: StoredLimit[] = [
      { key: "a", stamp: "c1:1:0", count: 1 },
      { key: "b", stamp: "c1:2", count: 1 },
      { key: "c", stamp: "c1:2:1", count: 1 }
    ];
    expect(pruneLimits(stored, combat).map(r => r.key)).toEqual(["b", "c"]);
    const after = spendStoredLimit(stored, "c", "c1:2:1", combat);
    expect(after.find(r => r.key === "c")).toEqual({ key: "c", stamp: "c1:2:1", count: 2 });
    expect(after.map(r => r.key).sort()).toEqual(["b", "c"]);
    expect(spendStoredLimit(stored, "a", "c1:2:1", combat).find(r => r.key === "a")?.count).toBe(1);
  });

  it("one entry of a group unless it stacks; ungrouped all run", () => {
    const list = [
      { id: 1, entry: { group: "metamagic" } },
      { id: 2, entry: { group: "metamagic" } },
      { id: 3, entry: { group: "metamagic", stacks: true } },
      { id: 4, entry: {} }
    ];
    expect(selectGroups(list).map(x => x.id)).toEqual([1, 3, 4]);
  });

  it("a kept choice: stamped like a limit (world time outside combat), found for its item while current, stale records dropped", () => {
    const combat = { id: "c1", round: 2, turn: 1 };
    expect(keepStamp("turn", combat, 100)).toBe("c1:2:1");
    expect(keepStamp("round", combat, 100)).toBe("c1:2");
    expect(keepStamp("turn", undefined, 100)).toBe("time:100");
    const records = keepRecord([{ key: "old", stamp: "c1:1:0", item: "i", value: 1 }], { key: "careful", stamp: "c1:2:1", item: "spell", value: ["orc"] }, ["c1:2:1", "c1:2"]);
    expect(records).toEqual([{ key: "careful", stamp: "c1:2:1", item: "spell", value: ["orc"] }]);
    expect(currentKept(records, "careful", "spell", "c1:2:1")).toEqual({ value: ["orc"] });
    expect(currentKept(records, "careful", "other", "c1:2:1")).toBeUndefined();
    expect(currentKept(records, "careful", "spell", "c1:2:2")).toBeUndefined();
  });
});
