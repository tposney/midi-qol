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
    /**
     * How midi runs its workflow for a use (useRelaunch.ts): "preUseActivity", the type's use goes through dnd5e's base
     * use (the default); "preUseLinkedSpell", it hands its use to a spell (Cast); false, its use bypasses dnd5e's base use
     * and midi runs no workflow for it.
     */
    useRestart: "preUseActivity" | "preUseLinkedSpell" | false;
}
/** For a module's own activity type: how midi treats it. Merged over what is registered. */
export declare function registerActivityPolicy(type: string, policy: Partial<ActivityPolicy>): void;
export declare function activityPolicy(activityOrType: {
    type?: string;
} | string | undefined): ActivityPolicy;
export declare function installActivityPrototype(): void;
/**
 * A new activity (an item's add button, `Item5e#createActivity`) pairs with no other activity unless the data says so:
 * `otherActivityId: "none"`. Stored activities without the field keep "unset" (midi works out the pairing). A wrap,
 * not a hook (M14 D2): by `preUpdateItem` the activity's data always has the field, so a duplicated or copied activity
 * set to unset couldn't be told from a new one; here the caller's data is still as given.
 */
export declare function installActivityCreation(types: Set<string>): void;
/** The dnd5e activity types midi uses (its wraps, hooks and sheet additions are on these) */
export declare const adoptedActivityTypes: Set<string>;
/** What midi installs for an adopted type (wraps, sheet parts, card buttons, a type's own setup): each told of every type */
type AdoptionListener = (type: string) => void;
/** Install something for every adopted type: those adopted already, and each one adopted later */
export declare function onActivityTypeAdopted(listener: AdoptionListener): void;
/**
 * Every dnd5e activity type whose policy is automated: midi's own (midiPolicies) and any a module registered (M14:
 * adoption follows the policy, not a list of type names). A type with no policy is not automated.
 */
export declare function adoptAutomatedTypes(): void;
/** midi uses dnd5e's activity type `type`: its localization prefixes, then what each installer adds (onActivityTypeAdopted) */
export declare function adoptActivityType(type: string): void;
export {};
