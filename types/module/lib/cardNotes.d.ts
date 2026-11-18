/**
 * Adding to a usage card. The card is drawn from its data and its `content` is empty, so splicing text into `content`
 * does nothing; a note is a message linked to the card, drawn by the card where it names (CardNoteMessage.ts).
 */
export { registerCardNoteRenderer };
import { registerCardNoteRenderer } from "../ChatClasses/CardNoteMessage.js";
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
type CardTarget = ChatMessage.Implementation | {
    chatCard?: ChatMessage.Implementation;
    itemCardUuid?: string;
} | string | undefined | null;
/**
 * Add a note to a usage card. `target` is the card, its uuid or a workflow; `html` may hold links, inline rolls and
 * enricher text. Returns the note message, or undefined when there is no card.
 */
export declare function addCardNote(target: CardTarget, html: string, options?: CardNoteOptions): Promise<ChatMessage.Implementation | undefined>;
/** Remove the notes with this key that this user may delete. Returns how many were removed. */
export declare function removeCardNote(target: CardTarget, key: string): Promise<number>;
/**
 * Message data making a message one of a note's own: linked to the note (`system.origin`), so it is hidden in the log,
 * passed to the note's renderer and deleted with the note. `role` is for the renderer. Pass it as a roll's message
 * data, e.g. `actor.rollSkill({ skill }, {}, { data: MidiQOL.cardNoteMessageData(note, "source") })`.
 */
export declare function cardNoteMessageData(note: ChatMessage.Implementation, role?: string): {
    system: {
        origin: string | null;
    };
    flags: {
        "midi-qol": {
            cardNote: {
                role: string | undefined;
            };
        };
    };
};
/**
 * A message as a card draws it (dnd5e's summary), or "" if this viewer may not see it or it is in the log instead
 * (dnd5e's *chat card summaries* off). The card masks it as it masks dnd5e's summaries: a private roll this viewer
 * can't read shows as rolled, a forced-blind one not at all, an obscured one with ?? for its result.
 */
export declare function renderLinkedMessage(message: ChatMessage.Implementation | undefined): Promise<string>;
/**
 * A message's roll total if this viewer may see it: not a private roll they can't see, not hidden, and not one midi
 * shows players obscured (*Blind roll display*). Otherwise undefined.
 */
export declare function visibleRollTotal(message: ChatMessage.Implementation | undefined): number | undefined;
/**
 * A usage card drawn from its data shows `content` instead of itself when it is set, so text written there would
 * replace the card: it becomes a note at the bottom of the card instead.
 */
export declare function setupCardContentGuard(): void;
