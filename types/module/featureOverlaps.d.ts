import { TroubleShooter } from "./apps/TroubleShooter.js";
export interface ActiveOverlap {
    id: string;
    feature: string;
    advice: string;
    sides: {
        source: string;
        sourceTitle: string;
        setting: string;
    }[];
    /** Changes when the systems involved change, so a dismissed overlap comes back. */
    signature: string;
    acknowledged: boolean;
    fix?: () => Promise<void>;
}
export declare function activeFeatureOverlaps(): ActiveOverlap[];
/** Whisper the active GM a card listing overlaps not yet dismissed or already reported. */
export declare function notifyFeatureOverlaps(): Promise<void>;
/** Re-check once a setting change or status list rebuild has settled. */
export declare const recheckFeatureOverlaps: import("fvtt-types/src/foundry/common/utils/helpers.mjs").DebounceReturn<() => Promise<void>>;
export declare function setupFeatureOverlaps(): void;
/** TroubleShooter: one warning per active overlap, dismissed ones included. */
export declare function featureOverlapProblems(): {
    moduleId: string;
    severity: "Warn";
    problemSummary: string;
    fixer: string;
    problemDetail: string;
    fixerFunc: ((app: TroubleShooter) => Promise<void>) | undefined;
}[];
