declare const SoundConfigPanel_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class SoundConfigPanel extends SoundConfigPanel_base {
    #private;
    static defaultPlaylist: string | undefined;
    static defaultSound: string | undefined;
    get title(): string;
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    static PARTS: {
        tabs: {
            template: string;
        };
        sounds: {
            template: string;
            scrollable: string[];
        };
        quick: {
            template: string;
        };
        footer: {
            template: string;
        };
    };
    tabGroups: {
        sheet: string;
    };
    _prepareContext(options: any): Promise<any>;
    get playlists(): {};
    get requiredPlaylists(): any;
    missingSounds(soundSettings: any): string[];
    canSave(soundSettings: any): boolean;
    _preparePartContext(partId: any, context: any): Promise<any>;
    _onChangeForm(formConfig: any, event: any): void;
    _onRender(context: any, options: any): Promise<void>;
    changeHandler(event: any): void;
}
export {};
