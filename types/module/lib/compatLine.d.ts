/** The 14.x releases midi-next can match, oldest first */
export declare const COMPATIBILITY_LINES: readonly ["14.7.0", "14.8.0", "14.9.0"];
export type CompatibilityLine = typeof COMPATIBILITY_LINES[number];
/** At init, before anything reads the line (token set mode, deprecations): a change takes effect on reload */
export declare function setupCompatibilityLine(): void;
/** The 14.x release whose deprecation state midi-next matches */
export declare function compatibilityLine(): CompatibilityLine;
/** For tests: the line for this session only (not stored) */
export declare function setCompatibilityLineForSession(value: CompatibilityLine): void;
/** A 14.x deprecation whose `until` the line has reached: gone, as in that release. Other untils never are. */
export declare function isRemoved(until: string | undefined): boolean;
/**
 * A deprecated thing being used: warns (Foundry's compatibility warning) while the line is before its `until` and
 * returns true; returns false, without a warning, once the line has reached it: the caller then acts as that release
 * does (a getter gives undefined, a function throws, a setter does nothing).
 */
export declare function deprecation(message: string, options: {
    since: string;
    until?: string;
    once?: boolean;
    details?: string;
}): boolean;
/** What a removed function throws: its name and what replaces it */
export declare function removedError(what: string, until: string, instead: string): Error;
