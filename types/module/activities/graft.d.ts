type ClassLike = {
    prototype: object;
};
/**
 * Installs the members `top` and its parents down to `base` define (midi's layers) on `base` itself.
 * `prototypePath` is a global path to `base.prototype` (CONFIG.DND5E.activityTypes.<type>.documentClass.prototype):
 * with it, WRAPPED_METHODS go through libWrapper.
 */
export declare function graftOnto(top: ClassLike, base: ClassLike, prototypePath?: string): void;
/** The dnd5e activity types midi adopted (its roll wraps are registered on these: M13) */
export declare const adoptedActivityTypes: Set<string>;
/**
 * midi's activity class (and sheet) for a dnd5e activity type, installed on the classes dnd5e registered for it.
 * Returns dnd5e's class, now with midi's behaviour.
 */
export declare function adoptActivityType(type: string, midiClass: ClassLike, midiSheet?: ClassLike): ClassLike | undefined;
export {};
