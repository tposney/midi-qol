import Token = foundry.canvas.placeables.Token;

type TokenMember = Token.Implementation | TokenDocument.Implementation | string;

/** A member: its TokenDocument, and the placeable it was given as, if any (midi's tokens for actors with none on the scene) */
type Entry = { document: TokenDocument.Implementation, placeable?: Token.Implementation };

/** The TokenDocument a member stands for: a Token's, a TokenDocument, or one by uuid */
function memberDocument(member: TokenMember | undefined | null): TokenDocument.Implementation | undefined {
  if (!member) return undefined;
  if (typeof member === "string") {
    const document = fromUuidSync(member);
    return document instanceof TokenDocument ? document as TokenDocument.Implementation : undefined;
  }
  if (member instanceof TokenDocument) return member as TokenDocument.Implementation;
  return (member as Token.Implementation).document ?? undefined;
}

function memberEntry(member: TokenMember | undefined | null): Entry | undefined {
  const document = memberDocument(member);
  if (!document) return undefined;
  return member instanceof foundry.canvas.placeables.Token ? { document, placeable: member as Token.Implementation } : { document };
}

/** A token never created (midi's token for an actor with none on the scene) has no id: it is its own key */
function entryKey(document: TokenDocument.Implementation): string | TokenDocument.Implementation {
  return document.id ? document.uuid : document;
}

/** Still a token: never created, or still in its scene (not deleted) */
function exists(document: TokenDocument.Implementation): boolean {
  return !document.id || document.parent?.tokens.get(document.id) === document;
}

/**
 * A workflow's token set: TokenDocuments inside, placeables outside. Reading it (iteration, `size`, `first()`) gives
 * each member's placeable that exists now: the drawn Token, else the one it was given (midi's token for an actor with
 * none on the scene); a member on another scene or level has none and is skipped, and a canvas redraw never leaves a
 * destroyed Token. `documents` and `uuids` give every member. Members are added, removed and tested as a Token, a
 * TokenDocument or a uuid. Copy one with `new TokenSet(set)` to keep the members not drawn; set algebra (`difference`,
 * `union`, `isSubsetOf`, `equals`…) is over every member and gives a TokenSet.
 */
export class TokenSet extends Set<Token.Implementation> {
  #members = new Map<string | TokenDocument.Implementation, Entry>();

  constructor(members?: Iterable<TokenMember> | null) {
    super();
    if (members instanceof TokenSet) for (const entry of members.#entries()) this.#addEntry(entry);
    else for (const member of members ?? []) this.add(member);
  }

  #entries(): Entry[] {
    return [...this.#members.values()].filter(entry => exists(entry.document));
  }

  #addEntry(entry: Entry): void {
    const key = entryKey(entry.document);
    const placeable = entry.placeable ?? this.#members.get(key)?.placeable;
    this.#members.set(key, placeable ? { document: entry.document, placeable } : { document: entry.document });
  }

  static #fromEntries(entries: Entry[]): TokenSet {
    const set = new TokenSet();
    for (const entry of entries) set.#addEntry(entry);
    return set;
  }

  /** Every member's TokenDocument, drawn or not (tokens since deleted left out) */
  get documents(): TokenDocument.Implementation[] {
    return this.#entries().map(entry => entry.document);
  }

  /** Every member's uuid (a token never created has none) */
  get uuids(): string[] {
    return this.documents.filter(document => document.id).map(document => document.uuid);
  }

  override add(member: TokenMember): this {
    const entry = memberEntry(member);
    if (entry) this.#addEntry(entry);
    return this;
  }

  #keyOf(member: TokenMember): string | TokenDocument.Implementation | undefined {
    if (typeof member === "string") return member;
    const document = memberDocument(member);
    return document && entryKey(document);
  }

  override delete(member: TokenMember): boolean {
    const key = this.#keyOf(member);
    return !!key && this.#members.delete(key);
  }

  override has(member: TokenMember): boolean {
    const key = this.#keyOf(member);
    return !!key && this.#members.has(key);
  }

  override clear(): void {
    this.#members.clear();
  }

  override get size(): number {
    let size = 0;
    for (const _token of this) size++;
    return size;
  }

  static #placeable({ document, placeable }: Entry): Token.Implementation | undefined {
    if (!exists(document)) return undefined;
    const drawn = document.object as Token.Implementation | null;
    if (drawn && !drawn.destroyed) return drawn;
    return placeable && !placeable.destroyed ? placeable : undefined;
  }

  /** The placeable iteration gives for a member: the drawn Token, else the one it was given; none on another scene or level */
  placeableOf(member: TokenMember): Token.Implementation | undefined {
    const key = this.#keyOf(member);
    const entry = key ? this.#members.get(key) : undefined;
    return entry && TokenSet.#placeable(entry);
  }

  override *values(): SetIterator<Token.Implementation> {
    for (const entry of this.#members.values()) {
      const placeable = TokenSet.#placeable(entry);
      if (placeable) yield placeable;
    }
  }

  override keys(): SetIterator<Token.Implementation> {
    return this.values();
  }

  override *entries(): SetIterator<[Token.Implementation, Token.Implementation]> {
    for (const token of this.values()) yield [token, token];
  }

  override [Symbol.iterator](): SetIterator<Token.Implementation> {
    return this.values();
  }

  override forEach(callback: (value: Token.Implementation, key: Token.Implementation, set: Set<Token.Implementation>) => void, thisArg?: unknown): void {
    for (const token of this.values()) callback.call(thisArg, token, token, this);
  }

  // Set algebra is over every member, drawn or not, and gives a TokenSet (native methods would read a Set's internal
  // storage, which this never fills). The other set's members are matched by document: Tokens, TokenDocuments or uuids.
  static #entriesOf(other: ReadonlySetLike<unknown> | Iterable<unknown>): Entry[] {
    if (other instanceof TokenSet) return other.#entries();
    const members: Iterable<unknown> = Symbol.iterator in other ? other as Iterable<unknown> : { [Symbol.iterator]: () => (other as ReadonlySetLike<unknown>).keys() };
    return [...members].map(member => memberEntry(member as TokenMember)).filter((entry): entry is Entry => !!entry);
  }

  override union(other: ReadonlySetLike<TokenMember>): TokenSet;
  override union<U>(other: ReadonlySetLike<U>): Set<Token.Implementation | U>;
  override union(other: ReadonlySetLike<unknown>): TokenSet {
    return TokenSet.#fromEntries([...this.#entries(), ...TokenSet.#entriesOf(other)]);
  }

  override intersection<U>(other: ReadonlySetLike<U>): TokenSet {
    const theirs = TokenSet.#fromEntries(TokenSet.#entriesOf(other));
    return TokenSet.#fromEntries(this.#entries().filter(entry => theirs.has(entry.document)));
  }

  override difference<U>(other: ReadonlySetLike<U>): TokenSet {
    const theirs = TokenSet.#fromEntries(TokenSet.#entriesOf(other));
    return TokenSet.#fromEntries(this.#entries().filter(entry => !theirs.has(entry.document)));
  }

  override symmetricDifference(other: ReadonlySetLike<TokenMember>): TokenSet;
  override symmetricDifference<U>(other: ReadonlySetLike<U>): Set<Token.Implementation | U>;
  override symmetricDifference(other: ReadonlySetLike<unknown>): TokenSet {
    const theirs = TokenSet.#entriesOf(other);
    const theirSet = TokenSet.#fromEntries(theirs);
    return TokenSet.#fromEntries([...this.#entries().filter(entry => !theirSet.has(entry.document)), ...theirs.filter(entry => !this.has(entry.document))]);
  }

  override isSubsetOf(other: ReadonlySetLike<unknown>): boolean {
    const theirs = TokenSet.#fromEntries(TokenSet.#entriesOf(other));
    return this.documents.every(document => theirs.has(document));
  }

  override isSupersetOf(other: ReadonlySetLike<unknown>): boolean {
    return TokenSet.#entriesOf(other).every(entry => this.has(entry.document));
  }

  override isDisjointFrom(other: ReadonlySetLike<unknown>): boolean {
    return !TokenSet.#entriesOf(other).some(entry => this.has(entry.document));
  }

  /** Foundry's Set#equals, over every member */
  equals(other: unknown): boolean {
    if (!(other instanceof Set)) return false;
    const theirs = TokenSet.#entriesOf(other);
    return theirs.length === this.documents.length && theirs.every(entry => this.has(entry.document));
  }
}
