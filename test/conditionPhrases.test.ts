import { describe, expect, it } from "vitest";
import { buildCondition, canonical, conditionProblem, conditionWords, fromRows, parseCondition, toRows, type ConditionPhraseDef, type ConditionWording } from "../src/module/lib/entries/conditionPhrases.js";

const defs: ConditionPhraseDef[] = [
  { id: "spell", label: "the use is a spell", negatedLabel: "the use is not a spell", pattern: "tags.use.kind === 'spell'" },
  { id: "casts", label: "the use is the casting of a spell", pattern: "tags.use.casts" },
  { id: "trigger", label: "the trigger is: {trigger}", pattern: "reaction === '{trigger}'", slots: [{ name: "trigger", type: "select", options: [{ value: "isCast", label: "a spell is cast" }] }] },
  { id: "self", label: "it happens to you", negatedLabel: "it happens to another creature", pattern: "subject.isSelf" },
  { id: "seen", label: "you can see that creature", pattern: "subject.canSee" },
  { id: "components", label: "the item has a {components} component", pattern: "[...(item.properties ?? [])].some(p => [{components}].includes(p))", slots: [{ name: "components", type: "multiselect" }] },
  { id: "types", label: "the use deals {types} damage", pattern: "[{types}].some(t => tags.use.damageTypes.has(t))", slots: [{ name: "types", type: "multiselect" }] },
  { id: "size", label: "the target is size {size} or larger", pattern: "tags.target.sizeRank >= {size}", slots: [{ name: "size", type: "number" }] },
  { id: "takes", label: "it would take {type} damage", pattern: "(event.damage.applied.{type} ?? 0) > 0", slots: [{ name: "type", type: "select" }] },
  { id: "kinds", label: "the roll is {kinds}", pattern: "[{kinds}].includes(event.kind)", also: ["event.kind === '{kinds}'"], slots: [{ name: "kinds", type: "multiselect" }] },
  { id: "type", label: "it is {type}", negatedLabel: "it isn't {type}", pattern: "target.raceOrType.includes('{type}')", slots: [{ name: "type", type: "select" }] }
];
const wording: ConditionWording = { and: "and", or: "or", not: w => `not (${w})`, value: (slot, v) => slot?.options?.find(o => o.value === v)?.label ?? String(v) };
const words = (e: string) => conditionWords(parseCondition(e, defs), defs, wording);
const round = (e: string) => buildCondition(parseCondition(e, defs), defs);

describe("condition phrases", () => {
  it("compares expressions whatever their spacing, quotes, equality and optional chaining", () => {
    expect(canonical("tags.use?.kind=='spell'")).toBe(canonical('tags.use.kind === "spell"'));
    expect(canonical("a?.[0]?.b")).toBe("a[0].b");
    expect(canonical("xs.some(t => t.ok)")).toBe(canonical("xs.some(c=>c.ok)"));
    expect(canonical("'a b' === x")).toBe('"a b"===x');
  });

  it("reads Counterspell's condition wholly in words", () => {
    const e = 'reaction === "isCast" && tags.use.casts && !subject.isSelf && subject.canSee && [...(item.properties ?? [])].some(p => ["vocal", "somatic", "material"].includes(p))';
    const node = parseCondition(e, defs);
    expect(node.kind).toBe("all");
    expect(node.kind === "all" && node.parts.every(p => p.kind === "phrase")).toBe(true);
    expect(words(e)).toEqual({ known: true, text: "the trigger is: a spell is cast and the use is the casting of a spell and it happens to another creature and you can see that creature and the item has a vocal, somatic or material component" });
  });

  it("reads other spellings, and writes its own", () => {
    expect(round("tags.use.kind == \"spell\"")).toBe("tags.use.kind === 'spell'");
    expect(round("!!tags.use.casts")).toBe("tags.use.casts");
    expect(round("['fire','cold'].some(x => tags.use.damageTypes.has(x))")).toBe("['fire', 'cold'].some(t => tags.use.damageTypes.has(t))");
    expect(round("event.kind === 'save'")).toBe("['save'].includes(event.kind)");
    expect(round("(event.damage?.applied?.necrotic ?? 0) > 0")).toBe("(event.damage.applied.necrotic ?? 0) > 0");
    expect(round("tags.target.sizeRank >= 3")).toBe("tags.target.sizeRank >= 3");
  });

  it("negation: !x, !(x), !== and a phrase's own negated words", () => {
    expect(words("!subject.isSelf").text).toBe("it happens to another creature");
    expect(words("tags.use.kind !== 'spell'").text).toBe("the use is not a spell");
    expect(round("tags.use.kind !== 'spell'")).toBe("tags.use.kind !== 'spell'");
    expect(words("!target.raceOrType.includes(\"undead\")").text).toBe("it isn't undead");
    expect(round("!target.raceOrType.includes(\"undead\")")).toBe("!target.raceOrType.includes('undead')");
    expect(words("!tags.use.casts").text).toBe("not (the use is the casting of a spell)");
    expect(round("!['save'].includes(event.kind)")).toBe("!(['save'].includes(event.kind))");
    expect(words("!!subject.isSelf").text).toBe("it happens to you");
  });

  it("keeps what no phrase fits as written, and says whether anything was worded", () => {
    expect(words("actor.attributes.hp.value > 0")).toEqual({ text: "actor.attributes.hp.value > 0", known: false });
    const mixed = "tags.use.casts && (config.escape === 'check' || w.d20AttackRoll === 20)";
    expect(words(mixed)).toEqual({ known: true, text: "the use is the casting of a spell and (config.escape === 'check' or w.d20AttackRoll === 20)" });
    expect(round(mixed)).toBe("tags.use.casts && (config.escape === 'check' || w.d20AttackRoll === 20)");
    expect(words("'a && b' === x").known).toBe(false);
  });

  it("rows: pieces under one joiner; a group inside is one piece of code, bracketed when written back", () => {
    const rows = toRows(parseCondition("tags.use.casts && (subject.isSelf || subject.canSee)", defs), defs);
    expect(rows.joiner).toBe("all");
    expect(rows.rows.map(r => r.kind)).toEqual(["phrase", "code"]);
    expect(fromRows(rows, defs)).toBe("tags.use.casts && (subject.isSelf || subject.canSee)");
    expect(toRows(parseCondition("", defs), defs).rows).toEqual([]);
    expect(fromRows({ joiner: "any", rows: [{ kind: "phrase", id: "casts", values: {}, negated: false }, { kind: "phrase", id: "size", values: { size: 4 }, negated: false }] }, defs))
      .toBe("tags.use.casts || tags.target.sizeRank >= 4");
    expect(fromRows({ joiner: "all", rows: [{ kind: "code", source: " " }, { kind: "phrase", id: "self", values: {}, negated: true }] }, defs)).toBe("!subject.isSelf");
  });

  it("names an expression JavaScript can't read", () => {
    expect(conditionProblem("tags.use.casts && (await x())")).toBeUndefined();
    expect(conditionProblem("")).toBeUndefined();
    expect(conditionProblem("tags.use.casts &&")).toBeTypeOf("string");
  });
});
