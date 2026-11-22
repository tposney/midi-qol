import { defineService } from "../../api/services.js";
import type { Cue } from "../../lib/cues.js";
export type PresenterChannel = "visual" | "sound" | "text";
export declare const PRESENTER_CHANNELS: readonly PresenterChannel[];
export interface Presenter {
    channel: PresenterChannel;
    /** Whether it plays this cue (the first that claims it in the user's order does) */
    claims(cue: Cue): boolean | Promise<boolean>;
    /** Stage 1: not awaited by the use */
    play(cue: Cue): unknown;
}
declare module "../../api/services.js" {
    interface MidiServices {
        presenters: Presenter;
    }
}
export declare let presentersService: ReturnType<typeof defineService<Presenter>> | undefined;
export declare function definePresentersService(): void;
/** Present a cue on this client: per channel, the first presenter that claims it */
export declare function presentCue(cue: Cue): Promise<void>;
