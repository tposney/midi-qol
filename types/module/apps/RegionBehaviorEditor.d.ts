declare const RegionBehaviorEditor_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class RegionBehaviorEditor extends RegionBehaviorEditor_base {
    #private;
    activity: any;
    _workingRules: Array<{
        trigger: string;
        action: string;
        targetId: string;
    }>;
    constructor(activity: any, appOptions?: Partial<foundry.applications.api.ApplicationV2.Configuration>);
    static DEFAULT_OPTIONS: {
        id: string;
        tag: "form";
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
            closeOnSubmit: boolean;
            submitOnChange: boolean;
        };
        actions: {
            save: typeof RegionBehaviorEditor.__#385@#onSave;
            cancel: typeof RegionBehaviorEditor.__#385@#onCancel;
            addRule: typeof RegionBehaviorEditor.__#385@#onAddRule;
            deleteRule: typeof RegionBehaviorEditor.__#385@#onDeleteRule;
        };
    };
    static PARTS: {
        form: {
            template: string;
            scrollable: string[];
        };
    };
    get title(): string;
    _prepareContext(options: foundry.applications.api.ApplicationV2.RenderOptions): Promise<Record<string, any>>;
    _onRender(context: any, options: any): Promise<void>;
}
export {};
