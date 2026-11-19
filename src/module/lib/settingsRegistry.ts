import { MODULE_ID } from "../../midi-qol.js";
import { ConfigSettings, configSettings } from "../settings.js";
import { MIDI_SETTINGS } from "./settingsTable.js";

/*
 * The settings registry (M4a): every setting midi reads, declared once — midi's stored ConfigSettings (its keys in
 * settingsTable.ts, type and default from the class), midi's own game settings (as Foundry holds them), and the
 * settings modules register for their providers and contributors (MidiQOL.settings.register). The stored config object
 * is unchanged. midi's settings panel shows the registered ones in its Modules tab; the 14.x wizard and a later
 * settings UI (M17) can read the declarations.
 */

export type SettingType = "boolean" | "number" | "string" | "object";

export interface SettingDeclaration {
  /** midi-qol, or the module that registered it */
  module: string;
  /** midi's ConfigSettings path (`autoCheckHit`, `optionalRules.coverCalculation`), else the game setting's key */
  key: string;
  /** In midi's stored ConfigSettings, or a game setting of its module */
  store: "config" | "setting";
  scope: "world" | "client";
  type: SettingType;
  default: unknown;
  /** The settings panel's group (its tabs for midi's; a module's own group name) */
  group: string;
  label?: string;
  hint?: string;
  choices?: Record<string, string>;
  /** The step id or service the setting controls */
  controls?: string;
  /** A module the setting needs */
  requires?: string;
}

/** What a module gives to register a setting */
export type SettingRegistration = Omit<SettingDeclaration, "store" | "module" | "scope" | "type"> & { scope?: "world" | "client", type?: SettingType };

const registered = new Map<string, SettingDeclaration>();

const typeOf = (value: unknown): SettingType =>
  typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : typeof value === "string" ? "string" : "object";

const FOUNDRY_TYPES: Record<SettingType, unknown> = { boolean: Boolean, number: Number, string: String, object: Object };

/** midi's ConfigSettings keys, each with its type and default from a fresh ConfigSettings */
function midiConfigDeclarations(): SettingDeclaration[] {
  const defaults = new ConfigSettings();
  return Object.entries(MIDI_SETTINGS).map(([key, entry]) => {
    const value = foundry.utils.getProperty(defaults, key);
    return { module: MODULE_ID, key, store: "config" as const, scope: "world" as const, type: typeOf(value), default: value,
      group: entry.group, label: entry.label, hint: entry.hint };
  });
}

/** midi's own game settings (ConfigSettings itself excepted), as Foundry declares them */
function midiGameSettingDeclarations(): SettingDeclaration[] {
  const out: SettingDeclaration[] = [];
  for (const setting of game.settings?.settings?.values() ?? []) {
    if (setting.namespace !== MODULE_ID || setting.key === "ConfigSettings") continue;
    const type = setting.type === Boolean ? "boolean" : setting.type === Number ? "number" : setting.type === String ? "string" : "object";
    out.push({ module: MODULE_ID, key: setting.key, store: "setting", scope: setting.scope === "client" ? "client" : "world", type,
      default: setting.default, group: setting.scope === "client" ? "client" : "world",
      label: typeof setting.name === "string" ? setting.name : undefined, hint: typeof setting.hint === "string" ? setting.hint : undefined,
      choices: setting.choices });
  }
  return out;
}

/**
 * A module's setting for its provider or contributor: a game setting of the module (Foundry stores and syncs it), shown
 * in midi's settings panel under the module's group. Call at init or setup, as Foundry's own settings.
 */
export function registerSetting(module: string, registration: SettingRegistration): SettingDeclaration {
  if (module === MODULE_ID) throw new Error("midi-qol | MidiQOL.settings.register is for other modules' settings");
  const declaration: SettingDeclaration = { ...registration, module, store: "setting", scope: registration.scope ?? "world",
    type: registration.type ?? typeOf(registration.default) };
  // A key fvtt-types can't know (registered at run time): Foundry's register called as declared, not through its typed keys
  if (game.settings) Reflect.apply(game.settings.register, game.settings, [module, declaration.key, {
    name: declaration.label, hint: declaration.hint, scope: declaration.scope, config: false,
    type: FOUNDRY_TYPES[declaration.type], default: declaration.default, choices: declaration.choices
  }]);
  registered.set(`${module}.${declaration.key}`, declaration);
  return declaration;
}

/** Every declared setting: midi's config keys, midi's game settings, then the modules' */
export function declarations(): SettingDeclaration[] {
  return [...midiConfigDeclarations(), ...midiGameSettingDeclarations(), ...registered.values()];
}

/** The settings modules registered (the panel's Modules tab) */
export function registeredSettings(): SettingDeclaration[] {
  return [...registered.values()];
}

/** A declared setting's current value */
export function settingValue(module: string, key: string): unknown {
  if (module === MODULE_ID && key in MIDI_SETTINGS) return foundry.utils.getProperty(configSettings, key);
  return game.settings ? Reflect.apply(game.settings.get, game.settings, [module, key]) : undefined;
}

export const settingsApi = { register: registerSetting, declarations, registered: registeredSettings, get: settingValue };
