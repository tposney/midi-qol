/**
 * A note on a usage card: its own chat message, linked to the card through `system.origin` as dnd5e links a card's
 * save and check messages. The card draws its notes into the section each names; the note is not shown in the log
 * while its card draws it. Visibility is the note message's own (whispers, blind).
 *
 * A note with a `kind` is drawn by the renderer registered for it (MidiQOL.registerCardNoteRenderer), per viewer and
 * whenever the card is drawn, from its `data` and its own messages: those linked to it (`system.origin`, as the note is
 * to its card), which dnd5e then hides in the log. `html` is shown when no renderer is registered.
 */

import { error } from "../../midi-qol.js";
import { rendersFromModel } from "./UsageCardMessage.js";
import { Dnd5eChatMessage } from "../../globals.js";

export const NOTE_MESSAGE_TYPE = "midi-qol.note";
const NOTE_TEMPLATE = "modules/midi-qol/templates/chat/note.hbs";

/** midi's sections, `buttons` (before midi's card buttons) and the top/bottom of the card's results. */
export const CARD_NOTE_ANCHORS = ["buttons", "attack", "hits", "damage", "otherDamage", "bonusDamage", "utility", "saves", "top", "bottom"] as const;
export const CARD_NOTE_POSITIONS = ["before", "prepend", "append", "after"] as const;

export let MidiNoteMessageData: any;

/** What a renderer is given. `messages` are all the note's messages: what this viewer may see is the renderer's call. */
export type CardNoteRenderContext = {
  note: ChatMessage.Implementation;
  card: ChatMessage.Implementation;
  data: Record<string, any>;
  messages: ChatMessage.Implementation[];
};
export type CardNoteRenderer = (context: CardNoteRenderContext) => Promise<string> | string;

const renderers = new Map<string, CardNoteRenderer>();

export function registerCardNoteRenderer(kind: string, renderer: CardNoteRenderer) {
  renderers.set(kind, renderer);
}

export function setupCardNoteMessage() {
  const base = globalThis.dnd5e?.dataModels?.abstract?.ChatMessageDataModel;
  if (!base) {
    error("dnd5e does not expose ChatMessageDataModel; card notes are unavailable");
    return;
  }
  const { ForeignDocumentField, NumberField, ObjectField, StringField } = foundry.data.fields;

  MidiNoteMessageData = class extends base {
    declare origin: ChatMessage.Implementation | null;
    declare anchor: string;
    declare position: string;
    declare key: string;
    declare kind: string;
    declare data: Record<string, any>;
    declare label: string;
    declare html: string;
    declare cssClass: string;
    declare sort: number;
    declare parent: ChatMessage.Implementation;

    // The text is in `system`, not `content`: dnd5e redraws the card only when a linked message's system data changes.
    static defineSchema() {
      return {
        origin: new ForeignDocumentField(foundry.documents.BaseChatMessage),
        anchor: new StringField({ required: true, blank: false, initial: "bottom", choices: [...CARD_NOTE_ANCHORS] }),
        position: new StringField({ required: true, blank: false, initial: "append", choices: [...CARD_NOTE_POSITIONS] }),
        key: new StringField({ required: false, blank: true }),
        kind: new StringField({ required: false, blank: true }),
        data: new ObjectField({ required: false }),
        label: new StringField({ required: false, blank: true }),
        html: new StringField({ required: false, blank: true }),
        cssClass: new StringField({ required: false, blank: true }),
        sort: new NumberField({ required: false, initial: 0 })
      };
    }

    static metadata = Object.freeze(foundry.utils.mergeObject(base.metadata, {
      template: NOTE_TEMPLATE,
      summaryTemplate: NOTE_TEMPLATE
    }, { inplace: false }));

    // Inline rolls were evaluated when the note was written; enriching them here would roll again on every render.
    async _prepareContext() {
      const message = this.parent;
      const renderer = this.kind ? renderers.get(this.kind) : undefined;
      // Its card, or the message it was added to when that can't draw it (the note is then shown on its own).
      const card = noteCard(message) ?? game.messages?.get((message._source.system as { origin?: string | null } | undefined)?.origin ?? "");
      if (renderer && card) {
        try {
          const messages = (message as Dnd5eChatMessage).getAssociatedRolls?.() ?? [];
          const html = await renderer({ note: message, card, data: this.data ?? {}, messages });
          return { id: message.id, label: this.label, html, cssClass: this.cssClass };
        } catch (err) {
          error(`card note renderer ${this.kind} failed`, err);
        }
      }
      const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.html ?? "", {
        rollData: message.getRollData(), relativeTo: message, secrets: message.speakerActor?.isOwner ?? !!game.user?.isGM, rolls: false
      });
      return { id: message.id, label: this.label, html, cssClass: this.cssClass };
    }

    _getEnrichmentOptions() {
      return { avatar: false };
    }

    /** As dnd5e's own message models: its summaries (a contest's checks) are laid out for `.message.compact`. */
    _onRender(element: HTMLElement, options: object = {}) {
      super._onRender?.(element, options);
      element.classList.add("compact");
    }

    /** Its messages are drawn by the note on its card, so dnd5e hides them in the log and deletes them with the note. */
    get rendersSummaries() {
      return true;
    }

    /** Hidden in the log while its card draws it, whatever dnd5e's summary setting; shown on its own otherwise. */
    async getHTML(element: HTMLElement, options: { canClose?: boolean } = {}) {
      await super.getHTML(element, options);
      if (!options.canClose && noteCard(this.parent)) element.hidden = true;
    }
  };

  CONFIG.ChatMessage.dataModels[NOTE_MESSAGE_TYPE] = MidiNoteMessageData;
}

/** The card that draws this note: a usage card drawn from its data. */
export function noteCard(note: ChatMessage.Implementation): ChatMessage.Implementation | undefined {
  const id = (note._source.system as { origin?: string | null } | undefined)?.origin;
  const card = id ? game.messages?.get(id) : undefined;
  return card && rendersFromModel(card) ? card : undefined;
}

/** The card's notes, from dnd5e's registry of messages linked to a card. */
export function notesOf(card: ChatMessage.Implementation): ChatMessage.Implementation[] {
  return (card as Dnd5eChatMessage).getAssociatedRolls?.(NOTE_MESSAGE_TYPE) ?? [];
}
