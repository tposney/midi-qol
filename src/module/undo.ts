import { isEmptyBindingElement } from "typescript";
import { error, log, warn } from "../midi-qol.js";
import { socketlibSocket } from "./GMAction.js";
import { busyWait } from "./tests/setupTest.js";
import { isReactionItem } from "./utils.js";
import { Workflow } from "./workflow.js";
let undoDataQueue: any[] = [];
let startedUndoDataQueue: any[] = [];
const MAXUNDO = 20;

// Called by workflow to start a new undoWorkflow entry
export async function saveUndoData(workflow: Workflow): Promise<boolean> {
  workflow.undoData = {};
  workflow.undoData.uuid = workflow.uuid;
  workflow.undoData.userId = game.user?.id;
  workflow.undoData.itemName = workflow.item?.name;
  workflow.undoData.itemUuid = workflow.item?.uuid;
  workflow.undoData.userName = game.user?.name;
  workflow.undoData.tokendocUuid = workflow.token.uuid ?? workflow.token.document.uuid;
  workflow.undoData.actorUuid = workflow.actor?.uuid;
  workflow.undoData.chatCardUuids = [];
  workflow.undoData.isReaction = workflow.options?.isReaction || isReactionItem(workflow.item);
  workflow.undoData.concentrationData = {};
  if (!await socketlibSocket.executeAsGM("startUndoWorkflow", workflow.undoData)) {
    error("Could not startUndoWorkflow");
    return false;
  }
  return true;
}

// Called to save snapshots of workflow actor/token data
export function startUndoWorkflow(undoData: any): boolean {
  //@ts-expect-error fromUuidSync
  let tokendoc = fromUuidSync(undoData.tokendocUuid);
  if (!tokendoc) {
    error("Could not find token to start undo data ", undoData.tokendocUuid);
    return false;
  }
  undoData.tokenDocument = tokendoc.toObject();
  if (tokendoc.actorLink) { // for unlinked need to snapshot the current actor data
    undoData.actor = tokendoc.actor?.toObject();
  }
  addQueueEntry(startedUndoDataQueue, undoData);
  return true;
}

// Called after preamblecomplete so save references to all targets
export async function saveTargetsUndoData(workflow: Workflow) {
  workflow.undoData.targets = [];
  workflow.targets.forEach(t => {
    let tokendoc: TokenDocument = (t instanceof TokenDocument) ? t : t.document;
    if (tokendoc.actor?.uuid === workflow.actor.uuid) return;
    workflow.undoData.targets.push({"uuid": tokendoc.uuid});
  });
  workflow.undoData.serverTime = game.time.serverTime;
  workflow.undoData.itemCardId = workflow.itemCardId;
  return socketlibSocket.executeAsGM("queueUndoData", workflow.undoData)
}

export async function updateUndoConcentrationData(workflow: Workflow, concentrationData: any) {
  workflow.undoData.concentrationData = mergeObject(workflow.undoData.concentrationData, concentrationData, {overwrite: true});
  return socketlibSocket.executeAsGM("updateUndoConcentration", workflow.undoData);
}

export function updateUndoConcentration(data) {
  const currentUndo = undoDataQueue.find(undoEntry => undoEntry.serverTime === data.serverTime && undoEntry.userId === data.userId)
  if (!currentUndo) {
    warn("Could not find existing entry for ", data)
  }
  currentUndo.concentrationData = data.concentrationData;
}

export function updateUndoChatCards(data) {
  const currentUndo = undoDataQueue.find(undoEntry => undoEntry.serverTime === data.serverTime && undoEntry.userId === data.userId)
  if (!currentUndo) {
    warn("Could not find existing entry for ", data)
  }
  currentUndo.chatCardUuids = data.chatCardUuids;
}

// Have the gm store a snapshot of the target data.
export async function recordUndoData(undoData: any) {
  // console.error("undo command message size is ", new TextEncoder().encode(JSON.stringify(undoData)).length);
  return socketlibSocket.executeAsGM("queueUndoData", undoData)
}

export function showUndoQueue() {
  console.log(undoDataQueue)
}

export function queueUndoData(data: any): boolean {
  let inProgress = startedUndoDataQueue.find(undoData => undoData.userId === data.userId && undoData.uuid === data.uuid);
  if (!inProgress) {
    error("Could not find started undo entry for ", data.userId, data.uuid);
    return false;
  };
  inProgress = mergeObject(inProgress, data, {overwrite: false});
  startedUndoDataQueue = startedUndoDataQueue.filter(undoData => undoData.userId !== data.userId || undoData.itemUuid !== data.itemUuid);
  // fetch targets
  // inProgress.targets = data.targets;
  data.targets.forEach(undoEntry => {
    //@ts-expect-error fromUuidSync
    let tokendoc: TokenDocument = fromUuidSync(undoEntry.uuid);
    undoEntry["tokenDocument"] = tokendoc?.toObject(true);
    //@ts-expect-error actorLink
    if (tokendoc?.actorLink) undoEntry["actor"] = tokendoc.actor?.toObject();
  });
  addQueueEntry(undoDataQueue, inProgress);
  return true;
}

export function addQueueEntry(queue: any[], data: any) {
  // add the item
  let added = false;
  for (let i = 0; i < queue.length; i++) {
    if (data.serverTime > queue[i].serverTime) {
      queue.splice(i, 0, data);
      added = true;
      break;
    }
  }
  if (!added) queue.push(data);
  if (queue.length > MAXUNDO) {
    console.warn("Removed undoEntry due to overflow", queue.pop());
  }
}

export async function undoMostRecentWorkflow() {
  return socketlibSocket.executeAsGM("undoMostRecentWorkflow")
}

export async function _undoMostRecentWorkflow() {
  if (undoDataQueue.length === 0) return false;
  let undoData;
  while (undoDataQueue.length > 0) {
    let undoData = undoDataQueue.shift();
    if (undoData.isReaction) await undoWorkflow(undoData);
    else return undoWorkflow(undoData);
  }
  return;
}

export function _removeChatCards(data: { chatCardUuids: string[] }) {
  // TODO see if this might be async and awaited
  if (!data.chatCardUuids) return;
  for (let uuid of data.chatCardUuids) {
    //@ts-expect-error fromUuidSync
    fromUuidSync(uuid)?.delete();
  }
}

export async function _undoEntry(data: any) {

  let { actorChanges, tokenChanges, effectsToRemove, itemsToRemove, tokendoc } = data;
  if (itemsToRemove?.length) {
    await tokendoc.actor.deleteEmbeddedDocuments("Item", itemsToRemove);
    await busyWait(.1);
  }
  if (effectsToRemove?.length) {
    effectsToRemove = effectsToRemove.filter(_id => tokendoc.actor.effects.some(effect => effect._id === _id));
    try {
      if (effectsToRemove.length) await tokendoc.actor.deleteEmbeddedDocuments("ActiveEffect", effectsToRemove);
    } catch (err) { }
  }
  let effectsToAdd;
  //@ts-expect-error isEmpty
  if (!tokendoc?.actorLink && tokenChanges && !isEmpty(tokenChanges)) {
    effectsToAdd = tokenChanges?.actorData?.effects?.filter(efData => !tokendoc.actor.effects.some(effect => effect._id === efData._id)) ?? [];
    if (effectsToAdd?.length) await tokendoc.actor.createEmbeddedDocuments("ActiveEffect", effectsToAdd)
    delete tokenChanges?.actorData?.effects;
    return tokendoc.update(tokenChanges);
    //@ts-expect-error isEmpty
  } else if (actorChanges && !isEmpty(actorChanges)) {
    return tokendoc.actor.update(actorChanges)
  }
}

export function removeUndoEffects(effectsData, actor): string[] {
  const effectsToRemove = actor.effects.filter(effect => {
    return !effectsData.some(effectData => effect._id === effectData._id);
  }).map(effect => effect._id) ?? [];
  return effectsToRemove;
}

function removeUndoItems(itemsData, actor): string[] {
  const itemsToRemove = actor.items.filter(item => {
    return !itemsData?.some(itemData => item._id === itemData._id);
  }).map(item => item._id);
  return itemsToRemove;
}

function getChanges(newData, savedData): any {
  if (!newData && !savedData) return {};
  const changes = flattenObject(diffObject(newData, savedData));
  const tempChanges = flattenObject(diffObject(savedData, newData));
  const toDelete = {};
  for (let key of Object.keys(tempChanges)) {
    if (!changes[key]) {
      let parts = key.split(".");
      parts[parts.length - 1] = "-=" + parts[parts.length -1];
      let newKey = parts.join(".");
      toDelete[newKey] = null
    }
  } 
  return mergeObject(changes, toDelete);
}
export async function undoWorkflow(undoData: any) {
  //@ts-expect-error fromuuidSync
  const tokendoc = fromUuidSync(undoData.tokendocUuid);
  //@ts-expect-error
  const actor = fromUuidSync(undoData.actorUuid);
  if (!actor.isToken || !undoData.tokenDocument) {
    await actor.update(undoData.actor);
  }
  if (undoData.tokenDocument) {
    let effectsToRemove: string[] = [];
    let itemsToRemove: string[] = [];
    let actorChanges;
    let tokenChanges;
    if (tokendoc.actorLink) {
      itemsToRemove = removeUndoItems(undoData.actor.items ?? [], tokendoc.actor);
      effectsToRemove = removeUndoEffects(undoData.actor.effects ?? [], tokendoc.actor);
      actorChanges = getChanges(tokendoc?.actor.toObject(), undoData.actor);
      // delete actorChanges.items;
      // delete actorChanges.effects;
    } else {
      itemsToRemove = removeUndoItems(undoData.tokenDocument.actorData.items ?? [], tokendoc.actor);
      effectsToRemove = removeUndoEffects(undoData.tokenDocument.actorData.effects ?? [], tokendoc.actor);
      tokenChanges = getChanges(tokendoc.toObject(), undoData.tokenDocument);
    }
    log(`Undoing workflow for Player ${undoData.userName} Token: ${tokendoc.object.name} Item: ${undoData.itemName ?? ""}`, actorChanges, tokenChanges)
    await _undoEntry({ tokenChanges, actorChanges, effectsToRemove, itemsToRemove, tokendoc });
  }
  for (let undoEntry of undoData.targets) {
    //@ts-expect-error fromUuidSync
    const tokendoc = fromUuidSync(undoEntry.uuid);
    if (!tokendoc) continue;
    let effectsToRemove: string[] = [];
    let itemsToRemove: string[] = [];
    let actorChanges, tokenChanges;
    if (!tokendoc.actorLink) {
      tokenChanges = getChanges(tokendoc.toObject(), undoEntry.tokenDocument);
      itemsToRemove = removeUndoItems(undoEntry.tokenDocument.actorData.items ?? [], tokendoc.actor);
      effectsToRemove = removeUndoEffects(undoEntry.tokenDocument.actorData.effects ?? [], tokendoc.actor);
    } else {
      effectsToRemove = removeUndoEffects(undoEntry.actor.effects ?? [], tokendoc.actor);
      itemsToRemove = removeUndoItems(undoEntry.actor.items ?? [], tokendoc.actor);
      actorChanges = getChanges(tokendoc.actor.toObject(), undoEntry.actor);
    }

    await _undoEntry({ actorChanges, tokenChanges, effectsToRemove, itemsToRemove, tokendoc });
    log(`Undoing workflow for Player ${undoData.userName} Target: ${tokendoc.object.name} Item: ${undoData.itemName ?? ""}`, actorChanges, tokenChanges)

  }
  // delete cards...
  if (undoData.itemCardId) await game.messages?.get(undoData.itemCardId)?.delete();
  _removeChatCards({ chatCardUuids: undoData.chatCardUuids });
}