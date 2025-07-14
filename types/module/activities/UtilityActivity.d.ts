export declare var MidiUtilityActivity: any;
export declare var MidiUtilitySheet: any;
export declare function setupUtilityActivity(): void;
export declare function defineMidiUtilitySheetClass(baseClass: any): {
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
