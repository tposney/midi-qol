import { TURN_MOMENTS, type HandlerOptions, type MomentHandler, type TurnMomentName } from "./turnMomentsCore.js";
export type { TurnMomentName };
export { TURN_MOMENTS };
export interface TurnMoment {
    moment: TurnMomentName;
    combat: Combat.Implementation;
    /** The combatant whose turn it is (turn moments), or who joined or left (enter, exit) */
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
export declare function setupTurnMoments(): void;
/** MidiQOL.turnMoments: add (or replace, by id) a handler for a moment; returns the function that removes it */
export declare function onTurnMoment(moment: TurnMomentName, id: string, handler: MomentHandler<TurnMoment>, options?: HandlerOptions): () => void;
export declare const turnMomentsApi: {
    moments: readonly ["enterCombat", "combatStart", "roundStart", "turnStart", "turnEnd", "roundEnd", "rewind", "exitCombat", "combatEnd"];
    on: typeof onTurnMoment;
    off: (moment: TurnMomentName, id: string) => boolean;
    handlers: (moment: TurnMomentName) => string[];
};
