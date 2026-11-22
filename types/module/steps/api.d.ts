import { type AssembledSteps, type StepChange, type StepConflict } from "./assembly.js";
import { type ActivityCapability, type Step, type StepContext, type StepUse } from "./steps.js";
type When = {
    when?: (workflow: StepUse) => boolean;
    priority?: number;
    source?: string;
};
export declare const stepsApi: {
    /** A module's step: `run` returns the step to go to, or nothing to go on with the move it was inserted into. */
    register(step: {
        id: string;
        name?: string;
        reads?: string[];
        writes?: string[];
        actsOn?: ActivityCapability[];
        run: (ctx: StepContext) => unknown;
    }): void;
    unregister(id: string): boolean;
    insert(change: {
        step: string;
        before?: string;
        after?: string;
    } & When): void;
    replace(change: {
        target: string;
        step: string;
    } & When): void;
    wrap(change: {
        target: string;
        wrapper: string;
    } & When): void;
    remove(change: {
        target: string;
    } & When): void;
    /** Remove the changes a source made. */
    removeChanges(source: string): number;
    get(id: string): Step | undefined;
};
/** The used activity and its item: their stored changes are the item and activity layers. */
export interface StepSources {
    item?: {
        uuid?: string | null;
        name?: string | null;
        flags?: Record<string, any>;
    } | null;
    activity?: {
        uuid?: string | null;
        name?: string | null;
        midiSteps?: unknown;
    } | null;
}
/**
 * A use's changes: the global changes that apply to it, the item's and the activity's stored ones, and its call's
 * (checked; problems reported). The used activity and its item only: not the other activity's or the ammunition's.
 */
export declare function useStepChanges(workflow: StepUse, callChanges: readonly unknown[] | undefined, sources?: StepSources): StepChange[];
/** Reports a use's conflicts and replacements that leave out what the step they replace writes (once a session each). */
export declare function reportAssembly(assembled: AssembledSteps): void;
/** The steps of a use's changes that aren't registered on this client. */
export declare function missingSteps(changes: readonly StepChange[]): string[];
export interface FlowPreview {
    flow: string;
    steps: string[];
    conflicts: StepConflict[];
    missing: string[];
}
/**
 * What a use of `activity` would run: its flow's steps with the global changes that apply (their `when` sees a stand-in
 * with activity, item, actor and workflowOptions) and `options.steps`, each step going on to the next in the flow.
 */
export declare function previewFlow(activity: any, options: {
    flow?: string;
    steps?: unknown[];
}, defaultFlow: string): FlowPreview;
export {};
