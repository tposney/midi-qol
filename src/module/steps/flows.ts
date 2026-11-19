import { Registry } from "../api/registry.js";

/*
 * Flows: the order a kind of use meets the steps (steps.ts), and the coarse steps a module inserts around (M2; plan
 * ~/Documents/midi-next-M2-plan-2026-11-18.md). A workflow class names its flow (Workflow.flowId); the card records it.
 * The steps still choose what follows them (which can depend on settings: saves before or after the damage roll), so a
 * flow's `steps` are the steps it can visit, in their usual order; the abort steps belong to every flow. M3's
 * insert/replace anchors on step ids. No Foundry here.
 */

export interface Flow {
  id: string;
  label: string;
  /** The fine steps the flow can visit, in their usual order (abort steps excepted: every flow has them). */
  steps: readonly string[];
}

/** Coarse steps: what a module inserts around, each a group of fine steps. */
export const COARSE_STEPS: Readonly<Record<string, readonly string[]>> = {
  "midi-qol.prepare": ["NoAction", "Start"],
  "midi-qol.targeting": ["AwaitTemplate", "TemplatePlaced", "AoETargetConfirmation"],
  "midi-qol.validate": ["ValidateRoll", "PreambleComplete"],
  "midi-qol.utility": ["WaitForUtilityRoll", "UtilityRollComplete"],
  "midi-qol.attack": ["WaitForAttackRoll"],
  "midi-qol.hits": ["AttackRollComplete"],
  "midi-qol.damageRoll": ["WaitForDamageRoll", "ConfirmRoll", "RollConfirmed", "DamageRollStarted", "DamageRollComplete"],
  "midi-qol.saves": ["WaitForSaves", "SavesComplete"],
  "midi-qol.damage": ["AllRollsComplete"],
  "midi-qol.effects": ["ApplyDynamicEffects"],
  "midi-qol.finish": ["RollFinished"],
  "midi-qol.complete": ["Cleanup", "Completed"],
  "midi-qol.abort": ["Abort", "Cancel"]
};

const coarseOf = new Map<string, string>();
for (const [coarse, fine] of Object.entries(COARSE_STEPS)) for (const name of fine) coarseOf.set(`midi-qol.${name}`, coarse);

/** A step an insert anchors on: a coarse step's first fine step (before) or last (after); a fine step itself. */
export function insertAnchor(id: string, side: "before" | "after"): string {
  const fine = COARSE_STEPS[id];
  if (!fine?.length) return id;
  return `midi-qol.${side === "before" ? fine[0] : fine[fine.length - 1]}`;
}

/** The coarse step a fine step belongs to. */
export function coarseStepOf(stepId: string): string | undefined {
  return coarseOf.get(stepId);
}

const flows = new Registry<Flow>();

/**
 * A flow's own implementation of a step (M5): the same step id, hooks, passes and module changes, another `run`.
 * `base()` runs the step's own implementation, as `super.WorkflowState_<name>()` did in the subclass that overrode it.
 */
export type FlowVariant = (ctx: { workflow: any, base(): Promise<unknown> }) => unknown;
const variants = new Map<string, Map<string, FlowVariant>>();

export function registerFlowVariant(flowId: string, stepId: string, run: FlowVariant): void {
  let forFlow = variants.get(flowId);
  if (!forFlow) variants.set(flowId, forFlow = new Map());
  forFlow.set(stepId, run);
}

export function flowVariant(flowId: string | undefined, stepId: string): FlowVariant | undefined {
  return flowId ? variants.get(flowId)?.get(stepId) : undefined;
}

export function registerFlow(flow: Flow): void {
  flows.set(flow.id, flow);
}

export function getFlow(id: string): Flow | undefined {
  return flows.get(id)?.value;
}

export function allFlows(): Flow[] {
  return flows.list().map(entry => entry.value);
}

const ids = (...names: string[]) => names.map(name => `midi-qol.${name}`);
const PREAMBLE = ["NoAction", "Start", "AwaitTemplate", "TemplatePlaced", "AoETargetConfirmation", "ValidateRoll", "PreambleComplete"];
const UTILITY = ["WaitForUtilityRoll", "UtilityRollComplete"];
const ATTACK = ["WaitForAttackRoll", "AttackRollComplete"];
const SAVES = ["WaitForSaves", "SavesComplete"];
const DAMAGE_ROLL = ["WaitForDamageRoll", "ConfirmRoll", "RollConfirmed", "DamageRollStarted", "DamageRollComplete"];
const TAIL = ["AllRollsComplete", "ApplyDynamicEffects", "RollFinished", "Cleanup", "Completed"];
/** Every flow can abort or be cancelled. */
export const ABORT_STEPS: readonly string[] = ids("Abort", "Cancel");

registerFlow({ id: "midi-qol.standard", label: "Standard", steps: ids(...PREAMBLE, ...UTILITY, ...ATTACK, ...DAMAGE_ROLL, ...SAVES, ...TAIL) });
registerFlow({ id: "midi-qol.savesFirst", label: "Saves before damage", steps: ids(...PREAMBLE, ...UTILITY, ...ATTACK, ...SAVES, ...DAMAGE_ROLL, ...TAIL) });
registerFlow({ id: "midi-qol.activeDefence", label: "Active defence", steps: ids(...PREAMBLE, ...UTILITY, ...ATTACK, ...DAMAGE_ROLL, ...SAVES, ...TAIL) });
registerFlow({ id: "midi-qol.damageOnly", label: "Damage only", steps: ids("NoAction", "Start", ...TAIL) });
registerFlow({ id: "midi-qol.damageReroll", label: "Damage reroll", steps: ids("NoAction", ...DAMAGE_ROLL, ...SAVES, ...TAIL) });
registerFlow({ id: "midi-qol.trap", label: "Trap",
  steps: ids("NoAction", "Start", "AwaitTemplate", "TemplatePlaced", "ValidateRoll", ...ATTACK, "WaitForSaves", "WaitForDamageRoll", "DamageRollComplete", ...TAIL) });
