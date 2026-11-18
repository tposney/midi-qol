import { Registry } from "../api/registry.js";

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
  /** The workflow method that runs it (stage 1). */
  method: string;
  /** The card's queued writes are written when the step ends (a milestone: the card shows its result). */
  flush?: boolean;
  /** A marker, not run: Suspend. */
  marker?: boolean;
}

const steps = new Registry<Step>();
const byMethod = new Map<string, Step>();

export function registerStep(step: Step): void {
  steps.set(step.id, step);
  byMethod.set(step.method, step);
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
