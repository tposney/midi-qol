/** Pulsing rings around tokens, seen only by this client, e.g. the tokens a choice applies to. */
export interface TokenHighlight {
    /** Pulse this token's ring brighter (the one being acted on); none when omitted. */
    setActive(token?: Token.Implementation): void;
    remove(): void;
}
export interface TokenHighlightOptions {
    /** Ring colour, default the user's colour. */
    color?: number;
}
export declare function highlightTokens(tokens: Iterable<Token.Implementation>, { color }?: TokenHighlightOptions): TokenHighlight;
