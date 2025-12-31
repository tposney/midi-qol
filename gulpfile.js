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
    return gulp.src(SOURCE + GLOB)
      .pipe(ts.createProject("tsconfig.json", { noEmit: true })())
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
    pdel(DIST + PACKAGE.name),
    async () => { await foundryvttCli.extractPack("packs/sampleitems", "pack-src/sampleitems");
  }
  );
}

exports.step_compressDistribution = compressDistribution();

/**
 * Simple clean command
 */
exports.clean = pdel([DIST, BUNDLE]);
exports.devClean = pdel([DEV_DIST()]);
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
    buildSourceEsbuild(true, DIST),
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
