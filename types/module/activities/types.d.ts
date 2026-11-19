import { ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { type MidiActivity } from "./midiActivity.js";
/** midi's activity types: each adopted, with its card buttons, sheet extras and setup (teleport.ts and transform.ts have their own) */
export declare function setupActivityTypes(): void;
/**
 * midi's checks before a Cast activity hands its use to the spell (M14: were an override of Cast's `use`; run from
 * `dnd5e.preUseLinkedSpell` through the restart, useRelaunch.ts): the hooks, macros and reaction/bonus action
 * enforcement of the Cast activity itself, on a temporary workflow. The spell's own workflow then marks the reaction
 * or bonus action as used and skips checking them again. False: the use stops.
 */
export declare function castPreChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean>;
