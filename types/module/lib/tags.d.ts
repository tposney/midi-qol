import type { Workflow } from "../Workflow.js";
export type TagValue = boolean | number | string | ReadonlySet<string> | undefined;
export type TagGroup = "use" | "target" | "relation" | "result" | string;
export interface TagContext {
    workflow: Workflow;
    /** The target's TokenDocument, for a target, relation or result tag */
    target?: TokenDocument.Implementation;
}
export interface TagDefinition {
    group: TagGroup;
    label: string;
    kind: "snapshot" | "derived";
    /** Needs a target */
    perTarget?: boolean;
    compute: (context: TagContext) => TagValue;
}
interface RegisteredTag extends TagDefinition {
    name: string;
    source: string;
}
/** One stored snapshot (a list: tag names and uuids have dots, which an update reads as a path) */
export interface TagSnapshot {
    tag: string;
    target: string;
    value: boolean | number | string | string[] | null;
    set?: boolean;
}
export declare function registerTag(name: string, definition: TagDefinition, source?: string): void;
export declare function tagDefinition(name: string): Readonly<RegisteredTag> | undefined;
export declare function tagNames(): string[];
/** Tags a module replaced: midi's or another module's (for the TroubleShooter) */
export declare function replacedTags(): readonly {
    name: string;
    source: string;
    by: string;
}[];
/** The use has reached the point its snapshot tags are fixed at: its attack roll, saves or damage roll */
export declare function useResolved(workflow: Workflow): boolean;
/** A tag's value for a use (and target); undefined for an unknown tag or one that needs a target it wasn't given */
export declare function tagValue(workflow: Workflow, name: string, target?: TokenDocument.Implementation): TagValue;
/**
 * The tags as condition data: `tags.target.size`, `tags.use.properties.has("hvy")`; each worked out when read.
 * Names are `group.name`; a deeper name (`my-module.marked.by`) nests.
 */
export declare function tagsView(workflow: Workflow, target?: TokenDocument.Implementation): Record<string, unknown>;
export declare function registerMidiTags(): void;
export {};
