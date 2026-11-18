import { Activity } from "../../globals.js";
/**
 * What midi does with each activity type, in place of per-type getter overrides on midi's subclasses.
 * A type with no policy is not automated: midi runs no workflow for it (dnd5e's `order`, another module's type until
 * it registers one).
 */
export interface ActivityPolicy {
    /** midi runs a workflow when this type is used */
    automated: boolean;
    /** may serve as another activity's "other activity" (its damage/save after the attack) */
    possibleOtherActivity: boolean;
    /** never an other activity, whatever the activity's otherActivityCompatible says */
    neverOtherActivity: boolean;
    /** may be a triggered activity */
    triggerable: boolean;
    /** only its own actor may trigger it */
    selfTriggerableOnly: boolean;
    /** target confirmation forced for this type ("never"), else the activity's own setting */
    forcedTargetConfirmation?: string;
    /** whether dnd5e runs the type's follow-up action after a use (e.g. placing an enchantment), midi doing the rest */
    subsequentActions: (activity: Activity) => boolean;
}
/** For a module's own activity type: how midi treats it. Merged over what is registered. */
export declare function registerActivityPolicy(type: string, policy: Partial<ActivityPolicy>): void;
export declare function activityPolicy(activityOrType: {
    type?: string;
} | string | undefined): ActivityPolicy;
export declare function installActivityPrototype(): void;
