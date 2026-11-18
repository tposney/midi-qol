declare const TargetConfirmationConfig_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class TargetConfirmationConfig extends TargetConfirmationConfig_base {
    #private;
    gridMappings: {
        "midi-qol-grid1": {
            x: number;
            y: number;
        };
        "midi-qol-grid2": {
            x: number;
            y: number;
        };
        "midi-qol-grid3": {
            x: number;
            y: number;
        };
        "midi-qol-grid4": {
            x: number;
            y: number;
        };
        "midi-qol-grid5": {
            x: number;
            y: number;
        };
        "midi-qol-grid6": {
            x: number;
            y: number;
        };
        "midi-qol-grid7": {
            x: number;
            y: number;
        };
        "midi-qol-grid8": {
            x: number;
            y: number;
        };
        "midi-qol-grid9": {
            x: number;
            y: number;
        };
    };
    selectedPosition: {
        x: number;
        y: number;
    };
    static PARTS: {
        main: {
            template: string;
        };
    };
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    _onRender(context: any, options: any): Promise<void>;
    get title(): string;
    _prepareContext(options: any): Promise<any>;
    _preClose(options: any): Promise<void>;
}
export {};
