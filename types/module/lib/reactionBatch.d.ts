import { type ReactionResult } from "../utils.js";
export interface BatchedAsk {
    user: User.Implementation;
    /** The REACTIONS_REQUEST data of this creature */
    data: object;
    /** Sends it on its own */
    single: () => Promise<ReactionResult>;
    /** Sent on its own, never in a group (a failed save's bonus part) */
    own: boolean;
}
export interface ReactionTicket {
    ask(item: BatchedAsk): Promise<ReactionResult>;
    /** The target's work up to its answer is done: a ticket that never asked lets the batch go */
    settle(): void;
}
export declare class ReactionBatch {
    #private;
    constructor(total: number, owner?: object);
    ticket(): ReactionTicket;
}
