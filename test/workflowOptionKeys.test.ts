import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIDI_OPTION_KEYS } from "../src/module/lib/workflowOptionsCodec.js";

// A WorkflowOptions key missing from midi's list is stored with a warning that blames "a module" (2026-11-21:
// choices, fixedDice, preview)
describe("midi's workflow option keys", () => {
  it("every WorkflowOptions key is one of midi's", () => {
    const source = readFileSync("src/module/Workflow.ts", "utf8");
    const start = source.search(/export (?:type|interface) WorkflowOptions[^{]*\{/);
    expect(start).toBeGreaterThan(-1);
    const from = source.indexOf("{", start) + 1;
    let depth = 1;
    let i = from;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
    }
    const body = source.slice(from, i);
    const keys = [...body.matchAll(/^ {2}(?:readonly\s+)?([A-Za-z]+)\??:/gm)].map(m => m[1]);
    expect(keys.length).toBeGreaterThan(10);
    expect(keys.filter(key => !MIDI_OPTION_KEYS.has(key))).toEqual([]);
  });
});
