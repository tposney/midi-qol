import { configSettings } from "./settings";
import { i18n, log, warn, gameStats } from "../midi-qol";
import { MQfromActorUuid, MQfromUuid } from "./utils";

export var socketlibSocket = undefined;
var traitList = { di: {}, dr: {}, dv: {} };

export function removeEffects(data) {
  const actor = MQfromActorUuid(data.actorUuid);
  actor?.deleteEmbeddedDocuments("ActiveEffect", data.effects)
}

export function removeActorStats(data) {
  return gameStats.GMremoveActorStats(data.actorId)
}

export function GMupdateActor(data) {
  return gameStats.GMupdateActor(data)
}

export let setupSocket = () => {
  Hooks.once("socketlib.ready", () => {
    //@ts-ignore
    socketlibSocket = socketlib.registerModule("midi-qol");
    socketlibSocket.register("createReverseDamageCard", createReverseDamageCard);
    socketlibSocket.register("removeEffects", removeEffects);
    socketlibSocket.register("updateActorStats", GMupdateActor)
    socketlibSocket.register("removeActorStatsForActorId", removeActorStats);
    socketlibSocket.register("monksTokenBarSaves", monksTokenBarSaves)
  });
};

export function initGMActionSetup() {
  traitList.di = i18n("DND5E.DamImm");
  traitList.dr = i18n("DND5E.DamRes");
  traitList.dv = i18n("DND5E.DamVuln");
}

export function monksTokenBarSaves(data) {
  let tokens = data.tokens.map(tuuid => {
    return new Token(MQfromUuid(tuuid));
  });

  game.MonksTokenBar.requestRoll(
    tokens,
    {
      request: data.request,
      silent: data.silent,
      rollMode: data.rollMode
  });
}

// Fetch the token, then use the tokenData.actor.id
let createReverseDamageCard = async (data) => {
  const damageList = data.damageList;
  let actor;
  const timestamp = Date.now();
  let promises = [];
  let tokenIdList = [];
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
        promises.push(actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP, "flags.dae.damgeApplied": appliedDamage}));
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
        listItem[trait] = (`${traitList[trait]}: ${traits.value.map(t => CONFIG.DND5E.damageResistanceTypes[t]).join(",").concat(" " + traits?.custom)}`);
      }
    });
    templateData.damageList.push(listItem);
  }
  templateData.needsButtonAll = damageList.length > 1;

  //@ts-ignore
  const results = await Promise.allSettled(promises);
  warn("GM action results are ", results)
  if (["yesCard", "noCard"].includes(data.autoApplyDamage)) {
    const content = await renderTemplate("modules/midi-qol/templates/damage-results.html", templateData);
    const speaker = ChatMessage.getSpeaker();
    speaker.alias = game.user.name;
    let chatData = {
      user: game.user.id,
      speaker: {scene: canvas.scene.id, alias: game.user.name, user: game.user.id},
      content: content,
      whisper: ChatMessage.getWhisperRecipients("GM").filter(u => u.active).map(u=>u.id),
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      flags: { "midiqol": {"undoDamage": tokenIdList }}
    };
    let message = await ChatMessage.create(chatData);
  }
}

async function doClick(event, actorUuid, totalDamage, mult) {
 let actor = MQfromActorUuid(actorUuid);
  log(`Applying ${totalDamage} mult ${mult} HP to ${actor.name}`);
  await actor.applyDamage(totalDamage, mult);
  event.stopPropagation();
}

async function doMidiClick(ev, actorUuid, newTempHP, newHP) {
 let actor = MQfromActorUuid(actorUuid);
  log(`Setting HP to ${newTempHP} and ${newHP}`);
  await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
}

export let processUndoDamageCard = async(message, html, data) => {
  if (!message.data.flags?.midiqol?.undoDamage) return true;
  let button = html.find("#all-reverse");

  button.click((ev) => {
    message.data.flags.midiqol.undoDamage.forEach(async ({actorUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP}) => {
      if (!actorUuid) return;
      let actor = MQfromActorUuid(actorUuid);
      log(`Setting HP back to ${oldTempHP} and ${oldHP}`);
      await actor.update({ "data.attributes.hp.temp": oldTempHP, "data.attributes.hp.value": oldHP });
      ev.stopPropagation();
    })
  })

  button = html.find("#all-apply");
  button.click((ev) => {
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
    button.click(async (ev) => {
      let actor = MQfromActorUuid(actorUuid);
      log(`Setting HP back to ${oldTempHP} and ${oldHP}`);
      await actor.update({ "data.attributes.hp.temp": oldTempHP, "data.attributes.hp.value": oldHP });
      ev.stopPropagation();
    });

    // Default action of button is to do midi damage
    button = html.find(`#apply-${actorUuid.replaceAll(".", "")}`);
    button.click(async (ev) => {
      let actor = MQfromActorUuid(actorUuid);
      log(`Setting HP to ${newTempHP} and ${newHP}`);
      await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
      ev.stopPropagation();
    });

    let select = html.find(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`);
    select.change(async (ev) => {
      let multiplier = html.find(`#dmg-multiplier-${actorUuid.replaceAll(".", "")}`).val();
      button = html.find(`#apply-${actorUuid.replaceAll(".", "")}`);
      button.off('click');

      const mults = {"Heal": -1, "x1": 1, "x1/4": 0.25, "x1/2": 0.5, "x2": 2};
      if (multiplier === "Calc")
        button.click(async (ev) => doMidiClick(ev, actorUuid, newTempHP, newHP));
      else if (mults[multiplier]) 
        button.click(async (ev) => doClick(ev, actorUuid, totalDamage, mults[multiplier]));
    });
  })
}
