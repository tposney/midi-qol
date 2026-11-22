import { defineService } from "../../api/services.js";
export type RevealSubject = "challenge" | "saveResult" | "hitResult" | "ac" | "tableResult" | "attacker";
export type SaveDetail = "outcome" | "total" | "dice";
export interface RevealQuery {
    subject: RevealSubject;
    user: User.Implementation;
    /** The actor whose use it is */
    caster?: Actor.Implementation;
    /** The target */
    target?: Actor.Implementation;
    /** The target has a player owner (saves: a player character's result) */
    playerOwned?: boolean;
    card?: ChatMessage.Implementation;
    /** "attacker" (M32a): the target can see the creature acting on it */
    seen?: boolean;
}
export interface SaveDetailQuery {
    user?: User.Implementation;
    caster?: Actor.Implementation;
    playerOwned: boolean;
}
export interface RevealPolicyProvider {
    /** May `user` learn this? undefined: leave it to midi's settings */
    reveals?(query: RevealQuery): boolean | undefined;
    /** How much of a visible save `user` sees; undefined: midi's settings */
    saveDetail?(query: SaveDetailQuery): SaveDetail | undefined;
}
declare module "../../api/services.js" {
    interface MidiServices {
        revealPolicy: RevealPolicyProvider;
    }
}
export declare let revealPolicyService: ReturnType<typeof defineService<RevealPolicyProvider>>;
export declare function midiReveals(query: RevealQuery): boolean;
export declare function midiSaveDetail(query: SaveDetailQuery): SaveDetail;
export declare function defineRevealPolicyService(): void;
type QueryFor<Q> = Omit<Q, "user"> & {
    user?: User.Implementation | null;
};
/** The active provider's answer, if it isn't midi's own and it gives one */
export declare function providerReveals(query: QueryFor<RevealQuery>): boolean | undefined;
/** May `query.user` (default: this user) learn `query.subject`: the active provider, else midi's settings */
export declare function reveals(query: QueryFor<RevealQuery>): boolean;
/** How much of a visible save `user` sees: the active provider, else midi's settings */
export declare function revealedSaveDetail(query: QueryFor<SaveDetailQuery>): SaveDetail;
export {};
