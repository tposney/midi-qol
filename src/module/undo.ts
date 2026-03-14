
import { debug, debugEnabled, error, log, warn, busyWait} from "../midi-qol.js";
import { socketlibSocket, unTimedExecuteAsGM } from "./GMAction.js";
import { configSettings } from "./settings.js";
import { getConcentrationEffect, getTokenDocument, isReactionItem } from "./utils.js";
import { UndoData, Workflow } from "./Workflow.js";

export let undoDataQueue: UndoData[] = [];
let startedUndoDataQueue: UndoData[] = [];
const MAXUNDO = 15;
interface undoTokenActorEntry {
  actorUuid: string;
  tokenUuid: string | undefined,
  actorData: any;
  tokenData: any;
}
interface UndoDataDirect {
  id: string;
  userId: string;
  userName: string;
  itemName: string;
  itemUuid: string;
  actorUuid: string;
  actorName: string;
  isReaction: boolean;
  tokendocUuid?: string;
  chatCardUuids?: string[];
  templateUuids?: string[];
  sequencerUuid?: string;
  itemCardUuid?: string;
  targets?: { actorUuid: string; tokenUuid: string;  }[];
}

export function queueUndoDataDirect(undoDataDef: UndoDataDirect) {
  if (!configSettings.undoWorkflow) return;
  unTimedExecuteAsGM("queueUndoDataDirect", undoDataDef);
}
export function _queueUndoDataDirect(undoDataDef: UndoDataDirect) {
  if (!configSettings.undoWorkflow) return;
  const tokenDoc = fromUuidSync(undoDataDef.tokendocUuid) as TokenDocument.Implementation | undefined;
  const actor = fromUuidSync(undoDataDef.actorUuid) as Actor.Implementation | undefined;
  if (!actor) return;
  const undoData: UndoData = {
    id: undoDataDef.id ?? foundry.utils.randomID(),
    actorUuid: undoDataDef.actorUuid,
    actorEntry: { actorUuid: undoDataDef.actorUuid, tokenUuid: undoDataDef.tokendocUuid, actorData: actor?.toObject(true), tokenData: tokenDoc?.toObject(true) },
    chatCardUuids: undoDataDef.chatCardUuids ?? [],
    itemCardUuid: undoDataDef.itemCardUuid,
    actorName: actor.name,
    itemName: undoDataDef.itemName,
    userName: undoDataDef.userName,
    allTargets: new Collection(),
    serverTime: game.time?.serverTime,
    templateUuids: undoDataDef.templateUuids ?? [],
    isReaction: undoDataDef.isReaction,
  };

  for (let undoEntry of undoDataDef.targets ?? []) {
    let { actorUuid, tokenUuid } = undoEntry;
    const targetData = createTargetData(tokenUuid);
    if (targetData) {
      // TODO: Verify this works
      undoData.allTargets?.set(actorUuid, targetData);
    }
  }
  addQueueEntry(undoDataQueue, undoData);
}
// Called by workflow to start a new undoWorkflow entry
export async function saveUndoData(workflow: Workflow): Promise<boolean> {
  if (!configSettings.undoWorkflow) return true;
  workflow.undoData = {
    id: workflow.id,
    userId: game.user?.id,
    itemName: workflow.item.name,
    itemUuid: workflow.item.uuid,
    userName: game.user?.name,
    tokendocUuid: workflow.token?.document.uuid,
    actorUuid: workflow.actor.uuid,
    actorName: workflow.actor.name,
    chatCardUuids: [],
    isReaction: workflow.workflowOptions?.isReaction || isReactionItem(workflow.item),
    templateUuids: [],
    sequencerUuid: workflow.item.uuid,
  };
  if (!await unTimedExecuteAsGM("startUndoWorkflow", workflow.undoData)) {
    error("Could not startUndoWorkflow");
    return false;
  }
  return true;
}

export function createTargetData(tokenUuid: string) {
  if (!tokenUuid) return undefined;
  const tokenDoc = fromUuidSync(tokenUuid) as TokenDocument.Implementation | undefined;
  if (!tokenDoc) {
    error("undo | createTargetData could not fetch token document for ", tokenUuid);
    return undefined;
  }
  const targetData = { tokenUuid, actorUuid: tokenDoc.actor?.uuid ?? "", actorData: tokenDoc.actor?.toObject(true), tokenData: tokenDoc.toObject(true) };
  return targetData;
}

// Called to save snapshots of workflow actor/token data
export function startUndoWorkflow(undoData: UndoData): boolean {
  if (!configSettings.undoWorkflow) return true;
  let actor = fromUuidSync(undoData.actorUuid) as Actor.Implementation | TokenDocument.Implementation | null | undefined;
  if (actor instanceof TokenDocument) actor = actor.actor;
  const actorData = actor?.toObject(true);
  const tokenData = actor?.isToken ? actor.token!.toObject(true) : (fromUuidSync(undoData.tokendocUuid ?? "") as TokenDocument.Implementation)?.toObject(true);
  undoData.actorEntry = { actorUuid: undoData.actorUuid, tokenUuid: undoData.tokendocUuid, actorData, tokenData };
  undoData.allTargets = new Collection(); // every token referenced by the workflow
  const concentrationEffect = getConcentrationEffect(actor, undoData.itemUuid);
  if (concentrationEffect) {
    // @ts-expect-error no dnd5e-types
    for (let dependent of concentrationEffect.getDependents()) {
      let token: TokenDocument.Implementation | null | undefined;
      if (dependent instanceof ActiveEffect) dependent = dependent.parent;
      if (dependent instanceof Actor && dependent.isToken) token = dependent.token;
      else if (dependent instanceof Actor) token = dependent.getActiveTokens(false, true)[0];
      if (!token) continue;
      const targetData = createTargetData(token.uuid);
      if (targetData) undoData.allTargets.set(dependent.uuid, targetData);
    }
  }
  addQueueEntry(startedUndoDataQueue, undoData);
  return true;
}

export function updateUndoChatCardUuidsById(data: { id: string, chatCardUuids: string[] }) {
  if (!configSettings.undoWorkflow) return;
  const currentUndo = undoDataQueue.find(undoEntry => undoEntry.id === data.id);
  if (!currentUndo) {
    console.warn("midi-qol | updateUndoChatCardUuidsById | Could not find existing entry for ", data);
    return;
  }
  currentUndo.chatCardUuids = data.chatCardUuids;
}
export function updateUndoChatCardUuids(data: UndoData) {
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
  if (!workflow.undoData) return;
  workflow.undoData.targets = [];
  workflow.targets.forEach(t => {
    let tokenDoc = getTokenDocument(t);
    if (!tokenDoc) return;
    if ((tokenDoc?.actor)?.uuid === workflow.actor.uuid) return;
    workflow.undoData!.targets!.push({ tokenUuid: tokenDoc?.uuid, actorUuid: (tokenDoc?.actor)?.uuid ?? "" });
  });
  workflow.undoData.serverTime = game.time?.serverTime;
  workflow.undoData.itemCardUuid = workflow.itemCardUuid;
  for (const tUuid of workflow.templateUuids) {
    if (tUuid) workflow.undoData.templateUuids.push(tUuid);
  }
  return unTimedExecuteAsGM("queueUndoData", workflow.undoData)
}

export async function addUndoChatMessage(message: ChatMessage.Implementation) {
  const currentUndo = undoDataQueue[0];
  if (message instanceof Promise) message = await message;
  if (configSettings.undoWorkflow && currentUndo && !currentUndo.chatCardUuids.some(uuid => uuid === message.uuid)) {
    // Assumes workflow.undoData.chatCardUuids has been initialised
    currentUndo.chatCardUuids = currentUndo.chatCardUuids.concat([message.uuid]);
    unTimedExecuteAsGM("updateUndoChatCardUuids", currentUndo);
  }
}
Hooks.on("createChatMessage", (message, data, user) => {
  if (!configSettings.undoWorkflow) return;
  if ((undoDataQueue ?? []).length < 1) return;
  const currentUndo = undoDataQueue[0];
  const speaker = message.speaker;
  // if (currentUndo.userId !== user) return;
  if (speaker.token) {
    const tokenUuid = `Scene.${speaker.scene}.Token.${speaker.token}`;
    if (currentUndo.allTargets?.has(tokenUuid)) currentUndo.chatCardUuids.push(message.uuid);
  } else if (speaker.actor) {
    const actorUuid = `Actor.${speaker.actor}`;
    if (currentUndo.allTargets?.has(actorUuid)) currentUndo.chatCardUuids.push(message.uuid);
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

export function queueUndoData(data: UndoData): boolean {
  let inProgress = startedUndoDataQueue.find(undoData => undoData.userId === data.userId && undoData.id === data.id);
  if (!inProgress) {
    error("Could not find started undo entry for ", data.userId, data.id);
    return false;
  };
  inProgress = foundry.utils.mergeObject(inProgress, data, { overwrite: false });
  startedUndoDataQueue = startedUndoDataQueue.filter(undoData => undoData.userId !== data.userId || undoData.itemUuid !== data.itemUuid);

  data.targets?.forEach(undoEntry => {
    if (!inProgress.allTargets?.get(undoEntry.actorUuid ?? "")) {
      const targetData = createTargetData(undoEntry.tokenUuid)
      if (targetData) {
        foundry.utils.mergeObject(undoEntry, targetData, { inplace: true });
        inProgress.allTargets?.set(undoEntry.actorUuid!, undoEntry);
      }
    }
    /* This replaces the use of midi-qol concentration data but I'm not sure it's needed
    //@ts-expect-error
    let actor = fromUuidSync(undoEntry.actorUuid);
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

export function addQueueEntry(queue: UndoData[], data: UndoData) {
  // add the item
  let added = false;
  for (let i = 0; i < queue.length; i++) {
    if ((data.serverTime ?? 0) > (queue[i].serverTime ?? 0)) {
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
  return unTimedExecuteAsGM("undoMostRecentWorkflow")
}
export async function removeMostRecentWorkflow() {
  return unTimedExecuteAsGM("removeMostRecentWorkflow")
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
      const undoData = undoDataQueue.shift();
      if (undoData) {
        // This should be unneeded as removing the chat card should trigger removal of the workflow
        socketlibSocket.executeAsUser("removeWorkflow", undoData.userId, undoData.id);
      }
    }
  } finally {
    if (queueLength !== undoDataQueue.length) Hooks.callAll("midi-qol.removeUndoEntry");
  }
  return queueLength !== undoDataQueue.length;
}

export async function _undoMostRecentWorkflow() {
  if (undoDataQueue.length === 0) return false;
  let undoData: UndoData | undefined;
  try {
    while (undoDataQueue.length > 0) {
      undoData = undoDataQueue.shift();
      if (undoData?.isReaction) await undoWorkflow(undoData);
      else return undoWorkflow(undoData);
    }
  } finally {
    if (undoData) Hooks.callAll("midi-qol.removeUndoEntry", undoData);
  }
  return;
}

export async function _removeMostRecentWorkflow() {
  if (undoDataQueue.length === 0) return false;
  let undoData: UndoData | undefined;
  try {
    while (undoDataQueue.length > 0) {
      undoData = undoDataQueue.shift();
      if (undoData?.isReaction) continue;
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
      const card = fromUuidSync(uuid) as ChatMessage.Implementation | undefined;
      await removeChatCard(card);
    }
  } catch (err) {
    error(err);
    // debugger;
  }
}

export function getRemoveUndoEffects(effectsData: ActiveEffect.Source[], actor: Actor.Implementation): string[] {
  if (!effectsData) return []; // should only hapoen for unlinked unmodified
  const effectsToRemove = actor.effects.filter(effect => {
    return !effectsData.some(effectData => effect.id === effectData._id);
  }).map(effect => effect.id!) ?? [];
  return effectsToRemove;
}

function getRemoveUndoItems(itemsData: Item.Source[], actor: Actor.Implementation): string[] {
  if (!itemsData) return []; // Should only happen for unchanged unlinked actors
  const itemsToRemove = actor.items.filter(item => {
    return !itemsData?.some(itemData => item.id === itemData._id);
  }).map(item => item.id!);
  return itemsToRemove;
}

function getChanges(newData?: Actor.Source | TokenDocument.Source, savedData?: Actor.Source | TokenDocument.Source): Partial<Actor.Source | TokenDocument.Source> {
  if (!newData && !savedData) return {};
  if (newData) {
    delete (newData as Partial<Actor.Source>).items;
    delete (newData as Partial<Actor.Source>).effects;
  }
  if (savedData) {
    delete (savedData as Partial<Actor.Source>).items;
    delete (savedData as Partial<Actor.Source>).effects;
  }

  const changes = foundry.utils.flattenObject(foundry.utils.diffObject(newData ?? {}, savedData ?? {}));
  const tempChanges = foundry.utils.flattenObject(foundry.utils.diffObject(savedData ?? {}, newData ?? {}));
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
async function undoSingleTokenActor({ tokenUuid, actorUuid, actorData, tokenData }: { tokenUuid?: string; actorUuid?: string; actorData?: Actor.Source, tokenData?: TokenDocument.Source}) {
  let actor = fromUuidSync(actorUuid ?? "") as Actor.Implementation | TokenDocument.Implementation | undefined | null;
  if (actor instanceof TokenDocument) actor = actor.actor;
  const tokenDoc = actor?.isToken ? actor.token : fromUuidSync(tokenUuid ?? "") as TokenDocument.Implementation | undefined;
  if (!actor) return;
  let actorChanges: Partial<Actor.Source> | undefined;
  let tokenChanges: Partial<TokenDocument.Source> | undefined;
  if (debugEnabled > 0) warn("undoSingleTokenActor | starting for ", actor.name);

  const removeItemsFunc = async () => {
    const itemsToRemove = getRemoveUndoItems(actorData?.items ?? [], actor);
    // @ts-expect-error extra option silliness
    if (itemsToRemove?.length > 0) await actor.deleteEmbeddedDocuments("Item", itemsToRemove, { isUndo: true });
    if (debugEnabled > 0) warn("undoSingleTokenActor | items to remove ", actor.name, itemsToRemove);
    // await busyWait(100);
  }
  if (globalThis.DAE.actionQueue) await globalThis.DAE.actionQueue.add(removeItemsFunc)
  else await removeItemsFunc();
  if (debugEnabled > 0) warn("undoSingleTokenActor |  removeItemFunc completed")

  if (debugEnabled > 0) warn("undoSingleTokenActor | about to remove effects")
  const removeEffectsFunc = async () => {
    const effectsToRemove = getRemoveUndoEffects(actorData?.effects ?? [], actor);
    if (debugEnabled > 0) warn("undoSingleTokenActor |", effectsToRemove);
    // @ts-expect-error extra option silliness
    if (effectsToRemove.length > 0) await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToRemove, { noConcentrationCheck: true, isUndo: true });
  }
  if (globalThis.DAE?.actionQueue) await globalThis.DAE.actionQueue.add(removeEffectsFunc)
  else await removeEffectsFunc();
  if (debugEnabled > 0) warn("undoSingleTokenActor | remove effects completed")

  const itemsToAdd = actorData?.items?.filter(itemData => /*!itemData.flags?.dae?.DAECreated && */ !actor.items.some(item => itemData._id === item.id));
  if (debugEnabled > 0) warn("undoSingleTokenActor | Items to add ", actor.name, itemsToAdd)
  if ((itemsToAdd?.length ?? 0) > 0) {
    if (globalThis.DAE?.actionQueue) await globalThis.DAE.actionQueue.add(actor.createEmbeddedDocuments.bind(actor), "Item", itemsToAdd, { keepId: true, isUndo: true });
    // @ts-expect-error extra option silliness
    else await actor?.createEmbeddedDocuments("Item", itemsToAdd, { keepId: true, isUndo: true });
    await busyWait(100);
  }
  let effectsToAdd = actorData?.effects?.filter(efData => !actor.effects.some(effect => efData._id === effect.id));
  effectsToAdd = effectsToAdd?.filter(efData => !efData?.flags?.dae?.transfer) ?? [];
  // revisit this for v11 and effects not transferred

  if (debugEnabled > 0) warn("undoSingleTokenActor | Effects to add ", actor.name, effectsToAdd);
  if (effectsToAdd?.length > 0) {
    if (globalThis.DAE?.actionQueue) globalThis.DAE.actionQueue.add(async () => {
      effectsToAdd = effectsToAdd?.filter(eff => !actor.effects.some(effect => effect.id === eff._id!));
      if (debugEnabled > 0) warn("undoSingleTokenActor | Effects to add are ", effectsToAdd, actor.name);
      // @ts-expect-error extra option silliness
      await actor.createEmbeddedDocuments("ActiveEffect", effectsToAdd, { keepId: true, isUndo: true })
    });
    // @ts-expect-error extra option silliness
    else await actor.createEmbeddedDocuments("ActiveEffect", effectsToAdd, { keepId: true, isUndo: true });
  }

  if (actorData && globalThis.DAE?.actionQueue) await globalThis.DAE.actionQueue.add(actor.updateEmbeddedDocuments.bind(actor), "Item", actorData.items, { keepId: true, isUndo: true });
  // @ts-expect-error extra option silliness
  else if (actorData) await actor.updateEmbeddedDocuments("Item", actorData.items, { keepId: true, isUndo: true });
  if ((actorData?.effects?.length ?? 0) > 0) {
    if (globalThis.DAE?.actionQueue) await globalThis.DAE.actionQueue.add(actor.updateEmbeddedDocuments.bind(actor), "ActiveEffect", actorData!.effects, { keepId: true, isUndo: true });
    // @ts-expect-error extra option silliness
    else await actor.updateEmbeddedDocuments("ActiveEffect", actorData!.effects, { keepId: true, isUndo: true });
  }

  actorChanges = actorData ? getChanges(actor.toObject(true), actorData) : {};
  if (debugEnabled > 0) warn("undoSingleTokenActor | Actor data ", actor.name, actorData, actorChanges);
  if (!foundry.utils.isEmpty(actorChanges)) {
    delete actorChanges.items;
    delete actorChanges.effects;
    // @ts-expect-error extra option silliness
    await actor.update(actorChanges, { noConcentrationCheck: true })
  }
  if (tokenDoc) {
    tokenChanges = tokenData ? getChanges(tokenDoc.toObject(true), tokenData) : {};
    // @ts-expect-error pretty sure this doesn't exist but idk
    delete tokenChanges.actorData;
    delete tokenChanges.delta;
    if (!foundry.utils.isEmpty(tokenChanges)) {
      // @ts-expect-error extra option silliness
      await tokenDoc.update(tokenChanges, { noConcentrationCheck: true })
    }
  }
}

export async function removeChatCard(chatCard?: ChatMessage.Implementation): Promise<ChatMessage.Implementation | undefined> {
  if (!chatCard || !chatCard.content) return;
  const shouldDelete = configSettings.undoChatColor === "Delete";
  if (shouldDelete) {
    if (debugEnabled > 1) debug("Deleting chat card ", chatCard.id, chatCard.uuid);
    return await chatCard.delete();
  }
  return await chatCard.update({ content: `<div style="background-color: ${configSettings.undoChatColor};"> ${chatCard.content}</div>` });
}

export async function undoWorkflow(undoData?: UndoData) {
  if (!undoData) return;
  log(`Undoing workflow for Player ${undoData.userName} Token: ${undoData.actorEntry?.actorData?.name} Item: ${undoData.itemName ?? ""}`)
  for (let templateUuid of undoData.templateUuids)
    await (fromUuidSync(templateUuid) as MeasuredTemplateDocument.Implementation | undefined)?.delete();
  if (globalThis.Sequencer && undoData.sequencerUuid) await globalThis.Sequencer.EffectManager.endEffects({ origin: undoData.sequencerUuid })

  for (let undoEntry of undoData?.allTargets ?? []) {
    log("undoing target ", undoEntry.actorData?.name ?? undoEntry.tokenData?.name, undoEntry)
    await undoSingleTokenActor(undoEntry)
  };
  if (undoData.actorEntry) await undoSingleTokenActor(undoData.actorEntry);
  const shouldDelete = false;
  // delete cards...
  if (undoData.itemCardUuid) {
    const message = fromUuidSync(undoData.itemCardUuid) as ChatMessage.Implementation | undefined;
    await removeChatCard(message);
  }
  await _removeChatCards({ chatCardUuids: undoData.chatCardUuids });
}