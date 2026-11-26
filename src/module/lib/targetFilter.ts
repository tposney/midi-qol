import type { Activity, TokenOrDocument } from "../../globals.js";
import { createConditionData, evalCondition } from "../utils.js";
import { Workflow } from "../Workflow.js";
import { tokenFor } from "./tokenResolver.js";

/*
 * The activity's target condition (`midiProperties.targetCondition`): which creatures it may target, beyond dnd5e's
 * target type (ally, enemy, creature...). Applied wherever a use's targets are chosen: the user's targets (dropped, or
 * marked not allowed in the target confirmation), an area's or a range's, the creatures its region's rules affect
 * later. The condition reads the creature as `target`; `target.chosen` is one the user targeted before the use
 * (Spirit Guardians' "designate creatures to be unaffected").
 */

export type TokenFilter = (token: TokenOrDocument) => boolean;

export interface TargetConditionContext {
  activity?: Activity;
  actor?: Actor.Implementation | null;
  item?: Item.Implementation;
  workflow?: Workflow;
  /** Token UUIDs chosen before the use */
  chosen?: Iterable<string>;
}

export function activityTargetCondition(activity: Activity | undefined): string {
  const condition = (activity?.midiProperties as { targetCondition?: unknown } | undefined)?.targetCondition;
  return typeof condition === "string" ? condition.trim() : "";
}

/** Whether a creature meets a target condition (a condition that can't be evaluated lets it in: it is reported) */
export function meetsTargetCondition(condition: string, token: TokenOrDocument, context: TargetConditionContext): boolean {
  if (!condition) return true;
  const document = tokenFor(token);
  if (!document) return false;
  const data = createConditionData({ workflow: context.workflow, activity: context.activity, actor: context.actor ?? context.activity?.actor ?? null, item: context.item, target: document }) as Record<string, unknown> & { target?: Record<string, unknown> };
  if (data.target) data.target.chosen = new Set(context.chosen ?? []).has(document.uuid ?? "");
  return !!evalCondition(condition, data, { errorReturn: true, async: false });
}

/** The activity's target condition as a filter (the use's workflow, if there is one, gives the chosen creatures), or none */
export function activityTargetFilter(activity: Activity | undefined, workflow?: Workflow): TokenFilter | undefined {
  const condition = activityTargetCondition(activity);
  if (!condition || !activity) return undefined;
  const use = workflow ?? Workflow.workflowFor(activity);
  const chosen = use?.preSelectedTargets?.documents.map(document => document.uuid).filter((uuid): uuid is string => !!uuid) ?? [];
  const seen = new Map<string, boolean>();
  return token => {
    const uuid = tokenFor(token)?.uuid ?? "";
    if (!seen.has(uuid)) seen.set(uuid, meetsTargetCondition(condition, token, { activity, workflow: use, chosen }));
    return seen.get(uuid)!;
  };
}
