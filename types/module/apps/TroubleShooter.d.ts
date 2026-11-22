declare const TroubleShooter_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class TroubleShooter extends TroubleShooter_base {
    #private;
    static errors: {
        timestamp: number;
        timeString: string;
        error: any;
        message: string | undefined;
    }[];
    static MAX_ERRORS: number;
    static _data: TroubleShooterData;
    static set data(data: TroubleShooterData);
    static get data(): TroubleShooterData;
    _fixerId: number;
    _fixerFuncs: Array<(app: any) => void>;
    get nextFixerId(): number;
    _hookId: any;
    constructor(...args: any[]);
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    static PARTS: {
        tabs: {
            template: string;
        };
        summary: {
            template: string;
        };
        common: {
            template: string;
        };
        problems: {
            template: string;
        };
        errors: {
            template: string;
        };
        automation: {
            template: string;
        };
        modules: {
            template: string;
        };
        footer: {
            template: string;
        };
    };
    tabGroups: {
        sheet: string;
    };
    static recordError(err: any, message?: string | undefined): void;
    static clearErrors(): void;
    static logErrors(): void;
    static exportTroubleShooterData(): void;
    static importTroubleShooterDataFromJSONDialog(): Promise<boolean>;
    static getDetailedSettings(moduleId: string): any;
    static troubleShooter(app: any): Promise<void>;
    _onSubmit(...args: any[]): Promise<any>;
    _preClose(options: any): Promise<void>;
    _onRender(context: any, options: any): Promise<void>;
    overWriteMidiSettings(): Promise<boolean>;
    _prepareContext(options: any): Promise<any>;
    _preparePartContext(partId: any, context: any): Promise<any>;
    static collectTroubleShooterData(): TroubleShooterData;
    static checkConcentrationStatusEffects(data: TroubleShooterData): void;
    /** CAT prompts for its own optional bonuses unless it offers them through midi's rollBonuses service: two prompts on one roll */
    static checkRollBonusPrompts(data: TroubleShooterData): void;
    static checkMidiCoverSettings(data: TroubleShooterData): void;
    static checkMidiSaveSettings(data: TroubleShooterData): void;
    static checkWalledTemplates(data: TroubleShooterData): void;
    static checkItemMacro(data: TroubleShooterData): void;
    static checkVolumetricTemplates(data: TroubleShooterData): void;
    static checkCommonProblems(data: TroubleShooterData): void;
    /**
     * Chat messages of midi's types that fail their data model (a stored shape no longer valid): Foundry only logs them
     * while the world loads and leaves them out of the chat log, and Clear Chat Log can't remove them.
     */
    static checkInvalidMidiMessages(data: TroubleShooterData): void;
    static checkRulesText(data: TroubleShooterData): void;
    static checkAutoAnimations(data: TroubleShooterData): void;
    static checkNoActorTokens(data: TroubleShooterData): void;
    static checkMidiSettings(data: TroubleShooterData): void;
}
interface ProblemSpec {
    moduleId: string | undefined;
    severity: "Error" | "Warn" | "Inform";
    problemSummary: string;
    critical?: boolean;
    problemDetail: any | undefined;
    fixer?: string;
    fixerFunc?: any;
    fixerId?: number;
}
interface TroubleShooterData {
    midiVersion: string;
    isLocal: boolean;
    fileName: string;
    summary: any;
    problems: ProblemSpec[];
    modules: any;
    errors: any;
    midiSettings: any;
}
export {};
