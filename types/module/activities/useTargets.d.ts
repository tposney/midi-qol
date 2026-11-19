import { MidiActivity } from "./midiActivity.js";
import { ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
export declare function setupTargets(activity: MidiActivity, config: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean>;
export declare function confirmTargets(activity: MidiActivity): Promise<void>;
