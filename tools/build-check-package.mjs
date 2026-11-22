// M31f: builds packages/check (@midi-qol/check): the plugin check with midi's current docs/surface.json, for authors'
// CI. usage: node tools/build-check-package.mjs (npm run check:package). Private until midi-next is released.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pkgDir = path.join(root, "packages", "check");
const dist = path.join(pkgDir, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, "tools", "contract", "check-plugin.mjs"), path.join(dist, "check-plugin.mjs"));
fs.copyFileSync(path.join(root, "docs", "surface.json"), path.join(dist, "surface.json"));
fs.writeFileSync(path.join(dist, "bin.mjs"), `#!/usr/bin/env node
// midi-qol-check <source dir> [--allow name,name]: checks a module against the surface.json this package carries
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [dir, ...rest] = process.argv.slice(2);
process.argv = [process.argv[0], path.join(here, "check-plugin.mjs"), path.join(here, "surface.json"), dir ?? ".", ...rest];
await import("./check-plugin.mjs");
`);
const midi = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const surface = JSON.parse(fs.readFileSync(path.join(root, "docs", "surface.json"), "utf8"));
fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({
  name: "@midi-qol/check",
  version: midi.version,
  private: true,
  description: `Checks a Foundry module against midi-qol's published names (surface ${surface.apiVersion}): exports, hooks, settings, services, entry events`,
  type: "module",
  bin: { "midi-qol-check": "dist/bin.mjs" },
  files: ["dist", "README.md"],
  license: "MIT"
}, null, 2) + "\n");
console.log(`packages/check: @midi-qol/check ${midi.version} (surface ${surface.apiVersion})`);
