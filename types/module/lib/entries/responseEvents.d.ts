import { Workflow } from "../../Workflow.js";
import type { ResponseAnswer } from "../../services/responses/service.js";
export declare const RESPONSE_EVENTS: string[];
export declare function eventOfTrigger(triggerType: string): string | undefined;
/** The event of a event being raised at a reaction site (reaction conditions read it as `event`) */
export declare function eventDataFor(workflow: unknown, target: TokenDocument.Implementation | undefined, eventId: string | undefined): Record<string, unknown> | undefined;
/** Whether the creature has entries for the event (an event costing work, damage worked out, only then) */
export declare function hasEventEntries(workflow: Workflow, target: TokenDocument.Implementation, eventId: string): boolean;
/**
 * A target event at a reaction site: the creature's automatic entries, then `ask` (midi's reaction prompt, which shows
 * its offers), then its plain asks if no prompt showed them. What the prompt answered, with an AC change from the
 * automatic entries folded in.
 */
export declare function targetEvent(workflow: Workflow, target: TokenDocument.Implementation | undefined, eventId: string, event: Record<string, unknown>, ask?: () => Promise<ResponseAnswer | undefined>): Promise<ResponseAnswer | undefined>;
export declare function registerResponseEvents(): void;
