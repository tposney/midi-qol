/** The damage card as a chat message sub-type, rendered from `message.system`; `flags.midi-qol.undoDamage` stays the undo source. */
import { ContextMenuEntryV14 } from "../../globals.js";
/** Registered at setup, once dnd5e's base class is on `game.dnd5e`. */
export declare let MidiDamageMessageData: any;
/** Matches module.json `documentTypes`; a literal because MODULE_ID is undefined here (import cycle via GMAction). */
export declare const DAMAGE_MESSAGE_TYPE = "midi-qol.damage";
export declare function setupDamageCardMessage(): void;
/** GM chat context-menu entry: show a damage card as players see it. */
export declare function addViewAsPlayerOption(_app: unknown, options: ContextMenuEntryV14[]): void;
