export interface Clock {
    now(): number;
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}
export declare const realClock: Clock;
/**
 * A deadline that can be paused. A pause counts only if it comes before expiry; time left is kept as a remaining
 * duration, so another client syncs by it rather than by clocks. 0 or less: no deadline (never expires).
 */
export declare class Deadline {
    #private;
    constructor(ms: number, onExpire: () => void, clock?: Clock);
    get state(): "expired" | "none" | "paused" | "running" | "stopped";
    get remaining(): number;
    /** False when it has expired or stopped (too late to pause). */
    pause(): boolean;
    resume(): boolean;
    /** No expiry any more (answered, or claimed). */
    stop(): void;
}
/** How a request was settled. "error": asking failed (not a disconnect), and the fallback was used. */
export type SettledHow = "player" | "gm" | "timeout" | "disconnect" | "cancelled" | "error";
export interface Settled<T> {
    value: T;
    how: SettledHow;
}
export interface RequestSpec<T> {
    /** save, reaction, bonus...: shown to the GM, used by whoever indexes them. */
    kind: string;
    /** Who is asked. */
    userId?: string;
    /** The creature it waits on (requestsFor). */
    actorUuid?: string;
    /** Deciding time; 0 or less: none. */
    timeoutMs: number;
    /** The answer when nobody gives one (time-out, disconnect, error). Non-interactive. */
    fallback: () => T | Promise<T>;
    /** Clean-up and notifications once settled (any way). */
    onSettled?: (settled: Settled<T>) => void;
    /** Clean-up when it could not be settled: the answer and the fallback both failed, and `settled` rejects. */
    onFailed?: (err: unknown) => void;
}
/** A request without its value type (hooks, lists): what it is, who and what it waits on, where it is. */
export type RequestView = Pick<MidiRequest<unknown>, "id" | "phase" | "how" | "pending" | "deadline"> & {
    spec: Pick<RequestSpec<unknown>, "kind" | "userId" | "actorUuid" | "timeoutMs">;
};
/** One request: decides once, with how. */
export declare class MidiRequest<T> {
    #private;
    readonly id: string;
    readonly spec: RequestSpec<T>;
    readonly deadline: Deadline;
    readonly settled: Promise<Settled<T>>;
    constructor(spec: RequestSpec<T>, options?: {
        id?: string;
        clock?: Clock;
    });
    get phase(): "settled" | "deciding" | "using";
    get how(): SettledHow | undefined;
    get pending(): boolean;
    /** The answer; false when already settled (a late answer is dropped). */
    settle(value: T, how: SettledHow): boolean;
    /** Settles with what `make` gives (the fallback, a GM's choice): claimed at once, so nothing else settles meanwhile. */
    settleWith(make: () => T | Promise<T>, how: SettledHow): boolean;
    /** The player has decided and is acting on it: no deadline from now. False when it is already settled. */
    claim(): boolean;
    /** Only while deciding, and only before expiry. */
    pause(): boolean;
    resume(): boolean;
}
/** The requests this client holds, by id and by the creature they wait on. A settled request leaves. */
export declare class RequestRegistry {
    #private;
    add<T>(request: MidiRequest<T>): MidiRequest<T>;
    get(id: string): MidiRequest<unknown> | undefined;
    forActor(actorUuid: string): MidiRequest<unknown>[];
    forUser(userId: string): MidiRequest<unknown>[];
    all(): MidiRequest<unknown>[];
}
