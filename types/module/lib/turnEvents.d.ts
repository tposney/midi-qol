import { TURN_EVENTS, type HandlerOptions, type EventHandler, type TurnEventName } from "./turnEventsCore.js";
export type { TurnEventName };
export { TURN_EVENTS };
export interface TurnEvent {
    eventId: TurnEventName;
    combat: Combat.Implementation;
    /** The combatant whose turn it is (turn events), or who joined or left (enter, exit) */
    combatant?: Combatant.Implementation;
    token?: TokenDocument.Implementation | null;
    actor?: Actor.Implementation | null;
    round: number;
    turn: number | null;
    /** Core passed over it on the way to the turn the combat moved to */
    skipped: boolean;
    /** The combat's state before the change */
    previous?: {
        round: number | null;
        turn: number | null;
        combatantId: string | null;
    };
}
export declare function setupTurnEvents(): void;
/** MidiQOL.turnEvents: add (or replace, by id) a handler for a event; returns the function that removes it */
export declare function onTurnEvent(eventId: TurnEventName, id: string, handler: EventHandler<TurnEvent>, options?: HandlerOptions): () => void;
export declare const turnEventsApi: {
    events: readonly ["enterCombat", "combatStart", "roundStart", "turnStart", "turnEnd", "roundEnd", "rewind", "exitCombat", "combatEnd"];
    on: typeof onTurnEvent;
    off: (eventId: TurnEventName, id: string) => boolean;
    handlers: (eventId: TurnEventName) => string[];
};
