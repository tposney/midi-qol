import { MidiOptions } from "./utils.js";
import { PreComputedAdvantage } from "./apps/MidiRollChoiceDialog.js";
import { ActivityUseConfiguration, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../globals.js";
import { RollModifierTracker } from "./lib/RollModifierTracker.js";
export { RollModifierTracker, computeAdvantageFlags, computeRollModifiers, applyRollModifiers, RollModifierFlags, RollModifierResult, AdvantageFlags } from "./lib/RollModifierTracker.js";
export { MidiDependentsRegistry, MidiDependentDocumentMixin } from "./lib/MidiDependentsRegistry.js";
export declare const skipConcentrationActorUuids: Set<string>;
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
export declare function bonusCheck(actor: Actor.Implementation, result: Roll, category: string, detail?: string, messageData?: any): Promise<Roll>;
export declare function addDiceTermModifiers(): void;
export declare function averageDice(roll: Roll): Roll<import("fvtt-types/utils").EmptyObject>;
export declare function rollSavingThrow(this: Actor.Implementation, wrapped: any, config?: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
export declare function deathSaveHook(rolls: Roll[], { chatString, subject: actor }: {
    chatString: string;
    updates: Actor.UpdateData;
    subject: Actor.Implementation;
}): void;
export declare function procAutoFail(actor: Actor.Implementation, rollType: string, abilityId: string): boolean;
export declare function procAutoFailSkill(actor: Actor.Implementation, skillId?: string): boolean;
export declare function computeAbilityAdvantage(actor: Actor.Implementation, rollType: string, abilityId: string, options: MidiOptions, tracker?: RollModifierTracker): Promise<{
    tracker: RollModifierTracker;
    magicResistance: boolean;
    magicVulnerability: boolean;
}>;
/**
 * Build a pre-computed advantage map for multiple roll IDs (abilities, skills, or tools).
 * Each entry contains a full RollModifierTracker with:
 * - Advantage/disadvantage (from the appropriate compute function)
 * - Roll modifiers: fail, success, max, min flags
 *
 * Used by Workflow.ts (checkSaves) and doRollAbility/doRollSkill/doRollTool when no pre-computed map is passed.
 *
 * @param actor - The actor making the roll
 * @param rollType - "save", "check", "skill", or "tool"
 * @param rollIds - Array of ability/skill/tool IDs to compute
 * @param options - MidiOptions including workflow context
 */
export declare function buildPreComputedAdvantageMap(actor: Actor.Implementation, rollType: string, rollIds: string[], options: MidiOptions): Promise<Map<string, PreComputedAdvantage>>;
export declare function computeSkillAdvantage(actor: Actor.Implementation, skillId: string, options: MidiOptions, tracker?: RollModifierTracker): Promise<RollModifierTracker>;
export declare function computeToolAdvantage(actor: Actor.Implementation, toolId: string, abilityId: string, options: MidiOptions, tracker?: RollModifierTracker): Promise<RollModifierTracker>;
export declare function _prepareDerivedData(this: Actor.Implementation, wrapped: any, ...args: any[]): void;
export declare function initPatching(): void;
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
export declare function zeroHPExpiry(actor: Actor.Implementation, update: Actor.UpdateData, options: Actor.Database.UpdateOptions, user: string): Promise<void>;
export declare function checkWounded(actor: Actor.Implementation, update: Actor.UpdateData, options: Actor.Database.UpdateOptions, user: string, vitalityValue?: number): Promise<void>;
export declare function readyPatching(): void;
export declare function challengeConcentration(this: Actor.Implementation, wrapped: any, { dc, ability }?: {
    dc?: number | undefined;
    ability?: null | undefined;
}): Promise<any>;
export declare let visionPatching: () => void;
export declare let itemPatching: () => void;
export declare function checkDeleteTemplate(templateDocument: MeasuredTemplateDocument, options: any, user: string): Promise<void>;
export declare let actorAbilityRollPatching: () => void;
export declare function rollToolCheck(this: Actor.Implementation, wrapped: any, config?: RollProcessConfig & {
    ability?: string;
    tool?: string;
}, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<Roll<import("fvtt-types/utils").EmptyObject>[] | undefined>;
export declare function createRollResultFromCustomRoll(customRoll: any): Promise<Roll.Evaluated<Roll<import("fvtt-types/utils").EmptyObject>>>;
export declare function _preDeleteCombat(this: Combat.Implementation, wrapped: any, ...args: any[]): Promise<any>;
export declare function doItemUse(this: Item.Implementation, wrapped: any, config?: ActivityUseConfiguration & {
    chooseActivity?: boolean;
}, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
export declare function processTraits(actor: Actor.Implementation): void;
export declare function migrateTraits(actor: Actor.Implementation): void;
