declare const ConfigPanel_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class ConfigPanel extends ConfigPanel_base {
    #private;
    configHookId: number | undefined;
    activeTab: string;
    constructor(options?: any);
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    static PARTS: {
        tabs: {
            template: string;
        };
        gm: {
            template: string;
        };
        player: {
            template: string;
        };
        workflow: {
            template: string;
        };
        concentration: {
            template: string;
        };
        reactions: {
            template: string;
        };
        misc: {
            template: string;
        };
        mechanics: {
            template: string;
        };
        rules: {
            template: string;
        };
        quick: {
            template: string;
        };
        footer: {
            template: string;
        };
    };
    static TABS: Record<string, foundry.applications.api.ApplicationV2.TabsConfiguration>;
    get title(): string;
    _prepareContext(options: any): Promise<any>;
    changeTab(tab: any, group: any, options?: any): void;
    _preparePartContext(partId: any, context: any): Promise<import("fvtt-types/src/foundry/client/applications/api/application.mjs").default.RenderContextOf<this>>;
    _onSearch(term: any): void;
    _onRender(context: any, options: any): Promise<void>;
    selectHover(event: any): void;
    selectHoverOut(event: any): void;
    _preClose(options: any): Promise<void>;
}
export declare function applySettings(key: string): Promise<boolean>;
export {};
