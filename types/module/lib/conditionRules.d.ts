/**
 * The conditions that set an ability roll mode field through dnd5e's condition effects (as `hasConditionEffect`), for
 * naming them in the advantage attribution, e.g. abilities.str.attack.roll.mode → [{ mode: -1, name: "Poisoned" }].
 */
export declare function conditionModeSources(actor: Actor.Implementation, field: string): {
    mode: 1 | -1;
    name: string;
}[];
export declare function initConditionRules(): void;
