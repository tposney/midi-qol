import { Activity } from "../../globals.js";
export declare let MidiCastActivity: ReturnType<typeof defineMidiCastActivityClass>;
export declare let MidiCastSheet: ReturnType<typeof defineMidiCastSheetClass>;
export declare function setupCastActivity(): void;
declare let defineMidiCastSheetClass: (baseClass: any) => {
    new (): {
        [x: string]: any;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
    };
    DEFAULT_OPTIONS: any;
    PARTS: any;
};
declare let defineMidiCastActivityClass: <T extends Activity>(ActivityClass: T) => any;
export {};
