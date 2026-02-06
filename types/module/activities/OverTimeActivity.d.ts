import { Activity } from "../../globals.js";
export declare let MidiOverTimeActivity: ReturnType<typeof defineMidiOverTimeActivityClass>;
export declare let MidiOverTimeSheet: ReturnType<typeof defineMidiOverTimeSheetClass>;
export declare function setupOvertimeActivity(): void;
declare let defineMidiOverTimeSheetClass: (baseClass: any) => {
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
declare let defineMidiOverTimeActivityClass: <T extends Activity>(ActivityClass: T) => any;
export {};
