import { configSettings } from "./settings";
import { i18n, debug, error, log, undoDamageText, warn, gameStats } from "../midi-qol";
import { installedModules } from "./setupModules";

export var socketlibSocket = undefined;
var traitList = { di: {}, dr: {}, dv: {} };

/* TODO remove this when socketlib 100% solid
const moduleSocket = "module.midi-qol";
let processAction = async data => {
  switch (data.action) {
    case "reverseDamageCard":
      if (!game.user.isGM || data?.intendedFor !== game.user.id)
        break;
      if (data.autoApplyDamage === "none")
        break;
      await createReverseDamageCard(data);
      break;
    case "removeEffects":
      const token = canvas.tokens.get(data.tokenId);
      if (token) {
        token.actor?.deleteEmbeddedEntity("ActiveEffect", data.effects)
      }
      break;
    case "GMRollSave": 
    // This needs to roll the save, with prompt and send back the data with the correct id
    case "updateActorStats":
      if (!game.user.isGM || data?.intendedFor !== game.user.id) break;
      return gameStats.GMupdateActor(data);
    case "removeStatsForActorId":
      if (!game.user.isGM || data?.intendedFor !== game.user.id) break;
      return gameStats.GMremoveActorStats(data.actorId);
  }
};
*/
export function removeEffects(data) {
  const token = canvas.tokens.get(data.tokenId);
  if (token) {
    token.actor?.deleteEmbeddedEntity("ActiveEffect", data.effects)
  }
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
  
  //@ts-ignore
/*  game.socket.on(moduleSocket, data => {
    processAction(data);
  });
  */
};

/* TODO remove this once socketlib is 100%
export function broadcastData(data) {
  data.sceneId = canvas.scene.id;
  // if not a gm broadcast the message to a gm who can apply the damage
  if (!game.user.isGM) {
    //@ts-ignore
    game.socket.emit(moduleSocket, data, resp => { });
  } else {
    processAction(data);
  }
}
*/
export function initGMActionSetup() {
  traitList.di = i18n("DND5E.DamImm");
  traitList.dr = i18n("DND5E.DamRes");
  traitList.dv = i18n("DND5E.DamVuln");
}

let createReverseDamageCard = async (data) => {
  let whisperText = "";
  const damageList = data.damageList;
  const btnStyling = "width: 22px; height:22px; font-size:10px;line-height:1px";
  let token, actor;
  const timestamp = Date.now();
  let promises = [];
  let tokenIdList = [];
  let templateData = { 
    damageApplied: ["yes", "yesCard"].includes(data.autoApplyDamage) ? "HP Updated" : "HP Not Updated",
    damageList: [] ,
    needsButtonAll: false
  };
  for (let { tokenId, actorID, oldHP, oldTempHP, newTempHP, tempDamage, hpDamage, totalDamage, appliedDamage } of damageList) {
    let scene = canvas.scene;
    token = canvas.tokens.get(tokenId);
    if (!token) { //Token does not exist on this scene, find it in on referenced scene.
      scene = game.scenes.get(data.sceneId);
      //@ts-ignore .tokens not defined
      const tokenData = scene.data.tokens.find(t=>t._id === tokenId);
      if (!tokenData) {
        // we really should be able to fine the token
        error(`GMAction: could not find token ${tokenId} in scene ${scene?.name || data.sceneId}`);
        continue;
      }
      token = await Token.create(tokenData); // create a temp token for calcs
    }
    actor = token.actor;
    const hp = actor.data.data.attributes.hp;
 
    let newHP = Math.max(0, oldHP - hpDamage);
    // removed intended for check
    if (["yes", "yesCard"].includes(data.autoApplyDamage)) {
      if (token.data.actorLink || canvas.scene.id === scene.id) {
        if (newHP !== oldHP || newTempHP !== oldTempHP)  {
          promises.push(actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP, "flags.dae.damgeApplied": appliedDamage}));
        }
      }
      else {
        debug("doing remote scene update")
        if (newHP !== oldHP || newTempHP !== oldTempHP)  {
          if (scene) {
            promises.push(scene.updateEmbeddedEntity("Token", { // need to deal with the case that the token might be on another scene
            "_id": tokenId, //use the original ID not the one from the potentially temp token
            "actorData.data.attributes.hp.temp": newTempHP, 
            "actorData.data.attributes.hp.value": newHP,
            "flags.dae.damgeApplied": appliedDamage
            }))
          } else {
            console.warn(`Could not apply damage to ${tokenId} on ${data.sceneId}`)
          }
        }
      }
    }
    
    tokenIdList.push({ tokenId, oldTempHP: oldTempHP, oldHP, totalDamage: Math.abs(totalDamage), newHP, newTempHP});
    let img = token.data.img || token.actor.img;
    //@ts-ignore
    if (configSettings.usePlayerPortrait && token.actor.data.type === "character")
      img = token.actor?.img || token.data.img;
    if ( VideoHelper.hasVideoExtension(img) ) {
      //@ts-ignore - createThumbnail not defined
      img = await game.video.createThumbnail(img, {width: 100, height: 100});
    }
    
    let listItem = {
      tokenId: tokenId,
      tokenImg: img,
      hpDamage,
      tempDamage: newTempHP - oldTempHP,
      totalDamage: Math.abs(totalDamage),
      halfDamage: Math.abs(Math.floor(totalDamage / 2)),
      doubleDamage: Math.abs(totalDamage * 2),
      appliedDamage,
      absDamage: Math.abs(appliedDamage),
      tokenName: token.name && configSettings.useTokenNames ? token.name : token.actor.name,
      dmgSign: appliedDamage < 0 ? "+" : "-", // negative damage is added to hit points
      newHP,
      newTempHP,
      oldTempHP,
      oldHP,
      buttonId: token.id
    };

    ["di", "dv", "dr"].forEach(trait => {
      const traits = actor.data.data.traits[trait]
      if (traits.custom || traits.value.length > 0) {
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
      user: game.user._id,
      speaker: {scene: canvas.scene.id, alias: game.user.name, user: game.user.id},
      content: content,
      whisper: ChatMessage.getWhisperRecipients("GM").filter(u => u.active),
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      flags: { "midiqol": {"undoDamage": tokenIdList }}
    };
    let message = await ChatMessage.create(chatData);
  }
}

async function doClick(event, tokenId, totalDamage, mult) {
  let token = canvas.tokens.get(tokenId);
  if (!token?.actor) {
    ui.notifications.warn("Token not found in scene")
    console.warn(`Process damage button: Actor for token ${tokenId} not found`);
    return;
  }
  let actor = token.actor;
  log(`Applying ${totalDamage} mult ${mult} HP to ${actor.name}`);
  await actor.applyDamage(totalDamage, mult);
  event.stopPropagation();
}

async function doMidiClick(ev, tokenId, newTempHP, newHP) {
  let token = canvas.tokens.get(tokenId);
  if (!token?.actor) {
    warn(`Process damage button: Actor for token ${tokenId} not found`);
    return;
  }
  let actor = token.actor;
  log(`Setting HP to ${newTempHP} and ${newHP}`);
  await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
}

export let processUndoDamageCard = async(message, html, data) => {
  if (!message.data.flags?.midiqol?.undoDamage) return true;
  let button = html.find("#all-reverse");
  button.click((ev) => {
    message.data.flags.midiqol.undoDamage.forEach(async ({tokenId, oldTempHP, oldHP, totalDamage, newHP, newTempHP}) => {
      let token = canvas.tokens.get(tokenId);
      if (!token?.actor) {
        ui.notifications.warn("Token not found in scene")
        console.warn(`Process damage button: Actor for token ${tokenId} not found`);
        return;
      }
      let actor = token.actor;
      log(`Setting HP back to ${oldTempHP} and ${oldHP}`);
      await actor.update({ "data.attributes.hp.temp": oldTempHP, "data.attributes.hp.value": oldHP });
      ev.stopPropagation();
    })
  })

  button = html.find("#all-apply");
  button.click((ev) => {
    message.data.flags.midiqol.undoDamage.forEach(async ({tokenId, oldTempHP, oldHP, absDamage, newHP, newTempHP}) => {
      let token = canvas.tokens.get(tokenId);
      if (!token?.actor) {
        ui.notifications.warn("Token not found in scene")
        console.warn(`Process damage button: Actor for token ${tokenId} not found`);
        return;
      }
      let actor = token.actor;
      log(`Setting HP to ${newTempHP} and ${newHP}`);
      await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
      ev.stopPropagation();
    })
  })

  message.data.flags.midiqol.undoDamage.forEach(({tokenId, oldTempHP, oldHP, totalDamage, newHP, newTempHP}) => {
    let button = html.find(`#reverse-${tokenId}`);
    //TODO clean this up - one handler with
    button.click(async (ev) => {
      let token = canvas.tokens.get(tokenId);
      if (!token?.actor) {
        ui.notifications.warn("Token not found in scene")
        console.warn(`Process damage button: Actor for token ${tokenId} not found`);
        return;
      }
      let actor = token.actor;

      log(`Setting HP back to ${oldTempHP} and ${oldHP}`);
      await actor.update({ "data.attributes.hp.temp": oldTempHP, "data.attributes.hp.value": oldHP });
      ev.stopPropagation();
    });

    // Default action of button is to do midi damage
    button = html.find(`#apply-${tokenId}`);
    button.click(async (ev) => {
      let token = canvas.tokens.get(tokenId);
      if (!token?.actor) {
        warn(`Process damage button: Actor for token ${tokenId} not found`);
        return;
      }
      let actor = token.actor;
      log(`Setting HP to ${newTempHP} and ${newHP}`);
      await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
      ev.stopPropagation();
    });

    let select = html.find(`#dmg-multiplier-${tokenId}`);
    select.change(async (ev) => {
      let multiplier = html.find(`#dmg-multiplier-${tokenId}`).val();
      button = html.find(`#apply-${tokenId}`);
      button.off('click');
      switch (multiplier) {
        case "Calc":
          button.click(async (ev) => doMidiClick(ev, tokenId, newTempHP, newHP));
          break;
        case "Heal": {
          button.click(async (ev) => doClick(ev, tokenId, totalDamage, -1));
          break;
        }
        case "x1": {
          button.click(async (ev) => doClick(ev, tokenId, totalDamage, 1));
          break;
        }
        case "x1/4": {
          button.click(async (ev) => doClick(ev, tokenId, totalDamage, 0.25));
          break;
        }
        case "x1/2": {
          button.click(async (ev) => doClick(ev, tokenId, totalDamage, 0.5));
          break;
        }
        case "x2": {
          button.click(async (ev) => doClick(ev, tokenId, totalDamage, 2));
          break;
        }
      }
    });
  })
}
