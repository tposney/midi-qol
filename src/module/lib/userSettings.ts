import { MODULE_ID } from "../../midi-qol.js";

/*
 * User-scope settings for any user. Core stores one Setting document per user, but game.settings reads and writes only
 * the current user's, so a GM changing a player's HUD settings goes through these: read that user's document (else the
 * default), update or create it with that user's id.
 *
 * Core also runs a setting's onChange on every client for any user's change (Setting#_onCreate/_onUpdate don't check
 * the document's user): a GM editing a player's HUD scale would rescale the GM's own HUD. Here onChange runs only on
 * the clients of the user the setting belongs to.
 */

type SettingDoc = { _id?: string | null, key: string, user?: string | null, value: unknown, update(data: object, options?: object): Promise<unknown> };
type SettingConfigLike = { scope?: string, default?: unknown };
type SettingsStore = { getSetting(key: string, user?: string | null): SettingDoc | undefined };

const config = (id: string) => game.settings?.settings.get(id as never) as SettingConfigLike | undefined;
const store = () => game.settings?.storage.get("world") as unknown as SettingsStore;

/** A user setting's value for a user (the current user's through core) */
export function userSettingValue(id: string, userId: string): unknown {
  if (userId === game.userId) {
    const [namespace, ...key] = id.split(".");
    return game.settings?.get(namespace as never, key.join(".") as never);
  }
  const doc = store().getSetting(id, userId);
  return doc ? doc.value : config(id)?.default;
}

/** Sets a user setting for a user (the current user's through core); a GM may set another user's */
export async function setUserSetting(id: string, value: unknown, userId: string) {
  if (userId === game.userId) {
    const [namespace, ...key] = id.split(".");
    await game.settings?.set(namespace as never, key.join(".") as never, value as never);
    return;
  }
  if (!game.user?.isGM || config(id)?.scope !== "user") return;
  const plain = value instanceof foundry.abstract.DataModel ? value.toObject() : value;
  const json = JSON.stringify(plain);
  const doc = store().getSetting(id, userId);
  if (doc?._id) await doc.update({ value: json });
  else await (CONFIG.Setting.documentClass as unknown as { create(data: object): Promise<unknown> }).create({ key: id, user: userId, value: json });
}

type LibWrapperRegister = { register(packageId: string, target: string, fn: (...args: never[]) => unknown, type: string): unknown };
type Handler = (this: SettingDoc, ...args: unknown[]) => unknown;

/** onChange only for the user a user setting belongs to: another user's change runs only the document's own handling */
export function setupUserSettings() {
  const libWrapper = (globalThis as { libWrapper?: LibWrapperRegister }).libWrapper;
  if (!libWrapper) return;
  const base = Object.getPrototypeOf(foundry.documents.Setting.prototype) as Record<string, Handler>;
  for (const method of ["_onCreate", "_onUpdate"]) {
    libWrapper.register(MODULE_ID, `CONFIG.Setting.documentClass.prototype.${method}`, (function (this: SettingDoc, wrapped: (...args: unknown[]) => unknown, ...args: unknown[]) {
      if (this.user && this.user !== game.userId) return base[method].call(this, ...args);
      return wrapped(...args);
    }) as never, "MIXED");
  }
}
