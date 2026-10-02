import { checkRule, configSettings, safeGetGameSetting, isDnd5e53 } from "./settings.js";
import { withWorkflowOptionsCodec } from "./lib/workflowOptionsCodec.js";
import { i18n, log, warn, gameStats, getCanvas, error, debugEnabled, debug, GameSystemConfig, MODULE_ID } from "../midi-qol.js";
import { canSense, getToken, getTokenDocument, gmOverTimeEffect, fromActorUuid, promptReactions, hasUsedAction, hasUsedBonusAction, hasUsedReaction, removeActionUsed, removeBonusActionUsed, removeReactionUsed, ReactionItemReference, isEffectExpired, expireEffects, getAppliedEffects, CERemoveEffect, CEAddEffectWith, getActor, completeItemUse, completeActivityUse, localActivityOverTimeEffect, isValidTarget, hasUsedAnyReaction, getVitalityItem, getVitalityValue, MidiOptions, tokenSourceCenter } from "./utils.js";
import { ddbglPendingFired } from "./chatMessageHandling.js";
import { DAMAGE_MESSAGE_TYPE } from "./ChatClasses/DamageCardMessage.js";
import { DamageDescriptionObject, Workflow, WorkflowOptions } from "./Workflow.js";
import { bonusCheck, checkWounded } from "./patching.js";
import { RollModifierTracker } from "./lib/RollModifierTracker.js";
import { queueUndoData, startUndoWorkflow, updateUndoChatCardUuids, _removeMostRecentWorkflow, _undoMostRecentWorkflow, undoTillWorkflow, _queueUndoDataDirect, updateUndoChatCardUuidsById } from "./undo.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { installedModules } from "./setupModules.js";
import { StatUpdateMessage } from "./RollStats.js";
import { DamageApplicationOptions, DamageDescription, DamageListEntry, DamageModDisplay, MonksTokenBarRequest, MoveTokenOptions, RollDialogConfig, RollMessageConfig, RollProcessConfig, SaveDetails, TeleportTokenDestination } from "../globals.js";

export let socketlibSocket: any = undefined;
let traitList = { di: "", dr: "", dv: "", dm: "", da: "" };

export let setupSocket = () => {
  socketlibSocket = withWorkflowOptionsCodec(globalThis.socketlib.registerModule(MODULE_ID));
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
  socketlibSocket.register("toggleTokenHidden", toggleTokenHidden);
  socketlibSocket.register("gmOverTimeEffect", _gmOverTimeEffect);
  socketlibSocket.register("localActivityOverTimeEffect", _localActivityOverTimeEffect);
  socketlibSocket.register("monksTokenBarSaves", monksTokenBarSaves);
  socketlibSocket.register("flashTokenBarSaves", flashTokenBarSaves);
  socketlibSocket.register("moveToken", _moveToken);
  socketlibSocket.register("moveTokenAwayFromPoint", _moveTokenAwayFromPoint);
  socketlibSocket.register("teleportToken", _teleportToken);
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
  socketlibSocket.register("updateItems", updateItems);
  socketlibSocket.register("recordStats", GMrecordStats)
  socketlibSocket.register("saveAllStats", GMsaveAllStats)
  socketlibSocket.register("updateUndoChatCardUuids", updateUndoChatCardUuids);
  socketlibSocket.register("updateUndoChatCardUuidsById", updateUndoChatCardUuidsById);
  socketlibSocket.register("removeActionBonusReaction", removeActionBonusReaction);
  socketlibSocket.register("rollActionSave", rollActionSave);
  socketlibSocket.register("toggleStatusEffect", _toggleStatusEffect);
  socketlibSocket.register("midiRegionTriggerActivity", _midiRegionTriggerActivity);
  socketlibSocket.register("setupRegion", _setupRegion);
  socketlibSocket.register("advanceCombatRound", _advanceCombatRound);

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
      case "completeActivityUse":
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
      case "teleportToken":
      case "removeWorkflow":
      case "rollAbility":
      case "rollAbilityV2":
      case "rollConcentration":
      case "removeEffect":
      case "removeActionBonusReaction":
      case "recordStats":
      case "toggleStatusEffect":
      case "toggleTokenHidden":
      case "midiRegionTriggerActivity":
      case "setupRegion":
      case "advanceCombatRound":
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
      case "updateItems":
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
  if ((workflow.currentAction === workflow.WorkflowState_AttackRollComplete) || (hasHits &&
    activity?.hasDamage && (!workflow.damageRoll || workflow.currentAction !== workflow.WorkflowState_ConfirmRoll))) {
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
  const rollMode = safeGetGameSetting("core", "messageMode") as string;
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
    const rollMode = safeGetGameSetting("core", "messageMode") as string;
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
  // actorUuid can be an Actor, Token, or Item UUID — transfer effects live on Items
  let parent: any = fromUuidSync(data.actorUuid);
  if (parent instanceof TokenDocument) parent = parent.actor;
  return parent?.updateEmbeddedDocuments("ActiveEffect", data.updates);
}

async function updateItems(data: { actorUuid: string, updates: Item.UpdateData[] }) {
  const actor = fromActorUuid(data.actorUuid);
  return actor?.updateEmbeddedDocuments("Item", data.updates);
}

async function _toggleStatusEffect(data: { actorUuid: string, statusId: string, options: Actor.ToggleStatusEffectOptions }) {
  const actor = fromActorUuid(data.actorUuid);
  return actor?.toggleStatusEffect(data.statusId, data.options);
}

function removeActorStats(data: { actorId: string }) {
  return gameStats.GMremoveActorStats(data.actorId)
}

function GMrecordStats(data: StatUpdateMessage) {
  return gameStats.GMrecordStats(data);
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
  if (actor?.actor) actor = actor.actor;
  if (!actor) return null;
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
  if (actor?.actor) actor = actor.actor;
  if (!actor) return null;
  let ownedItem = new CONFIG.Item.documentClass(itemData, { parent: actor });
  // prepare item data for socketed events
  ownedItem.prepareData();
  // @ts-expect-error no dnd5e-types
  ownedItem.prepareFinalAttributes();
  // @ts-expect-error no dnd5e-types
  ownedItem.applyActiveEffects();
  const workflow = await completeItemUse(ownedItem, config, dialog, message);
  if (workflow && data.config?.midiOptions?.workflowData) return workflow.getSafeMacroData();
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

async function toggleTokenHidden(data: { tokenUuid: string, force?: boolean }) {
  const token = await fromUuid(data.tokenUuid) as TokenDocument.Implementation;
  if (token) {
    const hidden = data.force ?? !token.hidden;
    await token.update({ hidden });
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
        // Already expired: DAE is removing it, and deleting it here too would race that.
        effectsToDelete = effectsToDelete.filter(ef => !isEffectExpired(ef));
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
  saveDetails: SaveDetails;
  displayOptions?: {
    fastForward?: boolean;
    chatMessage?: boolean;
    rollMode?: string;
    showTargetDC?: boolean;
  };
  // Legacy fields from pre-13.0.44 callers
  request?: string;
  targetUuid?: string;
  ability?: string;
  skill?: string;
  tool?: string;
  options?: any;
  advantage?: boolean;
  disadvantage?: boolean;
  isMagicSave?: boolean;
  isConcentrationCheck?: boolean;
  rollDC?: number;
  saveItemUuid?: string;
  workflowOptions?: object;
  workflowId?: string;
  rollMode?: string;
}) {
  // Backward compatibility: migrate pre-13.0.44 flat argument format to new structure
  if (!data.saveDetails && data.targetUuid) {
    foundry.utils.logCompatibilityWarning(
      "midi-qol | rollAbility called with legacy flat argument format. Use { saveDetails, displayOptions } instead.",
      { since: "midi-qol 13.0.44", until: "midi-qol 13.1.0" }
    );
    data.saveDetails = {
      actorUuid: data.targetUuid,
      rollType: data.request ?? "save",
      rollAbilities: data.ability ? [data.ability] : [],
      rollSkills: data.skill ? [data.skill] : [],
      rollTools: data.tool ? [data.tool] : [],
      advantage: data.advantage,
      disadvantage: data.disadvantage,
      isMagicSave: data.isMagicSave ?? false,
      isConcentrationCheck: data.isConcentrationCheck,
      isFriendly: false,
      rollDC: data.rollDC ?? 0,
      saveItemUuid: data.saveItemUuid ?? "",
      workflowOptions: data.workflowOptions ?? {},
      workflowId: data.workflowId ?? "",
      itemCardUuid: "",
      itemId: data.options?.itemId ?? "",
      modifierTracker: undefined,
    };
    data.displayOptions = {
      fastForward: data.options?.fastForward,
      chatMessage: data.options?.chatMessage ?? data.options?.create,
      rollMode: data.options?.rollMode ?? data.rollMode,
    };
  }
  const sd = data.saveDetails;
  const disp = data.displayOptions;

  const rollAbilities = sd.rollAbilities ?? [];
  const rollSkills = sd.rollSkills ?? [];
  const rollTools = sd.rollTools ?? [];
  const ability = rollAbilities[0];
  const skill = rollSkills[0];
  const tool = rollTools[0];
  const advantage = sd.advantage;
  const disadvantage = sd.disadvantage;
  const isMagicSave = sd.isMagicSave;
  const isConcentrationCheck = sd.isConcentrationCheck;
  // Always on the roll: dnd5e derives success from it, and challenge visibility decides who sees the result.
  const rollDC = sd.rollDC;
  const saveItemUuid = sd.saveItemUuid;
  const workflowOptions = sd.workflowOptions;
  const workflowId = sd.workflowId;
  const itemId = sd.itemId;
  const itemCardUuid = sd.itemCardUuid;
  const advantageByChoice = sd.advantageByChoice;

  const fastForward = disp?.fastForward ?? false;
  const chatMessage = disp?.chatMessage ?? true;
  const rollMode = disp?.rollMode;

  // Normalize request type
  let normalizedRequest = sd.rollType;
  if (normalizedRequest === "abil") normalizedRequest = "check";
  if (normalizedRequest === "test") normalizedRequest = "check";

  const actor = fromActorUuid(sd.actorUuid);
  if (!actor) {
    error(`GMAction.rollAbility | no actor for ${sd.actorUuid}`)
    return {};
  }

  // Build midiOptions for patching.ts
  // advantage/disadvantage seed computeAdvantageFlags via options.advantage so the
  // midi-qol.preTargetSave hook's saveDetails.advantage actually applies. The flag is
  // also kept on the top-level config below for the applyPreComputedAdvantage path.
  const midiOptions: MidiOptions = {
    workflowId,
    rollAbilities,
    rollSkills,
    rollTools,
    advantageByChoice,
    recomputeAdvantage: true,
    target: rollDC,
    isMagicSave,
    saveItemUuid,
    saveActivityUuid: sd.saveActivityUuid,
    isConcentrationCheck,
    workflowOptions,
    itemCardUuid,
    advantage,
    disadvantage,
  };

  let config: RollProcessConfig = {
    midiOptions,
    advantage,
    disadvantage,
    workflowOptions,
  };

  // Reconstruct tracker instances from advantageByChoice - class instances don't survive socketlib
  // (tracker.toJSON() is called automatically during serialization, so tracker is a plain object after transmission)
  if (advantageByChoice && typeof advantageByChoice === "object") {
    for (const [key, value] of Object.entries(advantageByChoice)) {
      if (value?.tracker && !(value.tracker instanceof RollModifierTracker)) {
        const trackerData = value.tracker;
        value.tracker = new RollModifierTracker();
        (value.tracker as RollModifierTracker).restore(trackerData);
      }
    }
  }

  if (ability) config.ability = ability;
  if (skill) config.skill = skill;
  if (tool) config.tool = tool;
  let dialog: RollDialogConfig = { configure: !fastForward };
  let message: RollMessageConfig = { create: chatMessage, rollMode: rollMode as RollMessageConfig["rollMode"] };
  if (normalizedRequest === "tool") {
    const toolsToTry = rollTools.length > 0 ? rollTools : (tool ? [tool] : []);
    let toolItem: Item.Implementation | undefined;
    let foundToolId: string | undefined;
    // Try to find a tool item matching any of the requested tools
    for (const toolId of toolsToTry) {
      if (!toolId) continue;
      toolItem = actor.items.get(itemId ?? "") as Item.Implementation | undefined;
      // @ts-expect-error no dnd5e-types
      if (!toolItem || toolItem.type !== "tool") toolItem = actor.items.find(i => i.type === "tool" && i.system.type.baseItem === toolId) as Item.Implementation | undefined;
      if (toolItem) { foundToolId = toolId; break; }
    }
    if (!toolItem) { // no tool of any requested type - auto fail
      //@ts-expect-error
      return [await new CONFIG.Dice.D20Roll("-1").roll()];
    } else {
      // @ts-expect-error no dnd5e-types
      config.bonus = toolItem?.system.bonus ?? 0;
      // @ts-expect-error no dnd5e-types
      config.prof = toolItem?.system.prof;
      config.item = toolItem;
      if (foundToolId && foundToolId !== tool) config.tool = foundToolId;
    }
  }
  if (rollMode) message.rollMode = rollMode as RollMessageConfig["rollMode"];
  const performRoll = async (): Promise<Roll[] | Roll | undefined> => {
    // @ts-expect-error no dnd5e-types
    if (normalizedRequest === "save") return actor.rollSavingThrow(config, dialog, message);
    // @ts-expect-error no dnd5e-types
    if (normalizedRequest === "check") return actor.rollAbilityCheck(config, dialog, message);
    // @ts-expect-error no dnd5e-types
    if (normalizedRequest === "skill") return actor.rollSkill(config, dialog, message);
    // @ts-expect-error no dnd5e-types
    if (normalizedRequest === "tool") return actor.rollToolCheck(config, dialog, message);
    // @ts-expect-error no dnd5e-types
    if (normalizedRequest === "deathSave") return actor.rollDeathSave(config, dialog, message);
    return undefined;
  };

  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout | undefined;
    let settled = false;
    const settle = (result?: Roll[] | Roll) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(result ?? {});
    };
    /*
     * A failed roll must still settle. This promise is the result of a socketlib request that a
     * workflow awaits, and a rejection thrown from an async executor is swallowed rather than
     * rejecting the promise — so an error here used to leave the workflow waiting forever, with
     * only playerSaveTimeout (off by default) to rescue it. Settling empty matches the no-actor path.
     */
    const fail = (err: unknown) => {
      const msg = `rollAbility | ${normalizedRequest} roll failed for ${actor.name}`;
      TroubleShooter.recordError(err, msg);
      error(msg, err);
      settle();
    };
    if (configSettings.playerSaveTimeout > 0) timeoutId = setTimeout(() => {
      warn(`Roll request for ${actor.name} timed out. Doing roll`);
      dialog.configure = false; // assume player is asleep force roll without dialog
      performRoll().then(settle).catch(fail);
    }, configSettings.playerSaveTimeout * 1000);
    performRoll().then(settle).catch(fail);
  });
}

function monksTokenBarSaves(data: {
  tokenData: MonksTokenBarRequest[];
  request: string;
  silent: boolean;
  showdc: boolean;
  rollMode: string;
  dc?: number;
}) {
  // MTB requestRoll options only reads: request, silent, rollmode, dc, showdc, callback
  //@ts-expect-error MonksTokenBar
  game.MonksTokenBar?.requestRoll(
    data.tokenData,
    {
      request: data.request,
      silent: data.silent,
      showdc: data.showdc,
      rollmode: data.rollMode,
      dc: data.dc,
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
  originMessageId?: string;
}) {
  if (debugEnabled > 0) debug("flashTokenBarSaves | Called with data:", data);

  //@ts-expect-error FlashAPI
  if (typeof FlashAPI !== 'undefined') {
    if (debugEnabled > 0) debug("flashTokenBarSaves | FlashAPI found, calling requestRoll");
    // FlashAPI.requestRoll reads: requestType, rollKey, actorIds, dc, advantage,
    // disadvantage, rollMode, skipRollDialog, sendAsRequest, workflowId
    //@ts-expect-error FlashAPI
    FlashAPI.requestRoll({
      requestType: data.requestType,
      rollKey: data.rollKey,
      actorIds: data.actorIds,
      dc: data.dc,
      advantage: data.advantage,
      disadvantage: data.disadvantage,
      skipRollDialog: data.skipRollDialog,
      sendAsRequest: data.sendAsRequest,
      rollMode: data.rollMode,
      workflowId: data.workflowId,
      originMessageId: data.originMessageId
    });
  } else {
    error("flashTokenBarSaves | FlashAPI not found! Is flash-rolls-5e module active?");
  }
}

/**
 * dnd5e's damage hooks carry the message the damage came from (`origin`, `originatingMessage`); midi's is its card.
 * Attached non-enumerable, on the options object itself: hook handlers' changes still reach the actor update, and the
 * card is not copied into the undo data midi stores.
 */
function withDamageOrigin<T>(options: T): T {
  const uuid = foundry.utils.getProperty(options as object, "midi.itemCardUuid");
  const card = typeof uuid === "string" ? fromUuidSync(uuid) : undefined;
  if (options && typeof options === "object" && card instanceof ChatMessage) {
    for (const key of ["origin", "originatingMessage"]) {
      Object.defineProperty(options, key, { value: card, enumerable: false, configurable: true, writable: true });
    }
  }
  return options;
}

async function createReverseDamageCard(data: {
  damageList: SerializedDamageListEntry[];
  autoApplyDamage: string;
  flagTags: any,
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
  let id: string | undefined;
  if (data.damageList.some(di => di.wasHit)) {
    id = await createDamageCard({ ...data, damageList: newDamageList }, true);
    if (id) cardIds.push(id);
  }
  if (data.damageList.some(di => !di.wasHit) && ["yesCardMisses", "noCardMisses"].includes(data.autoApplyDamage)) {
    id = await createDamageCard({ ...data, damageList: newDamageList }, false);
    if (id) cardIds.push(id);
  }
  console.log("createReverseDamageCard took ", Date.now() - startTime, "ms");
  return cardIds;
}

export interface DamageListContextEntry {
  isCharacter: boolean;
  isNpc: boolean;
  actorUuid: string;
  targetUuid: string;
  displayUuid: string;
  tokenId?: string;
  tokenImg: string;
  tokenVideoSrc?: string;
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
  tempMaxChanged?: boolean;
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
function calculateDamageAmounts(damageDetail: DamageDescription[]): { amount: number; temp: number; healing: number; vitality: number; tempMax: number } {
  return damageDetail.reduce((acc, d) => {
    if (d.type === "temphp") acc.temp += d.value;
    else if (d.type === "vitality") acc.vitality += d.value; // Vitality damage (positive) or healing (negative)
    else if (d.type === "maximum") acc.tempMax += d.value; // Max HP reduction (positive = reduce max)
    else if (d.type === "healing" || d.active?.absorption || (d.active?.type as Record<string, boolean> | undefined)?.absorption) acc.healing += d.value;
    else if (d.type !== "midi-none") acc.amount += d.value;
    return acc;
  }, { amount: 0, temp: 0, healing: 0, vitality: 0, tempMax: 0 });
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
  undoEntry: RecoveredUndoEntry,
  showUndoMode: boolean
): void {
  const displayUuid = actorUuid.replaceAll(".", "");
  const { oldHP, newHP, oldTempHP, newTempHP, oldVitality, newVitality, oldTempMax, newTempMax } = undoEntry;

  // In undo mode, we're showing what undo would do (restore to old state = healing)
  // In apply mode, we're showing the original damage
  const isHealing = showUndoMode;

  // For undo mode, use CURRENT actor values as "from" (not stored newHP)
  // This handles multiple damage applications with multipliers
  let fromHP: number, toHP: number, fromTempHP: number, toTempHP: number;
  let fromVitality: number | undefined, toVitality: number | undefined;
  let fromTempMax: number | undefined, toTempMax: number | undefined;

  if (showUndoMode) {
    // Undo mode: restore from current state to original old values
    const actor = fromActorUuid(actorUuid);
    // @ts-expect-error no dnd5e types
    fromHP = actor?.system.attributes.hp.value ?? newHP ?? 0;
    // @ts-expect-error no dnd5e types
    fromTempHP = actor?.system.attributes.hp.temp ?? newTempHP ?? 0;
    toHP = oldHP ?? 0;
    toTempHP = oldTempHP ?? 0;

    // Get current tempmax from actor
    if (oldTempMax !== undefined) {
      // @ts-expect-error no dnd5e types
      fromTempMax = actor?.system.attributes.hp.tempmax ?? newTempMax ?? 0;
      toTempMax = oldTempMax;
    }

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
    fromTempMax = oldTempMax;
    toTempMax = newTempMax;
  }

  // Calculate the actual changes from stored values
  const hpDelta = Math.abs((toHP ?? 0) - (fromHP ?? 0));
  const tempHpDelta = Math.abs((toTempHP ?? 0) - (fromTempHP ?? 0));
  const vitalityDelta = Math.abs((toVitality ?? 0) - (fromVitality ?? 0));
  const tempMaxDelta = Math.abs((toTempMax ?? 0) - (fromTempMax ?? 0));

  // Total damage = HP change + TempHP change
  const totalDamage = hpDelta + tempHpDelta;

  const hpChanged = hpDelta > 0;
  const tempHpChanged = tempHpDelta > 0;
  const vitalityChanged = vitalityDelta > 0;
  const tempMaxChanged = tempMaxDelta > 0;
  const noChange = !hpChanged && !tempHpChanged && !vitalityChanged && !tempMaxChanged;

  const totalSpan = html.querySelector<HTMLSpanElement>(`#dmg-total-${displayUuid}`);
  const tempSpan = html.querySelector<HTMLSpanElement>(`#dmg-temp-${displayUuid}`);
  const hpSpan = html.querySelector<HTMLSpanElement>(`#dmg-hp-${displayUuid}`);
  const noChangeSpan = html.querySelector<HTMLSpanElement>(`#dmg-nochange-${displayUuid}`);
  const vitalitySpan = html.querySelector<HTMLSpanElement>(`#dmg-vitality-${displayUuid}`);
  const directVitalitySpan = html.querySelector<HTMLSpanElement>(`#dmg-vit-direct-${displayUuid}`);
  const tempMaxSpan = html.querySelector<HTMLSpanElement>(`#dmg-tempmax-${displayUuid}`);

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

  // Update tempMax (max HP reduction) display
  if (tempMaxSpan) {
    if (tempMaxChanged && fromTempMax !== undefined && toTempMax !== undefined) {
      tempMaxSpan.classList.remove("midi-qol-dmg-hidden");
      const tmOld = tempMaxSpan.querySelector<HTMLSpanElement>(".dmg-tempmax-old");
      const tmNew = tempMaxSpan.querySelector<HTMLSpanElement>(".dmg-tempmax-new");
      if (tmOld) tmOld.textContent = String(Math.trunc(fromTempMax));
      if (tmNew) tmNew.textContent = String(Math.trunc(toTempMax));
    } else {
      tempMaxSpan.classList.add("midi-qol-dmg-hidden");
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
    // -classic matches cards written before the classic template was removed.
    const row = html.querySelector<HTMLElement>(`.midi-qol-dmg-row[data-actor-uuid="${displayUuid}"], .midi-qol-dmg-row-classic[data-actor-uuid="${displayUuid}"]`);
    if (row) {
      row.dataset.hpApplied = applied ? "true" : "false";
    }
  }

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

  // Update the header text (target the span to preserve the caret icon)
  const headerText = html.querySelector<HTMLElement>("#midi-qol-dmg-header .midi-qol-dmg-header-text");
  if (headerText) {
    if (appliedCount === 0) {
      headerText.textContent = i18n("midi-qol.HPNotUpdated");
    } else if (appliedCount === totalCount) {
      headerText.textContent = i18n("midi-qol.HPUpdated");
    } else {
      // Partial update - show count
      headerText.textContent = `${i18n("midi-qol.HPUpdated")} (${appliedCount}/${totalCount})`;
    }
  }
}

/** The modification labels for one calculated damage entry. */
export function damageDetailMods(di: DamageDescription): string[] {
  let allMods: string[];
  if (isDnd5e53) {
    // 5.3+: all boolean flags nested under all/type
    allMods = [];
    for (const cat of ["modification", "resistance", "vulnerability", "immunity",
      "absorption", "DR", "saved", "uncannyDodge", "spell", "magic", "nonmagic"]) {
      if (di.active?.all?.[cat] || di.active?.type?.[cat]) allMods.push(cat);
    }
    if (di.active?.threshold) allMods.push("threshold");
  } else {
    // 5.2.x: all keys flat
    allMods = Object.keys(di.active ?? {}).reduce((acc: string[], k) => {
      if (k === "semiSuperSaver" || k === "superSaver" || k === "inlined") return acc;
      if (di.active?.[k] && k !== "multiplier") acc.push(k);
      return acc;
    }, []);
  }
  if ((di.allActives?.length ?? 0) > 0) allMods = allMods.concat(di.allActives!);
  return allMods;
}

/** The card tooltip's per-entry display data, taken from the CALCULATED damage detail. */
export function buildDamageMods(damageDetail?: DamageDescription[]): DamageModDisplay[] {
  return (damageDetail ?? []).map(di => ({
    type: di.type, value: di.displayValue ?? di.value, mods: damageDetailMods(di)
  }));
}

/** Helper to generate tooltip HTML for a damage item */
function generateDamageTooltip(damageItem: DamageListEntry, tokenName?: string): string {
  // damageMods is stored on the card because the stored damageDetail is the raw list and has no
  // `active` markers; live application still derives it from the calculated detail.
  const entries = damageItem.damageMods ?? buildDamageMods(damageItem.damageDetail);
  const tooltipList = entries.map(e => {
    const mods = (e.mods.length > 0) ? `| ${e.mods.join(",")}` : "";
    return `${e.value > 0 ? Math.floor(e.value) : Math.ceil(e.value)} ${{ ...GameSystemConfig.damageTypes, ...GameSystemConfig.healingTypes }[e.type === "" ? "none" : e.type]?.label ?? "none"} ${mods}`
  }).map(s => s.replaceAll(",,", ",").replaceAll(",,", ","));

  const toolTipHeader: string[] = [];
  if (damageItem.damageDetail) {
    if (damageItem.newHP !== damageItem.oldHP) toolTipHeader.push(`HP: ${damageItem.oldHP} -> ${damageItem.newHP}`);
    if ((damageItem.newTempHP ?? 0) !== (damageItem.oldTempHP ?? 0)) toolTipHeader.push(`TempHP: ${damageItem.oldTempHP} -> ${damageItem.newTempHP}`);
    if ((damageItem.newVitality ?? 0) !== (damageItem.oldVitality ?? 0)) toolTipHeader.push(`Vitality: ${damageItem.oldVitality} -> ${damageItem.newVitality}`);
    if ((damageItem.newTempMax ?? 0) !== (damageItem.oldTempMax ?? 0)) toolTipHeader.push(`Max HP: ${damageItem.oldTempMax} -> ${damageItem.newTempMax}`);
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
  doHits: boolean = true,
  /**
   * Rebuilding a stored card rather than applying damage. The recompute below reads the actor's
   * CURRENT state, so re-rendering would subtract the damage again; the stored figures stand.
   */
  fromStoredData: boolean = false
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
    if (!fromStoredData && actor.isOwner && (data.autoApplyDamage !== "yesCardNPC" || actor.type !== "character")) {
      // @ts-expect-error no dnd5e-types
      const hp = actor.system.attributes.hp;
      let { amount, temp, healing, vitality: vitalityDamage, tempMax } = calculateDamageAmounts(damageItem.damageDetail);
      amount = Math.max(0, amount);
      tempMax = Math.trunc(tempMax);
      const { amount: rawAmount, healing: rawHealing, vitality: rawVitality } = calculateDamageAmounts(damageItem.rawDamageDetail);
      damageItem.totalDamage = damageItem.damageDetail.reduce((acc, d) => acc + (!["temphp", "midi-none", "vitality", "maximum"].includes(d.type) ? d.value : 0), 0);
      amount = amount + healing;
      amount = amount > 0 ? Math.floor(amount) : Math.ceil(amount);

      let deltaTemp = amount > 0 ? Math.min(hp.temp, amount) : 0;
      // Since tempDamage represents the final change in tempHP - we can use it for calcs and it is ignored.

      // tempMax adjusts the clamp bounds: positive tempMax forces hp.value down if it would exceed new effective max
      let deltaHP = Math.clamp(amount - deltaTemp, -hp.damage + tempMax, hp.value - tempMax);
      if (hpDamage !== deltaHP && tempMax === 0) {
        error(`damage detail amount ${amount} !== hpDamage ${hpDamage}`, configSettings.useDamageDetail ? "ignoring hpDamage" : "using hpDamage");
        if (!configSettings.useDamageDetail) deltaHP = hpDamage;
      }
      const updates: Actor.UpdateData = {
        // @ts-expect-error no dnd5e-types
        "system.attributes.hp.temp": hp.temp - deltaTemp,
        "system.attributes.hp.value": hp.value - deltaHP
      };
      // Apply tempmax reduction (positive tempMax = reduce max HP)
      if (tempMax !== 0) {
        updates["system.attributes.hp.tempmax"] = (hp.tempmax ?? 0) - tempMax;
      }

      if (temp > updates["system.attributes.hp.temp"]) updates["system.attributes.hp.temp"] = temp;
      damageItem.newTempHP = updates["system.attributes.hp.temp"];
      damageItem.newHP = updates["system.attributes.hp.value"];
      damageItem.oldTempMax = hp.tempmax ?? 0;
      damageItem.newTempMax = updates["system.attributes.hp.tempmax"] ?? damageItem.oldTempMax;
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
        if (Hooks.call("dnd5e.preApplyDamage", actor, amount, updates, withDamageOrigin(damageItem.calcDamageOptions as DamageApplicationOptions)) !== false) {
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
            if (updatedActor) Hooks.callAll("dnd5e.applyDamage", updatedActor, amount, withDamageOrigin(damageItem.calcDamageOptions as DamageApplicationOptions));
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
      // raw detail, so a multiplier re-applied from the card recalculates from unmodified damage
      damageDetail: damageItem.rawDamageDetail,
      damageMods: damageItem.damageMods ?? buildDamageMods(damageItem.damageDetail),
      updateOptions: data.updateOptions ?? {}
    });

    let img = tokenDocument?.texture.src || actor.img as string;
    // @ts-expect-error no dnd5e-types
    if (configSettings.usePlayerPortrait && actor.type === "character")
      img = actor.img as string;
    // An animated token has no still frame for an <img>, and createThumbnail returns a base64 data
    // URI. Carry the source instead and generate the thumbnail on render (resolveTokenThumbnails).
    let tokenVideoSrc: string | undefined;
    if (foundry.helpers.media.VideoHelper.hasVideoExtension(img)) {
      tokenVideoSrc = img;
      const portrait = actor.img as string | undefined;
      img = portrait && !foundry.helpers.media.VideoHelper.hasVideoExtension(portrait)
        ? portrait
        : "icons/svg/mystery-man.svg";
    }

    // tempDamage is not persisted on the card - derive it from the temp HP figures that are, or a
    // re-rendered card would show NaN.
    const tempDamageApplied = damageItem.tempDamage ?? ((damageItem.oldTempHP ?? 0) - (damageItem.newTempHP ?? 0));
    const playerViewTotalDamage = damageItem.hpDamage + tempDamageApplied;
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
      tokenVideoSrc,
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
      tempMaxChanged: (damageItem.newTempMax ?? 0) !== (damageItem.oldTempMax ?? 0),
      noChange: newHP === oldHP && (damageItem.newTempHP ?? 0) === (damageItem.oldTempHP ?? 0) && (damageItem.newVitality ?? 0) === (damageItem.oldVitality ?? 0) && (damageItem.newTempMax ?? 0) === (damageItem.oldTempMax ?? 0),
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

/** Whether players are shown their view of a hits card: the playerDamageCard setting, and with playerCardDamageDifferent only when some damage was modified. */
function showsPlayerView(damageList: DamageListEntry[]): boolean {
  if (configSettings.playerDamageCard === "none") return false;
  if (!configSettings.playerCardDamageDifferent) return true;
  return damageList.some(damageItem => {
    const { amount: rawAmount, healing: rawHealing } = calculateDamageAmounts(damageItem.rawDamageDetail);
    // rawDamageDetail holds healing as positive values while hpDamage is negative for healing
    return rawAmount - rawHealing !== damageItem.hpDamage;
  });
}

/**
 * One damage card serves the GM and the players: each sees their own view of it (DamageCardMessage). It is public
 * when players are shown their view, otherwise whispered to the GMs. A misses card is GM-only.
 */
async function createDamageCard(
  data: {
    damageList: DamageListEntry[];
    autoApplyDamage: string;
    flagTags: any,
    forceApply: boolean,
    updateOptions: any,
    actorUuid?: string,
    charName: string,
    actorId: string,
  },
  doHits: boolean = true
): Promise<string | undefined> {
  const damageList = data.damageList;
  let tokenDataList: DamageListEntry[] = [];
  let chatCardUuid: string | undefined;
  // Before the list is prepared: that recomputes hpDamage from the actors' current HP
  const playerView = doHits && showsPlayerView(damageList);
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
    const gmTemplate = "modules/midi-qol/templates/damage-results.html";
    const speaker = ChatMessage.getSpeaker();
    speaker.alias = game.user?.name;
    let chatData: ChatMessage.CreateData = {
      speaker: playerView
        ? { scene: getCanvas()?.scene?.id, alias: data.charName, actor: data.actorId }
        : { scene: getCanvas()?.scene?.id, alias: game.user?.name },
      content: "",
      whisper: playerView ? [] : ChatMessage.getWhisperRecipients("GM").filter(u => (u as User).active).map(u => u.id),
      type: DAMAGE_MESSAGE_TYPE,
      system: {
        playerView, doHits, autoApplyDamage: data.autoApplyDamage, forceApply: data.forceApply,
        showNPC: ["npcplayerresults", "npcplayerbuttons"].includes(configSettings.playerDamageCard),
        playerButtons: ["playerbuttons", "npcplayerbuttons"].includes(configSettings.playerDamageCard)
      } satisfies DamageCardOptions,
      flags: { [MODULE_ID]: { "undoDamage": prepareDamageListForFlag(tokenDataList), actorUuid: data.actorUuid } }
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
      const undoDamageData = recoverUndoListFromFlag(message, undoFlag);
      if (undoDamageData) for (let { actorUuid, oldTempHP, oldHP, oldTempMax, newHP, newTempMax, calcDamageOptions, updateOptions } of undoDamageData) {
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
        if (newTempMax! - oldTempMax!) updates["system.attributes.hp.tempmax"] = oldTempMax;
        // Handle vitality undo - only if actor still has a vitality item
        const undoItem = undoDamageData.find(d => d.actorUuid === actorUuid);
        const vitalityItem = getVitalityItem(actor);
        let vitalityUpdated = false;
        if (vitalityItem && undoItem?.oldVitalitySpent !== undefined) {
          // @ts-expect-error item update for uses.spent
          await vitalityItem.update({ "system.uses.spent": undoItem.oldVitalitySpent });
          vitalityUpdated = true;
        }
        if (actor?.isOwner && Hooks.call("dnd5e.preApplyDamage", actor, newHP - oldHP, updates, withDamageOrigin(calcDamageOptions as DamageApplicationOptions)) !== false) {
          // The actor update - when no changes are made will update the passed options with a target
          // Set midiVitalityUpdatePending if vitality was updated to prevent double checkWounded calls
          const mergedOptions = foundry.utils.mergeObject(calcDamageOptions, updateOptions ?? {}, { inplace: false }) as any;
          if (vitalityUpdated) mergedOptions.midiVitalityUpdatePending = true;
          await actor.update(updates, mergedOptions)
            .then(updatedActor => {
              Hooks.callAll("dnd5e.applyDamage", updatedActor ?? actor, newHP - oldHP, withDamageOrigin(calcDamageOptions as DamageApplicationOptions));
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
      const undoDamageData = recoverUndoListFromFlag(message, undoFlag);
      if (undoDamageData) for (let { actorUuid, newHP, newTempHP, newTempMax, oldHP, oldTempMax, calcDamageOptions, updateOptions } of undoDamageData) {
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
        if (newTempMax! - oldTempMax!) update["system.attributes.hp.tempmax"] = newTempMax;
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
        if (actor?.isOwner && Hooks.call("dnd5e.preApplyDamage", actor, amount, update, withDamageOrigin(options as DamageApplicationOptions)) !== false) {
          await actor.update(update, options).then(updatedActor => {
            Hooks.callAll("dnd5e.applyDamage", actor, amount, withDamageOrigin(options));
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
  const undoDamageData = recoverUndoListFromFlag(message, undoFlag);
  undoDamageData?.forEach((undoEntry) => {
    const { actorUuid, oldTempHP, oldHP, oldTempMax, newHP, newTempHP, newTempMax, damageDetail, calcDamageOptions, updateOptions, oldVitalitySpent, newVitalitySpent } = undoEntry;
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
        if (newTempMax! - oldTempMax!) updates["system.attributes.hp.tempmax"] = oldTempMax;
        // Handle vitality undo - only if actor still has a vitality item
        const vitalityItem = getVitalityItem(actor);
        let vitalityUpdated = false;
        if (vitalityItem && oldVitalitySpent !== undefined) {
          // @ts-expect-error item update for uses.spent
          await vitalityItem.update({ "system.uses.spent": oldVitalitySpent });
          vitalityUpdated = true;
        }
        if (actor?.isOwner && Hooks.call("dnd5e.preApplyDamage", actor, amount, updates, withDamageOrigin(calcDamageOptions as DamageApplicationOptions)) !== false) {
          // The actor update - when no changes are made will update the passed options with a target
          // Set midiVitalityUpdatePending if vitality was updated to prevent double checkWounded calls
          const options = foundry.utils.mergeObject(calcDamageOptions ?? {}, updateOptions ?? {}, { inplace: false }) as any;
          if (vitalityUpdated) options.midiVitalityUpdatePending = true;
          await actor.update(updates, options).then(updatedActor => {
            Hooks.callAll("dnd5e.applyDamage", actor, amount, withDamageOrigin(calcDamageOptions as DamageApplicationOptions));
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
          if (newTempMax! - oldTempMax!) updates["system.attributes.hp.tempmax"] = newTempMax;
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
          if (actor?.isOwner && Hooks.call("dnd5e.preApplyDamage", actor, amount, updates, withDamageOrigin(calcDamageOptions as DamageApplicationOptions)) !== false) {
            await actor.update(updates, options).then(updatedActor => {
              Hooks.callAll("dnd5e.applyDamage", actor, amount, withDamageOrigin(calcDamageOptions as DamageApplicationOptions));
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

          // Separate vitality and maximum from HP damage
          // Filter out vitality and maximum from damageDetail for HP application
          const hpDamageDetail = damageDetail?.filter(d => d.type !== "vitality" && d.type !== "maximum") ?? [];

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

          // Calculate multiplied direct vitality and maximum damage separately
          const multiplier = mults[multiplierString ?? "x1"] ?? 1;
          let multipliedVitalityDamage = 0;
          let multipliedTempMaxDamage = 0;
          for (const d of damageDetail ?? []) {
            if (d.type === "vitality") {
              multipliedVitalityDamage += d.value * multiplier;
            } else if (d.type === "maximum") {
              multipliedTempMaxDamage += d.value * multiplier;
            }
          }
          multipliedVitalityDamage = Math.trunc(multipliedVitalityDamage);
          multipliedTempMaxDamage = Math.trunc(multipliedTempMaxDamage);

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

          // Apply tempMax (max HP reduction) if there was any maximum damage
          if (multipliedTempMaxDamage !== 0 && actor) {
            // @ts-expect-error no dnd5e types
            const currentTempMax = actor.system.attributes.hp.tempmax ?? 0;
            // @ts-expect-error no dnd5e types for hp.tempmax
            await actor.update({ "system.attributes.hp.tempmax": currentTempMax - multipliedTempMaxDamage });
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
      // Exclude vitality and maximum from HP total - they're shown separately
      let totalDamage = 0;
      let tempHpDamage = 0;
      let multipliedVitalityDamage = 0;
      let multipliedTempMaxDamage = 0;
      for (const dmg of calculatedDamages) {
        if (dmg.type === "temphp") {
          tempHpDamage += dmg.value;
        } else if (dmg.type === "vitality") {
          multipliedVitalityDamage += dmg.value;
        } else if (dmg.type === "maximum") {
          multipliedTempMaxDamage += dmg.value;
        } else if (!["midi-none", "none"].includes(dmg.type)) {
          totalDamage += dmg.value;
        }
      }
      // Truncate towards 0 to match actual damage application
      totalDamage = Math.trunc(totalDamage);
      tempHpDamage = Math.trunc(tempHpDamage);
      multipliedVitalityDamage = Math.trunc(multipliedVitalityDamage);
      multipliedTempMaxDamage = Math.trunc(multipliedTempMaxDamage);

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
      const tempMaxSpan = html.querySelector<HTMLSpanElement>(`#dmg-tempmax-${displayUuid}`);

      // Get current tempmax
      // @ts-expect-error no dnd5e types
      const currentTempMax = actor.system.attributes.hp.tempmax ?? 0;
      const newTempMax = currentTempMax - multipliedTempMaxDamage;
      const tempMaxChanged = multipliedTempMaxDamage !== 0;

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
      const noChange = !hpChanged && !tempHpChanged && !hasDamageToApply && !tempMaxChanged;

      // Update total damage display - show if there's any damage to apply
      if (totalSpan) {
        totalSpan.classList.toggle("midi-qol-dmg-hidden", !hasDamageToApply);
        totalSpan.classList.toggle("midi-qol-dmg-healing", isHealing);
        // Write the children, never the parent: setting textContent here would discard
        // .dmg-total-sign/.dmg-total-value, and updateDamageCardDisplay only writes them if present,
        // so every later refresh would silently skip the total and leave this preview frozen.
        const signSpan = totalSpan.querySelector<HTMLSpanElement>(".dmg-total-sign");
        if (signSpan) signSpan.textContent = isHealing ? "+" : "-";
        const valueSpan = totalSpan.querySelector<HTMLSpanElement>(".dmg-total-value");
        if (valueSpan) valueSpan.textContent = String(absTotalDamage);
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

      // Update tempMax (max HP reduction) display
      if (tempMaxSpan) {
        tempMaxSpan.classList.toggle("midi-qol-dmg-hidden", !tempMaxChanged);
        const tmOld = tempMaxSpan.querySelector<HTMLSpanElement>(".dmg-tempmax-old");
        const tmNew = tempMaxSpan.querySelector<HTMLSpanElement>(".dmg-tempmax-new");
        if (tmOld) tmOld.textContent = String(Math.trunc(currentTempMax));
        if (tmNew) tmNew.textContent = String(Math.trunc(newTempMax));
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

async function _moveToken(data: { tokenUuid: string, newCenter: { x: number, y: number, elevation?: number }, options?: MoveTokenOptions }): Promise<any> {
  const tokenDocument = fromUuidSync(data.tokenUuid) as TokenDocument.Implementation | undefined;
  if (!tokenDocument || !canvas.grid || !tokenDocument.object) {
    const message = `moveToken | token not found or canvas not ready: ${data.tokenUuid}`;
    error(message);
    TroubleShooter.recordError(new Error("moveToken failed"), message);
    return;
  }
  const targetToken = tokenDocument.object;
  const { animate = true, teleport = false, ignoreWalls = false, ignoreTokens = false, autoRotate = true } = data.options ?? {};
  const snappedCenter = canvas.grid.getSnappedPoint(data.newCenter, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
  const newPosition: Record<string, any> = { x: snappedCenter.x - targetToken.w / 2, y: snappedCenter.y - targetToken.h / 2 };
  if (data.newCenter.elevation !== undefined) newPosition.elevation = data.newCenter.elevation;
  // teleport uses "displace" action: instant, ignores walls/tokens
  const action = teleport ? "displace" : CONFIG.Token.movement.defaultAction;
  const waypoint = { ...newPosition, action, forced: true, snapped: true };
  const moveOptions: Record<string, any> = { constrainOptions: { ignoreWalls: teleport || ignoreWalls, ignoreCost: true, ignoreTokens: teleport || ignoreTokens }, autoRotate };
  // Use animate: false for instant moves — this skips Foundry's #onUpdateAnimation entirely,
  // avoiding a Foundry core crash when the animation path is empty (e.g. movement fully blocked)
  if (teleport || !animate) moveOptions.animate = false;
  return tokenDocument.move(waypoint, moveOptions);
}


async function _moveTokenAwayFromPoint(data: { targetUuid: string, point: { x: number, y: number }, distance: number, options?: MoveTokenOptions }): Promise<void> {
  const targetToken = getToken(data.targetUuid);
  const targetTokenDocument = getTokenDocument(targetToken);
  if (!canvas || !canvas.dimensions || !canvas.grid || !targetToken || !data.point || !targetTokenDocument) {
    const message = `moveTokenAwayFromPoint | token not found or canvas not ready: ${data.targetUuid}`;
    error(message);
    TroubleShooter.recordError(new Error("moveTokenAwayFromPoint failed"), message);
    return;
  }
  const ray = new foundry.canvas.geometry.Ray(data.point, tokenSourceCenter(targetToken));
  const pixelDistance = data.distance / canvas.dimensions.distance * canvas.dimensions.size;
  const newCenter = ray.project(1 + pixelDistance / ray.distance);
  await _moveToken({ tokenUuid: targetTokenDocument.uuid, newCenter, options: data.options });
}

async function _teleportToken(data: { tokenUuid: string, destination: TeleportTokenDestination }): Promise<void> {
  const originToken = fromUuidSync(data.tokenUuid) as TokenDocument.Implementation | undefined;
  if (!originToken?.object || !canvas.grid) {
    const message = `teleportToken | token not found or canvas not ready: ${data.tokenUuid}`;
    error(message);
    TroubleShooter.recordError(new Error("teleportToken failed"), message);
    return;
  }
  const dest = data.destination;
  const originScene = originToken.parent;
  if (!originScene) {
    const message = `teleportToken | token has no parent scene: ${data.tokenUuid}`;
    error(message);
    TroubleShooter.recordError(new Error("teleportToken failed"), message);
    return;
  }
  const destScene = dest.sceneUuid ? fromUuidSync(dest.sceneUuid) as Scene.Implementation | undefined : originScene;
  if (!destScene) {
    const message = `teleportToken | destination scene not found: ${dest.sceneUuid}`;
    error(message);
    TroubleShooter.recordError(new Error("teleportToken failed"), message);
    return;
  }
  const sameScene = !dest.sceneUuid || destScene.id === originScene.id;
  if (sameScene) {
    // Same-scene teleport: delegate to _moveToken with teleport: true
    await _moveToken({ tokenUuid: data.tokenUuid, newCenter: { x: dest.x, y: dest.y, elevation: dest.elevation }, options: { teleport: true } });
    return;
  }
  // Cross-scene teleport following Foundry's TeleportTokenRegionBehaviorType._teleportToken pattern.
  // Foundry's teleport API is region-based (requires a RegionDocument destination, not coordinates),
  // so we reimplement the steps here. Review on Foundry version upgrades:
  // see foundryv13/resources/app/client-esm/data/region-behaviors/teleport-token.mjs
  const targetToken = originToken.object;
  const snappedCenter = canvas.grid.getSnappedPoint({ x: dest.x, y: dest.y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
  const topLeft = { x: snappedCenter.x - targetToken.w / 2, y: snappedCenter.y - targetToken.h / 2 };
  const tokenData = originToken.toObject();
  delete (tokenData as any)._id;
  tokenData.x = topLeft.x;
  tokenData.y = topLeft.y;
  if (dest.elevation !== undefined) tokenData.elevation = dest.elevation;
  // Create token on destination scene
  const newToken = await TokenDocument.implementation.create(tokenData, { parent: destScene, keepId: false });
  if (!newToken) {
    const message = `teleportToken | failed to create token on destination scene: ${destScene.uuid}`;
    error(message);
    TroubleShooter.recordError(new Error("teleportToken failed"), message);
    return;
  }
  // Migrate combatants
  for (const combat of game.combats ?? []) {
    const toUpdate: { _id: string, sceneId: string, tokenId: string }[] = [];
    for (const combatant of combat.combatants) {
      if (combatant.sceneId === originScene.id && combatant.tokenId === originToken.id) {
        toUpdate.push({ _id: combatant.id!, sceneId: destScene.id!, tokenId: newToken.id! });
      }
    }
    if (toUpdate.length) await combat.updateEmbeddedDocuments("Combatant", toUpdate);
  }
  // Delete origin token
  await originToken.delete();
  // Pull the owning user to the destination scene
  const ownerUser = game.users?.find(u => u.active && !u.isGM && u.character?.id === originToken.actorId);
  if (ownerUser && ownerUser.viewedScene === originScene.id) {
    (game.socket as any).emit("pullToScene", destScene.id, ownerUser.id);
  }
}

async function rollActionSave(data: { actorUuid: string; effectName: string; saveDetails: SaveDetails; displayOptions: object }) {
  const { DialogV2 } = foundry.applications.api;
  const actor = fromActorUuid(data.actorUuid);
  const confirmed = await DialogV2.confirm({
    window: { title: `${actor?.name ?? ""}: ${data.effectName}` },
    content: `<p>${actor?.name} &mdash; use your action to roll against ${data.effectName}?</p>`,
    rejectClose: false,
  });
  if (!confirmed) return undefined;
  return rollAbility({ saveDetails: data.saveDetails, displayOptions: data.displayOptions });
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
/**
 * The members of a damage-list entry that survive onto `flags.midi-qol.undoDamage`.
 *
 * Single source of truth for both the runtime projection and the types derived from it, so reaching
 * for a member not listed here is a compile error rather than an `undefined` at runtime. Narrower
 * than the socket payload, which feeds createReverseDamageCard and needs the lot.
 *
 * To store another field: add it here. Nothing else needs to change.
 */
const PERSISTED_UNDO_FIELDS = ["actorUuid", "targetUuid", "damageSelector", "wasHit", "damageMods",
  "oldHP", "newHP", "oldTempHP", "newTempHP", "oldTempMax", "newTempMax",
  "oldVitality", "newVitality", "oldVitalitySpent", "newVitalitySpent",
  "hpDamage", "totalDamage", "rawTotalDamage"] as const;

/** Members carried verbatim; those below need their encoding changed and are handled explicitly. */
type PersistedUndoFields = Pick<DamageListEntry, typeof PERSISTED_UNDO_FIELDS[number]>;

/**
 * What the card needs beyond the damage entries themselves, so it can be rendered from data.
 *
 * The decisions taken when the damage was applied; everything else is derived or looked up live.
 * Storing them stops a later settings change silently restyling an old card.
 */
export interface DamageCardOptions {
  /** Players are shown the card, through the player view */
  playerView: boolean;
  doHits: boolean;
  autoApplyDamage: string;
  forceApply: boolean;
  showNPC: boolean;
  playerButtons?: boolean;
}

/** What is written to `flags.midi-qol.undoDamage`. */
export interface PersistedUndoEntry extends PersistedUndoFields {
  damageDetail: DamageDescriptionObject[];
  calcDamageOptions: SerializedDamageListEntry["calcDamageOptions"];
  updateOptions: any;
}

/** A stored entry with its Sets and DamageDescriptions rehydrated. */
export type RecoveredUndoEntry = Omit<PersistedUndoEntry, "damageDetail" | "calcDamageOptions"> & {
  damageDetail: DamageDescription[];
  calcDamageOptions: DamageListEntry["calcDamageOptions"];
};

/**
 * Members of `calcDamageOptions.midi` that are outputs rather than inputs — midi's own
 * dnd5e.preApplyDamage handler rewrites them on every replay, so a stored copy is never read.
 */
const RECOMPUTED_MIDI_OPTIONS = ["updates", "amount"];

/**
 * Members of `calcDamageOptions.midi` that repeat something already on the message. Dropped on the
 * way out and put back by recoverUndoListFromFlag, so the replay hooks see them unchanged.
 */
const DUPLICATED_MIDI_OPTIONS = ["targetUuid", "sourceActorUuid"];

/**
 * `calcDamageOptions` scopes midi persists. Other modules add their own (RPG Damage Numbers writes
 * `RPGDN`); those are display state for a card that has already been rendered, so they are not
 * stored. midi's own keys plus dnd5e's DamageApplicationOptions.
 */
const PERSISTED_DAMAGE_OPTIONS = ["midi", "ignore", "downgrade", "invertHealing", "multiplier",
  "midiIgnoreComputed", "ignoreTarget"];

/**
 * Serialise for storage on the chat message. Runs the socket serialiser then drops what the flag
 * does not need, so this decides only WHICH members survive, never how any of them is encoded.
 */
export function prepareDamageListForFlag(damageList: DamageListEntry[]): PersistedUndoEntry[] {
  return prepareDamageListToJSON(damageList).map(entry => {
    const kept = Object.fromEntries(PERSISTED_UNDO_FIELDS
      .filter(field => entry[field] !== undefined)
      .map(field => [field, entry[field]])) as PersistedUndoFields;
    const { midi, ...otherOptions } = entry.calcDamageOptions ?? {};
    const keptOptions = Object.fromEntries(Object.entries(otherOptions)
      .filter(([key]) => PERSISTED_DAMAGE_OPTIONS.includes(key)));
    return {
      ...kept,
      damageDetail: entry.damageDetail,
      calcDamageOptions: midi
        ? {
          ...keptOptions,
          midi: Object.fromEntries(Object.entries(midi).filter(([key]) =>
            !RECOMPUTED_MIDI_OPTIONS.includes(key) && !DUPLICATED_MIDI_OPTIONS.includes(key)))
        } as PersistedUndoEntry["calcDamageOptions"]
        : keptOptions as PersistedUndoEntry["calcDamageOptions"],
      updateOptions: entry.updateOptions
    };
  });
}

/** Build a damage card's context from the message. Shared by card creation and the sub-type render. */
export async function buildDamageCardContext(
  message: ChatMessage.Implementation,
  card: DamageCardOptions,
  asPlayer: boolean
): Promise<{
  damageApplied: string;
  damageWasApplied: boolean;
  damageList: DamageListContextEntry[];
  needsButtonAll: boolean;
  showNPC: boolean;
  playerButtons?: boolean;
}> {
  const flags: any = message.flags?.[MODULE_ID];
  const damageList = recoverUndoListFromFlag(message, flags?.undoDamage ?? []) as unknown as DamageListEntry[];
  // Must match what card creation computes: it decides which of apply/undo is the live button.
  const damageWasApplied = card.doHits
    && (["yes", "yesCard", "yesCardMisses"].includes(card.autoApplyDamage) || card.forceApply);
  const templateData = {
    damageWasApplied,
    damageApplied: damageWasApplied ? i18n("midi-qol.HPUpdated")
      : card.autoApplyDamage === "yesCardNPC" ? i18n("midi-qol.HPNPCUpdated") : i18n("midi-qol.HPNotUpdated"),
    damageList: [] as DamageListContextEntry[],
    needsButtonAll: damageList.length > 1,
    showNPC: asPlayer ? card.showNPC : true,
    playerButtons: card.playerButtons
  };
  // createPromises false: this builds the display only, it must never re-apply damage
  await prepareDamageListItems(
    { damageList, autoApplyDamage: card.autoApplyDamage, flagTags: null, forceApply: card.forceApply, updateOptions: {} },
    templateData, [], false, templateData.showNPC, card.doHits, true);
  if (asPlayer) templateData.playerButtons = !!card.playerButtons && templateData.damageList.some(listItem => listItem.isCharacter);
  return templateData;
}

/**
 * Recover a stored entry, sharing every decoding rule with the socket path. Accepts the full socket
 * shape too, so messages written before the payload was pruned keep working.
 *
 * Puts back the DUPLICATED_MIDI_OPTIONS the flag does not carry - midi's own dnd5e.preApplyDamage
 * handler reads `midi.sourceActorUuid`. Only fills what is absent, so older entries keep theirs.
 */
function recoverUndoListFromFlag(message: ChatMessage.Implementation,
  damageList: (PersistedUndoEntry | SerializedDamageListEntry)[]): RecoveredUndoEntry[] {
  const sourceActorUuid = message?.flags?.[MODULE_ID]?.actorUuid;
  const recovered = recoverDamageListFromJSON(damageList as SerializedDamageListEntry[]);
  for (const entry of recovered) {
    const midi = entry.calcDamageOptions?.midi;
    if (!midi) continue;
    midi.targetUuid ??= entry.targetUuid;
    if (sourceActorUuid) midi.sourceActorUuid ??= sourceActorUuid;
  }
  return recovered;
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
    // Stored entries carry neither (see prepareDamageListForFlag); fall back to the detail itself.
    const newRawDamageDetail = damageItem.rawDamageDetail
      ? recoverDamageDetailFromJSON(damageItem.rawDamageDetail)
      : newDamageDetail;
    const newDamageDetails = Object.fromEntries(Object.entries(damageItem.damageDetails ?? {})
      .map(([key, value]) => [key, recoverDamageDetailFromJSON(value)]));
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

/* ---------------------------------------- */
/*  Region Behavior Socket Handlers         */
/* ---------------------------------------- */

async function _midiRegionTriggerActivity(data: {
  activityUuid: string;
  targetUuids: string[];
  castLevel: number;
  sourceActorUuid: string;
}) {
  const { MidiRegionActivityBehaviorType } = await import("./regionBehaviors/MidiRegionActivityBehaviorType.js");
  return MidiRegionActivityBehaviorType._executeTriggerActivity(data);
}

/**
 * A player's round advance, redone by the GM so the auto initiative reroll is rolled once, by the GM, inside the round
 * update. Only when the player could have advanced the combat themselves.
 */
async function _advanceCombatRound(this: { socketdata?: { userId?: string } }, data: { combatUuid: string, changed: { round: number, turn?: number | null }, options?: object }) {
  const combat = fromUuidSync(data.combatUuid) as Combat.Implementation | null;
  const user = game.users?.get(this?.socketdata?.userId ?? "");
  if (!combat || !user || (combat.round ?? 0) >= data.changed.round) return;
  if (!combat.combatant?.testUserPermission(user, "OWNER")) return;
  return combat.update(data.changed, data.options);
}

// RegionDocument.update and embedded RegionBehavior creation both require GM-level scene
// write permission, which players don't have. Batched here so a player-cast region spell
// (e.g. Spirit Guardians) configures its proxied region in a single socket round-trip.
// Use the writeRegion() helper in MidiActivityMixin — it skips the socket entirely when
// the caller already has permission (e.g. GM cast).
//
// Race: the region was just created on the caller's client; the create broadcast to this
// client may arrive after the socketlib message. Foundry socket events are in-order per
// connection, so the create will arrive — poll briefly until it does.
async function _setupRegion(data: { regionUuid: string; update?: any; behaviors?: any[] }) {
  let regionDoc = fromUuidSync(data.regionUuid) as RegionDocument.Implementation | null;
  const deadline = Date.now() + 2000;
  while (!regionDoc && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 25));
    regionDoc = fromUuidSync(data.regionUuid) as RegionDocument.Implementation | null;
  }
  if (!regionDoc) {
    error(`midi-qol | setupRegion: region ${data.regionUuid} not found within 2s`);
    return;
  }
  if (data.update && Object.keys(data.update).length > 0) {
    await regionDoc.update(data.update);
  }
  if (data.behaviors?.length) {
    return regionDoc.createEmbeddedDocuments("RegionBehavior", data.behaviors as any);
  }
}
