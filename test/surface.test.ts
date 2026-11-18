import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// M0's contract: docs/surface.json lists what other modules may rely on, regenerated when it changes (npm run surface)
describe("docs/surface.json", () => {
  it("is up to date", () => {
    let output = "";
    try { output = execFileSync("node", ["tools/surface.mjs", "--check"], { encoding: "utf8" }); }
    catch (err: any) { output = `${err.stdout ?? ""}${err.stderr ?? ""}`; }
    expect(output).toContain("up to date");
  });
});
