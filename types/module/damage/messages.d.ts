export declare const DAMAGE_SUMMARY_TEMPLATE = "modules/midi-qol/templates/chat/damage-summary.hbs";
/**
 * A use card deleted (by hand, a chat clear, undo): its folded damage messages go with it, deleted by the client that
 * deleted the card (a message it can't delete is left, as with any other).
 */
export declare function deleteDamageMessagesWithCard(card: ChatMessage.Implementation, userId: string): void;
export declare function registerDamageMessageSummary(): void;
