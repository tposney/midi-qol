import { Activity } from "../../globals.js";
export declare let MidiForwardActivity: ReturnType<typeof defineMidiForwardActivityClass>;
export declare let MidiForwardSheet: ReturnType<typeof defineMidiForwardSheetClass>;
export declare function setupForwardActivity(): void;
declare let defineMidiForwardSheetClass: (baseClass: any) => {
    new (): {
        [x: string]: any;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
    };
    DEFAULT_OPTIONS: any;
    PARTS: any;
};
declare let defineMidiForwardActivityClass: <T extends Activity>(ActivityClass: T) => any;
export {};
