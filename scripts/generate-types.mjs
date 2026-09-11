// Runs `tsc --project tsconfig.types.json` to emit .d.ts declarations.
//
// tsc still WRITES the declarations even when it reports errors, and the mixin-factory pattern used
// throughout midi (ApplicationV2 / document subclasses via `function defineX(base){return class extends base{}}`)
// makes fvtt-types emit "inferred type is not portable" diagnostics that cannot be fixed without
// annotating dozens of exports. Those specific codes are tolerated here so the declarations still
// generate cleanly; any OTHER error still fails the build.
import { spawnSync } from "node:child_process";
import path from "node:path";

// fvtt-types declaration-emit portability noise: not-portable inferred type / anonymous class member / unnameable name.
const TOLERATED = new Set(["TS2742", "TS4094", "TS4023"]);

const binDir = path.resolve("node_modules/.bin");
const res = spawnSync("tsc", ["--project", "tsconfig.types.json"], {
  encoding: "utf8",
  env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
  shell: process.platform === "win32",
});

const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
const errorRe = /error (TS\d+):/;
const realErrors = [];
let tolerated = 0;
for (const line of output.split("\n")) {
  const m = line.match(errorRe);
  if (!m) continue;
  if (TOLERATED.has(m[1])) tolerated++;
  else realErrors.push(line);
}

if (tolerated) console.log(`generate-types: tolerated ${tolerated} known fvtt-types portability errors (${[...TOLERATED].join("/")}).`);

if (realErrors.length) {
  console.error(`generate-types: ${realErrors.length} non-tolerated declaration error(s):`);
  console.error(realErrors.join("\n"));
  process.exit(1);
}

console.log("generate-types: declarations emitted successfully.");
