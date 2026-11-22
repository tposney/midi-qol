import type { Workflow } from "../../Workflow.js";
import type { FoundEntry } from "./types.js";
import type { EventContext } from "./engine.js";
/** The use as entries read it */
export declare function useView(workflow: Workflow): Record<string, unknown>;
/** The use that applied an effect: from DAE's application record (castData) and the effect's origin */
export declare function originView(effect: ActiveEffect.Implementation, activity: unknown, actor: Actor.Implementation | undefined): Record<string, unknown>;
/** Whether two dice of `faces` faces in the roll show the same number (Chromatic Orb's leap) */
export declare function duplicates(roll: Roll | undefined | null, faces?: number): boolean;
/** Added to an entry's condition data (conditionDataFor) */
export declare function entryConditionExtras(f: FoundEntry, context: EventContext, applyingActivity: unknown, originActor: Actor.Implementation | undefined): {
    extra: Record<string, unknown>;
    entry: Record<string, unknown>;
};
/** After createConditionData (which rebuilds `actor`): the actor's economy */
export declare function addEconomy(conditionData: Record<string, unknown>, actor: Actor.Implementation | undefined): void;
