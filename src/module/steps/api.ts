import { addStepChange, getStep, registerStep, removeStepChanges, unregisterStep, type Step, type StepContext } from "./steps.js";

/*
 * MidiQOL.steps (M3): a module registers its steps and changes every use's flow (the global layer; `when` limits a
 * change to the uses it applies to). The call layer (completeActivityUse's `steps`) is stage 2.
 *
 *   MidiQOL.steps.register({ id: "my-mod.drain", name: "Drain", run: async ({ workflow }) => { …; } });
 *   MidiQOL.steps.insert({ step: "my-mod.drain", after: "midi-qol.AllRollsComplete", source: "my-mod",
 *     when: workflow => workflow.item?.name === "Vampire Bite" });
 *   MidiQOL.steps.wrap({ target: "midi-qol.WaitForSaves", wrapper: "my-mod.saveTimer", source: "my-mod" });
 *   MidiQOL.steps.removeChanges("my-mod");
 */

type When = { when?: (workflow: any) => boolean, priority?: number, source?: string };

export const stepsApi = {
  /** A module's step: `run` returns the step to go to, or nothing to go on with the move it was inserted into. */
  register(step: { id: string, name?: string, run: (ctx: StepContext) => unknown }): void {
    if (getStep(step.id)?.method) throw new Error(`midi-qol | steps: ${step.id} is one of midi's steps`);
    registerStep({ id: step.id, name: step.name ?? step.id, run: step.run as Step["run"] });
  },
  unregister(id: string): boolean {
    if (getStep(id)?.method) return false;
    return unregisterStep(id);
  },
  insert(change: { step: string, before?: string, after?: string } & When): void {
    addStepChange({ kind: "insert", layer: "global", ...change });
  },
  replace(change: { target: string, step: string } & When): void {
    addStepChange({ kind: "replace", layer: "global", ...change });
  },
  wrap(change: { target: string, wrapper: string } & When): void {
    addStepChange({ kind: "wrap", layer: "global", ...change });
  },
  remove(change: { target: string } & When): void {
    addStepChange({ kind: "remove", layer: "global", ...change });
  },
  /** Remove the changes a source made. */
  removeChanges(source: string): number {
    return removeStepChanges(source);
  },
  get(id: string): Step | undefined {
    return getStep(id);
  }
};
