import { type RangeCheckResult } from "./services/range/service.js";
import { type OfferedBonus } from "./services/rollBonuses/service.js";
import { DialogCountdown } from "./lib/dialogCountdown.js";
import { TokenDocumentSet } from "./lib/tokenDocumentSet.js";
import { AttributionEntry, AttributionMap, AugmentedEvent, Workflow, WorkflowOptions, WorkflowRollOptions } from "./Workflow.js";
import { Activity, ActivityUseConfiguration, MidiChangeData, DamageDescription, DamageListEntry, PreComputedAdvantageData, PreSetupDamageListEntry, RollDialogConfig, RollMessageConfig, TokenOrDocument, DND5ETargetDescriptor, SaveDetails } from "../globals.js";
import Token = foundry.canvas.placeables.Token;
import { AnyObject } from "fvtt-types/utils";
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
} | Activity;
export declare function midiFlag(flag: string): string;
export declare function getDamageType(flavorString?: string): string | undefined;
/**
*  Modifies the provided damageItem! For use during the isDamaged macro passes.
*/
export declare function modifyDamageBy({ damageItem, value, multiplier, type, reason }: {
    damageItem: DamageListEntry;
    value: number;
    multiplier: number;
    type: string;
    reason?: string;
}): {};
export declare function createDamageDetail({ roll, activity, defaultType }: {
    roll: Roll | Roll[];
    activity: Activity | null;
    defaultType: string;
}): DamageDescription[];
export declare function getOrCreateTokenForActor(actor?: Actor.Implementation): Token | undefined;
export declare function getOrCreateTokenForActorAsSet(actor: Actor.Implementation): Set<Token.Implementation>;
/**
 * Work out the appropriate multiplier for DamageTypeString on actor
 * If configSettings.damageImmunities are not being checked always return 1
 *
 */
export declare let getTraitMult: (actor: Actor.Implementation, dmgTypeString: string, item: Item.Implementation, damageProperties?: string[]) => number;
export declare function applyTokenDamage(damageDetail: DamageDescription[], totalDamage: number, theTargets: Set<TokenOrDocument>, item: Item.Implementation | null | undefined, saves: Set<TokenOrDocument>, options?: any): Promise<any[]>;
/**
 * Apply different damage/healing amounts to multiple targets, producing a single damage card.
 * Each entry specifies a token and its own damageDetail/totalDamage.
 * @param targetDamages Array of per-target damage specifications
 * @param item The item responsible for the damage (used for card display)
 * @param options Same options as applyTokenDamage (workflow, forceApply, updateOptions, etc.)
 */
export declare function applyTokenDamageMany(targetDamages: {
    token: TokenOrDocument;
    damageDetail: DamageDescription[];
    totalDamage: number;
}[], item: Item.Implementation | null | undefined, options?: any): Promise<any[]>;
export interface applyDamageDetails {
    label: string;
    damageDetail: any[];
    damageTotal: number;
    saves?: Set<Token | TokenDocument>;
    superSavers?: Set<Token | TokenDocument>;
    semiSuperSavers?: Set<Token | TokenDocument>;
}
/** Whether a damage detail heals: healing, or damage the target absorbs (Damage Absorption). Shared by the damage card's
 * figures and the damage's application so the two agree. */
export declare function detailHeals(d: DamageDescription): boolean;
export declare function calculateDamageAmounts(damageDetail: DamageDescription[]): {
    amount: number;
    temp: number;
    healing: number;
    vitality: number;
    tempMax: number;
};
/** What a damage detail does to these hit points, as midi applies it: the damage list's figures and the hit point update both come from here. */
export declare function hpChangeFromDetail(damageDetail: DamageDescription[], hp: {
    value: number;
    temp?: number | null;
    damage: number;
}): {
    totalDamage: number;
    change: number;
    temp: number;
    healing: number;
    vitality: number;
    tempMax: number;
    deltaTemp: number;
    deltaHP: number;
    newTempHP: number;
};
export declare function setupDamageDetails(actorDamage: PreSetupDamageListEntry, actor: Actor.Implementation): DamageListEntry | undefined;
/**
 * Shims for the fields 14.7.0 renamed or stopped storing on a damage entry, worked out from its one record and
 * warning once. Not enumerable, so copies and the card never carry them. Remove them by deleting this function's
 * body.
 */
export declare function withDeprecatedDamageFields<T extends DamageListEntry>(entry: T): T;
export declare function processDamageRoll(workflow: Workflow, defaultDamageType: string): Promise<void>;
export declare function getSaveMultiplierForActivity(activity: Activity): number;
/**
 * Whether an item's own damage is magical: a physical item's `magicAvailable` (false while attunement is missing or
 * under antimagic), anything else its Magical property. dnd5e gives every item `magicAvailable`, true for spells and
 * features, which would make all feature damage magical.
 */
export declare function itemMagicAvailable(item: Item.Implementation | null | undefined): boolean;
export declare function itemIsSpell(item: Item.Implementation | null | undefined): boolean;
/** Whether an item is magic for dnd5e's antimagic: a spell, or one with the Magical property */
export declare function itemIsMagical(item: Item.Implementation | null | undefined): boolean;
export declare const HEALING_BUTTON_KEY = "DND5E.HEAL.HealingButton.Full";
/**
 * A length in another unit (dnd5e's convertLength). No target unit keeps the value: dnd5e would pick the largest unit
 * that fits.
 */
export declare function convertLengthTo(value: number, from: string | undefined, to: string | undefined | null): number;
/**
 * Whether a calculated damage entry has an active change: on its type, on All Damage (modification), or on a
 * resistance matched by a filter, such as falling (`active.special`).
 */
export declare function damageActiveHas(damage: DamageDescription, flag: string): boolean;
/** The same for dnd5e 6.1's `potential` record (what would apply with nothing ignored or downgraded), or `active`. */
export declare function damageChangeHas(damage: DamageDescription, record: "active" | "potential", flag: string): boolean;
/**
 * Whether an activity is of a dnd5e activity type: that type, or one dnd5e 6.1 treats as it (`metadata.like`).
 * As `activity.isLike(type)`, but also for an activity's roll data (a roll's `data.activity`), which has no methods.
 */
export declare function isActivityType(activity: Activity | null | undefined, type: string): boolean;
export declare let getSaveMultiplierForItem: (item?: Item.Implementation | null, itemDamageType?: string) => number;
export interface pcSaveOptions {
    flavor: string;
    requestId: string;
    GMprompt: any;
    isMagicSave: boolean;
    rollAbilities?: string[];
    rollSkills?: string[];
    rollTools?: string[];
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
/**
 * Get the localized label for a tool from the compendium index.
 * dnd5e tools don't have a static `label` property like skills/abilities - their names come from compendium items.
 * @param toolId The tool identifier (e.g., "alchemist", "thief")
 * @returns The tool name, or the toolId as fallback if not found
 */
export declare function getToolLabel(toolId: string): string;
/**
 * Build an array of choice options for a multi-ability save/check dialog.
 * Each entry includes the ability ID, localized label, and formatted modifier string.
 */
export declare function buildRollChoices(actor: Actor.Implementation, rollType: "save" | "check" | "skill" | "tool", ids: string[], abilityFor?: (id: string) => string | undefined): {
    value: string;
    label: string;
    modifier: string;
}[];
export declare function selectBestRollChoice(rollChoices: {
    value: string;
    label: string;
    modifier: string;
}[], advantageMap?: Record<string, {
    hasAdvantage: boolean;
    hasDisadvantage: boolean;
}>): {
    value: string;
    label: string;
    modifier: string;
} | undefined;
export declare function requestPCSave(ability: string, rollType: string | undefined, player: string, actor: Actor.Implementation | null, options: pcSaveOptions): Promise<ChatMessage.Implementation | undefined> | undefined;
export declare function requestPCActiveDefence(player: User, actor: Actor, saveItemName: string, requestId: string, options: {
    formula: string;
    bonus: number;
    coverBonus: number;
    rollOptions: any;
    workflow: Workflow;
}): void;
export declare var midiFlagTypes: Record<string, string>;
export declare function setupMidiFlagTypes(): void;
export declare function midiCustomEffect(target: foundry.abstract.DataModel.Any, change: MidiChangeData & {
    effect?: ActiveEffect.Implementation;
}, current: unknown, delta: unknown, changes: unknown): boolean;
/** Untargets the user's targets at 0 hit points; with `only`, just those of them (a finished workflow's targets). */
export declare function untargetDeadTokens(only?: Set<TokenOrDocument>): void;
export declare function doOverTimeEffect(actor: Actor.Implementation, effect: ActiveEffect.Implementation, startTurn?: boolean, options?: any): Promise<any>;
export declare function doActivityOverTimeEffect(actor: Actor.Implementation, effect: ActiveEffect.Implementation, startTurn?: boolean, options?: any): Promise<any>;
export declare function localActivityOverTimeEffect(actor: Actor.Implementation, effect: ActiveEffect.Implementation, startTurn?: boolean, options?: any): Promise<void>;
/** Structured representation of count action (saveCount/failCount) */
export interface CountAction {
    count: number;
    mode: "remove" | "permanent";
    consecutive: boolean;
    effectSpec?: string;
}
/** Result of resolving an ItemMacro specification */
export interface ResolvedItemMacro {
    item: Item.Implementation;
    macroData: Macro.CreateData;
}
/** Result of resolving an ActivityMacro specification */
export interface ResolvedActivityMacro {
    item: Item.Implementation;
    activity: Activity;
    macro: Macro.Implementation;
}
/**
 * Resolve an ItemMacro specification to an item and its macro data.
 * Supports: "ItemMacro", "ItemMacro.itemName", "ItemMacro.itemUuid"
 *
 * @param macroSpec - The macro specification string (e.g., "ItemMacro.Fireball")
 * @param context - Context for resolution
 * @param context.actor - Actor to search for items by name
 * @param context.originItem - Default item to use when spec is just "ItemMacro"
 * @returns The resolved item and macro data, or undefined if not found
 */
export declare function resolveItemMacro(macroSpec: string, context: {
    actor?: Actor.Implementation;
    originItem?: Item.Implementation;
}): Promise<ResolvedItemMacro | undefined>;
/**
 * Resolve an ActivityMacro specification to an activity and its macro.
 * Supports: "ActivityMacro", "ActivityMacro.uuid", "ActivityMacro.identifier", "ActivityMacro.name", "ActivityMacro-id"
 *
 * @param macroSpec - The macro specification string (e.g., "ActivityMacro.cast")
 * @param context - Context for resolution
 * @param context.originItem - Item to search for activities
 * @param context.originActivity - Default activity to use when spec is just "ActivityMacro"
 * @returns The resolved item, activity and macro, or undefined if not found
 */
export declare function resolveActivityMacro(macroSpec: string, context: {
    originItem?: Item.Implementation;
    originActivity?: Activity;
}): Promise<ResolvedActivityMacro | undefined>;
export interface OvertimeDetails {
    turn: "start" | "end";
    label: string;
    rollType: "save" | "check" | "skill" | "damage";
    rollTypeString: string;
    saveAbility: string[];
    saveAbilityString: string;
    saveDC: number;
    saveMagic: boolean;
    damageRoll?: string;
    damageType: string;
    damageBeforeSave: boolean;
    saveDamage: "nodamage" | "halfdamage" | "fulldamage";
    saveCount?: CountAction;
    failCount?: CountAction;
    actionSave?: "dialog" | "roll";
    applyCondition?: string;
    removeCondition?: string;
    allowIncapacitated: boolean;
    killAnim: boolean;
    macro?: string;
    itemName?: string;
    chatFlavor: string;
    rollMode?: string;
    fastForwardDamage: boolean;
    fastForwardAttack: boolean;
    autoRollAttack: boolean;
    autoRollDamage: boolean;
}
/** Parse a boolean from overtime spec string */
export declare function parseBool(value: string | undefined, defaultValue: boolean): boolean;
/**
 * Parse "N" or "N[-+]options" syntax into structured CountAction
 * @param value - The raw string value (e.g., "2", "2-", "2+", "2-petrified", "2+prone")
 * @param defaultMode - Default mode if no action specified ("remove" for saves, "permanent" for fails)
 */
export declare function parseCountAction(value: string, defaultMode: "remove" | "permanent"): CountAction;
/**
 * Convert a CountAction back to its action string representation for storage
 * Format: [-+]effectSpec (e.g., "-", "+", "-petrified", "+prone")
 */
export declare function countActionToString(action: CountAction): string;
/** Effect stack count - flags.dae.stacks, or EffectCounter's per-token counter when present. */
export declare function getEffectStackCount(effect: ActiveEffect.Implementation | undefined, token?: TokenOrDocument): number;
/**
 * Split an OverTime spec into its raw fields. A field is `key=` at the start or straight after a "," or "#"; its value
 * runs to the next such field, so commas and "#" inside formulas, conditions and text stay in the value. A value that
 * starts with a quote runs to the matching quote.
 */
export declare function splitOvertimeSpec(spec: string): Record<string, string>;
export declare function parseOvertimeDetails(specString: string, rollData: Record<string, any>, effectName: string): OvertimeDetails | null;
/**
 * Serialize overtime form data back to a comma-separated OverTime spec string.
 * Only emits fields that differ from defaults, keeping the string concise.
 */
export declare function serializeOvertimeDetails(data: Record<string, any>): string;
/**
 * Build activity data for save/check/skill rolls
 */
export declare function buildRollActivityData(details: OvertimeDetails): Record<string, any>;
export declare function gmOverTimeEffect(actor: Actor.Implementation, effect: ActiveEffect.Implementation, startTurn?: boolean, options?: any): Promise<string | null | undefined>;
/**
 * A combatant's OverTime and ActivityOverTime effects at the start or end of its turn, driven by core's turn events,
 * which name the combatant rather than a position in the (possibly re-sorted) turn order.
 */
export declare function processTurnOverTime(combat: Combat.Implementation, combatant: Combatant.Implementation, startTurn: boolean): Promise<void>;
export declare function completeActivityUse(activityRef: Activity | string | undefined, usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<Workflow | undefined>;
/**
 * Workflow macro data that crossed a socket carries its token sets as uuid arrays; give it back the workflow's
 * token sets (targets, hitTargets, failedSaves, ...). Other values pass through.
 */
export declare function restoreWorkflowTokenSets<T>(data: T): T;
export type MidiOptions = {
    activityId?: string;
    /** Rolled for a player by someone who can't act for them (a player, with no GM connected): no optional-bonus prompts */
    unattended?: boolean;
    /** A save asked through the request core (lib/requests.ts): its roll is the one that claims the request */
    requestClaim?: string;
    cardNote?: SaveDetails["cardNote"];
    activityIdentifier?: string;
    advantage?: boolean;
    asUser?: User.Implementation | string;
    chatMessage?: boolean;
    checkGMstatus?: boolean;
    configureDialog?: boolean;
    critical?: number;
    disadvantage?: boolean;
    event?: AugmentedEvent;
    fastForward?: boolean;
    fastForwardAttack?: boolean;
    fastForwardDamage?: boolean;
    fastForwardHeal?: boolean;
    fastForwardSet?: boolean;
    fumble?: boolean | number;
    recomputeAdvantage?: boolean;
    ignoreUserTargets?: boolean;
    isConcentrationCheck?: boolean;
    isCritical?: boolean;
    isDummy?: boolean;
    isFumble?: boolean;
    isMagicSave?: boolean;
    isTriggered?: boolean;
    item?: Item.Implementation;
    itemCardUuid?: string;
    itemUuid?: string;
    noUseWarning?: boolean;
    parts?: string[];
    powerLevel?: number;
    proceedChecks?: {
        checkAoO?: boolean;
        checkBonusAction?: boolean;
        checkReaction?: boolean;
        none?: boolean;
    };
    rollAs?: Actor.Implementation | null;
    rollOptions?: WorkflowRollOptions;
    saveItem?: Item.Implementation;
    saveItemUuid?: string;
    saveActivityUuid?: string;
    simulate?: boolean;
    grantsActor?: Actor.Implementation;
    grantsToken?: TokenOrDocument;
    spellLevel?: number;
    target?: number;
    targets?: Set<TokenOrDocument>;
    targetsToUse?: Set<TokenOrDocument>;
    targetUuids?: string[];
    triggeredActivity?: boolean;
    addOptionalBonuses?: boolean;
    updateWorkflow?: boolean;
    workflow?: Workflow;
    workflowId?: string;
    workflowOptions?: WorkflowOptions;
    /** Multiple abilities available for a save/check (e.g., ["str", "dex"]) */
    rollAbilities?: string[];
    /** Multiple skills available for a skill check (e.g., ["ath", "acr"]) */
    rollSkills?: string[];
    /** Multiple tools available for a tool check (e.g., ["thief", "smith"]) */
    rollTools?: string[];
    /** Pre-computed advantage data per choice (ability/skill/tool), populated by Workflow.ts and deserialized by GMAction.
     *  A roll is always ONE type, so one object suffices for abilities, skills, or tools.
     */
    advantageByChoice?: Record<string, PreComputedAdvantageData>;
};
export declare function completeItemUse(itemRef: Item.Implementation | string, config?: ActivityUseConfiguration & {
    legacy?: boolean;
    chooseActivity?: boolean;
}, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
export declare function untargetAllTokens(combat: Combat.Implementation): void;
/**
 * Get the vitality item for an actor (a feature with uses that serves as a vitality pool)
 * @param actor The actor to get the vitality item for
 * @returns The vitality item if found, undefined otherwise
 */
export declare function getVitalityItem(actor: Actor.Implementation | null | undefined): Item.Implementation | undefined;
/**
 * Get the current vitality value for an actor
 * @param actor The actor to get vitality for
 * @returns The current vitality value, or undefined if no vitality system is configured
 */
export declare function getVitalityValue(actor: Actor.Implementation | null | undefined): number | undefined;
/**
 * Get the maximum vitality value for an actor
 * @param actor The actor to get max vitality for
 * @returns The maximum vitality value, or undefined if no vitality system is configured
 */
export declare function getVitalityMax(actor: Actor.Implementation | null | undefined): number | undefined;
/**
 * Check if the actor has a vitality system configured
 */
export declare function hasVitalitySystem(actor: Actor.Implementation | null | undefined): boolean;
export declare function checkDefeated(actorRef: Actor.Implementation | TokenOrDocument | string): 0 | 1;
export declare function checkIncapacitated(actorRef?: Actor.Implementation | TokenOrDocument | string | null, logResult?: boolean, warning?: boolean): string | false;
export declare function logIncapacitatedCheckResult(actorName: string, status: string, logResult?: boolean, warning?: boolean): void;
export declare function getUnitDist(x1: number, y1: number, z1: number, token2: any): number;
export declare function distancePointToken({ x, y, elevation }: {
    x: any;
    y: any;
    elevation?: number | undefined;
}, token: any, wallblocking?: boolean): number | undefined;
export declare function checkDistance(t1: any, t2: any, distance: number, options?: {
    wallsBlock?: boolean;
    includeCover?: boolean;
}): boolean;
/**
 * Get a token's perimeter as a PIXI.Polygon in world coordinates.
 * Uses token.getShape() for the actual shape (hex, circle, ellipse, rectangle)
 * and translates from local to world coordinates.
 */
export declare function getTokenPerimeterPolygon(token: Token): PIXI.Polygon;
/**
 * Find the closest point on a polygon's perimeter to a given point.
 * Uses foundry.utils.closestPointToSegment for each edge.
 * @param polygon - The polygon (in world coordinates, closed or open)
 * @param px - X coordinate of the point
 * @param py - Y coordinate of the point
 * @returns The closest point on the polygon's perimeter
 */
export declare function closestPointOnPerimeter(polygon: PIXI.Polygon, px: number, py: number): {
    x: number;
    y: number;
};
/**
 * Compute the closest points on two polygon perimeters.
 * @param poly1 - First polygon (in world coordinates)
 * @param poly2 - Second polygon (in world coordinates)
 * @returns The closest points on each polygon's perimeter
 */
export declare function closestPerimeterPoints(poly1: PIXI.Polygon, poly2: PIXI.Polygon): {
    p1: {
        x: number;
        y: number;
    };
    p2: {
        x: number;
        y: number;
    };
};
/**
 * Options for wall collision checking.
 */
export interface WallCollisionOptions {
    /** Source document for the collision check (typically token document) */
    source?: any;
    /** The wallsBlockRange setting value */
    wallsBlockRange: string;
    /** Pre-computed cover visibility (from external modules like levelsautocover) */
    coverVisible?: boolean;
    /** Origin point elevation (for Levels API) */
    originElevation?: number;
    /** Destination point elevation (for Levels API) */
    destElevation?: number;
    /** Origin top elevation (for Levels API) */
    originTopElevation?: number;
    /** Destination top elevation (for Levels API) */
    destTopElevation?: number;
}
/**
 * Compute the effective elevation for a token based on its vision height flags/setting.
 */
export declare function getTokenVisionElevation(token: Token.Implementation, flagName: "visionSourceHeight" | "visionTargetHeight"): number;
/** A token's level, for collision tests: core tests the viewed level unless given one. */
export declare function collisionLevel(token: Token.Implementation | TokenDocument.Implementation | null | undefined): Level | null;
export declare function checkWallCollision(origin: {
    x: number;
    y: number;
}, dest: {
    x: number;
    y: number;
}, options: WallCollisionOptions): boolean;
/**
 * Compute the minimum grid distance between two token perimeters.
 * This finds the closest points on each token's bounding rectangle perimeter
 * and measures the grid distance between them.
 *
 * @param t1 - First token (or token reference)
 * @param t2 - Second token (or token reference)
 * @param options - Options for distance calculation
 * @returns The grid distance between perimeters, or -1 if blocked/invalid
 */
/**
 * Check if two token shapes overlap.
 * Uses bounding box check then centroid containment for convex shapes.
 */
export declare function shapesOverlap(poly1: PIXI.Polygon, poly2: PIXI.Polygon): boolean;
/**
 * Whether the selected wall check's cover module says the target is walled off. Only AutoCover is asked, when walls
 * block and cover counts: its total cover follows movement walls. Simple Cover's and Alternative Token Cover's total
 * cover follows sight (a curtain would block an attack, a window wouldn't), so with them, as without a module, midi's
 * movement wall rays decide (`coverVisible` undefined).
 */
export declare function computeWallBlockPreCheck(t1: Token.Implementation, t2: Token.Implementation, wallsBlock: boolean, includeCover: boolean): {
    blocked: boolean;
    coverVisible?: boolean | undefined;
};
/** A point standing in for an attacker (a template's origin for Simple Cover) */
export type CoverPoint = {
    center: {
        x: number;
        y: number;
    };
    elevation?: number;
};
/** The target's test points for wall rays: its centre and two rings around it (as _canSenseModes) */
export declare function wallTestPoints(target: Token.Implementation): PIXI.Point[];
/**
 * Total cover from walls: every line from the attacker (or the point it stands for, a template's origin) to the
 * target's test points crosses a wall that blocks movement, or a surface. Whatever the wall check setting.
 */
export declare function wallsGiveTotalCover(attacker: Token.Implementation | CoverPoint, target: Token.Implementation): boolean;
/**
 * Measure point-to-point distance using the current grid mode.
 * On gridless scenes with griddedGridless enabled, uses the SquareGrid proxy.
 * Otherwise uses canvas.grid.measurePath directly.
 */
export declare function measurePointDistance(p1: {
    x: number;
    y: number;
}, p2: {
    x: number;
    y: number;
}): number;
export declare function rangeToSceneUnits(value: number | undefined | null, units: string | undefined | null): number;
/**
 * Get the perimeter-based distance from a token to a point, with gridification.
 * This applies the same gridification formula as getDistance in perimeter mode:
 *   distance = gridDistance + max(0, rawDistance - fudgeFactor)
 * Used for template placement range checks and clamping, always measuring from perimeter.
 * @param token - The token to measure from
 * @param point - The destination point
 * @returns The gridified distance, or -1 if invalid, or 0 if point is inside the token
 */
export declare function getPerimeterDistanceToPoint(token: Token, point: {
    x: number;
    y: number;
}): number;
/**
 * Get the distance between two tokens using the configured measurement method.
 * This is the main token-to-token distance function used throughout midi-qol.
 * It respects the configSettings.optionalRules.distanceMeasurement setting.
 *
 * For token-to-point distance (e.g. template placement), use getPerimeterDistanceToPoint() instead.
 *
 * @param t1 - First token (or token reference)
 * @param t2 - Second token (or token reference)
 * @param options - Options for distance calculation
 * @returns The distance between the tokens, or -1 if invalid/blocked
 */
/**
 * The committed position of a token, ignoring any movement animation in flight.
 *
 * Both `token.center` and `token.document.x` interpolate while a move animates: measured during a
 * three-square move, document.x reported 3210, 3300 and 3410 before finally reaching 3500, and
 * `move()` itself resolves at 3410 — before arrival. `movement.state` reads "completed" throughout,
 * so it cannot be used as a gate either. Measuring range mid-animation therefore uses a square the
 * token merely passed through, and an attack made straight after moving is rejected as out of range
 * from the *old* position.
 *
 * `_source` holds the destination from the moment the database write lands and never interpolates,
 * which is why core reads it too - see Token#checkCollision, which derives its origin as
 * `getMovementOrigin(this.document._source)`.
 *
 * Note this is committed state, not intended state: in the few milliseconds between calling move()
 * and the write landing, `_source` is still the origin, and during an uncommitted drag preview it
 * remains the pre-drag position. Both are the correct answer to "where is this token now".
 *
 * Elevation, width and height animate the same way, and a background tab never applies the drawn
 * position at all: `token.x`/`token.y` read 0 there.
 */
export declare function tokenSourcePosition(tokenRef: any): {
    x: number;
    y: number;
    elevation: number;
    width: number;
    height: number;
};
/** Centre of a token at its committed position. */
export declare function tokenSourceCenter(tokenRef: any): {
    x: number;
    y: number;
};
/** Elevation of a token at its committed position. */
export declare const tokenSourceElevation: (tokenRef: any) => number;
/** The token whose space a token occupies: its mount's (followed to the outermost mount) under *Mounted creatures use their mount's space*. */
export declare function spaceToken(token: any): any;
/**
 * Whether an attack is one the range rules bite on: a ranged attack, or a melee weapon being thrown.
 *
 * Shared so the caller deciding whether to check and the branch deciding what a failure means agree
 * about what counts. They did not, and a javelin fell through the gap in both.
 */
export declare function isRangeCheckable(activity: Activity): boolean;
/**
 * The normal and long range of an activity, in the activity's own units.
 *
 * An activity that does not set its own range reports `range.value` as the furthest usable
 * distance — for a weapon, its long range — so reading that as the normal range makes the two equal
 * and leaves the long-range disadvantage unreachable: everything beyond normal range is also beyond
 * `range`, and the out-of-range test above it has already returned. Measured, no weapon in the game
 * was ever getting disadvantage past its short range, an archer included. The true pair survives on
 * the item.
 *
 * Spells are unaffected either way: a spell's own range is its real one and it has no long range,
 * so the derived value already agrees.
 */
export declare function activityRanges(activity: Activity): {
    normal: number;
    long: number;
};
/** Whether an activity's targets are in range: asks the range service's provider (midi's: midiActivityRange) */
export declare function checkActivityRange(activityIn: Activity, tokenRef: TokenOrDocument | string | undefined, targetsRef: Set<TokenOrDocument | string> | undefined, showWarning?: boolean): RangeCheckResult;
export declare const TOTAL_COVER: number;
export declare let THREE_QUARTERS_COVER: number;
export declare let HALF_COVER: number;
/** Initialize cover constants from CONFIG.DND5E.statusEffects. Call after dnd5e init. */
export declare function initCoverConstants(): void;
/** A position to evaluate cover from, in scene pixels, as `TokenDocument#x`/`y` are. */
export type CoverPosition = {
    x: number;
    y: number;
    elevation?: number;
};
/** The targets an activity that needs targets it can see is used against that its token can't see */
export declare function unseenTargets(activity: Activity, token: TokenOrDocument | undefined, targets: Iterable<TokenOrDocument>): TokenOrDocument[];
/** Warn about targets the activity needs to see and can't; false when *Targets you can see* is enforced and one isn't seen */
export declare function checkTargetsSeen(activity: Activity, token: TokenOrDocument | undefined, targets: Iterable<TokenOrDocument>): boolean;
/**
 * The targets with total cover, which can't be targeted: with *Cover calculation* set, the Total Cover status, or a cover
 * module's total cover. None with *Ignore total cover*.
 */
export declare function totalCoverTargets(activity: Activity, token: TokenOrDocument | undefined, targets: Iterable<TokenOrDocument>): TokenOrDocument[];
/** Warn about targets with total cover; false if there are any */
export declare function checkTotalCover(activity: Activity, token: TokenOrDocument | undefined, targets: Iterable<TokenOrDocument>): boolean;
/** Check if an actor has the coverTotal status (impossible to hit). */
export declare function hasCoverTotal(actor: Actor | null | undefined): boolean;
/**
 * Get the effective cover bonus for a target, from any source.
 * Returns the higher of the dnd5e status-based cover and the module-computed cover.
 */
export declare function getCoverBonus(attacker: TokenOrDocument, target: TokenOrDocument, activity?: Activity): number;
/**
 * A view of a token as though it stood somewhere else.
 *
 * Every cover backend answers for a token at its current position, which is no help to anything
 * asking "what cover would the target have if I attacked from over there?" — a planner choosing
 * between squares, a ruler preview, a macro weighing a move. Moving the token to ask is not an
 * option: it is a document update, it is visible, and it is wrong if anything throws in between.
 *
 * So the token is presented at the position instead. Geometry is overridden and everything else —
 * actor, scene, flags, methods — forwards to the real token, because a backend may read any of it.
 */
export declare function tokenAtPosition(token: Token.Implementation, position: CoverPosition): Token.Implementation;
/**
 * Returns the raw cover bonus from the configured cover module.
 * Does NOT check cover statuses, apply attack-specific reductions (sharpshooter, etc.),
 * or reconcile with status-based cover.
 *
 * `options.position` asks the question from a square the attacker is not standing on, in scene
 * pixels and measured from the token's top-left corner as `TokenDocument#x`/`y` are. The configured
 * cover backend still supplies the answer, so a caller planning a move gets the same number the
 * attack will later be resolved with rather than a second opinion of its own.
 */
type AutoCoverTier = "none" | "half" | "threeQuarters" | "total";
/**
 * AutoCover's (levelsautocover 5.0.1+) cover tier from the attacker, or from `origin` (a template's), to the target:
 * undefined when AutoCover isn't in use or fails, so the caller carries on without it. A failure warns once.
 */
export declare function autoCoverTier(attacker: TokenOrDocument | undefined, target: TokenOrDocument, origin?: CoverPosition): AutoCoverTier | undefined;
export declare function computeCoverBonus(attackerIn: TokenOrDocument | undefined, targetIn: TokenOrDocument, activity?: Activity, options?: {
    position?: CoverPosition;
    origin?: CoverPosition;
}): number;
/**
 * Result of computing the effective AC for a target in an attack.
 */
export interface TargetACResult {
    effectiveAC: number;
    baseAC: number;
    statusCoverBonus: number;
    moduleCoverBonus: number;
    appliedCoverDelta: number;
    effectiveCoverBonus: number;
    coverIgnored: boolean;
    targetACMod: number;
}
/**
 * Compute the effective AC for a target, reconciling status-based cover with module-computed
 * cover (status acts as minimum), applying attack-specific reductions (ignoreFullCover,
 * sharpShooter, spellSniper, ignoreCover), and incorporating targetACMod.
 */
export declare function computeTargetAC(attacker: Token, target: Token, activity: Activity | undefined, options?: {
    ignoreCover?: boolean;
    targetACMod?: number;
}): TargetACResult;
export type FastForwardRollType = "attack" | "damage" | "check" | "save" | "skill" | "tool";
export declare function isAutoFastForward(rollType: FastForwardRollType, { workflow, user }?: {
    workflow?: Workflow;
    user?: User;
}): boolean;
export declare function autoConsumeResource(workflow?: Workflow): string;
/** Consumption deltas from a ChatMessage (`system.deltas`) or a messageConfig (`data.system.deltas`). */
export declare function getConsumptionData(source: any): any;
export declare function getAutoRollDamage(workflow?: Workflow): string;
export declare function getAutoRollAttack(workflow?: Workflow): boolean;
/**
 * The roll type of a chat message, derived from dnd5e 6's message sub-type and system data, in the
 * vocabulary midi's callers compare against ("save", "death", "skill", "tool", "ability", ...).
 * Accepts a document or raw create data.
 */
export declare function dnd5eRollType(source: any): string | undefined;
/** Whether a message is one of dnd5e's roll cards rather than an item/usage card. */
/** What a chat-card save request asks for: the roll that answers it */
export type SaveRequestKind = {
    rollType: string;
    abilities: string[];
    skills: string[];
    tools: string[];
};
/**
 * Whether a dnd5e roll message answers a save request: the right kind of roll, and one of the requested abilities, skills
 * or tools (a choice allows any of them). A skill or tool is matched by itself: dnd5e lets it be rolled with another ability.
 */
export declare function rollAnswersRequest(message: ChatMessage.Implementation, kind: SaveRequestKind): boolean;
export declare function isDnd5eRollMessage(source: any): boolean;
export declare function getRemoveAllButtons(activity?: Activity): boolean;
export declare function getRemoveAttackButtons(activity?: Activity): boolean;
export declare function getRemoveDamageButtons(activity?: Activity): boolean;
export declare function getReactionSetting(player?: User.Implementation | null): string;
export declare function getTokenPlayerName(token: TokenOrDocument, checkGM?: boolean): string | undefined;
export declare function getTokenPlayerNameForUser(user: User.Implementation, token: TokenOrDocument, checkGM?: boolean): string | undefined;
/**
 * The name the current user is shown for a token (or an actor's token) on a card: as stored for the GM and the
 * token's owners, otherwise as the name-hiding module (Anonymous, Hide NPC Names) or "Hide NPC names" has it.
 */
export declare function displayTokenName(uuid: string | undefined, name: string): string;
export declare function getSpeaker(actor: Actor.Implementation): ChatMessage.SpeakerData;
type FindNearbyOptions = {
    maxSize?: number;
    includeIncapacitated?: boolean;
    canSee?: boolean;
    isSeen?: boolean;
    includeToken?: boolean;
    relative?: boolean;
};
export declare function findNearbyCount(disposition: number | string | null | Array<string | number>, token: Token.Implementation | string, distance: number, options?: FindNearbyOptions): number;
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
export declare function findNearby(disposition: number | string | null | Array<string | number>, tokenRef: Token.Implementation | string, distance: number, options?: FindNearbyOptions): Token[];
export declare function checkNearby(disposition: number | null | string, tokenRef: TokenOrDocument | string | undefined, distance: number, options?: FindNearbyOptions): boolean;
export declare function hasCondition(actorRef: Actor.Implementation | TokenOrDocument | string | undefined | null, condition: string): 0 | 1;
export declare function removeInvisibleCondition(tokenRef?: TokenOrDocument | string): Promise<void>;
export declare function removeHiddenCondition(tokenRef?: TokenOrDocument | string): Promise<void>;
export declare function removeTokenConditionEffect(token: Token.Implementation, condition: string): Promise<void>;
export declare function expireMyEffects(this: Workflow, effectsToExpire: string[]): Promise<void>;
export declare function expireRollEffect(this: Actor.Implementation, rolltype: string, abilityId: string, success?: boolean): Promise<void>;
/** The members that can be targets (with an actor, not a group…): every member of a token set, with a canvas token or not */
export declare function validTargetTokens(tokens?: Iterable<TokenOrDocument>): TokenDocumentSet;
/**
 * The user's targets, keeping those of `current` with no canvas token (on another level, reached through an opening in
 * a floor): they can't be the user's targets, so re-reading the user's must not drop them.
 */
export declare function userTargetsKeepingUndrawn(current?: Iterable<TokenOrDocument>): Set<TokenOrDocument>;
export declare function fromActorUuid(uuid?: string): Actor.Implementation | null;
export declare function actorFromUuid(uuid?: string): any;
declare const RollModifyDialog_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class RollModifyDialog extends RollModifyDialog_base {
    rollExpanded: boolean;
    timeRemaining: number;
    countdown: DialogCountdown;
    aborted: boolean;
    data: {
        actor: Actor.Implementation;
        flags: string[];
        flagSelector: string;
        targetObject: any;
        title: string;
        content: HTMLElement | string;
        currentRoll: Roll;
        rollHTML: string;
        callback: () => {};
        close: () => {};
        buttons: any;
        rollMode: string | undefined;
        timeout: number;
        item: Item | undefined;
        flagOwners?: Record<string, any>;
        /** rollBonuses contributors' optional bonuses, shown after the flag buttons */
        candidates?: OfferedBonus[];
        onCandidate?: (dialog: RollModifyDialog, button: {
            candidate: OfferedBonus;
        }) => Promise<void>;
    };
    constructor(data: any);
    static PARTS: {
        dialog: {
            id: string;
            classes: string[];
            template: string;
        };
    };
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    get title(): string;
    _onRender(context: any, options: any): Promise<void>;
    _prepareContext(options: any): Promise<{
        content: string | HTMLElement;
        buttons: any;
        tabs?: Record<string, import("fvtt-types/src/foundry/client/applications/api/application.mjs").default.Tab>;
    }>;
    _onDiceRollClick(event: Event): void;
    _onClickButton(event: Event): void;
    submit(button: any): Promise<void>;
    close(): Promise<void | this>;
}
export declare function rollModeToMessageMode(rollMode?: string): string | undefined;
/** ChatMessage.getSpeaker for any actor or token: Foundry handles unsaved ones, fvtt-types only declares stored documents. */
export declare function speakerFor(options: {
    actor?: Actor.Implementation | null;
    token?: TokenDocument.Implementation | Token.Implementation | null;
    scene?: Scene.Implementation | null;
    alias?: string;
}): ChatMessage.SpeakerData;
/** Whether a message mode is one of Foundry 14's (CONFIG.ChatMessage.modes); a legacy roll-mode name is not. */
export declare function isMessageMode(mode: string | undefined): mode is ChatMessage.Mode;
export declare function toMessageMode(mode?: string): string;
export declare function toLegacyRollMode(mode?: string): string;
export declare function bonusDialog(bonusFlags: string[], flagSelector: string, showRoll: boolean, title: string, roll: Roll | undefined, rollType: string, options?: any): Promise<Roll | undefined>;
export declare function getOptionalCountRemainingShortFlag(actor: Actor.Implementation, flag: string, owner?: any): any;
export declare function getOptionalCountRemaining(actor: Actor.Implementation, flag: string, owner?: any): any;
export declare function removeEffectGranting(actor: Actor.Implementation, changeKey: string): Promise<any>;
export declare function hasEffectGranting(actor: Actor.Implementation, key: string, selector: string, owner?: any): {} | null;
export declare function maxCastLevel(actor: Actor.Implementation): any;
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
export declare function doReactions(targetRef: TokenOrDocument | string, triggerTokenRef: string | null | undefined, triggeringRoll: Roll | null | undefined, triggerType: string, options?: any): Promise<{
    name?: string;
    uuid?: string;
    ac?: number;
    itemName?: string;
}>;
export type ReactionResult = {
    name?: string;
    uuid?: string;
    ac?: number;
    itemName?: string;
    itemUuid?: string;
};
/** The request type a reacting client answers (GMAction registers its handler) */
export declare const REACTIONS_REQUEST = "midi-qol.reactions";
export declare function promptReactions(tokenUuid: string, reactionActivityList: ReactionItemReference[], triggerTokenUuid: string | undefined, reactionFlavor: string, triggerType: string, options?: any): Promise<any>;
export declare function playerFor(target?: TokenOrDocument | null): User | null | undefined;
export declare function playerForActor(actor?: Actor | null): User | undefined;
/**
 * A GM using an item for a creature whose token is on a scene they aren't viewing: other modules' reaction checks
 * (Gambit's Premades), animations and placement only look at the scene being viewed. View that scene first ("viewed"),
 * use it anyway ("use"), or don't ("cancel"); "here" when there is nothing to ask.
 */
export declare function confirmUseOffScene(actor: Actor.Implementation | null | undefined): Promise<"here" | "viewed" | "use" | "cancel">;
export declare function reactionDialog(actor: Actor.Implementation, triggerTokenUuid: string | undefined, reactionActivities: Activity[], rollFlavor: string, triggerType: string, options?: any): Promise<unknown>;
declare const ReactionDialog_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class ReactionDialog extends ReactionDialog_base {
    /** Closed because the GM answered for the player (not the player's own decline). */
    closedForGM?: boolean;
    startTime: number;
    endTime: number;
    countdown: DialogCountdown | undefined;
    timeRemaining: number;
    data: {
        actor: Actor.Implementation;
        /** The reacting token: its name titles the dialog */
        tokenUuid?: string;
        activities: Activity[];
        title: string;
        content: HTMLElement;
        callback: () => {};
        close: () => void;
        buttons: any;
        completed: boolean;
        timeout: number;
        timeRemaining: number;
        /** The request's display-only countdown; null: the request has no deadline; undefined: its own (a direct call) */
        countdown?: DialogCountdown | null;
    };
    constructor(data: any);
    static PARTS: {
        dialog: {
            id: string;
            classes: string[];
            template: string;
        };
    };
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    get title(): string;
    _onRender(context: any, options: any): Promise<void>;
    _prepareContext(options: any): Promise<{
        content: HTMLElement;
        buttons: any;
        timeRemaining: number;
        tabs?: Record<string, import("fvtt-types/src/foundry/client/applications/api/application.mjs").default.Tab>;
    }>;
    _onClickButton(event: Event): Promise<void | this> | undefined;
    submit(button: any): Promise<void>;
    close(): Promise<void | this>;
}
/**
 *
 * @param actor the actor to check
 * @param itemRef the item to check. An item, an item uuid or an item name.
 * @returns the concentration effect if present and null otherwise
 */
export declare function getConcentrationEffect(actor?: Actor.Implementation | null, itemRef?: Item.Implementation | string): ActiveEffect.Implementation | undefined;
export declare function evalReactionActivationCondition(workflow: Workflow, condition: string | undefined | boolean, target: TokenOrDocument, options?: any): Promise<boolean>;
export declare function evalActivationCondition(workflow: Workflow | undefined, condition: string | undefined | boolean, target?: TokenOrDocument, options?: any): Promise<boolean>;
export declare function typeOrRace(entity: TokenOrDocument | Actor | string): string;
export declare function sizeNumeric(size: string): number | undefined;
export declare function raceOrType(entity: TokenOrDocument | Actor | string): string;
/**
 * Collects damage types from damage rolls and updates `rollData` if provided,
 * otherwise returns the computed result.
 *
 * @param damageRolls.
 * @param rollData Optional object to which damageTypes and defaultDamageType will be assigned.
 * @returns Void if `rollData` is provided; otherwise an object containing `damageTypes` and `defaultDamageType`.
 */
export declare function collectDamageTypes(damageRolls?: {
    options?: {
        type?: string;
    };
    parts?: string[];
}[], activity?: Activity, rollData?: {
    damageTypes?: {
        [key: string]: boolean;
    };
    defaultDamageType?: {
        [key: string]: boolean;
    };
    [key: string]: any;
}): void | {
    damageTypes: {
        [key: string]: boolean;
    };
    defaultDamageType?: {
        [key: string]: boolean;
    };
};
export declare function createConditionData(data: {
    workflow?: Workflow;
    target?: TokenOrDocument | Actor | string;
    actor?: Actor.Implementation | null;
    item?: Item | string;
    extraData?: any;
    activity?: Activity;
    tokenUuid?: string;
    targetUuid?: string;
    options?: any | undefined;
    token?: TokenOrDocument;
    effect?: ActiveEffect.Implementation;
}): any;
export declare function evalAllConditionsAsync(actorRef: TokenOrDocument | Actor | string | undefined | null, flag: string, conditionData: AnyObject, errorReturn?: any): Promise<any>;
export declare function evalAllConditions(actorRef: TokenOrDocument | Actor | string, flag: string, conditionData: any, errorReturn?: any): any;
/**
 * Check magic resistance and vulnerability for an actor
 * @param actor The actor to check
 * @param rollAbility The ability being used for the save (optional, for ability-specific flags)
 * @param conditionData Condition data for flag evaluation (optional, will be created if not provided)
 * @returns Object with advantage, disadvantage, magicResistance, and magicVulnerability flags
 */
export declare function checkMagicResistanceAndVulnerability(actor: Actor.Implementation | undefined | null, rollAbility?: string | null, conditionData?: ReturnType<typeof createConditionData>): Promise<{
    advantage: boolean | undefined;
    disadvantage: boolean | undefined;
    magicResistance: boolean;
    magicVulnerability: boolean;
}>;
export declare function evalCondition(condition: string | number | boolean | undefined, conditionData: any, options?: any): any | Promise<any>;
export declare function computeTemplateShapeDistance(templateDocument: MeasuredTemplateDocument): {
    shape: undefined;
    distance: number;
} | {
    shape: import("fvtt-types/src/types/augments/pixi.mjs").Polygon | import("fvtt-types/src/types/augments/pixi.mjs").Rectangle | import("fvtt-types/src/types/augments/pixi.mjs").Circle;
    distance: number;
};
export declare function notificationNotify(wrapped: any, ...args: any[]): any;
export declare function enableNotifications(enable: boolean): void;
export declare function getStatusName(statusId: string | undefined): string;
export declare function getWoundedStatus(): ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> | CONFIG.StatusEffect | null | undefined;
export declare function getUnconsciousStatus(): ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> | CONFIG.StatusEffect | null | undefined;
export declare function getDeadStatus(): ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> | CONFIG.StatusEffect | null | undefined;
export declare function getVitalityDeadStatus(): ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> | CONFIG.StatusEffect | null | undefined;
export declare function ConvenientEffectsHasEffect(effectName: string, actor: Actor.Implementation, ignoreInactive?: boolean): boolean;
export declare function isInCombat(actor: Actor.Implementation): boolean;
export declare function setActionUsed(actor: Actor.Implementation): Promise<void>;
export declare function setReactionUsed(actor: Actor.Implementation, active?: boolean): Promise<void>;
export declare function setBonusActionUsed(actor: Actor.Implementation): Promise<void>;
export declare function removeActionUsed(actor: Actor.Implementation): Promise<any>;
export declare function removeReactionUsed(actor: Actor.Implementation, force?: boolean): Promise<void>;
export declare function hasUsedAction(actor: Actor.Implementation): boolean | undefined;
export declare function hasUsedReaction(actor: Actor.Implementation): boolean;
/** dnd5e 6.1's No Reactions marker (an empty effect from its effects compendium), by its source or icon */
export declare function hasNoReactionsMarker(actor: Actor.Implementation | null | undefined): boolean;
export declare function hasUsedAnyReaction(actor: Actor.Implementation): boolean;
export declare function expirePerTurnBonusActions(combat: Combat.Implementation, data: Combat.RoundUpdateData | Combat.TurnUpdateData, _options?: Combat.RoundUpdateOptions | Combat.TurnUpdateOptions): Promise<void>;
export declare function hasUsedBonusAction(actor: Actor.Implementation): boolean;
export declare function removeBonusActionUsed(actor: Actor.Implementation, force?: boolean): Promise<void>;
export declare function setupMarkerChecks(): void;
export declare function needsReactionCheck(actor: Actor.Implementation): boolean;
export declare function needsAOOCheck(actor: Actor.Implementation): boolean;
export declare function needsBonusActionCheck(actor: Actor.Implementation): boolean;
export declare function asyncHooksCallAll(hook: string, ...args: any[]): Promise<boolean | undefined>;
/**
 * Call a cancellable midi hook with all standard variants:
 * base, .item.uuid, .activity.uuid, and premades equivalents.
 * Returns false if any hook returns false (short-circuits).
 */
export declare function callActivityHooks(activity: {
    uuid: string | null;
    item: {
        uuid: string | null;
    };
}, hookName: string, ...args: any[]): Promise<boolean>;
export declare function asyncHooksCall(hook: string, ...args: any[]): Promise<boolean | undefined>;
/**
 * Convert an AttributionMap to an array of AttributionEntry for display.
 * @param map - The attribution map (type -> source -> displayName)
 * @returns Array of AttributionEntry objects
 */
export declare function attributionMapToArray(map: AttributionMap): AttributionEntry[];
/**
 * Add structured attribution to a roll for tooltip display.
 * @param roll - The roll to add attribution to
 * @param attributions - AttributionMap (type -> source -> displayName)
 */
export declare function addAttribution(roll: Roll, attributions: AttributionMap): void;
/**
 * Get localized title for a resolved d20 advantage mode.
 * @param mode - Resolved roll advantage mode (`-1` DIS, `0` NORMAL, `1` ADV)
 * @returns Localized title string
 */
export declare function getAdvantageModeTitle(mode: number | null | undefined): string;
/**
 * Render an attribution tooltip HTML from an AttributionMap.
 * @param attributions - The attribution map (type -> source -> displayName)
 * @param title - Optional title for the tooltip (e.g., "Advantage" or "Disadvantage")
 * @returns Promise resolving to the rendered HTML string
 */
/**
 * The attribution info icon for a roll, built from the entries the roll already carries.
 *
 * `addAttribution` stores the same array on `roll.options.attributions` that
 * `renderAttributionTooltip` derives from the map, so the icon can be produced at render time from
 * the persisted roll instead of being baked into the card. The escaped tooltip is around 550 bytes —
 * on a card whose whole attack section is now 40, it was the largest thing left in it.
 */
/**
 * A save roll as the saves section shows it: the roll, prefixed with which ability, skill or tool
 * was chosen when the target had a choice.
 *
 * Shared so the card can rebuild it from `message.rolls` instead of storing it — the rendered form
 * measured 1,036 B per target, the largest single field on a save card.
 */
export declare function renderSaveRollHTML(roll: Roll | undefined): Promise<string>;
export declare function renderRollAttributionIcon(roll: Roll | undefined): Promise<string>;
export declare function renderAttributionTooltip(attributions: AttributionMap, title?: string): Promise<string>;
export declare function midiRenderRoll(roll: Roll): Promise<string>;
export declare function midiRenderAttackRoll(roll: Roll, options?: any): Promise<string>;
export declare function midiRenderDamageRoll(roll: Roll, options?: any): Promise<string>;
export declare function midiRenderOtherDamageRoll(roll: Roll, options?: any): Promise<string>;
export declare function midiRenderBonusDamageRoll(roll: Roll, options?: any): Promise<string>;
export declare function midiRenderFormulaRoll(roll: Roll, options?: any): Promise<string>;
/**
 * Render a damage section's rolls as one block rather than one block per roll.
 *
 * dnd5e aggregates damage for display (`CONFIG.DND5E.aggregateDamageDisplay`) and midi follows that
 * flag rather than adding its own: `aggregateDamageRolls` merges the rolls by damage type, and each
 * merged roll's `aggregateTerms()` supplies the breakdown `_simplifyDamageRoll` used to - that method
 * was removed in 6.0. The result is one formula, one total and one icon per damage type, which is
 * what the card showed before the rolls were stored individually.
 */
export declare function midiRenderAggregatedDamageRolls(rolls: Roll[], template: string, options?: any): Promise<string>;
export declare function midiRenderDamageRolls(rolls: Roll[], options?: any): Promise<string>;
export declare function midiRenderOtherDamageRolls(rolls: Roll[], options?: any): Promise<string>;
export declare function midiRenderBonusDamageRolls(rolls: Roll[], options?: any): Promise<string>;
export declare function midiRenderTemplateRoll(roll: Roll | undefined, template: string, options?: any): Promise<string>;
export declare function getFlankingEffect(): ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> | null | undefined;
export declare function getFlankedEffect(): ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> | null | undefined;
export declare function getReactionEffect(): ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> | undefined;
export declare function getBonusActionEffect(): ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> | undefined;
export declare function markFlanking(token?: Token.Implementation | null, target?: Token.Implementation | null): Promise<boolean>;
export declare function chackFlanking(user: User.Implementation, target: Token.Implementation, targeted: boolean): Promise<boolean>;
/**
 * Update the flanking highlight overlay. Called when token selection or targeting changes.
 * Highlights grid cells around the current target where an ally could stand to create
 * a flanking condition with the currently selected token using icon sprites.
 */
export declare function updateFlankingHighlight(): Promise<void>;
export declare function getChanges(actorOrItem: Actor.Implementation | Item.Implementation, key: string): any[];
/**
 *
 * @param token
 * @param target
 *
 * @returns {boolean}
 */
/** `forceVision` checks a token without sight as if it had sight, whatever *Force vision when checking* is set to. */
export interface SenseOptions {
    forceVision?: boolean;
}
export declare function canSense(tokenEntity: TokenOrDocument | string, targetEntity: TokenOrDocument | string, validModes?: Array<string>, options?: SenseOptions): boolean;
export declare function canSenseModes(tokenEntity: TokenOrDocument | string, targetEntity: TokenOrDocument | string, validModes?: Array<string>, options?: SenseOptions): Array<string>;
export declare function setupCheckVision(): void;
export declare function _canSenseModes(token: Token.Implementation, target: Token.Implementation, validModesParam?: Array<string>, options?: SenseOptions): Array<string>;
export declare function tokensForActor(actorRef: Actor.Implementation | string | undefined | null): Token.Implementation[];
export declare function tokenForActor(actor: Actor.Implementation | string | undefined | null): Token | undefined;
export declare function doConcentrationCheck(actor: Actor.Implementation, saveDC: number): Promise<any>;
export declare function displayDSNForRoll(rolls?: Roll | Roll[], rollType?: string, defaultRollMode?: string, saveDisplay?: string, actor?: Actor.Implementation | null): Promise<void>;
export declare function DSNMarkDiceDisplayed(rolls: Roll | Roll[]): void;
export declare function isReactionItem(item?: Item.Implementation): boolean;
export declare function getCriticalDamage(): string;
export declare function isValidTarget(target: TokenOrDocument): boolean;
export declare function validRollAbility(rollType: string, ability: string): string | undefined;
export declare function hasWallBlockingCondition(target: TokenOrDocument): boolean;
export declare function getActor(actorRef?: Actor.Implementation | TokenOrDocument | string | null): Actor.Implementation | undefined | null;
export declare function getTokenDocument(tokenRef?: Actor.Implementation | TokenOrDocument | string | null): TokenDocument.Implementation | undefined;
export declare function getToken(tokenRef?: Actor.Implementation | TokenOrDocument | string | null): Token.Implementation | undefined;
export declare function getPlaceable(tokenRef?: Actor.Implementation | TokenOrDocument | string | foundry.canvas.placeables.PlaceableObject | undefined): foundry.canvas.placeables.PlaceableObject | undefined | null;
export declare function calcTokenCover(attacker: TokenOrDocument, target: TokenOrDocument, origin?: CoverPosition): number;
export declare function getLinkText(entity?: TokenOrDocument | Actor.Implementation | Item.Implementation | null): string;
/** A token's image on midi's target lists: its actor's portrait for a character with Use Player Portrait; a video as a still */
export declare function tokenPortrait(document: TokenDocument.Implementation): Promise<string>;
/** A still of a video, from Foundry's cache of the thumbnails it made */
export declare function videoThumbnail(src: string): Promise<string>;
export declare function getTokenName(entity?: TokenOrDocument | null): string;
export declare function getTokenNameExact(entity?: TokenOrDocument): string | undefined;
/**
 * Creates a proxy around canvas.grid that makes it behave like a SquareGrid.
 * Used for griddedGridless mode to apply square grid measurement rules to gridless scenes.
 * @returns A proxy that redirects grid methods to SquareGrid.prototype
 */
/** fvtt-types' BaseGrid#measurePath accepts nothing: measure with the core grid class the grid is */
export declare function measureGridPath(grid: foundry.grid.BaseGrid, waypoints: Canvas.Point[]): foundry.grid.BaseGrid.MeasurePathResult | undefined;
export declare function createSquareGridProxy(): foundry.grid.BaseGrid;
export declare function getActivityAutoTargetAction(activity?: Activity): string;
export declare function getAoETargetType(activity: Activity): string;
export declare function hasAutoPlaceTemplate(item: Item.Implementation): boolean;
export declare function activityHasAutoPlaceTemplate(activity: Activity): boolean;
export declare function activityHasEmanationNoTemplate(activity: Activity): boolean;
/** Add bonusRoll to roll. Dice-free rolls are evaluated here; rolls with dice must already be rolled (see addRollToAsync). */
export declare function addRollTo(roll: Roll, bonusRoll: Roll | Roll.Evaluated<Roll.Any>): Roll;
/** Add bonusRoll to roll, rolling either one first if it has not been evaluated. */
export declare function addRollToAsync(roll: Roll, bonusRoll: Roll | Roll.Evaluated<Roll.Any>): Promise<Roll>;
export declare function chooseEffect({ actor, token, item, workflow, options }: {
    actor: Actor.Implementation;
    token: Token.Implementation;
    item: Item.Implementation;
    workflow: Workflow;
    options?: {
        chooseAll?: boolean;
        timeout?: number;
    };
}): Promise<false | (ActiveEffect.Stored<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> & ActiveEffect<any>) | undefined>;
export declare function canSee(tokenEntity: TokenOrDocument, targetEntity: TokenOrDocument, options?: SenseOptions): boolean;
export declare function sumRolls(rolls?: Array<Roll> | undefined, countHealing?: "ignore" | "negative" | "positive" | "negativeIgnoreTemp" | "positiveIgnoreTemp"): number;
export declare const updatesCache: {};
/** Drop template indentation. One space, not none, so inline elements aren't run together. */
export declare const compactHTML: (html: string) => string;
/** Compact midi's card markup. Idempotent. The item description is authored prose, so left alone. */
export declare function compactCardContent(content: string): string;
/** Queue changes for a card's next write: only what changes the card or its queued changes */
export declare function queueUpdate(document: ChatMessage.Implementation, updates: ChatMessage.UpdateData): void;
/**
 * Write `updates` and the card's queued changes. A workflow queues its card's changes while a state runs and writes them
 * once (Workflow#performThrottledUpdate).
 */
export declare function throttledUpdate(document: ChatMessage.Implementation, updates: ChatMessage.UpdateData): Promise<import("fvtt-types/src/foundry/common/abstract/document.mjs").default.Any | ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note"> | undefined>;
/** Run `deleteCard` once the card's write in flight is done, with its queued writes dropped and no new ones sent */
export declare function deleteCardAfterWrites(uuid: string, deleteCard: () => Promise<unknown>): Promise<void>;
export declare function getUpdatesCache(uuid: string | undefined | null): any;
export declare function addUpdatesCacheFlags(uuid: string | undefined | null, updates: any, prepend?: string): void;
export declare function addUpdatesCache(uuid: string | undefined | null, updates: any): void;
export declare function clearUpdatesCache(uuid: string | undefined | null): void;
/** A card as it will be once its queued changes are written: the stored card when none are queued */
export declare function getCachedDocument(uuid: string | undefined | null): ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note"> | undefined;
export declare function isEffectExpired(effect: ActiveEffect.Implementation): boolean;
/**
 * End effects by a special duration (or another midi expiry): each goes to DAE's expireEffect, which deletes it or
 * suppresses it (disabled, kept) as its Expiry Mode and DAE's Special Duration Expiry Action say.
 */
export declare function expireEffects(actor: Actor.Implementation, effects: ActiveEffect.Implementation[], options: any): Promise<any>;
/** Remove effects: applied effects and enchantments are deleted, an item's own (transfer) effects disabled. */
export declare function deleteAppliedEffects(actor: Actor.Implementation, effects: ActiveEffect.Implementation[], options?: Record<string, unknown>): Promise<{
    deleted: string[];
    disabled: ActiveEffect[];
    itemEffects: ActiveEffect[];
}>;
export declare function processConcentrationRequestMessage(message: ChatMessage.Implementation, html: HTMLElement, data: any): Promise<void>;
export declare function setRollOperatorEvaluated(roll: Roll): Roll<import("fvtt-types/utils").EmptyObject> | undefined;
export declare function doSyncRoll(roll: Roll, source: string | undefined): Roll.Evaluated<Roll<import("fvtt-types/utils").EmptyObject>>;
export declare function setRollMinDiceTerm(roll: Roll, minValue: number, count?: number): Roll<import("fvtt-types/utils").EmptyObject>;
export declare function setRollMaxDiceTerm(roll: Roll, maxValue: number, count?: number): Roll<import("fvtt-types/utils").EmptyObject>;
export declare function addDependent(document: foundry.abstract.Document.Any, dependent: foundry.abstract.Document.Any): Promise<any>;
export declare function addConcentrationDependent(actorRef: TokenOrDocument | Actor.Implementation | string, dependent: foundry.abstract.Document.Any, item?: Item.Implementation): Promise<any>;
export declare function getAppliedEffects(actor: Actor.Implementation | null | undefined, { includeEnchantments }: {
    includeEnchantments: boolean;
}): ActiveEffect.Stored<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[];
export declare function getCEEffectByName(name: string): ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType> | null | undefined;
export declare function CEAddEffectWith(options: {
    uuid: string | null | undefined;
    effectName?: string;
    effectId?: string;
    origin?: any;
    effectData?: any;
    overlay: boolean;
}): Promise<ActiveEffect<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>[] | undefined>;
export declare function CERemoveEffect(options: {
    effectName: string;
    uuid: string | null | undefined;
    effectId?: string;
    origin?: string | null;
}): Promise<void | undefined>;
export declare function CEToggleEffect(options: {
    effectName?: string;
    uuid: string;
    effectId?: string;
    origin?: string | null;
    overlay?: boolean;
}): Promise<void | undefined>;
export declare function CEHasEffectApplied(options: {
    effectName: string;
    uuid: string | null | undefined;
    effectId?: string;
    origin?: string;
}): boolean;
export declare function isConvenientEffect(effect: ActiveEffect.Implementation): boolean;
export declare function getActivityDefaultDamageType(workflow: Workflow): string;
export declare function activityHasAreaTarget(activity?: Activity): boolean;
/** The templates a use of the activity places by hand: none when it has no area or places its own */
export declare function expectedTemplateCount(activity?: Activity): number;
export interface ConvertedDuration {
    type: "turns" | "seconds" | "none";
    seconds: number | undefined;
    rounds: number | undefined;
    turns: number | undefined;
}
/**
 * Converts activity/item duration to effect duration format.
 * Returns seconds for world time tracking, or rounds/turns for combat tracking.
 *
 * @param durationData - Duration with units and value
 * @param inCombat - Whether the actor is currently in combat
 * @returns Converted duration with type, seconds, rounds, and turns
 */
export declare function convertDuration(durationData: {
    units: string;
    value: number;
} | undefined, inCombat: boolean): ConvertedDuration;
export declare function getSaveRollModeFor(abilityId: string): "public" | "gm" | "blind";
export declare function getCheckRollModeFor(abilityId: string): "public" | "gm" | "blind";
/** Whether `action`'s keybinding (midi-qol's by default, or another namespace's such as dnd5e's) is held for `event`. */
export declare function areMidiKeysPressed(event: AugmentedEvent | undefined, action: string, namespace?: string): boolean;
export declare function setRangedTargets(tokenToUse: Token.Implementation, targetDetails: Activity["target"]): boolean;
export declare function updateUserTargets(targetIds: (string | null | undefined)[]): void;
/** Set by libWrapper patches in patching.ts around user-initiated targeting actions. */
export declare let _userInitiatedTarget: boolean;
export declare function setUserInitiatedTarget(value: boolean): void;
export declare function pushTargetSave(): void;
export declare function popTargetSave(): void;
export declare function clearTargetSave(): void;
/**
 * Called from the targetToken hook. If the user manually changed targets
 * (via click/right-click/box-select), discard any pending self-target save.
 */
export declare function onUserManualTarget(user: User): void;
export declare function getItemFromEffectOrigin(origin: string, alreadyVisited?: string[]): Item.Implementation | undefined;
export type OpType = "equal" | "insert" | "delete" | "replace";
export interface EqualOp {
    type: "equal";
    text: string;
}
export interface InsertOp {
    type: "insert";
    text: string;
}
export interface DeleteOp {
    type: "delete";
    text: string;
}
export interface ReplaceOp {
    type: "replace";
    text: string;
    from: string;
}
export type DiffOp = EqualOp | InsertOp | DeleteOp | ReplaceOp;
export interface DiffOptions {
    ignoreWhitespace?: boolean;
    ignoreNewlines?: boolean;
}
export declare function diffStringsFull(a: string, b: string, options?: DiffOptions): DiffOp[];
export declare function coalesceOps(ops: DiffOp[]): DiffOp[];
export declare function getTargetDescriptor<T extends DND5ETargetDescriptor>(uuid: string, targetDescriptors: Array<T> | undefined): T | undefined;
export declare const throttledScrollBottom: () => void;
/** Runs `fn` after midi's earlier fixed-id effect changes for the actor (concurrent ones fail). `fn` must not queue for the same actor. */
export declare function queueActorEffects<T>(actor: Actor.Implementation, fn: () => Promise<T>): Promise<T>;
/** actor.toggleStatusEffect, queued; losing a race with another module counts as done. */
export declare function toggleStatus(actor: Actor.Implementation | null | undefined, statusId: string, options?: Actor.ToggleStatusEffectOptions): Promise<ActiveEffect.Implementation | boolean | undefined>;
/**
 * Apply a status to an actor as the condition itself (the document the token HUD creates), not an effect carrying it.
 * `specialDuration` adds to the status's own; `prepare` sets the rest (origin, dependency). A creature that already
 * has the status keeps it.
 */
export declare function applyStatusCondition(actor: Actor.Implementation | null | undefined, statusId: string, { specialDuration, prepare }?: {
    specialDuration?: string[];
    prepare?: (effectData: ActiveEffect.CreateData) => void;
}): Promise<void>;
/**
 * The use's targets as the message's targets (dnd5e's TargetsField descriptors), so dnd5e's use and rolls describe the
 * use's targets rather than reading the player's (M2 stage 7: automated uses don't write game.user.targets). Targets the
 * caller put in the message stay.
 */
export declare function setMessageTargets<M extends object>(message: M, workflow: {
    targets?: TokenDocumentSet;
} | undefined): M;
export {};
