#!/usr/bin/env node
/*
 * Extracts the Multiattack descriptions of the official books' creatures (and dnd5e's own SRD packs) from an installed
 * Foundry into local/book-corpus/ (git-ignored: the books' text is never committed, pushed or packaged), with each
 * creature's items and their activities, and local/book-spells.json (every spell pack's uuid → name, identifier). The
 * multiattack tests read every file in local/book-corpus/ (test/multiattack.test.ts); the plan generator
 * (tools/multiattack-plans.mjs) reads both.
 *
 *   npm run corpus:books -- --data /path/to/FoundryData [--modules dnd-monster-manual,dnd-dungeon-masters-guide]
 *   (or FOUNDRY_DATA=/path/to/FoundryData npm run corpus:books)
 *
 * Default modules: every installed module whose id starts "dnd-" (the official books), and the dnd5e system (its SRD
 * packs; --no-system leaves it out). Each pack is copied before reading, so a running server's lock doesn't matter.
 */
import { ClassicLevel } from "classic-level";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const data = arg("data") ?? process.env.FOUNDRY_DATA;
if (!data || !existsSync(join(data, "modules"))) {
  console.error("Give the Foundry Data folder: --data /path/to/Data (or FOUNDRY_DATA); it must contain modules/");
  process.exit(1);
}
const wanted = (arg("modules")?.split(",").map(s => s.trim()).filter(Boolean)
  ?? readdirSync(join(data, "modules")).filter(id => id.startsWith("dnd-")))
  .map(id => ({ id, dir: join(data, "modules", id), manifest: "module.json" }));
if (!args.includes("--no-system")) wanted.unshift({ id: "dnd5e", dir: join(data, "systems", "dnd5e"), manifest: "system.json" });
const out = new URL("../local/book-corpus/", import.meta.url);
mkdirSync(out, { recursive: true });

const isMultiattack = item => /^multiattack/.test(item.system?.identifier ?? "") || /multiattack/i.test(item.name ?? "");

/** A pack's documents by key, read from a copy */
async function readPack(source) {
  const copy = mkdtempSync(join(tmpdir(), "midi-corpus-"));
  try {
    cpSync(source, copy, { recursive: true });
    rmSync(join(copy, "LOCK"), { force: true });
    const db = new ClassicLevel(copy, { valueEncoding: "json" });
    const entries = [];
    for await (const entry of db.iterator()) entries.push(entry);
    await db.close();
    return entries;
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

/** An item's activities: id, type, name, activation, midi's automation-only marker, and a cast activity's spell */
const activitiesOf = item => Object.entries(item.system?.activities ?? {}).map(([id, a]) => ({
  id, type: a.type, ...(a.name ? { name: a.name } : {}), ...(a.activation?.type ? { activation: a.activation.type } : {}),
  ...(a.midiProperties?.automationOnly ? { automationOnly: true } : {}), ...(a.spell?.uuid ? { spell: a.spell.uuid } : {})
}));
const spells = {};

let total = 0;
for (const { id, dir, manifest: file } of wanted) {
  const manifestPath = join(dir, file);
  if (!existsSync(manifestPath)) { console.warn(`${id}: not installed`); continue; }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const pack of (manifest.packs ?? []).filter(p => p.type === "Actor" || (p.type === "Item" && /spell/i.test(p.name)))) {
    const source = join(dir, pack.path ?? `packs/${pack.name}`);
    if (!existsSync(source)) { console.warn(`${id}.${pack.name}: no pack at ${source}`); continue; }
    const docs = await readPack(source);
    if (pack.type === "Item") {
      for (const [key, value] of docs) if (key.startsWith("!items!") && value.type === "spell")
        spells[`Compendium.${id}.${pack.name}.Item.${value._id}`] = { name: value.name, identifier: value.system?.identifier ?? null };
      continue;
    }
    const actors = new Map();
    const items = new Map();
    for (const [key, value] of docs) {
      if (key.startsWith("!actors!")) actors.set(value._id, value);
      else if (key.startsWith("!actors.items!")) {
        const actorId = key.slice("!actors.items!".length).split(".")[0];
        if (!items.has(actorId)) items.set(actorId, []);
        items.get(actorId).push(value);
      }
    }
    const entries = [];
    for (const [actorId, actorItems] of items) {
      const actor = actors.get(actorId);
      for (const item of actorItems.filter(isMultiattack)) {
        entries.push({
          actor: actor?.name ?? actorId,
          uuid: `Compendium.${id}.${pack.name}.Actor.${actorId}`,
          rules: actor?.system?.source?.rules ?? null,
          item: item.name,
          itemId: item._id,
          identifier: item.system?.identifier,
          desc: item.system?.description?.value ?? "",
          items: actorItems.map(i => ({ id: i._id, name: i.name, identifier: i.system?.identifier ?? null, type: i.type, activities: activitiesOf(i) }))
        });
      }
    }
    if (!entries.length) continue;
    entries.sort((a, b) => a.actor.localeCompare(b.actor));
    writeFileSync(new URL(`${id}.${pack.name}.json`, out), JSON.stringify(entries, null, 1));
    console.log(`${id}.${pack.name}: ${entries.length} Multiattacks (${actors.size} actors)`);
    total += entries.length;
  }
}
writeFileSync(new URL("../book-spells.json", out), JSON.stringify(spells, null, 1));
console.log(`${total} in local/book-corpus/; ${Object.keys(spells).length} spells in local/book-spells.json`);
