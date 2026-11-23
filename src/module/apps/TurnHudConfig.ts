import { i18n } from "../../midi-qol.js";
import { FOUNDRY_HUD, NO_HUD, cycleHud, hudApi, hudChoice, hudChoices, hudProvider, setHudChoice, type HudTool } from "../services/turnModel/hud.js";

/*
 * M7b: midi's Turn HUD window, one per player: the choice (Foundry's hotbar, a registered HUD, none), then the chosen
 * HUD's settings as it described them when it registered (tabs of registered settings, drawn as Foundry's settings
 * form draws them; world settings only for the GM), its tools, its credit. Saved as they change. Opened from
 * Configure Settings (midi-qol: Turn HUD), the switcher on the hotbar or on a HUD, or MidiQOL.hud.openSettings().
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
type SettingConfig = { namespace: string, key: string, scope: string, name?: string, hint?: string, type?: unknown, choices?: Record<string, string>,
  range?: { min?: number, max?: number, step?: number }, default?: unknown, input?: unknown };

const CHOICE_NAME = "midi-qol.turnHud";

/** A form field for a registered setting, as core's SettingsConfig builds one */
function fieldFor(setting: SettingConfig) {
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

/** A setting the user may change here: registered, and world settings only for the GM */
function editable(setting: SettingConfig | undefined): setting is SettingConfig {
  return !!setting && (setting.scope !== "world" || !!game.user?.isGM);
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

  /** The tools of the drawn tabs, by index (their buttons carry the index) */
  #tools: HudTool[] = [];

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const choice = hudChoice();
    const choiceField = new foundry.data.fields.StringField({ required: true, choices: hudChoices() });
    Object.assign(choiceField, { name: CHOICE_NAME, label: i18n("midi-qol.Hud.Name"), hint: i18n("midi-qol.Hud.Hint") });
    const provider = choice === FOUNDRY_HUD || choice === NO_HUD ? undefined : hudProvider(choice);
    this.#tools = [];
    const tabs = (provider?.settings?.tabs ?? []).map(tab => {
      const entries = tab.keys.map(settingConfig).filter(editable).map(setting => ({
        field: fieldFor(setting), value: game.settings?.get(setting.namespace as never, setting.key as never), input: setting.input
      }));
      const tools = (tab.tools ?? []).filter(tool => !tool.gmOnly || game.user?.isGM).map(tool => {
        this.#tools.push(tool);
        return { index: this.#tools.length - 1, label: i18n(tool.label), hint: tool.hint ? i18n(tool.hint) : "", icon: tool.icon ?? "fa-solid fa-gear",
          button: i18n(tool.button ?? tool.label) };
      });
      return { id: tab.id, label: i18n(tab.label), icon: tab.icon, entries, tools };
    }).filter(tab => tab.entries.length || tab.tools.length);
    const active = tabs.some(t => t.id === this.tabGroups.hud) ? this.tabGroups.hud : tabs[0]?.id;
    if (active) this.tabGroups.hud = active;
    return {
      ...context, choiceField, choice, hudTabs: tabs.map(t => ({ ...t, active: t.id === active })),
      credit: provider?.credit ?? "", ownSettings: !!provider?.openSettings,
      missing: choice !== FOUNDRY_HUD && choice !== NO_HUD && !provider
    };
  }

  static async #onChange(this: TurnHudConfig, event: Event, _form: HTMLFormElement, formData: { object: Record<string, unknown> }) {
    const name = (event.target as HTMLInputElement | null)?.name;
    if (!name || !(name in formData.object)) return;
    const value = formData.object[name];
    if (name === CHOICE_NAME) {
      await setHudChoice(String(value));
      return void this.render();
    }
    const setting = settingConfig(name);
    if (!editable(setting)) return;
    await game.settings?.set(setting.namespace as never, setting.key as never, value as never);
  }

  static #onTool(this: TurnHudConfig, _event: PointerEvent, target: HTMLElement) {
    this.#tools[Number(target.dataset.index)]?.open();
  }

  static #onOwnSettings(this: TurnHudConfig) {
    hudProvider(hudChoice())?.openSettings?.();
  }
}

export function openTurnHudConfig() {
  const open = foundry.applications.instances.get("midi-qol-turn-hud");
  if (open) return void open.render({ force: true });
  void new TurnHudConfig().render({ force: true });
}

/* The switcher: a small menu at a button (the hotbar's, a HUD's) */

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
  const current = hudChoice();
  for (const [id, label] of Object.entries(hudChoices())) {
    const item = document.createElement("li");
    item.innerHTML = `<button type="button" class="${id === current ? "active" : ""}"><i class="fa-solid ${id === current ? "fa-check" : "fa-fw"}"></i> ${foundry.utils.escapeHTML(label)}</button>`;
    item.querySelector("button")!.addEventListener("click", () => { closeSwitcher(); void setHudChoice(id); });
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

/** init: the menu in Configure Settings (every player), the keybinding, the switcher on the hotbar */
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
