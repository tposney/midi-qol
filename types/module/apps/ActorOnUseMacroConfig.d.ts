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
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    get isEditable(): boolean;
    _prepareContext(options: any): Promise<any>;
    _onDragStart(ev: any): void;
    _onDrop(ev: any): void;
    _preClose(options: any): Promise<void>;
}
export {};
