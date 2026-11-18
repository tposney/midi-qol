/** Narrowest wins: a module's global change, then the item's, the activity's, the call's (completeActivityUse). */
export type StepLayer = "global" | "item" | "activity" | "call";
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
/** A change as a module or a call gives it: no layer (the caller sets it). */
export type StepChangeInput = {
    [K in StepChange["kind"]]: Omit<Extract<StepChange, {
        kind: K;
    }>, "layer">;
}[StepChange["kind"]];
/**
 * Checked and normalised changes for a layer: inserts anchored on a coarse step go before its first fine step or after
 * its last (`insertAnchor`); replace, wrap and remove need a fine step. A change that isn't one is dropped and described.
 */
export declare function normaliseChanges(input: readonly unknown[], layer: StepLayer, options?: {
    insertAnchor?: (id: string, side: "before" | "after") => string;
    isCoarse?: (id: string) => boolean;
}): {
    changes: StepChange[];
    problems: string[];
};
/** Every step a use's changes run (inserted, replacements, wrappers). */
export declare function stepsUsed(changes: readonly StepChange[]): string[];
/**
 * A use's steps in the order they'd run if every step went on to the next in `flow`: inserts around their anchors,
 * replacements in their place (`a -> b` for b replacing a), wraps as `[w1, w2](step)`, removed steps left out.
 */
export declare function previewSteps(flow: readonly string[], assembled: AssembledSteps): string[];
/** The step after `step` in a flow's list (where a removed step's use goes on to). */
export declare function stepAfterInFlow(flow: readonly string[], step: string): string | undefined;
