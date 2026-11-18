import { Activity } from "../../globals.js";
export declare let MidiCheckActivity: ReturnType<typeof defineMidiCheckActivityClass>;
export declare let MidiCheckSheet: ReturnType<typeof defineMidiCheckSheetClass>;
export declare function setupCheckActivity(): void;
declare let defineMidiCheckActivityClass: <T extends Activity>(ActivityClass: T) => any;
export declare function defineMidiCheckSheetClass(baseClass: any): {
    new (): {
        [x: string]: any;
        _prepareEffectContext(context: any): Promise<any>;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
    };
    PARTS: any;
    DEFAULT_OPTIONS: any;
};
export {};
