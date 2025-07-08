export declare var MidiCheckActivity: any;
export declare var MidiCheckSheet: any;
export declare function setupCheckActivity(): void;
export declare function defineMidiCheckSheetClass(baseClass: any): {
    new (): {
        [x: string]: any;
        _prepareEffectContext(context: any): Promise<any>;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any): Promise<any>;
        _getHeaderButtons(): any;
    };
    PARTS: any;
    DEFAULT_OPTIONS: any;
};
