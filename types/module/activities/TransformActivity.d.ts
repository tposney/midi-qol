import { Activity } from "../../globals.js";
import { type MidiActivity } from "./MidiActivityMixin.js";
import type { ActivityUseConfiguration } from "../../globals.js";
export declare function setupTransformActivity(): void;
/** midi transforms the use's targets (the Transform step; M14 stage 2: was a method of midi's Transform class) */
/** dnd5e's transform activity: its profiles, settings and mode */
export type TransformingActivity = MidiActivity & {
    transform?: {
        mode?: string;
    };
    profiles: {
        _id: string;
        uuid: string;
    }[];
    settings?: object;
    queryActor(profile: {
        _id: string;
        uuid: string;
    } | undefined): Promise<string | null>;
};
export declare function isTransformActivity(activity: Activity | null | undefined): activity is TransformingActivity;
export declare function transformActor(activity: TransformingActivity, config: ActivityUseConfiguration, message: ChatMessage): Promise<void>;
