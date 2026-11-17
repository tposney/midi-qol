import { describe, expect, it, vi } from "vitest";

// activityPrototype imports the whole module; only the policy matters here
vi.mock("../src/module/activities/activityPrototype.js", () => ({ activityPolicy: () => ({ automated: true }) }));
const { cardActionsFor, installCardActions, registerCardAction } = await import("../src/module/activities/cardActions.js");

const handler = (name: string) => Object.assign(() => name, { label: name });
const names = (actions: Record<string, unknown>) => Object.fromEntries(Object.entries(actions).map(([k, v]) => [k, (v as { label?: string }).label ?? "dnd5e"]));

describe("card action precedence", () => {
  it("dnd5e's own < registered for all types < registered for the type", () => {
    registerCardAction("p1", handler("all"));
    registerCardAction("p1", handler("attack"), { types: ["attack"] });
    const dnd5e = { p1: () => "dnd5e", untouched: () => "dnd5e" };
    expect(names(cardActionsFor("attack", dnd5e))).toMatchObject({ p1: "attack", untouched: "dnd5e" });
    expect(names(cardActionsFor("save", dnd5e))).toMatchObject({ p1: "all" });
  });

  it("whenAbsent handlers fill only actions nothing else handles", () => {
    registerCardAction("p2", handler("fallback"), { whenAbsent: true });
    registerCardAction("p3", handler("fallback"), { whenAbsent: true });
    registerCardAction("p3", handler("save"), { types: ["save"] });
    expect(names(cardActionsFor("save", { p2: () => "dnd5e" }))).toMatchObject({ p2: "dnd5e", p3: "save" });
    expect(names(cardActionsFor("check", {}))).toMatchObject({ p2: "fallback", p3: "fallback" });
  });

  it("a second registration for the same action and types replaces the first", () => {
    registerCardAction("p4", handler("first"), { types: ["heal"] });
    registerCardAction("p4", handler("second"), { types: ["heal"] });
    expect(names(cardActionsFor("heal"))).toMatchObject({ p4: "second" });
  });
});

describe("installCardActions", () => {
  it("puts the actions on each type's class metadata without changing dnd5e's object", () => {
    registerCardAction("p5", handler("midi"), { types: ["utility"] });
    const metadata = Object.freeze({ type: "utility", usage: Object.freeze({ actions: Object.freeze({ own: () => "dnd5e" }) }) });
    const cls = { metadata };
    installCardActions({ utility: { documentClass: cls } });
    expect(cls.metadata).not.toBe(metadata);
    expect(names(cls.metadata.usage.actions)).toMatchObject({ own: "dnd5e", p5: "midi" });
    expect(metadata.usage.actions).not.toHaveProperty("p5");
  });
});
