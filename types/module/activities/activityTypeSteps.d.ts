import { type ActivityCapability } from "../steps/steps.js";
/** What an activity type can do, from its schema's fields */
export declare function activityTypeCapabilities(type: string): ActivityCapability[];
export interface ActivityTypeSteps {
    type: string;
    automated: boolean;
    /** The use is handed to another activity, which runs its own steps */
    handsOverTo?: string;
    capabilities: ActivityCapability[];
    /** Step id → "acts" (always for the type) or "data" (when the use has it: an area, or a paired other activity) */
    steps: Record<string, "acts" | "data">;
}
/**
 * Each activity type against the standard flow's steps, with the steps modules insert for every use at their anchors
 * (a change's `when` may still leave them out of a use), then the reaction steps
 */
export declare function activityTypeSteps(flowId?: string): {
    steps: string[];
    types: ActivityTypeSteps[];
};
/**
 * The table as Markdown: ✔ the step acts for the type, ◐ when the use's data has it (an area, a paired activity's
 * damage or save), blank: it passes the use on; then the types the table leaves out (handed over, not automated).
 */
export declare function activityTypeStepsMarkdown(flowId?: string): string;
