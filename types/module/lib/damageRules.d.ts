/**
 * dnd5e 6.1's attacker damage rules (`dnd5e.damage.ignore.*`, `dnd5e.damage.downgrade` changes), which dnd5e collects
 * per damage roll into `rollConfig.applicationOptions`. midi keeps them once per use and merges them into each
 * target's damage options, as dnd5e's damage card does with its `system.applicationOptions`.
 */
import type { DamageApplicationOptions } from "../../globals.js";
export declare const RULE_IGNORES: readonly ["immunity", "resistance", "vulnerability"];
type RuleIgnore = typeof RULE_IGNORES[number];
export type DamageRules = {
    downgrade?: Set<string>;
    ignore?: Partial<Record<RuleIgnore, Set<string>>>;
};
/** As stored on the card: arrays */
export type StoredDamageRules = {
    downgrade?: string[];
    ignore?: Partial<Record<RuleIgnore, string[]>>;
};
type RuleSource = {
    downgrade?: Iterable<string> | true;
    ignore?: Partial<Record<string, Iterable<string> | true | unknown>> | true;
} | null | undefined;
/** The union of rule sets; undefined when there are none */
export declare function mergeDamageRules(...sources: RuleSource[]): DamageRules | undefined;
export declare function storeDamageRules(rules: DamageRules | undefined): StoredDamageRules | undefined;
export declare function sameDamageRules(a: DamageRules | undefined, b: DamageRules | undefined): boolean;
/** Whether the rules include an option for a damage type, as dnd5e's `DamageMessageData#hasDamageApplicationOption` */
export declare function hasDamageRule(rules: DamageRules | undefined, option: string, type: string): boolean;
/**
 * Add the rules to damage options in place (each target's options are its own copy). A category already ignored
 * wholesale (`true`) stays so.
 */
export declare function applyDamageRules<T extends {
    downgrade?: true | Set<string>;
    ignore?: true | object;
}>(options: T, rules: DamageRules | undefined): T;
/** A copy of damage options to calculate with: dnd5e's and midi's handlers change them, and deepClone shares Sets */
export declare function copyDamageOptions<T extends DamageApplicationOptions>(options: T): T;
export declare function copyDamageOptions(options: DamageApplicationOptions | undefined): DamageApplicationOptions;
/**
 * The attacker's rules for damage that has no dnd5e damage roll (applyTokenDamage, DamageOnlyWorkflow), collected as
 * dnd5e's `getDamageConfig` collects them for a roll.
 */
export declare function collectDamageRules(actor: Actor.Implementation | null | undefined, item?: Item.Implementation | null): DamageRules | undefined;
export {};
