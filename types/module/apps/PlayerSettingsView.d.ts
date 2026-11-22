type SettingConfig = {
    key: string;
    namespace: string;
    scope: string;
    name?: string;
    type?: unknown;
    choices?: Record<string, string>;
    default?: unknown;
};
/** A player's value of a user setting (its default when they have none stored) */
export declare function playerSetting(setting: SettingConfig, userId: string): unknown;
/** Sets a player's value, as their own client would (the Setting document for that user) */
export declare function setPlayerSetting(setting: SettingConfig, userId: string, value: unknown): Promise<void>;
declare const PlayerSettingsView_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class PlayerSettingsView extends PlayerSettingsView_base {
    #private;
    static DEFAULT_OPTIONS: {
        tag: "form";
        classes: string[];
        window: {
            title: string;
            resizable: boolean;
            contentClasses: string[];
        };
        position: {
            width: number;
            height: "auto";
        };
        form: {
            submitOnChange: boolean;
            closeOnSubmit: boolean;
            handler: typeof PlayerSettingsView.__#375@#onChange;
        };
    };
    static PARTS: {
        table: {
            template: string;
            scrollable: string[];
        };
    };
    _prepareContext(options: any): Promise<{
        players: {
            name: string;
            active: boolean;
        }[];
        rows: {
            label: string;
            cells: ({
                name: string;
                checkbox: boolean;
                checked: boolean;
                options?: undefined;
                text?: undefined;
                value?: undefined;
            } | {
                name: string;
                options: {
                    value: string;
                    label: string;
                    selected: boolean;
                }[];
                checkbox?: undefined;
                checked?: undefined;
                text?: undefined;
                value?: undefined;
            } | {
                name: string;
                text: boolean;
                value: {};
                checkbox?: undefined;
                checked?: undefined;
                options?: undefined;
            })[];
        }[];
        none: boolean;
        tabs?: Record<string, import("fvtt-types/src/foundry/client/applications/api/application.mjs").default.Tab>;
    }>;
}
export {};
