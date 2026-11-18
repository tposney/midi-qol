/**
 * midi's usage card as dnd5e's usage message sub-type: dnd5e renders the card face, midi adds hits, saves,
 * advantage presentation and the damage tray. Design notes: dnd5e-v6-checklist, M13.
 */
import { Activity, Dnd5eChatMessage } from "../../globals.js";
/** Roll types midi tags damage rolls with; the presence of one means damage has been rolled. */
/**
 * Which of the card's buttons this user should see. Policy comes from the settings at render (GM and player
 * settings differ), progress mostly from `message.rolls`. Used for midi's buttons and dnd5e's.
 */
export declare function midiButtonVisibility(message: Dnd5eChatMessage | undefined, activity?: Activity): {
    attack: boolean;
    damage: boolean;
    attackSpent: boolean;
    damageSpent: boolean;
    confirm: boolean;
    confirmHitMiss: boolean;
    cancel: boolean;
    effects: boolean;
    allRemoved: boolean;
    savesResolved: boolean;
    teleported: boolean;
    templatesPlaced: boolean;
};
/** Registered at init, beside the damage-card model. */
export declare let MidiUsageMessageData: any;
export declare const USAGE_MESSAGE_TYPE = "usage";
/** The card's roll sections; the template places each by name, in step with `templates/chat/usage-card.hbs`. */
export declare const SECTION_NAMES: readonly ["attack", "hits", "damage", "otherDamage", "bonusDamage", "utility", "saves"];
export type SectionName = typeof SECTION_NAMES[number];
/**
 * A token's save (or check) roll for a usage card: one kept on the card (another module's, or one midi changed), else
 * the card's latest linked save or check message for the token; the one with midi's result when midi recorded one.
 */
export declare function cardSaveRoll(card: ChatMessage.Implementation | null | undefined, tokenUuid: string): Roll | undefined;
/** The template a card section is drawn with when it stores none (a roll section stored without a label gets one too) */
export declare const SECTION_TEMPLATES: {
    readonly hits: "modules/midi-qol/templates/hits.html";
    readonly saves: "modules/midi-qol/templates/saves.html";
};
/** A card section: a roll type drawn from `message.rolls`, a template with data, or markup (older cards) */
export type MidiCardSection = {
    label?: string;
    rollType?: string;
    template?: string;
    data?: Record<string, unknown>;
    html?: string;
};
export declare function setupUsageCardMessage(): void;
/** A usage card drawn from its data, not from stored markup. */
export declare function rendersFromModel(message: ChatMessage.Implementation): boolean;
