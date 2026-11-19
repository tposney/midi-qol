/*
 * midi's damage messages (Workflow.createDamageMessages, M2 stage 8): dnd5e damage messages folded into the use card,
 * which holds no damage of its own and draws theirs (cardDamageRolls, M13 stage 3). Their summary template renders
 * nothing (the card draws them), which is what makes dnd5e hide them in the log; with dnd5e's chat card summaries off
 * they show in the log (M13 D1 b).
 */
const MODULE_ID = "midi-qol";
export const DAMAGE_SUMMARY_TEMPLATE = "modules/midi-qol/templates/chat/damage-summary.hbs";

/**
 * A use card deleted (by hand, a chat clear, undo): its folded damage messages go with it, deleted by the client that
 * deleted the card (a message it can't delete is left, as with any other).
 */
export function deleteDamageMessagesWithCard(card: ChatMessage.Implementation, userId: string) {
  if (userId !== game.user?.id || !card.id) return;
  const ids = (game.messages?.contents ?? [])
    // The stored id: the prepared origin is the card itself, gone once it is deleted
    .filter(message => message.flags?.[MODULE_ID]?.damage && (message._source.system as { origin?: string } | undefined)?.origin === card.id
      && message.canUserModify(game.user!, "delete"))
    .map(message => message.id!);
  if (ids.length) void ChatMessage.implementation.deleteDocuments(ids).catch(err => console.warn("midi-qol | deleting a card's damage messages", err));
}

export function registerDamageMessageSummary() {
  Hooks.on("deleteChatMessage", (card: ChatMessage.Implementation, _options: unknown, userId: string) => deleteDamageMessagesWithCard(card, userId));
  // dnd5e redraws a message's origin when its system data changes, not its rolls: the card draws them
  Hooks.on("updateChatMessage", (message: ChatMessage.Implementation, changed: { rolls?: unknown }) => {
    if (!message.flags?.[MODULE_ID]?.damage || !("rolls" in changed)) return;
    const origin = game.messages?.get((message._source.system as { origin?: string } | undefined)?.origin ?? "");
    if (origin) ui.chat?.updateMessage(origin);
  });
  globalThis.libWrapper.register(MODULE_ID, "dnd5e.dataModels.chatMessage.DamageMessageData.prototype.summaryTemplate",
    function (this: { parent?: { flags?: Record<string, any> } }, wrapped: () => string) {
      return this.parent?.flags?.[MODULE_ID]?.damage ? DAMAGE_SUMMARY_TEMPLATE : wrapped();
    }, "MIXED");
}
