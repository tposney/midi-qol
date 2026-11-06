/**
 * Adding to a usage card. The card is drawn from its data and its `content` is empty, so splicing text into `content`
 * does nothing; a note is a message linked to the card, drawn by the card where it names (CardNoteMessage.ts).
 */

import { MODULE_ID } from "../../midi-qol.js";
import { safeGetGameSetting } from "../settings.js";
import { hiddenRollView, isObscured } from "../ChatClasses/ChatMessageMidi.js";

export { registerCardNoteRenderer };
import { getCachedDocument } from "../utils.js";
import { NOTE_MESSAGE_TYPE, notesOf, registerCardNoteRenderer } from "../ChatClasses/CardNoteMessage.js";
import { rendersFromModel } from "../ChatClasses/UsageCardMessage.js";
import { cardActor } from "./saveVisibility.js";

export type CardNoteOptions = {
  /** A section (attack, hits, damage, otherDamage, bonusDamage, utility, saves), `buttons`, `top` or `bottom` (default). */
  anchor?: string;
  /** Outside the anchor (`before`/`after`) or inside it (`prepend`/`append`, default). */
  position?: string;
  /** A note added again with the same key replaces this user's earlier one. */
  key?: string;
  label?: string;
  cssClass?: string;
  /** Order among notes in the same place. */
  sort?: number;
  /** Drawn by the renderer registered for this kind (registerCardNoteRenderer) from `data`; the html is the fallback. */
  kind?: string;
  data?: Record<string, unknown>;
  /** `gm`, `owner` (the card actor's owners) or `all` (default); or the users to whisper the note to. */
  visibility?: "all" | "gm" | "owner";
  whisper?: string[];
};

type CardTarget = ChatMessage.Implementation | { chatCard?: ChatMessage.Implementation, itemCardUuid?: string } | string | undefined | null;

function resolveCard(target: CardTarget): ChatMessage.Implementation | undefined {
  if (!target) return undefined;
  if (target instanceof ChatMessage) return target;
  const uuid = typeof target === "string" ? target : target.chatCard?.uuid ?? target.itemCardUuid;
  if (!uuid) return undefined;
  const card = getCachedDocument(uuid);
  return card instanceof ChatMessage ? card : undefined;
}

function whisperFor(card: ChatMessage.Implementation, options: CardNoteOptions): string[] {
  if (options.whisper) return options.whisper;
  const users = game.users?.contents ?? [];
  if (options.visibility === "gm") return users.filter(u => u.isGM).map(u => u.id!);
  if (options.visibility === "owner") {
    const actor = cardActor(card);
    return users.filter(u => u.isGM || u.id === card.author?.id || actor?.testUserPermission(u, "OWNER")).map(u => u.id!);
  }
  return [];
}

/** Evaluate `[[...]]` inline rolls once, as core does for a message's content when it is created. */
async function bakeInlineRolls(html: string, card: ChatMessage.Implementation): Promise<string> {
  for (const [expression] of html.matchAll(/\[\[(.*?)(]{2,3})(?:{([^}]+)})?/g)) {
    html = html.replace(expression, await foundry.applications.ux.TextEditor.implementation.enrichHTML(expression, {
      documents: false, secrets: false, links: false, rolls: true, custom: false, rollData: card.getRollData()
    }));
  }
  return html;
}

/**
 * Add a note to a usage card. `target` is the card, its uuid or a workflow; `html` may hold links, inline rolls and
 * enricher text. Returns the note message, or undefined when there is no card.
 */
export async function addCardNote(target: CardTarget, html: string, options: CardNoteOptions = {}): Promise<ChatMessage.Implementation | undefined> {
  const card = resolveCard(target);
  if (!card) return undefined;
  const system = Object.fromEntries(Object.entries({
    origin: card.id, anchor: options.anchor, position: options.position, key: options.key, label: options.label,
    cssClass: options.cssClass, sort: options.sort, kind: options.kind, data: options.data,
    html: html.includes("[[") ? await bakeInlineRolls(html, card) : html
  }).filter(([, v]) => v !== undefined && v !== null));
  const whisper = whisperFor(card, options);
  const existing = options.key ? notesOf(card).find(note =>
    (note.system as { key?: string }).key === options.key && note.canUserModify(game.user!, "update")) : undefined;
  if (existing) {
    await existing.update({ system, whisper } as ChatMessage.UpdateData);
    return existing;
  }
  return ChatMessage.create({ type: NOTE_MESSAGE_TYPE, system, speaker: card.speaker, whisper } as ChatMessage.CreateData);
}

/** Remove the notes with this key that this user may delete. Returns how many were removed. */
export async function removeCardNote(target: CardTarget, key: string): Promise<number> {
  const card = resolveCard(target);
  if (!card) return 0;
  const ids = notesOf(card)
    .filter(note => (note.system as { key?: string }).key === key && note.canUserModify(game.user!, "delete"))
    .map(note => note.id!);
  if (ids.length) await ChatMessage.deleteDocuments(ids);
  return ids.length;
}

/**
 * Message data making a message one of a note's own: linked to the note (`system.origin`), so it is hidden in the log,
 * passed to the note's renderer and deleted with the note. `role` is for the renderer. Pass it as a roll's message
 * data, e.g. `actor.rollSkill({ skill }, {}, { data: MidiQOL.cardNoteMessageData(note, "source") })`.
 */
export function cardNoteMessageData(note: ChatMessage.Implementation, role?: string) {
  return { system: { origin: note.id }, flags: { [MODULE_ID]: { cardNote: { role } } } };
}

/**
 * A message as a card draws it (dnd5e's summary), or "" if this viewer may not see it or it is in the log instead
 * (dnd5e's *chat card summaries* off). The card masks it as it masks dnd5e's summaries: a private roll this viewer
 * can't read shows as rolled, a forced-blind one not at all, an obscured one with ?? for its result.
 */
export async function renderLinkedMessage(message: ChatMessage.Implementation | undefined): Promise<string> {
  if (!message?.visible || safeGetGameSetting("dnd5e", "chatCardSummary") === false) return "";
  const html = await (message.system as { render?: (options: object) => Promise<string> }).render?.({ summary: true }) ?? "";
  // Marked with its message so the card masks it as it masks dnd5e's summaries (hidden or obscured rolls); not dnd5e's
  // own .card-summary, which dnd5e lays out and gives a delete control as a top-level summary.
  const token = (message as { getAssociatedToken?: () => TokenDocument.Implementation | undefined }).getAssociatedToken?.();
  return html ? `<div class="midi-qol-linked-message" data-message-id="${message.id}"${token ? ` data-target-uuid="${token.uuid}"` : ""}>${html}</div>` : "";
}

/**
 * A message's roll total if this viewer may see it: not a private roll they can't see, not hidden, and not one midi
 * shows players obscured (*Blind roll display*). Otherwise undefined.
 */
export function visibleRollTotal(message: ChatMessage.Implementation | undefined): number | undefined {
  if (!message?.visible || hiddenRollView(message) !== "show" || isObscured(message)) return undefined;
  return message.rolls?.[0]?.total;
}

let warnedContentWrite = false;

/**
 * A usage card drawn from its data shows `content` instead of itself when it is set, so text written there would
 * replace the card: it becomes a note at the bottom of the card instead.
 */
export function setupCardContentGuard() {
  Hooks.on("preUpdateChatMessage", (message: ChatMessage.Implementation, changes: Record<string, any>) => {
    const content = changes.content;
    if (typeof content !== "string" || !content.trim() || !rendersFromModel(message)) return;
    delete changes.content;
    addCardNote(message, content);
    if (!warnedContentWrite) {
      warnedContentWrite = true;
      console.warn(`${MODULE_ID} | text written to a midi card's content was added as a note at the bottom of the card; use MidiQOL.addCardNote to place it`);
    }
  });
}
