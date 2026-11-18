import { describe, expect, it } from "vitest";
import { activeProviderId, all, defineService, entries, get, isProvider, providers, register, unregister, unwrap, wrap } from "../src/module/api/services.js";
import { hookCalls } from "./setup.js";

type Answer = () => string;
let n = 0;
const fresh = (kind: "single" | "contributors" = "single", selector?: () => string | undefined) => {
  const id = `test.service${++n}`;
  defineService<Answer>(id, { kind, description: "test", selector });
  return id;
};

describe("single services", () => {
  it("uses the highest priority available provider", () => {
    const id = fresh();
    register<Answer>(id, "midi", () => "midi");
    register<Answer>(id, "other", () => "other", { priority: 10 });
    expect(get<Answer>(id)?.()).toBe("other");
    expect(isProvider(id, "other")).toBe(true);
  });

  it("skips providers that are unavailable or whose check throws", () => {
    const id = fresh();
    register<Answer>(id, "midi", () => "midi");
    register<Answer>(id, "absent", () => "absent", { priority: 10, available: () => false });
    register<Answer>(id, "broken", () => "broken", { priority: 20, available: () => { throw new Error("no module"); } });
    expect(activeProviderId(id)).toBe("midi");
    expect(providers(id).map(p => [p.id, p.available, p.active])).toEqual([["midi", true, true], ["absent", false, false], ["broken", false, false]]);
  });

  it("follows the selector, and has no provider when the selected one is unavailable", () => {
    let chosen: string | undefined = "midi";
    const id = fresh("single", () => chosen);
    register<Answer>(id, "midi", () => "midi");
    register<Answer>(id, "other", () => "other", { priority: 10, available: () => false });
    expect(get<Answer>(id)?.()).toBe("midi");
    chosen = "other";
    expect(get<Answer>(id)).toBeUndefined();
    chosen = undefined;
    expect(get<Answer>(id)?.()).toBe("midi");
  });

  it("re-resolves when the selector's value changes without a registration (settings changed in memory)", () => {
    let chosen = "a";
    const id = fresh("single", () => chosen);
    register<Answer>(id, "a", () => "a");
    register<Answer>(id, "b", () => "b");
    expect(get<Answer>(id)?.()).toBe("a");
    chosen = "b";
    expect(get<Answer>(id)?.()).toBe("b");
  });

  it("applies wrappers in registration order, replaces a wrapper by id, and unwraps", () => {
    const id = fresh();
    register<Answer>(id, "midi", () => "midi");
    wrap<Answer>(id, "x", next => () => `x(${next()})`);
    wrap<Answer>(id, "y", next => () => `y(${next()})`);
    expect(get<Answer>(id)?.()).toBe("y(x(midi))");
    wrap<Answer>(id, "x", next => () => `X(${next()})`);
    expect(get<Answer>(id)?.()).toBe("X(y(midi))");
    unwrap(id, "y");
    expect(get<Answer>(id)?.()).toBe("X(midi)");
  });

  it("drops the cache and announces a change when a provider is added or removed", () => {
    const id = fresh();
    register<Answer>(id, "midi", () => "midi");
    expect(get<Answer>(id)?.()).toBe("midi");
    const before = hookCalls.length;
    register<Answer>(id, "other", () => "other", { priority: 1 });
    expect(get<Answer>(id)?.()).toBe("other");
    unregister(id, "other");
    expect(get<Answer>(id)?.()).toBe("midi");
    expect(hookCalls.slice(before)).toEqual([
      { hook: "midi-qol.servicesChanged", args: [id] },
      { hook: "midi-qol.servicesChanged", args: [id] },
    ]);
  });
});

describe("contributor services", () => {
  it("returns every available contributor, highest priority first", () => {
    const id = fresh("contributors");
    register<Answer>(id, "low", () => "low", { priority: -1 });
    register<Answer>(id, "midi", () => "midi");
    register<Answer>(id, "off", () => "off", { available: () => false });
    register<Answer>(id, "high", () => "high", { priority: 5 });
    expect(all<Answer>(id).map(p => p())).toEqual(["high", "midi", "low"]);
  });

  it("entries() gives each available contributor with its id, highest priority first", () => {
    const id = fresh("contributors");
    register<Answer>(id, "low", () => "low", { priority: -1 });
    register<Answer>(id, "off", () => "off", { available: () => false });
    register<Answer>(id, "high", () => "high", { priority: 5 });
    expect(entries<Answer>(id).map(e => [e.id, e.provider()])).toEqual([["high", "high"], ["low", "low"]]);
  });

  it("refuses get(), which is for single services", () => {
    const id = fresh("contributors");
    expect(() => get(id)).toThrow(/use all\(\)/);
  });
});

describe("definitions", () => {
  it("refuses a second definition and an unknown service", () => {
    const id = fresh();
    expect(() => defineService(id, { kind: "single", description: "again" })).toThrow(/already defined/);
    expect(() => get("test.nothing")).toThrow(/no service/);
  });
});
