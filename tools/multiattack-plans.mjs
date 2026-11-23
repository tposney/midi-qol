#!/usr/bin/env node
/*
 * Generates midi's default Multiattack plans (the `midi-qol.official` registration, M21a) from the local book corpus
 * (npm run corpus:books) into data/multiattack/<pack>.json, committed and shipped. Keyed by the creature's compendium
 * uuid, each item reference bound to the creature's exact activities (index.json also lists them by name, for a creature built in the world with no compendium source); a plan holds counts and identifiers only, never the books' text: a condition or notes are flagged, and midi
 * shows their words from the creature's own description in the world.
 *
 *   npm run plans:multiattack            regenerate, report problems
 *   npm run plans:multiattack -- --check fail if the committed plans differ (a book or dnd5e update, or a parser change)
 *
 * A creature the parser can't read or resolve is reported and left out, unless tools/multiattack-hand.json has a plan
 * for it (same shape, keyed by uuid; hand plans win).
 */
import esbuild from "esbuild";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const corpusDir = new URL("local/book-corpus/", root);
const outDir = new URL("data/multiattack/", root);
const check = process.argv.includes("--check");
if (!existsSync(corpusDir)) {
  console.error("No local/book-corpus/: run npm run corpus:books -- --data <Foundry Data> first");
  process.exit(1);
}

const bundle = await esbuild.build({ entryPoints: [new URL("src/module/lib/multiattack.ts", root).pathname], bundle: true, format: "esm", write: false, logLevel: "error" });
const { parseMultiattack, resolvePlan, slug, bindPlan, planRefs, parseActivityRef } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

const spells = JSON.parse(readFileSync(new URL("local/book-spells.json", root), "utf8"));
const handPath = new URL("tools/multiattack-hand.json", root);
const hand = existsSync(handPath) ? JSON.parse(readFileSync(handPath, "utf8")) : {};

/** The plan as shipped: no text from the books */
function shipped(plan) {
  const out = {
    options: plan.options.map(o => ({
      groups: o.groups.map(g => ({ n: typeof g.n === "object" && "text" in g.n ? { text: true } : g.n, refs: g.refs })),
      extra: o.extra,
      ...(o.condition ? { condition: true } : {}),
      ...(o.limits ? { limits: o.limits } : {})
    })),
    replace: plan.replace,
    ...(plan.notes?.length ? { notes: true } : {})
  };
  return out;
}

if (!check) mkdirSync(outDir, { recursive: true });
let changed = 0, total = 0;
const problems = [];
const usedHand = new Set();
/** By name (midi's `id:<slug>` key): [uuid, rules] of each creature with a plan */
const names = {};
for (const file of readdirSync(corpusDir).filter(f => f.endsWith(".json")).sort()) {
  const corpus = JSON.parse(readFileSync(new URL(file, corpusDir), "utf8"));
  const plans = {};
  for (const entry of corpus) {
    // Item references become the book creature's exact activities (bindPlan); an item left unbound is a problem
    const bound = plan => {
      const out = bindPlan(plan, entry.items, uuid => spells[uuid]);
      // An item stored without activities (Tasha's: dnd5e makes them as the data loads) stays an item reference, bound
      // when the plan is chosen for a creature
      const stored = new Set(entry.items.filter(i => !(i.activities ?? []).length).map(i => i.identifier || slug(i.name)));
      const loose = planRefs(out).filter(r => !/^attack(:|$)|^spell$/.test(r) && !r.includes(">") && !parseActivityRef(r) && !stored.has(r));
      if (loose.length) problems.push(`${file} ${entry.actor} (${entry.uuid}): nothing usable on ${loose.join(", ")}`);
      return loose.length ? undefined : out;
    };
    if (hand[entry.uuid]) {
      usedHand.add(entry.uuid);
      const plan = bound(hand[entry.uuid]);
      if (plan) plans[entry.uuid] = { item: entry.itemId, plan, hand: true };
      continue;
    }
    const names = entry.items.filter(i => !/^multiattack/.test(i.identifier ?? "")).map(i => i.name);
    const parsed = parseMultiattack(entry.desc, { names });
    if (!parsed) { problems.push(`${file} ${entry.actor} (${entry.uuid}): no plan read`); continue; }
    if (parsed.unread.length) { problems.push(`${file} ${entry.actor} (${entry.uuid}): unread ${JSON.stringify(parsed.unread)}`); continue; }
    const plan = resolvePlan(parsed, { items: entry.items, spell: uuid => spells[uuid] });
    if (plan.unresolved) { problems.push(`${file} ${entry.actor} (${entry.uuid}): unresolved ${JSON.stringify(plan.unresolved)}`); continue; }
    const final = bound(shipped(plan));
    if (final) plans[entry.uuid] = { item: entry.itemId, plan: final };
  }
  const sorted = Object.fromEntries(Object.keys(plans).sort().map(k => [k, plans[k]]));
  for (const entry of corpus) if (plans[entry.uuid]) (names[slug(entry.actor)] ??= []).push([entry.uuid, entry.rules ?? null]);
  const text = JSON.stringify({ source: file.replace(/\.json$/, ""), plans: sorted }, null, 1) + "\n";
  const target = new URL(file, outDir);
  const before = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (before !== text) {
    changed++;
    if (!check) writeFileSync(target, text);
    console.log(`${check ? "differs" : "written"}: data/multiattack/${file} (${Object.keys(sorted).length} plans)`);
  }
  total += Object.keys(sorted).length;
}
// The packs midi has plans for (the runtime fetches only these), and the creatures by name
{
  const packs = readdirSync(corpusDir).filter(f => f.endsWith(".json")).map(f => f.replace(/\.json$/, "")).sort();
  // The Monster Manual's and the SRD's creatures first, then the other books'
  const rank = uuid => /^Compendium\.dnd-monster-manual\./.test(uuid) ? 0 : /^Compendium\.dnd5e\./.test(uuid) ? 1 : 2;
  const byName = Object.fromEntries(Object.keys(names).sort().map(k => [k, names[k].sort((a, b) => rank(a[0]) - rank(b[0]))]));
  const index = JSON.stringify({ packs, names: byName }) + "\n";
  const target = new URL("index.json", outDir);
  if ((existsSync(target) ? readFileSync(target, "utf8") : null) !== index) { changed++; if (!check) writeFileSync(target, index); }
}
for (const uuid of Object.keys(hand)) if (!usedHand.has(uuid)) problems.push(`tools/multiattack-hand.json: ${uuid} matches no creature in the corpus`);
console.log(`${total} plans; ${changed} file(s) ${check ? "differ" : "changed"}`);
if (problems.length) { console.log(`\n${problems.length} left out (add a hand plan in tools/multiattack-hand.json):`); problems.forEach(p => console.log("  " + p)); }
if (check && changed) process.exit(1);
