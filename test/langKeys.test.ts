import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A key written twice in en.json keeps only its last text: a second meaning silently replaces the first (2026-11-26:
// Entries.Field.rollAs, the roll action's name and the use action's roll-as)
describe("en.json keys", () => {
  it("no key has two different texts", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    const stack: string[] = [];
    for (const line of readFileSync("lang/en.json", "utf8").split("\n")) {
      const open = /^\s*"((?:[^"\\]|\\.)+)":\s*\{\s*(\},?)?\s*$/.exec(line);
      if (open) { if (!open[2]) stack.push(open[1]); continue; }
      const m = /^\s*"((?:[^"\\]|\\.)+)":\s*("(?:[^"\\]|\\.)*")/.exec(line);
      if (m) {
        const key = [...stack, m[1]].join(".");
        if (seen.has(key) && seen.get(key) !== m[2]) clashes.push(key);
        seen.set(key, m[2]);
        continue;
      }
      if (/^\s*\},?\s*$/.test(line) && stack.length) stack.pop();
    }
    expect(seen.size).toBeGreaterThan(1000);
    expect(clashes).toEqual([]);
  });
});
