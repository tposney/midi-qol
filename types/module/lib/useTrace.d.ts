import { type Workflow } from "../Workflow.js";
import { type TargetOutcome } from "./outcomes.js";
export interface UseTraceTarget {
    name: string | null;
    uuid: string | null;
    hit: boolean;
    saved: boolean;
    failedSave: boolean;
    /** HP and temporary HP the use took (negative: healed) */
    damage?: {
        hp: number;
        temp: number;
        newHP: number;
    };
    /** The outcome record (M26) */
    outcome?: TargetOutcome;
}
export interface UseTrace {
    use: {
        item?: string;
        activity?: string;
        actor?: string;
        card?: string;
        flow: string;
        options: unknown;
    };
    steps: Workflow["trace"];
    outcome: {
        result: string;
        aborted: boolean;
        critical: boolean;
        fumble: boolean;
        attackTotal?: number;
        damageTotal?: number;
        targets: UseTraceTarget[];
    };
    recordedAt: string;
    midi: string;
}
export declare function useTrace(workflow: Workflow): UseTrace;
/** The use's trace as a JSON file (the browser's download; `download: false` only returns it, as for a bug report) */
export declare function saveUseTrace(workflow: Workflow, { download }?: {
    download?: boolean;
}): {
    filename: string;
    json: string;
};
