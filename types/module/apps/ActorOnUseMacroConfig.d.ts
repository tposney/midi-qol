import ApplicationV2 = foundry.applications.api.ApplicationV2;
declare const ActorOnUseMacrosConfig_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof ApplicationV2>;
export declare class ActorOnUseMacrosConfig extends ActorOnUseMacrosConfig_base {
    #private;
    document: Actor.Implementation;
    constructor(options: Partial<ApplicationV2.Configuration> & {
        document: Actor.Implementation;
    });
    static PARTS: {
        dialog: {
            id: string;
            classes: string[];
            template: string;
        };
    };
    static DEFAULT_OPTIONS: {
        window: {
            resizable: boolean;
            title: string;
        };
        position: {
            height: "auto";
            width: number;
        };
        form: {
            closeOnSubmit: boolean;
            submitOnClose: boolean;
        };
        actions: {
            add: typeof ActorOnUseMacrosConfig.__#403@#onAddMacro;
            delete: typeof ActorOnUseMacrosConfig.__#403@#onDeleteMacro;
        };
    };
    get isEditable(): boolean;
    _prepareContext(options: any): Promise<any>;
    _onDragStart(ev: any): void;
    _onDrop(ev: any): void;
    _preClose(options: any): Promise<void>;
}
export {};
