import type { Activity } from "../../../globals.js";
import type { Workflow } from "../../Workflow.js";
import type { NearDisposition, TriggerSpec } from "../chain.js";
import { isActivityRef } from "./activityActions.js";
import { collectEntries, registerActivityEntryReader, runEvent, type ActionRun } from "./engine.js";
import type { Entry } from "./types.js";
import { useContext } from "./useEvents.js";

/*
 * Trigger Activity as entries: an activity's trigger (midiProperties, still where it is stored and edited) is read as
 * an entry on `use.completed` whose action is `use: "activity:<id>"` with the trigger's targets, roll-as, condition,
 * near and chain settings (Workflow#triggerActivity). Any entry can use the same action at a use's events: at
 * `use.completed` it runs at once; at an earlier event it is queued and run when the use completes, `to: "target"`
 * meaning that event's target and `near` around it.
 */

export const TRIGGER_ENTRY_ID = "trigger";

/** An activity's own trigger as the entry midi reads it as */
export function triggerEntries(activity: Activity): Entry[] {
  const props = activity.midiProperties;
  if (!props?.triggeredActivityId || props.triggeredActivityId === "none") return [];
  const to = props.triggeredActivityTargets ?? "targets";
  return [{ id: TRIGGER_ENTRY_ID, on: "use.completed", do: [{
    use: `activity:${props.triggeredActivityId}`, to, rollAs: props.triggeredActivityRollAs ?? "self",
    ...(props.triggeredActivityConditionText ? { condition: props.triggeredActivityConditionText } : {}),
    consume: props.triggeredActivityConsume ?? true, configure: props.triggeredActivityConfigure ?? true,
    ...(props.triggeredActivityChainLimit?.trim() ? { chain: props.triggeredActivityChainLimit.trim() } : {}),
    ...(to === "near" ? { near: { within: Number(props.triggeredActivityNearWithin ?? 30), max: props.triggeredActivityNearMax || "1",
      disposition: props.triggeredActivityNearDisposition ?? "any" } } : {})
  }] }];
}

/** A `use` action at a use event as a trigger spec (`to: "target"`: the event's target) */
function specOf(run: ActionRun): TriggerSpec {
  const a = run.action as Record<string, unknown>;
  const near = a.near && typeof a.near === "object" ? a.near as { within?: unknown, max?: unknown, disposition?: unknown } : undefined;
  const target = run.context.target;
  const spec: TriggerSpec = {
    activity: String(a.use), to: typeof a.to === "string" ? a.to : "targets", rollAs: typeof a.rollAs === "string" ? a.rollAs : "self",
    condition: typeof a.condition === "string" ? a.condition : undefined,
    consume: a.consume !== false, configure: a.configure !== false,
    chain: typeof a.chain === "string" || typeof a.chain === "number" ? String(a.chain) : undefined,
    ...(near ? { near: { within: Number(near.within ?? 30), max: near.max === undefined ? "1" : String(near.max),
      disposition: (typeof near.disposition === "string" ? near.disposition : "any") as NearDisposition } } : {})
  };
  if (spec.to === "target") spec.targetUuids = target?.uuid ? [target.uuid] : [];
  if (spec.to === "near" && target?.uuid) spec.anchor = target.uuid;
  return spec;
}

const queued = new WeakMap<Workflow, TriggerSpec[]>();

/** The `use` action at a use event: run at use.completed, queued until then at an earlier one */
export async function useActivityAction(run: ActionRun): Promise<void> {
  const workflow = run.context.workflow;
  if (!workflow || !isActivityRef(run.action.use)) return;
  const spec = specOf(run);
  // An activity of the entry's own item (an owner entry on a feature: Superior Hunter's Prey), not the used item's
  const document = run.found.document as { item?: Item.Implementation, parent?: unknown };
  const home = run.found.document instanceof Item ? run.found.document : document.item ?? (document.parent instanceof Item ? document.parent : undefined);
  const ref = String(run.action.use).slice("activity:".length);
  if (ref !== "this" && home && home.id !== workflow.item?.id) {
    // @ts-expect-error no dnd5e-types
    const activities = home.system.activities as { find(fn: (a: { id: string, identifier?: string, uuid: string }) => boolean): { uuid: string } | undefined } | undefined;
    const own = activities?.find(a => a.id === ref) ?? activities?.find(a => a.identifier === ref);
    if (own) spec.activity = own.uuid;
  }
  if (run.eventId === "use.completed") { await workflow.triggerActivity(spec); return; }
  const list = queued.get(workflow) ?? [];
  list.push(spec);
  queued.set(workflow, list);
}

/** `use.completed`: the use's card is complete (Trigger Activity's moment); then what earlier events queued */
export async function raiseUseCompleted(workflow: Workflow): Promise<void> {
  if (workflow.readOnly) return;
  const context = useContext(workflow);
  if (collectEntries("use.completed", context).length) await runEvent("use.completed", context);
  const list = queued.get(workflow);
  queued.delete(workflow);
  for (const spec of list ?? []) await workflow.triggerActivity(spec);
}

export function registerTriggerEntries() {
  registerActivityEntryReader("midi-qol.triggeredActivity", triggerEntries);
}
