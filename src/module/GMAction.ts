import { checkRule, configSettings, safeGetGameSetting } from "./settings.js";
import { i18n, log, warn, gameStats, getCanvas, error, debugEnabled, debug, GameSystemConfig, MODULE_ID } from "../midi-qol.js";
import { canSense, getToken, getTokenDocument, gmOverTimeEffect, fromActorUuid, promptReactions, hasUsedAction, hasUsedBonusAction, hasUsedReaction, removeActionUsed, removeBonusActionUsed, removeReactionUsed, ReactionItemReference, isEffectExpired, expireEffects, getAppliedEffects, CERemoveEffect, CEAddEffectWith, getActor, completeItemUse, completeActivityUse, localActivityOverTimeEffect, isValidTarget } from "./utils.js";
import { ddbglPendingFired } from "./chatMessageHandling.js";
import { Workflow } from "./Workflow.js";
import { bonusCheck } from "./patching.js";
import { queueUndoData, startUndoWorkflow, updateUndoChatCardUuids, _removeMostRecentWorkflow, _undoMostRecentWorkflow, undoTillWorkflow, _queueUndoDataDirect, updateUndoChatCardUuidsById } from "./undo.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { installedModules } from "./setupModules.js";
const { DialogV2 } = foundry.applications.api;

export var socketlibSocket: any = undefined;
var traitList: any = { di: {}, dr: {}, dv: {}, dm: {}, da: {} };

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
  const effect: ActiveEffect | undefined = fromUuidSync(data.effectUuid as any) as ActiveEffect | undefined;
  if (!effect) return;
  return effect.delete({});
}

async function _removeCEEffect(data: { effectName: string, uuid: string }) {
  return CERemoveEffect({ effectName: data.effectName, uuid: data.uuid });
  //@t s-expect-error
  // return game.dfreds.effectInterface?.removeEffect({ effectName: data.effectName, uuid: data.uuid });
}

export async function cancelWorkflow(data: { workflowId: string, itemCardUuid: string }) {
  const workflow = Workflow.getWorkflow(data.workflowId);
  if (workflow?.itemCardUuid !== data.itemCardUuid) {
    const itemCard: ChatMessage | undefined = await fromUuid(data.itemCardUuid as `ChatMessage.${string}`) as ChatMessage | undefined;
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
      const effectsToDelete = actor?.appliedEffects.filter(ef => data.effects.includes(ef.id));
      return await expireEffects(actor, effectsToDelete, data.options);
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
      return await expireEffects(actor, effectsToDelete, data.options);
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

async function createEffects(data: { actorUuid: string, effects: any[], options: any }) {
  const actor = fromActorUuid(data.actorUuid);
  for (let effect of data.effects) { // override default foundry behaviour of blank being transfer
    if (effect.transfer === undefined) effect.transfer = false;
  }
  return await actor?.createEmbeddedDocuments("ActiveEffect", data.effects, data.options);
}

async function updateEffects(data: { actorUuid: string, updates: any[] }) {
  const actor = fromActorUuid(data.actorUuid);
  return actor?.updateEmbeddedDocuments("ActiveEffect", data.updates);
}

async function _toggleStatusEffect(data: { actorUuid: string, statusId: string, options: any }) {
  const actor = fromActorUuid(data.actorUuid);
  return actor.toggleStatusEffect(data.statusId, data.options);
}

function removeActorStats(data: { actorId: any }) {
  return gameStats.GMremoveActorStats(data.actorId)
}

function GMupdateEntityStats(data: { id: any; currentStats: any; }) {
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

export function preferredActiveGM(): User | null {
  const preferredGMId = safeGetGameSetting("midi-qol", "PreferredGM");
  if (preferredGMId !== "none") {
    const preferredGM = game.users?.get(preferredGMId) as User;
    if (preferredGM?.active) return preferredGM;
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
  let actor: any | undefined = fromUuidSync(data.actorUuid as `Actor.${string}`);
  actor = actor.actor ?? actor;
  if (!actor) return undefined;
  return actor.unsetFlag(data.base, data.key)
}

async function _gmSetFlag(data: { base: string, key: string, value: any, actorUuid: string }) {
  let actor: any | undefined = fromUuidSync(data.actorUuid as `Actor.${string}`);
  actor = actor.actor ?? actor;
  if (!actor) return undefined;
  return actor.setFlag(data.base, data.key, data.value)
}

// Seems to work doing it on the client instead.
async function _canSense(data: { tokenUuid, targetUuid }) {
  const token = (fromUuidSync(data.tokenUuid) as TokenDocument)?.object;
  const target = (fromUuidSync(data.targetUuid) as TokenDocument)?.object;
  if (!target || !token) return true;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  if (token.vision &&(!token.vision.active || !token.vision.los)) {
    token.vision.initialize({
      x: token.center.x,
      y: token.center.y,
      radius: clamp(token.sightRange, 0, canvas?.dimensions?.maxR ?? 0),
      externalRadius: Math.max(token.mesh?.width ?? 0, token.mesh?.height ?? 0) / 2,
      angle: token.document.sight.angle,
      contrast: token.document.sight.contrast,
      saturation: token.document.sight.saturation,
      brightness: token.document.sight.brightness,
      attenuation: token.document.sight.attenuation,
      rotation: token.document.rotation,
      //@ts-expect-error vision mode wrong type
      visionMode: token.document.sight.visionMode,
      color: globalThis.Color.from(token.document.sight.color),
      isPreview: !!token._original,
      blinded: token.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND)
    });
  }
  return await canSense(token, target);
}

async function _gmOverTimeEffect(data: { actorUuid, effectUuid, startTurn, options }) {
  const actor: Actor | undefined = fromActorUuid(data.actorUuid) as Actor | undefined;
  const effect: ActiveEffect | undefined = fromUuidSync(data.effectUuid) as ActiveEffect | undefined;
  log("Called _gmOvertime", actor?.name, effect?.name)
  return gmOverTimeEffect(actor, effect, data.startTurn, data.options)
}

async function _localActivityOverTimeEffect(data: { actorUuid, effectUuid, startTurn, options }) {
  const actor: Actor | undefined  = await fromUuid(data.actorUuid) as Actor | undefined;
  const effect: Actor | undefined = await fromUuid(data.effectUuid) as Actor | undefined;
  if (!actor || !effect) {
    const message = `localActivityOverTimeEffect | actor or effect not found actor: ${data.actorUuid} effect: ${data.effectUuid}`;
    error(message);
    TroubleShooter.recordError(new Error("GMAction failed"), message);
    return undefined
  };
  log("Called _localActivityOverTimeEffect", actor?.name, effect?.name)
  return localActivityOverTimeEffect(actor, effect, data.startTurn, data.options)
}

async function _bonusCheck(data: { actorUuid, result, rollType, selector }) {
  const tokenOrActor: any = await fromUuid(data.actorUuid);
  const actor = tokenOrActor?.actor ?? tokenOrActor;
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
    const targets: Set<Token> = new Set();
    //@ts-ignore
    for (let targetUuid of data.targets) targets.add(await fromUuid(targetUuid));

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
    const targets = usage.midiOptions.targetsToUse.map(t => fromUuidSync(t)).filter(t => isValidTarget(t));
    usage.midiOptions.targetsToUse = new Set(targets);
  }
  const workflow = await completeActivityUse(activityUuid, usage, dialog, message);
  if (data.usage.midiOptions?.workflowData) return workflow.getSafeMacroData();
  else return true;
}

async function _completeItemUse(data: {
  itemData: any, actorUuid: string, config: any, dialog: any, message: any, workflowData: boolean
}) {
  if (!game.user) return null;
  let { itemData, actorUuid, config, dialog, message } = data;
  let actor: any = await fromUuid(actorUuid);
  if (actor.actor) actor = actor.actor;
  //@ts-ignore v10
  let ownedItem: Item = new CONFIG.Item.documentClass(itemData, { parent: actor, keepId: true });
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

async function updateActor(data: any) {
  let actor: Actor | undefined = fromUuidSync(data.actorUuid) as Actor | undefined;
  if (!actor) return;
  if (data.actorData) {
    console.warn(`midi-qol | updateActor actorData deprecated. Call await MidiQOL.socket().executeAsGM("updateActor"({ updates }) instead`)
    await actor.update(data.actorData);
  }
  if (data.updates) await actor.update(data.updates);
}

async function createActor(data) {
  let actorsData = data.actorData instanceof Array ? data.actorData : [data.actorData];
  const actors = await CONFIG.Actor.documentClass.createDocuments(actorsData, data.context ?? {});
  return actors?.length ? actors.map(a => a.id) : false;
}

async function deleteToken(data: { tokenUuid: string }) {
  const token = await fromUuid(data.tokenUuid);
  if (token) { // token will be a token document.
    //@ts-expect-error
    token.delete();
  }
}

async function deleteEffectsByUuid(data: { effectsToDelete: string[], options: any }) {
  for (let effectUuid of data.effectsToDelete) {
    const effect: ActiveEffect | undefined = fromUuidSync(effectUuid as any) as ActiveEffect | undefined;
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
  let finalEffectsToDelete = actor.appliedEffects.filter(ef => data.effectsToDelete.includes(ef.id) && !isEffectExpired(ef));
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

async function deleteItemEffects(data: { targets, origin: string, ignore: string[], ignoreTransfer: boolean, options: any }) {
  debug("deleteItemEffects: started", globalThis.DAE?.actionQueue)
  let deleteFunc = async () => {
    let effectsToDelete;
    try {
      let { targets, origin, ignore, options } = data;
      for (let idData of targets) {
        let actor = idData.tokenUuid ? fromActorUuid(idData.tokenUuid) : idData.actorUuid ? fromUuidSync(idData.actorUuid) : undefined;
        if (actor?.actor) actor = actor.actor;
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
          return ef.originEntity === originEntity && !ignore.includes(ef.uuid) && (!data.ignoreTransfer || !ef.transfer)
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


async function addConvenientEffect(options) {
  let { effectName, actorUuid, origin } = options;
  const actor: any = getActor(actorUuid);

  console.warn("midi-qol | Deprecated. Call await game.dfreds.effectInterface?.addEffect({ effectName, uuid: actorUuid, origin }) instead")
  return CEAddEffectWith({ effectName, uuid: actor.uuid, origin, overlay: false });
  //@ ts-ignore
  // await game.dfreds.effectInterface?.addEffect({ effectName, uuid: actorUuid, origin });
}

async function _addDependent(data: { documentUuid: string, dependentUuid: string }) {
  const document: Document | undefined = fromUuidSync(data.documentUuid as any) as any | undefined;
  // @ts-expect-error .addDependent
  if (!document || !document.addDependent) {
    error("GMAction.addDependent | document not found or does not support addDependent", data.documentUuid);
    return undefined;
  }
  const dependent: Document | undefined = fromUuidSync(data.dependentUuid as any) as any | undefined;
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

async function _createChatMessage(data: { chatData: any; }) {
  const messageData = foundry.utils.getProperty(data, "chatData.messageData") as any ?? {};
  messageData.user = game.user?.id;
  return await ChatMessage.create(data.chatData);
}

async function _D20Roll(data: { request: string, targetUuid: string, formula: string, rollMode: string, options: any, targetDC: number, messageData: any }) {
  const actor = fromActorUuid(data.targetUuid);
  if (!actor) {
    error(`GMAction.D20Roll | no actor for ${data.targetUuid}`)
    return {};
  }
  return new Promise(async (resolve) => {
    let timeoutId;
    let result;
    if (configSettings.playerSaveTimeout > 0) timeoutId = setTimeout(async () => {
      warn(`Roll request for {actor.name}timed out. Doing roll`);
      data.options.fastForward = true; // assume player is asleep force roll without dialog
      //@ts-expect-error D20Roll
      result = await new CONFIG.Dice.D20Roll(data.formula, {}, data.options).roll();
      foundry.utils.setProperty(roll, "flags.midi-qol.rollType", data.options?.midiType)
      resolve(result ?? {});
    }, configSettings.playerSaveTimeout * 1000);
    if (!data.options) data.options = {};
    data.options.configured = false;
    //@ts-expect-error D20Roll
    const roll = new CONFIG.Dice.D20Roll(data.formula, {}, data.options);
    await roll.configureDialog({ title: data.request, defaultRollMode: data.rollMode, defaultAction: data.options?.advantage });
    result = await roll.roll();
    roll.toMessage(data.messageData);
    if (timeoutId) clearTimeout(timeoutId);
    foundry.utils.setProperty(result, "flags.midi-qol.rollType", data.options?.midiType)
    resolve(result ?? {})
  });
}
async function rollConcentration(data: { actorUuid, target, whisper, create, rollMode }) {
  const actor = fromUuidSync(data.actorUuid);
  if (!actor) {
    error(`GMAction.rollConcentration | no actor for ${data.actorUuid}`)
    return {};
  }
  //@ts-expect-error no dnd5e types
  return actor.rollConcentration({ target: data.target, legacy: false }, {}, { create: data.create, whisper: data.whisper, rollMode: data.rollMode });
}

async function rollAbility(data: any) {
  if (data.request === "abil") data.request = "check";
  if (data.request === "test") data.request = "check";
  const actor = fromActorUuid(data.targetUuid);
  if (!actor) {
    error(`GMAction.rollAbility | no actor for ${data.targetUuid}`)
    return {};
  }
  /*
advantage: boolean | undefined,
disadvantage: boolean | undefined,
isFriendly: boolean | undefined,
isMagicSave: boolean | undefined,
isConcentrationCheck: boolean | undefined,
rollDC: number,
saveItemUuid: string,
workflowOptions: object
workflowId: string

*/
  let config: any = { midiOptions: data.options, advantage: data.advantage, disadvantage: data.disadvantage, isMagicSave: data.isMagicSave, isConcentrationCheck: data.isConcentrationCheck, rollDC: data.rollDC, saveItemUuid: data.saveItemUuid, workflowOptions: data.workflowOptions, workflowId: data.workflowId }
  if (data.ability) config.ability = data.ability;
  if (data.skill) config.skill = data.skill;
  if (data.tool) config.tool = data.tool
  if (data.proficiency) config.prof = data.proficiency;
  let dialog: any = { configure: !data.options.fastForward };
  let message: any = { create: data.options.chatMessage ?? data.options.create, rollMode: data.options.rollMode };
  if (data.request === "tool") {
    const requestedTool = data.tool;
    let tool = actor.items.get(data.options.itemId);
    if (!tool) tool = actor.items.find(i => i.type === "tool" && i.system.type.baseItem === requestedTool);
    if (!tool) { // no tool of the requested type - auto fail
      //@ts-expect-error
      return [await new CONFIG.Dice.D20Roll("-1").roll()];
    } else {
      config.bonus = tool?.system.bonus ?? 0;
      config.prof = tool?.system.prof;
      config.item = tool;
    }
  }
  if (data.rollMode) message.rollMode = data.rollMode;
  return new Promise(async (resolve) => {
    let timeoutId;
    let result;
    if (configSettings.playerSaveTimeout > 0) timeoutId = setTimeout(async () => {
      warn(`Roll request for {actor.name}timed out. Doing roll`);
      dialog.configure = false; // assume player is asleep force roll without dialog
      if (data.request === "save") result = await actor.rollSavingThrow(config, dialog, message);
      else if (data.request === "check") result = await actor.rollAbilityCheck(config, dialog, message);
      else if (data.request === "skill") result = await actor.rollSkill(config, dialog, message);
      else if (data.request === "tool") result = await actor.rollToolCheck(config, dialog, message);
      resolve(result ?? {});
    }, configSettings.playerSaveTimeout * 1000);
    if (data.request === "save") result = await actor.rollSavingThrow(config, dialog, message)
    else if (data.request === "check") result = await actor.rollAbilityCheck(config, dialog, message);
    else if (data.request === "skill") result = await actor.rollSkill(config, dialog, message);
    else if (data.request === "tool") result = await actor.rollToolCheck(config, dialog, message);
    if (timeoutId) clearTimeout(timeoutId);
    resolve(result ?? {})
  });


}

function monksTokenBarSaves(data: { tokenData: any[]; request: any; silent: any; rollMode: string; dc: number | undefined, isMagicSave: boolean | undefined, midiOptions: any | undefined }) {
  // let tokens = data.tokens.map((tuuid: any) => new Token(MQfromUuid(tuuid)));

  // TODO come back and see what things can be passed to this.
  //@ts-ignore MonksTokenBar
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
  damageList: any;
  autoApplyDamage: string;
  flagTags: any,
  sender: string,
  charName: string,
  actorId: string,
  forceApply: boolean,
  updateOptions: any
}): Promise<string[]> {
  let cardIds: string[] = [];
  data.damageList = recoverDamageListFromJSON(data.damageList);
  let id = await createPlayerDamageCard(data);
  if (id) cardIds.push(id);
  if (data.damageList.some(di => di.wasHit)) {
    id = await createGMReverseDamageCard(data, true);
    if (id) cardIds.push(id);
  }
  if (data.damageList.some(di => !di.wasHit) && ["yesCardMisses", "noCardMisses"].includes(data.autoApplyDamage)) {
    id = await createGMReverseDamageCard(data, false);
    if (id) cardIds.push(id);
  }
  return cardIds;
}

async function prepareDamageListItems(data: {
  damageList: any; autoApplyDamage: string; flagTags: any, forceApply: boolean, updateOptions: any
},
  templateData, tokenDataList, createPromises: boolean = false, showNPC: boolean = true, doHits: boolean = true): Promise<void> {
  const damageList = data.damageList;
  let promises: Promise<any>[] = [];

  for (let damageItem of damageList) {
    let { tokenUuid, actorId, actorUuid, oldHP, oldTempHP, oldVitality, newHP, newTempHP, newVitality, hpDamage, tempDamage, vitalityDamage, totalDamage, sceneId, wasHit } = damageItem;
    if (doHits && !wasHit) continue;
    if (!doHits && wasHit) continue;
    let tokenDocument = fromUuidSync(tokenUuid) as TokenDocument;
    let actor = fromUuidSync(actorUuid) as any; // No dnd5e types when available use Actor5e

    if (!actor) {
      if (debugEnabled > 0) warn(`GMAction: reverse damage card could not find actor to update HP tokenUuid ${tokenUuid} actorUuid ${actorUuid}`);
      continue;
    }
    if (!showNPC && !actor.hasPlayerOwner) continue;

    // let newTempHP = Math.max(0, oldTempHP - tempDamage);
    if (actor.isOwner && (data.autoApplyDamage !== "yesCardNPC" || actor.type !== "character")) {
      // const hpDamage = damageItem.damageDetail.reduce((acc, di) => acc + (di.type !== "temphp" ? di.value : 0), 0);
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
      const updates = {
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
        vitalityDamage = oldVitality - newVitality;
        const vitalityResource = checkRule("vitalityResource");
        if (typeof vitalityResource === "string")
          updates[vitalityResource.trim()] = newVitality;
        damageItem.oldVitality = oldVitality;
        damageItem.newVitality = newVitality;
      }
      if (createPromises && doHits && (data.autoApplyDamage.includes("yes") || data.forceApply)) {
        //recover the options used when calculating the damage
        //@ts-expect-error
        if (Hooks.call("dnd5e.preApplyDamage", actor, amount, updates, damageItem.calcDamageOptions ?? {}) !== false) {
          // The actor update - when no changes are made will update the passed options with a target
          await actor.update(updates, foundry.utils.mergeObject(damageItem.calcDamageOptions, data.updateOptions ?? {}, { inplace: false }));
          //@ts-expect-error
          Hooks.call("dnd5e.applyDamage", actor, amount, damageItem.calcDamageOptions ?? {});
        }
      }
    }
    tokenDataList.push({
      tokenUuid, actorUuid, actorId,
      oldTempHP: damageItem.oldTempHP,
      oldHP: damageItem.oldHP,
      totalDamage: Math.abs(damageItem.totalDamage),
      rawAmount: damageItem.rawTotalDamage,
      newHP: damageItem.newHP,
      newTempHP: damageItem.newTempHP,
      damageDetail: damageItem.rawDamageDetail,
      oldVitality: damageItem.oldVitality,
      newVitality: damageItem.newVitality,
      calcDamageOptions: damageItem.calcDamageOptions,
      updateOptions: data.updateOptions ?? {}
    });

    let img = tokenDocument?.texture.src || actor.img;
    if (configSettings.usePlayerPortrait && actor.type === "character")
      img = actor?.img ?? tokenDocument?.texture.src;
    if (foundry.helpers.media.VideoHelper.hasVideoExtension(img)) {
      //@ts-ignore - createThumbnail not defined
      img = await game.video.createThumbnail(img, { width: 100, height: 100 });
    }

    let listItem: any = {
      isCharacter: actor.hasPlayerOwner,
      isNpc: !actor.hasPlayerOwner,
      actorUuid,
      tokenUuid,
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
      iconPrefix: (data.autoApplyDamage === "yesCardNPC" && actor.type === "character") ? "*" : "",
    };

    const tooltipList = damageItem.damageDetail?.map(di => {
      let allMods: string[] = Object.keys(di.active ?? {}).reduce((acc: string[], k) => {
        if (["semiSuperSaver", "superSaver"].includes(k)) return acc;
        if (di.active[k] && k !== "multiplier") acc.push(k);
        return acc;
      }, []);
      if (di.allActives?.length > 0) allMods = allMods.concat(di.allActives);
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

    //@ts-ignore listItem
    templateData.damageList.push(listItem);
  }
}

// Fetch the token, then use the tokenData.actor.id
async function createPlayerDamageCard(data: { damageList: any; autoApplyDamage: string; flagTags: any, sender: string, charName: string, actorId: string, forceApply: boolean, updateOptions: any }): Promise<string | undefined> {
  let shouldShow = true;
  let chatCardUuid;

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
  //@ts-ignore
  let actor: CONFIG.Actor.documentClass;
  const startTime = Date.now();
  let tokenDataList: any[] = [];
  let templateData = {
    damageApplied: ["yes", "yesCard", "yesCardMisses"].includes(data.autoApplyDamage) ? i18n("midi-qol.HPUpdated") : i18n("midi-qol.HPNotUpdated"),
    damageList: [],
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
  //@ts-ignore
  templateData.playerButtons = templateData.playerButtons && templateData.damageList.some(listItem => listItem.isCharacter)
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
  data: { damageList: any; autoApplyDamage: string; flagTags: any, forceApply: boolean, updateOptions: any },
  doHits: boolean = true): Promise<string | undefined> {
  const damageList = data.damageList;
  let actor: { update: (arg0: { "system.attributes.hp.temp": any; "system.attributes.hp.value": number; damageItem: any[] }) => Promise<any>; img: any; type: string; name: any; data: { data: { traits: { [x: string]: any; }; }; }; };
  const startTime = Date.now();
  let promises: Array<Promise<any>>;;
  let tokenDataList: any[] = [];
  let chatCardUuid;
  const damageWasApplied = (doHits && (["yes", "yesCard", "yesCardMisses"].includes(data.autoApplyDamage) || data.forceApply));
  let templateData = {
    damageWasApplied,
    damageApplied: damageWasApplied ? i18n("midi-qol.HPUpdated") : data.autoApplyDamage === "yesCardNPC" ? i18n("midi-qol.HPNPCUpdated") : i18n("midi-qol.HPNotUpdated"),
    damageList: [],
    needsButtonAll: false
  };
  await prepareDamageListItems(data, templateData, tokenDataList, true, true, doHits)

  templateData.needsButtonAll = damageList.length > 1;

  if (["yesCard", "noCard", "yesCardNPC", "yesCardMisses", "noCardMisses"].includes(data.autoApplyDamage)) {
    const content = await foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/damage-results.html", templateData);
    const speaker: any = ChatMessage.getSpeaker();
    speaker.alias = game.user?.name;
    let chatData: any = {
      user: game.user?.id,
      speaker: { scene: getCanvas()?.scene?.id, alias: game.user?.name, user: game.user?.id },
      content: content,
      whisper: ChatMessage.getWhisperRecipients("GM").filter(u => (u as User).active).map(u => u.id),
      flags: { "midiqol": { "undoDamage": prepareDamageListToJSON(tokenDataList) } }
    };
    chatData.style = CONST.CHAT_MESSAGE_STYLES.OTHER;
    if (data.flagTags) chatData.flags = foundry.utils.mergeObject(chatData.flags ?? "", data.flagTags);
    chatCardUuid = (await ChatMessage.create(chatData))?.uuid;
  }
  log(`createGMReverseDamageCard elapsed: ${Date.now() - startTime}ms`);
  return chatCardUuid;
}

export let processUndoDamageCard = (message: ChatMessage, html, data) => {
  if (!((message.flags as any)?.midiqol)?.undoDamage) return true;
  let button = html.find("#all-reverse");
  button.click((ev: { stopPropagation: () => void; }) => {
    (async () => {
      const undoDamageData = recoverDamageListFromJSON(foundry.utils.getProperty(message, "flags.midiqol.undoDamage")as any);
      if (undoDamageData) for (let { actorUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP, oldVitality, newVitality, damageDetail, updateOptions, calcDamageOptions } of undoDamageData) {
        // recoverDamageDetailFromJSON(damageDetail);
        if (!actorUuid) continue;
        const applyButton = html.find(`#apply-${actorUuid.replaceAll(".", "")}`);
        applyButton.children()[0].classList.add("midi-qol-enable-damage-button");
        applyButton.children()[0].classList.remove("midi-qol-disable-damage-button");
        const reverseButton = html.find(`#reverse-${actorUuid.replaceAll(".", "")}`);
        reverseButton.children()[0].classList.remove("midi-qol-enable-damage-button");
        reverseButton.children()[0].classList.add("midi-qol-disable-damage-button");
        let actor = fromActorUuid(actorUuid);
        log(`Setting HP back to ${oldTempHP} and ${oldHP} ${actor.name} ${actorUuid}`);
        const update = { "system.attributes.hp.temp": oldTempHP ?? 0, "system.attributes.hp.value": oldHP ?? 0 };
        // const context = foundry.utils.mergeObject(message.flags.midi-qol.updateContext ?? {}, { dhp: (oldHP ?? 0) - (actor.system.attributes.hp.value ?? 0), damageDetail }, { inplace: false });
        const vitalityResource = checkRule("vitalityResource");
        if (typeof vitalityResource === "string" && foundry.utils.getProperty(actor, vitalityResource.trim()) !== undefined) {
          update[vitalityResource.trim()] = oldVitality;
          context["dvital"] = oldVitality - newVitality;
        }
        await actor?.update(update, updateOptions);
        ev.stopPropagation();
      }
    })();
  });

  button = html.find("#all-apply");
  button.click((ev: { stopPropagation: () => void; }) => {
    (async () => {
      const undoDamageData = recoverDamageListFromJSON(foundry.utils.getProperty(message, "flags.midiqol.undoDamage") as any);
      if (undoDamageData) for (let { actorUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP, damageDetail, updateOptions, calcDamageOptions, oldVitality, newVitality } of undoDamageData) {
        if (!actorUuid) continue;
        let actor = fromActorUuid(actorUuid);
        const applyButton = html.find(`#apply-${actorUuid.replaceAll(".", "")}`);
        applyButton.children()[0].classList.add("midi-qol-disable-damage-button");
        applyButton.children()[0].classList.remove("midi-qol-enable-damage-button");
        const reverseButton = html.find(`#reverse-${actorUuid.replaceAll(".", "")}`);
        reverseButton.children()[0].classList.remove("midi-qol-disable-damage-button");
        reverseButton.children()[0].classList.add("midi-qol-enable-damage-button");
        log(`Setting HP to ${newTempHP} and ${newHP} ${actor.name} ${actorUuid}`);
        const update = { "system.attributes.hp.temp": newTempHP ?? 0, "system.attributes.hp.value": newHP ?? 0 };
        const vitalityResource = checkRule("vitalityResource");
        if (typeof vitalityResource === "string" && foundry.utils.getProperty(actor, vitalityResource.trim()) !== undefined) {
          update[vitalityResource.trim()] = newVitality;
        }
        if (actor.isOwner) await actor.update(update, updateOptions ?? {});
        ev.stopPropagation();
      }
    })();
  })

  const undoDamageData = recoverDamageListFromJSON(foundry.utils.getProperty(message, "flags.midiqol.undoDamage") as any);
  undoDamageData?.forEach(({ actorUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP, oldVitality, newVitality, damageDetail, calcDamageOptions, updateOptions }) => {
    if (!actorUuid) return;
    // recoverDamageDetailFromJSON(damageDetail);
    // ids should not have "." in the or it's id.class
    let button = html.find(`#reverse-${actorUuid.replaceAll(".", "")}`);
    // button.click((ev: { stopPropagation: () => void; }) => {
    button.click((ev: { stopPropagation: () => void; currentTarget: any }) => {
      ev.currentTarget.children[0].classList.add("midi-qol-disable-damage-button");
      ev.currentTarget.children[0].classList.remove("midi-qol-enable-damage-button");
      const otherButton = html.find(`#apply-${actorUuid.replaceAll(".", "")}`);
      otherButton.children()[0].classList.remove("midi-qol-disable-damage-button");
      otherButton.children()[0].classList.add("midi-qol-enable-damage-button");
      (async () => {
        let actor = fromActorUuid(actorUuid);
        log(`Setting HP back to ${oldTempHP} and ${oldHP} ${actor.name} ${actorUuid}`);
        const update = { "system.attributes.hp.temp": oldTempHP ?? 0, "system.attributes.hp.value": oldHP ?? 0 };
        const vitalityResource = checkRule("vitalityResource");
        if (typeof vitalityResource === "string" && foundry.utils.getProperty(actor, vitalityResource.trim()) !== undefined) {
          update[vitalityResource.trim()] = oldVitality;
        }
        if (actor.isOwner) await actor.update(update, updateOptions ?? {});
        ev.stopPropagation();
      })();
    });

    // Default action of button is to do midi damage
    button = html.find(`#apply-${actorUuid.replaceAll(".", "")}`);
    button.click((ev: { stopPropagation: () => void; currentTarget: any }) => {
      ev.currentTarget.children[0].classList.add("midi-qol-disable-damage-button");
      ev.currentTarget.children[0].classList.remove("midi-qol-enable-damage-button");
      const otherButton = html.find(`#reverse-${actorUuid.replaceAll(".", "")}`);
      otherButton.children()[0].classList.remove("midi-qol-disable-damage-button");
      otherButton.children()[0].classList.add("midi-qol-enable-damage-button");
      let multiplierString = html.find(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`).val();
      const mults = { "-1": -1, "x1": 1, "x0.25": 0.25, "x0.5": 0.5, "x2": 2 };
      let multiplier = 1;
      (async () => {
        const calcOptions = foundry.utils.mergeObject(calcDamageOptions ?? {}, updateOptions ?? {}, { inplace: false });
        let actor = fromActorUuid(actorUuid);
        log(`Setting HP to ${newTempHP} and ${newHP} ${actor.name} ${actorUuid}`);
        if (mults[multiplierString]) {
          multiplier = mults[multiplierString]
          await actor.applyDamage(damageDetail, foundry.utils.mergeObject(calcOptions, { multiplier: calcOptions.multiplier * multiplier }, { inplace: false }));
        } else {
          log(`Setting HP to ${newTempHP} and ${newHP} ${actor.name} ${actorUuid}`);
          const update = { "system.attributes.hp.temp": newTempHP ?? 0, "system.attributes.hp.value": newHP ?? 0 };
          const vitalityResource = checkRule("vitalityResource");
          if (typeof vitalityResource === "string" && foundry.utils.getProperty(actor, vitalityResource.trim()) !== undefined) {
            update[vitalityResource.trim()] = newVitality;
          }
          if (actor.isOwner) await actor.update(update, updateOptions ?? {});
          ev.stopPropagation();
        }
      })();
    });
  })

  return true;
}

async function _moveToken(data: { tokenUuid: string, newCenter: { x: number, y: number }, animate: boolean }): Promise<any> {
  const tokenDocument: TokenDocument | undefined = fromUuidSync(data.tokenUuid as any) as TokenDocument | undefined;
  if (!tokenDocument || !canvas?.grid || !tokenDocument.object) return;
  const targetToken = tokenDocument.object;
  const newCenter = canvas.grid.getSnappedPoint(data.newCenter, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
  const newPosition = {x: data.newCenter.x - targetToken.w / 2, y: data.newCenter.y - targetToken.h / 2};
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
    //@ts-expect-error
    const testCollision = CONFIG.Canvas.polygonBackends.move.testCollision(targetToken.center, newCenter, { source: targetToken.document, type: "move", any: "closest" });
    //@ts-expect-error
    if (testCollision?.length > 0 && testCollision[0] instanceof foundry.canvas.edges.PolygonVertex ) {
      const collisionPoint = { x: testCollision[0].x, y: testCollision[0].y };
      const getCenterCollisionPoint = canvas.grid.getCenterPoint(collisionPoint);
      if (Math.sign(ray.dx) > 0) getCenterCollisionPoint.x -= canvas.grid.sizeX;
      if (Math.sign(ray.dy) > 0) getCenterCollisionPoint.y -= canvas.grid.sizeY;
      const newPosition = canvas.grid.getSnappedPoint({x: getCenterCollisionPoint.x - Math.sign(ray.dx) * targetToken.w / 2, y: getCenterCollisionPoint.y - Math.sign(ray.dy) * targetToken.h / 2}, { mode: M.TOP_LEFT_VERTEX });
      //@ts-expect-error
      return targetTokenDocument.update(newPosition, { animate: data.animate ?? true });    }
  }
  const newX = targetToken.position.x + newCenter.x - targetToken.center.x;
  const newY = targetToken.position.y + newCenter.y - targetToken.center.y;
  //@ts-expect-error
  return targetTokenDocument.update({ x: newX, y: newY }, { animate: data.animate ?? true });
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
        //@ts-expect-error
        config.ability = game.system.config.skills[ability].ability;
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

export function prepareDamageListToJSON(damageList: any[]): any[] {
  const newDL = foundry.utils.deepClone(damageList);
  for (let damageItem of newDL) {
    let options = damageItem.calcDamageOptions;
    if (options.downgrade instanceof Set) {
      options.downgrade = Array.from(options.downgrade);
    }
    if (options.ignore) for (let key of Object.keys(options.ignore)) {
      if (options.ignore[key] instanceof Set) {
        options.ignore[key] = Array.from(options.ignore[key]);
      }
    }
    for (let damageDetail of [damageItem.damageDetail ?? [], damageItem.rawDamageDetail ?? [], ...(Object.values(damageItem.damageDetails ?? {}))]) {
      if (damageDetail instanceof Array) prepareDamageDetailToJSON(damageDetail);
    }
  }
  return newDL;
}

function prepareDamageDetailToJSON(damageDetail: any[]) {
  for (let damageLine of damageDetail) {
    if (damageLine.properties instanceof Set) {
      damageLine.properties = Array.from(damageLine.properties);
    }
  }
}

function recoverDamageListFromJSON(damageList: any[]): any[] {
  const newDL = foundry.utils.deepClone(damageList);
  for (let damageItem of newDL) {
    const options = damageItem.calcDamageOptions;
    if (options.downgrade) options.downgrade = new Set(options.downgrade);
    if (options.ignore) for (let key of Object.keys(options.ignore)) 
        options.ignore[key] = new Set(options.ignore[key]);
    for (let damageDetail of [damageItem.damageDetail ?? [], damageItem.rawDamageDetail ?? [], ...Object.values(damageItem.damageDetails ?? [])]) {
      if (damageDetail instanceof Array) recoverDamageDetailFromJSON(damageDetail);
    }
  }
  return newDL;
}

function recoverDamageDetailFromJSON(damageDetail: any[]) {
  if (damageDetail instanceof Array) {
    for (let damageLine of damageDetail) {
      if (damageLine.properties instanceof Array) {
        damageLine.properties = new Set(damageLine.properties);
      }
    }
  }
}
