import { reportServiceProblem } from "../api/services.js";
import { assembleSteps, normaliseChanges, previewSteps, stepsUsed, type AssembledSteps, type StepChange, type StepChangeInput, type StepConflict, type StepLayer } from "./assembly.js";
import { COARSE_STEPS, getFlow, insertAnchor } from "./flows.js";
import { addStepChange, contractGaps, getStep, globalStepChangesFor, isMidiStep, registerStep, removeStepChanges, unregisterStep, type Step, type StepContext } from "./steps.js";

/*
 * MidiQOL.steps (M3): a module registers its steps and changes every use's flow (the global layer; `when` limits a
 * change to the uses it applies to). An item stores changes for its uses in `flags.midi-qol.steps`, an activity in its
 * `midiSteps` (data, the same form as a call's). A use's own changes go in its call: completeActivityUse(activity,
 * { midiOptions: { steps: [...] } }). Narrowest wins: call, activity, item, global.
 *
 *   MidiQOL.steps.register({ id: "my-mod.drain", name: "Drain", writes: ["damageList"], run: async ({ workflow }) => { …; } });
 *   MidiQOL.steps.insert({ step: "my-mod.drain", after: "midi-qol.damage", source: "my-mod",
 *     when: workflow => workflow.item?.name === "Vampire Bite" });
 *   MidiQOL.steps.wrap({ target: "midi-qol.WaitForSaves", wrapper: "my-mod.saveTimer", source: "my-mod" });
 *   MidiQOL.steps.removeChanges("my-mod");
 *
 * Inserts may anchor on a coarse step (`midi-qol.damage`: before its first fine step, after its last); replace, wrap
 * and remove name a fine step (`midi-qol.AllRollsComplete`). MidiQOL.flows.preview shows what a use would run.
 */

type When = { when?: (workflow: any) => boolean, priority?: number, source?: string };
const normaliseOptions = { insertAnchor, isCoarse: (id: string) => id in COARSE_STEPS };

function addGlobal(change: StepChangeInput & When): void {
  const { changes, problems } = normaliseChanges([change], "global", normaliseOptions);
  if (problems.length) throw new Error(`midi-qol | steps: ${problems.join("; ")}`);
  addStepChange({ ...changes[0], when: change.when });
}

export const stepsApi = {
  /** A module's step: `run` returns the step to go to, or nothing to go on with the move it was inserted into. */
  register(step: { id: string, name?: string, reads?: string[], writes?: string[], run: (ctx: StepContext) => unknown }): void {
    if (isMidiStep(step.id)) throw new Error(`midi-qol | steps: ${step.id} is one of midi's steps`);
    registerStep({ id: step.id, name: step.name ?? step.id, reads: step.reads, writes: step.writes, run: step.run as Step["run"] });
  },
  unregister(id: string): boolean {
    if (isMidiStep(id)) return false;
    return unregisterStep(id);
  },
  insert(change: { step: string, before?: string, after?: string } & When): void {
    addGlobal({ kind: "insert", ...change });
  },
  replace(change: { target: string, step: string } & When): void {
    addGlobal({ kind: "replace", ...change });
  },
  wrap(change: { target: string, wrapper: string } & When): void {
    addGlobal({ kind: "wrap", ...change });
  },
  remove(change: { target: string } & When): void {
    addGlobal({ kind: "remove", ...change });
  },
  /** Remove the changes a source made. */
  removeChanges(source: string): number {
    return removeStepChanges(source);
  },
  get(id: string): Step | undefined {
    return getStep(id);
  }
};

/** The used activity and its item: their stored changes are the item and activity layers. */
export interface StepSources {
  item?: { uuid?: string | null, name?: string | null, flags?: Record<string, any> } | null;
  activity?: { uuid?: string | null, name?: string | null, midiSteps?: unknown } | null;
}

/** The item's (`flags.midi-qol.steps`) and the activity's (`midiSteps`) changes, checked; problems reported once naming the document. */
function storedChanges(sources: StepSources): StepChange[] {
  const layers: [StepLayer, { uuid?: string | null, name?: string | null } | null | undefined, unknown][] = [
    ["item", sources.item, sources.item?.flags?.["midi-qol"]?.steps],
    ["activity", sources.activity, sources.activity?.midiSteps]
  ];
  const changes: StepChange[] = [];
  for (const [layer, document, stored] of layers) {
    if (stored === undefined || stored === null) continue;
    const label = `${layer} ${document?.name ?? ""} (${document?.uuid ?? "?"})`;
    if (!Array.isArray(stored)) { reportOnce(`${layer}|${document?.uuid}|not a list`, label, "its step changes aren't a list"); continue; }
    const normalised = normaliseChanges(stored, layer, normaliseOptions);
    for (const problem of normalised.problems) reportOnce(`${layer}|${document?.uuid}|${problem}`, label, problem);
    changes.push(...normalised.changes);
  }
  return changes;
}

/**
 * A use's changes: the global changes that apply to it, the item's and the activity's stored ones, and its call's
 * (checked; problems reported). The used activity and its item only: not the other activity's or the ammunition's.
 */
export function useStepChanges(workflow: unknown, callChanges: readonly unknown[] | undefined, sources: StepSources = {}): StepChange[] {
  const call = normaliseChanges(callChanges ?? [], "call", normaliseOptions);
  for (const problem of call.problems) reportOnce(`call|${problem}`, "call", problem);
  return [...globalStepChangesFor(workflow), ...storedChanges(sources), ...call.changes];
}

// A problem is reported once a session: every use would repeat it
const reported = new Set<string>();
function reportOnce(key: string, source: string, message: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  reportServiceProblem("steps", source, message);
}

/** Reports a use's conflicts and replacements that leave out what the step they replace writes (once a session each). */
export function reportAssembly(assembled: AssembledSteps): void {
  for (const conflict of assembled.conflicts)
    reportOnce(`conflict|${conflict.anchor}|${conflict.winner}|${conflict.losers.join(",")}`, conflict.winner,
      `${conflict.anchor}: ${conflict.kind === "replace" ? "replaced" : "removed"} by ${conflict.winner}, which wins over ${conflict.losers.join(", ")}`);
  for (const [target, anchor] of Object.entries(assembled.anchors)) {
    if (!anchor.replacement) continue;
    const gaps = contractGaps(target, anchor.replacement);
    if (gaps.length) reportOnce(`contract|${target}|${anchor.replacement}`, anchor.replacement,
      `replaces ${target} but doesn't declare writing ${gaps.join(", ")}, which ${target} writes`);
  }
}

/** The steps of a use's changes that aren't registered on this client. */
export function missingSteps(changes: readonly StepChange[]): string[] {
  return stepsUsed(changes).filter(id => !getStep(id));
}

export interface FlowPreview { flow: string, steps: string[], conflicts: StepConflict[], missing: string[] }

/**
 * What a use of `activity` would run: its flow's steps with the global changes that apply (their `when` sees a stand-in
 * with activity, item, actor and workflowOptions) and `options.steps`, each step going on to the next in the flow.
 */
export function previewFlow(activity: any, options: { flow?: string, steps?: unknown[] }, defaultFlow: string): FlowPreview {
  const flowId = options.flow ?? defaultFlow;
  const flow = getFlow(flowId);
  if (!flow) throw new Error(`midi-qol | flows.preview: no flow ${flowId}`);
  const standIn = { activity, item: activity?.item, actor: activity?.actor, workflowOptions: { steps: options.steps ?? [] }, flowId, preview: true };
  const changes = useStepChanges(standIn, options.steps, { item: activity?.item, activity });
  const assembled = assembleSteps(changes);
  return { flow: flowId, steps: previewSteps(flow.steps, assembled), conflicts: assembled.conflicts, missing: missingSteps(changes) };
}
