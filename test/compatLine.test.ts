import { afterEach, describe, expect, it } from "vitest";
import { compatibilityWarnings } from "./setup.js";
import { deprecation, isRemoved, setCompatibilityLineForSession } from "../src/module/lib/compatLine.js";

/* M5: the compatibility line. A 14.x deprecation warns before its until on the line, and is gone at or past it. */
describe("compatibility line", () => {
  afterEach(() => { setCompatibilityLineForSession("14.7.0"); compatibilityWarnings.length = 0; });

  it("14.7.0: 14.8.0 and 14.9.0 deprecations are still served, with a warning", () => {
    setCompatibilityLineForSession("14.7.0");
    expect(isRemoved("14.8.0")).toBe(false);
    expect(deprecation("old thing", { since: "14.6.9", until: "14.8.0" })).toBe(true);
    expect(compatibilityWarnings.map(w => w.message)).toEqual(["old thing"]);
  });

  it("14.8.0: a 14.8.0 deprecation is gone (no warning), a 14.9.0 one still warns", () => {
    setCompatibilityLineForSession("14.8.0");
    expect(isRemoved("14.8.0")).toBe(true);
    expect(deprecation("gone", { since: "14.6.9", until: "14.8.0" })).toBe(false);
    expect(deprecation("still here", { since: "14.7.0", until: "14.9.0" })).toBe(true);
    expect(compatibilityWarnings.map(w => w.message)).toEqual(["still here"]);
  });

  it("14.9.0: both are gone", () => {
    setCompatibilityLineForSession("14.9.0");
    expect(isRemoved("14.8.0")).toBe(true);
    expect(isRemoved("14.9.0")).toBe(true);
  });

  it("an until that isn't a 14.x release never removes (15.x deprecations, old undated ones)", () => {
    setCompatibilityLineForSession("14.9.0");
    expect(isRemoved(undefined)).toBe(false);
    expect(isRemoved("14")).toBe(false);
    expect(isRemoved("15.1.0")).toBe(false);
  });
});
