import { ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { type MidiActivity } from "./midiActivity.js";
/**
 * midi's additions for its own types, applied as each is adopted (adoption follows the policy: activityPrototype.ts).
 * Card buttons and sheet extras are registered first, so the card-action and sheet installers find them. A type of a
 * module's, or one dnd5e adds later, gets midi's shared additions with no entry here.
 */
export declare function setupActivityTypes(): void;
/**
 * midi's checks before a Cast activity hands its use to the spell (M14: were an override of Cast's `use`; run from
 * `dnd5e.preUseLinkedSpell` through the restart, useRelaunch.ts): the hooks, macros and reaction/bonus action
 * enforcement of the Cast activity itself, on a temporary workflow. The spell's own workflow then marks the reaction
 * or bonus action as used and skips checking them again. False: the use stops.
 */
export declare function castPreChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean>;
