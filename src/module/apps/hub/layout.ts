/*
 * M27 further features: the hub's layouts, per user (the Turn HUD window): normal, compact (smaller buttons and
 * portrait) or tablet (large touch targets); its size (a percentage scaling all of it: text, icons, spacing); and keys (off by default): while the hub runs, 1-9 and 0 use the bar's
 * buttons and Shift+1-9 open its tabs, in place of the hotbar's number keys the hub replaces. Each keyed button shows its
 * number.
 */

import { hudChanged } from "../../services/turnModel/hud.js";

export const LAYOUT_SETTING = "hubLayout";
export const KEYS_SETTING = "hubKeys";
export const AROUND_SETTING = "hubAroundMe";
export const SCALE_SETTING = "hubScale";
const LAYOUTS = ["normal", "compact", "tablet"] as const;

export function registerLayoutSettings() {
  game.settings?.register("midi-qol", LAYOUT_SETTING as never, {
    name: "midi-qol.HubLayout.Name",
    hint: "midi-qol.HubLayout.Hint",
    scope: "user",
    config: false,
    type: String,
    choices: Object.fromEntries(LAYOUTS.map(l => [l, `midi-qol.HubLayout.${l}`])),
    default: "normal",
    onChange: () => void hudChanged()
  } as never);
  game.settings?.register("midi-qol", SCALE_SETTING as never, {
    name: "midi-qol.HubScale.Name",
    hint: "midi-qol.HubScale.Hint",
    scope: "user",
    config: false,
    type: Number,
    range: { min: 80, max: 150, step: 5 },
    default: 110,
    onChange: () => void hudChanged()
  } as never);
  // The table's choice (the GM's), not each player's
  game.settings?.register("midi-qol", AROUND_SETTING as never, {
    name: "midi-qol.HubAround.Name",
    hint: "midi-qol.HubAround.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => void hudChanged()
  } as never);
  game.settings?.register("midi-qol", KEYS_SETTING as never, {
    name: "midi-qol.HubKeys.Name",
    hint: "midi-qol.HubKeys.Hint",
    scope: "user",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => void hudChanged()
  } as never);
}

const layout = () => String(game.settings?.get("midi-qol", LAYOUT_SETTING as never) ?? "normal");
const keysOn = () => game.settings?.get("midi-qol", KEYS_SETTING as never) === true;
/** The hub's size as a factor (the setting is a percentage) */
const scale = () => {
  const percent = Number(game.settings?.get("midi-qol", SCALE_SETTING as never));
  return Number.isFinite(percent) && percent >= 50 && percent <= 200 ? percent / 100 : 1.1;
};

const barButtons = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLElement>(".midi-hub-bar .midi-hub-use"));
const tabs = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLElement>(".midi-hub-tabs .midi-hub-tab"));

/** The layout's class, and the keyed buttons numbered */
export function applyLayout(element: HTMLElement) {
  for (const l of LAYOUTS) element.classList.toggle(`midi-hub-layout-${l}`, layout() === l);
  // Its size: the CSS zooms the docked hub (or the hub window's content) by it
  element.style.setProperty("--midi-hub-zoom", String(scale()));
  const keys = keysOn();
  element.classList.toggle("midi-hub-keys", keys);
  barButtons(element).forEach((button, index) => {
    if (keys && index < 10) button.dataset.key = String((index + 1) % 10);
    else delete button.dataset.key;
  });
}

const typing = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
};

/** A key press while the hub runs: a bar button or a tab; true when it was the hub's */
export function hubKey(element: HTMLElement, event: KeyboardEvent): boolean {
  if (!keysOn() || event.repeat || event.ctrlKey || event.altKey || event.metaKey || typing(event.target)) return false;
  const digit = /^Digit(\d)$/.exec(event.code)?.[1];
  if (digit === undefined) return false;
  const index = digit === "0" ? 9 : Number(digit) - 1;
  const target = event.shiftKey ? tabs(element)[index] : barButtons(element)[index];
  if (!target) return false;
  target.click();
  return true;
}

/** The Around me tab is shown (a user setting, off by default) */
export const aroundMeOn = () => game.settings?.get("midi-qol", AROUND_SETTING as never) === true;
