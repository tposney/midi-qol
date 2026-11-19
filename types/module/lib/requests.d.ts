import { DialogCountdown } from "./dialogCountdown.js";
import { type WaitChoice, type WaitChoiceSpec } from "./playerWaits.js";
import { MidiRequest, type SettledHow } from "./requests/core.js";
export declare const REQUEST_QUERY = "midi-qol.request";
export declare const REQUEST_EVENT_QUERY = "midi-qol.requestEvent";
export type RequestHandler = (data: any, request: IncomingRequest) => unknown;
/** What the asked client runs for a request of `type`: its return value answers the request. */
export declare function registerRequestHandler(type: string, handler: RequestHandler): void;
export interface AskSpec<T> {
    /** The registered handler (registerRequestHandler) the asked client runs. */
    type: string;
    /** JSON-serialisable. */
    data?: object;
    kind: string;
    actorUuid?: string;
    tokenUuid?: string;
    /** Shown to the GM in the player list. */
    label: string;
    /** Deciding time; 0 or less: none. */
    timeoutMs: number;
    /** The answer on time-out, disconnect or error (non-interactive). */
    fallback: () => T | Promise<T>;
    /** What a GM can answer with from the player list (playerWaits); the first is the default. None: the GM can't. */
    gmChoices?: Partial<Record<WaitChoice, WaitChoiceSpec<T>>>;
    source?: string;
    /** What asked (a workflow): the request's badge ends with it (endPlayerWaitsOwnedBy); the request itself is unchanged */
    owner?: object;
}
/**
 * Ask `user` and hold the request. Settles with the user's answer, a GM's choice from the player list, the fallback
 * when the deadline passes, or the fallback when the user leaves (kept for the GM instead, with choices and the
 * *GM answers for players* setting on).
 */
export declare function askUser<T>(user: User.Implementation, spec: AskSpec<T>): MidiRequest<T>;
/** Settle a request this client holds (a GM's answer from a module's own UI). */
export declare function settleRequest(id: string, value: unknown, how?: SettledHow): boolean;
export declare function heldRequests(): MidiRequest<unknown>[];
export declare function requestsFor(actorUuid: string): MidiRequest<unknown>[];
/** A request on the asked client: its deadline (shown, owned by the requester), claim, and whether it was settled for them. */
export declare class IncomingRequest {
    #private;
    readonly id: string;
    readonly holderId: string;
    constructor(id: string, holderId: string, remaining: number);
    /** The time left as of now, by what the requester last said (on asking, pause, resume); paused: it doesn't run down. */
    get remaining(): number;
    get paused(): boolean;
    /** Answered for the player (a GM, the time-out, a disconnect): how, else undefined. */
    get settledHow(): SettledHow | undefined;
    /** A countdown for this request's dialog: display only, the requester decides when time is up. Pausing asks it. */
    countdown(): DialogCountdown | undefined;
    /** The player has decided: false when it was already answered for them (drop what they chose). */
    claim(): Promise<boolean>;
    /** Called when the request is answered for the player: close its dialog. */
    onSettled(close: (how: SettledHow) => void): void;
    _settled(how: SettledHow): void;
    _sync(paused: boolean, remaining: number): void;
    _end(): void;
}
/** Pause or resume a request this client holds (the requester's own pause), telling the asked client. */
export declare function pauseRequest(id: string, paused: boolean): boolean;
/** Register the queries; before setupPlayerWaits, so a disconnect settles a request before playerWaits sees it. */
export declare function setupRequests(): void;
export declare const requestsApi: {
    ask: typeof askUser;
    registerHandler: typeof registerRequestHandler;
    settle: typeof settleRequest;
    pause: typeof pauseRequest;
    held: typeof heldRequests;
    for: typeof requestsFor;
};
