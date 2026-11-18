import { Activity } from "../../globals.js";
export declare let MidiDamageActivity: ReturnType<typeof defineMidiDamageActivityClass>;
export declare let MidiDamageSheet: ReturnType<typeof defineMidiDamageSheetClass>;
export declare function setupDamageActivity(): void;
declare let defineMidiDamageActivityClass: <T extends Activity>(ActivityClass: T) => any;
export declare function defineMidiDamageSheetClass(baseClass: any): {
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
