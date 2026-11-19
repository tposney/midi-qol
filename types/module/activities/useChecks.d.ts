import { MidiActivity } from "./midiActivity.js";
import { ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { Workflow } from "../Workflow.js";
export declare function setupCanSeeSense(activity: MidiActivity, usage: {
    workflow?: Workflow;
}): Promise<void>;
export declare function preTargetingChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
export declare function preChatChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
export declare function postChatCardChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
