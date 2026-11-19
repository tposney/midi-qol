import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
/** An activity of a type midi uses (adoptActivityType): midi's functions apply to it */
export declare function isMidiActivityType(activity: unknown): activity is MidiActivity;
/** midi's region settings on an activity (activitySchema.ts `regionBehavior`) */
export interface ActivityRegionBehavior {
    enabled: boolean;
    dispositionFilter: number;
    excludeSource: boolean;
    oncePerTurn: boolean;
    wallRestriction: string;
    regionVisibility: number;
    attachToken: string;
    moveDistance: number;
    moveDirection: string;
    moveTiming: string;
    templateOrigin: string;
    rules: {
        trigger: string;
        action: string;
        targetId: string;
    }[];
}
/** midi's region light on an activity (activitySchema.ts `regionLight`) */
export interface ActivityRegionLight {
    enabled: boolean;
    dim: number;
    bright: number;
    color: string | null;
    alpha: number;
    luminosity: number;
    animationType: string | null;
    animationSpeed: number;
    animationIntensity: number;
}
/** An activity midi uses: dnd5e's, with midi's fields (activitySchema.ts) and getters (activityPrototype.ts) */
export type MidiActivity = Activity & {
    regionBehavior?: ActivityRegionBehavior;
    regionLight?: ActivityRegionLight;
    effectiveActivationType?: string;
    isSelfTriggerableOnly?: boolean;
    use?(usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<unknown>;
};
/**
 * The activity an ammunition item contributes, if any.
 *
 * `automationOnly` wins: that is the deliberate marker for an activity meant to be triggered rather
 * than used directly. The fallback exists because `otherActivityCompatible` defaults to true, so
 * most activities qualify and a homebrew item may not mark one.
 *
 * Takes the item rather than reading it off an activity, because the caller sometimes holds a
 * rebuilt copy: ammunition with `uses.autoDestroy` is deleted by dnd5e as the last piece is spent,
 * and midi reconstructs it from the chat card.
 */
export declare function findAmmunitionActivity(ammunitionItem: any): any | undefined;
