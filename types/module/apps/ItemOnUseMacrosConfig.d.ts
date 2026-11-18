declare const ItemOnUseMacrosConfig_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/document-sheet.mjs").default>;
export declare class ItemOnUseMacrosConfig extends ItemOnUseMacrosConfig_base<Item.Implementation, foundry.applications.api.DocumentSheetV2.RenderContext<any>> {
    #private;
    static PARTS: {
        form: {
            id: string;
            classes: string[];
            template: string;
        };
    };
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    _prepareContext(options: any): Promise<import("fvtt-types/src/foundry/client/applications/api/document-sheet.mjs").default.RenderContext<any>>;
}
export {};
