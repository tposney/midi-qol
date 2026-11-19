import { Activity } from "../../globals.js";
export declare function setupSaveActivity(): void;
/** The friendly-save choices on Save's and Check's sheets */
export declare const friendlySaveOptions: () => {
    value: string;
    label: string;
}[];
export declare function cardRollDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void | Roll<import("fvtt-types/src/utils/index.mjs").EmptyObject>[]> | undefined;
