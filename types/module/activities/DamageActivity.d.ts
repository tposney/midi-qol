export declare var MidiDamageActivity: any;
export declare var MidiDamageSheet: any;
export declare function setupDamageActivity(): void;
export declare function defineMidiDamageSheetClass(baseClass: any): {
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
