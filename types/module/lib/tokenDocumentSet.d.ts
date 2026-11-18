import Token = foundry.canvas.placeables.Token;
type TokenMember = Token.Implementation | TokenDocument.Implementation | string;
/** What reading a token set gives: TokenDocuments, or canvas tokens with document mode off */
export type TokenSetMember = Token.Implementation | TokenDocument.Implementation;
export declare function tokenSetDocumentMode(): boolean;
/** Read once at init: a change takes effect on reload. TokenDocument#document is patched in either mode */
export declare function setupTokenSetMode(enabled: boolean): void;
/** Record midi's Token for a token never created (an actor with none on the scene), so its document finds it */
export declare function rememberSyntheticToken(token: Token.Implementation): void;
/**
 * A member's Token now: its canvas token, else midi's own for a token never created; none on another scene or level, or deleted.
 * A document with no id is midi's own: Foundry's lazy `object` would create another Token for it.
 */
export declare function tokenOf(document: TokenDocument.Implementation): Token.Implementation | undefined;
/**
 * A workflow's token set: a Set of TokenDocuments (every member, with a canvas token or not; a deleted token stays a member while the workflow is in memory). Members are
 * added, removed and tested as a Token, a TokenDocument or a uuid. Reading it (iteration, `size`, `first()`) gives the
 * canvas tokens, or in document mode every member's TokenDocument; `documents`, `count`, `tokens` and `uuids` are the
 * same in both modes, and midi itself reads only those. Iteration is over the members as it starts (members added
 * meanwhile aren't visited). Copy one with `new TokenDocumentSet(set)`; set algebra (`difference`, `union`,
 * `isSubsetOf`, `equals`…) is over every member and gives a TokenDocumentSet, but only called on the TokenDocumentSet:
 * a plain Set's `plain.difference(set)` reads this set's mode-dependent `size` and `keys()`. Foundry's `filter`, `map`,
 * `find`, `some`, `every` and `reduce` iterate as reading does; `filter` gives a TokenDocumentSet.
 */
export declare class TokenDocumentSet extends Set<TokenSetMember> {
    constructor(members?: Iterable<TokenMember> | null);
    /** How many members, with a canvas token or not (size in document mode) */
    get count(): number;
    /** Every member's TokenDocument, with a canvas token or not */
    get documents(): TokenDocument.Implementation[];
    /** The members' Tokens now: canvas tokens, or midi's own for an actor with no token on the scene */
    get tokens(): Token.Implementation[];
    /** Every member's uuid (a token never created has none) */
    get uuids(): string[];
    /** A member's Token now, if any (tokens) */
    placeableOf(member: TokenMember): Token.Implementation | undefined;
    add(member: TokenMember): this;
    delete(member: TokenMember): boolean;
    has(member: TokenMember): boolean;
    get size(): number;
    values(): SetIterator<TokenSetMember>;
    keys(): SetIterator<TokenSetMember>;
    entries(): SetIterator<[TokenSetMember, TokenSetMember]>;
    [Symbol.iterator](): SetIterator<TokenSetMember>;
    forEach(callback: (value: TokenSetMember, key: TokenSetMember, set: Set<TokenSetMember>) => void, thisArg?: unknown): void;
    union(other: ReadonlySetLike<TokenMember>): TokenDocumentSet;
    union<U>(other: ReadonlySetLike<U>): Set<TokenSetMember | U>;
    intersection(other: ReadonlySetLike<TokenMember>): TokenDocumentSet;
    intersection<U>(other: ReadonlySetLike<U>): Set<TokenSetMember & U>;
    difference(other: ReadonlySetLike<TokenMember>): TokenDocumentSet;
    difference<U>(other: ReadonlySetLike<U>): Set<TokenSetMember>;
    symmetricDifference(other: ReadonlySetLike<TokenMember>): TokenDocumentSet;
    symmetricDifference<U>(other: ReadonlySetLike<U>): Set<TokenSetMember | U>;
    isSubsetOf(other: ReadonlySetLike<unknown>): boolean;
    isSupersetOf(other: ReadonlySetLike<unknown>): boolean;
    isDisjointFrom(other: ReadonlySetLike<unknown>): boolean;
}
/** How many members a set has: every member of a TokenDocumentSet (with a canvas token or not), else the Set's size */
export declare function memberCount(set: ReadonlySetLike<unknown> | undefined | null): number;
/** What a hook is given for a target, as reading a token set gives it: its TokenDocument, or with document mode off its canvas token (the document when it has none) */
export declare function hookTarget(member: Token.Implementation | TokenDocument.Implementation): TokenSetMember;
export {};
