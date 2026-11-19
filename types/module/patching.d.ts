import type { IncomingRequest } from "./lib/requests.js";
import { MidiOptions } from "./utils.js";
import { PreComputedAdvantage } from "./apps/MidiRollChoiceDialog.js";
import Token = foundry.canvas.placeables.Token;
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../globals.js";
import { RollModifierTracker } from "./lib/RollModifierTracker.js";
export declare const skipConcentrationActorUuids: Set<string | null>;
export declare function getActorWoundedSemaphore(actorUuid: string | null): foundry.utils.Semaphore;
export declare function initPatching(): void;
export declare function readyPatching(): void;
export declare let visionPatching: () => void;
export declare let itemPatching: () => void;
export declare let actorAbilityRollPatching: () => void;
/**
 * Process wounded/dead status based on CURRENT actor state.
 * This function reads the actor's current HP and vitality, not stale update data.
 *
 * IMPORTANT: Callers must acquire the actor's semaphore (via getActorWoundedSemaphore)
 * before calling this function to prevent race conditions.
 *
 * Called from actorOnUpdate (for HP changes) and updateItem hook (for vitality changes).
 */
export declare function processWoundedStatus(actor: Actor.Implementation): Promise<void>;
export interface Options {
    advantage: boolean | undefined;
    disadvantage: boolean | undefined;
    fastForward: boolean | undefined;
    fastForwardSet: boolean | undefined;
    parts: [] | undefined;
    chatMessage: boolean | undefined;
    rollToggle: boolean | undefined;
    other: boolean | undefined;
    autoRollAttack: boolean | undefined;
    autoRollDamage: boolean | undefined;
    fastForwardAttack: boolean | undefined;
    fastForwardDamage: boolean | undefined;
    fastForwardAbility: boolean | undefined;
    isMagicSave?: boolean;
    saveItemUuid?: string;
    saveItem?: Item;
    item?: Item;
    itemUuid?: string;
    simulate?: boolean;
    target?: number;
    rollType?: string;
}
export declare const defaultRollOptions: Options;
export declare function collectBonusFlags(actor: Actor.Implementation, category: string, detail: string): string[];
export declare function bonusCheck(actor: Actor.Implementation, result: Roll, category: string, detail?: string, messageData?: any, prompt?: {
    request?: IncomingRequest;
    withinRequest?: IncomingRequest;
}): Promise<Roll>;
export declare function addDiceTermModifiers(): void;
export declare function averageDice(roll: Roll): Roll<import("fvtt-types/utils").EmptyObject>;
export declare function rollSavingThrow(this: Actor.Implementation, wrapped: any, config?: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
export declare function rollToolCheck(this: Actor.Implementation, wrapped: any, config?: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
export declare function deathSaveHook(rolls: Roll[], { chatString, subject: actor }: {
    chatString: string;
    updates: Actor.UpdateData;
    subject: Actor.Implementation;
}): void;
/** Three failed death saves (rolled, or from damage at 0 HP): midi's dead status replaces unconscious. */
export declare function applyFailedDeathSaves(actor: Actor.Implementation): Promise<void>;
/** Undoes applyFailedDeathSaves: the dead status goes and midi's usual 0 HP handling (unconscious) applies again. */
export declare function revertFailedDeathSaves(actor: Actor.Implementation): Promise<void>;
export declare function computeAbilityAdvantage(actor: Actor.Implementation, rollType: string, abilityId: string, options: MidiOptions, tracker?: RollModifierTracker, rollKind?: string): Promise<{
    tracker: RollModifierTracker;
    magicResistance: boolean;
    magicVulnerability: boolean;
}>;
/**
 * The ability a check activity rolls each of its skills or tools with, as dnd5e's check buttons do (the activity's own,
 * else the skill's or tool's), with "spellcasting" resolved for the actor.
 */
export declare function checkActivityAbilities(activity: Activity | undefined, actor: Actor.Implementation | undefined | null): ((id: string) => string | undefined) | undefined;
/**
 * Build a pre-computed advantage map for multiple roll IDs (abilities, skills, or tools).
 * Each entry contains a full RollModifierTracker with:
 * - Advantage/disadvantage (from the appropriate compute function)
 * - Roll modifiers: fail, success, max, min flags
 *
 * Used by Workflow.ts (checkSaves) and doD20Roll when no pre-computed map is passed.
 *
 * @param actor - The actor making the roll
 * @param rollType - "save", "check", "skill", or "tool"
 * @param rollIds - Array of ability/skill/tool IDs to compute
 * @param options - MidiOptions including workflow context
 */
export declare function buildPreComputedAdvantageMap(actor: Actor.Implementation, rollType: string, rollIds: string[], options: MidiOptions, ability?: string | ((id: string) => string | undefined)): Promise<Record<string, PreComputedAdvantage>>;
export declare function computeSkillAdvantage(actor: Actor.Implementation, skillId: string, options: MidiOptions, tracker?: RollModifierTracker, ability?: string): Promise<RollModifierTracker>;
export declare function computeToolAdvantage(actor: Actor.Implementation, toolId: string, abilityId: string, options: MidiOptions, tracker?: RollModifierTracker): Promise<RollModifierTracker>;
/**
 * Get the caster's token from a template's midi-qol flags.
 * The sourceTokenUuid is set by midiTemplateFlags when the template is created.
 * @returns The token, or undefined if not found
 */
export declare function getTemplateSourceToken(templateDoc: MeasuredTemplateDocument.Implementation): Token.Implementation | undefined;
export declare function _prepareDerivedData(this: Actor.Implementation, wrapped: any, ...args: any[]): void;
export declare function actorPrepareData(this: Actor.Implementation, wrapped: any): void;
export declare function itemPrepareData(this: Item.Implementation, wrapped: any): void;
export declare function prepareOnUseMacroData(actorOrItem: Actor.Implementation | Item.Implementation): void;
export declare function preUpdateItemActorOnUseMacro(itemOrActor: Actor.Implementation | Item.Implementation, changes: Actor.UpdateData | Item.UpdateData, options: Actor.Database.PreUpdateOperation | Item.Database.PreUpdateOptions, userId: string): boolean;
export declare function getItemEffectsToDelete(args: {
    actor: Actor.Implementation;
    origin: string;
    ignore: string[];
    ignoreTransfer: boolean;
    options: any;
}): string[];
export declare function zeroHPExpiry(actor: Actor.Implementation, update: Actor.UpdateData, options: Actor.Database.OnUpdateOptions, user: string): Promise<void>;
/**
 * Legacy wrapper for processWoundedStatus.
 * Called from Hooks.ts updateItem handler for vitality changes.
 * @deprecated Use processWoundedStatus directly for new code.
 */
export declare function checkWounded(actor: Actor.Implementation, _update: Actor.UpdateData, _options: Actor.Database.OnUpdateOptions, _user: string, _vitalityValue?: number): Promise<void>;
export declare function challengeConcentration(this: Actor.Implementation, wrapped: any, { dc, ability }?: {
    dc?: number | undefined;
    ability?: null | undefined;
}): Promise<any>;
export declare function checkDeleteTemplate(templateDocument: MeasuredTemplateDocument | RegionDocument.Implementation, options: any, user: string): Promise<void>;
export declare function _preDeleteCombat(this: Combat.Implementation, wrapped: any, ...args: any[]): Promise<any>;
export declare function doItemUse(this: Item.Implementation, wrapped: any, config?: ActivityUseConfiguration & {
    chooseActivity?: boolean;
}, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
export declare function processTraits(actor: Actor.Implementation): void;
