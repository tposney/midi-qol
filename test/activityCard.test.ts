import { describe, expect, it } from "vitest";
import { activityEffects, editedTargeting, mainBranch, newEffectData, targetingUpdate, targetPreset } from "../src/module/lib/entries/activityCard.js";
import { activityCard, activityUpdate, branchFor, convertActivity, isBranchEntry, partFormula, partWithFormula, type ActivityData, type CardText } from "../src/module/lib/entries/activityCard.js";

const t: CardText = {
  ability: id => id.toUpperCase(),
  damageType: id => id,
  effectName: id => `effect ${id}`,
  documentName: uuid => uuid === "spell.uuid" ? "Detect Magic" : undefined,
  activityName: id => id === "a1" ? "Wild Shape" : undefined,
  typeLabel: (_kind, id) => id,
  say: (key, data) => `${key}${data ? JSON.stringify(data) : ""}`
};

const holdPerson: ActivityData = { type: "save", save: { ability: ["wis"], dc: { calculation: "spellcasting", formula: "" } }, damage: { onSave: "half", parts: [] }, effects: [{ _id: "paralyzed", onSave: false }] };

describe("activity cards", () => {
  it("a save: the save and DC, Paralyzed on a failure, nothing on a success", () => {
    const card = activityCard(holdPerson, t);
    expect(card.when.map(p => p.text)).toEqual(['Activity.Save{"ability":"WIS"}', "Activity.DC.spellcasting"]);
    expect(card.branches.map(b => [b.branch, b.builtIn.map(p => p.text)])).toEqual([["saveFailed", ["effect paralyzed"]], ["saveSucceeded", []]]);
  });

  it("a save with damage: half on a success; an effect applied on a save shows in both branches", () => {
    const card = activityCard({ ...holdPerson, damage: { onSave: "half", parts: [{ number: 3, denomination: 6, types: ["fire"] }] }, effects: [{ _id: "e", onSave: true }] }, t);
    expect(card.branches[0].builtIn.map(p => p.kind)).toEqual(["damage", "effect"]);
    expect(card.branches[1].builtIn.map(p => p.kind)).toEqual(["half", "effect"]);
  });

  it("an attack: hit and miss branches; the weapon's damage noted", () => {
    const card = activityCard({ type: "attack", attack: { type: { value: "melee" } }, damage: { includeBase: true, parts: [] }, effects: [] }, t);
    expect(card.branches.map(b => b.branch)).toEqual(["hit", "missed"]);
    expect(card.branches[0].builtIn.map(p => p.text)).toEqual(["Activity.BaseDamage"]);
  });

  it("any other type: its type's wording and one branch for each target", () => {
    const card = activityCard({ type: "utility" }, t);
    expect(card.when[0].text).toBe("Activity.Type.utility");
    expect(card.branches.map(b => b.branch)).toEqual(["each"]);
  });

  it("other types say what they do: summon, cast, enchant, forward, check", () => {
    expect(activityCard({ type: "summon", profiles: [{ name: "", uuid: "x", types: ["beast"], count: "2" }] }, t).when[0].text).toBe('Activity.Summons{"what":"beast ×2"}');
    expect(activityCard({ type: "cast", spell: { uuid: "spell.uuid", level: 1 } }, t).when[0].text).toBe('Activity.CastsAt{"spell":"Detect Magic","level":"1"}');
    expect(activityCard({ type: "enchant", restrictions: { type: "weapon" }, effects: [{ _id: "oil" }] }, t).branches[0].builtIn.map(p => p.text)).toEqual(["effect oil"]);
    expect(activityCard({ type: "forward", activity: { id: "a1" } }, t).when[0].text).toBe('Activity.Forwards{"activity":"Wild Shape"}');
    expect(activityCard({ type: "check", check: { ability: "int", dc: { calculation: "", formula: "12" } } }, t).when.map(p => p.text)).toEqual(['Activity.Check{"ability":"INT"}', 'Activity.DC.custom{"dc":"12"}']);
  });

  it("formulas: dice kept as dice, anything else custom", () => {
    expect(partFormula({ number: 2, denomination: 6, bonus: "3" })).toBe("2d6 + 3");
    expect(partWithFormula({ types: ["fire"] }, "2d8 + 1")).toMatchObject({ number: 2, denomination: 8, bonus: "1", custom: { enabled: false } });
    expect(partWithFormula({ types: ["fire"] }, "@prof d6")).toMatchObject({ custom: { enabled: true, formula: "@prof d6" } });
  });

  it("the update holds only what changed", () => {
    expect(activityUpdate(holdPerson, { saveAbility: ["wis"], dcCalculation: "spellcasting", onSave: "half" })).toEqual({});
    expect(activityUpdate(holdPerson, { saveAbility: ["con"], effectsOnSave: { paralyzed: true } })).toEqual({ "save.ability": ["con"], effects: [{ _id: "paralyzed", onSave: true }] });
  });

  it("a branch entry is the editor's own (id and event), with nothing a branch can't show", () => {
    expect(isBranchEntry({ id: "activity-saveFailed", on: "use.target.saveFailed", do: [] })).toBe("saveFailed");
    expect(isBranchEntry({ id: "activity-saveFailed", on: "use.end", do: [] })).toBeUndefined();
    expect(isBranchEntry({ id: "activity-hit", on: "use.target.hit", offer: "ask", do: [] })).toBeUndefined();
  });

  it("a save becomes an attack: shared data kept, the save's dropped, a failed save's actions are a hit's", () => {
    const save = { _id: "a1", type: "save", name: "Burn", range: { value: "60" }, effects: [{ _id: "e" }],
      save: { ability: ["dex"], dc: { calculation: "spellcasting" } }, damage: { onSave: "half", parts: [{ number: 3, denomination: 6, types: ["fire"] }] },
      midiProperties: { automationOnly: true },
      midiEntries: [{ id: "activity-saveFailed", on: "use.target.saveFailed", do: [{ damage: "1" }] }, { id: "other", on: "use.end", do: [] }] };
    const attack = convertActivity(save, "attack", { spell: true }) as any;
    expect(attack._id).toBe("a1");
    expect(attack.type).toBe("attack");
    expect(attack.save).toBeUndefined();
    expect(attack.attack.type).toEqual({ value: "melee", classification: "spell" });
    expect(attack.damage.parts).toEqual(save.damage.parts);
    expect(attack.range).toEqual(save.range);
    expect(attack.effects).toEqual(save.effects);
    expect(attack.midiProperties).toEqual(save.midiProperties);
    expect(attack.midiEntries.map((e: any) => [e.id, e.on])).toEqual([["activity-hit", "use.target.hit"], ["other", "use.end"]]);
  });

  it("other conversions: healing from damage, a save's defaults, a utility's roll; branches to the matching one", () => {
    const damage = { type: "damage", damage: { parts: [{ number: 1, denomination: 8, types: ["healing"] }] } };
    expect((convertActivity(damage, "heal", { spell: false }) as any).healing).toEqual(damage.damage.parts[0]);
    expect((convertActivity({ type: "utility" }, "save", { spell: false }) as any).save).toEqual({ ability: ["dex"], dc: { calculation: "", formula: "10" } });
    expect((convertActivity({ type: "save", save: {} }, "utility", { spell: false }) as any).roll).toBeDefined();
    expect(branchFor("saveSucceeded", "attack")).toBe("missed");
    expect(branchFor("each", "save")).toBe("saveFailed");
    expect(branchFor("hit", "damage")).toBe("each");
  });

  it("targeting presets: read exactly, custom otherwise", () => {
    expect(targetPreset({ affectsType: "creature", count: 1, rangeUnits: "ft", rangeValue: 60 })).toBe("one");
    expect(targetPreset({ affectsType: "creature", count: 3, rangeUnits: "ft", rangeValue: 30 })).toBe("several");
    expect(targetPreset({ affectsType: "creature", count: 1, rangeUnits: "touch" })).toBe("touch");
    expect(targetPreset({ affectsType: "self", rangeUnits: "self" })).toBe("self");
    expect(targetPreset({ affectsType: "creature", templateType: "sphere", size: 20, rangeUnits: "ft", rangeValue: 150 })).toBe("point");
    expect(targetPreset({ templateType: "cone", size: 15, rangeUnits: "self" })).toBe("fromYou");
    expect(targetPreset({ templateType: "radius", size: 15, rangeUnits: "self" })).toBe("emanation");
    expect(targetPreset({ templateType: "wall", rangeUnits: "ft", rangeValue: 120 })).toBe("custom");
  });

  it("a preset chosen: its defaults, what fits kept; written to the spell's own fields or the activity's", () => {
    const point = editedTargeting({ affectsType: "creature", count: 1, rangeUnits: "ft", rangeValue: 90 }, { preset: "point" });
    expect(point).toMatchObject({ templateType: "sphere", size: 20, rangeUnits: "ft", rangeValue: 90 });
    const line = editedTargeting({}, { preset: "fromYou", shape: "line", size: 100 });
    expect(line).toMatchObject({ templateType: "line", size: 100, width: 5, rangeUnits: "self" });
    expect(targetingUpdate(point, true)).toMatchObject({ "system.target.template.type": "sphere", "system.range.value": "90" });
    expect(targetingUpdate(point, false)).toMatchObject({ "target.override": true, "target.template.type": "sphere", "range.units": "ft" });
  });

  it("effects on outcomes: main-branch additions join the activity's list, removals leave it; a new effect's data", () => {
    const data = { type: "save", effects: [{ _id: "para", onSave: false }, { _id: "old", onSave: true }] } as any;
    const list = activityEffects(data, { removeEffects: ["old"], newEffects: [
      { _id: "prone", name: "Prone", statuses: ["prone"], branch: "saveFailed" },
      { _id: "slow", name: "Slow", branch: "saveSucceeded" }] });
    expect(list).toEqual([{ _id: "para", onSave: false }, { _id: "prone", onSave: false }]);
    expect(mainBranch("attack")).toBe("hit");
    const effect = newEffectData({ _id: "prone", name: "Prone", statuses: ["prone"], duration: { value: 1, units: "minutes" }, repeatSave: true, branch: "saveFailed" }) as any;
    expect(effect).toMatchObject({ _id: "prone", transfer: false, statuses: ["prone"], duration: { value: 1, units: "minutes" } });
    expect(effect.flags["midi-qol"].entries[0]).toMatchObject({ on: "turnEnd", do: [{ save: "applying", then: [{ end: true }] }] });
  });
});
