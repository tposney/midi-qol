export declare class OnUseMacros {
    items: OnUseMacro[];
    constructor(onUseMacros?: any);
    static parseParts(parts: any): OnUseMacros;
    getMacros(currentOption: string | undefined): string;
    toString(): string;
    get selectListOptions(): string;
}
export declare class OnUseMacro {
    macroName: string;
    option: string;
    constructor(macro?: string | undefined);
    static parsePart(parts: {
        macroName: string;
        option: string | undefined;
    }): OnUseMacro;
    toString(): string;
    toListItem(index: Number, macroOptions: OnUseMacroOptions): string;
}
export declare class OnUseMacroOptions {
    static options: Array<{
        option: string;
        label: string;
    }>;
    static setOptions(options: any): void;
    static get getOptions(): Array<{
        option: string;
        label: string;
    }>;
}
export declare function activateMacroListeners(app: foundry.applications.api.DocumentSheetV2<Item>, html: HTMLElement): void;
export declare function getCurrentMacros(object: any): OnUseMacros;
export declare function getCurrentSourceMacros(object: any): OnUseMacros;
