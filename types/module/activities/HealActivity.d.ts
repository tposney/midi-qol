export declare var MidiHealActivity: any;
export declare var MidiHealSheet: any;
export declare function setupHealActivity(): void;
export declare function defineMidiHealSheetClass(baseClass: any): {
    new (): {
        [x: string]: any;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any): Promise<any>;
        _getHeaderButtons(): any;
    };
    PARTS: any;
    DEFAULT_OPTIONS: any;
};
