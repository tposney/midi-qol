import { fieldFor, type SettingConfig } from "./TurnHudConfig.js";

/*
 * The hidden-ground cue's settings (each player's own): on/off, style, colour, opacity, in one window opened from
 * Configure Settings (midi-qol: Hidden ground). Saved as they change; style, colour and opacity are greyed while the
 * cue is off.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const KEYS = ["hiddenGroundCue", "hiddenGroundCueStyle", "hiddenGroundCueColor", "hiddenGroundCueOpacity"] as const;

const setting = (key: string) => game.settings?.settings.get(`midi-qol.${key}` as never) as SettingConfig | undefined;

export class HiddenGroundCueConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "midi-qol-hidden-ground",
    tag: "form" as const,
    classes: ["midi-qol", "midi-qol-hidden-ground"],
    window: { title: "midi-qol.HiddenGroundCue.Menu.Name", icon: "fa-solid fa-layer-group", contentClasses: ["standard-form"] },
    position: { width: 520, height: "auto" as const },
    form: { submitOnChange: true, closeOnSubmit: false, handler: HiddenGroundCueConfig.#onChange }
  };

  static PARTS = { body: { template: "modules/midi-qol/templates/apps/HiddenGroundCue/hiddenGroundCue.hbs" } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const on = game.settings?.get("midi-qol", "hiddenGroundCue") === true;
    const entries = KEYS.map(setting).filter((s): s is SettingConfig => !!s).map(s => ({
      field: fieldFor(s), value: game.settings?.get("midi-qol", s.key as never), disabled: !on && s.key !== "hiddenGroundCue"
    }));
    return { ...context, entries };
  }

  static async #onChange(this: HiddenGroundCueConfig, event: Event, _form: HTMLFormElement, formData: { object: Record<string, unknown> }) {
    const name = (event.target as HTMLInputElement | null)?.name;
    const key = name?.replace(/^midi-qol\./, "");
    if (!name || !key || !(KEYS as readonly string[]).includes(key) || !(name in formData.object)) return;
    await game.settings?.set("midi-qol", key as never, formData.object[name] as never);
    if (key === "hiddenGroundCue") void this.render();
  }
}
