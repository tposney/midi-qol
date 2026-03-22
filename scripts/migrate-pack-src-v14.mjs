#!/usr/bin/env node
/**
 * Migrate midi-qol pack-src JSON files from v13 ActiveEffect schema to v14.
 *
 * Transformations:
 * 1. Move effect `changes[]` to `system.changes[]`
 * 2. Convert numeric `mode` to string `type`
 * 3. Convert `duration.seconds/rounds/turns` to `duration.value` + `duration.units`
 * 4. Move `duration.startTime/startRound/startTurn/combat` to `start.*`
 * 5. Remove deprecated `tint` field if it's the default "#ffffff"
 *
 * Usage: node scripts/migrate-pack-src-v14.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const PACK_SRC = join(import.meta.dirname, "..", "pack-src", "sampleitems");
const DRY_RUN = process.argv.includes("--dry-run");

const MODES_TO_TYPES = {
  0: "custom",
  1: "multiply",
  2: "add",
  3: "downgrade",
  4: "upgrade",
  5: "override"
};

let filesProcessed = 0;
let filesChanged = 0;
let effectsMigrated = 0;

function collectJsonFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectJsonFiles(fullPath));
    } else if (entry.endsWith(".json") && entry !== "_Folder.json") {
      results.push(fullPath);
    }
  }
  return results;
}

function migrateEffect(effect, itemName) {
  let changed = false;

  // 1. Move changes to system.changes and convert mode -> type
  if (Array.isArray(effect.changes)) {
    const migratedChanges = effect.changes.map(change => {
      const newChange = { ...change };
      // Convert numeric mode to string type
      if (typeof newChange.mode === "number" && !Object.hasOwn(newChange, "type")) {
        newChange.type = MODES_TO_TYPES[newChange.mode] ?? `custom.${newChange.mode}`;
        delete newChange.mode;
      }
      return newChange;
    });

    effect.system = effect.system ?? {};
    effect.system.changes = migratedChanges;
    delete effect.changes;
    changed = true;
  }

  // 2. Migrate duration fields
  if (effect.duration && typeof effect.duration === "object") {
    const dur = effect.duration;
    const newDuration = {};
    let hasNewDuration = false;

    // Convert seconds/rounds/turns to value + units (priority: rounds > turns > seconds, matching v14)
    for (const unit of ["rounds", "turns", "seconds"]) {
      if (typeof dur[unit] === "number") {
        newDuration.value = dur[unit];
        newDuration.units = unit;
        hasNewDuration = true;
        break;
      }
    }

    // Keep any existing non-legacy duration fields
    if (dur.expiry !== undefined) newDuration.expiry = dur.expiry;
    if (dur.expired !== undefined) newDuration.expired = dur.expired;

    // If no numeric duration was found, keep value/units if they exist
    if (!hasNewDuration) {
      if (dur.value !== undefined) newDuration.value = dur.value;
      if (dur.units !== undefined) newDuration.units = dur.units;
    }

    // 3. Move start data out of duration
    const hasStartData = ["startTime", "startRound", "startTurn", "combat"].some(
      k => dur[k] !== undefined
    );

    if (hasStartData) {
      // Only create start object if there's meaningful data (at least one non-null)
      const hasNonNullStart = [dur.startTime, dur.startRound, dur.startTurn, dur.combat].some(
        v => v !== null && v !== undefined
      );

      if (hasNonNullStart) {
        effect.start = {};
        if (dur.startTime !== undefined) effect.start.time = dur.startTime;
        if (dur.startRound !== undefined) effect.start.round = dur.startRound;
        if (dur.startTurn !== undefined) effect.start.turn = dur.startTurn;
        if (dur.combat !== undefined) effect.start.combat = dur.combat;
      }
      changed = true;
    }

    // Replace duration object (only if we actually had legacy fields to clean)
    const hadLegacyFields = ["seconds", "rounds", "turns", "startTime", "startRound", "startTurn", "combat"].some(
      k => Object.hasOwn(dur, k)
    );
    if (hadLegacyFields) {
      effect.duration = Object.keys(newDuration).length > 0 ? newDuration : {};
      changed = true;
    }
  }

  // 4. Remove default tint
  if (effect.tint === "#ffffff") {
    delete effect.tint;
    changed = true;
  }

  if (changed) effectsMigrated++;
  return changed;
}

function migrateFile(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const item = JSON.parse(raw);
  let changed = false;

  if (Array.isArray(item.effects)) {
    for (const effect of item.effects) {
      if (migrateEffect(effect, item.name)) {
        changed = true;
      }
    }
  }

  if (changed) {
    filesChanged++;
    const rel = relative(PACK_SRC, filePath);
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would update: ${rel}`);
    } else {
      writeFileSync(filePath, JSON.stringify(item, null, 2) + "\n", "utf-8");
      console.log(`Updated: ${rel}`);
    }
  }

  filesProcessed++;
}

// Main
console.log(`Migrating pack-src to v14 ActiveEffect schema${DRY_RUN ? " (DRY RUN)" : ""}...`);
console.log(`Source: ${PACK_SRC}\n`);

const files = collectJsonFiles(PACK_SRC);
for (const file of files) {
  migrateFile(file);
}

console.log(`\nDone. ${filesProcessed} files processed, ${filesChanged} files changed, ${effectsMigrated} effects migrated.`);
if (DRY_RUN) console.log("(No files were actually written — re-run without --dry-run to apply)");
