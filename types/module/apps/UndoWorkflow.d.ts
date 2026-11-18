declare const UndoWorkflow_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class UndoWorkflow extends UndoWorkflow_base {
    undoAddedHookId: number;
    undoRemovedHookId: number;
    constructor(options: any);
    static PARTS: {
        main: {
            template: string;
        };
    };
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
    };
    _prepareContext(options: any): Promise<any>;
    _onRender(context: any, options: any): Promise<void>;
    get title(): string;
    close(options?: {}): Promise<void | this>;
}
export declare function showUndoWorkflowApp(): void;
export {};
