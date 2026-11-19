import type { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { type MidiActivity } from "./midiActivity.js";
/** One use's working state between midi's pre-use work, dnd5e's use and midi's post-use work. */
export interface UseState {
    usage: ActivityUseConfiguration;
    dialog: RollDialogConfig;
    message: RollMessageConfig;
    /** The clone midi works on, the one dnd5e's use runs on */
    activity: RestartableActivity;
    deferConcentration: boolean;
    /** dnd5e's copy of the usage (preUseActivity) and the one consumption ran with (activityConsumption) */
    dnd5eUsageConfig?: ActivityUseConfiguration;
    usageData?: ActivityUseConfiguration;
}
/** An activity of a type midi uses (installUse) */
export type RestartableActivity = MidiActivity & {
    use(usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<unknown>;
};
/**
 * midi's use (M14: was MidiActivityMixin's `use`, installed by graft.ts): calls dnd5e's use with a use key, so midi's
 * preUseActivity listener can cancel it and restart it after midi's pre-use work; returns the restart's result. A
 * chained OVERRIDE, as graft.ts installed it: midi's is next to dnd5e's, so other modules' wraps see each use once.
 */
export declare function installUse(): void;
export declare function isRelaunched(usage: ActivityUseConfiguration | undefined): boolean;
/** Clears a cancelled use's state, so a resubmitted config starts afresh. */
export declare function clearAbandonedUse(...configs: (ActivityUseConfiguration | undefined)[]): void;
/** midi's use, before calling dnd5e's: what it was given, for the restart its key starts. */
export declare function noteCall(useKey: string, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): void;
/** For midi's use(): the restart its call to dnd5e's use started (none: dnd5e's use wasn't cancelled by midi). */
export declare function takeRelaunch(useKey: string): Promise<unknown>;
type CastChecks = (activity: Activity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig) => Promise<boolean>;
/** The Cast activity's checks (CastActivity.ts), given here so this file needn't import the activity classes */
export declare function setCastChecks(checks: CastChecks): void;
/** At init, before other modules' listeners where possible: a listener before midi's would see each use twice. */
export declare function initUseRelaunch(): void;
export {};
