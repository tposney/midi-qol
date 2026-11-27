import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { behaviourItem, buildBehaviour, classify, entryActivityRefs, namedActivity, optionalBonuses, type BehaviourModel, type UseNode } from "../src/module/lib/entries/behaviour.js";
import type { Entry } from "../src/module/lib/entries/types.js";

const ROOT = join(__dirname, "..", "pack-src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : name.endsWith(".json") ? [path] : []; });
}
const all = files(ROOT);
const stored = (ending: string) => JSON.parse(readFileSync(all.find(f => f.endsWith(ending))!, "utf8")) as Record<string, unknown>;
const model = (ending: string) => { const source = stored(ending); return { item: behaviourItem(source), model: buildBehaviour(behaviourItem(source)) }; };
const entry = (e: Partial<Entry>): Entry => ({ id: "e", on: "use.hit", do: [], ...e });

describe("the behaviour model", () => {
  it("classifies an entry by how it starts", () => {
    expect(classify(entry({ on: "use.saves" }), "activity")).toEqual({ kind: "step", step: "use.saves" });
    expect(classify(entry({ on: "turnStart" }), "effect")).toEqual({ kind: "trigger" });
    expect(classify(entry({ on: "action" }), "effect")).toEqual({ kind: "button" });
    expect(classify(entry({ on: "cover" }), "effect")).toEqual({ kind: "statement" });
    expect(classify(entry({ on: "roll.preResult", who: "owner", offer: "ask" }), "item")).toEqual({ kind: "bonus" });
    expect(classify(entry({ on: "hit", who: "owner", offer: "reaction" }), "item")).toEqual({ kind: "reaction" });
    expect(classify(entry({ on: "use.configure", who: "owner", offer: "casting" }), "item")).toEqual({ kind: "option", step: "use.configure" });
    expect(classify(entry({ on: "use.hit", who: "owner", offer: "ask" }), "item")).toEqual({ kind: "trigger", step: "use.hit" });
    expect(classify(entry({ on: "use.hit" }), "item")).toEqual({ kind: "step", step: "use.hit" });
  });

  it("reads the activities an entry uses, and an activity a condition names", () => {
    expect(entryActivityRefs(entry({ activity: "cost000000000000", do: [{ damage: "activity" }, { save: "activity:save000000000000", then: [{ use: "follow" }] }] })))
      .toEqual(["save000000000000", "follow", "cost000000000000"]);
    expect(namedActivity("use.activity.id === 'ABPaLpY5mrKpB4ou'")).toEqual({ activity: "ABPaLpY5mrKpB4ou" });
    expect(namedActivity("use.activity?.id === \"x\" && target.sizeRank <= actor.sizeRank")).toEqual({ activity: "x", rest: "target.sizeRank <= actor.sizeRank" });
    expect(namedActivity("tags.use.casts")).toBeUndefined();
  });

  it("Ensnaring Strike: one use with its step; the effect's rows; the turn damage not a use of its own", () => {
    const { model: m } = model("Entry Automations/Ensnaring_Strike_mqeEnsnaringStri.json");
    expect(m.uses.map(u => u.activityId)).toEqual(["dnd5eactivity000"]);
    expect(m.uses[0].steps.map(r => [r.kind, r.step, r.entry.id])).toEqual([["step", "use.saves", "large"]]);
    const ensnared = m.effects.find(e => e.rows.length)!;
    expect(ensnared.rows.map(r => [r.kind, r.entry.id, r.watch])).toEqual([["trigger", "vines", "bearer"], ["button", "free", "bearer"]]);
    expect(ensnared.appliedBy).toEqual(["dnd5eactivity000"]);
    // Its automation-only damage activity: this sample's effect deals the damage by an entry, so nothing launches it
    expect(m.unreached.map(u => u.activityId)).toEqual(["ZWId9mbOE9zFnP6f"]);
  });

  it("Spirit Guardians: the save its area's rules use is nested in the cast, with when; not a use of its own", () => {
    const file = all.find(f => readFileSync(f, "utf8").includes('"spirit-guardians-save"'))!;
    const source = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const m = buildBehaviour(behaviourItem(source));
    const cast = m.uses.find(u => u.launches.some(l => l.via === "area"))!;
    expect(cast).toBeDefined();
    const area = cast.launches.filter(l => l.via === "area");
    expect(area.map(l => l.when)).toEqual(["entry", "turnEnd"]);
    expect(area.every(l => !l.missing)).toBe(true);
    // Nested once, where it is first used; the second rule refers to it
    expect(area.map(l => [!!l.use, !!l.repeat])).toEqual([[true, false], [false, true]]);
    expect(m.uses.some(u => u.activityId === area[0].activityId)).toBe(false);
    expect(m.unreached).toEqual([]);
  });

  it("an item's entries naming an activity are steps of that activity's use (Shield of the Cavalier)", () => {
    const source = stored("Shield_of_the_Cavalier_overlay_" + all.find(f => f.includes("Shield_of_the_Cavalier_overlay_"))!.split("Shield_of_the_Cavalier_overlay_")[1]);
    const overlay = behaviourItem(source);
    // The overlay's entries are for the base item's activities: give the model those activities
    const ids = [...new Set((overlay.entries ?? []).flatMap(e => namedActivity(e.if)?.activity ?? []))];
    expect(ids.length).toBeGreaterThan(0);
    const m = buildBehaviour({ ...overlay, activities: ids.map(id => ({ id, type: "utility" })) });
    for (const use of m.uses) for (const row of use.steps) expect(namedActivity(row.entry.if)?.activity).toBe(use.activityId);
    expect(m.uses.flatMap(u => u.steps).length).toBe((overlay.entries ?? []).filter(e => namedActivity(e.if)).length);
    expect(m.anyUse.length + m.triggers.length + m.bonuses.length + m.always.length + m.reactions.filter(r => r.row).length)
      .toBe((overlay.entries ?? []).filter(e => !namedActivity(e.if)).length);
  });

  it("Metamagic is an option under triggers; a reaction activity is a reaction", () => {
    const quickened = model("Quickened_Spell_overlay_" + all.find(f => f.includes("Quickened_Spell_overlay_"))!.split("Quickened_Spell_overlay_")[1]).model;
    expect(quickened.triggers.map(r => r.kind)).toEqual(["option"]);
    const m = buildBehaviour({ name: "x", effects: [], activities: [{ id: "react00000000000", type: "utility", activation: "reaction", condition: "reaction === 'isHit'" }, { id: "use0000000000000", type: "attack", activation: "action" }] });
    expect(m.reactions.map(r => r.use?.activityId)).toEqual(["react00000000000"]);
    expect(m.uses.map(u => u.activityId)).toEqual(["use0000000000000"]);
  });

  it("follow-ons: nested when only automation uses them, a link when a player can choose them, never twice; steps in order; instead", () => {
    const m = buildBehaviour({
      name: "x", effects: [{ id: "eff0000000000000", name: "Burning", overTime: ["burn"] }],
      activities: [
        { id: "main000000000000", type: "attack", then: "follow", other: "extra00000000000", applies: ["eff0000000000000"],
          entries: [entry({ id: "late", on: "use.end" }), entry({ id: "early", on: "use.configure" }), entry({ id: "swap", on: "use.target.hit", do: [{ damageChange: { multiplier: 0.5 } }] })] },
        { id: "follow0000000000", identifier: "follow", type: "save", automationOnly: true, then: "main000000000000", entries: [entry({ id: "loop", on: "use.end", do: [{ use: "activity:follow0000000000" }] })] },
        { id: "extra00000000000", type: "damage" },
        { id: "burn000000000000", identifier: "burn", type: "damage", automationOnly: true },
        { id: "lost000000000000", type: "damage", automationOnly: true }
      ],
      entries: [entry({ id: "gone", on: "use.hit", do: [{ use: "nothing-here" }] })]
    });
    const main = m.uses.find(u => u.activityId === "main000000000000")!;
    expect(main.steps.map(r => r.entry.id)).toEqual(["early", "swap", "late"]);
    expect(main.steps.map(r => r.replaces)).toEqual([false, true, false]);
    const [other, then] = main.launches;
    expect([other.via, other.activityId, !!other.use]).toEqual(["other", "extra00000000000", false]);
    expect([then.via, then.activityId, !!then.use]).toEqual(["then", "follow0000000000", true]);
    // The follow-on's own Then comes back to a chosen activity: a link; its entry uses itself: a repeat, not nested again
    expect(then.use!.launches.map(l => [l.activityId, !!l.use])).toEqual([["main000000000000", false]]);
    expect(then.use!.steps[0].launches).toEqual([{ via: "entry", activityId: "follow0000000000", repeat: true }]);
    expect(m.effects[0].appliedBy).toEqual(["main000000000000"]);
    expect(m.effects[0].launches.map(l => [l.via, l.activityId, !!l.use])).toEqual([["overTime", "burn000000000000", true]]);
    expect(m.unreached.map(u => u.activityId)).toEqual(["lost000000000000"]);
    expect(m.anyUse[0].launches).toEqual([{ via: "entry", activityId: "nothing-here", missing: true }]);
    // "this" in an entry's use is the entry's own activity: a chosen one, so a link
    const self = buildBehaviour({ name: "x", effects: [], activities: [{ id: "orb0000000000000", type: "attack", entries: [entry({ id: "leap", on: "use.completed", do: [{ use: "this" }] })] }] });
    expect(self.uses[0].steps[0].launches).toEqual([{ via: "entry", activityId: "orb0000000000000" }]);
  });

  it("a step on every use of an item with one chosen activity is that use's step", () => {
    const one = buildBehaviour({ name: "x", effects: [], entries: [entry({ id: "any", on: "use.target.saveFailed" })],
      activities: [{ id: "react00000000000", type: "save", activation: "reaction" }, { id: "auto000000000000", type: "damage", automationOnly: true }] });
    expect(one.anyUse).toEqual([]);
    expect(one.reactions[0].use!.steps.map(r => r.entry.id)).toEqual(["any"]);
    const two = buildBehaviour({ name: "x", effects: [], entries: [entry({ id: "any", on: "use.end" })], activities: [{ id: "a000000000000000", type: "save" }, { id: "b000000000000000", type: "attack" }] });
    expect(two.anyUse.map(r => r.entry.id)).toEqual(["any"]);
  });

  it("more ways an activity is used: an enchantment's rider, the other activity midi pairs by itself, a macro naming it", () => {
    const m = buildBehaviour({
      name: "x", effects: [], macro: "const a = item.system.activities.find(a => a.identifier === 'burst');",
      activities: [
        { id: "enchant000000000", type: "enchant", riders: ["rider00000000000"] },
        { id: "rider00000000000", type: "damage", automationOnly: true },
        { id: "attack0000000000", type: "attack", otherUnset: true },
        { id: "extra00000000000", type: "damage", automationOnly: true },
        { id: "burst00000000000", type: "save", identifier: "burst", explicitIdentifier: "burst", automationOnly: true },
        { id: "bonus00000000000", type: "damage", activation: "bonus" }
      ]
    });
    expect(m.uses.find(u => u.activityId === "enchant000000000")!.launches.map(l => [l.via, l.activityId, !!l.use])).toEqual([["rider", "rider00000000000", true]]);
    // Three automation-only candidates would be ambiguous; the rider and the macro's are still compatible, so nothing is paired
    expect(m.uses.find(u => u.activityId === "attack0000000000")!.launches).toEqual([]);
    expect(m.macro.map(l => [l.via, l.activityId, !!l.use])).toEqual([["macro", "burst00000000000", true]]);
    expect(m.hasMacro).toBe(true);
    expect(m.unreached.map(u => u.activityId)).toEqual(["extra00000000000"]);
    const paired = buildBehaviour({ name: "x", effects: [], activities: [
      { id: "attack0000000000", type: "attack", otherUnset: true }, { id: "extra00000000000", type: "damage", automationOnly: true }, { id: "check00000000000", type: "check" }] });
    expect(paired.uses[0].launches).toEqual([expect.objectContaining({ via: "other", activityId: "extra00000000000", auto: true })]);
    expect(paired.unreached).toEqual([]);
  });

  it("an effect's optional bonus flags read as one bonus per name", () => {
    const flag = (rest: string, value: string) => ({ key: `flags.midi-qol.optional.${rest}`, value });
    expect(optionalBonuses([flag("Lucky.label", "Lucky"), flag("Lucky.count", "ItemUses.Lucky"), flag("Lucky.attack.all", "reroll-kh"), flag("Lucky.save.all", "reroll-kh"),
      flag("mage.save.fail.all", "+1d6"), flag("mage.activation", "isMagicSave"), flag("parry.acOnHit", "+2"), { key: "system.attributes.ac.bonus", value: "1" }])).toEqual([
      { name: "Lucky", label: "Lucky", count: "ItemUses.Lucky", rolls: [{ selector: "attack.all", roll: "attack", which: "all", value: "reroll-kh" }, { selector: "save.all", roll: "save", which: "all", value: "reroll-kh" }] },
      { name: "mage", condition: "isMagicSave", rolls: [{ selector: "save.fail.all", roll: "save", outcome: "fail", which: "all", value: "+1d6" }] },
      { name: "parry", rolls: [{ selector: "acOnHit", roll: "acOnHit", value: "+2" }] }
    ]);
    const parry = behaviourItem(JSON.parse(readFileSync(all.find(f => readFileSync(f, "utf8").includes("flags.midi-qol.optional.parry.acOnHit"))!, "utf8")) as Record<string, unknown>);
    const bonus = parry.effects.flatMap(e => e.optionalBonuses ?? []).find(b => b.name === "parry")!;
    expect(bonus.rolls.map(r => r.roll)).toEqual(["acOnHit"]);
    expect(bonus.condition).toBeTypeOf("string");
  });

  it("every item in the packs builds, and each entry is placed exactly once", () => {
    const rows = (m: BehaviourModel) => {
      const seen: string[] = [];
      const use = (node: UseNode) => { for (const row of node.steps) add(row); for (const l of node.launches) if (l.use) use(l.use); };
      const add = (row: { source: { home: string, homeId?: string, entryId: string }, launches: { use?: UseNode }[] }) => {
        seen.push(`${row.source.home}:${row.source.homeId ?? ""}:${row.source.entryId}`);
        for (const l of row.launches) if (l.use) use(l.use);
      };
      for (const u of [...m.uses, ...m.unreached]) use(u);
      for (const r of m.reactions) { if (r.use) use(r.use); if (r.row) add(r.row); }
      for (const r of [...m.triggers, ...m.bonuses, ...m.always, ...m.anyUse]) add(r);
      for (const e of m.effects) { for (const r of e.rows) add(r); for (const l of e.launches) if (l.use) use(l.use); }
      return seen;
    };
    let items = 0;
    for (const file of all) {
      const source = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      if (!source.system || typeof source.name !== "string") continue;
      const item = behaviourItem(source);
      const expected = [...(item.entries ?? []).map(e => `item::${e.id}`),
        ...item.activities.flatMap(a => (a.entries ?? []).map(e => `activity:${a.id}:${e.id}`)),
        ...item.effects.flatMap(f => (f.entries ?? []).map(e => `effect:${f.id}:${e.id}`))].sort();
      expect(rows(buildBehaviour(item)).sort(), file).toEqual(expected);
      items++;
    }
    expect(items).toBeGreaterThan(200);
  });
});
