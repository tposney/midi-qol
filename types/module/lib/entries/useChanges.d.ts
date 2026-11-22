import type { Workflow } from "../../Workflow.js";
import type { EntryAction } from "./types.js";
/** Actions run for a use as its activity's own (a drawn table row of the activity's table) */
export declare function runActivityActions(workflow: Workflow, id: string, list: readonly EntryAction[]): Promise<string[]>;
export declare function registerUseChanges(): void;
