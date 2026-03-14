import { Activity } from "../../globals.js";
export declare let MidiHealActivity: ReturnType<typeof defineMidiHealActivityClass>;
export declare let MidiHealSheet: ReturnType<typeof defineMidiHealSheetClass>;
export declare function setupHealActivity(): void;
declare let defineMidiHealActivityClass: <T extends Activity>(ActivityClass: T) => any;
export declare function defineMidiHealSheetClass(baseClass: any): {
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
