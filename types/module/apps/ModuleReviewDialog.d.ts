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
    static DEFAULT_OPTIONS: {
        id: string;
        classes: string[];
        window: {
            title: string;
            resizable: boolean;
            contentClasses: string[];
        };
        position: {
            width: number;
            height: number;
        };
        actions: {
            selectAll: typeof ModuleReviewDialog.__#376@#onSelectAll;
            deselectAll: typeof ModuleReviewDialog.__#376@#onDeselectAll;
            applyModules: typeof ModuleReviewDialog.__#376@#onApply;
        };
    };
    static PARTS: {
        modules: {
            template: string;
            scrollable: string[];
        };
    };
    _prepareContext(options: any): Promise<any>;
}
export {};
