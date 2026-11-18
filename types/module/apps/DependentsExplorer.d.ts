declare const DependentsExplorer_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class DependentsExplorer extends DependentsExplorer_base {
    #private;
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    static PARTS: {
        main: {
            template: string;
            scrollable: string[];
        };
    };
    get title(): string;
    _prepareContext(options: any): Promise<any>;
    _onFirstRender(context: any, options: any): Promise<void>;
    _onRender(context: any, options: any): Promise<void>;
    _onClose(options: any): Promise<void>;
}
export {};
