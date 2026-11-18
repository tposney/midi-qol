import { type StepContext } from "./steps/steps.js";
import { type AssembledSteps, type StepChangeInput } from "./steps/assembly.js";
import type { PortName, WorkflowPorts } from "./steps/ports.js";
import { TeleportOption } from "./activities/TeleportActivity.js";
import { TokenDocumentSet } from "./lib/tokenDocumentSet.js";
import { type WaitChoiceSpec } from "./lib/playerWaits.js";
import { type ReactionResult, getOrCreateTokenForActor, type SaveRequestKind } from "./utils.js";
import { OnUseMacros } from "./apps/Item.js";
import { type RollBonusQuery } from "./services/rollBonuses/service.js";
import { type MidiCardSection, type SectionName } from "./ChatClasses/UsageCardMessage.js";
import { Activity, ActivitySave, ActivityCheck, DamageDescription, DamageListEntry, TokenOrDocument, DND5ETargetDescriptor, CombinedTargetDescriptor, QueueSaveRollOptions, SaveDetails, ProcessTargetSaveContext, ModuleIntegrationFlags, ModuleIntegrationRequests, MonksTokenBarRequest, FlashRollsRequest, EpicRollsRequest, RollProcessConfig, RollDialogConfig } from "../globals.js";
import { AnyMutableObject, AnyObject, EmptyObject, InexactPartial } from "fvtt-types/utils";
import Token = foundry.canvas.placeables.Token;
import { DamageRules, mergeDamageRules } from "./lib/damageRules.js";
import { RollModifierTracker } from "./lib/RollModifierTracker.js";
export declare const shiftOnlyEvent: {
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    type: string;
};
/** Sentinel value for attackTotal before any attack roll has been made. */
export declare const minAttackTotal = -100;
export type AttributionType = 'ADV' | 'DIS' | 'NOADV' | 'NODIS' | 'CRIT' | 'NOCRIT' | 'FUMBLE' | 'NOFUMBLE';
export type AttributionMap = Partial<Record<AttributionType, Record<string, string>>>;
export interface AttributionEntry {
    type: AttributionType;
    /** Source identifier (e.g., "invisible", "flanking", "magicResistance") */
    source: string;
    /** Human-readable display name for tooltips */
    displayName: string;
}
export interface DamageDescriptionObject extends Omit<DamageDescription, 'properties'> {
    properties: string[];
}
export declare function damageDetailToObject(damageDetail?: DamageDescription[]): DamageDescriptionObject[];
type DamageBonusMacroSingleResult = {
    damageRoll?: string;
    flavor?: string;
    damageType?: string;
};
type DamageBonusMacroResult = DamageBonusMacroSingleResult[] | DamageBonusMacroSingleResult;
export type WorkflowState = undefined | (() => Promise<WorkflowState>);
/** What a suspended workflow is woken by (Workflow#resume) */
export type WorkflowEvent = "attackRolled" | "damageRolled" | "noDamage" | "utilityRolled";
export type WorkflowOutcome = "ok" | "allMissed" | "invalid" | "split" | "manualSaves" | "cancelled" | "aborted";
/**
 * The workflow's stored fields: kept in memory, written to its card (lib/cardState.ts) through the card's update cache.
 * The card is read only when the workflow is rebuilt from it (load). Writing undefined forgets the value.
 */
/** `value` with only what survives JSON (primitives, arrays and plain objects of them); undefined if nothing does */
/** Plain data only (primitives, arrays of them, plain objects): class instances (an Event, a module's session object) are left out */
export declare function jsonSafe(value: unknown): unknown;
/** A reason shown on the attack roll: a bonus part (value) or the source of advantage. */
/** A reason the attack roll shows: flanking, a target-granted bonus, or a roll bonus added to the formula (rollBonuses preRoll) */
export interface AttackModifier {
    kind: "flanking" | "flanked" | "granted" | "bonus";
    label: string;
    value?: string;
    advantage?: boolean;
}
export declare class Workflow {
    #private;
    static get forceCreate(): boolean;
    /** The workflows in memory, by id: a new Map on each read (one that has been collected is rebuilt by getWorkflow) */
    static get workflows(): Map<string, Workflow>;
    /** Whether a workflow is filed weakly (finished, or Use Weak References), for tests */
    static heldWeakly(id: string): boolean;
    static clearWorkflows(): void;
    static addWorkflow(workflow: Workflow): void;
    static setUse(activity: Activity, workflow: Workflow): void;
    /**
     * The workflow of the use `activity` belongs to: the activity a use's hooks and macros are given (midi's or dnd5e's
     * copy for that use). For a use before its card exists, on the client running it; after that, getWorkflow(cardUuid).
     */
    static workflowFor(activity: Activity | undefined | null): Workflow | undefined;
    /** The use a template of `activity` is placed for: its workflow's id (its card's uuid) and card */
    static templateWorkflowFlags(activity: Activity): {
        workflowId?: string;
        itemCardUuid?: string;
    };
    /** The item's workflow that is executing now (a macro inside its use), the most recently filed if several */
    static runningFor(item: Item.Implementation): Workflow | undefined;
    /**
     * The usage card of the actor's workflow that is executing now, if any: an item use started from inside it (a macro
     * spending a resource item, a triggered activity) belongs to that card. The most recently added one wins.
     */
    static executingCardFor(actor: Actor.Implementation): ChatMessage.Implementation | undefined;
    /**
     * Delete an aborted workflow's card. Usage cards of other workflows linked to it (a nested use that is the real
     * result, e.g. CPR's grapple handing off to CAT) are moved to the card's own origin first, so they survive the
     * linked-card cascade.
     */
    static deleteAbortedCard(card: ChatMessage.Implementation | undefined): Promise<void>;
    /** Count the workflow as executing while `fn` runs: a roll from a card button happens outside performState. */
    whileExecuting<T>(fn: () => Promise<T>): Promise<T>;
    static dropReadOnlyCopy(id: string | null): void;
    /**
     * The workflow of a card: the one in memory, for any user. Otherwise for the card's author the live workflow rebuilt
     * from the card; for another user a read-only copy rebuilt from the card: it does not run or write, and is never
     * updated: when the card changes it is discarded, and the next call builds a new one. With `readOnly` false another
     * user gets a live rebuild, which runs and writes the card alongside the author's (warned). A use before its card
     * exists: Workflow.workflowFor(activity).
     */
    static getWorkflow(id?: string | null, readOnly?: boolean): Workflow | undefined;
    /** A card's workflow to read: the one in memory, else a read-only copy (whoever the author, ended or not) */
    static cardView(id: string): Workflow | undefined;
    /**
     * The workflow a card's damage button rolls for: the one in memory, else for a completed use a read-only copy (its
     * re-roll reads it). False while that workflow is running, after saying so.
     */
    static forDamageButton(message: ChatMessage.Implementation | undefined): Workflow | undefined | false;
    /**
     * Damage rolled again for a completed use, as dnd5e rolls another damage message: a damage-only workflow on its own
     * card, with the use's targets, hits and saves, and its own undo; the use and its card are left as they are.
     */
    static rerollDamage(first: Workflow, activity: Activity, config: Record<string, any>, dialog: Record<string, any>, message: Record<string, any>): Promise<void | Roll<EmptyObject>[]>;
    /** midi's own lookup: the workflow in memory, or rebuilt from its card for the card's author; never a read-only copy */
    static findWorkflow(id?: string | null): Workflow | undefined;
    /** @deprecated workflows are not found by activity uuid: Workflow.workflowFor(activity) during a use, getWorkflow(cardUuid) after */
    static getWorkflowByActivityUuid(_activityUuid?: string): Workflow | undefined;
    static deleteWorkflow(id: string | null): void;
    /**
     * The workflow of a card, rebuilt from it after a reload. Only for the card's author, whose client ran the workflow
     * (elsewhere it would be a second copy of one still running), unless `readOnly` (a copy that does not run or write) or
     * `anyAuthor` (a live second copy: getWorkflow warns). Never one removed this session. Only workflow classes built like
     * Workflow itself.
     */
    static fromChatCardUuid(chatCardUuid: string, options?: {
        readOnly?: boolean;
        anyAuthor?: boolean;
    }): Workflow | undefined;
    performThrottledUpdate(chatCard: ChatMessage.Implementation, updates: ChatMessage.UpdateData): Promise<void | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.Any | ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note">>;
    flushCardWrites(displayOnly?: boolean): Promise<void>;
    /** Write one section of the card (system.midi.sections), with the workflow's rolls */
    setCardSection(name: SectionName, section: MidiCardSection, extraUpdates?: Record<string, unknown>): Promise<void>;
    get itemCardUuid(): string | undefined;
    set itemCardUuid(uuid: string | null | undefined);
    /** A copy of another user's workflow (getWorkflow): it does not run or write the card */
    readOnly: boolean;
    /** A workflow keeps its state on its own card, the one it is registered under; never on another workflow's card */
    get ownsCard(): boolean;
    get useActiveDefence(): boolean;
    get actor(): Actor.Implementation;
    /** @deprecated (M2): the same flag as `aborted`; the two used to be separate and read in different places */
    get abort(): boolean;
    set abort(value: boolean | undefined);
    itemUseComplete: boolean | undefined;
    token: Token.Implementation | undefined;
    get workflowOptions(): WorkflowOptions;
    set workflowOptions(workflowOptions: WorkflowOptions);
    get needItemCard(): boolean;
    get activity(): Activity;
    set activity(activity: Activity);
    /**
     * The activity a card button runs for this use. A button runs the activity dnd5e finds from the card, the original:
     * when it is the workflow's own activity (same uuid), the workflow's copy is kept and run (a macro's modified copy
     * stays the use's); another activity becomes the workflow's.
     */
    activityFor<T extends Activity>(activity: T): T;
    get item(): Item.Implementation;
    set item(item: Item.Implementation);
    get speaker(): ChatMessage.SpeakerData;
    set speaker(speaker: ChatMessage.SpeakerData);
    get attackingToken(): Token | undefined;
    get attackingTokenDocument(): TokenDocument.Implementation | undefined;
    get tokenUuid(): string | null | undefined;
    /** The using token's TokenDocument: what the workflow's token sets hold (workflow.token stays the placeable) */
    get tokenDocument(): TokenDocument.Implementation | undefined;
    get targets(): TokenDocumentSet;
    set targets(targets: Set<TokenOrDocument>);
    targetsCanSee: Set<Token.Implementation>;
    targetsCanSense: Set<Token.Implementation>;
    tokenCanSee: Set<Token.Implementation>;
    tokenCanSense: Set<Token.Implementation>;
    /** The use's templates (regions): replace the array to change it, a change in place isn't stored */
    get templateUuids(): string[];
    set templateUuids(templateUuids: string[]);
    expectedTemplateCount: number;
    placedTemplateCount: number;
    get templateUuid(): string;
    set templateUuid(templateUuid: string);
    get template(): MeasuredTemplateDocument.Implementation | RegionDocument.Implementation | undefined;
    set template(template: MeasuredTemplateDocument.Implementation | RegionDocument.Implementation | undefined);
    get templateId(): string | undefined;
    /** When the use started, the actor was a combatant (of any combat) */
    get inCombat(): boolean;
    set inCombat(inCombat: boolean);
    /** When the use started, it was the actor's turn in a started combat */
    get isTurn(): boolean;
    set isTurn(isTurn: boolean);
    AoO: boolean;
    damageList: DamageListEntry[];
    saveDisplayFlavor: string | undefined;
    get id(): string | undefined;
    set id(id: string | null | undefined);
    get uuid(): string;
    suspended: boolean;
    get currentStep(): string | undefined;
    /** The current step's method: compatible with comparing against `workflow.WorkflowState_<name>` */
    get currentAction(): WorkflowState;
    set currentAction(currentAction: WorkflowState | string);
    /** A step's id from a step id or a workflow state method (`this.WorkflowState_<name>`, as callers pass it) */
    static stepIdOf(state: WorkflowState | string | undefined): string | undefined;
    /** The method that runs a step on this workflow (its class's override, if it has one) */
    methodForStep(id: string | undefined): WorkflowState;
    /** The flow this workflow follows (steps/flows.ts) */
    get flowId(): string;
    static flowId: string;
    /** How waits are carried out (steps/ports.ts): midi's own code, which a module may replace */
    static defaultPorts: WorkflowPorts;
    /** This use's ports: the defaults with any set for this use */
    get ports(): WorkflowPorts;
    /** Carry out one kind of wait differently for this use */
    setPort<K extends PortName>(name: K, port: WorkflowPorts[K] | undefined): void;
    /**
     * The state a workflow rebuilt from `card` waits in, worked out from the card: what has been placed, rolled and
     * confirmed. Undefined for a card with no workflow.
     */
    static cardResumePoint(card: ChatMessage.Implementation | undefined): string | undefined;
    get isCritical(): boolean;
    set isCritical(isCritical: boolean);
    get isFumble(): boolean;
    set isFumble(isFumble: boolean);
    /** Whether the attack hit: a target hit, or with hits not checked the attack roll's own result */
    get isHit(): boolean;
    /** Whether the attack was a glancing blow on a target (Challenge Mode Armor: at least its EC, not above its AC) */
    get isHitEC(): boolean;
    /** A damage-only workflow's damage is its other damage (shown and stored as other damage), not its main damage */
    useOther: boolean;
    /** A damage roll on its own (rerollDamage, DamageOnlyWorkflow): targets, hits and saves given; no effects or use-level passes */
    get damageOnly(): boolean;
    set damageOnly(damageOnly: boolean);
    /** dnd5e 6.1's attacker ignore/downgrade rules from the use's damage rolls, applied to every target's damage */
    get damageRules(): DamageRules | undefined;
    /** Add a damage roll's rules (`rollConfig.applicationOptions`) to the use's */
    addDamageRules(applicationOptions: Parameters<typeof mergeDamageRules>[0]): void;
    /** The use's damage is rolled anew: its rules are that roll's, not an earlier roll's as well */
    clearDamageRules(): void;
    /**
     * @deprecated Use workflow.attackRollModifierTracker.critical.isForced instead
     */
    get critFlagSet(): boolean;
    /**
     * @deprecated Use workflow.attackRollModifierTracker.critical.isSuppressed instead
     */
    get noCritFlagSet(): boolean;
    d20AttackRoll: number;
    get hitTargets(): TokenDocumentSet;
    set hitTargets(hitTargets: Set<TokenOrDocument> | undefined);
    get hitTargetsEC(): TokenDocumentSet;
    set hitTargetsEC(hitTargetsEC: Set<TokenOrDocument> | undefined);
    get otherDamageMatches(): TokenDocumentSet | undefined;
    set otherDamageMatches(matches: Set<TokenOrDocument> | undefined);
    get ammunitionDamageMatches(): TokenDocumentSet | undefined;
    set ammunitionDamageMatches(matches: Set<TokenOrDocument> | undefined);
    /**
     * What a successful save does to each kind of damage, before Super Saver (applySaves adds that per damage entry).
     * One save is rolled per use: the other activity's and the ammunition's damage follow it only when it is their
     * own, else take it in full; with neither having it, other damage follows the activity's save as before.
     */
    damageSaveMultipliers(): {
        defaultDamage: number;
        bonusDamage: number;
        otherDamage: number;
        ammunition: number;
    };
    /**
     * A target's other damage: the other activity's where its condition matched the target, the ammunition's where the
     * ammunition's did, each with its own save multiplier.
     */
    otherDamageFor(token: TokenOrDocument): DamageDescription[];
    /** Drop the other activity's damage (its use was declined), keeping the ammunition's. */
    dropOtherActivityDamage(): void;
    get attackRoll(): Roll | undefined;
    set attackRoll(attackRoll: Roll | undefined);
    diceRoll: number;
    attackTotal: number;
    get attackRollCount(): number;
    set attackRollCount(attackRollCount: number);
    get attackRollModifierTracker(): RollModifierTracker;
    /** Alias for attackRollModifierTracker */
    get tracker(): RollModifierTracker;
    get advantage(): boolean | undefined;
    /**
     * Backward compatibility setter for advantage.
     * - `true`: adds one source of advantage
     * - `false`: clears all advantage sources (preserves suppression)
     * - `undefined`: resets the entire advantage mode state
     */
    set advantage(value: boolean | undefined);
    /**
     * Backward compatibility getter for disadvantage.
     * Returns true if there's effective disadvantage, false if suppressed, undefined if no sources.
     */
    get disadvantage(): boolean | undefined;
    /**
     * Backward compatibility setter for disadvantage.
     * - `true`: adds one source of disadvantage
     * - `false`: clears all disadvantage sources (preserves suppression)
     * - `undefined`: resets the entire advantage mode state
     */
    set disadvantage(value: boolean | undefined);
    get noAdvantage(): boolean;
    set noAdvantage(value: boolean | undefined);
    get noDisadvantage(): boolean;
    set noDisadvantage(value: boolean | undefined);
    get targetDescriptors(): Array<CombinedTargetDescriptor> | undefined;
    set targetDescriptors(targetDescriptors: Array<DND5ETargetDescriptor>);
    noAutoAttack: boolean | undefined;
    hitDisplayData: Record<string, {
        ac?: number;
        acClass: string;
        acDisplay?: string;
        acTooltip?: string;
        actorUuid?: string | null;
        attackBonus?: number;
        attackTotal?: number;
        attackType?: string;
        baseAc?: number;
        acIcons?: Array<{
            img?: string;
            icon?: string;
            tooltip?: string;
            cssClass: string;
            useDnd5eIcon?: boolean;
        }>;
        gmName: string;
        hitClass: string;
        hitResultNumeric?: string;
        hitString?: string;
        hitStyle?: string;
        hitSymbol?: string;
        img: string;
        isHit: boolean;
        targetClass: string;
        showAC: boolean;
        target: TokenOrDocument;
        uuid: string;
    }> | undefined;
    saveDisplayData: {
        gmName: string;
        img: string;
        targetClass: string;
        target: TokenOrDocument;
        saveSymbol: string;
        saveTotalClass: string;
        saveToolTipClass?: string;
        rollTotal: string;
        rollDetail: string;
        rollHTML: string;
        id: string;
        adv?: boolean;
        modifierTracker?: RollModifierTracker;
        attributionTooltip?: string;
        hasAttribution?: boolean;
        coverLabel?: string;
        saveTooltip?: string;
        saveClass: string;
    }[] | undefined;
    get utilityRoll(): Roll | undefined;
    set utilityRoll(roll: Roll | undefined);
    get damageRoll(): Roll | undefined;
    set damageRoll(roll: Roll | undefined);
    set bonusDamageRoll(roll: Roll | undefined);
    get bonusDamageRoll(): Roll | undefined;
    get otherDamageRoll(): Roll | undefined;
    set otherDamageRoll(roll: Roll | undefined);
    get otherActivity(): Activity | null | undefined;
    /**
     * The other activity if there is one, otherwise the ammunition's. Used where the question is
     * "does the extra activity have a save/check", which decides how otherEffectTargets is derived —
     * ammunition effects share that collection, so its save must count when the item has no other
     * activity of its own.
     */
    get otherActivityOrAmmunition(): any;
    /**
     * Check if an activity has a valid save configuration (save with abilities, or check with ability/associated)
     */
    protected hasValidSaveOrCheck(activity: Activity | null | undefined): boolean;
    get activityHasSave(): boolean;
    get saveActivity(): Activity | undefined;
    /** The save behind the other damage: the item's own other activity's, else the ammunition's. */
    get otherSaveActivity(): Activity | undefined;
    get saveActivityDetails(): ActivitySave | ActivityCheck | undefined;
    get saveItem(): Item<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>;
    /** The card's rolls */
    get rolls(): Roll[];
    get damageRolls(): Roll[];
    set damageRolls(damageRolls: Roll[]);
    get bonusDamageRolls(): Roll[] | undefined;
    set bonusDamageRolls(bonusDamageRolls: Roll[] | undefined);
    get otherDamageRolls(): Roll[] | undefined;
    set otherDamageRolls(otherDamageRolls: Roll[] | undefined);
    get utilityRolls(): Roll[];
    set utilityRolls(utilityRolls: Roll[] | undefined);
    damageTotal: number;
    rawDamageDetail: DamageDescription[];
    rawOtherDamageDetail: DamageDescription[];
    rawBonusDamageDetail: DamageDescription[];
    damageDetail: DamageDescription[];
    otherDamageDetail: DamageDescription[];
    bonusDamageDetail: DamageDescription[];
    get damageRollCount(): number;
    set damageRollCount(damageRollCount: number);
    defaultDamageType: string;
    effectsAlreadyExpired: string[];
    /** @deprecated since 14.6.9: has no effect (use workflowOptions.autoRollDamage, or return false from preDamageRollConfig) */
    get noAutoDamage(): undefined;
    set noAutoDamage(_value: boolean | undefined);
    /**
     * Set when MidiActivityMixin suppressed dnd5e's concentration so it can be started after the
     * workflow's checks pass. Carries what Activity#use would have used. Cleared once begun.
     */
    get deferredConcentration(): {
        scaling?: number;
        end?: string;
    } | undefined;
    set deferredConcentration(deferred: {
        scaling?: number;
        end?: string;
    } | undefined);
    get saves(): TokenDocumentSet;
    set saves(saves: Set<TokenOrDocument> | undefined);
    get superSavers(): TokenDocumentSet;
    set superSavers(superSavers: Set<TokenOrDocument> | undefined);
    get semiSuperSavers(): TokenDocumentSet;
    set semiSuperSavers(semiSuperSavers: Set<TokenOrDocument> | undefined);
    get failedSaves(): TokenDocumentSet;
    set failedSaves(failedSaves: Set<TokenOrDocument> | undefined);
    get fumbleSaves(): TokenDocumentSet;
    set fumbleSaves(fumbleSaves: Set<TokenOrDocument> | undefined);
    get criticalSaves(): TokenDocumentSet;
    set criticalSaves(criticalSaves: Set<TokenOrDocument> | undefined);
    get advantageSaves(): TokenDocumentSet;
    set advantageSaves(advantageSaves: Set<TokenOrDocument> | undefined);
    get disadvantageSaves(): TokenDocumentSet;
    set disadvantageSaves(disadvantageSaves: Set<TokenOrDocument> | undefined);
    saveRequests: Record<string, (value: any) => void>;
    /** What each chat-card save request asks for, by its key in saveRequests */
    saveRequestKinds: Record<string, SaveRequestKind>;
    saveTimeouts: Record<string, NodeJS.Timeout>;
    defenceRequests: Record<string, (value: any) => void>;
    defenceTimeouts: Record<string, NodeJS.Timeout>;
    get onUseMacros(): OnUseMacros | undefined;
    set onUseMacros(onUseMacros: OnUseMacros | undefined);
    get ammunitionOnUseMacros(): OnUseMacros | undefined;
    set ammunitionOnUseMacros(ammunitionOnUseMacros: OnUseMacros | undefined);
    get attackAdvAttribution(): Set<string>;
    set attackAdvAttribution(_value: Set<string>);
    get attackAttribution(): AttributionMap;
    /** Why each target's save had advantage or disadvantage, by token uuid */
    get saveAttribution(): Record<string, AttributionMap>;
    set saveAttribution(saveAttribution: Record<string, AttributionMap>);
    addSaveAttribution(targetUuid: string, type: AttributionType, source: string, displayName: string): void;
    get advReminderAttackAdvAttribution(): Set<string>;
    set advReminderAttackAdvAttribution(_value: Set<string>);
    /** @deprecated since 14.6.9: has no effect (optional rules follow the Optional rules setting) */
    get noOptionalRules(): boolean;
    set noOptionalRules(_value: boolean);
    undoData: UndoData | undefined;
    get bonusDamageFlavor(): string;
    get chatCard(): ChatMessage.Implementation;
    get itemCardId(): string | undefined;
    get damageFlavor(): string;
    get itemId(): string;
    get needTemplate(): boolean;
    get itemUuid(): string | undefined;
    get otherDamageFlavor(): string;
    get useCondition(): string;
    get effectActivationCondition(): string;
    get hasSave(): boolean;
    get otherDamageFormula(): string;
    get otherUseCondition(): string | undefined;
    get otherEffectActivationCondition(): string | undefined;
    get shouldRollDamage(): boolean;
    /** The id of the concentration effect this use began, from the usage card. */
    get concentrationId(): string | undefined;
    get spellLevel(): number;
    get workflowType(): string;
    setTargets(targets: Set<TokenOrDocument>): void;
    get saveRolls(): Roll<EmptyObject>[];
    ammunition: Item.Implementation | undefined;
    /** An activity carried by the loaded ammunition. Independent of otherActivity — both can run. */
    ammunitionActivity: any | undefined;
    systemCard: boolean | undefined;
    aborted: boolean;
    workflowName: string | undefined;
    forceApplyEffects: boolean;
    /** How the use ended up, for the stages after it: "ok" unless one of the genuine early exits or every target missed */
    outcome: WorkflowOutcome;
    longRangeAttack: boolean | undefined;
    get preSelectedTargets(): TokenDocumentSet;
    set preSelectedTargets(tokens: Set<TokenOrDocument>);
    postSummonHookId: number | undefined;
    summonedCreatures: TokenDocument.Implementation[] | undefined;
    transformedActorUuids: string[] | undefined;
    /** A teleport activity's moves: dnd5e's TeleportMovementResult list (token, plan, moved). */
    teleportResults: {
        token: Token.Implementation;
        plan: unknown;
        moved: boolean;
    }[] | undefined;
    transformedActors: Actor.Implementation[] | undefined;
    saveResults: Roll[] | undefined;
    stateTransitionCount: number | undefined;
    /** Running performState calls: above 0 while the workflow executes, 0 when it is paused, finished or failed. */
    executingStates: number;
    maxTransitionCount: number;
    selfTargeted: boolean | undefined;
    workflowStartTime: number | undefined;
    /** Targets from an emanation with no template */
    get rangeTargeting(): boolean;
    /** Targets from a template that auto-targets */
    get tempTargetConfirmation(): boolean;
    whisperAttackCard: boolean | undefined;
    get effectTargets(): TokenDocumentSet | undefined;
    set effectTargets(tokens: Set<TokenOrDocument> | undefined);
    otherDamageConfig: RollProcessConfig | undefined;
    otherDamageDialog: RollDialogConfig | undefined;
    activationMatches: TokenDocumentSet | undefined;
    activationFails: TokenDocumentSet | undefined;
    otherActivationMatches: TokenDocumentSet | undefined;
    otherActivationFails: TokenDocumentSet | undefined;
    get otherEffectTargets(): TokenDocumentSet | undefined;
    set otherEffectTargets(tokens: Set<TokenOrDocument> | undefined);
    get effectTargetsOnSave(): TokenDocumentSet | undefined;
    set effectTargetsOnSave(tokens: Set<TokenOrDocument> | undefined);
    get otherEffectTargetsOnSave(): TokenDocumentSet | undefined;
    set otherEffectTargetsOnSave(tokens: Set<TokenOrDocument> | undefined);
    otherDamageTotal: number | undefined;
    bonusDamageTotal: number | undefined;
    needsHitTargetsDisplayed: boolean;
    conditionData: any | undefined;
    flankingAdvantage: boolean | undefined;
    /** A fixed flanking bonus for this single-target melee attack, added to the roll (attackRollParts). */
    flankingRollBonus: {
        bonus: number;
        kind: AttackModifier["kind"];
        label: string;
    } | undefined;
    /** The target whose granted attack bonus is already in the attack roll, so checkHits doesn't add it again. */
    grantedAttackBonusInRollUuid: string | null | undefined;
    /** Flanking that gave this attack advantage, shown on the attack roll ("flanking" or "flanked"). */
    flankingAdvantageKind: AttackModifier["kind"] | undefined;
    macroPass: string | undefined;
    tag: string | undefined;
    activeDefenceDC: number | undefined;
    /** What midi's damage calculation actually applied, per target uuid. Set by `processDamageRoll`. */
    midiTargetDetail: Record<string, Record<string, unknown>> | undefined;
    /** Each target's damage entries, one per damage list (other damage may have its own), by token uuid (processDamageRoll); not stored */
    targetDamage: Record<string, DamageListEntry[]> | undefined;
    targetSaveDetails: Record<string, SaveDetails> | undefined;
    get tokenSaves(): Record<string, Roll> | undefined;
    /** A target's save roll (a Token, TokenDocument or token uuid); undefined until it has rolled */
    saveRoll(token: TokenOrDocument | string): Roll | undefined;
    saveDC: number | undefined;
    saveDetails: SaveDetails | undefined;
    damageItem: DamageListEntry | undefined;
    challengeModeScale: Record<string, number> | undefined;
    activeDefenceRolls: Record<string, Roll> | undefined;
    flavor: string | undefined;
    attackMode: string | undefined;
    itemUsesReaction: boolean | undefined;
    itemUsesBonusAction: boolean | undefined;
    rangeDetails: {
        result: string;
        attackingToken?: Token.Implementation;
        range?: number;
        longRange?: number;
    } | undefined;
    sequenceId?: string;
    targetACModifiers: Map<string, number>;
    rollOptions: WorkflowRollOptions;
    castData: {
        castLevel?: number;
    } | undefined;
    constructor(actor: Actor.Implementation | null, activity: Activity | null, speaker: ChatMessage.SpeakerData | null, targets: Set<TokenOrDocument> | TokenOrDocument[] | null, options?: WorkflowConstructorOptions);
    someEventKeySet(): boolean | undefined;
    someAutoRollEventKeySet(): boolean | undefined;
    static removeItemCardConfirmRollButton(itemCardUuid: string): Promise<void | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.Any | ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note">>;
    static removeItemCardButtons(itemCardUuid: string | null | undefined, { removeAllButtons, removeConfirmButtons, removeAllDnd5eButtons, removeDnd5eSaveButtons, finished }?: {
        removeAllButtons?: boolean | undefined;
        removeConfirmButtons?: boolean | undefined;
        removeAllDnd5eButtons?: boolean | undefined;
        removeDnd5eSaveButtons?: boolean | undefined;
        finished?: boolean | undefined;
    }): Promise<void | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.Any | ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note">>;
    static removeWorkflow(id: string | undefined): Promise<void>;
    static get stateTable(): Record<string, WorkflowState>;
    /**
     * The pre/post hooks and onUse passes of midi's engine-run steps (steps/steps.ts), as the item sheet lists them; not
     * the inline reaction steps, which fire none
     */
    static get stateHooks(): Record<string, string>;
    static get allHooks(): Record<string, string>;
    static get allMacroPasses(): Record<string, string>;
    callHooksForAction(prePost: ("pre" | "post"), action: WorkflowState | string): Promise<boolean | undefined>;
    callOnUseMacrosForAction(prePost: ("pre" | "post"), action: WorkflowState | string): Promise<(DamageBonusMacroResult | any)[]>;
    static nameForState(state: WorkflowState | string): string;
    nameForState(state: WorkflowState | string): string;
    /** Wake a suspended workflow; without an event it re-runs the state it waits in */
    resume(event?: WorkflowEvent): Promise<void | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.Any | ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note">>;
    /** A step is awaiting a roll it started (M2 stage 5): the roll's resume is the step's answer */
    get inStepRoll(): boolean;
    /**
     * Start a roll and wait for it inside the step (an auto roll). The roll's resume(event) answers the step instead of
     * resuming the workflow; the step goes on to `stateAfter(event)`, or waits (Suspend) when the roll was cancelled.
     */
    /** @internal */
    rollInStep(roll: () => unknown): Promise<WorkflowState>;
    /** Where a suspended workflow goes when `event` arrives: by the state it waits in, else that state again */
    stateAfter(event: WorkflowEvent): WorkflowState;
    /** @deprecated since 14.6.9: use resume(event) */
    unSuspend(context?: WorkflowContext): Promise<void | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.Any | ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note">>;
    processPlacedTemplates(templates: MeasuredTemplateDocument[], activity?: Activity): Promise<boolean>;
    selectAllTemplateTargets(activity?: Activity): void;
    setupTemplateCleanup(templateDocument: MeasuredTemplateDocument | RegionDocument.Implementation): Promise<boolean>;
    renderAttributionTooltip(): Promise<string>;
    /**
     * Run the workflow from `newState` (a step id or a state method) until it suspends or ends. On each move to a new
     * step: the old step's post pass and hook, then the new step's pre pass and hook (either can cancel or abort).
     */
    performState(newState: WorkflowState | string): Promise<void>;
    /**
     * This use's changes to its flow (steps/assembly.ts): the global changes whose `when` applies and its call's
     * (`workflowOptions.steps`), worked out when it first runs a step and stored on the card for a rebuild.
     */
    get assembledSteps(): AssembledSteps;
    /**
     * An inline step (a reaction trigger: steps.ts `inline`): `own` is what it does; the use's changes apply. Inserted
     * steps fire their pre/post hooks and passes; their results are ignored (no branching from here).
     */
    runInlineStep<T>(id: string, own: () => Promise<T>, extra?: Partial<StepContext>): Promise<T | undefined>;
    /** A reaction trigger: the reaction step for `triggerType` (REACTION_STEPS), whose default asks through the askReactions port */
    askReactionsStep(target: TokenOrDocument | string, triggerTokenUuid: string | null | undefined, triggeringRoll: Roll | null | undefined, triggerType: string, options?: any): Promise<ReactionResult>;
    WorkflowState_Suspend(): Promise<WorkflowState>;
    WorkflowState_NoAction(): Promise<WorkflowState>;
    WorkflowState_Start(): Promise<WorkflowState>;
    WorkflowState_AwaitTemplate(): Promise<WorkflowState>;
    WorkflowState_TemplatePlaced(): Promise<WorkflowState>;
    WorkflowState_AoETargetConfirmation(): Promise<WorkflowState>;
    WorkflowState_ValidateRoll(): Promise<WorkflowState>;
    WorkflowState_PreambleComplete(): Promise<WorkflowState>;
    get postAttackRollState(): WorkflowState;
    /**
     * The workflow waits for its player to roll (a card button, or the roll dialog auto-roll opened): let the GM roll for
     * them, with the choices the roll dialog offers. Not for a GM's own use.
     */
    waitOnPlayerRoll(kind: "attack" | "damage" | "utility"): void;
    /** Roll for the player as their roll dialog would: press its button when it is open, else roll without it. */
    rollForPlayer(kind: "attack" | "damage" | "utility", mode: string): Promise<void>;
    WorkflowState_WaitForAttackRoll(): Promise<WorkflowState>;
    WorkflowState_AttackRollComplete(): Promise<WorkflowState>;
    _formatAttackTargets(): {
        name: string;
        img?: string | null;
        uuid: string;
        ac: number | string;
    }[];
    WorkflowState_WaitForDamageRoll(): Promise<WorkflowState>;
    WorkflowState_ConfirmRoll(): Promise<WorkflowState>;
    WorkflowState_RollConfirmed(): Promise<WorkflowState>;
    WorkflowState_DamageRollStarted(): Promise<WorkflowState>;
    WorkflowState_DamageRollComplete(): Promise<WorkflowState>;
    WorkflowState_WaitForUtilityRoll(): Promise<WorkflowState>;
    WorkflowState_UtilityRollComplete(): Promise<WorkflowState>;
    WorkflowState_WaitForSaves(): Promise<WorkflowState>;
    WorkflowState_SavesComplete(): Promise<WorkflowState>;
    WorkflowState_AllRollsComplete(): Promise<WorkflowState>;
    get healingAdjustedDamageTotal(): number;
    get healingAdjustedBonusDamageTotal(): number;
    get healingAdjustedOtherDamageTotal(): number;
    get saveTargetsDisplayed(): boolean;
    get allOtherEffectTargets(): TokenDocumentSet;
    /** The ammunition as it was when its last piece was spent and deleted (on the card); cards before 14.6.9 kept a flag */
    get spentAmmunitionData(): Item.CreateData | undefined;
    set spentAmmunitionData(data: Item.CreateData | undefined);
    /** What the other activity's use consumed, false when declined or skipped, undefined until settled (on the card) */
    get otherConsumed(): object | false | undefined;
    checkOtherActivityConsumption(): Promise<boolean>;
    /** The targets the other activity's and the ammunition's damage apply to, each by its own use condition. */
    buildOtherDamageMatches(): Promise<void>;
    rollDeferredOtherDamage(): Promise<void>;
    /**
     * The activity and item, as dnd5e's concentration effect records them, for midi's caster-side template, summon and
     * transform effects (which, like it, keep the item as their origin).
     */
    casterEffectSource(): {
        activity: {
            type: string;
            id: string;
            uuid: string;
        };
        item: {
            type: "base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType;
            id: string;
            uuid: string;
        };
    };
    /** A Convenient Effects effect's source, recorded as dnd5e and DAE record an applied effect's. */
    recordEffectOrigin(effectData: ActiveEffect.CreateData, concentrationUuid: string | undefined): void;
    /**
     * An activity's statuses (midiProperties.statuses) for `token`, applied as the condition itself and tied to
     * concentration as its effects are: those marked onSave, or the others.
     */
    applyActivityStatuses(activity: Activity | undefined, token: TokenOrDocument, onSave: boolean): Promise<void>;
    WorkflowState_ApplyDynamicEffects(): Promise<WorkflowState>;
    /** effectsSelectTargets has run: its target sets are set for the steps after it */
    effectTargetsSelected(): asserts this is this & {
        effectTargets: TokenDocumentSet;
        otherEffectTargets: TokenDocumentSet;
        effectTargetsOnSave: TokenDocumentSet;
        otherEffectTargetsOnSave: TokenDocumentSet;
    };
    /** Activation conditions per target: the activity's, the other activity's and the ammunition's own */
    effectsMatchTargets(): Promise<{
        ammunition: any;
        ammunitionEffectCondition: string | undefined;
        ammunitionHasSave: boolean;
        ammunitionActivationMatches: TokenDocumentSet;
    }>;
    /** Which targets get the activity's, the other activity's and the ammunition's effects (applied and on save) */
    effectsSelectTargets(ammo: Awaited<ReturnType<Workflow["effectsMatchTargets"]>>): Promise<{
        ammunitionEffectTargets: TokenDocumentSet;
        ammunitionEffectTargetsOnSave: TokenDocumentSet;
    }>;
    /** False when effects are not applied: item effects off, or a preActiveEffects macro halted them */
    effectsMayApply(): Promise<boolean>;
    /** The effects to apply: resolved from the activities' profiles, chosen, split between self and targets */
    effectsResolve(ammunition: Awaited<ReturnType<Workflow["effectsMatchTargets"]>>["ammunition"], ammunitionEffectTargets: TokenDocumentSet): Promise<{
        useCE: string;
        ceEffect: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> | null | undefined;
        ceTargetEffect: boolean | null | undefined;
        ceSelfEffect: boolean | null | undefined;
        daeInstalled: boolean;
        hasActivityEffects: boolean;
        hasOtherActivityEffects: boolean;
        activityEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        onSaveActivityEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        otherActivityEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        onSaveOtherActivityEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        ammunitionEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        onSaveAmmunitionEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        activitySelfEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        activitySelfAllEffect: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        otherActivitySelfEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        otherActivitySelfAllEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        ammunitionSelfEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
        ammunitionSelfAllEffects: ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
    }>;
    /** What DAE is given with each application: metadata, the concentration origin and the roll context */
    effectsApplicationData(): {
        metaData: {
            flags: {
                dae: {
                    transfer: boolean;
                };
                "midi-qol": {
                    castData: {
                        castLevel?: number;
                    } | undefined;
                };
            };
        };
        origin: string | undefined;
        doEffectsData: {
            damageTotal: number;
            damage: number;
            critical: boolean;
            fumble: boolean;
            itemCardUuid: string | undefined;
            metaData: {
                flags: {
                    dae: {
                        transfer: boolean;
                    };
                    "midi-qol": {
                        castData: {
                            castLevel?: number;
                        } | undefined;
                    };
                };
            };
            selfEffects: string;
            spellLevel: number;
            concentrationUuid: string | undefined;
            toggleEffect: boolean | undefined;
            tokenUuid: string | null | undefined;
            actorUuid: string | null;
            whisper: boolean;
            workflowOptions: InexactPartial<{
                advantage: boolean;
                allowIncapacitated: boolean;
                /**
                 * Caller-supplied control over per-target attack splitting: true forces it on, false off,
                 * absent falls through to the activity flag and the world setting. The pre-13 item-based
                 * implementation passed false into each iteration of its own loop to stop it re-splitting.
                 * Nothing has written it since that implementation was replaced (68664c1f, 2024-11-10), so
                 * the sole remaining read — activityHelpers.requiresTargetConfirmation — is vestigial.
                 */
                attackPerTarget: boolean;
                /**
                 * Status, not control: this invocation is one iteration of a per-target attack roll. Set by
                 * AttackActivity via setProperty. Distinct from attackPerTarget above, which is an input.
                 */
                rollAttackPerTarget: boolean;
                /** One target's use of an attack per target: its index among `count`, and the ammunition the first chose. */
                attackSplit: {
                    index: number;
                    count: number;
                    ammunition?: string;
                };
                attackMode: string;
                attackRollDSN: boolean;
                autoConsumeResource: string;
                autoFastAttack: boolean;
                autoRollAttack: boolean;
                autoRollDamage: string;
                chatMessage: boolean;
                damageRollDSN: boolean;
                disadvantage: boolean;
                event: AugmentedEvent;
                excludeTargets: string[];
                includeTargets: string[];
                fastForward: boolean;
                fastForwardAbility: boolean;
                fastForwardAttack: boolean;
                fastForwardDamage: boolean;
                fastForwardSet: boolean;
                forceCompletion: boolean;
                forceTemplateTargeting: boolean;
                formulaDSN: boolean;
                ignoreUserTargets: boolean;
                isCritical: boolean;
                isMagicSave: boolean;
                isReaction: boolean;
                item: Item.Implementation;
                noConcentrationCheck: boolean;
                noOnUseMacro: boolean;
                noProvokeReaction: boolean;
                noTargetOnUseMacro: boolean;
                noUseWarning: boolean;
                notBonusAction: boolean;
                notReaction: boolean;
                onlyOnUseItemMacros: boolean;
                other: boolean;
                parts: string[];
                rollToggle: boolean;
                rollType: string;
                saveItem: Item.Implementation;
                saveItemUuid: string;
                simulate: boolean;
                target: number;
                targetConfirmation: string;
                updateWorkflow: boolean;
                versatile: boolean;
                workflowName: string;
                castUsesReaction: boolean;
                /** This use's changes to its flow (steps/api.ts): the call layer, winning over modules' global changes */
                steps: StepChangeInput[];
                castUsesBonusAction: boolean;
                coverOrigin: {
                    x: number;
                    y: number;
                    elevation?: number;
                };
                templateUuid: string;
                preSelectedTargetUuids: string[];
                overTimeEffectUuid: string;
                teleport: TeleportOption;
            }>;
            context: {
                damageComponents: {};
                damageTotal: number;
                damageApplied: number;
                otherDamage: number;
                bonusDamage: number;
                itemData: unknown;
                activity: unknown;
                flags: {
                    dnd5e: {
                        scaling: any;
                        spellLevel: any;
                    };
                };
                utilityRollTotal: number | undefined;
            };
        };
    };
    /** Each target's effects and statuses: the activity's, the other activity's, the ammunition's, and CE */
    applyTargetEffects(fx: Awaited<ReturnType<Workflow["effectsResolve"]>>, ammo: Awaited<ReturnType<Workflow["effectsMatchTargets"]>>, ammoTargets: Awaited<ReturnType<Workflow["effectsSelectTargets"]>>, data: ReturnType<Workflow["effectsApplicationData"]>): Promise<void>;
    /** Self effects: all of them when targets were affected, only "apply to self always" ones when not */
    applySelfEffects(fx: Awaited<ReturnType<Workflow["effectsResolve"]>>, ammo: Awaited<ReturnType<Workflow["effectsMatchTargets"]>>, ammoTargets: Awaited<ReturnType<Workflow["effectsSelectTargets"]>>, data: ReturnType<Workflow["effectsApplicationData"]>): Promise<ActiveEffect.Implementation[]>;
    /** The Convenient Effects self effect */
    applyCESelfEffect(fx: Awaited<ReturnType<Workflow["effectsResolve"]>>, data: ReturnType<Workflow["effectsApplicationData"]>, selfEffects: ActiveEffect.Implementation[]): Promise<void>;
    WorkflowState_Cleanup(): Promise<WorkflowState>;
    WorkflowState_Completed(): Promise<WorkflowState>;
    /** The card's buttons removed as the workflow is finished */
    /** Only the card's own workflow finishes it: a damage-only workflow adding to another use's card leaves that card alone */
    completeCard(): Promise<void>;
    /** The activity's triggered activity, unless it loops, its targets are missing or its condition fails */
    runTriggeredActivity(): Promise<void>;
    /**
     * Hand back what dnd5e consumed for this use: an abort deletes the card, where dnd5e keeps the consumption and its
     * Refund button. Idempotent: a workflow can reach more than one abort path.
     */
    refundConsumption(): Promise<void>;
    /**
     * Begin the concentration MidiActivityMixin deferred, once the use can no longer be cancelled.
     * Same order as Activity#use: begin, record it on the card, then end the one it replaces.
     */
    beginDeferredConcentration(): Promise<void>;
    WorkflowState_Abort(): Promise<WorkflowState>;
    WorkflowState_Cancel(): Promise<WorkflowState>;
    WorkflowState_RollFinished(): Promise<WorkflowState>;
    /** For an activity with effects, every target shown as affected on the card */
    finishHitDisplay(): Promise<void>;
    /** Card progress: effects applied (Apply and Remove), all of the activity's templates placed */
    finishCardProgress(): Promise<void>;
    /** Summoned creatures depend on the concentration, or on an effect lasting the activity's duration */
    finishSummonedCreatures(selfTarget: ReturnType<typeof getOrCreateTokenForActor> | Token.Implementation | undefined): Promise<void>;
    /** Transformed actors are recorded on the concentration, or on an effect lasting the activity's duration */
    finishTransformations(selfTarget: ReturnType<typeof getOrCreateTokenForActor> | Token.Implementation | undefined): Promise<void>;
    /** Dead targets untargeted, and the action marked used on the actor's turn */
    finishTurnBookkeeping(): Promise<void>;
    initSaveResults(): void;
    checkAttackAdvantage(): Promise<void>;
    processCriticalFlags(): Promise<void>;
    checkFlankingAdvantage(): Promise<boolean>;
    /**
     * Parts added to a single-target attack roll before it is rolled, labelled so the roll shows them: a fixed
     * flanking bonus and the target's granted attack bonus (flags.midi-qol.grants.attack.bonus). With several
     * targets the granted bonus is added per target when hits are checked, as one roll can't carry it for some only.
     * `modifiers` are the reasons the attack roll's display shows (attackRollModifiers on the roll's options).
     */
    attackRollParts(): {
        parts: string[];
        modifiers: AttackModifier[];
    };
    checkTargetAdvantage(): Promise<void>;
    triggerTargetMacros(triggerList: string[], targets?: TokenDocumentSet | Set<TokenOrDocument>, options?: {
        saved?: boolean;
    }): Promise<Record<string, unknown[]>>;
    callMidiHooks(...hookNames: string[]): Promise<void>;
    callCancellableHooks(hookName: string): Promise<boolean>;
    expireTargetEffects(expireList: string[]): Promise<void>;
    getDamageBonusMacros(): string | undefined;
    rollBonusDamage(damageBonusMacro: string, item?: Item.Implementation | undefined): Promise<Roll[]>;
    rollAllBonusDamage(): Promise<void>;
    getSafeMacroData(item?: Item.Implementation, options?: any): MidiMacroData;
    getMacroData(item?: Item, options?: any): MidiMacroData;
    callMacros(item: Item.Implementation | undefined, macros: string | undefined, tag: string, macroPass: string, options?: AnyObject): Promise<any[]>;
    /**
     * Parse the macro name and resolve context from UUID if provided.
     */
    private parseCallMacroContext;
    /**
     * Resolve a function.* macro specification.
     */
    private resolveFunctionMacro;
    /**
     * Resolve an ItemMacro specification, with DAE itemData fallback.
     */
    private resolveItemMacroCall;
    /**
     * Resolve an ActivityMacro specification.
     */
    private resolveActivityMacroCall;
    /**
     * Resolve a world or compendium macro.
     */
    private resolveWorldMacro;
    /**
     * Create a Macro instance from macro data and execute it with the given scope.
     * @param resolved - The resolved macro specification
     * @param workflowContext - Workflow context data passed to macro as args[0] and midiData
     * @param options - Call options
     * @param rolledItem - The item that was rolled to trigger this macro
     */
    private executeMacroWithScope;
    /**
     * Create a Macro document from resolved macro data.
     */
    private createMacroFromResolved;
    /**
     * Call a macro by name, resolving the macro type and executing it.
     */
    callMacro(item: Item.Implementation | undefined, macroName: string, macroData: MidiMacroData, options: AnyObject): Promise<any>;
    removeEffectsButton(): Promise<void | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.Any | ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note">>;
    displayUtilityRolls(): Promise<void>;
    displayAttackRoll(_displayOptions?: {
        GMOnlyAttackRoll?: boolean;
    }): Promise<void>;
    displayDamageRolls(): Promise<void | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.Any | ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note">>;
    /** Attack per target: one target's hit or miss, from its own use, on this use's card */
    addSplitAttackResult(split: Workflow): Promise<void>;
    displayHitTargets(whisper?: boolean): Promise<void>;
    displayHits(whisper?: boolean, showHits?: boolean): Promise<void>;
    computeSaveFlavors(): {
        fullDamageText: string;
        halfDamageText: string;
        noDamageText: string;
    };
    displaySaveTargets(_whisper?: boolean): Promise<void>;
    displaySaves(_whisper?: boolean): Promise<void>;
    /**
     * Each target's descriptor with midi's detail for the damage tray (save results and multipliers, uncanny dodge), which
     * DamageApplicationElementMidi.getTargetOptions reads back into `options.midi` (#targetsUpdate stores it)
     */
    buildMidiTargetDescriptors(targets: TokenDocument.Implementation[]): CombinedTargetDescriptor[];
    get chatRolls(): Roll[];
    /**
     * Gets an auto-roll for a friendly target if applicable
     * @param saveDetails The save details object with isFriendly flag
     * @returns A promise that resolves to a roll if the target should auto-pass/fail, null otherwise
     */
    protected getFriendlyTargetRoll(saveDetails: {
        isFriendly: boolean;
    }): Promise<Roll> | null;
    /**
     * Gets the portrait image for a target token
     * Handles player portrait preference and video thumbnail generation
     * @param target The target token
     * @returns Promise resolving to the image URL string
     */
    protected getTargetPortraitImage(target: TokenOrDocument): Promise<string>;
    /**
     * Sculpt Spells and Careful Spell (2024): an area use's creatures targeted before casting are the caster's choice.
     * They succeed on the save and take no damage where a save halves it.
     */
    protected checkSculptOrCarefulSpells(target: TokenOrDocument): boolean;
    /**
     * Applies concentration save bonus if applicable
     * Only applies when item has isConcentrationCheck flag and target has concentrationSaveBonus
     * @param target The target token
     * @param saveRoll The original save roll
     * @param resultDC The save DC
     * @param isCritical Whether the roll was a critical
     * @param isFumble Whether the roll was a fumble
     * @returns Updated roll info or null if no bonus applies
     */
    protected applyConcentrationSaveBonus(target: TokenOrDocument, saveRoll: Roll, resultDC: number, isCritical: boolean, isFumble: boolean): Promise<{
        saveRoll: Roll;
        saveRollTotal: number;
        saved: boolean;
    } | null>;
    /**
     * Builds and stores save display entry for a target
     * Handles advantage/disadvantage display, cover bonus, and roll rendering
     * @param target The target token
     * @param saveRoll The save roll result
     * @param saved Whether the target saved
     * @param rollDC The save DC (or undefined if no DC)
     * @param coverSaveBonus Computed cover bonus (for label when no cover status); total cover displays as ∞
     */
    protected buildSaveDisplayEntry(target: TokenOrDocument, saveRoll: Roll, saved: boolean, rollDC: number | undefined, coverSaveBonus?: number): Promise<void>;
    /**
     * Determines roll settings for a target's save roll
     * @param target The target token
     * @param flagRollType The roll type for module settings (save/check/skill/tool)
     * @param simulate Whether this is a simulation (disables prompts and modules)
     * @returns Object with player, roll settings, and module flags
     */
    protected determineTargetRollSettings(target: TokenOrDocument, flagRollType: string | undefined, simulate: boolean): {
        player: User | undefined;
        promptPlayer: boolean;
        showRollDialog: boolean;
        GMprompt: string | boolean | undefined;
        gmMonksTB: boolean | undefined;
        gmFlashTB: boolean | undefined;
        gmRER: boolean | undefined;
        playerChat: boolean;
    };
    /**
     * Calculates the cover save bonus for a DEX save target.
     * dnd5e already bakes the status cover bonus into the DEX save via prepareAbilities(),
     * so this returns only the delta above status cover from module-computed cover.
     * @param target The target token
     * @param template The measured template (for area effects)
     * @param rollAbility The ability being used for the save
     * @returns The extra cover bonus to add to the save (above what dnd5e already includes)
     */
    protected calculateCoverSaveBonus(target: TokenOrDocument, template: foundry.canvas.placeables.MeasuredTemplate.Implementation | undefined | null, rollAbility: string | undefined | null, templateCoverOrigin?: {
        x: number;
        y: number;
        elevation?: number;
    }): Promise<number>;
    /**
     * Determines if a save roll is a critical success (natural 20) or fumble (natural 1)
     * @param saveRoll The save roll to check
     * @param fallbackTotal Fallback total if dice results can't be read
     * @returns Object with isCritical and isFumble booleans
     */
    protected determineCriticalOrFumble(saveRoll: Roll | undefined, fallbackTotal: number): {
        isCritical: boolean;
        isFumble: boolean;
    };
    /**
     * Updates the advantageSaves and disadvantageSaves sets based on the roll result
     * @param target The target token
     * @param result The roll result array
     */
    protected updateAdvantageTrackingFromRoll(target: TokenOrDocument, result: Roll[]): void;
    /**
     * Determines the roll type, action, and related properties based on the save activity
     * @returns Object containing rollAction, rollType, rollAbilities, rollSkills, rollTools, and flagRollType
     */
    protected determineRollTypeAndAction(): {
        rollAction: ((config?: AnyObject, dialog?: AnyObject, message?: AnyObject) => Promise<Roll[] | null>) | undefined;
        rollType: string | undefined;
        rollAbilities: string[];
        rollSkills: string[];
        rollTools: string[];
        flagRollType: string | undefined;
    };
    /**
     * Build a Monks Token Bar save request for a target
     */
    buildMonksTokenBarRequest(target: TokenOrDocument, saveDetails: AnyMutableObject): MonksTokenBarRequest;
    /**
     * Build a Flash Rolls 5e save request for a target
     */
    buildFlashRollsRequest(target: TokenOrDocument, saveDetails: AnyMutableObject): FlashRollsRequest;
    /**
     * Build an Epic Rolls 5e save request for a target
     */
    buildEpicRollsRequest(target: TokenOrDocument, saveDetails: AnyMutableObject): EpicRollsRequest;
    /**
     * Dispatch save requests to Monks Token Bar
     */
    dispatchMonksTokenBarSaves(monkRequestsPlayer: MonksTokenBarRequest[], monkRequestsGM: MonksTokenBarRequest[], rollType: string, rollAbilities: string[], rollSkills: string[], rollDC: number | undefined, whisper: boolean): void;
    /**
     * Dispatch save requests to Flash Rolls 5e
     */
    dispatchFlashRollsSaves(flashRequestsPlayer: FlashRollsRequest[], flashRequestsGM: FlashRollsRequest[], rollType: string, rollAbilities: string[], rollSkills: string[], rollTools: string[], rollDC: number | undefined): void;
    /**
     * Dispatch save requests to Epic Rolls 5e
     */
    dispatchEpicRollsSaves(rerRequestsPlayer: EpicRollsRequest[], rerRequestsGM: EpicRollsRequest[], rollType: string, rollDC: number | undefined): void;
    /**
     * Create a player chat save request with timeout handling
     */
    createPlayerChatSaveRequest(target: TokenOrDocument, player: User, saveDetails: AnyMutableObject, rollType: string, rollAbilities: string[], rollSkills: string[], rollTools: string[], rollDC: number | undefined, showRoll: boolean, GMprompt: string, isMagicSave: boolean, rollAction: Function): {
        promise: Promise<Roll[] | Roll | null>;
        requestCard: Promise<ChatMessage | undefined> | undefined;
    };
    /** A save's message mode with no player rolling it: the activity's own, else by the save display */
    defaultSaveMessageMode(): string;
    /** The message mode of a player's own save roll: the activity's own, else by Player roll saves */
    playerSaveMessageMode(): string;
    /**
     * Create a standard socketlib save roll
     */
    createStandardSaveRoll(target: TokenOrDocument, saveDetails: SaveDetails, whisper: boolean, showRoll: boolean, showRollDialog: boolean, simulate: boolean): Promise<Roll[] | Roll | null>;
    /**
     * Queue a target's save roll to the appropriate handler based on settings
     * Returns the promise and optionally adds to module-specific request arrays
     */
    queueTargetSaveRoll(options: QueueSaveRollOptions): {
        promise: Promise<Roll[] | Roll | null> | null;
        requestCard: Promise<ChatMessage | undefined> | undefined;
    };
    queueTargetSaveRollRequest(options: QueueSaveRollOptions): {
        promise: Promise<Roll[] | Roll | null> | null;
        requestCard: Promise<ChatMessage | undefined> | undefined;
        friendly?: boolean;
        asked?: boolean;
    };
    /**
     * What the GM can answer a player's save with from the player list: rolled for them (normal, with advantage or
     * disadvantage), or on the GM's screen; shown as the player's own roll would have been (their roll mode; private and
     * self whispered to them, blind not). Both the chat-card path and askPlayerSave offer these.
     */
    gmSaveChoices(saveDetails: SaveDetails, player: User, showRoll: boolean): Record<"roll" | "advantage" | "disadvantage" | "gmRoll", WaitChoiceSpec<Roll[] | Roll | null>>;
    /**
     * A player's save through the request core (M3 stage 5; rules: ~/Documents/midi-request-redesign-plan-2026-11-10.md).
     * Their roll dialog shows this client's deadline (Player save timeout); confirming it claims the request, after which
     * the roll is waited for. A GM answers from the player list. When the deadline passes the save is made without them,
     * non-interactively: here if this client owns the creature, else by a GM, shown as the player's roll would have
     * been; with no GM connected, here unattended (no prompts).
     */
    askPlayerSave(target: TokenOrDocument, player: User.Implementation, saveDetails: SaveDetails, rollInfo: QueueSaveRollOptions["rollInfo"], displayOptions: QueueSaveRollOptions["displayOptions"]): Promise<Roll[] | Roll | null>;
    /**
     * Process a single target's save result - determine if saved, apply bonuses, update tracking sets
     */
    processTargetSaveResult(target: TokenOrDocument, result: Roll[], context: ProcessTargetSaveContext): Promise<void>;
    /**
     * Update the saves and failedSaves sets based on whether the target saved
     */
    updateSaveFailSets(target: TokenOrDocument, saved: boolean): void;
    /**
     * Apply fail bonuses (flags.midi-qol.save.fail) if the save failed
     */
    applyFailedSaveBonuses(target: TokenOrDocument, result: Roll[], saveRolls: Roll[], rollType: string, rollAbility: string): Promise<{
        saveRolls: Roll[];
        saveRollTotal: number;
    } | null>;
    /**
     * Compute module integration settings for save rolls (Monks TB, Flash Rolls, Epic Rolls)
     */
    computeModuleIntegrationSettings(simulate: boolean, flagRollType: string): {
        flags: ModuleIntegrationFlags;
        requests: ModuleIntegrationRequests;
    };
    /**
     * Build SaveDetails for a target, including magic resistance/vulnerability and advantage checks.
     * When multiple choices are available (abilities, skills, or tools), pre-computes advantage
     * for each option and stores results in saveDetails.advantageByChoice.
     * A roll is always ONE type, so a single map suffices.
     */
    buildSaveDetailsForTarget(target: TokenOrDocument, context: {
        rollDC: number | undefined;
        rollType: string | undefined;
        rollAbilities: string[];
        rollSkills: string[];
        rollTools: string[];
        flagRollType: string;
        isMagicSave: boolean;
        actorDisposition: number;
    }): Promise<SaveDetails>;
    /**
     * Normalize roll results to ensure they are all Roll[] arrays
     */
    normalizeRollResults(results: (Roll | Roll[] | null)[], D20Roll: typeof Roll): Roll[][];
    /** Rolls the hit targets' saves: this.saves the ones that saved, this.failedSaves the rest */
    checkSaves(whisper?: boolean, simulate?: boolean): Promise<void>;
    computeSaveDisplayFlavor(rollDC: number | undefined, rollType: string, options: {
        rollAbilities: string[];
        rollSkills: string[];
        rollTools: string[];
    }): Promise<string>;
    monksSavingCheck(message: ChatMessage.Implementation, update: ChatMessage.UpdateData, _options: ChatMessage.Database.OnUpdateOptions, _userId: string): boolean;
    flashSavingCheck(data: {
        actorUuid: string;
        roll: Roll.Any;
        total: number;
    }): void;
    callDamageHooksAndMacros(damages: DamageListEntry, token: TokenOrDocument): Promise<void>;
    processDefenceRoll(message: ChatMessage.Implementation, _html: HTMLElement, _data?: ChatMessage.MessageData): boolean;
    processSaveRoll(message: ChatMessage.Implementation, _html: HTMLElement | ChatMessage.Database.OnCreateOptions, _dataOrUserId?: ChatMessage.MessageData | string): {};
    checkSuperSaver(token: TokenOrDocument, abilities: Set<string> | undefined): Promise<boolean>;
    checkSemiSuperSaver(token: TokenOrDocument, abilities: Set<string> | undefined): Promise<boolean>;
    /** The attack's die as it counts (a min/max such as rolls.attack.min 20 counts) */
    static diceRollOf(roll: Roll): number;
    /** The attack's d20 result, or a die replacing the d20 that dnd5e accepts as one (e.g. Custom D&D 5e's 2d10) */
    static d20Of(roll: Roll): number | undefined;
    processAttackRoll(): Promise<void>;
    protected recordAttackStats(): void;
    protected recordDamageStats(): void;
    private collectOptionalFlagSources;
    /**
     * The damageContributions service's damage (M2 stage 8): each contribution rolled with the use's roll data; without
     * targets it joins the bonus damage (every target hit), with targets it goes to those targets only
     * (addTargetedDamageBonus); each is its own damage message (createDamageMessages).
     */
    rollDamageContributions(): Promise<void>;
    /**
     * M2 stage 8: the use's damage as dnd5e damage messages, one per contribution (the activity's, the other activity's or
     * the ammunition's, bonus damage), origin the use card, so dnd5e and other modules find them
     * (getAssociatedRolls("damage"), damage message readers). They are folded into the use card (an empty summary, the
     * card shows the damage as before) and hidden in the log; with dnd5e's chat card summaries off none are made (they
     * would show as cards beside midi's). A contribution changed later (a bonus after the saves) updates its message.
     */
    createDamageMessages(): Promise<void>;
    /** Start collecting the damage step's dice (the activity's, the other activity's, bonus damage) for one throw */
    beginDamageThrow(): void;
    /** Throw these damage dice now, or with the rest of the damage step's when it is collecting */
    throwDamageDice(rolls: Roll | Roll[]): Promise<void>;
    /** The damage step's dice in one throw: one roll of all their terms (damage-type flavours kept for DSN's colours) */
    flushDamageThrow(): Promise<void>;
    /**
     * rollBonuses decision 4: a use with saves offers contributors' damage bonuses once the saves are known (here, as
     * the damage is calculated), so a bonus can depend on who saved; the damage is worked out again with the new roll.
     */
    offerDeferredDamageBonuses(): Promise<void>;
    /** rollBonuses' damage bonuses for particular targets (stage 9), added to those targets' damage by midi's damageModifiers contributor */
    targetedDamageBonuses: {
        targets: string[];
        amount: number;
        type: string;
        label: string;
    }[];
    addTargetedDamageBonus(bonus: {
        targets: string[];
        amount: number;
        type: string;
        label: string;
    }): void;
    /**
     * rollBonuses' preRoll phase (stage 7): automatic bonuses that add to the formula are collected before the roll and
     * become parts of it (attackRollParts), so they show in the roll and dnd5e doubles their dice on a critical. Optional
     * preRoll bonuses are not offered yet (the prompt opens after the roll).
     */
    collectPreRollBonuses(kind: "attack"): Promise<void>;
    /** After the roll: the preRoll bonuses it carries are recorded as used, their costs spent and their onChosen run. */
    settlePreRollBonuses(kind: "attack", roll: Roll): Promise<void>;
    /** What rollBonuses contributors are told about this use's attack or damage roll. */
    rollBonusQuery(kind: "attack" | "damage"): RollBonusQuery;
    processAttackRollBonusFlags(): Promise<Roll<EmptyObject>>;
    processDamageRollBonusFlags(damageRolls: Roll[]): Promise<Roll[]>;
    recordTargetACModifiers(): void;
    checkHits(options?: {
        workflowOptions?: WorkflowOptions;
        noOnuseMacro?: boolean;
        noTargetOnUseMacro?: boolean;
    }): Promise<void>;
    /**
     * Run one of dnd5e's rolls for `subject`, keeping the flags other modules put on its message config: midi rolls without
     * dnd5e's messages, so they go on the card with its next roll update (midi's, dnd5e's and core's left out). dnd5e
     * rolls on a copy of the message config.
     */
    keepRollMessageFlags<T>(subject: unknown, roll: () => Promise<T>): Promise<T>;
    addRollMessageFlags(message: {
        data?: Record<string, unknown>;
    } | undefined): void;
    setAttackRoll(roll: Roll): Promise<void>;
    setUtilityRolls(rolls: Array<Roll> | Roll | undefined | null): Promise<void>;
    setUtilityRoll(roll: Roll): Promise<void>;
    convertRollToDamageRoll(roll: Roll.Any): any;
    setDamageRoll(roll: Roll): Promise<void>;
    addDamageRolls(rolls: Array<Roll> | Roll | undefined | null): Promise<void>;
    /** Totals and detail from the damage rolls; also how a rebuilt workflow gets them back */
    deriveDamage(): void;
    deriveBonusDamage(): void;
    deriveOtherDamage(): void;
    setDamageRolls(rolls: Array<Roll> | Roll | undefined | null): Promise<void>;
    setBonusDamageRolls(rolls: Array<Roll> | Roll | undefined | null): Promise<void>;
    setBonusDamageRoll(roll: Roll): Promise<void>;
    setOtherDamageRolls(rolls: Array<Roll> | Roll | undefined | null): Promise<void>;
    setOtherDamageRoll(roll: Roll): Promise<void>;
    chooseEffects(effects: ActiveEffect.Implementation[], options: any): Promise<ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[]>;
}
export declare class SavesFirstWorkflow extends Workflow {
    static flowId: string;
    get postAttackRollState(): WorkflowState;
    WorkflowState_WaitForSaves(): Promise<WorkflowState>;
    WorkflowState_SavesComplete(): Promise<WorkflowState>;
    WorkflowState_WaitForDamageRoll(): Promise<WorkflowState>;
    WorkflowState_DamageRollComplete(): Promise<WorkflowState>;
}
export declare class ActiveDefenceWorkflow extends Workflow {
    static flowId: string;
    WorkflowState_WaitForAttackRoll(): Promise<WorkflowState>;
    processAttackRoll(): Promise<void>;
    WorkflowState_AttackRollComplete(): Promise<WorkflowState>;
    checkHits(): Promise<void>;
    checkActiveAttacks(whisper: boolean | undefined, roll: CONFIG.Dice.D20Roll, _coverBonus?: number): Promise<void>;
    displayAttackRoll(): Promise<void>;
}
export declare class UserWorkflow extends Workflow {
    static get forceCreate(): boolean;
}
export declare class DamageOnlyWorkflow extends Workflow {
    static flowId: string;
    /** @deprecated use itemCardUuid */
    get itemCard(): ChatMessage.Implementation | undefined;
    ready: Promise<void>;
    constructor(actor: Actor.Implementation | null, token: Token.Implementation, damageTotal: number, damageType: string, targets: Token.Implementation[], roll: Roll, options: {
        flavor: string;
        itemCardId: string;
        itemCardUuid: string;
        damageList: DamageListEntry[];
        /** The damage is the workflow's other damage */
        useOther?: boolean;
        itemData: Item.Source;
        isCritical: boolean;
        item?: Item;
        storeWorkflow?: boolean;
    });
    static get forceCreate(): boolean;
    get otherDamageFlavor(): string;
    WorkflowState_Start(): Promise<WorkflowState>;
}
export declare class TrapWorkflow extends Workflow {
    static flowId: string;
    templateLocation: {
        x: number;
        y: number;
        direction?: number;
        removeDelay?: number;
    } | undefined;
    saveTargets: TokenDocumentSet | undefined;
    targetsPassedToConstructor: boolean;
    static get forceCreate(): boolean;
    constructor(actor: Actor, activity: Activity, targets: Array<Token> | undefined, templateLocation?: {
        x: number;
        y: number;
        direction?: number;
        removeDelay?: number;
    } | undefined, _trapSound?: {
        playlist: string;
        sound: string;
    } | undefined, event?: any, _storeWorkflow?: boolean);
    get workflowType(): string;
    WorkflowState_Start(): Promise<WorkflowState>;
    WorkflowState_AwaitTemplate(): Promise<WorkflowState>;
    WorkflowState_TemplatePlaced(): Promise<WorkflowState>;
    WorkflowState_ValidateRoll(): Promise<WorkflowState>;
    stateAfter(event: WorkflowEvent): WorkflowState;
    WorkflowState_WaitForAttackRoll(): Promise<WorkflowState>;
    WorkflowState_AttackRollComplete(): Promise<WorkflowState>;
    setDescriptorACModifiers(): void;
    WorkflowState_WaitForSaves(): Promise<WorkflowState>;
    WorkflowState_SavesComplete(): Promise<WorkflowState>;
    WorkflowState_WaitForDamageRoll(): Promise<WorkflowState>;
    WorkflowState_DamageRollComplete(): Promise<WorkflowState>;
    WorkflowState_AllRollsComplete(): Promise<WorkflowState>;
    WorkflowState_RollFinished(): Promise<WorkflowState>;
}
export declare class DummyWorkflow extends Workflow {
    static get forceCreate(): boolean;
    _dummyActor: Actor.Implementation | undefined;
    constructor(actor: globalThis.dnd5e.documents.Actor5e, activity: any, speaker: any, targets: any, options: any);
    get actor(): Actor.Implementation;
    performState(newState: WorkflowState): Promise<void>;
    simulateSave(targets: Token.Implementation[]): Promise<this>;
    simulateAttack(target: Token.Implementation): Promise<this>;
}
export declare const WorkflowRegistry: Record<string, new (...args: any[]) => Workflow>;
type WorkflowConstructorOptions = InexactPartial<{
    chatCardUuid: string;
    readOnly: boolean;
    event: MouseEvent | KeyboardEvent;
    item: Item.Implementation;
    /** @deprecated since 14.6.9: has no effect */
    noOptionalRules: boolean;
    noTemplateHook: boolean;
    rollOptions: WorkflowRollOptions;
    storeWorkflow: boolean;
    token: Token.Implementation;
    workflowOptions: WorkflowOptions;
}>;
export type WorkflowOptions = InexactPartial<{
    advantage: boolean;
    allowIncapacitated: boolean;
    /**
     * Caller-supplied control over per-target attack splitting: true forces it on, false off,
     * absent falls through to the activity flag and the world setting. The pre-13 item-based
     * implementation passed false into each iteration of its own loop to stop it re-splitting.
     * Nothing has written it since that implementation was replaced (68664c1f, 2024-11-10), so
     * the sole remaining read — activityHelpers.requiresTargetConfirmation — is vestigial.
     */
    attackPerTarget: boolean;
    /**
     * Status, not control: this invocation is one iteration of a per-target attack roll. Set by
     * AttackActivity via setProperty. Distinct from attackPerTarget above, which is an input.
     */
    rollAttackPerTarget: boolean;
    /** One target's use of an attack per target: its index among `count`, and the ammunition the first chose. */
    attackSplit: {
        index: number;
        count: number;
        ammunition?: string;
    };
    attackMode: string;
    attackRollDSN: boolean;
    autoConsumeResource: string;
    autoFastAttack: boolean;
    autoRollAttack: boolean;
    autoRollDamage: string;
    chatMessage: boolean;
    damageRollDSN: boolean;
    disadvantage: boolean;
    event: AugmentedEvent;
    excludeTargets: string[];
    includeTargets: string[];
    fastForward: boolean;
    fastForwardAbility: boolean;
    fastForwardAttack: boolean;
    fastForwardDamage: boolean;
    fastForwardSet: boolean;
    forceCompletion: boolean;
    forceTemplateTargeting: boolean;
    formulaDSN: boolean;
    ignoreUserTargets: boolean;
    isCritical: boolean;
    isMagicSave: boolean;
    isReaction: boolean;
    item: Item.Implementation;
    noConcentrationCheck: boolean;
    noOnUseMacro: boolean;
    noProvokeReaction: boolean;
    noTargetOnUseMacro: boolean;
    noUseWarning: boolean;
    notBonusAction: boolean;
    notReaction: boolean;
    onlyOnUseItemMacros: boolean;
    other: boolean;
    parts: string[];
    rollToggle: boolean;
    rollType: string;
    saveItem: Item.Implementation;
    saveItemUuid: string;
    simulate: boolean;
    target: number;
    targetConfirmation: string;
    updateWorkflow: boolean;
    versatile: boolean;
    workflowName: string;
    castUsesReaction: boolean;
    /** This use's changes to its flow (steps/api.ts): the call layer, winning over modules' global changes */
    steps: StepChangeInput[];
    castUsesBonusAction: boolean;
    coverOrigin: {
        x: number;
        y: number;
        elevation?: number;
    };
    templateUuid: string;
    preSelectedTargetUuids: string[];
    overTimeEffectUuid: string;
    teleport: TeleportOption;
}>;
export type WorkflowRollOptions = InexactPartial<{
    event: AugmentedEvent;
    fastForward: boolean;
    fastForwardAttack: boolean;
    fastForwardDamage: boolean;
    isCritical: boolean;
    rollToggle: boolean;
}>;
export type UndoData = {
    id: string;
    userId?: string;
    itemName?: string;
    itemUuid?: string;
    userName?: string;
    tokendocUuid?: string;
    actorUuid: string;
    actorName?: string;
    /** Messages the use produced that aren't linked to its card (another module's rolls, a re-posted card) */
    chatCardUuids: string[];
    isReaction: boolean;
    /** When the GM started the entry (Date.now()): started entries whose use never finished are dropped */
    startedAt?: number;
    templateUuids: string[];
    sequencerUuid?: string;
    serverTime?: number;
    itemCardUuid?: string;
    actorEntry?: {
        actorUuid: string;
        tokenUuid?: string;
        actorData?: Actor.Source;
        tokenData?: TokenDocument.Source;
    };
    allTargets?: Collection<{
        tokenUuid: string;
        actorUuid: string;
        actorData?: Actor.Source;
        tokenData?: TokenDocument.Source;
    }>;
    targets?: {
        tokenUuid: string;
        actorUuid: string;
    }[];
};
/** unSuspend's (deprecated) argument */
type WorkflowContext = InexactPartial<{
    attackRoll: Roll;
    damageRoll: Roll;
    noDamage: boolean;
    otherDamageRoll: Roll;
    utilityRolls: Roll[];
}>;
type MidiMacroData = {
    actor?: Actor.Implementation;
    actorData?: Actor.Source;
    actorUuid?: string | null;
    advantage?: boolean;
    attackD20: number;
    attackRoll?: Roll;
    attackTotal: number;
    bonusDamageDetail?: DamageDescription[];
    bonusDamageRoll?: Roll;
    bonusDamageRolls?: Roll[];
    bonusDamageTotal?: number;
    castData: unknown;
    castLevel: number;
    criticalSaves: TokenDocument.Implementation[];
    criticalSaveUuids: (string | null)[];
    damageDetail?: DamageDescription[];
    damageList: DamageListEntry[];
    damageRoll?: Roll;
    damageRolls: Roll[];
    damageTotal: number;
    diceRoll: number;
    disadvantage?: boolean;
    event?: AugmentedEvent;
    failedSaves: TokenDocument.Implementation[];
    failedSaveUuids: (string | null)[];
    fumbleSaves: TokenDocument.Implementation[];
    fumbleSaveUuids: (string | null)[];
    hitTargets: TokenDocument.Implementation[];
    hitTargetsEC: TokenDocument.Implementation[];
    hitTargetUuids: (string | null)[];
    hitTargetUuidsEC: (string | null)[];
    /** The workflow's id (its card's uuid): undefined in a use's passes before its card exists */
    id: string | undefined;
    isCritical?: boolean;
    isFumble: boolean;
    item: Item.Source & {
        uuid?: string | null;
    };
    itemCardUuid?: string;
    itemData: Item.Source & {
        uuid?: string | null;
    };
    itemUuid?: string | null;
    macroPass?: string;
    options?: AnyObject;
    otherDamageDetail?: DamageDescription[];
    otherDamageTotal?: number;
    roll?: Roll;
    rollData: AnyObject;
    rollOptions: WorkflowRollOptions;
    saves: TokenDocument.Implementation[];
    saveUuids: (string | null)[];
    semiSuperSavers: TokenDocument.Implementation[];
    semiSuperSaverUuids: (string | null)[];
    sourceItemUuid?: string;
    speaker?: ChatMessage.SpeakerData;
    spellLevel: number;
    superSavers: TokenDocument.Implementation[];
    superSaverUuids: (string | null)[];
    tag?: string;
    targets: TokenDocument.Implementation[];
    targetUuids: (string | null)[];
    templateId?: string;
    templateUuid?: string;
    templateUuids?: string[];
    tokenUuid?: string | null;
    utilityRoll?: Roll;
    utilityRolls?: Roll[];
    uuid?: string;
    workflow: Workflow;
    workflowId: string | undefined;
    workflowOptions: WorkflowOptions;
};
export interface AugmentedEvent extends Event {
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    type: string;
}
/**
 * damageModifiers contributor "midi-qol.targetedBonuses": a use's damage bonuses chosen for particular targets
 * (rollBonuses stage 9), each added to its targets' damage only.
 */
export declare const targetedDamageBonusContributor: {
    stage: "bonus";
    for(query: {
        options: {
            midi?: {
                itemCardUuid?: string;
                targetUuid?: string;
            };
        };
    }): {
        types: string[];
        amount: number;
        label: string;
    }[] | undefined;
};
export {};
