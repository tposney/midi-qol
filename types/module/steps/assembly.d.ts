export type StepLayer = "global" | "call";
export type StepChange = 
/** Run `step` before or after the anchor step. */
{
    kind: "insert";
    step: string;
    before?: string;
    after?: string;
    layer: StepLayer;
    priority?: number;
    source?: string;
}
/** Run `step` instead of the anchor (`target`). */
 | {
    kind: "replace";
    target: string;
    step: string;
    layer: StepLayer;
    priority?: number;
    source?: string;
}
/** Run `wrapper` around the anchor (it calls the anchor's run). */
 | {
    kind: "wrap";
    target: string;
    wrapper: string;
    layer: StepLayer;
    priority?: number;
    source?: string;
}
/** Don't run the anchor: the use goes on to the step after it in its flow. */
 | {
    kind: "remove";
    target: string;
    layer: StepLayer;
    priority?: number;
    source?: string;
};
export interface AnchorChanges {
    before: string[];
    after: string[];
    /** The step that runs instead of the anchor. */
    replacement?: string;
    /** Outermost first. */
    wraps: string[];
    removed: boolean;
}
export interface StepConflict {
    anchor: string;
    kind: "replace" | "remove";
    /** The change that wins. */
    winner: string;
    /** The changes that lose to it. */
    losers: string[];
}
export interface AssembledSteps {
    anchors: Record<string, AnchorChanges>;
    conflicts: StepConflict[];
}
export declare function assembleSteps(changes: readonly StepChange[]): AssembledSteps;
/** The step after `step` in a flow's list (where a removed step's use goes on to). */
export declare function stepAfterInFlow(flow: readonly string[], step: string): string | undefined;
