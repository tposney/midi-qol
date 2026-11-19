import { describe, expect, it } from "vitest";
import { STEP_ACTS_ON, allSteps } from "../src/module/steps/steps.js";

// M24: the activity-type table's declarations name real steps, and every reaction step says what it acts on
describe("step actsOn (M24)", () => {
  it("names only midi's steps", () => {
    const names = new Set(allSteps().map(step => step.name));
    expect(Object.keys(STEP_ACTS_ON).filter(name => !names.has(name))).toEqual([]);
  });
  it("every reaction step declares what it acts on", () => {
    expect(allSteps().filter(step => step.inline && !step.actsOn?.length).map(step => step.id)).toEqual([]);
  });
});
