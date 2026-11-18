interface OverTimeEditorOptions {
    value: string;
    effect: ActiveEffect;
    parent: Actor | Item | null;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}
declare const OverTimeEditor_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class OverTimeEditor extends OverTimeEditor_base {
    #private;
    originalValue: string;
    effect: ActiveEffect;
    parentDoc: Actor | Item | null;
    onSubmitCallback: (value: string) => void;
    onCancelCallback: () => void;
    submitted: boolean;
    currentData: Record<string, any>;
    originalSerialized: string;
    originalPermanent: boolean;
    originalRemaining: {
        saves: number;
        fails: number;
    };
    constructor(editorOptions: OverTimeEditorOptions, appOptions?: Partial<foundry.applications.api.ApplicationV2.Configuration>);
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
            height: number;
        };
        form: {
            closeOnSubmit: boolean;
            submitOnChange: boolean;
            handler: any;
        };
        actions: {
            save: typeof OverTimeEditor.__#400@#onSave;
            cancel: typeof OverTimeEditor.__#400@#onCancel;
        };
    };
    static PARTS: {
        form: {
            template: string;
            scrollable: string[];
        };
    };
    get title(): string;
    get hasUnsavedChanges(): boolean;
    close(options?: foundry.applications.api.ApplicationV2.ClosingOptions): Promise<this | void>;
    /**
     * Parse the raw OverTime string into key=value pairs without @-field evaluation.
     * We don't call parseOvertimeDetails because that evaluates @-expressions via Roll.safeEval,
     * which would lose the raw formula strings the user needs to edit.
     */
    parseRawOvertime(specString: string): Record<string, string>;
    _prepareContext(options: foundry.applications.api.ApplicationV2.RenderOptions): Promise<Record<string, any>>;
    /** Parse a count action string into its component fields for the form */
    parseCountFields(value: string): {
        count: number;
        mode: string;
        consecutive: boolean;
        effectSpec: string;
    };
    _onRender(context: Record<string, any>, options: foundry.applications.api.ApplicationV2.RenderOptions): Promise<void>;
    _preClose(options: any): Promise<void>;
}
export {};
