import type { TokenOrDocument } from "../../../globals.js";
import type { SaveRequestKind } from "../../utils.js";
type SaveResult = Roll[] | Roll | null;
export declare class PendingSaves {
    #private;
    /** A save now waiting for its answer: its key (the token's uuid; a random one for a token with none) and its result */
    wait(target: TokenOrDocument, kind?: SaveRequestKind): {
        key: string;
        promise: Promise<SaveResult>;
    };
    has(key: string | null | undefined): boolean;
    kindOf(key: string): SaveRequestKind | undefined;
    /** A deadline for the save at `key` (the chat card's takeover); cleared when it is answered */
    setTimeout(key: string, timeout: ReturnType<typeof setTimeout>): void;
    /** Answer the save at `key`; false when none waits there */
    answer(key: string | null | undefined, value: SaveResult | Roll.Any): boolean;
    /** Stop waiting at `key` and return its resolver: nothing else answers it meanwhile (a takeover that rolls first) */
    take(key: string | null | undefined): ((value: SaveResult) => void) | undefined;
    /** Stop waiting at `key` without an answer (the GM answered from the player list) */
    cancel(key: string | null | undefined): void;
    /**
     * The key of the save a token waits for, from an answer that names the token by id (Monk's TokenBar, a chat roll's
     * speaker): by its TokenDocument uuid when the answer's scene gives one that waits (a token id is unique only within a
     * scene), else by the id alone (an answer whose speaker scene isn't the token's)
     */
    keyForToken(tokenId: string | null | undefined, sceneId?: string | null): string | undefined;
    /** The keys of the saves an actor's tokens wait for, in the order asked */
    keysForActor(actorUuid: string | null | undefined): string[];
    /** A save of this actor's (by any of its tokens) is waited for */
    awaitsActor(actor: Actor.Implementation): boolean;
    get size(): number;
    /** For debugging: the keys waiting */
    keys(): string[];
}
export {};
