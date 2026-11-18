import type { ActivityUseConfiguration } from "../../globals.js";
/**
 * midi-next spike (option B): dnd5e's Activity#use runs unchanged; its synchronous preUseActivity hook cancels a midi
 * activity's use and midi starts the same use again, marked, after any async work. Off unless `enabled`.
 * `keepResult`: the cancelled call returns the relaunched use's result (only possible while midi still overrides use).
 */
export declare const useRelaunchSpike: {
    enabled: boolean;
    keepResult: boolean;
    log: {
        event: string;
        activity: string;
        detail?: unknown;
    }[];
};
export declare function isRelaunched(usage: ActivityUseConfiguration | undefined): boolean;
/** For the mixin's use(): the relaunch started by the call it just made, if dnd5e cancelled that call. */
export declare function takeRelaunch(useKey: string): Promise<unknown> | undefined;
export declare function initUseRelaunch(): void;
