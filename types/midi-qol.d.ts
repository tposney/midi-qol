import "./module/damageAbsorption.js";
import { RollStats } from './module/RollStats.js';
export declare function getCanvas(): foundry.canvas.Canvas | undefined;
export declare let ceInterface: {
    findEffects: () => ActiveEffect.Implementation[];
    findEffect: (input: {
        folderId?: string;
        effectId?: string;
        effectName?: string;
    }) => ActiveEffect.Implementation | null;
    hasEffectApplied: (input: {
        effectId?: string;
        effectName?: string;
        uuid?: string;
    }) => boolean;
    addEffect: (input: {
        effectId?: string;
        effectName?: string;
        effectData?: ActiveEffect.CreateData;
        uuid?: string;
        overlay?: boolean;
        origin?: string | null;
    }) => Promise<ActiveEffect.Implementation[]>;
    removeEffect: (input: {
        effectId?: string;
        effectName?: string;
        uuid?: string;
        origin?: string | null;
    }) => Promise<void>;
    toggleEffect: (input: {
        effectId?: string;
        effectName?: string;
        uuids?: string[];
        overlay?: boolean;
        prioritizeTargets?: boolean;
        origin?: string | null;
    }) => Promise<void>;
} | undefined;
export declare let debugEnabled: number;
export declare let debug: (...args: any[]) => void;
export declare let log: (...args: any[]) => void;
export declare let warn: (...args: any[]) => void;
export declare let error: (...args: any[]) => void;
export declare const MODULE_ID = "midi-qol";
export declare let i18n: (key: SelectOptionValue) => string;
export declare let i18nFormat: (key: string, data?: {}) => string;
export declare function getStaticID(id: string): string;
export declare let setDebugLevel: (debugText: string) => void;
export declare function busyWait(milliSeconds: number): Promise<unknown>;
export declare let midiFlags: {
    name: string;
    type?: string;
}[];
export declare let allAttackTypes: string[];
export declare let gameStats: RollStats;
export declare let overTimeEffectsToDelete: Record<string, {
    uuid: string;
}>;
export declare let savedOverTimeEffectsToDelete: Record<string, {
    uuid: string;
    saveCount?: number;
    saveCountAction?: string;
    saveConsecutive?: boolean;
    failCount?: number;
    failCountAction?: string;
    failConsecutive?: boolean;
}>;
export declare let MQItemMacroLabel: string;
export declare let MQActivityMacroLabel: string;
export declare let MQOnUseOptions: Record<string, string>;
export declare let GameSystemConfig: typeof CONFIG.DND5E;
export declare let systemConcentrationId: string;
export declare let midiReactionEffect: ActiveEffect.Implementation | undefined;
export declare let midiBonusActionEffect: ActiveEffect.Implementation | undefined;
export declare let midiFlankingEffect: ActiveEffect.Implementation | undefined;
export declare let midiFlankedEffect: ActiveEffect.Implementation | undefined;
export declare const MESSAGE_TYPES: {
    HITS: number;
    SAVES: number;
    ATTACK: number;
    DAMAGE: number;
    OTHER: number;
    ITEM: number;
};
export declare let MQDamageRollTypes: string[];
/** DAE's special durations with midi's, for choosing them outside DAE's effect sheet (activity statuses). */
export declare let specialDurationChoices: Record<string, string>;
import { MoveTokenOptions, TeleportTokenDestination, TokenOrDocument, SelectOptionValue } from './globals.js';
export declare function testfunc(...args: any[]): void;
export declare function moveToken(tokenRef: TokenOrDocument | string, newCenter: {
    x: number;
    y: number;
    elevation?: number;
    level?: string;
}, options?: MoveTokenOptions | boolean, legacyOptions?: MoveTokenOptions): Promise<any>;
export declare function moveTokenAwayFromPoint(targetRef: TokenOrDocument | string, distance: number, point: {
    x: number;
    y: number;
}, options?: MoveTokenOptions | boolean, legacyCheckCollision?: boolean, legacyOptions?: MoveTokenOptions): Promise<any>;
export declare function teleportToken(tokenRef: TokenOrDocument | string, destination: TeleportTokenDestination): Promise<any>;
export declare function createEffects(data: {
    actorUuid: string;
    effects: ActiveEffect.CreateData[];
    options: {
        keepId: boolean;
    };
}): Promise<any>;
export declare function removeEffects(data: {
    actorUuid: string;
    effects: string[];
}): Promise<any>;
export declare function updateEffects(data: {
    actorUuid: string;
    updates: ActiveEffect.UpdateData[];
}): Promise<any>;
export declare function createMidiMacros(): Promise<void>;
/** midi's statuses that also carry another status: the self-ending Invisible carries invisible. */
export declare const MIDI_IMPLYING_STATUSES: Record<string, string>;
/** midi's statuses, added to `statusEffects` where missing. */
export declare function addMidiStatusEffects(statusEffects?: typeof CONFIG.statusEffects): void;
export declare function setupMidiStatusEffects(): void;
export declare function updateFlankingStatusEffects(): void;
