import { initHiding } from "./lib/hiding.js";
import { log, i18n, error, i18nFormat, warn, debugEnabled, GameSystemConfig, MODULE_ID, gameStats, getStaticID, MIDI_IMPLYING_STATUSES } from "../midi-qol.js";
import { saveDisplayMode } from "./lib/saveVisibility.js";
import { configSettings, checkRule, checkMechanic, safeGetGameSetting, safeSetGameSetting, playerControlsInvisibleTokens } from "./settings.js";
import { bonusDialog, createConditionData, displayDSNForRoll, expireRollEffect, getCriticalDamage, getDeadStatus, getOptionalCountRemainingShortFlag, getUnconsciousStatus, getVitalityDeadStatus, getWoundedStatus, hasUsedAction, hasUsedBonusAction, hasUsedReaction, midiRenderRoll, notificationNotify, removeActionUsed, removeBonusActionUsed, removeReactionUsed, tokenForActor, expireEffects, DSNMarkDiceDisplayed, evalAllConditionsAsync, hasCondition, areMidiKeysPressed, MidiOptions, getVitalityItem, checkMagicResistanceAndVulnerability, isAutoFastForward, FastForwardRollType, buildRollChoices, selectBestRollChoice, getTokenPerimeterPolygon, closestPointOnPerimeter, measurePointDistance, setUserInitiatedTarget, dnd5eRollType, updateUserTargets, isEffectExpired, processTurnOverTime, toggleStatus } from "./utils.js";
import { computeActivityTemplateTargets } from "./activities/activityHelpers.js";
import { installedModules } from "./setupModules.js";
import { OnUseMacro, OnUseMacros } from "./apps/Item.js";
import { initHiddenGroundCue } from "./lib/hiddenGroundCue.js";
import { initConditionRules } from "./lib/conditionRules.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { MidiAttackActivity } from "./activities/AttackActivity.js";
import { MidiActivityChoiceDialog } from "./apps/MidiActivityChoiceDialog.js";
import { MidiRollChoiceDialog, PreComputedAdvantage } from "./apps/MidiRollChoiceDialog.js";
import Token = foundry.canvas.placeables.Token;
import { AnyMutableObject } from "fvtt-types/utils";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../globals.js";
import { Workflow } from "./Workflow.js";
import { preferredActiveGM, socketlibSocket } from "./GMAction.js";
import { MidiDependentsRegistry, MidiDependentDocumentMixin, actorEmbeddedByPath } from "./lib/MidiDependentsRegistry.js";
import { ADVANTAGE, DISADVANTAGE, NORMAL, decideRollDialog, heldKeys, keyMode } from "./lib/rollKeys.js";
import { RollModifierTracker, computeAdvantageFlags, computeRollModifiers, applyRollModifiers, RollModifierFlags, RollModifierResult, AdvantageFlags, applyTrackerAdvantage } from "./lib/RollModifierTracker.js";

let libWrapper;

const NumericTerm = foundry.dice.terms.NumericTerm;

// Module-level Set to track actors that should skip concentration checks
// Used instead of actor flags to avoid database writes and orphaned flags
export const skipConcentrationActorUuids = new Set<string>();

// Per-actor semaphores to prevent race conditions in checkWounded
// Multiple concurrent updateActor hooks can fire for the same actor, causing duplicate status effects
const actorWoundedSemaphores = new Map<string, foundry.utils.Semaphore>();

/** A workflow is waiting on a save or check from this actor (its requests are keyed by the token's id or the actor's uuid). */
function awaitedByWorkflow(actor: Actor.Implementation): boolean {
  const tokenIds = actor.getActiveTokens(false, true).map(t => t.id);
  for (const workflow of Workflow.workflows.values()) {
    const requests = workflow.saveRequests;
    if (requests && (requests[actor.uuid] || tokenIds.some(id => id && requests[id]))) return true;
  }
  return false;
}

export function getActorWoundedSemaphore(actorUuid: string): foundry.utils.Semaphore {
  if (!actorWoundedSemaphores.has(actorUuid)) {
    actorWoundedSemaphores.set(actorUuid, new foundry.utils.Semaphore(1));
  }
  return actorWoundedSemaphores.get(actorUuid)!;
}

// ==================== PATCHING ENTRY POINTS ====================
// These functions are called during module initialization to register libWrapper patches.
// The helper functions they reference are defined later in this file.

/**
 * Apply the fail/success conditions of the ability a skill or tool roll is built with when that is not the ability the
 * roll started with (a choice in dnd5e's dialog). dnd5e applies that ability's min/max itself.
 */
function applyChosenAbilityModifiers(type: "skill" | "tool") {
  return (process: RollProcessConfig, config: NonNullable<RollProcessConfig["rolls"]>[number]) => {
    const actor = process.subject;
    const abilityId = config.data?.abilityId;
    if (!(actor instanceof Actor) || typeof abilityId !== "string" || !abilityId || abilityId === process.ability) return;
    if (getAdvantageSourceInfo(process).isExternalModule) return;
    const flags: RollModifierFlags = { failFlags: [], successFlags: [], maxFlags: [], minFlags: [], fieldPaths: [`abilities.${abilityId}.check.roll`] };
    const tracker = new RollModifierTracker();
    computeRollModifiers(actor, flags, tracker, { workflow: process.midiOptions?.workflow });
    config.options ??= {};
    if (tracker.modifiers.willFail) {
      config.parts = [];
      config.options.maximum = 1;
    } else if (tracker.modifiers.willSucceed) {
      config.parts = [];
      config.options.minimum = 99;
    }
  };
}

/**
 * A parenthetical term's data with its inner roll as data, not the live Roll. dnd5e 6 doubles a parenthesised damage
 * term on a critical by cloning it (`RollTerm.fromData(deepClone(term.toJSON()))`); deepClone keeps class instances,
 * so the copy shared the original's inner Roll and evaluating the second threw "already evaluated", stopping the
 * workflow. JSON output is unchanged (JSON.stringify calls the inner roll's toJSON anyway). Remove once dnd5e clones
 * through JSON.
 */
function parentheticalToJSON(this: unknown, wrapped: () => Record<string, unknown>): Record<string, unknown> {
  const data = wrapped();
  if (data.roll instanceof Roll) data.roll = data.roll.toJSON();
  return data;
}

export function initPatching() {
  libWrapper = globalThis.libWrapper;
  Hooks.on("dnd5e.postBuildSkillRollConfig", applyChosenAbilityModifiers("skill"));
  Hooks.on("dnd5e.postBuildToolRollConfig", applyChosenAbilityModifiers("tool"));
  // TODO this needs more work libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.migrateData", removeMidiProperties, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.prepareDerivedData", _prepareDerivedData, "WRAPPER");
  libWrapper.register(MODULE_ID, "foundry.dice.terms.ParentheticalTerm.prototype.toJSON", parentheticalToJSON, "WRAPPER");
  // For new onUse macros stuff.
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.prepareData", itemPrepareData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.prepareData", actorPrepareData, "WRAPPER");
  // I think this can be removed in v13 libWrapper.register(MODULE_ID, "KeyboardManager.prototype._onFocusIn", _onFocusIn, "OVERRIDE");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.getRollData", actorGetRollData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.calculateDamage", calculateDamageAllTraits, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.toggleStatusEffect", toggleImpliedStatus, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._preUpdate", combatPreUpdate, "WRAPPER");
  Hooks.on("updateCombat", recoverRerolledInitiativeUses);
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._onStartTurn", combatOnStartTurn, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._onEndTurn", combatOnEndTurn, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.getRollData", itemGetRollData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.dependentOrigin", itemDependentOrigin, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype._preCreate", _preCreateActiveEffect, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.D20Roll.prototype.configureModifiers", _configureModifiers, "WRAPPER");
  libWrapper.register(MODULE_ID, "dnd5e.applications.actor.BaseActorSheet.prototype._prepareItem", _prepareItem, "WRAPPER");
  initConditionRules();
  initHiding();

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
  libWrapper.register(MODULE_ID, "foundry.canvas.layers.CanvasOcclusionMask.prototype._updateOccludedSurfaces",
    _updateOccludedSurfacesWrapper, "WRAPPER");

  initHiddenGroundCue();

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
  // Constrain template placement to range / anchor cones to the caster while dragging. Only the
  // interactive step is wrapped; dnd5e still builds and creates the template regions.
  libWrapper.register(MODULE_ID, "game.dnd5e.canvas.TemplatePlacement.prototype._place", midiTemplatePlace, "MIXED");
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
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollSkill", rollSkill, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollToolCheck", rollToolCheck, "MIXED");
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
        await toggleStatus(actor, woundedStatus.id!, {
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
      // A creature immune to the configured condition (a Specter cannot be Unconscious) would be left
      // at 0 HP with no marker at all, since the immunity strips it; use the real Dead status instead.
      // @ts-expect-error no dnd5e-types
      if (effect?.id && actor.system.traits?.ci?.value?.has?.(effect.id)) {
        effect = CONFIG.statusEffects.find(se => se.id === "dead") ?? effect;
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
 * Link a save, check or tool roll to the card and activity it was rolled for, as dnd5e's own save buttons do:
 * `system.origin` (dnd5e's MessageRegistry, getOriginatingMessage, summaries) and the activity's message sources.
 */
function linkRollToCard(message: AnyMutableObject, midiOptions: MidiOptions | undefined): string | undefined {
  const card = midiOptions?.itemCardUuid ? fromUuidSync(midiOptions.itemCardUuid) : undefined;
  const cardId: string | undefined = midiOptions?.workflow?.itemCardId ?? (card instanceof ChatMessage ? card.id ?? undefined : undefined);
  if (!cardId) return undefined;
  foundry.utils.setProperty(message, "data.system.origin", cardId);
  if (midiOptions?.cardNote) foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.cardNote`, midiOptions.cardNote);
  const activity = midiOptions?.workflow?.saveActivity
    ?? (midiOptions?.saveActivityUuid ? fromUuidSync(midiOptions.saveActivityUuid) : undefined)
    // @ts-expect-error no dnd5e-types
    ?? game.messages?.get(cardId)?.getAssociatedActivity?.();
  const sources = activity?.messageSources;
  if (sources) for (const [key, value] of Object.entries(sources)) foundry.utils.setProperty(message, `data.system.${key}`, value);
  return cardId;
}

/**
 * The over-time effect a roll answers, from the button that was clicked: a dnd5e 6 prompt message midi posted
 * (flags on the message), or a link carrying midi's data attributes.
 */
function overtimeRequestOf(event: Event | undefined): { actorUuid?: string, rollMode?: string } {
  const element = event?.target instanceof HTMLElement ? event.target : undefined;
  const link = element?.closest<HTMLElement>('.roll-link, [data-action="rollRequest"], [data-action="concentration"]');
  if (link?.dataset.midiOvertimeActorUuid) return { actorUuid: link.dataset.midiOvertimeActorUuid, rollMode: link.dataset.midiRollMode };
  const messageId = element?.closest<HTMLElement>("[data-message-id]")?.dataset.messageId;
  const flags = messageId ? game.messages?.get(messageId)?.flags?.[MODULE_ID] : undefined;
  return { actorUuid: flags?.overtimeActorUuid, rollMode: flags?.overtimeRollMode };
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
// rollMode here is a v14 message mode (CONFIG.ChatMessage.modes key: public/gm/blind/self), matching
// what the roll dialog and the activity seed now use — not the legacy CONST.DICE_ROLL_MODES values.
function applyBlindRollMode(
  blindRollSettings: string[],
  choiceId: string | undefined,
  messageRollMode: string | undefined,
  messageDetails?: any
): keyof CONFIG.Dice.RollModes {
  let rollMode: string = messageRollMode ?? safeGetGameSetting("core", "messageMode");

  // If already blind, keep it
  if (rollMode === "blind") return rollMode as keyof CONFIG.Dice.RollModes;

  // Check if this roll should be forced to blind
  const shouldBeBlind = blindRollSettings.includes("all") || blindRollSettings.includes(choiceId ?? "");
  if (shouldBeBlind && ["public", "roll", "gm"].includes(rollMode)) {
    if ((configSettings.blindRollDisplay ?? "hidden") === "obscured") {
      // Keep the card public, but flag it so the result renders as "??" to non-GM players
      // (obscureRollRender) and the DSN animation is kept private (see the displayDSNForRoll calls).
      if (messageDetails) foundry.utils.setProperty(messageDetails, "data.flags.midi-qol.obscureRoll", true);
    } else {
      rollMode = "blind";
      safeSetGameSetting("core", "messageMode", "blind");
      // Players see nothing of a forced blind roll, not even that it was made (ChatMessageMidi.hiddenRollView).
      if (messageDetails) foundry.utils.setProperty(messageDetails, "data.flags.midi-qol.forcedBlind", true);
    }
  }

  return rollMode as keyof CONFIG.Dice.RollModes;
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
  detail ||= dnd5eRollType(messageData) ?? ""; // death saves -> "death", tool checks -> "tool"
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
      // A save or check rolled for a use card is linked to it; the bonus is shown there
      { messageData, card: game.messages?.get(messageData?.system?.origin?.id ?? messageData?.system?.origin ?? ""), anchor: "saves" }
    );
    if (newRoll) result = newRoll;
  }

  return result;
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
    // dnd5e 6 fills rolls[0].options itself when it builds rolls before a save (concentration), so only Epic Rolls' counts.
    hasPreComputed: hasDirect || hasEventAdvantage || (hasRolls && sourceType === "epic-rolls-5e") || hasMidiOptions,
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
  const sourceInfo = getAdvantageSourceInfo(config);
  // Needs the event (none for Flash Rolls or Epic Rolls). An external module's roll follows its own fast forward
  // setting, and shows the dialog unless that skips it.
  const keys = heldKeys(config.event);
  const fastForward = sourceInfo.isExternalModule ? getExternalModuleFastForward(sourceInfo, rollType)
    : !!config.midiOptions?.fastForward || isAutoFastForward(rollType);
  dialog.configure = decideRollDialog({ configure: dialog.configure, toggle: keys.toggle, fastForward })
    ?? (sourceInfo.isExternalModule ? true : undefined);

  // The dialog's default: the roll's advantage as passed and as dnd5e built it, with the held keys as dnd5e adds them.
  const mode = keyMode(keys);
  const rollOptions = config.rolls?.[0]?.options;
  const advantage = mode.forced !== null ? mode.forced === ADVANTAGE : !!(sourceInfo.advantage || rollOptions?.advantage || mode.advantage);
  const disadvantage = mode.forced !== null ? mode.forced === DISADVANTAGE : !!(sourceInfo.disadvantage || rollOptions?.disadvantage || mode.disadvantage);
  const advantageMode = advantage === disadvantage ? NORMAL : advantage ? ADVANTAGE : DISADVANTAGE;
  dialog.options.advantageMode = advantageMode;
  dialog.options.defaultButton = advantageMode === ADVANTAGE ? "advantage" : advantageMode === DISADVANTAGE ? "disadvantage" : "normal";
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
  onChoiceCapture: (choice: string) => void,
  abilityFor?: (id: string) => string | undefined
): { hasMultiple: boolean } {
  const hasMultiple = choices.length > 1;

  dialog.applicationClass = MidiRollChoiceDialog;
  dialog.options ??= {};
  const rollChoices = buildRollChoices(actor, rollTypeForChoices, choices, abilityFor);
  const best = selectBestRollChoice(rollChoices, advantageMap);

  if (best) {
    if (hasMultiple) (config as AnyMutableObject)[choiceType] = best.value;
    const bestAdvantage = advantageMap[best.value];
    if (bestAdvantage && !hasPreComputedAdvantage) {
      if (bestAdvantage.tracker instanceof RollModifierTracker) applyTrackerAdvantage(config, bestAdvantage.tracker);
      else {
        config.advantage = bestAdvantage.hasAdvantage;
        config.disadvantage = bestAdvantage.hasDisadvantage;
      }
    }
  }

  dialog.options.rollChoices = rollChoices;
  dialog.options.advantageByChoice = advantageMap;
  dialog.options.choiceType = choiceType;
  dialog.options.abilityForChoice = abilityFor;

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
  // dnd5e's die class (CONFIG.Dice.terms.d) has its own modifier list
  for (const cls of new Set([Die, ...Object.values(CONFIG.Dice.terms)]))
    if (cls === Die || cls.prototype instanceof Die) (cls as typeof Die).MODIFIERS["mx"] = "multiply";
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

/**
 * With auto reroll on, initiative is rerolled inside the round advance itself, with the new round's first turn, so the
 * order changes once and core's turn events see a single transition. A player's round advance is redone by the GM.
 */
async function combatPreUpdate(this: Combat.Implementation, wrapped, changed: Combat.UpdateData, options: Combat.Database.PreUpdateOptions, user: User.Implementation) {
  const allowed = await wrapped(changed, options, user);
  if (allowed === false) return false;
  if (!checkMechanic("autoRerollInitiative") || !this.combatants.size) return allowed;
  if (typeof changed.round !== "number" || changed.round <= (this.current.round ?? 0)) return allowed;
  if (!game.user?.isGM) {
    socketlibSocket.executeAsGM("advanceCombatRound", { combatUuid: this.uuid, changed: { round: changed.round, turn: changed.turn },
      options: { direction: options.direction, worldTime: options.worldTime } });
    return false;
  }
  (options as { midiRerolledInitiative?: string[] }).midiRerolledInitiative = await rerollInitiativeInUpdate(this, changed);
  return allowed;
}

/** dnd5e recovers uses "on initiative" when it rolls initiative; do the same for midi's reroll, once the round has advanced. */
async function recoverRerolledInitiativeUses(combat: Combat.Implementation, changed: Combat.UpdateData, options: Combat.Database.UpdateOptions, userId: string) {
  const rerolled = (options as { midiRerolledInitiative?: string[] }).midiRerolledInitiative;
  if (userId !== game.user?.id || !rerolled?.length) return;
  for (const id of rerolled) {
    // @ts-expect-error no dnd5e-types
    await combat._recoverUses({ initiative: combat.combatants.get(id) });
  }
}

/** Rolls as core's rollInitiative does, one roll per dnd5e initiative group, and writes the results into `changed`. */
async function rerollInitiativeInUpdate(combat: Combat.Implementation, changed: Combat.UpdateData): Promise<string[]> {
  const byGroup = new Map<string, number>();
  const updates: { _id: string, initiative: number }[] = [];
  const messages: object[] = [];
  for (const combatant of combat.combatants) {
    // @ts-expect-error no dnd5e-types
    const group: string = combatant.getInitiativeGroupingKey?.() ?? combatant.id;
    let initiative = byGroup.get(group);
    if (initiative === undefined) {
      const roll = combatant.getInitiativeRoll();
      await roll.evaluate();
      initiative = roll.total ?? 0;
      byGroup.set(group, initiative);
      // Private for hidden combatants, as core's rollInitiative.
      const messageOptions = { messageMode: combatant.hidden ? "gm" : undefined, create: false as const };
      const chatData: any = await roll.toMessage({
        speaker: ChatMessage.implementation.getSpeaker({ actor: combatant.actor, token: combatant.token, alias: combatant.name }),
        flavor: game.i18n?.format("COMBAT.RollsInitiative", { name: foundry.utils.escapeHTML(combatant.name ?? "") }),
        flags: { core: { initiativeRoll: true } }
      }, messageOptions);
      if (messages.length) chatData.sound = null;
      messages.push(chatData);
    }
    updates.push({ _id: combatant.id!, initiative });
  }
  changed.combatants = updates;
  // The round starts with the first combatant of the new order, skipping the defeated when core would.
  const order = combat.combatants.map(c => c.clone({ initiative: updates.find(u => u._id === c.id)?.initiative }, { keepId: true }))
    // @ts-expect-error _sortCombatants is protected in fvtt-types
    .sort((a, b) => combat._sortCombatants(a, b));
  const first = combat.settings?.skipDefeated ? order.findIndex(c => !c.isDefeated) : 0;
  changed.turn = Math.max(first, 0);
  await ChatMessage.implementation.create(messages as ChatMessage.CreateData[]);
  return updates.map(u => u._id);
}

async function combatOnStartTurn(this: Combat.Implementation, wrapped, combatant: Combatant.Implementation, context: object) {
  await wrapped(combatant, context);
  await processTurnOverTime(this, combatant, true);
}

async function combatOnEndTurn(this: Combat.Implementation, wrapped, combatant: Combatant.Implementation, context: object) {
  await wrapped(combatant, context);
  await processTurnOverTime(this, combatant, false);
}

const DAMAGE_TRAIT_KEYS = { immunity: "di", resistance: "dr", vulnerability: "dv" } as const;

/**
 * A per-type ignore or downgrade also reaches an "All Damage" trait: for the (synchronous) calculation the trait
 * lists the concrete damage types instead. dnd5e decides "All Damage" before, and apart from, per-type options.
 */
/**
 * A status carried only by one of midi's statuses (Invisible from the self-ending Invisible, before or without DAE's
 * dependent condition): core finds no document to toggle, so off would do nothing and a toggle would add a second one.
 */
async function toggleImpliedStatus(this: Actor.Implementation, wrapped, statusId: string, options: Actor.ToggleStatusEffectOptions = {}) {
  const carriers = Object.entries(MIDI_IMPLYING_STATUSES).filter(([, implied]) => implied === statusId)
    .map(([status]) => getStaticID(status)).filter(id => this.effects.has(id));
  if (!carriers.length || this.effects.has(getStaticID(statusId))) return wrapped(statusId, options);
  if (options.active) return true;
  await this.deleteEmbeddedDocuments("ActiveEffect", carriers);
  return false;
}

function calculateDamageAllTraits(this: Actor.Implementation, wrapped, damages, options: any = {}) {
  const perType = (value: unknown) => value instanceof Set && value.size > 0 && !value.has("ALL");
  // @ts-expect-error no dnd5e-types
  const traits = this.system.traits;
  const restore: [{ value: Set<string> }, Set<string>][] = [];
  for (const [category, key] of Object.entries(DAMAGE_TRAIT_KEYS)) {
    const trait = traits?.[key];
    if (!(trait?.value instanceof Set) || !trait.value.has("ALL")) continue;
    // Downgrades act on immunity, and through it on resistance.
    if (!perType(options.ignore?.[category]) && !(category !== "vulnerability" && perType(options.downgrade))) continue;
    restore.push([trait, trait.value]);
    trait.value = new Set([...trait.value, ...Object.keys(GameSystemConfig.damageTypes)].filter(t => t !== "ALL"));
  }
  try {
    return wrapped(damages, options);
  } finally {
    for (const [trait, value] of restore) trait.value = value;
  }
}

const BINDING_OPERATORS = new Set(["*", "/", "%"]);

/**
 * Place a term's critical extras as dnd5e 6 places its own: wrapped with the term when a *, / or % binds it,
 * otherwise inline carrying the term's sign.
 */
function placeCritical(terms: foundry.dice.terms.RollTerm[], term: foundry.dice.terms.RollTerm, extras: foundry.dice.terms.RollTerm[], index: number): foundry.dice.terms.RollTerm[] {
  const OperatorTerm = foundry.dice.terms.OperatorTerm;
  const prev = terms[index - 1], next = terms[index + 1];
  const bound = (t: foundry.dice.terms.RollTerm | undefined) => t instanceof OperatorTerm && BINDING_OPERATORS.has(t.operator);
  if (bound(prev) || bound(next)) {
    // The wrapper carries the damage type; dnd5e's chunkTerms does not look inside parentheticals.
    const options = foundry.utils.deepClone(term.options);
    const group: foundry.dice.terms.RollTerm[] = [term];
    for (const extra of extras) group.push(new OperatorTerm({ operator: "+" }), extra);
    for (const t of group) t.options.flavor = "";
    return [foundry.dice.terms.ParentheticalTerm.fromTerms(group, options)];
  }
  const sign = prev instanceof OperatorTerm ? prev.operator : "+";
  return [term, ...extras.flatMap(extra => [new OperatorTerm({ operator: sign }), extra])];
}

// @ts-expect-error no dnd5e-types
function configureDamage(this: CONFIG.Dice.DamageRoll, wrapped, options: any = { critical: {} }) {
  // dnd5e 6 applies critical scaling exactly once; the damage dialog rebuilds rolls rather than re-running this.
  if (this.options.configured) return;
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

  const extras = new Map<foundry.dice.terms.RollTerm, foundry.dice.terms.RollTerm[]>();
  const addExtra = (term: foundry.dice.terms.RollTerm, extra: foundry.dice.terms.RollTerm) => extras.set(term, [...(extras.get(term) ?? []), extra]);
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
          const newTerm = new Die({ number: term.number + cb, faces: term.faces })
          newTerm.modifiers.push(`x${term.faces}`);
          newTerm.options = foundry.utils.deepClone(term.options)
          //@ts-expect-error no dnd5e-types
          newTerm.options.criticalBonusDamage = true;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          addExtra(term, newTerm);
        }
        break;
      case "maxCrit":  // Powerful critical
      case "maxCritRoll":
        if (term instanceof DiceTerm) {
          let critTerm;
          if (getCriticalDamage() === "maxCrit")
            critTerm = new NumericTerm({ number: (term.number + cb) * (term.faces ?? 1) });
          else {
            critTerm = new Die({ number: term.number + cb, faces: term.faces });
            critTerm.modifiers = foundry.utils.deepClone(term.modifiers);
            critTerm.modifiers.push(`min${term.faces}`);
          }
          critTerm.options = foundry.utils.deepClone(term.options);
          critTerm.options.criticalBonusDamage = true;
          addExtra(term, critTerm);
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
          const newTerm = new Die({ number: term.number + cb, faces: term.faces })
          newTerm.modifiers.push(`x${term.faces}`);
          newTerm.options = foundry.utils.deepClone(term.options);
          //@ts-expect-error no dnd5e-types
          newTerm.options.criticalBonusDamage = true;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          addExtra(term, newTerm);
        }
        break;
      case "maxBaseRollCrit":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        if (term instanceof DiceTerm) {
          const newTerm = new Die({ number: term.number, faces: term.faces })
          newTerm.options = foundry.utils.deepClone(term.options);
          // @ts-expect-error no dnd5e-types
          newTerm.options.criticalBonusDamage = true;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          addExtra(term, newTerm);
        }
        break;
      case "baseDamage":
      default:
        break;
    }
  }
  if (extras.size) this.terms = this.terms.flatMap((term, i, terms) => extras.has(term) ? placeCritical(terms, term, extras.get(term)!, i) : [term]);
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

/** What differs between the d20 rolls midi wraps alike: saving throws, ability checks, skills and tools */
interface D20RollKind {
  rollType: "save" | "check" | "skill" | "tool";
  /** dnd5e's name in its preRoll<name> and post<name>RollConfiguration hooks */
  hook: "SavingThrow" | "AbilityCheck" | "Skill" | "Tool";
  idKey: "ability" | "skill" | "tool";
  choicesKey: "rollAbilities" | "rollSkills" | "rollTools";
  /** The same roll for another actor (a request card rolled for the actor it names) */
  rollAs: (actor: Actor.Implementation, config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => Promise<Roll[] | null>;
  blindSetting: () => string[];
  dsnType: string;
  /** Optional bonus category and detail; tools take their ability check's, with no fail bonuses */
  bonus: (id: string | undefined, config: RollProcessConfig & { ability?: string }) => { category: string, detail: string, failBonuses: boolean };
  /** expireRollEffect's roll type, when the roll ends special durations */
  expireType?: string;
  /** Record success against config.target on the rolls */
  successFromTarget?: boolean;
}

const D20_ROLL_KINDS: Record<D20RollKind["rollType"], D20RollKind> = {
  save: {
    rollType: "save", hook: "SavingThrow", idKey: "ability", choicesKey: "rollAbilities",
    // @ts-expect-error no dnd5e types
    rollAs: (actor, config, dialog, message) => actor.rollSavingThrow(config, dialog, message),
    blindSetting: () => configSettings.rollSavesBlind, dsnType: "save",
    bonus: id => ({ category: "save", detail: id ?? "", failBonuses: true }), expireType: "save"
  },
  check: {
    rollType: "check", hook: "AbilityCheck", idKey: "ability", choicesKey: "rollAbilities",
    // @ts-expect-error no dnd5e types
    rollAs: (actor, config, dialog, message) => actor.rollAbilityCheck(config, dialog, message),
    blindSetting: () => configSettings.rollChecksBlind, dsnType: "check",
    bonus: id => ({ category: "check", detail: id ?? "", failBonuses: true }), expireType: "check"
  },
  skill: {
    rollType: "skill", hook: "Skill", idKey: "skill", choicesKey: "rollSkills",
    // @ts-expect-error no dnd5e types
    rollAs: (actor, config, dialog, message) => actor.rollSkill(config, dialog, message),
    blindSetting: () => configSettings.rollSkillsBlind, dsnType: "skill",
    bonus: id => ({ category: "skill", detail: id ?? "", failBonuses: true }), expireType: "Skill", successFromTarget: true
  },
  tool: {
    rollType: "tool", hook: "Tool", idKey: "tool", choicesKey: "rollTools",
    // @ts-expect-error no dnd5e types
    rollAs: (actor, config, dialog, message) => actor.rollToolCheck(config, dialog, message),
    // Tools are ability checks
    blindSetting: () => configSettings.rollChecksBlind, dsnType: "toolCheck",
    bonus: (_id, config) => ({ category: "check", detail: config.ability ?? "", failBonuses: false })
  }
};

/**
 * midi's handling of a save, ability check, skill or tool roll: advantage and fail/success from its flags (or as passed
 * by another module), a choice of several abilities/skills/tools, request cards, blind rolls, 3D dice, optional
 * bonuses, the chat message and special durations.
 */
async function doD20Roll(this: Actor.Implementation, wrapped, kind: D20RollKind, config: RollProcessConfig & { ability?: string, skill?: string, tool?: string } = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  const isAbility = kind.rollType === "save" || kind.rollType === "check";
  if (isAbility && config.midiOptions?.target) config.target = config.midiOptions.target;
  if (isAbility && config.midiOptions?.isConcentrationCheck) {
    foundry.utils.setProperty(message, "data.flags.midi-qol.isConcentrationCheck", true);
    config.midiOptions.isConcentrationCheck = false; // remove the isConcentrationCheck option so we won't infinitely recurse
    // @ts-expect-error no dnd5e-types
    return this.rollConcentration(config, dialog, message);
  }
  message.data ??= {};
  config.midiOptions ??= {};
  let rollId = config[kind.idKey];
  const rollIds: string[] = config.midiOptions[kind.choicesKey] ?? (rollId ? [rollId] : []);
  let overtimeActorUuid: string | undefined;
  let preRollHookId: number | undefined;
  let postRollHookId: number | undefined;
  const savedMessageMode: keyof CONFIG.Dice.RollModes = safeGetGameSetting("core", "messageMode");
  let result: Roll[] | undefined;
  try {
    if (rollIds.length === 0 && kind.rollType !== "check")
      throw new Error(`midi-qol | ${kind.hook} roll with nothing to roll for ${this.name}`);
    if (config.event) {
      // A request card (concentration, over time) rolled by someone else: roll for the actor it names
      const request = overtimeRequestOf(config.event);
      if (request.actorUuid) {
        overtimeActorUuid = request.actorUuid;
        message.rollMode = (request.rollMode as keyof CONFIG.Dice.RollModes | undefined) ?? message.rollMode;
      }
      if (overtimeActorUuid && this.uuid !== overtimeActorUuid) {
        const actualActor = fromUuidSync(overtimeActorUuid) as Actor.Implementation | undefined;
        if (actualActor) return kind.rollAs(actualActor, config, dialog, message);
      }
    }

    if (isAbility && config.target !== undefined && !checkRule("criticalSaves")) { // checking for success, not criticals
      config.midiOptions.critical = 21;
      config.midiOptions.fumble = 0;
    }

    // Advantage passed in (another module's roll, or midi's own hand-off) replaces midi's evaluation
    const sourceInfo = getAdvantageSourceInfo(config);
    let hasPreComputedAdvantage = false;
    if (!config.midiOptions.recomputeAdvantage) {
      hasPreComputedAdvantage = applyPreComputedAdvantage(config);
      if (hasPreComputedAdvantage && isAutoFastForward(kind.rollType)) config.midiOptions.fastForward = true;
    }
    if (!config.midiOptions.workflow && config.midiOptions.workflowId) {
      config.midiOptions.workflow = Workflow.findWorkflow(config.midiOptions.workflowId);
    }
    if (dialog.configure === undefined && config.midiOptions.fastForward) dialog.configure = false;

    let success: boolean | undefined;
    const saveCreate = message.create;
    message.create = false;
    const originatingCardId = linkRollToCard(message, config.midiOptions);
    const midiOptions = config.midiOptions;

    // Trackers per choice: passed from the workflow (via GMAction), none for another module's roll, else computed
    const passedMap = config.midiOptions.advantageByChoice as Record<string, PreComputedAdvantage> | undefined;
    const hasPassedMap = !!passedMap && Object.values(passedMap).some(v => v.tracker instanceof RollModifierTracker);
    // Concentration saves use the "concentration" roll type which composes with "save"
    const advantageType = kind.rollType === "save" && config.hookNames?.includes("concentration") ? "concentration" : kind.rollType;
    // A check activity's skills and tools each roll with their own ability
    const abilityFor = isAbility ? undefined : checkActivityAbilities(rollActivity(config.midiOptions), this);
    const advantageMap: Record<string, PreComputedAdvantage> = sourceInfo.isExternalModule ? {}
      : hasPassedMap ? passedMap! : await buildPreComputedAdvantageMap(this, advantageType, rollIds, config.midiOptions, isAbility ? undefined : abilityFor ?? config.ability);

    let userExplicitChoice: string | undefined;
    const { hasMultiple } = setupChoiceDialog(this, config, dialog, kind.idKey, rollIds, advantageMap, hasPreComputedAdvantage,
      kind.rollType, choice => { userExplicitChoice = choice; }, abilityFor);
    const chosenAbility = abilityFor?.(config[kind.idKey] ?? "");
    if (chosenAbility) config.ability = chosenAbility;

    preRollHookId = Hooks.once(`dnd5e.preRoll${kind.hook}`, (configData, dialogData) => {
      configData.midiOptions = { ...(configData.midiOptions ?? {}), ...(midiOptions ?? {}) };
      const choices = Object.values(advantageMap);
      const allAutoFail = choices.length > 0 && choices.every(d => d.tracker instanceof RollModifierTracker && d.tracker.modifiers.willFail);
      if (hasMultiple && !allAutoFail && dialogData.configure !== false) {
        dialogData.configure = true;
      } else {
        const chosen = advantageMap[configData[kind.idKey] ?? rollId ?? ""];
        if (chosen) {
          if (!hasPreComputedAdvantage) {
            if (chosen.tracker instanceof RollModifierTracker) applyTrackerAdvantage(configData, chosen.tracker);
            else {
              configData.advantage = chosen.hasAdvantage;
              configData.disadvantage = chosen.hasDisadvantage;
            }
          }
          if (chosen.tracker instanceof RollModifierTracker && applyRollModifiers(chosen.tracker, configData, dialogData).autoFail) success = false;
        }
      }
      setRollDialogOptions(configData, dialogData, kind.rollType);
    });

    let dialogShown = false;
    postRollHookId = Hooks.once(`dnd5e.post${kind.hook}RollConfiguration`, (rolls, configData, dialogData, messageDetails) => {
      // record the configured message data for later display
      message = messageDetails;
      dialogShown = !!dialogData.configure;
      // The choice made in the dialog
      if (configData[kind.idKey] && configData[kind.idKey] !== rollId) rollId = configData[kind.idKey];
      const tracker = advantageMap[rollId ?? ""]?.tracker;
      if (tracker instanceof RollModifierTracker) {
        if (tracker.modifiers.willFail) success = false;
        else if (tracker.modifiers.willSucceed) success = true;
      }
      messageDetails.rollMode = applyBlindRollMode(kind.blindSetting(), rollId, messageDetails.rollMode, messageDetails);
      return true;
    });

    if (this.token) foundry.utils.setProperty(dialog, "options.window.subtitle", this.token.name);
    result = await wrapped(config, dialog, message);
    message.create = saveCreate;
    if (!result) return result;
    if (result instanceof Roll) result = [result];
    const rollMode: keyof CONFIG.Dice.RollModes = message.rollMode ?? safeGetGameSetting("core", "messageMode");
    // @ts-expect-error
    result.forEach(r => r.options.rollMode = rollMode);
    // Saves and checks ghost their 3D dice by the effective save display (an activity's own overrides the setting).
    // When obscuring, keep the 3D dice animation private so it can't reveal the hidden result to players
    const dsnRollMode = foundry.utils.getProperty(message, "data.flags.midi-qol.obscureRoll") ? "blind" : rollMode;
    await displayDSNForRoll(result, kind.dsnType, dsnRollMode, isAbility ? saveDisplayMode() : undefined, this);
    DSNMarkDiceDisplayed(result);
    foundry.utils.mergeObject(message.data, { "flags": config.flags ?? {} });
    // Set overtimeActorUuid AFTER message object is replaced by hook and merged
    if (overtimeActorUuid) foundry.utils.setProperty(message.data, "flags.midi-qol.overtimeActorUuid", overtimeActorUuid);
    if (!config.midiOptions.simulate && !config.simulate) {
      const bonus = kind.bonus(rollId, config);
      result[0] = await bonusCheck(this, result[0], bonus.category, bonus.detail, message.data);
      DSNMarkDiceDisplayed(result);
      // @ts-expect-error no dnd5e-types
      if (bonus.failBonuses && Number.isNumeric(result[0].options.target) && result[0].isSuccess === false) {
        // A failed roll with optional fail bonuses (flags.midi-qol.optional.NAME.<type>.fail) offers them
        const hasSpecific = collectBonusFlags(this, kind.rollType, `fail.${rollId}`).length > 0;
        if (hasSpecific || collectBonusFlags(this, kind.rollType, "fail.all").length) {
          result[0] = await bonusCheck(this, result[0], kind.rollType, hasSpecific ? `fail.${rollId}` : "fail.all", message.data);
          DSNMarkDiceDisplayed(result);
        }
      }
    }
    const chosenTracker = advantageMap[rollId ?? ""]?.tracker;
    if (chosenTracker instanceof RollModifierTracker) chosenTracker.reconcileWithRoll(result[0]?.options?.advantageMode, dialogShown);
    if (kind.successFromTarget && config.target !== undefined && success === undefined) {
      success = result.reduce((acc, r) => acc + (r.total ?? 0), 0) >= config.target;
      // @ts-expect-error success is a custom roll option
      result.forEach(r => r.options.success = success);
    }

    // Stamp the chosen ability/skill/tool on the rolls (after bonusCheck) so the save display can show it.
    // userExplicitChoice is set by buildConfig wrapper when user changes dropdown; config's is the auto-selected best
    const chosenId = userExplicitChoice ?? config[kind.idKey];
    //@ts-expect-error midiChosenId is a custom roll option
    if (hasMultiple) result.forEach(r => { if (r?.options) r.options.midiChosenId = chosenId; });

    // Set originatingMessage on roll options so modules can access it without .parent
    const rollOriginatingId = foundry.utils.getProperty(message, "data.system.origin") as string | undefined ?? originatingCardId;
    //@ts-expect-error originatingMessage is a custom roll option
    if (rollOriginatingId) result.forEach(r => { if (r?.options) r.options.originatingMessage = rollOriginatingId; });

    if (message.create !== false && foundry.utils.getProperty(result, "flags.midi-qol.chatMessageShown") !== true) {
      const messageData: any = foundry.utils.mergeObject({ sound: CONFIG.sounds.dice }, message.data ?? {});
      messageData.speaker = ChatMessage.getSpeaker({ actor: this, token: this.token ?? undefined });
      messageData.rolls = [...result];
      const chatMsg = await ChatMessage.create(messageData, { messageMode: rollMode });
      // dnd5e sets roll.parent in buildPost; replicate here since we bypass buildPost
      if (chatMsg) result.forEach(r => (r as any).parent = chatMsg);
    }
    // Outside a workflow the roll's own DC decides success; a workflow decides it for its targets (cover, bonuses).
    // A save from midi's card carries its requestId; the workflow may be on another client.
    const inWorkflow = !!(config.midiOptions.workflowId || config.midiOptions.workflow || config.midiOptions.saveActivityUuid || config.workflow || foundry.utils.getProperty(message, "flags.midi-qol.requestId")) || awaitedByWorkflow(this);
    const concentration = !!config.hookNames?.includes("concentration");
    // @ts-expect-error no dnd5e-types
    if (success === undefined && (!inWorkflow || concentration)) success = result[0]?.isSuccess;
    if (rollId && kind.expireType) await expireRollEffect.bind(this)(kind.expireType, rollId, success);
    // Concentration saves arrive as rollType "save" with "concentration" in hookNames (see advantageType).
    // Pass the bare "ConcentrationSave" so expireRollEffect matches is/isConcentrationSaveSuccess/Failure.
    if (concentration) await expireRollEffect.bind(this)("ConcentrationSave", "", success);
    return result;
  } catch (err) {
    const errorMessage = `midi-qol | ${kind.hook} roll error ${this.name} ${rollId} ${this.uuid}`;
    TroubleShooter.recordError(err, errorMessage);
    error(errorMessage, err);
    throw err;
  } finally {
    if (preRollHookId) Hooks.off(`dnd5e.preRoll${kind.hook}`, preRollHookId);
    if (postRollHookId) Hooks.off(`dnd5e.post${kind.hook}RollConfiguration`, postRollHookId);
    if (savedMessageMode) safeSetGameSetting("core", "messageMode", savedMessageMode);
  }
}
export async function rollSavingThrow(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  // Death saves are handled by the rollDeathSave wrapper
  // Death saves have hookNames: ["deathSave"] and no ability
  if (config.hookNames?.includes("deathSave")) {
    return wrapped(config, dialog, message);
  }
  return doD20Roll.call(this, wrapped, D20_ROLL_KINDS.save, config, dialog, message);
}

async function rollAbilityCheck(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  return doD20Roll.call(this, wrapped, D20_ROLL_KINDS.check, config, dialog, message);
}

async function rollSkill(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  return doD20Roll.call(this, wrapped, D20_ROLL_KINDS.skill, config, dialog, message);
}

export async function rollToolCheck(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  return doD20Roll.call(this, wrapped, D20_ROLL_KINDS.tool, config, dialog, message);
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
  // Advantage, and in the pre-roll hook fail/success, on one tracker
  const rollModifierTracker = new RollModifierTracker();
  if (!hasPreComputedAdvantage) {
    // Build death save advantage/disadvantage flags
    const advantageFlags: AdvantageFlags = {
      advantageFlags: ["advantage.all", "advantage.deathSave"],
      disadvantageFlags: ["disadvantage.all", "disadvantage.deathSave"],
      // Actor noAdvantage/noDisadvantage flags (prevent actor's own advantage/disadvantage)
      noAdvantageFlags: ["noAdvantage.all", "noAdvantage.deathSave"],
      noDisadvantageFlags: ["noDisadvantage.all", "noDisadvantage.deathSave"],
      systemRollModeFields: ["attributes.death.roll.mode"],
      systemRules: { category: "save", rollData: { ...this.getRollData(), roll: { type: "death" } } }
    };

    // Process advantage/disadvantage flags using centralized helper
    // For death saves, the grants actor is the caster (if any workflow exists)
    await computeAdvantageFlags(this, advantageFlags, {
      ...config.midiOptions,
      grantsActor: config.midiOptions.workflow?.actor
    }, rollModifierTracker);
    applyTrackerAdvantage(config, rollModifierTracker);
  }

  let advantage = config.advantage;
  let disadvantage = config.disadvantage;

  const options: MidiOptions = {};
  if (advantage !== undefined) options.advantage = advantage;
  if (disadvantage !== undefined) options.disadvantage = disadvantage;

  // Only reached when set on the actor directly; effects are mapped by DAE to system.attributes.death.roll.bonus. Remove in 14.6.10.
  if (deathSaveBonus) {
    foundry.utils.logCompatibilityWarning(
      "midi-qol | flags.midi-qol.deathSaveBonus is deprecated; use system.attributes.death.roll.bonus. Setting it on an actor directly stops working in 14.6.10.",
      { once: true });
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
  const blindSaveRoll = configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes("death");
  const actor = this;

  const preRollHookId = Hooks.once("dnd5e.preRollDeathSave", (configData, dialogData, messageData) => {
    // Merge midiOptions to ensure advantage/disadvantage and other values are preserved
    configData.midiOptions = { ...(configData.midiOptions ?? {}), ...(config.midiOptions ?? {}) };

    // Set advantage/disadvantage on configData so dnd5e rolls 2 dice when appropriate
    if (advantage !== undefined) configData.advantage = advantage;
    if (disadvantage !== undefined) configData.disadvantage = disadvantage;

    // Apply roll modifiers (auto-fail/auto-success) for death saves
    const modifierFlags: RollModifierFlags = {
      failFlags: ["fail.all"],
      successFlags: ["success.all"],
      maxFlags: [],
      minFlags: [],
      fieldPaths: ["attributes.death.roll"]
    };
    computeRollModifiers(actor, modifierFlags, rollModifierTracker);
    const modifiers = applyRollModifiers(rollModifierTracker, configData, dialogData, { failValue: 2, successValue: 19 });
    const { autoFail, autoSuccess } = modifiers;

    for (let roll of configData.rolls ?? []) {
      roll.options ??= {};
      if (advantage !== undefined) roll.options.advantage = advantage;
      if (disadvantage !== undefined) roll.options.disadvantage = disadvantage;
      if (!autoFail && !autoSuccess && configData.midiOptions?.parts?.length) roll.parts = [...(roll.parts ?? []), ...configData.midiOptions.parts];
      if (blindSaveRoll) roll.options.rollMode = "blind" as keyof CONFIG.Dice.RollModes;
    }
    setRollDialogOptions(configData, dialogData, "save");
    if (blindSaveRoll) messageData.rollMode = "blind" as keyof CONFIG.Dice.RollModes;
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
  if (chatString === "DND5E.DeathSaveFailure") applyFailedDeathSaves(actor);
}

/** Three failed death saves (rolled, or from damage at 0 HP): midi's dead status replaces unconscious. */
export async function applyFailedDeathSaves(actor: Actor.Implementation) {
  if (hasCondition(actor, "unconscious")) {
    const _id = CONFIG.statusEffects.find(e => e.id === "unconscious")?._id;
    const effect = actor.effects.find(e => e._id === _id);
    if (effect) await effect.setFlag("core", "overlay", false);
  }
  const status = getDeadStatus();
  if (!status) return;
  await setDeadStatus(actor, { effect: status, useDefeated: true, makeDead: true, overlay: true });
}

/** Undoes applyFailedDeathSaves: the dead status goes and midi's usual 0 HP handling (unconscious) applies again. */
export async function revertFailedDeathSaves(actor: Actor.Implementation) {
  const status = getDeadStatus();
  if (status) await setDeadStatus(actor, { effect: status, useDefeated: true, makeDead: false });
  await getActorWoundedSemaphore(actor.uuid).add(() => processWoundedStatus(actor));
}

export async function computeAbilityAdvantage(actor: Actor.Implementation, rollType: string, abilityId: string, options: MidiOptions, tracker?: RollModifierTracker, rollKind = "ability"): Promise<{ tracker: RollModifierTracker, magicResistance: boolean, magicVulnerability: boolean }> {
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
    systemRollModeFields: [`abilities.${abilityId}.${rollType}.roll.mode`, `rolls.ability.${rollType}.mode`],
    systemRules: {
      category: rollType as "save" | "check",
      rollData: { ...actor.getRollData(), roll: { ability: abilityId, type: rollKind,
        // @ts-expect-error no dnd5e-types
        proficient: actor.system.abilities?.[abilityId]?.[rollType]?.prof?.multiplier >= 1 } }
    }
  };

  // A concentration save also takes the concentration flags and roll mode
  if (rollKind === "concentration") {
    abilityFlags.advantageFlags.push("advantage.concentration");
    abilityFlags.disadvantageFlags.push("disadvantage.concentration");
    abilityFlags.noAdvantageFlags?.push("noAdvantage.concentration");
    abilityFlags.noDisadvantageFlags?.push("noDisadvantage.concentration");
    abilityFlags.systemRollModeFields.push("attributes.concentration.roll.mode");
  }

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
  computeAdvantage: (actor: Actor.Implementation, id: string, options: MidiOptions, ability?: string) => Promise<RollModifierTracker>;
  getModifierFlags: (actor: Actor.Implementation, id: string, options?: MidiOptions, ability?: string) => RollModifierFlags;
}

/**
 * The ability a check activity rolls each of its skills or tools with, as dnd5e's check buttons do (the activity's own,
 * else the skill's or tool's), with "spellcasting" resolved for the actor.
 */
export function checkActivityAbilities(activity: Activity | undefined, actor: Actor.Implementation | undefined | null): ((id: string) => string | undefined) | undefined {
  if (!activity?.check || typeof activity.getAbility !== "function") return undefined;
  return id => {
    const ability = activity.getAbility?.(id) || undefined;
    // @ts-expect-error no dnd5e-types
    return ability === "spellcasting" ? actor?.system.attributes?.spellcasting || undefined : ability;
  };
}

/** The activity a roll was made for: the workflow's, else from its uuid */
function rollActivity(midiOptions: MidiOptions): Activity | undefined {
  const uuid = midiOptions.saveActivityUuid;
  if (!uuid) return undefined;
  const workflowActivity = midiOptions.workflow?.saveActivity;
  if (workflowActivity?.uuid === uuid) return workflowActivity;
  return fromUuidSync(uuid, { strict: false }) as Activity | undefined;
}

/** The ability a skill or tool check is rolled with: the one asked for, else its default. */
function skillToolAbility(actor: Actor.Implementation, type: "skill" | "tool", id: string, ability?: string): string {
  if (ability) return ability;
  // @ts-expect-error no dnd5e-types
  if (type === "skill") return actor.system?.skills?.[id]?.ability ?? GameSystemConfig.skills[id]?.ability ?? "";
  // @ts-expect-error no dnd5e-types
  return actor.system?.tools?.[id]?.ability || GameSystemConfig.tools[id]?.ability || "";
}

const rollTypeHandlers: Record<string, RollTypeHandler> = {
  save: {
    computeAdvantage: async (actor, id, options) => {
      const result = await computeAbilityAdvantage(actor, "save", id, options);
      return result.tracker;
    },
    getModifierFlags: (_actor, id, options) => {
      const flags: RollModifierFlags = {
        failFlags: ["fail.all", "fail.ability.all"],
        successFlags: ["success.all", "success.ability.all"],
        maxFlags: [],
        minFlags: [],
        fieldPaths: [`abilities.${id}.save.roll`, "rolls.ability.save"]
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
      failFlags: ["fail.all", "fail.ability.all"],
      successFlags: ["success.all", "success.ability.all"],
      maxFlags: [],
      minFlags: [],
      fieldPaths: [`abilities.${id}.check.roll`, "rolls.ability.check"]
    })
  },
  skill: {
    computeAdvantage: async (actor, id, options, ability) => {
      return computeSkillAdvantage(actor, id, options, undefined, ability);
    },
    getModifierFlags: (actor, id, _options, ability) => {
      const abilityId = skillToolAbility(actor, "skill", id, ability);
      const flags: RollModifierFlags = {
        failFlags: ["fail.all", "fail.ability.all"],
        successFlags: ["success.all", "success.ability.all"],
        maxFlags: [],
        minFlags: [],
        fieldPaths: ["rolls.ability.check", "rolls.ability.skill", `skills.${id}.roll`]
      };
      // As dnd5e does, the ability's check settings apply to the skill
      if (abilityId) flags.fieldPaths!.unshift(`abilities.${abilityId}.check.roll`);
      return flags;
    }
  },
  tool: {
    computeAdvantage: async (actor, id, options, ability) => {
      return computeToolAdvantage(actor, id, skillToolAbility(actor, "tool", id, ability), options);
    },
    getModifierFlags: (actor, id, _options, ability) => {
      const abilityId = skillToolAbility(actor, "tool", id, ability);
      const flags: RollModifierFlags = {
        failFlags: ["fail.all", "fail.ability.all"],
        successFlags: ["success.all", "success.ability.all"],
        maxFlags: [],
        minFlags: [],
        fieldPaths: ["rolls.ability.check", "rolls.ability.tool", `tools.${id}.roll`]
      };
      // As dnd5e does, the ability's check settings apply to the tool
      if (abilityId) flags.fieldPaths!.unshift(`abilities.${abilityId}.check.roll`);
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
      const saveResult = await computeAbilityAdvantage(actor, "save", abilityId, options, undefined, "concentration");
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
        failFlags: saveModifiers.failFlags,
        successFlags: saveModifiers.successFlags,
        maxFlags: [],
        minFlags: [],
        fieldPaths: [...(saveModifiers.fieldPaths ?? []), "attributes.concentration.roll"]
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
 * Used by Workflow.ts (checkSaves) and doD20Roll when no pre-computed map is passed.
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
  options: MidiOptions,
  ability?: string | ((id: string) => string | undefined)
): Promise<Record<string, PreComputedAdvantage>> {
  const result: Record<string, PreComputedAdvantage> = {};
  const workflow = options.workflow;

  const handler = rollTypeHandlers[rollType];
  if (!handler) {
    console.warn(`midi-qol | buildPreComputedAdvantageMap: Unknown rollType "${rollType}"`);
    return result;
  }

  for (const id of rollIds) {
    const idAbility = typeof ability === "function" ? ability(id) : ability;
    // Compute advantage/disadvantage with attribution tracking
    const tracker = await handler.computeAdvantage(actor, id, options, idAbility);

    // Add roll modifiers (fail/success/max/min) to the same tracker
    const modifierFlags = handler.getModifierFlags(actor, id, options, idAbility);
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

export async function computeSkillAdvantage(actor: Actor.Implementation, skillId: string, options: MidiOptions, tracker?: RollModifierTracker, ability?: string): Promise<RollModifierTracker> {
  const abilityId = skillToolAbility(actor, "skill", skillId, ability);

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
    systemRollModeFields: [`skills.${skillId}.roll.mode`, `abilities.${abilityId}.check.roll.mode`, "rolls.ability.check.mode", "rolls.ability.skill.mode"],
    systemRules: {
      category: "check",
      rollData: { ...actor.getRollData(), roll: { ability: abilityId, skill: skillId, type: "skill",
        // @ts-expect-error no dnd5e-types
        proficient: !!actor.system.skills && dnd5e.dataModels.actor.CommonTemplate.calculateSkillToolProficiency(actor, abilityId, { skill: skillId }).multiplier >= 1 } }
    },
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

    // As dnd5e does, the ability's check advantage applies to the skill
    skillFlags.advantageFlags.push("advantage.ability.all", "advantage.check.all", `advantage.check.${abilityId}`);
    skillFlags.disadvantageFlags.push("disadvantage.ability.all", "disadvantage.check.all", `disadvantage.check.${abilityId}`);
    skillFlags.noAdvantageFlags?.push("noAdvantage.check.all", `noAdvantage.check.${abilityId}`);
    skillFlags.noDisadvantageFlags?.push("noDisadvantage.check.all", `noDisadvantage.check.${abilityId}`);
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
    systemRollModeFields: [`tools.${toolId}.roll.mode`, `abilities.${abilityId}.check.roll.mode`, "rolls.ability.check.mode", "rolls.ability.tool.mode"],
    systemRules: {
      category: "check",
      rollData: { ...actor.getRollData(), roll: { ability: abilityId, tool: toolId, type: "tool",
        // @ts-expect-error no dnd5e-types
        proficient: !!actor.system.tools && dnd5e.dataModels.actor.CommonTemplate.calculateSkillToolProficiency(actor, abilityId, { tool: toolId }).multiplier >= 1 } }
    },
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

/**
 * midi's part in dnd5e's template placement. dnd5e's `_place` builds the region data and calls
 * `placeRegions`; midi supplies the two callbacks dnd5e does not use for that call — `onMove`, to
 * snap by `templateSnapping`, clamp to range and anchor cones/rays to the caster (returning `false`
 * so midi's position wins), and `onChange`, for live targeting by the activity's own settings.
 */
async function midiTemplatePlace(this: any, wrapped: () => Promise<any>) {
  const regions = canvas?.regions as unknown as { placeRegions: (data: object[], options?: object) => Promise<unknown> } | undefined;
  if (!regions) return wrapped();
  const activity = this.config?.activity ?? this.config?.midiActivity;
  const sourceToken = activity?.actor ? tokenForActor(activity.actor) : undefined;
  const maxRange = configSettings.constrainTemplatePlacement ? this.config?.midiMaxRange : undefined;
  const anchorToToken = this.config?.midiAnchorToToken;
  const cubeAgainstToken = this.config?.midiCubeAgainstToken;

  const onMove = ({ shape, position, snap }: any) => {
    // dnd5e places emanations with attachToToken; handling the move here would stop core attaching them.
    if (shape.type === "emanation") return;
    const place = (point: { x: number, y: number }) => snap ? snapTemplatePosition(point) : point;
    if (cubeAgainstToken && sourceToken && shape.type === "rectangle") {
      if (shape.rotation) shape.rotate(-shape.rotation);
      shape.move(cubeBesideToken(sourceToken, position, shape.width, shape.height, snap), { snap: false });
    } else if (anchorToToken && sourceToken) {
      const border = getTokenBorderPoint(sourceToken, position.x, position.y);
      shape.move(place(border), { snap: false });
      const direction = Math.toDegrees(Math.atan2(position.y - border.y, position.x - border.x));
      shape.rotate(direction - (shape.rotation ?? 0));
    } else if (maxRange && sourceToken) {
      shape.move(place(clampPointToRange(sourceToken, position.x, position.y, maxRange)), { snap: false });
    } else {
      shape.move(place(position), { snap: false });
    }
    return false;
  };
  const onChange = ({ document }: any) => {
    const tokens = computeActivityTemplateTargets(activity, [document]);
    if (tokens) updateUserTargets(tokens.map(t => t.id).filter(Boolean) as string[]);
  };
  const placeRegions = regions.placeRegions;
  const hadOwn = Object.hasOwn(regions, "placeRegions");
  regions.placeRegions = (data, options = {}) => placeRegions.call(regions, data, { ...options, onMove, onChange });
  try {
    return await wrapped();
  } finally {
    if (hadOwn) regions.placeRegions = placeRegions;
    else delete (regions as Partial<typeof regions>).placeRegions;
  }
}

/**
 * The top-left corner of a `width` x `height` cube against the side of the token's space nearest `position`, slid along
 * that side to follow the pointer while touching the space by at least a grid square (snapped to the grid if `snap`).
 */
function cubeBesideToken(token: Token.Implementation, position: { x: number, y: number }, width: number, height: number, snap: boolean): { x: number, y: number } {
  const { x: left, y: top, width: w, height: h } = token.bounds;
  const dx = position.x - (left + w / 2);
  const dy = position.y - (top + h / 2);
  const cell = canvas?.grid && !canvas.grid.isGridless ? canvas.grid.size : 1;
  const along = (pointer: number, size: number, start: number, length: number) => {
    let value = Math.min(Math.max(pointer - size / 2, start - size + cell), start + length - cell);
    if (snap && cell > 1) value = start + Math.round((value - start) / cell) * cell;
    return value;
  };
  if (Math.abs(dx) * h >= Math.abs(dy) * w) return { x: dx >= 0 ? left + w : left - width, y: along(position.y, height, top, h) };
  return { x: along(position.x, width, left, w), y: dy >= 0 ? top + h : top - height };
}

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
 * The sourceTokenUuid is set by midiTemplateFlags when the template is created.
 * @returns The token, or undefined if not found
 */
export function getTemplateSourceToken(templateDoc: MeasuredTemplateDocument.Implementation): Token.Implementation | undefined {
  const midiFlags = templateDoc.flags?.[MODULE_ID] as any;
  const sourceTokenUuid = midiFlags?.sourceTokenUuid as string | undefined;
  if (!sourceTokenUuid) return undefined;

  const tokenDoc = fromUuidSync(sourceTokenUuid) as TokenDocument.Implementation | null;
  return tokenDoc?.object ?? undefined;
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
  // Fixes issue https://gitlab.com/tposney/midi-qol/-/issues/1548: Activity Visibility "Level Limit" ignored when midi-qol is enabled
  if (ctx.activities) {
    // ctx.activities holds the sheet's prepared context objects, not Activity documents, so the
    // flag has to be read back off the item - filtering on a.midiProperties never matched anything.
    ctx.activities = ctx.activities.filter((a: { _id: string }) =>
      !item.system.activities?.get(a._id)?.midiProperties?.automationOnly);
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
    processTraits(this);
  } catch (err) {
    TroubleShooter.recordError(err, `actor prepare data ${this?.name}`);
  }
  // Outside the try: an error in midi's own steps must not stop the actor being prepared.
  wrapped();
  prepareOnUseMacroData(this);
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
  wrapped();
  prepareOnUseMacroData(this);
}

export function prepareOnUseMacroData(actorOrItem: Actor.Implementation | Item.Implementation) {
  try {
    const macros = actorOrItem.flags?.[MODULE_ID]?.onUseMacroName;
    const parts = new OnUseMacros(macros ?? null);
    // An item with a macro and no onUse macros runs its macro after active effects (a blank name; see OnUseMacros.withDefaults)
    if (actorOrItem instanceof Item && parts.items.length === 0 && OnUseMacros.hasOwnMacro(actorOrItem))
      parts.items.push(new OnUseMacro("[postActiveEffects]"));
    foundry.utils.setProperty(actorOrItem, "flags.midi-qol.onUseMacroParts", parts);
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
      if (isEffectExpired(ef)) return false;
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
      await toggleStatus(actor, "unconscious", { active: false });
    }
  }

  // toggleStatusEffect handles both cases gracefully:
  // - active: true when already exists → returns true, no error
  // - active: false when doesn't exist → returns undefined, no error
  const result = await toggleStatus(actor, effect.id, { overlay: (configSettings.addDead === "overlay") || options.overlay, active: makeDead });

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
        // The markers carry specialDuration combatEnd, which DAE expires; forcing a delete here as well
        // raced it. The flag safety net in removeReactionUsed still runs.
        if (hasUsedReaction(combatant.actor)) await removeReactionUsed(combatant.actor);
        if (hasUsedBonusAction(combatant.actor)) await removeBonusActionUsed(combatant.actor);
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
  const { chooseActivity } = config;
  // @ts-expect-error no dnd5e-types
  // Filter usable activities: exclude riders, automationOnly, inProgress, and activities that fail visibility checks (canUse)
  const activities = this.system.activities?.filter(a =>
    a.canUse !== false &&
    !a.isRider &&
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
  const keys = heldKeys(config.event);
  if (keys.normal || keys.advantage || keys.disadvantage) {
    const attackActivity = attackActivities[0];
    if (attackActivity) return await attackActivity.use(config, dialog, message);
    else return await activities?.[0]?.use(config, dialog, message);
  }
  if (activities?.length) {
    // Apply the module prune hook (midi-qol.itemUseActivitySelect) before deciding: create() skips
    // the dialog for a single survivor and returns null (skip the roll) if modules removed them all.
    const activity = await MidiActivityChoiceDialog.create(this, { chooseActivity });
    return await activity?.use(config, dialog, message);
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

// dnd5e resolves dependentOn with fromUuidSync during item preparation. For an item on an unlinked token that goes back
// through the token's lazy delta while it is being built (Foundry 14.369) and recurses, so resolve UUIDs inside the
// item's own token actor from the actor.
function itemDependentOrigin(this: Item.Implementation, wrapped) {
  const uuid = this.flags.dnd5e?.dependentOn;
  const actor = this.actor;
  if (uuid && actor?.isToken) {
    const resolved = foundry.utils.parseUuid(uuid, { relative: this })?.uuid;
    if (resolved?.startsWith(`${actor.uuid}.`)) return actorEmbeddedByPath(actor, resolved.slice(actor.uuid.length + 1)) ?? null;
  }
  return wrapped();
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
  return wrapped(items, revisedFilters).filter(item => {
    if (item.getFlag("dnd5e", "cachedFor")) return false; // proxy for a cast activity
    return item.system.activities?.some(activity =>
      (activity.effectiveActivationType ?? activity.activation?.type)?.includes("reaction"));
  });
};