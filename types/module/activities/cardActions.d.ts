/**
 * Handlers for the buttons on a usage card, by action name, installed on each activity type's
 * `metadata.usage.actions` so dnd5e's `Activity#onChatAction` calls them (with the activity as used, scaled).
 * Kept here rather than on midi's activity subclasses so they apply to any activity class registered for the type.
 *
 * Precedence for one type: dnd5e's own handler < one registered for all types < one registered for the type;
 * a `whenAbsent` handler only fills an action nothing else handles.
 */
import type { Activity } from "../../globals.js";
/** Calls the handler this one took the place of (a lower precedence midi handler, else dnd5e's own); arguments default to this call's. */
export type CardActionNext = (event?: PointerEvent, target?: HTMLElement, message?: ChatMessage.Implementation) => unknown;
/** As dnd5e's card action handlers, with `next` to hand the click on. */
export type CardActionHandler = (this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation, next: CardActionNext) => unknown;
type InstalledHandler = (this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) => unknown;
/** A handler for a card button's action; `types` limits it to those activity types. Register at init or later. */
export declare function registerCardAction(action: string, handler: CardActionHandler, options?: {
    types?: string[];
    whenAbsent?: boolean;
    priority?: number;
}): void;
export declare function registerCardActions(types: string[] | undefined, handlers: Record<string, CardActionHandler>): void;
/** The actions an activity type's metadata should carry: dnd5e's (`base`) with midi's applied. */
export declare function cardActionsFor(type: string, base?: Record<string, InstalledHandler>): Record<string, InstalledHandler>;
/** Puts the registered handlers on every activity type's class in CONFIG. Run after the classes are registered. */
export declare function installCardActions(activityTypes: Record<string, {
    documentClass?: unknown;
}>): void;
export {};
