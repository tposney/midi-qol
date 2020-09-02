import { installedModules } from "./setupModules";
import { configSettings } from "./settings";
import { i18n, debug, error, log, undoDamageText, warn } from "../midi-qol";

var traitList = { di: {}, dr: {}, dv: {} };


const moduleSocket = "module.midi-qol";
let processAction = async data => {
  switch (data.action) {
    case "reverseDamageCard":
      if (!game.user.isGM)
        break;
warn("process action ", data.autoApplyDamage)        
      if (data.autoApplyDamage === "none")
        break;
      await createReverseDamageCard(data);
      break;
  }
};

export let setupSocket = () => {
  //@ts-ignore
  game.socket.on(moduleSocket, data => {
    processAction(data);
  });
};

export function broadcastData(data) {
  // if not a gm broadcast the message to a gm who can apply the damage
  if (game.user.id !== data.intendedFor) {
    //@ts-ignore
    game.socket.emit(moduleSocket, data, resp => { });
  } else {
    processAction(data);
  }
}

export function initGMActionSetup() {
  traitList.di = i18n("DND5E.DamImm");
  traitList.dr = i18n("DND5E.DamRes");
  traitList.dv = i18n("DND5E.DamVuln");
  setupSocket();
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
    damageList: [] 
  };
  for (let { tokenID, actorID, tempDamage, hpDamage, totalDamage, appliedDamage } of damageList) {
    token = canvas.tokens.get(tokenID);
    actor = token.actor;
    const hp = actor.data.data.attributes.hp;
    const oldTempHP = hp.temp;
    const oldHP = hp.value;

    if (tempDamage > oldTempHP) {
      var newTempHP = 0;
      hpDamage += (tempDamage - oldTempHP)
    } else {
      var newTempHP = oldTempHP - tempDamage;
    }
    let newHP = Math.max(0, actor.data.data.attributes.hp.value - hpDamage);
    if (data.intendedFor === game.user.id && ["yes", "yesCard"].includes(data.autoApplyDamage)) {
      promises.push(actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP }));
    }
    tokenIdList.push({ tokenID, oldTempHP: oldTempHP, oldHP: hp.value, absDamage: Math.abs(totalDamage), newHP, newTempHP});

    let listItem = {
      tokenId: tokenID,
      hpDamage,
      tempDamage,
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
  //@ts-ignore
  const results = await Promise.allSettled(promises);


  if (["yesCard", "noCard"].includes(data.autoApplyDamage)) {
    const content = await renderTemplate("modules/midi-qol/templates/damage-results.html", templateData);
    const speaker = ChatMessage.getSpeaker();
    speaker.alias = game.user.name;
    let chatData = {
      user: game.user._id,
      speaker,
      content: content,
      whisper: ChatMessage.getWhisperRecipients("GM").filter(u => u.active),
      //flavor: `${i18n("midi-qol.undoDamageFrom")} ${data.sender}`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      flags: { "midiqol": {"undoDamage" :tokenIdList }}
    };
    let message = await ChatMessage.create(chatData);
  }
}

async function doClick(event, tokenId, absDamage, mult) {
  let token = canvas.tokens.get(tokenId);
  if (!token?.actor) {
    warn(`Process damage button: Actor for token ${tokenId} not found`);
    return;
  }
  let actor = token.actor;
  log(`Applying ${absDamage} mult ${mult} HP to ${actor.name}`);
  await actor.applyDamage(absDamage, mult);
  event.stopPropagation();
}

export let processUndoDamageCard = async(message, html, data) => {
  if (!message.data.flags?.midiqol?.undoDamage) return true;
  message.data.flags.midiqol.undoDamage.forEach(({tokenID, oldTempHP, oldHP, absDamage, newHP, newTempHP}) => {
    let button = html.find(`#reverse-${tokenID}`);
      //TODO clean this up - one handler with
    button.click(async (ev) => {
      let token = canvas.tokens.get(tokenID);
      if (!token?.actor) {
        warn(`Process damage button: Actor for token ${tokenID} not found`);
        return;
      }
      let actor = token.actor;

      log(`Setting HP back to ${oldTempHP} and ${oldHP}`);
      await actor.update({ "data.attributes.hp.temp": oldTempHP, "data.attributes.hp.value": oldHP });
      ev.stopPropagation();
    });
    button = html.find(`#apply-${tokenID}`);
    button.click(async (ev) => {
      let token = canvas.tokens.get(tokenID);
      if (!token?.actor) {
        warn(`Process damage button: Actor for token ${tokenID} not found`);
        return;
      }
      let actor = token.actor;
      log(`Setting HP to ${oldTempHP} and ${oldHP}`);
      await actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP });
      ev.stopPropagation();
    });
    button = html.find(`#full-${tokenID}`);
    button.click(async (ev) => doClick(ev, tokenID, absDamage, 1));
    button = html.find(`#half-${tokenID}`);
    button.click(async (ev) => doClick(ev, tokenID, absDamage, 0.5));
    button = html.find(`#double-${tokenID}`);
    button.click(async (ev) => doClick(ev, tokenID, absDamage, 2));

    button = html.find(`#heal-${tokenID}`);
    button.click(async (ev) => doClick(ev, tokenID, absDamage, -1));
  })
}
