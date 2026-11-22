import { Activity } from "../../../globals.js";
import { defineService } from "../../api/services.js";
import { CoverPosition } from "../../utils.js";
export type CoverLevel = "none" | "half" | "threeQuarters" | "total";
/**
 * Tokens are token documents, as everywhere in midi's services. A provider that needs the canvas token reads
 * `document.object` (undefined for a token that is not drawn: it then can't judge and answers undefined).
 * An attacker asked about "as if standing elsewhere" is a document whose position and `object` are at that place.
 */
export interface CoverQuery {
    /** The attacker, or the caster when measuring from `origin`. Absent when only a point is known. */
    attacker?: TokenDocument.Implementation;
    target: TokenDocument.Implementation;
    activity?: Activity;
    /** Measure from this point instead of the attacker (a template's origin). */
    origin?: CoverPosition;
}
/** midi's answer: the level, and the AC/DEX save bonus that follows from it (0, HALF_COVER, THREE_QUARTERS_COVER or TOTAL_COVER = Infinity). */
export interface CoverAnswer {
    level: CoverLevel;
    bonus: number;
}
export interface CoverProvider {
    /**
     * The level, or undefined when the provider can't judge this query (midi treats it as no cover).
     * An object with a `level` is also accepted; a `bonus` on it is ignored (the level decides).
     */
    between(query: CoverQuery): CoverLevel | {
        level: CoverLevel;
    } | undefined;
    /** "midi" (default): midi's movement-wall rule gives total cover before the provider is asked. "provider": it judges walls itself. */
    walls?: "midi" | "provider";
}
export declare function coverAnswer(level: CoverLevel): CoverAnswer;
/** The level a cover bonus is (status cover reads as a bonus) */
export declare function coverLevelFor(bonus: number): CoverLevel;
declare module "../../api/services.js" {
    interface MidiServices {
        cover: CoverProvider;
    }
}
export declare let coverService: ReturnType<typeof defineService<CoverProvider>>;
export declare function defineCoverService(): void;
/**
 * Cover from geometry: midi's wall rule, then the active provider's answer; none when no provider is chosen or available.
 */
export declare function coverBetween(query: CoverQuery): CoverAnswer;
type TokenOrDocument = Token.Implementation | TokenDocument.Implementation;
/**
 * The cover a target has: its cover statuses and the geometry (coverBetween), whichever is greater. Usable without
 * a workflow. Takes token documents (canvas tokens are accepted); a target that is not drawn has only its status cover.
 */
export declare function coverFor(attacker: TokenOrDocument | undefined, target: TokenOrDocument, options?: {
    activity?: Activity;
    origin?: CoverPosition;
}): CoverAnswer & {
    from: "status" | "geometry" | "none";
};
export {};
