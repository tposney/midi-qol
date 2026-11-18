import { Activity } from "../../globals.js";
export declare let MidiEnchantActivity: ReturnType<typeof defineMidiEnchantActivityClass>;
export declare let MidiEnchantSheet: ReturnType<typeof defineMidiEnchantSheetClass>;
export declare function setupEnchantActivity(): void;
declare let defineMidiEnchantActivityClass: <T extends Activity>(ActivityClass: T) => any;
export declare function defineMidiEnchantSheetClass(baseClass: any): {
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
