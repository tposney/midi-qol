export declare function heightIntersects(targetDocument: TokenDocument.Implementation, flankerDocument: TokenDocument.Implementation): boolean;
export declare function findPotentialFlankers(target: Token.Implementation): Token[];
/**
 * Compute the centroid (average pixel position) of a token's occupied hex centers.
 * Falls back to the token document's center if the grid is not hexagonal or offsets can't be obtained.
 */
export declare function getHexCentroid(target: Token.Implementation): {
    x: number;
    y: number;
};
/** midi's flanked geometry: the "midi-qol" provider of the flanking service */
export declare function midiFlankedStatus(target: Token.Implementation): Promise<boolean>;
/** midi's flanking geometry: the "midi-qol" provider of the flanking service */
export declare function midiFlankingStatus(token: Token.Implementation, target: Token.Implementation): Promise<boolean>;
