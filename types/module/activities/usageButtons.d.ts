import type { Activity } from "../../globals.js";
import { type RegistryOptions } from "../api/registry.js";
export type UsageButton = {
    action?: string;
    label?: {
        value?: string;
        short?: string;
        hidden?: string;
    };
    icon?: string;
    visibility?: string;
    canGroup?: boolean;
    dataset?: Record<string, unknown>;
};
/** Whether saves are rolled from the card's buttons rather than by midi. */
export declare function savesRolledFromChat(): boolean;
/** The card's buttons: dnd5e's (`base`) as midi draws them. */
export declare function midiUsageButtons(activity: Activity, message: object, base: UsageButton[]): UsageButton[];
/** Whether a card button is hidden: true hides it, false shows it, undefined leaves it to the next rule. */
export type CardButtonRule = (button: UsageButton, message: ChatMessage.Implementation, activity: Activity | undefined) => boolean | undefined;
/**
 * A hide rule for the card buttons with `action` (another module's own button, or one of midi's). Rules for an action
 * are asked before midi's own rule, higher priority first, then in registration order; the first answer that is not
 * undefined decides. Not asked once the card's buttons are all removed (a finished use).
 */
export declare function registerCardButtonRule(action: string, id: string, rule: CardButtonRule, options?: RegistryOptions): void;
/**
 * midi's decision for a button of the card (one not visible to all): true hides it, false shows it, undefined leaves
 * it to dnd5e's own `shouldHideChatButton`.
 */
export declare function midiButtonHidden(button: UsageButton, message: ChatMessage.Implementation, activity: Activity | undefined): boolean | undefined;
export declare function installUsageButtons(): void;
