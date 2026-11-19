import type { TokenOrDocument } from "../../../globals.js";
import type { SaveRequestKind } from "../../utils.js";

/*
 * The saves a use is waiting for (M5b stage 1b), in place of the workflow's saveRequests / saveRequestKinds / saveTimeouts
 * maps. Keyed by the target's token uuid: Monk's TokenBar and chat cards answer by token id, Flash Rolls and Epic Rolls
 * by actor uuid, so each entry keeps both, and an actor's answer settles one of its tokens' saves (two tokens of one
 * linked actor used to collide, and one save never finished).
 */

type SaveResult = Roll[] | Roll | null;

interface Pending {
  resolve: (value: SaveResult) => void;
  tokenId?: string;
  actorUuid?: string;
  /** What a chat-card request asks for: another roll by the token doesn't answer it */
  kind?: SaveRequestKind;
  timeout?: ReturnType<typeof setTimeout>;
}

export class PendingSaves {
  #pending = new Map<string, Pending>();

  /** A save now waiting for its answer: its key (the token's uuid; a random one for a token with none) and its result */
  wait(target: TokenOrDocument, kind?: SaveRequestKind): { key: string, promise: Promise<SaveResult> } {
    const document = target instanceof TokenDocument ? target : target.document as TokenDocument.Implementation | undefined;
    const key = document?.uuid ?? foundry.utils.randomID();
    const promise = new Promise<SaveResult>(resolve => {
      this.#pending.set(key, { resolve, tokenId: document?.id ?? undefined, actorUuid: target.actor?.uuid ?? undefined, kind });
    });
    return { key, promise };
  }

  has(key: string | null | undefined): boolean {
    return !!key && this.#pending.has(key);
  }

  kindOf(key: string): SaveRequestKind | undefined {
    return this.#pending.get(key)?.kind;
  }

  /** A deadline for the save at `key` (the chat card's takeover); cleared when it is answered */
  setTimeout(key: string, timeout: ReturnType<typeof setTimeout>): void {
    const pending = this.#pending.get(key);
    if (pending) pending.timeout = timeout;
    else clearTimeout(timeout);
  }

  /** Answer the save at `key`; false when none waits there */
  answer(key: string | null | undefined, value: SaveResult | Roll.Any): boolean {
    const resolve = this.take(key);
    // A module's roll (Roll.fromJSON) is a Roll of any data
    resolve?.(value as SaveResult);
    return !!resolve;
  }

  /** Stop waiting at `key` and return its resolver: nothing else answers it meanwhile (a takeover that rolls first) */
  take(key: string | null | undefined): ((value: SaveResult) => void) | undefined {
    const pending = key ? this.#pending.get(key) : undefined;
    if (!pending) return undefined;
    clearTimeout(pending.timeout);
    this.#pending.delete(key!);
    return pending.resolve;
  }

  /** Stop waiting at `key` without an answer (the GM answered from the player list) */
  cancel(key: string | null | undefined): void {
    this.take(key);
  }

  /** The key of the save a token (by its id) waits for */
  keyForTokenId(tokenId: string | null | undefined): string | undefined {
    if (!tokenId) return undefined;
    for (const [key, pending] of this.#pending) if (pending.tokenId === tokenId) return key;
    return undefined;
  }

  /** The keys of the saves an actor's tokens wait for, in the order asked */
  keysForActor(actorUuid: string | null | undefined): string[] {
    if (!actorUuid) return [];
    return [...this.#pending].filter(([, pending]) => pending.actorUuid === actorUuid).map(([key]) => key);
  }

  /** A save of this actor's (by any of its tokens) is waited for */
  awaitsActor(actor: Actor.Implementation): boolean {
    for (const pending of this.#pending.values()) if (pending.actorUuid === actor.uuid) return true;
    return false;
  }

  get size(): number {
    return this.#pending.size;
  }

  /** For debugging: the keys waiting */
  keys(): string[] {
    return [...this.#pending.keys()];
  }
}
