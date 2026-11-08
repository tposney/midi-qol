import Token = foundry.canvas.placeables.Token;

type TokenMember = Token.Implementation | TokenDocument.Implementation | string;
/** What reading a token set gives: drawn Tokens, or TokenDocuments in document mode */
export type TokenSetMember = Token.Implementation | TokenDocument.Implementation;

/** Document mode (world setting tokenDocumentSets): a token set iterates its TokenDocuments; otherwise its drawn Tokens */
let documentMode = false;
export function tokenSetDocumentMode(): boolean {
  return documentMode;
}

/** Read once at init, as it also patches TokenDocument: a change takes effect on reload */
export function setupTokenSetMode(enabled: boolean) {
  documentMode = enabled;
  if (!enabled || Object.getOwnPropertyDescriptor(TokenDocument.prototype, "document")) return;
  // Code written for sets of Tokens reads `member.document`: a TokenDocument is its own document, with a warning once per
  // reading line, named even when it is midi's own (Foundry's `once` keys on the whole stack, so one line reached from many
  // places would warn many times)
  const warned = new Set<string>();
  Object.defineProperty(TokenDocument.prototype, "document", {
    configurable: true,
    get() {
      // Only while warnings are shown: a stack on every read is slow
      if (CONFIG.compatibility.mode === CONST.COMPATIBILITY_MODES.SILENT) return this;
      const caller = new Error().stack?.split("\n")[2] ?? "";
      if (!warned.has(caller)) {
        warned.add(caller);
        foundry.utils.logCompatibilityWarning(`midi-qol | workflow token sets give TokenDocuments (tokenDocumentSets): use the member itself, not member.document, or set.tokens for the Tokens. ${caller.trim()}`, { since: "14.6.9", until: "15.0.0" });
      }
      return this;
    }
  });
}

// midi's tokens for actors with none on the scene: a placeable for a token never created, kept by its document
const syntheticPlaceables = new WeakMap<TokenDocument.Implementation, Token.Implementation>();

/** The TokenDocument a member stands for: a Token's, a TokenDocument, or one by uuid */
function toDocument(member: unknown): TokenDocument.Implementation | undefined {
  if (!member) return undefined;
  if (typeof member === "string") {
    const document = fromUuidSync(member, { strict: false });
    return document instanceof TokenDocument ? document as TokenDocument.Implementation : undefined;
  }
  if (member instanceof TokenDocument) return member as TokenDocument.Implementation;
  if (member instanceof foundry.canvas.placeables.Token) {
    rememberSyntheticToken(member as Token.Implementation);
    return member.document as TokenDocument.Implementation | undefined;
  }
  return undefined;
}

/** Record midi's Token for a token never created (an actor with none on the scene), so its document finds it */
export function rememberSyntheticToken(token: Token.Implementation) {
  const document = token.document as TokenDocument.Implementation | undefined;
  if (document && !document.id) syntheticPlaceables.set(document, token);
}

/**
 * A member's Token now: drawn, else midi's own for a token never created; none on another scene or level, or deleted.
 * A document with no id is midi's own: Foundry's lazy `object` would create another, undrawn Token for it.
 */
export function tokenOf(document: TokenDocument.Implementation): Token.Implementation | undefined {
  if (!document.id) {
    const synthetic = syntheticPlaceables.get(document);
    return synthetic && !synthetic.destroyed ? synthetic : undefined;
  }
  const drawn = document.object as Token.Implementation | null;
  return drawn && !drawn.destroyed ? drawn : undefined;
}

function documentsOf(other: ReadonlySetLike<unknown> | Iterable<unknown>): TokenDocument.Implementation[] {
  if (other instanceof TokenDocumentSet) return other.documents;
  // A Map's members are its keys, not its entries; a set-like that can't be iterated gives its keys
  const members: Iterable<unknown> = other instanceof Map ? other.keys()
    : Symbol.iterator in other ? other as Iterable<unknown> : { [Symbol.iterator]: () => (other as ReadonlySetLike<unknown>).keys() };
  return [...members].map(toDocument).filter((document): document is TokenDocument.Implementation => !!document);
}

const setValues = Set.prototype.values;

/**
 * A workflow's token set: a Set of TokenDocuments (every member, drawn or not; a deleted token stays a member while the workflow is in memory). Members are
 * added, removed and tested as a Token, a TokenDocument or a uuid. Reading it (iteration, `size`, `first()`) gives the
 * drawn Tokens, or in document mode every member's TokenDocument; `documents`, `count`, `tokens` and `uuids` are the
 * same in both modes, and midi itself reads only those. Iteration is over the members as it starts (members added
 * meanwhile aren't visited). Copy one with `new TokenDocumentSet(set)`; set algebra (`difference`, `union`,
 * `isSubsetOf`, `equals`…) is over every member and gives a TokenDocumentSet, but only called on the TokenDocumentSet:
 * a plain Set's `plain.difference(set)` reads this set's mode-dependent `size` and `keys()`. Foundry's `filter`, `map`,
 * `find`, `some`, `every` and `reduce` iterate as reading does; `filter` gives a TokenDocumentSet.
 */
export class TokenDocumentSet extends Set<TokenSetMember> {
  constructor(members?: Iterable<TokenMember> | null) {
    super();
    for (const document of members ? documentsOf(members) : []) this.add(document);
  }

  /** How many members, drawn or not (size in document mode) */
  get count(): number {
    return super.size;
  }

  /** Every member's TokenDocument, drawn or not */
  get documents(): TokenDocument.Implementation[] {
    return [...setValues.call(this)] as TokenDocument.Implementation[];
  }

  /** The members' Tokens now: drawn, or midi's own for an actor with no token on the scene */
  get tokens(): Token.Implementation[] {
    return this.documents.map(tokenOf).filter((token): token is Token.Implementation => !!token);
  }

  /** Every member's uuid (a token never created has none) */
  get uuids(): string[] {
    return this.documents.filter(document => document.id).map(document => document.uuid);
  }

  /** A member's Token now, if any (tokens) */
  placeableOf(member: TokenMember): Token.Implementation | undefined {
    const document = toDocument(member);
    return document && super.has(document) ? tokenOf(document) : undefined;
  }

  override add(member: TokenMember): this {
    const document = toDocument(member);
    if (document) super.add(document);
    return this;
  }

  override delete(member: TokenMember): boolean {
    const document = toDocument(member);
    return !!document && super.delete(document);
  }

  override has(member: TokenMember): boolean {
    const document = toDocument(member);
    return !!document && super.has(document);
  }

  override get size(): number {
    return documentMode ? super.size : this.tokens.length;
  }

  override *values(): SetIterator<TokenSetMember> {
    yield* documentMode ? this.documents : this.tokens;
  }

  override keys(): SetIterator<TokenSetMember> {
    return this.values();
  }

  override *entries(): SetIterator<[TokenSetMember, TokenSetMember]> {
    for (const member of this.values()) yield [member, member];
  }

  override [Symbol.iterator](): SetIterator<TokenSetMember> {
    return this.values();
  }

  override forEach(callback: (value: TokenSetMember, key: TokenSetMember, set: Set<TokenSetMember>) => void, thisArg?: unknown): void {
    for (const member of this.values()) callback.call(thisArg, member, member, this);
  }

  // Set algebra is over every member, drawn or not, and gives a TokenDocumentSet; the other set's members (Tokens,
  // TokenDocuments or uuids) are matched by document
  override union(other: ReadonlySetLike<TokenMember>): TokenDocumentSet;
  override union<U>(other: ReadonlySetLike<U>): Set<TokenSetMember | U>;
  override union(other: ReadonlySetLike<unknown>): TokenDocumentSet {
    return new TokenDocumentSet([...this.documents, ...documentsOf(other)]);
  }

  override intersection<U>(other: ReadonlySetLike<U>): TokenDocumentSet {
    const theirs = new Set(documentsOf(other));
    return new TokenDocumentSet(this.documents.filter(document => theirs.has(document)));
  }

  override difference<U>(other: ReadonlySetLike<U>): TokenDocumentSet {
    const theirs = new Set(documentsOf(other));
    return new TokenDocumentSet(this.documents.filter(document => !theirs.has(document)));
  }

  override symmetricDifference(other: ReadonlySetLike<TokenMember>): TokenDocumentSet;
  override symmetricDifference<U>(other: ReadonlySetLike<U>): Set<TokenSetMember | U>;
  override symmetricDifference(other: ReadonlySetLike<unknown>): TokenDocumentSet {
    const theirs = documentsOf(other);
    const theirSet = new Set(theirs);
    return new TokenDocumentSet([...this.documents.filter(document => !theirSet.has(document)), ...theirs.filter(document => !this.has(document))]);
  }

  override isSubsetOf(other: ReadonlySetLike<unknown>): boolean {
    const theirs = new Set(documentsOf(other));
    return this.documents.every(document => theirs.has(document));
  }

  override isSupersetOf(other: ReadonlySetLike<unknown>): boolean {
    return documentsOf(other).every(document => this.has(document));
  }

  override isDisjointFrom(other: ReadonlySetLike<unknown>): boolean {
    return !documentsOf(other).some(document => this.has(document));
  }

  /** Foundry's Set#filter over what reading gives (the mode's view), keeping the members that pass */
  override filter(test: (value: TokenSetMember, index: number, set: TokenDocumentSet) => boolean): TokenDocumentSet {
    return new TokenDocumentSet([...this.values()].filter((member, index) => test(member, index, this)));
  }

  /** Foundry's Set#equals, over every member */
  equals(other: unknown): boolean {
    if (!(other instanceof Set)) return false;
    const theirs = new Set(documentsOf(other));
    return theirs.size === super.size && [...theirs].every(document => this.has(document));
  }
}

/** How many members a set has: every member of a TokenDocumentSet (drawn or not), else the Set's size */
export function memberCount(set: ReadonlySetLike<unknown> | undefined | null): number {
  return set instanceof TokenDocumentSet ? set.count : set?.size ?? 0;
}

/** What a hook or macro is given for a target: its TokenDocument in document mode, else its Token when drawn (else the document) */
export function hookTarget(member: Token.Implementation | TokenDocument.Implementation): TokenSetMember {
  const document = toDocument(member);
  if (!document) return member;
  return documentMode ? document : tokenOf(document) ?? document;
}
