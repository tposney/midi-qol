#!/usr/bin/env node
// Audit midi's use of dnd5e templates against an installed dnd5e. Run after every dnd5e update:
//   node scripts/check-dnd5e-templates.mjs <path to systems/dnd5e>
// 1. Every "systems/dnd5e/templates/..." path in src/ and templates/ must exist.
// 2. Every midi template that shadows a dnd5e one (same path under templates/) must still contain
//    each partial and field dnd5e's version uses, unless listed in INTENTIONAL below.
// 3. A shadow identical to dnd5e's (ignoring whitespace) is reported as redundant.
// 4. What midi's section in dnd5e's roll dialogs relies on (M32c, lib/rollDialogBonuses.ts): the dialog's configuration
//    part, its per-roll build hook with the form data, and the attack and damage hook names.
// Exit code 1 when anything needs looking at.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DND5E = process.argv[2];
if (!DND5E || !fs.existsSync(path.join(DND5E, "system.json"))) {
  console.error("usage: node scripts/check-dnd5e-templates.mjs <path to systems/dnd5e>");
  process.exit(2);
}

// Shadow template → dnd5e tokens midi deliberately leaves out (it supplies its own replacement).
const INTENTIONAL = {
  "activity/save-effect.hbs": ["systems/dnd5e/templates/activity/parts/save-damage.hbs"],
};

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const read = f => fs.readFileSync(f, "utf8");
const problems = [];

const refPattern = /systems\/dnd5e\/(templates\/[\w\-/.]+\.(?:hbs|html))/g;
for (const file of [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "templates"))]) {
  if (!/\.(ts|mjs|js|hbs|html)$/.test(file)) continue;
  for (const [, rel] of read(file).matchAll(refPattern)) {
    if (!fs.existsSync(path.join(DND5E, rel)))
      problems.push(`missing: ${path.relative(ROOT, file)} references systems/dnd5e/${rel}`);
  }
}

// Partials, field paths and form names: what a template must keep to render everything dnd5e does.
const tokens = text => new Set([
  ...[...text.matchAll(/\{\{>\s*"([^"]+)"/g)].map(m => m[1]),
  ...[...text.matchAll(/\b((?:fields|source)\.[\w.]+)/g)].map(m => m[1]),
  ...[...text.matchAll(/\bname="([^"{}]+)"/g)].map(m => `name=${m[1]}`),
]);
const squash = text => text.replace(/\s+/g, "");

const midiTemplates = path.join(ROOT, "templates");
for (const file of walk(midiTemplates)) {
  const rel = path.relative(midiTemplates, file);
  const original = path.join(DND5E, "templates", rel);
  if (!fs.existsSync(original)) continue;
  const mine = read(file), theirs = read(original);
  if (squash(mine) === squash(theirs)) {
    problems.push(`redundant: templates/${rel} is identical to dnd5e's; use dnd5e's`);
    continue;
  }
  const have = tokens(mine), skip = new Set(INTENTIONAL[rel] ?? []);
  for (const t of tokens(theirs))
    if (!have.has(t) && !skip.has(t)) problems.push(`content: templates/${rel} lacks dnd5e's ${t}`);
}

const code = fs.existsSync(path.join(DND5E, "dnd5e.mjs")) ? read(path.join(DND5E, "dnd5e.mjs")) : "";
for (const [needle, what] of [
  ["templates/dice/roll-configuration.hbs", "the roll dialog's configuration part (midi adds its section to it)"],
  ["Hooks.callAll(`dnd5e.build${hookName.capitalize()}RollConfig`, this, config, formData, index)", "the roll dialog's build hook with the form data"],
  ['hookNames: ["attack", "d20Test"]', "the attack roll's hook names (dnd5e.buildAttackRollConfig)"],
  ['hookNames: ["damage"]', "the damage roll's hook names (dnd5e.buildDamageRollConfig)"]
]) if (!code.includes(needle)) problems.push(`roll dialog: dnd5e.mjs no longer has ${what}: check lib/rollDialogBonuses.ts`);

const version = JSON.parse(read(path.join(DND5E, "system.json"))).version;
if (problems.length) {
  console.log(`dnd5e ${version}: ${problems.length} issue(s)\n` + problems.map(p => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log(`dnd5e ${version}: template references and shadow templates OK`);
