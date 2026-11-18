/**
 * A token's name as the viewing user may see it (midi's player-name rules: Anonymous, Hide NPC Names, *Hide NPC
 * names*; the GM and the token's owners see its name). One rule, reached three ways:
 * - `@MidiTokenName[uuid]{fallback}` in enriched text (message content, card notes, journals);
 * - `{{midi-token-name uuid fallback}}` in templates, which are rendered per viewer;
 * - `data-midi-token-uuid` on markup midi doesn't render itself (a note renderer's output): renamed as the card is drawn.
 */
/** The name this user may see of the token (or actor) with this uuid. */
export declare function tokenName(uuid: string, fallback?: string): string;
/** The token's name for this user, marked so the card renames it for each viewer it is drawn for. */
export declare function tokenNameMarkup(uuid: string, fallback?: string): string;
/** Rename marked names as this user may see them. */
export declare function renameMarkedTokens(html: HTMLElement): void;
export declare function setupTokenNames(): void;
