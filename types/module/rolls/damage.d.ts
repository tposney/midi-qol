import type { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
type RollDamage = (config?: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig) => Promise<Roll[] | void>;
/** The MIXED wrap registered on `type`'s rollDamage */
export declare function rollDamageWrapper(type: string): (this: Activity, wrapped: RollDamage, config?: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig) => Promise<void | Roll<import("fvtt-types/src/utils/index.mjs").EmptyObject>[]>;
/** The damage (and formula) dialog by the activity's Force damage dialog property, else by fast-forward */
export declare function dialogByProperty(activity: Activity, config: RollProcessConfig): boolean;
/**
 * Roll the other damage: the item's own other activity and the loaded ammunition's activity both roll. Ammunition is
 * resolved separately from otherActivity, and SRD ammunition such as Arrow of Slaying carries its damage on an activity
 * of its own.
 * @returns The other damage rolls, or undefined if none were rolled
 */
export declare function rollOtherDamage(activity: Activity, config: RollProcessConfig, dialog: RollDialogConfig): Promise<Roll[] | undefined>;
/** midi's damage roll on each type it adopted, and its damage configuration; once, from setupActivities */
export declare function installDamageRolls(types: Iterable<string>): void;
export {};
