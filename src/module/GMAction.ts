import { configSettings } from "./settings.js";
import { i18n, log, warn, gameStats, getCanvas, error, debugEnabled, debugCallTiming, geti18nOptions } from "../midi-qol.js";
import { completeItemUse, MQfromActorUuid, MQfromUuid, promptReactions } from "./utils.js";
import { ddbglPendingFired } from "./chatMesssageHandling.js";
import { Workflow, WORKFLOWSTATES } from "./workflow.js";
import { bonusCheck } from "./patching.js";

export var socketlibSocket: any = undefined;
var traitList = { di: {}, dr: {}, dv: {} };

function paranoidCheck(action: string, actor: any, data: any): boolean {
  return true;
}
export async function removeEffects(data: { actorUuid: string; effects: string[]; options: {}}) {
  const actor = MQfromActorUuid(data.actorUuid);
  if (configSettings.paranoidGM && !paranoidCheck("removeEffects", actor, data)) return "gmBlocked";
  return await actor?.deleteEmbeddedDocuments("ActiveEffect", data.effects, data.options)
}

export async function createEffects(data: { actorUuid: string, effects: any[] }) {
  const actor = MQfromActorUuid(data.actorUuid);
  await actor?.createEmbeddedDocuments("ActiveEffect", data.effects)
}

export async function updateEffects(data: { actorUuid: string, updates: any[] }) {
  const actor = MQfromActorUuid(data.actorUuid);
  await actor.updateEmbeddedDocuments("ActiveEffect", data.updates);
}

export function removeActorStats(data: { actorId: any }) {
  return gameStats.GMremoveActorStats(data.actorId)
}

export function GMupdateEntityStats(data: { id: any; currentStats: any; }) {
  return gameStats.GMupdateEntity(data)
}

export async function timedExecuteAsGM(toDo: string, data: any) {
  if (!debugCallTiming) return socketlibSocket.executeAsGM(toDo, data);
  const start = Date.now();
  data.playerId = game.user?.id;
  const returnValue = await socketlibSocket.executeAsGM(toDo, data);
  log(`executeAsGM: ${toDo} elapsed: ${Date.now() - start}ms`)
  return returnValue;
}

export async function timedAwaitExecuteAsGM(toDo: string, data: any) {
  if (!debugCallTiming) return await socketlibSocket.executeAsGM(toDo, data);
  const start = Date.now();
  const returnValue = await socketlibSocket.executeAsGM(toDo, data);
  log(`await executeAsGM: ${toDo} elapsed: ${Date.now() - start}ms`)
  return returnValue;
}

export let setupSocket = () => {
  socketlibSocket = globalThis.socketlib.registerModule("midi-qol");
  socketlibSocket.register("createReverseDamageCard", createReverseDamageCard);
  socketlibSocket.register("removeEffects", removeEffects);
  socketlibSocket.register("createEffects", createEffects);
  socketlibSocket.register("updateEffects", updateEffects);
  socketlibSocket.register("updateEntityStats", GMupdateEntityStats)
  socketlibSocket.register("removeStatsForActorId", removeActorStats);
  socketlibSocket.register("monksTokenBarSaves", monksTokenBarSaves);
  socketlibSocket.register("rollAbility", rollAbility);
  socketlibSocket.register("createChatMessage", createChatMessage);
  socketlibSocket.register("chooseReactions", localDoReactions);
  socketlibSocket.register("addConvenientEffect", addConvenientEffect);
  socketlibSocket.register("deleteItemEffects", deleteItemEffects);
  socketlibSocket.register("createActor", createActor);
  socketlibSocket.register("deleteToken", deleteToken);
  socketlibSocket.register("ddbglPendingFired", ddbglPendingFired);
  socketlibSocket.register("completeItemUse", _completeItemUse);
  socketlibSocket.register("applyEffects", _applyEffects);
  socketlibSocket.register("bonusCheck", _bonusCheck)
};

export async function _bonusCheck(data: {actorUuid, result, rollType, selector}) {
  const tokenOrActor: any = await fromUuid(data.actorUuid);
  const actor = tokenOrActor?.actor ?? tokenOrActor;
  const roll = Roll.fromJSON(data.result);
  if (actor) return await bonusCheck(actor, roll, data.rollType, data.selector);
  else return null;
}
export async function _applyEffects(data: { workflowId: string, targets: string[] }) {
  let result;
  try {
    const workflow = Workflow.getWorkflow(data.workflowId);
    if (!workflow) return result;
    workflow.forceApplyEffects = true; // don't overwrite the application targets
    const targets: Set<Token> = new Set();
    //@ts-ignore
    for (let targetUuid of data.targets) targets.add(await fromUuid(targetUuid));

    workflow.applicationTargets = targets;
    if (workflow.applicationTargets.size > 0) result = await workflow.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
    return result;
  } catch (err) {
    warn("remote apply effects error", error);
  }
  return result;
}

async function _completeItemUse(data: {itemData: any, actorUuid: string, config: any, options: any, targetUuids: string[]}) {
  if (!game.user) return null;
  let {itemData, actorUuid, config, options} = data;
  let actor: any = await fromUuid(actorUuid);
  if (actor.actor) actor = actor.actor;
  let ownedItem: Item = new CONFIG.Item.documentClass(itemData, { parent: actor });
  const result =  await completeItemUse(ownedItem, config, options);
  return true; // can't return the workflow
}
async function createActor(data) {
  await CONFIG.Actor.documentClass.createDocuments([data.actorData]);
}

async function deleteToken(data: { tokenUuid: string }) {
  const token = await fromUuid(data.tokenUuid);
  if (token) { // token will be a token document.
    token.delete();
  }
}
export async function deleteItemEffects(data: { targets, origin: string, ignore: string[], ignoreTransfer: boolean }) {
  let { targets, origin, ignore } = data;
  for (let idData of targets) {
    let actor = idData.tokenUuid ? MQfromActorUuid(idData.tokenUuid) : idData.actorUuid ? MQfromUuid(idData.actorUuid) : undefined;
    if (actor?.actor) actor = actor.actor;
    if (!actor) {
      warn("could not find actor for ", idData.tokenUuid);
      continue;
    }
    const effectsToDelete = actor?.effects?.filter(ef => ef.origin === origin && !ignore.includes(ef.uuid) && (!data.ignoreTransfer || ef.flags?.dae?.transfer !== true));
    if (effectsToDelete?.length > 0) {
      try {
        await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete.map(ef => ef.id));
      } catch (err) {
        console.warn("delete effects failed ", err);
        if (debugEnabled > 0) warn("delete effects failed ", err)
        // TODO can get thrown since more than one thing tries to delete an effect
      };
    }
  }
  if (globalThis.Sequencer) await globalThis.Sequencer.EffectManager.endEffects({ origin })
}
async function addConvenientEffect(options) {
  let { effectName, actorUuid, origin } = options;
  const actorToken: any = await fromUuid(actorUuid);
  const actor = actorToken?.actor ?? actorToken;

  console.warn("midi-qol | Deprecated. Call await game.dfreds.effectInterface?.addEffect({ effectName, uuid: actorUuid, origin }) instead")
  //@ts-ignore
  await game.dfreds.effectInterface?.addEffect({ effectName, uuid: actorUuid, origin });
}

async function localDoReactions(data: { tokenUuid: string; reactionItemUuidList: string[], triggerTokenUuid: string, reactionFlavor: string; triggerType: string; options: any}) {
  if (data.options.itemUuid) {
    data.options.item = MQfromUuid(data.options.itemUuid);
  }
  const result = await promptReactions(data.tokenUuid, data.reactionItemUuidList, data.triggerTokenUuid, data.reactionFlavor, data.triggerType, data.options)
  return result;
}

export function initGMActionSetup() {
  traitList.di = i18n("DND5E.DamImm");
  traitList.dr = i18n("DND5E.DamRes");
  traitList.dv = i18n("DND5E.DamVuln");
  traitList.di = "di";
  traitList.dr = "dr";
  traitList.dv = "dv";
}

export async function createChatMessage(data: { chatData: any; }) {
  const messageData = getProperty(data, "chatData.messageData") ?? {};
  messageData.user = game.user?.id;
  return await ChatMessage.create(data.chatData);
}

export async function rollAbility(data: { request: string; targetUuid: string; ability: string; options: any; }) {
  const actor = MQfromActorUuid(data.targetUuid);
  let result;
  if (data.request === "save") result = await actor.rollAbilitySave(data.ability, data.options)
  else if (data.request === "abil") result = await actor.rollAbilityTest(data.ability, data.options);
  else if (data.request === "skill") result = await actor.rollSkill(data.ability, data.options)
  const resultObject = duplicate(result); // Since the return value is being sent over the wire make sure the result field is set
  resultObject.result = result.result;
  return resultObject;
}

export function monksTokenBarSaves(data: { tokenData: any[]; request: any; silent: any; rollMode: string; dc: number | undefined }) {
  // let tokens = data.tokens.map((tuuid: any) => new Token(MQfromUuid(tuuid)));

  // TODO come back and see what things can be passed to this.
  //@ts-ignore MonksTokenBar
  game.MonksTokenBar?.requestRoll(
    data.tokenData,
    {
      request: data.request,
      silent: data.silent,
      rollmode: data.rollMode,
      dc: data.dc
    });
}

async function createReverseDamageCard (data: { damageList: any; autoApplyDamage: string; flagTags: any, sender: string, charName: string, actorId: string, updateContext: any, forceApply: boolean }) {
  createPlayerDamageCard(data);
  return createGMReverseDamageCard(data);
}

async function prepareDamageListItems(data: { damageList: any; autoApplyDamage: string; flagTags: any, updateContext: any, forceApply: boolean }, 
  templateData, tokenIdList, createPromises: boolean = false, showNPC: boolean = true, ): Promise<Promise<any>[]> 
{
  const damageList = data.damageList;
  let promises: Promise<any>[] = [];

  for (let damageItem of damageList) {
    let { tokenId, tokenUuid, actorId, actorUuid, oldHP, oldTempHP, newTempHP, tempDamage, hpDamage, totalDamage, appliedDamage, sceneId } = damageItem;

    let tokenDocument;
    let actor;
    if (tokenUuid) {
      tokenDocument = MQfromUuid(tokenUuid);
      actor = tokenDocument?.actor ?? tokenDocument ?? MQfromActorUuid(actorUuid);
    }
    else
      actor = MQfromActorUuid(actorUuid)

    if (!actor) {
      if (debugEnabled > 0) warn(`GMAction: reverse damage card could not find actor to update HP tokenUuid ${tokenUuid} actorUuid ${actorUuid}`);
      continue;
    }
    if (!showNPC && !actor.hasPlayerOwner) continue;
    let newHP = Math.max(0, oldHP - hpDamage);
    if (createPromises && (["yes", "yesCard", "yesCardNPC"].includes(data.autoApplyDamage) || data.forceApply)) {
      if ((newHP !== oldHP || newTempHP !== oldTempHP) && (data.autoApplyDamage !== "yesCardNPC" || actor.type !== "character")) {
        const updateContext = mergeObject({ dhp: -appliedDamage }, data.updateContext ?? {});
        log(`updating ${actor.name} to ${newTempHP}`, updateContext)
        //@ts-ignore
        promises.push(actor.update({ "system.attributes.hp.temp": newTempHP, "system.attributes.hp.value": newHP, "flags.dae.damageApplied": appliedDamage, damageItem }, updateContext));
      }
    }
    tokenIdList.push({ tokenId, tokenUuid, actorUuid, actorId, oldTempHP: oldTempHP, oldHP, totalDamage: Math.abs(totalDamage), newHP, newTempHP, damageItem });

    let img = tokenDocument?.texture.src || actor.img;
    if (configSettings.usePlayerPortrait && actor.type === "character")
      img = actor?.img || tokenDocument?.texture.src;
    if (VideoHelper.hasVideoExtension(img)) {
      //@ts-ignore - createThumbnail not defined
      img = await game.video.createThumbnail(img, { width: 100, height: 100 });
    }

    let listItem = {
      isCharacter: actor.hasPlayerOwner,
      isNpc: !actor.hasPlayerOwner,
      actorUuid,
      tokenId: tokenId ?? "none",
      displayUuid: actorUuid.replaceAll(".", ""),
      tokenUuid,
      tokenImg: img,
      hpDamage,
      abshpDamage: Math.abs(hpDamage),
      tempDamage: newTempHP - oldTempHP,
      totalDamage: Math.abs(totalDamage),
      halfDamage: Math.abs(Math.floor(totalDamage / 2)),
      doubleDamage: Math.abs(totalDamage * 2),
      appliedDamage,
      playerViewTotalDamage: hpDamage + tempDamage,
      absDamage: Math.abs(appliedDamage),
      tokenName: (tokenDocument?.name && configSettings.useTokenNames) ? tokenDocument.name : actor.name,
      dmgSign: appliedDamage < 0 ? "+" : "-", // negative damage is added to hit points
      newHP,
      newTempHP,
      oldTempHP,
      oldHP,
      buttonId: tokenUuid,
      iconPrefix: (data.autoApplyDamage === "yesCardNPC" && actor.type === "character") ? "*" : "",
      updateContext: data.updateContext
    };

    ["di", "dv", "dr"].forEach(trait => {
      const traits = actor?.system.traits[trait]
      if (traits?.custom || traits?.value.length > 0) {
        //@ts-ignore CONFIG.DND5E
        listItem[trait] = (`${traitList[trait]}: ${traits.value.map(t => CONFIG.DND5E.damageResistanceTypes[t]).join(",").concat(" " + traits?.custom)}`);
      }
    });
    //@ts-ignore
    const actorFlags: any = actor.flags;
    const DRFlags = actorFlags["midi-qol"] ? actorFlags["midi-qol"].DR : undefined;
    if (DRFlags) {
      listItem["DR"] = "DR: ";
      for (let key of Object.keys(DRFlags)) {
        listItem["DR"] += `${key}:${DRFlags[key]} `;
      }
    }
    //@ts-ignore listItem
    templateData.damageList.push(listItem);
  }
  return promises;
}
// Fetch the token, then use the tokenData.actor.id
async function createPlayerDamageCard (data: { damageList: any; autoApplyDamage: string; flagTags: any, sender: string, charName: string, actorId: string, updateContext: any, forceApply: boolean}) {
  let shouldShow = true;
  if (configSettings.playerCardDamageDifferent) {
    shouldShow = false;
    for (let damageItem of data.damageList) {
      if (damageItem.totalDamage !== damageItem.appliedDamage) shouldShow = true;
    }
  }
  if (!shouldShow) return;
  if (configSettings.playerDamageCard === "none" ) return;
  let showNPC = ["npcplayerresults", "npcplayerbuttons"].includes(configSettings.playerDamageCard);
  let playerButtons = ["playerbuttons", "npcplayerbuttons"].includes(configSettings.playerDamageCard);
  const damageList = data.damageList;
  //@ts-ignore
  let actor: CONFIG.Actor.documentClass; // { update: (arg0: { "system.attributes.hp.temp": any; "system.attributes.hp.value": number; "flags.dae.damageApplied": any; damageItem: any[] }) => Promise<any>; img: any; type: string; name: any; data: { data: { traits: { [x: string]: any; }; }; }; };
  const startTime = Date.now();
  let tokenIdList: any[] = [];
  let templateData = {
    damageApplied: ["yes", "yesCard"].includes(data.autoApplyDamage) ? i18n("midi-qol.HPUpdated") : i18n("midi-qol.HPNotUpdated"),
    damageList: [],
    needsButtonAll: false,
    showNPC,
    playerButtons
  };
  prepareDamageListItems(data, templateData, tokenIdList, false, showNPC)
  if (templateData.damageList.length === 0) {
    log("No damage data to show to player");
    return; 
  }
  templateData.needsButtonAll = damageList.length > 1;
  //@ts-ignore
  templateData.playerButtons = templateData.playerButtons && templateData.damageList.some(listItem => listItem.isCharacter)
  if (["yesCard", "noCard", "yesCardNPC"].includes(data.autoApplyDamage)) {
    const content = await renderTemplate("modules/midi-qol/templates/damage-results-player.html", templateData);
    const speaker: any = ChatMessage.getSpeaker();
    speaker.alias = data.sender;
    let chatData: any = {
      user: game.user?.id,
      speaker: { scene: getCanvas()?.scene?.id, alias: data.charName, user: game.user?.id, actor: data.actorId },
      content: content,
      // whisper: ChatMessage.getWhisperRecipients("players").filter(u => u.active).map(u => u.id),
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      flags: { "midiqol": { "undoDamage": tokenIdList } }
    };
    if (data.flagTags) chatData.flags = mergeObject(chatData.flags ?? "", data.flagTags);
    ChatMessage.create(chatData);
  }
  log(`createPlayerReverseDamageCard elapsed: ${Date.now() - startTime}ms`)
}
  
  // Fetch the token, then use the tokenData.actor.id
async function createGMReverseDamageCard (data: { damageList: any; autoApplyDamage: string; flagTags: any, updateContext: any, forceApply: boolean }) {
  const damageList = data.damageList;
  let actor: { update: (arg0: { "system.attributes.hp.temp": any; "system.attributes.hp.value": number; "flags.dae.damageApplied": any; damageItem: any[] }) => Promise<any>; img: any; type: string; name: any; data: { data: { traits: { [x: string]: any; }; }; }; };
  const startTime = Date.now();
  let promises: Promise<any>[] = [];
  let tokenIdList: any[] = [];
  let templateData = {
    damageApplied: (["yes", "yesCard"].includes(data.autoApplyDamage) || data.forceApply) ? 
            i18n("midi-qol.HPUpdated") : 
            data.autoApplyDamage === "yesCardNPC" ? i18n("midi-qol.HPNPCUpdated") : i18n("midi-qol.HPNotUpdated"),
    damageList: [],
    needsButtonAll: false
  };
  promises = await prepareDamageListItems(data, templateData, tokenIdList, true, true)

  templateData.needsButtonAll = damageList.length > 1;

  //@ts-ignore
  const results = await Promise.allSettled(promises);
  if (debugEnabled > 0) warn("GM action results are ", results)
  if (["yesCard", "noCard", "yesCardNPC"].includes(data.autoApplyDamage)) {
    const content = await renderTemplate("modules/midi-qol/templates/damage-results.html", templateData);
    const speaker: any = ChatMessage.getSpeaker();
    speaker.alias = game.user?.name;
    let chatData: any = {
      user: game.user?.id,
      speaker: { scene: getCanvas()?.scene?.id, alias: game.user?.name, user: game.user?.id },
      content: content,
      whisper: ChatMessage.getWhisperRecipients("GM").filter(u => u.active).map(u => u.id),
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      flags: { "midiqol": { "undoDamage": tokenIdList } }
    };
    if (data.flagTags) chatData.flags = mergeObject(chatData.flags ?? "", data.flagTags);
    ChatMessage.create(chatData);
  }
  log(`createGMReverseDamageCard elapsed: ${Date.now() - startTime}ms`)
}

async function doClick(event: { stopPropagation: () => void; }, actorUuid: any, totalDamage: any, mult: any, data: any) {
  let actor = MQfromActorUuid(actorUuid);
  log(`Applying ${totalDamage} mult ${mult} HP to ${actor.name}`);
  await actor.applyDamage(totalDamage, mult, data);
  event.stopPropagation();
}

async function doMidiClick(ev: any, actorUuid: any, newTempHP: any, newHP: any, mult: number, data: any) {
  let actor = MQfromActorUuid(actorUuid);
  log(`Setting HP to ${newTempHP} and ${newHP}`);
  const updateContext = mergeObject({ dhp: (newHP - actor.system.attributes.hp.value)}, data.updateContext);
  await actor.update({ "system.attributes.hp.temp": newTempHP, "system.attributes.hp.value": newHP }, updateContext);
}

export let processUndoDamageCard = (message, html, data) => {
  if (!message.flags?.midiqol?.undoDamage) return true;
  let button = html.find("#all-reverse");

  button.click((ev: { stopPropagation: () => void; }) => {
    (async () => {
      for (let { actorUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP, damageItem } of message.flags.midiqol.undoDamage) {
        //message.flags.midiqol.undoDamage.forEach(async ({ actorUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP, damageItem }) => {
        if (!actorUuid) return;
        let actor = MQfromActorUuid(actorUuid);
        log(`Setting HP back to ${oldTempHP} and ${oldHP}`, actor);
        await actor?.update({ "system.attributes.hp.temp": oldTempHP ?? 0, "system.attributes.hp.value": oldHP ?? 0 }, { dhp: (oldHP ?? 0) - (actor.system.attributes.hp.value ?? 0) }, data.updateContext);
        ev.stopPropagation();
      }
    })();
  });

  button = html.find("#all-apply");
  button.click((ev: { stopPropagation: () => void; }) => {
    (async () => {
      for (let { actorUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP, damageItem } of message.flags.midiqol.undoDamage) {
        if (!actorUuid) return;
        let actor = MQfromActorUuid(actorUuid);
        log(`Setting HP to ${newTempHP} and ${newHP}`);
        await actor?.update({ "system.attributes.hp.temp": newTempHP, "system.attributes.hp.value": newHP, damageItem }, { dhp: newHP - actor.system.attributes.hp.value }, data.updateContext );
        ev.stopPropagation();
      }
    })();
  })

  message.flags.midiqol.undoDamage.forEach(({ actorUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP, damageItem }) => {
    if (!actorUuid) return;
    // ids should not have "." in the or it's id.class
    let button = html.find(`#reverse-${actorUuid.replaceAll(".", "")}`);
    button.click((ev: { stopPropagation: () => void; }) => {
      (async () => {
        let actor = MQfromActorUuid(actorUuid);
        log(`Setting HP back to ${oldTempHP} and ${oldHP}`, data.updateContext);
        await actor.update({ "system.attributes.hp.temp": oldTempHP, "system.attributes.hp.value": oldHP }, { dhp: oldHP - actor.system.attributes.hp.value }, data.updateContext );
        ev.stopPropagation();
      })();
    });

    // Default action of button is to do midi damage
    button = html.find(`#apply-${actorUuid.replaceAll(".", "")}`);
    button.click((ev: { stopPropagation: () => void; }) => {
      (async () => {
        let actor = MQfromActorUuid(actorUuid);
        log(`Setting HP to ${newTempHP} and ${newHP}`, data.updateContext);
        await actor.update({ "system.attributes.hp.temp": newTempHP, "system.attributes.hp.value": newHP, damageItem }, { dhp: newHP - actor.system.attributes.hp.value });
        ev.stopPropagation();
      })();
    });

    let select = html.find(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`);
    select.change( (ev: any) => {
      let multiplier = html.find(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`).val();
      button = html.find(`#apply-${actorUuid.replaceAll(".", "")}`);
      button.off('click');

      const mults = { "-1": -1, "x1": 1, "x0.25": 0.25, "x0.5": 0.5, "x2": 2 };
      if (multiplier === "calc")
        button.click(async (ev: any) => await doMidiClick(ev, actorUuid, newTempHP, newHP, 1, data));
      else if (mults[multiplier])
        button.click(async (ev: any) => await doClick(ev, actorUuid, totalDamage, mults[multiplier], data));
    });
  })
  return true;
}