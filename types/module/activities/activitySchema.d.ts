export declare function installActivitySchema(): void;
export declare class MidiConditionField extends globalThis.dnd5e.dataModels.fields.FormulaField {
    _validateType(value: unknown): value is string;
    constructor(options: any);
    static get _defaults(): any;
    /**
     * Override _toInput to wrap the text input with a condition editor button.
     * The button opens the ConditionEditor which provides autocomplete for condition expressions.
     */
    _toInput(config: any): HTMLElement;
}
