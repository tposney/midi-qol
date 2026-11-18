import { Activity } from "../../globals.js";
export declare let MidiTransformActivity: ReturnType<typeof defineMidiTransformActivityClass>;
export declare let MidiTransformSheet: ReturnType<typeof defineMidiTransformSheetClass>;
export declare function setupTransformActivity(): void;
declare let defineMidiTransformSheetClass: (baseClass: any) => {
    new (): {
        [x: string]: any;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
    };
    DEFAULT_OPTIONS: any;
    PARTS: any;
};
declare let defineMidiTransformActivityClass: <T extends Activity>(ActivityClass: T) => any;
export {};
