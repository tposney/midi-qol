import type { DamageApplicationOptions, DamageDescription } from "../../../globals.js";
import { defineService } from "../../api/services.js";
import { DamageChange, DamageStage } from "./rules.js";
export type { DamageChange, DamageStage } from "./rules.js";
export interface DamageQuery {
    stage: DamageStage;
    /** The actor taking the damage. */
    actor: Actor.Implementation;
    /** Whoever dealt it, when known. */
    sourceActor?: Actor.Implementation;
    /** This target's damage parts as they stand at this stage (copies: change them through the returned changes). */
    damage: readonly {
        type: string;
        value: number;
        properties: ReadonlySet<string>;
    }[];
    /** dnd5e's damage application options (options.midi carries midi's). */
    options: DamageApplicationOptions;
}
export interface DamageModifierContributor {
    /** The stage or stages it answers for. */
    stage: DamageStage | readonly DamageStage[];
    for(query: DamageQuery): readonly DamageChange[] | undefined;
}
declare module "../../api/services.js" {
    interface MidiServices {
        damageModifiers: DamageModifierContributor;
    }
}
export declare let damageModifiersService: ReturnType<typeof defineService<DamageModifierContributor>>;
export declare function defineDamageModifiersService(): void;
/**
 * Runs the contributors for one stage over a target's damage (mutated in place: parts changed, bonus parts and display
 * entries added). `counts` says which entries are damage a change may touch.
 */
export declare function applyDamageModifierStage(stage: DamageStage, actor: Actor.Implementation, sourceActor: Actor.Implementation | undefined, damages: DamageDescription[], options: DamageApplicationOptions, counts: (damage: DamageDescription) => boolean): void;
