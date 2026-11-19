import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * M5: midi's steps are data. Every built-in step (steps/steps.ts BUILT_IN) has its own implementation in
 * workflowSteps/ (setStepRun), and no class writes a WorkflowState_<name> method: those are generated forwarders.
 */
const STEPS = readFileSync("src/module/steps/steps.ts", "utf8");
const WORKFLOW = readFileSync("src/module/Workflow.ts", "utf8");
const DIR = "src/module/workflowSteps";
const BODIES = readdirSync(DIR).filter(name => name.endsWith(".ts")).map(name => readFileSync(join(DIR, name), "utf8")).join("\n");

function builtIn(): string[] {
  const list = STEPS.match(/const BUILT_IN[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
  return [...list.matchAll(/(?:^|[[,]\s*)\[?\s*"([A-Za-z]+)"/g)].map(m => m[1]);
}

describe("midi's steps as data", () => {
  it("lists the built-in steps", () => {
    expect(builtIn()).toContain("WaitForSaves");
    expect(builtIn().length).toBeGreaterThan(20);
  });

  it("every built-in step has its own run in workflowSteps/", () => {
    const missing = builtIn().filter(name => !BODIES.includes(`setStepRun("midi-qol.${name}"`));
    expect(missing).toEqual([]);
  });

  it("no workflow class writes a WorkflowState_ method", () => {
    const methods = [...WORKFLOW.matchAll(/^\s+(?:override\s+)?(?:async\s+)?(WorkflowState_[A-Za-z]+)\s*\(/gm)].map(m => m[1]);
    expect(methods).toEqual([]);
  });
});
