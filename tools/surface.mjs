// Generates docs/surface.json: the names other modules may rely on (MidiQOL exports, midi-qol.* hooks, settings,
// services; M31: step and flow ids, entry events and actions, tags, the flags.midi-qol keys midi reads).
// `node tools/surface.mjs --check` fails if the file is stale. Names only: shapes are versioned by apiVersion.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.join(root, "src");
const outFile = path.join(root, "docs", "surface.json");

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(ts|mjs|js)$/.test(e.name) && !e.name.endsWith(".d.ts") ? [p] : [];
  });
}
const sources = Object.fromEntries(files(src).map(f => [path.relative(src, f), fs.readFileSync(f, "utf8")]));
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

// Top-level keys of an object literal starting at text[open] === "{"
function objectKeys(text, open) {
  let depth = 0, i = open, start = open + 1;
  const entries = [];
  for (; i < text.length; i++) {
    const c = text[i];
    if ("{[(".includes(c)) depth++;
    else if ("}])".includes(c)) { depth--; if (depth === 0) { entries.push(text.slice(start, i)); break; } }
    else if (c === "," && depth === 1) { entries.push(text.slice(start, i)); start = i + 1; }
    else if (c === '"' || c === "'" || c === "`") { const q = c; i++; while (i < text.length && text[i] !== q) { if (text[i] === "\\") i++; i++; } }
  }
  return entries.map(e => e.trim().match(/^(?:get\s+|async\s+)?\[?["']?([A-Za-z_$][\w$]*)/)?.[1]).filter(Boolean);
}

// MidiQOL exports
const api = new Set();
for (const text of Object.values(sources).map(stripComments)) {
  for (const m of text.matchAll(/Object\.assign\(\s*globalThis\.MidiQOL\s*,\s*\{/g)) objectKeys(text, m.index + m[0].length - 1).forEach(k => api.add(k));
  for (const m of text.matchAll(/globalThis\.MidiQOL\.([A-Za-z_$][\w$]*)\s*(?:\?\?)?=(?!=)/g)) api.add(m[1]);
}
const contract = sources[path.join("module", "api", "contract.ts")] ?? "";
const apiVersion = contract.match(/MIDI_API_VERSION\s*=\s*"([^"]+)"/)?.[1];

// Hooks fired by midi
const hooks = new Set();
const callers = /(?:Hooks\.callAll|Hooks\.call|callMidiHooks|callCancellableHooks|asyncHooksCallAll|asyncHooksCall|callActivityHooks)\(\s*(?:[^"'`(),]+,\s*)?["'`](midi-qol\.[A-Za-z][\w]*)["'`]/g;
for (const text of Object.values(sources).map(stripComments)) for (const m of text.matchAll(callers)) hooks.add(m[1]);
// Each of midi's steps fires pre<name>/post<name> (steps/steps.ts BUILT_IN; their bodies are in workflowSteps/, M5)
const stepsSource = sources[path.join("module", "steps", "steps.ts")] ?? "";
const builtIn = stepsSource.match(/const BUILT_IN[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
for (const m of builtIn.matchAll(/(?:^|[\[,]\s*)\[?\s*"([A-Za-z]+)"/g)) { hooks.add(`midi-qol.pre${m[1]}`); hooks.add(`midi-qol.post${m[1]}`); }

// Settings
const settings = new Set();
for (const text of Object.values(sources).map(stripComments)) {
  const consts = Object.fromEntries([...text.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*["']([^"']+)["']/g)].map(m => [m[1], m[2]]));
  for (const m of text.matchAll(/game\.settings\.register\(\s*(?:"midi-qol"|'midi-qol'|MODULE_ID)\s*,\s*(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))/g)) {
    const key = m[1] ?? consts[m[2]];
    if (key) settings.add(key);
  }
}

// Services (registered with registerDefaultProvider / services.define in src)
const services = new Set();
for (const text of Object.values(sources).map(stripComments)) for (const m of text.matchAll(/defineService(?:<[^>]*>)?\(\s*["']([\w.]+)["']/g)) services.add(m[1]);

// M31: the step ids, flows, entry events and actions, tags midi registers, and the flag keys it reads
const steps = new Set([...builtIn.matchAll(/(?:^|[\[,]\s*)\[?\s*"([A-Za-z]+)"/g)].map(m => `midi-qol.${m[1]}`));
const flows = new Set(), entryEvents = new Set(), entryActions = new Set(), tags = new Set(), flags = new Set();
for (const text of Object.values(sources).map(stripComments)) {
  const consts = Object.fromEntries([...text.matchAll(/(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*["']([^"']+)["']/g)].map(m => [m[1], m[2]]));
  for (const m of text.matchAll(/registerFlow\(\s*\{\s*id:\s*["']([\w.-]+)["']/g)) flows.add(m[1]);
  for (const m of text.matchAll(/registerEvent\(\s*(?:["']([\w.-]+)["']|([A-Z_][A-Z0-9_]*))/g)) { const id = m[1] ?? consts[m[2]]; if (id) entryEvents.add(id); }
  for (const m of text.matchAll(/registerAction\(\s*["']([\w.-]+)["']/g)) entryActions.add(m[1]);
  for (const m of text.matchAll(/registerTag\(\s*["']([\w.-]+)["']/g)) tags.add(m[1]);
  for (const m of text.matchAll(/flags\.midi-qol\.([A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)*)/g)) flags.add(m[1].replace(/\.$/, ""));
  for (const m of text.matchAll(/\bmidiFlag\(\s*["'`]([A-Za-z][\w.-]*?)(?:\$\{|["'`])/g)) flags.add(m[1].replace(/\.$/, ""));
  for (const m of text.matchAll(/getFlag\(\s*(?:MODULE_ID|["']midi-qol["'])\s*,\s*["']([\w.-]+)["']/g)) flags.add(m[1]);
}

const sorted = s => [...s].sort((a, b) => a.localeCompare(b));
// midi's declared ConfigSettings keys (M4a, lib/settingsTable.ts)
const configKeys = new Set();
for (const m of (sources[path.join("module", "lib", "settingsTable.ts")] ?? "").matchAll(/^  "([\w.]+)": \{ group/gm)) configKeys.add(m[1]);
const surface = { apiVersion, api: sorted(api), hooks: sorted(hooks), settings: sorted(settings), configSettings: sorted(configKeys), services: sorted(services),
  steps: sorted(steps), flows: sorted(flows), entryEvents: sorted(entryEvents), entryActions: sorted(entryActions), tags: sorted(tags), flags: sorted(flags) };
const json = JSON.stringify(surface, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "";
  if (current === json) { console.log("docs/surface.json is up to date"); process.exit(0); }
  const old = current ? JSON.parse(current) : {};
  for (const k of ["api", "hooks", "settings", "configSettings", "services", "steps", "flows", "entryEvents", "entryActions", "tags", "flags"]) {
    const before = new Set(old[k] ?? []), after = new Set(surface[k]);
    const added = [...after].filter(x => !before.has(x)), removed = [...before].filter(x => !after.has(x));
    if (added.length || removed.length) console.log(`${k}: +${added.join(", +") || "-"}  -${removed.join(", -") || "-"}`);
  }
  if (old.apiVersion !== surface.apiVersion) console.log(`apiVersion ${old.apiVersion} -> ${surface.apiVersion}`);
  console.error("docs/surface.json is stale: run npm run surface (and raise MIDI_API_VERSION if something was removed or changed)");
  process.exit(1);
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, json);
console.log(`docs/surface.json: ${surface.api.length} exports, ${surface.hooks.length} hooks, ${surface.settings.length} settings, ${surface.configSettings.length} config settings, ${surface.services.length} services, `
  + `${surface.steps.length} steps, ${surface.flows.length} flows, ${surface.entryEvents.length} entry events, ${surface.entryActions.length} entry actions, ${surface.tags.length} tags, ${surface.flags.length} flag keys`);
