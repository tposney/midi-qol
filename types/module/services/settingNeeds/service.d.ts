export interface SettingNeed {
    setting: string;
    expected?: unknown | ((value: unknown) => boolean);
    /** The value Auto Fix sets; none: no Auto Fix */
    fix?: unknown;
    /** Why the module needs it (shown with the problem) */
    why?: string;
    /** Shown in place of the setting's own name */
    label?: string;
}
export interface SettingNeedsContributor {
    needs(): readonly SettingNeed[] | undefined;
}
declare module "../../api/services.js" {
    interface MidiServices {
        settingNeeds: SettingNeedsContributor;
    }
}
export declare function defineSettingNeedsService(): void;
export declare function currentSetting(setting: string): unknown;
export declare function setSetting(setting: string, value: unknown): Promise<void>;
export declare function needMet(need: SettingNeed, value: unknown): boolean;
/** Every contributor's needs that aren't met now */
export declare function unmetSettingNeeds(): {
    contributor: string;
    need: SettingNeed;
    value: unknown;
}[];
