import { defineService } from "../../api/services.js";
export interface DistanceOptions {
    /** If true, return -1 if walls block line of sight between closest points */
    wallsBlock?: boolean;
    /** If true, include cover calculations (for modules like levelsautocover) */
    includeCover?: boolean;
    /** If true, include elevation difference in distance calculation */
    includeElevation?: boolean;
}
/**
 * Why two tokens can't be measured. `blocked`: walls block. The others: there is nothing to measure between them.
 * `noPosition`: no token (midi's token for an actor with none on the scene sits at the prototype's 0,0);
 * `notDrawn`: on the viewed scene but not on the canvas (another level), which midi can only measure on the canvas.
 */
export type UnmeasurableReason = "noCanvas" | "noPosition" | "differentScene" | "notDrawn" | "blocked";
export type TokenMeasure = {
    ok: true;
    distance: number;
} | {
    ok: false;
    reason: UnmeasurableReason;
};
/** getDistance / computeDistance for tokens that can't be measured: out of any range, as `d <= range` and `d > range` both read it */
export declare const UNMEASURABLE_DISTANCE: number;
/**
 * The distance between two tokens (Tokens, TokenDocuments or uuids), as getDistance measures it, or why it can't be
 * measured: walls block, or the tokens are on different scenes, not on the canvas, or one has no token.
 */
export declare function measureTokens(t1: unknown, t2: unknown, options?: DistanceOptions): TokenMeasure;
/**
 * -1 when walls block; UNMEASURABLE_DISTANCE (Infinity) when the tokens can't be measured (measureTokens says why).
 * Asks the distance service's provider (midi's own measure, midiDistance, unless another module provides one).
 */
export declare function getDistance(t1: any, t2: any, options?: DistanceOptions): number;
export interface DistanceQuery {
    from: TokenDocument.Implementation;
    to: TokenDocument.Implementation;
    options: DistanceOptions;
    /** What the caller passed (a Token, a document, a uuid, or midi's stand-in token for an actor not on the scene). */
    refs: readonly [unknown, unknown];
}
export interface DistanceProvider {
    measure(query: DistanceQuery): number | undefined;
}
declare module "../../api/services.js" {
    interface MidiServices {
        distance: DistanceProvider;
    }
}
export declare let distanceService: ReturnType<typeof defineService<DistanceProvider>>;
export declare function defineDistanceService(): void;
/** The active provider's measure (midi's when it is the provider, or another's answer is undefined). */
export declare function measureDistance(t1: unknown, t2: unknown, options?: DistanceOptions): number;
