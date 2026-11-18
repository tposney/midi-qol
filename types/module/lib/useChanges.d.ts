import { Activity } from "../../globals.js";
/** The use's changes as stored, or undefined for none */
export declare function useChangesJson(card: ChatMessage.Implementation, item: Item.Implementation, activity: Activity): string | undefined;
/** The use's item and activity for a workflow rebuilt from its card: the card's scaled item with the stored changes */
export declare function restoredUse(card: ChatMessage.Implementation): {
    item?: Item.Implementation;
    activity?: Activity;
};
