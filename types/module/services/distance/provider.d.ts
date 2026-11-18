import { type DistanceOptions, type UnmeasurableReason } from "./service.js";
export declare function unmeasurable(t1: unknown, t2: unknown): Exclude<UnmeasurableReason, "blocked"> | undefined;
/** midi's measurement: the "midi-qol" provider of the distance service */
export declare function midiDistance(t1: any, t2: any, options?: DistanceOptions): number;
/**
 * Compute the height difference between two tokens, accounting for token volume.
 * Returns 0 if elevation ranges overlap, otherwise the gap plus one grid unit.
 */
export declare function computeTokenHeightDifference(token1: Token, token2: Token): number;
/**
 * Combine a flat (horizontal) distance with a height difference using the
 * current diagonal movement rule. Treats the shorter of the two as the
 * "diagonal" component and the remainder as the "straight" component.
 */
export declare function combineDistanceWithHeight(distance: number, heightDifference: number): number;
/** takes two tokens of any size and calculates the distance between them
*** gets the shortest distance betwen two tokens taking into account both tokens size
*** if wallblocking is set then wall are checked
**/
/** -1 when walls block; UNMEASURABLE_DISTANCE (Infinity) when the tokens can't be measured (measureTokens says why) */
export declare function computeDistance(t1: any, t2: any, options?: {
    wallsBlock?: boolean;
    includeCover?: boolean;
    includeElevation?: boolean;
}): number;
export declare function computePerimeterDistance(t1: any, t2: any, options?: DistanceOptions): number;
export declare function midiMeasureDistances(segments: {
    ray: Ray;
}[], options?: any): number[];
