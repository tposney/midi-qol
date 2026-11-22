import type { Workflow } from "../../Workflow.js";
import type { CoverLevel } from "../../services/cover/service.js";
export interface EntryCover {
    level?: CoverLevel;
    ignore?: CoverLevel[];
}
/** What the entries said about the target's cover from this use */
export declare function entryCoverFor(workflow: Workflow | undefined, target: {
    uuid?: string | null;
} | undefined): EntryCover | undefined;
/** The greater of two cover levels */
export declare function maxCover(a: CoverLevel, b: CoverLevel | undefined): CoverLevel;
/** Whether the creature (an actor's uuid) gains nothing from Invisible against or in this use */
export declare function invisibilityDenied(workflow: Workflow | undefined, actor: Actor.Implementation | null | undefined): boolean;
export declare function registerServiceEvents(): void;
