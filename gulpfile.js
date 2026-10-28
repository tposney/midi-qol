let foundryvttCli;
import("@foundryvtt/foundryvtt-cli").then((cli) => {foundryvttCli = cli});
const gulp = require("gulp");
const path = require("path");
var fs = require("fs");
const del = require("del");
const ts = require("gulp-typescript");
const sm = require("gulp-sourcemaps");
const zip = require("gulp-zip");
const rename = require("gulp-rename");
const minify = require("gulp-minify");
const tabify = require("gulp-tabify");
const stringify = require("json-stringify-pretty-compact");
const readlineSync = require("readline-sync");
const esbuild = require("esbuild");

const GLOB = "**/*";
const DIST = "dist/";
const BUNDLE = "package/";
const SOURCE = "src/";
const LANG = "lang/";
const TEMPLATES = "templates/";
const CSS = "css/";
const ICON = "icons/";
const PACK = "packs/";
const CONFIG = "sample-config/";
const SOUND = "sounds/";

var PACKAGE = JSON.parse(fs.readFileSync("package.json"));

function reloadPackage(cb) {
  PACKAGE = JSON.parse(fs.readFileSync("package.json"));
  cb();
}

function DEV_DIST() {
  return path.join(PACKAGE.devDir, PACKAGE.name) + "/";
}

String.prototype.replaceAll = function (pattern, replace) {
  return this.split(pattern).join(replace);
};

function pdel(patterns, options) {
  return () => {
    return del(patterns, options);
  };
}

function plog(message) {
  return (cb) => {
    console.log(message);
    cb();
  };
}

/**
 * Compile the source code into the distribution directory
 * @param {Boolean} keepSources Include the TypeScript SourceMaps
 */
function buildSource(keepSources, alwaysBuild = false, minifySources = false, output = null) {
  return () => {
    var stream = gulp.src(SOURCE + GLOB);
    // if (keepSources) stream = stream.pipe(sm.init())
    stream = stream.pipe(ts.createProject("tsconfig.json")());
    stream = stream.on("error", (error) => {
      if (alwaysBuild) return;
      if (!this.alreadyRefusedBuild && readlineSync.keyInYN("Build Anyway?")) return;
      this.alreadyRefusedBuild = true;
      throw error;
    });
    // if (keepSources) stream = stream.pipe(sm.write())
    if (minifySources)
      stream = stream.pipe(
        minify({
          ext: { min: ".js" },
          mangle: false,
          noSource: true,
        }),
      );
    else stream = stream.pipe(tabify(4, false));
    return stream.pipe(gulp.dest((output || DIST) + SOURCE));
  };
}

exports.step_buildSourceDev = buildSource(false);
exports.step_buildSource = buildSource(false);
exports.step_buildSourceMin = buildSource(false, false, true);

/**
 * Run TypeScript type checking without emitting files
 */
function typeCheck() {
  return () => {
    const tsProject = ts.createProject("tsconfig.json", { noEmit: true });
    return gulp.src(SOURCE + GLOB)
      .pipe(tsProject(ts.reporter.defaultReporter()))
      .on("error", (error) => {
        console.error("TypeScript type check failed");
      });
  };
}

exports.step_typeCheck = typeCheck();

/**
 * Build source using esbuild - bundles all TypeScript into a single file
 * @param {Boolean} minifySources Minify the output
 * @param {String} output Output directory (defaults to DIST)
 */
function buildSourceEsbuild(minifySources = false, output = null) {
  return async () => {
    const outdir = output || DIST;
    await esbuild.build({
      entryPoints: ["src/midi-qol.ts"],
      bundle: true,
      format: "esm",
      outfile: path.join(outdir, "midi-qol.js"),
      sourcemap: true,
      sourcesContent: true,
      minify: minifySources,
      keepNames: true, // Preserve class/function names for debugging (workflow logging)
      target: "es2022",
      platform: "browser",
      logLevel: "info",
    });

    // Fix source map paths to show nicely in browser DevTools
    // Clean paths so files appear under modules/midi-qol/src/...
    const jsFile = path.join(outdir, "midi-qol.js");
    const mapFile = path.join(outdir, "midi-qol.js.map");
    const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
    delete map.sourceRoot;
    // Normalize all paths to just src/... (match last occurrence)
    map.sources = map.sources.map(s => {
      // Find the src/ that's followed by module/ or midi-qol.ts
      const match = s.match(/src\/(module\/|midi-qol\.ts).*$/);
      return match ? "src/" + match[0].substring(4) : s;
    });
    fs.writeFileSync(mapFile, JSON.stringify(map));

    // Ensure sourceMappingURL is present
    let js = fs.readFileSync(jsFile, "utf8");
    if (!js.includes("sourceMappingURL")) {
      js += "\n//# sourceMappingURL=midi-qol.js.map\n";
      fs.writeFileSync(jsFile, js);
    }
  };
}

/**
 * Combined type check + esbuild bundle
 */
function buildWithTypeCheck(minifySources = false, output = null) {
  return gulp.series(typeCheck(), buildSourceEsbuild(minifySources, output));
}

exports.step_buildSourceEsbuild = buildSourceEsbuild(false);
exports.step_buildSourceEsbuildMin = buildSourceEsbuild(true);
exports.step_buildWithTypeCheck = buildWithTypeCheck(false);

/**
 * Builds the module manifest based on the package, sources, and css.
 * @param {Boolean} bundled If true, use single bundled file path
 */
function buildManifest(output = null, bundled = false) {
  const files = []; // Collector for all the file paths
  return (cb) =>
    gulp
      .src(PACKAGE.main) // collect the source files
      .pipe(rename({ extname: ".js" })) // rename their extensions to `.js`
      .pipe(gulp.src(CSS + GLOB)) // grab all the CSS files
      .on("data", (file) => files.push(path.relative(file.cwd, file.path))) // Collect all the file paths
      .on("end", () => {
        // output the filepaths to the module.json
        if (files.length == 0)
          throw Error("No files found in " + SOURCE + GLOB + " or " + CSS + GLOB);
        // Use bundled single file or original multi-file paths
        const js = bundled ? ["midi-qol.js"] : files.filter((e) => e.endsWith("js"));
        const css = files.filter((e) => e.endsWith("css"));
        fs.readFile("module.json", (err, data) => {
          const module = data
            .toString() // Inject the data into the module.json
            .replaceAll("{{name}}", PACKAGE.name)
            .replaceAll("{{title}}", PACKAGE.title)
            .replaceAll("{{version}}", PACKAGE.version)
            .replaceAll("{{description}}", PACKAGE.description)
            .replace('"{{sources}}"', stringify(js, null, "\t").replaceAll("\n", "\n\t"))
            .replace('"{{css}}"', stringify(css, null, "\t").replaceAll("\n", "\n\t"));
          fs.writeFile((output || DIST) + "module.json", module, cb); // save the module to the distribution directory
        });
      });
}

exports.step_buildManifest = buildManifest();

function outputLanguages(output = null) {
  return () => gulp.src(LANG + GLOB).pipe(gulp.dest((output || DIST) + LANG));
}

function outputTemplates(output = null) {
  return () => gulp.src(TEMPLATES + GLOB).pipe(gulp.dest((output || DIST) + TEMPLATES));
}

function outputStylesCSS(output = null) {
  return () => gulp.src(CSS + GLOB).pipe(gulp.dest((output || DIST) + CSS));
}

function outputMetaFiles(output = null) {
  return () => gulp.src(["LICENSE", "README.md", "Changelog.md"]).pipe(gulp.dest(output || DIST));
}

function outputIconFiles(output = null) {
  return () => gulp.src(ICON + GLOB).pipe(gulp.dest((output || DIST) + ICON));
}

function outputPackFiles(output = null) {
  return () => gulp.src(PACK + GLOB).pipe(gulp.dest((output || DIST) + PACK));
}

function outputSoundFiles(output = null) {
  return () => gulp.src(SOUND + GLOB).pipe(gulp.dest((output || DIST) + SOUND));
}

function outputConfigFiles(output = null) {
  return () => gulp.src(CONFIG + GLOB).pipe(gulp.dest((output || DIST) + CONFIG));
}

/**
 * Copy files to module named directory and then compress that folder into a zip
 */
function compressDistribution() {
  return gulp.series(
    plog(foundryvttCli),
    // Copy files to folder with module's name
    () => gulp.src(DIST + GLOB).pipe(gulp.dest(DIST + `${PACKAGE.name}/${PACKAGE.name}`)),
    // Compress the new folder into a ZIP and save it to the `bundle` folder
    () =>
      gulp
        .src(DIST + PACKAGE.name + "/" + GLOB)
        .pipe(zip(PACKAGE.name + `-v` + PACKAGE.version + ".zip"))
        .pipe(gulp.dest(BUNDLE)),
    // Copy the module.json to the bundle directory
    () => gulp.src(DIST + "/module.json").pipe(gulp.dest(BUNDLE)),
    // Cleanup by deleting the intermediate module named folder
    pdel(DIST + PACKAGE.name)
  );
}

exports.step_compressDistribution = compressDistribution();

/**
 * Simple clean command
 */
exports.clean = pdel([DIST, BUNDLE]);
exports.devClean = pdel([DEV_DIST()]);

/**
 * Strip ID suffixes from folder directory names created by extractPack.
 * extractPack generates "Name_ID" directories; this renames them to just "Name".
 * Processes directories bottom-up so child renames happen before parent renames.
 */
function cleanPackFolderNames(packSrcDir) {
  const entries = fs.readdirSync(packSrcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(packSrcDir, entry.name);
    // Recurse into subdirectories first (bottom-up)
    cleanPackFolderNames(fullPath);
    // Check if directory contains _Folder.json — if so, it's a pack folder
    const folderJsonPath = path.join(fullPath, "_Folder.json");
    if (!fs.existsSync(folderJsonPath)) continue;
    const folderData = JSON.parse(fs.readFileSync(folderJsonPath, "utf8"));
    // Use the folder name from _Folder.json, replacing spaces with underscores to avoid path issues
    const cleanName = folderData.name.replace(/ /g, " ");
    if (cleanName !== entry.name) {
      const newPath = path.join(packSrcDir, cleanName);
      fs.renameSync(fullPath, newPath);
      console.log(`Renamed: ${entry.name} -> ${cleanName}`);
    }
  }
}

/**
 * Extract packs: packs/ -> pack-src/ (LevelDB to JSON)
 */
exports.extractPacks = gulp.series(
  pdel(["pack-src/sampleitems", "pack-src/activeeffects"]),
  async () => {
    if (!foundryvttCli) foundryvttCli = await import("@foundryvtt/foundryvtt-cli");
    await foundryvttCli.extractPack("packs/sampleitems", "pack-src/sampleitems", { folders: true });
    cleanPackFolderNames("pack-src/sampleitems");
    plog("Extracted packs/sampleitems to pack-src/sampleitems");
    if (fs.existsSync("packs/activeeffects")) {
      await foundryvttCli.extractPack("packs/activeeffects", "pack-src/activeeffects", { folders: true });
      cleanPackFolderNames("pack-src/activeeffects");
      plog("Extracted packs/activeeffects to pack-src/activeeffects");
    }
  }
);

/**
 * Generate a random Foundry-style ID (16 alphanumeric characters)
 */
function generateFoundryId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Process pack-src JSON files to ensure they have _id and _key
 * Also handles embedded documents (effects, activities)
 * Recursively scans subdirectories for nested folder structures.
 */
function setCPRInfo(item, source, version) {
  item.flags["chris-premades"] ??= {};
  item.flags["chris-premades"].info = { ...item.flags["chris-premades"].info, source, version };
}

/**
 * pack-src files that differ from the last release (the newest tag of midi's major.minor reachable from HEAD), or are
 * new. Undefined, with a warning, when git can't tell: then only missing versions are set.
 */
function changedSinceRelease(packSrcDir) {
  const { execFileSync } = require("child_process");
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
  const [major, minor] = PACKAGE.version.split(".");
  try {
    const [release] = git("describe", "--tags", "--abbrev=0", "--match", `v${major}.${minor}.*`);
    // Paths relative to the working directory, as ensurePackIds compares them.
    const files = [...git("diff", "--name-only", "--relative", release, "--", packSrcDir), ...git("ls-files", "--others", "--exclude-standard", "--", packSrcDir)];
    plog(`CAT versions: ${files.length} file(s) in ${packSrcDir} changed since ${release}`);
    return new Set(files);
  } catch (err) {
    console.warn(`CAT versions: no release to compare ${packSrcDir} with (${err.message.split("\n")[0]}); only missing versions are set`);
  }
}

async function ensurePackIds(packSrcDir, { documentType = "Item", compendiumSource = "midi-qol.midiqol-sample-items" } = {}) {
  let modified = 0;
  const midiVersion = PACKAGE.version;
  const keyPrefix = documentType === "Item" ? "items" : "effects";

  const changedFiles = changedSinceRelease(packSrcDir);

  function processDirectory(dir, folderId) {
    // Check if this directory has a _Folder.json to determine its folder ID
    const folderJsonPath = path.join(dir, "_Folder.json");
    if (fs.existsSync(folderJsonPath)) {
      const folderData = JSON.parse(fs.readFileSync(folderJsonPath, "utf8"));
      folderId = folderData._id || null;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        processDirectory(fullPath, folderId);
      } else if (entry.name.endsWith(".json") && entry.name !== "_Folder.json") {
        const content = fs.readFileSync(fullPath, "utf8");
        const item = JSON.parse(content);
        let changed = false;

        // Generate _id if missing
        if (!item._id) {
          item._id = generateFoundryId();
          changed = true;
          console.log(`Generated _id for ${entry.name}: ${item._id}`);
        }

        // Generate or fix _key if missing/wrong
        const expectedKey = `!${keyPrefix}!${item._id}`;
        if (!item._key || item._key !== expectedKey) {
          item._key = expectedKey;
          changed = true;
          console.log(`Set _key for ${entry.name}: ${item._key}`);
        }

        // Set folder from directory structure
        const expectedFolder = folderId || null;
        if (item.folder !== expectedFolder) {
          console.log(`Set folder for ${entry.name}: ${item.folder || "null"} -> ${expectedFolder || "null"}`);
          item.folder = expectedFolder;
          changed = true;
        }

        // Handle embedded effects
        if (Array.isArray(item.effects)) {
          for (const effect of item.effects) {
            if (!effect._id) {
              effect._id = generateFoundryId();
              changed = true;
            }
            const effectKey = `!${keyPrefix}.effects!${item._id}.${effect._id}`;
            if (!effect._key || effect._key !== effectKey) {
              effect._key = effectKey;
              changed = true;
            }
          }
        }

        // Handle embedded activities (dnd5e 5.x)
        if (item.system?.activities && typeof item.system.activities === "object") {
          for (const [actId, activity] of Object.entries(item.system.activities)) {
            if (activity && typeof activity === "object") {
              if (!activity._id) {
                activity._id = actId; // Use the key as ID if missing
                changed = true;
              }
            }
          }
        }

        // CAT's automation version: set when missing, midi's version when the file changed since the last release
        // (bumped when package.json is). Only items marked as automations (flags.cat.automation); demos and legacy
        // copies carry none.
        // flags.chris-premades.info.version is kept in step: CAT 0.0.8 reads it when it re-registers midi's pack.
        const automation = item.flags?.cat?.automation;
        if (automation && typeof automation === "object") {
          const changedSinceRelease = changedFiles?.has(path.relative(process.cwd(), fullPath)) ?? false;
          if ((!automation.version || changedSinceRelease) && automation.version !== midiVersion) {
            console.log(`CAT version updated for ${entry.name}: ${automation.version || "none"} -> ${midiVersion}`);
            automation.version = midiVersion;
            changed = true;
          }
          const info = item.flags["chris-premades"]?.info;
          if (info?.source !== compendiumSource || info?.version !== automation.version) {
            setCPRInfo(item, compendiumSource, automation.version);
            changed = true;
          }
        }

        if (changed) {
          fs.writeFileSync(fullPath, JSON.stringify(item, null, 2));
          modified++;
        }
      }
    }
  }

  // Ensure _Folder.json files have correct _id, _key, and parent folder from directory nesting
  function ensureFolderIds(dir, parentFolderId) {
    const folderJsonPath = path.join(dir, "_Folder.json");
    let currentFolderId = parentFolderId;

    if (!fs.existsSync(folderJsonPath) && dir !== packSrcDir) {
      // Auto-create _Folder.json for subdirectories that don't have one
      const folderId = generateFoundryId();
      const folder = {
        name: path.basename(dir),
        sorting: "a",
        folder: parentFolderId || null,
        type: documentType,
        _id: folderId,
        _key: `!folders!${folderId}`
      };
      fs.writeFileSync(folderJsonPath, JSON.stringify(folder, null, 2));
      console.log(`Auto-created _Folder.json for ${path.basename(dir)} (${folderId})`);
      modified++;
      currentFolderId = folderId;
    } else if (fs.existsSync(folderJsonPath)) {
      const content = fs.readFileSync(folderJsonPath, "utf8");
      const folder = JSON.parse(content);
      let changed = false;

      if (!folder._id) {
        folder._id = generateFoundryId();
        changed = true;
        console.log(`Generated _id for _Folder.json in ${dir}: ${folder._id}`);
      }
      const expectedKey = `!folders!${folder._id}`;
      if (!folder._key || folder._key !== expectedKey) {
        folder._key = expectedKey;
        changed = true;
      }
      // Set parent folder from directory nesting
      const expectedParent = parentFolderId || null;
      if (folder.folder !== expectedParent) {
        console.log(`Set parent folder for ${folder.name}: ${folder.folder || "null"} -> ${expectedParent || "null"}`);
        folder.folder = expectedParent;
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(folderJsonPath, JSON.stringify(folder, null, 2));
        modified++;
      }
      currentFolderId = folder._id;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        ensureFolderIds(path.join(dir, entry.name), currentFolderId);
      }
    }
  }

  // First pass: ensure all folder IDs exist and parent folders are correct (items reference them)
  ensureFolderIds(packSrcDir, null);
  // Second pass: process items and set folder from directory structure
  processDirectory(packSrcDir, null);

  if (modified > 0) {
    console.log(`Updated ${modified} file(s) with generated IDs`);
  }
}

/**
 * Compile packs: pack-src/ -> packs/ (JSON to LevelDB)
 */
exports.compilePacks = gulp.series(
  pdel(["packs/sampleitems", "packs/activeeffects"]),
  async () => {
    if (!foundryvttCli) foundryvttCli = await import("@foundryvtt/foundryvtt-cli");

    await ensurePackIds("pack-src/sampleitems");
    await foundryvttCli.compilePack("pack-src/sampleitems", "packs/sampleitems", { recursive: true });
    plog("Compiled pack-src/sampleitems to packs/sampleitems");

    await ensurePackIds("pack-src/activeeffects", { documentType: "ActiveEffect", compendiumSource: "midi-qol.midiqol-active-effects" });
    await foundryvttCli.compilePack("pack-src/activeeffects", "packs/activeeffects", { recursive: true });
    plog("Compiled pack-src/activeeffects to packs/activeeffects");
  },
  pdel([DEV_DIST() + PACK + GLOB], { force: true }),
  outputPackFiles(DEV_DIST()),
);
/**
 * Create a symlink from dist/pack-src -> ../pack-src so the in-game
 * "Import Sample Items" macro can find the JSON source files.
 */
function createPackSrcSymlink(output = null) {
  return (cb) => {
    const target = (output || DIST) + "pack-src";
    if (!fs.existsSync(target)) {
      fs.symlinkSync("../pack-src", target);
    }
    cb();
  };
}

/**
 * Default Build operation (uses esbuild for single bundled file, with type checking)
 */
exports.default = gulp.series(
  pdel([DIST]),
  typeCheck(),
  gulp.parallel(
    buildSourceEsbuild(false, DIST),
    buildManifest(null, true),
    outputLanguages(),
    outputTemplates(),
    outputStylesCSS(),
    outputMetaFiles(),
    outputIconFiles(),
    outputPackFiles(),
    outputSoundFiles(),
    outputConfigFiles(),
  ),
  createPackSrcSymlink(),
);
/**
 * Extends the default build task by copying the result to the Development Environment
 */
exports.dev = gulp.series(
  pdel([DEV_DIST() + GLOB], { force: true }),
  typeCheck(),
  gulp.parallel(
    buildSourceEsbuild(false, DEV_DIST()),
    buildManifest(DEV_DIST(), true),
    outputLanguages(DEV_DIST()),
    outputTemplates(DEV_DIST()),
    outputStylesCSS(DEV_DIST()),
    outputMetaFiles(DEV_DIST()),
    outputIconFiles(DEV_DIST()),
    outputPackFiles(DEV_DIST()),
    outputSoundFiles(DEV_DIST()),
    outputConfigFiles(DEV_DIST()),
  ),
);
/**
 * Performs a default build and then zips the result into a bundle
 */
exports.zip = gulp.series(
  pdel([DIST]),
  typeCheck(),
  gulp.parallel(
    buildSourceEsbuild(false, DIST), // Don't minify - preserves private field names for debugging
    buildManifest(null, true),
    outputLanguages(),
    outputTemplates(),
    outputStylesCSS(),
    outputMetaFiles(),
    outputIconFiles(),
    outputPackFiles(),
    outputSoundFiles(),
    outputConfigFiles(),
  ),
  compressDistribution(),
  pdel([DIST]),
);
/**
 * Sets up a file watch on the project to detect any file changes and automatically rebuild those components.
 */
exports.watch = function () {
  exports.default();
  gulp.watch(SOURCE + GLOB, buildSourceEsbuild(false, DIST));
  gulp.watch([CSS + GLOB, "module.json", "package.json"], buildManifest(null, true));
  gulp.watch(LANG + GLOB, gulp.series(pdel(DIST + LANG), outputLanguages()));
  gulp.watch(TEMPLATES + GLOB, gulp.series(pdel(DIST + TEMPLATES), outputTemplates()));
  gulp.watch(CSS + GLOB, gulp.series(pdel(DIST + CSS), outputStylesCSS()));
  gulp.watch(["LICENSE", "README.md", "Changelog.md"], outputMetaFiles());
  gulp.watch(ICON + GLOB, gulp.series(pdel(DIST + ICON), outputIconFiles()));
  gulp.watch(PACK + GLOB, gulp.series(pdel(DIST + PACK), outputPackFiles()));
  gulp.watch(SOUND + GLOB, gulp.series(pdel(DIST + SOUND), outputSoundFiles()));
  gulp.watch(CONFIG + GLOB, gulp.series(pdel(DIST + CONFIG), outputConfigFiles()));
};
/**
 * Sets up a file watch on the project to detect any file changes and automatically rebuild those components, and then copy them to the Development Environment.
 */
exports.devWatch = function () {
  const devDist = DEV_DIST();
  exports.dev();
  gulp.watch(
    SOURCE + GLOB,
    gulp.series(
      plog("rebuilding with esbuild..."),
      buildSourceEsbuild(false, devDist),
      plog("sources done."),
    ),
  );
  gulp.watch(
    [CSS + GLOB, "module.json", "package.json"],
    gulp.series(reloadPackage, buildManifest(devDist, true), plog("manifest done.")),
  );
  gulp.watch(
    LANG + GLOB,
    gulp.series(
      pdel(devDist + LANG + GLOB, { force: true }),
      outputLanguages(devDist),
      plog("langs done."),
    ),
  );
  gulp.watch(
    TEMPLATES + GLOB,
    gulp.series(
      pdel(devDist + TEMPLATES + GLOB, { force: true }),
      outputTemplates(devDist),
      plog("templates done."),
    ),
  );
  gulp.watch(
    CSS + GLOB,
    gulp.series(
      pdel(devDist + CSS + GLOB, { force: true }),
      outputStylesCSS(devDist),
      plog("css done."),
    ),
  );
  gulp.watch(
    ["LICENSE", "README.md", "CHANGELOG.md"],
    gulp.series(outputMetaFiles(devDist), plog("metas done.")),
  );
  gulp.watch(
    ICON + GLOB,
    gulp.series(
      pdel(devDist + ICON + GLOB, { force: true }),
      outputIconFiles(devDist),
      plog("icon done."),
    ),
  );
  gulp.watch(
    PACK + GLOB,
    gulp.series(
      pdel(devDist + PACK + GLOB, { force: true }),
      outputPackFiles(devDist),
      plog("packs done."),
    ),
  );
  gulp.watch(
    SOUND + GLOB,
    gulp.series(
      pdel(devDist + SOUND + GLOB, { force: true }),
      outputSoundFiles(devDist),
      plog("sounds done."),
    ),
  );
  gulp.watch(
    CONFIG + GLOB,
    gulp.series(
      pdel(devDist + CONFIG + GLOB, { force: true }),
      outputConfigFiles(devDist),
      plog("config done."),
    ),
  );
};
