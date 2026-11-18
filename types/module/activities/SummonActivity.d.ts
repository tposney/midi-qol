import { Activity } from "../../globals.js";
export declare let MidiSummonActivity: ReturnType<typeof defineMidiSummonActivityClass>;
export declare let MidiSummonSheet: ReturnType<typeof defineMidiSummonSheetClass>;
export declare function setupSummonActivity(): void;
declare let defineMidiSummonSheetClass: (baseClass: any) => {
    new (): {
        [x: string]: any;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
    };
    DEFAULT_OPTIONS: any;
    PARTS: any;
};
declare let defineMidiSummonActivityClass: <T extends Activity>(ActivityClass: T) => any;
export {};
