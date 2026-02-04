import { checkRule, configSettings, safeGetGameSetting, shouldDisplaySaveDC } from "./settings.js";
import { i18n, log, warn, gameStats, getCanvas, error, debugEnabled, debug, GameSystemConfig, MODULE_ID } from "../midi-qol.js";
import { canSense, getToken, getTokenDocument, gmOverTimeEffect, fromActorUuid, promptReactions, hasUsedAction, hasUsedBonusAction, hasUsedReaction, removeActionUsed, removeBonusActionUsed, removeReactionUsed, ReactionItemReference, isEffectExpired, expireEffects, getAppliedEffects, CERemoveEffect, CEAddEffectWith, getActor, completeItemUse, completeActivityUse, localActivityOverTimeEffect, isValidTarget, hasUsedAnyReaction, getVitalityItem, getVitalityValue } from "./utils.js";
import { ddbglPendingFired } from "./chatMessageHandling.js";
import { DamageDescriptionObject, Workflow, WorkflowOptions } from "./Workflow.js";
import { bonusCheck, checkWounded } from "./patching.js";
import { queueUndoData, startUndoWorkflow, updateUndoChatCardUuids, _removeMostRecentWorkflow, _undoMostRecentWorkflow, undoTillWorkflow, _queueUndoDataDirect, updateUndoChatCardUuidsById } from "./undo.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { installedModules } from "./setupModules.js";
import { Stats } from "./RollStats.js";
import { AnyMutableObject } from "fvtt-types/utils";
import { DamageApplicationOptions, DamageDescription, DamageListEntry } from "../globals.js";
const { DialogV2 } = foundry.applications.api;

export let socketlibSocket: any = undefined;
let traitList = { di: "", dr: "", dv: "", dm: "", da: "" };

export let setupSocket = () => {
  socketlibSocket = globalThis.socketlib.registerModule(MODULE_ID);
  socketlibSocket.register("_gmSetFlag", _gmSetFlag);
  socketlibSocket.register("_gmUnsetFlag", _gmUnsetFlag);
  socketlibSocket.register("addConvenientEffect", addConvenientEffect);
  socketlibSocket.register("addDependent", _addDependent);
  socketlibSocket.register("applyEffects", _applyEffects);
  socketlibSocket.register("bonusCheck", _bonusCheck);
  socketlibSocket.register("chooseReactions", localDoReactions);
  socketlibSocket.register("completeItemUse", _completeItemUse);
  socketlibSocket.register("completeItemUseV2", _completeItemUse);
  socketlibSocket.register("completeActivityUse", _completeActivityUse);
  socketlibSocket.register("confirmDamageRollComplete", confirmDamageRollComplete);
  socketlibSocket.register("confirmDamageRollCompleteHit", confirmDamageRollCompleteHit);
  socketlibSocket.register("confirmDamageRollCompleteMiss", confirmDamageRollCompleteMiss);
  socketlibSocket.register("cancelWorkflow", cancelWorkflow);
  socketlibSocket.register("createActor", createActor);
  socketlibSocket.register("createChatMessage", _createChatMessage);
  socketlibSocket.register("createEffects", createEffects);
  socketlibSocket.register("createReverseDamageCard", createReverseDamageCard);
  socketlibSocket.register("D20Roll", _D20Roll);
  socketlibSocket.register("ddbglPendingFired", ddbglPendingFired);
  socketlibSocket.register("deleteEffects", deleteEffects);
  socketlibSocket.register("deleteEffectsByUuid", deleteEffectsByUuid);
  socketlibSocket.register("deleteItemEffects", deleteItemEffects);
  socketlibSocket.register("deleteToken", deleteToken);
  socketlibSocket.register("gmOverTimeEffect", _gmOverTimeEffect);
  socketlibSocket.register("localActivityOverTimeEffect", _localActivityOverTimeEffect);
  socketlibSocket.register("monksTokenBarSaves", monksTokenBarSaves);
  socketlibSocket.register("flashTokenBarSaves", flashTokenBarSaves);
  socketlibSocket.register("moveToken", _moveToken);
  socketlibSocket.register("moveTokenAwayFromPoint", _moveTokenAwayFromPoint);
  socketlibSocket.register("queueUndoData", queueUndoData);
  socketlibSocket.register("queueUndoDataDirect", _queueUndoDataDirect);
  socketlibSocket.register("removeEffect", _removeEffect);
  socketlibSocket.register("removeCEEffect", _removeCEEffect);
  socketlibSocket.register("removeEffects", removeEffects);
  socketlibSocket.register("removeEffectUuids", removeEffectUuids);
  socketlibSocket.register("removeMostRecentWorkflow", _removeMostRecentWorkflow);
  socketlibSocket.register("removeStatsForActorId", removeActorStats);
  socketlibSocket.register("removeWorkflow", _removeWorkflow);
  socketlibSocket.register("rollAbility", rollAbility);
  socketlibSocket.register("rollAbilityV2", rollAbility);
  socketlibSocket.register("rollConcentration", rollConcentration);
  socketlibSocket.register("startUndoWorkflow", startUndoWorkflow);
  socketlibSocket.register("undoMostRecentWorkflow", _undoMostRecentWorkflow);
  socketlibSocket.register("undoTillWorkflow", undoTillWorkflow);
  socketlibSocket.register("updateActor", updateActor);
  socketlibSocket.register("updateEffects", updateEffects);
  socketlibSocket.register("updateEntityStats", GMupdateEntityStats)
  socketlibSocket.register("saveAllStats", GMsaveAllStats)
  socketlibSocket.register("updateUndoChatCardUuids", updateUndoChatCardUuids);
  socketlibSocket.register("updateUndoChatCardUuidsById", updateUndoChatCardUuidsById);
  socketlibSocket.register("removeActionBonusReaction", removeActionBonusReaction);
  socketlibSocket.register("rollActionSave", rollActionSave);
  socketlibSocket.register("toggleStatusEffect", _toggleStatusEffect);

  // socketlibSocket.register("canSense", _canSense);
}
async function _removeWorkflow(workflowId: string) {
  return Workflow.removeWorkflow(workflowId);
}

export class SaferSocket {

  #_socketlibSocket: any;
  constructor(socketlibSocket) {
    this.#_socketlibSocket = socketlibSocket;
  }
  canCall(handler) {
    if (game.user?.isGM) return true;
    switch (handler) {
      case "addDependent":
      case "applyEffects":
      case "bonusCheck":
      case "chooseReactions":
      case "completeItemUse":
      case "confirmDamageRollComplete":
      case "confirmDamageRollCompleteHit":
      case "confirmDamageRollCompleteMiss":
      case "cancelWorkflow":
      case "createChatMessage":
      case "createEffects":
      case "D20Roll":
      case "log":
      case "monksTokenBarSaves":
      case "flashTokenBarSaves":
      case "moveToken":
      case "moveTokenAwayFromPoint":
      case "removeWorkflow":
      case "rollAbility":
      case "rollAbilityV2":
      case "rollConcentration":
      case "removeEffect":
      case "removeActionBonusReaction":
      case "toggleStatusEffect":
        return true;

      case "addConvenientEffect":
      case "createActor":
      case "createReverseDamageCard":
      case "deleteEffects":
      case "deleteItemEffects":
      case "deleteToken":
      case "removeEffects":
      case "removeEffectUuids":
      case "updateActor":
      case "updateEffects":
      case "_gmSetFlag":
      case "_gmUnsetFlag":
        if (game.user?.isTrusted) return true;
        ui.notifications?.warn(`midi-qol | user ${game.user?.name} must be a trusted player to call ${handler} and will be disabled in the future`);
        return true; // TODO change this to false in the future.


      case "ddbglPendingFired":
      case "gmOverTimeEffect":
      case "queueUndoData":
      case "queueUndoDataDirect":
      case "removeStatsForActorId":
      case "removeMostRecentWorkflow":
      case "startUndoWorkflow":
      case "undoMostRecentWorkflow":
      case "undoTillWorkflow":
      case "updateEntityStats":
      case "saveAllStats":
      case "updateUndoChatCardUuids":
      case "updateUndoChatCardUuidsById":
      case "deleteEffectsByUuid":
      default:
        error(`Non-GMs are not allowed to call ${handler}`);
        return false;
    }
  }

  async executeAsGM(handler, ...args) {
    if (!this.canCall(handler)) return false;
    return await unTimedExecuteAsGM(handler, ...args);
  }
  async executeAsUser(handler, userId, ...args) {
    if (!this.canCall(handler)) return false;
    return await this.#_socketlibSocket.executeAsUser(handler, userId, ...args);
  }

  async executeForAllGMs(handler, ...args) {
    if (!this.canCall(handler)) return false;
    return await this.#_socketlibSocket.executeForAllGMs(handler, ...args);
  }
  async executeForOtherGMS(handler, ...args) {
    if (!this.canCall(handler)) return false;
    return await this.#_socketlibSocket.executeForOtherGMS(handler, ...args);
  }
  async executeForEveryone(handler, ...args) {
    if (!this.canCall(handler)) return false;
    return await this.#_socketlibSocket.executeForEveryone(handler, ...args);
  }
  async executeForOthers(handler, ...args) {
    if (!this.canCall(handler)) return false;
    return await this.#_socketlibSocket.executeForOthers(handler, ...args);
  }
  async executeForUsers(handler, recipients, ...args) {
    if (!this.canCall(handler)) return false;
    return await this.#_socketlibSocket.executeForUsers(handler, recipients, ...args);
  }
}

async function removeActionBonusReaction(data: { actorUuid: string }) {
  const actor = fromActorUuid(data.actorUuid);
  if (!actor) return;
  if (hasUsedAnyReaction(actor)) await removeReactionUsed(actor);
  if (hasUsedBonusAction(actor)) await removeBonusActionUsed(actor);
  if (hasUsedAction(actor)) return await removeActionUsed(actor);
  return;
}

// Remove a single effect. Allow anyone to call this.
async function _removeEffect(data: { effectUuid: string }) {
  const effect = fromUuidSync(data.effectUuid) as ActiveEffect.Implementation | undefined;
  if (!effect) return;
  return effect.delete({});
}

async function _removeCEEffect(data: { effectName: string, uuid: string }) {
  return CERemoveEffect({ effectName: data.effectName, uuid: data.uuid });
}

export async function cancelWorkflow(data: { workflowId: string, itemCardUuid: string }) {
  const workflow = Workflow.getWorkflow(data.workflowId);
  if (workflow?.itemCardUuid !== data.itemCardUuid) {
    const itemCard = await fromUuid(data.itemCardUuid as `ChatMessage.${string}`);
    if (itemCard) itemCard.delete();
    return undefined;
  }
  if (workflow) return workflow.performState(workflow.WorkflowState_Cancel);
  return undefined;
}

async function confirmDamageRollComplete(data: { workflowId: string, activityUuid: string, itemCardUuid: string }) {
  const workflow = Workflow.getWorkflow(data.workflowId);
  const activity = workflow?.activity;
  if (!workflow || workflow.itemCardUuid !== data.itemCardUuid) {
    // Confirm this needs to be awaited
    Workflow.removeItemCardButtons(data.itemCardUuid, { removeAttackButtons: true, removeDamageButtons: true, removeConfirmButtons: true });
    return undefined;
  }
  const hasHits = workflow.hitTargets.size > 0 || workflow.hitTargetsEC.size > 0;
  if ((workflow.currentAction === workflow.WorkflowState_AttackRollComplete) || hasHits &&
    activity?.hasDamage && (!workflow.damageRoll || workflow.currentAction !== workflow.WorkflowState_ConfirmRoll)) {
    return "midi-qol | You must roll damage before completing the roll - you can only confirm miss until then";
  }
  if (workflow.hitTargets.size === 0 && workflow.hitTargetsEC.size === 0) {
    // TODO make sure this needs to be awaited
    return confirmDamageRollCompleteMiss(data);
  }

  // TODO NW if (workflow.suspended) workflow.unSuspend({rollConfirmed: true});
  return workflow.performState(workflow.WorkflowState_RollConfirmed)
}

async function confirmDamageRollCompleteHit(data: { workflowId: string, activityUuid: string, itemCardUuid: string }) {
  const workflow = Workflow.getWorkflow(data.workflowId);
  const activity = workflow?.activity;
  if (!workflow || workflow.itemCardUuid !== data.itemCardUuid) {
    Workflow.removeItemCardButtons(data.itemCardUuid, { removeAttackButtons: true, removeDamageButtons: true, removeConfirmButtons: true });
    return undefined;
  }
  if ((activity?.hasDamage && !workflow.damageRoll) ||
    workflow.currentAction !== workflow.WorkflowState_ConfirmRoll) {
    return "midi-qol | You must roll damage before completing the roll - you can only confirm miss until then";
  }
  // TODO make sure this needs to be awaited
  if (workflow.hitTargets.size === workflow.targets.size) {
    return workflow.performState(workflow.WorkflowState_RollConfirmed)
    // TODO confirm this needs to be awaited

  }
  workflow.hitTargets = new Set(workflow.targets);
  workflow.hitTargetsEC = new Set();
  const rollMode = safeGetGameSetting("core", "rollMode");
  workflow.isFumble = false;
  for (let hitDataKey in workflow.hitDisplayData) {
    workflow.hitDisplayData[hitDataKey].hitString = i18n("midi-qol.hits");
    workflow.hitDisplayData[hitDataKey].hitResultNumeric = "--";
    if (configSettings.highlightSuccess) {
      workflow.hitDisplayData[hitDataKey].hitStyle = "color: green;";
    }
  }
  await workflow.displayHits(workflow.whisperAttackCard, true);
  return await workflow.performState(workflow.WorkflowState_RollConfirmed);
}

async function confirmDamageRollCompleteMiss(data: { workflowId: string, activityUuid: string, itemCardUuid: string }) {
  const workflow = Workflow.getWorkflow(data.workflowId);
  const activity = workflow?.activity;
  if (!workflow || workflow.itemCardUuid !== data.itemCardUuid) {
    /* Confirm this needs to be awaited
    */
    Workflow.removeItemCardButtons(data.itemCardUuid, { removeDamageButtons: true, removeAttackButtons: true, removeConfirmButtons: true });
    return undefined;
  }
  if (workflow.hitTargets.size > 0 || workflow.hitTargetsEC.size > 0) {
    workflow.hitTargets = new Set();
    workflow.hitTargetsEC = new Set();
    const rollMode = safeGetGameSetting("core", "rollMode");
    for (let hitDataKey in workflow.hitDisplayData) {
      workflow.hitDisplayData[hitDataKey].hitString = i18n("midi-qol.misses");
      if (configSettings.highlightSuccess) {
        workflow.hitDisplayData[hitDataKey].hitStyle = "color: red;";
      }
      workflow.hitDisplayData[hitDataKey].hitResultNumeric = "--";
    }
    await workflow.displayHits(workflow.whisperAttackCard, true);
  }
  // Make sure this needs to be awaited
  return workflow.performState(workflow.WorkflowState_RollConfirmed).then(() => Workflow.removeWorkflow(workflow?.id));
}

function paranoidCheck(action: string, actor: any, data: any): boolean {
  return true;
}

async function removeEffects(data: { actorUuid: string; effects: string[]; options: {} }) {
  debug("removeEffects started");
  let removeFunc = async () => {
    try {
      debug("removeFunc: remove effects started")
      const actor = fromActorUuid(data.actorUuid);
      if (configSettings.paranoidGM && !paranoidCheck("removeEffects", actor, data)) return "gmBlocked";
      const effectsToDelete = actor!.appliedEffects.filter(ef => data.effects.includes(ef.id!));
      return await expireEffects(actor!, effectsToDelete, data.options);
    } catch (err) {
      const message = `GMACTION: remove effects error for ${data?.actorUuid}`;
      console.warn(message, err);
      TroubleShooter.recordError(err, message);
    } finally {
      warn("removeFunc: remove effects completed")
    }
  };
  // Using the semaphore queue leads to quite a few potential cases of deadlock - disabling for now
  // if (globalThis.DAE?.actionQueue) return globalThis.DAE.actionQueue.add(removeFunc)
  // else return removeFunc();
  return removeFunc();

}

async function removeEffectUuids(data: { actorUuid: string; effects: string[]; options: {} }) {
  debug("removeEffects started");
  let removeFunc = async () => {
    try {
      debug("removeFunc: remove effects started")
      const actor = fromActorUuid(data.actorUuid);
      if (configSettings.paranoidGM && !paranoidCheck("removeEffects", actor, data)) return "gmBlocked";
      const effectsToDelete = getAppliedEffects(actor, { includeEnchantments: true }).filter(ef => data.effects.includes(ef.uuid));
      return await expireEffects(actor!, effectsToDelete, data.options);
    } catch (err) {
      const message = `GMACTION: remove effects error for ${data?.actorUuid}`;
      console.warn(message, err);
      TroubleShooter.recordError(err, message);
    } finally {
      warn("removeFunc: remove effects completed")
    }
  };
  // Using the semaphore queue leads to quite a few potential cases of deadlock - disabling for now
  // if (globalThis.DAE?.actionQueue) return globalThis.DAE.actionQueue.add(removeFunc)
  // else return removeFunc();
  return removeFunc();
}

async function createEffects(data: { actorUuid: string, effects: ActiveEffect.CreateData[], options: any }) {
  const actor = fromActorUuid(data.actorUuid);
  for (let effect of data.effects) { // override default foundry behaviour of blank being transfer
    if (effect.transfer === undefined) effect.transfer = false;
  }
  return await actor?.createEmbeddedDocuments("ActiveEffect", data.effects, data.options);
}

async function updateEffects(data: { actorUuid: string, updates: ActiveEffect.UpdateData[] }) {
  const actor = fromActorUuid(data.actorUuid);
  return actor?.updateEmbeddedDocuments("ActiveEffect", data.updates);
}

async function _toggleStatusEffect(data: { actorUuid: string, statusId: string, options: Actor.ToggleStatusEffectOptions }) {
  const actor = fromActorUuid(data.actorUuid);
  return actor?.toggleStatusEffect(data.statusId, data.options);
}

function removeActorStats(data: { actorId: string }) {
  return gameStats.GMremoveActorStats(data.actorId)
}

function GMupdateEntityStats(data: { id: string; currentStats: Stats; }) {
  return gameStats.GMupdateEntity(data)
}

function GMsaveAllStats() {
  return gameStats.GMsaveAllStats();
}

export async function timedExecuteAsGM(toDo: string, data: any) {
  if (false) return unTimedExecuteAsGM(toDo, data);
  const start = Date.now();
  data.playerId = game.user?.id;
  const returnValue = await unTimedExecuteAsGM(toDo, data);
  log(`executeAsGM: ${toDo} elapsed: ${Date.now() - start}ms`)
  return returnValue;
}

export function preferredActiveGM() {
  let preferredGMId = configSettings.preferredGM ?? "";
  if (preferredGMId !== "") {
    const preferredGM = game.users?.get(preferredGMId);
    if (preferredGM?.active) return preferredGM as User.Implementation;
    log(`preferredGM ${preferredGMId} is not active`);
  }
  if (game.user?.isGM) return game.user;
  return game.users?.activeGM ?? null;
}

export async function unTimedExecuteAsGM(toDo: string, ...args) {
  if (!socketlibSocket) return undefined;
  const myScene = game.user?.viewedScene;
  const preferredGMId = configSettings.preferredGM ?? "";
  let preferredGM = game.users?.get(preferredGMId);
  if (!preferredGM?.active) {
    if (preferredGMId !== "") log(`preferredGM ${preferredGMId} is not active`);
    preferredGM = undefined;
  }
  let gmOnScene;
  if (preferredGM?.viewedScene === myScene) gmOnScene = [preferredGM];
  else if (game.user?.isGM && game.user?.viewedScene === myScene) gmOnScene = [game.user];
  else gmOnScene = game.users?.filter(u => u.active && u.isGM && u.viewedScene === myScene);
  if (gmOnScene && gmOnScene.length > 0) return socketlibSocket.executeAsUser(toDo, gmOnScene[0].id, ...args);
  if (preferredGM) return socketlibSocket.executeAsUser(toDo, preferredGM.id, ...args);
  return socketlibSocket.executeAsGM(toDo, ...args);
}

export async function timedAwaitExecuteAsGM(toDo: string, data: any) {
  if (false) return await unTimedExecuteAsGM(toDo, data);
  const start = Date.now();
  const returnValue = await unTimedExecuteAsGM(toDo, data);
  log(`await executeAsGM: ${toDo} elapsed: ${Date.now() - start}ms`)
  return returnValue;
}

async function _gmUnsetFlag(data: { base: string, key: string, actorUuid: string }) {
  let actor = fromUuidSync(data.actorUuid) as Actor.Implementation | Item.Implementation | null;
  actor = actor instanceof Item ? actor.actor : actor;
  if (!actor) return undefined;
  // @ts-expect-error unspecified flags
  return actor.unsetFlag(data.base, data.key)
}

async function _gmSetFlag(data: { base: string, key: string, value: any, actorUuid: string }) {
  let actor = fromUuidSync(data.actorUuid) as Actor.Implementation | Item.Implementation | null;
  actor = actor instanceof Item ? actor.actor : actor;
  if (!actor) return undefined;
  // @ts-expect-error unspecified flags
  return actor.setFlag(data.base, data.key, data.value)
}

// Seems to work doing it on the client instead.
async function _canSense(data: { tokenUuid: string, targetUuid: string }) {
  const token = (fromUuidSync(data.tokenUuid) as TokenDocument)?.object;
  const target = (fromUuidSync(data.targetUuid) as TokenDocument)?.object;
  if (!target || !token) return true;
  if (token.vision && (!token.vision.active || !token.vision.los)) {
    token.vision.initialize({
      x: token.center.x,
      y: token.center.y,
      radius: Math.clamp(token.sightRange, 0, canvas.dimensions?.maxR ?? 0),
      externalRadius: Math.max(token.mesh?.width ?? 0, token.mesh?.height ?? 0) / 2,
      angle: token.document.sight.angle,
      contrast: token.document.sight.contrast,
      saturation: token.document.sight.saturation,
      brightness: token.document.sight.brightness,
      attenuation: token.document.sight.attenuation,
      rotation: token.document.rotation,
      visionMode: token.document.sight.visionMode as foundry.canvas.perception.VisionMode.ConfiguredModes,
      color: globalThis.Color.from(token.document.sight.color),
      preview: !!token._original,
      blinded: token.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND)
    });
  }
  return canSense(token, target);
}

async function _gmOverTimeEffect(data: { actorUuid: string, effectUuid: string, startTurn: boolean, options: any }) {
  const actor = fromActorUuid(data.actorUuid);
  const effect = fromUuidSync(data.effectUuid) as ActiveEffect.Implementation | undefined;
  log("Called _gmOvertime", actor?.name, effect?.name)
  if (actor && effect) return gmOverTimeEffect(actor, effect, data.startTurn, data.options)
}

async function _localActivityOverTimeEffect(data: { actorUuid: string, effectUuid: string, startTurn: boolean, options: any }) {
  const actor = await fromUuid(data.actorUuid) as Actor.Implementation | undefined;
  const effect = await fromUuid(data.effectUuid) as ActiveEffect.Implementation | undefined;
  if (!actor || !effect) {
    const message = `localActivityOverTimeEffect | actor or effect not found actor: ${data.actorUuid} effect: ${data.effectUuid}`;
    error(message);
    TroubleShooter.recordError(new Error("GMAction failed"), message);
    return undefined
  };
  log("Called _localActivityOverTimeEffect", actor?.name, effect?.name)
  return localActivityOverTimeEffect(actor, effect, data.startTurn, data.options)
}

async function _bonusCheck(data: { actorUuid: string, result: string, rollType: string, selector: string }) {
  const tokenOrActor = await fromUuid(data.actorUuid) as Actor.Implementation | TokenDocument.Implementation | undefined;
  const actor = tokenOrActor instanceof Actor ? tokenOrActor : tokenOrActor?.actor;
  const roll = Roll.fromJSON(data.result);
  if (actor) return await bonusCheck(actor, roll as Roll, data.rollType, data.selector);
  else return null;
}

async function _applyEffects(data: { workflowId: string, targets: string[] }) {
  let result;
  try {
    const workflow = Workflow.getWorkflow(data.workflowId);
    if (!workflow) throw new Error(`_applyEffects | workflowId: ${data.workflowId} - workflow not found`);
    workflow.forceApplyEffects = true;
    const targets: Set<foundry.canvas.placeables.Token.Implementation> = new Set();
    for (let targetUuid of data.targets) {
      const maybeToken = (await fromUuid(targetUuid) as TokenDocument.Implementation)?.object
      if (maybeToken) targets.add(maybeToken);
    }

    // TODO: Does this do anything, actually?
    workflow.applicationTargets = targets;
    if (workflow.applicationTargets.size > 0) result = await workflow.performState(workflow.WorkflowState_ApplyDynamicEffects);
    return result;
  } catch (err) {
    const message = `_applyEffects | remote apply effects error`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  }
  return result;
}

async function _completeActivityUse(data: {
  activityUuid: string, actorUuid: string, usage: any, dialog: any, message: any, workflowData: boolean
}) {
  if (!game.user) return null;
  let { activityUuid, actorUuid, usage, dialog, message } = data;
  let actor: any = await fromUuid(actorUuid);
  if (actor.actor) actor = actor.actor;
  if (usage.midiOptions?.targetsToUse) {
    const targets = usage.midiOptions.targetsToUse.map(t => (fromUuidSync(t) as TokenDocument.Implementation)?.object).filter(t => isValidTarget(t)) as foundry.canvas.placeables.Token.Implementation[];
    usage.midiOptions.targetsToUse = new Set(targets);
  }
  const workflow = await completeActivityUse(activityUuid, usage, dialog, message);
  if (workflow && data.usage.midiOptions?.workflowData) return workflow.getSafeMacroData();
  else return true;
}

async function _completeItemUse(data: {
  itemData: any, actorUuid: string, config: any, dialog: any, message: any, workflowData: boolean
}) {
  if (!game.user) return null;
  let { itemData, actorUuid, config, dialog, message } = data;
  let actor: any = await fromUuid(actorUuid);
  if (actor.actor) actor = actor.actor;
  let ownedItem = new CONFIG.Item.documentClass(itemData, { parent: actor });
  // prepare item data for socketed events
  ownedItem.prepareData();
  // @ts-expect-error no dnd5e-types
  ownedItem.prepareFinalAttributes();
  // @ts-expect-error no dnd5e-types
  ownedItem.applyActiveEffects();
  const workflow = await completeItemUse(ownedItem, config, dialog, message);
  if (data.config?.midiOptions?.workflowData) return workflow.getMacroData();
  else return true;
}

async function updateActor(data: { actorUuid: string, updates?: Actor.UpdateData, actorData?: Actor.UpdateData }) {
  let actor = fromUuidSync(data.actorUuid) as Actor.Implementation | null;
  if (!actor) return;
  if (data.actorData) {
    console.warn(`midi-qol | updateActor actorData deprecated. Call await MidiQOL.socket().executeAsGM("updateActor"({ updates }) instead`)
    await actor.update(data.actorData);
  }
  if (data.updates) await actor.update(data.updates);
}

async function createActor(data: { actorData: Actor.CreateData | Actor.CreateData[], context: Actor.Database.CreateOperation<false> }) {
  let actorsData = data.actorData instanceof Array ? data.actorData : [data.actorData];
  const actors = await CONFIG.Actor.documentClass.createDocuments(actorsData, data.context ?? {});
  return actors?.length ? actors.map(a => a.id) : false;
}

async function deleteToken(data: { tokenUuid: string }) {
  const token = await fromUuid(data.tokenUuid) as TokenDocument.Implementation;
  if (token) { // token will be a token document.
    token.delete();
  }
}

async function deleteEffectsByUuid(data: { effectsToDelete: string[], options: any }) {
  for (let effectUuid of data.effectsToDelete) {
    const effect = fromUuidSync(effectUuid) as ActiveEffect.Implementation | undefined;
    if (effect !== undefined && !isEffectExpired(effect)) {
      if (effect.transfer)
        await effect.update({ disabled: true });
      else
        await effect.delete();
    }
  }
}

async function deleteEffects(data: { actorUuid: string, effectsToDelete: string[], options: any }) {
  const actor = fromActorUuid(data.actorUuid);
  if (!actor) return;
  // Check that none of the effects were deleted while we were waiting to execute
  let finalEffectsToDelete = actor.appliedEffects.filter(ef => data.effectsToDelete.includes(ef.id!) && !isEffectExpired(ef));
  try {
    if (debugEnabled > 0) warn("_deleteEffects started", actor.name, data.effectsToDelete, finalEffectsToDelete, data.options)
    const result = await expireEffects(actor, finalEffectsToDelete, data.options)
    if (debugEnabled > 0) warn("_deleteEffects completed", actor.name, data.effectsToDelete, finalEffectsToDelete, data.options)
    return result;
  } catch (err) {
    const message = `deleteEffects | remote delete effects error`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
    return [];
  }
}

async function deleteItemEffects(data: { targets: { tokenUuid?: string; actorUuid?: string }[], origin: string, ignore: string[], ignoreTransfer: boolean, options: any }) {
  debug("deleteItemEffects: started", globalThis.DAE?.actionQueue)
  let deleteFunc = async () => {
    let effectsToDelete: ActiveEffect.Implementation[] | undefined;
    try {
      let { targets, origin, ignore, options } = data;
      for (let idData of targets) {
        let actor = idData.tokenUuid ? fromActorUuid(idData.tokenUuid) : idData.actorUuid ? fromActorUuid(idData.actorUuid) : undefined;
        if (!actor) {
          error("GMAction:deleteItemEffects | could not find actor for ", idData.tokenUuid);
          continue;
        }
        let originEntity = await fromUuid(origin);
        if (!originEntity) {
          error("GMAction:deleteItemEffects | could not find origin for ", origin);
          continue;
        }
        effectsToDelete = actor?.appliedEffects?.filter(ef => {
          if (originEntity instanceof ActiveEffect) originEntity = originEntity.parent;
          return ef.origin === originEntity?.uuid && !ignore.includes(ef.uuid) && (!data.ignoreTransfer || !ef.transfer)
        });
        if (installedModules.get("times-up")) {
          if (globalThis.TimesUp.isEffectExpired) {
            effectsToDelete = effectsToDelete.filter(ef => !globalThis.TimesUp.isEffectExpired(ef), {});
          }
          else effectsToDelete = effectsToDelete.filter(ef => !(ef.updateDuration().remaining <= 0));
        }
        debug("deleteItemEffects: effectsToDelete ", actor.name, effectsToDelete, options)
        if (effectsToDelete?.length > 0) {
          try {
            // for (let ef of effectsToDelete) ef.delete();
            options = foundry.utils.mergeObject(options ?? {}, { parent: actor, concentrationDeleted: true });
            if (debugEnabled > 0) warn("deleteItemEffects ", actor.name, effectsToDelete, options);
            await expireEffects(actor, effectsToDelete, options);
          } catch (err) {
            const message = `delete item effects failed for ${actor?.name} ${actor?.uuid}`;
            console.warn(message, err);
            TroubleShooter.recordError(err, message);
          };
        }
        if (debugEnabled > 0) warn("deleteItemEffects: completed", actor.name)
      }
      if (globalThis.Sequencer) await globalThis.Sequencer.EffectManager.endEffects({ origin })
    } catch (err) {
      const message = `delete item effects failed for ${data?.origin} ${effectsToDelete}`;
      console.warn(message, err);
      TroubleShooter.recordError(err, message);
    }
  }
  /*
  if (globalThis.DAE?.actionQueue) return await globalThis.DAE.actionQueue.add(deleteFunc)
  else return await deleteFunc();
*/
  return await deleteFunc();
}


async function addConvenientEffect(options: { effectName: string, actorUuid: string, origin: string }) {
  let { effectName, actorUuid, origin } = options;
  const actor = getActor(actorUuid);
  console.warn("midi-qol | Deprecated. Call await game.modules.get(\"dfreds-convenient-effects\")?.api?.addEffect({ effectName, uuid: actorUuid, origin }) instead")
  if (!actor) return;
  return CEAddEffectWith({ effectName, uuid: actor.uuid, origin, overlay: false });
}

async function _addDependent(data: { documentUuid: string, dependentUuid: string }) {
  if (foundry.utils.isNewerVersion(game.system.version, "5.1.99")) {
    const dependent = fromUuidSync(data.dependentUuid) as foundry.abstract.Document.Any | undefined;
    if (!dependent) return;

    // Always use dnd5e's dependent system - dnd5e's DependentDocumentMixin handles tracking
    //@ts-expect-error dnd5e.dependentOn
    return dependent.setFlag("dnd5e", "dependentOn", data.documentUuid);
  } else {
    const document = fromUuidSync(data.documentUuid) as foundry.abstract.Document.Any | undefined;
    //@ts-expect-error .addDependent
    if (document?.addDependent) return document.addDependent(data.dependentUuid);
  }
}

async function localDoReactions(data: { tokenUuid: string; reactionActivityList: ReactionItemReference[], triggerTokenUuid: string, reactionFlavor: string; triggerType: string; options: any }) {
  if (data.options.itemUuid) {
    data.options.item = fromUuidSync(data.options.itemUuid);
  }
  if (data.options.activity && data.options.item) {
    data.options.activity = data.options.item.system.activities.get(data.options.activity._id);
  }
  // reactionItemUuidList can't used since magic items don't have a uuid, so must always look them up locally.
  const result = await promptReactions(data.tokenUuid, data.reactionActivityList, data.triggerTokenUuid, data.reactionFlavor, data.triggerType, data.options)
  return result;
}

export function initGMActionSetup() {
  traitList.di = i18n("DND5E.DamImm");
  traitList.dr = i18n("DND5E.DamRes");
  traitList.dv = i18n("DND5E.DamVuln");
  traitList.da = "da";
  traitList.dm = "dm";
  traitList.di = "di";
  traitList.dr = "dr";
  traitList.dv = "dv";
}

async function _createChatMessage(data: { chatData: ChatMessage.CreateData; }) {
  return await ChatMessage.create(data.chatData);
}

async function _D20Roll(params: { request: string, targetUuid: string, formula: string, bonus: number, coverBonus: number, flavor: string, midiType: string, rollMode: string, rollOptions: any, messageData: any }) {
  const actor = fromActorUuid(params.targetUuid);
  if (!actor || !params.rollOptions) {
    error(`GMAction.D20Roll | no actor for ${params.targetUuid}`)
    return {};
  }

  /*
      criticalSuccess: criticalTarget,
      criticalFailure: fumbleTarget,
      advantageMode,
      target: this.activeDefenceDC
    */
  return new Promise(async (resolve) => {
    let timeoutId;
    let result;
    //@ts-expect-error D20Roll
    const D20Roll = CONFIG.Dice.D20Roll;
    if (configSettings.playerSaveTimeout > 0) timeoutId = setTimeout(async () => {
      warn(`Roll request for {actor.name}timed out. Doing roll`);
      params.rollOptions.fastForward = true; // assume player is asleep force roll without dialog
      let result = await new D20Roll(params.formula, {}, params.rollOptions).roll();
      foundry.utils.setProperty(result, "flags.midi-qol.rollType", params.midiType)
      resolve(result ?? {});
    }, configSettings.playerSaveTimeout * 1000);
    const roll = new D20Roll();
    const { parts, data } = D20Roll.constructParts({ "mod": params.bonus, "cover": params.coverBonus });
    roll.data = data;
    roll.parts = parts;
    roll.options = { ...params.rollOptions };
    const config = {
      advantage: params.rollOptions?.advantageMode === D20Roll.ADV_MODE.ADVANTAGE,
      disadvantage: params.rollOptions?.advantageMode === D20Roll.ADV_MODE.DISADVANTAGE,
      rolls: [roll],
      dialog: true,
    };
    const dialog = {
      options: {
        window: {
          title: params.flavor,
          subtitle: actor.name,
        }
      }
    }
    const message = {
      create: true,
      data: { flavor: params.flavor },
      speaker: ChatMessage.getSpeaker({ actor }),
      rollMode: params.rollMode,
    }
    const rolls = await D20Roll.build(config, dialog, message)
    // ({ title: data.request, defaultRollMode: data.rollMode, defaultAction: data.options?.advantage });
    // result = await roll.roll();
    if (timeoutId) clearTimeout(timeoutId);
    if (rolls) foundry.utils.setProperty(rolls[0], "flags.midi-qol.rollType", params.midiType)
    resolve(rolls[0] ?? {})
  });
}
async function rollConcentration(data: { actorUuid: string, target: number, whisper: string[], create: boolean, rollMode: string }) {
  const actor = fromUuidSync(data.actorUuid) as Actor.Implementation | null;
  if (!actor) {
    error(`GMAction.rollConcentration | no actor for ${data.actorUuid}`)
    return {};
  }
  //@ts-expect-error no dnd5e types
  return actor.rollConcentration({ target: data.target, legacy: false }, {}, { create: data.create, whisper: data.whisper, rollMode: data.rollMode });
}

async function rollAbility(data: {
  request: string;
  targetUuid: string;
  ability?: string;
  abilities?: string[];
  skill?: string;
  tool?: string;
  proficiency?: string;
  options?: {
    fastForward?: boolean;
    chatMessage?: boolean;
    create?: boolean;
    rollMode?: string;
    itemId: string;
    workflowId?: string;
    rollAbilities?: string[];
    rollSkills?: string[];
    rollTools?: string[];
    advantageByAbility?: AnyMutableObject;
  };
  advantage?: boolean;
  disadvantage?: boolean;
  isMagicSave?: boolean;
  isConcentrationCheck?: boolean;
  rollDC?: number;
  saveItemUuid?: string;
  workflowOptions?: WorkflowOptions;
  workflowId?: string;
  rollMode?: string;
}) {
  if (data.request === "abil") data.request = "check";
  if (data.request === "test") data.request = "check";
  const actor = fromActorUuid(data.targetUuid);
  if (!actor) {
    error(`GMAction.rollAbility | no actor for ${data.targetUuid}`)
    return {};
  }
  let config: AnyMutableObject = { midiOptions: data.options, advantage: data.advantage, disadvantage: data.disadvantage, isMagicSave: data.isMagicSave, isConcentrationCheck: data.isConcentrationCheck, rollDC: data.rollDC, saveItemUuid: data.saveItemUuid, workflowOptions: data.workflowOptions, workflowId: data.workflowId }
  if (data.ability) config.ability = data.ability;
  if (data.skill) config.skill = data.skill;
  if (data.tool) config.tool = data.tool
  if (data.proficiency) config.prof = data.proficiency;
  let dialog: AnyMutableObject = { configure: !data.options?.fastForward };
  let message: AnyMutableObject = { create: data.options?.chatMessage ?? data.options?.create, rollMode: data.options?.rollMode };
  if (data.request === "tool") {
    const rollTools = data.options?.rollTools;
    const toolsToTry = rollTools && rollTools.length > 0 ? rollTools : [data.tool];
    let tool: Item.Implementation | undefined;
    let foundToolId: string | undefined;
    // Try to find a tool item matching any of the requested tools
    for (const toolId of toolsToTry) {
      if (!toolId) continue;
      tool = actor.items.get(data.options?.itemId ?? "") as Item.Implementation | undefined;
      // @ts-expect-error no dnd5e-types
      if (!tool || tool.type !== "tool") tool = actor.items.find(i => i.type === "tool" && i.system.type.baseItem === toolId) as Item.Implementation | undefined;
      if (tool) { foundToolId = toolId; break; }
    }
    if (!tool) { // no tool of any requested type - auto fail
      //@ts-expect-error
      return [await new CONFIG.Dice.D20Roll("-1").roll()];
    } else {
      // @ts-expect-error no dnd5e-types
      config.bonus = tool?.system.bonus ?? 0;
      // @ts-expect-error no dnd5e-types
      config.prof = tool?.system.prof;
      config.item = tool;
      if (foundToolId && foundToolId !== data.tool) config.tool = foundToolId;
    }
  }
  if (data.rollMode) message.rollMode = data.rollMode;
  return new Promise(async (resolve) => {
    let timeoutId: NodeJS.Timeout | undefined;
    let result: Roll[] | Roll | undefined;
    if (configSettings.playerSaveTimeout > 0) timeoutId = setTimeout(async () => {
      warn(`Roll request for {actor.name}timed out. Doing roll`);
      dialog.configure = false; // assume player is asleep force roll without dialog
      // @ts-expect-error no dnd5e-types
      if (data.request === "save") result = await actor.rollSavingThrow(config, dialog, message);
      // @ts-expect-error no dnd5e-types
      else if (data.request === "check") result = await actor.rollAbilityCheck(config, dialog, message);
      // @ts-expect-error no dnd5e-types
      else if (data.request === "skill") result = await actor.rollSkill(config, dialog, message);
      // @ts-expect-error no dnd5e-types
      else if (data.request === "tool") result = await actor.rollToolCheck(config, dialog, message);
      resolve(result ?? {});
    }, configSettings.playerSaveTimeout * 1000);
    // @ts-expect-error no dnd5e-types
    if (data.request === "save") result = await actor.rollSavingThrow(config, dialog, message);
    // @ts-expect-error no dnd5e-types
    else if (data.request === "check") result = await actor.rollAbilityCheck(config, dialog, message);
    // @ts-expect-error no dnd5e-types
    else if (data.request === "skill") result = await actor.rollSkill(config, dialog, message);
    // @ts-expect-error no dnd5e-types
    else if (data.request === "tool") result = await actor.rollToolCheck(config, dialog, message);
    if (timeoutId) clearTimeout(timeoutId);
    resolve(result ?? {})
  });
}

// TODO: This, once MTB is in in v13. For now, not worth even typing
function monksTokenBarSaves(data: { tokenData: any[]; request: any; silent: any; rollMode: string; dc: number | undefined, isMagicSave: boolean | undefined, midiOptions: any | undefined }) {
  // let tokens = data.tokens.map((tuuid: any) => new Token(MQfromUuid(tuuid)));

  // TODO come back and see what things can be passed to this.
  //@ts-expect-error MonksTokenBar
  game.MonksTokenBar?.requestRoll(
    data.tokenData,
    {
      request: data.request,
      silent: data.silent,
      rollmode: data.rollMode,
      dc: data.dc,
      isMagicSave: data.isMagicSave,
      options: data.midiOptions
    });
}

function flashTokenBarSaves(data: {
  requestType: string;
  rollKey: string;
  actorIds: string[];
  dc: number | undefined;
  advantage: boolean | undefined;
  disadvantage: boolean | undefined;
  skipRollDialog: boolean;
  sendAsRequest: boolean;
  rollMode: string | undefined;
  workflowId: string;
  itemCardUuid: string;
}) {
  if (debugEnabled > 0) debug("flashTokenBarSaves | Called with data:", data);

  //@ts-expect-error FlashAPI
  if (typeof FlashAPI !== 'undefined') {
    if (debugEnabled > 0) debug("flashTokenBarSaves | FlashAPI found, calling requestRoll");
    //@ts-expect-error FlashAPI
    FlashAPI.requestRoll({
      requestType: data.requestType,
      rollKey: data.rollKey,
      actorIds: data.actorIds,
      dc: data.dc,
      advantage: data.advantage,
      disadvantage: data.disadvantage,
      skipRollDialog: data.skipRollDialog,
      sendAsRequest: true,
      rollMode: data.rollMode,
      workflowId: data.workflowId
    });
  } else {
    error("flashTokenBarSaves | FlashAPI not found! Is flash-rolls-5e module active?");
  }
}

async function createReverseDamageCard(data: {
  damageList: SerializedDamageListEntry[];
  autoApplyDamage: string;
  flagTags: any,
  sender: string,
  charName: string,
  actorId: string,
  actorUuid?: string,
  forceApply: boolean,
  updateOptions: any,
}): Promise<string[]> {
  let cardIds: string[] = [];
  let startTime;
  startTime = Date.now();
  const newDamageList = recoverDamageListFromJSON(data.damageList);
  let id = await createPlayerDamageCard({ ...data, damageList: newDamageList });
  if (id) cardIds.push(id);
  if (data.damageList.some(di => di.wasHit)) {
    id = await createGMReverseDamageCard({ ...data, damageList: newDamageList }, true);
    if (id) cardIds.push(id);
  }
  if (data.damageList.some(di => !di.wasHit) && ["yesCardMisses", "noCardMisses"].includes(data.autoApplyDamage)) {
    id = await createGMReverseDamageCard({ ...data, damageList: newDamageList }, false);
    if (id) cardIds.push(id);
  }
  console.log("createReverseDamageCard took ", Date.now() - startTime, "ms");
  return cardIds;
}

interface DamageListContextEntry {
  isCharacter: boolean;
  isNpc: boolean;
  actorUuid: string;
  targetUuid: string;
  displayUuid: string;
  tokenId?: string;
  tokenImg: string;
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
  noChange?: boolean;
  buttonId: string;
  iconPrefix: string;
  tooltip?: string;
  // Healing display properties
  isHealing: boolean;
  absRawTotalDamage: number;
  absPlayerViewTotalDamage: number;
  // Direct vitality damage/healing from damage detail (not overflow)
  vitalityDamage?: number;
  absVitalityDamage?: number;
  vitalityDamageIsHealing?: boolean;
}

/** Helper to calculate damage amounts from a damage detail array */
function calculateDamageAmounts(damageDetail: DamageDescription[]): { amount: number; temp: number; healing: number; vitality: number } {
  return damageDetail.reduce((acc, d) => {
    if (d.type === "temphp") acc.temp += d.value;
    else if (d.type === "vitality") acc.vitality += d.value; // Vitality damage (positive) or healing (negative)
    else if (["healing"].includes(d.type) || d.active?.absorption) acc.healing += d.value;
    else if (d.type !== "midi-none") acc.amount += d.value;
    return acc;
  }, { amount: 0, temp: 0, healing: 0, vitality: 0 });
}

/** Helper to update damage card display elements */
/**
 * Update damage card display using stored original values.
 * @param html - The chat message HTML element
 * @param actorUuid - The actor's UUID
 * @param undoEntry - The stored damage data
 * @param showUndoMode - If true, show what undo would do (healing to restore); if false, show original damage
 */
function updateDamageCardDisplay(
  html: HTMLElement,
  actorUuid: string,
  undoEntry: DamageListEntry,
  showUndoMode: boolean
): void {
  const displayUuid = actorUuid.replaceAll(".", "");
  const { oldHP, newHP, oldTempHP, newTempHP, oldVitality, newVitality } = undoEntry;

  // In undo mode, we're showing what undo would do (restore to old state = healing)
  // In apply mode, we're showing the original damage
  const isHealing = showUndoMode;

  // For undo mode, use CURRENT actor values as "from" (not stored newHP)
  // This handles multiple damage applications with multipliers
  let fromHP: number, toHP: number, fromTempHP: number, toTempHP: number;
  let fromVitality: number | undefined, toVitality: number | undefined;

  if (showUndoMode) {
    // Undo mode: restore from current state to original old values
    const actor = fromActorUuid(actorUuid);
    // @ts-expect-error no dnd5e types
    fromHP = actor?.system.attributes.hp.value ?? newHP ?? 0;
    // @ts-expect-error no dnd5e types
    fromTempHP = actor?.system.attributes.hp.temp ?? newTempHP ?? 0;
    toHP = oldHP ?? 0;
    toTempHP = oldTempHP ?? 0;

    // Get current vitality from actor
    const vitalityItem = getVitalityItem(actor);
    if (vitalityItem && oldVitality !== undefined) {
      // @ts-expect-error uses exists on items with uses
      const currentSpent = vitalityItem.system.uses?.spent ?? 0;
      // @ts-expect-error uses exists on items with uses
      const maxUses = vitalityItem.system.uses?.max ?? 0;
      fromVitality = maxUses - currentSpent;
      toVitality = oldVitality;
    }
  } else {
    // Apply mode: apply damage from old values to new values
    fromHP = oldHP ?? 0;
    toHP = newHP ?? 0;
    fromTempHP = oldTempHP ?? 0;
    toTempHP = newTempHP ?? 0;
    fromVitality = oldVitality;
    toVitality = newVitality;
  }

  // Calculate the actual changes from stored values
  const hpDelta = Math.abs((toHP ?? 0) - (fromHP ?? 0));
  const tempHpDelta = Math.abs((toTempHP ?? 0) - (fromTempHP ?? 0));
  const vitalityDelta = Math.abs((toVitality ?? 0) - (fromVitality ?? 0));

  // Total damage = HP change + TempHP change
  const totalDamage = hpDelta + tempHpDelta;

  const hpChanged = hpDelta > 0;
  const tempHpChanged = tempHpDelta > 0;
  const vitalityChanged = vitalityDelta > 0;
  const noChange = !hpChanged && !tempHpChanged && !vitalityChanged;

  const totalSpan = html.querySelector<HTMLSpanElement>(`#dmg-total-${displayUuid}`);
  const tempSpan = html.querySelector<HTMLSpanElement>(`#dmg-temp-${displayUuid}`);
  const hpSpan = html.querySelector<HTMLSpanElement>(`#dmg-hp-${displayUuid}`);
  const noChangeSpan = html.querySelector<HTMLSpanElement>(`#dmg-nochange-${displayUuid}`);
  const vitalitySpan = html.querySelector<HTMLSpanElement>(`#dmg-vitality-${displayUuid}`);
  const directVitalitySpan = html.querySelector<HTMLSpanElement>(`#dmg-vit-direct-${displayUuid}`);

  // Update total damage display - sum of HP and TempHP changes
  if (totalSpan) {
    const hasDamage = totalDamage > 0;
    totalSpan.classList.toggle("midi-qol-dmg-hidden", !hasDamage && noChange);
    totalSpan.classList.toggle("midi-qol-dmg-healing", isHealing);
    const signSpan = totalSpan.querySelector<HTMLSpanElement>(".dmg-total-sign");
    if (signSpan) signSpan.textContent = isHealing ? "+" : "-";
    const valueSpan = totalSpan.querySelector<HTMLSpanElement>(".dmg-total-value");
    if (valueSpan) valueSpan.textContent = String(Math.trunc(totalDamage));
  }

  // Update direct vitality damage display - actual vitality change
  if (directVitalitySpan) {
    directVitalitySpan.classList.toggle("midi-qol-dmg-hidden", !vitalityChanged);
    directVitalitySpan.classList.toggle("midi-qol-dmg-healing", isHealing);
    const signSpan = directVitalitySpan.querySelector<HTMLSpanElement>(".dmg-vit-sign");
    if (signSpan) signSpan.textContent = isHealing ? "+" : "-";
    const valueSpan = directVitalitySpan.querySelector<HTMLSpanElement>(".dmg-vit-value");
    if (valueSpan) valueSpan.textContent = String(Math.trunc(vitalityDelta));
  }

  // Update temp HP display
  if (tempSpan) {
    tempSpan.classList.toggle("midi-qol-dmg-hidden", !tempHpChanged);
    tempSpan.classList.toggle("midi-qol-dmg-healing", (toTempHP ?? 0) > (fromTempHP ?? 0));
    const tempOld = tempSpan.querySelector<HTMLSpanElement>(".dmg-temp-old");
    const tempNew = tempSpan.querySelector<HTMLSpanElement>(".dmg-temp-new");
    if (tempOld) tempOld.textContent = String(Math.trunc(fromTempHP ?? 0));
    if (tempNew) tempNew.textContent = String(Math.trunc(toTempHP ?? 0));
  }

  // Update HP display
  if (hpSpan) {
    hpSpan.classList.toggle("midi-qol-dmg-hidden", !hpChanged);
    hpSpan.classList.toggle("midi-qol-dmg-healing", isHealing);
    const hpOld = hpSpan.querySelector<HTMLSpanElement>(".dmg-hp-old");
    const hpNew = hpSpan.querySelector<HTMLSpanElement>(".dmg-hp-new");
    if (hpOld) hpOld.textContent = String(Math.trunc(fromHP ?? 0));
    if (hpNew) hpNew.textContent = String(Math.trunc(toHP ?? 0));
  }

  // Update vitality transition display
  if (vitalitySpan) {
    if (vitalityChanged && fromVitality !== undefined && toVitality !== undefined) {
      vitalitySpan.classList.remove("midi-qol-dmg-hidden");
      vitalitySpan.classList.toggle("midi-qol-dmg-healing", toVitality > fromVitality);
      const vitOld = vitalitySpan.querySelector<HTMLSpanElement>(".dmg-vit-old");
      const vitNew = vitalitySpan.querySelector<HTMLSpanElement>(".dmg-vit-new");
      if (vitOld) vitOld.textContent = String(Math.trunc(fromVitality));
      if (vitNew) vitNew.textContent = String(Math.trunc(toVitality));
    } else {
      vitalitySpan.classList.add("midi-qol-dmg-hidden");
    }
  }

  // Update no change display
  if (noChangeSpan) {
    noChangeSpan.classList.toggle("midi-qol-dmg-hidden", !noChange);
  }
}

/**
 * Helper to update the HP status header based on the state of all damage rows.
 * Shows "HP Updated", "HP Not Updated", or "HP Partially Updated (X/Y)" based on applied states.
 * Also updates the data-hp-applied attribute on individual rows.
 */
function updateHPStatusHeader(html: HTMLElement, actorUuid?: string, applied?: boolean): void {
  // If actorUuid is provided, update that specific row's data attribute
  if (actorUuid) {
    const displayUuid = actorUuid.replaceAll(".", "");
    // Support both flexbox (.midi-qol-dmg-row) and classic (.midi-qol-dmg-row-classic) templates
    const row = html.querySelector<HTMLElement>(`.midi-qol-dmg-row[data-actor-uuid="${displayUuid}"], .midi-qol-dmg-row-classic[data-actor-uuid="${displayUuid}"]`);
    if (row) {
      row.dataset.hpApplied = applied ? "true" : "false";
    }
  }

  // Count how many rows have HP applied (support both flexbox and classic templates)
  const allRows = html.querySelectorAll<HTMLElement>(".midi-qol-dmg-row[data-actor-uuid], .midi-qol-dmg-row-classic[data-actor-uuid]");
  if (allRows.length === 0) return;

  let appliedCount = 0;
  let totalCount = 0;
  allRows.forEach(row => {
    if (row.dataset.actorUuid) {
      totalCount++;
      if (row.dataset.hpApplied === "true") appliedCount++;
    }
  });

  // Update the header text
  const header = html.querySelector<HTMLElement>("#midi-qol-dmg-header");
  if (header) {
    if (appliedCount === 0) {
      header.textContent = i18n("midi-qol.HPNotUpdated");
    } else if (appliedCount === totalCount) {
      header.textContent = i18n("midi-qol.HPUpdated");
    } else {
      // Partial update - show count
      header.textContent = `${i18n("midi-qol.HPUpdated")} (${appliedCount}/${totalCount})`;
    }
  }
}

/** Helper to generate tooltip HTML for a damage item */
function generateDamageTooltip(damageItem: DamageListEntry, tokenName?: string): string {
  const tooltipList = damageItem.damageDetail?.map(di => {
    let allMods: string[] = Object.keys(di.active ?? {}).reduce((acc: string[], k) => {
      if (["semiSuperSaver", "superSaver"].includes(k)) return acc;
      if (di.active?.[k] && k !== "multiplier") acc.push(k);
      return acc;
    }, []);
    if ((di.allActives?.length ?? 0) > 0) allMods = allMods.concat(di.allActives!);
    let mods = (allMods.length > 0) ? `| ${allMods.join(",")}` : "";
    return `${di.value > 0 ? Math.floor(di.value) : Math.ceil(di.value)} ${{ ...GameSystemConfig.damageTypes, ...GameSystemConfig.healingTypes }[di.type === "" ? "none" : di.type]?.label ?? "none"} ${mods}`
  }).map(s => s.replaceAll(",,", ",").replaceAll(",,", ","));

  const toolTipHeader: string[] = [];
  if (damageItem.damageDetail) {
    if (damageItem.newHP !== damageItem.oldHP) toolTipHeader.push(`HP: ${damageItem.oldHP} -> ${damageItem.newHP}`);
    if ((damageItem.newTempHP ?? 0) !== (damageItem.oldTempHP ?? 0)) toolTipHeader.push(`TempHP: ${damageItem.oldTempHP} -> ${damageItem.newTempHP}`);
    if ((damageItem.newVitality ?? 0) !== (damageItem.oldVitality ?? 0)) toolTipHeader.push(`Vitality: ${damageItem.oldVitality} -> ${damageItem.newVitality}`);
    if (damageItem.superSaver) toolTipHeader.push("Super Saved");
    else if (damageItem.semiSuperSaver) toolTipHeader.push("Semi Super Saved");
    else if (damageItem.saved) toolTipHeader.push("Saved");
    if (damageItem.uncannyDodge) toolTipHeader.push("Uncanny Dodge");
    if (damageItem.details?.length > 0) toolTipHeader.push(...damageItem.details);
  }
  const parts: string[] = [];
  if (tokenName) parts.push(`<b>${tokenName}</b>`);
  parts.push(...(toolTipHeader ?? []), ...(tooltipList ?? []));
  return parts.join("<br>");
}

async function prepareDamageListItems(
  data: {
    damageList: DamageListEntry[];
    autoApplyDamage: string;
    flagTags: any;
    forceApply: boolean;
    updateOptions: any;
  },
  templateData: {
    damageApplied: string;
    damageWasApplied?: boolean;
    damageList: DamageListContextEntry[];
    needsButtonAll: boolean;
    showNPC?: boolean,
    playerButtons?: boolean;
  },
  tokenDataList: DamageListEntry[],
  createPromises: boolean = false,
  showNPC: boolean = true,
  doHits: boolean = true
): Promise<void> {
  const damageList = data.damageList;
  let promises: Promise<any>[] = [];

  for (let damageItem of damageList) {
    let { targetUuid, actorId, actorUuid, oldHP, newHP, hpDamage, wasHit } = damageItem;
    if (doHits && !wasHit) continue;
    if (!doHits && wasHit) continue;
    let tokenDocument = fromUuidSync(targetUuid) as TokenDocument.Implementation | null;
    let actor = fromUuidSync(actorUuid) as Actor.Implementation | null;

    if (!actor) {
      if (debugEnabled > 0) warn(`GMAction: reverse damage card could not find actor to update HP targetUuid ${targetUuid} actorUuid ${actorUuid}`);
      continue;
    }
    if (!showNPC && !actor.hasPlayerOwner) continue;

    // let newTempHP = Math.max(0, oldTempHP - tempDamage);
    // @ts-expect-error no dnd5e-types
    if (actor.isOwner && (data.autoApplyDamage !== "yesCardNPC" || actor.type !== "character")) {
      // @ts-expect-error no dnd5e-types
      const hp = actor.system.attributes.hp;
      let { amount, temp, healing, vitality: vitalityDamage } = calculateDamageAmounts(damageItem.damageDetail);
      amount = Math.max(0, amount);
      const { amount: rawAmount, healing: rawHealing, vitality: rawVitality } = calculateDamageAmounts(damageItem.rawDamageDetail);
      damageItem.totalDamage = damageItem.damageDetail.reduce((acc, d) => acc + (!["temphp", "midi-none", "vitality"].includes(d.type) ? d.value : 0), 0);
      amount = amount + healing;
      amount = amount > 0 ? Math.floor(amount) : Math.ceil(amount);

      let deltaTemp = amount > 0 ? Math.min(hp.temp, amount) : 0;
      // Since tempDamage represents the final change in tempHP - we can use it for calcs and it is ignored.

      let deltaHP = Math.clamp(amount - deltaTemp, -hp.damage, hp.value);
      if (hpDamage !== deltaHP) {
        error(`damage detail amount ${amount} !== hpDamage ${hpDamage}`, configSettings.useDamageDetail ? "ignoring hpDamage" : "using hpDamage");
        if (!configSettings.useDamageDetail) deltaHP = hpDamage;
      }
      const updates: Actor.UpdateData = {
        // @ts-expect-error no dnd5e-types
        "system.attributes.hp.temp": hp.temp - deltaTemp,
        "system.attributes.hp.value": hp.value - deltaHP
      };

      if (temp > updates["system.attributes.hp.temp"]) updates["system.attributes.hp.temp"] = temp;
      damageItem.newTempHP = updates["system.attributes.hp.temp"];
      damageItem.newHP = updates["system.attributes.hp.value"];
      damageItem.hpDamage = deltaHP;
      damageItem.tempDamage = deltaTemp;
      // Include healing and vitality in rawTotalDamage so it displays correctly
      damageItem.rawTotalDamage = rawAmount + rawHealing + rawVitality;

      // Handle vitality system - always record current vitality state for undo support
      const vitalityItem = getVitalityItem(actor);
      let vitalityItemUpdatePromise: Promise<any> | undefined;

      if (vitalityItem) {
        // Always record current vitality state so undo can restore it
        // @ts-expect-error uses exists on items with uses
        const currentSpent = vitalityItem.system.uses?.spent ?? 0;
        // @ts-expect-error uses exists on items with uses
        const maxUses = vitalityItem.system.uses?.max ?? 0;

        // Record old vitality state for undo support
        damageItem.oldVitalitySpent = currentSpent;
        damageItem.oldVitality = maxUses - currentSpent;
        // Default new to unchanged - only updated if there's overflow or direct vitality damage
        damageItem.newVitalitySpent = currentSpent;
        damageItem.newVitality = maxUses - currentSpent;

        let newSpent = currentSpent;

        // Handle direct vitality damage type (positive = damage, negative = healing)
        if (vitalityDamage !== 0) {
          if (vitalityDamage > 0) {
            // Vitality damage - increase spent (reduce vitality)
            newSpent = Math.min(maxUses, currentSpent + Math.floor(vitalityDamage));
          } else {
            // Vitality healing - decrease spent (restore vitality)
            newSpent = Math.max(0, currentSpent + Math.ceil(vitalityDamage));
          }
        }

        // Check for overflow damage when HP reaches 0 (only if not already handling direct vitality damage)
        if (updates["system.attributes.hp.value"] <= 0 && amount > 0) {
          const overflowDamage = amount - (hp.temp + hp.value);

          if (overflowDamage > 0) {
            // Add overflow damage to vitality spent
            newSpent = Math.min(maxUses, newSpent + overflowDamage);
          }
        }

        // Update if vitality changed
        if (newSpent !== currentSpent) {
          damageItem.newVitalitySpent = newSpent;
          damageItem.newVitality = maxUses - newSpent;

          // Queue vitality item update (will be executed after actor update)
          if (createPromises && doHits && (data.autoApplyDamage.includes("yes") || data.forceApply)) {
            // @ts-expect-error item update for uses.spent
            vitalityItemUpdatePromise = vitalityItem.update({ "system.uses.spent": newSpent });
          }
        }
      }

      if (createPromises && doHits && (data.autoApplyDamage.includes("yes") || data.forceApply)) {
        //recover the options used when calculating the damage
        // If midi-qol handled vitality (overflow or direct damage), mark it so the hook doesn't double-handle
        if (vitalityItemUpdatePromise) {
          (damageItem.calcDamageOptions as any).midiVitalityHandled = true;
        }
        if (Hooks.call("dnd5e.preApplyDamage", actor, amount, updates, damageItem.calcDamageOptions as DamageApplicationOptions) !== false) {
          // The actor update - when no changes are made will update the passed options with a target
          // If vitality update is pending, flag it so updateActor hook skips checkWounded (updateItem hook will handle it)
          const mergedOptions = foundry.utils.mergeObject(damageItem.calcDamageOptions, data.updateOptions ?? {}, { inplace: false }) as any;
          if (vitalityItemUpdatePromise) {
            mergedOptions.midiVitalityUpdatePending = true;
          }
          const updatePromise = actor.update(updates, mergedOptions).then(async updatedActor => {
            // Wait for vitality item update if needed
            // Note: checkWounded is called by the updateItem hook when vitality changes,
            // so we don't need to call it explicitly here
            if (vitalityItemUpdatePromise) {
              await vitalityItemUpdatePromise;
            }
            if (updatedActor) Hooks.call("dnd5e.applyDamage", updatedActor, amount, damageItem.calcDamageOptions as DamageApplicationOptions);
            return updatedActor;
          });
          promises.push(updatePromise);
        }
      }
    }
    tokenDataList.push({
      ...damageItem,
      targetUuid,
      actorUuid,
      actorId,
      totalDamage: Math.abs(Math.trunc(damageItem.totalDamage)),
      damageDetail: damageItem.rawDamageDetail,
      updateOptions: data.updateOptions ?? {}
    });

    let img = tokenDocument?.texture.src || actor.img as string;
    // @ts-expect-error no dnd5e-types
    if (configSettings.usePlayerPortrait && actor.type === "character")
      img = actor.img as string;
    if (foundry.helpers.media.VideoHelper.hasVideoExtension(img)) {
      img = await game.video!.createThumbnail(img, { width: 100, height: 100 });
    }

    const playerViewTotalDamage = damageItem.hpDamage + damageItem.tempDamage;
    const isHealing = (damageItem.rawTotalDamage ?? 0) < 0 || playerViewTotalDamage < 0;
    // Extract direct vitality damage/healing from damage detail (not overflow) - only if vitality system is enabled
    const vitalityEnabled = !!checkRule("vitalityItem");
    const directVitalityDamage = vitalityEnabled ? calculateDamageAmounts(damageItem.rawDamageDetail ?? damageItem.damageDetail ?? []).vitality : 0;
    let listItem: DamageListContextEntry = {
      isCharacter: actor.hasPlayerOwner,
      isNpc: !actor.hasPlayerOwner,
      actorUuid,
      targetUuid,
      displayUuid: actorUuid.replaceAll(".", ""),
      tokenId: tokenDocument?.id ?? undefined,
      tokenImg: img,
      hpDamage,
      abshpDamage: Math.abs(damageItem.hpDamage),
      tempDamage: (damageItem.newTempHP ?? 0) - (damageItem.oldTempHP ?? 0),
      totalDamage: Math.abs(Math.trunc(damageItem.totalDamage)),
      rawTotalDamage: damageItem.rawTotalDamage,
      halfDamage: Math.abs(Math.floor(damageItem.totalDamage / 2)),
      doubleDamage: Math.abs(damageItem.totalDamage * 2),
      playerViewTotalDamage,
      absDamage: Math.abs(damageItem.hpDamage),
      tokenName: (tokenDocument?.name && configSettings.useTokenNames) ? tokenDocument.name ?? actor.name : actor.name,
      dmgSign: damageItem.hpDamage < 0 ? "+" : "-",
      damageItem,
      oldVitality: damageItem.oldVitality,
      newVitality: damageItem.newVitality,
      vitalityIncrease: (damageItem.newVitality ?? 0) > (damageItem.oldVitality ?? 0),
      tempHpIncrease: (damageItem.newTempHP ?? 0) > (damageItem.oldTempHP ?? 0),
      hpChanged: newHP !== oldHP,
      tempHpChanged: (damageItem.newTempHP ?? 0) !== (damageItem.oldTempHP ?? 0),
      vitalityChanged: (damageItem.newVitality ?? 0) !== (damageItem.oldVitality ?? 0),
      noChange: newHP === oldHP && (damageItem.newTempHP ?? 0) === (damageItem.oldTempHP ?? 0) && (damageItem.newVitality ?? 0) === (damageItem.oldVitality ?? 0),
      buttonId: actorUuid,
      // @ts-expect-error no dnd5e-types
      iconPrefix: (data.autoApplyDamage === "yesCardNPC" && actor.type === "character") ? "*" : "",
      // Healing display properties
      isHealing,
      absRawTotalDamage: Math.abs(damageItem.rawTotalDamage ?? 0),
      absPlayerViewTotalDamage: Math.abs(playerViewTotalDamage),
      // Direct vitality damage/healing (not overflow)
      vitalityDamage: directVitalityDamage,
      absVitalityDamage: Math.abs(directVitalityDamage),
      vitalityDamageIsHealing: directVitalityDamage < 0,
    };

    listItem.tooltip = generateDamageTooltip(damageItem, listItem.tokenName);

    templateData.damageList.push(listItem);
  }
  const allPromises = Promise.all(promises).then((allPromised) => {
    if (debugEnabled > 0) warn("GMAction.prepareDamageListItems: all promises completed", allPromised);
  });
  const promisesStart = Date.now();
  if (data.updateOptions?.awaitDamageApplication !== false) {
    await allPromises;
    debug("GMAction.prepareDamageListItems: awaited all promises", Date.now() - promisesStart);
  }
}

// Fetch the token, then use the tokenData.actor.id
async function createPlayerDamageCard(data: {
  damageList: DamageListEntry[];
  autoApplyDamage: string;
  flagTags: any;
  sender: string;
  charName: string;
  actorId: string;
  actorUuid?: string;
  forceApply: boolean;
  updateOptions: any;
}): Promise<string | undefined> {
  let shouldShow = true;
  let chatCardUuid: string | undefined;
  if (configSettings.playerDamageCard === "none") return;
  if (configSettings.playerCardDamageDifferent) {
    shouldShow = false;
    for (let damageItem of data.damageList) {
      const { amount: rawAmount, healing: rawHealing } = calculateDamageAmounts(damageItem.rawDamageDetail);
      // rawDamageDetail contains original positive healing values, but hpDamage is negative for healing
      // Subtract rawHealing so the comparison works correctly for both damage and healing
      const rawTotal = rawAmount - rawHealing;
      if (rawTotal !== damageItem.hpDamage) {
        shouldShow = true;
        break;
      }
    }
  }
  if (!shouldShow) return;
  let showNPC = ["npcplayerresults", "npcplayerbuttons"].includes(configSettings.playerDamageCard);
  let playerButtons = ["playerbuttons", "npcplayerbuttons"].includes(configSettings.playerDamageCard);
  const damageList = data.damageList;
  let tokenDataList: DamageListEntry[] = [];
  let templateData = {
    damageApplied: ["yes", "yesCard", "yesCardMisses"].includes(data.autoApplyDamage) ? i18n("midi-qol.HPUpdated") : i18n("midi-qol.HPNotUpdated"),
    damageList: [] as DamageListContextEntry[],
    needsButtonAll: false,
    showNPC,
    playerButtons
  };

  prepareDamageListItems(data, templateData, tokenDataList, false, showNPC, true)
  if (templateData.damageList.length === 0) {
    log("No damage data to show to player");
    return;
  }

  templateData.needsButtonAll = damageList.length > 1;
  templateData.playerButtons = templateData.playerButtons && templateData.damageList.some(listItem => listItem.isCharacter);
  if (["yesCard", "noCard", "yesCardNPC", "yesCardMisses", "noCardMisses"].includes(data.autoApplyDamage)) {
    const playerTemplate = configSettings.damageCardStyle === "classic"
      ? "modules/midi-qol/templates/damage-results-player-classic.html"
      : "modules/midi-qol/templates/damage-results-player.html";
    const content = await foundry.applications.handlebars.renderTemplate(playerTemplate, templateData);
    const speaker: any = ChatMessage.getSpeaker();
    speaker.alias = data.sender;
    let chatData: any = {
      user: game.user?.id,
      speaker: { scene: getCanvas()?.scene?.id, alias: data.charName, user: game.user?.id, actor: data.actorId },
      content: content,
      // whisper: ChatMessage.getWhisperRecipients("players").filter(u => u.active).map(u => u.id),
      flags: { "midi-qol": { "undoDamage": prepareDamageListToJSON(tokenDataList), playerDamageCard: true, actorUuid: data.actorUuid } }
    };

    chatData.style = CONST.CHAT_MESSAGE_STYLES.OTHER;
    if (data.flagTags) chatData.flags = foundry.utils.mergeObject(chatData.flags ?? "", data.flagTags);
    chatCardUuid = (await ChatMessage.create(chatData))?.uuid;
  }
  return chatCardUuid;
}

// Fetch the token, then use the tokenData.actor.id
async function createGMReverseDamageCard(
  data: {
    damageList: DamageListEntry[];
    autoApplyDamage: string;
    flagTags: any,
    forceApply: boolean,
    updateOptions: any,
    actorUuid?: string,
  },
  doHits: boolean = true
): Promise<string | undefined> {
  const damageList = data.damageList;
  let tokenDataList: DamageListEntry[] = [];
  let chatCardUuid: string | undefined;
  const damageWasApplied = (doHits && (["yes", "yesCard", "yesCardMisses"].includes(data.autoApplyDamage) || data.forceApply));
  let templateData = {
    damageWasApplied,
    damageApplied: damageWasApplied ? i18n("midi-qol.HPUpdated") : data.autoApplyDamage === "yesCardNPC" ? i18n("midi-qol.HPNPCUpdated") : i18n("midi-qol.HPNotUpdated"),
    damageList: [] as DamageListContextEntry[],
    needsButtonAll: false
  };
  await prepareDamageListItems(data, templateData, tokenDataList, true, true, doHits)
  templateData.needsButtonAll = damageList.length > 1;
  if (["yesCard", "noCard", "yesCardNPC", "yesCardMisses", "noCardMisses"].includes(data.autoApplyDamage)) {
    const gmTemplate = configSettings.damageCardStyle === "classic"
      ? "modules/midi-qol/templates/damage-results-classic.html"
      : "modules/midi-qol/templates/damage-results.html";
    const content = await foundry.applications.handlebars.renderTemplate(gmTemplate, templateData);
    const speaker = ChatMessage.getSpeaker();
    speaker.alias = game.user?.name;
    let chatData: ChatMessage.CreateData = {
      speaker: { scene: getCanvas()?.scene?.id, alias: game.user?.name },
      content: content,
      whisper: ChatMessage.getWhisperRecipients("GM").filter(u => (u as User).active).map(u => u.id),
      flags: { [MODULE_ID]: { "undoDamage": prepareDamageListToJSON(tokenDataList), actorUuid: data.actorUuid } }
    };
    chatData.style = CONST.CHAT_MESSAGE_STYLES.OTHER;
    if (data.flagTags) chatData.flags = foundry.utils.mergeObject(chatData.flags ?? {}, data.flagTags);
    chatCardUuid = (await ChatMessage.create(chatData))?.uuid;
  }
  return chatCardUuid;
}

export let processUndoDamageCard = (message: ChatMessage.Implementation, html: HTMLElement, _data: unknown) => {
  if (!message.flags?.[MODULE_ID]?.undoDamage) return true;

  let button = html.querySelector<HTMLButtonElement>("#all-reverse");
  button?.addEventListener("click", (ev) => {
    (async () => {
      // TODO: Remove the latter after sufficient time has passed
      const undoFlag = message.flags?.[MODULE_ID]?.undoDamage ?? foundry.utils.getProperty(message, "flags.midi-qol.undoDamage") as SerializedDamageListEntry[];
      const undoDamageData = recoverDamageListFromJSON(undoFlag);
      if (undoDamageData) for (let { actorUuid, oldTempHP, oldHP, newHP, newTempHP, newVitality, calcDamageOptions, updateOptions } of undoDamageData) {
        if (!actorUuid) continue;
        const applyButton = html.querySelector<HTMLButtonElement>(`#apply-${actorUuid.replaceAll(".", "")}`);
        applyButton?.children[0].classList.add("midi-qol-enable-damage-button");
        applyButton?.children[0].classList.remove("midi-qol-disable-damage-button");
        const reverseButton = html.querySelector<HTMLButtonElement>(`#reverse-${actorUuid.replaceAll(".", "")}`);
        reverseButton?.children[0].classList.remove("midi-qol-enable-damage-button");
        reverseButton?.children[0].classList.add("midi-qol-disable-damage-button");
        // Reset multiplier to "="
        const multiplierSelect = html.querySelector<HTMLSelectElement>(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`);
        if (multiplierSelect) multiplierSelect.value = "calc";
        let actor = fromActorUuid(actorUuid);
        const updates: Actor.UpdateData = {
          //@ts-expect-error no dnd5e-types
          "system.attributes.hp.temp": oldTempHP ?? 0,
          "system.attributes.hp.value": oldHP ?? 0
        };
        // Handle vitality undo - only if actor still has a vitality item
        const undoItem = undoDamageData.find(d => d.actorUuid === actorUuid);
        const vitalityItem = getVitalityItem(actor);
        let vitalityUpdated = false;
        if (vitalityItem && undoItem?.oldVitalitySpent !== undefined) {
          // @ts-expect-error item update for uses.spent
          await vitalityItem.update({ "system.uses.spent": undoItem.oldVitalitySpent });
          vitalityUpdated = true;
        }
        if (actor?.isOwner && Hooks.call("dnd5e.preApplyDamage", actor, newHP - oldHP, updates, calcDamageOptions as DamageApplicationOptions) !== false) {
          // The actor update - when no changes are made will update the passed options with a target
          // Set midiVitalityUpdatePending if vitality was updated to prevent double checkWounded calls
          const mergedOptions = foundry.utils.mergeObject(calcDamageOptions, updateOptions ?? {}, { inplace: false }) as any;
          if (vitalityUpdated) mergedOptions.midiVitalityUpdatePending = true;
          await actor.update(updates, mergedOptions)
            .then(updatedActor => {
              Hooks.call("dnd5e.applyDamage", updatedActor ?? actor, newHP - oldHP, calcDamageOptions as DamageApplicationOptions);
              // Update display to show what apply would do (original damage display)
              if (undoItem) updateDamageCardDisplay(html, actorUuid, undoItem, false);
              // Update HP status for this target (reversed = not applied)
              updateHPStatusHeader(html, actorUuid, false);
              return updatedActor;
            })
        }
        ev.stopPropagation();
      }
    })();
  });

  button = html.querySelector<HTMLButtonElement>("#all-apply");
  button?.addEventListener("click", (ev) => {
    (async () => {
      // TODO: Remove the latter after sufficient time has passed
      const undoFlag = message.flags?.[MODULE_ID]?.undoDamage ?? foundry.utils.getProperty(message, "flags.midi-qol.undoDamage") as SerializedDamageListEntry[];
      const undoDamageData = recoverDamageListFromJSON(undoFlag);
      if (undoDamageData) for (let { actorUuid, newHP, newTempHP, oldHP, oldTempHP, oldVitality, calcDamageOptions, updateOptions } of undoDamageData) {
        if (!actorUuid) continue;
        let actor = fromActorUuid(actorUuid);
        const applyButton = html.querySelector<HTMLButtonElement>(`#apply-${actorUuid.replaceAll(".", "")}`);
        applyButton?.children[0].classList.add("midi-qol-disable-damage-button");
        applyButton?.children[0].classList.remove("midi-qol-enable-damage-button");
        const reverseButton = html.querySelector<HTMLButtonElement>(`#reverse-${actorUuid.replaceAll(".", "")}`);
        reverseButton?.children[0].classList.remove("midi-qol-disable-damage-button");
        reverseButton?.children[0].classList.add("midi-qol-enable-damage-button");
        log(`Setting HP to ${newTempHP} and ${newHP} ${actor?.name} ${actorUuid}`);
        const update = { "system.attributes.hp.temp": newTempHP ?? 0, "system.attributes.hp.value": newHP ?? 0 } as Actor.UpdateData;
        const amount = (newHP ?? 0) - (oldHP ?? 0);
        // Handle vitality apply - only if actor still has a vitality item
        const applyItem = undoDamageData.find(d => d.actorUuid === actorUuid);
        const vitalityItem = getVitalityItem(actor);
        let vitalityUpdated = false;
        if (vitalityItem && applyItem?.newVitalitySpent !== undefined) {
          // @ts-expect-error item update for uses.spent
          await vitalityItem.update({ "system.uses.spent": applyItem.newVitalitySpent });
          vitalityUpdated = true;
        }
        // Set midiVitalityUpdatePending if vitality was updated to prevent double checkWounded calls
        const options = foundry.utils.mergeObject(calcDamageOptions ?? {}, updateOptions ?? {}, { inplace: false }) as any;
        if (vitalityUpdated) options.midiVitalityUpdatePending = true;
        if (actor?.isOwner && Hooks.call("dnd5e.preApplyDamage", actor, amount, update, options as DamageApplicationOptions) !== false) {
          await actor.update(update, options).then(updatedActor => {
            Hooks.call("dnd5e.applyDamage", actor, amount, options);
            // Update display to show what undo would do (undo mode)
            if (applyItem) updateDamageCardDisplay(html, actorUuid, applyItem, true);
            // Update HP status for this target (applied = true)
            updateHPStatusHeader(html, actorUuid, true);
            return updatedActor;
          });
        }
        ev.stopPropagation();
      }
    })();
  })

  // TODO: Remove the latter after sufficient time has passed
  const undoFlag = message.flags?.[MODULE_ID]?.undoDamage ?? foundry.utils.getProperty(message, "flags.midi-qol.undoDamage") as SerializedDamageListEntry[];
  const undoDamageData = recoverDamageListFromJSON(undoFlag);
  undoDamageData?.forEach((undoEntry) => {
    const { actorUuid, oldTempHP, oldHP, newHP, newTempHP, oldVitality, newVitality, damageDetail, calcDamageOptions, updateOptions, oldVitalitySpent, newVitalitySpent } = undoEntry;
    if (!actorUuid) return;
    let button = html.querySelector<HTMLButtonElement>(`#reverse-${actorUuid.replaceAll(".", "")}`);
    button?.addEventListener("click", (ev) => {
      (ev.currentTarget as HTMLElement)?.children[0].classList.add("midi-qol-disable-damage-button");
      (ev.currentTarget as HTMLElement)?.children[0].classList.remove("midi-qol-enable-damage-button");
      const otherButton = html.querySelector<HTMLButtonElement>(`#apply-${actorUuid.replaceAll(".", "")}`);
      otherButton?.children[0].classList.remove("midi-qol-disable-damage-button");
      otherButton?.children[0].classList.add("midi-qol-enable-damage-button");
      // Reset multiplier to "="
      const multiplierSelect = html.querySelector<HTMLSelectElement>(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`);
      if (multiplierSelect) multiplierSelect.value = "calc";
      (async () => {
        let actor = fromActorUuid(actorUuid);
        log(`Setting HP back to ${oldTempHP} and ${oldHP} ${actor?.name} ${actorUuid}`);
        const amount = newHP - oldHP;
        const updates: Actor.UpdateData =
        {
          //@ts-expect-error no dnd5e-types
          "system.attributes.hp.temp": oldTempHP ?? 0,
          "system.attributes.hp.value": oldHP ?? 0
        };
        // Handle vitality undo - only if actor still has a vitality item
        const vitalityItem = getVitalityItem(actor);
        let vitalityUpdated = false;
        if (vitalityItem && oldVitalitySpent !== undefined) {
          // @ts-expect-error item update for uses.spent
          await vitalityItem.update({ "system.uses.spent": oldVitalitySpent });
          vitalityUpdated = true;
        }
        if (actor?.isOwner && Hooks.call("dnd5e.preApplyDamage", actor, amount, updates, calcDamageOptions as DamageApplicationOptions) !== false) {
          // The actor update - when no changes are made will update the passed options with a target
          // Set midiVitalityUpdatePending if vitality was updated to prevent double checkWounded calls
          const options = foundry.utils.mergeObject(calcDamageOptions ?? {}, updateOptions ?? {}, { inplace: false }) as any;
          if (vitalityUpdated) options.midiVitalityUpdatePending = true;
          await actor.update(updates, options).then(updatedActor => {
            Hooks.call("dnd5e.applyDamage", actor, amount, calcDamageOptions as DamageApplicationOptions);
            // Update display to show what apply would do (original damage display)
            updateDamageCardDisplay(html, actorUuid, undoEntry, false);
            // Update HP status for this target (reversed = not applied)
            updateHPStatusHeader(html, actorUuid, false);
            return updatedActor;
          })
        }
        ev.stopPropagation();
      })();
    });

    // Default action of button is to do midi damage
    button = html.querySelector<HTMLButtonElement>(`#apply-${actorUuid.replaceAll(".", "")}`);
    button?.addEventListener("click", (ev) => {
      (ev.currentTarget as HTMLElement)?.children[0].classList.add("midi-qol-disable-damage-button");
      (ev.currentTarget as HTMLElement)?.children[0].classList.remove("midi-qol-enable-damage-button");
      const otherButton = html.querySelector<HTMLButtonElement>(`#reverse-${actorUuid.replaceAll(".", "")}`);
      otherButton?.children[0].classList.remove("midi-qol-disable-damage-button");
      otherButton?.children[0].classList.add("midi-qol-enable-damage-button");
      const multiplierSelect = html.querySelector<HTMLSelectElement>(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`);
      let multiplierString = multiplierSelect?.value;
      const mults: Record<string, number> = { "-1": -1, "x1": 1, "x0.25": 0.25, "x0.5": 0.5, "x2": 2 };

      (async () => {
        let actor = fromActorUuid(actorUuid);
        if (multiplierString === "calc") {
          // For "=" case, directly apply the stored HP values (like reverse does with old values)
          const amount = (newHP ?? 0) - (oldHP ?? 0);
          const updates: Actor.UpdateData = {
            //@ts-expect-error no dnd5e-types
            "system.attributes.hp.temp": newTempHP ?? 0,
            "system.attributes.hp.value": newHP ?? 0
          };
          // Handle vitalityItem apply - only if actor still has a vitality item
          const vitalityItem = getVitalityItem(actor);
          let vitalityUpdated = false;
          if (vitalityItem && newVitalitySpent !== undefined) {
            // @ts-expect-error item update for uses.spent
            await vitalityItem.update({ "system.uses.spent": newVitalitySpent });
            vitalityUpdated = true;
          }
          // Set midiVitalityUpdatePending if vitality was updated to prevent double checkWounded calls
          const options = foundry.utils.mergeObject(calcDamageOptions ?? {}, updateOptions ?? {}, { inplace: false }) as any;
          if (vitalityUpdated) options.midiVitalityUpdatePending = true;
          if (actor?.isOwner && Hooks.call("dnd5e.preApplyDamage", actor, amount, updates, calcDamageOptions as DamageApplicationOptions) !== false) {
            await actor.update(updates, options).then(updatedActor => {
              Hooks.call("dnd5e.applyDamage", actor, amount, calcDamageOptions as DamageApplicationOptions);
              // Update display to show what undo would do (undo mode)
              updateDamageCardDisplay(html, actorUuid, undoEntry, true);
              // Update HP status for this target (applied = true)
              updateHPStatusHeader(html, actorUuid, true);
              return updatedActor;
            });
          }
        } else {
          // For other multipliers, use applyDamage with the new multiplier
          // Calculate what vitality will be after applying the multiplied damage
          const applyOptions: DamageApplicationOptions = foundry.utils.mergeObject(updateOptions ?? {}, { multiplier: mults[multiplierString ?? "x1"] ?? 1 }, { inplace: false });

          // Get current HP before applying
          // @ts-expect-error no dnd5e types
          const preApplyHP = actor?.system.attributes.hp.value ?? 0;
          // @ts-expect-error no dnd5e types
          const preApplyTempHP = actor?.system.attributes.hp.temp ?? 0;

          // Separate vitality damage from HP damage
          // Filter out vitality from damageDetail for HP application
          const hpDamageDetail = damageDetail?.filter(d => d.type !== "vitality") ?? [];

          // Calculate the multiplied HP damage (excluding vitality)
          // @ts-expect-error no dnd5e-types
          const calculatedDamages: DamageDescription[] = foundry.utils.deepClone(actor?.calculateDamage(hpDamageDetail, applyOptions) ?? []);
          let totalMultipliedHpDamage = 0;
          for (const dmg of calculatedDamages) {
            if (dmg.type !== "temphp" && !["midi-none", "none", "vitality"].includes(dmg.type)) {
              totalMultipliedHpDamage += dmg.value;
            }
          }
          totalMultipliedHpDamage = Math.trunc(totalMultipliedHpDamage);

          // Calculate multiplied direct vitality damage separately
          const multiplier = mults[multiplierString ?? "x1"] ?? 1;
          let multipliedVitalityDamage = 0;
          for (const d of damageDetail ?? []) {
            if (d.type === "vitality") {
              multipliedVitalityDamage += d.value * multiplier;
            }
          }
          multipliedVitalityDamage = Math.trunc(multipliedVitalityDamage);

          // Calculate vitality changes
          const vitalityItem = getVitalityItem(actor);
          // @ts-expect-error uses exists on items with uses
          const currentSpent = vitalityItem?.system.uses?.spent ?? 0;
          // @ts-expect-error uses exists on items with uses
          const maxUses = vitalityItem?.system.uses?.max ?? 0;
          let newSpent = currentSpent;

          if (vitalityItem) {
            // First apply direct vitality damage (positive = damage, negative = healing)
            if (multipliedVitalityDamage > 0) {
              newSpent = Math.min(maxUses, currentSpent + multipliedVitalityDamage);
            } else if (multipliedVitalityDamage < 0) {
              newSpent = Math.max(0, currentSpent + multipliedVitalityDamage);
            }

            // Then calculate overflow from HP damage
            if (totalMultipliedHpDamage > 0) {
              const tempAbsorbed = Math.min(preApplyTempHP, totalMultipliedHpDamage);
              const hpAbsorbed = Math.min(preApplyHP, totalMultipliedHpDamage - tempAbsorbed);
              const overflowDamage = totalMultipliedHpDamage - tempAbsorbed - hpAbsorbed;
              if (overflowDamage > 0) {
                newSpent = Math.min(maxUses, newSpent + overflowDamage);
              }
            } else if (totalMultipliedHpDamage < 0) {
              // Healing case - restore vitality first, then HP
              const healingAmount = Math.abs(totalMultipliedHpDamage);
              const vitalityMissing = newSpent; // newSpent is how much vitality is missing after direct vitality damage
              const vitalityRestored = Math.min(vitalityMissing, healingAmount);

              if (vitalityRestored > 0) {
                newSpent = newSpent - vitalityRestored;

                // Adjust the multiplier to reduce healing applied to HP
                const remainingHealing = healingAmount - vitalityRestored;
                if (remainingHealing > 0) {
                  // Scale down the multiplier proportionally
                  const scaleFactor = remainingHealing / healingAmount;
                  applyOptions.multiplier = (applyOptions.multiplier ?? 1) * scaleFactor;
                } else {
                  // All healing went to vitality, no HP healing needed
                  applyOptions.multiplier = 0;
                }
              }
            }
          }

          // Apply HP damage (excluding vitality) with flag to prevent hook from also updating vitality
          applyOptions.midiVitalityHandled = true;
          // @ts-expect-error no dnd5e-types
          await actor?.applyDamage(hpDamageDetail, applyOptions);

          // Now update vitality if there was any change
          if (vitalityItem && newSpent !== currentSpent) {
            // @ts-expect-error item update for uses.spent
            await vitalityItem.update({ "system.uses.spent": newSpent });
          }

          // Update display to show what undo would do (undo mode)
          updateDamageCardDisplay(html, actorUuid, undoEntry, true);
          // Update HP status for this target (applied = true)
          updateHPStatusHeader(html, actorUuid, true);
        }
      })();
    });

    // Add change listener to multiplier dropdown to preview damage
    const displayUuidForSelect = actorUuid.replaceAll(".", "");
    const multiplierSelect = html.querySelector<HTMLSelectElement>(`#dmg-multiplier-${displayUuidForSelect}`);
    multiplierSelect?.addEventListener("change", async (ev) => {
      const actor = fromActorUuid(actorUuid);
      if (!actor) return;

      const multiplierString = (ev.target as HTMLSelectElement).value;
      const mults: Record<string, number> = { "-1": -1, "x1": 1, "x0.25": 0.25, "x0.5": 0.5, "x2": 2 };
      const displayUuid = actorUuid.replaceAll(".", "");

      // Get current actor HP values
      // @ts-expect-error no dnd5e types
      const currentHP = actor.system.attributes.hp.value ?? 0;
      // @ts-expect-error no dnd5e types
      const currentTempHP = actor.system.attributes.hp.temp ?? 0;
      // @ts-expect-error no dnd5e types
      const maxHP = actor.system.attributes.hp.max ?? 0;

      // Calculate damage with the selected multiplier
      // "calc" uses the original options (with saves), others use clean options with just the multiplier
      let options: DamageApplicationOptions;
      if (multiplierString === "calc") {
        // Use original calculated options (includes save information)
        options = foundry.utils.deepClone(calcDamageOptions ?? {}) as DamageApplicationOptions;
      } else {
        // Use absolute multiplier without save information
        options = { multiplier: mults[multiplierString ?? "x1"] ?? 1 } as DamageApplicationOptions;
      }

      // Use actor.calculateDamage to preview the result
      // @ts-expect-error no dnd5e types
      const calculatedDamages: DamageDescription[] = foundry.utils.deepClone(actor.calculateDamage(damageDetail, options));

      // Sum up the damage values and truncate towards 0 (matching how damage is actually applied)
      // Exclude vitality from HP total - it's shown separately
      let totalDamage = 0;
      let tempHpDamage = 0;
      let multipliedVitalityDamage = 0;
      for (const dmg of calculatedDamages) {
        if (dmg.type === "temphp") {
          tempHpDamage += dmg.value;
        } else if (dmg.type === "vitality") {
          multipliedVitalityDamage += dmg.value;
        } else if (!["midi-none", "none"].includes(dmg.type)) {
          totalDamage += dmg.value;
        }
      }
      // Truncate towards 0 to match actual damage application
      totalDamage = Math.trunc(totalDamage);
      tempHpDamage = Math.trunc(tempHpDamage);
      multipliedVitalityDamage = Math.trunc(multipliedVitalityDamage);

      // Calculate new HP/temp HP values
      let newTempHP = currentTempHP;
      let newHP = currentHP;
      const isHealing = totalDamage < 0;

      if (tempHpDamage > 0) {
        // Gaining temp HP - take the higher value
        newTempHP = Math.max(currentTempHP, tempHpDamage);
      }

      if (isHealing) {
        // Healing - first restore vitality, then HP
        // Note: totalDamage is negative for healing, so we use Math.abs
        let healingRemaining = Math.abs(totalDamage);
        // Vitality restoration is handled below in the vitality display section
        newHP = Math.min(maxHP, currentHP + healingRemaining);
      } else {
        // Damage - first absorb with temp HP, then HP
        let remainingDamage = totalDamage;
        if (currentTempHP > 0 && remainingDamage > 0) {
          const tempAbsorbed = Math.min(currentTempHP, remainingDamage);
          newTempHP = currentTempHP - tempAbsorbed;
          remainingDamage -= tempAbsorbed;
        }
        newHP = Math.max(0, currentHP - remainingDamage);
      }

      // Update display elements
      const totalSpan = html.querySelector<HTMLSpanElement>(`#dmg-total-${displayUuid}`);
      const tempSpan = html.querySelector<HTMLSpanElement>(`#dmg-temp-${displayUuid}`);
      const hpSpan = html.querySelector<HTMLSpanElement>(`#dmg-hp-${displayUuid}`);
      const noChangeSpan = html.querySelector<HTMLSpanElement>(`#dmg-nochange-${displayUuid}`);

      // Get vitality info early to calculate max absorbable damage
      const vitalityItem = getVitalityItem(actor);
      let currentVitality = 0;
      if (vitalityItem) {
        // @ts-expect-error uses exists on items with uses
        const currentSpent = vitalityItem.system.uses?.spent ?? 0;
        // @ts-expect-error uses exists on items with uses
        const maxUses = vitalityItem.system.uses?.max ?? 0;
        currentVitality = maxUses - currentSpent;
      }

      // Cap damage display at max absorbable (HP + tempHP + vitality)
      const maxAbsorbable = currentTempHP + currentHP + currentVitality;
      const cappedDamage = isHealing ? Math.abs(totalDamage) : Math.min(Math.abs(totalDamage), maxAbsorbable);
      const absTotalDamage = Math.trunc(cappedDamage);

      const hpChanged = newHP !== currentHP;
      const tempHpChanged = newTempHP !== currentTempHP;
      // Always show total damage if there's damage to apply (even if HP is already at 0 and damage goes to vitality)
      const hasDamageToApply = absTotalDamage > 0;
      const noChange = !hpChanged && !tempHpChanged && !hasDamageToApply;

      // Update total damage display - show if there's any damage to apply
      if (totalSpan) {
        totalSpan.classList.toggle("midi-qol-dmg-hidden", !hasDamageToApply);
        totalSpan.classList.toggle("midi-qol-dmg-healing", isHealing);
        totalSpan.textContent = `${isHealing ? "+" : "-"}${absTotalDamage}`;
      }

      // Update temp HP display
      if (tempSpan) {
        tempSpan.classList.toggle("midi-qol-dmg-hidden", !tempHpChanged);
        tempSpan.classList.toggle("midi-qol-dmg-healing", newTempHP > currentTempHP);
        const tempOld = tempSpan.querySelector<HTMLSpanElement>(".dmg-temp-old");
        const tempNew = tempSpan.querySelector<HTMLSpanElement>(".dmg-temp-new");
        if (tempOld) tempOld.textContent = String(Math.trunc(currentTempHP));
        if (tempNew) tempNew.textContent = String(Math.trunc(newTempHP));
      }

      // Update HP display
      if (hpSpan) {
        hpSpan.classList.toggle("midi-qol-dmg-hidden", !hpChanged);
        hpSpan.classList.toggle("midi-qol-dmg-healing", isHealing);
        const hpOld = hpSpan.querySelector<HTMLSpanElement>(".dmg-hp-old");
        const hpNew = hpSpan.querySelector<HTMLSpanElement>(".dmg-hp-new");
        if (hpOld) hpOld.textContent = String(Math.trunc(currentHP));
        if (hpNew) hpNew.textContent = String(Math.trunc(newHP));
      }

      // Update no change display
      if (noChangeSpan) {
        noChangeSpan.classList.toggle("midi-qol-dmg-hidden", !noChange);
      }

      // Update vitality display if actor has vitality
      const vitalitySpan = html.querySelector<HTMLSpanElement>(`#dmg-vitality-${displayUuid}`);
      const directVitalitySpan = html.querySelector<HTMLSpanElement>(`#dmg-vit-direct-${displayUuid}`);
      // @ts-expect-error uses exists on items with uses
      const maxVitality = vitalityItem?.system.uses?.max ?? 0;
      if (vitalityItem) {
        let newVitality = currentVitality;

        // Apply direct vitality damage first (positive = damage, negative = healing)
        if (multipliedVitalityDamage > 0) {
          newVitality = Math.max(0, currentVitality - multipliedVitalityDamage);
        } else if (multipliedVitalityDamage < 0) {
          newVitality = Math.min(maxVitality, currentVitality - multipliedVitalityDamage);
        }

        if (isHealing) {
          // Healing - first restore vitality, then HP
          const healingAmount = Math.abs(totalDamage);
          const vitalityMissing = maxVitality - newVitality;
          const vitalityRestored = Math.min(vitalityMissing, healingAmount);
          newVitality = newVitality + vitalityRestored;
          // Recalculate newHP with remaining healing after vitality restoration
          const remainingHealing = healingAmount - vitalityRestored;
          newHP = Math.min(maxHP, currentHP + remainingHealing);
        } else if (newHP <= 0 && totalDamage > 0) {
          // Damage - calculate overflow to vitality (only if HP reaches 0)
          const tempAbsorbed = Math.min(currentTempHP, totalDamage);
          const hpAbsorbed = Math.min(currentHP, totalDamage - tempAbsorbed);
          const overflowDamage = totalDamage - tempAbsorbed - hpAbsorbed;
          if (overflowDamage > 0) {
            newVitality = Math.max(0, newVitality - overflowDamage);
          }
        }

        const vitalityChanged = newVitality !== currentVitality;
        const vitalityIncrease = newVitality > currentVitality;

        // Update direct vitality damage display (shows multiplied vitality damage)
        if (directVitalitySpan) {
          const hasDirectVitality = multipliedVitalityDamage !== 0;
          const directVitalityIsHealing = multipliedVitalityDamage < 0;
          directVitalitySpan.classList.toggle("midi-qol-dmg-hidden", !hasDirectVitality);
          directVitalitySpan.classList.toggle("midi-qol-dmg-healing", directVitalityIsHealing);
          const signSpan = directVitalitySpan.querySelector<HTMLSpanElement>(".dmg-vit-sign");
          if (signSpan) signSpan.textContent = directVitalityIsHealing ? "+" : "-";
          const valueSpan = directVitalitySpan.querySelector<HTMLSpanElement>(".dmg-vit-value");
          if (valueSpan) valueSpan.textContent = String(Math.abs(multipliedVitalityDamage));
        }

        // Update vitality transition display (old → new)
        if (vitalitySpan) {
          vitalitySpan.classList.toggle("midi-qol-dmg-hidden", !vitalityChanged);
          vitalitySpan.classList.toggle("midi-qol-dmg-healing", vitalityIncrease);

          const vitOld = vitalitySpan.querySelector<HTMLSpanElement>(".dmg-vit-old");
          const vitNew = vitalitySpan.querySelector<HTMLSpanElement>(".dmg-vit-new");
          if (vitOld) vitOld.textContent = String(Math.trunc(currentVitality));
          if (vitNew) vitNew.textContent = String(Math.trunc(newVitality));
        }

        // Update HP display with corrected value after vitality restoration
        if (isHealing && hpSpan) {
          const hpNew = hpSpan.querySelector<HTMLSpanElement>(".dmg-hp-new");
          if (hpNew) hpNew.textContent = String(Math.trunc(newHP));
          const hpChangedAfterVitality = newHP !== currentHP;
          hpSpan.classList.toggle("midi-qol-dmg-hidden", !hpChangedAfterVitality);
        }
      } else {
        // No vitality item - hide the displays
        if (vitalitySpan) vitalitySpan.classList.add("midi-qol-dmg-hidden");
        if (directVitalitySpan) directVitalitySpan.classList.add("midi-qol-dmg-hidden");
      }
    });

    // Add token image click to select token and right-click to open actor sheet
    const allTokenImgs = html.querySelectorAll<HTMLImageElement>(`img.midi-qol-target-name`);
    allTokenImgs.forEach((img) => {
      // Get the parent container and check if it has our displayUuid elements
      const parent = img.closest(".midi-qol-tooltip");
      if (!parent) return;
      const hasOurElements = parent.querySelector(`#dmg-total-${actorUuid.replaceAll(".", "")}`);
      if (!hasOurElements) return;

      // Single click to select token and pan to it
      img.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const tokenId = img.id;
        const token = canvas.tokens?.get(tokenId);
        if (token) {
          token.control({ releaseOthers: !ev.shiftKey });
          // Pan to the token center
          const center = token.center;
          canvas.animatePan({ x: center.x, y: center.y });
        }
      }, { capture: true });

      // Right-click to open actor sheet
      img.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const actor = fromActorUuid(actorUuid);
        if (actor) {
          actor.sheet?.render(true);
        }
      }, { capture: true });
    });
  })

  return true;
}

async function _moveToken(data: { tokenUuid: string, newCenter: { x: number, y: number }, animate: boolean }): Promise<any> {
  const tokenDocument = fromUuidSync(data.tokenUuid) as TokenDocument.Implementation | undefined;
  if (!tokenDocument || !canvas.grid || !tokenDocument.object) return;
  const targetToken = tokenDocument.object;
  const newCenter = canvas.grid.getSnappedPoint(data.newCenter, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
  const newPosition = { x: data.newCenter.x - targetToken.w / 2, y: data.newCenter.y - targetToken.h / 2 };
  return tokenDocument.update(newPosition, { animate: data.animate ?? true });
}


async function _moveTokenAwayFromPoint(data: { targetUuid: string, point: { x: number, y: number }, distance: number, animate: boolean, checkCollision: boolean }): Promise<void> {
  const targetToken = getToken(data.targetUuid);
  const targetTokenDocument = getTokenDocument(targetToken);
  if (!canvas || !canvas.dimensions || !canvas.grid || !targetToken || !data.point || !targetTokenDocument) return;
  let ray = new foundry.canvas.geometry.Ray(data.point, targetToken.center);
  let distance = data.distance / canvas.dimensions.distance * canvas.dimensions.size;
  let newCenter = ray.project(1 + distance / ray.distance);
  const M = CONST.GRID_SNAPPING_MODES;
  newCenter = newCenter = canvas.grid.getSnappedPoint(newCenter, { mode: M.CENTER });

  if (data.checkCollision) {
    const testCollision = CONFIG.Canvas.polygonBackends.move.testCollision(targetToken.center, newCenter, { type: "move", mode: "closest" });
    if (testCollision) {
      const collisionPoint = { x: testCollision.x, y: testCollision.y };
      const getCenterCollisionPoint = canvas.grid.getCenterPoint(collisionPoint);
      if (Math.sign(ray.dx) > 0) getCenterCollisionPoint.x -= canvas.grid.sizeX;
      if (Math.sign(ray.dy) > 0) getCenterCollisionPoint.y -= canvas.grid.sizeY;
      const newPosition = canvas.grid.getSnappedPoint({ x: getCenterCollisionPoint.x - Math.sign(ray.dx) * targetToken.w / 2, y: getCenterCollisionPoint.y - Math.sign(ray.dy) * targetToken.h / 2 }, { mode: M.TOP_LEFT_VERTEX });
      return void targetTokenDocument.update(newPosition, { animate: data.animate ?? true });
    }
  }
  const newX = targetToken.position.x + newCenter.x - targetToken.center.x;
  const newY = targetToken.position.y + newCenter.y - targetToken.center.y;
  return void targetTokenDocument.update({ x: newX, y: newY }, { animate: data.animate ?? true });
}

async function rollActionSave(data: any) {
  let { request, actorUuid, abilities, options, content, title, saveDC } = data;
  let saveResult: any = await new Promise(async (resolve, reject) => {
    const buttons: foundry.applications.api.DialogV2.Button<any>[] = [];
    for (let ability of abilities) {
      let config: any = {
        type: request,
        dc: saveDC,
        action: "rollRequest",
        hideDC: !game.user?.isGM && !shouldDisplaySaveDC(),
        format: "short",
        icon: false
      };
      if (["check", "save"].includes(request)) config.ability = ability;
      else if (request === "skill") {
        config.skill = ability;
        config.ability = GameSystemConfig.skills[ability].ability;
      }
      const button = {
        //@ts-expect-error
        label: game.system?.enrichers?.createRollLabel(config) ?? `${saveDC} ${ability} ${request}`,
        icon: "fas fa-shield-heart",
        action: ability,
        callback: async (html: any) => {
          let roll = await rollAbility({
            targetUuid: actorUuid,
            request,
            ability: config.ability,
            skill: config.skill,
            options
          })
          resolve(roll)
        }
      };
      buttons.push(button);
    }
    if (!foundry.utils.isEmpty(buttons)) {
      buttons.push({
        action: "no",
        icon: "fa-solid fa-xmark",
        label: `No`,
        callback: async () => {
          resolve(undefined);
        }
      });
      const id = `overtime-dialog-${foundry.utils.randomID()}`;
      await DialogV2.wait({
        window: { title },
        content: `<style>  #${id} .form-footer { flex-direction: column;} </style> ${content}`,
        buttons,
        id,
        rejectClose: false,
        close: () => { return (null) }
      });
    }
    resolve("invalid");
  })
  return saveResult
}

export interface SerializedDamageListEntry extends Omit<DamageListEntry, "calcDamageOptions" | "damageDetail" | "rawDamageDetail" | "damageDetails"> {
  damageDetail: DamageDescriptionObject[];
  damageDetails: {
    bonusDamage?: DamageDescriptionObject[];
    combinedDamage: DamageDescriptionObject[];
    defaultDamage?: DamageDescriptionObject[];
    otherDamage?: DamageDescriptionObject[];
    rawbonusDamage?: DamageDescriptionObject[];
    rawcombinedDamage: DamageDescriptionObject[];
    rawdefaultDamage?: DamageDescriptionObject[];
    rawotherDamage?: DamageDescriptionObject[];
  };
  rawDamageDetail: DamageDescriptionObject[]
  calcDamageOptions: Omit<DamageApplicationOptions, "downgrade" | "ignore"> & {
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
}
export function prepareDamageListToJSON(damageList: DamageListEntry[]) {
  const newDL = foundry.utils.deepClone(damageList).map(damageItem => {
    const { downgrade, ignore } = damageItem.calcDamageOptions;
    let newDowngrade: true | string[] | undefined;
    if (downgrade instanceof Set) newDowngrade = Array.from(downgrade);
    else if (downgrade) newDowngrade = downgrade;
    let newIgnore: true | Record<string, true | string[]> | undefined;
    if (ignore === true) newIgnore = ignore;
    else if (ignore) {
      newIgnore = {};
      for (const [key, value] of Object.entries(ignore)) {
        if (value instanceof Set) newIgnore[key] = Array.from(value);
        else if (value) newIgnore[key] = value;
      }
    }
    const newDamageDetail = prepareDamageDetailToJSON(damageItem.damageDetail);
    const newRawDamageDetail = prepareDamageDetailToJSON(damageItem.rawDamageDetail);
    const newDamageDetails = Object.fromEntries(Object.entries(damageItem.damageDetails).filter(i => i[0] !== "calcDamageOptions").map(([key, value]) => [key, prepareDamageDetailToJSON(value as DamageDescription[])]));
    const serializedEntry: SerializedDamageListEntry = {
      ...damageItem,
      calcDamageOptions: {
        ...damageItem.calcDamageOptions,
        downgrade: newDowngrade,
        ignore: newIgnore as SerializedDamageListEntry["calcDamageOptions"]["ignore"]
      },
      damageDetail: newDamageDetail,
      rawDamageDetail: newRawDamageDetail,
      // Maybe some day I'll figure out the proper way to type this
      damageDetails: newDamageDetails as unknown as SerializedDamageListEntry["damageDetails"]
    }
    return serializedEntry;
  });
  return newDL;
}

function prepareDamageDetailToJSON(damageDetail?: DamageDescription[]): DamageDescriptionObject[] {
  return (damageDetail ?? []).map(d => ({ ...d, properties: Array.from(d.properties ?? []) }));
}

function recoverDamageListFromJSON(damageList: SerializedDamageListEntry[]): DamageListEntry[] {
  const newDL = foundry.utils.deepClone(damageList).map(damageItem => {
    const { downgrade, ignore } = damageItem.calcDamageOptions;
    let newDowngrade: true | Set<string> | undefined;
    if (downgrade instanceof Array) newDowngrade = new Set(downgrade);
    else if (downgrade) newDowngrade = downgrade;
    let newIgnore: true | Record<string, true | Set<string>> | undefined;
    if (ignore === true) newIgnore = ignore;
    else if (ignore) {
      newIgnore = {};
      for (const [key, value] of Object.entries(ignore)) {
        if (value instanceof Array) newIgnore[key] = new Set(value);
        else if (value) newIgnore[key] = value;
      }
    }
    const newDamageDetail = recoverDamageDetailFromJSON(damageItem.damageDetail);
    const newRawDamageDetail = recoverDamageDetailFromJSON(damageItem.rawDamageDetail);
    const newDamageDetails = Object.fromEntries(Object.entries(damageItem.damageDetails).map(([key, value]) => [key, recoverDamageDetailFromJSON(value)]));
    const unSerializedEntry: DamageListEntry = {
      ...damageItem,
      calcDamageOptions: {
        ...damageItem.calcDamageOptions,
        downgrade: newDowngrade,
        ignore: newIgnore as DamageListEntry["calcDamageOptions"]["ignore"]
      } as DamageListEntry["calcDamageOptions"],
      damageDetail: newDamageDetail,
      rawDamageDetail: newRawDamageDetail,
      damageDetails: newDamageDetails as unknown as DamageListEntry["damageDetails"]
    }
    return unSerializedEntry;
  });
  return newDL;
}

function recoverDamageDetailFromJSON(damageDetail?: DamageDescriptionObject[]): DamageDescription[] {
  return (damageDetail ?? []).map(d => ({ ...d, properties: new Set(d.properties) }));
}
