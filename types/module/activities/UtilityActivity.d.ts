import { Activity } from "../../globals.js";
export declare let MidiUtilityActivity: ReturnType<typeof defineMidiUtilityActivityClass>;
export declare let MidiUtilitySheet: ReturnType<typeof defineMidiUtilitySheetClass>;
export declare function setupUtilityActivity(): void;
declare let defineMidiUtilityActivityClass: <T extends Activity>(ActivityClass: T) => any;
export declare function defineMidiUtilitySheetClass(baseClass: any): {
    new (): {
        [x: string]: any;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
    };
    PARTS: any;
    DEFAULT_OPTIONS: any;
};
export {};
