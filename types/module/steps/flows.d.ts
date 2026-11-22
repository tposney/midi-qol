import type { Workflow } from "../Workflow.js";
export interface Flow {
    id: string;
    label: string;
    /** The fine steps the flow can visit, in their usual order (abort steps excepted: every flow has them). */
    steps: readonly string[];
}
/** Coarse steps: what a module inserts around, each a group of fine steps. */
export declare const COARSE_STEPS: Readonly<Record<string, readonly string[]>>;
/** A step an insert anchors on: a coarse step's first fine step (before) or last (after); a fine step itself. */
export declare function insertAnchor(id: string, side: "before" | "after"): string;
/** The coarse step a fine step belongs to. */
export declare function coarseStepOf(stepId: string): string | undefined;
/**
 * A flow's own implementation of a step (M5): the same step id, hooks, passes and module changes, another `run`.
 * `base()` runs the step's own implementation, as `super.WorkflowState_<name>()` did in the subclass that overrode it.
 */
export type FlowVariant<W extends Workflow = Workflow> = {
    run(ctx: {
        workflow: W;
        base(): Promise<unknown>;
    }): unknown;
}["run"];
export declare function registerFlowVariant<W extends Workflow>(flowId: string, stepId: string, run: FlowVariant<W>): void;
export declare function flowVariant(flowId: string | undefined, stepId: string): FlowVariant | undefined;
export declare function registerFlow(flow: Flow): void;
export declare function getFlow(id: string): Flow | undefined;
export declare function allFlows(): Flow[];
/** Every flow can abort or be cancelled. */
export declare const ABORT_STEPS: readonly string[];
