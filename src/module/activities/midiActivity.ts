import { adoptedActivityTypes } from "./activityPrototype.js";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";

/*
 * What midi adds to dnd5e's activities: the type midi reads them as, and which types midi uses.
 * (M14: from MidiActivityMixin.ts, midi's activity class layer until then.)
 */

/** An activity of a type midi uses (adoptActivityType): midi's functions apply to it */
export function isMidiActivityType(activity: unknown): activity is MidiActivity {
  return !!activity && typeof activity === "object" && "type" in activity && typeof activity.type === "string" && adoptedActivityTypes.has(activity.type);
}

/** midi's region settings on an activity (activitySchema.ts `regionBehavior`) */
export interface ActivityRegionBehavior {
  enabled: boolean; dispositionFilter: number; excludeSource: boolean; oncePerTurn: boolean; wallRestriction: string;
  regionVisibility: number; attachToken: string; moveDistance: number; moveDirection: string; moveTiming: string;
  templateOrigin: string; rules: { trigger: string, action: string, targetId: string }[];
}

/** midi's region light on an activity (activitySchema.ts `regionLight`) */
export interface ActivityRegionLight {
  enabled: boolean; dim: number; bright: number; color: string | null; alpha: number; luminosity: number;
  animationType: string | null; animationSpeed: number; animationIntensity: number;
}

/** midi's region barrier on an activity (activitySchema.ts `regionBarrier`) */
export interface ActivityRegionBarrier {
  enabled: boolean; move: boolean; sight: string; sound: string; direction: string; trace: string; sideDepth?: number; sideActivity?: string;
  uses?: string; usesDirection?: string;
}

/** An activity midi uses: dnd5e's, with midi's fields (activitySchema.ts) and getters (activityPrototype.ts) */
export type MidiActivity = Activity & {
  regionBehavior?: ActivityRegionBehavior;
  regionLight?: ActivityRegionLight;
  regionBarrier?: ActivityRegionBarrier;
  effectiveActivationType?: string;
  isSelfTriggerableOnly?: boolean;
  use?(usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<unknown>;
};

/* midi's own activity methods (M14 stage 2: were MidiActivityMixin members, installed on dnd5e's classes by graft.ts) */

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
export function findAmmunitionActivity(ammunitionItem: any): any | undefined {
  if (!ammunitionItem) return undefined;
  const activities = ammunitionItem.system?.activities;
  const found = activities?.find((a: any) => a.midiProperties?.automationOnly && a.isOtherActivityCompatible)
    ?? activities?.find((a: any) => a.isOtherActivityCompatible);
  found?.prepareData();
  return found;
}
