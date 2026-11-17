import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * src/module/rules holds midi's rules as pure functions (cover, flanking, range, the economy's legality...): data in,
 * answers out, so they can be tested here. They must not reach Foundry, dnd5e or the canvas themselves.
 */
const RULES = "src/module/rules";
const FORBIDDEN = /\b(game|canvas|Hooks|ui|CONFIG|foundry|fromUuid|fromUuidSync|ChatMessage|libWrapper|socketlib)\s*[.(]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe.skipIf(!existsSync(RULES))("rules are pure", () => {
  it("no rules file uses a Foundry global", () => {
    const offenders = files(RULES).flatMap(path => readFileSync(path, "utf8").split("\n")
      .map((line, i) => ({ path, line: i + 1, text: line.replace(/\/\/.*$/, "") }))
      .filter(({ text }) => FORBIDDEN.test(text)));
    expect(offenders).toEqual([]);
  });
});
