import { installedModules } from "./setupModules";
import { configSettings} from "./settings";
import { i18n, debug, error } from "../midi-qol";

var traitList = {di: {}, dr: {}, dv: {}};


const moduleSocket = "module.midi-qol";
let processAction = async data => {
  switch (data.action) {
      case "reverseDamageCard":
          if (!game.user.isGM)
              break;
          if (configSettings.autoApplyDamage === "none")
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
  if (data.intendedFor === game.user.id) {
    let whisperText = "";
    const damageList = data.damageList;
    const btnStyling = "width: 22px; height:22px; font-size:10px;line-height:1px";
    let token, actor;
    const timestamp = Date.now();
    let sep = "";
    let promises = [];
    let tokenIdList = [];
    for (let { tokenID, actorID, tempDamage, hpDamage, totalDamage, appliedDamage } of damageList) {
        token = canvas.tokens.get(tokenID);
        actor = token.actor;
        const hp = actor.data.data.attributes.hp;
        var oldTempHP = hp.temp;
        var oldHP = hp.value;

        tokenIdList.push({tokenID, oldTempHP: oldTempHP, oldHP: hp.value});
        if (tempDamage > oldTempHP) {
          var newTempHP = 0;
          hpDamage += (tempDamage - oldTempHP)
        } else {
          var newTempHP = oldTempHP - tempDamage;
        }
        let newHP = Math.max(0, actor.data.data.attributes.hp.value - hpDamage);
        promises.push(actor.update({ "data.attributes.hp.temp": newTempHP, "data.attributes.hp.value": newHP }));
        let buttonID = `${token.id}`;
        let btntxt = `<button id="${buttonID}"style="${btnStyling}"><i class="fas fa-user-plus" title="Click to reverse damage."></i></button>`;
        let tokenName = token.name && configSettings.useTokenNames ? `<strong>${token.name}</strong>` : token.actor.name;
        let dmgSign = appliedDamage < 0 ? "+" : "-"; // negative damage is added to hit points
        if (oldTempHP > 0)
            whisperText = whisperText.concat(`${sep}${duplicate(btntxt)} ${tokenName}<br> (${oldHP}:${oldTempHP}) ${dmgSign} ${Math.abs(appliedDamage)}[${totalDamage}] -> (${newHP}:${newTempHP})`);
        else
            whisperText = whisperText.concat(`${sep}${duplicate(btntxt)} ${tokenName}<br> ${oldHP} ${dmgSign} ${Math.abs(appliedDamage)}[${totalDamage}] -> ${newHP}`);
        ["di", "dv", "dr"].forEach(trait => {
          let traits = actor.data.data.traits[trait]
          if (traits.custom || traits.value.length > 0) {
            whisperText = whisperText.concat(`<br>${traitList[trait]}: ${traits.value.map(t=>CONFIG.DND5E.damageResistanceTypes[t]).concat(traits.custom)}`);
          }
        });
        sep = "<br>";
    }
    //@ts-ignore
    let results =  await Promise.allSettled(promises);

    const speaker = ChatMessage.getSpeaker();
    speaker.alias = game.user.name;
    console.log("Whisper text is ", whisperText)
    if (configSettings.autoApplyDamage === "yesCard") {
      let chatData = {
        user: game.user._id,
        speaker,
        content: whisperText,
        whisper: ChatMessage.getWhisperRecipients("GM").filter(u=>u.active),
        flavor: `${i18n("midi-qol.undoDamageFrom")} ${data.sender}`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        flags: {"midi-qol": tokenIdList}
      };
      let message = await ChatMessage.create(chatData);
    }
  }
};
