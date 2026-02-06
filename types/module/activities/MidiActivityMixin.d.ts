import { Constructor } from "../../globals.js";
export declare class MidiConditionField extends globalThis.dnd5e.dataModels.fields.FormulaField {
    _validateType(value: unknown): value is string;
    constructor(options: any);
    static get _defaults(): any;
}
export declare let MidiActivityMixin: <TBase extends Constructor>(Base: TBase) => any;
export declare let MidiActivityMixinSheet: (Base: any) => {
    new (): {
        [x: string]: any;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
    };
    [x: string]: any;
    DEFAULT_OPTIONS: any;
    "__#165@#addMacro"(): void;
    PARTS: any;
};
export declare let MidiActivityUsageDialog: any;
export declare function setupMidiActivityMixin(): void;
