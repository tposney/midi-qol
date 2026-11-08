/**
 * Influence (2024 action): a hesitant creature's check, drawn on the action's card as a note. The note holds the request
 * (`data`); the check is its own message (role `check`), drawn here with its result against the DC.
 */
import { MODULE_ID } from "../../midi-qol.js";
import { CardNoteRenderContext } from "../ChatClasses/CardNoteMessage.js";
import { registerCardNoteRenderer, renderLinkedMessage, visibleRollTotal } from "./cardNotes.js";
import { tokenName } from "./tokenNames.js";
import { shouldDisplaySaveDC } from "../settings.js";

export const INFLUENCE_NOTE_KIND = "midi-qol.influence";

type InfluenceNoteData = { target: { name: string, uuid?: string }, attitude: string, skill: string, dc: number };

async function renderInfluence({ card, data, messages }: CardNoteRenderContext): Promise<string> {
  const { target, attitude, skill, dc } = data as InfluenceNoteData;
  const escape = foundry.utils.escapeHTML;
  const name = escape(target.uuid ? tokenName(target.uuid, target.name) : target.name);
  const check = messages.find(m => (m.getFlag(MODULE_ID, "cardNote") as { role?: string } | undefined)?.role === "check");
  // The DC as dnd5e's Challenge Visibility shows it for the creature making the check
  // @ts-expect-error no dnd5e-types
  const dcText = game.user?.isGM || shouldDisplaySaveDC(card.getAssociatedActor?.() ?? undefined) ? `, DC ${dc}` : "";
  const parts = [`<p>${name} is ${escape(attitude)}: ${escape(skill)} check${dcText}.</p>`];
  if (!check) parts.push(`<div class="midi-qol-contest-waiting"><i class="fa-solid fa-hourglass-half"></i> Waiting for the check.</div>`);
  else {
    parts.push(await renderLinkedMessage(check));
    const total = visibleRollTotal(check);
    if (total !== undefined) parts.push(`<p>${name} ${total >= dc ? "agrees" : "refuses"}.</p>`);
  }
  return parts.join("");
}

export function setupInfluenceNote() {
  registerCardNoteRenderer(INFLUENCE_NOTE_KIND, renderInfluence);
}
