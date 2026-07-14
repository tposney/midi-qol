import { warn, error, debug, i18n, debugEnabled, overTimeEffectsToDelete, savedOverTimeEffectsToDelete, log, gameStats, GameSystemConfig, MODULE_ID } from "../midi-qol.js";
import { colorChatMessageHandler, nsaMessageHandler, hideStuffHandler, hideRollUpdate, hideRollRender, processCreateDDBGLMessages, ddbglPendingHook, checkOverTimeSaves } from "./chatMessageHandling.js";
import { preferredActiveGM, processUndoDamageCard } from "./GMAction.js";
import { untargetDeadTokens, untargetAllTokens, midiCustomEffect, removeReactionUsed, removeBonusActionUsed, chackFlanking as checkFlanking, expireRollEffect, removeActionUsed, expirePerTurnBonusActions, getCachedDocument, getUpdatesCache, clearUpdatesCache, expireEffects, createConditionData, processConcentrationRequestMessage, evalAllConditions, doConcentrationCheck, _processOverTime, getCEEffectByName, setRollMaxDiceTerm, setRollMinDiceTerm, _processActivityOverTime, completeActivityUse, isAutoFastForward, areMidiKeysPressed, throttledScrollBottom, getVitalityItem, tokenForActor, resolveItemMacro, resolveActivityMacro, resolveDAEItemData, doSyncRoll, getTokenPerimeterPolygon, closestPointOnPerimeter, measurePointDistance, getActivityAutoTargetAction, getAoETargetType, updateFlankingHighlight, onUserManualTarget, rangeToSceneUnits } from "./utils.js";
import { checkMechanic, checkRule, configSettings, dragDropTargeting, isDnd5e53, setDnd5e53 } from "./settings.js";
import { checkWounded, checkDeleteTemplate, preUpdateItemActorOnUseMacro, zeroHPExpiry, deathSaveHook, getTemplateSourceToken } from "./patching.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { Workflow } from "./Workflow.js";
import { ActorOnUseMacrosConfig } from "./apps/ActorOnUseMacroConfig.js";
import { installedModules } from "./setupModules.js";
import { preActivityConsumptionHook, activityConsumptionHook, selectTargetsFromTemplates, isAoETargetable } from "./activities/activityHelpers.js";
import { ItemOnUseMacrosConfig } from "./apps/ItemOnUseMacrosConfig.js";
import { Activity, DamageApplicationOptions, DamageDescription } from "../globals.js";
import { MidiDependentsRegistry } from "./lib/MidiDependentsRegistry.js";

export const concentrationCheckItemName = "Concentration Check - Midi QOL";
export var concentrationCheckItemDisplayName = "Concentration Check";

export let readyHooks = async () => {
  // Handle removing effects when the token is moved.
  // @ts-expect-error not yet typed in fvtt-types
  Hooks.on("moveToken", (tokenDocument: TokenDocument.Implementation, movement, operation, user: User.Implementation) => {
    if (!user.isSelf) return;
    const actor = tokenDocument.actor;
    const expiredEffects = actor?.effects.filter(ef => {
      const specialDuration = ef.flags?.dae?.specialDuration;
      return !!specialDuration?.includes("isMoved");
    }) ?? [];
    if (expiredEffects.length > 0) expireEffects(actor!, expiredEffects, { "expiry-reason": "midi-qol:isMoved" });

  });

  //@ts-expect-error
  Hooks.on("template3dUpdatePreview", (at, t) => {
    globalThis.VolumetricTemplates?.compute3Dtemplate(t);
  });

  Hooks.on("targetToken", foundry.utils.debounce(checkFlanking, 150));
  Hooks.on("targetToken", (user, token, targeted) => onUserManualTarget(user));

  // Flanking visualization — update when token selection, targeting, or position changes
  const debouncedFlankingHighlight = foundry.utils.debounce(updateFlankingHighlight, 150);
  Hooks.on("controlToken", debouncedFlankingHighlight);
  Hooks.on("targetToken", debouncedFlankingHighlight);
  Hooks.on("refreshToken", debouncedFlankingHighlight);

  //@ts-expect-error
  Hooks.on("ddb-game-log.pendingRoll", (data) => {
    ddbglPendingHook(data);
  });

  //@ts-expect-error
  Hooks.on("ddb-game-log.fulfilledRoll", (data) => {
    ddbglPendingHook(data);
  });

  Hooks.on("preUpdateChatMessage", (message, update, options, user) => {
    try {
      const cachedUpdates = foundry.utils.flattenObject(getUpdatesCache(message.uuid));
      if (cachedUpdates) {
        // console.error("preUpdateChatMessage cached updates for", message.uuid, update);
        // clearUpdatesCache(message.uuid);
        // hideStuffHandler(message, $(message.content), user);
        if (!foundry.utils.isEmpty(cachedUpdates) && false) {
          const insertedUpdates = {};
          Object.keys(cachedUpdates).forEach(key => {
            if (cachedUpdates[key] !== undefined && foundry.utils.getProperty(update, key) === undefined) {
              if (debugEnabled) insertedUpdates[key] = cachedUpdates[key];
              foundry.utils.setProperty(update, key, cachedUpdates[key])
            }
          });
          if (debugEnabled && !foundry.utils.isEmpty(insertedUpdates)) warn("preUpdateChatMessage inserting updates", message.uuid, insertedUpdates);
        }
      }
      return true;
    } finally {
      return true;
    }
  });

  Hooks.on("deleteMeasuredTemplate", checkDeleteTemplate);

  // Auto-target tokens when a template is refreshed (moved/reshaped during preview or after placement)
  // Only the user who placed the template should update targeting, otherwise all clients
  // would set their own game.user.targets causing every player to target the AoE tokens.
  // @ts-expect-error fvtt-types missing flags parameter on refreshMeasuredTemplate hook
  Hooks.on("refreshMeasuredTemplate", (template: foundry.canvas.placeables.MeasuredTemplate.Implementation, flags: Record<string, boolean>) => {
    if (!flags.refreshPosition && !flags.refreshShape) return;
    if (!canvas?.tokens) return;
    if (template.document.author?.id !== game.user?.id) return;

    // Only auto-target for templates created by dnd5e activities (midi or native).
    // template.activity is set during preview; flags.dnd5e.origin is set after placement.
    // Skip manually placed or non-activity templates entirely.
    // @ts-expect-error no dnd5e-types
    if (!template.activity && !template.document.flags?.dnd5e?.origin) return;

    // @ts-expect-error no dnd5e-types
    const autoTarget = getActivityAutoTargetAction(template.activity);
    if (autoTarget === "none") return;

    if (installedModules.get("levelsvolumetrictemplates") && autoTarget !== "walledtemplates") {
      //@ts-expect-error CONFIG.Levels
      const levelsTemplateData = CONFIG.Levels.handlers.TemplateHandler.getTemplateData(false);
      if (template.document.elevation !== levelsTemplateData.elevation) {
        template.document.elevation = levelsTemplateData.elevation;
      }
      // Resolve the activity and source token for disposition filtering
      // @ts-expect-error no dnd5e-types
      const activity = template.activity
        ?? (template.document.flags?.dnd5e?.origin ? fromUuidSync(template.document.flags.dnd5e.origin) : undefined);
      const sourceToken = getTemplateSourceToken(template.document);
      const selfToken = sourceToken ?? undefined;
      const AoETargetType = activity ? getAoETargetType(activity) : "any";
      const ignoreSelf = activity
        ? (activity?.target.affects.special ?? "").split(";").some((spec: string) => ["-self"].includes(spec))
        : false;

      // Filter which tokens to pass - not too far; wall blocking is left to levels.
      let distance = template.document.distance;
      const dimensions = canvas.dimensions || { size: 1, distance: 1 };
      distance *= dimensions.size / dimensions.distance;
      const tokensToCheck = canvas.tokens.placeables?.filter(tk => {
        const r = new foundry.canvas.geometry.Ray(
          { x: template.document?.x ?? template.x, y: template.document?.y ?? template.y },
          { x: tk.x + tk.document.width * dimensions.size, y: tk.y + tk.document.height * dimensions.size }
        );
        const maxExtension = (1 + Math.max(tk.document.width, tk.document.height)) * dimensions.size;
        if (r.distance > distance + maxExtension) return false;
        if (!isAoETargetable(tk, { selfToken, ignoreSelf, AoETargetType, autoTarget })) return false;
        return true;
      });
      if (tokensToCheck && tokensToCheck.length > 0) {
        //@ts-expect-error VolumetricTemplates
        VolumetricTemplates.compute3Dtemplate(template, tokensToCheck);
      }
    } else {
      // template.activity is set by dnd5e on AbilityTemplate during preview, but not on
      // the standard MeasuredTemplate created after placement. Fall back to looking up
      // the activity from the template's dnd5e.origin flag (the activity UUID).
      // @ts-expect-error no dnd5e-types
      const activity = template.activity
        ?? (template.document.flags?.dnd5e?.origin ? fromUuidSync(template.document.flags.dnd5e.origin) : undefined);
      const sourceToken = getTemplateSourceToken(template.document);
      if (activity && sourceToken) {
        const ignoreSelf = (activity?.target.affects.special ?? "").split(";").some((spec: string) => ["-self"].includes(spec));
        selectTargetsFromTemplates([template], sourceToken, ignoreSelf, getAoETargetType(activity), autoTarget);
      } else {
        selectTargetsFromTemplates([template]);
      }
    }
  });

  // Handle updates to the characters HP
  // Note: Wounded/dead status is now handled by _onUpdate wrapper in patching.ts
  // This hook handles zeroHPExpiry and concentration removal
  Hooks.on("updateActor", async (actor, update, options: any, user) => {
    if (user !== game.user?.id) return;
    const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");
    const temphpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.temp");
    if (hpUpdate !== undefined || temphpUpdate !== undefined) {
      await zeroHPExpiry(actor, update, options, user);
      // @ts-expect-error no dnd5e-types
      if (actor.system.attributes.hp.value <= 0 && configSettings.removeConcentration) {
        // @ts-expect-error no dnd5e-types
        await actor.endConcentration();
      }
      return;
    }
  });

  // Handle vitality item updates - check wounded/dead status when vitality changes
  Hooks.on("updateItem", async (item, update, options, userId) => {
    if (userId !== game.user?.id) return;
    // Check if this is a vitality item update (uses.spent changed)
    const spentUpdate = foundry.utils.getProperty(update, "system.uses.spent") as number | undefined;
    if (spentUpdate === undefined) return;

    const actor = item.actor;
    if (!actor) return;

    // Check if this item is the vitality item for the actor
    const vitalityItem = getVitalityItem(actor);
    if (!vitalityItem || vitalityItem.id !== item.id) return;

    // Calculate new vitality value
    // @ts-expect-error uses exists on items with uses
    const maxUses = item.system.uses?.max ?? 0;
    const newVitality = maxUses - spentUpdate;

    // Re-check wounded/dead status with the new vitality value
    await checkWounded(actor, {}, {} as any, userId, newVitality);
  });

  //TODO: if/when options are passed to dnd5e.damageActor can use that hook instead and not do any calculations.
  // Note: Vitality overflow for direct HP edits is NOT handled because the value is clamped before application.
  // Vitality is only affected through damage application (GMAction.ts or actor.applyDamage()) which has explicit damage amounts.
  Hooks.on("preUpdateActor", (actor, changes, options: any, userId) => {
    if (userId !== game.user?.id) return true;

    const shouldCheckTempHP = configSettings.tempHPDamageConcentrationCheck;
    // @ts-expect-error no dnd5e-types
    const relevantHpChange = changes.system?.attributes?.hp;

    const isHpChangeInvalid =
      relevantHpChange &&
      !("value" in relevantHpChange) &&
      (!shouldCheckTempHP || !("temp" in relevantHpChange));

    if (
      isHpChangeInvalid ||
      // @ts-expect-error no dnd5e-types
      !actor.concentration.effects.size ||
      configSettings.doConcentrationCheck === "none" ||
      game.settings.get("dnd5e", "disableConcentration") ||
      options.noConcentrationCheck ||
      options.dnd5e?.concentrationCheck === false
    ) {
      options.noConcentrationCheck = true;
      foundry.utils.setProperty(options, "dnd5e.concentrationCheck", false);
      return true;
    }

    const hpUpdate = relevantHpChange?.value;
    const tempHpUpdate = relevantHpChange?.temp;
    //@ts-expect-error no dnd5e-types
    const hpDamage = (hpUpdate !== undefined) ? actor.system.attributes.hp.value - hpUpdate : 0;
    //@ts-expect-error no dnd5e-types
    const tempHPDamage = (tempHpUpdate !== undefined) ? actor.system.attributes.hp.temp - tempHpUpdate : 0;
    const totalDamage = tempHPDamage + hpDamage;
    if (hpDamage <= 0 && !configSettings.tempHPDamageConcentrationCheck) {
      options.noConcentrationCheck = true;
      foundry.utils.setProperty(options, "dnd5e.concentrationCheck", false);
      return true;
    }
    const isConcentrationCheck = (hpDamage > 0 || (tempHPDamage > 0 && configSettings.tempHPDamageConcentrationCheck));
    foundry.utils.setProperty(options, "dnd5e.concentrationCheck", isConcentrationCheck);
    try {
      if (configSettings.doConcentrationCheck === "item" && isConcentrationCheck) {
        //@ts-expect-error no dnd5e-types
        const concentrationDc = actor.getConcentrationDC(totalDamage);
        doConcentrationCheck(actor, concentrationDc);
      }
    } catch (err) {
      error("Error in preUpdateActor", err);
    } finally {
      return true;
    }
  })

  //@ts-expect-error
  Hooks.on("renderActorArmorConfig", (app: never, html: HTMLElement, data) => {
    if (!["none", undefined, false].includes(checkRule("challengeModeArmor") as string | boolean | undefined)) {
      const ac = data.ac;
      const element = html.querySelector(".card");
      const arTemplate = document.createElement("template");
      arTemplate.innerHTML = `<div>EC: ${ac.EC}</div><div>AR: ${ac.AR}</div>`;
      element?.append(...Array.from(arTemplate.content.children));
    }
  });

  // Handle removal of concentration
  Hooks.on("deleteActiveEffect", (deletedEffect, options: any, user) => {
    if (options.undo) return; // TODO check that this is right
    if (debugEnabled > 0) console.warn("deleteActiveEffect", deletedEffect, options, user);
    if (!preferredActiveGM()?.isSelf) return;
    if (!(deletedEffect.parent instanceof CONFIG.Actor.documentClass)) return;
    if (debugEnabled > 0) warn("deleteActiveEffectHook", deletedEffect, deletedEffect.parent.name, options);
    async function changeFunc() {
      try {
        let origin = fromUuidSync(deletedEffect.origin as any);
        if (origin instanceof ActiveEffect && !options.noConcentrationCheck && configSettings.removeConcentrationEffects !== "none") {
          // @ts-expect-error no dnd5e-types
          if (origin.statuses?.has(CONFIG.specialStatusEffects.CONCENTRATING) && origin.getDependents()?.length === 0) {
            // @ts-expect-error duration.remaining
            if (!installedModules.get("times-up") || (origin?.duration?.remaining ?? 1) > 0) {
              await origin.delete();
            }
          }
        }
        // transformedActorUuids stores the ORIGINAL (pre-transform) actor UUIDs.
        // Find whatever polymorphed form currently exists for each original and revert it.
        // Skip if the parent actor is being deleted (e.g., revertOriginalForm deletes the polymorphed
        // actor, cascading to its effects — we don't want to re-enter the revert flow).
        let transformedActorUuids = foundry.utils.getProperty(deletedEffect, "flags.midi-qol.transformedActorUuids") as string[];
        const parentActor = deletedEffect.parent as Actor.Implementation;
        const parentStillExists = parentActor?.id && (parentActor.isToken
          ? canvas.scene?.tokens?.get(parentActor.token?.id ?? "")
          : game.actors?.get(parentActor.id));
        if (transformedActorUuids && transformedActorUuids.length > 0 && parentStillExists) {
          for (let uuid of transformedActorUuids) {
            let originalActor = await fromUuid(uuid) as Actor.Implementation;
            if (!originalActor) continue;
            const actorsToRevert: Actor.Implementation[] = [];
            // Search game.actors for linked polymorphed actors referencing this original
            for (const a of game.actors ?? []) {
              //@ts-expect-error isPolymorphed - dnd5e property
              if (a.isPolymorphed && a.getFlag("dnd5e", "originalActor") === originalActor.id) {
                actorsToRevert.push(a);
              }
            }
            // Search canvas tokens for unlinked polymorphed actors
            if (canvas.ready) {
              for (const token of canvas.scene?.tokens ?? []) {
                //@ts-expect-error isPolymorphed - dnd5e property
                if (token.actor?.isPolymorphed
                  && token.actor?.getFlag("dnd5e", "originalActor") === originalActor.id
                  && !actorsToRevert.some(a => a.id === token.actor!.id)) {
                  actorsToRevert.push(token.actor);
                }
              }
            }
            for (const polyActor of actorsToRevert) {
              try {
                //@ts-expect-error no dnd5e-types
                await polyActor.revertOriginalForm({});
              } catch (err) {
                console.error("Error reverting actor to original form", polyActor, err);
              }
            }
            // After revert, clean up concentration on the restored original actor.
            // transformInto() copies effects (including concentration) from original to
            // polymorphed form, so the original still has its concentration effect.
            if (actorsToRevert.length > 0) {
              const restoredActor = await fromUuid(uuid) as Actor.Implementation;
              if (restoredActor) {
                const remainingConcentration = restoredActor.effects.filter(ef =>
                  // @ts-expect-error no dnd5e-types
                  ef.statuses?.has(CONFIG.specialStatusEffects.CONCENTRATING)
                );
                for (const ce of remainingConcentration) {
                  // @ts-expect-error extra option silliness
                  await ce.delete({ noConcentrationCheck: true });
                }
              }
            }
          }
        }
        return true;
      } catch (err) {
        console.warn("Error in deleteActiveEffect", err, deletedEffect, options);
        return true;
      }
    }
    return changeFunc();
  })

  // Handle deletion of Actors - cascade delete dependents via MidiDependentsRegistry
  Hooks.on("deleteActor", (deletedActor: Actor.Implementation, options: any, user) => {
    if (!preferredActiveGM()?.isSelf) return;
    if (options.undo) return;
    MidiDependentsRegistry.deleteDependents(deletedActor.uuid);
  });

  // Handle deletion of Items - cascade delete dependents via MidiDependentsRegistry
  Hooks.on("deleteItem", (deletedItem: Item.Implementation, options: any, user) => {
    if (!preferredActiveGM()?.isSelf) return;
    if (options.undo) return;
    MidiDependentsRegistry.deleteDependents(deletedItem.uuid);
  });

  // Handle deletion of AmbientLights - cascade delete dependents via MidiDependentsRegistry
  Hooks.on("deleteAmbientLight", (deletedLight: any, options: any, user) => {
    if (!preferredActiveGM()?.isSelf) return;
    if (options.undo) return;
    MidiDependentsRegistry.deleteDependents(deletedLight.uuid);
  });

  // Handle deletion of Tokens - cascade delete dependents via MidiDependentsRegistry
  Hooks.on("deleteToken", (deletedToken: any, options: any, user) => {
    if (!preferredActiveGM()?.isSelf) return;
    if (options.undo) return;
    MidiDependentsRegistry.deleteDependents(deletedToken.uuid);
  });

  // Handle deletion of Regions - cascade delete dependents via MidiDependentsRegistry
  Hooks.on("deleteRegion", (deletedRegion: any, options: any, user) => {
    if (!preferredActiveGM()?.isSelf) return;
    if (options.undo) return;
    MidiDependentsRegistry.deleteDependents(deletedRegion.uuid);
  });

  // Hooks.on("restCompleted", restManager); I think this means 1.6 is required.
  Hooks.on("dnd5e.restCompleted", restManager);
  Hooks.on("dnd5e.preActivityConsumption", preActivityConsumptionHook);
  Hooks.on("dnd5e.activityConsumption", activityConsumptionHook);
  Hooks.on("dnd5e.rollDeathSave", deathSaveHook);
  Hooks.on("updateCombat", (combat, update, options, userId) => {
    if (userId != preferredActiveGM()?.id) return;
    if (!update.hasOwnProperty("round")) return;
    if (!checkMechanic("autoRerollInitiative")) return;
    let combatantIds: any = combat.combatants.map(c => c.id);
    if (combat.combatants?.size > 0 && combat.id) {
      const combatId = combat.id;
      combat.rollInitiative(combatantIds, { updateTurn: true }).then(() => {
        // Check if combat was deleted during async operation
        if (game.combats?.get(combatId)) combat.update({ turn: 0 });
      }).catch(err => TroubleShooter.recordError(err, "autoRerollInitiative"));
    }
  });
}

export async function restManager(actor: Actor.Implementation, result: { longRest: boolean; newDay: boolean }) {
  if (!actor || !result)
    return;
  const specialDuration = (effect): string[] | undefined => { return foundry.utils.getProperty(effect, "flags.dae.specialDuration") as string[] };
  const effectsToExpire = (actorRef) => {
    const effects = actorRef.appliedEffects;
    const validEffects = effects.filter(effect => (specialDuration(effect) ?? []).length > 0);
    return {
      newDay: validEffects.filter(ef => result.newDay && specialDuration(ef)?.includes(`newDay`)),
      longRest: validEffects.filter(ef => result.longRest && specialDuration(ef)?.includes(`longRest`) && !specialDuration(ef)?.includes(`newDay`)),
      shortRest: validEffects.filter(ef => specialDuration(ef)?.includes(`shortRest`) && !specialDuration(ef)?.includes(`newDay`)),
    }
  }
  const myExpiredEffects = effectsToExpire(actor);
  if (result.longRest && myExpiredEffects.longRest.length) await expireEffects(actor, myExpiredEffects.longRest, { "expiry-reason": "midi-qol:longRest" });
  if (result.longRest && myExpiredEffects.shortRest.length) await expireEffects(actor, myExpiredEffects.shortRest, { "expiry-reason": "midi-qol:shortRest" });
  if (!result.longRest && myExpiredEffects.shortRest.length) await expireEffects(actor, myExpiredEffects.shortRest, { "expiry-reason": "midi-qol:shortRest" });
  if (result.newDay && myExpiredEffects.newDay.length) await expireEffects(actor, myExpiredEffects.newDay, { "expiry-reason": "midi-qol:newDay" });
  if (foundry.utils.getProperty(actor, "flags.midi-qol.actions.reactionsReset") !== "never") await removeReactionUsed(actor, true); // remove reaction used for a rest
  if (foundry.utils.getProperty(actor, "flags.midi-qol.actions.bonusActionsReset") !== "never")
    await removeActionUsed(actor);
}

export function initHooks() {
  if (debugEnabled > 0) warn("Init Hooks processing");
  Hooks.on("preCreateChatMessage", (message, data, options, user) => {
    if (debugEnabled > 1) debug("preCreateChatMessage entering", message, data, options, user)
    nsaMessageHandler(message, data, options, user);
    checkOverTimeSaves(message, data, options, user);
    return true;
  });

  Hooks.on("createChatMessage", (message, options, user) => {
    if (debugEnabled > 1) debug("Create Chat Message ", message.id, message, options, user)
    processCreateDDBGLMessages(message, options, user);
    return true;
  });

  Hooks.on("updateChatMessage", (message, update, options, user) => {
    hideRollUpdate(message, update, options, user);
    if (!update.content) return;
    const updateChatMessageStart = Date.now();
    //@ts-expect-error fvtt-isAtBottom
    if (message.content && (ui.chat?.isAtBottom)) {
      throttledScrollBottom();
    }
    if (debugEnabled > 1) debug("updateChatMessage processing time", Date.now() - updateChatMessageStart);
  });


  Hooks.on("updateCombat", (combat, data, options, user) => {
    if (data.round === undefined && data.turn === undefined) return;
    untargetAllTokens(combat);
    untargetDeadTokens();
    if (preferredActiveGM()?.isSelf) {
      _processOverTime(combat, data, options, user);
      _processActivityOverTime(combat, data, options, user);
    }
    // updateReactionRounds(combat, data, options, user); This is handled in processOverTime
  });

  Hooks.on("renderChatMessageHTML", (message, html, data) => {
    if (debugEnabled > 1) debug("render message hook ", message.id, message, html, data);
    // chatDamageButtons(message, html, data); This no longer works since the html is rewritten
    processUndoDamageCard(message, html, data);
    colorChatMessageHandler(message, html, data);
    hideRollRender(message, html, data);
    hideStuffHandler(message, html, data);
    processConcentrationRequestMessage(message, html, data);
  });

  Hooks.on("deleteChatMessage", (message, options, user) => {
    Workflow.deleteWorkflow(message.uuid);
    clearUpdatesCache(message.uuid);
  });

  // Helper to apply a replacement effect - supports status effect IDs, effect UUIDs, and macro specifications
  // Syntax: "statusId" or "effectUuid" or "statusId|overlay" or "effectUuid|overlay"
  // Macro syntax: "function.functionName", "Macro.macroName", "ItemMacro", "ItemMacro.itemNameOrUuid",
  //               "ActivityMacro", "ActivityMacro.uuid"
  async function applyReplacementEffect(actor: Actor.Implementation, effectSpec: string, effect?: ActiveEffect.Implementation): Promise<void> {
    // Parse the effect spec for optional parameters using | as separator
    const parts = effectSpec.split("|");
    const effectIdOrUuid = parts[0].trim();
    let overlay = false;

    // Parse optional parameters (e.g., "overlay" or "overlay=true")
    for (let i = 1; i < parts.length; i++) {
      const param = parts[i].trim().toLowerCase();
      if (param === "overlay" || param === "overlay=true") {
        overlay = true;
      } else if (param === "overlay=false") {
        overlay = false;
      }
    }

    // Check if it's a macro specification
    if (effectIdOrUuid.startsWith("function.") || effectIdOrUuid.startsWith("Macro.") ||
      effectIdOrUuid.startsWith("ItemMacro") || effectIdOrUuid.startsWith("ActivityMacro")) {
      // Execute macro with actor context
      await executeMacroSpec(effectIdOrUuid, actor, effect);
    } else {
      // Check if it's a status effect ID (from CONFIG.statusEffects)
      const statusEffect = CONFIG.statusEffects.find(se => se.id === effectIdOrUuid);
      if (statusEffect) {
        // Apply as status effect using toggleStatusEffect
        await actor.toggleStatusEffect(effectIdOrUuid, { active: true, overlay });
      } else {
        // Assume it's an effect UUID - fetch and apply
        const sourceEffect = await fromUuid(effectIdOrUuid) as ActiveEffect.Implementation | undefined;
        if (sourceEffect) {
          const effectData = sourceEffect.toObject();
          if (overlay) {
            foundry.utils.setProperty(effectData, "flags.core.overlay", true);
          }
          await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }
      }
    }
  }

  // Helper to execute a macro specification for replacement effects
  // Supports: "function.functionName", "Macro.macroName", "ItemMacro", "ItemMacro.itemNameOrUuid",
  //           "ActivityMacro", "ActivityMacro.uuid"
  async function executeMacroSpec(macroSpec: string, actor: Actor.Implementation, effect?: ActiveEffect.Implementation): Promise<any> {
    let macro: Macro.Implementation | undefined;
    let macroData: Macro.CreateData | undefined;
    let macroItem: Item.Implementation | undefined;
    let macroActivity: Activity | undefined;

    // Get the origin item/activity from the effect if available
    let originItem: Item.Implementation | undefined;
    let originActivity: Activity | undefined;
    if (effect?.origin) {
      const origin = await fromUuid(effect.origin);
      if (origin instanceof Item) {
        originItem = origin;
        // @ts-expect-error no dnd5e-types
        originActivity = origin.system.activities?.contents[0];
      } else if ((origin as any)?.item) {
        // It's an activity
        originActivity = origin as unknown as Activity;
        originItem = (origin as any).item;
      }
    }

    try {
      if (macroSpec.startsWith("function.")) {
        // Create a script macro that calls the named function
        const funcName = macroSpec.replace("function.", "").trim();
        macroData = {
          name: "replacement effect function call",
          type: "script",
          command: `return await ${funcName}({ speaker, actor, token, character, item, args, scope })`
        };
        macroItem = originItem;
      } else if (macroSpec.startsWith("Macro.")) {
        // Get macro by name from game.macros
        const macroName = macroSpec.replace("Macro.", "").trim();
        macro = game.macros?.getName(macroName);
        if (!macro) {
          // Try as UUID
          const macroEntity = await fromUuid(macroName);
          if (macroEntity instanceof Macro) macro = macroEntity;
        }
        if (!macro) {
          warn(`applyReplacementEffect | Could not find macro ${macroName}`);
          return;
        }
        if (macro.type === "chat") {
          macro.execute();
          return;
        }
        macroItem = originItem;
      } else if (macroSpec.startsWith("ItemMacro")) {
        // Use helper function to resolve ItemMacro
        const resolved = await resolveItemMacro(macroSpec, { actor, originItem });
        if (resolved) {
          macroItem = resolved.item;
          macroData = resolved.macroData;
        } else if (effect?.origin) {
          // DAE itemData fallback - look for item data stored in effect flags
          const itemData = resolveDAEItemData(actor, effect.origin);
          if (itemData) {
            macroItem = itemData as unknown as Item.Implementation;
            macroData = itemData.flags?.dae?.macro ?? itemData.flags?.itemacro?.macro;
          }
        }
        if (!macroData) {
          warn(`applyReplacementEffect | Could not resolve ItemMacro: ${macroSpec}`);
          return;
        }
      } else if (macroSpec.startsWith("ActivityMacro")) {
        // Use helper function to resolve ActivityMacro
        const resolved = await resolveActivityMacro(macroSpec, { originItem, originActivity });
        if (!resolved) {
          warn(`applyReplacementEffect | Could not resolve ActivityMacro: ${macroSpec}`);
          return;
        }
        macroItem = resolved.item;
        macroActivity = resolved.activity;
        macro = resolved.macro;
      }

      // Create macro if we have macroData but no macro
      if (macroData && !macro) {
        const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        macroData.ownership = { default: OWNER };
        macroData.author = game.user?.id;
        macro = new CONFIG.Macro.documentClass(macroData);
      }

      if (!macro?.command) return;

      // Build execution context
      const token = tokenForActor(actor);
      const speaker = ChatMessage.getSpeaker({ actor, token: token?.document });
      const args = [{ actor, token, effect, item: macroItem, activity: macroActivity, reason: "replacementEffect" }];

      const scope: Macro.UnknownScope = {};
      scope.actor = actor;
      scope.token = token;
      scope.effect = effect;
      scope.item = macroItem;
      scope.activity = macroActivity;
      scope.args = args;

      return macro.execute(scope);
    } catch (err) {
      TroubleShooter.recordError(err, "executeMacroSpec: Error evaluating macro");
      error("Error evaluating replacement effect macro", err);
    }
  }

  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    const activityUuid = workflow.activity.uuid ?? "";
    if (savedOverTimeEffectsToDelete[activityUuid]) {
      const effectData = savedOverTimeEffectsToDelete[activityUuid];
      let effect = fromUuidSync(effectData.uuid) as ActiveEffect.Implementation | undefined;

      if (effect) {
        const saved = workflow.saves.size === 1;
        const failed = workflow.failedSaves.size === 1;
        const { saveCount, saveCountAction, saveConsecutive,
                failCount, failCountAction, failConsecutive } = effectData;
        const actor = effect.parent as Actor.Implementation;

        if (saved || !workflow.hasSave) {
          // Handle saveCount - need multiple saves to trigger action
          if (saved && saveCount !== undefined) {
            let savesRemaining = foundry.utils.getProperty(effect, `flags.${MODULE_ID}.overtime.savesRemaining`) as number | undefined;
            // Initialize if not set
            if (savesRemaining === undefined) savesRemaining = saveCount;
            savesRemaining -= 1;

            if (savesRemaining <= 0) {
              // Required saves reached - apply action
              // Action format: [c][-+]effectSpec (e.g., "-", "+", "c-petrified", "c+prone")
              const action = (saveCountAction ?? "-").replace(/^c/, ""); // Strip consecutive flag
              const isRemove = action.startsWith("-");
              const effectSpec = action.length > 1 ? action.slice(1) : undefined;

              // Apply effectSpec if specified (always added to actor)
              if (effectSpec) await applyReplacementEffect(actor, effectSpec, effect);

              // Then handle the mode
              if (isRemove) {
                expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:saveCount" });
              } else {
                const permanentUpdate: Record<string, any> = { [`flags.${MODULE_ID}.overtime.permanent`]: true };
                await effect.update(permanentUpdate);
              }
            } else {
              // Decrement counter on effect
              // If failCount is consecutive, a save resets the fail streak
              const updates: Record<string, any> = {
                [`flags.${MODULE_ID}.overtime.savesRemaining`]: savesRemaining
              };
              if (failConsecutive && failCount !== undefined) {
                updates[`flags.${MODULE_ID}.overtime.failsRemaining`] = failCount;
              }
              await effect.update(updates);
            }
          } else {
            // No saveCount specified - check if effect is already permanent
            const isAlreadyPermanent = !!effect.flags?.[MODULE_ID]?.overtime?.permanent;
            if (!isAlreadyPermanent) {
              // Original behavior: single save removes the effect
              expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime" });
            }
            // If already permanent, do nothing - just let the overtime damage continue
          }
        } else if (failed && failCount !== undefined) {
          // Handle failCount - multiple fails trigger action
          let failsRemaining = foundry.utils.getProperty(effect, `flags.${MODULE_ID}.overtime.failsRemaining`) as number | undefined;
          // Initialize if not set
          if (failsRemaining === undefined) failsRemaining = failCount;
          failsRemaining -= 1;

          if (failsRemaining <= 0) {
            // Required fails reached - apply action
            const action = (failCountAction ?? "+").replace(/^c/, ""); // Strip consecutive flag
            const isRemove = action.startsWith("-");
            const effectSpec = action.length > 1 ? action.slice(1) : undefined;

            // Apply effectSpec if specified (always added to actor)
            if (effectSpec) await applyReplacementEffect(actor, effectSpec, effect);

            // Then handle the mode
            if (isRemove) {
              expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:failCount" });
            } else {
              const permanentUpdate: Record<string, any> = { [`flags.${MODULE_ID}.overtime.permanent`]: true };
              await effect.update(permanentUpdate);
            }
          } else {
            // Decrement counter on effect
            // If saveCount is consecutive, a failure resets the save streak
            const updates: Record<string, any> = {
              [`flags.${MODULE_ID}.overtime.failsRemaining`]: failsRemaining
            };
            if (saveConsecutive && saveCount !== undefined) {
              updates[`flags.${MODULE_ID}.overtime.savesRemaining`] = saveCount;
            }
            await effect.update(updates);
          }
        } else if (failed && saveConsecutive && saveCount !== undefined) {
          // Failed but no failCount to process — still need to reset consecutive save streak
          const resetUpdate: Record<string, any> = { [`flags.${MODULE_ID}.overtime.savesRemaining`]: saveCount };
          await effect.update(resetUpdate);
        }
      }
      delete savedOverTimeEffectsToDelete[activityUuid];
    }
    if (overTimeEffectsToDelete[activityUuid]) {
      let effect = fromUuidSync(overTimeEffectsToDelete[activityUuid].uuid) as ActiveEffect.Implementation | undefined;
      if (effect) expireEffects(effect.parent as Actor.Implementation, [effect], { "expiry-reason": "midi-qol:overTime" });
      delete overTimeEffectsToDelete[activityUuid];
    }
    if (debugEnabled > 1) debug("Finished the roll", activityUuid, workflow.id)
  });

  Hooks.on("applyActiveEffect", midiCustomEffect);
  // Hooks.on("preCreateActiveEffect", checkImmunity); Disabled in lieu of having effect marked suppressed
  Hooks.on("preUpdateItem", preUpdateItemActorOnUseMacro);
  Hooks.on("preUpdateActor", preUpdateItemActorOnUseMacro);
  Hooks.on("combatRound", expirePerTurnBonusActions); // TODO Move this to the update combat hook?
  Hooks.on("combatTurn", expirePerTurnBonusActions);
  Hooks.on("updateCombatant", (combatant, updates, options, user) => {
    if (game.user?.id !== user) return true;
    if (combatant.actor && updates.initiative) expireRollEffect.bind(combatant.actor)("Initiative", "none");
    return true;
  });

  // Handle start/end of turn, long/short rest auto triggered activities.
  Hooks.on("preCreateChatMessage", (message, messageData, options, userId) => {
    //@ts-expect-error no dnd5e-types
    if (!message.system?.activations) return true;
    if (configSettings.activationAutomation === "chat") return true;
    if (configSettings.activationAutomation === "none") {
      //@ts-expect-error no dnd5e-types
      message.updateSource({ "system.activations": [] });
      if (message.content?.length === 0) return false;
      return true
    }
    try {
      const activations: Set<string> = new Set();
      const activityList: any[] = [];
      //@ts-expect-error
      const actor = message.system.actor;
      //@ts-expect-error
      if (message?.system?.activations?.size > 0) {
        //@ts-expect-error
        for (let activation of message.system.activations) {
          const activity = fromUuidSync(activation, { relative: actor }) as any;
          const item = activity.item;
          const itemEnabled = item?.system.equipped !== false && (item?.system.attuned === true || item?.system.attunement !== "required");
          if (itemEnabled && activity?.target?.affects.type === "self") activityList.push(activity);
          else if (itemEnabled) activations.add(activation);
        }
      }
      //@ts-expect-error
      message.updateSource({ "system.activations": activations });
      const processActivations = async () => {
        // if (activityList.length > 0) await busyWait(10);
        for (let activity of activityList) {
          await completeActivityUse(activity, { midiOptions: { noUseWarning: true } }, {}, {});
          // await unTimedExecuteAsGM("completeActivityUse", { activityUuid: activity.uuid, actorUuid: actor.uuid, usage: {}, dialog: {}, message: {} });
        }
      }
      processActivations();
    } catch (err) {
      const errMessage = "Activation Automation | preCreateChatMessage error";
      error(errMessage, err);
      TroubleShooter.recordError(err, errMessage);
    } finally {
      //@ts-expect-error no dnd5e-types
      return message.content.length === 0 && message.system.activations.size === 0 ? false : true;
    }
  });

  Hooks.once('tidy5e-sheet.ready', (api) => {
    //@ts-expect-error
    Hooks.on('tidy5e-sheet.getActivitiesForPlay', (parent, data) => {
      if (data.activities && data.activities instanceof Array) {
        // Filter out automationOnly activities and rider activities
        // Also filter by canUse to preserve dnd5e visibility settings (level limits, etc.) - fixes #1548
        data.activities = data.activities.filter(activity =>
          activity?.canUse !== false &&
          !activity?.midiProperties?.automationOnly &&
          !parent.flags.dnd5e?.riders?.activity?.includes(activity.id)
        );
      }
    });
    api.config.itemSummary.registerCommands([
      {
        label: i18n("midi-qol.buttons.showChatInfo"),
        enabled: (params) => true,
        iconClass: 'fas fa-info-circle',
        execute: (params) => {
          if (debugEnabled > 1) log('displayCard', params.item);
          params.item.displayCard();
        },
      },
      {
        label: i18n("midi-qol.buttons.roll"),
        enabled: (params) => ["weapon", "spell", "feat", "tool", "consumable"].includes(params.item.type),
        iconClass: 'fas fa-dice-d20',
        execute: (params) => {
          if (debugEnabled > 1) log('roll', params.item);
          Workflow.removeWorkflow(params.item.uuid);
          params.item.use({ legacy: false, event: params.event, configureDialog: true, systemCard: true }, {}, { systemCard: true });
        },
      },
      {
        label: i18n("midi-qol.buttons.attack"),
        enabled: (params) => params.item.system.activities?.some(a => a.hasAttack),
        iconClass: 'fas fa-dice-d20',
        execute: (params) => {
          if (debugEnabled > 1) log('rollAttack', params.item);
          const activity = params.item.system.activities.find(a => a.hasAttack);
          if (!activity) return;
          let configure = !isAutoFastForward("attack");
          if (areMidiKeysPressed(params.event, "RollToggle")) configure = !configure;
          activity.rollAttack({ event: params.event }, { configure }, { create: true })
        }
      },
      {
        label: i18n("midi-qol.buttons.damage"),
        enabled: (params) => params.item.system.activities?.some(a => a.hasDamage),
        iconClass: 'fas fa-dice-d20',
        execute: (params) => {
          if (debugEnabled > 1) log('rollDamage', params.item);
          const activity = params.item.system.activities.find(a => a.hasDamage);
          if (!activity) return;
          let configure = !isAutoFastForward("damage");
          if (areMidiKeysPressed(params.event, "RollToggle")) configure = !configure;
          activity.rollDamage({ event: params.event }, { configure }, { create: true })
        }
      },
      {
        label: i18n("midi-qol.buttons.versatileDamage"),
        enabled: (params) => params.item.isVersatile && params.item.system.activities?.some(a => a.hasDamage),
        iconClass: 'fas fa-hand-fist',
        execute: (params) => {
          if (debugEnabled > 1) log('rollVersatileDamage', params.item);
          const activity = params.item.system.activities.find(a => a.hasDamage);
          if (!activity) return;
          let configure = !isAutoFastForward("damage");
          if (areMidiKeysPressed(params.event, "RollToggle")) configure = !configure;
          activity.rollDamage({ event: params.event, versatile: true }, { configure }, { create: true })
        }
      }
    ]);
    return;
  });

  Hooks.once("tidy5e-sheet.ready", api => {
    if ((game.user?.role ?? CONST.USER_ROLES.PLAYER) < (configSettings.midiPropertiesTabRole ?? CONST.USER_ROLES.PLAYER)) return;

    api.registerItemHeaderControls?.({
      controls: [
        {
          icon: "fa-solid fa-gears", // TODO: better icon?
          label: "Midi-QOL",
          async onClickAction() {
            new ItemOnUseMacrosConfig({ document: this.document }).render({ force: true });
          }
        }
      ]
    });
  });

  Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
    if (configSettings.allowActorUseMacro) {
      //@ts-expect-error ApplicationV2.HeaderControlsEntry not properly defined in fvtt-types
      controls.push({
        label: i18n("midi-qol.ActorOnUseMacros"),
        icon: "fa-solid fa-gears", // TODO: better icon?
        onClick: () => {
          new ActorOnUseMacrosConfig({ document: app.document }).render({ force: true });
        }
      });
    }
  })

  //@ts-expect-error
  Hooks.on("getHeaderControlsItemSheet5e", (
    app: foundry.applications.api.DocumentSheetV2<Item>,
    controls: foundry.applications.api.ApplicationV2.HeaderControlsEntry[]
  ) => {
    if ((game.user?.role ?? CONST.USER_ROLES.PLAYER) < (configSettings.midiPropertiesTabRole ?? CONST.USER_ROLES.PLAYER)) return;
    // TODO: Localize this to maybe be on-use macros? Needs to be clear it's a midi thing
    // TODO: permissions
    const title = "Midi-qol";
    controls.push({
      label: title,
      icon: "fa-solid fa-gears", // TODO: better icon?
      // @ts-expect-error v13-ism
      onClick: () => new ItemOnUseMacrosConfig({ document: app.document }).render({ force: true })
    });
  });

  Hooks.on('dropCanvasData', function (canvas, dropData: any) {
    if (!dragDropTargeting) return true;
    if (dropData.type !== "Item") return true;
    if (!canvas.grid?.grid) return;
    let grid_size = canvas.scene?.grid.size ?? 100;
    // This will work for all grids except gridless
    // TODO: swap to `getTopLeftPoint` - should simplify some
    let coords = { x: dropData.x, y: dropData.y };
    if (canvas.scene?.grid.type !== CONST.GRID_TYPES.GRIDLESS) {
      coords = canvas.grid.getCenterPoint(coords);
    }
    const targetCount = canvas.tokens?.targetObjects({
      x: coords.x - 5,
      y: coords.y - 5,
      height: 10,
      width: 10,
    }, { releaseOthers: true });
    if (targetCount === 0) {
      ui.notifications?.warn("No target selected");
      return true;
    }
    const item = fromUuidSync(dropData.uuid) as Item | undefined;
    if (!item) {
      const message = `actor / item broke for ${dropData?.uuid}`;
      error(message);
      TroubleShooter.recordError(new Error(message), message);
    }
    //@ts-expect-error no dnd5e types
    item?.use({ legacy: false }, {}, {});
    return true;
  })

  // Set dnd5e version flag and register version-appropriate damage hooks
  setDnd5e53(foundry.utils.isNewerVersion(game.system.version, "5.2.99"));
  if (isDnd5e53) {
    Hooks.on("dnd5e.preCalculateDamage", preCalculateDamageHandler_53);
    Hooks.on("dnd5e.calculateDamage", calculateDamageHandler_53);
  } else {
    Hooks.on("dnd5e.preCalculateDamage", preCalculateDamageHandler);
    Hooks.on("dnd5e.calculateDamage", calculateDamageHandler);
  }
}

export function setupHooks() {
}

Hooks.on("dnd5e.preRollDamage", (rollConfig, dialogConfig, messageConfig) => {
  if (!rollConfig.subject) return true;
  // @ts-expect-error no dnd5e-types
  if (rollConfig.subject.actor && rollConfig.subject.isSpell) {
    const actorSpellBonus = foundry.utils.getProperty(rollConfig.subject as Actor.Implementation, "system.bonuses.spell.all.damage");
    // @ts-expect-error no dnd5e-types
    if (actorSpellBonus) rollConfig.rolls[0].parts.push(actorSpellBonus);
  }
  // return preRollDamageHook(item, rollConfig)
  return true;
});


/** Parameters passed to damage calculation functions */
interface DamageCalcParams {
  actor: Actor.Implementation;
  sourceActor?: Actor.Implementation;
  damages: DamageDescription[];
  options: DamageApplicationOptions;
}

/** Source actor trait codes that can ignore target traits */
const SOURCE_TRAIT_CONFIG: Record<string, string> = {
  idi: "immunity",
  idr: "resistance",
  idv: "vulnerability",
  ida: "absorption",
  idm: "modification",
};

/** Custom resistance type matchers - maps custom resistance names to damage predicates */
type DamagePredicate = (damage: DamageDescription, bypasses?: Set<string>) => boolean;

const CUSTOM_RESISTANCE_MATCHERS: Record<string, { match: DamagePredicate; label: string }> = {
  spell: {
    match: (d) => d.properties?.has("spell") ?? false,
    label: "midi-qol.SpellDamage",
  },
  "non-spell": {
    match: (d) => !d.properties?.has("spell"),
    label: "midi-qol.NonSpellDamage",
  },
  nonSpell: {
    match: (d) => !d.properties?.has("spell"),
    label: "midi-qol.NonSpellDamage",
  },
  magical: {
    match: (d) => d.properties?.has("mgc") ?? false,
    label: "midi-qol.Magical",
  },
  "non-magical": {
    match: (d) => !d.properties?.has("mgc"),
    label: "midi-qol.NonMagical",
  },
  nonMagical: {
    match: (d) => !d.properties?.has("mgc"),
    label: "midi-qol.NonMagical",
  },
  physical: {
    match: (d, bypasses) => {
      const bypassesPresent = (d.properties ?? new Set()).intersection(bypasses ?? new Set());
      return (GameSystemConfig.damageTypes[d.type]?.isPhysical ?? false) && bypassesPresent.size === 0;
    },
    label: "midi-qol.Physical",
  },
  "non-physical": {
    match: (d) => !GameSystemConfig.damageTypes[d.type]?.isPhysical,
    label: "midi-qol.NonPhysical",
  },
  nonPhysical: {
    match: (d) => !GameSystemConfig.damageTypes[d.type]?.isPhysical,
    label: "midi-qol.NonPhysical",
  },
  "non-magical-physical": {
    match: (d) => (GameSystemConfig.damageTypes[d.type]?.isPhysical ?? false) && !d.properties?.has("mgc"),
    label: "midi-qol.NonMagicalPhysical",
  },
  nonMagicalPhysical: {
    match: (d) => (GameSystemConfig.damageTypes[d.type]?.isPhysical ?? false) && !d.properties?.has("mgc"),
    label: "midi-qol.NonMagicalPhysical",
  },
  "non-silver-physical": {
    match: (d) => (GameSystemConfig.damageTypes[d.type]?.isPhysical ?? false) && !d.properties?.has("sil"),
    label: "midi-qol.NonSilverPhysical",
  },
  nonSilverPhysical: {
    match: (d) => (GameSystemConfig.damageTypes[d.type]?.isPhysical ?? false) && !d.properties?.has("sil"),
    label: "midi-qol.NonSilverPhysical",
  },
  "non-adamant-physical": {
    match: (d) => (GameSystemConfig.damageTypes[d.type]?.isPhysical ?? false) && !d.properties?.has("ada"),
    label: "midi-qol.NonAdamantinePhysical",
  },
  nonAdamantPhysical: {
    match: (d) => (GameSystemConfig.damageTypes[d.type]?.isPhysical ?? false) && !d.properties?.has("ada"),
    label: "midi-qol.NonAdamantinePhysical",
  },
  mwak: {
    match: (d, bypasses) => {
      const bypassesPresent = (d.properties ?? new Set()).intersection(bypasses ?? new Set());
      return (d.properties?.has("mwak") ?? false) && bypassesPresent.size === 0;
    },
    label: "mwak",
  },
  rwak: {
    match: (d, bypasses) => {
      const bypassesPresent = (d.properties ?? new Set()).intersection(bypasses ?? new Set());
      return (d.properties?.has("rwak") ?? false) && bypassesPresent.size === 0;
    },
    label: "rwak",
  },
  msak: {
    match: (d) => d.properties?.has("msak") ?? false,
    label: "msak",
  },
  rsak: {
    match: (d) => d.properties?.has("rsak") ?? false,
    label: "rsak",
  },
  all: {
    match: () => true,
    label: "All",
  },
};

function isDRType(type: string): boolean {
  return ["none", "midi-none"].includes(type);
}

/**
 * Set a boolean flag on damage.active in the version-appropriate structure.
 * On dnd5e 5.3+, flags are nested under `type` or `all` (e.g., `active.type.resistance`).
 * On dnd5e 5.2.x, flags are flat (e.g., `active.resistance`).
 * `multiplier` and `threshold` remain flat in both versions — do NOT use this for those.
 */
function setDamageActiveFlag(damage: DamageDescription, flag: string, scope: "type" | "all" = "type"): void {
  damage.active ??= {};
  if (isDnd5e53) {
    damage.active[scope] ??= {};
    damage.active[scope]![flag] = true;
  } else {
    damage.active[flag] = true;
  }
}

/** Read a boolean flag from damage.active in the version-appropriate structure. */
function getDamageActiveFlag(damage: DamageDescription, flag: string): boolean {
  if (isDnd5e53) {
    return !!(damage.active?.type?.[flag] || damage.active?.all?.[flag]);
  }
  return !!damage.active?.[flag];
}

function shouldDowngrade(options: DamageApplicationOptions, type: string): boolean {
  return options.downgrade === true || (options.downgrade as Set<string>)?.has?.(type) === true;
}

function shouldIgnore(
  options: DamageApplicationOptions,
  category: string,
  type: string,
  actorTraits?: any,
  skipDowngrade = false
): boolean {
  if (options.ignore === true) return true;
  if (options.ignore?.[category] === true) return true;
  if (options.ignore?.[category]?.has?.(type)) return true;
  if (options.ignore?.[category]?.has?.("all")) return true;
  if (category === "immunity" && shouldDowngrade(options, type) && !skipDowngrade) return true;
  if (category === "resistance" && shouldDowngrade(options, type)) {
    if (actorTraits?.di?.value?.has(type)) return false;
    return true;
  }
  return false;
}

function hasTraitEffect(
  actorTraits: any,
  category: string,
  type: string,
  properties?: Set<string>,
  options?: DamageApplicationOptions
): boolean {
  if (category === "dr" && shouldDowngrade(options ?? {}, type)) {
    if (hasTraitEffect(actorTraits, "di", type, properties) && !shouldIgnore(options ?? {}, "immunity", type, actorTraits, true)) {
      return true;
    }
  }
  const config = actorTraits[category];
  if (!config?.value?.has(type)) return false;
  if (!CONFIG.DND5E.damageTypes[type]?.isPhysical || !properties?.size) return true;
  return !(config.bypasses?.intersection(properties)?.size);
}

function computeSourceIgnores({ actor, sourceActor, damages, options }: DamageCalcParams): void {
  if (!sourceActor || options.midiIgnoreComputed) return;

  //@ts-expect-error no dnd5e types
  const actorTraits = actor.system?.traits ?? {};

  for (const [traitCode, category] of Object.entries(SOURCE_TRAIT_CONFIG)) {
    //@ts-expect-error no dnd5e types
    const trait = sourceActor.system?.traits?.[traitCode];
    if (!trait?.value?.size) continue;

    if (!options.ignore?.[category]) {
      foundry.utils.setProperty(options, `ignore.${category}`, new Set());
    }

    for (const dt of Object.keys(GameSystemConfig.damageTypes)) {
      if (!trait.value.has(dt) && !trait.all) continue;
      if (!damages.some(di => di.type === dt)) continue;

      if (category === "immunity" && hasTraitEffect(actorTraits, "di", dt) && !hasTraitEffect(actorTraits, "dr", dt)) {
        if (!(options.downgrade instanceof Set)) options.downgrade = new Set();
        (options.downgrade as Set<string>).add(dt);
      } else if (options.ignore) {
        options.ignore[category].add(dt);
      }
    }
  }
  options.midiIgnoreComputed = true;
}

function applySaves({ damages, options }: DamageCalcParams): void {
  const mo = options.midi;
  if (!mo || options.ignore === true) return;

  for (const damage of damages) {
    if (isDRType(damage.type)) continue;

    const ignoringSuperSaver = mo.superSaver && shouldIgnore(options, "superSaver", damage.type);
    const ignoringSemiSuperSaver = mo.semiSuperSaver && shouldIgnore(options, "semiSuperSaver", damage.type);
    const ignoringSaved = mo.saved && shouldIgnore(options, "saved", damage.type);

    if (mo.superSaver && !ignoringSuperSaver) {
      setDamageActiveFlag(damage, "superSaver");
    }
    if (mo.semiSuperSaver && !ignoringSemiSuperSaver && (mo.saveMultiplier ?? 1) !== 1) {
      setDamageActiveFlag(damage, "semiSuperSaver");
    }
    if (mo.saved && !ignoringSaved && (mo.saveMultiplier ?? 1) !== 1) {
      setDamageActiveFlag(damage, "saved");
    }

    if (mo.saved && !ignoringSaved) {
      const multiplier = ignoringSuperSaver
        ? configSettings.defaultSaveMultiplier
        : (mo.superSaver ? 0 : (mo.saveMultiplier ?? 1));
      damage.value = damage.value * multiplier;
      foundry.utils.setProperty(damage, "active.multiplier", (damage.active?.multiplier ?? 1) * multiplier);
    } else if (mo.superSaver && !ignoringSuperSaver) {
      damage.value = damage.value * configSettings.defaultSaveMultiplier;
      foundry.utils.setProperty(damage, "active.multiplier", (damage.active?.multiplier ?? 1) * configSettings.defaultSaveMultiplier);
    }
  }
}

function applyUncannyDodge({ actor, damages, options }: DamageCalcParams): void {
  const mo = options.midi;
  if (!mo?.uncannyDodge || options.ignore === true) return;

  //@ts-expect-error no dnd5e types
  const actorTraits = actor.system?.traits ?? {};

  for (const damage of damages) {
    if (shouldIgnore(options, "uncannyDodge", damage.type, actorTraits, true)) continue;
    setDamageActiveFlag(damage, "uncannyDodge");
    //@ts-expect-error multiplier exists
    foundry.utils.setProperty(damage, "multiplier", (damage.multiplier ?? 1) * 0.5);
    damage.value = damage.value * 0.5;
  }
}

function applyTraitMultipliers({ actor, damages, options }: DamageCalcParams): void {
  if (options.midi?.noCalc) return;

  //@ts-expect-error no dnd5e types
  const actorTraits = actor.system?.traits ?? {};

  for (const damage of damages) {
    if (damage.active?.resistance) {
      damage.value = damage.value * 2 * configSettings.damageResistanceMultiplier;
      damage.active.multiplier = (damage.active.multiplier ?? 1) * 2 * configSettings.damageResistanceMultiplier;
    }
    if (damage.active?.vulnerability) {
      damage.active.multiplier = (damage.active.multiplier ?? 1) / 2 * configSettings.damageVulnerabilityMultiplier;
      damage.value = damage.value / 2 * configSettings.damageVulnerabilityMultiplier;
    }
    const absorptionValue = actorTraits.da?.[damage.type];
    if (absorptionValue !== undefined && !shouldIgnore(options, "absorption", damage.type, actorTraits)) {
      const multiplier = Number(absorptionValue) ?? -1;
      damage.active ??= {};
      damage.active.multiplier = (damage.active.multiplier ?? 1) * multiplier;
      damage.value *= multiplier;
      damage.damage = damage.value;
      damage.active.absorption = true;
    }
  }
}

function applyCustomResistances({ actor, damages, options }: DamageCalcParams): void {
  const categories = { di: "immunity", dr: "resistance", dv: "vulnerability", da: "absorption" };
  const traitMultipliers = {
    dr: configSettings.damageResistanceMultiplier,
    di: configSettings.damageImmunityMultiplier,
    da: -1,
    dv: configSettings.damageVulnerabilityMultiplier,
  };

  //@ts-expect-error no dnd5e types
  const actorTraits = actor.system?.traits ?? {};

  for (const trait of ["da", "dv", "di", "dr"] as const) {
    const traitData = actorTraits[trait];
    if (!traitData) continue;

    const bypasses = traitData.bypasses ?? new Set();
    const customs = [
      ...((traitData.custom ?? "").split(";").map((s: string) => s.trim())),
      ...Object.keys(traitData.midi ?? {}),
    ].filter((c: string) => c !== "");

    for (let custom of customs) {
      const normalizedCustom = Object.keys(GameSystemConfig.customDamageResistanceTypes ?? {})
        .find(key => (GameSystemConfig.customDamageResistanceTypes[key] as string).toLowerCase() === custom.toLowerCase()) ?? custom;

      const matcher = CUSTOM_RESISTANCE_MATCHERS[custom] ?? CUSTOM_RESISTANCE_MATCHERS[normalizedCustom];

      for (const damage of damages) {
        if (damage.type === "midi-none") continue;
        if (GameSystemConfig.healingTypes[damage.type]) continue;
        if (damage.active?.[categories[trait]]) continue;
        if (damage.active?.[custom]) continue;
        if (shouldIgnore(options, categories[trait], damage.type, actorTraits)) continue;
        if (shouldIgnore(options, custom, damage.type, actorTraits)) continue;

        const matches = matcher
          ? matcher.match(damage, bypasses)
          : damage.properties?.has(custom);

        if (!matches) continue;

        damage.active ??= {};
        damage.active[GameSystemConfig.customDamageResistanceTypes?.[normalizedCustom] ?? custom] = true;
        damage.active[categories[trait]] = true;

        let multiplier = traitMultipliers[trait];
        const daOverride = actorTraits.da?.midi?.[custom] ?? actorTraits.da?.midi?.all;
        if (daOverride && Number.isNumeric(daOverride)) {
          multiplier = Number(daOverride);
        }

        damage.active.multiplier = (damage.active.multiplier ?? 1) * multiplier;
        damage.value = damage.value * multiplier;
        damage.damage = damage.value;
      }
    }
  }
}

function applyDamageReduction({ actor, damages, options }: DamageCalcParams): boolean {
  if (options.ignore === true) return true;
  if (options.ignore?.DR?.has("none") || options.ignore?.DR?.has("all")) return true;

  //@ts-expect-error no dnd5e types
  const actorTraits = actor.system?.traits ?? {};
  const specials = Object.keys(actorTraits?.dm?.midi ?? {});
  if (!specials.length) return true;

  // For DRSaveDr, distribute DR proportionally into individual damage entries
  // so that subsequent saves and resistance/vulnerability see reduced values.
  if (configSettings.saveDROrder === "DRSaveDr") {
    return applyDamageReductionInline({ actor, damages, options }, specials, actorTraits);
  }

  let drAllActives: string[] = [];
  let dmAll = 0;

  const selectDamages = (predicate: (d: DamageDescription, bypasses?: Set<string>) => boolean): number => {
    const bypasses = actorTraits.dm?.bypasses ?? new Set();
    return damages.reduce((total, damage) => {
      if (damage.value === 0 || isDRType(damage.type)) return total;
      return total + (predicate(damage, bypasses) ? damage.value : 0);
    }, 0);
  };

  for (const special of specials) {
    if (options.ignore?.modification === true) continue;
    if (options.ignore?.modification?.has?.(special)) continue;

    const bypasses = actorTraits.dm?.bypasses ?? new Set();
    const dmRoll = new Roll(`${actorTraits.dm.midi[special]}`, actor.getRollData() as any);
    const dm = doSyncRoll(dmRoll, `traits.dm.midi.${special}`)?.total ?? 0;

    if (!dm) continue;

    const matcher = CUSTOM_RESISTANCE_MATCHERS[special];
    let selectedDamage: number;
    let dmActive = "";

    if (matcher) {
      selectedDamage = selectDamages((d) => !GameSystemConfig.healingTypes[d.type] && matcher.match(d, bypasses));
      if (selectedDamage > 0) dmActive = i18n(matcher.label);
    } else {
      selectedDamage = 0;
    }

    if (selectedDamage > 0 && dm) {
      let appliedDm = dm;
      if (Math.sign(selectedDamage + appliedDm) !== Math.sign(selectedDamage)) {
        appliedDm = -selectedDamage;
      }

      if (checkRule("maxDRValue") && (appliedDm < dmAll || dmAll === 0)) {
        dmAll = appliedDm;
        drAllActives = [dmActive];
      } else if (!checkRule("maxDRValue")) {
        drAllActives.push(dmActive);
        dmAll += appliedDm;
      }
    }
  }

  if (!dmAll) return true;

  const { totalDamage } = damages.reduce((acc, d) => {
    if (d.type === "temphp") acc.temp += d.value;
    else if (d.type !== "midi-none" && d.type !== "vitality") acc.totalDamage += d.value;
    return acc;
  }, { totalDamage: 0, temp: 0 });

  if (Math.sign(totalDamage) !== Math.sign(dmAll + totalDamage)) {
    dmAll = -totalDamage;
  }

  if (dmAll) {
    const drEntry: DamageDescription = {
      type: "none",
      value: dmAll,
      active: { multiplier: 1 },
      allActives: drAllActives,
      properties: new Set(),
    };
    setDamageActiveFlag(drEntry, "DR");
    damages.push(drEntry);
  }

  for (let i = damages.length - 1; i >= 0; i--) {
    if (damages[i].type === "midi-none") {
      damages.splice(i, 1);
    }
  }
  return true;
}

/**
 * For DRSaveDr mode: distribute DR proportionally across individual damage entries
 * rather than pushing a separate "none" entry. This ensures saves and resistance/vulnerability
 * applied afterward operate on the already-reduced per-type values.
 *
 * Two passes: specific DRs first (non-"all"), then dm.midi.all on remaining values.
 */
function applyDamageReductionInline(
  { actor, damages, options }: DamageCalcParams,
  specials: string[],
  actorTraits: any
): boolean {
  const useMaxDR = checkRule("maxDRValue");
  let totalDRApplied = 0;
  const drAllActives: string[] = [];

  /** Distribute drAmount (negative) proportionally across matching damage entries. Returns actual (negative) amount applied. */
  function distributeProportionally(drLabel: string, drAmount: number, predicate: (d: DamageDescription, bypasses?: Set<string>) => boolean): number {
    const bypasses = actorTraits.dm?.bypasses ?? new Set();
    const matching = damages.filter(d =>
      d.value > 0 && !isDRType(d.type) && !GameSystemConfig.healingTypes[d.type] && predicate(d, bypasses)
    );
    const totalMatching = matching.reduce((sum, d) => sum + d.value, 0);
    if (totalMatching <= 0 || drAmount >= 0) return 0;

    let effectiveDR = drAmount;
    if (Math.abs(effectiveDR) > totalMatching) effectiveDR = -totalMatching;

    for (const entry of matching) {
      const share = (entry.value / totalMatching) * Math.abs(effectiveDR);
      entry.value -= share;
    }
    return effectiveDR;
  }

  function computeDR(special: string): number {
    if (options.ignore === true) return 0;
    if (options.ignore?.modification === true) return 0;
    if (options.ignore?.modification?.has?.(special)) return 0;
    const dmRoll = new Roll(`${actorTraits.dm.midi[special]}`, actor.getRollData() as any);
    return doSyncRoll(dmRoll, `traits.dm.midi.${special}`)?.total ?? 0;
  }

  // --- Pass 1: Specific DRs (non-"all") ---
  const specificSpecials = specials.filter(s => s !== "all");

  if (useMaxDR) {
    // Pick the specific DR with greatest effective impact
    let bestDR = 0;
    let bestSpecial = "";
    let bestMatcher: { match: DamagePredicate; label: string } | undefined;

    for (const special of specificSpecials) {
      const dm = computeDR(special);
      if (!dm) continue;
      const matcher = CUSTOM_RESISTANCE_MATCHERS[special];
      if (!matcher) continue;

      const bypasses = actorTraits.dm?.bypasses ?? new Set();
      const selectedDamage = damages
        .filter(d => d.value > 0 && !isDRType(d.type) && !GameSystemConfig.healingTypes[d.type] && matcher.match(d, bypasses))
        .reduce((sum, d) => sum + d.value, 0);

      const effectiveImpact = Math.min(Math.abs(dm), selectedDamage);
      if (effectiveImpact > Math.abs(bestDR)) {
        bestDR = dm;
        bestSpecial = special;
        bestMatcher = matcher;
      }
    }

    if (bestDR && bestMatcher) {
      const applied = distributeProportionally(bestSpecial, bestDR, (d, bypasses) => bestMatcher!.match(d, bypasses));
      totalDRApplied += Math.abs(applied);
      drAllActives.push(i18n(bestMatcher.label));
    }
  } else {
    // Stack all specific DRs sequentially (each sees values left by previous)
    for (const special of specificSpecials) {
      const dm = computeDR(special);
      if (!dm) continue;
      const matcher = CUSTOM_RESISTANCE_MATCHERS[special];
      if (!matcher) continue;

      const applied = distributeProportionally(special, dm, (d, bypasses) => matcher.match(d, bypasses));
      if (applied) {
        totalDRApplied += Math.abs(applied);
        drAllActives.push(i18n(matcher.label));
      }
    }
  }

  // --- Pass 2: dm.midi.all (after specifics) ---
  if (specials.includes("all")) {
    const dm = computeDR("all");
    if (dm) {
      if (useMaxDR) {
        // Compare effective impact of "all" against already-applied specific DR
        const remaining = damages
          .filter(d => d.value > 0 && !isDRType(d.type) && !GameSystemConfig.healingTypes[d.type])
          .reduce((sum, d) => sum + d.value, 0);
        const allImpact = Math.min(Math.abs(dm), remaining);

        if (allImpact > totalDRApplied) {
          // "all" provides more reduction — apply the difference as top-up
          const topUp = -(allImpact - totalDRApplied);
          const applied = distributeProportionally("all (top-up)", topUp, () => true);
          totalDRApplied += Math.abs(applied);
          drAllActives.push(i18n(CUSTOM_RESISTANCE_MATCHERS["all"].label));
        }
      } else {
        // Stack: apply "all" on remaining values
        const applied = distributeProportionally("all", dm, () => true);
        if (applied) {
          totalDRApplied += Math.abs(applied);
          drAllActives.push(i18n(CUSTOM_RESISTANCE_MATCHERS["all"].label));
        }
      }
    }
  }

  // Push display-only entry so the damage card/tooltip shows the DR amount
  if (totalDRApplied) {
    const drEntry: DamageDescription = {
      type: "none",
      value: 0,
      active: { multiplier: 1, inlined: true },
      allActives: drAllActives,
      properties: new Set(),
      displayValue: -totalDRApplied,
    };
    setDamageActiveFlag(drEntry, "DR");
    damages.push(drEntry);
  }

  for (let i = damages.length - 1; i >= 0; i--) {
    if (damages[i].type === "midi-none") damages.splice(i, 1);
  }
  return true;
}

function recalculateTotals({ damages }: DamageCalcParams): void {
  //@ts-expect-error amount exists on damages array
  damages.amount = 0;
  //@ts-expect-error temp exists on damages array
  damages.temp = 0;

  for (const damage of damages) {
    if (damage.active?.inlined) continue;
    if (damage.type === "temphp") {
      //@ts-expect-error
      damages.temp += damage.value;
    } else {
      //@ts-expect-error
      damages.amount += damage.value;
    }
  }

  //@ts-expect-error
  damages.amount = damages.amount > 0 ? Math.floor(damages.amount) : Math.ceil(damages.amount);

  //@ts-expect-error
  if (damages.amount < 0) {
    for (const damage of damages) {
      if (damage.type === "none" && damage.active?.DR && !damage.active?.inlined) {
        //@ts-expect-error
        damage.value -= damages.amount;
        //@ts-expect-error
        damages.amount = 0;
        break;
      }
    }
  }
}

function calculateTotalDamage({ damages, options }: DamageCalcParams): number {
  return damages.reduce((total, damage) => {
    if (damage.active?.inlined) return total;
    let value = damage.value;
    if (options.invertHealing !== false && damage.type === "healing") value = -value;
    if (damage.type === "temphp" || damage.type === "midi-none") value = 0;
    return total + value;
  }, 0);
}

// --- dnd5e 5.3+ variants ---

function applyTraitMultipliers_53({ actor, damages, options }: DamageCalcParams): void {
  if (options.midi?.noCalc) return;

  //@ts-expect-error no dnd5e types
  const actorTraits = actor.system?.traits ?? {};

  for (const damage of damages) {
    const hasResistance = damage.active?.type?.resistance || damage.active?.all?.resistance;
    const hasVulnerability = damage.active?.type?.vulnerability || damage.active?.all?.vulnerability;
    if (hasResistance) {
      damage.value = damage.value * 2 * configSettings.damageResistanceMultiplier;
      damage.active ??= {};
      damage.active.multiplier = (damage.active.multiplier ?? 1) * 2 * configSettings.damageResistanceMultiplier;
    }
    if (hasVulnerability) {
      damage.active ??= {};
      damage.active.multiplier = (damage.active.multiplier ?? 1) / 2 * configSettings.damageVulnerabilityMultiplier;
      damage.value = damage.value / 2 * configSettings.damageVulnerabilityMultiplier;
    }
    const absorptionValue = actorTraits.da?.[damage.type];
    if (absorptionValue !== undefined && !shouldIgnore(options, "absorption", damage.type, actorTraits)) {
      const multiplier = Number(absorptionValue) ?? -1;
      damage.active ??= {};
      damage.active.multiplier = (damage.active.multiplier ?? 1) * multiplier;
      damage.value *= multiplier;
      damage.damage = damage.value;
      setDamageActiveFlag(damage, "absorption");
    }
  }
}

function applyCustomResistances_53({ actor, damages, options }: DamageCalcParams): void {
  const categories = { di: "immunity", dr: "resistance", dv: "vulnerability", da: "absorption" };
  const traitMultipliers = {
    dr: configSettings.damageResistanceMultiplier,
    di: configSettings.damageImmunityMultiplier,
    da: -1,
    dv: configSettings.damageVulnerabilityMultiplier,
  };

  //@ts-expect-error no dnd5e types
  const actorTraits = actor.system?.traits ?? {};

  for (const trait of ["da", "dv", "di", "dr"] as const) {
    const traitData = actorTraits[trait];
    if (!traitData) continue;

    const bypasses = traitData.bypasses ?? new Set();
    const customs = [
      ...((traitData.custom ?? "").split(";").map((s: string) => s.trim())),
      ...Object.keys(traitData.midi ?? {}),
    ].filter((c: string) => c !== "");

    for (let custom of customs) {
      const normalizedCustom = Object.keys(GameSystemConfig.customDamageResistanceTypes ?? {})
        .find(key => (GameSystemConfig.customDamageResistanceTypes[key] as string).toLowerCase() === custom.toLowerCase()) ?? custom;

      const matcher = CUSTOM_RESISTANCE_MATCHERS[custom] ?? CUSTOM_RESISTANCE_MATCHERS[normalizedCustom];

      for (const damage of damages) {
        if (damage.type === "midi-none") continue;
        if (GameSystemConfig.healingTypes[damage.type]) continue;
        // Check nested (dnd5e 5.3+) active keys using helper
        if (getDamageActiveFlag(damage, categories[trait])) continue;
        if (getDamageActiveFlag(damage, custom)) continue;
        if (shouldIgnore(options, categories[trait], damage.type, actorTraits)) continue;
        if (shouldIgnore(options, custom, damage.type, actorTraits)) continue;

        const matches = matcher
          ? matcher.match(damage, bypasses)
          : damage.properties?.has(custom);

        if (!matches) continue;

        setDamageActiveFlag(damage, GameSystemConfig.customDamageResistanceTypes?.[normalizedCustom] ?? custom);
        setDamageActiveFlag(damage, categories[trait]);

        damage.active ??= {};
        let multiplier = traitMultipliers[trait];
        const daOverride = actorTraits.da?.midi?.[custom] ?? actorTraits.da?.midi?.all;
        if (daOverride && Number.isNumeric(daOverride)) {
          multiplier = Number(daOverride);
        }

        damage.active.multiplier = (damage.active.multiplier ?? 1) * multiplier;
        damage.value = damage.value * multiplier;
        damage.damage = damage.value;
      }
    }
  }
}

function recalculateTotals_53({ damages }: DamageCalcParams): void {
  //@ts-expect-error amount exists on damages array
  damages.amount = 0;
  //@ts-expect-error temp exists on damages array
  damages.temp = 0;
  //@ts-expect-error tempMax exists on damages array
  damages.tempMax = 0;

  for (const damage of damages) {
    if (damage.active?.inlined) continue;
    if (damage.type === "temphp") {
      //@ts-expect-error
      damages.temp += damage.value;
    } else if (damage.type === "maximum") {
      //@ts-expect-error
      damages.tempMax += damage.value;
    } else {
      //@ts-expect-error
      damages.amount += damage.value;
    }
  }

  //@ts-expect-error
  damages.amount = damages.amount > 0 ? Math.floor(damages.amount) : Math.ceil(damages.amount);

  //@ts-expect-error
  if (damages.amount < 0) {
    for (const damage of damages) {
      if (damage.type === "none" && getDamageActiveFlag(damage, "DR") && !damage.active?.inlined) {
        //@ts-expect-error
        damage.value -= damages.amount;
        //@ts-expect-error
        damages.amount = 0;
        break;
      }
    }
  }
}

function calculateTotalDamage_53({ damages, options }: DamageCalcParams): number {
  return damages.reduce((total, damage) => {
    if (damage.active?.inlined) return total;
    let value = damage.value;
    if (options.invertHealing !== false && damage.type === "healing") value = -value;
    if (damage.type === "temphp" || damage.type === "midi-none" || damage.type === "maximum") value = 0;
    return total + value;
  }, 0);
}

function preCalculateDamageHandler(actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) {
  try {
    if (options.midi?.noCalc) return true;

    const sourceActor = options.midi?.sourceActorUuid
      ? fromUuidSync(options.midi.sourceActorUuid) as Actor.Implementation | undefined
      : undefined;
    const params = { actor, sourceActor, damages, options };

    const saveDROrder = configSettings.saveDROrder;
    computeSourceIgnores(params);
    applyUncannyDodge(params);

    // Apply saves and/or DR based on order setting
    if (saveDROrder === "DRSaveDr") {
      if (!applyDamageReduction(params)) return false;
    } else if (["SaveDrDR", "SaveDRDr"].includes(saveDROrder)) {
      applySaves(params);
      if (saveDROrder === "SaveDRDr") {
        if (!applyDamageReduction(params)) return false;
      }
    }

    foundry.utils.setProperty(options, "midi.totalDamage", calculateTotalDamage(params));
    if (Hooks.call("midi-qol.dnd5ePreCalculateDamage", actor, damages, options) === false) return false;
  } catch (err) {
    const message = `Error in preCalculateDamage`;
    error(message, err);
    TroubleShooter.recordError(err, message);
  }
  return true;
}

function calculateDamageHandler(actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) {
  try {
    if (options.midi?.noCalc) return true;

    const sourceActor = options.midi?.sourceActorUuid
      ? fromUuidSync(options.midi.sourceActorUuid) as Actor.Implementation | undefined
      : undefined;
    const params = { actor, sourceActor, damages, options };

    const saveDROrder = configSettings.saveDROrder;

    // Apply saves if not already done
    if (saveDROrder === "DRSaveDr") {
      applySaves(params);
    }

    applyTraitMultipliers(params);
    applyCustomResistances(params);

    // Apply DR if not already done
    if (saveDROrder === "SaveDrDR") {
      if (!applyDamageReduction(params)) return false;
    }

    recalculateTotals(params);
    if (Hooks.call("midi-qol.dnd5eCalculateDamage", actor, damages, options) === false) return false;
  } catch (err) {
    error(err);
  }
  return true;
}

function preCalculateDamageHandler_53(actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) {
  try {
    if (options.midi?.noCalc) return true;

    const sourceActor = options.midi?.sourceActorUuid
      ? fromUuidSync(options.midi.sourceActorUuid) as Actor.Implementation | undefined
      : undefined;
    const params = { actor, sourceActor, damages, options };

    const saveDROrder = configSettings.saveDROrder;
    computeSourceIgnores(params);
    applyUncannyDodge(params);

    // Apply saves and/or DR based on order setting
    if (saveDROrder === "DRSaveDr") {
      if (!applyDamageReduction(params)) return false;
    } else if (["SaveDrDR", "SaveDRDr"].includes(saveDROrder)) {
      applySaves(params);
      if (saveDROrder === "SaveDRDr") {
        if (!applyDamageReduction(params)) return false;
      }
    }

    foundry.utils.setProperty(options, "midi.totalDamage", calculateTotalDamage_53(params));
    if (Hooks.call("midi-qol.dnd5ePreCalculateDamage", actor, damages, options) === false) return false;
  } catch (err) {
    const message = `Error in preCalculateDamage`;
    error(message, err);
    TroubleShooter.recordError(err, message);
  }
  return true;
}

function calculateDamageHandler_53(actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) {
  try {
    if (options.midi?.noCalc) return true;

    const sourceActor = options.midi?.sourceActorUuid
      ? fromUuidSync(options.midi.sourceActorUuid) as Actor.Implementation | undefined
      : undefined;
    const params = { actor, sourceActor, damages, options };

    const saveDROrder = configSettings.saveDROrder;

    // Apply saves if not already done
    if (saveDROrder === "DRSaveDr") {
      applySaves(params);
    }

    applyTraitMultipliers_53(params);
    applyCustomResistances_53(params);

    // Apply DR if not already done
    if (saveDROrder === "SaveDrDR") {
      if (!applyDamageReduction(params)) return false;
    }

    recalculateTotals_53(params);
    if (Hooks.call("midi-qol.dnd5eCalculateDamage", actor, damages, options) === false) return false;
  } catch (err) {
    error(err);
  }
  return true;
}

Hooks.on("dnd5e.preApplyDamage", (actor, amount, updates, options) => {
  if (updates["system.attributes.hp.temp"]) updates["system.attributes.hp.temp"] = Math.floor(updates["system.attributes.hp.temp"]);

  // Handle vitality overflow when HP reaches 0 (for actor.applyDamage() calls)
  // Skip if midi-qol already handled vitality (e.g., via workflow with direct vitality damage + overflow)
  // This hook handles non-midi damage calls (actor.applyDamage()) that need vitality overflow
  const vitalityItem = getVitalityItem(actor);
  if (amount > 0 && vitalityItem && !options.midiVitalityHandled) {
    // @ts-expect-error no dnd5e-types
    const currentHP = actor.system.attributes.hp.value ?? 0;
    // @ts-expect-error no dnd5e-types
    const currentTempHP = actor.system.attributes.hp.temp ?? 0;
    const totalHP = currentTempHP + currentHP;

    // Check if damage exceeds total HP (causes overflow into vitality)
    if (amount > totalHP) {
      const overflowDamage = amount - totalHP;

      // @ts-expect-error uses exists on items with uses
      const currentSpent = vitalityItem.system.uses?.spent ?? 0;
      // @ts-expect-error uses exists on items with uses
      const maxUses = vitalityItem.system.uses?.max ?? 0;
      const newSpent = Math.min(maxUses, currentSpent + overflowDamage);

      // Mark that vitality was handled to prevent double-counting in preUpdateActor
      options.midiVitalityHandled = true;
      // Flag that vitality update is pending so updateActor hook skips checkWounded
      options.midiVitalityUpdatePending = true;

      // Queue vitality item update (will execute after actor update)
      // Use setTimeout to ensure it happens after the actor update completes
      // Note: checkWounded is called by the updateItem hook when vitality changes,
      // so we don't need to call it explicitly here
      setTimeout(async () => {
        // @ts-expect-error item update for uses.spent
        await vitalityItem.update({ "system.uses.spent": newSpent });
      }, 100);
    }
  }

  if (options.midi) {
    foundry.utils.setProperty(options, "midi.amount", amount);
    foundry.utils.setProperty(options, "midi.updates", updates);
  }
  return true;
});

Hooks.on("dnd5e.preRollConcentration", (rollConfig, dialogConfig, messageConfig) => {
  // Advantage/disadvantage for concentration saves is now handled by rollTypeHandlers["concentration"]
  // in patching.ts, which composes with the save handler and adds concentration-specific flags.
  // This hook only needs to handle the noConcentrationCheck workflow option.
  if (rollConfig.workflowOptions?.noConcentrationCheck) return false;
  return true;
})

Hooks.on("dnd5e.rollConcentration", (rolls, { subject }) => {
  if (!subject || !(subject instanceof CONFIG.Actor.documentClass)) {
    const message = "dnd5e.rollConcentration hook called with non-actor";
    TroubleShooter.recordError(new Error(message), message);
    error(message, subject);
    return;
  }
  if (rolls instanceof Roll) rolls = [rolls];
  // Assume concentration fails if any of the concentration rolls fail.
  let failed = false;
  for (let roll of rolls) {
    // @ts-expect-error no dnd5e-types
    if (roll.isFailure) failed = true;
  }
  if (configSettings.keepRollStats) {
    gameStats.addConcentrationResult(subject, !failed);
  }
  // The "item" path handles criticalSaves and endConcentration via its own workflow/macros
  if (configSettings.doConcentrationCheck === "item") return;
  for (let roll of rolls) {
    // @ts-expect-error no dnd5e-types
    if (checkRule("criticalSaves") && roll.isCritical) roll.options.success = true;
  }
  if (configSettings.removeConcentration && failed) {
    // @ts-expect-error no dnd5e-types
    subject.endConcentration();
  }
});

// Set midi-qol flags on activity templates for use during preview and placement.
// When constrainTemplatePlacement is enabled:
// - Sets sourceTokenUuid for all templates
// - Sets maxRange for templates with limited range (clamps placement during preview)
// - Sets anchorToToken for cone/ray templates with range Self/None
Hooks.on("dnd5e.preCreateActivityTemplate", (activity, templateData) => {
  templateData.distance! += 0.000001; // Make the template fractionally larger to avoid rounding errors

  if (!configSettings.constrainTemplatePlacement) return true;

  // Get the caster's token and store its UUID for later use
  const actor = activity.actor;
  const token = actor ? tokenForActor(actor) : undefined;
  if (token) {
    foundry.utils.setProperty(templateData, "flags.midi-qol.sourceTokenUuid", token.document.uuid);
  }

  const range = activity.range;
  const rangeUnits = range?.units;

  // Calculate and store max range for templates that should be range-limited
  // Only set maxRange for range types that should be limited (not self/none/any)
  if (rangeUnits && rangeUnits !== "self" && rangeUnits !== "none" && rangeUnits !== "any") {
    let maxRange = range.long || range.value;
    if (maxRange && maxRange > 0) {
      if (rangeUnits === "touch") maxRange = canvas?.dimensions?.distance ?? 5;
      else maxRange = rangeToSceneUnits(maxRange, rangeUnits);
      foundry.utils.setProperty(templateData, "flags.midi-qol.maxRange", maxRange);
    }
  }

  // Check if this template should be anchored to the caster's token
  // Cones and rays with range self/none/0 should be anchored
  const templateType = templateData.t;
  if (templateType === "cone" || templateType === "ray") {
    const isSelfRange = rangeUnits === "self"
      || rangeUnits === "none"
      || (!range?.value && !range?.long && rangeUnits !== "touch");

    if (isSelfRange) {
      foundry.utils.setProperty(templateData, "flags.midi-qol.anchorToToken", true);
    }
  }
  return true;
});

// Check template placement range - prevent placing templates beyond the activity's range
// This is a safety check - the preview movement should already clamp position within range
Hooks.on("preCreateMeasuredTemplate", (templateDoc: MeasuredTemplateDocument.Implementation, templateData: MeasuredTemplateDocument.CreateData, options: object, userId: string) => {
  if (userId !== game.user?.id) return true;

  // Use pre-set midi-qol flags from preCreateActivityTemplate hook
  const midiFlags = templateDoc.flags?.[MODULE_ID] as { maxRange?: number, sourceTokenUuid?: string } | undefined;
  const maxRange = midiFlags?.maxRange;
  if (!maxRange) return true;

  const sourceTokenUuid = midiFlags?.sourceTokenUuid;
  if (!sourceTokenUuid) return true;

  // Get the source token
  const tokenDoc = fromUuidSync(sourceTokenUuid) as TokenDocument.Implementation | null;
  const token = tokenDoc?.object;
  if (!token) return true;

  // Calculate raw grid distance from token perimeter to template position
  const templateX = templateDoc.x;
  const templateY = templateDoc.y;
  if (templateX === undefined || templateY === undefined) return true;

  const poly = getTokenPerimeterPolygon(token);
  const closest = closestPointOnPerimeter(poly, templateX, templateY);
  const distance = measurePointDistance(closest, { x: templateX, y: templateY });
  // Allow half a grid square tolerance for grid snapping moving the position slightly beyond range
  const tolerance = (canvas?.dimensions?.distance ?? 5) / 2;
  if (distance <= maxRange + tolerance) return true;

  // Out of range - notify and cancel
  ui.notifications?.warn(i18n("midi-qol.TemplateOutOfRange"));
  return false;
});

// insert midi initiative changes into the initiative config.
Hooks.on("dnd5e.preConfigureInitiative", (actor, rollConfig) => {
  let { parts, data, options } = rollConfig;
  //@ts-expect-error no dnd5e-types
  const init: string = actor.system.attributes.init.value ?? "dex";
  const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: actor });

  // Check for advantage
  if (evalAllConditions(actor, "flags.midi-qol.advantage.all", conditionData)
    || evalAllConditions(actor, "flags.midi-qol.advantage.check.all", conditionData)
    || evalAllConditions(actor, `flags.midi-qol.advantage.check.${init}`, conditionData)
    || evalAllConditions(actor, `flags.${game.system?.id}.initiativeAdv`, conditionData)) {
    options.advantage ||= true;
  }

  // Check for disadvantage
  if (evalAllConditions(actor, "flags.midi-qol.disadvantage.all", conditionData)
    || evalAllConditions(actor, "flags.midi-qol.disadvantage.check.all", conditionData)
    || evalAllConditions(actor, `flags.midi-qol.disadvantage.check.${init}`, conditionData)
    || evalAllConditions(actor, `flags.${game.system?.id}.initiativeDisadv`, conditionData)) {
    options.disadvantage ||= true;
  }

  // Check for noAdvantage (prevents advantage)
  if (evalAllConditions(actor, "flags.midi-qol.noAdvantage.all", conditionData)
    || evalAllConditions(actor, "flags.midi-qol.noAdvantage.initiative", conditionData)
    || evalAllConditions(actor, `flags.${game.system?.id}.initiativeNoAdv`, conditionData)) {
    options.advantage = false;
  }

  // Check for noDisadvantage (prevents disadvantage)
  if (evalAllConditions(actor, "flags.midi-qol.noDisadvantage.all", conditionData)
    || evalAllConditions(actor, "flags.midi-qol.noDisadvantage.initiative", conditionData)
    || evalAllConditions(actor, `flags.${game.system?.id}.initiativeNoDisadv`, conditionData)) {
    options.disadvantage = false;
  }

  if (foundry.utils.getProperty(actor, `flags.${game.system?.id}.initiativeHalfProficiency`) && !parts.includes("@prof")) {
    parts.push("@prof");
    // @ts-expect-error
    data.prof = new globalThis.dnd5e.documents.Proficiency(data.attributes.prof, 0.5, false);
  }
});


