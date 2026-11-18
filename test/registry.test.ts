import { describe, expect, it } from "vitest";
import { Registry } from "../src/module/api/registry.js";

describe("Registry", () => {
  it("orders by priority, then registration; a replaced id keeps its place", () => {
    const registry = new Registry<string>();
    registry.set("a", "A");
    registry.set("b", "B", { priority: 5 });
    registry.set("c", "C");
    expect(registry.entries().map(e => e.id)).toEqual(["b", "a", "c"]);
    registry.set("a", "A2");
    expect(registry.entries().map(e => e.value)).toEqual(["B", "A2", "C"]);
    expect(registry.list().map(e => e.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves out unavailable entries, and ones whose check throws, without forgetting them", () => {
    let on = false;
    const registry = new Registry<string, { label: string }>();
    registry.set("x", "X", { available: () => on }, { label: "The X" });
    registry.set("y", "Y", { available: () => { throw new Error("gone"); } });
    expect(registry.entries()).toEqual([]);
    on = true;
    expect(registry.entries().map(e => [e.id, e.meta.label])).toEqual([["x", "The X"]]);
    expect(registry.size).toBe(2);
  });

  it("tells its owner of every change", () => {
    let changes = 0;
    const registry = new Registry<number>(() => changes++);
    registry.set("a", 1);
    registry.set("a", 2);
    expect(registry.delete("a")).toBe(true);
    expect(registry.delete("a")).toBe(false);
    expect(changes).toBe(3);
    expect(registry.has("a")).toBe(false);
  });
});
