import type { Workflow } from "../../Workflow.js";
import type { Activity } from "../../../globals.js";
export interface UseCost {
    action: number;
    bonus: number;
    reaction: number;
}
export interface CostQuery {
    activity: Activity;
    actor: Actor.Implementation;
    workflow?: Workflow;
    /** The cost so far (midi's base, then earlier contributors) */
    cost: UseCost;
}
/** Returns the cost to use instead, or undefined to leave it */
export type CostContributor = (query: CostQuery) => UseCost | undefined;
export declare function registerCostContributor(id: string, contributor: CostContributor, options?: {
    priority?: number;
}): () => void;
/** What `activity` costs `actor` (MidiQOL.economy.cost) */
export declare function cost(activity: Activity, workflow?: Workflow): UseCost;
/** Charge the use's cost on the ledger; returns what was charged */
export declare function chargeUse(workflow: Workflow): Promise<UseCost>;
export declare const costsApi: {
    register: typeof registerCostContributor;
    entries: () => string[];
};
