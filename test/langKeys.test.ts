import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A key written twice in en.json keeps only its last text: a second meaning silently replaces the first (2026-11-26:
// Entries.Field.rollAs, the roll action's name and the use action's roll-as)
describe("en.json keys", () => {
  it("no key has two different texts", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const line of readFileSync("lang/en.json", "utf8").split("\n")) {
      const m = /^\s*"((?:[^"\\]|\\.)+)":\s*("(?:[^"\\]|\\.)*")/.exec(line);
      if (!m) continue;
      const [, key, value] = m;
      if (seen.has(key) && seen.get(key) !== value) clashes.push(key);
      seen.set(key, value);
    }
    expect(clashes).toEqual([]);
  });
});
