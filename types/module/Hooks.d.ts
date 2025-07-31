export declare const concentrationCheckItemName = "Concentration Check - Midi QOL";
export declare var concentrationCheckItemDisplayName: string;
export declare var midiFlagTypes: {};
export declare let readyHooks: () => Promise<void>;
export declare function restManager(actor: Actor.Implementation, result: {
    longRest: boolean;
    newDay: boolean;
}): Promise<void>;
export declare function initHooks(): void;
export declare function setupHooks(): void;
