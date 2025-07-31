export declare class OnUseMacros {
    items: OnUseMacro[];
    constructor(onUseMacros?: any);
    static parseParts(parts: any): OnUseMacros;
    getMacros(currentOption: string | undefined): string;
    toString(): string;
}
export declare class OnUseMacro {
    macroName: string;
    option: string;
    macro: string | undefined;
    macroPassOptions: Record<string, string>;
    constructor(macro?: string | undefined);
    static parsePart(parts: {
        macroName: string;
        option: string | undefined;
    }): OnUseMacro;
    toString(): string;
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
export declare function getCurrentSourceMacros(document: Actor.Implementation): OnUseMacros;
