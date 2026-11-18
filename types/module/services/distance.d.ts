import { defineService } from "../api/services.js";
import type { DistanceOptions } from "../utils.js";
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
declare module "../api/services.js" {
    interface MidiServices {
        distance: DistanceProvider;
    }
}
type Measure = (t1: unknown, t2: unknown, options?: DistanceOptions) => number;
export declare let distanceService: ReturnType<typeof defineService<DistanceProvider>>;
/** `measure` is midi's own measurement and `documentOf` turns a token reference into its document (passed in to keep this module free of an import cycle with utils). */
export declare function defineDistanceService(measure: Measure, documentOf: (token: unknown) => TokenDocument.Implementation | undefined): void;
/** The active provider's measure (midi's when it is the provider, or another's answer is undefined). */
export declare function measureDistance(t1: unknown, t2: unknown, options?: DistanceOptions): number;
export {};
