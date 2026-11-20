import { describe, expect, it, vi } from "vitest";
import { MomentDispatcher } from "../src/module/lib/turnMomentsCore.js";

type P = { moment: string, n?: number };
const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// M4 stage 1: the turn-moment dispatcher's ordering, isolation, cap and per-combat order
describe("MomentDispatcher (M4)", () => {
  it("runs a moment's handlers by priority, then registration order; off removes one", async () => {
    const d = new MomentDispatcher<P>();
    const seen: string[] = [];
    d.on("turnStart", "a", () => { seen.push("a"); });
    d.on("turnStart", "b", () => { seen.push("b"); }, { priority: 10 });
    const off = d.on("turnStart", "c", () => { seen.push("c"); });
    d.on("turnEnd", "x", () => { seen.push("x"); });
    expect(d.handlers("turnStart")).toEqual(["b", "a", "c"]);
    off();
    await d.dispatch("combat", { moment: "turnStart" });
    expect(seen).toEqual(["b", "a"]);
  });

  it("awaits each handler before the next", async () => {
    const d = new MomentDispatcher<P>();
    const seen: string[] = [];
    d.on("turnStart", "slow", async () => { await tick(20); seen.push("slow"); }, { priority: 1 });
    d.on("turnStart", "next", () => { seen.push("next"); });
    await d.dispatch("combat", { moment: "turnStart" });
    expect(seen).toEqual(["slow", "next"]);
  });

  it("a handler that throws is reported and the next still runs", async () => {
    const onError = vi.fn();
    const d = new MomentDispatcher<P>({ onError });
    const seen: string[] = [];
    d.on("turnStart", "bad", () => { throw new Error("boom"); }, { priority: 1 });
    d.on("turnStart", "async-bad", async () => { throw new Error("later"); }, { priority: 1 });
    d.on("turnStart", "good", () => { seen.push("good"); });
    await d.dispatch("combat", { moment: "turnStart" });
    expect(seen).toEqual(["good"]);
    expect(onError.mock.calls.map(call => call[0])).toEqual(["bad", "async-bad"]);
  });

  it("a handler slower than the cap is reported and left running; the next runs", async () => {
    const onSlow = vi.fn();
    const d = new MomentDispatcher<P>({ cap: 10, onSlow });
    const seen: string[] = [];
    d.on("turnStart", "stuck", async () => { await tick(60); seen.push("stuck"); }, { priority: 1 });
    d.on("turnStart", "next", () => { seen.push("next"); });
    await d.dispatch("combat", { moment: "turnStart" });
    expect(seen).toEqual(["next"]);
    expect(onSlow).toHaveBeenCalledWith("stuck", "turnStart", 10);
    await tick(80);
    expect(seen).toEqual(["next", "stuck"]);
  });

  it("a detached handler is started in its turn and not waited for; its failure is still reported", async () => {
    const onError = vi.fn();
    const onSlow = vi.fn();
    const d = new MomentDispatcher<P>({ cap: 10, onError, onSlow });
    const seen: string[] = [];
    d.on("turnStart", "first", () => { seen.push("first"); }, { priority: 2 });
    d.on("turnStart", "ask", async () => { seen.push("ask started"); await tick(40); seen.push("ask done"); throw new Error("later"); }, { priority: 1, detached: true });
    d.on("turnStart", "next", () => { seen.push("next"); });
    await d.dispatch("combat", { moment: "turnStart" });
    expect(seen).toEqual(["first", "ask started", "next"]);
    await tick(60);
    expect(seen).toEqual(["first", "ask started", "next", "ask done"]);
    expect(onError).toHaveBeenCalledWith("ask", "turnStart", expect.any(Error));
    expect(onSlow).not.toHaveBeenCalled();
  });

  it("an uncapped handler is waited for however long it takes", async () => {
    const onSlow = vi.fn();
    const d = new MomentDispatcher<P>({ cap: 10, onSlow });
    const seen: string[] = [];
    d.on("turnEnd", "save", async () => { await tick(40); seen.push("save"); }, { priority: 1, uncapped: true });
    d.on("turnEnd", "next", () => { seen.push("next"); });
    await d.dispatch("combat", { moment: "turnEnd" });
    expect(seen).toEqual(["save", "next"]);
    expect(onSlow).not.toHaveBeenCalled();
  });

  it("delivers one combat's moments in the order raised; another combat's are not held up", async () => {
    const d = new MomentDispatcher<P>();
    const seen: string[] = [];
    d.on("turnEnd", "h", async ({ n }) => { await tick(20); seen.push(`end ${n}`); });
    d.on("turnStart", "h", ({ n }) => { seen.push(`start ${n}`); });
    const first = d.dispatch("A", { moment: "turnEnd", n: 1 });
    const second = d.dispatch("A", { moment: "turnStart", n: 2 });
    const other = d.dispatch("B", { moment: "turnStart", n: 9 });
    await Promise.all([first, second, other]);
    expect(seen).toEqual(["start 9", "end 1", "start 2"]);
    expect(d.pending).toBe(0);
  });

  it("a moment raised from inside a handler for the same combat runs after the current one", async () => {
    const d = new MomentDispatcher<P>();
    const seen: string[] = [];
    let nested: Promise<void> | undefined;
    d.on("turnEnd", "h", () => { seen.push("end"); nested = d.dispatch("A", { moment: "turnStart" }); });
    d.on("turnEnd", "after", () => { seen.push("end after"); });
    d.on("turnStart", "h", () => { seen.push("start"); });
    await d.dispatch("A", { moment: "turnEnd" });
    await nested;
    expect(seen).toEqual(["end", "end after", "start"]);
  });
});
