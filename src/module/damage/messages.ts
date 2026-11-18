/*
 * midi's damage messages (Workflow.createDamageMessages, M2 stage 8): dnd5e damage messages folded into the use card.
 * Their summary template renders nothing (the card shows the damage), which is what makes dnd5e hide them in the log.
 */
const MODULE_ID = "midi-qol";
export const DAMAGE_SUMMARY_TEMPLATE = "modules/midi-qol/templates/chat/damage-summary.hbs";

export function registerDamageMessageSummary() {
  globalThis.libWrapper.register(MODULE_ID, "dnd5e.dataModels.chatMessage.DamageMessageData.prototype.summaryTemplate",
    function (this: { parent?: { flags?: Record<string, any> } }, wrapped: () => string) {
      return this.parent?.flags?.[MODULE_ID]?.damage ? DAMAGE_SUMMARY_TEMPLATE : wrapped();
    }, "MIXED");
}
