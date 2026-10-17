/**
 * The roll keys: dnd5e's Shift/Alt/Ctrl (as rebound in its keybindings) and midi's Roll Toggle, read once and
 * interpreted in one place.
 */

import { RollDialogConfig, RollProcessConfig } from "../../globals.js";
import { areMidiKeysPressed } from "../utils.js";
import { AugmentedEvent } from "../Workflow.js";

export const ADVANTAGE = 1, NORMAL = 0, DISADVANTAGE = -1;

export interface HeldKeys {
  toggle: boolean;
  normal: boolean;
  advantage: boolean;
  disadvantage: boolean;
}

const hasModifierKeys = (event: Event): event is AugmentedEvent => "shiftKey" in event;

export function heldKeys(eventOrNone: Event | null | undefined): HeldKeys {
  const event = eventOrNone && hasModifierKeys(eventOrNone) ? eventOrNone : undefined;
  return {
    toggle: !!areMidiKeysPressed(event, "RollToggle"),
    normal: !!areMidiKeysPressed(event, "skipDialogNormal", "dnd5e"),
    advantage: !!areMidiKeysPressed(event, "skipDialogAdvantage", "dnd5e"),
    disadvantage: !!areMidiKeysPressed(event, "skipDialogDisadvantage", "dnd5e")
  };
}

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
export function keyMode(keys: HeldKeys): KeyMode {
  if (keys.normal && keys.advantage && keys.disadvantage) return { forced: NORMAL, advantage: false, disadvantage: false };
  if (keys.normal && keys.advantage) return { forced: ADVANTAGE, advantage: false, disadvantage: false };
  if (keys.normal && keys.disadvantage) return { forced: DISADVANTAGE, advantage: false, disadvantage: false };
  return { forced: null, advantage: keys.advantage, disadvantage: keys.disadvantage };
}

/**
 * Whether the roll dialog shows: a forced setting, then the caller's choice (Roll Toggle inverts it), then Roll Toggle
 * (it shows the dialog of a fast forwarded roll and skips any other), then fast forward. Undefined leaves it to dnd5e,
 * which skips it when one of its keys is held.
 */
export function decideRollDialog({ force, configure, toggle, fastForward }:
  { force?: "always" | "never" | string, configure?: boolean, toggle: boolean, fastForward: boolean }): boolean | undefined {
  if (force === "always") return true;
  if (force === "never") return false;
  if (configure !== undefined) return toggle ? !configure : configure;
  if (toggle) return fastForward;
  return fastForward ? false : undefined;
}

/** Whether the roll dialog showed: as decided, else as dnd5e decides (any of its keys skips it) */
export function dialogShown(configure: boolean | undefined, event: RollProcessConfig["event"]): boolean {
  if (configure !== undefined) return configure;
  const keys = heldKeys(event);
  return !(keys.normal || keys.advantage || keys.disadvantage);
}

/**
 * Shift+Alt+Ctrl: dnd5e is given no event, and advantage with disadvantage so its own sources cancel. The keys skipped
 * the dialog, which dnd5e can no longer tell, so that is kept. Called for every d20 roll from dnd5e's pre-roll hooks,
 * after midi's own have read the keys.
 */
export function releaseForcedNormalKeys(config: RollProcessConfig, dialog: RollDialogConfig): void {
  if (!config.event || keyMode(heldKeys(config.event)).forced !== NORMAL) return;
  dialog.configure ??= false;
  config.event = undefined;
  config.advantage = true;
  config.disadvantage = true;
}
