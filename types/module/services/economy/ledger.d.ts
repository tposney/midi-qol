export type BudgetKindId = "action" | "bonus" | "reaction";
/** A window's counters besides its count: `flags.midi-qol.actions.<name>` (attacksLeft, leveledSpell, objectInteraction) */
export type WindowCounters = Record<string, number | boolean>;
export interface BudgetState {
    used: number;
    max: number;
    /** used >= max */
    exhausted: boolean;
    /** The window effect, while one is open */
    window?: ActiveEffect.Implementation;
    /** The window's counters (the turn window's attacksLeft, leveledSpell...) */
    counters: WindowCounters;
}
type ActorRef = Actor.Implementation | TokenDocument.Implementation | null | undefined;
/** One of the actor's `flags.midi-qol.actions` values (budgets: reactionsMax, attacksMax...) */
export declare function actionFlag(actor: Actor.Implementation, name: string): unknown;
/** A kind's budget for an actor (or a token's actor) */
export declare function budget(ref: ActorRef, kindId: BudgetKindId): BudgetState;
/** The ledger for an actor or token: each budget kind's state (MidiQOL.economy.ledger) */
export declare function ledger(ref: ActorRef): Record<BudgetKindId, BudgetState>;
/**
 * Spend of a kind (MidiQOL.economy.spend): the window opened, or its count raised in place; `count` 0 only sets
 * `counters` (the turn window's leveledSpell for a bonus action spell). The reaction's and bonus action's pre hooks may
 * cancel (they get the window as it will be); their post hooks follow.
 */
export declare function spend(ref: ActorRef, kindId: BudgetKindId, options?: {
    count?: number;
    counters?: WindowCounters;
}): Promise<void>;
/** Give one back (MidiQOL.economy.refund; a use undone): the count lowered, the window closed at none */
export declare function refund(ref: ActorRef, kindId: BudgetKindId): Promise<void>;
/** Close the kind's window (MidiQOL.economy.reset): a rest, or setReactionUsed(actor, false) */
export declare function reset(ref: ActorRef, kindId: BudgetKindId): Promise<void>;
export {};
