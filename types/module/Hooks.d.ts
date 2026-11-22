export declare var concentrationCheckItemDisplayName: string;
export declare let readyHooks: () => Promise<void>;
export declare function restManager(actor: Actor.Implementation, result: {
    longRest: boolean;
    newDay: boolean;
}): Promise<void>;
export declare function applyReplacementEffect(actor: Actor.Implementation, effectSpec: string, effect?: ActiveEffect.Implementation): Promise<void>;
export declare function initHooks(): void;
export declare function setupHooks(): void;
