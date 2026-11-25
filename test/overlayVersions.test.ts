import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * A shipped overlay names its version: an overlay's data part (what it adds to an item, the fields it changes) is
 * replaced on the world's items only when the version changes, and a compiled pack has no modified time to fall back on.
 */
function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? jsonFiles(path) : name.endsWith(".json") ? [path] : [];
  });
}

describe("shipped overlays", () => {
  it("each has a version", () => {
    const missing: string[] = [];
    let overlays = 0;
    for (const file of jsonFiles("pack-src/overlays")) {
      const overlay = JSON.parse(readFileSync(file, "utf8"))?.flags?.["midi-qol"]?.overlay;
      if (!overlay?.identifier) continue;
      overlays++;
      if (!overlay.version) missing.push(file);
    }
    expect(overlays).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("are in the overlays pack, never the sample items, and say so in their name", () => {
    const misplaced: string[] = [];
    const unnamed: string[] = [];
    for (const file of jsonFiles("pack-src/sampleitems")) {
      if (JSON.parse(readFileSync(file, "utf8"))?.flags?.["midi-qol"]?.overlay?.identifier) misplaced.push(file);
    }
    for (const file of jsonFiles("pack-src/overlays")) {
      const item = JSON.parse(readFileSync(file, "utf8"));
      if (item?.flags?.["midi-qol"]?.overlay?.identifier && !/\(overlay\)$/.test(item.name ?? "")) unnamed.push(file);
    }
    expect(misplaced).toEqual([]);
    expect(unnamed).toEqual([]);
  });
});
