import type { AnyMutableObject } from "fvtt-types/utils";
import type { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { reportServiceProblem } from "../api/services.js";
import { setMessageTargets } from "../utils.js";
import { Workflow } from "../Workflow.js";

/*
 * M10: a use goes through the restart (plan ~/Documents/midi-next-M10-plan-2026-11-19.md; spike
 * midi-next-use-relaunch-spike-2026-11-17.md). midi's `use` (MidiActivityMixin, installed per type) calls dnd5e's use
 * with a use key; midi's dnd5e.preUseActivity listener, registered first, cancels that call and restarts the use after
 * midi's async pre-use work (prepareUse): through the same `use`, marked, so dnd5e's use runs once for every other
 * listener. midi's `use` returns the restart's result. The marked run's listeners are permanent, keyed on the use's
 * workflow; the post-use work (finishUse) follows dnd5e's use.
 */

/** One use's working state between midi's pre-use work, dnd5e's use and midi's post-use work. */
export interface UseState {
  usage: ActivityUseConfiguration;
  dialog: RollDialogConfig;
  message: RollMessageConfig;
  /** The clone midi works on, the one dnd5e's use runs on */
  activity: RestartableActivity;
  deferConcentration: boolean;
  /** dnd5e's copy of the usage (preUseActivity) and the one consumption ran with (activityConsumption) */
  dnd5eUsageConfig?: ActivityUseConfiguration;
  usageData?: ActivityUseConfiguration;
}

type Prepared = { done: true, result: unknown } | { done: false, state: UseState };

/** An activity with midi's use (MidiActivityMixin). */
export interface RestartableActivity extends Activity {
  prepareUse(usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Prepared>;
  onUsePreUse(state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): boolean;
  onUseConsumption(state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): void;
  finishUse(state: UseState, results: unknown): Promise<unknown>;
  use(usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<unknown>;
}

function isRestartable(activity: unknown): activity is RestartableActivity {
  return !!activity && typeof (activity as Partial<RestartableActivity>).prepareUse === "function";
}

export function isRelaunched(usage: ActivityUseConfiguration | undefined): boolean {
  return !!usage?.useRelaunch?.relaunched;
}

/** Clears a cancelled use's state, so a resubmitted config starts afresh. */
export function clearAbandonedUse(...configs: (ActivityUseConfiguration | undefined)[]) {
  for (const config of configs) {
    if (!config) continue;
    delete config.workflow;
    delete config.midiOptions?.workflowOptions?.preSelectedTargetUuids;
  }
}

/**
 * What a call to midi's use was given, by its use key: the restart runs midi's pre-use work on these, as midi's use
 * always did, not on dnd5e's prepared copies (which carry dnd5e's defaults: `configure: true`, the user's targets on
 * the message). The caller's usage gets the use's workflow from it, as before (macros read `config.workflow`).
 */
interface CallerConfigs { usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig }
const callers = new Map<string, CallerConfigs>();
const restarts = new Map<string, Promise<unknown>>();
/** The uses in dnd5e's (marked) use now, by their workflow: what the permanent listeners act for */
const running = new Map<object, UseState>();

/** midi's use, before calling dnd5e's: what it was given, for the restart its key starts. */
export function noteCall(useKey: string, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): void {
  callers.set(useKey, { usage, dialog, message });
}

/** For midi's use(): the restart its call to dnd5e's use started (none: dnd5e's use wasn't cancelled by midi). */
export async function takeRelaunch(useKey: string): Promise<unknown> {
  callers.delete(useKey);
  const restart = restarts.get(useKey);
  restarts.delete(useKey);
  return restart;
}

async function restart(activity: RestartableActivity, { usage, dialog, message }: CallerConfigs): Promise<unknown> {
  const prepared = await activity.prepareUse(usage, dialog, message);
  if (prepared.done) return prepared.result;
  const state = prepared.state;
  const workflow = state.usage.workflow;
  if (workflow) running.set(workflow, state);
  let results: unknown;
  try {
    // The usage card describes the use's targets, not the player's (which an automated use leaves alone)
    state.message = setMessageTargets(state.message ?? {}, workflow);
    results = await state.activity.use({ ...state.usage, useRelaunch: { relaunched: true } }, state.dialog, state.message);
  } catch (err) {
    console.error("midi-qol | use | dnd5e's use failed", err);
    reportServiceProblem("use", activity.uuid, "dnd5e's use failed", err);
    Workflow.removeWorkflow(workflow?.id);
    clearAbandonedUse(state.usage, state.dnd5eUsageConfig);
    return false;
  } finally {
    if (workflow) running.delete(workflow);
  }
  return activity.finishUse(state, results);
}

let listenerId: number | undefined;

function onPreUseActivity(activity: Activity, usageConfig: AnyMutableObject & ActivityUseConfiguration) {
  // The restarted use: this use's own handling (the scaled activity, dnd5e's copy of the usage)
  if (isRelaunched(usageConfig)) {
    const state = usageConfig.workflow ? running.get(usageConfig.workflow) : undefined;
    return state ? state.activity.onUsePreUse(state, activity, usageConfig) : true;
  }
  // Only a call midi's use made (its key): not Cast's delegation, not another type's
  const key = usageConfig.useRelaunch?.useKey;
  const caller = key ? callers.get(key) : undefined;
  if (!key || !caller || !isRestartable(activity)) return true;
  callers.delete(key);
  restarts.set(key, restart(activity, caller));
  return false;
}

function onActivityConsumption(activity: Activity, usageConfig: ActivityUseConfiguration) {
  const state = usageConfig.workflow ? running.get(usageConfig.workflow) : undefined;
  state?.activity.onUseConsumption(state, activity, usageConfig);
}

/** At init, before other modules' listeners where possible: a listener before midi's would see each use twice. */
export function initUseRelaunch() {
  listenerId = Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.activityConsumption", onActivityConsumption);
  Hooks.once("ready", () => {
    const first = Hooks.events["dnd5e.preUseActivity"]?.[0];
    if (first && first.id !== listenerId)
      reportServiceProblem("use", "preUseActivity", "another module's dnd5e.preUseActivity listener runs before midi's: it sees each use twice, once for the call midi cancels and restarts");
  });
}
