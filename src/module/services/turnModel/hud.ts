import { i18n } from "../../../midi-qol.js";
import { Registry } from "../../api/registry.js";
import { tokenFor } from "../../lib/tokenResolver.js";

/*
 * M7b: the HUD registry. A HUD (DAS HUD, an Argon adapter, another module's) registers itself; each player picks
 * theirs with the Turn HUD setting (user scope): Foundry's hotbar (the default), a registered HUD (which replaces the
 * hotbar), or none (no hotbar either). The choice is made in midi's Turn HUD window (apps/TurnHudConfig.ts: the choice,
 * then the chosen HUD's settings as it describes them), the switcher on the hotbar and on a HUD, or a keybinding. midi tells the chosen HUD which token to show when the user's controlled
 * tokens change (none: the user's character's token, else nothing), and it reads MidiQOL.turnModel for what to show.
 * A chosen HUD that isn't registered or available (its module off) falls back to the hotbar.
 *
 *   MidiQOL.hud.register("my-module.bar", { label: "My bar", show: token => myBar.render(token), hide: () => myBar.close() });
 */

export interface HudProvider {
  label: string;
  /** Show the HUD for this token (a TokenDocument), or with none (undefined) */
  show(token: TokenDocument.Implementation | undefined): void | Promise<void>;
  hide?(): void | Promise<void>;
  /** False when it can't be used now (its module is off) */
  available?(): boolean;
  /** Its settings, drawn in midi's Turn HUD window under the choice */
  settings?: HudSettings;
  /** A HUD with its own settings window: a button for it in midi's window */
  openSettings?(): void;
  /** Credit shown in midi's window (HTML), e.g. the work it is built from */
  credit?: string;
}

/** A HUD's settings, by tab: registered settings ("namespace.key"; world ones shown only to the GM) and tool buttons */
export interface HudSettings {
  tabs: { id: string, label: string, icon?: string, keys: string[], tools?: HudTool[] }[];
}
export interface HudTool { label: string, hint?: string, icon?: string, button?: string, open(): void, gmOnly?: boolean }

/** The Turn HUD setting's own choices */
export const FOUNDRY_HUD = "foundry";
export const NO_HUD = "none";
const SETTING = "turnHud";

const huds = new Registry<HudProvider>();
/** The setting's choices object: kept in step with the registry (core's settings form reads it when opened) */
const choices: Record<string, string> = {};

function updateChoices() {
  for (const key of Object.keys(choices)) delete choices[key];
  choices[FOUNDRY_HUD] = i18n("midi-qol.Hud.foundry");
  for (const entry of huds.list()) choices[entry.id] = entry.value.label;
  choices[NO_HUD] = i18n("midi-qol.Hud.none");
}

export function registerHud(id: string, provider: HudProvider): () => void {
  huds.set(id, provider);
  updateChoices();
  void hudChanged();
  return () => { huds.delete(id); updateChoices(); void hudChanged(); };
}

/** A registered HUD's provider */
export function hudProvider(id: string): HudProvider | undefined {
  return huds.get(id)?.value;
}

/** The Turn HUD choices, in order: Foundry's hotbar, the registered HUDs, none */
export function hudChoices(): Record<string, string> {
  return { ...choices };
}

/** Sets the player's choice */
export async function setHudChoice(id: string) {
  await game.settings?.set("midi-qol", SETTING as never, id as never);
}

/** The next choice (the keybinding): hotbar, each available HUD, none, then round again */
export async function cycleHud() {
  const order = [FOUNDRY_HUD, ...listHuds().filter(h => h.available).map(h => h.id), NO_HUD];
  const at = order.indexOf(hudChoice());
  await setHudChoice(order[(at + 1) % order.length]);
  ui.notifications?.info(`${i18n("midi-qol.Hud.Name")}: ${choices[hudChoice()] ?? hudChoice()}`);
}

/** The HUDs registered */
export function listHuds(): { id: string, label: string, available: boolean }[] {
  return huds.list().map(e => ({ id: e.id, label: e.value.label, available: e.value.available?.() !== false }));
}

/** The player's choice: foundry, none, or a HUD's id */
export function hudChoice(): string {
  return String(game.settings?.get("midi-qol", SETTING as never) ?? FOUNDRY_HUD);
}

/** The HUD in use: the player's choice, when registered and available */
export function activeHud(): { id: string, provider: HudProvider } | undefined {
  const id = hudChoice();
  if (id === FOUNDRY_HUD || id === NO_HUD) return undefined;
  const entry = huds.get(id);
  return entry && entry.value.available?.() !== false ? { id, provider: entry.value } : undefined;
}

/** Core's hotbar is hidden when a HUD replaces it, or with none */
function applyHotbar() {
  const hide = hudChoice() === NO_HUD || !!activeHud();
  document.body.classList.toggle("midi-qol-no-hotbar", hide);
}

/** The token the HUD shows: the user's one controlled token, else (a player) their character's on the scene */
export function hudToken(): TokenDocument.Implementation | undefined {
  const controlled = canvas?.tokens?.controlled ?? [];
  if (controlled.length === 1) return controlled[0].document as TokenDocument.Implementation;
  if (controlled.length > 1) return undefined;
  const character = game.user?.character;
  return character ? tokenFor(character, { scene: canvas?.scene ?? null }) : undefined;
}

let current: string | undefined;
async function refresh() {
  const hud = activeHud();
  if (!hud) { current = undefined; return; }
  const token = hudToken();
  if ((token?.uuid ?? "") === current) return;
  current = token?.uuid ?? "";
  try { await hud.provider.show(token); }
  catch (err) { console.warn(`midi-qol | HUD ${hud.id}`, err); }
}
const later = () => setTimeout(() => void refresh(), 0);

/** The Turn HUD setting (init) */
export function registerHudSetting() {
  updateChoices();
  game.settings?.register("midi-qol", SETTING as never, {
    name: "midi-qol.Hud.Name",
    hint: "midi-qol.Hud.Hint",
    scope: "user",
    config: false,
    type: String,
    choices,
    default: FOUNDRY_HUD,
    onChange: () => void hudChanged()
  } as never);
}

export function setupHuds() {
  Hooks.on("controlToken", later);
  Hooks.on("canvasReady", () => { current = undefined; later(); });
  Hooks.once("ready", () => { updateChoices(); applyHotbar(); later(); });
}

/** The choice or the registry changed: the others hidden, the chosen one shown, the hotbar shown or hidden */
export async function hudChanged() {
  if (!game.ready) return;
  const chosen = activeHud()?.id;
  for (const entry of huds.list()) if (entry.id !== chosen) {
    try { await entry.value.hide?.(); } catch (err) { console.warn(`midi-qol | HUD ${entry.id}`, err); }
  }
  applyHotbar();
  current = undefined;
  await refresh();
}

export const hudApi: {
  register: typeof registerHud, list: typeof listHuds, active: typeof activeHud, choice: typeof hudChoice, choose: typeof setHudChoice,
  cycle: typeof cycleHud, token: typeof hudToken, refresh: typeof hudChanged,
  /** The switcher menu at an element (a HUD's own switcher button); set by apps/TurnHudConfig.ts */
  switcher: (anchor: HTMLElement) => void,
  /** midi's Turn HUD window; set by apps/TurnHudConfig.ts */
  openSettings: () => void
} = {
  register: registerHud, list: listHuds, active: activeHud, choice: hudChoice, choose: setHudChoice, cycle: cycleHud,
  token: hudToken, refresh: hudChanged, switcher: () => {}, openSettings: () => {}
};
