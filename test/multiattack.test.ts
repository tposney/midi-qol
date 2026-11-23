import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { parseMultiattack, resolvePlan, fitUses, nextUses, type ParsedPlan, type RawRef, type Count, type MultiattackPlan } from "../src/module/lib/multiattack.js";

// SRD 5.2 (CC-BY 4.0) Multiattack descriptions from dnd5e's packs
const srd: { actor: string, description: string }[] = JSON.parse(readFileSync(new URL("./fixtures/multiattack-srd52.json", import.meta.url), "utf8"));
// SRD 5.1 (CC-BY 4.0, the 2014 rules): the older prose
const srd51: { actor: string, description: string, items: string[] }[] = JSON.parse(readFileSync(new URL("./fixtures/multiattack-srd51.json", import.meta.url), "utf8"));
const srdText = (actor: string) => {
  const entry = srd.find(e => e.actor === actor);
  if (!entry) throw new Error(`no SRD creature ${actor}`);
  return entry.description;
};

/** A compact form of a plan: "2×[a|b] +use[c]? OR ... / REPLACE 1 of x with [y]" */
const ref = (r: RawRef): string => r.kind === "attack" ? (r.range ? `ANY-${r.range}` : "ANY")
  : r.kind === "cast" ? `cast(${ref(r.via)}>${ref(r.spell)}${r.level ? "@" + r.level : ""})`
    : r.kind === "spell" ? (r.name ?? r.uuid ?? "?") : (r.name ?? r.activity ?? r.id ?? "?");
const count = (n: Count) => typeof n === "object" ? ("formula" in n ? n.formula : n.text) : String(n);
function compact(plan: ParsedPlan | null): string {
  if (!plan) return "null";
  const options = plan.options.map(o => [
    ...o.groups.map(g => `${count(g.n)}×[${g.refs.map(ref).join("|")}]`),
    ...o.extra.map(e => `+use[${e.refs.map(ref).join("|")}]${e.ifAvailable ? "?" : ""}`)
  ].join(" ") + (o.condition ? ` {${o.condition}}` : "") + (o.limits ?? []).map(l => ` max ${l.max} of [${l.refs.map(ref).join("|")}]`).join("")).join(" OR ");
  const replace = plan.replace.map(r => ` / REPLACE ${r.n}${r.of ? ` of ${r.of.map(ref).join("|")}` : ""} with [${r.refs.map(ref).join("|")}]`).join("");
  return options + replace + (plan.notes?.length ? ` NOTES ${JSON.stringify(plan.notes)}` : "") + (plan.unread.length ? ` UNREAD ${JSON.stringify(plan.unread)}` : "");
}

describe("multiattack parser: the SRD 5.2 sentence families", () => {
  it.each([
    ["Adult White Dragon", "3×[Rend]"],
    ["Ape", "2×[mmFist0000000000]"],
    ["Balor", "1×[mmFlameWhip00000] 1×[mmLightningBlade]"],
    ["Assassin", "3×[jLa5l9pntsTVrMKH|dL4668G7zXeC5zyY]"],
    ["Barbed Devil", "1×[mmClaws000000000] 1×[mmTail0000000000] OR 2×[mmHurlFlame00000]"],
    ["Aboleth", "2×[mmTentacle000000] +use[7gP0oX3L1RKRaBGH|yiiKNaJ2svcUWqLi]?"],
    ["Chimera", "1×[mmRam00000000000] 1×[mmBite0000000000] 1×[mmClaw0000000000] / REPLACE 1 of Claw with [mmFireBreath0000]"],
    ["Adult Silver Dragon", "3×[Rend] / REPLACE 1 with [Paralyzing Breath|cast(Spellcasting>Ice Knife)]"],
    ["Ancient Bronze Dragon", "3×[Rend] / REPLACE 1 with [Repulsion Breath|cast(Spellcasting>Guiding Bolt@2)]"],
    ["Tarrasque", "1×[mmBite0000000000] 3×[mmClaw0000000000|mmTail0000000000]"],
    ["Roper", "2×[Tentacle] 2×[Bite] +use[Reel]"],
    ["Hydra", "it has heads×[mmBite0000000000]"],
    ["Giant Wasp", "floor(@flags.dnd5e.summon.level / 2)×[ANY]"],
    ["Draconic Spirit", "floor(@flags.dnd5e.summon.level / 2)×[Rend] +use[Breath Weapon]"],
    ["Clay Golem", "2×[Slam] OR 3×[Slam] {if it used Hasten this turn}"],
    ["Carrion Crawler", "1×[mmBite0000000000] +use[mmParalyzingTent]"],
    ["Glabrezu", "2×[mmPincer00000000] +use[mmPummel00000000|mmSpellcasting00]"]
  ])("%s", (actor, expected) => {
    expect(compact(parseMultiattack(srdText(actor)))).toBe(expected);
  });
});

describe("multiattack parser: forms", () => {
  it("activity links and a cast with an unlinked Spellcasting", () => {
    expect(compact(parseMultiattack("<p>It makes one [[/item .mmVineLash000000]] or [[/item .mmThornBurst0000]] attack, and it can use Spellcasting to cast [[/item .mmSpellcasting00.Activity.bAmZSyK4cn33HwwI]].</p>")))
      .toBe("1×[mmVineLash000000|mmThornBurst0000] +use[cast(Spellcasting>bAmZSyK4cn33HwwI)]");
  });
  it("uses a feature N times; or uses it twice", () => {
    expect(compact(parseMultiattack("The beholder uses [[/item .mmEyeRays0000000]] three times."))).toBe("3×[mmEyeRays0000000]");
    expect(compact(parseMultiattack("It makes three [[/item Radiant Sword]] attacks or uses [[/item Holy Burst]] twice.")))
      .toBe("3×[Radiant Sword] OR 2×[Holy Burst]");
  });
  it("a use before the attacks (\"can use its X and makes\", \"uses X and makes\")", () => {
    expect(compact(parseMultiattack("It can use its [[/item .mmChillingGaze00]] and makes two attacks, using [[/item .mmClaw0000000000]] or [[/item .mmIceThrow000000]] in any combination.")))
      .toBe("2×[mmClaw0000000000|mmIceThrow000000] +use[mmChillingGaze00]");
  });
  it("plain names: the creature's item names, else Title Case before \"attacks\"", () => {
    expect(compact(parseMultiattack("The modron makes two Clockwork Blade attacks."))).toBe("2×[Clockwork Blade]");
    expect(compact(parseMultiattack("It makes one Slam attack and uses Pacifying Spores."))).toBe("1×[Slam] +use[Pacifying Spores]");
    expect(compact(parseMultiattack("It makes two blade attacks.", { names: ["blade"] }))).toBe("2×[blade]");
  });
  it("the books' slips: \"makes makes\", \"makes on\", \"The it\", a name repeated after its link, \"attacks\" missing", () => {
    expect(compact(parseMultiattack("The [[lookup @name lowercase]] makes makes two [[/item .mmFlameBurst0000]] attacks."))).toBe("2×[mmFlameBurst0000]");
    expect(compact(parseMultiattack("It makes on [[/item Bite]] attack and two [[/item Claw]] attacks."))).toBe("1×[Bite] 2×[Claw]");
    expect(compact(parseMultiattack("The it makes two Rotting Slam attacks."))).toBe("2×[Rotting Slam]");
    expect(compact(parseMultiattack("It makes three attacks, using [[/item .mmDreadScythe000]]Dread Scythe or [[/item .mmDeathlyRay0000]] in any combination.")))
      .toBe("3×[mmDreadScythe000|mmDeathlyRay0000]");
    expect(compact(parseMultiattack("The [[lookup @name lowercase]] makes three [[/item Rend]]."))).toBe("3×[Rend]");
  });
  it("attacks by kind (DMG 2024)", () => {
    expect(compact(parseMultiattack("The scout makes two melee attacks or two ranged attacks."))).toBe("2×[ANY-melee] OR 2×[ANY-ranged]");
  });
  it("replace any attack; replace with an attack", () => {
    expect(compact(parseMultiattack("It makes two [[/item .mmTentacleLash00]] attacks. It can replace any attack with a use of [[/item .mmMindRot0000000]].")))
      .toBe("2×[mmTentacleLash00] / REPLACE any with [mmMindRot0000000]");
    expect(compact(parseMultiattack("It makes two [[/item Claw]] attacks. It can replace one attack with a [[/item Bite]] attack.")))
      .toBe("2×[Claw] / REPLACE 1 with [Bite]");
  });
  it("the unfilled template sentence is skipped; nothing to read is null", () => {
    expect(compact(parseMultiattack("The dragon makes {count} [[/item]] attacks and uses [[/item]]. The dragon makes three [[/item Rend]] attacks.")))
      .toBe("3×[Rend]");
    expect(parseMultiattack("The [[lookup @name lowercase]] makes {count} [[/item]] attacks and uses [[/item]].")).toBeNull();
    expect(parseMultiattack("<p>Nothing to see here.</p>")).toBeNull();
  });
  it("a sentence with references it can't read is reported, not guessed", () => {
    const plan = parseMultiattack("It makes two [[/item Claw]] attacks. It can replace one attack with something odd.");
    expect(plan?.unread).toEqual(["It can replace one attack with something odd"]);
  });
});

describe("multiattack parser: the 2014 prose (SRD 5.1)", () => {
  const read = (actor: string) => { const e = srd51.find(x => x.actor === actor)!; return compact(parseMultiattack(e.description, { names: e.items })); };
  it("\"N attacks: one with its X and two with its Y\"; a use first, \"It then makes\"", () => {
    expect(compact(parseMultiattack("The hezrou makes three attacks: one with its [[/item Bite]]{bite} and two with its [[/item Claws]]{claws}.")))
      .toBe("1×[Bite] 2×[Claws]");
    expect(compact(parseMultiattack("The dragon can use its [[/item Frightful Presence]]. It then makes three attacks: one with its [[/item Bite]] and two with its [[/item Claw]].")))
      .toBe("1×[Bite] 2×[Claw] +use[Frightful Presence]");
  });
  it("plain lowercase names, singular or plural, a qualifier dropped", () => {
    expect(compact(parseMultiattack("The oni makes two attacks, either with its claws or its glaive.", { names: ["Claw (Oni Form Only)", "Glaive"] })))
      .toBe("2×[Claw (Oni Form Only)|Glaive]");
    expect(compact(parseMultiattack("The marilith can make seven attacks: six with its longswords and one with its tail.", { names: ["Longsword", "Tail", "Attack"] })))
      .toBe("6×[Longsword] 1×[Tail]");
  });
  it("\"Alternatively\" and \"Or the captain makes\" as options", () => {
    expect(compact(parseMultiattack("The devil makes three melee attacks: one with its [[/item Tail]]{tail} and two with its [[/item Claw]]{claws}. Alternatively, it can use [[/item Hurl Flame]] twice.")))
      .toBe("1×[Tail] 2×[Claw] OR 2×[Hurl Flame]");
  });
  it("replacements: instead of its bite, in place of any attack, each of which it can replace", () => {
    expect(compact(parseMultiattack("It makes two [[/item Claw]] attacks. It can use its [[/item Swallow]] instead of its [[/item Bite]].")))
      .toBe("2×[Claw] / REPLACE 1 of Bite with [Swallow]");
    expect(compact(parseMultiattack("It makes two melee attacks: one with its [[/item Bite]] and one with its [[/item Claw]]. It can use [[/item Web]] in place of any melee attack.")))
      .toBe("1×[Bite] 1×[Claw] / REPLACE any with [Web]");
    expect(compact(parseMultiattack("It makes two [[/item Slam]] attacks, each of which it can replace with one use of [[/item Fling]].")))
      .toBe("2×[Slam] / REPLACE any with [Fling]");
  });
  it("limits and notes", () => {
    expect(compact(parseMultiattack("The vampire makes two attacks, only one of which can be a [[/item Bite]] attack.")))
      .toBe("2×[ANY] max 1 of [Bite]");
    expect(compact(parseMultiattack("The lizardfolk makes two melee attacks, each one with a different weapon.")))
      .toBe("2×[ANY-melee] NOTES [\"each attack with a different weapon\"]");
    expect(read("Grick")).toMatch(/NOTES \["If that attack hits, the grick can make one beak attack against the same target"\]/);
  });
  it("every SRD 5.1 Multiattack reads fully", () => {
    const failed = srd51.filter(e => { const plan = parseMultiattack(e.description, { names: e.items }); return !plan || plan.unread.length; }).map(e => e.actor);
    expect(failed).toEqual([]);
  });
  it("the SRD 5.1 plans are unchanged", async () => {
    const plans = Object.fromEntries(srd51.map(e => [e.actor, compact(parseMultiattack(e.description, { names: e.items }))]));
    await expect(JSON.stringify(plans, null, 1)).toMatchFileSnapshot("./__snapshots__/multiattack-srd51.plans.json");
  });
});

describe("multiattack parser: whole corpora", () => {
  it("every SRD 5.2 Multiattack reads fully (but the Ancient Gold Dragon's unfilled template)", () => {
    const failed = srd.filter(e => { const plan = parseMultiattack(e.description); return !plan || plan.unread.length; }).map(e => e.actor);
    expect(failed).toEqual(["Ancient Gold Dragon"]);
  });
  // The books' own text is never committed: `npm run corpus:books` extracts it from an installed Foundry into local/book-corpus/
  const corpusDir = new URL("../local/book-corpus/", import.meta.url);
  const books = existsSync(corpusDir) ? readdirSync(corpusDir).filter(f => f.endsWith(".json")) : [];
  it.skipIf(!books.length)("the local book corpus is present (npm run corpus:books)", () => expect(books.length).toBeGreaterThan(0));
  // Creatures with a hand plan (tools/multiattack-hand.json) are the books' known errors
  const hand: Record<string, unknown> = JSON.parse(readFileSync(new URL("../tools/multiattack-hand.json", import.meta.url), "utf8"));
  it.each(books)("every Multiattack in %s reads fully (local corpus)", file => {
    const corpus: { actor: string, uuid?: string, desc: string, items?: { name: string, identifier: string | null }[] }[] = JSON.parse(readFileSync(new URL(file, corpusDir), "utf8"))
      .filter((e: { uuid?: string }) => !e.uuid || !hand[e.uuid]);
    // The creature's item names, as the generator and midi pass them
    const names = (e: typeof corpus[number]) => (e.items ?? []).filter(i => !/^multiattack/.test(i.identifier ?? "")).map(i => i.name);
    const failed = corpus.filter(e => { const plan = parseMultiattack(e.desc, { names: names(e) }); return !plan || plan.unread.length; })
      .map(e => `${e.actor}: ${e.desc.replace(/<[^>]+>/g, "").slice(0, 160)}`);
    expect(failed).toEqual([]);
  });
  // Every plan frozen: a change to how any creature reads fails here (`npx vitest run -u` after checking it's intended)
  it("the SRD 5.2 plans are unchanged", async () => {
    const plans = Object.fromEntries(srd.map(e => [e.actor, compact(parseMultiattack(e.description))]));
    await expect(JSON.stringify(plans, null, 1)).toMatchFileSnapshot("./__snapshots__/multiattack-srd52.plans.json");
  });
  it.each(books)("the plans of %s are unchanged (local snapshot)", async file => {
    const corpus: { actor: string, uuid?: string, desc: string, items?: { name: string, identifier: string | null }[] }[] = JSON.parse(readFileSync(new URL(file, corpusDir), "utf8"));
    const names = (e: typeof corpus[number]) => (e.items ?? []).filter(i => !/^multiattack/.test(i.identifier ?? "")).map(i => i.name);
    const plans = Object.fromEntries(corpus.map(e => [e.uuid ?? e.actor, compact(parseMultiattack(e.desc, { names: names(e) }))]));
    await expect(JSON.stringify(plans, null, 1)).toMatchFileSnapshot(`../local/book-corpus/__snapshots__/${file.replace(/\.json$/, "")}.plans.json`);
  });
});

describe("multiattack plans: resolving against the creature", () => {
  const items = [
    { id: "mmRend0000000000", name: "Rend", identifier: "rend" },
    { id: "mmSpellcasting00", name: "Spellcasting", identifier: "spellcasting", activities: [{ id: "castFogCloud0000", type: "cast", spell: "Compendium.x.spells.Item.fog" }] },
    { id: "breath0000000000", name: "Weakening Breath", identifier: "weakening-breath" },
    { id: "claw000000000000", name: "Claw (Oni Form Only)", identifier: "claw" },
    { id: "noIdent000000000", name: "Gnashing Teeth" }
  ];
  const spell = (uuid: string) => ({ "Compendium.x.spells.Item.fog": { identifier: "fog-cloud", name: "Fog Cloud" } } as Record<string, { identifier: string, name: string }>)[uuid];
  const resolve = (html: string, names: string[] = []) => resolvePlan(parseMultiattack(html, { names })!, { items, spell });

  it("items by id, name, plural and qualifier; a missing identifier is its name's slug", () => {
    const plan = resolve("It makes three [[/item .mmRend0000000000]] attacks and two claws attacks and one Gnashing Teeth attack.", ["Claw (Oni Form Only)", "Gnashing Teeth"]);
    expect(plan.options[0].groups.map(g => g.refs)).toEqual([["rend"], ["claw"], ["gnashing-teeth"]]);
    expect(plan.unresolved).toBeUndefined();
  });
  it("casts: a named spell, a level version, a cast activity link", () => {
    expect(resolve("It makes three [[/item Rend]] attacks. It can replace one attack with a use of (A) [[/item Weakening Breath]] or (B) [[/item Spellcasting]] to cast @UUID[Compendium.y.spells.Item.gb]{Guiding Bolt} (level 4 version).").replace[0].refs)
      .toEqual(["weakening-breath", "spellcasting>guiding-bolt@4"]);
    expect(resolve("It makes three [[/item Rend]] attacks. It can replace one attack with a use of Spellcasting to cast [[/item .mmSpellcasting00.Activity.castFogCloud0000]].").replace[0].refs)
      .toEqual(["spellcasting>fog-cloud"]);
  });
  it("any attack, by kind", () => {
    expect(resolve("It makes two melee attacks or two ranged attacks.").options.map(o => o.groups[0].refs)).toEqual([["attack:melee"], ["attack:ranged"]]);
  });
  it("a link to an item the creature doesn't have falls back to its label; a name it doesn't have is unresolved", () => {
    expect(resolve("It makes two [[/item .elsewhere00000000]]{rend} attacks.").options[0].groups[0].refs).toEqual(["rend"]);
    const plan = resolve("It makes four [[/item Slam]] attacks.");
    expect(plan.options[0].groups[0].refs).toEqual(["slam"]);
    expect(plan.unresolved).toEqual(["Slam"]);
  });
});

describe("multiattack plans: fitting uses", () => {
  const plan = (p: Partial<MultiattackPlan> & { options: MultiattackPlan["options"] }): MultiattackPlan => ({ replace: [], ...p });
  const fit = (p: MultiattackPlan, uses: string[][], o = {}) => fitUses(p, uses, o);
  const dragon = plan({ options: [{ groups: [{ n: 3, refs: ["rend"] }], extra: [] }],
    replace: [{ n: 1, refs: ["repulsion-breath", "spellcasting>guiding-bolt@2"] }] });

  it("a group fills; one more doesn't fit", () => {
    expect(fit(dragon, [["rend"], ["rend"]])).toEqual({ option: 0, attacksLeft: 1 });
    expect(fit(dragon, [["rend"], ["rend"], ["rend"]])).toEqual({ option: 0, attacksLeft: 0 });
    expect(fit(dragon, [["rend"], ["rend"], ["rend"], ["rend"]])).toBeNull();
    expect(fit(dragon, [["bite", "attack"]])).toBeNull();
  });
  it("a replacement takes one attack's place, once; a cast by its spell, any level", () => {
    expect(fit(dragon, [["spellcasting>guiding-bolt", "guiding-bolt", "spell"], ["rend"], ["rend"]])).toEqual({ option: 0, attacksLeft: 0 });
    expect(fit(dragon, [["repulsion-breath"], ["spellcasting>guiding-bolt", "guiding-bolt"]])).toBeNull();
  });
  it("a replacement of a named attack only takes that one's place (Chimera)", () => {
    const chimera = plan({ options: [{ groups: [{ n: 1, refs: ["ram"] }, { n: 1, refs: ["bite"] }, { n: 1, refs: ["claw"] }], extra: [] }],
      replace: [{ n: 1, refs: ["fire-breath"], of: ["claw"] }] });
    expect(fit(chimera, [["fire-breath"], ["ram"], ["bite"]])).toEqual({ option: 0, attacksLeft: 0 });
    expect(fit(chimera, [["fire-breath"], ["claw"]])).toBeNull();
  });
  it("options: the uses decide which (Barbed Devil); mixing them doesn't fit", () => {
    const devil = plan({ options: [
      { groups: [{ n: 1, refs: ["claws"] }, { n: 1, refs: ["tail"] }], extra: [] },
      { groups: [{ n: 2, refs: ["hurl-flame"] }], extra: [] }] });
    expect(fit(devil, [["hurl-flame"]])).toEqual({ option: 1, attacksLeft: 1 });
    expect(fit(devil, [["tail"]])?.option).toBe(0);
    expect(fit(devil, [["tail"], ["hurl-flame"]])).toBeNull();
    expect(nextUses(devil, [["tail"]], [{ id: "a", keys: ["claws"] }, { id: "b", keys: ["hurl-flame"] }, { id: "c", keys: ["tail"] }]).map(c => c.id)).toEqual(["a"]);
  });
  it("any combination, any attack, by kind", () => {
    const assassin = plan({ options: [{ groups: [{ n: 3, refs: ["shortsword", "light-crossbow"] }], extra: [] }] });
    expect(fit(assassin, [["shortsword"], ["light-crossbow"], ["shortsword"]])?.attacksLeft).toBe(0);
    const scout = plan({ options: [{ groups: [{ n: 2, refs: ["attack:melee"] }], extra: [] }, { groups: [{ n: 2, refs: ["attack:ranged"] }], extra: [] }] });
    expect(fit(scout, [["shortsword", "attack", "attack:melee"]])?.option).toBe(0);
    expect(fit(scout, [["longbow", "attack", "attack:ranged"]])?.option).toBe(1);
  });
  it("extra uses: once each, in any order (Aboleth), alongside the attacks", () => {
    const aboleth = plan({ options: [{ groups: [{ n: 2, refs: ["tentacle"] }], extra: [{ refs: ["consume-memories", "dominate-mind"], ifAvailable: true }] }] });
    expect(fit(aboleth, [["dominate-mind"], ["tentacle"], ["tentacle"]])?.attacksLeft).toBe(0);
    expect(fit(aboleth, [["dominate-mind"], ["consume-memories"]])).toBeNull();
  });
  it("limits: only one of which can be a bite (Vampire)", () => {
    const vampire = plan({ options: [{ groups: [{ n: 2, refs: ["attack"] }], extra: [], limits: [{ refs: ["bite"], max: 1 }] }] });
    expect(fit(vampire, [["bite", "attack"], ["unarmed-strike", "attack"]])?.attacksLeft).toBe(0);
    expect(fit(vampire, [["bite", "attack"], ["bite", "attack"]])).toBeNull();
  });
  it("counts: a formula evaluated by the caller; a rule in words is unbounded (Hydra)", () => {
    const wasp = plan({ options: [{ groups: [{ n: { formula: "floor(@level / 2)" }, refs: ["attack"] }], extra: [] }] });
    expect(fit(wasp, [["sting", "attack"]], { evaluate: () => 2 })?.attacksLeft).toBe(1);
    expect(fit(wasp, [["sting", "attack"], ["sting", "attack"], ["sting", "attack"]], { evaluate: () => 2 })).toBeNull();
    const hydra = plan({ options: [{ groups: [{ n: { text: "it has heads" }, refs: ["bite"] }], extra: [] }] });
    expect(fit(hydra, Array(7).fill(["bite"]))?.attacksLeft).toBe(Infinity);
  });
});
