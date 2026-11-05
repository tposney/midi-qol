import Token = foundry.canvas.placeables.Token;

type TokenMember = Token.Implementation | TokenDocument.Implementation | string;

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

/**
 * A workflow's token set: TokenDocuments inside, the tokens drawn on the canvas outside. Reading it (iteration, `size`,
 * `first()`) gives the members' Tokens as drawn now, so a member on another scene or level is skipped and a canvas
 * redraw never leaves a destroyed Token; `documents` and `uuids` give every member. Members are added, removed and
 * tested as a Token, a TokenDocument or a uuid. Copy one with `new TokenSet(set)` to keep the members not drawn.
 */
export class TokenSet extends Set<Token.Implementation> {
  #members = new Map<string, TokenDocument.Implementation>();

  constructor(members?: Iterable<TokenMember> | null) {
    super();
    const source = members instanceof TokenSet ? members.documents : members;
    for (const member of source ?? []) this.add(member);
  }

  /** Every member's TokenDocument, drawn or not (tokens since deleted left out) */
  get documents(): TokenDocument.Implementation[] {
    return [...this.#members.values()].filter(document => document.parent?.tokens.get(document.id!) === document);
  }

  get uuids(): string[] {
    return this.documents.map(document => document.uuid);
  }

  override add(member: TokenMember): this {
    const document = memberDocument(member);
    if (document?.uuid) this.#members.set(document.uuid, document);
    return this;
  }

  override delete(member: TokenMember): boolean {
    const uuid = typeof member === "string" ? member : memberDocument(member)?.uuid;
    return !!uuid && this.#members.delete(uuid);
  }

  override has(member: TokenMember): boolean {
    const uuid = typeof member === "string" ? member : memberDocument(member)?.uuid;
    return !!uuid && this.#members.has(uuid);
  }

  override clear(): void {
    this.#members.clear();
  }

  override get size(): number {
    let size = 0;
    for (const _token of this) size++;
    return size;
  }

  override *values(): SetIterator<Token.Implementation> {
    for (const document of this.#members.values()) {
      const token = document.object as Token.Implementation | null;
      if (token && !token.destroyed) yield token;
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
}
