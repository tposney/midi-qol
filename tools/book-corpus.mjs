#!/usr/bin/env node
/*
 * Extracts the Multiattack descriptions of the official books' creatures from an installed Foundry into
 * local/book-corpus/ (git-ignored: the books' text is never committed, pushed or packaged). The multiattack tests read
 * every file there (test/multiattack.test.ts), and the plan generator (M21a) uses the same extract.
 *
 *   npm run corpus:books -- --data /path/to/FoundryData [--modules dnd-monster-manual,dnd-dungeon-masters-guide]
 *   (or FOUNDRY_DATA=/path/to/FoundryData npm run corpus:books)
 *
 * Default modules: every installed module whose id starts "dnd-" (the official books) with an Actor pack. Each pack is
 * copied before reading, so a running server's lock doesn't matter.
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
const wanted = arg("modules")?.split(",").map(s => s.trim()).filter(Boolean)
  ?? readdirSync(join(data, "modules")).filter(id => id.startsWith("dnd-"));
const out = new URL("../local/book-corpus/", import.meta.url);
mkdirSync(out, { recursive: true });

const isMultiattack = item => /^multiattack/.test(item.system?.identifier ?? "") || /multiattack/i.test(item.name ?? "");

let total = 0;
for (const id of wanted) {
  const manifestPath = join(data, "modules", id, "module.json");
  if (!existsSync(manifestPath)) { console.warn(`${id}: not installed`); continue; }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const pack of (manifest.packs ?? []).filter(p => p.type === "Actor")) {
    const source = join(data, "modules", id, pack.path ?? `packs/${pack.name}`);
    if (!existsSync(source)) { console.warn(`${id}.${pack.name}: no pack at ${source}`); continue; }
    const copy = mkdtempSync(join(tmpdir(), "midi-corpus-"));
    try {
      cpSync(source, copy, { recursive: true });
      rmSync(join(copy, "LOCK"), { force: true });
      const db = new ClassicLevel(copy, { valueEncoding: "json" });
      const actors = new Map();
      const items = new Map();
      for await (const [key, value] of db.iterator()) {
        if (key.startsWith("!actors!")) actors.set(value._id, value);
        else if (key.startsWith("!actors.items!")) {
          const actorId = key.slice("!actors.items!".length).split(".")[0];
          if (!items.has(actorId)) items.set(actorId, []);
          items.get(actorId).push(value);
        }
      }
      await db.close();
      const entries = [];
      for (const [actorId, actorItems] of items) {
        const actor = actors.get(actorId);
        for (const item of actorItems.filter(isMultiattack)) {
          entries.push({
            actor: actor?.name ?? actorId,
            uuid: `Compendium.${id}.${pack.name}.Actor.${actorId}`,
            item: item.name,
            identifier: item.system?.identifier,
            desc: item.system?.description?.value ?? "",
            items: actorItems.map(i => ({ id: i._id, name: i.name, identifier: i.system?.identifier ?? null, type: i.type }))
          });
        }
      }
      entries.sort((a, b) => a.actor.localeCompare(b.actor));
      writeFileSync(new URL(`${id}.${pack.name}.json`, out), JSON.stringify(entries, null, 1));
      console.log(`${id}.${pack.name}: ${entries.length} Multiattacks (${actors.size} actors)`);
      total += entries.length;
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  }
}
console.log(`${total} in local/book-corpus/`);
