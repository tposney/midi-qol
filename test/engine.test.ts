import { describe, expect, it } from "vitest";
import { ABORT, COMPLETED, CONTINUE, FINISHED, runSteps, SUSPEND, type EngineHost } from "../src/module/steps/engine.js";
import { assembleSteps, stepAfterInFlow, type StepChange } from "../src/module/steps/assembly.js";

/** A host whose steps return scripted next steps; it logs passes, hooks and runs in order. */
function host(script: Record<string, string | undefined | ((h: FakeHost) => string | undefined)>, options: Partial<{ hooks: Record<string, boolean>, limit: number, pending: Record<string, string>, changes: StepChange[], flow: string[] }> = {}) {
  const assembled = assembleSteps(options.changes ?? []);
  const h: FakeHost = {
    log: [], currentStep: undefined, aborted: false, outcome: "ok", suspended: false, transitions: 0,
    cancelled() { h.outcome = "cancelled"; },
    async pass(prePost, step) { h.log.push(`pass:${prePost}${step}`); },
    async hook(prePost, step) { h.log.push(`hook:${prePost}${step}`); return options.hooks?.[`${prePost}${step}`]; },
    async run(step) {
      h.log.push(`run:${step}`);
      const next = script[step!];
      return typeof next === "function" ? next(h) : next;
    },
    async stepEnded() { },
    pendingNext(step) { const next = options.pending?.[step!]; if (options.pending) delete options.pending[step!]; return next; },
    countTransition() { return h.transitions++ < (options.limit ?? 250); },
    async tick() { },
    report(message) { h.log.push(`report:${message}`); },
    note() { },
    name(step) { return String(step); },
    changes(step) { return assembled.anchors[step]; },
    flowNext(step) { return stepAfterInFlow(options.flow ?? [], step); }
  };
  return h;
}
type FakeHost = EngineHost & { log: string[], aborted: boolean, outcome: string, transitions: number };

const runs = (h: FakeHost) => h.log.filter(l => l.startsWith("run:")).map(l => l.slice(4));

describe("runSteps", () => {
  it("runs each step, with post of the old and pre of the new on each move", async () => {
    const h = host({ A: "B", B: SUSPEND });
    expect(await runSteps(h, "A")).toBe("suspended");
    expect(h.log).toEqual(["pass:postundefined", "hook:postundefined", "pass:preA", "hook:preA", "run:A",
      "pass:postA", "hook:postA", "pass:preB", "hook:preB", "run:B"]);
    expect(h.currentStep).toBe("B");
    expect(h.suspended).toBe(true);
  });

  it("re-running the current step fires no passes or hooks", async () => {
    const h = host({ A: SUSPEND });
    h.currentStep = "A";
    await runSteps(h, "A");
    expect(h.log).toEqual(["run:A"]);
  });

  it("a pre hook returning false cancels: on to RollFinished, outcome cancelled", async () => {
    const h = host({ A: "B", [FINISHED]: SUSPEND }, { hooks: { preB: false } });
    await runSteps(h, "A");
    expect(runs(h)).toEqual(["A", FINISHED]);
    expect(h.outcome).toBe("cancelled");
  });

  it("a post hook returning false cancels the move it ends", async () => {
    const h = host({ A: "B", [FINISHED]: SUSPEND }, { hooks: { postA: false } });
    await runSteps(h, "A");
    expect(runs(h)).toEqual(["A", FINISHED]);
  });

  it("a step that sets the abort flag goes on to the step it returned, without post hooks (steps return Abort themselves)", async () => {
    const h = host({ A: hh => { hh.aborted = true; return "B"; }, B: SUSPEND });
    await runSteps(h, "A");
    expect(runs(h)).toEqual(["A", "B"]);
    expect(h.log).not.toContain("hook:postA");
  });

  it("the abort flag set by a pre pass or hook sends the move to Abort", async () => {
    const h = host({ A: "B", [ABORT]: "C", C: SUSPEND });
    const hook = h.hook;
    h.hook = async (prePost, step) => { if (prePost === "pre" && step === "B") h.aborted = true; return hook(prePost, step); };
    await runSteps(h, "A");
    expect(runs(h)).toEqual(["A", ABORT, "C"]);
  });

  it("an event that arrived while the step ran continues the run", async () => {
    const h = host({ A: SUSPEND, B: SUSPEND }, { pending: { A: "B" } });
    expect(await runSteps(h, "A")).toBe("suspended");
    expect(runs(h)).toEqual(["A", "B"]);
  });

  it("Completed's post hooks fire even when aborting", async () => {
    const h = host({ [COMPLETED]: "D", D: SUSPEND });
    h.currentStep = COMPLETED;
    h.aborted = true;
    await runSteps(h, "D");
    expect(h.log).toContain(`hook:post${COMPLETED}`);
  });

  it("an undefined next step is reported and suspends", async () => {
    const h = host({ A: undefined as unknown as string });
    expect(await runSteps(h, "A")).toBe("undefined");
    expect(h.suspended).toBe(true);
    expect(h.log.some(l => l.startsWith("report:"))).toBe(true);
  });

  it("stops at the transition limit", async () => {
    const h = host({ A: "B", B: "A" }, { limit: 5 });
    expect(await runSteps(h, "A")).toBe("limit");
    expect(runs(h)).toHaveLength(5);
  });
});

describe("runSteps with a use's changes", () => {
  it("inserted steps run between a step and the next, each with its own hooks", async () => {
    const h = host({ A: "B", "my.x": undefined, "my.y": CONTINUE, B: SUSPEND },
      { changes: [{ kind: "insert", step: "my.x", after: "A", layer: "global" }, { kind: "insert", step: "my.y", before: "B", layer: "call" }] });
    await runSteps(h, "A");
    expect(runs(h)).toEqual(["A", "my.x", "my.y", "B"]);
    expect(h.log).toContain("hook:premy.x");
    expect(h.log).toContain("hook:postmy.y");
    expect(h.move).toBeUndefined();
  });

  it("an inserted step that returns a step id branches", async () => {
    const h = host({ A: "B", "my.x": "C", B: SUSPEND, C: SUSPEND }, { changes: [{ kind: "insert", step: "my.x", after: "A", layer: "global" }] });
    await runSteps(h, "A");
    expect(runs(h)).toEqual(["A", "my.x", "C"]);
  });

  it("a removed step is passed over to the step after it in the flow", async () => {
    const h = host({ A: "B", C: SUSPEND }, { changes: [{ kind: "remove", target: "B", layer: "global" }], flow: ["A", "B", "C"] });
    await runSteps(h, "A");
    expect(runs(h)).toEqual(["A", "C"]);
  });

  it("an inserted step that suspends keeps the move: resumed, it goes on to the step the move was going to", async () => {
    let waited = false;
    const h = host({ A: "B", "my.wait": () => (waited ? undefined : (waited = true, SUSPEND)), B: SUSPEND },
      { changes: [{ kind: "insert", step: "my.wait", after: "A", layer: "global" }] });
    expect(await runSteps(h, "A")).toBe("suspended");
    expect(h.currentStep).toBe("my.wait");
    await runSteps(h, "my.wait");
    expect(runs(h)).toEqual(["A", "my.wait", "my.wait", "B"]);
  });
});
