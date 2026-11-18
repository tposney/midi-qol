declare const DependentsExplorer_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class DependentsExplorer extends DependentsExplorer_base {
    #private;
    static DEFAULT_OPTIONS: {
        id: string;
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
            deleteParent: typeof DependentsExplorer.__#380@#onDeleteParent;
            deleteDependent: typeof DependentsExplorer.__#380@#onDeleteDependent;
            openDocument: typeof DependentsExplorer.__#380@#onOpenDocument;
            toggleSection: typeof DependentsExplorer.__#380@#onToggleSection;
            clearFilter: typeof DependentsExplorer.__#380@#onClearFilter;
        };
    };
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
