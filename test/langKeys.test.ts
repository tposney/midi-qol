import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Foundry expands "a.b" keys into objects: a string at "a" beside "a.b" stops the module's whole file loading
// (2026-11-21: "midi-qol.RememberChoice" next to "midi-qol.RememberChoice.Hint" left every midi string as its key)
describe("lang files", () => {
  for (const file of readdirSync("lang").filter(name => name.endsWith(".json"))) {
    it(`${file}: no string key is the prefix of another key`, () => {
      const data = JSON.parse(readFileSync(`lang/${file}`, "utf8")) as Record<string, unknown>;
      const clashes: string[] = [];
      for (const key of Object.keys(data)) {
        const parts = key.split(".");
        for (let i = 1; i < parts.length; i++) {
          const prefix = parts.slice(0, i).join(".");
          if (typeof data[prefix] === "string") clashes.push(`${prefix} <- ${key}`);
        }
      }
      expect(clashes).toEqual([]);
    });
  }
});
