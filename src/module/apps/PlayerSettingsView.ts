import { i18n, MODULE_ID } from "../../midi-qol.js";

/*
 * M32e (plan ~/Documents/midi-next-M32-plan-2026-11-22.md): the GM's view of the players' midi user settings (Bonus
 * prompt, Show every bonus offer, Target confirmation...). Each is a Setting document per user in the world's settings;
 * the GM reads every player's and may change one (a player's own window stays theirs to change too).
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

type SettingConfig = { key: string, namespace: string, scope: string, name?: string, type?: unknown, choices?: Record<string, string>, default?: unknown };

/** Object-valued settings: no grid input (a text box would save a string over the object); their editor, opened for one player */
const OBJECT_EDITORS: Record<string, (userId: string) => void> = {
  TargetConfirmation: userId => {
    void import("./TargetConfirmationConfig.js").then(({ TargetConfirmationConfig }) => new TargetConfirmationConfig({ userId }).render({ force: true }));
  }
};
const isObjectSetting = (setting: SettingConfig) => setting.type === Object || setting.type === Array;
const NAMES: Record<string, string> = { TargetConfirmation: "midi-qol.TargetConfirmationConfig.Name" };

function midiUserSettings(): SettingConfig[] {
  return [...(game.settings?.settings.values() ?? [])].map(s => s as unknown as SettingConfig)
    .filter(s => s.namespace === MODULE_ID && s.scope === "user");
}

/** A player's value of a user setting (its default when they have none stored) */
export function playerSetting(setting: SettingConfig, userId: string): unknown {
  const storage = game.settings?.storage.get("world") as { getSetting(key: string, user: string | null): { value: unknown } | undefined } | undefined;
  const doc = storage?.getSetting(`${setting.namespace}.${setting.key}`, userId);
  return doc ? doc.value : setting.default;
}

/** Sets a player's value, as their own client would (the Setting document for that user) */
export async function setPlayerSetting(setting: SettingConfig, userId: string, value: unknown): Promise<void> {
  const storage = game.settings?.storage.get("world") as { getSetting(key: string, user: string | null): { update(data: object): Promise<unknown> } | undefined } | undefined;
  const key: `${string}.${string}` = `${setting.namespace}.${setting.key}`;
  const json = JSON.stringify(value);
  const doc = storage?.getSetting(key, userId);
  if (doc) await doc.update({ value: json });
  else {
    const user = game.users?.get(userId);
    if (user) await Setting.implementation.create({ key, user, value: json });
  }
}

export class PlayerSettingsView extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form" as const,
    classes: ["midi-qol", "midi-qol-player-settings"],
    window: { title: "midi-qol.PlayerSettings.Title", resizable: true, contentClasses: ["standard-form"] },
    position: { width: 720, height: "auto" as const },
    form: { submitOnChange: true, closeOnSubmit: false, handler: PlayerSettingsView.#onChange },
    actions: { editObject: PlayerSettingsView.#onEditObject, resetObject: PlayerSettingsView.#onResetObject }
  };

  static PARTS = { table: { template: "modules/midi-qol/templates/apps/PlayerSettings/playerSettings.hbs", scrollable: [""] } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const players = (game.users?.contents ?? []).filter(u => !u.isGM);
    const rows = midiUserSettings().map(setting => ({
      label: i18n(setting.name ?? NAMES[setting.key] ?? setting.key),
      cells: players.map(user => {
        const value = playerSetting(setting, user.id!);
        const name = `${setting.key}|${user.id}`;
        if (isObjectSetting(setting)) {
          const changed = !foundry.utils.isEmpty(foundry.utils.diffObject((setting.default ?? {}) as object, (value ?? {}) as object));
          return { name, object: true, status: i18n(changed ? "midi-qol.PlayerSettings.Changed" : "midi-qol.PlayerSettings.Default"),
            changed, editable: !!OBJECT_EDITORS[setting.key], key: setting.key, userId: user.id };
        }
        if (setting.type === Boolean) return { name, checkbox: true, checked: !!value };
        if (setting.choices) return { name, options: Object.entries(setting.choices).map(([v, l]) => ({ value: v, label: i18n(l), selected: v === String(value) })) };
        return { name, text: true, value: value ?? "" };
      })
    }));
    return { ...context, players: players.map(u => ({ name: u.name, active: u.active })), rows, none: !players.length };
  }

  static async #onChange(this: PlayerSettingsView, event: Event) {
    const input = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (!input?.name?.includes("|")) return;
    const [key, userId] = input.name.split("|");
    const setting = midiUserSettings().find(s => s.key === key);
    if (!setting || isObjectSetting(setting)) return;
    let value: unknown = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
    if (setting.type === Number) value = Number(value);
    await setPlayerSetting(setting, userId, value);
  }

  static #onEditObject(this: PlayerSettingsView, _event: PointerEvent, target: HTMLElement) {
    const { key, user } = target.dataset;
    if (key && user) OBJECT_EDITORS[key]?.(user);
  }

  static async #onResetObject(this: PlayerSettingsView, _event: PointerEvent, target: HTMLElement) {
    const setting = midiUserSettings().find(s => s.key === target.dataset.key);
    if (!setting || !target.dataset.user) return;
    await setPlayerSetting(setting, target.dataset.user, foundry.utils.deepClone(setting.default ?? {}));
    void this.render();
  }
}
