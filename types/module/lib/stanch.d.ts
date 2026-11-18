import Token = foundry.canvas.placeables.Token;
type Healing = "none" | "spell" | "magical" | "any";
export interface StanchDetails {
    dc: number;
    skill: string;
    range: number;
    healing: Healing;
}
/** The stanch details of an effect, or undefined. */
export declare function stanchDetails(effect: ActiveEffect.Implementation): StanchDetails | undefined;
interface Stanchable {
    effect: ActiveEffect.Implementation;
    details: StanchDetails;
}
/** An actor's active effects that can be stanched. */
export declare function stanchableEffects(actor: Actor.Implementation | null | undefined): Stanchable[];
/** The lowest DC among the effects of `actor` that a check of `skill` can stanch, or undefined. */
export declare function stanchDC(actor: Actor.Implementation | null | undefined, skill?: string): number | undefined;
/**
 * A check of `skill` totalling `total` by `roller` (a token) for the effects of `target` (a token): the target itself,
 * or a creature within each effect's range in feet. Ends the effects whose DC it reaches; returns those ended.
 */
export declare function stanchEffects(roller: Token.Implementation | undefined, target: Token.Implementation, skill: string, total: number): Promise<ActiveEffect.Implementation[]>;
export declare function registerStanchHooks(): void;
export {};
