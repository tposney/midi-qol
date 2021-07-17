import { configSettings } from "./settings.js";
import { i18n, log, warn, gameStats, getCanvas } from "../midi-qol.js";
import { MQfromActorUuid, MQfromUuid, promptReactions } from "./utils.js";

export var socketlibSocket: any = undefined;
var traitList = { di: {}, dr: {}, dv: {} };

export async function removeEffects(data: { actorUuid: any; effects: any; }) {
  const actor = MQfromActorUuid(data.actorUuid);
  await actor?.deleteEmbeddedDocuments("ActiveEffect", data.effects)
}

export async function createEffects(data: { actorUuid: any; effects: any; }) {
  const actor = MQfromActorUuid(data.actorUuid);
  await actor?.createEmbeddedDocuments("ActiveEffect", data.effects)
}
export function removeActorStats(data: { actorId: any; }) {
  return gameStats.GMremoveActorStats(data.actorId)
}

export function GMupdateActor(data: { actorId: any; currentStats: any; }) {
  return gameStats.GMupdateActor(data)
}

export let setupSocket = () => {
 //@ts-ignore
  socketlibSocket = window.socketlib.registerModule("midi-qol");
  socketlibSocket.register("createReverseDamageCard", createReverseDamageCard);
  socketlibSocket.register("removeEffects", removeEffects);
  socketlibSocket.register("createEffects", createEffects);
  socketlibSocket.register("updateActorStats", GMupdateActor)
  socketlibSocket.register("removeStatsForActorId", removeActorStats);
  socketlibSocket.register("monksTokenBarSaves", monksTokenBarSaves);
  socketlibSocket.register("rollAbility", rollAbility);
  socketlibSocket.register("createChatMessage", createChatMessage);
  socketlibSocket.register("chooseReactions", localDoReactions);
};

async function localDoReactions(data: { tokenUuid: string; attackRoll: string; }) {
  const result =  await promptReactions(data.tokenUuid, JSON.parse(data.attackRoll))
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
  return await ChatMessage.create(data.chatData);
}

export function rollAbility(data: { request: string; targetUuid: any; ability: any; options: any; }) {
  //@ts-ignore
  const rollAction = data.request === "abil" ?
            //@ts-ignore
            CONFIG.Actor.documentClass.prototype.rollAbilityTest : 
            //@ts-ignore
            CONFIG.Actor.documentClass.prototype.rollAbilitySave;
  const actor = MQfromActorUuid(data.targetUuid);
  const result = rollAction.bind(actor)(data.ability, data.options);
  return result;
}

export function monksTokenBarSaves(data: { tokens: any[]; request: any; silent: any; rollMode: any; }) {
  let tokens = data.tokens.map((tuuid: any) => new Token(MQfromUuid(tuuid)));

  // TODO come back and see what things can be passed to this.
  //@ts-ignore MonksTokenBar
  game.MonksTokenBar?.requestRoll(
    tokens,
    {
      request: data.request,
      silent: data.silent,
      rollMode: data.rollMode
  });
}

// Fetch the token, then use the tokenData.actor.id
let createReverseDamageCard = async (data: { damageList: any; autoApplyDamage: string; }) => {
  const damageList = data.damageList;
  let actor: { update: (arg0: { "data.attributes.hp.temp": any; "data.attributes.hp.value": number; "flags.dae.damageApplied": any; }) => Promise<any>; img: any; type: string; name: any; data: { data: { traits: { [x: string]: any; }; }; }; };
  const timestamp = Date.now();
  let promises: Promise<any>[] = [];
  let tokenIdList: any[] = [];
  let templateData = { 
    damageApplied: ["yes", "yesCard"].includes(data.autoApplyDamage) ? "HP Updated" : "HP Not Updated",
    damageList: [] ,
    needsButtonAll: false
  };
  for (let { tokenId, tokenUuid, actorId, actorUuid, oldHP, oldTempHP, newTempHP, tempDamage, hpDamage, totalDamage, appliedDamage, sceneId } of damageList) {

    let tokenDocument;
    if (tokenUuid) {
      tokenDocument = MQfromUuid(tokenUuid);
      actor = tokenDocument.actor;
    }
    else
      actor = MQfromActorUuid(actorUuid)

    if (!actor) {
      warn(`GMAction: reverse damage card could not find actor to update HP tokenUuid ${tokenUuid} actorUuid ${actorUuid}`);
      continue;
    }
    let newHP = Math.max(0, oldHP - hpDamage);
    // removed intended for check
    if (["yes", "yesCard"].includes(data.autoApplyDamage)) {
      if (newHP !== oldHP || newTempHP !== oldTempHP)  {
        promises.push(actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP, "flags.dae.damageApplied": appliedDamage}));
      }
    }
    tokenIdList.push({ tokenId, tokenUuid, actorUuid, actorId, oldTempHP: oldTempHP, oldHP, totalDamage: Math.abs(totalDamage), newHP, newTempHP});

    let img = tokenDocument?.data.img || actor.img;
    if (configSettings.usePlayerPortrait && actor.type === "character")
      img = actor?.img || tokenDocument?.data.img;
    if ( VideoHelper.hasVideoExtension(img) ) {
      //@ts-ignore - createThumbnail not defined
      img = await game.video.createThumbnail(img, {width: 100, height: 100});
    }

    let listItem = {
      actorUuid,
      tokenId: tokenId ?? "none",
      displayUuid: actorUuid.replaceAll(".", ""),
      tokenUuid,
      tokenImg: img,
      hpDamage,
      tempDamage: newTempHP - oldTempHP,
      totalDamage: Math.abs(totalDamage),
      halfDamage: Math.abs(Math.floor(totalDamage / 2)),
      doubleDamage: Math.abs(totalDamage * 2),
      appliedDamage,
      absDamage: Math.abs(appliedDamage),
      tokenName: (tokenDocument?.name && configSettings.useTokenNames) ? tokenDocument.name : actor.name,
      dmgSign: appliedDamage < 0 ? "+" : "-", // negative damage is added to hit points
      newHP,
      newTempHP,
      oldTempHP,
      oldHP,
      buttonId: tokenUuid
    };

    ["di", "dv", "dr"].forEach(trait => {
      const traits = actor?.data.data.traits[trait]
      if (traits?.custom || traits?.value.length > 0) {
        //@ts-ignore CONFIG.DND5E
        listItem[trait] = (`${traitList[trait]}: ${traits.value.map(t => CONFIG.DND5E.damageResistanceTypes[t]).join(",").concat(" " + traits?.custom)}`);
      }
    });
    //@ts-ignore listItem
    templateData.damageList.push(listItem);
  }
  templateData.needsButtonAll = damageList.length > 1;

  //@ts-ignore
  const results = await Promise.allSettled(promises);
  warn("GM action results are ", results)
  if (["yesCard", "noCard"].includes(data.autoApplyDamage)) {
    const content = await renderTemplate("modules/midi-qol/templates/damage-results.html", templateData);
    const speaker: any = ChatMessage.getSpeaker();
    speaker.alias = game.user?.name;
    let chatData: any = {
      user: game.user?.id,
      speaker: {scene: getCanvas().scene?.id, alias: game.user?.name, user: game.user?.id},
      content: content,
      whisper: ChatMessage.getWhisperRecipients("GM").filter(u => u.active).map(u=>u.id),
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      flags: { "midiqol": {"undoDamage": tokenIdList }}
    };
    let message = await ChatMessage.create(chatData);
  }
}

async function doClick(event: { stopPropagation: () => void; }, actorUuid: any, totalDamage: any, mult: any) {
 let actor = MQfromActorUuid(actorUuid);
  log(`Applying ${totalDamage} mult ${mult} HP to ${actor.name}`);
  await actor.applyDamage(totalDamage, mult);
  event.stopPropagation();
}

async function doMidiClick(ev: any, actorUuid: any, newTempHP: any, newHP: any) {
 let actor = MQfromActorUuid(actorUuid);
  log(`Setting HP to ${newTempHP} and ${newHP}`);
  await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
}

export let processUndoDamageCard = async(message, html, data) => {
    if (!message.data.flags?.midiqol?.undoDamage) return true;
  let button = html.find("#all-reverse");

  button.click((ev: { stopPropagation: () => void; }) => {
    message.data.flags.midiqol.undoDamage.forEach(async ({actorUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP}) => {
      if (!actorUuid) return;
      let actor = MQfromActorUuid(actorUuid);
      log(`Setting HP back to ${oldTempHP} and ${oldHP}`);
      await actor.update({ "data.attributes.hp.temp": oldTempHP, "data.attributes.hp.value": oldHP });
      ev.stopPropagation();
    })
  })

  button = html.find("#all-apply");
  button.click((ev: { stopPropagation: () => void; }) => {
    message.data.flags.midiqol.undoDamage.forEach(async ({actorUuid, oldTempHP, oldHP, absDamage, newHP, newTempHP}) => {
    if (!actorUuid) return;
    let actor = MQfromActorUuid(actorUuid);
      log(`Setting HP to ${newTempHP} and ${newHP}`);
      await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
      ev.stopPropagation();
    })
  })

  message.data.flags.midiqol.undoDamage.forEach(({actorUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP}) => {
    if (!actorUuid) return;
    // ids should not have "." in the or it's id.class
    let button = html.find(`#reverse-${actorUuid.replaceAll(".", "")}`);
    button.click(async (ev: { stopPropagation: () => void; }) => {
      let actor = MQfromActorUuid(actorUuid);
      log(`Setting HP back to ${oldTempHP} and ${oldHP}`);
      await actor.update({ "data.attributes.hp.temp": oldTempHP, "data.attributes.hp.value": oldHP });
      ev.stopPropagation();
    });

    // Default action of button is to do midi damage
    button = html.find(`#apply-${actorUuid.replaceAll(".", "")}`);
    button.click(async (ev: { stopPropagation: () => void; }) => {
      let actor = MQfromActorUuid(actorUuid);
      log(`Setting HP to ${newTempHP} and ${newHP}`);
      await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
      ev.stopPropagation();
    });

    let select = html.find(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`);
    select.change(async (ev: any) => {
      let multiplier = html.find(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`).val();
      button = html.find(`#apply-${actorUuid.replaceAll(".", "")}`);
      button.off('click');

      const mults = {"-1": -1, "x1": 1, "x0.25": 0.25, "x0.5": 0.5, "x2": 2};
      if (multiplier === "calc")
        button.click(async (ev: any) => doMidiClick(ev, actorUuid, newTempHP, newHP));
      else if (mults[multiplier]) 
        button.click(async (ev: any) => doClick(ev, actorUuid, totalDamage, mults[multiplier]));
    });
  })
  return true;
}
