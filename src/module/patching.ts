import { log, i18n, error, i18nFormat, warn, debugEnabled, GameSystemConfig, MODULE_ID, gameStats } from "../midi-qol.js";
import { configSettings, checkRule, checkMechanic, safeGetGameSetting, playerControlsInvisibleTokens } from "./settings.js";
import { bonusDialog, ConvenientEffectsHasEffect, createConditionData, displayDSNForRoll, expireRollEffect, getCriticalDamage, getDeadStatus, getOptionalCountRemainingShortFlag, getOrCreateTokenForActor, getSpeaker, getUnconsciousStatus, getVitalityDeadStatus, getWoundedStatus, hasAutoPlaceTemplate, hasUsedAction, hasUsedBonusAction, hasUsedReaction, midiRenderRoll, notificationNotify, removeActionUsed, removeBonusActionUsed, removeReactionUsed, tokenForActor, expireEffects, DSNMarkDiceDisplayed, evalAllConditions, evalAllConditionsAsync, CEAddEffectWith, isConvenientEffect, CERemoveEffect, hasCondition, areMidiKeysPressed, MidiOptions, getVitalityItem, checkMagicResistanceAndVulnerability, isAutoFastForward, FastForwardRollType, buildRollChoices, selectBestRollChoice, getTokenPerimeterPolygon, closestPointOnPerimeter, measurePointDistance, setUserInitiatedTarget } from "./utils.js";
import { installedModules } from "./setupModules.js";
import { OnUseMacro, OnUseMacros } from "./apps/Item.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { MidiAttackActivity } from "./activities/AttackActivity.js";
import { MidiActivityChoiceDialog } from "./apps/MidiActivityChoiceDialog.js";
import { MidiRollChoiceDialog, PreComputedAdvantage } from "./apps/MidiRollChoiceDialog.js";
import Token = foundry.canvas.placeables.Token;
import { AnyMutableObject } from "fvtt-types/utils";
import { Activity, ActivityUseConfiguration, DamageApplicationOptions, DamageDescription, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../globals.js";
import { Workflow } from "./Workflow.js";
import { preferredActiveGM } from "./GMAction.js";
import { MidiDependentsRegistry, MidiDependentDocumentMixin } from "./lib/MidiDependentsRegistry.js";
import { RollModifierTracker, computeAdvantageFlags, computeRollModifiers, applyRollModifiers, RollModifierFlags, RollModifierResult, AdvantageFlags } from "./lib/RollModifierTracker.js";

let libWrapper;

const NumericTerm = foundry.dice.terms.NumericTerm;

// Module-level Set to track actors that should skip concentration checks
// Used instead of actor flags to avoid database writes and orphaned flags
export const skipConcentrationActorUuids = new Set<string>();

// Per-actor semaphores to prevent race conditions in checkWounded
// Multiple concurrent updateActor hooks can fire for the same actor, causing duplicate status effects
const actorWoundedSemaphores = new Map<string, foundry.utils.Semaphore>();

export function getActorWoundedSemaphore(actorUuid: string): foundry.utils.Semaphore {
  if (!actorWoundedSemaphores.has(actorUuid)) {
    actorWoundedSemaphores.set(actorUuid, new foundry.utils.Semaphore(1));
  }
  return actorWoundedSemaphores.get(actorUuid)!;
}

// ==================== PATCHING ENTRY POINTS ====================
// These functions are called during module initialization to register libWrapper patches.
// The helper functions they reference are defined later in this file.

export function initPatching() {
  libWrapper = globalThis.libWrapper;
  const ChatLog = foundry.applications.sidebar.tabs.ChatLog;
  // TODO this needs more work libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.migrateData", removeMidiProperties, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.prepareDerivedData", _prepareDerivedData, "WRAPPER");
  // For new onUse macros stuff.
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.prepareData", itemPrepareData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.prepareData", actorPrepareData, "WRAPPER");
  // I think this can be removed in v13 libWrapper.register(MODULE_ID, "KeyboardManager.prototype._onFocusIn", _onFocusIn, "OVERRIDE");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.getRollData", actorGetRollData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.getRollData", itemGetRollData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype._preCreate", _preCreateActiveEffect, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.D20Roll.prototype.configureModifiers", _configureModifiers, "WRAPPER");
  libWrapper.register(MODULE_ID, "dnd5e.applications.actor.BaseActorSheet.prototype._prepareItem", _prepareItem, "WRAPPER");

  // Setup document classes with both dnd5e's DependentDocumentMixin (for flag-based tracking)
  // and MidiDependentDocumentMixin (for our registry-based tracking of Actor/Item parents)
  // This allows dnd5e.dependentOn flag to work for all parent types

  // v14: MeasuredTemplate is a compat-layer proxy for Region — both share the same ID and flags.
  // Do NOT apply DependentDocumentMixin to MeasuredTemplate; the Region already handles tracking.
  // Applying it to both causes duplicate entries in dnd5e.registry.dependents (different UUIDs
  // for same document: Scene.x.MeasuredTemplate.y vs Scene.x.Region.y), leading to double-delete
  // when ActiveEffect5e._onDelete cascades via getDependents().forEach(e => e.delete()).

  // Token, AmbientLight need dnd5e's mixin added (not in their base class)
  class MidiTokenDocument extends MidiDependentDocumentMixin(
    globalThis.dnd5e.documents.mixins.DependentDocumentMixin(CONFIG.Token.documentClass)
  ) {
    _midiVisionSourceFraction: number | undefined;
    _midiVisionTargetFraction: number | undefined;

    _getHeightFraction(flagName: string): number {
      // Token flags (set directly or via active effects targeting the token document)
      const flagValue = this.getFlag("midi-qol", flagName) as number | undefined;
      if (flagValue != null) return Math.clamp(flagValue, 0, 100) / 100;
      return configSettings.optionalRules.visionTestHeight === "top" ? 1.0 : 0.5;
    }

    // Override vision origin elevation based on token flags.midi-qol.visionSourceHeight (0-100%)
    // or the midi setting. Affects Foundry's rendering and midi's canSee/canSense.
    getVisionOrigin(data: Record<string, any> = {}) {
      const origin = super.getVisionOrigin(data);
      const fraction = this._getHeightFraction("visionSourceHeight");
      if (fraction !== 0.5) {
        const gridDistance = this.parent?.grid?.distance ?? 5;
        const depth = data.depth ?? this.depth ?? 1;
        const baseElev = data.elevation ?? this.elevation ?? 0;
        origin.elevation = baseElev + (depth * gridDistance * fraction);
      }
      return origin;
    }

    // Override visibility test points elevation based on token flags.midi-qol.visionTargetHeight (0-100%)
    // or the midi setting. Controls where on this token other tokens test visibility against.
    getVisibilityTestPoints(data: Record<string, any> = {}) {
      const points: Array<{ x: number, y: number, elevation: number }> = super.getVisibilityTestPoints(data);
      const fraction = this._getHeightFraction("visionTargetHeight");
      if (fraction !== 0.5 && points.length) {
        const gridDistance = this.parent?.grid?.distance ?? 5;
        const depth = data.depth ?? this.depth ?? 1;
        const baseElev = data.elevation ?? this.elevation ?? 0;
        const targetElev = baseElev + (depth * gridDistance * fraction);
        for (const p of points) p.elevation = targetElev;
      }
      return points;
    }

    // Detect vision height flag changes and refresh vision.
    // Covers: direct token.setFlag(), active effects targeting token.flags via
    // applyActiveEffects → _renderActiveEffectChanges → _onUpdate, and
    // actor-related updates via _onUpdateBaseActor → _onRelatedUpdate.
    _onRelatedUpdate(update: Record<string, any> = {}, operation: Record<string, any> = {}) {
      super._onRelatedUpdate(update, operation);
      this._refreshVisionIfNeeded();
    }

    _onUpdate(changed: Record<string, any>, options: Record<string, any>, userId: string) {
      super._onUpdate(changed, options, userId);
      if ("flags" in changed) this._refreshVisionIfNeeded();
    }

    _refreshVisionIfNeeded() {
      const sourceFraction = this._getHeightFraction("visionSourceHeight");
      const targetFraction = this._getHeightFraction("visionTargetHeight");
      if (sourceFraction !== this._midiVisionSourceFraction || targetFraction !== this._midiVisionTargetFraction) {
        this._midiVisionSourceFraction = sourceFraction;
        this._midiVisionTargetFraction = targetFraction;
        this.object?.initializeVisionSource();
        canvas.perception?.update({ refreshVision: true });
      }
    }
  };
  //@ts-expect-error
  CONFIG.Token.documentClass = MidiTokenDocument;

  // TODO: Wall Height integration — commented out pending further testing
  // When midi's visionSourceHeight flag is set, override losHeight so Wall Height
  // uses midi's vision elevation for wall checks.
  // if (game.modules.get("wall-height")?.active) {
  //   libWrapper.register(MODULE_ID, "CONFIG.Token.objectClass.prototype.losHeight",
  //     function wallHeightLosHeightWrapper(this: Token.Implementation, wrapped: Function) {
  //       const flagValue = this.document?.getFlag("midi-qol", "visionSourceHeight") as number | undefined;
  //       if (flagValue != null) {
  //         const fraction = Math.clamp(flagValue, 0, 100) / 100;
  //         const gridDistance = this.scene?.grid?.distance ?? 5;
  //         const depth = this.document.depth ?? 1;
  //         return (this.document.elevation ?? 0) + (depth * gridDistance * fraction);
  //       }
  //       return wrapped();
  //     }, "MIXED");
  // }

  // Fix: when a token with vision is below a surface, the surface should be occluded
  // (tiles transparent, exposure skipped) even if the token's test points don't fall
  // within the surface polygon. Without this, tokens on the First Floor have their
  // vision clipped by the Second Floor Surface if they're not directly underneath it.
  libWrapper.register(MODULE_ID, "CanvasOcclusionMask.prototype._updateOccludedSurfaces",
    _updateOccludedSurfacesWrapper, "WRAPPER");

  // Surface vision fog: draw a fog overlay for areas blocked by floor surfaces.
  // Uses Foundry's surfaceExposure rendering to dim areas the token can't see through floors.
  // Hook fires during refreshVisibility, after standard shapes are drawn.
  Hooks.on("visibilityRefresh", _onVisibilityRefreshSurfaceFog);

  class MidiAmbientLightDocument extends MidiDependentDocumentMixin(
    globalThis.dnd5e.documents.mixins.DependentDocumentMixin(CONFIG.AmbientLight.documentClass)
  ) { };
  //@ts-expect-error
  CONFIG.AmbientLight.documentClass = MidiAmbientLightDocument;

  class MidiRegionDocument extends MidiDependentDocumentMixin(
    globalThis.dnd5e.documents.mixins.DependentDocumentMixin(CONFIG.Region.documentClass)
  ) { };
  //@ts-expect-error
  CONFIG.Region.documentClass = MidiRegionDocument;

  // ActiveEffect, Item, Actor already have dnd5e's DependentDocumentMixin in their class hierarchy
  // Just add MidiDependentDocumentMixin for our registry tracking
  //@ts-expect-error - Mixin pattern type inference
  class MidiActiveEffect extends MidiDependentDocumentMixin(CONFIG.ActiveEffect.documentClass) { };
  //@ts-expect-error
  CONFIG.ActiveEffect.documentClass = MidiActiveEffect;

  //@ts-expect-error - Mixin pattern type inference
  class MidiItem extends MidiDependentDocumentMixin(CONFIG.Item.documentClass) { };
  //@ts-expect-error
  CONFIG.Item.documentClass = MidiItem;

  //@ts-expect-error - Mixin pattern type inference
  class MidiActor extends MidiDependentDocumentMixin(CONFIG.Actor.documentClass) { };
  //@ts-expect-error
  CONFIG.Actor.documentClass = MidiActor;
}

// Fix surface occlusion for tokens below upper-floor surfaces. Foundry's default only
// occlude a surface if a token's test points fall inside the surface polygon. This misses
// tokens on a lower floor that aren't directly underneath the surface. We force-occlude
// surfaces at or above the current level's top elevation when any vision source is below,
// while preserving Foundry's geometric test for same-level features (balconies, overhangs).
function _updateOccludedSurfacesWrapper(this: any, wrapped: Function, flags: any) {
  wrapped(flags);
  if (configSettings.optionalRules.surfaceOcclusion === false) return;
  // @ts-expect-error v14 canvas.level not in fvtt-types
  if (!canvas?.scene || !canvas.level) return;
  // @ts-expect-error v14 scene.levels not in fvtt-types
  if ((canvas.scene.levels?.size ?? 0) <= 1) return;

  // @ts-expect-error v14 canvas.level not in fvtt-types
  const levelTop = canvas.level.elevation.top;
  if (!Number.isFinite(levelTop)) return;

  const hasTokenBelow = canvas.effects!.visionSources.some(
    (s: any) => s.active && s.origin?.elevation != null && s.origin.elevation < levelTop
  );
  if (!hasTokenBelow) return;

  // @ts-expect-error v14 getSurfaces not in fvtt-types
  for (const surface of canvas.scene.getSurfaces({ level: canvas.level.id, occlusion: true })) {
    if (surface.elevation >= levelTop && !this.occludedSurfaces.has(surface)) {
      this.occludedSurfaces.add(surface);
    }
  }
}

// Surface fog overlay: darkens areas on lower floors blocked by surface regions.
// Fog = (vision polygon) ∩ (holes in surface) ∩ (projected shadow of surface edges)
// - "holes" = areas within vision where there's no floor (vision − surface footprint)
// - "projected shadow" = areas where the diagonal LOS from viewer to lower floor is blocked
// - Only the intersection of holes and shadow gets fogged — areas you can see through
//   a gap but where the surface edge blocks the angled view to the floor below.
// To disable: remove the Hooks.on("visibilityRefresh", ...) call in initPatching.
let _surfaceFogOverlay: any = null;

function _onVisibilityRefreshSurfaceFog() {
  if (!(canvas as any)?.interface) return;
  if (configSettings.optionalRules.surfaceVisionFog === false) {
    if (_surfaceFogOverlay && !_surfaceFogOverlay.destroyed) _surfaceFogOverlay.clear();
    return;
  }
  if (!_surfaceFogOverlay || _surfaceFogOverlay.destroyed) {
    _surfaceFogOverlay = new PIXI.LegacyGraphics();
    _surfaceFogOverlay.zIndex = 1150;
    (canvas as any).interface.addChild(_surfaceFogOverlay);
  }
  _surfaceFogOverlay.clear();

  // @ts-expect-error v14 canvas.level not in fvtt-types
  if (!canvas?.scene || !canvas.level) return;
  // @ts-expect-error v14 scene.levels not in fvtt-types
  if ((canvas.scene.levels?.size ?? 0) <= 1) return;

  const controlled = canvas.tokens?.controlled?.[0];
  if (!controlled?.vision) return;

  const visionSource = controlled.vision;
  const origin = visionSource.origin;
  if (origin?.elevation == null) return;

  const vx = origin.x;
  const vy = origin.y;
  const viewerElev = origin.elevation;
  const visionPoly = visionSource.los ?? visionSource.shape;
  if (!visionPoly?.points?.length) return;

  // @ts-expect-error getSurfaces not in fvtt-types
  const surfaces: Array<{ region: any, elevation: number }> = canvas.scene.getSurfaces({ type: "sight" });
  if (!surfaces.length) return;

  // Only process surfaces between the viewer and the level below
  // @ts-expect-error v14 canvas.level not in fvtt-types
  const currentLevel = canvas.level;
  // @ts-expect-error v14 scene.levels not in fvtt-types
  const levels: any[] = Array.from(canvas.scene.levels ?? []);
  const sortedLevels = levels.sort((a: any, b: any) => b.elevation.bottom - a.elevation.bottom);
  const currentIdx = sortedLevels.findIndex((l: any) => l.id === currentLevel?.id);
  const levelBelow = sortedLevels[currentIdx + 1];
  if (!levelBelow) return;
  const targetElev = levelBelow.elevation.bottom;

  const blockingSurfaces = surfaces.filter((s: any) =>
    s.elevation < viewerElev && s.elevation > targetElev
  );
  if (!blockingSurfaces.length) return;

  const SCALE = CONST.CLIPPER_SCALING_FACTOR;

  // Step 1: Combine all blocking surface footprints into one Clipper path set
  const surfaceClipper = new ClipperLib.Clipper();
  const surfaceUnion: any[] = [];
  let hasSurface = false;
  for (const surface of blockingSurfaces) {
    const region = surface.region;
    const polygonTree = region.object?.animationState?.polygonTree ?? region.polygonTree;
    if (!polygonTree?.clipperPaths?.length) continue;
    surfaceClipper.AddPaths(polygonTree.clipperPaths, ClipperLib.PolyType.ptSubject, true);
    hasSurface = true;
  }
  if (!hasSurface) return;
  surfaceClipper.Execute(ClipperLib.ClipType.ctUnion, surfaceUnion,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  if (!surfaceUnion.length) return;

  // Step 2: Compute holes = vision polygon − surface footprint
  // Both visionPath and surfaceUnion are already at CLIPPER_SCALING_FACTOR (×100)
  const visionPath = visionPoly.toClipperPoints({ scalingFactor: SCALE });
  const holeClipper = new ClipperLib.Clipper();
  holeClipper.AddPath(visionPath, ClipperLib.PolyType.ptSubject, true);
  holeClipper.AddPaths(surfaceUnion, ClipperLib.PolyType.ptClip, true);
  const holes: any[] = [];
  holeClipper.Execute(ClipperLib.ClipType.ctDifference, holes,
    ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
  if (!holes.length) return;

  // Step 3: For each hole, compute the "clear cone" — the area visible through the hole
  // from the viewer's angle. Scale each hole by 1/t from the viewer, where
  // t = (viewerElev - surfaceElev) / (viewerElev - targetElev).
  // Subtract the clear cone from the hole to get the fogged area.
  // Use targetElev = standard token visibility test height (50% of 1-square depth = 2.5ft above floor).
  const gridDist = canvas.scene?.grid?.distance ?? 5;
  const targetMid = levelBelow.elevation.bottom + gridDist * 0.5;
  const blockElev = blockingSurfaces[0].elevation;
  const tFactor = (viewerElev - blockElev) / (viewerElev - targetMid);
  if (tFactor <= 0 || tFactor >= 1) return;
  const invT = 1 / tFactor;

  const vxScaled = vx * SCALE;
  const vyScaled = vy * SCALE;

  _surfaceFogOverlay.beginFill(0x000000, 0.9);
  for (const hole of holes) {
    // Compute clear cone: scale hole vertices by invT from the viewer
    const clearPoly = hole.map((pt: any) => ({
      X: Math.round(vxScaled + (pt.X - vxScaled) * invT),
      Y: Math.round(vyScaled + (pt.Y - vyScaled) * invT)
    }));

    // fog = hole − clear cone
    const fogClipper = new ClipperLib.Clipper();
    fogClipper.AddPath(hole, ClipperLib.PolyType.ptSubject, true);
    fogClipper.AddPath(clearPoly, ClipperLib.PolyType.ptClip, true);
    const fogResult: any[] = [];
    fogClipper.Execute(ClipperLib.ClipType.ctDifference, fogResult,
      ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);

    for (const path of fogResult) {
      const points: number[] = [];
      for (const pt of path) {
        points.push(pt.X / SCALE, pt.Y / SCALE);
      }
      _surfaceFogOverlay.drawPolygon(points);
    }
  }
  _surfaceFogOverlay.endFill();
}

/**
 * libWrapper WRAPPER for Token._onClickLeft, Token._onClickRight2, and TokenLayer.selectObjects.
 * Sets _userInitiatedTarget flag so the targetToken hook can distinguish user clicks from programmatic targeting.
 */
function userInitiatedTargetWrapper(this: any, wrapped: Function, ...args: any[]) {
  setUserInitiatedTarget(true);
  try {
    return wrapped(...args);
  } finally {
    setUserInitiatedTarget(false);
  }
}

export function readyPatching() {
  libWrapper.register(MODULE_ID, "game.dnd5e.canvas.AbilityTemplate.prototype._onMovePlacement", midiATOnMovePlacement, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.sheetClasses.character['dnd5e.CharacterActorSheet'].cls.prototype._filterItems", _filterItems, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.sheetClasses.npc['dnd5e.NPCActorSheet'].cls.prototype._filterItems", _filterItems, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.createConcentrationEffectData", createConcentrationEffectData, "WRAPPER");
  // Register _onUpdate wrapper for wounded/dead status handling
  // This runs AFTER dnd5e's _onUpdate, checking current state rather than stale update data
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype._onUpdate", actorOnUpdate, "WRAPPER");
  // This controls whether to display the chat message or not
  // dnd5e.damageActor handles picking up concentration item rolls
  // processConcentrationSave handles doing the auto roll for concentration chat messages
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.challengeConcentration", challengeConcentration, "MIXED")
  // Moved overtime processing to the updateCombat hook instead.
  // libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._preUpdate", processOverTime, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._preDelete", _preDeleteCombat, "WRAPPER");

  libWrapper.register(MODULE_ID, "foundry.applications.ui.Notifications.prototype.notify", notificationNotify, "MIXED");

  // User-initiated targeting detection — set flag so targetToken hook can distinguish user clicks from programmatic targeting
  libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype._onClickLeft", userInitiatedTargetWrapper, "WRAPPER");
  libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype._onClickRight2", userInitiatedTargetWrapper, "WRAPPER");
  libWrapper.register(MODULE_ID, "foundry.canvas.layers.TokenLayer.prototype.selectObjects", userInitiatedTargetWrapper, "WRAPPER");

  const gameVersion = game.system?.version;
  if ((game.system?.id === "dnd5e" && foundry.utils.isNewerVersion("3.3", gameVersion ?? ""))) {
    if (ui.notifications)
      ui.notifications.error(`dnd5e version ${gameVersion} is too old to support midi-qol, please update to 3.3.1 or later`);
    else
      error(`dnd5e version ${gameVersion} is too old to support midi-qol, please update to 3.3.1 or later`);
  }
}

export let visionPatching = () => {
  if (playerControlsInvisibleTokens) {
    ui.notifications?.warn("Player control vision is deprecated, use it at your own risk")
    console.warn("midi-qol | Player control vision is deprecated, use it at your own risk")

    log("Patching Token._isVisionSource")
    libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype._isVisionSource", _isVisionSource, "WRAPPER");

    log("Patching Token.isVisible")
    libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype.isVisible", isVisible, "WRAPPER");
  }
  log("Vision patching - ", playerControlsInvisibleTokens ? "enabled" : "disabled")
}

export let itemPatching = () => {
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.use", doItemUse, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.DamageRoll.prototype.configureDamage", configureDamage, "MIXED");
};

export let actorAbilityRollPatching = () => {

  log("Patching roll abilities Save/Test/Skill/Tool")
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollSavingThrow", rollSavingThrow, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollAbilityCheck", rollAbilityCheck, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollDeathSave", rollDeathSave, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollSkill", doRollSkill, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollToolCheck", rollToolCheck, "WRAPPER");
}

// ==================== END PATCHING ENTRY POINTS ====================

/**
 * Wrapper for Actor._onUpdate that handles wounded/dead status.
 * Runs AFTER dnd5e's _onUpdate completes, checking current state.
 * This is more robust than Hooks.on("updateActor") because:
 * 1. We run after dnd5e's status handling is complete
 * 2. We check actual current state, not stale update data
 * 3. Document lifecycle is more serialized than hook callbacks
 */
async function actorOnUpdate(this: Actor.Implementation, wrapped: Function, data: object, options: any, userId: string) {
  // Check if HP is changing - if so, we need to serialize the entire _onUpdate call
  // to prevent dnd5e's own status handling from racing with itself
  const hpUpdate = foundry.utils.getProperty(data, "system.attributes.hp.value");
  const temphpUpdate = foundry.utils.getProperty(data, "system.attributes.hp.temp");
  const hpChanging = hpUpdate !== undefined || temphpUpdate !== undefined;

  if (!hpChanging) {
    // No HP change - just call wrapped normally
    await wrapped(data, options, userId);
    return;
  }

  // HP is changing - serialize the entire _onUpdate call for this actor
  // This prevents concurrent HP updates from causing race conditions in dnd5e's status handling
  const semaphore = getActorWoundedSemaphore(this.uuid);
  await semaphore.add(async () => {
    // Let dnd5e and base Foundry handle their stuff first (now serialized)
    await wrapped(data, options, userId);

    // Only active GM processes wounded/dead status changes
    if (!game.users?.activeGM?.isSelf) return;

    // Skip if vitality update is pending - the updateItem hook will handle it
    if (!options.midiVitalityUpdatePending) {
      await processWoundedStatus(this);
    }
  });
}

/**
 * Process wounded/dead status based on CURRENT actor state.
 * This function reads the actor's current HP and vitality, not stale update data.
 *
 * IMPORTANT: Callers must acquire the actor's semaphore (via getActorWoundedSemaphore)
 * before calling this function to prevent race conditions.
 *
 * Called from actorOnUpdate (for HP changes) and updateItem hook (for vitality changes).
 */
export async function processWoundedStatus(actor: Actor.Implementation) {
  // Read current state - caller is responsible for serialization
  // @ts-expect-error no dnd5e-types
  const attributes = actor.system.attributes;
  if (!attributes?.hp) return;

    // Check for vitality system
    const vitalityItem = getVitalityItem(actor);
    const hasVitality = !!vitalityItem;

    // Get current vitality value
    let currentVitality: number | undefined;
    if (vitalityItem) {
      // @ts-expect-error uses exists on items with uses
      const maxUses = vitalityItem.system.uses?.max ?? 0;
      // @ts-expect-error uses exists on items with uses
      const spentUses = vitalityItem.system.uses?.spent ?? 0;
      currentVitality = maxUses - spentUses;
    }

    // Determine if actor needs to be dead
    const deathRequires = configSettings.optionalRules.vitalityDeathRequires || "vitalityOnly";
    let needsBeaten: boolean;
    if (hasVitality) {
      if (deathRequires === "vitalityOnly") {
        needsBeaten = (currentVitality ?? 0) <= 0;
      } else {
        needsBeaten = (currentVitality ?? 0) <= 0 && attributes.hp.value <= 0;
      }
    } else {
      needsBeaten = attributes.hp.value <= 0;
    }

    // Handle wounded status
    if (configSettings.addWounded > 0 && configSettings.addWoundedStyle !== "none") {
      const needsWounded = attributes.hp.pct <= configSettings.addWounded && !needsBeaten;
      const woundedStatus = getWoundedStatus();
      if (!woundedStatus) {
        const message = "wounded status condition not set - please update your midi-qol wounded condition on the mechanics tab";
        TroubleShooter.recordError(new Error(message), "In processWoundedStatus");
        ui.notifications?.warn(`midi-qol | ${message}`);
      } else {
        // toggleStatusEffect handles both cases gracefully - no need to check first
        await actor.toggleStatusEffect(woundedStatus.id!, {
          overlay: configSettings.addWoundedStyle === "overlay",
          active: needsWounded
        });
      }
    }

    // Handle dead status
    if (hasVitality) {
      const effect = getVitalityDeadStatus();
      if (effect) {
        await setDeadStatus(actor, { effect, useDefeated: configSettings.markNonPlayerDefeated, makeDead: needsBeaten });
      }
    } else if (configSettings.addDead !== "none") {
      let effect = getDeadStatus();
      let useDefeated = configSettings.markNonPlayerDefeated;
      // @ts-expect-error no dnd5e-types
      if (actor.type === "character" || actor.hasPlayerOwner || actor.system.traits?.important) {
        effect = getUnconsciousStatus();
        useDefeated = configSettings.markPlayerDefeated;
      }
      if (effect) {
        await setDeadStatus(actor, { effect, useDefeated, makeDead: needsBeaten });
      }
    }
}

function _isVisionSource(this: Token.Implementation, wrapped) {
  const isVisionSource = wrapped();
  if (this.document.hidden && !game.user?.isGM && game.user && this.actor?.testUserPermission(game.user, "OWNER")) {
    return true;
  }
  return isVisionSource;
}

function isVisible(this: Token.Implementation, wrapped) {
  const isVisible = wrapped();
  if (!game.user?.isGM && game.user && this.actor?.testUserPermission(game.user, "OWNER")) {
    return true;
  }
  return isVisible;
}

/**
 * Determines the roll mode for a roll, applying blind roll settings if configured.
 * If the roll should be blind, sets the core rollMode setting temporarily (caller must restore).
 *
 * @param blindRollSettings - Array of IDs that should force blind roll (e.g., configSettings.rollSkillsBlind)
 * @param choiceId - The ability/skill/tool ID being rolled
 * @param messageRollMode - Roll mode from message config (takes priority if already BLIND)
 * @returns The roll mode to use
 */
function applyBlindRollMode(
  blindRollSettings: string[],
  choiceId: string | undefined,
  messageRollMode: keyof CONFIG.Dice.RollModes | undefined
): keyof CONFIG.Dice.RollModes {
  let rollMode: keyof CONFIG.Dice.RollModes = messageRollMode ?? safeGetGameSetting("core", "rollMode");

  // If already blind, keep it
  if (rollMode === CONST.DICE_ROLL_MODES.BLIND) return rollMode;

  // Check if this roll should be forced to blind
  const shouldBeBlind = blindRollSettings.includes("all") || blindRollSettings.includes(choiceId ?? "");
  if (shouldBeBlind && [CONST.DICE_ROLL_MODES.PUBLIC, "roll", CONST.DICE_ROLL_MODES.PRIVATE].includes(rollMode)) {
    rollMode = CONST.DICE_ROLL_MODES.BLIND;
    game.settings.set("core", "rollMode", CONST.DICE_ROLL_MODES.BLIND);
  }

  return rollMode;
}

export interface Options {
  advantage: boolean | undefined,
  disadvantage: boolean | undefined,
  fastForward: boolean | undefined,
  fastForwardSet: boolean | undefined,
  parts: [] | undefined,
  chatMessage: boolean | undefined,
  rollToggle: boolean | undefined,
  other: boolean | undefined,
  autoRollAttack: boolean | undefined,
  autoRollDamage: boolean | undefined,
  fastForwardAttack: boolean | undefined,
  fastForwardDamage: boolean | undefined,
  fastForwardAbility: boolean | undefined,
  isMagicSave?: boolean,
  saveItemUuid?: string,
  saveItem?: Item,
  item?: Item,
  itemUuid?: string,
  simulate?: boolean,
  target?: number,
  rollType?: string
};
export const defaultRollOptions: Options = {
  advantage: false,
  disadvantage: false,
  fastForward: undefined,
  fastForwardSet: undefined,
  parts: undefined,
  chatMessage: undefined,
  rollToggle: undefined,
  other: undefined,
  autoRollAttack: undefined,
  autoRollDamage: undefined,
  fastForwardAttack: undefined,
  fastForwardDamage: undefined,
  fastForwardAbility: undefined
};

export function collectBonusFlags(actor: Actor.Implementation, category: string, detail: string) {
  const bonusFlags = Object.keys(actor.flags[MODULE_ID]?.optional ?? [])
    .filter(flag => {
      const checkFlag = actor.flags[MODULE_ID]!.optional![flag][category];
      if (checkFlag === undefined) return false;
      if (detail.startsWith("fail")) {
        const [_, type] = detail.split(".");
        return checkFlag.fail && checkFlag.fail[type] ? getOptionalCountRemainingShortFlag(actor, flag) > 0 : false;
      } else if (!(typeof checkFlag === "string" || checkFlag[detail] || checkFlag["all"] !== undefined)) return false;
      if (actor.flags[MODULE_ID]!.optional![flag].count === undefined) return true;
      return getOptionalCountRemainingShortFlag(actor, flag) > 0;
    })
    .map(flag => {
      const checkFlag = actor.flags[MODULE_ID]!.optional![flag][category];
      if (typeof checkFlag === "string") return `flags.midi-qol.optional.${flag}`;
      else return `flags.midi-qol.optional.${flag}`;
    });
  return bonusFlags;
}

export async function bonusCheck(actor: Actor.Implementation, result: Roll, category: string, detail = "", messageData: any = {}): Promise<Roll> {
  detail ||= foundry.utils.getProperty(messageData, "flags.dnd5e.roll.type") as string; // death saves -> "death", tool checks -> "tool"
  let bonusFlags = collectBonusFlags(actor, category, detail);
  if (bonusFlags.length > 0) {
    const data = {
      actor,
      roll: result,
      rollHTML: await midiRenderRoll(result),
      rollTotal: result.total,
      category,
      detail: detail,
      messageData
    }
    let title: string | undefined;
    if (GameSystemConfig.abilities[detail]?.label || GameSystemConfig.skills[detail]?.label) {
      if (detail.startsWith("fail")) title = "Failed Save Check";
      else if (category.startsWith("check")) title = i18nFormat("DND5E.AbilityPromptTitle", { ability: GameSystemConfig.abilities[detail].label ?? "" });
      else if (category.startsWith("save")) title = i18nFormat("DND5E.SavePromptTitle", { ability: GameSystemConfig.abilities[detail].label ?? "" });
      else if (category.startsWith("skill")) title = i18nFormat("DND5E.SkillPromptTitle", {
        //@ts-expect-error no dnd5e types
        ability: GameSystemConfig.abilities[actor.system.skills[detail]?.ability]?.label ?? "",
        skill: GameSystemConfig.skills[detail].label ?? ""
      });
    } else {
      if (detail.startsWith("fail")) title = "Failed Save Check";
      else if (category.startsWith("check")) title = i18nFormat("DND5E.AbilityPromptTitle", { ability: GameSystemConfig.abilities[detail] ?? "" });
      else if (category.startsWith("save")) title = i18nFormat("DND5E.SavePromptTitle", { ability: GameSystemConfig.abilities[detail] ?? "" });
      else if (category.startsWith("skill")) title = i18nFormat("DND5E.SkillPromptTitle", {
        //@ts-expect-error no dnd5e types
        ability: GameSystemConfig.abilities[actor.system.skills[detail]?.ability] ?? "",
        skill: GameSystemConfig.skills[detail] ?? ""
      });
    }

    const displayBonusRolls: boolean = !!(bonusFlags.reduce((returnValue: boolean | undefined, flag: string) => returnValue || (foundry.utils.getProperty(actor ?? {}, `${flag}.displayBonusRolls`) as boolean | undefined), undefined)
      ?? checkMechanic("displayBonusRolls"));
    const newRoll = await bonusDialog.bind(data)(
      bonusFlags,
      detail ? `${category}.${detail}` : category,
      displayBonusRolls,
      `${actor.name} - ${title}`,
      data.roll,
      "roll",
      { messageData }
    );
    if (newRoll) result = newRoll;
  }

  return result;
}

async function doRollSkill(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  let oldFormat = false;
  config.midiOptions ??= {};
  let preRollSkillHookId: number | undefined;
  let rollSkillHookId: number | undefined;
  //@ts-expect-error
  let result: CONFIG.Dice.D20Roll[] = [];
  const saveRollMode: keyof CONFIG.Dice.RollModes = safeGetGameSetting("core", "rollMode");
  try {
    message.data ??= {};
    let skillId = config.skill;
    const rollSkills: string[] = config.midiOptions?.rollSkills ?? (skillId ? [skillId] : []);
    if (rollSkills.length === 0)
      throw new Error(`doRollSkill called with no skills to roll for ${this.name}`);

    let overtimeActorUuid: string | undefined;
    if (config.event) { // TODO Decide if we want to do this or support core behaviour of anyone rolling concentration check
      // @ts-expect-error we know better
      const target = config.event?.target?.closest('.roll-link, [data-action="rollRequest"], [data-action="concentration"]');
      if (target?.dataset?.midiOvertimeActorUuid) overtimeActorUuid = target.dataset.midiOvertimeActorUuid;
      if (overtimeActorUuid && this.uuid !== overtimeActorUuid) {
        const actualActor = fromUuidSync(overtimeActorUuid) as Actor.Implementation | undefined;
        //@ts-expect-error no dnd5e types
        if (actualActor) return actualActor.rollSkill(config, dialog, message);
      }
    }
    // Check if advantage was pre-computed by an external module (Monks Token Bar, Flash Rolls, Epic Rolls)
    const sourceInfo = getAdvantageSourceInfo(config);
    const isExternalModuleRoll = sourceInfo.isExternalModule;

    let hasPreComputedAdvantage = false;
    if (!config.midiOptions.recomputeAdvantage) {
      hasPreComputedAdvantage = applyPreComputedAdvantage(config);
      if (hasPreComputedAdvantage && isAutoFastForward("skill")) {
        config.midiOptions.fastForward = true;
      }
    }
    // Ensure workflow is set up from workflowId if needed
    if (!config.midiOptions.workflow && config.midiOptions.workflowId) {
      config.midiOptions.workflow = Workflow.getWorkflow(config.midiOptions.workflowId);
    }

    let success: boolean | undefined = undefined;
    let rollMode: keyof CONFIG.Dice.RollModes = message.rollMode ?? safeGetGameSetting("core", "rollMode");
    if (dialog.configure === undefined && config.midiOptions.fastForward) dialog.configure = false;

    let skillModifiers: RollModifierResult;
    const midiOptions = config.midiOptions;

    // Check if advantageByChoice was passed in (from Workflow via GMAction with deserialized trackers)
    const passedSkillAdvantageMap = config.midiOptions?.advantageByChoice as Record<string, PreComputedAdvantage> | undefined;
    const hasPassedSkillAdvantage = passedSkillAdvantageMap && Object.keys(passedSkillAdvantageMap).length > 0 &&
      Object.values(passedSkillAdvantageMap).some(v => v.tracker instanceof RollModifierTracker);

    // Skip building advantage map for external module rolls - they already computed advantage
    const preComputedSkillAdvantageMap: Record<string, PreComputedAdvantage> = isExternalModuleRoll
      ? {} // External modules handle their own advantage - don't recompute
      : hasPassedSkillAdvantage && passedSkillAdvantageMap
        ? passedSkillAdvantageMap
        : await buildPreComputedAdvantageMap(this, "skill", rollSkills, config.midiOptions ?? {});

    // Setup dialog with MidiRollChoiceDialog helper
    let userExplicitChoice: string | undefined;
    const { hasMultiple: hasMultipleSkills } = setupChoiceDialog(
      this, config, dialog, "skill", rollSkills,
      preComputedSkillAdvantageMap, hasPreComputedAdvantage, "skill",
      (choice) => { userExplicitChoice = choice; }
    );

    preRollSkillHookId = Hooks.once("dnd5e.preRollSkill", (configData, dialogData, messageData) => {
      configData.midiOptions = { ...(configData.midiOptions ?? {}), ...(midiOptions ?? {}) };
      messageData.data ??= {};
      if (overtimeActorUuid) messageData.data["flags.midi-qol.overtimeActorUuid"] = overtimeActorUuid;

      const skillAdvantageValues = Object.values(preComputedSkillAdvantageMap);
      const allAutoFail = skillAdvantageValues.length > 0 && skillAdvantageValues.every(d => {
        const tracker = d.tracker instanceof RollModifierTracker ? d.tracker : undefined;
        return tracker?.modifiers.willFail;
      });
      if (hasMultipleSkills && !allAutoFail && dialogData.configure !== false) {
        dialogData.configure = true;
      } else {
        const chosenSkill = configData.skill ?? skillId;
        const chosenAdvantage = preComputedSkillAdvantageMap[chosenSkill!];
        if (chosenAdvantage) {
          // Only override advantage/disadvantage if not pre-computed from external module
          // (Monks Token Bar, Flash Rolls, Epic Rolls pass their own advantage/disadvantage)
          if (!hasPreComputedAdvantage) {
            configData.advantage = chosenAdvantage.hasAdvantage;
            configData.disadvantage = chosenAdvantage.hasDisadvantage;
          }
          const chosenTracker = chosenAdvantage.tracker instanceof RollModifierTracker ? chosenAdvantage.tracker : undefined;
          if (chosenTracker) {
            skillModifiers = applyRollModifiers(chosenTracker, configData, dialogData);
            if (skillModifiers.autoFail) success = false;
          }
        }
      }
      setRollDialogOptions(configData, dialogData, "skill");
    });
    rollSkillHookId = Hooks.once("dnd5e.postSkillRollConfiguration", (rolls, configData, dialog, messageDetails) => {
      // record message configuration details for later display
      message = messageDetails;

      // Detect skill change from choice dialog and check auto-fail/auto-success
      if (configData.skill && configData.skill !== skillId) {
        skillId = configData.skill;
      }
      const chosenSkillData = preComputedSkillAdvantageMap[skillId ?? ""];
      const chosenSkillTracker = chosenSkillData?.tracker instanceof RollModifierTracker ? chosenSkillData.tracker : undefined;
      if (chosenSkillTracker?.modifiers.willFail) success = false;
      else if (chosenSkillTracker?.modifiers.willSucceed) success = true;

      // Apply blind roll mode based on chosen skill
      messageDetails.rollMode = applyBlindRollMode(configSettings.rollSkillsBlind, skillId, messageDetails.rollMode);

      return true;
    });

    const saveCreate = message.create;
    message.create = false;

    // Set originatingMessage so dnd5e's MessageRegistry and getOriginatingMessage() work correctly
    const originatingCardId = config.midiOptions?.workflow?.itemCardId
      ?? (config.midiOptions?.itemCardUuid ? fromUuidSync(config.midiOptions.itemCardUuid)?.id : undefined);
    if (originatingCardId) foundry.utils.setProperty(message, "data.flags.dnd5e.originatingMessage", originatingCardId);

    if (this.token) foundry.utils.setProperty(dialog, "options.window.subtitle", this.token.name);
    result = await wrapped(config, dialog, message);
    message.create = saveCreate;

    if (!result) return result;
    rollMode = message.rollMode ?? rollMode;
    result.forEach(r => r.options.rollMode = rollMode);
    /*
    if (rollMode !== CONST.DICE_ROLL_MODES.BLIND) rollMode = result.options.rollMode;
    else result.options.rollMode = CONST.DICE_ROLL_MODES.BLIND;
    */
    await displayDSNForRoll(result, "skill", rollMode);
    DSNMarkDiceDisplayed(result);
    if (!config.simulate) {
      result[0] = await bonusCheck(this, result[0], "skill", skillId, message.data);
      DSNMarkDiceDisplayed(result);
      // Check for skill fail bonuses if the roll fails against target
      if (Number.isNumeric(result[0].options.target) && result[0].isSuccess === false) {
        const failFlagsLength = collectBonusFlags(this, "skill", "fail.all").length;
        const failSkillFlagsLength = collectBonusFlags(this, "skill", `fail.${skillId}`).length;
        if (failFlagsLength || failSkillFlagsLength) {
          // If the roll fails and there is a flags.midi-qol.optional.NAME.skill.fail flag, apply the bonus
          result[0] = await bonusCheck(this, result[0], "skill", failSkillFlagsLength ? `fail.${skillId}` : "fail.all", message.data);
          DSNMarkDiceDisplayed(result);
        }
      }
    }
    if (config.target !== undefined && success === undefined) {
      const resultTotal = result.reduce((acc, r) => acc + r.total, 0);
      success = resultTotal >= config.target;
      result.forEach(r => r.options.success = success);
    }
    // Stamp the chosen skill on the rolls (after bonusCheck) so the save display can show which skill was used
    // userExplicitChoice is set by buildConfig wrapper when user changes dropdown; config.skill is the auto-selected best
    const _chosenSkill = userExplicitChoice ?? config.skill;
    if ((config.midiOptions?.rollSkills?.length ?? 0) > 1) result.forEach(r => { if (r?.options) r.options.midiChosenId = _chosenSkill; });

    // Set originatingMessage on roll options so modules can access it without .parent
    const rollOriginatingId = foundry.utils.getProperty(message, "data.flags.dnd5e.originatingMessage") as string | undefined
      ?? originatingCardId;
    if (rollOriginatingId) result.forEach(r => { if (r?.options) r.options.originatingMessage = rollOriginatingId; });

    if (message.create !== false && result) {
      if (foundry.utils.getProperty(result, "flags.midi-qol.chatMessageShown") !== true) {
        const messageData: any = foundry.utils.mergeObject({ sound: CONFIG.sounds.dice }, message.data ?? {});
        messageData.rolls = [...result];
        const chatMsg = await ChatMessage.create(messageData, { rollMode });
        // dnd5e sets roll.parent in buildPost; replicate here since we bypass buildPost
        if (chatMsg) result.forEach(r => (r as any).parent = chatMsg);
      }
    }
    if (skillId) await expireRollEffect.bind(this)("Skill", skillId, success);

  } catch (err) {
    const message = `doRollSkill error ${this.name}, ${this.uuid}`;
    TroubleShooter.recordError(err, message)
    throw err;
  }
  finally {
    if (preRollSkillHookId) Hooks.off("dnd5e.preRollSkill", preRollSkillHookId);
    if (rollSkillHookId) Hooks.off("dnd5e.postSkillRollConfiguration", rollSkillHookId);
    if (saveRollMode) game.settings.set("core", "rollMode", saveRollMode);
    if (oldFormat) return result?.[0];
    return result;
  }
}

/**
 * Extracts pre-computed advantage/disadvantage from roll config.
 * Different modules store advantage in different locations:
 *
 * | Source                  | Module              | Location                              |
 * |-------------------------|---------------------|---------------------------------------|
 * | direct                  | Flash Rolls, GMAction| config.advantage/disadvantage        |
 * | event                   | Monks TokenBar      | config.event.advantage/disadvantage   |
 * | rolls                   | Epic Rolls          | config.rolls[0].options.adv/disadv    |
 * | midiOptions             | midi-qol internal   | config.midiOptions.advantage/disadv   |
 *
 * "External" modules are those that don't provide midiOptions.workflowId:
 * - Monks TokenBar, Epic Rolls, Flash Rolls → external (override their fastForward)
 * - GMAction, character sheet rolls → internal (use midi-qol's normal flow)
 */
type AdvantageSourceType = 'monks-tokenbar' | 'epic-rolls-5e' | 'flash-rolls-5e' | 'midi-qol' | 'none';

interface AdvantageSourceInfo {
  advantage: boolean | undefined;
  disadvantage: boolean | undefined;
  hasPreComputed: boolean;      // true if any source provided advantage/disadvantage
  isExternalModule: boolean;    // true if from external module (no workflowId)
  sourceType: AdvantageSourceType;  // module name that provided the advantage/disadvantage
  hasEvent: boolean;            // true if config.event exists (for shift key checking)
}

function getAdvantageSourceInfo(config: RollProcessConfig): AdvantageSourceInfo {
  // Source 1: Direct on config (Flash Rolls sets this, midi-qol GMAction also sets this)
  const directAdvantage = config.advantage;
  const directDisadvantage = config.disadvantage;
  const hasDirect = directAdvantage !== undefined || directDisadvantage !== undefined;

  // Source 2: Event object (Monks TokenBar sets event.advantage/event.disadvantage)
  // @ts-expect-error event may have advantage/disadvantage properties
  const eventAdvantage = config.event?.advantage;
  // @ts-expect-error event may have advantage/disadvantage properties
  const eventDisadvantage = config.event?.disadvantage;
  const hasEventAdvantage = eventAdvantage !== undefined || eventDisadvantage !== undefined;

  // Source 3: rolls[0].options (Epic Rolls)
  const rollsAdvantage = config.rolls?.[0]?.options?.advantage;
  const rollsDisadvantage = config.rolls?.[0]?.options?.disadvantage;
  const hasRolls = rollsAdvantage !== undefined || rollsDisadvantage !== undefined;

  // Source 4: midiOptions (midi-qol internal)
  const midiAdvantage = config.midiOptions?.advantage;
  const midiDisadvantage = config.midiOptions?.disadvantage;
  const hasMidiOptions = midiAdvantage !== undefined || midiDisadvantage !== undefined;

  // Combine all sources (first defined value wins)
  const advantage = directAdvantage ?? eventAdvantage ?? rollsAdvantage ?? midiAdvantage;
  const disadvantage = directDisadvantage ?? eventDisadvantage ?? rollsDisadvantage ?? midiDisadvantage;

  // Determine if this is from an external module
  // External = has pre-computed advantage, NO workflowId, AND the matching module is active
  const hasWorkflowId = !!config.midiOptions?.workflowId;
  const hasExternalSource =
    (hasEventAdvantage && !!installedModules.get("monks-tokenbar"))
    || (hasRolls && !hasWorkflowId && !!installedModules.get("epic-rolls-5e"))
    // @ts-expect-error Flash Rolls sets config._isFlashRoll on its request rolls
    || (config._isFlashRoll && !!installedModules.get("flash-rolls-5e"));

  // Determine which module provided the advantage/disadvantage based on how it was passed
  // Only match a specific module if it is actually active
  let sourceType: AdvantageSourceType = 'none';
  if (hasEventAdvantage && installedModules.get("monks-tokenbar")) {
    sourceType = 'monks-tokenbar';  // Monks TokenBar passes event.advantage/disadvantage
  } else if (hasRolls && !hasWorkflowId && installedModules.get("epic-rolls-5e")) {
    sourceType = 'epic-rolls-5e';   // Epic Rolls passes rolls[0].options.advantage/disadvantage
  // @ts-expect-error Flash Rolls sets config._isFlashRoll on its request rolls
  } else if (config._isFlashRoll && installedModules.get("flash-rolls-5e")) {
    sourceType = 'flash-rolls-5e';  // Flash Rolls marks its rolls with config._isFlashRoll
  } else if (hasDirect || hasMidiOptions) {
    sourceType = 'midi-qol';        // midi-qol internal (GMAction, character sheet, etc.)
  }

  // Check if event object exists (for shift key detection)
  // Monks TokenBar passes the event, Epic Rolls nulls it when fast-forwarding, Flash Rolls doesn't pass it
  const hasEvent = !!config.event;

  return {
    advantage,
    disadvantage,
    hasPreComputed: hasDirect || hasEventAdvantage || hasRolls || hasMidiOptions,
    isExternalModule: hasExternalSource,
    sourceType,
    hasEvent
  };
}

function getExternalModuleFastForward(sourceInfo: AdvantageSourceInfo, rollType: FastForwardRollType): boolean {
  // Get the appropriate fast forward setting based on which external module is the source
  switch (sourceInfo.sourceType) {
    case 'monks-tokenbar':
      if (installedModules.get("monks-tokenbar")) {
        return safeGetGameSetting("monks-tokenbar", "bypass-roll-dialog") as boolean ?? false;
      }
      break;
    case 'flash-rolls-5e':
    case 'midi-qol':
    case 'epic-rolls-5e':
    case 'none':
    default:
      return isAutoFastForward(rollType);
  }
  return isAutoFastForward(rollType);
}

function setRollDialogOptions(config: RollProcessConfig, dialog: RollDialogConfig, rollType: FastForwardRollType) {
  dialog.options ??= {};
  // @ts-expect-error CONFIG.Dice.D20Roll not typed
  const ADV_MODE: { DISADVANTAGE: number, NORMAL: number, ADVANTAGE: number } = CONFIG.Dice.D20Roll.ADV_MODE;
  const sourceInfo = getAdvantageSourceInfo(config);

  // Determine dialog visibility (whether to show the roll configuration dialog)
  // If dialog.configure was explicitly set by the caller (a boolean, not undefined),
  // respect that value. This allows macros/code to pass configure: false to skip the
  // dialog or configure: true to force it, regardless of module settings.
  if (dialog.configure !== undefined) {
    // Caller explicitly set dialog.configure — preserve it
  } else if (sourceInfo.isExternalModule) {
    // External module (Flash Rolls, Monks TokenBar, Epic Rolls): use the module's own fast forward setting
    // Shift key toggle is handled below for modules that pass the event (Monks TokenBar)
    const moduleFastForward = getExternalModuleFastForward(sourceInfo, rollType);
    dialog.configure = !moduleFastForward;
  } else {
    // Standard midi-qol flow (character sheet rolls, checkSaves, etc.)
    if (config.midiOptions?.fastForward) dialog.configure = false;
    if (isAutoFastForward(rollType)) dialog.configure = false;
  }

  // Shift key toggle - only works if event is available
  // This handles: character sheet rolls, Monks TokenBar (has event),
  // but NOT Flash Rolls or Epic Rolls (no event when fast-forwarding)
  if (areMidiKeysPressed(config.event, "RollToggle")) {
    dialog.configure = !dialog.configure;
  }

  // Set advantage mode for the dialog (use source info + rolls[0].options for dnd5e native)
  const rollOptions = config.rolls?.[0]?.options;
  const hasAdvantage = sourceInfo.advantage || rollOptions?.advantage;
  const hasDisadvantage = sourceInfo.disadvantage || rollOptions?.disadvantage;

  if (hasAdvantage && !hasDisadvantage) {
    dialog.options.advantageMode = ADV_MODE.ADVANTAGE;
    dialog.options.defaultButton = "advantage";
  } else if (!hasAdvantage && hasDisadvantage) {
    dialog.options.advantageMode = ADV_MODE.DISADVANTAGE;
    dialog.options.defaultButton = "disadvantage";
  } else {
    dialog.options.advantageMode = ADV_MODE.NORMAL;
    dialog.options.defaultButton = "normal";
  }
}

/**
 * Applies pre-computed advantage/disadvantage to config if found.
 * Returns true if pre-computed values were found (caller should skip computing from flags).
 */
function applyPreComputedAdvantage(config: RollProcessConfig): boolean {
  const sourceInfo = getAdvantageSourceInfo(config);
  if (!sourceInfo.hasPreComputed) {
    return false;
  }

  // Apply to config if not already set
  config.advantage ??= sourceInfo.advantage;
  config.disadvantage ??= sourceInfo.disadvantage;
  return true;
}

type RollChoiceType = "skill" | "ability" | "tool";

/**
 * Sets up MidiRollChoiceDialog for multi-choice rolls (skill, ability, or tool).
 * Configures dialog options, auto-selects best choice, and wraps buildConfig to capture user selection.
 */
function setupChoiceDialog(
  actor: Actor.Implementation,
  config: RollProcessConfig,
  dialog: RollDialogConfig,
  choiceType: RollChoiceType,
  choices: string[],
  advantageMap: Record<string, PreComputedAdvantage>,
  hasPreComputedAdvantage: boolean,
  rollTypeForChoices: "skill" | "tool" | "save" | "check",
  onChoiceCapture: (choice: string) => void
): { hasMultiple: boolean } {
  const hasMultiple = choices.length > 1;

  dialog.applicationClass = MidiRollChoiceDialog;
  dialog.options ??= {};
  const rollChoices = buildRollChoices(actor, rollTypeForChoices, choices);
  const best = selectBestRollChoice(rollChoices, advantageMap);

  if (best) {
    if (hasMultiple) (config as AnyMutableObject)[choiceType] = best.value;
    const bestAdvantage = advantageMap[best.value];
    if (bestAdvantage && !hasPreComputedAdvantage) {
      config.advantage = bestAdvantage.hasAdvantage;
      config.disadvantage = bestAdvantage.hasDisadvantage;
    }
  }

  dialog.options.rollChoices = rollChoices;
  dialog.options.advantageByChoice = advantageMap;
  dialog.options.choiceType = choiceType;

  // Only set buildConfig when we need to rebuild parts on choice change:
  // - Skills/tools: Always (dnd5e's pattern expects buildConfig to construct parts)
  // - Saves/checks: Only if multiple abilities (single ability is fully handled by dnd5e)
  const needsBuildConfig = (choiceType === "skill" || choiceType === "tool") || hasMultiple;

  if (needsBuildConfig) {
    const buildConfigType = (choiceType === "skill" || choiceType === "tool")
      ? choiceType
      : rollTypeForChoices; // "save" or "check" for ability rolls
    const baseBuildConfig = MidiRollChoiceDialog.createBuildConfig(actor, buildConfigType, advantageMap);

    dialog.options.buildConfig = (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => {
      baseBuildConfig(processConfig, rollConfig, formData, index);
      if (formData && index === 0) {
        const chosen = formData.get?.(choiceType);
        if (chosen && typeof chosen === "string") onChoiceCapture(chosen);
      }
    };
  }

  if (hasMultiple && dialog.configure !== false) dialog.configure = true;

  return { hasMultiple };
}

function multiply(modifier: string) {
  const rgx = /mx([0-9])+/;
  const match = modifier.match(rgx);
  if (!match) return false;
  let [mult] = match.slice(1);
  const multiplier = parseInt(mult);
  for (let r of this.results) {
    r.count = multiplier * r.result;
    r.rerolled = true;
  }
  return true;
}

export function addDiceTermModifiers() {
  const Die = foundry.dice.terms.Die;
  Die.MODIFIERS["mx"] = "multiply";
  foundry.utils.setProperty(Die.prototype, "multiply", multiply);
}

export function averageDice(roll: Roll) {
  roll.terms = roll.terms.map(term => {
    if (term instanceof foundry.dice.terms.DiceTerm) {
      const mult = term.modifiers.includes("mx2") ? 2 : 1
      const newTerm = new NumericTerm({ number: Math.floor((term.number ?? 1) * mult * ((term.faces ?? 1) + 1) / 2) });
      newTerm.options = foundry.utils.duplicate(term.options);
      return newTerm;
    }
    return term;
  });
  roll.resetFormula();
  return roll;
}

function applyDamageModifiers(damageRoll: Roll): Roll {
  if (damageRoll.options?.["midi-qol"]?.modifiers?.length) {
    damageRoll.terms.forEach(term => {
      if (term instanceof foundry.dice.terms.DiceTerm) {
        term.modifiers ??= [];
        term.modifiers = term.modifiers.concat(damageRoll.options["midi-qol"].modifiers);
      }
    })
  }
  return damageRoll;
}

// @ts-expect-error no dnd5e-types
function configureDamage(this: CONFIG.Dice.DamageRoll, wrapped, options: any = { critical: {} }) {
  // Remove existing critical damage
  this.terms = this.terms.filter(t => !t.options.criticalBonusDamage && !t.options.criticalFlatBonus);
  this.terms.forEach(term => {
    if (term._number instanceof Roll) {
      // Complex number term.
      if (!term._number.isDeterministic) return;
      if (!term._number._evaluated) term._number.evaluateSync();
    }
    term.number = term.options.baseNumber ?? term.number;
    if (term.options.baseModifiers) {
      term.modifiers = foundry.utils.deepClone(term.options.baseModifiers);
    }
  });
  this.resetFormula();
  if (!this.configured) applyDamageModifiers(this);
  let useDefaultCritical = getCriticalDamage() === "default";
  useDefaultCritical ||= (getCriticalDamage() === "explodeCharacter" && this.data.actorType !== "character");
  useDefaultCritical ||= (getCriticalDamage() === "explodeNPC" && this.data.actorType !== "npc");
  const criticalNotAllowed = this.options.critical?.allow === false || options.critical?.allow === false;
  if (criticalNotAllowed || !this.isCritical || useDefaultCritical) {
    const effectiveIsCritical = criticalNotAllowed ? false : this.isCritical;
    options.critical.allow = effectiveIsCritical;
    this.options.isCritical = effectiveIsCritical;
    //@ts-expect-error "dnd5e"
    options.critical.multiplyNumeric ??= game.settings.get("dnd5e", "criticalDamageModifiers");
    //@ts-expect-error "dnd5e"
    options.critical.powerfulCritical ??= game.settings.get("dnd5e", "criticalDamageMaxDice");
    wrapped({ critical: options.critical });
    // if (this.data.actorType === configSettings.averageDamage || configSettings.averageDamage === "all") averageDice(this);
    return;
  }
  this.simplify();
  const OperatorTerm = foundry.dice.terms.OperatorTerm
  const DiceTerm = foundry.dice.terms.DiceTerm;
  const Die = foundry.dice.terms.Die;

  // if (this.options.configured) return; seems this is not required.
  let bonusTerms: foundry.dice.terms.RollTerm[] = [];
  /* criticalDamage is one of 
    "default": "DND5e Settings Only",
    "maxDamage": "Max Normal Damage",
    "maxCrit": "Max Critical Dice (flat number)",
    "maxCritRoll": "Max Critical Dice (roll dice)",
    "maxAll": "Max All Dice",
    "doubleDice": "Double Rolled Damage",
    "explode": "Explode all critical dice",
    "explodePlayer": "Explode Player critical dice",
    "explodeGM": "Explode GM crtical dice",
    "baseDamage": "Only Weapon Extra Critical",
    "maxBaseRollCrit": "Max base damage and roll critical dice",
    "bestOfTwo": "Best of two rolls",
  },
 */
  // if (criticalDamage === "doubleDice") this.options.multiplyNumeric = true;
  this.simplify();


  for (let [i, term] of this.terms.entries()) {
    let cm = this.options.critical?.multiplier ?? 2;
    let cb = (this.options.critical?.bonusDice && (i === 0)) ? this.options.critical?.bonusDice : 0;
    if (term._number instanceof Roll) {
      // Complex number term.
      if (!term._number.isDeterministic) continue;
      if (!term._number._evaluated) term._number.evaluateSync();
    }
    if (term.modifiers && !term.options.baseModifiers) {
      term.options.baseModifiers = foundry.utils.deepClone(term.modifiers);
    }
    if (term.modifiers) {
      term.modifiers = foundry.utils.deepClone(term.options.baseModifiers);
    }
    term.options.baseNumber = term.options.baseNumber ?? term.number;
    term.number = term.options.baseNumber;

    switch (getCriticalDamage()) {
      case "maxDamage":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        break;
      case "maxDamageExplode":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        if (term instanceof DiceTerm) {
          //@ts-expect-error no dnd5e-types
          bonusTerms.push(new OperatorTerm({ operator: "+", options: { criticalBonusDamage: true } }));
          const newTerm = new Die({ number: term.number + cb, faces: term.faces })
          newTerm.modifiers.push(`x${term.faces}`);
          newTerm.options = foundry.utils.deepClone(term.options)
          //@ts-expect-error no dnd5e-types
          newTerm.options.criticalBonusDamage = true;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          bonusTerms.push(newTerm);
        }
        break;
      case "maxCrit":  // Powerful critical
      case "maxCritRoll":
        if (term instanceof DiceTerm) {
          let critTerm;
          //@ts-expect-error no dnd5e-types
          bonusTerms.push(new OperatorTerm({ operator: "+", options: { criticalBonusDamage: true } }));
          if (getCriticalDamage() === "maxCrit")
            critTerm = new NumericTerm({ number: (term.number + cb) * (term.faces ?? 1) });
          else {
            critTerm = new Die({ number: term.number + cb, faces: term.faces });
            critTerm.modifiers = foundry.utils.deepClone(term.modifiers);
            critTerm.modifiers.push(`min${term.faces}`);
          }
          critTerm.options = foundry.utils.deepClone(term.options);
          critTerm.options.criticalBonusDamage = true;
          bonusTerms.push(critTerm);
        } else if (term instanceof NumericTerm && options.multiplyNumeric) {
          term.number *= cm;
        }
        break;
      case "maxAll":
        if (term instanceof DiceTerm) {
          term.alter(cm, cb);
          term.modifiers.push(`min${term.faces}`);
        } else if (term instanceof NumericTerm && this.options.multiplyNumeric) {
          term.number *= cm;
        }
        break;
      case "bestOfTwo":
        if (term instanceof DiceTerm) {
          term.modifiers.push(`kh${term.number !== 1 ? term.number : ""}`);
          term.number = (term.number ?? 1) * 2;
        }
        break;
      case "doubleDice":
        if (term instanceof DiceTerm) {
          //term.alter(cm, cb);
          term.modifiers.push("mx2");
        } else if (term instanceof NumericTerm && this.options.multiplyNumeric) {
          term.number *= cm;
        }
        break;
      case "explode":
      case "explodeCharacter":
      case "explodeNPC":
        if (term instanceof DiceTerm) {
          //@ts-expect-error no dnd5e-types
          bonusTerms.push(new OperatorTerm({ operator: "+", options: { criticalBonusDamage: true } }));
          const newTerm = new Die({ number: term.number + cb, faces: term.faces })
          newTerm.modifiers.push(`x${term.faces}`);
          newTerm.options = foundry.utils.deepClone(term.options);
          //@ts-expect-error no dnd5e-types
          newTerm.options.criticalBonusDamage = true;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          bonusTerms.push(newTerm);
        }
        break;
      case "maxBaseRollCrit":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        if (term instanceof DiceTerm) {
          //@ts-expect-error no dnd5e-types
          bonusTerms.push(new OperatorTerm({ operator: "+", options: { criticalBonusDamage: true } }));
          const newTerm = new Die({ number: term.number, faces: term.faces })
          newTerm.options = foundry.utils.deepClone(term.options);
          // @ts-expect-error no dnd5e-types
          newTerm.options.criticalBonusDamage = true;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          bonusTerms.push(newTerm);
        }
        break;
      case "baseDamage":
      default:
        break;
    }
  }
  if (bonusTerms.length > 0) this.terms.push(...bonusTerms);
  if (this.options.critical?.bonusDamage) {
    const extra = new Roll(this.options.critical.bonusDamage, this.data);
    for (let term of extra.terms) {
      if (term instanceof DiceTerm || term instanceof NumericTerm)
        if (!term.options?.flavor) term.options = foundry.utils.deepClone(this.terms[0].options);
      //@ts-expect-error
      term.options.criticalBonusDamage = true;
    }
    if (!(extra.terms[0] instanceof OperatorTerm))
      //@ts-expect-error no dnd5e-types
      this.terms.push(new OperatorTerm({ operator: "+", options: { criticalBonusDamage: true } }));
    this.terms.push(...extra.terms);
  }
  while (this.terms.length > 0 && this.terms[this.terms.length - 1] instanceof OperatorTerm)
    this.terms.pop();
  this.resetFormula();
  this.options.configured = true;
  // if (this.data.actorType === configSettings.averageDamage || configSettings.averageDamage === "all") averageDice(this);
}

async function doRollAbility(this: Actor.Implementation, wrapped, rollType: string, config: RollProcessConfig & { ability?: string } = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  let oldFormat = false;
  if (config.midiOptions?.target) config.target = config.midiOptions.target;
  if (config.midiOptions?.isConcentrationCheck) {
    foundry.utils.setProperty(message, "data.flags.midi-qol.isConcentrationCheck", true);
    config.midiOptions.isConcentrationCheck = false; // remove the isConcentrationCheck option so we won't infinitely recurse
    // Note to self concentration max/min value is now handled directly by dnd5e - so the flag has changed
    // @ts-expect-error no dnd5e-types
    return this.rollConcentration(config, dialog, message);
  }
  message.data ??= {};
  config.midiOptions ??= {};
  let abilityId = config.ability;
  const rollAbilities: string[] = config.midiOptions?.rollAbilities ?? (abilityId ? [abilityId] : []);
  let overtimeActorUuid: string | undefined;
  let preRollAbilityHookId: number | undefined;
  let rollAbilityHookId: number | undefined;
  const saveRollMode: keyof CONFIG.Dice.RollModes = safeGetGameSetting("core", "rollMode");
  let result: Roll[] | undefined;
  let type: "SavingThrow" | "AbilityCheck" = "SavingThrow";
  try {
    if (rollAbilities.length === 0 && rollType === "save")
      throw new Error(`doRollAbility called with no abilities to roll for ${this.name}`);
    if (config.event) {
      // Checks if we rolled from a concentration request dialog. If so use the actor specified in the request card
      // @ts-expect-error we know better
      const target = config?.event?.target?.closest('.roll-link, [data-action="rollRequest"], [data-action="concentration"]');
      if (target?.dataset?.midiOvertimeActorUuid) {
        overtimeActorUuid = target.dataset.midiOvertimeActorUuid;
        message.rollMode = target.dataset.midiRollMode ?? message.rollMode;
      }
      if (overtimeActorUuid && this.uuid !== overtimeActorUuid) {
        const actualActor = fromUuidSync(overtimeActorUuid) as Actor.Implementation | undefined;
        if (actualActor && rollType === "save")
          //@ts-expect-error no dnd5e types
          return actualActor.rollSavingThrow(config, dialog, message);
        //@ts-expect-error no dnd5e types
        else if (actualActor) return actualActor.rollAbilityCheck(config, dialog, message);
      }
    }

    if (config.target !== undefined && !checkRule("criticalSaves") && config.midiOptions) { // We have a target value, which means we are checking for success and not criticals
      config.midiOptions.critical = 21;
      config.midiOptions.fumble = 0;
    }

    // Check if advantage was pre-computed by an external module (Monks Token Bar, Flash Rolls, Epic Rolls)
    const sourceInfo = getAdvantageSourceInfo(config);
    const isExternalModuleRoll = sourceInfo.isExternalModule;

    let hasPreComputedAdvantage = false;
    if (!config.midiOptions.recomputeAdvantage) {
      hasPreComputedAdvantage = applyPreComputedAdvantage(config);
      if (hasPreComputedAdvantage && isAutoFastForward(rollType as FastForwardRollType)) {
        config.midiOptions.fastForward = true;
      }
    }
    // Ensure workflow is set up from workflowId if needed (for grants flag checking)
    if (!config.midiOptions.workflow && config.midiOptions.workflowId) {
      config.midiOptions.workflow = Workflow.getWorkflow(config.midiOptions.workflowId);
    }

    type = rollType === "save" ? "SavingThrow" : "AbilityCheck";
    let success: boolean | undefined;
    const saveCreate = message.create;
    message.create = false;

    // Set originatingMessage so dnd5e's MessageRegistry and getOriginatingMessage() work correctly
    const originatingCardId = config.midiOptions.workflow?.itemCardId
      ?? (config.midiOptions.itemCardUuid ? fromUuidSync(config.midiOptions.itemCardUuid)?.id : undefined);
    if (originatingCardId) foundry.utils.setProperty(message, "data.flags.dnd5e.originatingMessage", originatingCardId);

    let abilityModifiers: RollModifierResult | undefined;
    const midiOptions = config.midiOptions;

    // Check if advantageByChoice was passed in (from Workflow via GMAction with deserialized trackers)
    const passedAdvantageMap = config.midiOptions?.advantageByChoice as Record<string, PreComputedAdvantage> | undefined;
    const hasPassedAdvantage = passedAdvantageMap && Object.keys(passedAdvantageMap).length > 0 &&
      Object.values(passedAdvantageMap).some(v => v.tracker instanceof RollModifierTracker);
    // Concentration saves use the "concentration" roll type which composes with "save"
    const effectiveRollType = (rollType === "save" && config.hookNames?.includes("concentration")) ? "concentration" : rollType;

    // Skip building advantage map for external module rolls - they already computed advantage
    const preComputedAdvantageMap: Record<string, PreComputedAdvantage> = isExternalModuleRoll
      ? {} // External modules handle their own advantage - don't recompute
      : hasPassedAdvantage && passedAdvantageMap
        ? passedAdvantageMap
        : await buildPreComputedAdvantageMap(this, effectiveRollType, rollAbilities, config.midiOptions ?? {});

    // Setup dialog with MidiRollChoiceDialog helper
    let userExplicitChoice: string | undefined;
    const { hasMultiple: hasMultipleChoices } = setupChoiceDialog(
      this, config, dialog, "ability", rollAbilities,
      preComputedAdvantageMap, hasPreComputedAdvantage, rollType as "save" | "check",
      (choice) => { userExplicitChoice = choice; }
    );

    preRollAbilityHookId = Hooks.once(`dnd5e.preRoll${type}`, (configData, dialogData, _message) => {
      configData.midiOptions = { ...(configData.midiOptions ?? {}), ...(midiOptions ?? {}) };

      const advantageValues = Object.values(preComputedAdvantageMap);
      const allAutoFail = advantageValues.length > 0 && advantageValues.every(d => d.tracker instanceof RollModifierTracker && d.tracker.modifiers.willFail);
      if (hasMultipleChoices && !allAutoFail && dialogData.configure !== false) {
        dialogData.configure = true;
      } else {
        const chosenAbility = configData.ability ?? abilityId;
        const chosenAdvantage = preComputedAdvantageMap[chosenAbility!];
        if (chosenAdvantage) {
          // Only override advantage/disadvantage if not pre-computed from external module
          // (Monks Token Bar, Flash Rolls, Epic Rolls pass their own advantage/disadvantage)
          if (!hasPreComputedAdvantage) {
            configData.advantage = chosenAdvantage.hasAdvantage;
            configData.disadvantage = chosenAdvantage.hasDisadvantage;
          }
          if (chosenAdvantage.tracker instanceof RollModifierTracker) {
            abilityModifiers = applyRollModifiers(chosenAdvantage.tracker, configData, dialogData);
            if (abilityModifiers.autoFail) success = false;
          }
        }
      }
      setRollDialogOptions(configData, dialogData, rollType as FastForwardRollType);
    });

    rollAbilityHookId = Hooks.once(`dnd5e.post${type}RollConfiguration`, (rolls, configData, dialogData, messageDetails) => {
      // record the configured message data for later display
      message = messageDetails;

      // Detect ability change from choice dialog and check auto-fail/auto-success
      if (configData.ability && configData.ability !== abilityId) {
        abilityId = configData.ability;
      }
      const chosenAbilityData = preComputedAdvantageMap[abilityId ?? ""];
      const chosenAbilityTracker = chosenAbilityData?.tracker instanceof RollModifierTracker ? chosenAbilityData.tracker : undefined;
      if (chosenAbilityTracker?.modifiers.willFail) success = false;
      else if (chosenAbilityTracker?.modifiers.willSucceed) success = true;

      // Apply blind roll mode based on chosen ability
      const blindRollSettings = rollType === "check" ? configSettings.rollChecksBlind : configSettings.rollSavesBlind;
      messageDetails.rollMode = applyBlindRollMode(blindRollSettings, abilityId, messageDetails.rollMode);
    });
    if (this.token) foundry.utils.setProperty(dialog, "options.window.subtitle", this.token.name);

    result = await wrapped(config, dialog, message);
    message.create = saveCreate;

    if (!result) return result;
    if (result instanceof Roll) {
      console.warn("midi-qol | doRollAbility: result is a Roll, not an array of Rolls");
      result = [result];
    }
    let rollMode: keyof CONFIG.Dice.RollModes = message.rollMode ?? safeGetGameSetting("core", "rollMode");
    // @ts-expect-error
    result.forEach(r => r.options.rollMode = rollMode);
    await displayDSNForRoll(result, rollType, rollMode);
    DSNMarkDiceDisplayed(result);
    foundry.utils.mergeObject(message.data, { "flags": config.flags ?? {} });
    // Set overtimeActorUuid AFTER message object is replaced by hook and merged
    if (overtimeActorUuid) {
      foundry.utils.setProperty(message.data, "flags.midi-qol.overtimeActorUuid", overtimeActorUuid);
    }
    if (!config.midiOptions.simulate) {
      result[0] = await bonusCheck(this, result[0], rollType, abilityId, message.data);
      DSNMarkDiceDisplayed(result);
      // @ts-expect-error no dnd5e-types
      if (Number.isNumeric(result[0].options.target) && result[0].isSuccess === false) {
        const failFlagsLength = collectBonusFlags(this, rollType, "fail.all").length;
        const failAbilityFlagsLength = collectBonusFlags(this, rollType, `fail.${abilityId}`).length
        if (failFlagsLength || failAbilityFlagsLength) {
          // If the roll fails and there is an flags.midi-qol.save.fail then apply the bonus
          result[0] = await bonusCheck(this, result[0], rollType, failAbilityFlagsLength ? `fail.${abilityId}` : "fail.all", message.data);
        }
      }
    }

    // Stamp the chosen ability on the rolls (after bonusCheck) so the save display can show which ability was used
    // userExplicitChoice is set by buildConfig wrapper when user changes dropdown; config.ability is the auto-selected best
    const chosenAbility = userExplicitChoice ?? config.ability;
    //@ts-expect-error midiChosenId is a custom roll option
    if (hasMultipleChoices) result.forEach(r => { if (r?.options) r.options.midiChosenId = chosenAbility; });

    // Set originatingMessage on roll options so modules can access it without .parent
    const rollOriginatingId = foundry.utils.getProperty(message, "data.flags.dnd5e.originatingMessage") as string | undefined
      ?? originatingCardId;
    //@ts-expect-error originatingMessage is a custom roll option
    if (rollOriginatingId) result.forEach(r => { if (r?.options) r.options.originatingMessage = rollOriginatingId; });

    if (message.create !== false && result) {
      if (foundry.utils.getProperty(result, "flags.midi-qol.chatMessageShown") !== true) {
        const messageData: any = foundry.utils.mergeObject({ sound: CONFIG.sounds.dice }, message.data ?? {});
        messageData.rolls = [...result];
        const chatMsg = await ChatMessage.create(messageData, { rollMode });
        // dnd5e sets roll.parent in buildPost; replicate here since we bypass buildPost
        if (chatMsg) result.forEach(r => (r as any).parent = chatMsg);
      }
    }
    if (saveRollMode) game.settings.set("core", "rollMode", saveRollMode);
    if (abilityId) await expireRollEffect.bind(this)(rollType, abilityId, success);
    if (config.midiOptions.isConcentrationCheck) {
      // @ts-expect-error no dnd5e-types
      if (success === undefined && result?.[0]?.isSuccess !== undefined) success = result[0].isSuccess;
      expireRollEffect.bind(this)("isConcentrationSave", "", success);
    }
  } catch (err) {
    const message = `doRollAbility error ${this.name} ${abilityId} ${rollType} ${this.uuid}`;
    TroubleShooter.recordError(err, message);
    error(message, err);
  } finally {
    if (preRollAbilityHookId) Hooks.off(`dnd5e.preRoll${type}`, preRollAbilityHookId);
    if (rollAbilityHookId) Hooks.off(`dnd5e.post${type}RollConfiguration`, rollAbilityHookId);
    if (saveRollMode) game.settings.set("core", "rollMode", saveRollMode);
    return oldFormat ? result?.[0] : result
  }
}

export async function rollSavingThrow(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  // Death saves are handled by the rollDeathSave wrapper, not doRollAbility
  // Death saves have hookNames: ["deathSave"] and no ability, so skip doRollAbility processing
  if (config.hookNames?.includes("deathSave")) {
    return wrapped(config, dialog, message);
  }
  return doRollAbility.bind(this)(wrapped, "save", config, dialog, message);
}

async function rollAbilityCheck(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  return doRollAbility.bind(this)(wrapped, "check", config, dialog, message);
}

async function rollDeathSave(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  config.midiOptions ??= {};
  const deathSaveBonus = this.flags?.[MODULE_ID]?.deathSaveBonus;

  let hasPreComputedAdvantage = false;
  if (!config.midiOptions.recomputeAdvantage) {
    hasPreComputedAdvantage = applyPreComputedAdvantage(config);
    if (hasPreComputedAdvantage && isAutoFastForward("save")) {
      config.midiOptions.fastForward = true;
    }
  }
  if (!hasPreComputedAdvantage) {
    // Build death save advantage/disadvantage flags
    const advantageFlags: AdvantageFlags = {
      advantageFlags: ["advantage.all", "advantage.deathSave"],
      disadvantageFlags: ["disadvantage.all", "disadvantage.deathSave"],
      // Actor noAdvantage/noDisadvantage flags (prevent actor's own advantage/disadvantage)
      noAdvantageFlags: ["noAdvantage.all", "noAdvantage.deathSave"],
      noDisadvantageFlags: ["noDisadvantage.all", "noDisadvantage.deathSave"],
      systemRollModeFields: ["attributes.death.roll.mode"]
    };

    // Process advantage/disadvantage flags using centralized helper
    // For death saves, the grants actor is the caster (if any workflow exists)
    const tracker = await computeAdvantageFlags(this, advantageFlags, {
      ...config.midiOptions,
      grantsActor: config.midiOptions.workflow?.actor
    });
    config.advantage = tracker.hasAdvantage;
    config.disadvantage = tracker.hasDisadvantage;
  }

  let advantage = config.advantage;
  let disadvantage = config.disadvantage;

  const options: MidiOptions = { advantage, disadvantage };

  // Handle death save bonus
  if (deathSaveBonus) {
    const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: this });
    let bonus: any;
    if (typeof deathSaveBonus === "number") {
      bonus = deathSaveBonus;
    } else {
      bonus = await evalAllConditionsAsync(this, "flags.midi-qol.deathSaveBonus", conditionData);
    }
    if (bonus) {
      options.parts = [bonus];
    }
  }

  foundry.utils.mergeObject(config.midiOptions, options);
  config.advantage = advantage;
  config.disadvantage = disadvantage;
  const blindSaveRoll = configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes("death");
  const actor = this;

  const rollModifierTracker = new RollModifierTracker();
  const preRollHookId = Hooks.once("dnd5e.preRollDeathSave", (configData, dialogData, messageData) => {
    // Merge midiOptions to ensure advantage/disadvantage and other values are preserved
    configData.midiOptions = { ...(configData.midiOptions ?? {}), ...(config.midiOptions ?? {}) };

    // Set advantage/disadvantage on configData so dnd5e rolls 2 dice when appropriate
    configData.advantage = advantage;
    configData.disadvantage = disadvantage;

    // Apply roll modifiers (auto-fail/auto-success) for death saves
    const modifierFlags: RollModifierFlags = {
      failFlags: ["fail.all", "fail.deathSave"],
      successFlags: ["success.all", "success.deathSave"],
      maxFlags: [],
      minFlags: []
    };
    computeRollModifiers(actor, modifierFlags, rollModifierTracker);
    const modifiers = applyRollModifiers(rollModifierTracker, configData, dialogData, { failValue: 2, successValue: 19 });
    const { autoFail, autoSuccess } = modifiers;

    for (let roll of configData.rolls ?? []) {
      roll.options ??= {};
      roll.options.advantage = advantage;
      roll.options.disadvantage = disadvantage;
      if (!autoFail && !autoSuccess && configData.midiOptions?.parts?.length) roll.parts = [...(roll.parts ?? []), ...configData.midiOptions.parts];
      if (blindSaveRoll) roll.options.rollMode = CONST.DICE_ROLL_MODES.BLIND;
    }
    setRollDialogOptions(configData, dialogData, "save");
    if (blindSaveRoll) messageData.rollMode = CONST.DICE_ROLL_MODES.BLIND;
  });

  try {
    return await wrapped(config, dialog, message);
  } finally {
    if (preRollHookId) Hooks.off("dnd5e.preRollDeathSave", preRollHookId);
  }
}

export function deathSaveHook(rolls: Roll[], { chatString, subject: actor }: { chatString: string; updates: Actor.UpdateData; subject: Actor.Implementation }) {
  if (configSettings.keepRollStats && actor) {
    if (rolls instanceof Roll) rolls = [rolls];
    let successes = 0;
    let failures = 0;
    for (const roll of rolls) {
      // @ts-expect-error no dnd5e-types
      if (roll.isCritical) successes += 2;
      // @ts-expect-error no dnd5e-types
      else if (roll.isFumble) failures += 2;
      // @ts-expect-error no dnd5e-types
      else if (roll.isFailure) failures += 1;
      else successes += 1;
    }
    gameStats.addDeathSaveResult(actor, successes, failures);
  }
  if (chatString === "DND5E.DeathSaveFailure") {
    if (hasCondition(actor, "unconscious")) {
      const _id = CONFIG.statusEffects.find(e => e.id === "unconscious")?._id;
      const effect = actor.effects.find(e => e._id === _id);
      if (effect) effect.setFlag("core", "overlay", false);
    }
    const status = getDeadStatus();
    if (!status) return;
    setDeadStatus(actor, { effect: status, useDefeated: true, makeDead: true, overlay: true });
  }
}

export async function computeAbilityAdvantage(actor: Actor.Implementation, rollType: string, abilityId: string, options: MidiOptions, tracker?: RollModifierTracker): Promise<{ tracker: RollModifierTracker, magicResistance: boolean, magicVulnerability: boolean }> {
  // Create RollModifierTracker if not provided (will be discarded by caller if they don't need attribution)
  tracker = tracker ?? new RollModifierTracker();

  // Create a copy of relevant options to avoid modifying the original
  const effectiveOptions = { ...options };
  let magicResistance = false;
  let magicVulnerability = false;

  // Check magic resistance/vulnerability for magic saves first using centralized function
  if (rollType === "save" && options.isMagicSave) {
    const magicCheck = await checkMagicResistanceAndVulnerability(actor, abilityId);
    if (magicCheck.advantage) {
      tracker.advantage.add("magicResistance", "Magic Resistance");
    }
    if (magicCheck.disadvantage) {
      tracker.disadvantage.add("magicVulnerability", "Magic Vulnerability");
    }
    magicResistance = magicCheck.magicResistance;
    magicVulnerability = magicCheck.magicVulnerability;
  }

  // Build advantage/disadvantage flags to check
  const abilityFlags: AdvantageFlags = {
    advantageFlags: [
      "advantage.all",
      "advantage.ability.all",
      `advantage.${rollType}.all`,
      `advantage.${rollType}.${abilityId}`,
    ],
    disadvantageFlags: [
      "disadvantage.all",
      "disadvantage.ability.all",
      `disadvantage.${rollType}.all`,
      `disadvantage.${rollType}.${abilityId}`,
    ],
    // Actor noAdvantage/noDisadvantage flags (prevent actor's own advantage/disadvantage)
    noAdvantageFlags: [
      "noAdvantage.all",
      `noAdvantage.${rollType}.all`,
      `noAdvantage.${rollType}.${abilityId}`
    ],
    noDisadvantageFlags: [
      "noDisadvantage.all",
      `noDisadvantage.${rollType}.all`,
      `noDisadvantage.${rollType}.${abilityId}`
    ],
    systemRollModeFields: [`abilities.${abilityId}.${rollType}.roll.mode`],
  };

  // Add spell school-specific save advantage/disadvantage flags
  // @ts-expect-error .system.school
  const saveSchool = options.workflow?.saveItem?.system?.school;
  if (rollType === "save" && saveSchool) {
    abilityFlags.advantageFlags.push(`advantage.save.school.${saveSchool}`);
    abilityFlags.disadvantageFlags.push(`disadvantage.save.school.${saveSchool}`);
    abilityFlags.noAdvantageFlags?.push(`noAdvantage.save.school.${saveSchool}`);
    abilityFlags.noDisadvantageFlags?.push(`noDisadvantage.save.school.${saveSchool}`);
  }

  // Add source actor grants flags for saves and checks
  if (rollType === "save" || rollType === "check") {
    abilityFlags.sourceAdvantageFlags = ["grants.advantage.all", `grants.advantage.${rollType}.all`, `grants.advantage.${rollType}.${abilityId}`];
    abilityFlags.sourceDisadvantageFlags = ["grants.disadvantage.all", `grants.disadvantage.${rollType}.all`, `grants.disadvantage.${rollType}.${abilityId}`];
    abilityFlags.sourceNoAdvantageFlags = ["grants.noAdvantage.all", `grants.noAdvantage.${rollType}.all`, `grants.noAdvantage.${rollType}.${abilityId}`];
    abilityFlags.sourceNoDisadvantageFlags = ["grants.noDisadvantage.all", `grants.noDisadvantage.${rollType}.all`, `grants.noDisadvantage.${rollType}.${abilityId}`];
    if (rollType === "save" && saveSchool) {
      abilityFlags.sourceAdvantageFlags.push(`grants.advantage.save.school.${saveSchool}`);
      abilityFlags.sourceDisadvantageFlags.push(`grants.disadvantage.save.school.${saveSchool}`);
      abilityFlags.sourceNoAdvantageFlags.push(`grants.noAdvantage.save.school.${saveSchool}`);
      abilityFlags.sourceNoDisadvantageFlags.push(`grants.noDisadvantage.save.school.${saveSchool}`);
    }
  }

  // For saves/checks, the grants actor is the caster (workflow.actor)
  // Pass tracker to be populated with attribution
  await computeAdvantageFlags(actor, abilityFlags, {
    ...effectiveOptions,
    grantsActor: effectiveOptions.workflow?.actor
  }, tracker);
  return { tracker: tracker, magicResistance, magicVulnerability };
}

/**
 * Roll type handler configuration for buildPreComputedAdvantageMap.
 * Data-driven approach for easy extension to new roll types.
 */
interface RollTypeHandler {
  computeAdvantage: (actor: Actor.Implementation, id: string, options: MidiOptions) => Promise<RollModifierTracker>;
  getModifierFlags: (actor: Actor.Implementation, id: string, options?: MidiOptions) => RollModifierFlags;
}

const rollTypeHandlers: Record<string, RollTypeHandler> = {
  save: {
    computeAdvantage: async (actor, id, options) => {
      const result = await computeAbilityAdvantage(actor, "save", id, options);
      return result.tracker;
    },
    getModifierFlags: (_actor, id, options) => {
      const flags: RollModifierFlags = {
        failFlags: ["fail.all", "fail.ability.all", "fail.ability.save.all", `fail.ability.save.${id}`],
        successFlags: ["success.all", "success.ability.all", "success.ability.save.all", `success.ability.save.${id}`],
        maxFlags: ["max.ability.save.all", `max.ability.save.${id}`],
        minFlags: ["min.ability.save.all", `min.ability.save.${id}`]
      };
      // @ts-expect-error .system.school
      const saveSchool = options?.workflow?.saveItem?.system?.school;
      if (saveSchool) {
        flags.failFlags.push(`fail.save.school.${saveSchool}`);
        flags.successFlags.push(`success.save.school.${saveSchool}`);
      }
      return flags;
    }
  },
  check: {
    computeAdvantage: async (actor, id, options) => {
      const result = await computeAbilityAdvantage(actor, "check", id, options);
      return result.tracker;
    },
    getModifierFlags: (_actor, id) => ({
      failFlags: ["fail.all", "fail.ability.all", "fail.ability.check.all", `fail.ability.check.${id}`],
      successFlags: ["success.all", "success.ability.all", "success.ability.check.all", `success.ability.check.${id}`],
      maxFlags: ["max.ability.check.all", `max.ability.check.${id}`],
      minFlags: ["min.ability.check.all", `min.ability.check.${id}`]
    })
  },
  skill: {
    computeAdvantage: async (actor, id, options) => {
      return computeSkillAdvantage(actor, id, options);
    },
    getModifierFlags: (actor, id) => {
      // @ts-expect-error no dnd5e-types
      const abilityId = actor.system?.skills?.[id]?.ability ?? "";
      const flags: RollModifierFlags = {
        failFlags: ["fail.all", "fail.skill.all", `fail.skill.${id}`],
        successFlags: ["success.all", "success.skill.all", `success.skill.${id}`],
        maxFlags: ["max.skill.all", `max.skill.${id}`],
        minFlags: ["min.skill.all", `min.skill.${id}`]
      };
      // Include ability check flags if skillAbilityCheckAdvantage is enabled
      if (configSettings.skillAbilityCheckAdvantage && abilityId) {
        flags.failFlags.push("fail.ability.all", "fail.ability.check.all", `fail.ability.check.${abilityId}`);
        flags.successFlags.push("success.ability.all", "success.ability.check.all", `success.ability.check.${abilityId}`);
        flags.maxFlags.push("max.ability.check.all", `max.ability.check.${abilityId}`);
        flags.minFlags.push("min.ability.check.all", `min.ability.check.${abilityId}`);
      }
      return flags;
    }
  },
  tool: {
    computeAdvantage: async (actor, id, options) => {
      // @ts-expect-error no dnd5e-types
      const abilityId = actor.system?.tools?.[id]?.ability || GameSystemConfig.tools[id]?.ability || "";
      return computeToolAdvantage(actor, id, abilityId, options);
    },
    getModifierFlags: (actor, id) => {
      // @ts-expect-error no dnd5e-types
      const abilityId = actor.system?.tools?.[id]?.ability || GameSystemConfig.tools[id]?.ability || "";
      const flags: RollModifierFlags = {
        failFlags: ["fail.all", "fail.tool.all", `fail.tool.${id}`],
        successFlags: ["success.all", "success.tool.all", `success.tool.${id}`],
        maxFlags: ["max.tool.all", `max.tool.${id}`],
        minFlags: ["min.tool.all", `min.tool.${id}`]
      };
      // Include ability check flags if the tool has an associated ability
      if (abilityId) {
        flags.failFlags.push("fail.ability.all", "fail.ability.check.all", `fail.ability.check.${abilityId}`);
        flags.successFlags.push("success.ability.all", "success.ability.check.all", `success.ability.check.${abilityId}`);
        flags.maxFlags.push("max.ability.check.all", `max.ability.check.${abilityId}`);
        flags.minFlags.push("min.ability.check.all", `min.ability.check.${abilityId}`);
      }
      return flags;
    }
  },
  // Concentration saves are ability saves (default CON) with additional concentration-specific flags
  concentration: {
    computeAdvantage: async (actor, id, options) => {
      // Use actor's configured concentration ability, falling back to passed id or default
      // @ts-expect-error .attributes.concentration
      const abilityId = actor.system?.attributes?.concentration?.ability || id || GameSystemConfig.defaultAbilities?.concentration || "con";
      // Get the ability save advantage
      const saveResult = await computeAbilityAdvantage(actor, "save", abilityId, options);

      // Add concentration-specific flags to the same tracker
      const concentrationFlags: AdvantageFlags = {
        advantageFlags: ["advantage.concentration"],
        disadvantageFlags: ["disadvantage.concentration"],
        noAdvantageFlags: ["noAdvantage.concentration"],
        noDisadvantageFlags: ["noDisadvantage.concentration"],
        systemRollModeFields: ["attributes.concentration.roll.mode"]
      };
      await computeAdvantageFlags(actor, concentrationFlags, options, saveResult.tracker);

      return saveResult.tracker;
    },
    getModifierFlags: (actor, id) => {
      // Use actor's configured concentration ability, falling back to passed id or default
      // @ts-expect-error .attributes.concentration
      const abilityId = actor.system?.attributes?.concentration?.ability || id || GameSystemConfig.defaultAbilities?.concentration || "con";
      // Start with ability save modifiers
      const saveModifiers = rollTypeHandlers.save.getModifierFlags(actor, abilityId);
      // Add concentration-specific modifiers
      return {
        failFlags: [...saveModifiers.failFlags, "fail.concentration"],
        successFlags: [...saveModifiers.successFlags, "success.concentration"],
        maxFlags: [...saveModifiers.maxFlags, "max.concentration"],
        minFlags: [...saveModifiers.minFlags, "min.concentration"]
      };
    }
  }
};

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
export async function buildPreComputedAdvantageMap(
  actor: Actor.Implementation,
  rollType: string,
  rollIds: string[],
  options: MidiOptions
): Promise<Record<string, PreComputedAdvantage>> {
  const result: Record<string, PreComputedAdvantage> = {};
  const workflow = options.workflow;

  const handler = rollTypeHandlers[rollType];
  if (!handler) {
    console.warn(`midi-qol | buildPreComputedAdvantageMap: Unknown rollType "${rollType}"`);
    return result;
  }

  for (const id of rollIds) {
    // Compute advantage/disadvantage with attribution tracking
    const tracker = await handler.computeAdvantage(actor, id, options);

    // Add roll modifiers (fail/success/max/min) to the same tracker
    const modifierFlags = handler.getModifierFlags(actor, id, options);
    computeRollModifiers(actor, modifierFlags, tracker, { workflow });

    const hasAdv = !!tracker.hasAdvantage;
    const hasDisadv = !!tracker.hasDisadvantage;
    result[id] = {
      hasAdvantage: hasAdv,
      hasDisadvantage: hasDisadv,
      defaultButton: hasAdv && !hasDisadv ? "advantage" : !hasAdv && hasDisadv ? "disadvantage" : "normal",
      tracker
    };
  }

  return result;
}

export async function computeSkillAdvantage(actor: Actor.Implementation, skillId: string, options: MidiOptions, tracker?: RollModifierTracker): Promise<RollModifierTracker> {
  // @ts-expect-error no dnd5e-types
  const abilityId = actor.system?.skills?.[skillId]?.ability ?? "";

  // Build skill advantage/disadvantage flags
  const skillFlags: AdvantageFlags = {
    advantageFlags: [
      "advantage.all",
      "advantage.skill.all",
      `advantage.skill.${skillId}`
    ],
    disadvantageFlags: [
      "disadvantage.all",
      "disadvantage.skill.all",
      `disadvantage.skill.${skillId}`
    ],
    // Actor noAdvantage/noDisadvantage flags (prevent actor's own advantage/disadvantage)
    noAdvantageFlags: [
      "noAdvantage.all",
      "noAdvantage.skill.all",
      `noAdvantage.skill.${skillId}`
    ],
    noDisadvantageFlags: [
      "noDisadvantage.all",
      "noDisadvantage.skill.all",
      `noDisadvantage.skill.${skillId}`
    ],
    systemRollModeFields: [`skills.${skillId}.roll.mode`],
    // Source grants flags for skills (checked on workflow.actor, e.g., caster)
    sourceAdvantageFlags: ["grants.advantage.all", "grants.advantage.skill.all", `grants.advantage.skill.${skillId}`],
    sourceDisadvantageFlags: ["grants.disadvantage.all", "grants.disadvantage.skill.all", `grants.disadvantage.skill.${skillId}`],
    sourceNoAdvantageFlags: ["grants.noAdvantage.all", "grants.noAdvantage.skill.all", `grants.noAdvantage.skill.${skillId}`],
    sourceNoDisadvantageFlags: ["grants.noDisadvantage.all", "grants.noDisadvantage.skill.all", `grants.noDisadvantage.skill.${skillId}`]
  };

  // If the skill has an associated ability, also check ability-based flags
  if (abilityId) {
    // Add skill flags for the ability (e.g., advantage.skill.dex for all dex-based skills)
    skillFlags.advantageFlags.push(`advantage.skill.${abilityId}`);
    skillFlags.disadvantageFlags.push(`disadvantage.skill.${abilityId}`);
    // Add noAdvantage/noDisadvantage for ability-based skill
    skillFlags.noAdvantageFlags?.push(`noAdvantage.skill.${abilityId}`);
    skillFlags.noDisadvantageFlags?.push(`noDisadvantage.skill.${abilityId}`);
    // Add source grants for ability-based skill
    skillFlags.sourceAdvantageFlags?.push(`grants.advantage.skill.${abilityId}`);
    skillFlags.sourceDisadvantageFlags?.push(`grants.disadvantage.skill.${abilityId}`);
    skillFlags.sourceNoAdvantageFlags?.push(`grants.noAdvantage.skill.${abilityId}`);
    skillFlags.sourceNoDisadvantageFlags?.push(`grants.noDisadvantage.skill.${abilityId}`);

    // If skillAbilityCheckAdvantage is enabled, also check ability check flags
    if (configSettings.skillAbilityCheckAdvantage) {
      // New flag names (preferred)
      skillFlags.advantageFlags.push("advantage.ability.all", "advantage.check.all", `advantage.check.${abilityId}`);
      skillFlags.disadvantageFlags.push("disadvantage.ability.all", "disadvantage.check.all", `disadvantage.check.${abilityId}`);
    }
  }

  // For skills, source actor is the caster (workflow.actor) if any
  // Create RollModifierTracker if not provided
  tracker ??= new RollModifierTracker();
  await computeAdvantageFlags(actor, skillFlags, {
    ...options,
    grantsActor: options.workflow?.actor
  }, tracker);
  return tracker;
}

export async function computeToolAdvantage(actor: Actor.Implementation, toolId: string, abilityId: string, options: MidiOptions, tracker?: RollModifierTracker): Promise<RollModifierTracker> {
  // Build tool advantage/disadvantage flags
  const toolFlags: AdvantageFlags = {
    advantageFlags: [
      "advantage.all",
      "advantage.tool.all",
      `advantage.tool.${toolId}`
    ],
    disadvantageFlags: [
      "disadvantage.all",
      "disadvantage.tool.all",
      `disadvantage.tool.${toolId}`
    ],
    // Actor noAdvantage/noDisadvantage flags (prevent actor's own advantage/disadvantage)
    noAdvantageFlags: [
      "noAdvantage.all",
      "noAdvantage.tool.all",
      `noAdvantage.tool.${toolId}`
    ],
    noDisadvantageFlags: [
      "noDisadvantage.all",
      "noDisadvantage.tool.all",
      `noDisadvantage.tool.${toolId}`
    ],
    systemRollModeFields: [], // dnd5e doesn't have native tool roll modes
    // Source grants flags for tools (checked on workflow.actor, e.g., caster)
    sourceAdvantageFlags: ["grants.advantage.all", "grants.advantage.tool.all", `grants.advantage.tool.${toolId}`],
    sourceDisadvantageFlags: ["grants.disadvantage.all", "grants.disadvantage.tool.all", `grants.disadvantage.tool.${toolId}`],
    sourceNoAdvantageFlags: ["grants.noAdvantage.all", "grants.noAdvantage.tool.all", `grants.noAdvantage.tool.${toolId}`],
    sourceNoDisadvantageFlags: ["grants.noDisadvantage.all", "grants.noDisadvantage.tool.all", `grants.noDisadvantage.tool.${toolId}`]
  };

  // If the tool has an associated ability, also check ability check flags
  if (abilityId) {
    // New flag names (preferred)
    toolFlags.advantageFlags.push("advantage.ability.all", "advantage.check.all", `advantage.check.${abilityId}`);
    toolFlags.disadvantageFlags.push("disadvantage.ability.all", "disadvantage.check.all", `disadvantage.check.${abilityId}`);
    // Add noAdvantage/noDisadvantage for ability-based check
    toolFlags.noAdvantageFlags?.push(`noAdvantage.check.all`, `noAdvantage.check.${abilityId}`);
    toolFlags.noDisadvantageFlags?.push(`noDisadvantage.check.all`, `noDisadvantage.check.${abilityId}`);
  }

  // For tools, source actor is the caster (workflow.actor) if any
  // Create RollModifierTracker if not provided
  tracker ??= new RollModifierTracker();
  await computeAdvantageFlags(actor, toolFlags, {
    ...options,
    grantsActor: options.workflow?.actor
  }, tracker);
  return tracker;
}

// Throttle timer for anchored template movement (mirrors dnd5e's private #moveTime)
let anchoredMoveTime = 0;
// Throttle timer for range-clamped template movement
let rangeClampesMoveTime = 0;

/**
 * Snap a point for template placement based on the templateSnapping setting.
 * "full" snaps to grid intersections (vertices) only, "half" adds centers and side midpoints.
 */
function snapTemplatePosition(point: { x: number; y: number }): { x: number; y: number } {
  if (!canvas?.grid) return point;
  const M = CONST.GRID_SNAPPING_MODES;
  const mode = configSettings.templateSnapping === "half"
    ? M.CENTER | M.VERTEX | M.CORNER | M.SIDE_MIDPOINT
    : M.VERTEX;
  return canvas.grid.getSnappedPoint({ x: point.x, y: point.y }, { mode, resolution: 1 });
}

/**
 * Get the maximum range for a template from its midi-qol flags.
 * Returns undefined if range should not be enforced.
 * The maxRange is pre-calculated and set in the dnd5e.preCreateActivityTemplate hook.
 */
function getTemplateMaxRange(templateDoc: MeasuredTemplateDocument.Implementation): number | undefined {
  const midiFlags = templateDoc.flags?.[MODULE_ID] as any;
  return midiFlags?.maxRange as number | undefined;
}

/**
 * Clamp a point to be within maxRange distance from the token's perimeter.
 * Measures the raw grid distance from the closest perimeter point to the target
 * using canvas.grid.measurePath (respects the scene's diagonal measurement mode).
 * Returns the clamped point, or the original point if within range.
 */
function clampPointToRange(token: Token.Implementation, targetX: number, targetY: number, maxRange: number): { x: number, y: number, clamped: boolean } {
  if (!canvas?.grid || !canvas.dimensions) return { x: targetX, y: targetY, clamped: false };

  // Find closest point on token perimeter and measure raw grid distance to target
  const poly = getTokenPerimeterPolygon(token);
  const closest = closestPointOnPerimeter(poly, targetX, targetY);
  const distance = measurePointDistance(closest, { x: targetX, y: targetY });
  if (distance <= maxRange) {
    return { x: targetX, y: targetY, clamped: false };
  }

  // Scale the displacement vector so grid-measured distance equals maxRange
  const dx = targetX - closest.x;
  const dy = targetY - closest.y;
  if (dx === 0 && dy === 0) return { x: targetX, y: targetY, clamped: false };

  const scale = maxRange / distance;
  return {
    x: closest.x + dx * scale,
    y: closest.y + dy * scale,
    clamped: true
  };
}

/**
 * Calculate the point on a token's border where a ray from center to target intersects.
 * @param token - The token to find the border point on
 * @param targetX - Target X coordinate (e.g., mouse position)
 * @param targetY - Target Y coordinate
 * @returns {x, y} coordinates on the token's border
 */
function getTokenBorderPoint(token: Token.Implementation, targetX: number, targetY: number): { x: number, y: number } {
  const centerX = token.center.x;
  const centerY = token.center.y;

  const poly = getTokenPerimeterPolygon(token);
  const pts = poly.points;
  const numPts = pts.length;

  // If target is at center, return the rightmost point on the polygon
  if (targetX === centerX && targetY === centerY) {
    let bestX = -Infinity;
    let bestY = centerY;
    for (let i = 0; i < numPts; i += 2) {
      if (pts[i] > bestX) {
        bestX = pts[i];
        bestY = pts[i + 1];
      }
    }
    return { x: bestX, y: bestY };
  }

  // Cast ray from center toward target and find first polygon edge intersection
  const a = { x: centerX, y: centerY };
  const b = { x: targetX, y: targetY };

  let tMin = Infinity;
  let result = { x: centerX, y: centerY };

  for (let i = 0; i < numPts; i += 2) {
    const ni = (i + 2) % numPts;
    const c = { x: pts[i], y: pts[i + 1] };
    const d = { x: pts[ni], y: pts[ni + 1] };

    const intersection = foundry.utils.lineLineIntersection(a, b, c, d, { t1: true });
    if (!intersection) continue;

    // t0 > 0: forward along ray from center toward target
    // 0 <= t1 <= 1: intersection is on this polygon edge segment
    const t1 = intersection.t1 ?? 0;
    if (intersection.t0 > 0 && t1 >= 0 && t1 <= 1 && intersection.t0 < tMin) {
      tMin = intersection.t0;
      result = { x: intersection.x, y: intersection.y };
    }
  }

  return result;
}

/**
 * Get the caster's token from a template's midi-qol flags.
 * The sourceTokenUuid is pre-set in the dnd5e.preCreateActivityTemplate hook.
 * @returns The token, or undefined if not found
 */
export function getTemplateSourceToken(templateDoc: MeasuredTemplateDocument.Implementation): Token.Implementation | undefined {
  const midiFlags = templateDoc.flags?.[MODULE_ID] as any;
  const sourceTokenUuid = midiFlags?.sourceTokenUuid as string | undefined;
  if (!sourceTokenUuid) return undefined;

  const tokenDoc = fromUuidSync(sourceTokenUuid) as TokenDocument.Implementation | null;
  return tokenDoc?.object ?? undefined;
}

/**
 * Wrapper for AbilityTemplate._onMovePlacement to:
 * 1. Anchor cone/ray templates to the caster's token when anchorToToken flag is set
 * 2. Clamp template placement to activity range when checkRange is enabled
 * 3. Apply midi template snapping setting for all template placements
 */
function midiATOnMovePlacement(this: foundry.canvas.placeables.MeasuredTemplate.Implementation, wrapped, event: PIXI.FederatedPointerEvent) {
  // Check if this template should be anchored to a token (cones/rays from token border)
  const anchorToToken = this.document.flags?.[MODULE_ID]?.anchorToToken;

  if (anchorToToken) {
    // Handle anchored template movement (cones/rays from token border)
    return handleAnchoredTemplateMovement.call(this, event);
  }

  // For range-clamped templates, we must handle placement ourselves
  const maxRange = getTemplateMaxRange(this.document);
  const sourceToken = getTemplateSourceToken(this.document);
  if (maxRange && sourceToken) {
    // Apply throttling like the original method (20ms)
    event.stopPropagation();
    const now = Date.now();
    if (now - rangeClampesMoveTime <= 20) return;

    // Get mouse position in canvas coordinates
    const mouse = event.data?.getLocalPosition(this.layer) ?? (event as any).getLocalPosition(this.layer);

    // Clamp position to be within range
    const position = clampPointToRange(sourceToken, mouse.x, mouse.y, maxRange);

    // Snap to grid based on templateSnapping setting
    const snapped = snapTemplatePosition(position);
    const updates: { x: number; y: number; distance?: number } = { x: snapped.x, y: snapped.y };

    // Handle adjusted size for radius templates (same as dnd5e)
    const dnd5eFlags = this.document.flags.dnd5e as any;
    const baseDistance = dnd5eFlags?.dimensions?.size;
    if (dnd5eFlags?.dimensions?.adjustedSize && baseDistance && canvas?.tokens) {
      const rectangle = new PIXI.Rectangle(position.x, position.y, 1, 1);
      const hoveredToken = canvas.tokens.quadtree?.getObjects(rectangle, {
        collisionTest: ({ t }: any) => t.visible && !t.document.isSecret
      }).first();
      if (hoveredToken) {
        const size = Math.max(hoveredToken.document.width, hoveredToken.document.height);
        updates.distance = baseDistance + (size * (canvas.grid?.distance ?? 5) / 2);
      } else {
        updates.distance = baseDistance;
      }
    }

    this.document.updateSource(updates);
    this.refresh();
    rangeClampesMoveTime = now;
    return;
  }

  // No range restriction - let the wrapper chain run (dnd5e + other modules),
  // then re-snap the position using our templateSnapping setting
  wrapped(event);
  const snapped = snapTemplatePosition({ x: this.document.x, y: this.document.y });
  if (snapped.x !== this.document.x || snapped.y !== this.document.y) {
    this.document.updateSource({ x: snapped.x, y: snapped.y });
    this.refresh();
  }
}

/**
 * Handle movement for anchored templates (cones/rays originating from token border).
 */
function handleAnchoredTemplateMovement(this: foundry.canvas.placeables.MeasuredTemplate.Implementation, event: PIXI.FederatedPointerEvent) {
  const sourceToken = getTemplateSourceToken(this.document);
  if (!sourceToken) return;

  event.stopPropagation();

  // Apply throttling like the original method (20ms)
  const now = Date.now();
  if (now - anchoredMoveTime <= 20) return;

  // Get mouse position in canvas coordinates
  const mouse = event.data?.getLocalPosition(this.layer) ?? (event as any).getLocalPosition(this.layer);

  // Calculate the point on the token border closest to the mouse direction
  const borderPoint = getTokenBorderPoint(sourceToken, mouse.x, mouse.y);

  // Calculate direction from border point to mouse (in degrees)
  const dx = mouse.x - borderPoint.x;
  const dy = mouse.y - borderPoint.y;
  const direction = Math.toDegrees(Math.atan2(dy, dx));

  // Snap to grid based on templateSnapping setting
  const snapped = snapTemplatePosition(borderPoint);

  // Update source and refresh like dnd5e does
  this.document.updateSource({
    x: snapped.x,
    y: snapped.y,
    direction
  });
  this.refresh();

  anchoredMoveTime = now;
}

export function _prepareDerivedData(this: Actor.Implementation, wrapped, ...args) {
  wrapped(...args);
  try {
    // @ts-expect-error no dnd5e-types
    if (!this.system.abilities?.dex) return;
    if (![false, undefined, "none"].includes(checkRule("challengeModeArmor") as boolean | undefined | string)) {
      // @ts-expect-error no dnd5e-types
      const armorDetails = this.system.attributes.ac ?? {};
      const ac = armorDetails?.value ?? 10;
      const equippedArmor = armorDetails.equippedArmor;
      let armorAC = equippedArmor?.system.armor.value ?? 10;
      const equippedShield = armorDetails.equippedShield;
      const shieldAC = equippedShield?.system.armor.value ?? 0;

      if (checkRule("challengeModeArmor") !== "challenge") {
        switch (armorDetails.calc) {
          // @ts-expect-error no dnd5e-types
          case 'flat': armorAC = (ac.flat ?? 10) - this.system.abilities.dex.mod; break;
          case 'draconic': armorAC = 13; break;
          // @ts-expect-error no dnd5e-types
          case 'natural': armorAC = (armorDetails.value ?? 10) - this.system.abilities.dex.mod; break;
          case 'custom': armorAC = equippedArmor?.system.armor.value ?? 10; break;
          case 'mage': armorAC = 13; break; // perhaps this should be 10 if mage armor is magic bonus
          case 'unarmoredMonk': armorAC = 10; break;
          case 'unarmoredBarb': armorAC = 10; break;
          default: armorAC = armorDetails.equippedArmor?.system.armor.value ?? 10; break;
        };
        const armorReduction = armorAC - 10 + shieldAC;
        const ec = ac - armorReduction;
        // @ts-expect-error no dnd5e-types
        this.system.attributes.ac.EC = ec;
        // @ts-expect-error no dnd5e-types
        this.system.attributes.ac.AR = armorReduction;
      } else {
        // @ts-expect-error no dnd5e-types
        if (!this.system.abilities) {
          error("challenge mode armor failed to find abilities");
          error(this);
          return;
        }
        // @ts-expect-error no dnd5e-types
        let dexMod = this.system.abilities.dex.mod;
        if (equippedArmor?.system.armor.type === "heavy") dexMod = 0;
        if (equippedArmor?.system.armor.type === "medium") dexMod = Math.min(dexMod, 2);
        // @ts-expect-error no dnd5e-types
        this.system.attributes.ac.EC = 10 + dexMod + shieldAC;
        // @ts-expect-error no dnd5e-types
        this.system.attributes.ac.AR = ac - 10 - dexMod;
      }
    }
  } catch (err) {
    const message = "midi-qol failed to prepare derived data";
    error(message, err);
    TroubleShooter.recordError(err, message);
  }
}

function _prepareItem(wrapped, item, ctx) {
  wrapped(item, ctx);
  // Filter from ctx.activities to preserve dnd5e's visibility filtering (including level limits)
  // Fixes issue #1548: Activity Visibility "Level Limit" ignored when midi-qol is enabled
  if (ctx.activities) {
    ctx.activities = ctx.activities.filter((a: Activity) => !a.midiProperties?.automationOnly);
  }
}

function getAttackModifiers(roll: Roll /* D20Roll */): string[] {
  //@ts-expect-error
  const modifiers: string[] = roll.d20.modifiers ?? [];
  const actor: Actor = fromUuidSync(roll.data?.actorUuid as string) as Actor;
  if (!actor) return modifiers;
  //@ts-expect-error
  const itemType = roll.data?.item?.itemType;
  //@ts-expect-error
  const type = roll.data?.activity?.attack?.type
  if (!itemType || !type) return modifiers;
  const actionType = `${type?.value === "ranged" ? "r" : "m"}${type?.classification === "spell" ? "sak" : "wak"}`;
  const changes: any[] = [];
  for (let effect of actor.allApplicableEffects()) {
    if (effect.disabled || effect.isSuppressed) continue;
    // @ts-expect-error fvtt-types v14 ActiveEffect
    for (let change of effect.system.changes) {
      if (change.key.startsWith("flags.midi-qol.rollModifiers.attack.")) changes.push(change);
    }
  }
  changes.sort((a, b) => a.priority - b.priority);
  for (let change of changes) {
    const [_, __, ___, ____, actionOrItem] = change.key.split(".");
    if (actionOrItem === "all" || actionOrItem === actionType || actionOrItem === itemType) {
      modifiers.push(change.value);
    }
  }
  return modifiers;
}

function _configureModifiers(this: Roll /*D20Roll*/, wrapped) {
  wrapped();
  // @ts-expect-error no dnd5e-types
  if (this.data?.activity?.type !== "attack") return;
  // @ts-expect-error no dnd5e-types
  this.d20.modifiers = getAttackModifiers(this);
}

export function actorPrepareData(this: Actor.Implementation, wrapped) {
  try {
    foundry.utils.setProperty(this, "flags.midi-qol.onUseMacroName", this._source.flags?.[MODULE_ID]?.onUseMacroName);
    if (debugEnabled > 0) for (let effect of this.appliedEffects) {
      // @ts-expect-error fvtt-types v14 ActiveEffect
      for (let change of effect.system.changes) {
        if (change.key === "flags.midi-qol.onUseMacroName") {
          if (change.type !== "custom") {
            error("onUseMacro effect mode is not custom", `Actor ${this.name} Effect: ${effect.name} ${this.uuid}`);
            TroubleShooter.recordError(new Error("onUseMacro effect mode is not custom"), `Actor ${this.name} Effect: ${effect.name} ${this.uuid} `);
            change.type = "custom";
          }
        }
      }
    }
    processTraits(this);
    wrapped();
    prepareOnUseMacroData(this);
  } catch (err) {
    const message = `actor prepare data ${this?.name}`;
    TroubleShooter.recordError(err, message);
  }
}

export function itemPrepareData(this: Item.Implementation, wrapped) {
  foundry.utils.setProperty(this, "flags.midi-qol.onUseMacroName", this._source.flags?.[MODULE_ID]?.onUseMacroName);
  // Migrate PascalCase friendlySave values to camelCase
  // @ts-expect-error
  const activities = this.system?.activities;
  if (activities) {
    for (const activity of Object.values(activities) as any[]) {
      if (activity.friendlySave === "FriendlyFail") activity.friendlySave = "friendlyFail";
      else if (activity.friendlySave === "FriendlySuccess") activity.friendlySave = "friendlySuccess";
    }
  }
  if (debugEnabled > 0) for (let effect of this.effects) {
    // @ts-expect-error fvtt-types v14 ActiveEffect
    for (let change of effect.system.changes) {
      if (change.key === "flags.midi-qol.onUseMacroName") {
        if (change.type !== "custom") {
          error("onUseMacro effect mode is not custom", `Actor: ${this.parent?.name} Item: ${this.name} Effect: ${effect.name} ${this.uuid} `);
          TroubleShooter.recordError(new Error("onUseMacro effect mode is not custom - mode treated as custom"), `Actor: ${this.parent?.name} Item: ${this.name} Effect: ${effect.name} ${this.uuid} `);
          change.type = "custom";
        }
      }
    }
  }
  wrapped();
  prepareOnUseMacroData(this);
}

export function prepareOnUseMacroData(actorOrItem: Actor.Implementation | Item.Implementation) {
  try {
    const macros = actorOrItem.flags?.[MODULE_ID]?.onUseMacroName;
    foundry.utils.setProperty(actorOrItem, "flags.midi-qol.onUseMacroParts", new OnUseMacros(macros ?? null));
  } catch (err) {
    const message = `midi-qol | failed to prepare onUse macro data ${actorOrItem?.name}`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  }
}

export function preUpdateItemActorOnUseMacro(
  itemOrActor: Actor.Implementation | Item.Implementation,
  changes: Actor.UpdateData | Item.UpdateData,
  options: Actor.Database.PreUpdateOperation | Item.Database.PreUpdateOptions,
  userId: string
) {
  try {
    const macroChanges = changes.flags?.[MODULE_ID]?.onUseMacroParts;
    if (!macroChanges || foundry.utils.isEmpty(macroChanges)) return true;
    const macros = itemOrActor._source.flags?.[MODULE_ID]?.onUseMacroName;
    const macroParts = new OnUseMacros(macros ?? null);

    if (!Array.isArray(macroChanges.items)) { // we have an update from editing the macro changes
      for (let keyString in macroChanges.items as Record<string, OnUseMacro>) {
        let key = Number(keyString);
        if (Number.isNaN(key)) continue; // just in case
        if (!macroParts.items[key]) {
          macroParts.items.push(OnUseMacro.parsePart({
            macroName: (macroChanges.items as Record<string, OnUseMacro>)[key]?.macroName ?? "",
            option: (macroChanges.items as Record<string, OnUseMacro>)[key]?.option ?? ""
          }));
          key = macroParts.items.length - 1;
        }
        if ((macroChanges.items as Record<string, OnUseMacro>)[keyString].macroName) macroParts.items[key].macroName = (macroChanges.items as Record<string, OnUseMacro>)[keyString].macroName;
        if ((macroChanges.items as Record<string, OnUseMacro>)[keyString].option) macroParts.items[key].option = (macroChanges.items as Record<string, OnUseMacro>)[keyString].option;
      }
    }
    let macroString = OnUseMacros.parseParts(macroParts).items.map(oum => oum.toString()).join(",");
    if (changes.flags?.[MODULE_ID]?.onUseMacroName) changes.flags[MODULE_ID].onUseMacroName = macroString;
    delete changes.flags?.[MODULE_ID]?.onUseMacroParts;
  } catch (err) {
    delete changes.flags?.[MODULE_ID]?.onUseMacroParts;
    const message = `midi-qol | failed in preUpdateItemActor onUse Macro for ${itemOrActor?.name} ${itemOrActor?.uuid}`
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  }
  return true;
};

export function getItemEffectsToDelete(args: { actor: Actor.Implementation, origin: string, ignore: string[], ignoreTransfer: boolean, options: any }): string[] {
  warn("getItemEffectsToDelete: started", globalThis.DAE?.actionQueue);
  let effectsToDelete: string[] | undefined;
  let { actor, origin, ignore, ignoreTransfer, options } = args;
  try {
    if (!actor) {
      return [];
    }
    const actorEffects: ActiveEffect[] | undefined = actor?.appliedEffects;
    effectsToDelete = actorEffects?.filter(ef => {
      if (installedModules.get("times-up")) {
        if (globalThis.TimesUp.isEffectExpired(ef, { combat: game.combat })) return false;
      }
      return ef.origin === origin
        && !ignore.includes(ef.uuid)
        && (!ignoreTransfer || ef.flags?.dae?.transfer !== true)
    }).map(ef => ef.id!);
    warn("getItemEffectsToDelete: effectsToDelete ", actor.name, effectsToDelete, options);
    return effectsToDelete;
  } catch (err) {
    const message = `getItemEffectsToDelete item effects failed for ${actor.name} ${origin} ${effectsToDelete}`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
    return [];
  }
}

export async function zeroHPExpiry(actor: Actor.Implementation, update: Actor.UpdateData, options: Actor.Database.UpdateOptions, user: string) {
  const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");
  if (hpUpdate !== 0) return;
  const expiredEffects: ActiveEffect[] = [];
  for (let effect of actor.appliedEffects) {
    if (effect.flags?.dae?.specialDuration?.includes("zeroHP")) expiredEffects.push(effect)
  }
  if (expiredEffects.length > 0) await expireEffects(actor, expiredEffects, { "expiry-reason": "midi-qol:zeroHP" })
}

/**
 * Legacy wrapper for processWoundedStatus.
 * Called from Hooks.ts updateItem handler for vitality changes.
 * @deprecated Use processWoundedStatus directly for new code.
 */
export async function checkWounded(actor: Actor.Implementation, _update: Actor.UpdateData, _options: Actor.Database.UpdateOptions, _user: string, _vitalityValue?: number) {
  // Use the per-actor semaphore to serialize with actorOnUpdate
  const semaphore = getActorWoundedSemaphore(actor.uuid);
  await semaphore.add(async () => {
    await processWoundedStatus(actor);
  });
}

async function setDeadStatus(actor: Actor.Implementation, options: { effect: CONFIG.StatusEffect | ActiveEffect.Implementation; useDefeated: boolean; makeDead: boolean; overlay?: boolean; }) {
  let { effect, useDefeated, makeDead } = options;
  if (!effect?.id) return;

  if (makeDead) {
    // Remove unconscious effect before adding dead (if present)
    // Check for actual effect, not just status (which could come from a rider)
    const unconsciousEffect = actor.effects.find(e => e.statuses.has("unconscious"));
    if (unconsciousEffect) {
      await actor.toggleStatusEffect("unconscious", { active: false });
    }
  }

  // toggleStatusEffect handles both cases gracefully:
  // - active: true when already exists → returns true, no error
  // - active: false when doesn't exist → returns undefined, no error
  const result = await actor.toggleStatusEffect(effect.id, { overlay: (configSettings.addDead === "overlay") || options.overlay, active: makeDead });

  // Only update defeated status if the toggle actually changed something
  if (useDefeated && result !== undefined) {
    const combatants = game.combat?.getCombatantsByActor(actor) ?? [];
    for (let combatant of combatants) await combatant.update({ defeated: makeDead }, {});
  }
}

function createConcentrationEffectData(this: ActiveEffect.Implementation, wrapped, activity: Activity, data: any = {}) {
  const effectData: ActiveEffect.CreateData = wrapped(activity, data);
  if (!effectData.flags?.dnd5e?.itemUuid) {
    foundry.utils.setProperty(effectData, "flags.dnd5e.itemUuid", activity.uuid);
  }
  return effectData;
}

export async function challengeConcentration(this: Actor.Implementation, wrapped, { dc = 10, ability = null } = {}) {
  // Set.delete() returns true if the uuid was in the set (check + remove in one operation)
  if (skipConcentrationActorUuids.delete(this.uuid)) {
    return;
  }
  if (["chatOnly"].includes(configSettings.doConcentrationCheck))
    return wrapped({ dc, ability });
  // @ts-expect-error no dnd5e-types
  const isConcentrating = this.concentration.effects.size > 0;
  if (!isConcentrating) return null;
  // @ts-expect-error no dnd5e-types
  if (configSettings.concentrationIncapacitatedConditionCheck && (hasCondition(this, "incapacitated") || this.system.attributes.hp.value <= 0)) return;
  if (["chat"].includes(configSettings.doConcentrationCheck)) {
    const dataset = {
      action: "concentration",
      dc,
    };
    //@ts-expect-error no dnd5e-types
    if (ability && ability in game.system?.config.abilities) dataset.ability = ability;
    const config = {
      type: "concentration",
      format: "short",
      icon: true
    }
    //@ts-expect-error no dnd5e-types
    const enrichers = game.system?.enrichers;
    return ChatMessage.implementation.create({
      content: `<div class="dnd5e chat-card request-card" data-action="concentration" data-dc="${dc}" data-type="midi-concentration">
      <div><span class="visible-dc">${enrichers.createRollLabel({ ...dataset, ...config })} ${i18n("DND5E.Roll")}</span></div>
      <div><span class="hidden-dc">${enrichers.createRollLabel({ ...dataset, ...config, hideDC: true })} ${i18n("DND5E.Roll")}</span></div>
      </div>`,
      whisper: game.users?.filter(user => this.testUserPermission(user, "OWNER")).map(user => user.id),
      speaker: ChatMessage.implementation.getSpeaker({ actor: this })
    });
  }
  // item rolls are picked up when the damage is updated in dnd5e.damageActor
  return;
}

export async function checkDeleteTemplate(templateDocument: MeasuredTemplateDocument | RegionDocument.Implementation, options: any, user: string) {
  if (user !== game.user?.id) return;
  if (options.undo) return;

  // Cast for flag operations — both document types support getFlag with identical runtime behavior
  const flagDoc = templateDocument as MeasuredTemplateDocument;

  // Cascade delete dependents of this template via MidiDependentsRegistry (only active GM should do this)
  // v14: Region and MeasuredTemplate share the same ID but have different UUIDs.
  // Dependents may be tracked under either UUID (e.g., addDependent(template, ...) uses the
  // MeasuredTemplate UUID), so cascade under both the Region UUID and the MeasuredTemplate UUID.
  if (preferredActiveGM()?.isSelf) {
    await MidiDependentsRegistry.deleteDependents(templateDocument.uuid);
    const altUuid = templateDocument.uuid.replace(".Region.", ".MeasuredTemplate.");
    if (altUuid !== templateDocument.uuid) {
      await MidiDependentsRegistry.deleteDependents(altUuid);
    }
  }

  // Check if this template was dependent on a concentration effect - if so, clean up the effect if no more dependents
  if (options.noConcentrationCheck || configSettings.removeConcentrationEffects === "none") return;

  const dependentOn = flagDoc.getFlag("dnd5e", "dependentOn");
  if (!dependentOn) return;

  const parentEffect = fromUuidSync(dependentOn);
  if (parentEffect instanceof ActiveEffect) {
    // @ts-expect-error no dnd5e-types
    if (parentEffect.getDependents()?.length === 0) {
      await parentEffect.delete();
    }
  }
};

export async function rollToolCheck(this: Actor.Implementation, wrapped, config: RollProcessConfig & { ability?: string, tool?: string } = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  let result: Roll[] | undefined;
  let preRollHookId: number | undefined;
  let postRollHookId: number | undefined;
  try {
    config.midiOptions ??= {};
    message.data ??= {};
    let toolId = config.tool;
    const rollTools: string[] = config.midiOptions?.rollTools ?? (toolId ? [toolId] : []);
    if (rollTools.length === 0)
      throw new Error(`rollToolCheck called with no tools to roll for ${this.name}`);
    const chatMessage = message.create;
    message.create = false;

    // Set originatingMessage so dnd5e's MessageRegistry and getOriginatingMessage() work correctly
    const originatingCardId = config.midiOptions?.workflow?.itemCardId
      ?? (config.midiOptions?.itemCardUuid ? fromUuidSync(config.midiOptions.itemCardUuid)?.id : undefined);
    if (originatingCardId) foundry.utils.setProperty(message, "data.flags.dnd5e.originatingMessage", originatingCardId);

    if (dialog.configure === undefined && isAutoFastForward("tool")) dialog.configure = false;

    // Check if advantage was pre-computed by an external module (Monks Token Bar, Flash Rolls, Epic Rolls)
    const sourceInfo = getAdvantageSourceInfo(config);
    const isExternalModuleRoll = sourceInfo.isExternalModule;

    let hasPreComputedAdvantage = false;
    if (!config.midiOptions.recomputeAdvantage) {
      hasPreComputedAdvantage = applyPreComputedAdvantage(config);
      if (hasPreComputedAdvantage && isAutoFastForward("tool")) {
        config.midiOptions.fastForward = true;
      }
    }
    // Only compute advantage from flags if not from external module and not pre-computed
    if (!hasPreComputedAdvantage && !isExternalModuleRoll) {
      if (!config.midiOptions.workflow && config.midiOptions.workflowId) {
        config.midiOptions.workflow = Workflow.getWorkflow(config.midiOptions.workflowId);
      }
      const toolRollModifierTracker = await computeToolAdvantage(this, config.tool ?? "", config.ability ?? "", config.midiOptions);
      config.advantage = toolRollModifierTracker.hasAdvantage;
      config.disadvantage = toolRollModifierTracker.hasDisadvantage;
    }

    let toolModifiers: RollModifierResult | undefined;
    const midiOptions = config.midiOptions;
    let success: boolean | undefined = undefined;

    // Check if advantageByChoice was passed in (from Workflow via GMAction with deserialized trackers)
    const passedToolAdvantageMap = config.midiOptions?.advantageByChoice as Record<string, PreComputedAdvantage> | undefined;
    const hasPassedToolAdvantage = passedToolAdvantageMap && Object.keys(passedToolAdvantageMap).length > 0 &&
      Object.values(passedToolAdvantageMap).some(v => v.tracker instanceof RollModifierTracker);

    // Skip building advantage map for external module rolls - they already computed advantage
    const preComputedToolAdvantageMap: Record<string, PreComputedAdvantage> = isExternalModuleRoll
      ? {} // External modules handle their own advantage - don't recompute
      : hasPassedToolAdvantage && passedToolAdvantageMap
        ? passedToolAdvantageMap
        : await buildPreComputedAdvantageMap(this, "tool", rollTools, config.midiOptions ?? {});

    // Setup dialog with MidiRollChoiceDialog helper
    let userExplicitChoice: string | undefined;
    const { hasMultiple: hasMultipleTools } = setupChoiceDialog(
      this, config, dialog, "tool", rollTools,
      preComputedToolAdvantageMap, hasPreComputedAdvantage, "tool",
      (choice) => { userExplicitChoice = choice; }
    );

    preRollHookId = Hooks.once("dnd5e.preRollTool", (configData, dialogData, messageData) => {
      configData.midiOptions = { ...(configData.midiOptions ?? {}), ...(midiOptions ?? {}) };

      const toolAdvantageValues = Object.values(preComputedToolAdvantageMap);
      const allAutoFail = toolAdvantageValues.length > 0 && toolAdvantageValues.every(d => d.tracker instanceof RollModifierTracker && d.tracker.modifiers.willFail);
      if (hasMultipleTools && !allAutoFail && dialogData.configure !== false) {
        dialogData.configure = true;
      } else {
        const chosenTool = configData.tool ?? toolId;
        const chosenAdvantage = preComputedToolAdvantageMap[chosenTool!];
        if (chosenAdvantage) {
          // Only override advantage/disadvantage if not pre-computed from external module
          // (Monks Token Bar, Flash Rolls, Epic Rolls pass their own advantage/disadvantage)
          if (!hasPreComputedAdvantage) {
            configData.advantage = chosenAdvantage.hasAdvantage;
            configData.disadvantage = chosenAdvantage.hasDisadvantage;
          }
          if (chosenAdvantage.tracker instanceof RollModifierTracker) {
            toolModifiers = applyRollModifiers(chosenAdvantage.tracker, configData, dialogData);
          }
        }
      }
      setRollDialogOptions(configData, dialogData, "tool");
      message = messageData;
    });

    postRollHookId = Hooks.once("dnd5e.postToolRollConfiguration", (rolls, configData, dialogData, messageDetails) => {
      // record message configuration details for later display
      message = messageDetails;

      // Detect tool change from choice dialog and check auto-fail/auto-success
      if (configData.tool && configData.tool !== toolId) {
        toolId = configData.tool;
      }
      const chosenToolData = preComputedToolAdvantageMap[toolId ?? ""];
      const chosenToolTracker = chosenToolData?.tracker instanceof RollModifierTracker ? chosenToolData.tracker : undefined;
      if (chosenToolTracker?.modifiers.willFail) success = false;
      else if (chosenToolTracker?.modifiers.willSucceed) success = true;

      // Apply blind roll mode based on chosen tool (uses check settings since tools are ability checks)
      messageDetails.rollMode = applyBlindRollMode(configSettings.rollChecksBlind, toolId, messageDetails.rollMode);

      return true;
    });

    if (this.token) foundry.utils.setProperty(dialog, "options.window.subtitle", this.token.name);
    result = await wrapped(config, dialog, message);
    let rollMode = message.rollMode ?? safeGetGameSetting("core", "rollMode");
    if (result) {
      await displayDSNForRoll(result, "toolCheck", rollMode);
      DSNMarkDiceDisplayed(result);
      result![0] = await bonusCheck(this, result![0], "check", config.ability ?? "", message.data);
      DSNMarkDiceDisplayed(result);
    }
    if (!result) return result;
    // Stamp the chosen tool on the rolls (after bonusCheck) so the save display can show which tool was used
    // userExplicitChoice is set by buildConfig wrapper when user changes dropdown; config.tool is the auto-selected best
    const _chosenTool = userExplicitChoice ?? config.tool;
    //@ts-expect-error midiChosenId is a custom roll option
    if (hasMultipleTools) result.forEach(r => { if (r?.options) r.options.midiChosenId = _chosenTool; });

    // Set originatingMessage on roll options so modules can access it without .parent
    const rollOriginatingId = foundry.utils.getProperty(message, "data.flags.dnd5e.originatingMessage") as string | undefined
      ?? originatingCardId;
    //@ts-expect-error originatingMessage is a custom roll option
    if (rollOriginatingId) result.forEach(r => { if (r?.options) r.options.originatingMessage = rollOriginatingId; });

    if (chatMessage !== false && result) {
      if (foundry.utils.getProperty(result, "flags.midi-qol.chatMessageShown") !== true) {
        const messageData: any = foundry.utils.mergeObject({ sound: CONFIG.sounds.dice }, message.data ?? {});
        messageData.rolls = [...result];
        const chatMsg = await ChatMessage.create(messageData, { rollMode });
        // dnd5e sets roll.parent in buildPost; replicate here since we bypass buildPost
        if (chatMsg) result.forEach(r => (r as any).parent = chatMsg);
      }
    }
    return result;
  } catch (err) {
    const message = "midi-qol | error in rollToolCheck";
    TroubleShooter.recordError(err, message);
    throw err;
  } finally {
    if (preRollHookId) Hooks.off("dnd5e.preRollTool", preRollHookId);
    if (postRollHookId) Hooks.off("dnd5e.postToolRollConfiguration", postRollHookId);
  }
}

// This is done as a wrapper so that there is no race condition when hp reaches 0 also trying to remove condition
// This version will always fire first, remove concentration if needed and complete before the hp update is processed.
async function _preCreateActiveEffect(this: ActiveEffect.Implementation, wrapped, data: ActiveEffect.CreateData, options: ActiveEffect.Database.PreCreateOptions, user: User.Implementation): Promise<void> {
  try {
    if (!configSettings.concentrationIncapacitatedConditionCheck) return;
    const parent: any = this.parent;
    const checkConcentration = configSettings.removeConcentration || !safeGetGameSetting("dnd5e", "disableConcentration");
    // @ts-expect-error
    if (!checkConcentration || options.noConcentrationCheck) return;
    if (!(parent instanceof CONFIG.Actor.documentClass)) return;
    if (globalThis.MidiQOL.incapacitatedConditions.some(condition => this.statuses.has(condition))) {
      if (debugEnabled > 0) warn(`on createActiveEffect ${this.name} ${this.id} removing concentration for ${parent.name}`)
      // @ts-expect-error no dnd5e-types
      if (parent.system.attributes?.hp?.value > 0) {
        // @ts-expect-error no dnd5e-types
        await parent.endConcentration();
      }
    }
  } catch (err) {
    const message = "midi-qol | error in preCreateActiveEffect";
    error(message, err);
    TroubleShooter.recordError(err, message);
  } finally {
    return wrapped(data, options, user);
  }
}

export async function _preDeleteCombat(this: Combat.Implementation, wrapped, ...args) {
  try {
    for (let combatant of this.combatants) {
      if (combatant.actor) {
        if (hasUsedReaction(combatant.actor)) await removeReactionUsed(combatant.actor, true);
        if (hasUsedBonusAction(combatant.actor)) await removeBonusActionUsed(combatant.actor, true);
        if (hasUsedAction(combatant.actor)) await removeActionUsed(combatant.actor);
      }
    }
  } catch (err) {
    const message = `midi-qol | error in preDeleteCombat`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  } finally {
    return wrapped(...args)
  }
}

export async function doItemUse(this: Item.Implementation, wrapped, config: ActivityUseConfiguration & { chooseActivity?: boolean } = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  if (this.pack) return;
  const { chooseActivity, ...activityConfig } = config;
  // @ts-expect-error no dnd5e-types
  // Filter usable activities: exclude riders, automationOnly, inProgress, and activities that fail visibility checks (canUse)
  const activities = this.system.activities?.filter(a =>
    a.canUse !== false &&
    !this.flags.dnd5e?.riders?.activity?.includes(a.id) &&
    !a.midiProperties?.automationOnly &&
    !a.inProgress
  );
  const attackActivities = activities?.filter(a => a instanceof MidiAttackActivity);
  if (attackActivities?.length === 1) { // if there is a single attack activity and no other non-automation activities use it
    const attackActivity = attackActivities[0];
    const extraActivities = activities?.filter(a => a !== attackActivity && a !== attackActivity?.otherActivity);
    if (extraActivities?.length === 0) {
      return await attackActivity.use(config, dialog, message);
    }
  }
  //@ts-expect-error
  const areKeysPressed = game.system?.utils.areKeysPressed;
  const skipPressed = areKeysPressed(config.event, "skipDialogAdvantage") || areKeysPressed(config.event, "skipDialogDisadvantage") || areKeysPressed(config.event, "skipDialogNormal");
  if (skipPressed) {
    const attackActivity = attackActivities[0];
    if (attackActivity) return await attackActivity.use(config, dialog, message);
    else return await activities?.[0]?.use(config, dialog, message);
  }
  if (activities?.length > 1 || chooseActivity) {
    const activity = await MidiActivityChoiceDialog.create(this);
    return await activity?.use(config, dialog, message);
  }
  if (activities?.length === 1) {
    return await activities[0].use(config, dialog, message);
  }
  // @ts-expect-error no dnd5e-types
  if (this.actor) return this.displayCard(message);
}

export function processTraits(actor: Actor.Implementation) {
  try {
    // @ts-expect-error no dnd5e-types
    if (!actor.system.traits) return;
    for (let traitId of ["di", "dr", "dv", "sdi", "sdr", "sdv"]) {
      // @ts-expect-error no dnd5e-types
      let trait = actor.system.traits[traitId];
      if (!trait) continue;
      if (!trait.value) trait.value = new Set();
      for (let traitString of trait.value) {
        switch (traitString) {
          case "silver":
            trait.bypasses.add("sil");
            addPhysicalDamages(trait.value);
            break
          case "adamant":
            trait.bypasses.add("adm");
            addPhysicalDamages(trait.value);
            break
          case "physical":
            addPhysicalDamages(trait.value);
            break;
          case "nonmagic":
            addPhysicalDamages(trait.value);
            trait.bypasses.add("mgc");
            break;
          case "spell":
            // trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.spell-damage"));
            break
          // "power" type removed in v13
          case "magic":
            // trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.Magical"));
            break
          case "healing":
            // trait.custom = addCustomTrait(trait.custom, systemConfig.healingTypes.healing);
            break
          case "temphp":
            // trait.custom = addCustomTrait(trait.custom, systemConfig.healingTypes.temphp);
            break
          default:
            trait.value.add(traitString);
        }
      }
    }

  } catch (err) {
    const message = `midi-qol | processTraits | error for ${actor?.name}`;
    console.warn(message, this, err);
    TroubleShooter.recordError(err, message);
  } finally {
  }
}
function addPhysicalDamages(traitValue: string[] | Set<string>) {
  let physicalDamageTypes;
  physicalDamageTypes = Object.keys(GameSystemConfig.damageTypes).filter(dt => GameSystemConfig.damageTypes[dt].isPhysical);
  for (let dt of physicalDamageTypes) {
    if (traitValue instanceof Set) traitValue.add(dt);
    else if (!traitValue.includes(dt)) traitValue.push(dt);
  }
}

function actorGetRollData(this: Actor.Implementation, wrapped, ...args) {
  const data = wrapped(...args);
  data.actorType = this.type;
  data.name = this.name;
  data.flags ??= {};
  data.flags["midi-qol"] = this.flags?.["midi-qol"] ?? {};
  data.midiFlags = data.flags["midi-qol"];
  // data.items = this.items;
  data.cfg ??= {};
  data.cfg.armorClasses = GameSystemConfig.armorClasses;
  data.cfg.actorSizes = GameSystemConfig.actorSizes;
  data.cfg.skills = GameSystemConfig.skills;
  if (data.traits) {
    // @ts-expect-error no dnd5e types
    data.traits.sizeNumeric = GameSystemConfig.actorSizes[this.system.traits?.size]?.numerical ?? 2;
  }
  return data;
}

function itemGetRollData(this: Item.Implementation, wrapped, ...args) {
  const data = wrapped(...args);
  if (!data) return data;
  data.item.flags = this.flags ?? {};
  data.item.flags["midi-qol"] = this.flags?.["midi-qol"] ?? {};
  data.item.midiFlags = data.item.flags["midi-qol"];
  data.item.name = this.name;
  data.item.itemType = this.type;
  return data;
}
function _filterItems(wrapped, items, filters) {
  if (!filters.has("reaction")) return wrapped(items, filters);
  const revisedFilters = new Set(filters);
  revisedFilters.delete("reaction");
  let filteredItems = wrapped(items, revisedFilters);
  filteredItems = filteredItems.filter(item => {
    if (item.system.activation?.type?.includes("reaction")) return true;
    return false
  });
  return filteredItems
};