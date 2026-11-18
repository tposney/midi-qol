declare const ModuleReviewDialog_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class ModuleReviewDialog extends ModuleReviewDialog_base {
    #private;
    savedModules: Record<string, {
        title: string;
        active: boolean;
        installed?: boolean;
        version: string;
        compatibility?: string;
    }>;
    constructor(savedModules: Record<string, any>, options?: {});
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    static PARTS: {
        modules: {
            template: string;
            scrollable: string[];
        };
    };
    _prepareContext(options: any): Promise<any>;
}
export {};
