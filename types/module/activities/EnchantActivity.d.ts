export declare var MidiEnchantActivity: any;
export declare var MidiEnchantSheet: any;
export declare function setupEnchantActivity(): void;
export declare function defineMidiEnchantSheetClass(baseClass: any): {
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
