/**
 * A note on a usage card: its own chat message, linked to the card through `system.origin` as dnd5e links a card's
 * save and check messages. The card draws its notes into the section each names; the note is not shown in the log
 * while its card draws it. Visibility is the note message's own (whispers, blind).
 *
 * A note with a `kind` is drawn by the renderer registered for it (MidiQOL.registerCardNoteRenderer), per viewer and
 * whenever the card is drawn, from its `data` and its own messages: those linked to it (`system.origin`, as the note is
 * to its card), which dnd5e then hides in the log. `html` is shown when no renderer is registered.
 */
export declare const NOTE_MESSAGE_TYPE = "midi-qol.note";
/** midi's sections, `buttons` (before midi's card buttons) and the top/bottom of the card's results. */
export declare const CARD_NOTE_ANCHORS: readonly ["buttons", "attack", "hits", "damage", "otherDamage", "bonusDamage", "utility", "saves", "top", "bottom"];
export declare const CARD_NOTE_POSITIONS: readonly ["before", "prepend", "append", "after"];
export declare let MidiNoteMessageData: any;
/** What a renderer is given. `messages` are all the note's messages: what this viewer may see is the renderer's call. */
export type CardNoteRenderContext = {
    note: ChatMessage.Implementation;
    card: ChatMessage.Implementation;
    data: Record<string, any>;
    messages: ChatMessage.Implementation[];
};
export type CardNoteRenderer = (context: CardNoteRenderContext) => Promise<string> | string;
export declare function registerCardNoteRenderer(kind: string, renderer: CardNoteRenderer): void;
export declare function setupCardNoteMessage(): void;
/** The card that draws this note: a usage card drawn from its data. */
export declare function noteCard(note: ChatMessage.Implementation): ChatMessage.Implementation | undefined;
/** The card's notes, from dnd5e's registry of messages linked to a card. */
export declare function notesOf(card: ChatMessage.Implementation): ChatMessage.Implementation[];
