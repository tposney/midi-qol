import { i18n } from "../../midi-qol.js";
import { setUserSetting, userSettingValue } from "../lib/userSettings.js";
import {
  HUD_ROLES, PLAYER_ROLES, cycleHud, hudApi, hudChoice, hudChoices, hudProvider, playerChoice, setHudChoice, tableChoice,
  type HudProvider, type HudRole, type HudSettings, type HudTool
} from "../services/turnModel/hud.js";

/*
 * M7b: midi's Turn HUD window, one per player. Their combat HUD ("Table default" follows the GM's); the party and turn
 * order HUDs, the table's (the same on every client: the GM chooses them here or in midi's config, players see them).
 * Then the settings of the HUDs in use, as each described them when it registered (tabs of registered settings drawn as
 * Foundry's settings form draws them, world settings only for the GM; a module's tabs shown once, a tab with roles only
 * while one of them uses that module), its tools, its credit. Saved as they change. Opened from Configure Settings
 * (midi-qol: Turn HUD), midi's config, the switcher, or MidiQOL.hud.openSettings().
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export type SettingConfig = { namespace: string, key: string, scope: string, name?: string, hint?: string, type?: unknown, choices?: Record<string, string>,
  range?: { min?: number, max?: number, step?: number }, default?: unknown, input?: unknown };

/** The GM's user picker's field name */
const USER_FIELD = "midi-qol-hud.user";

/** A role's choice field's name */
const choiceName = (role: HudRole) => `midi-qol-hud.${role}`;

/** A form field for a registered setting, as core's SettingsConfig builds one */
export function fieldFor(setting: SettingConfig) {
  const fields = foundry.data.fields;
  let field: foundry.data.fields.DataField.Any;
  if (setting.type instanceof fields.DataField) field = setting.type as foundry.data.fields.DataField.Any;
  else if (setting.type === Boolean) field = new fields.BooleanField({ initial: Boolean(setting.default ?? false) });
  else if (setting.type === Number) field = new fields.NumberField({ required: true, choices: setting.choices, initial: setting.default as number,
    min: setting.range?.min, max: setting.range?.max, step: setting.range?.step });
  else field = new fields.StringField({ required: true, choices: setting.choices });
  Object.assign(field, { name: `${setting.namespace}.${setting.key}`, label: i18n(setting.name ?? setting.key), hint: i18n(setting.hint ?? "") });
  return field;
}

function settingConfig(key: string): SettingConfig | undefined {
  return game.settings?.settings.get(key as never) as SettingConfig | undefined;
}

/** A setting the user may change here: registered, and world settings only for the GM; for another user (the GM), not
 * a client setting (kept in that user's browser) */
function editable(setting: SettingConfig | undefined, userId: string = game.userId ?? ""): setting is SettingConfig {
  if (!setting || (setting.scope === "world" && !game.user?.isGM)) return false;
  return userId === game.userId || setting.scope !== "client";
}

/** A setting's value for the user being edited */
function settingValue(setting: SettingConfig, userId: string): unknown {
  const id = `${setting.namespace}.${setting.key}`;
  return setting.scope === "user" ? userSettingValue(id, userId) : game.settings?.get(setting.namespace as never, setting.key as never);
}

/** The HUDs in use, one per module (providers sharing a settings object): the roles each fills */
function inUse(userId: string): { provider: HudProvider, roles: HudRole[] }[] {
  const found: { provider: HudProvider, settings?: HudSettings, roles: HudRole[] }[] = [];
  for (const role of HUD_ROLES) {
    const provider = hudProvider(hudChoice(role, userId));
    if (!provider) continue;
    const same = found.find(f => (f.settings && f.settings === provider.settings) || f.provider === provider);
    if (same) same.roles.push(role);
    else found.push({ provider, settings: provider.settings, roles: [role] });
  }
  return found;
}

export class TurnHudConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "midi-qol-turn-hud",
    tag: "form" as const,
    classes: ["midi-qol", "midi-qol-turn-hud"],
    window: { title: "midi-qol.Hud.Name", icon: "fa-solid fa-table-cells", resizable: true, contentClasses: ["standard-form"] },
    position: { width: 660, height: "auto" as const },
    form: { submitOnChange: true, closeOnSubmit: false, handler: TurnHudConfig.#onChange },
    actions: { hudTool: TurnHudConfig.#onTool, hudOwnSettings: TurnHudConfig.#onOwnSettings }
  };

  static PARTS = { body: { template: "modules/midi-qol/templates/apps/TurnHud/turnHud.hbs", scrollable: [".midi-qol-turn-hud-tabs-body"] } };

  /** The tools and own-settings openers drawn, by index (their buttons carry the index) */
  #tools: HudTool[] = [];
  #own: (() => void)[] = [];
  /** The user whose choices and settings are shown (a GM may pick another) */
  #userId: string = game.userId ?? "";

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const isGM = !!game.user?.isGM;
    const userId = isGM && game.users?.get(this.#userId) ? this.#userId : game.userId ?? "";
    this.#userId = userId;
    const self = userId === game.userId;
    // The GM: whose settings these are (user settings are per user)
    const userField = isGM ? Object.assign(new foundry.data.fields.StringField({ required: true,
      choices: Object.fromEntries((game.users?.contents ?? []).map(u => [u.id, u.isSelf ? i18n("midi-qol.Hud.You").replace("{name}", u.name ?? "") : u.name ?? ""])) }),
    { name: USER_FIELD, label: i18n("midi-qol.Hud.ForUser"), hint: i18n(self ? "midi-qol.Hud.ForUserHint" : "midi-qol.Hud.ForOtherHint") }) : undefined;
    const roles = HUD_ROLES.map(role => {
      const mine = PLAYER_ROLES.includes(role);
      const id = hudChoice(role, userId);
      const missing = id !== "foundry" && id !== "none" && !hudProvider(id);
      const label = i18n(`midi-qol.Hud.Role.${role}`);
      // The table's roles: a select for the GM, the choice shown to a player
      if ( !mine && !isGM ) return { readOnly: true, label, shown: hudChoices(role)[id] ?? id, hint: i18n("midi-qol.Hud.SetByGM"), missing };
      // The table's roles are the same for everyone: shown, not changed, while editing another user
      if (!mine && !self) return { readOnly: true, label, shown: hudChoices(role)[id] ?? id, hint: i18n("midi-qol.Hud.TableRoleHint"), missing };
      const field = new foundry.data.fields.StringField({ required: true, choices: hudChoices(role, { withDefault: mine }) });
      Object.assign(field, { name: choiceName(role), label,
        hint: i18n(mine ? `midi-qol.Hud.RoleHint.${role}` : "midi-qol.Hud.TableRoleHint") });
      return { field, value: mine ? playerChoice(role, userId) : tableChoice(role), missing };
    });
    this.#tools = [];
    this.#own = [];
    const huds = inUse(userId);
    const tabs = huds.flatMap(({ provider, roles: used }) => (provider.settings?.tabs ?? [])
      .filter(tab => !tab.roles || tab.roles.some(r => used.includes(r)))
      .map(tab => {
        const entries = tab.keys.map(settingConfig).filter(setting => editable(setting, userId)).map(setting => ({
          field: fieldFor(setting), value: settingValue(setting, userId), input: setting.input
        }));
        const tools = (tab.tools ?? []).filter(tool => !tool.gmOnly || isGM).map(tool => {
          this.#tools.push(tool);
          return { index: this.#tools.length - 1, label: i18n(tool.label), hint: tool.hint ? i18n(tool.hint) : "",
            icon: tool.icon ?? "fa-solid fa-gear", button: i18n(tool.button ?? tool.label) };
        });
        return { id: `${provider.label}-${tab.id}`.slugify(), label: i18n(tab.label), icon: tab.icon, entries, tools };
      })).filter(tab => tab.entries.length || tab.tools.length);
    const active = tabs.some(t => t.id === this.tabGroups.hud) ? this.tabGroups.hud : tabs[0]?.id;
    if (active) this.tabGroups.hud = active;
    const credits = huds.filter(h => h.provider.credit).map(h => h.provider.credit);
    // A HUD's own settings window edits the current user's
    const ownSettings = huds.filter(h => self && h.provider.openSettings).map(h => {
      this.#own.push(() => h.provider.openSettings?.());
      return { index: this.#own.length - 1, label: h.provider.label };
    });
    return { ...context, userField, userId, roles, hudTabs: tabs.map(t => ({ ...t, active: t.id === active })), credits, ownSettings };
  }

  static async #onChange(this: TurnHudConfig, event: Event, _form: HTMLFormElement, formData: { object: Record<string, unknown> }) {
    const name = (event.target as HTMLInputElement | null)?.name;
    if (!name || !(name in formData.object)) return;
    const value = formData.object[name];
    if (name === USER_FIELD) {
      this.#userId = String(value);
      return void this.render();
    }
    const role = HUD_ROLES.find(r => choiceName(r) === name);
    if (role) {
      await setHudChoice(String(value), role, this.#userId);
      return void this.render();
    }
    const setting = settingConfig(name);
    if (!editable(setting, this.#userId)) return;
    if (setting.scope === "user") await setUserSetting(name, value, this.#userId);
    else await game.settings?.set(setting.namespace as never, setting.key as never, value as never);
  }

  static #onTool(this: TurnHudConfig, _event: PointerEvent, target: HTMLElement) {
    this.#tools[Number(target.dataset.index)]?.open();
  }

  static #onOwnSettings(this: TurnHudConfig, _event: PointerEvent, target: HTMLElement) {
    this.#own[Number(target.dataset.index)]?.();
  }
}

export function openTurnHudConfig() {
  const open = foundry.applications.instances.get("midi-qol-turn-hud");
  if (open) return void open.render({ force: true });
  void new TurnHudConfig().render({ force: true });
}

/* The switcher: a small menu at a button (the hotbar's, a HUD's) for the player's combat HUD */

let switcher: HTMLElement | undefined;
function closeSwitcher() {
  switcher?.remove();
  switcher = undefined;
  document.removeEventListener("pointerdown", onOutside, true);
}
function onOutside(event: Event) {
  if (switcher && !switcher.contains(event.target as Node)) closeSwitcher();
}

export function showHudSwitcher(anchor: HTMLElement) {
  if (switcher) return closeSwitcher();
  const menu = document.createElement("menu");
  menu.className = "midi-qol-hud-switcher";
  const current = playerChoice("combat");
  for (const [id, label] of Object.entries(hudChoices("combat", { withDefault: true }))) {
    const item = document.createElement("li");
    item.innerHTML = `<button type="button" class="${id === current ? "active" : ""}"><i class="fa-solid ${id === current ? "fa-check" : "fa-fw"}"></i> ${foundry.utils.escapeHTML(label)}</button>`;
    item.querySelector("button")!.addEventListener("click", () => { closeSwitcher(); void setHudChoice(id, "combat"); });
    menu.append(item);
  }
  const settings = document.createElement("li");
  settings.className = "midi-qol-hud-switcher-settings";
  settings.innerHTML = `<button type="button"><i class="fa-solid fa-gear"></i> ${i18n("midi-qol.Hud.Settings")}</button>`;
  settings.querySelector("button")!.addEventListener("click", () => { closeSwitcher(); openTurnHudConfig(); });
  menu.append(settings);
  document.body.append(menu);
  const at = anchor.getBoundingClientRect();
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(at.left, window.innerWidth - box.width - 4))}px`;
  menu.style.top = `${Math.max(4, at.top - box.height - 4)}px`;
  switcher = menu;
  document.addEventListener("pointerdown", onOutside, true);
}

/** The switcher's button on core's hotbar (left controls) */
function addHotbarButton(_app: unknown, element: HTMLElement) {
  const controls = element.querySelector("#hotbar-controls-left");
  if (!controls || controls.querySelector(".midi-qol-hud-switch")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ui-control fa-solid fa-table-cells icon midi-qol-hud-switch";
  button.dataset.tooltip = i18n("midi-qol.Hud.Switch");
  button.setAttribute("aria-label", i18n("midi-qol.Hud.Switch"));
  button.addEventListener("click", event => { event.stopPropagation(); showHudSwitcher(button); });
  controls.prepend(button);
}

/** init: the menu in Configure Settings (every player), the keybinding (next combat HUD), the switcher on the hotbar */
export function registerTurnHudConfig() {
  game.settings?.registerMenu("midi-qol", "turnHudMenu", {
    name: "midi-qol.Hud.Name",
    label: "midi-qol.Hud.Configure",
    hint: "midi-qol.Hud.Hint",
    icon: "fa-solid fa-table-cells",
    type: TurnHudConfig as never,
    restricted: false
  });
  game.keybindings?.register("midi-qol", "cycleTurnHud", {
    name: "midi-qol.Hud.Cycle.Name",
    hint: "midi-qol.Hud.Cycle.Hint",
    editable: [{ key: "KeyH", modifiers: ["Alt", "Shift"] }],
    onDown: () => { void cycleHud(); return true; }
  } as never);
  Hooks.on("renderHotbar", addHotbarButton as never);
  hudApi.switcher = showHudSwitcher;
  hudApi.openSettings = openTurnHudConfig;
}
