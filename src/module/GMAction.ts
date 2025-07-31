import { checkRule, configSettings, safeGetGameSetting } from "./settings.js";
import { i18n, log, warn, gameStats, getCanvas, error, debugEnabled, debug, GameSystemConfig, MODULE_ID } from "../midi-qol.js";
import { canSense, getToken, getTokenDocument, gmOverTimeEffect, fromActorUuid, promptReactions, hasUsedAction, hasUsedBonusAction, hasUsedReaction, removeActionUsed, removeBonusActionUsed, removeReactionUsed, ReactionItemReference, isEffectExpired, expireEffects, getAppliedEffects, CERemoveEffect, CEAddEffectWith, getActor, completeItemUse, completeActivityUse, localActivityOverTimeEffect, isValidTarget } from "./utils.js";
import { ddbglPendingFired } from "./chatMessageHandling.js";
import { DamageDescriptionObject, Workflow, WorkflowOptions } from "./Workflow.js";
import { bonusCheck } from "./patching.js";
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
  if (hasUsedReaction(actor)) await removeReactionUsed(actor);
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

export async function timedExecuteAsGM(toDo: string, data: any) {
  if (false) return unTimedExecuteAsGM(toDo, data);
  const start = Date.now();
  data.playerId = game.user?.id;
  const returnValue = await unTimedExecuteAsGM(toDo, data);
  log(`executeAsGM: ${toDo} elapsed: ${Date.now() - start}ms`)
  return returnValue;
}

export function preferredActiveGM() {
  const preferredGMId = safeGetGameSetting("midi-qol", "PreferredGM");
  if (preferredGMId !== "none") {
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
  const preferredGMId = safeGetGameSetting("midi-qol", "PreferredGM");
  let preferredGM = game.users?.get(preferredGMId);
  if (!preferredGM?.active) {
    if (preferredGMId !== "none") log(`preferredGM ${preferredGMId} is not active`);
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
  const actor = fromActorUuid(data.actorUuid) as Actor.Implementation | undefined;
  const effect = fromUuidSync(data.effectUuid) as ActiveEffect.Implementation | undefined;
  log("Called _gmOvertime", actor?.name, effect?.name)
  if (actor && effect) return gmOverTimeEffect(actor, effect, data.startTurn, data.options)
}

async function _localActivityOverTimeEffect(data: { actorUuid: string, effectUuid: string, startTurn: boolean, options: any }) {
  const actor  = await fromUuid(data.actorUuid) as Actor.Implementation | undefined;
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

async function updateActor(data: {actorUuid: string, updates?: Actor.UpdateData, actorData?: Actor.UpdateData}) {
  let actor = fromUuidSync(data.actorUuid) as Actor.Implementation | undefined;
  if (!actor) return;
  if (data.actorData) {
    console.warn(`midi-qol | updateActor actorData deprecated. Call await MidiQOL.socket().executeAsGM("updateActor"({ updates }) instead`)
    await actor.update(data.actorData);
  }
  if (data.updates) await actor.update(data.updates);
}

async function createActor(data: {actorData: Actor.CreateData | Actor.CreateData[], context: Actor.Database.CreateOperation<false>}) {
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

async function deleteItemEffects(data: { targets: {tokenUuid?: string; actorUuid?: string}[], origin: string, ignore: string[], ignoreTransfer: boolean, options: any }) {
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
  const document = fromUuidSync(data.documentUuid) as foundry.abstract.Document.Any | undefined;
  // @ts-expect-error .addDependent
  if (!document || !document.addDependent) {
    error("GMAction.addDependent | document not found or does not support addDependent", data.documentUuid);
    return undefined;
  }
  const dependent = fromUuidSync(data.dependentUuid) as foundry.abstract.Document.Any | undefined;
  if (!dependent) {
    error("GMAction.addDependent | dependent not found", data.dependentUuid);
    return undefined;
  }
  //@ts-expect-error .addDependent
  return document.addDependent(dependent);
}

async function localDoReactions(data: { tokenUuid: string; reactionActivityList: ReactionItemReference[], triggerTokenUuid: string, reactionFlavor: string; triggerType: string; options: any }) {
  if (data.options.itemUuid) {
    data.options.item = fromUuidSync(data.options.itemUuid);
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
  const actor = fromUuidSync(data.actorUuid) as Actor.Implementation | undefined;
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
  skill?: string;
  tool?: string;
  proficiency?: string;
  options?: {
    fastForward?: boolean;
    chatMessage?: boolean;
    create?: boolean;
    rollMode?: string;
    itemId: string;
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
    const requestedTool = data.tool;
    let tool = actor.items.get(data.options?.itemId ?? "");
    // @ts-expect-error no dnd5e-types
    if (!tool) tool = actor.items.find(i => i.type === "tool" && i.system.type.baseItem === requestedTool);
    if (!tool) { // no tool of the requested type - auto fail
      //@ts-expect-error
      return [await new CONFIG.Dice.D20Roll("-1").roll()];
    } else {
      // @ts-expect-error no dnd5e-types
      config.bonus = tool?.system.bonus ?? 0;
      // @ts-expect-error no dnd5e-types
      config.prof = tool?.system.prof;
      config.item = tool;
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

async function createReverseDamageCard(data: {
  damageList: SerializedDamageListEntry[];
  autoApplyDamage: string;
  flagTags: any,
  sender: string,
  charName: string,
  actorId: string,
  forceApply: boolean,
  updateOptions: any
}): Promise<string[]> {
  let cardIds: string[] = [];
  const newDamageList = recoverDamageListFromJSON(data.damageList);
  let id = await createPlayerDamageCard({...data, damageList: newDamageList});
  if (id) cardIds.push(id);
  if (data.damageList.some(di => di.wasHit)) {
    id = await createGMReverseDamageCard({...data, damageList: newDamageList}, true);
    if (id) cardIds.push(id);
  }
  if (data.damageList.some(di => !di.wasHit) && ["yesCardMisses", "noCardMisses"].includes(data.autoApplyDamage)) {
    id = await createGMReverseDamageCard({...data, damageList: newDamageList}, false);
    if (id) cardIds.push(id);
  }
  return cardIds;
}

interface DamageListContextEntry {
  isCharacter: boolean;
  isNpc: boolean;
  actorUuid: string;
  targetUuid: string;
  displayUuid: string;
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
  buttonId: string;
  iconPrefix: string;
  tooltip?: string;
}
async function prepareDamageListItems(
  data: {
    damageList: DamageListEntry[];
    autoApplyDamage: string;
    flagTags: any;
    forceApply: boolean;
    updateOptions: any
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
    let { targetUuid, actorId, actorUuid, oldHP, oldVitality, newHP, newVitality, hpDamage, wasHit } = damageItem;
    if (doHits && !wasHit) continue;
    if (!doHits && wasHit) continue;
    let tokenDocument = fromUuidSync(targetUuid) as TokenDocument.Implementation | undefined;
    let actor = fromUuidSync(actorUuid) as Actor.Implementation | undefined;

    if (!actor) {
      if (debugEnabled > 0) warn(`GMAction: reverse damage card could not find actor to update HP targetUuid ${targetUuid} actorUuid ${actorUuid}`);
      continue;
    }
    if (!showNPC && !actor.hasPlayerOwner) continue;

    // let newTempHP = Math.max(0, oldTempHP - tempDamage);
    // @ts-expect-error no dnd5e-types
    if (actor.isOwner && (data.autoApplyDamage !== "yesCardNPC" || actor.type !== "character")) {
      // const hpDamage = damageItem.damageDetail.reduce((acc, di) => acc + (di.type !== "temphp" ? di.value : 0), 0);
      // @ts-expect-error no dnd5e-types
      const hp = actor.system.attributes.hp;
      let { amount, temp } = damageItem.damageDetail.reduce((acc, d) => {
        if (d.type === "temphp") acc.temp += d.value;
        else if (d.type !== "midi-none") acc.amount += d.value;
        return acc;
      }, { amount: 0, temp: 0 });
      let { rawAmount, rawTemp } = damageItem.rawDamageDetail.reduce((acc, d) => {
        if (d.type === "temphp") acc.rawTemp += d.value;
        else if (d.type !== "midi-none") acc.rawAmount += d.value;
        return acc;
      }, { rawAmount: 0, rawTemp: 0 });
      damageItem.totalDamage = damageItem.damageDetail.reduce((acc, d) => acc + (!["temphp", "midi-none"].includes(d.type) ? d.value : 0), 0);
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
      damageItem.rawTotalDamage = rawAmount;

      if (oldVitality !== newVitality) {
        const vitalityResource = checkRule("vitalityResource");
        if (typeof vitalityResource === "string")
          updates[vitalityResource.trim()] = newVitality;
        damageItem.oldVitality = oldVitality;
        damageItem.newVitality = newVitality;
      }
      if (createPromises && doHits && (data.autoApplyDamage.includes("yes") || data.forceApply)) {
        //recover the options used when calculating the damage
        if (Hooks.call("dnd5e.preApplyDamage", actor, amount, updates, damageItem.calcDamageOptions as DamageApplicationOptions) !== false) {
          // The actor update - when no changes are made will update the passed options with a target
          // @ts-expect-error no dnd5e-types
          await actor.update(updates, foundry.utils.mergeObject(damageItem.calcDamageOptions, data.updateOptions ?? {}, { inplace: false }));
          Hooks.call("dnd5e.applyDamage", actor, amount, damageItem.calcDamageOptions as DamageApplicationOptions);
        }
      }
    }
    tokenDataList.push({
      ...damageItem,
      targetUuid,
      actorUuid,
      actorId,
      totalDamage: Math.abs(damageItem.totalDamage),
      damageDetail: damageItem.rawDamageDetail,
      // updateOptions: data.updateOptions ?? {}
    });

    let img = tokenDocument?.texture.src || actor.img as string;
    // @ts-expect-error no dnd5e-types
    if (configSettings.usePlayerPortrait && actor.type === "character")
      img = actor.img as string;
    if (foundry.helpers.media.VideoHelper.hasVideoExtension(img)) {
      img = await game.video!.createThumbnail(img, { width: 100, height: 100 });
    }

    let listItem: DamageListContextEntry = {
      isCharacter: actor.hasPlayerOwner,
      isNpc: !actor.hasPlayerOwner,
      actorUuid,
      targetUuid,
      displayUuid: actorUuid.replaceAll(".", ""),
      tokenImg: img,
      hpDamage,
      abshpDamage: Math.abs(damageItem.hpDamage),
      tempDamage: damageItem.newTempHP - damageItem.oldTempHP,
      totalDamage: Math.abs(damageItem.totalDamage),
      rawTotalDamage: damageItem.rawTotalDamage,
      halfDamage: Math.abs(Math.floor(damageItem.totalDamage / 2)),
      doubleDamage: Math.abs(damageItem.totalDamage * 2),
      playerViewTotalDamage: damageItem.hpDamage + damageItem.tempDamage,
      absDamage: Math.abs(damageItem.hpDamage),
      tokenName: (tokenDocument?.name && configSettings.useTokenNames) ? tokenDocument.name ?? actor.name : actor.name,
      dmgSign: damageItem.hpDamage < 0 ? "+" : "-",
      damageItem,
      oldVitality: damageItem.oldVitality,
      newVitality: damageItem.newVitality,
      buttonId: actorUuid,
      // @ts-expect-error no dnd5e-types
      iconPrefix: (data.autoApplyDamage === "yesCardNPC" && actor.type === "character") ? "*" : "",
    };

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
      if (newHP !== oldHP) toolTipHeader.push(`HP: ${damageItem.oldHP} -> ${damageItem.newHP}`);
      if ((damageItem.newTempHP ?? 0) !== (damageItem.oldTempHP ?? 0)) toolTipHeader.push(`TempHP: ${damageItem.oldTempHP} -> ${damageItem.newTempHP}`);
      if ((damageItem.newVitality ?? 0) !== (damageItem.oldVitality ?? 0)) toolTipHeader.push(`Vitality: ${damageItem.oldVitality} -> ${damageItem.newVitality}`);
      if (damageItem.superSaver) toolTipHeader.push("Super Saved");
      else if (damageItem.semiSuperSaver) toolTipHeader.push("Semi Super Saved");
      else if (damageItem.saved) toolTipHeader.push("Saved");
      if (damageItem.uncannyDodge) toolTipHeader.push("Uncanny Dodge");
      if (damageItem.details?.length > 0) toolTipHeader.push(...damageItem.details);
    }
    listItem.tooltip = [...(toolTipHeader ?? []), ...(tooltipList ?? [])].join("<br>");

    templateData.damageList.push(listItem);
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
  forceApply: boolean;
  updateOptions: any;
}): Promise<string | undefined> {
  let shouldShow = true;
  let chatCardUuid: string | undefined;

  if (configSettings.playerCardDamageDifferent) {
    shouldShow = false;
    for (let damageItem of data.damageList) {
      let { rawAmount, rawTemp } = damageItem.rawDamageDetail.reduce((acc, di) => {
        if (di.type === "temphp") acc.rawTemp += di.value;
        else if (di.type !== "midi-none") acc.rawAmount += di.value;
        return acc;
      }, { rawAmount: 0, rawTemp: 0 });
      if (rawAmount !== damageItem.hpDamage) {
        shouldShow = true;
        break;
      }
    }
  }
  if (!shouldShow) return;
  if (configSettings.playerDamageCard === "none") return;
  let showNPC = ["npcplayerresults", "npcplayerbuttons"].includes(configSettings.playerDamageCard);
  let playerButtons = ["playerbuttons", "npcplayerbuttons"].includes(configSettings.playerDamageCard);
  const damageList = data.damageList;
  const startTime = Date.now();
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
    const content = await foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/damage-results-player.html", templateData);
    const speaker: any = ChatMessage.getSpeaker();
    speaker.alias = data.sender;
    let chatData: any = {
      user: game.user?.id,
      speaker: { scene: getCanvas()?.scene?.id, alias: data.charName, user: game.user?.id, actor: data.actorId },
      content: content,
      // whisper: ChatMessage.getWhisperRecipients("players").filter(u => u.active).map(u => u.id),
      flags: { "midiqol": { "undoDamage": prepareDamageListToJSON(tokenDataList) } }
    };

    chatData.style = CONST.CHAT_MESSAGE_STYLES.OTHER;
    if (data.flagTags) chatData.flags = foundry.utils.mergeObject(chatData.flags ?? "", data.flagTags);
    chatCardUuid = (await ChatMessage.create(chatData))?.uuid;
  }
  log(`createPlayerReverseDamageCard elapsed: ${Date.now() - startTime}ms`)
  return chatCardUuid;
}

// Fetch the token, then use the tokenData.actor.id
async function createGMReverseDamageCard(
  data: {
    damageList: DamageListEntry[];
    autoApplyDamage: string;
    flagTags: any,
    forceApply: boolean,
    updateOptions: any
  },
  doHits: boolean = true
): Promise<string | undefined> {
  const damageList = data.damageList;
  const startTime = Date.now();
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
    const content = await foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/damage-results.html", templateData);
    const speaker = ChatMessage.getSpeaker();
    speaker.alias = game.user?.name;
    let chatData: ChatMessage.CreateData = {
      speaker: { scene: getCanvas()?.scene?.id, alias: game.user?.name },
      content: content,
      whisper: ChatMessage.getWhisperRecipients("GM").filter(u => (u as User).active).map(u => u.id),
      flags: { [MODULE_ID]: { "undoDamage": prepareDamageListToJSON(tokenDataList) } }
    };
    chatData.style = CONST.CHAT_MESSAGE_STYLES.OTHER;
    if (data.flagTags) chatData.flags = foundry.utils.mergeObject(chatData.flags ?? {}, data.flagTags);
    chatCardUuid = (await ChatMessage.create(chatData))?.uuid;
  }
  log(`createGMReverseDamageCard elapsed: ${Date.now() - startTime}ms`);
  return chatCardUuid;
}

export let processUndoDamageCard = (message: ChatMessage.Implementation, html: HTMLElement, data) => {
  if (!message.flags?.[MODULE_ID]?.undoDamage) return true;
  let button = html.querySelector<HTMLButtonElement>("#all-reverse");
  button?.addEventListener("click", (ev) => {
    (async () => {
      // TODO: Remove the latter after sufficient time has passed
      const undoFlag = message.flags?.[MODULE_ID]?.undoDamage ?? foundry.utils.getProperty(message, "flags.midiqol.undoDamage") as SerializedDamageListEntry[];
      const undoDamageData = recoverDamageListFromJSON(undoFlag);
      // @ts-expect-error TODO: pretty sure `updateOptions` isn't a thing here
      if (undoDamageData) for (let { actorUuid, oldTempHP, oldHP, oldVitality, newVitality, updateOptions={} } of undoDamageData) {
        // recoverDamageDetailFromJSON(damageDetail);
        if (!actorUuid) continue;
        const applyButton = html.querySelector<HTMLButtonElement>(`#apply-${actorUuid.replaceAll(".", "")}`);
        applyButton?.children[0].classList.add("midi-qol-enable-damage-button");
        applyButton?.children[0].classList.remove("midi-qol-disable-damage-button");
        const reverseButton = html.querySelector<HTMLButtonElement>(`#reverse-${actorUuid.replaceAll(".", "")}`);
        reverseButton?.children[0].classList.remove("midi-qol-enable-damage-button");
        reverseButton?.children[0].classList.add("midi-qol-disable-damage-button");
        let actor = fromActorUuid(actorUuid);
        log(`Setting HP back to ${oldTempHP} and ${oldHP} ${actor?.name} ${actorUuid}`);
        const update = { "system.attributes.hp.temp": oldTempHP ?? 0, "system.attributes.hp.value": oldHP ?? 0 };
        // const context = foundry.utils.mergeObject(message.flags.midi-qol.updateContext ?? {}, { dhp: (oldHP ?? 0) - (actor.system.attributes.hp.value ?? 0), damageDetail }, { inplace: false });
        const vitalityResource = checkRule("vitalityResource");
        if (typeof vitalityResource === "string" && foundry.utils.getProperty(actor ?? {}, vitalityResource.trim()) !== undefined) {
          update[vitalityResource.trim()] = oldVitality;
          context["dvital"] = (oldVitality ?? 0) - (newVitality ?? 0);
        }
        // @ts-expect-error no dnd5e-types
        await actor?.update(update, updateOptions);
        ev.stopPropagation();
      }
    })();
  });

  button = html.querySelector<HTMLButtonElement>("#all-apply");
  button?.addEventListener("click", (ev) => {
    (async () => {
      // TODO: Remove the latter after sufficient time has passed
      const undoFlag = message.flags?.[MODULE_ID]?.undoDamage ?? foundry.utils.getProperty(message, "flags.midiqol.undoDamage") as SerializedDamageListEntry[];
      const undoDamageData = recoverDamageListFromJSON(undoFlag);
      // @ts-expect-error TODO: pretty sure `updateOptions` isn't a thing here
      if (undoDamageData) for (let { actorUuid, newHP, newTempHP, updateOptions={}, newVitality } of undoDamageData) {
        if (!actorUuid) continue;
        let actor = fromActorUuid(actorUuid);
        const applyButton = html.querySelector<HTMLButtonElement>(`#apply-${actorUuid.replaceAll(".", "")}`);
        applyButton?.children[0].classList.add("midi-qol-disable-damage-button");
        applyButton?.children[0].classList.remove("midi-qol-enable-damage-button");
        const reverseButton = html.querySelector<HTMLButtonElement>(`#reverse-${actorUuid.replaceAll(".", "")}`);
        reverseButton?.children[0].classList.remove("midi-qol-disable-damage-button");
        reverseButton?.children[0].classList.add("midi-qol-enable-damage-button");
        log(`Setting HP to ${newTempHP} and ${newHP} ${actor?.name} ${actorUuid}`);
        const update = { "system.attributes.hp.temp": newTempHP ?? 0, "system.attributes.hp.value": newHP ?? 0 };
        const vitalityResource = checkRule("vitalityResource");
        if (typeof vitalityResource === "string" && foundry.utils.getProperty(actor ?? {}, vitalityResource.trim()) !== undefined) {
          update[vitalityResource.trim()] = newVitality;
        }
        // @ts-expect-error no dnd5e-types
        if (actor?.isOwner) await actor.update(update, updateOptions ?? {});
        ev.stopPropagation();
      }
    })();
  })

  // TODO: Remove the latter after sufficient time has passed
  const undoFlag = message.flags?.[MODULE_ID]?.undoDamage ?? foundry.utils.getProperty(message, "flags.midiqol.undoDamage") as SerializedDamageListEntry[];
  const undoDamageData = recoverDamageListFromJSON(undoFlag);
  // @ts-expect-error TODO: pretty sure `updateOptions` isn't a thing here
  undoDamageData?.forEach(({ actorUuid, oldTempHP, oldHP, newHP, newTempHP, oldVitality, newVitality, damageDetail, calcDamageOptions, updateOptions={} }) => {
    if (!actorUuid) return;
    // recoverDamageDetailFromJSON(damageDetail);
    // ids should not have "." in the or it's id.class
    let button = html.querySelector<HTMLButtonElement>(`#reverse-${actorUuid.replaceAll(".", "")}`);
    // button.click((ev: { stopPropagation: () => void; }) => {
    button?.addEventListener("click", (ev) => {
      (ev.currentTarget as HTMLElement)?.children[0].classList.add("midi-qol-disable-damage-button");
      (ev.currentTarget as HTMLElement)?.children[0].classList.remove("midi-qol-enable-damage-button");
      const otherButton = html.querySelector<HTMLButtonElement>(`#apply-${actorUuid.replaceAll(".", "")}`);
      otherButton?.children[0].classList.remove("midi-qol-disable-damage-button");
      otherButton?.children[0].classList.add("midi-qol-enable-damage-button");
      (async () => {
        let actor = fromActorUuid(actorUuid);
        log(`Setting HP back to ${oldTempHP} and ${oldHP} ${actor?.name} ${actorUuid}`);
        const update = { "system.attributes.hp.temp": oldTempHP ?? 0, "system.attributes.hp.value": oldHP ?? 0 };
        const vitalityResource = checkRule("vitalityResource");
        if (typeof vitalityResource === "string" && foundry.utils.getProperty(actor ?? {}, vitalityResource.trim()) !== undefined) {
          update[vitalityResource.trim()] = oldVitality;
        }
        // @ts-expect-error no dnd5e-types
        if (actor?.isOwner) await actor.update(update, updateOptions ?? {});
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
      let multiplierString = html.querySelector<HTMLSelectElement>(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`)?.value;
      const mults = { "-1": -1, "x1": 1, "x0.25": 0.25, "x0.5": 0.5, "x2": 2 };
      let multiplier = 1;
      (async () => {
        const calcOptions = foundry.utils.mergeObject(calcDamageOptions ?? {}, updateOptions ?? {}, { inplace: false });
        let actor = fromActorUuid(actorUuid);
        log(`Setting HP to ${newTempHP} and ${newHP} ${actor?.name} ${actorUuid}`);
        if (mults[multiplierString ?? ""]) {
          multiplier = mults[multiplierString ?? ""]
          // @ts-expect-error no dnd5e-types
          await actor?.applyDamage(damageDetail, foundry.utils.mergeObject(calcOptions, { multiplier: calcOptions.multiplier * multiplier }, { inplace: false }));
        } else {
          log(`Setting HP to ${newTempHP} and ${newHP} ${actor?.name} ${actorUuid}`);
          const update = { "system.attributes.hp.temp": newTempHP ?? 0, "system.attributes.hp.value": newHP ?? 0 };
          const vitalityResource = checkRule("vitalityResource");
          if (typeof vitalityResource === "string" && foundry.utils.getProperty(actor ?? {}, vitalityResource.trim()) !== undefined) {
            update[vitalityResource.trim()] = newVitality;
          }
          // @ts-expect-error no dnd5e-types
          if (actor?.isOwner) await actor.update(update, updateOptions ?? {});
          ev.stopPropagation();
        }
      })();
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
      return void targetTokenDocument.update(newPosition, { animate: data.animate ?? true });    }
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
        hideDC: !game.user?.isGM && !configSettings.displaySaveDC,
        format: "short",
        icon: true
      };
      if (["check", "save"].includes(request)) config.ability = ability;
      else if (request === "skill") {
        config.skill = ability;
        config.ability = GameSystemConfig.skills[ability].ability;
      }
      const button = {
        //@ts-expect-error
        label: game.system?.enrichers?.createRollLabel(config) ?? `${saveDC} ${ability} ${request}`,
        action: ability,
        callback: async (html: any) => {
          let roll = await rollAbility({
            targetUuid: actorUuid,
            request,
            ability,
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
    const {downgrade, ignore} = damageItem.calcDamageOptions;
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
    const newDamageDetails = Object.fromEntries(Object.entries(damageItem.damageDetails).filter(i => !i[0].includes(".")).map(([key, value]) => [key, prepareDamageDetailToJSON(value as DamageDescription[])]));
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
  return (damageDetail ?? []).map(d => ({...d, properties: Array.from(d.properties ?? [])}));
}

function recoverDamageListFromJSON(damageList: SerializedDamageListEntry[]): DamageListEntry[] {
  const newDL = foundry.utils.deepClone(damageList).map(damageItem => {
    const {downgrade, ignore} = damageItem.calcDamageOptions;
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
  return (damageDetail ?? []).map(d => ({...d, properties: new Set(d.properties)}));
}
