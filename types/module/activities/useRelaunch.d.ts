import type { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
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
type Prepared = {
    done: true;
    result: unknown;
} | {
    done: false;
    state: UseState;
};
/** An activity with midi's use (MidiActivityMixin). */
export interface RestartableActivity extends Activity {
    prepareUse(usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Prepared>;
    onUsePreUse(state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): boolean;
    onUseConsumption(state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): void;
    finishUse(state: UseState, results: unknown): Promise<unknown>;
    use(usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<unknown>;
}
export declare function isRelaunched(usage: ActivityUseConfiguration | undefined): boolean;
/** Clears a cancelled use's state, so a resubmitted config starts afresh. */
export declare function clearAbandonedUse(...configs: (ActivityUseConfiguration | undefined)[]): void;
/** midi's use, before calling dnd5e's: what it was given, for the restart its key starts. */
export declare function noteCall(useKey: string, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): void;
/** For midi's use(): the restart its call to dnd5e's use started (none: dnd5e's use wasn't cancelled by midi). */
export declare function takeRelaunch(useKey: string): Promise<unknown>;
/** At init, before other modules' listeners where possible: a listener before midi's would see each use twice. */
export declare function initUseRelaunch(): void;
export {};
