/**
 * Follow-up buttons on a usage card: activities offered when another of the item's activities finishes, which the user
 * can run from the card or ignore. Nothing prompts and the workflow doesn't wait. An activity declares itself a follow-up
 * (midiProperties.followUp, with an optional condition and which creatures it runs at); automations offer any activity
 * with MidiQOL.addFollowUp. Each entry keeps its targets and whether the use was a critical, so it runs as the use left
 * them.
 */
import { Activity, TokenOrDocument } from "../globals.js";
import type { Workflow } from "./Workflow.js";
import { TokenDocumentSet } from "./lib/tokenDocumentSet.js";
export type FollowUpEntry = {
    activityUuid: string;
    label: string;
    targetUuids: string[];
    critical: boolean;
    used: boolean;
};
export declare const followUpTargetModes: readonly ["default", "self", "targets", "hitTargets", "missedTargets", "failedSaves", "saveTargets"];
export type FollowUpTargetMode = typeof followUpTargetModes[number];
/** Who a follow-up runs at. Default: the creatures hit by an attack, else all the targets. */
export declare function followUpTargets(workflow: Workflow, mode?: FollowUpTargetMode | string): TokenDocumentSet;
/**
 * Offer an activity as a button on the workflow's card, run at `options.targets` (default: the creatures an attack hit,
 * else all the targets; none is allowed). Returns false if the card is missing or the activity is already offered.
 */
export declare function addFollowUp(workflow: Workflow, activity: Activity, options?: {
    label?: string;
    targets?: Iterable<TokenOrDocument | string>;
}): Promise<boolean>;
/**
 * The item's activities declared as follow-ups whose condition holds, offered once one of its other activities finishes.
 * One that would run at no one, after a use that had targets (an attack that missed, no failed save), isn't offered.
 */
export declare function offerFollowUps(workflow: Workflow): Promise<void>;
/** Why the follow-up can't be used now (its item's or own uses are spent), or undefined. */
export declare function followUpUnavailable(activity: Activity | undefined): string | undefined;
/** The card's follow-ups for rendering: unused ones, for the attacker's owners and the GM. */
export declare function followUpButtons(message: ChatMessage.Implementation): {
    index: number;
    label: string;
    disabled: boolean;
}[];
/** Run a card's follow-up at the stored targets (a critical as a critical), link its card to this one, mark it used. */
export declare function runFollowUp(message: ChatMessage.Implementation, index: number): Promise<void>;
