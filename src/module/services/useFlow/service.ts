import { defineService, reportServiceProblem } from "../../api/services.js";
import type { Activity } from "../../../globals.js";
import type { Workflow } from "../../Workflow.js";

/*
 * useFlow (contributors; M30): which flow a use runs. Before a use starts its contributors may claim it, highest
 * priority first; the first claim gives the workflow class (its static flowId names the flow's steps), else the
 * caller's class (usage.midi.workflowClass, MidiQOL.workflowClass). midi's claims: active defence (an optional rule,
 * src/rules/activeDefence) and saves before damage.
 *
 *   MidiQOL.services.register("useFlow", "my-module.contest", {
 *     for: ({ activity }) => activity.type === "check" ? { workflowClass: MyContestWorkflow } : undefined
 *   }, { priority: 30 });
 */

type WorkflowClass = typeof Workflow;

export interface UseFlowQuery {
  activity: Activity;
  actor?: Actor.Implementation | null;
  /** The class the caller asked for */
  requested: WorkflowClass;
}

export interface UseFlowContributor {
  for(query: UseFlowQuery): { workflowClass: WorkflowClass } | undefined;
}

declare module "../../api/services.js" {
  interface MidiServices { useFlow: UseFlowContributor }
}

export let useFlowService: ReturnType<typeof defineService<UseFlowContributor>>;

export function defineUseFlowService() {
  useFlowService = defineService<UseFlowContributor>("useFlow", {
    kind: "contributors",
    description: "Which flow a use runs (active defence, saves before damage, a module's own)"
  });
}

/** The workflow class a use runs: the first claim, else the one requested */
export function useWorkflowClass(query: UseFlowQuery): WorkflowClass {
  for (const contributor of useFlowService?.all() ?? []) {
    try {
      const claim = contributor.for(query);
      if (claim) return claim.workflowClass;
    } catch (err) { reportServiceProblem("useFlow", "contributor", "for failed", err); }
  }
  return query.requested;
}
