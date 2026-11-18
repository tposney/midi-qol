/*
 * Ports: how a step's waits are carried out (M2 stage 4). A step asks its workflow's port; midi's own code is the
 * default (Workflow.defaultPorts) and a workflow can be given another for one use (workflow.setPort). M3 turns the
 * replaceable ones into services (saveRequests, reactions). No Foundry here.
 */

export interface WorkflowPorts {
  /** Ask the targets for their saves and wait for them (default: the workflow's checkSaves). */
  requestSaves(workflow: unknown, ...args: unknown[]): Promise<unknown>;
  /** Offer a target its reactions to a trigger and wait for the answer (default: doReactions). */
  askReactions(...args: unknown[]): Promise<any>;
  /** Have the GM create the damage card (and apply the damage) and wait for it (default: the GM socket call). */
  applyDamageCard(data: Record<string, unknown>): Promise<unknown>;
}

export type PortName = keyof WorkflowPorts;
export const PORT_NAMES: readonly PortName[] = ["requestSaves", "askReactions", "applyDamageCard"];
