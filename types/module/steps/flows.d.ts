export interface Flow {
    id: string;
    label: string;
    /** The fine steps the flow can visit, in their usual order (abort steps excepted: every flow has them). */
    steps: readonly string[];
}
/** Coarse steps: what a module inserts around, each a group of fine steps. */
export declare const COARSE_STEPS: Readonly<Record<string, readonly string[]>>;
/** The coarse step a fine step belongs to. */
export declare function coarseStepOf(stepId: string): string | undefined;
export declare function registerFlow(flow: Flow): void;
export declare function getFlow(id: string): Flow | undefined;
export declare function allFlows(): Flow[];
/** Every flow can abort or be cancelled. */
export declare const ABORT_STEPS: readonly string[];
