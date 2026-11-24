import { i18n } from "../../../midi-qol.js";
import { setUserSetting, userSettingValue } from "../../lib/userSettings.js";
import { Registry } from "../../api/registry.js";
import { tokenFor } from "../../lib/tokenResolver.js";
import { configSettings } from "../../settings.js";

/*
 * M7b: the HUD registry, by role. A HUD registers a provider for one role: the combat HUD (the action bar: it replaces
 * Foundry's hotbar), the party HUD (portraits of the party), the turn order HUD (alongside Foundry's combat tracker). A
 * module can provide several (DAS HUD: all three), and each role can come from a different module (Monk's TokenBar for
 * the party, Argon for combat).
 *
 * The party and turn order HUDs show what the whole table shares, so they are the table's choice (midi's config, the GM):
 * the same on every client. The combat HUD shows a player's own character: the table's choice is its default, and each
 * player may choose their own (a user setting, "default" follows the table's) in midi's Turn HUD window
 * (apps/TurnHudConfig.ts), the switcher on the hotbar or a HUD, or the keybinding; the GM sees and sets every player's in
 * Players' settings. Combat: Foundry's hotbar, a HUD (which hides the hotbar) or none (no hotbar either). Party and turn
 * order: none or a HUD. A chosen HUD that isn't registered or available falls back to the role's none (for combat, the
 * hotbar).
 *
 *   MidiQOL.hud.register("my-module.bar", { role: "combat", label: "My bar", show: token => myBar.render(token), hide: () => myBar.close() });
 */

export type HudRole = "combat" | "party" | "turnOrder";
export const HUD_ROLES: readonly HudRole[] = ["combat", "party", "turnOrder"];

export interface HudProvider {
  /** The role it fills (default: combat) */
  role?: HudRole;
  label: string;
  /** Show the HUD (for this token, the combat role's: a TokenDocument, or none) */
  show(token: TokenDocument.Implementation | undefined): void | Promise<void>;
  hide?(): void | Promise<void>;
  /** False when it can't be used now (its module is off) */
  available?(): boolean;
  /** Its settings, drawn in midi's Turn HUD window; providers of one module share one object (shown once) */
  settings?: HudSettings;
  /** A HUD with its own settings window: a button for it in midi's window */
  openSettings?(): void;
  /** Credit shown in midi's window (HTML), e.g. the work it is built from */
  credit?: string;
}

/** A HUD's settings, by tab: registered settings ("namespace.key"; world ones shown only to the GM) and tool buttons. A
 * tab with roles is shown only while one of them has this module's HUD */
export interface HudSettings {
  tabs: { id: string, label: string, icon?: string, keys: string[], tools?: HudTool[], roles?: HudRole[] }[];
}
export interface HudTool { label: string, hint?: string, icon?: string, button?: string, open(): void, gmOnly?: boolean }

/** The choices' own values: the table's default (a player's), Foundry's hotbar (combat), none */
export const DEFAULT_HUD = "default";
export const FOUNDRY_HUD = "foundry";
export const NO_HUD = "none";

/** The roles a player chooses for themselves (the others are the table's only) */
export const PLAYER_ROLES: readonly HudRole[] = ["combat"];
/** The player's choice (a user setting), and the table's per role (midi's config) */
export const PLAYER_SETTING = "turnHud";
export const ROLE_DEFAULT_KEY: Record<HudRole, "hudDefaultCombat" | "hudDefaultParty" | "hudDefaultTurnOrder"> =
  { combat: "hudDefaultCombat", party: "hudDefaultParty", turnOrder: "hudDefaultTurnOrder" };

const huds = new Registry<HudProvider>();
const roleOf = (provider: HudProvider): HudRole => provider.role ?? "combat";

/** The combat role's choices for a player, kept in step with the registry (core's settings forms read them when opened) */
const playerChoices: Record<string, string> = {};

/** A role's choices: none (or Foundry's hotbar for combat), the registered HUDs; `withDefault`: a player's, "Table default" first */
export function hudChoices(role: HudRole, { withDefault = false }: { withDefault?: boolean } = {}): Record<string, string> {
  const choices: Record<string, string> = {};
  if (withDefault) {
    const table = tableChoice(role);
    choices[DEFAULT_HUD] = `${i18n("midi-qol.Hud.TableDefault")} (${hudChoices(role)[table] ?? table})`;
  }
  if (role === "combat") choices[FOUNDRY_HUD] = i18n("midi-qol.Hud.foundry");
  for (const entry of huds.list()) if (roleOf(entry.value) === role) choices[entry.id] = i18n(entry.value.label);
  choices[NO_HUD] = i18n(role === "combat" ? "midi-qol.Hud.none" : role === "party" ? "midi-qol.Hud.noParty" : "midi-qol.Hud.noTurnOrder");
  return choices;
}

function updateChoices() {
  for (const key of Object.keys(playerChoices)) delete playerChoices[key];
  Object.assign(playerChoices, hudChoices("combat", { withDefault: true }));
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

/** The HUDs registered (all roles, or one) */
export function listHuds(role?: HudRole): { id: string, label: string, role: HudRole, available: boolean }[] {
  return huds.list().filter(e => !role || roleOf(e.value) === role)
    .map(e => ({ id: e.id, label: i18n(e.value.label), role: roleOf(e.value), available: e.value.available?.() !== false }));
}

/** The table's choice for a role (midi's config) */
export function tableChoice(role: HudRole): string {
  return String(configSettings[ROLE_DEFAULT_KEY[role]] || (role === "combat" ? FOUNDRY_HUD : NO_HUD));
}

/** The player's own setting for a role: a HUD's id, foundry, none, or default (the table's); the table's roles: default */
export function playerChoice(role: HudRole = "combat", userId: string = game.userId ?? ""): string {
  if (!PLAYER_ROLES.includes(role)) return DEFAULT_HUD;
  return String(userSettingValue(`midi-qol.${PLAYER_SETTING}`, userId) ?? DEFAULT_HUD);
}

/** The choice in effect for a role: the player's, else the table's */
export function hudChoice(role: HudRole = "combat", userId: string = game.userId ?? ""): string {
  const own = playerChoice(role, userId);
  return own === DEFAULT_HUD ? tableChoice(role) : own;
}

/** Sets the player's choice (combat), or the table's (party, turn order: the GM only) */
export async function setHudChoice(id: string, role: HudRole = "combat", userId: string = game.userId ?? "") {
  if (PLAYER_ROLES.includes(role)) return void await setUserSetting(`midi-qol.${PLAYER_SETTING}`, id, userId);
  await setTableChoice(id, role);
}

/** Sets the table's choice for a role (the GM; midi's config) */
export async function setTableChoice(id: string, role: HudRole) {
  if (!game.user?.isGM) return;
  await game.settings?.set("midi-qol", "ConfigSettings", { ...configSettings, [ROLE_DEFAULT_KEY[role]]: id } as never);
}

/** The next combat HUD (the keybinding): hotbar, each available HUD, none, then round again */
export async function cycleHud() {
  const order = [FOUNDRY_HUD, ...listHuds("combat").filter(h => h.available).map(h => h.id), NO_HUD];
  const at = order.indexOf(hudChoice("combat"));
  const next = order[(at + 1) % order.length];
  await setHudChoice(next, "combat");
  ui.notifications?.info(`${i18n("midi-qol.Hud.Role.combat")}: ${hudChoices("combat")[next] ?? next}`);
}

/** The HUD in use for a role: the choice, when registered for that role and available */
export function activeHud(role: HudRole = "combat"): { id: string, provider: HudProvider } | undefined {
  const id = hudChoice(role);
  if (id === FOUNDRY_HUD || id === NO_HUD) return undefined;
  const entry = huds.get(id);
  if (!entry || roleOf(entry.value) !== role || entry.value.available?.() === false) return undefined;
  return { id, provider: entry.value };
}

/** Core's hotbar is hidden when a combat HUD replaces it, or with none */
function applyHotbar() {
  const hide = hudChoice("combat") === NO_HUD || !!activeHud("combat");
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

/** What each role's HUD was last shown ("" none), so a refresh shows it only on a change */
const current: Partial<Record<HudRole, string>> = {};
async function refresh() {
  const token = hudToken();
  for (const role of HUD_ROLES) {
    const hud = activeHud(role);
    if (!hud) { delete current[role]; continue; }
    const key = `${hud.id}|${token?.uuid ?? ""}`;
    if (key === current[role]) continue;
    current[role] = key;
    try { await hud.provider.show(token); }
    catch (err) { console.warn(`midi-qol | HUD ${hud.id}`, err); }
  }
}
const later = () => setTimeout(() => void refresh(), 0);

/** The player's combat HUD (init): a user setting, "default" follows the table's */
export function registerHudSetting() {
  updateChoices();
  game.settings?.register("midi-qol", PLAYER_SETTING as never, {
    name: "midi-qol.Hud.Role.combat",
    hint: "midi-qol.Hud.RoleHint.combat",
    scope: "user",
    config: false,
    type: String,
    choices: playerChoices,
    default: DEFAULT_HUD,
    onChange: () => void hudChanged()
  } as never);
}

export function setupHuds() {
  Hooks.on("controlToken", later);
  Hooks.on("canvasReady", () => { for (const role of HUD_ROLES) delete current[role]; later(); });
  Hooks.once("ready", () => { updateChoices(); applyHotbar(); later(); });
  // midi's config saved: the table's defaults may have changed
  Hooks.on("updateSetting", (setting: { key?: string }) => { if (setting.key === "midi-qol.ConfigSettings") { updateChoices(); void hudChanged(); } });
}

/** A choice or the registry changed: HUDs not in use hidden, those in use shown, the hotbar shown or hidden */
export async function hudChanged() {
  if (!game.ready) return;
  const inUse = new Set(HUD_ROLES.map(role => activeHud(role)?.id).filter(Boolean));
  for (const entry of huds.list()) if (!inUse.has(entry.id)) {
    try { await entry.value.hide?.(); } catch (err) { console.warn(`midi-qol | HUD ${entry.id}`, err); }
  }
  applyHotbar();
  for (const role of HUD_ROLES) delete current[role];
  await refresh();
}

export const hudApi: {
  register: typeof registerHud, list: typeof listHuds, active: typeof activeHud, choice: typeof hudChoice, playerChoice: typeof playerChoice,
  tableChoice: typeof tableChoice, choose: typeof setHudChoice, chooseForTable: typeof setTableChoice, cycle: typeof cycleHud, token: typeof hudToken, refresh: typeof hudChanged,
  roles: typeof HUD_ROLES,
  /** The switcher menu at an element (a HUD's own switcher button); set by apps/TurnHudConfig.ts */
  switcher: (anchor: HTMLElement, role?: HudRole) => void,
  /** midi's Turn HUD window; set by apps/TurnHudConfig.ts */
  openSettings: () => void
} = {
  register: registerHud, list: listHuds, active: activeHud, choice: hudChoice, playerChoice, tableChoice, choose: setHudChoice,
  chooseForTable: setTableChoice,
  cycle: cycleHud, token: hudToken, refresh: hudChanged, roles: HUD_ROLES, switcher: () => {}, openSettings: () => {}
};
