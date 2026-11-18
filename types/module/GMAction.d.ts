import { type IncomingRequest } from "./lib/requests.js";
import { DamageDescriptionObject } from "./Workflow.js";
import { DamageApplicationOptions, DamageDescription, DamageListEntry, DamageModDisplay, SaveDetails } from "../globals.js";
export declare let socketlibSocket: any;
export declare let setupSocket: () => void;
/**
 * midi's socket for other modules and macros (`MidiQOL.socket()`): socketlib's calls, with executeAsGM sent to midi's choice
 * of GM (preferred GM, then a GM on the caller's scene). Nothing is checked here: a check in the caller's client can be
 * bypassed, so any restriction belongs in the handler on the receiving side.
 */
export declare class SaferSocket {
    #private;
    constructor(socketlibSocket: any);
    executeAsGM(handler: any, ...args: any[]): Promise<any>;
    executeAsUser(handler: any, userId: any, ...args: any[]): any;
    executeForAllGMs(handler: any, ...args: any[]): any;
    executeForOtherGMs(handler: any, ...args: any[]): any;
    /** The name this method had (it called a method socketlib doesn't have) */
    executeForOtherGMS(handler: any, ...args: any[]): any;
    executeForEveryone(handler: any, ...args: any[]): any;
    executeForOthers(handler: any, ...args: any[]): any;
    executeForUsers(handler: any, recipients: any, ...args: any[]): any;
}
export declare function cancelWorkflow(data: {
    workflowId: string;
    itemCardUuid: string;
}): Promise<void>;
export declare function timedExecuteAsGM(toDo: string, data: any): Promise<any>;
export declare function preferredActiveGM(): User | null;
export declare function unTimedExecuteAsGM(toDo: string, ...args: any[]): Promise<any>;
export declare function timedAwaitExecuteAsGM(toDo: string, data: any): Promise<any>;
export declare function initGMActionSetup(): void;
/**
 * A roll made for a player by someone else (rollAbility's forUserId): the player sees it as they would have seen their own
 * roll in that mode, so a private or self roll is whispered to them too; a blind or public one is left as it is.
 */
export declare function whisperRollToPlayer(message: ChatMessage.Implementation): void;
/** The request type a player's client answers with its roll dialog (rollAbility with the request) */
export declare const SAVE_REQUEST = "midi-qol.save";
export declare function rollAbility(data: {
    saveDetails: SaveDetails;
    displayOptions?: {
        fastForward?: boolean;
        chatMessage?: boolean;
        rollMode?: string;
        showTargetDC?: boolean;
        /** Rolled for this player by someone else: shown to them as their own roll would have been */
        forUserId?: string;
        /** Rolled for another player's creature with no GM connected: nobody here may answer its prompts */
        unattended?: boolean;
    };
    request?: string;
    targetUuid?: string;
    ability?: string;
    skill?: string;
    tool?: string;
    options?: any;
    advantage?: boolean;
    disadvantage?: boolean;
    isMagicSave?: boolean;
    isConcentrationCheck?: boolean;
    rollDC?: number;
    saveItemUuid?: string;
    workflowOptions?: object;
    workflowId?: string;
    rollMode?: string;
}, request?: IncomingRequest): Promise<unknown>;
export interface DamageListContextEntry {
    isCharacter: boolean;
    isNpc: boolean;
    actorUuid: string;
    targetUuid: string;
    displayUuid: string;
    tokenId?: string;
    tokenImg: string;
    tokenVideoSrc?: string;
    hpDamage: number;
    abshpDamage: number;
    tempDamage: number;
    totalDamage: number;
    rawTotalDamage?: number;
    halfDamage: number;
    doubleDamage: number;
    playerViewTotalDamage: number;
    absDamage: number;
    tokenName: string;
    dmgSign: string;
    damageItem: DamageListEntry;
    oldVitality?: number;
    newVitality?: number;
    vitalityIncrease?: boolean;
    tempHpIncrease?: boolean;
    hpChanged?: boolean;
    tempHpChanged?: boolean;
    vitalityChanged?: boolean;
    tempMaxChanged?: boolean;
    noChange?: boolean;
    buttonId: string;
    iconPrefix: string;
    tooltip?: string;
    isHealing: boolean;
    absRawTotalDamage: number;
    absPlayerViewTotalDamage: number;
    vitalityDamage?: number;
    absVitalityDamage?: number;
    vitalityDamageIsHealing?: boolean;
}
/**
 * The modification labels for one calculated damage entry: what applied (`active`), and a trait the target has that
 * was ignored or downgraded (in `potential`, dnd5e 6.1, but not `active`).
 */
export declare function damageDetailMods(di: DamageDescription, options?: DamageApplicationOptions): string[];
/** The card tooltip's per-entry display data, taken from the CALCULATED damage detail. */
export declare function buildDamageMods(damageDetail?: DamageDescription[], options?: DamageApplicationOptions): DamageModDisplay[];
export declare let processUndoDamageCard: (message: ChatMessage.Implementation, html: HTMLElement, _data: unknown) => boolean;
type SerializedDamageOptions = Omit<DamageApplicationOptions, "downgrade" | "ignore"> & {
    downgrade?: true | string[];
    ignore?: true | {
        immunity: true | string[];
        resistance: true | string[];
        vulnerability: true | string[];
        modification: true | string[];
        superSaver?: true | string[];
        semiSuperSaver?: true | string[];
        saved?: true | string[];
        DR?: string[];
    };
};
export interface SerializedDamageListEntry extends Omit<DamageListEntry, "options" | "calculatedDamages" | "damages" | "damageDetail" | "rawDamageDetail" | "calcDamageOptions" | "damageDetails" | "healingAdjustedTotalDamage"> {
    calculatedDamages: DamageDescriptionObject[];
    damages: DamageDescriptionObject[];
    options: SerializedDamageOptions;
}
/** Cards before 14.7.0: midi's names for the record, per-category copies, and damageDetail the raw list */
interface LegacySerializedDamageListEntry extends Omit<SerializedDamageListEntry, "calculatedDamages" | "damages" | "options"> {
    damageDetail: DamageDescriptionObject[];
    rawDamageDetail?: DamageDescriptionObject[];
    calcDamageOptions: SerializedDamageOptions;
    damageDetails?: Record<string, DamageDescriptionObject[]>;
}
/**
 * The members of a damage-list entry that survive onto `flags.midi-qol.undoDamage`.
 *
 * Single source of truth for both the runtime projection and the types derived from it, so reaching
 * for a member not listed here is a compile error rather than an `undefined` at runtime. Narrower
 * than the socket payload, which feeds createReverseDamageCard and needs the lot.
 *
 * To store another field: add it here. Nothing else needs to change.
 */
declare const PERSISTED_UNDO_FIELDS: readonly ["actorUuid", "targetUuid", "wasHit", "oldHP", "newHP", "oldTempHP", "newTempHP", "oldTempMax", "newTempMax", "oldVitality", "newVitality", "oldVitalitySpent", "newVitalitySpent", "oldDeathFailures", "newDeathFailures", "hpDamage"];
/** `flags.midi-qol.damageRecord`, written on damage cards from 14.7.0 for a later format change; not read (an entry's format is detected per entry) */
export declare const DAMAGE_RECORD_VERSION = 3;
/** Members carried verbatim; those below need their encoding changed and are handled explicitly. */
type PersistedUndoFields = Pick<DamageListEntry, typeof PERSISTED_UNDO_FIELDS[number]>;
/**
 * What the card needs beyond the damage entries themselves, so it can be rendered from data.
 *
 * The decisions taken when the damage was applied; everything else is derived or looked up live.
 * Storing them stops a later settings change silently restyling an old card.
 */
export interface DamageCardOptions {
    /** Players are shown the card, through the player view */
    playerView: boolean;
    doHits: boolean;
    autoApplyDamage: string;
    forceApply: boolean;
    showNPC: boolean;
    playerButtons?: boolean;
}
/**
 * What is written to `flags.midi-qol.undoDamage`: the target's calculated damage (what was applied), its options and
 * HP before and after. Its raw damage is one of the card's `flags.midi-qol.rawDamage` lists (`rawIndex`), stored once.
 */
export interface PersistedUndoEntry extends PersistedUndoFields {
    calculatedDamages: DamageDescriptionObject[];
    rawIndex: number;
    options: SerializedDamageOptions;
    updateOptions: any;
}
/** An entry on a card before 14.7.0: the raw list, with the tooltip's labels and totals beside it */
interface LegacyPersistedUndoEntry extends Omit<PersistedUndoEntry, "calculatedDamages" | "rawIndex" | "options"> {
    damageDetail: DamageDescriptionObject[];
    rawDamageDetail?: DamageDescriptionObject[];
    calcDamageOptions: SerializedDamageOptions;
    damageMods?: DamageModDisplay[];
    totalDamage?: number;
    rawTotalDamage?: number;
}
/** What a card's `flags.midi-qol.undoDamage` holds, by when it was written */
export type StoredUndoEntry = PersistedUndoEntry | LegacyPersistedUndoEntry | LegacySerializedDamageListEntry;
/** A stored entry with its Sets and DamageDescriptions rehydrated, and the figures worked out from them. */
export type RecoveredUndoEntry = Omit<PersistedUndoEntry, "calculatedDamages" | "options" | "rawIndex"> & {
    calculatedDamages: DamageDescription[];
    damages: DamageDescription[];
    options: DamageListEntry["options"];
    /** Cards before 14.7.0 */
    damageMods?: DamageModDisplay[];
    totalDamage: number;
    rawTotalDamage: number;
};
/**
 * Serialise for storage on the chat message. Runs the socket serialiser then drops what the flag
 * does not need, so this decides only WHICH members survive, never how any of them is encoded.
 */
export declare function prepareDamageListForFlag(damageList: DamageListEntry[]): {
    undoDamage: PersistedUndoEntry[];
    rawDamage: DamageDescriptionObject[][];
};
/** Build a damage card's context from the message. Shared by card creation and the sub-type render. */
export declare function buildDamageCardContext(message: ChatMessage.Implementation, card: DamageCardOptions, asPlayer: boolean): Promise<{
    damageApplied: string;
    damageWasApplied: boolean;
    damageList: DamageListContextEntry[];
    needsButtonAll: boolean;
    showNPC: boolean;
    playerButtons?: boolean;
}>;
export declare function prepareDamageListToJSON(damageList: DamageListEntry[]): SerializedDamageListEntry[];
export {};
