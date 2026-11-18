interface ConditionEditorOptions {
    value: string;
    key: string;
    effect?: ActiveEffect;
    label?: string;
    parent: Actor | Item | null;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}
declare const ConditionEditor_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class ConditionEditor extends ConditionEditor_base {
    #private;
    originalValue: string;
    flagKey: string;
    effect: ActiveEffect | undefined;
    label: string | undefined;
    parentDoc: Actor | Item | null;
    onSubmitCallback: (value: string) => void;
    onCancelCallback: () => void;
    submitted: boolean;
    constructor(editorOptions: ConditionEditorOptions, appOptions?: Partial<foundry.applications.api.ApplicationV2.Configuration>);
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    static PARTS: {
        form: {
            template: string;
        };
    };
    get title(): string;
    _prepareContext(options: foundry.applications.api.ApplicationV2.RenderOptions): Promise<Record<string, any>>;
    _onRender(context: Record<string, any>, options: foundry.applications.api.ApplicationV2.RenderOptions): Promise<void>;
    get hasUnsavedChanges(): boolean;
    close(options?: foundry.applications.api.ApplicationV2.ClosingOptions): Promise<this | void>;
    _preClose(options: any): Promise<void>;
}
export {};
