import { Activity, ActivityUseConfiguration, RollMessageConfig, TokenOrDocument } from "../../globals.js";
import { Workflow } from "../Workflow.js";
import { TargetConfirmationOptions } from "../apps/TargetConfirmation.js";
import { MidiOptions } from "../utils.js";
import Token = foundry.canvas.placeables.Token;
/**
 * Determines if the enforceSingleWeaponTarget setting should apply to this activity.
 * Returns false for emanation/AoE activities that naturally target multiple creatures.
 * @param activity The activity to check
 * @returns true if single target should be enforced
 */
export declare function attachTokenOptions(selected: string): {
    value: string;
    label: string;
    selected: boolean;
}[];
export declare function templateOriginOptions(selected: string): {
    value: string;
    label: string;
    selected: boolean;
}[];
export declare function shouldEnforceSingleTarget(activity: Activity): boolean;
export declare function removeFlanking(actor: Actor.Implementation): Promise<void>;
export declare function setDamageRollMinTerms(rolls?: Roll[]): void;
export declare function doActivityReactions(activity: Activity, workflow: Workflow): Promise<{
    name?: string;
    uuid?: string;
    ac?: number;
}[]>;
export declare function preActivityConsumptionHook(activity: Activity, usageConfig: ActivityUseConfiguration, messageConfig: RollMessageConfig): boolean;
export declare function activityConsumptionHook(activity: Activity, usageConfig: ActivityUseConfiguration, messageConfig: RollMessageConfig, updates: unknown): boolean;
/**
 * Check if an activity's target count is a formula (not a plain number or blank).
 * By the time this runs, prepareFinalData has already evaluated the formula to a number,
 * so we check the raw _source data for the original formula string.
 * If activity.target.override is true, the formula lives on the activity;
 * otherwise it's inherited from the item via _setOverride.
 * A formula-based count means the target count may change with scaling or other roll data,
 * so target confirmation should be deferred until after the consumption dialog.
 */
export declare function activityHasScaledTargetCount(activity: Activity): boolean;
export declare function requiresTargetConfirmation(activity: Activity, options: MidiOptions): boolean;
export declare function preTemplateTargets(activity: Activity, options: MidiOptions): Promise<boolean>;
export declare function postTemplateConfirmTargets(activity: Activity, options: MidiOptions, workflow: Workflow): Promise<boolean>;
export declare function resolveTargetConfirmation(activity: Activity, options?: TargetConfirmationOptions): Promise<boolean>;
/** Post the item's card, as dnd5e's own "display card" does. */
export declare function showItemInfo(this: Item.Implementation): Promise<ChatMessage.Implementation | undefined>;
export declare function isAoETargetable(targetToken: TokenOrDocument, options?: {
    selfToken?: TokenOrDocument | string | null | undefined;
    ignoreSelf?: boolean;
    AoETargetType?: string;
    autoTarget?: string;
}): boolean;
/**
 * midi's flags for an activity template region — the marker `isTemplateRegion` tests, the caster
 * token and, when `constrainTemplatePlacement` is on, the range limit `preCreateRegion` enforces.
 *
 * Shared so a region placed interactively (via `dnd5e.createMeasuredTemplate`) and one placed
 * programmatically (via `createActivityTemplateRegions`) carry the same flags.
 */
export declare function midiTemplateFlags(activity: any): Record<string, unknown>;
type Band = {
    bottom: number;
    top: number | null;
    topInclusive: boolean;
};
/**
 * An area's band before it is kept within its level, and the height its lines of effect start from (flags.midi-qol.reach):
 * what a creature on another level, or behind a floor inside the level, is measured against.
 */
type Reach = {
    bottom: number;
    top: number | null;
    from: number;
};
/** How far a sphere or emanation reaches, for the exact test inside its band (flags.midi-qol.area). */
export type AreaReach = {
    kind: "sphere";
    radius: number;
    centre: number;
} | {
    kind: "emanation";
    radius: number;
    feet: number;
    head: number;
};
/**
 * The elevation band (kept within the level) and reach of an activity's template region, for the region data; undefined
 * for a flat area. `tokenId` is the token the area follows or emanates from, else its caster's.
 */
export declare function templateElevation(activity: any, shape: any, levelId?: string, tokenId?: string): {
    elevation: Band;
    area?: AreaReach;
    reach: Reach;
} | undefined;
/** An elevation another module gave a template region, kept within its level. */
export declare function clampTemplateElevation(elevation: Band, levelId?: string): Band;
/** The band of a midi-banded region that follows a token, from the token as it is now, kept within its level. */
export declare function attachedRegionBand(region: RegionDocument.Implementation): {
    elevation: Band;
    area?: AreaReach;
    reach: Reach;
} | undefined;
/**
 * Line of effect through floors: the straight line from the area's origin to the middle of the token's space must not
 * pass through a surface that stops movement (as walls count as total cover only when they stop movement), in the
 * area's level or the token's. An opening in a floor lets it through. True when the scene has no such surfaces.
 */
export declare function lineOfEffectClear(region: RegionDocument.Implementation, token: TokenDocument.Implementation): boolean;
/**
 * Whether an area reaches a token: within the area's band or, on another level, its reach (only where the scene's floors
 * have openings), within a sphere's or emanation's true reach, and with a clear line of effect through any floors.
 * The 2D shape and walls are tested separately.
 */
export declare function areaReachesToken(region: RegionDocument.Implementation, token: TokenOrDocument): boolean;
/**
 * Creatures on other levels that an activity's areas reach through openings in the floors. Core doesn't draw tokens on
 * a level other than the one viewed, so they can't be the user's targets: they are added to the workflow's.
 */
export declare function computeOffLevelTemplateTargets(activity: Activity | undefined, templates: (RegionDocument.Implementation | string)[]): TokenDocument.Implementation[];
/**
 * Whether a token in an area's shape and band is within the area's reach in 3D: a sphere's from its centre, an
 * emanation's from its token's space. Only height is limited: a token level with the centre is inside wherever the 2D
 * shape includes it, so grid-based shapes keep their corner squares.
 */
export declare function withinAreaReach(region: RegionDocument.Implementation, token: TokenDocument.Implementation): boolean;
/**
 * Whether a region is a template: one midi marked when an activity placed it, or one created
 * through Foundry's MeasuredTemplate compatibility layer. `flags.dnd5e.activity` is not a test —
 * dnd5e sets it on any region that belongs to an activity.
 */
export declare function isTemplateRegion(region: unknown): boolean;
/**
 * Create template Regions for an activity at known positions, without the placement UI.
 *
 * dnd5e's `TemplatePlacement.fromActivity` bundles the interactive placement with the region
 * creation, so there is no system API for "put this activity's template here" — which is what a
 * TrapWorkflow and midi's auto-placed templates need. The region data mirrors what
 * `TemplatePlacement.fromActivity` builds, so a template placed this way is indistinguishable from
 * one the player positioned by hand.
 *
 * Sizes go through dnd5e's own `convertLength`, from the activity's units to the scene's, then to
 * pixels. The deprecated `AbilityTemplate` path skipped that conversion.
 */
export declare function createActivityTemplateRegions(activity: any, placements: {
    x: number;
    y: number;
    direction?: number;
    token?: TokenDocument.Implementation;
}[], extraFlags?: Record<string, unknown>): Promise<RegionDocument.Stored[]>;
export declare function selectTargetsFromTemplates(templates: (foundry.canvas.placeables.MeasuredTemplate.Implementation | MeasuredTemplateDocument | RegionDocument.Implementation | string)[], selfTokenRef?: TokenOrDocument | string | null | undefined, ignoreSelf?: boolean, AoETargetType?: string, autoTarget?: string): Token.Implementation[];
/**
 * The tokens an activity's templates target, by the activity's own settings: auto-target action,
 * AoE target type, "-self" and target count. Undefined when the activity does not auto-target.
 */
export declare function computeActivityTemplateTargets(activity: Activity | undefined, templates: Parameters<typeof computeTargetsFromTemplates>[0]): Token.Implementation[] | undefined;
/**
 * Returns tokens inside a template without modifying game.user.targets.
 * Accepts a MeasuredTemplate placeable, a MeasuredTemplateDocument, a RegionDocument, or a UUID string.
 * In v14, MeasuredTemplates are backed by Regions — when no placeable is available,
 * falls back to Region-based targeting via testPoint().
 * Handles WalledTemplates, VolumetricTemplates, and standard template targeting.
 * Note: When VolumetricTemplates is active, game.user.targets may be modified as a
 * side effect of computeRegion3d — the returned array is still the authoritative result.
 */
export declare function computeTargetsFromTemplate(template: foundry.canvas.placeables.MeasuredTemplate.Implementation | MeasuredTemplateDocument | RegionDocument.Implementation | string, selfTokenRef?: TokenOrDocument | string | null | undefined, ignoreSelf?: boolean, AoETargetType?: string, autoTarget?: string): Token.Implementation[];
/** LOS from the region's shape origin to a token - lvt does no wall checking on v14. */
/**
 * The point a Region's area spreads from, for wall and cover checks. Not every shape has x/y: an emanation keeps
 * its position on its base token (dnd5e 6's self-centred areas), a polygon in its points; reading them as 0 measured
 * from the scene's corner.
 */
export declare function regionShapeOrigin(regionDoc: RegionDocument.Implementation): {
    x: number;
    y: number;
} | undefined;
export declare function computeTargetsFromTemplates(templates: (foundry.canvas.placeables.MeasuredTemplate.Implementation | MeasuredTemplateDocument | RegionDocument.Implementation | string)[], selfTokenRef?: TokenOrDocument | string | null | undefined, ignoreSelf?: boolean, AoETargetType?: string, autoTarget?: string): Token.Implementation[];
/**
 * Get currently selected tokens in the scene or user's character's tokens.
 * @returns {Token5e[]}
 */
export declare function getSceneTargets(): Token.Implementation[];
export {};
