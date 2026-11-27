import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { changeValue, mergeOverlay } from "../src/module/lib/entries/overlayMerge.js";
import { behaviourItem, buildBehaviour } from "../src/module/lib/entries/behaviour.js";

const files = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : n.endsWith(".json") ? [p] : []; });
const overlays = files(join(__dirname, "..", "pack-src", "overlays"));

const base = {
  name: "Wall", type: "spell", flags: { "midi-qol": { entries: [{ id: "own", on: "use.end", do: [] }] } },
  system: { activities: {
    cast000000000000: { _id: "cast000000000000", type: "utility", name: "Create", range: { units: "ft", value: 120 }, regionBarrier: { enabled: false } },
    other00000000000: { _id: "other00000000000", type: "save", name: "" } } },
  effects: [{ _id: "eff0000000000000", name: "Burning", flags: {} }]
};
const overlay = {
  name: "Wall (overlay)", type: "spell",
  flags: { "midi-qol": { entries: [{ id: "given", on: "use.hit", if: "use.activity.id === 'cast000000000000'", do: [] }], overlay: { identifier: "wall", version: "2", changes: [
    { key: "system.activities.cast000000000000.regionBarrier.enabled", value: "true", type: "override" },
    { key: "system.activities.cast000000000000.range.units", value: "self", type: "override" },
    { key: "system.activities.cast000000000000.regionBarrier.sideDepth", value: "10", type: "override" },
    { key: "system.activities.gone000000000000.range.units", value: "self", type: "override" },
    { key: "name", value: "Wall of Fire", type: "override" }] } } },
  system: { activities: {
    stub000000000000: { _id: "stub000000000000", type: "utility", name: "Create", midiEntries: [{ id: "step", on: "use.targeted", do: [] }] },
    side000000000000: { _id: "side000000000000", type: "damage", name: "Side Damage", midiProperties: { automationOnly: true } } } },
  effects: [
    { _id: "ovEff00000000000", name: "Burning", flags: { "midi-qol": { overlayRole: true, entries: [{ id: "tick", on: "turnStart", do: [] }] } } },
    { _id: "ovNew00000000000", name: "Scorched", flags: {} }]
};

describe("an overlay merged with its base", () => {
  it("a change's text becomes the value its field takes", () => {
    expect([changeValue("true"), changeValue("false"), changeValue("10"), changeValue("self"), changeValue("[]"), changeValue("-1.5"), changeValue(3)]).toEqual([true, false, 10, "self", [], -1.5, 3]);
  });

  it("changed fields are set and marked with what they were; neither item is touched", () => {
    const before = JSON.stringify([base, overlay]);
    const { merged, marks } = mergeOverlay(base, overlay);
    const cast = (merged.system as any).activities.cast000000000000;
    expect([cast.regionBarrier, cast.range]).toEqual([{ enabled: true, sideDepth: 10 }, { units: "self", value: 120 }]);
    expect(merged.name).toBe("Wall of Fire");
    expect(marks.changes.map(c => [c.home, c.path, c.base, c.value])).toEqual([
      ["cast000000000000", "regionBarrier.enabled", false, true], ["cast000000000000", "range.units", "ft", "self"],
      ["cast000000000000", "regionBarrier.sideDepth", undefined, 10], ["item", "name", "Wall", "Wall of Fire"]]);
    expect(JSON.stringify([base, overlay])).toBe(before);
    expect((merged.flags as any)["midi-qol"].overlay).toBeUndefined();
  });

  it("entries go to the item, the base's activity of the same type and name, the base's effect of the same name; the rest is added", () => {
    const { merged, marks } = mergeOverlay(base, overlay);
    const m = merged as any;
    expect(m.flags["midi-qol"].entries.map((e: any) => e.id)).toEqual(["own", "given"]);
    expect(m.system.activities.cast000000000000.midiEntries.map((e: any) => e.id)).toEqual(["step"]);
    expect(Object.keys(m.system.activities)).toEqual(["cast000000000000", "other00000000000", "side000000000000"]);
    expect(m.effects.map((e: any) => e.name)).toEqual(["Burning", "Scorched"]);
    expect(m.effects[0].flags["midi-qol"].entries.map((e: any) => e.id)).toEqual(["tick"]);
    expect(marks).toMatchObject({ activities: ["side000000000000"], effects: ["ovNew00000000000"],
      entries: ["item::given", "activity:cast000000000000:step", "effect:eff0000000000000:tick"] });
  });

  it("the merged item is what the behaviour model reads: the overlay's entry for a base activity is that activity's step", () => {
    const model = buildBehaviour(behaviourItem(mergeOverlay(base, overlay).merged));
    const create = model.uses.find(u => u.activityId === "cast000000000000")!;
    expect(create.steps.map(r => r.entry.id)).toEqual(["step", "given"]);
    expect(model.unreached.map(u => u.activityId)).toEqual(["side000000000000"]);
  });

  it("every overlay in the pack merges with an empty base without losing what it carries", () => {
    for (const file of overlays) {
      const source = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      const { merged, marks } = mergeOverlay({ name: "base", type: source.type, system: { activities: {} }, effects: [] }, source);
      const carried = Object.keys((source.system as any)?.activities ?? {}).length;
      expect(Object.keys((merged.system as any).activities).length, file).toBe(carried);
      expect(marks.activities.length, file).toBe(carried);
    }
  });
});
