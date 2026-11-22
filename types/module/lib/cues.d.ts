import type { Workflow } from "../Workflow.js";
import { type TargetOutcome } from "./outcomes.js";
export type ChannelOverride = "default" | "none" | {
    playlist: string;
    sound: string;
} | string;
export interface Cue {
    cue: string;
    /** The use's id (the workflow), none for a cue outside a use */
    useId?: string;
    /** Token document uuids */
    source?: string;
    targets: string[];
    outcomes: TargetOutcome[];
    activity?: string;
    item?: string;
    tags: {
        kind?: string;
        attack?: string;
        school?: string;
        damageTypes: string[];
        spellLevel?: number;
        actionType?: string;
        defaultDamageType?: string;
    };
    /** What midi's sound lookup keys on */
    sound: {
        actorType?: string;
        itemType?: string;
        subtype?: string;
        baseItem?: string;
    };
    templates: string[];
    critical?: boolean;
    fumble?: boolean;
    /** The use's override per channel ("none": nothing on that channel) */
    presentation?: Partial<Record<"visual" | "sound" | "text", ChannelOverride>>;
}
/** A use's cue as data */
export declare function cueFor(workflow: Workflow, cue: string): Cue;
/** Present on this client and send to the other active clients */
export declare function raiseCue(cue: Cue): void;
/** The step pass hook (Workflow's engine host): the cues of this pass */
export declare function raiseStepCues(workflow: Workflow, prePost: "pre" | "post", step: string | undefined): void;
/** A cue outside a use: a creature dropped to 0 hit points */
export declare function raiseCreatureCue(cue: string, token: TokenDocument.Implementation | undefined): void;
export declare function registerCues(): void;
