import { Activity } from "../../globals.js";
export declare let MidiSaveActivity: ReturnType<typeof defineMidiSaveActivityClass>;
export declare let MidiSaveSheet: ReturnType<typeof defineMidiSaveSheetClass>;
export declare function setupSaveActivity(): void;
declare let defineMidiSaveActivityClass: <T extends Activity>(ActivityClass: T) => any;
declare let defineMidiSaveSheetClass: (baseClass: any) => {
    new (): {
        [x: string]: any;
        _prepareContext(options: any): Promise<any>;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
    };
    PARTS: any;
    DEFAULT_OPTIONS: any;
};
export {};
