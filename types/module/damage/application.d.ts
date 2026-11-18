/** What dnd5e's calculateDamage returns: the damages with the totals attached. */
export interface DamageSummary {
    damages: object[];
    amount: number;
    temp: number;
    tempMax: number;
}
export interface CalculatedDamageApplication {
    /** Update options for the actor update (noConcentrationCheck, isUndo, dnd5e.concentrationCheck...). */
    updateOptions?: Record<string, unknown>;
    /** Added to dnd5e's updates before other preApplyDamage handlers see them (death save failures): flat paths. */
    updates?: Record<string, unknown>;
    /** Values written last, after every hook (undo/redo restores): flat paths. */
    extraUpdates?: Record<string, unknown>;
}
type DamageOptions = Record<string | symbol, unknown>;
export declare function registerDamageApplication(): void;
/**
 * Applies damage midi has already calculated with dnd5e's applyDamage: dnd5e fires preApplyDamage,
 * modifyTokenAttribute and applyDamage and makes the update; `application` reaches that update. `options` is used as
 * it is (not copied): the hooks get the same object, non-enumerable properties included (the card origin).
 */
export declare function applyCalculatedDamage(actor: Actor.Implementation, summary: DamageSummary, application?: CalculatedDamageApplication, options?: Record<string, unknown>): Promise<Actor.Implementation>;
/** dnd5e's applyDamage with its own calculation (the card's ×N), `application` reaching the update. */
export declare function applyDamageWithOptions(actor: Actor.Implementation, damages: object[], application?: CalculatedDamageApplication, options?: Record<string, unknown>): Promise<Actor.Implementation>;
/**
 * From midi's dnd5e.preApplyDamage handler, after its own work: stamps the update when the application is midi's or
 * midi's handler wants update options of its own on it (`extraOptions`).
 */
export declare function stampDamageApplication(updates: Record<string, unknown>, options: DamageOptions | undefined, extraOptions?: Record<string, unknown>): void;
/** Runs `step` once the actor update of this applyDamage call has been made (from dnd5e.applyDamage); not if it is cancelled. */
export declare function afterDamageApplied(options: DamageOptions, step: () => Promise<unknown>): void;
/** From midi's dnd5e.applyDamage handler. */
export declare function runAfterDamageApplied(options: DamageOptions | undefined): Promise<void>;
/** From midi's preUpdateActor handler (first): swaps the stamp for the recorded options and pinned values. */
export declare function consumeDamageApplication(changes: Record<string, any>, options: Record<string, unknown>): void;
export {};
