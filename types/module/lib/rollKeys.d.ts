/**
 * The roll keys: dnd5e's Shift/Alt/Ctrl (as rebound in its keybindings) and midi's Roll Toggle, read once and
 * interpreted in one place.
 */
import { RollDialogConfig, RollProcessConfig } from "../../globals.js";
export declare const ADVANTAGE = 1, NORMAL = 0, DISADVANTAGE = -1;
export interface HeldKeys {
    toggle: boolean;
    normal: boolean;
    advantage: boolean;
    disadvantage: boolean;
}
/** The modifier keys an event held, as plain data (stored, sent over a socket); `new KeyboardEvent("keydown", keys)` rebuilds one */
export declare function eventModifiers(event: Event): {
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
};
export declare function heldKeys(eventOrNone: Event | null | undefined): HeldKeys;
export interface KeyMode {
    /** A mode the keys force, or null */
    forced: number | null;
    /** Sources the keys add, which dnd5e ORs into the roll after all others */
    advantage: boolean;
    disadvantage: boolean;
}
/**
 * dnd5e's rules (Shift+Alt/Ctrl force that mode; Alt and Ctrl add sources, so Alt+Ctrl rolls flat) and midi's:
 * Shift+Alt+Ctrl forces a normal roll, where dnd5e would read Shift+Alt.
 */
export declare function keyMode(keys: HeldKeys): KeyMode;
/**
 * Whether the roll dialog shows: a forced setting, then the caller's choice (Roll Toggle inverts it), then Roll Toggle
 * (it shows the dialog of a fast forwarded roll and skips any other), then fast forward. Undefined leaves it to dnd5e,
 * which skips it when one of its keys is held.
 */
export declare function decideRollDialog({ force, configure, toggle, fastForward }: {
    force?: "always" | "never" | string;
    configure?: boolean;
    toggle: boolean;
    fastForward: boolean;
}): boolean | undefined;
/** Whether the roll dialog showed: as decided, else as dnd5e decides (any of its keys skips it) */
export declare function dialogShown(configure: boolean | undefined, event: RollProcessConfig["event"]): boolean;
/**
 * Shift+Alt+Ctrl: dnd5e is given no event, and advantage with disadvantage so its own sources cancel. The keys skipped
 * the dialog, which dnd5e can no longer tell, so that is kept. Called for every d20 roll from dnd5e's pre-roll hooks,
 * after midi's own have read the keys.
 */
export declare function releaseForcedNormalKeys(config: RollProcessConfig, dialog: RollDialogConfig): void;
