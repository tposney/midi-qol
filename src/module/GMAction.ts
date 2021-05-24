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
  });
};

export function initGMActionSetup() {
  traitList.di = i18n("DND5E.DamImm");
  traitList.dr = i18n("DND5E.DamRes");
  traitList.dv = i18n("DND5E.DamVuln");
}

//TODO change token ID to token.uuid
// Fetch the token, then use the tokenData.actor.id
let createReverseDamageCard = async (data) => {
  let whisperText = "";
  const damageList = data.damageList;
  const btnStyling = "width: 22px; height:22px; font-size:10px;line-height:1px";
  // let token, actor;
  let actor;
  const timestamp = Date.now();
  let promises = [];
  let tokenIdList = [];
  let templateData = { 
    damageApplied: ["yes", "yesCard"].includes(data.autoApplyDamage) ? "HP Updated" : "HP Not Updated",
    damageList: [] ,
    needsButtonAll: false
  };
  for (let { tokenId, tokenUuid, actorID, oldHP, oldTempHP, newTempHP, tempDamage, hpDamage, totalDamage, appliedDamage, sceneId } of damageList) {

    let tokenDocument = MQfromUuid(tokenUuid);
     
    let newHP = Math.max(0, oldHP - hpDamage);
    // removed intended for check
    if (["yes", "yesCard"].includes(data.autoApplyDamage)) {
      if (newHP !== oldHP || newTempHP !== oldTempHP)  {
        promises.push(tokenDocument.actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP, "flags.dae.damgeApplied": appliedDamage}));
      }
    }

    tokenIdList.push({ tokenId, tokenUuid, oldTempHP: oldTempHP, oldHP, totalDamage: Math.abs(totalDamage), newHP, newTempHP});
    // let img = token?.data.img || token?.actor.img || tokenDocument.img;
    let img = tokenDocument?.data.img || tokenDocument?.actor.img;

    //@ts-ignore
    if (configSettings.usePlayerPortrait && tokenDocument?.actor.type === "character")
      img = tokenDocument?.actor?.img || tokenDocument.data.img;
    //      img = token.actor?.img || token?.data.img || tokenDocument.img;
    if ( VideoHelper.hasVideoExtension(img) ) {
      //@ts-ignore - createThumbnail not defined
      img = await game.video.createThumbnail(img, {width: 100, height: 100});
    }
    let listItem = {
      tokenId,
      tokenUuid,
      tokenImg: img,
      hpDamage,
      tempDamage: newTempHP - oldTempHP,
      totalDamage: Math.abs(totalDamage),
      halfDamage: Math.abs(Math.floor(totalDamage / 2)),
      doubleDamage: Math.abs(totalDamage * 2),
      appliedDamage,
      absDamage: Math.abs(appliedDamage),
      tokenName: tokenDocument?.name && configSettings.useTokenNames ? tokenDocument.name : (tokenDocument.actor.name || tokenDocument.name),
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

async function doClick(event, tokenUuid, totalDamage, mult) {
 let tokenDocument = MQfromUuid(tokenUuid);
  log(`Applying ${totalDamage} mult ${mult} HP to ${tokenDocument.actor.name}`);
  await tokenDocument.actor.applyDamage(totalDamage, mult);
  event.stopPropagation();
}

async function doMidiClick(ev, tokenUuid, newTempHP, newHP) {
 let tokenDocument = MQfromUuid(tokenUuid);
  log(`Setting HP to ${newTempHP} and ${newHP}`);
  await tokenDocument.actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
}

export let processUndoDamageCard = async(message, html, data) => {
  if (!message.data.flags?.midiqol?.undoDamage) return true;
  let button = html.find("#all-reverse");

  button.click((ev) => {
    message.data.flags.midiqol.undoDamage.forEach(async ({tokenId, tokenUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP}) => {
    let actor = MQfromUuid(tokenUuid).actor;
      log(`Setting HP back to ${oldTempHP} and ${oldHP}`);
      await actor.update({ "data.attributes.hp.temp": oldTempHP, "data.attributes.hp.value": oldHP });
      ev.stopPropagation();
    })
  })

  button = html.find("#all-apply");
  button.click((ev) => {
    message.data.flags.midiqol.undoDamage.forEach(async ({tokenId, tokenUuid, oldTempHP, oldHP, absDamage, newHP, newTempHP}) => {
    let actor = MQfromUuid(tokenUuid).actor;
      log(`Setting HP to ${newTempHP} and ${newHP}`);
      await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
      ev.stopPropagation();
    })
  })

  message.data.flags.midiqol.undoDamage.forEach(({tokenId, tokenUuid, oldTempHP, oldHP, totalDamage, newHP, newTempHP}) => {
    // let button = html.find(`#reverse-${tokenId}`);
    //TODO find out why tokenUuid does not work
    let button = html.find(`#reverse-${tokenId}`);
    //TODO clean this up - one handler with
    button.click(async (ev) => {
     let actor = MQfromUuid(tokenUuid).actor;
      log(`Setting HP back to ${oldTempHP} and ${oldHP}`);
      await actor.update({ "data.attributes.hp.temp": oldTempHP, "data.attributes.hp.value": oldHP });
      ev.stopPropagation();
    });

    // Default action of button is to do midi damage
    //TODO change damage card to put tokenUuid instead of tkenId
    button = html.find(`#apply-${tokenId}`);

    button.click(async (ev) => {
     let actor = MQfromUuid(tokenUuid).actor;
      log(`Setting HP to ${newTempHP} and ${newHP}`);
      await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
      ev.stopPropagation();
    });

    //TODO change damage card to put tokenUuid instead of tkenId
    let select = html.find(`#dmg-multiplier-${tokenId}`);
    select.change(async (ev) => {
      let multiplier = html.find(`#dmg-multiplier-${tokenId}`).val();
      button = html.find(`#apply-${tokenId}`);
      button.off('click');
      switch (multiplier) {
        case "Calc":
          button.click(async (ev) => doMidiClick(ev, tokenUuid, newTempHP, newHP));
          break;
        case "Heal": {
          button.click(async (ev) => doClick(ev, tokenUuid, totalDamage, -1));
          break;
        }
        case "x1": {
          button.click(async (ev) => doClick(ev, tokenUuid, totalDamage, 1));
          break;
        }
        case "x1/4": {
          button.click(async (ev) => doClick(ev, tokenUuid, totalDamage, 0.25));
          break;
        }
        case "x1/2": {
          button.click(async (ev) => doClick(ev, tokenUuid, totalDamage, 0.5));
          break;
        }
        case "x2": {
          button.click(async (ev) => doClick(ev, tokenUuid, totalDamage, 2));
          break;
        }
      }
    });
  })
}
