/*
 * Ports (M2 stage 4; deprecated in M5b, until 15.1.0): how a step's waits were carried out. Saves now go through the
 * saveRequests service, reactions through the reaction steps, and the damage card is a direct call; a port a module
 * replaced (Workflow.defaultPorts, workflow.setPort) still takes effect with a warning (Workflow#replacedPort). No Foundry here.
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
