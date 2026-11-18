import { type RollModifierContributor } from "./service.js";
/** midi's attack rules, registered as providers of rollModifiers (midi-qol.<rule>). */
export declare const attackRollRules: Record<string, {
    label: string;
    contributor: RollModifierContributor;
}>;
export declare function registerAttackRollRules(): void;
