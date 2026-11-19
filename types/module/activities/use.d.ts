import { MidiActivity } from "./midiActivity.js";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { Workflow } from "../Workflow.js";
import { type UseState } from "./useRelaunch.js";
/** The player's targets now are the use's pre-selection (user-targets plan stage 3): its snapshot and the workflow's */
export declare function retakeUserTargets(workflow: Workflow, usage?: ActivityUseConfiguration): void;
export declare function useAs(used: MidiActivity, actor: Actor.Implementation | null | undefined, usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
/**
 * midi's use (M10, activities/useRelaunch.ts): calls dnd5e's use with a use key, which midi's preUseActivity
 * listener cancels and restarts after midi's pre-use work; returns the restart's result. The restarted call
 * (marked) is dnd5e's use itself, so other listeners see one use.
 */
export declare function prepareUse(used: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<{
    done: true;
    result: unknown;
} | {
    done: false;
    state: UseState;
}>;
/** dnd5e's preUseActivity for used use (its workflow): the scaled activity dnd5e uses, and dnd5e's copy of the usage */
export declare function onUsePreUse(activity: MidiActivity, state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): boolean;
/** dnd5e's activityConsumption for activity use: the activity consumption and the card run on, deferred concentration */
export declare function onUseConsumption(activity: MidiActivity, state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): void;
/**
 * midi's work after dnd5e's use (M10 stage 1): the card's workflow, the checks after the card, templates, undo data,
 * the reaction and bonus action markers, cast data, then the workflow's first step. Returns what use() returns.
 */
export declare function finishUse(used: MidiActivity, state: UseState, useResults: any): Promise<unknown>;
/**
 * Check if used activity has consumption configured.
 * @returns true if used activity has consumption targets configured
 */
export declare function hasConsumption(activity: MidiActivity): boolean;
/**
 * Determines whether activity activity should auto-consume resources without showing a dialog.
 * @param workflow - The workflow for getting auto-consume settings
 * @returns true if consumption should be automatic, false if a dialog should be shown
 */
export declare function shouldAutoConsume(activity: MidiActivity, workflow?: Workflow): boolean;
export declare function checkAutoConsume(activity: MidiActivity, usage: ActivityUseConfiguration, dialog?: RollDialogConfig): Promise<boolean>;
