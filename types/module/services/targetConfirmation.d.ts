import type { Activity } from "../../globals.js";
import { defineService } from "../api/services.js";
import type { TargetConfirmationOptions } from "../apps/TargetConfirmation.js";
export interface TargetConfirmationRequest {
    activity: Activity;
    /** "preTemplate": before the use; "postTemplate": after an area was placed. */
    phase: "preTemplate" | "postTemplate";
    options: TargetConfirmationOptions;
}
export interface TargetConfirmationProvider {
    confirm(request: TargetConfirmationRequest): Promise<boolean>;
}
declare module "../api/services.js" {
    interface MidiServices {
        targetConfirmation: TargetConfirmationProvider;
    }
}
export declare let targetConfirmationService: ReturnType<typeof defineService<TargetConfirmationProvider>>;
/** `midiConfirm` is midi's dialog (passed in to keep this module free of an import cycle with activityHelpers). */
export declare function defineTargetConfirmationService(midiConfirm: (activity: Activity, options: TargetConfirmationOptions) => Promise<boolean>): void;
/** The active provider's answer (midi's dialog when no other provider is registered). */
export declare function confirmTargets(activity: Activity, phase: TargetConfirmationRequest["phase"], options?: TargetConfirmationOptions): Promise<boolean>;
