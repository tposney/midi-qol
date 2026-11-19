import { MidiActivity } from "./midiActivity.js";
import { Activity, MidiUsageChatContext } from "../../globals.js";
export declare function setupUsageCard(): void;
/**
 * Handle the "Place Template" button click from the chat card.
 * Places all templates sequentially and delegates to workflow for validation and processing.
 */
export declare function cardPlaceTemplate(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
export declare function cardRollDamage(this: Activity, event: any, target: any, message: any): Promise<void | Roll<import("fvtt-types/src/utils/index.mjs").EmptyObject>[]> | undefined;
export declare function cardRollDamageNoCritical(this: Activity, event: any, target: any, message: any): Promise<void | Roll<import("fvtt-types/src/utils/index.mjs").EmptyObject>[]> | undefined;
export declare function cardRollDamageCritical(this: Activity, event: any, target: any, message: any): Promise<void | Roll<import("fvtt-types/src/utils/index.mjs").EmptyObject>[]> | undefined;
export declare function cardConfirmDamageRollCancel(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
/** The activity's own confirmation step (midi's activities) */
export declare function confirmOnCard(activity: Activity, action: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
export declare function cardConfirmDamageRollComplete(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
export declare function cardConfirmDamageRollCompleteHit(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
export declare function cardConfirmDamageRollCompleteMiss(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
export declare function cardApplyEffects(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
export declare function cardFollowUp(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
export declare function cardRefundOtherActivity(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
export declare function cardConsumeOtherActivity(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
/** A save or check button for another activity's save, on this activity's card: that activity rolls it. */
export declare function cardRollOtherSave(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<any>;
/**
 * midi's part of a use card's creation, on dnd5e's hooks (M14; was an override of `_createUsageMessage`).
 * Before: the card's rendering decisions, settled into its system data. They depend on the workflow, which exists now
 * and is gone by the time the card is drawn again after a reload, so they are decided once and stored
 * (`MidiUsageMessageData` reads them back); `midiUsageContext` works them out. A use started from inside another of the
 * actor's workflows is linked to its card, as dnd5e links saves.
 * After: the use's workflow is its card's from now on, filed under the card's uuid before dnd5e places the use's
 * templates and calls postUseActivity (not only when use() returns).
 */
/** An activity of a type midi uses: it works out its card's context */
export type UsageCardActivity = Activity & {
    midiUsageContext?: (message: unknown) => MidiUsageChatContext;
};
export declare function registerUsageMessageHooks(): void;
export declare function doConfirmation(activity: MidiActivity, actionToCall: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
/** midi's additions to the usage context; not named `_usageChatContext`, which would keep dnd5e's legacy content path. */
export declare function midiUsageContext(activity: MidiActivity, message: any): MidiUsageChatContext;
