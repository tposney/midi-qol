
import { debug, debugEnabled, error, log, warn, busyWait, MODULE_ID } from "../midi-qol.js";
import { socketlibSocket, unTimedExecuteAsGM } from "./GMAction.js";
import { configSettings } from "./settings.js";
import { getConcentrationEffect, getTokenDocument, isReactionItem } from "./utils.js";
import { UndoData, Workflow } from "./Workflow.js";
import { messagesFrom } from "./lib/cardState.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";

export let undoDataQueue: UndoData[] = [];
let startedUndoDataQueue: UndoData[] = [];
const MAXUNDO = 15;
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
    actorEntry: { actorUuid: undoDataDef.actorUuid, tokenUuid: undoDataDef.tokendocUuid, actorData: snapshotActor(actor), tokenData: snapshotToken(tokenDoc) },
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
  // Undo is by card: a use has its card by now
  if (!configSettings.undoWorkflow || !workflow.id) return true;
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

/**
 * Each actor's items and effects as last snapshotted: an unchanged one is shared by the next snapshot rather than
 * copied, so a fight's entries hold each actor's items about once.
 */
const lastSnapshots = new Map<string, { items: Map<string, Item.Source>, effects: Map<string, ActiveEffect.Source> }>();

/** The actor's source for undo; items and effects unchanged since its last snapshot are that snapshot's (shared, never mutated). */
function snapshotActor(actor: Actor.Implementation | null | undefined): Actor.Source | undefined {
  if (!actor) return undefined;
  const data = actor.toObject(true) as Actor.Source;
  const previous = lastSnapshots.get(actor.uuid);
  const share = <T extends { _id?: string | null }>(sources: T[], last?: Map<string, T>) => sources.map(source => {
    const earlier = last?.get(source._id ?? "");
    return earlier && foundry.utils.objectsEqual(earlier, source) ? earlier : source;
  });
  data.items = share(data.items as Item.Source[], previous?.items) as typeof data.items;
  data.effects = share(data.effects as ActiveEffect.Source[], previous?.effects) as typeof data.effects;
  lastSnapshots.set(actor.uuid, {
    items: new Map((data.items as Item.Source[]).map(item => [item._id ?? "", item])),
    effects: new Map((data.effects as ActiveEffect.Source[]).map(effect => [effect._id ?? "", effect]))
  });
  return data;
}

/** The token's source for undo, without its actor delta (the actor's own snapshot restores that). */
function snapshotToken(tokenDoc: TokenDocument.Implementation | null | undefined): TokenDocument.Source | undefined {
  const data = tokenDoc?.toObject(true) as (TokenDocument.Source & { actorData?: unknown }) | undefined;
  if (!data) return undefined;
  delete (data as Partial<TokenDocument.Source>).delta;
  delete data.actorData;
  return data;
}

export function createTargetData(tokenUuid: string) {
  if (!tokenUuid) return undefined;
  const tokenDoc = fromUuidSync(tokenUuid) as TokenDocument.Implementation | undefined;
  if (!tokenDoc) {
    error("undo | createTargetData could not fetch token document for ", tokenUuid);
    return undefined;
  }
  const targetData = { tokenUuid, actorUuid: tokenDoc.actor?.uuid ?? "", actorData: snapshotActor(tokenDoc.actor), tokenData: snapshotToken(tokenDoc) };
  return targetData;
}

// Called to save snapshots of workflow actor/token data
export function startUndoWorkflow(undoData: UndoData): boolean {
  if (!configSettings.undoWorkflow) return true;
  let actor = fromUuidSync(undoData.actorUuid) as Actor.Implementation | TokenDocument.Implementation | null | undefined;
  if (actor instanceof TokenDocument) actor = actor.actor;
  const actorData = snapshotActor(actor);
  const tokenData = snapshotToken(actor?.isToken ? actor.token : fromUuidSync(undoData.tokendocUuid ?? "") as TokenDocument.Implementation | undefined);
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
  undoData.startedAt = Date.now();
  addQueueEntry(startedUndoDataQueue, undoData);
  return true;
}

/**
 * Record messages a use produced that aren't linked to its card (another module's rolls, a re-posted card), on its undo
 * entry (`id`, the workflow's id; none: the most recent entry). Messages linked to the card are found when undoing.
 */
export function addUndoChatCards(data: { id?: string, chatCardUuids: string[] }) {
  if (!configSettings.undoWorkflow) return;
  const entry = data.id
    ? undoDataQueue.find(undoEntry => undoEntry.id === data.id) ?? startedUndoDataQueue.find(undoEntry => undoEntry.id === data.id)
    : undoDataQueue[0];
  if (!entry) {
    warn("addUndoChatCards | no undo entry for ", data);
    return;
  }
  entry.chatCardUuids = [...new Set([...(entry.chatCardUuids ?? []), ...data.chatCardUuids])];
}

// Called after preamblecomplete so save references to all targets
// This is a bit convoluted since we don't want to pass massive data elements over the wire.
// The total data for an undo entry can be measred in megabytes, so just pass uuids to the gm client and they can look up the tokens/actors
export async function saveTargetsUndoData(workflow: Workflow) {
  if (!workflow.undoData) return;
  workflow.undoData.targets = [];
  workflow.targets.documents.forEach(t => {
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

/** A message for the most recent undo entry to remove (API). Messages linked to the use's card need not be added. */
export async function addUndoChatMessage(message: ChatMessage.Implementation) {
  if (message instanceof Promise) message = await message;
  if (configSettings.undoWorkflow && message?.uuid) unTimedExecuteAsGM("addUndoChatCards", { chatCardUuids: [message.uuid] });
}

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
  // This entry, and any started long ago whose use never finished (aborted before its targets were saved).
  const stale = Date.now() - 10 * 60 * 1000;
  startedUndoDataQueue = startedUndoDataQueue.filter(undoData => undoData.id !== data.id && (undoData.startedAt ?? 0) > stale);

  data.targets?.forEach(undoEntry => {
    if (!inProgress.allTargets?.get(undoEntry.actorUuid ?? "")) {
      const targetData = createTargetData(undoEntry.tokenUuid)
      // Not mergeObject: it copies nested objects, losing the snapshot's shared items and effects.
      if (targetData) inProgress.allTargets?.set(undoEntry.actorUuid!, { ...undoEntry, ...targetData });
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

/** A card and every message linked to it (`system.origin`), recursively. */
function linkedMessages(card: ChatMessage.Implementation): ChatMessage.Implementation[] {
  const found = new Map<string, ChatMessage.Implementation>([[card.id!, card]]);
  const pending = [card.id!];
  while (pending.length) {
    const id = pending.shift()!;
    for (const message of messagesFrom(id)) {
      if (found.has(message.id!)) continue;
      found.set(message.id!, message);
      pending.push(message.id!);
    }
  }
  return [...found.values()];
}

/** Delete the messages (*Undo chat colour* Delete), or mark them undone, in one operation. */
async function removeChatCards(messages: ChatMessage.Implementation[]) {
  const ids = messages.map(message => message.id!).filter(id => game.messages?.has(id));
  if (!ids.length) return;
  try {
    if (configSettings.undoChatColor === "Delete") await ChatMessage.deleteDocuments(ids);
    else await ChatMessage.updateDocuments(ids.map(_id => ({ _id, [`flags.${MODULE_ID}.undone`]: true })));
  } catch (err) {
    error("undo | removing chat cards", err);
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
      toDelete[key] = new foundry.data.operators.ForcedDeletion();
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
    // @ts-expect-error extra option silliness
    if (globalThis.DAE?.actionQueue) await globalThis.DAE.actionQueue.add(actor.createEmbeddedDocuments.bind(actor), "Item", foundry.utils.deepClone(itemsToAdd), { keepId: true, isUndo: true });
    // @ts-expect-error extra option silliness
    else await actor?.createEmbeddedDocuments("Item", foundry.utils.deepClone(itemsToAdd), { keepId: true, isUndo: true });
    await busyWait(100);
  }
  let effectsToAdd = actorData?.effects?.filter(efData => !actor.effects.some(effect => efData._id === effect.id));
  effectsToAdd = effectsToAdd?.filter(efData => !efData?.flags?.dae?.transfer) ?? [];
  // revisit this for v11 and effects not transferred

  if (debugEnabled > 0) warn("undoSingleTokenActor | Effects to add ", actor.name, effectsToAdd);
  if (effectsToAdd?.length > 0) {
    if (globalThis.DAE?.actionQueue) await globalThis.DAE.actionQueue.add(async () => {
      effectsToAdd = effectsToAdd?.filter(eff => !actor.effects.some(effect => effect.id === eff._id!));
      if (debugEnabled > 0) warn("undoSingleTokenActor | Effects to add are ", effectsToAdd, actor.name);
      // @ts-expect-error extra option silliness
      await actor.createEmbeddedDocuments("ActiveEffect", foundry.utils.deepClone(effectsToAdd), { keepId: true, isUndo: true })
    });
    // @ts-expect-error extra option silliness
    else await actor.createEmbeddedDocuments("ActiveEffect", foundry.utils.deepClone(effectsToAdd), { keepId: true, isUndo: true });
  }

  // Only the items and effects that changed since the snapshot, and only what changed in them.
  const changedSince = (collection: { get(id: string): { toObject(source: boolean): object } | undefined }, saved: { _id?: string | null }[] = []) =>
    saved.flatMap(source => {
      const current = collection.get(source._id ?? "");
      if (!current) return [];
      const difference = foundry.utils.diffObject(current.toObject(true), source);
      return foundry.utils.isEmpty(difference) ? [] : [{ ...difference, _id: source._id }];
    });
  const itemUpdates = changedSince(actor.items, actorData?.items as Item.Source[] | undefined);
  if (itemUpdates.length) {
    // @ts-expect-error extra option silliness
    if (globalThis.DAE?.actionQueue) await globalThis.DAE.actionQueue.add(actor.updateEmbeddedDocuments.bind(actor), "Item", itemUpdates, { keepId: true, isUndo: true });
    // @ts-expect-error extra option silliness
    else await actor.updateEmbeddedDocuments("Item", itemUpdates, { keepId: true, isUndo: true });
  }
  const effectUpdates = changedSince(actor.effects, actorData?.effects as ActiveEffect.Source[] | undefined);
  if (effectUpdates.length) {
    // @ts-expect-error extra option silliness
    if (globalThis.DAE?.actionQueue) await globalThis.DAE.actionQueue.add(actor.updateEmbeddedDocuments.bind(actor), "ActiveEffect", effectUpdates, { keepId: true, isUndo: true });
    // @ts-expect-error extra option silliness
    else await actor.updateEmbeddedDocuments("ActiveEffect", effectUpdates, { keepId: true, isUndo: true });
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
    // Without the actor delta on either side: the snapshot has none, and the actor restore above covers it. (Changes are
    // flattened, so deleting `delta` from them afterwards never removed its keys.)
    tokenChanges = tokenData ? getChanges(snapshotToken(tokenDoc), tokenData) : {};
    if (!foundry.utils.isEmpty(tokenChanges)) {
      // @ts-expect-error extra option silliness
      await tokenDoc.update(tokenChanges, { noConcentrationCheck: true })
    }
  }
}

/** Delete a card, or mark it undone: shown when drawn (midi-qol-undone, coloured from the setting), its content untouched. */
export async function removeChatCard(chatCard?: ChatMessage.Implementation) {
  if (chatCard) await removeChatCards([chatCard]);
}

/**
 * dnd5e spends the slot, uses and resources inside Activity#use, before the card exists, so midi's snapshot already has
 * them spent: refund what the card records as consumed, as its Refund button does. midi begins and ends concentration
 * after the snapshot (deferredConcentration), which the restore undoes; a transform to a form begins it inside
 * Activity#use, so the concentration the card records is ended here too.
 */
async function refundUse(card: ChatMessage.Implementation) {
  // @ts-expect-error no dnd5e-types
  const activity = card.getAssociatedActivity?.();
  // @ts-expect-error no dnd5e-types
  const { deltas, concentration } = card.system ?? {};
  try {
    if (deltas && activity?.refund) {
      await activity.refund(deltas);
      // An undo that marks the card (not deletes it) must not leave its Refund button able to refund again
      // @ts-expect-error no dnd5e-types
      await card.update({ "system.deltas": null });
    }
    if (concentration) await activity?.actor?.effects.get(concentration)?.delete();
  } catch (err) {
    TroubleShooter.recordError(err, "undo refund");
    error("undo | refunding the use failed", err);
  }
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
  const card = undoData.itemCardUuid ? fromUuidSync(undoData.itemCardUuid, { strict: false }) : undefined;
  if (card instanceof ChatMessage) await refundUse(card);
  // The use's card and everything linked to it (saves, damage cards, notes, uses made from it), and anything recorded
  // that isn't linked.
  const messages = new Map<string, ChatMessage.Implementation>();
  if (card instanceof ChatMessage) for (const message of linkedMessages(card)) messages.set(message.id!, message);
  for (const uuid of undoData.chatCardUuids ?? []) {
    const message = fromUuidSync(uuid, { strict: false });
    if (message instanceof ChatMessage) messages.set(message.id!, message);
  }
  await removeChatCards([...messages.values()]);
}