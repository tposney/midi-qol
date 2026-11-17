// For plugin authors: checks that a module only uses midi names listed in midi's docs/surface.json.
// usage: node check-plugin.mjs <path/to/surface.json> <plugin source dir> [--allow name,name]
// Reports MidiQOL.<x> exports, midi-qol.<hook> listeners and midi-qol settings reads that midi doesn't publish.
// Names only: run your own tests for behaviour. Dynamic access (MidiQOL[name]) is not seen.
import fs from "node:fs";
import path from "node:path";

const [,, surfacePath, dir, ...rest] = process.argv;
if (!surfacePath || !dir) { console.error("usage: node check-plugin.mjs <surface.json> <source dir> [--allow a,b]"); process.exit(2); }
const allow = new Set((rest[rest.indexOf("--allow") + 1] ?? "").split(",").filter(Boolean));
const surface = JSON.parse(fs.readFileSync(surfacePath, "utf8"));
const known = { api: new Set(surface.api), hooks: new Set(surface.hooks), settings: new Set(surface.settings), services: new Set(surface.services ?? []) };

function files(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : files(p);
    return /\.(m?js|ts)$/.test(e.name) ? [p] : [];
  });
}
const problems = [];
for (const f of files(dir)) {
  const text = fs.readFileSync(f, "utf8");
  const lineOf = i => text.slice(0, i).split("\n").length;
  for (const m of text.matchAll(/\bMidiQOL\??\.([A-Za-z_$][\w$]*)/g))
    if (!known.api.has(m[1]) && !allow.has(m[1])) problems.push(`${f}:${lineOf(m.index)} MidiQOL.${m[1]} is not a published export`);
  for (const m of text.matchAll(/Hooks\.(?:on|once)\(\s*["'`](midi-qol\.[A-Za-z]\w*)/g))
    if (!known.hooks.has(m[1]) && !allow.has(m[1])) problems.push(`${f}:${lineOf(m.index)} hook ${m[1]} is not fired by midi`);
  for (const m of text.matchAll(/settings\.get\(\s*["']midi-qol["']\s*,\s*["']([^"']+)["']/g))
    if (!known.settings.has(m[1]) && !allow.has(m[1])) problems.push(`${f}:${lineOf(m.index)} setting midi-qol.${m[1]} is not registered by midi`);
  for (const m of text.matchAll(/services\.(?:get|register|wrap|isProvider)\(\s*["']([\w.]+)["']/g))
    if (!known.services.has(m[1]) && !allow.has(m[1])) problems.push(`${f}:${lineOf(m.index)} service ${m[1]} is not defined by midi`);
}
console.log(`midi surface ${surface.apiVersion}: ${problems.length ? problems.length + " problem(s)" : "ok"}`);
for (const p of problems) console.log("  " + p);
process.exit(problems.length ? 1 : 0);
