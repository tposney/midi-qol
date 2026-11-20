export type BudgetKindId = "reaction" | "bonus";
export interface BudgetState {
    used: number;
    max: number;
    /** used >= max */
    exhausted: boolean;
    /** The window effect, while one is open */
    window?: ActiveEffect.Implementation;
}
type ActorRef = Actor.Implementation | TokenDocument.Implementation | null | undefined;
/** A kind's budget for an actor (or a token's actor) */
export declare function budget(ref: ActorRef, kindId: BudgetKindId): BudgetState;
/** The ledger for an actor or token: each budget kind's state (MidiQOL.economy.ledger) */
export declare function ledger(ref: ActorRef): Record<BudgetKindId, BudgetState>;
/**
 * Spend one of a kind (MidiQOL.economy.spend): the window opened, or its count raised in place. The kind's pre hook
 * may cancel (it gets the window as it will be); its post hook follows.
 */
export declare function spend(ref: ActorRef, kindId: BudgetKindId): Promise<void>;
/** Give one back (MidiQOL.economy.refund; a use undone): the count lowered, the window closed at none */
export declare function refund(ref: ActorRef, kindId: BudgetKindId): Promise<void>;
/** Close the kind's window (MidiQOL.economy.reset): a rest, or setReactionUsed(actor, false) */
export declare function reset(ref: ActorRef, kindId: BudgetKindId): Promise<void>;
export declare const economyApi: {
    ledger: typeof ledger;
    budget: typeof budget;
    spend: typeof spend;
    refund: typeof refund;
    reset: typeof reset;
};
export {};
