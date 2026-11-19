import type { QueueSaveRollOptions } from "../../../globals.js";
import type { Workflow } from "../../Workflow.js";
import { defineService } from "../../api/services.js";
/** One target's save: who rolls it, what for, as midi decided before asking (after midi-qol.preTargetSave) */
export type SaveRequest = Omit<QueueSaveRollOptions, "moduleRequests">;
/** What a provider gives for a target: its roll (or rolls), and a request card midi deletes once every save is in */
export interface SaveRequestEntry {
    promise: Promise<Roll[] | Roll | null> | null;
    requestCard?: Promise<ChatMessage | undefined>;
    /** Asked through the request core, which puts it on the player list itself */
    asked?: boolean;
}
export interface SaveRequestContext {
    /** The use's workflow (midi's providers call its request builders) */
    workflow: Workflow;
    /** Listen to a hook until every save of the use is in (once per key: providers sharing a listener register it once) */
    listen(hook: string, key: string, fn: (...args: never[]) => unknown): void;
}
export interface SaveRequestProvider {
    /** Another module's provider takes a target it claims, whatever midi's settings say */
    claims?(request: SaveRequest, context: SaveRequestContext): boolean;
    /** Ask for every one of `requests` at once; an entry per request, in the same order */
    request(requests: SaveRequest[], context: SaveRequestContext): SaveRequestEntry[];
}
declare module "../../api/services.js" {
    interface MidiServices {
        saveRequests: SaveRequestProvider;
    }
}
export declare let saveRequestsService: ReturnType<typeof defineService<SaveRequestProvider>>;
export declare function defineSaveRequestsService(): void;
/** midi's providers, by id */
export declare const MIDI_SAVE_PROVIDERS: {
    readonly roll: "midi-qol.roll";
    readonly player: "midi-qol.player";
    readonly chat: "midi-qol.chat";
    readonly monks: "midi-qol.monks-tokenbar";
    readonly flash: "midi-qol.flash-rolls";
    readonly epic: "midi-qol.epic-rolls";
};
/** The midi provider today's settings choose for a request (the order the routing always had: first match wins) */
export declare function settingsProviderFor(request: SaveRequest): string;
/**
 * Ask for every request's save: each target's provider (a claiming module's, else the settings'), each provider once with
 * its batch. Entries come back in the requests' order.
 */
export declare function requestSaves(requests: SaveRequest[], context: SaveRequestContext): SaveRequestEntry[];
