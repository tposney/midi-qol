import Token = foundry.canvas.placeables.Token;
import { isRemoved } from "./compatLine.js";

type TokenMember = Token.Implementation | TokenDocument.Implementation | string;
/** What reading a token set gives: TokenDocuments, or canvas tokens with document mode off */
export type TokenSetMember = Token.Implementation | TokenDocument.Implementation;

/** Document mode (world setting tokenDocumentSets, off by default until 14.8.0): a token set iterates its TokenDocuments; off, its canvas tokens */
let documentMode = false;
export function tokenSetDocumentMode(): boolean {
  return documentMode;
}

/** Read once at init: a change takes effect on reload. TokenDocument#document is patched in either mode */
export function setupTokenSetMode(enabled: boolean) {
  documentMode = enabled;
  // Gone in 14.9.0 (the compatibility line): a TokenDocument has no `document`
  if (isRemoved("14.9.0") || Object.getOwnPropertyDescriptor(TokenDocument.prototype, "document")) return;
  // Code written for sets of Tokens reads `member.document`: a TokenDocument is its own document, with a warning once per
  // reading line, named even when it is midi's own (Foundry's `once` keys on the whole stack, so one line reached from many
  // places would warn many times)
  const warned = new Set<string>();
  Object.defineProperty(TokenDocument.prototype, "document", {
    configurable: true,
    get() {
      // Only while warnings are shown: a stack on every read is slow
      if (CONFIG.compatibility.mode === CONST.COMPATIBILITY_MODES.SILENT) return this;
      // V8 heads the stack with the error's own line; Firefox and Safari don't
      const stack = new Error().stack?.split("\n") ?? [];
      const caller = stack[stack[0]?.startsWith("Error") ? 2 : 1] ?? "";
      // dnd5e and core read `.document` to accept a Token or a TokenDocument: nothing for them to change
      if (warned.has(caller) || /\/systems\/|\/scripts\/foundry\.m?js/.test(caller)) return this;
      warned.add(caller);
      const gives = documentMode ? "workflow token sets and target hooks give TokenDocuments" : "midi's target hooks give TokenDocuments, as workflow token sets will from 14.8.0";
      foundry.utils.logCompatibilityWarning(`midi-qol | ${gives}: use the member itself, not member.document, or set.tokens for the Tokens. ${caller.trim()}`, { since: "14.6.9", until: "14.9.0" });
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
 * A member's Token now: its canvas token, else midi's own for a token never created; none on another scene or level, or deleted.
 * A document with no id is midi's own: Foundry's lazy `object` would create another Token for it.
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
  // One member, not a collection of them
  if (typeof other === "string" || other instanceof TokenDocument || other instanceof foundry.canvas.placeables.Token) {
    const document = toDocument(other);
    return document ? [document] : [];
  }
  // A Map's members are its keys, not its entries; a set-like that can't be iterated gives its keys
  const members: Iterable<unknown> = other instanceof Map ? other.keys()
    : Symbol.iterator in other ? other as Iterable<unknown> : { [Symbol.iterator]: () => (other as ReadonlySetLike<unknown>).keys() };
  return [...members].map(toDocument).filter((document): document is TokenDocument.Implementation => !!document);
}

const setValues = Set.prototype.values;

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
export class TokenDocumentSet extends Set<TokenSetMember> {
  constructor(members?: Iterable<TokenMember> | null) {
    super();
    for (const document of members ? documentsOf(members) : []) this.add(document);
  }

  /** How many members, with a canvas token or not (size in document mode) */
  get count(): number {
    return super.size;
  }

  /** Every member's TokenDocument, with a canvas token or not */
  get documents(): TokenDocument.Implementation[] {
    return [...setValues.call(this)] as TokenDocument.Implementation[];
  }

  /** The members' Tokens now: canvas tokens, or midi's own for an actor with no token on the scene */
  get tokens(): Token.Implementation[] {
    return this.documents.map(tokenOf).filter((token): token is Token.Implementation => !!token);
  }

  /** Every member's uuid (a token never created has none) */
  get uuids(): string[] {
    return this.documents.flatMap(document => document.id && document.uuid ? [document.uuid] : []);
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

  // Set algebra is over every member, with a canvas token or not, and gives a TokenDocumentSet; the other set's members (Tokens,
  // TokenDocuments or uuids) are matched by document
  override union(other: ReadonlySetLike<TokenMember>): TokenDocumentSet;
  override union<U>(other: ReadonlySetLike<U>): Set<TokenSetMember | U>;
  override union(other: ReadonlySetLike<unknown>): TokenDocumentSet {
    return new TokenDocumentSet([...this.documents, ...documentsOf(other)]);
  }

  override intersection(other: ReadonlySetLike<TokenMember>): TokenDocumentSet;
  override intersection<U>(other: ReadonlySetLike<U>): Set<TokenSetMember & U>;
  override intersection(other: ReadonlySetLike<unknown>): TokenDocumentSet {
    const theirs = new Set(documentsOf(other));
    return new TokenDocumentSet(this.documents.filter(document => theirs.has(document)));
  }

  override difference(other: ReadonlySetLike<TokenMember>): TokenDocumentSet;
  override difference<U>(other: ReadonlySetLike<U>): Set<TokenSetMember>;
  override difference(other: ReadonlySetLike<unknown>): TokenDocumentSet {
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
}

// Foundry's Set#filter and Set#equals are typed as properties of Set, so they are installed here rather than declared as methods.
Object.defineProperties(TokenDocumentSet.prototype, {
  /** Over what reading gives (the mode's view), keeping the members that pass; a TokenDocumentSet */
  filter: {
    configurable: true, writable: true,
    value: function (this: TokenDocumentSet, test: (value: TokenSetMember, index: number, set: Set<TokenSetMember>) => boolean): TokenDocumentSet {
      return new TokenDocumentSet([...this.values()].filter((member, index) => test(member, index, this)));
    }
  },
  /** Over every member, with a canvas token or not */
  equals: {
    configurable: true, writable: true,
    value: function (this: TokenDocumentSet, other: unknown): boolean {
      if (!(other instanceof Set)) return false;
      const theirs = new Set(documentsOf(other));
      // A member of theirs that is no token makes the sets differ
      if (!(other instanceof TokenDocumentSet) && [...other].some(member => !toDocument(member))) return false;
      return theirs.size === this.count && [...theirs].every(document => this.has(document));
    }
  }
});

/** How many members a set has: every member of a TokenDocumentSet (with a canvas token or not), else the Set's size */
export function memberCount(set: ReadonlySetLike<unknown> | undefined | null): number {
  return set instanceof TokenDocumentSet ? set.count : set?.size ?? 0;
}

/** What a hook is given for a target, as reading a token set gives it: its TokenDocument, or with document mode off its canvas token (the document when it has none) */
export function hookTarget(member: Token.Implementation | TokenDocument.Implementation): TokenSetMember {
  const document = toDocument(member);
  if (!document) return member;
  return documentMode ? document : tokenOf(document) ?? document;
}
