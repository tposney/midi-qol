import { MODULE_ID } from "../../midi-qol.js";
import { checkRule, configSettings } from "../settings.js";
import { getTokenName } from "../utils.js";
import { saveDisplayMode } from "../lib/saveVisibility.js";

/**
 * With Auto Check Saves off, midi's saves section lists the targets without results and dnd5e's save and check buttons
 * stay on the card. A roll made from one is a dnd5e message linked to the card (`system.origin`); midi records it in
 * its section, so the card shows one summary style (Save summary style: midi). A reroll replaces the row; a creature
 * that wasn't a target gets one. Display only: as with dnd5e's summary, nothing is applied from it.
 */
export function registerCardSaveRecording() {
  Hooks.on("createChatMessage", (message: ChatMessage.Implementation) => { void recordCardSave(message); });
}

async function recordCardSave(message: ChatMessage.Implementation) {
  // @ts-expect-error no dnd5e-types
  const system: { origin?: ChatMessage.Implementation | string | null, type?: string } = message.system ?? {};
  if (!["save", "check"].includes(message.type as string) || system.type === "death") return;
  const card = typeof system.origin === "string" ? game.messages?.get(system.origin) : system.origin;
  const section = foundry.utils.getProperty(card ?? {}, "system.midi.sections.saves") as { data?: { saves?: any[] } } | undefined;
  if (!card || !section?.data?.saves || configSettings.saveSummaryStyle === "dnd5e") return;
  if (saveDisplayMode() !== "none") return;
  // @ts-expect-error no dnd5e-types
  const activity = card.getAssociatedActivity?.();
  // The GM records it, or with none online the card's author
  if ((game.users?.activeGM ?? card.author) !== game.user || !card.isOwner) return;

  const roll = message.rolls?.[0] as (Roll & { isCritical?: boolean, isFumble?: boolean, options: { target?: number } }) | undefined;
  const token = message.speaker?.token ? (game.scenes?.get(message.speaker.scene ?? "")?.tokens.get(message.speaker.token) ?? null) : null;
  if (!roll || !token) return;
  const total = roll.total ?? 0;
  const dc: number | undefined = Number.isFinite(roll.options.target) ? roll.options.target : activity?.save?.dc?.value ?? activity?.check?.dc?.value;
  let saved = dc !== undefined && total >= dc;
  if (dc !== undefined && checkRule("criticalSaves")) saved = (!!roll.isCritical || total >= dc) && !roll.isFumble;
  const npc = !token.actor?.hasPlayerOwner;
  // @ts-expect-error no dnd5e-types
  const portrait = configSettings.usePlayerPortrait && token.actor?.type === "character";
  const uuid = token.uuid;
  const entry = {
    target: { id: token.id, document: { uuid } },
    gmName: getTokenName(token),
    img: (portrait ? token.actor?.img : token.texture.src) ?? token.actor?.img ?? "",
    targetClass: npc ? "midi-qol-npc-target" : "midi-qol-player-target",
    saveSymbol: dc === undefined ? "" : `${npc ? "midi-qol-npc-save-symbol" : ""} midi-qol-save-symbol ${saved ? "fa-check" : "fa-xmark"}`,
    saveTotalClass: npc ? "midi-qol-npc-save-total" : "",
    saveToolTipClass: npc ? "midi-qol-npc-save-tooltip" : "",
    rollTotal: String(total),
    saveTooltip: dc === undefined ? undefined : `${total} vs DC ${dc}`,
    saveClass: dc === undefined ? "" : (saved ? "success" : "failure"),
    hasAttribution: false
  };
  const saves = section.data.saves.filter((save: any) => save?.target?.document?.uuid !== uuid);
  const at = section.data.saves.findIndex((save: any) => save?.target?.document?.uuid === uuid);
  saves.splice(at < 0 ? saves.length : at, 0, entry);
  // The card's save rolls are tagged with their target; this one replaces any earlier one for it.
  const saveRoll = Roll.fromData(roll.toJSON() as any);
  foundry.utils.setProperty(saveRoll, `options.${MODULE_ID}.rollType`, "save");
  foundry.utils.setProperty(saveRoll, `options.${MODULE_ID}.targetUuid`, uuid);
  const rolls = (card.rolls ?? []).filter(r => !(foundry.utils.getProperty(r, `options.${MODULE_ID}.rollType`) === "save"
    && foundry.utils.getProperty(r, `options.${MODULE_ID}.targetUuid`) === uuid));
  await card.update({ rolls: [...rolls, saveRoll].map(r => r.toJSON()), "system.midi.sections.saves.data.saves": saves } as ChatMessage.UpdateData);
}
