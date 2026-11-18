import { describe, expect, it } from "vitest";
import { Deadline, MidiRequest, RequestRegistry, type Clock } from "../src/module/lib/requests/core.js";

/** A clock moved by hand. */
function fakeClock() {
  let now = 0;
  let timers: { at: number, fn: () => void, id: number }[] = [];
  let next = 0;
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => { const id = ++next; timers.push({ at: now + ms, fn, id }); return id; },
    clearTimeout: handle => { timers = timers.filter(t => t.id !== handle); }
  };
  const advance = (ms: number) => {
    const until = now + ms;
    for (;;) {
      const due = timers.filter(t => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter(t => t !== due);
      now = due.at;
      due.fn();
    }
    now = until;
  };
  return { clock, advance };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("Deadline", () => {
  it("expires after its time; remaining counts down", () => {
    const { clock, advance } = fakeClock();
    let expired = 0;
    const d = new Deadline(1000, () => expired++, clock);
    advance(400);
    expect(d.remaining).toBe(600);
    advance(600);
    expect(expired).toBe(1);
    expect(d.state).toBe("expired");
  });

  it("a pause keeps the time left; resuming continues from it", () => {
    const { clock, advance } = fakeClock();
    let expired = 0;
    const d = new Deadline(1000, () => expired++, clock);
    advance(300);
    expect(d.pause()).toBe(true);
    advance(5000);
    expect(expired).toBe(0);
    expect(d.remaining).toBe(700);
    d.resume();
    advance(699);
    expect(expired).toBe(0);
    advance(1);
    expect(expired).toBe(1);
  });

  it("a pause after expiry doesn't count", () => {
    const { clock, advance } = fakeClock();
    const d = new Deadline(100, () => { }, clock);
    advance(100);
    expect(d.pause()).toBe(false);
  });

  it("0: no deadline", () => {
    const { clock, advance } = fakeClock();
    let expired = 0;
    const d = new Deadline(0, () => expired++, clock);
    advance(1e9);
    expect(expired).toBe(0);
    expect(d.state).toBe("none");
  });
});

describe("MidiRequest", () => {
  it("settles once: a late answer is dropped", async () => {
    const r = new MidiRequest({ kind: "test", timeoutMs: 0, fallback: () => "default" });
    expect(r.settle("gm answer", "gm")).toBe(true);
    expect(r.settle("player answer", "player")).toBe(false);
    expect(await r.settled).toEqual({ value: "gm answer", how: "gm" });
  });

  it("times out with its fallback", async () => {
    const { clock, advance } = fakeClock();
    const r = new MidiRequest({ kind: "test", timeoutMs: 500, fallback: () => "default" }, { clock });
    advance(500);
    expect(await r.settled).toEqual({ value: "default", how: "timeout" });
  });

  it("a claim stops the deadline; the answer comes whenever", async () => {
    const { clock, advance } = fakeClock();
    const r = new MidiRequest({ kind: "test", timeoutMs: 500, fallback: () => "default" }, { clock });
    advance(200);
    expect(r.claim()).toBe(true);
    advance(10_000);
    expect(r.pending).toBe(true);
    expect(r.pause()).toBe(false);
    r.settle("rolled", "player");
    expect(await r.settled).toEqual({ value: "rolled", how: "player" });
  });

  it("claiming a settled request fails", () => {
    const r = new MidiRequest({ kind: "test", timeoutMs: 0, fallback: () => 0 });
    r.settle(1, "gm");
    expect(r.claim()).toBe(false);
  });

  it("onSettled runs once with how", async () => {
    const seen: string[] = [];
    const r = new MidiRequest({ kind: "test", timeoutMs: 0, fallback: () => 0, onSettled: s => seen.push(s.how) });
    r.settleWith(async () => 5, "gm");
    r.settle(6, "player");
    expect((await r.settled).value).toBe(5);
    expect(seen).toEqual(["gm"]);
  });

  it("a settle whose value fails uses the fallback", async () => {
    const r = new MidiRequest({ kind: "test", timeoutMs: 0, fallback: () => "default" });
    const error = console.error;
    console.error = () => { };
    try {
      r.settleWith(() => { throw new Error("no"); }, "gm");
      expect(await r.settled).toEqual({ value: "default", how: "gm" });
    } finally { console.error = error; }
  });
});

describe("RequestRegistry", () => {
  it("indexes by actor and user; a settled request leaves", async () => {
    const reg = new RequestRegistry();
    const a = reg.add(new MidiRequest({ kind: "save", actorUuid: "Actor.a", userId: "u1", timeoutMs: 0, fallback: () => 0 }));
    reg.add(new MidiRequest({ kind: "save", actorUuid: "Actor.b", userId: "u1", timeoutMs: 0, fallback: () => 0 }));
    expect(reg.forActor("Actor.a")).toHaveLength(1);
    expect(reg.forUser("u1")).toHaveLength(2);
    a.settle(1, "player");
    await a.settled;
    await flush();
    expect(reg.forActor("Actor.a")).toHaveLength(0);
    expect(reg.get(a.id)).toBeUndefined();
  });
});

describe("MidiRequest without an answer", () => {
  it("rejects when the answer and the fallback both fail, and leaves the registry", async () => {
    const { clock } = fakeClock();
    let failed = 0;
    const registry = new RequestRegistry();
    const request = registry.add(new MidiRequest<string>({ kind: "test", timeoutMs: 0, fallback: () => { throw new Error("no fallback"); }, onFailed: () => failed++ }, { clock }));
    const outcome = request.settled.then(() => "settled", () => "rejected");
    request.settleWith(() => { throw new Error("no answer"); }, "gm");
    expect(await outcome).toBe("rejected");
    await flush();
    expect(failed).toBe(1);
    expect(registry.get(request.id)).toBeUndefined();
  });
});
