import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * midi's rules are pure functions (flanking geometry, range, damage arithmetic...): data in, answers out, so they can be
 * tested here. They live in src/module/rules (shared by several features) and in each feature's rules.ts
 * (src/module/services/<feature>/rules.ts), and must not reach Foundry, dnd5e or the canvas themselves.
 */
const RULES = "src/module/rules";
const SERVICES = "src/module/services";
const FORBIDDEN = /\b(game|canvas|Hooks|ui|CONFIG|foundry|fromUuid|fromUuidSync|ChatMessage|libWrapper|socketlib)\s*[.(]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
  });
}

function rulesFiles(): string[] {
  const shared = existsSync(RULES) ? files(RULES) : [];
  const features = existsSync(SERVICES) ? files(SERVICES).filter(path => path.endsWith("/rules.ts")) : [];
  return [...shared, ...features];
}

describe("rules are pure", () => {
  it("finds the rules files", () => {
    expect(rulesFiles().length).toBeGreaterThan(3);
  });

  it("no rules file uses a Foundry global", () => {
    const offenders = rulesFiles().flatMap(path => readFileSync(path, "utf8").split("\n")
      .map((line, i) => ({ path, line: i + 1, text: line.replace(/\/\/.*$/, "") }))
      .filter(({ text }) => FORBIDDEN.test(text)));
    expect(offenders).toEqual([]);
  });
});
