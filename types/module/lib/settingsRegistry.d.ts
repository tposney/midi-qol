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
export type SettingRegistration = Omit<SettingDeclaration, "store" | "module" | "scope" | "type"> & {
    scope?: "world" | "client";
    type?: SettingType;
};
/**
 * A module's setting for its provider or contributor: a game setting of the module (Foundry stores and syncs it), shown
 * in midi's settings panel under the module's group. Call at init or setup, as Foundry's own settings.
 */
export declare function registerSetting(module: string, registration: SettingRegistration): SettingDeclaration;
/** Every declared setting: midi's config keys, midi's game settings, then the modules' */
export declare function declarations(): SettingDeclaration[];
/** The settings modules registered (the panel's Modules tab) */
export declare function registeredSettings(): SettingDeclaration[];
/** A declared setting's current value */
export declare function settingValue(module: string, key: string): unknown;
export declare const settingsApi: {
    register: typeof registerSetting;
    declarations: typeof declarations;
    registered: typeof registeredSettings;
    get: typeof settingValue;
};
