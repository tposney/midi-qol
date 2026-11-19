import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MIDI_SETTINGS } from "../src/module/lib/settingsTable.js";

// M4a: every field of midi's stored ConfigSettings is declared once (lib/settingsTable.ts), and nothing declared is gone
const source = readFileSync(new URL("../src/module/settings.ts", import.meta.url), "utf8");
const body = source.slice(source.indexOf("class ConfigSettings {"), source.indexOf("\n}\n", source.indexOf("class ConfigSettings {")));
const fields = [...body.matchAll(/^  ([a-zA-Z]\w*)\s*[:=?!]/gm)].map(m => m[1]).filter(f => f !== "optionalRules");
const rules = body.match(/optionalRules[^=]*=\s*\{([\s\S]*?)\n  \};/)?.[1] ?? "";
const ruleKeys = [...rules.matchAll(/^\s{4}([a-zA-Z]\w*)\s*:/gm)].map(m => `optionalRules.${m[1]}`);
const configKeys = [...fields, ...ruleKeys];

describe("settings registry (M4a)", () => {
  it("finds the config fields", () => {
    expect(fields.length).toBeGreaterThan(100);
    expect(ruleKeys.length).toBeGreaterThan(20);
  });
  it("every ConfigSettings field has a declaration", () => {
    expect(configKeys.filter(key => !(key in MIDI_SETTINGS))).toEqual([]);
  });
  it("every declaration is a ConfigSettings field", () => {
    expect(Object.keys(MIDI_SETTINGS).filter(key => !configKeys.includes(key))).toEqual([]);
  });
  it("every declaration has a group", () => {
    expect(Object.entries(MIDI_SETTINGS).filter(([, entry]) => !entry.group).map(([key]) => key)).toEqual([]);
  });
});
