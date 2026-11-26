import type { Workflow } from "../Workflow.js";
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
  /** midi's steps: the name of its `Workflow#WorkflowState_<name>` forwarder (old callers), as their method was. */
  method?: string;
  /**
   * A module's step: runs with the workflow; returns the step to go to, or nothing to go on with the move it was
   * inserted into. A wrapper calls `ctx.next()` to run what it wraps; a replacement returns the step to go to.
   */
  run?: (ctx: StepContext) => unknown;
  /** The card's queued writes are written when the step ends (a milestone: the card shows its result). */
  flush?: boolean;
  /** A marker, not run: Suspend. */
  marker?: boolean;
  /**
   * Run where something happens inside another step (a reaction trigger), not by the engine: the use's changes apply
   * (insert around, replace, wrap, remove); midi's own fire no hooks (batch 110's order), inserted steps fire theirs.
   * Its result is what the step gives (a reaction's), not a step to go to.
   */
  inline?: boolean;
  /**
   * What it acts on (M24): the step does its work only for a use whose activity (or its other activity) has one of these;
   * for others it passes the use on. Absent: every use. Declared for the activity-type table (activityTypeSteps), not
   * enforced: the step's own run still decides.
   */
  actsOn?: readonly ActivityCapability[];
  /** Its contract: the workflow fields it reads and writes (midi's steps: SHARED_FIELDS). */
  reads?: readonly string[];
  writes?: readonly string[];
}

/** What an activity can do, from its type's fields (attack, damage...); `area`: its target has a template or emanation */
export type ActivityCapability = "attack" | "damage" | "healing" | "save" | "check" | "utilityRoll" | "area" | "transform";

export interface StepContext {
  workflow: Workflow;
  /** For a wrapper: run the step it wraps (and what that returns). */
  next(): Promise<unknown>;
  /** At a reaction step: who reacts to what (utils doReactions' arguments). */
  /** The reacting token is a TokenDocument (proposal section 18, rule 1); undefined if it can't be resolved */
  reaction?: { target: TokenDocument.Implementation | undefined, triggerTokenUuid?: string | null, triggeringRoll?: unknown, triggerType: string, options: unknown };
}

const steps = new Registry<Step>();
const byMethod = new Map<string, Step>();

export function registerStep(step: Step): void {
  steps.set(step.id, step);
  if (step.method) byMethod.set(step.method, step);
}

/** midi's own step gets its implementation (M5: the workflow's step modules, workflowSteps/), keeping its id and method name */
export function setStepRun(id: string, run: NonNullable<Step["run"]>): void {
  const step = getStep(id);
  if (!step) throw new Error(`midi-qol | no step ${id} to implement`);
  step.run = run;
}

export function unregisterStep(id: string): boolean {
  return steps.delete(id);
}

/** A change to every use's flow (the global layer), optionally only where `when` says. */
/** What a change's `when` sees: the use, or in a flow preview a stand-in with its activity, item, actor and options */
export type StepUse = Workflow | { activity: unknown, item: unknown, actor: unknown, workflowOptions: { steps: unknown[] }, flowId: string, preview: true };

export type GlobalStepChange = StepChange & { when?: (workflow: StepUse) => boolean };
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

/** Every global change (the activity-type table shows the inserted steps) */
export function allGlobalStepChanges(): readonly GlobalStepChange[] {
  return globalChanges;
}

/** The global changes that apply to a use (a `when` that throws: not applied), as data. */
export function globalStepChangesFor(workflow: StepUse): StepChange[] {
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
  ["Suspend", { marker: true }], "NoAction", "Start", "Transform", "PlaceEmanation", "AwaitTemplate", "TemplatePlaced", "AoETargetConfirmation",
  "Choices", "ValidateRoll", "PreambleComplete", "WaitForAttackRoll", ["AttackRollComplete", { flush: true }], "WaitForDamageRoll",
  "ConfirmRoll", "RollConfirmed", "DamageRollStarted", "DamageRollComplete", "WaitForUtilityRoll", "UtilityRollComplete", "RollTable",
  ["WaitForSaves", { flush: true }], "SavesComplete", ["AllRollsComplete", { flush: true }], "ApplyDynamicEffects",
  ["Cleanup", { flush: true }], "Completed", "Abort", "Cancel", "RollFinished"
];

/** Reaction steps (inline), by midi's trigger type: run where the reaction is asked (Workflow#askReactionsStep). */
export const REACTION_STEPS: Readonly<Record<string, string>> = {
  reactionpreattack: "midi-qol.reaction.preAttack",
  reactionattacked: "midi-qol.reaction.attacked",
  reaction: "midi-qol.reaction.hit",
  reactionmissed: "midi-qol.reaction.missed",
  reactiondamage: "midi-qol.reaction.damaged",
  reactionheal: "midi-qol.reaction.healed",
  reactionsave: "midi-qol.reaction.save",
  reactionsavesuccess: "midi-qol.reaction.saveSuccess",
  reactionsavefail: "midi-qol.reaction.saveFail",
  // A spell being cast (Counterspell): any spell, after its preamble (lib/entries/castReactions.ts)
  reactioncast: "midi-qol.reaction.cast"
};
const REACTION_ACTS_ON: Readonly<Record<string, readonly ActivityCapability[]>> = {
  preAttack: ["attack"], attacked: ["attack"], hit: ["attack"], missed: ["attack"], damaged: ["damage"], healed: ["healing"],
  save: ["save", "check"], saveSuccess: ["save", "check"], saveFail: ["save", "check"],
  // Any spell, whatever it does
  cast: ["attack", "damage", "healing", "save", "check", "utilityRoll", "area", "transform"]
};
for (const id of Object.values(REACTION_STEPS)) {
  const name = id.replace("midi-qol.reaction.", "");
  registerStep({ id, name: `Reaction${name[0].toUpperCase()}${name.slice(1)}`, inline: true, actsOn: REACTION_ACTS_ON[name] });
}

/** midi's own steps (engine-run or inline): a module can't register over them */
export function isMidiStep(id: string): boolean {
  const step = getStep(id);
  return !!step && (!!step.method || !!step.inline || !!step.marker);
}

/** What midi's steps act on (M24; from each step's run, workflowSteps/): steps not listed act for every use */
const ROLLS_DAMAGE: readonly ActivityCapability[] = ["damage", "healing"];
const SAVES: readonly ActivityCapability[] = ["save", "check"];
export const STEP_ACTS_ON: Readonly<Record<string, readonly ActivityCapability[]>> = {
  Transform: ["transform"],
  PlaceEmanation: ["area"], AwaitTemplate: ["area"], TemplatePlaced: ["area"], AoETargetConfirmation: ["area"],
  WaitForAttackRoll: ["attack"], AttackRollComplete: ["attack"],
  WaitForDamageRoll: ROLLS_DAMAGE, ConfirmRoll: ["attack", ...ROLLS_DAMAGE], RollConfirmed: ["attack", ...ROLLS_DAMAGE],
  DamageRollStarted: ROLLS_DAMAGE, DamageRollComplete: ROLLS_DAMAGE,
  WaitForUtilityRoll: ["utilityRoll"], UtilityRollComplete: ["utilityRoll"],
  WaitForSaves: SAVES, SavesComplete: SAVES
};

for (const entry of BUILT_IN) {
  const [name, extra] = typeof entry === "string" ? [entry, {}] : entry;
  registerStep({ id: `midi-qol.${name}`, name, method: `WorkflowState_${name}`, actsOn: STEP_ACTS_ON[name], ...extra });
}

/**
 * Workflow fields more than one step writes or reads, and which (from the M2 state inventory). M3's step contracts
 * check a replacement step against these. test/sharedFields.test.ts (M31) fails when a step body writes one directly
 * without being listed as a writer. "use" is the code before the first
 * step (MidiActivityMixin.use), "GM" the GM's card actions.
 */
export const SHARED_FIELDS: Readonly<Record<string, { writers: readonly string[], readers: readonly string[] }>> = {
  outcome: { writers: ["dispatcher", "midi-qol.ValidateRoll", "midi-qol.WaitForAttackRoll", "midi-qol.AttackRollComplete", "midi-qol.WaitForSaves", "midi-qol.Abort"], readers: ["midi-qol.RollFinished", "midi-qol.Completed"] },
  aborted: { writers: ["dispatcher", "macros", "midi-qol.Abort", "ActiveDefence checkHits"], readers: ["dispatcher", "stateAfter", "midi-qol.WaitForUtilityRoll"] },
  whisperAttackCard: { writers: ["midi-qol.PreambleComplete", "midi-qol.WaitForAttackRoll", "midi-qol.AttackRollComplete", "midi-qol.WaitForDamageRoll"], readers: ["midi-qol.AttackRollComplete"] },
  hitDisplayData: { writers: ["midi-qol.AttackRollComplete", "GM"], readers: ["midi-qol.AttackRollComplete", "GM"] },
  effectTargets: { writers: ["midi-qol.WaitForSaves", "midi-qol.ApplyDynamicEffects"], readers: ["midi-qol.ApplyDynamicEffects"] },
  otherConsumed: { writers: ["midi-qol.WaitForSaves", "midi-qol.AllRollsComplete", "midi-qol.ApplyDynamicEffects"], readers: ["midi-qol.WaitForSaves", "midi-qol.AllRollsComplete", "midi-qol.ApplyDynamicEffects"] },
  damageList: { writers: ["midi-qol.AllRollsComplete"], readers: ["midi-qol.ApplyDynamicEffects", "midi-qol.RollFinished"] },
  deferredConcentration: { writers: ["use"], readers: ["midi-qol.PreambleComplete"] }
};
