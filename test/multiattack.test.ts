import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parseMultiattack, type ParsedPlan, type RawRef, type Count } from "../src/module/lib/multiattack.js";

// SRD 5.2 (CC-BY 4.0) Multiattack descriptions from dnd5e's packs
const srd: { actor: string, description: string }[] = JSON.parse(readFileSync(new URL("./fixtures/multiattack-srd52.json", import.meta.url), "utf8"));
const srdText = (actor: string) => {
  const entry = srd.find(e => e.actor === actor);
  if (!entry) throw new Error(`no SRD creature ${actor}`);
  return entry.description;
};

/** A compact form of a plan: "2×[a|b] +use[c]? OR ... / REPLACE 1 of x with [y]" */
const ref = (r: RawRef): string => r.kind === "attack" ? "ANY"
  : r.kind === "cast" ? `cast(${ref(r.via)}>${ref(r.spell)}${r.level ? "@" + r.level : ""})`
    : r.kind === "spell" ? (r.name ?? r.uuid ?? "?") : (r.name ?? r.activity ?? r.id ?? "?");
const count = (n: Count) => typeof n === "object" ? ("formula" in n ? n.formula : n.text) : String(n);
function compact(plan: ParsedPlan | null): string {
  if (!plan) return "null";
  const options = plan.options.map(o => [
    ...o.groups.map(g => `${count(g.n)}×[${g.refs.map(ref).join("|")}]`),
    ...o.extra.map(e => `+use[${e.refs.map(ref).join("|")}]${e.ifAvailable ? "?" : ""}`)
  ].join(" ") + (o.condition ? ` {${o.condition}}` : "")).join(" OR ");
  const replace = plan.replace.map(r => ` / REPLACE ${r.n}${r.of ? ` of ${r.of.map(ref).join("|")}` : ""} with [${r.refs.map(ref).join("|")}]`).join("");
  return options + replace + (plan.unread.length ? ` UNREAD ${JSON.stringify(plan.unread)}` : "");
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

describe("multiattack parser: whole corpora", () => {
  it("every SRD 5.2 Multiattack reads fully (but the Ancient Gold Dragon's unfilled template)", () => {
    const failed = srd.filter(e => { const plan = parseMultiattack(e.description); return !plan || plan.unread.length; }).map(e => e.actor);
    expect(failed).toEqual(["Ancient Gold Dragon"]);
  });
  // The 2024 Monster Manual's text is not committed: MIDI_MM_CORPUS names a local extract ([{ actor, desc }])
  const mm = process.env.MIDI_MM_CORPUS;
  it.skipIf(!mm || !existsSync(mm))("every Monster Manual 2024 Multiattack reads fully (local corpus)", () => {
    const corpus: { actor: string, desc: string }[] = JSON.parse(readFileSync(mm!, "utf8"));
    const failed = corpus.filter(e => { const plan = parseMultiattack(e.desc); return !plan || plan.unread.length; }).map(e => e.actor);
    expect(failed).toEqual([]);
  });
});
