import { describe, expect, it } from "vitest";
import { areaGroups, areaRules, areaSaveActivity, basicsUpdate, NEW_KINDS, newActivityData, onUseString, parseOnUse } from "../src/module/lib/entries/activityCard.js";
import { triggerText, triggerUpdate, weaponUpdate } from "../src/module/lib/entries/activityCard.js";
import { MIDI_EFFECT_PRESETS, signed } from "../src/module/lib/entries/effectPresets.js";
import { activityEffects, editedTargeting, mainBranch, newEffectData, targetingText, targetingUpdate, targetPreset } from "../src/module/lib/entries/activityCard.js";
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

  it("area rules: grouped (an activity's triggers; an effect while inside) and written back unchanged", () => {
    const rules = [
      { trigger: "entry", action: "useActivity", targetId: "save" }, { trigger: "turnEnd", action: "useActivity", targetId: "save" },
      { trigger: "entry", action: "applyEffect", targetId: "slow" }, { trigger: "exit", action: "removeEffect", targetId: "slow" },
      { trigger: "turnStart", action: "applyEffect", targetId: "odd" }];
    const { groups, other } = areaGroups(rules);
    expect(groups).toEqual([{ kind: "use", targetId: "save", triggers: ["entry", "turnEnd"] }, { kind: "whileIn", targetId: "slow" }]);
    expect(other).toEqual([{ trigger: "turnStart", action: "applyEffect", targetId: "odd" }]);
    expect(areaRules(groups, other)).toEqual(rules);
    expect(areaSaveActivity("a1", "Area Save", true)).toMatchObject({ type: "save", midiProperties: { automationOnly: true, confirmTargets: "never" } });
  });

  it("basics: a spell's activation, duration and concentration on the spell; an activity's own with override; uses consumed", () => {
    const current = { activation: "action", activationValue: null, durationValue: "1", durationUnits: "minute", concentration: true, usesPeriod: "", usesMax: "", recharge: "" };
    const onSpell = basicsUpdate(current, { ...current, activation: "bonus", concentration: false }, { activationOnItem: true, durationOnItem: true, usesOnItem: false, itemProperties: ["vocal", "concentration"] });
    expect(onSpell.item).toEqual({ "system.activation.type": "bonus", "system.activation.value": null, "system.properties": ["vocal"] });
    expect(onSpell.activity).toEqual({});
    const own = basicsUpdate(current, { ...current, durationValue: "10", usesPeriod: "recharge", recharge: "5" }, { activationOnItem: false, durationOnItem: false, usesOnItem: false, consumption: [] });
    expect(own.activity).toMatchObject({ "duration.value": "10", "duration.override": true, "uses.max": "1", "uses.recovery": [{ period: "recharge", formula: "5" }] });
    expect((own.activity["consumption.targets"] as any[])[0].type).toBe("activityUses");
    expect(basicsUpdate(current, { ...current }, { activationOnItem: false, durationOnItem: false, usesOnItem: false })).toEqual({ activity: {}, item: {} });
    // A part's scaling
    const data = { type: "save", damage: { parts: [{ number: 3, denomination: 8, types: ["radiant"], scaling: { mode: "", number: null } }] } } as any;
    expect(activityUpdate(data, { parts: [{ formula: "3d8", types: ["radiant"], scaling: { mode: "whole", number: 1 } }] })["damage.parts"]).toEqual([{ number: 3, denomination: 8, types: ["radiant"], scaling: { mode: "whole", number: 1 } }]);
  });

  it("new activities: each kind reads as a sentence; an area runs a save made for it; an effect on yourself", () => {
    const t = { ability: (id: string) => id, damageType: (id: string) => id, effectName: (id: string) => id, documentName: () => undefined, activityName: (id: string) => id,
      typeLabel: (_k: string, id: string) => id, say: (key: string, data?: Record<string, string>) => `${key}${data ? JSON.stringify(data) : ""}` } as unknown as CardText;
    const ids = { activity: "a1", effect: "e1", save: "s1" };
    for (const kind of NEW_KINDS) {
      const made = newActivityData(kind, ids, { name: "Probe", spell: true });
      const card = activityCard(made.activities[0] as unknown as ActivityData, t);
      expect(card.branches.length, kind).toBeGreaterThan(0);
    }
    const area = newActivityData("area", ids, { name: "Probe", spell: true });
    expect((area.activities[0] as any).regionBehavior.rules).toEqual([{ trigger: "entry", action: "useActivity", targetId: "s1" }, { trigger: "turnEnd", action: "useActivity", targetId: "s1" }]);
    expect((area.activities[1] as any).midiProperties.automationOnly).toBe(true);
    expect(newActivityData("self", ids, { name: "Probe", spell: false }).effects[0]).toMatchObject({ _id: "e1", transfer: false });
  });

  it("on-use macros: midi's string read as rows and written back", () => {
    const rows = parseOnUse("[preItemRoll]My Macro, ItemMacro,[postDamageRoll]Compendium.x.y.Macro.z");
    expect(rows).toEqual([{ option: "preItemRoll", macroName: "My Macro" }, { option: "postActiveEffects", macroName: "ItemMacro" }, { option: "postDamageRoll", macroName: "Compendium.x.y.Macro.z" }]);
    expect(onUseString(rows)).toBe("[preItemRoll]My Macro,[postActiveEffects]ItemMacro,[postDamageRoll]Compendium.x.y.Macro.z");
    expect(onUseString([{ option: "preItemRoll", macroName: " " }])).toBe("");
  });

  it("common effects: each makes changes; bonuses signed; a new effect stores them as system.changes", () => {
    for (const preset of MIDI_EFFECT_PRESETS) expect(preset.changes(preset.param?.default ?? "").length, preset.id).toBeGreaterThan(0);
    const ac = MIDI_EFFECT_PRESETS.find(p => p.id === "acBonus")!;
    expect(ac.changes("2")).toEqual([{ key: "system.attributes.ac.bonus", type: "add", value: "+2" }]);
    expect(signed("-1d4")).toBe("-1d4");
    const effect = newEffectData({ _id: "e1", name: "AC bonus (2)", changes: ac.changes("2"), branch: "saveFailed" }) as any;
    expect(effect.system.changes).toEqual([{ phase: "initial", key: "system.attributes.ac.bonus", type: "add", value: "+2" }]);
  });

  it("a registered targeting preset: recognised after midi's, worded by it, its defaults when picked, only its fields edited", () => {
    const wall = { id: "wall", label: "a wall", fields: ["size"] as const,
      matches: (t: any) => t.templateType === "wall", defaults: (c: any) => ({ ...c, templateType: "wall", size: 60, rangeUnits: "ft", rangeValue: 120 }),
      text: (t: any) => `a ${t.size} ft wall` };
    const extra = [wall];
    const current = { affectsType: "creature", templateType: "wall", size: 30, rangeUnits: "ft", rangeValue: 120 };
    expect(targetPreset(current, extra)).toBe("wall");
    expect(targetPreset(current)).toBe("custom");
    expect(targetPreset({ affectsType: "creature", count: 1, rangeUnits: "ft", rangeValue: 30 }, extra)).toBe("one");
    expect(targetingText(current, t, extra)).toBe("a 30 ft wall");
    expect(editedTargeting({ affectsType: "creature", count: 1, rangeUnits: "ft", rangeValue: 30 }, { preset: "wall" }, extra)).toMatchObject({ templateType: "wall", size: 60 });
    expect(editedTargeting(current, { size: 90, count: 5 }, extra)).toEqual({ ...current, size: 90 });
  });

  it("a creature you can see: worded for single targets, kept through a preset change, not for areas", () => {
    const one = { affectsType: "creature", count: 1, rangeUnits: "ft", rangeValue: 60, mustSee: true };
    expect(targetingText(one, t)).toContain("youCanSee");
    expect(editedTargeting(one, { preset: "several", count: 3 })).toMatchObject({ count: 3, mustSee: true });
    expect(editedTargeting({ ...one, mustSee: false }, { see: true })).toMatchObject({ mustSee: true });
    expect(targetingText({ ...one, templateType: "sphere", size: 20 }, t)).not.toContain("youCanSee");
  });

  it("a weapon's damage: worded with its two-handed damage; edits update the weapon and its versatile property", () => {
    const weapon = { base: { number: 1, denomination: 8, bonus: "", types: ["slashing"] }, versatileSource: { number: 1, denomination: 10, bonus: "", types: [] } };
    const data = { type: "attack", damage: { includeBase: true, parts: [] }, weapon: { ...weapon, versatile: weapon.versatileSource } } as any;
    const text = activityCard(data, t).branches[0].builtIn[0].text;
    expect(text).toContain("1d8");
    expect(text).toContain("1d10");
    expect(weaponUpdate(weapon, { versatile: true, versatileFormula: "1d12" }, ["fin"])).toEqual({
      "system.properties": ["fin", "ver"], "system.damage.versatile": { number: 1, denomination: 12, bonus: "", types: [], custom: { enabled: false, formula: "" } } });
    expect(weaponUpdate({ ...weapon, versatile: weapon.versatileSource }, { versatile: false }, ["ver"])).toEqual({ "system.properties": [] });
    expect(weaponUpdate(weapon, { formula: "2d6" }, [])).toEqual({ "system.damage.base": { number: 2, denomination: 6, bonus: "", types: ["slashing"], custom: { enabled: false, formula: "" } } });
  });

  it("the Then line: Trigger Activity in words; near with its count, who and distance; condition, roll-as, chain, free", () => {
    expect(triggerText({ triggeredActivityId: "none" }, t)).toBeUndefined();
    expect(triggerText({ triggeredActivityId: "a1", triggeredActivityTargets: "hitTargets" }, t))
      .toBe('Activity.Then.use{"activity":"Wild Shape","targets":"Activity.Then.to.hitTargets"}');
    expect(triggerText({ triggeredActivityId: "a1", triggeredActivityTargets: "near", triggeredActivityNearMax: "2", triggeredActivityNearDisposition: "enemy",
      triggeredActivityNearWithin: 30, triggeredActivityRollAs: "firstTarget", triggeredActivityConditionText: "workflow.isCritical", triggeredActivityChainLimit: "@item.level", triggeredActivityConsume: false }, t))
      .toBe('Activity.Then.use{"activity":"Wild Shape","targets":"Activity.Then.near{\\"max\\":\\"2\\",\\"who\\":\\"Activity.Then.who.enemy\\",\\"within\\":\\"30\\"}"}, Activity.Then.rollAs.firstTarget, Activity.Then.if{"condition":"workflow.isCritical"}, Activity.Then.chain{"n":"@item.level"}, Activity.Then.free');
  });

  it("the Then line's edits: only what changed, near fields only for near, none removes the trigger", () => {
    const props = { triggeredActivityId: "a1", triggeredActivityTargets: "targets", triggeredActivityRollAs: "self", triggeredActivityConsume: true };
    expect(triggerUpdate(props, { activity: "a1", to: "targets", rollAs: "self", consume: true, condition: "", chain: "" })).toEqual({});
    expect(triggerUpdate(props, { activity: "a2", to: "near", within: 5, max: "1", disposition: "enemy", consume: false })).toEqual({
      "midiProperties.triggeredActivityId": "a2", "midiProperties.triggeredActivityTargets": "near", "midiProperties.triggeredActivityConsume": false,
      "midiProperties.triggeredActivityNearWithin": 5, "midiProperties.triggeredActivityNearDisposition": "enemy" });
    expect(triggerUpdate(props, { activity: "a1", to: "hitTargets", within: 5 })).toEqual({ "midiProperties.triggeredActivityTargets": "hitTargets" });
    expect(triggerUpdate(props, { activity: "none" })).toEqual({ "midiProperties.triggeredActivityId": "none" });
    expect(triggerUpdate({}, { activity: "none" })).toEqual({});
  });
});
