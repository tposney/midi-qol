export declare const TURN_MOMENTS: readonly ["enterCombat", "combatStart", "roundStart", "turnStart", "turnEnd", "roundEnd", "rewind", "exitCombat", "combatEnd"];
export type TurnMomentName = typeof TURN_MOMENTS[number];
export type MomentHandler<P> = (payload: P) => unknown;
export interface HandlerOptions {
    priority?: number;
    detached?: boolean;
    uncapped?: boolean;
}
export interface DispatcherOptions {
    /** How long a handler is waited for, ms */
    cap?: number;
    onError?: (handlerId: string, moment: string, error: unknown) => void;
    onSlow?: (handlerId: string, moment: string, cap: number) => void;
}
export declare class MomentDispatcher<P extends {
    moment: string;
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
    on(moment: string, id: string, handler: MomentHandler<P>, options?: HandlerOptions): () => void;
    off(moment: string, id: string): boolean;
    /** The handlers' ids for a moment, in the order they run */
    handlers(moment: string): string[];
    /** Raise a moment: after the key's earlier moments have been delivered */
    dispatch(key: string, payload: P): Promise<void>;
    /** Moments waiting or being delivered, by key (for tests) */
    get pending(): number;
}
