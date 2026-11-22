export declare const TURN_EVENTS: readonly ["enterCombat", "combatStart", "roundStart", "turnStart", "turnEnd", "roundEnd", "rewind", "exitCombat", "combatEnd"];
export type TurnEventName = typeof TURN_EVENTS[number];
export type EventHandler<P> = (payload: P) => unknown;
export interface HandlerOptions {
    priority?: number;
    detached?: boolean;
    uncapped?: boolean;
}
export interface DispatcherOptions {
    /** How long a handler is waited for, ms */
    cap?: number;
    onError?: (handlerId: string, eventId: string, error: unknown) => void;
    onSlow?: (handlerId: string, eventId: string, cap: number) => void;
}
export declare class EventDispatcher<P extends {
    eventId: string;
}> {
    #private;
    constructor(options?: DispatcherOptions);
    /**
     * Add (or replace, by id) a handler; returns the function that removes it.
     * - `detached`: started in its turn and not waited for (no ordering after it starts, no cap; a failure is still
     *   reported): for a handler that asks a player or runs long.
     * - `uncapped`: waited for however long it takes (midi's over-time effects until M15: core waits for their saves before
     *   its own expiry, as before the dispatcher).
     */
    on(eventId: string, id: string, handler: EventHandler<P>, options?: HandlerOptions): () => void;
    off(eventId: string, id: string): boolean;
    /** The handlers' ids for a event, in the order they run */
    handlers(eventId: string): string[];
    /** Raise a event: after the key's earlier events have been delivered */
    dispatch(key: string, payload: P): Promise<void>;
    /** Events waiting or being delivered, by key (for tests) */
    get pending(): number;
}
