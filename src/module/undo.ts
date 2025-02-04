
import { debug, debugEnabled, error, gameUser, log, warn } from "../midi-qol.js";
import { socketlibSocket, untimedExecuteAsGM } from "./GMAction.js";
import { configSettings } from "./settings.js";
import { busyWait } from "./tests/setupTest.js";
import { MQfromUuidSync, getConcentrationEffect, getTokenDocument, isReactionItem } from "./utils.js";
import { Workflow } from "./Workflow.js";

var dae;
Hooks.once("DAE.setupComplete", () => {
  dae = globalThis.DAE;
})

export var undoDataQueue: any[] = [];
let startedUndoDataQueue: any[] = [];
const MAXUNDO = 15;
interface undoTokenActorEntry {
  actorUuid: string;
  tokenUuid: string | undefined,
  actorData: any;
  tokenData: any;
}
interface undoDataDef {
  id: string;
  userId: string;
  userName: string;
  itemName: string;
  itemUuid: string;
  tokendocUuid: string;
  actorUuid: string;
  actorName: string;
  chatCardUuids: string[] | undefined;
  isReaction: boolean;
  templateUuids: string[] | undefined;
  sequencerUuid: string | undefined;
  itemCardId: string | undefined;
  itemCardUuid: string | undefined;
  targets: { actorUuid: string, tokenUuid: string }[] | undefined;
}

export function queueUndoDataDirect(undoDataDef) {
  if (!configSettings.undoWorkflow) return;
  untimedExecuteAsGM("queueUndoDataDirect", undoDataDef);
}
export function _queueUndoDataDirect(undoDataDef) {
  if (!configSettings.undoWorkflow) return;
  const undoData: any = {};
  const tokenDoc = MQfromUuidSync(undoDataDef.tokendocUuid);
  const actor = MQfromUuidSync(undoDataDef.actorUuid);
  if (!actor) return;
  undoData.id = undoDataDef.id ?? foundry.utils.randomID();
  undoData.actorEntry = { actorUuid: undoDataDef.actorUuid, tokenUuid: undoDataDef.tokendocUuid, actorData: actor?.toObject(true), tokenData: tokenDoc?.toObject(true) };
  undoData.chatCardUuids = undoDataDef.chatCardUuids ?? [];
  undoData.itemCardId = undoDataDef.itemCardId;
  undoData.itemCardUuid = undoDataDef.itemCardUuid;
  undoData.actorName = actor.name;
  undoData.itemName = undoDataDef.itemName;
  undoData.userName = undoDataDef.userName;
  undoData.allTargets = undoDataDef.targets ?? new Collection();
  undoData.serverTime = game.time?.serverTime;
  undoData.templateUuids = undoDataDef.templateUuids ?? [];
  undoData.isReaction = undoDataDef.isReaction;

  if (undoData.targets) {
    for (let undoEntry of undoDataDef.allTargets) {
      let { actorUuid, tokenUuid } = undoEntry;
      const targetData = createTargetData(tokenUuid)
      if (targetData) {
        foundry.utils.mergeObject(undoEntry, targetData, { inplace: true });
      }
    }
  }
  addQueueEntry(undoDataQueue, undoData);
}
// Called by workflow to start a new undoWorkflow entry
export async function saveUndoData(workflow: Workflow): Promise<boolean> {
  if (!configSettings.undoWorkflow) return true;
  workflow.undoData = {};
  workflow.undoData.id = workflow.id;
  workflow.undoData.userId = gameUser().id;
  workflow.undoData.itemName = workflow.item?.name;
  workflow.undoData.itemUuid = workflow.item?.uuid;
  workflow.undoData.userName = gameUser().name;
  workflow.undoData.userId = gameUser().id;
  workflow.undoData.tokendocUuid = workflow.token?.uuid ?? workflow.token?.document.uuid;
  workflow.undoData.actorUuid = workflow.actor?.uuid;
  workflow.undoData.actorName = workflow.actor?.name;
  workflow.undoData.chatCardUuids = [];
  workflow.undoData.isReaction = workflow.options?.isReaction || isReactionItem(workflow.item);
  workflow.undoData.templateUuids = [];
  workflow.undoData.sequencerUuid = workflow.item?.uuid;
  if (!await untimedExecuteAsGM("startUndoWorkflow", workflow.undoData)) {
    error("Could not startUndoWorkflow");
    return false;
  }
  return true;
}

export function createTargetData(tokenUuid) {
  if (!tokenUuid) return undefined;
  const tokendoc = MQfromUuidSync(tokenUuid);
  if (!tokendoc) {
    error("undo | createTargetData could not fetch token document for ", tokenUuid);
    return undefined;
  }
  const targetData = { tokenUuid, actorUuid: tokendoc?.actor?.uuid, actorData: tokendoc?.actor?.toObject(true), tokenData: tokendoc?.toObject(true) };
  delete targetData.tokenData?.actorData;
  delete targetData.tokenData?.delta;
  return targetData;
}

// Called to save snapshots of workflow actor/token data
export function startUndoWorkflow(undoData: any): boolean {
  if (!configSettings.undoWorkflow) return true;
  let actor = MQfromUuidSync(undoData.actorUuid);
  if (actor instanceof TokenDocument) actor = actor.actor;
  const actorData = actor?.toObject(true);
  const tokenData = actor?.isToken ? actor.token.toObject(true) : MQfromUuidSync(undoData.tokendocUuid ?? "")?.toObject(true);
  undoData.actorEntry = { actorUuid: undoData.actorUuid, tokenUuid: undoData.tokendocUuid, actorData, tokenData };
  undoData.allTargets = new Collection; // every token referenced by the workflow
  const concentrationEffect = getConcentrationEffect(actor, undoData.itemUuid);
  if (concentrationEffect) {
    // @ts-expect-error no dnd5e-types
    for (let dependent of concentrationEffect.getDependents()) {
      let token;
      if (dependent instanceof ActiveEffect) dependent = dependent.parent;
      if (dependent instanceof Actor && dependent.isToken) token = dependent.token;
      else if (dependent instanceof Actor) token = dependent.getActiveTokens()[0];
      if (!token) continue;
      const targetData = createTargetData(token.uuid);
      if (targetData) undoData.allTargets.set(dependent.uuid, targetData);
    }
  }
  addQueueEntry(startedUndoDataQueue, undoData);
  return true;
}

export function updateUndoChatCardUuidsById(data) {
  if (!configSettings.undoWorkflow) return;
  const currentUndo = undoDataQueue.find(undoEntry => undoEntry.id === data.id);
  if (!currentUndo) {
    console.warn("midi-qol | updateUndoChatCardUuidsById | Could not find existing entry for ", data);
    return;
  }
  currentUndo.chatCardUuids = data.chatCardUuids;
}
export function updateUndoChatCardUuids(data) {
  if (!configSettings.undoWorkflow) return;
  const currentUndo = undoDataQueue.find(undoEntry => undoEntry.serverTime === data.serverTime && undoEntry.userId === data.userId);
  if (!currentUndo) {
    console.warn("midi-qol | updateUndoChatCardUuids | Could not find existing entry for ", data);
    return;
  }
  currentUndo.chatCardUuids = data.chatCardUuids;
}

// Called after preamblecomplete so save references to all targets
// This is a bit convoluted since we don't want to pass massive data elements over the wire.
// The total data for an undo entry can be measred in megabytes, so just pass uuids to the gm client and they can look up the tokens/actors
export async function saveTargetsUndoData(workflow: Workflow) {
  workflow.undoData.targets = [];
  workflow.targets.forEach(t => {
    let tokendoc: TokenDocument | undefined = getTokenDocument(t);
    if ((tokendoc?.actor as unknown as Actor)?.uuid === workflow.actor.uuid) return;
    workflow.undoData.targets.push({ tokenUuid: tokendoc?.uuid, actorUuid: (tokendoc?.actor as unknown as Actor)?.uuid });
  });
  workflow.undoData.serverTime = game.time?.serverTime;
  workflow.undoData.itemCardId = workflow.itemCardId;
  workflow.undoData.itemCardUuid = workflow.itemCardUuid;
  if (workflow.templateUuid) workflow.undoData.templateUuids.push(workflow.templateUuid);
  return untimedExecuteAsGM("queueUndoData", workflow.undoData)
}

export async function addUndoChatMessage(message: ChatMessage) {
  const currentUndo = undoDataQueue[0];
  if (message instanceof Promise) message = await message;
  if (configSettings.undoWorkflow && currentUndo && !currentUndo.chatCardUuids.some(uuid => uuid === message.uuid)) {
    // Assumes workflow.undoData.chatCardUuids has been initialised
    currentUndo.chatCardUuids = currentUndo.chatCardUuids.concat([message.uuid]);
    untimedExecuteAsGM("updateUndoChatCardUuids", currentUndo);
  }
}

Hooks.on("createChatMessage", (message, data, options, user) => {
  if (!configSettings.undoWorkflow) return;
  if ((undoDataQueue ?? []).length < 1) return;
  const currentUndo = undoDataQueue[0];
  const speaker = message.speaker;
  // if (currentUndo.userId !== user) return;
  if (speaker.token) {
    const tokenUuid = `Scene.${speaker.scene}.Token.${speaker.token}`;
    if (currentUndo.allTargets.has(tokenUuid)) currentUndo.chatCardUuids.push(message.uuid);
  } else if (speaker.actor) {
    const actorUuid = `Actor.${speaker.actor}`;
    if (currentUndo.allTargets.has(actorUuid)) currentUndo.chatCardUuids.push(message.uuid);
  }
});

export function showUndoQueue() {
  console.log(undoDataQueue);
  log("Undo queue size is ", new TextEncoder().encode(JSON.stringify(undoDataQueue)).length);
  log("Started queue size is ", new TextEncoder().encode(JSON.stringify(startedUndoDataQueue)).length);
}

export function getUndoQueue() {
  return undoDataQueue;
}

export function queueUndoData(data: any): boolean {
  let inProgress = startedUndoDataQueue.find(undoData => undoData.userId === data.userId && undoData.id === data.id);
  if (!inProgress) {
    error("Could not find started undo entry for ", data.userId, data.uuid);
    return false;
  };
  inProgress = foundry.utils.mergeObject(inProgress, data, { overwrite: false });
  startedUndoDataQueue = startedUndoDataQueue.filter(undoData => undoData.userId !== data.userId || undoData.itemUuid !== data.itemUuid);

  data.targets.forEach(undoEntry => {
    if (!inProgress.allTargets.get(undoEntry.actorUuid)) {
      const targetData = createTargetData(undoEntry.tokenUuid)
      if (targetData) {
        foundry.utils.mergeObject(undoEntry, targetData, { inplace: true });
        inProgress.allTargets.set(undoEntry.actorUuid, undoEntry);
      }
    }
    /* This replaces the use of midi-qol concentration data but I'm not sure it's needed
    //@ts-expect-error
    let actor = MQfromUuidSync(undoEntry.actorUuid);
    if (actor instanceof TokenDocument) actor = actor.actor;
    for (let effect of actor?.appliedEffects) {
      const dependents = effect.getDependents();
      for (let dependent of dependents) {
        let token;
        if (dependent instanceof ActiveEffect) dependent = dependent.parent;
        if (dependent instanceof Actor && dependent.isToken) token = dependent.token;
        else if (dependent instanceof Actor) token = dependent.getActiveTokens()[0];
        if (!token) continue;
        const targetData = createTargetData(token.uuid)
        if (targetData && !inProgress.allTargets.get(token.actor.uuid)) {
          inProgress.allTargets.set(token.actor.uuid, targetData)
        }
      }
    }
    */
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
  Hooks.callAll("midi-qol.addUndoEntry", data)
  if (queue.length > MAXUNDO) {
    log("Removed undoEntry due to overflow", queue.pop());
  }
}

export async function undoMostRecentWorkflow() {
  return untimedExecuteAsGM("undoMostRecentWorkflow")
}
export async function removeMostRecentWorkflow() {
  return untimedExecuteAsGM("removeMostRecentWorkflow")
}

export async function undoTillWorkflow(workflowId: string, undoTarget: boolean, removeWorkflow: boolean = false) {
  if (undoDataQueue.length === 0) return false;
  if (!undoDataQueue.find(ue => ue.id === workflowId)) return false;
  const queueLength = undoDataQueue.length;
  try {
    while (undoDataQueue.length > 0 && undoDataQueue[0].id !== workflowId) {
      await undoWorkflow(undoDataQueue.shift());
    }
    if (undoTarget) await undoWorkflow(undoDataQueue[0]);
    if (undoDataQueue.length > 0 && removeWorkflow) {
      const workflow = undoDataQueue.shift();
      // This should be unneeded as removing the chat card should trigger removal of the workflow
      socketlibSocket.executeAsUser("removeWorkflow", workflow.userId, workflow.id);
    }
  } finally {
    if (queueLength !== undoDataQueue.length) Hooks.callAll("midi-qol.removeUndoEntry");
  }
  return queueLength !== undoDataQueue.length;
}

export async function _undoMostRecentWorkflow() {
  if (undoDataQueue.length === 0) return false;
  let undoData;
  try {
    while (undoDataQueue.length > 0) {
      undoData = undoDataQueue.shift();
      if (undoData.isReaction) await undoWorkflow(undoData);
      else return undoWorkflow(undoData);
    }
  } finally {
    if (undoData) Hooks.callAll("midi-qol.removeUndoEntry", undoData);
  }
  return;
}

export async function _removeMostRecentWorkflow() {
  if (undoDataQueue.length === 0) return false;
  let undoData;
  try {
    while (undoDataQueue.length > 0) {
      undoData = undoDataQueue.shift();
      if (undoData.isReaction) continue;
      else return undoData;
    }
  } finally {
    if (undoData) Hooks.callAll("midi-qol.removeUndoEntry", undoData);
  }
  return;
}

export async function _removeChatCards(data: { chatCardUuids: string[] }) {
  // TODO see if this might be async and awaited
  if (!data.chatCardUuids) return;
  try {
    for (let uuid of data.chatCardUuids) {
      const card = await MQfromUuidSync(uuid);
      await removeChatCard(card);
    }
  } catch (err) {
    debugger;
  }
}

export function getRemoveUndoEffects(effectsData, actor): string[] {
  if (!effectsData) return []; // should only hapoen for unlinked unmodified
  const effectsToRemove = actor.effects.filter(effect => {
    return !effectsData.some(effectData => effect.id === effectData._id);
  }).map(effect => effect.id) ?? [];
  return effectsToRemove;
}

function getRemoveUndoItems(itemsData, actor): string[] {
  if (!itemsData) return []; // Should only happen for unchanged unlinked actors
  const itemsToRemove = actor.items.filter(item => {
    return !itemsData?.some(itemData => item.id === itemData._id);
  }).map(item => item.id);
  return itemsToRemove;
}

function getChanges(newData, savedData): any {
  if (!newData && !savedData) return {};
  delete newData.items;
  delete newData.effects;
  delete savedData.items;
  delete savedData.effects;

  const changes = foundry.utils.flattenObject(foundry.utils.diffObject(newData, savedData));
  const tempChanges = foundry.utils.flattenObject(foundry.utils.diffObject(savedData, newData));
  const toDelete = {};
  for (let key of Object.keys(tempChanges)) {
    if (!changes[key]) {
      let parts = key.split(".");
      parts[parts.length - 1] = "-=" + parts[parts.length - 1];
      let newKey = parts.join(".");
      toDelete[newKey] = null
    }
  }
  return foundry.utils.mergeObject(changes, toDelete);
}
async function undoSingleTokenActor({ tokenUuid, actorUuid, actorData, tokenData }) {
  let actor = MQfromUuidSync(actorUuid ?? "");
  if (actor instanceof TokenDocument) actor = actor.actor;
  const tokendoc = actor?.isToken ? actor.token : MQfromUuidSync(tokenUuid ?? "");
  if (!actor) return;
  let actorChanges;
  let tokenChanges;
  if (debugEnabled > 0) warn("undoSingleTokenActor | starting for ", actor.name);

  const removeItemsFunc = async () => {
    const itemsToRemove = getRemoveUndoItems(actorData.items ?? [], actor);
    if (itemsToRemove?.length > 0) await actor.deleteEmbeddedDocuments("Item", itemsToRemove, { isUndo: true });
    if (debugEnabled > 0) warn("undoSingleTokenActor | items to remove ", actor.name, itemsToRemove);
    // await busyWait(0.1);
  }
  if (dae.actionQueue) await dae.actionQueue.add(removeItemsFunc)
  else await removeItemsFunc();
  if (debugEnabled > 0) warn("undoSingleTokenActor |  removeItemFunc completed")

  if (debugEnabled > 0) warn("undoSingleTokenActor | about to remove effects")
  const removeEffectsFunc = async () => {
    const effectsToRemove = getRemoveUndoEffects(actorData.effects ?? [], actor);
    if (debugEnabled > 0) warn("undoSingleTokenActor |", effectsToRemove);
    if (effectsToRemove.length > 0) await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToRemove, { noConcentrationCheck: true, isUndo: true });
  }
  if (dae?.actionQueue) await dae.actionQueue.add(removeEffectsFunc)
  else await removeEffectsFunc();
  if (debugEnabled > 0) warn("undoSingleTokenActor | remove effects completed")

  const itemsToAdd = actorData?.items?.filter(itemData => /*!itemData.flags?.dae?.DAECreated && */ !actor.items.some(item => itemData._id === item.id));
  if (debugEnabled > 0) warn("undoSingleTokenActor | Items to add ", actor.name, itemsToAdd)
  if (itemsToAdd?.length > 0) {
    if (dae?.actionQueue) await dae.actionQueue.add(actor.createEmbeddedDocuments.bind(actor), "Item", itemsToAdd, { keepId: true, isUndo: true });
    else await actor?.createEmbeddedDocuments("Item", itemsToAdd, { keepId: true, isUndo: true });
    await busyWait(0.1);
  }
  let effectsToAdd = actorData?.effects?.filter(efData => !actor.effects.some(effect => efData._id === effect.id));
  effectsToAdd = effectsToAdd.filter(efData => !efData?.flags?.dae?.transfer);
  // revisit this for v11 and effects not transferred

  if (debugEnabled > 0) warn("undoSingleTokenActor | Effects to add ", actor.name, effectsToAdd);
  if (effectsToAdd?.length > 0) {
    if (dae?.actionQueue) dae.actionQueue.add(async () => {
      effectsToAdd = effectsToAdd.filter(efId => !actor.effects.some(effect => effect.id === efId))
      if (debugEnabled > 0) warn("undoSingleTokenActor | Effects to add are ", effectsToAdd, actor.name);
      await actor.createEmbeddedDocuments("ActiveEffect", effectsToAdd, { keepId: true, isUndo: true })
    });
    else await actor.createEmbeddedDocuments("ActiveEffect", effectsToAdd, { keepId: true, isUndo: true });
  }

  // older versions of effect macro will throw an error when multiple items are updated.
  //@ts-expect-error .version
  if (game.modules.get("effectmacro")?.active && foundry.utils.isNewerVersion("12.0.1", game.modules.get("effectmacro")?.version)) {
    for (let itemData of actorData.items) {
      await actor.updateEmbeddedDocuments("Item", [itemData], { keepId: true, isUndo: true });
    }
  } else {
    if (dae?.actionQueue) await dae.actionQueue.add(actor.updateEmbeddedDocuments.bind(actor), "Item", actorData.items, { keepId: true, isUndo: true });
    else await actor.updateEmbeddedDocuments("Item", actorData.items, { keepId: true, isUndo: true });
  }
  if (actorData.effects?.length > 0) {
    if (dae?.actionQueue) await dae.actionQueue.add(actor.updateEmbeddedDocuments.bind(actor), "ActiveEffect", actorData.effects, { keepId: true, isUndo: true });
    else await actor.updateEmbeddedDocuments("ActiveEffect", actorData.effects, { keepId: true, isUndo: true });
  }


  actorChanges = actorData ? getChanges(actor.toObject(true), actorData) : {};
  if (debugEnabled > 0) warn("undoSingleTokenActor | Actor data ", actor.name, actorData, actorChanges);
  if (!foundry.utils.isEmpty(actorChanges)) {
    delete actorChanges.items;
    delete actorChanges.effects;
    await actor.update(actorChanges, { noConcentrationCheck: true })
  }
  if (tokendoc) {
    tokenChanges = tokenData ? getChanges(tokendoc.toObject(true), tokenData) : {};
    delete tokenChanges.actorData;
    delete tokenChanges.delta;
    if (!foundry.utils.isEmpty(tokenChanges)) {
      await tokendoc.update(tokenChanges, { noConcentrationCheck: true })
    }
  }
}

export async function removeChatCard(chatCard: ChatMessage | undefined) {
  if (!chatCard || !chatCard.content) return;
  const shouldDelete = configSettings.undoChatColor === "Delete";
  if (shouldDelete) {
    if (debugEnabled > 1) debug("Deleting chat card ", chatCard.id, chatCard.uuid);
    return await chatCard.delete();
  }
  return await chatCard.update({ content: `<div style="background-color: ${configSettings.undoChatColor};"> ${chatCard.content}</div>` });
}

export async function undoWorkflow(undoData: any) {
  log(`Undoing workflow for Player ${undoData.userName} Token: ${undoData.actorEntry.actorData.name} Item: ${undoData.itemName ?? ""}`)
  for (let templateUuid of undoData.templateUuids)
    await MQfromUuidSync(templateUuid)?.delete();
  if (globalThis.Sequencer && undoData.sequencerUuid) await globalThis.Sequencer.EffectManager.endEffects({ origin: undoData.sequencerUuid })

  for (let undoEntry of undoData.allTargets) {
    log("undoing target ", undoEntry.actorData?.name ?? undoEntry.tokenData?.name, undoEntry)
    await undoSingleTokenActor(undoEntry)
  };
  await undoSingleTokenActor(undoData.actorEntry);
  const shouldDelete = false;
  // delete cards...
  if (undoData.itemCardUuid) {
    const message = MQfromUuidSync(undoData.itemCardUuid);
    await removeChatCard(message);
  }
  // if (undoData.itemCardId) await removeChatCard(game.messages?.get(undoData.itemCardId));
  await _removeChatCards({ chatCardUuids: undoData.chatCardUuids });
}