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
    static DEFAULT_OPTIONS: {
        form: {
            handler: typeof ItemOnUseMacrosConfig.__#394@#onSubmit;
            submitOnChange: boolean;
            closeOnSubmit: boolean;
        };
        position: {
            width: number;
        };
        tag: string;
        actions: {
            addMacro: typeof ItemOnUseMacrosConfig.__#394@#onAddMacro;
            deleteMacro: typeof ItemOnUseMacrosConfig.__#394@#onDeleteMacro;
            editMacro: typeof ItemOnUseMacrosConfig.__#394@#onEditMacro;
        };
    };
    _prepareContext(options: any): Promise<import("fvtt-types/src/foundry/client/applications/api/document-sheet.mjs").default.RenderContext<any>>;
}
export {};
