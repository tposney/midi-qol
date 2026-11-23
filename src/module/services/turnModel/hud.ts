import { Registry } from "../../api/registry.js";
import { configSettings } from "../../settings.js";
import { tokenFor } from "../../lib/tokenResolver.js";

/*
 * M7b: the HUD registry. A HUD (midi's bar, an Argon adapter, another module's) registers itself; the HUD setting picks
 * the one in use (none by default). midi tells it which token to show when the user's controlled tokens change (none:
 * the user's character's token, else nothing), and it reads MidiQOL.turnModel for what to show.
 *
 *   MidiQOL.hud.register("my-module.bar", { label: "My bar", show: token => myBar.render(token), hide: () => myBar.close() });
 */

export interface HudProvider {
  label: string;
  /** Show the HUD for this token (a TokenDocument), or hide it (undefined) */
  show(token: TokenDocument.Implementation | undefined): void | Promise<void>;
  hide?(): void | Promise<void>;
  /** False when it can't be used now (its module is off) */
  available?(): boolean;
}

const huds = new Registry<HudProvider>();

export function registerHud(id: string, provider: HudProvider): () => void {
  huds.set(id, provider);
  return () => { huds.delete(id); };
}

/** The HUDs registered (for the setting's choices) */
export function listHuds(): { id: string, label: string, available: boolean }[] {
  return huds.list().map(e => ({ id: e.id, label: e.value.label, available: e.value.available?.() !== false }));
}

/** The HUD in use: the setting's, when registered and available */
export function activeHud(): { id: string, provider: HudProvider } | undefined {
  const id = configSettings.hud;
  if (!id || id === "none") return undefined;
  const entry = huds.get(id);
  return entry && entry.value.available?.() !== false ? { id, provider: entry.value } : undefined;
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
  current = token?.uuid ?? undefined;
  try { await hud.provider.show(token); }
  catch (err) { console.warn(`midi-qol | HUD ${hud.id}`, err); }
}
const later = () => setTimeout(() => void refresh(), 0);

export function setupHuds() {
  Hooks.on("controlToken", later);
  Hooks.on("canvasReady", () => { current = undefined; later(); });
  Hooks.once("ready", later);
  // midi's settings saved: the HUD setting may have changed
  Hooks.on("updateSetting", (setting: { key?: string }) => { if (setting.key === "midi-qol.ConfigSettings") void hudChanged(); });
}

/** The HUD setting changed: the old one hidden, the new one shown */
export async function hudChanged() {
  for (const entry of huds.list()) if (entry.id !== configSettings.hud) await entry.value.hide?.();
  current = undefined;
  await refresh();
}

export const hudApi = { register: registerHud, list: listHuds, active: activeHud, token: hudToken, refresh: hudChanged };
