import { describe, expect, it } from "vitest";
import { activityCard, activityUpdate, isBranchEntry, partFormula, partWithFormula, type ActivityData, type CardText } from "../src/module/lib/entries/activityCard.js";

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
});
