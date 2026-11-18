import { Registry } from "../api/registry.js";
import type { StepChange } from "./assembly.js";

/*
 * The steps of a use's flow (M2; plan ~/Documents/midi-next-M2-plan-2026-11-18.md). Stage 1: each step is one of the
 * workflow's state methods, `Workflow#WorkflowState_<name>`, registered under the id `midi-qol.<name>`. The step's
 * name is what its hooks and onUse passes are called by (`midi-qol.pre<name>`, `post<name>`), so a step keeps them
 * whatever runs it. No Foundry here: the registry is filled when this module loads.
 */

export interface Step {
  /** `midi-qol.<name>` for midi's steps. */
  id: string;
  /** The hook and pass name: `pre<name>` / `post<name>`. */
  name: string;
  /** The workflow method that runs it (midi's steps). */
  method?: string;
  /**
   * A module's step: runs with the workflow; returns the step to go to, or nothing to go on with the move it was
   * inserted into. A wrapper calls `ctx.next()` to run what it wraps; a replacement returns the step to go to.
   */
  run?: (ctx: StepContext) => Promise<string | undefined | void> | string | undefined | void;
  /** The card's queued writes are written when the step ends (a milestone: the card shows its result). */
  flush?: boolean;
  /** A marker, not run: Suspend. */
  marker?: boolean;
  /** Its contract: the workflow fields it reads and writes (midi's steps: SHARED_FIELDS). */
  reads?: readonly string[];
  writes?: readonly string[];
}

export interface StepContext {
  workflow: any;
  /** For a wrapper: run the step it wraps (and what that returns). */
  next(): Promise<string | undefined>;
}

const steps = new Registry<Step>();
const byMethod = new Map<string, Step>();

export function registerStep(step: Step): void {
  steps.set(step.id, step);
  if (step.method) byMethod.set(step.method, step);
}

export function unregisterStep(id: string): boolean {
  return steps.delete(id);
}

/** A change to every use's flow (the global layer), optionally only where `when` says. */
export type GlobalStepChange = StepChange & { when?: (workflow: any) => boolean };
const globalChanges: GlobalStepChange[] = [];

export function addStepChange(change: GlobalStepChange): void {
  globalChanges.push(change);
}

/** Remove the global changes a source made (by `source`), or one change. */
export function removeStepChanges(match: string | GlobalStepChange): number {
  const before = globalChanges.length;
  for (let i = globalChanges.length - 1; i >= 0; i--)
    if (typeof match === "string" ? globalChanges[i].source === match : globalChanges[i] === match) globalChanges.splice(i, 1);
  return before - globalChanges.length;
}

/** The global changes that apply to a use (a `when` that throws: not applied), as data. */
export function globalStepChangesFor(workflow: unknown): StepChange[] {
  return globalChanges
    .filter(change => { try { return change.when?.(workflow) ?? true; } catch { return false; } })
    .map(({ when: _when, ...change }) => change as StepChange);
}

/** The fields a step promises to write: declared, and for midi's steps those SHARED_FIELDS lists it as writing. */
export function stepWrites(id: string): string[] {
  const shared = Object.entries(SHARED_FIELDS).filter(([, f]) => f.writers.includes(id)).map(([field]) => field);
  return [...new Set([...(getStep(id)?.writes ?? []), ...shared])];
}

/** What a replacement leaves out of the step it replaces: the fields that step writes and the replacement doesn't declare. */
export function contractGaps(target: string, replacement: string): string[] {
  const writes = new Set(stepWrites(replacement));
  return stepWrites(target).filter(field => !writes.has(field));
}

export function getStep(id: string): Step | undefined {
  return steps.get(id)?.value;
}

/** The step a workflow method runs, by the method's name (`WorkflowState_AttackRollComplete`). */
export function stepForMethod(method: string | undefined): Step | undefined {
  return method ? byMethod.get(method) : undefined;
}

/** Every registered step, in registration order. */
export function allSteps(): Step[] {
  return steps.list().map(entry => entry.value);
}

/** midi's steps, in the order the standard flow meets them. */
const BUILT_IN: readonly (string | [string, Partial<Step>])[] = [
  ["Suspend", { marker: true }], "NoAction", "Start", "AwaitTemplate", "TemplatePlaced", "AoETargetConfirmation",
  "ValidateRoll", "PreambleComplete", "WaitForAttackRoll", ["AttackRollComplete", { flush: true }], "WaitForDamageRoll",
  "ConfirmRoll", "RollConfirmed", "DamageRollStarted", "DamageRollComplete", "WaitForUtilityRoll", "UtilityRollComplete",
  ["WaitForSaves", { flush: true }], "SavesComplete", ["AllRollsComplete", { flush: true }], "ApplyDynamicEffects",
  ["Cleanup", { flush: true }], "Completed", "Abort", "Cancel", "RollFinished"
];

for (const entry of BUILT_IN) {
  const [name, extra] = typeof entry === "string" ? [entry, {}] : entry;
  registerStep({ id: `midi-qol.${name}`, name, method: `WorkflowState_${name}`, ...extra });
}

/**
 * Workflow fields more than one step writes or reads, and which (from the M2 state inventory). M3's step contracts
 * check a replacement step against these; until then they record who owns what. "use" is the code before the first
 * step (MidiActivityMixin.use), "GM" the GM's card actions.
 */
export const SHARED_FIELDS: Readonly<Record<string, { writers: readonly string[], readers: readonly string[] }>> = {
  outcome: { writers: ["dispatcher", "midi-qol.ValidateRoll", "midi-qol.AttackRollComplete", "midi-qol.WaitForSaves", "midi-qol.Abort"], readers: ["midi-qol.RollFinished", "midi-qol.Completed"] },
  aborted: { writers: ["dispatcher", "macros", "midi-qol.Abort", "ActiveDefence checkHits"], readers: ["dispatcher", "stateAfter", "midi-qol.WaitForUtilityRoll"] },
  whisperAttackCard: { writers: ["midi-qol.WaitForAttackRoll", "midi-qol.AttackRollComplete", "midi-qol.WaitForDamageRoll"], readers: ["midi-qol.AttackRollComplete"] },
  hitDisplayData: { writers: ["midi-qol.AttackRollComplete", "GM"], readers: ["midi-qol.AttackRollComplete", "GM"] },
  effectTargets: { writers: ["midi-qol.WaitForSaves", "midi-qol.ApplyDynamicEffects"], readers: ["midi-qol.ApplyDynamicEffects"] },
  otherConsumed: { writers: ["midi-qol.WaitForSaves", "midi-qol.AllRollsComplete", "midi-qol.ApplyDynamicEffects"], readers: ["midi-qol.WaitForSaves", "midi-qol.AllRollsComplete", "midi-qol.ApplyDynamicEffects"] },
  damageList: { writers: ["midi-qol.AllRollsComplete"], readers: ["midi-qol.ApplyDynamicEffects", "midi-qol.RollFinished"] },
  deferredConcentration: { writers: ["use"], readers: ["midi-qol.PreambleComplete"] }
};
