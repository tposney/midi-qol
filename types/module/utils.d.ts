import { Workflow } from "./Workflow.js";
export type ReactionItemReference = {
    itemName: string;
    itemId: string;
    actionName: string;
    img: string;
    id: string;
    uuid: string;
} | String;
export type ReactionItem = {
    itemName: string;
    itemId: string;
    actionName: string;
    img: string;
    id: string;
    uuid: string;
    baseItem: Item;
} | game.system.documents.activity.ActivityMixin;
export declare function getDamageType(flavorString: any): string | undefined;
export declare function getDamageFlavor(damageType: any): string | undefined;
/**
*  Modifies the provided damageItem! For use during the isDamaged macro passes.
*/
export declare function modifyDamageBy({ damageItem, value, multiplier, type, reason }: {
    damageItem: any;
    value: any;
    multiplier?: number | undefined;
    type?: string | undefined;
    reason: any;
}): {};
/**
 *  return a list of {damage: number, type: string} for the roll and the item
 */
export declare function createDamageDetail({ roll, item, defaultType }: {
    roll: any;
    item: any;
    defaultType?: any;
}): {
    damage: unknown;
    type: string;
}[];
export declare function createDamageDetailV4({ roll, activity, defaultType }: {
    roll: any;
    activity: any;
    defaultType?: any;
}): {
    damage: unknown;
    type: string;
}[];
export declare function getOrCreateTokenForActor(actor: any): Token;
export declare function getOrCreateTokenForActorAsSet(actor: any): Set<Token>;
/**
 * Work out the appropriate multiplier for DamageTypeString on actor
 * If configSettings.damageImmunities are not being checked always return 1
 *
 */
export declare let getTraitMult: (actor: any, dmgTypeString: any, item: any, damageProperties?: string[]) => number;
export declare function applyTokenDamage(damageDetail: any, totalDamage: any, theTargets: any, item: any, saves: any, options?: any): Promise<any[]>;
export interface applyDamageDetails {
    label: string;
    damageDetail: any[];
    damageTotal: number;
    saves?: Set<Token | TokenDocument>;
    superSavers?: Set<Token | TokenDocument>;
    semiSuperSavers?: Set<Token | TokenDocument>;
}
export declare function setupV3DamageDetails(allDamages: any, selector: any, actor: Actor): void;
export declare function processDamageRoll(workflow: Workflow, defaultDamageType: string): Promise<void>;
export declare function getsaveMultiplierForActivity(activity: any): number;
export declare let getSaveMultiplierForItem: (item: Item, itemDamageType: any) => number;
export interface pcSaveOptions {
    flavor: string;
    requestId: string;
    GMprompt: any;
    isMagicSave: boolean;
    magicResistance: boolean;
    magicVulnerability: boolean;
    saveDetails: {
        advantage: boolean | undefined;
        disadvantage: boolean | undefined;
        isFriendly: boolean;
        isMagicSave: boolean;
        isConcentrationCheck: boolean | undefined;
        rollDC: number;
        saveItemUuid: string;
        workflowId: string;
        workflowUuid: string;
        workflowOptions: object;
        itemCardUuid: string;
    };
}
export declare function requestPCSave(ability: string, rollType: any, player: any, actor: any, options: pcSaveOptions): Promise<ChatMessage> | undefined;
export declare function requestPCActiveDefence(player: any, actor: any, advantage: any, saveItemName: any, rollDC: any, formula: any, requestId: any, options?: {
    workflow: Workflow;
}): void;
export declare function midiCustomEffect(...args: any[]): boolean;
export declare function checkImmunity(candidate: any, data: any, options: any, user: any): boolean;
export declare function untargetDeadTokens(): void;
export declare function doOverTimeEffect(actor: any, effect: any, startTurn?: boolean, options?: any): Promise<any>;
export declare function doActivityOverTimeEffect(actor: any, effect: any, startTurn?: boolean, options?: any): Promise<any>;
export declare function localActivityOverTimeEffect(actor: any, effect: any, startTurn?: boolean, options?: any): Promise<void>;
export declare function gmOverTimeEffect(actor: any, effect: any, startTurn?: boolean, options?: any): Promise<any>;
export declare function _processActivityOverTime(combat: any, data: any, options: any, userId: any): Promise<void>;
export declare function _processOverTime(combat: any, data: any, options: any, userId: any): Promise<void>;
export declare function completeActivityUse(activity: any, usage?: any, dialog?: any, message?: any): Promise<any>;
export declare function completeItemUse(item: any, config?: any, dialog?: any, message?: any): Promise<any>;
export declare function untargetAllTokens(...args: any[]): void;
export declare function checkDefeated(actorRef: Actor | Token | TokenDocument | string): 0 | 1;
export declare function checkIncapacitated(actorRef: Actor | Token | TokenDocument | string | undefined | null, logResult?: boolean, warning?: boolean): string | false;
export declare function logIncapacitatedCheckResult(actorName: string, status: string, logResult?: boolean, warning?: boolean): void;
export declare function getUnitDist(x1: number, y1: number, z1: number, token2: any): number;
export declare function distancePointToken({ x, y, elevation }: {
    x: any;
    y: any;
    elevation?: number | undefined;
}, token: any, wallblocking?: boolean): number | undefined;
export declare function checkDistance(t1: any, t2: any, distance: number, options?: boolean | {
    wallsBlock?: boolean;
    includeCover?: boolean;
}): boolean;
/** takes two tokens of any size and calculates the distance between them
*** gets the shortest distance betwen two tokens taking into account both tokens size
*** if wallblocking is set then wall are checked
**/
export declare function computeDistance(t1: any, t2: any, options?: boolean | {
    wallsBlock?: boolean;
    includeCover?: boolean;
}): number;
export declare function checkActivityRange(activityIn: any, tokenRef: Token | TokenDocument | string | undefined, targetsRef: Set<Token | TokenDocument | string> | undefined, showWarning?: boolean): {
    result: string;
    attackingToken?: Token;
    range?: number | undefined;
    longRange?: number | undefined;
};
export declare function checkRange(itemIn: any, tokenRef: Token | TokenDocument | string | undefined, targetsRef: Set<Token | TokenDocument | string> | undefined, showWarning?: boolean): {
    result: string;
    attackingToken?: Token;
    range?: number | undefined;
    longRange?: number | undefined;
};
export declare const FULL_COVER = 999;
export declare const THREE_QUARTERS_COVER = 5;
export declare const HALF_COVER = 2;
export declare function computeCoverBonus(attacker: Token | TokenDocument, target: Token | TokenDocument, activity?: any): number;
export declare function isAutoFastAttack(workflow?: Workflow | undefined): boolean;
export declare function isAutoFastDamage(workflow?: Workflow | undefined): boolean;
export declare function autoConsumeResource(workflow?: Workflow | undefined): string;
export declare function getAutoRollDamage(workflow?: Workflow | undefined): string;
export declare function getAutoRollAttack(workflow?: Workflow | undefined): boolean;
export declare function getTargetConfirmation(workflow?: Workflow | undefined): string;
export declare function activityHasDamage(activity: any): boolean;
export declare function itemHasDamage(item: any): any;
export declare function itemIsVersatile(item: any): any;
export declare function getRemoveAllButtons(activity?: any): boolean;
export declare function getRemoveAttackButtons(activity?: any): boolean;
export declare function getRemoveDamageButtons(activity?: any): boolean;
export declare function getReactionSetting(player: User | null | undefined): string;
export declare function getTokenPlayerName(token: TokenDocument | Token, checkGM?: boolean): any;
export declare function getTokenPlayerNameForUser(user: User, token: TokenDocument | Token, checkGM?: boolean): any;
export declare function getSpeaker(actor: any): ChatMessage.SpeakerData;
export declare function findNearbyCount(disposition: number | string | null | Array<string | number>, token: any, distance: number, options?: {
    maxSize: number | undefined;
    includeIncapacitated: boolean | undefined;
    canSee: boolean | undefined;
    isSeen: boolean | undefined;
    includeToken: boolean | undefined;
    relative: boolean | undefined;
}): number;
/**
 * findNearby
 * @param {number} [disposition]          What disposition to match - one of CONST.TOKEN.DISPOSITIONS
 
 * @param {string} [disposition]          What disposition to match - one of (localize) Friendly, Neutral, Hostile, Secret, all
 * @param {null} [disposition]            Match any disposition
 * @param {Array<string>} [disposition]   Match any of the dispostion strings
 * @param {Array<number>} [disposition]   Match any of the disposition numbers
 * @param {Token} [token]                 The token to use for the search
 * @param {string} [token]                A token UUID
 * @param {number} [distance]             The distance from token that will match
 * @param {object} [options]
 * @param {number} [options.MaxSize]      Only match tokens whose width * length < MaxSize
 * @param {boolean} [includeIncapacitated]  Should incapacitated actors be include?
 * @param {boolean} [canSee]              Must the potential target be able to see the token?
 * @param {boolean} isSeen                Must the token token be able to see the potential target?
 * @param {boolean} [includeToken]        Include token in the return array?
 * @param {boolean} [relative]            If set, the specified disposition is compared with the token disposition.
 *  A specified dispostion of HOSTILE and a token disposition of HOSTILE means find tokens whose disposition is FRIENDLY
 
*/
export declare function findNearby(disposition: number | string | null | Array<string | number>, token: any, distance: number, options?: {
    maxSize: number | undefined;
    includeIncapacitated: boolean | undefined;
    canSee: boolean | undefined;
    isSeen: boolean | undefined;
    includeToken: boolean | undefined;
    relative: boolean | undefined;
}): Token[];
export declare function checkNearby(disposition: number | null | string, tokenRef: Token | TokenDocument | string | undefined, distance: number, options?: any): boolean;
export declare function hasCondition(actorRef: Actor | Token | TokenDocument | string | undefined | null, condition: string): 0 | 1;
export declare function removeInvisible(): Promise<void>;
export declare function removeInvisibleCondition(tokenRef: Token | TokenDocument | string | undefined): Promise<void>;
export declare function removeHidden(): Promise<void>;
export declare function removeHiddenCondition(tokenRef: Token | TokenDocument | string | undefined): Promise<void>;
export declare function removeTokenConditionEffect(token: Token, condition: string): Promise<void>;
export declare function expireMyEffects(effectsToExpire: string[]): Promise<void>;
export declare function expireRollEffect(rolltype: string, abilityId: string, success?: boolean | undefined): Promise<void>;
export declare function validTargetTokens(tokenSet: Set<Token> | undefined | any): Set<Token>;
export declare function MQfromUuidSync(uuid: string | undefined | null): any;
export declare function fromActorUuid(uuid: string | undefined): any;
export declare function actorFromUuid(uuid: string | undefined): any;
export declare function processAttackRollBonusFlags(): Promise<any>;
export declare function processDamageRollBonusFlags(damageRolls: any): Promise<Roll[]>;
export declare function bonusDialog(bonusFlags: any, flagSelector: any, showRoll: any, title: any, roll: Roll, rollType: string, options?: any): Promise<Roll | undefined>;
export declare function getOptionalCountRemainingShortFlag(actor: globalThis.dnd5e.documents.Actor5e, flag: string): any;
export declare function getOptionalCountRemaining(actor: globalThis.dnd5e.documents.Actor5e, flag: string): any;
export declare function removeEffectGranting(actor: globalThis.dnd5e.documents.Actor5e, changeKey: string): Promise<any>;
export declare function hasEffectGranting(actor: globalThis.dnd5e.documents.Actor5e, key: string, selector: string): any;
export declare function isConcentrating(actor: globalThis.dnd5e.documents.Actor5e): undefined | ActiveEffect;
export declare const reactionTypes: {
    reaction: {
        prompt: string;
        triggerLabel: string;
    };
    reactiontargeted: {
        prompt: string;
        triggerLabel: string;
    };
    reactionhit: {
        prompt: string;
        triggerLabel: string;
    };
    reactionmissed: {
        prompt: string;
        triggerLabel: string;
    };
    reactioncritical: {
        prompt: string;
        triggerLabel: string;
    };
    reactionfumble: {
        prompt: string;
        triggerLabel: string;
    };
    reactionheal: {
        prompt: string;
        triggerLabel: string;
    };
    reactiondamage: {
        prompt: string;
        triggerLabel: string;
    };
    reactionpreattack: {
        prompt: string;
        triggerLabel: string;
    };
    reactionattacked: {
        prompt: string;
        triggerLabel: string;
    };
    reactionsave: {
        prompt: string;
        triggerLabel: string;
    };
    reactionsavefail: {
        prompt: string;
        triggerLabel: string;
    };
    reactionsavesuccess: {
        prompt: string;
        triggerLabel: string;
    };
    reactionmoved: {
        prompt: string;
        triggerLabel: string;
    };
};
export declare function reactionPromptFor(triggerType: string): string;
export declare function reactionTriggerLabelFor(triggerType: string): string;
export declare function doReactions(targetRef: Token | TokenDocument | string, triggerTokenUuid: string | undefined, triggeringRoll: Roll, triggerType: string, options?: any): Promise<{
    name: string | undefined;
    uuid: string | undefined;
    ac: number | undefined;
}>;
export declare function requestReactions(target: Token, player: User, triggerTokenUuid: string | undefined, reactionFlavor: string, triggerType: string, reactionActivityList: ReactionItemReference[], resolve: ({}: {}) => void, chatPromptMessage: ChatMessage, options?: any): Promise<void>;
export declare function promptReactions(tokenUuid: string, reactionActivityList: ReactionItemReference[], triggerTokenUuid: string | undefined, reactionFlavor: string, triggerType: string, options?: any): Promise<any>;
export declare function playerFor(target: TokenDocument | Token | undefined | null): User | null | undefined;
export declare function playerForActor(actor: Actor | undefined | null): User | undefined;
export declare function reactionDialog(actor: globalThis.dnd5e.documents.Actor5e, triggerTokenUuid: string | undefined, reactionActivities: any[], rollFlavor: string, triggerType: string, options?: any): Promise<unknown>;
export declare function reportMidiCriticalFlags(): void;
/**
 *
 * @param actor the actor to check
 * @param itemRef the item to check. An item, an item uuid or an item name.
 * @returns the concentration effect if present and null otherwise
 */
export declare function getConcentrationEffect(actor: any, itemRef?: Item | string): ActiveEffect | undefined;
export declare function evalReactionActivationCondition(workflow: any, condition: string | undefined | boolean, target: Token | TokenDocument, options?: any): boolean;
export declare function evalActivationCondition(workflow: any, condition: string | undefined | boolean, target: Token | TokenDocument, options?: any): boolean;
export declare function typeOrRace(entity: Token | Actor | TokenDocument | string): string;
export declare function raceOrType(entity: Token | Actor | TokenDocument | string): string;
export declare function createConditionData(data: {
    workflow?: any;
    target?: Token | TokenDocument | Actor | string | undefined;
    actor?: Actor | undefined | null;
    item?: Item | string | undefined;
    extraData?: any;
    activity?: any;
    tokenUuid?: string | undefined;
    options?: any | undefined;
}): any;
export declare function evalAllConditionsAsync(actorRef: Token | TokenDocument | Actor | string, flag: string, conditionData: any, errorReturn?: any): Promise<any>;
export declare function evalAllConditions(actorRef: Token | TokenDocument | Actor | string, flag: string, conditionData: any, errorReturn?: any): any;
export declare function evalCondition(condition: string, conditionData: any, options?: any): any | Promise<any>;
export declare function computeTemplateShapeDistance(templateDocument: MeasuredTemplateDocument): {
    shape: string;
    distance: number;
};
export declare function notificationNotify(wrapped: any, ...args: any[]): any;
export declare function enableNotifications(enable: boolean): void;
export declare function getStatusName(statusId: string | undefined): string;
export declare function getWoundedStatus(): any | undefined;
export declare function getUnconsciousStatus(): any | undefined;
export declare function getDeadStatus(): any | undefined;
export declare function ConvenientEffectsHasEffect(effectName: string, actor: Actor, ignoreInactive?: boolean): Promise<boolean>;
export declare function isInCombat(actor: Actor): boolean;
export declare function setActionUsed(actor: Actor): Promise<void>;
export declare function setReactionUsed(actor: Actor, active?: boolean): Promise<void>;
export declare function setBonusActionUsed(actor: Actor): Promise<void>;
export declare function removeActionUsed(actor: Actor): Promise<any>;
export declare function removeReactionUsed(actor: Actor, force?: boolean): Promise<void>;
export declare function hasUsedAction(actor: Actor): never;
export declare function hasUsedReaction(actor: Actor): never;
export declare function expirePerTurnBonusActions(combat: Combat, data: any, options: any): Promise<void>;
export declare function hasUsedBonusAction(actor: Actor): never;
export declare function removeBonusActionUsed(actor: Actor, force?: boolean): Promise<void>;
export declare function needsReactionCheck(actor: any): boolean;
export declare function needsAOOCheck(actor: any): boolean;
export declare function needsBonusActionCheck(actor: any): boolean;
export declare function asyncHooksCallAll(hook: any, ...args: any[]): Promise<boolean | undefined>;
export declare function asyncHooksCall(hook: any, ...args: any[]): Promise<boolean | undefined>;
export declare function addAdvAttribution(roll: Roll, advAttribution: Set<string>): void;
export declare function midiRenderRoll(roll: any): Promise<any>;
export declare function midiRenderAttackRoll(roll: any, options?: any): Promise<string>;
export declare function midiRenderDamageRoll(roll: any, options?: any): Promise<string>;
export declare function midiRenderOtherDamageRoll(roll: any, options?: any): Promise<string>;
export declare function midiRenderBonusDamageRoll(roll: any, options?: any): Promise<string>;
export declare function midiRenderTemplateRoll(roll: Roll | undefined, template: string, options?: any): Promise<string>;
export declare function heightIntersects(targetDocument: any, flankerDocument: any): boolean;
export declare function findPotentialFlankers(target: any): Token[];
export declare function computeFlankedStatus(target: any): Promise<boolean>;
export declare function computeFlankingStatus(token: any, target: any): boolean;
export declare function getFlankingEffect(): ActiveEffect | undefined;
export declare function getFlankedEffect(): ActiveEffect | undefined;
export declare function getReactionEffect(): ActiveEffect | undefined;
export declare function getBonusActionEffect(): ActiveEffect;
export declare function getIncapacitatedStatusEffect(): CONFIG.StatusEffect | undefined;
export declare function markFlanking(token: any, target: any): Promise<boolean>;
export declare function chackFlanking(user: User, target: Token, targeted: boolean): Promise<boolean>;
export declare function getChanges(actorOrItem: any, key: string): any;
/**
 *
 * @param token
 * @param target
 *
 * @returns {boolean}
 */
export declare function canSense(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, validModes?: Array<string>): boolean;
export declare function canSenseModes(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, validModes?: Array<string>): Array<string>;
export declare function initializeVision(tk: Token, force?: boolean): boolean;
export declare function _canSenseModes(tokenEntity: Token | TokenDocument, targetEntity: Token | TokenDocument, validModesParam?: Array<string>): Array<string>;
export declare function tokensForActor(actorRef: Actor | string | undefined | null): Token[] | undefined;
export declare function tokenForActor(actor: Actor | string | undefined | null): Token | undefined;
export declare function doConcentrationCheck(actor: any, saveDC: any): Promise<any>;
export declare function hasDAE(workflow: Workflow): any;
export declare function procActorSaveBonus(actor: Actor, rollType: string, item: Item): number;
export declare function displayDSNForRoll(rolls: Roll | Roll[] | undefined, rollType: string | undefined, defaultRollMode?: string | undefined): Promise<void>;
export declare function DSNMarkDiceDisplayed(rolls: Roll | Roll[]): void;
export declare function isReactionItem(item: any): boolean;
export declare function getCriticalDamage(): string;
export declare function isValidTarget(target: any): boolean;
export declare function validRollAbility(rollType: string, ability: string): string | undefined;
export declare function contestedRoll(data: {
    source: {
        rollType: string;
        ability: string;
        token: Token | TokenDocument | string;
        rollOptions: any;
    };
    target: {
        rollType: string;
        ability: string;
        token: Token | TokenDocument | string;
        rollOptions: any;
    };
    displayResults: boolean;
    itemCardUuid: string;
    flavor: string;
    rollOptions: any;
    success: (results: any) => {};
    failure: (results: any) => {};
    drawn: (results: any) => {};
}): Promise<{
    result: number | undefined;
    rolls: any[];
}>;
export declare function hasWallBlockingCondition(target: any): boolean;
export declare function getActor(actorRef: Actor | Token | TokenDocument | string | null | undefined): Actor | undefined | null;
export declare function getTokenDocument(tokenRef: Actor | Token | TokenDocument | string | undefined | null): TokenDocument | undefined;
export declare function getToken(tokenRef: Actor | Token | TokenDocument | string | undefined | null): Token | undefined;
export declare function getPlaceable(tokenRef: Actor | Token | TokenDocument | string | foundry.canvas.placeables.PlaceableObject | undefined): foundry.canvas.placeables.PlaceableObject | undefined | null;
export declare function calcTokenCover(attacker: Token | TokenDocument, target: Token | TokenDocument): number;
export declare function itemRequiresConcentration(item: any): boolean;
export declare function getLinkText(entity: Token | TokenDocument | Actor | Item | null | undefined): string;
export declare function getTokenName(entity: Token | TokenDocument | undefined | null): string;
export declare function getTokenNameExact(entity: Token | undefined): string | undefined;
export declare function getIconFreeLink(entity: Token | TokenDocument | Item | Actor | null | undefined): string;
export declare function midiMeasureDistances(segments: {
    ray: Ray;
}[], options?: any): any[] | 0 | undefined;
export declare function getActivityAutoTargetAction(activity: any): string;
export declare function getAoETargetType(activity: any): string;
export declare function getAutoTarget(item: Item): string;
export declare function hasAutoPlaceTemplate(item: any): any;
export declare function activityHasAutoPlaceTemplate(activity: any): any;
export declare function activityHasEmanationNoTemplate(activity: any): any;
export declare function itemOtherFormula(item: any): string;
export declare function addRollTo(roll: Roll, bonusRoll: Roll): Roll;
export declare function chooseEffect({ speaker, actor, token, character, item, args, scope, workflow, options }: {
    speaker: any;
    actor: any;
    token: any;
    character: any;
    item: any;
    args: any;
    scope: any;
    workflow: any;
    options: any;
}): Promise<unknown>;
export declare function canSee(tokenEntity: any, targetEntity: any): boolean;
export declare function sumRolls(rolls?: Array<Roll> | undefined, countHealing?: "ignore" | "negative" | "positive" | "negativeIgnoreTemp" | "positiveIgnoreTemp"): number;
export declare const updatesCache: {};
export declare function _updateAction(document: any): Promise<any>;
export declare function debouncedUpdate(document: any, updates: any, immediate?: boolean): Promise<any>;
export declare function getUpdatesCache(uuid: string | undefined | null): any;
export declare function addUpdatesCacheFlags(uuid: string | undefined | null, updates: any): void;
export declare function addUpdatesCache(uuid: string | undefined | null, updates: any): void;
export declare function clearUpdatesCache(uuid: string | undefined | null): void;
export declare function getCachedDocument(uuid: string | undefined | null): any;
export declare function isEffectExpired(effect: any): boolean;
export declare function expireEffects(actor: any, effects: ActiveEffect[], options: any): Promise<any>;
export declare function blankOrUndefinedDamageType(s: string | undefined): string;
export declare function processConcentrationRequestMessage(message: any, html: any, data: any): void;
export declare function setRollOperatorEvaluated(roll: any): any;
export declare function doSyncRoll(roll: any, source: string | undefined): any;
export declare function setRollMinDiceTerm(roll: Roll, minValue: number, count?: number): Roll<import("fvtt-types/utils").EmptyObject>;
export declare function setRollMaxDiceTerm(roll: Roll, maxValue: number, count?: number): Roll<import("fvtt-types/utils").EmptyObject>;
export declare function addDependent(document: Document, dependent: Document): Promise<any> | undefined;
export declare function addConcentrationDependent(actorRef: Token | TokenDocument | Actor | string, dependent: any, item?: Item): Promise<any>;
export declare function getAppliedEffects(actor: any, { includeEnchantments }: {
    includeEnchantments: any;
}): any;
export declare function getCEEffectByName(name: string): any | undefined;
export declare function CEAddEffectWith(options: {
    uuid: string;
    effectName?: string;
    effectId?: string;
    origin?: any;
    effectData?: any;
    overlay: boolean;
}): Promise<any>;
export declare function CERemoveEffect(options: {
    effectName: string;
    uuid: string;
    effectId?: string;
    origin?: string;
}): Promise<any>;
export declare function CEToggleEffect(options: {
    effectName?: string;
    uuid: string;
    effectId?: string;
    origin?: string;
    overlay?: boolean;
}): Promise<any>;
export declare function CEHasEffectApplied(options: {
    effectName: string;
    uuid: string;
    effectId?: string;
    origin?: string;
}): boolean;
export declare function isConvenientEffect(effect: any): boolean;
export declare function getActivityDefaultDamageType(workflow: Workflow): string;
export declare function getDefaultDamageType(item: any): any;
export declare function activityHasAreaTarget(activity: any): boolean;
export declare function getSaveRollModeFor(abilityId: any): "gmroll" | "blindroll" | "public";
export declare function getCheckRollModeFor(abilityId: any): "gmroll" | "blindroll" | "public";
export declare function areMidiKeysPressed(event: any, action: any): boolean | undefined;
export declare function setRangedTargets(tokenToUse: any, targetDetails: any): boolean;
export declare function updateUserTargets(targetIds: string[]): void;
export declare function cleanCPRFlanked(): Promise<void>;
