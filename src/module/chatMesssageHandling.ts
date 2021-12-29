import { debug, log, warn, i18n, error, MESSAGETYPES, timelog, gameStats, debugEnabled, MQdefaultDamageType, i18nFormat } from "../midi-qol.js";
import { dice3dEnabled, installedModules } from "./setupModules.js";
import { BetterRollsWorkflow, DDBGameLogWorkflow, Workflow, WORKFLOWSTATES } from "./workflow.js";
import { nsaFlag, coloredBorders, addChatDamageButtons, configSettings, forceHideRoll } from "./settings.js";
import { createDamageList, getTraitMult, calculateDamage, MQfromUuid, MQfromActorUuid, playerFor, playerForActor } from "./utils.js";
import { shouldRollOtherDamage, showItemCard } from "./itemhandling.js";
import { socketlibSocket } from "./GMAction.js";
export const MAESTRO_MODULE_NAME = "maestro";
export const MODULE_LABEL = "Maestro";

export function mergeCardSoundPlayer(message, update, options, user) {
  if (debugEnabled > 1) debug("Merge card sound player ", message.data, getProperty(update, "flags.midi-qol.playSound"), message.data.sound)
  const firstGM = game.user; //game.users.find(u=> u.isGM && u.active);
  if (game.user !== firstGM) return true;
  const updateFlags = getProperty(update, "flags.midi-qol") || {};
  const midiqolFlags = mergeObject(getProperty(message.data, "flags.midi-qol") || {}, updateFlags, { inplace: false, overwrite: true })
  if (midiqolFlags.playSound && configSettings.useCustomSounds) {
    const playlist = game.playlists?.get(configSettings.customSoundsPlaylist);
    //@ts-ignore .sounds
    const sound = playlist?.sounds.find(s => s.id === midiqolFlags.sound)
    const delay = (dice3dEnabled() && midiqolFlags?.waitForDiceSoNice && [MESSAGETYPES.HITS].includes(midiqolFlags.type)) ? 500 : 0;
    if (debugEnabled > 1) debug("mergeCardsound player ", update, playlist, sound, sound ? 'playing sound' : 'not palying sound', delay)

    if (sound && game.user?.isGM) {
      setTimeout(() => {
        //@ts-ignore playSound
        playlist?.playSound(sound);
      }, delay)
    }
    return true;
  }
  return true;
}

export function betterRollsUpdate(message, update, options, user) {
  if (game.user?.id !== user) return true;
  const flags = message.data.flags;
  if(update.flags && update.flags["midi-qol"])  {
    // Should be a hits display update
    return;
  }
  const brFlags: any = flags?.betterrolls5e;
  if (!brFlags) return true;
  let actorId = brFlags.actorId;
  let tokenId = brFlags.tokenId;
  if (tokenId && !tokenId.startsWith("Scene")) { // remove when BR passes a uuid instead of constructed id.
    const parts = tokenId.split(".");
    tokenId = `Scene.${parts[0]}.Token.${parts[1]}`
  }
  let token: Token = tokenId && MQfromUuid(tokenId)

  let actor;
  if (token) actor = token.actor;
  else actor = game.actors?.get(actorId);
  let damageList: any[] = [];
  let otherDamageList: any[] = [];
  const item = actor?.items.get(brFlags.itemId)
  let workflow = Workflow.getWorkflow(item?.uuid);
  if (!workflow || workflow.damageRolled) return true;
  let otherDamageRoll;
  for (let entry of brFlags.entries) {
    if (entry.type === "damage-group") {
      for (const subEntry of entry.entries) {
        let damage = subEntry.baseRoll?.total ?? 0;
        let type = subEntry.damageType;
        if (workflow.isCritical && subEntry.critRoll) {
          damage += subEntry.critRoll.total;
        }
        if (type === "") {
          type = MQdefaultDamageType;
          if (item?.data.data.actionType === "heal") type = "healing";
        }
        // Check for versatile and flag set. TODO damageIndex !== other looks like nonsense.
        if (subEntry.damageIndex !== "other")
          damageList.push({ type, damage });
        else {
          otherDamageList.push({ type, damage });
          if (subEntry.baseRoll instanceof Roll) otherDamageRoll = subEntry.baseRoll;
          else otherDamageRoll = Roll.fromData(subEntry.baseRoll);
        }
      }
    }
  }
  // Assume it is a damage roll
  workflow.damageDetail = damageList;
  workflow.damageTotal = damageList.reduce((acc, a) => a.damage + acc, 0);
  if (!workflow.shouldRollOtherDamage) {
    otherDamageList = [];
    // TODO find out how to remove it from the better rolls card?
  }
  workflow.damageRolled = true;
  if (otherDamageList.length > 0) {
    workflow.otherDamageTotal = otherDamageList.reduce((acc, a) => a.damage + acc, 0);
    //@ts-ignore evaluate
    workflow.otherDamageRoll = otherDamageRoll;
  }
  workflow.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);
  return true;
}

export let processCreateBetterRollsMessage = (message: ChatMessage, user: string) => {
  if (game.user?.id !== user) return true;
  const flags = message.data.flags;
  const brFlags: any = flags?.betterrolls5e;
  if (!brFlags) return true;
  //@ts-ignore
  if (debugEnabled > 1) debug("process precratebetteerrollscard ", message.data, installedModules["betterrolls5e"], message.data.content?.startsWith('<div class="dnd5e red-full chat-card"'))

  let actorId = brFlags.actorId;
  let tokenId = brFlags.tokenId;
  if (tokenId && !tokenId.startsWith("Scene")) { // remove when BR passes a uuid instead of constructed id.
    const parts = tokenId.split(".");
    tokenId = `Scene.${parts[0]}.Token.${parts[1]}`
  }
  let token: Token = tokenId && MQfromUuid(tokenId)

  let actor;
  if (token) actor = token.actor;
  else actor = game.actors?.get(actorId);
  // Get the Item from stored flag data or by the item ID on the Actor
  const storedData = message.getFlag("dnd5e", "itemData") ?? brFlags.params.itemData;
  //@ts-ignored ocumentClass
  const item = storedData ? new CONFIG.Item.documentClass(storedData, { parent: actor }) : actor.items.get(brFlags.itemId);
  if (!item) return;
  // Try and help name hider
  //@ts-ignore speaker
  if (message.data.speaker) {
    //@ts-ignore speaker, update
    if (!message.data.speaker?.scene) message.data.update({ "speaker.scene": canvas.scene.id });
    //@ts-ignore speaker, update
    if (!message.data.speaker?.token && tokenId) message.data.update({ "speaker.token": tokenId });
  }

  let damageList: any[] = [];
  let otherDamageList: any[] = [];
  let workflow = Workflow.getWorkflow(item.uuid);
  // Get attack roll info
  const attackEntry = brFlags.entries?.find((e) => e.type === "multiroll" && e.rollType === "attack");
  let attackTotal = attackEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
  let advantage = attackEntry ? attackEntry.rollState === "highest" : undefined;
  let disadvantage = attackEntry ? attackEntry.rollState === "lowest" : undefined;
  let diceRoll = attackEntry ? attackEntry.entries?.find((e) => !e.ignored)?.roll.terms[0].total : -1;
  let isCritical = attackEntry ? attackEntry.entries?.find((e) => !e.ignored)?.isCrit : false;
  let otherDamageRoll;
  for (let entry of brFlags.entries) {
    if (entry.type === "damage-group") {
      for (const subEntry of entry.entries) {
        let damage = subEntry.baseRoll?.total ?? 0;
        let type = subEntry.damageType;
        if (isCritical && subEntry.critRoll) {
          damage += subEntry.critRoll.total;
        }
        if (type === "") {
          type = MQdefaultDamageType;
          if (item?.data.data.actionType === "heal") type = "healing";
        }
        // Check for versatile and flag set. TODO damageIndex !== other looks like nonsense.
        if (subEntry.damageIndex !== "other")
          damageList.push({ type, damage });
        else {
          otherDamageList.push({ type, damage });
          if (subEntry.baseRoll instanceof Roll) otherDamageRoll = subEntry.baseRoll;
          else otherDamageRoll = Roll.fromData(subEntry.baseRoll);
        }
      }
    }
  }
  // TODO find out how to set the ammo  workflow.ammo = this._ammo;

  //@ts-ignore udpate
  const targets = (item?.data.data.target?.type === "self") ? new Set([token]) : new Set(game.user?.targets);

  if (!workflow) workflow = new BetterRollsWorkflow(actor, item, message.data.speaker, targets, null);
  workflow.isCritical = isCritical;
  workflow.isFumble = diceRoll === 1;
  workflow.attackTotal = attackTotal;
  workflow.itemCardId = message.id;
  workflow.ammo = item._ammo;

  //@ts-ignore evaluate
  workflow.attackRoll = new Roll(`${attackTotal}`).evaluate({ async: false });
  if (configSettings.keepRollStats && item.hasAttack) {
    gameStats.addAttackRoll({ rawRoll: diceRoll, total: attackTotal, fumble: workflow.isFumble, critical: workflow.isCritical }, item);
  }
  workflow.damageDetail = damageList;
  workflow.damageTotal = damageList.reduce((acc, a) => a.damage + acc, 0);

  workflow.itemLevel = brFlags.params.slotLevel ?? 0;
  workflow.itemCardData = message.data;
  workflow.advantage = advantage;
  workflow.disadvantage = disadvantage;
  if (!workflow.tokenId) workflow.tokenId = token?.id;
  if (configSettings.concentrationAutomation) {
    const concentrationName = installedModules.get("combat-utility-belt")
      ? game.settings.get("combat-utility-belt", "concentratorConditionName")
      : i18n("midi-qol.Concentrating");
    const needsConcentration = workflow.item?.data.data.components?.concentration || workflow.item?.data.data.activation?.condition?.includes("Concentration");
    const checkConcentration = configSettings.concentrationAutomation;
    if (needsConcentration && checkConcentration) {
      const concentrationCheck = item.actor.data.effects.find(i => i.label === concentrationName);
      if (concentrationCheck) concentrationCheck.delete();
      // if (needsConcentration)addConcentration({workflow});
    }
  }
  const hasEffects = workflow.hasDAE && item.data.effects.find(ae => !ae.transfer);
  if (hasEffects && !configSettings.autoItemEffects) {
    //@ts-ignore
    const searchString = '<footer class="card-footer">';
    const button = `<button data-action="applyEffects">${i18n("midi-qol.ApplyEffects")}</button>`
    const replaceString = `<div class="card-buttons-midi-br">${button}</div><footer class="card-footer">`;
    //@ts-ignore
    message.update({ "content": message.data.content.replace(searchString, replaceString) });
  }
  // Workflow will be advanced when the better rolls card is displayed.
  // Workflow.removeWorkflow(workflow.uuid);
  workflow.needItemCard = false;
  // check activaiton condition and remove other damage if required
  workflow.shouldRollOtherDamage = shouldRollOtherDamage.bind(item)(workflow, configSettings.rollOtherDamage, configSettings.rollOtherSpellDamage);
  if (!workflow.shouldRollOtherDamage) {
    otherDamageList = [];
    // TODO find out how to remove it from the better rolls card?
  }

  if (otherDamageList.length > 0) {
    workflow.otherDamageTotal = otherDamageList.reduce((acc, a) => a.damage + acc, 0);
    //@ts-ignore evaluate
    workflow.otherDamageRoll = otherDamageRoll;
  }
  if (!workflow.needTemplate) workflow.next(WORKFLOWSTATES.NONE);
  return true;
}

export let diceSoNiceHandler = async (message, html, data) => {
  //@ts-ignore game.dice3d
  if (!dice3dEnabled() || game.dice3d?.messageHookDisabled) return;
  if (debugEnabled > 1) debug("Dice so nice handler ", message, html, data);
  // Roll the 3d dice if we are a gm, or the message is not blind and we are the author or a recipient (includes public)
  let rollDice = game.user?.isGM ||
    (!message.data.blind && (message.isAuthor || message.data.whisper.length === 0 || message.data.whisper?.includes(game.user?.id)));
  if (!rollDice) {
    return;
  }

  if (configSettings.mergeCard) {
    return;
  }

  if (!getProperty(message.data, "flags.midi-qol.waitForDiceSoNice")) return;
  if (debugEnabled > 1) debug("dice so nice handler - non-merge card", html)

  // better rolls handles delaying the chat card until complete.
  if (!configSettings.mergeCard && installedModules.get("betterrolls5e")) return;
  html.hide();
  Hooks.once("diceSoNiceRollComplete", (id) => {
    let savesDisplay = $(html).find(".midi-qol-saves-display").length === 1;
    let hitsDisplay = configSettings.mergeCard ?
      $(html).find(".midi-qol-hits-display").length === 1
      : $(html).find(".midi-qol-single-hit-card").length === 1;
    if (savesDisplay) {
      if (game.user?.isGM || (configSettings.autoCheckSaves !== "whisper" && !message.data.blind))
        html.show()
    } else if (hitsDisplay) {
      if (game.user?.isGM || (configSettings.autoCheckHit !== "whisper" && !message.data.blind))
        html.show()
    } else {
      html.show();
      //@ts-ignore
      ui.chat.scrollBottom()

      setTimeout(() => {
        html.show();
        //@ts-ignore
        ui.chat.scrollBottom()
      }, 3000); // backup display of messages
    }
  });
  return true;
}

export let colorChatMessageHandler = (message, html, data) => {
  if (coloredBorders === "none") return true;
  let actorId = message.data.speaker.actor;
  let userId = message.data.user;
  let actor = game.actors?.get(actorId);
  let user = game.users?.get(userId);

  if (actor) user = playerForActor(actor);
  if (!user) return true;
  //@ts-ignore .color not defined
  html[0].style.borderColor = user.data.color;
  // const oldColor = html[0].children[0].children[0].style.backgroundColor;
  const oldColor = html[0].children[0].children[0].style.backgroundColor;
  if (coloredBorders === "borderNamesBackground") {
    html[0].children[0].children[0].style["text-shadow"] = `1px 1px 1px #FFFFFF`;
    //@ts-ignore .color not defined
    html[0].children[0].children[0].style.backgroundColor = user.data.color;
  } else if (coloredBorders === "borderNamesText") {
    //@ts-ignore .color not defined
    html[0].children[0].children[0].style["text-shadow"] = `1px 1px 1px ${html[0].children[0].children[0].style.color}`;
    //@ts-ignore .color not defined
    html[0].children[0].children[0].style.color = user.data.color;
  }
  return true;
}

export let nsaMessageHandler = (message, data, ...args) => {
  if (!nsaFlag || !message.data.whisper || message.data.whisper.length === 0) return true;
  let gmIds = ChatMessage.getWhisperRecipients("GM").filter(u => u.active)?.map(u => u.id);
  let currentIds = message.data.whisper.map(u => typeof (u) === "string" ? u : u.id);
  gmIds = gmIds.filter(id => !currentIds.includes(id));
  if (debugEnabled > 1) debug("nsa handler active GMs ", gmIds, " current ids ", currentIds, "extra gmids ", gmIds)
  if (gmIds.length > 0) message.data.update({ "whisper": currentIds.concat(gmIds) });
  // TODO check this data.whisper = data.whisper.concat(gmIds);
  return true;
}

let _highlighted: Token | null = null;

let _onTargetHover = (event) => {

  event.preventDefault();
  if (!canvas?.scene?.data.active) return;
  const token: Token | undefined = canvas.tokens?.get(event.currentTarget.id);
  if (token?.isVisible) {
    //@ts-ignore _controlled, _onHoverIn
    if (!token?._controlled) token._onHoverIn(event);
    _highlighted = token;
  }
}

/* -------------------------------------------- */

/**
 * Handle mouse-unhover events for a combatant in the tracker
 * @private
 */
let _onTargetHoverOut = (event) => {
  event.preventDefault();
  if (!canvas?.scene?.data.active) return;
  //@ts-ignore onHoverOut
  if (_highlighted) _highlighted._onHoverOut(event);
  _highlighted = null;
}

let _onTargetSelect = (event) => {
  event.preventDefault();
  if (!canvas?.scene?.data.active) return;
  const token = canvas.tokens?.get(event.currentTarget.id);
  //@ts-ignore multiSelect
  token?.control({ multiSelect: false, releaseOthers: true });
};

export let hideRollRender = (msg, html, data) => {
  if (forceHideRoll && (msg.data.whisper.length > 0 || msg.data?.blind)) {
    if (!game.user?.isGM && !msg.isAuthor && msg.data.whisper.indexOf(game.user?.id) === -1) {
      if (debugEnabled > 0) warn("hideRollRender | hiding message", msg.data.whisper)
      // html.hide();
      html.remove();
    }
  }
  return true;
};

export let hideRollUpdate = (message, data, diff, id) => {
  if (forceHideRoll && message.data.whisper.length > 0 || message.data.blind) {
    if (!game.user?.isGM && ((!message.isAuthor && (message.data.whisper.indexOf(game.user?.id) === -1) || message.data.blind))) {
      let messageLi = $(`.message[data-message-id=${data._id}]`);
      if (debugEnabled > 0) warn("hideRollUpdate: Hiding ", message.data.whisper, messageLi)
      messageLi.hide();
      //@ts-ignore
      if (window.ui.sidebar.popouts.chat) {
        //@ts-ignore
        let popoutLi = window.ui.sidebar.popouts.chat.element.find(`.message[data-message-id=${data._id}]`)
        popoutLi.hide();
      }
    }
  }
  return true;
};

export let hideStuffHandler = (message, html, data) => {
  if (debugEnabled > 1) debug("hideStuffHandler message: ", message.id, message)

  if ((forceHideRoll || configSettings.mergeCard) && message.data.blind && !game.user?.isGM) {
    html.hide();
    return;
  }
  if (forceHideRoll
    && !game.user?.isGM
    && message.data.whisper.length > 0 && !message.data.whisper.includes(game.user?.id)
    && !message.isAuthor) {
    html.hide();
    return;
  }
  const midiqolFlags = getProperty(message.data, "flags.midi-qol");
  let ids = html.find(".midi-qol-target-name")
  // const actor = game.actors.get(message?.speaker.actor)
  // let buttonTargets = html.getElementsByClassName("minor-qol-target-npc");
  ids.hover(_onTargetHover, _onTargetHoverOut)
  if (game.user?.isGM) {
    ids.click(_onTargetSelect);
  }

  // Hide saving throw tool tips to non-gms
  if (!game.user?.isGM) {
    html.find(".midi-qol-save-tooltip").hide();
    if (configSettings.autoCheckSaves === "allNoRoll")
      html.find(".midi-qol-save-total").hide();
  }
  // Hide saving throws if not rolled by me.
  if (!game.user?.isGM && ["all", "whisper", "allNoRoll"].includes(configSettings.autoCheckSaves) && message.isRoll &&
    (message.data.flavor?.includes(i18n("DND5E.ActionSave")) || message.data.flavor?.includes(i18n("DND5E.ActionAbil")))) {
    if (game.user?.id !== message.user.id) {
      html.hide();
      return;
    }
  }

  if (game.user?.isGM && $(html).find(".midi-qol-hits-display").length) {
    if (configSettings.mergeCard) {
      $(html).find(".midi-qol-hits-display").show();
    } else {
      html.show();
    }
    html.find(".midi-qol-target-npc-Player").hide();
    //@ts-ignore
    ui.chat.scrollBottom
    return;
  }
  if (game.user?.isGM) {
    html.find(".midi-qol-target-npc-Player").hide();
  } else {
    html.find(".midi-qol-target-npc-GM").hide();
  }
  if (!game.user?.isGM && !configSettings.displaySaveDC) {
    html.find(".midi-qol-saveDC").hide();
  }
  if (message.user?.isGM && !game.user?.isGM && configSettings.hideRollDetails !== "none") {
    const d20AttackRoll = getProperty(message.data.flags, "midi-qol.d20AttackRoll");
    if (d20AttackRoll && configSettings.hideRollDetails === "d20AttackOnly") {
      html.find(".dice-tooltip").remove();
      html.find(".dice-formula").remove();
      html.find(".midi-qol-attack-roll .dice-total").text(`(d20) ${d20AttackRoll}`);
      html.find(".midi-qol-damage-roll").find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      html.find(".midi-qol-other-roll").find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      html.find(".midi-qol-bonus-roll").find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
    } else if (d20AttackRoll && configSettings.hideRollDetails === "d20Only") {
      html.find(".midi-qol-attack-roll .dice-total").text(`(d20) ${d20AttackRoll}`);
      html.find(".dice-tooltip").remove();
      html.find(".dice-formula").remove();
      html.find(".midi-qol-damage-roll").find(".dice-tooltip").remove();
      html.find(".midi-qol-damage-roll").find(".dice-formula").remove();
      html.find(".midi-qol-other-roll").find(".dice-tooltip").remove();
      html.find(".midi-qol-other-roll").find(".dice-formula").remove();
      html.find(".midi-qol-bonus-roll").find(".dice-tooltip").remove();
      html.find(".midi-qol-bonus-roll").find(".dice-formula").remove();
      /* TODO remove this pending feedback
            html.find(".midi-qol-damge-roll").find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
            html.find(".midi-qol-other-roll").find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
            html.find(".midi-qol-bonus-roll").find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      */
    } else if (d20AttackRoll && configSettings.hideRollDetails === "hitDamage") {
      const hitFlag = getProperty(message.data.flags, "midi-qol.isHit");
      const hitString = hitFlag === undefined ? "" : hitFlag ? i18n("midi-qol.hits") : i18n("midi-qol.misses");
      html.find(".midi-qol-attack-roll .dice-total").text(`${hitString}`);
      html.find(".dice-tooltip").remove();
      html.find(".dice-formula").remove();
      html.find(".midi-qol-damage-roll").find(".dice-tooltip").remove();
      html.find(".midi-qol-damage-roll").find(".dice-formula").remove();
      html.find(".midi-qol-other-roll").find(".dice-tooltip").remove();
      html.find(".midi-qol-other-roll").find(".dice-formula").remove();
      html.find(".midi-qol-bonus-roll").find(".dice-tooltip").remove();
      html.find(".midi-qol-bonus-roll").find(".dice-formula").remove();
    } else if (configSettings.hideRollDetails === "all" || message.data.blind) {
      // html.find(".midi-qol-attack-roll .dice-total").text(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      html.find(".midi-qol-attack-roll .dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      html.find(".midi-qol-damage-roll").find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      html.find(".midi-qol-other-roll").find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      html.find(".midi-qol-bonus-roll").find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      html.find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      //TODO this should probably just check formula
    } else if (["details", "detailsDSN"].includes(configSettings.hideRollDetails)) {
      html.find(".dice-tooltip").remove();
      html.find(".dice-formula").remove();
    }
  }

  if (!game.user?.isGM && (configSettings.autoCheckHit === "whisper" || message.data.blind)) {
    if (configSettings.mergeCard) {
      html.find(".midi-qol-hits-display").hide();
    } else {
      if (html.find(".midi-qol-single-hit-card").length === 1) {
        html.hide();
      }
    }
  }
  if (!game.user?.isGM && (configSettings.autoCheckSaves === "whisper" || message.data.blind)) {
    if (configSettings.mergeCard) {
      html.find(".midi-qol-saves-display").hide();
    } else {
      if (html.find(".midi-qol-saves-display").length === 1) {
        html.hide();
      }
    }
  }
  //@ts-ignore
  setTimeout(() => ui.chat.scrollBottom(), 0);
}

export function betterRollsButtons(message, html, data) {
  if (!message.data.flags.betterrolls5e) return;
  //@ts-ignore speaker
  const betterRollsFlags = message.data.flags.betterrolls5e;
  if (!Workflow.getWorkflow(betterRollsFlags.itemId)) {
    html.find('.card-buttons-midi-br').remove();
  } else {
    html.find('.card-buttons-midi-br').off("click", 'button');
    html.find('.card-buttons-midi-br').on("click", 'button', onChatCardAction.bind(this))
  }
}

export let chatDamageButtons = (message, html, data) => {
  if (debugEnabled > 1) debug("Chat Damage Buttons ", addChatDamageButtons, message, message.data.flags?.dnd5e?.roll?.type, message.data.flags)
  const shouldAddButtons = !addChatDamageButtons
    || addChatDamageButtons === "both"
    || (addChatDamageButtons === "gm" && game.user?.isGM)
    || (addChatDamageButtons === "pc" && !game.user?.isGM);

  if (!shouldAddButtons) {
    return true;
  }
  if (["other", "damage"].includes(message.data.flags?.dnd5e?.roll?.type)) {
    let item;
    let itemId;
    let actorId = message.data.speaker.actor;
    if (message.data.flags?.dnd5e?.roll?.type === "damage") {
      itemId = message.data.flags.dnd5e?.roll.itemId;
      if (game.system.id === "sw5e" && !itemId) itemId = message.data.flags.sw5e?.roll.itemId;

      item = game.actors?.get(actorId)?.items.get(itemId);
      if (!item) {
        if (debugEnabled > 0) warn("Damage roll for non item");
        return;
      }
    }
    let itemUuid = `Actor.${actorId}.Item.${itemId}`;
    // find the item => workflow => damageList, totalDamage
    const defaultDamageType = (item?.data.data.damage.parts[0] && item?.data.data.damage?.parts[0][1]) ?? "bludgeoning";
    // TODO fix this for versatile damage
    const damageList = createDamageList({ roll: message.roll, item, versatile: false, defaultType: defaultDamageType });
    const totalDamage = message.roll.total;
    addChatDamageButtonsToHTML(totalDamage, damageList, html, actorId, itemUuid, "damage", ".dice-total", "position:relative; top:5px; color:blue");
  } else if (getProperty(message.data, "flags.midi-qol.damageDetail")) {
    let midiFlags = getProperty(message.data, "flags.midi-qol");
    addChatDamageButtonsToHTML(midiFlags.damageTotal, midiFlags.damageDetail, html, midiFlags.actorUuid, midiFlags.itemUuid, "damage", ".midi-qol-damage-roll .dice-total");
    addChatDamageButtonsToHTML(midiFlags.otherDamageTotal, midiFlags.otherDamageDetail, html, midiFlags.actorUuid, midiFlags.itemUuid, "other", ".midi-qol-other-roll .dice-total");
    addChatDamageButtonsToHTML(midiFlags.bonusDamageTotal, midiFlags.bonusDamageDetail, html, midiFlags.actorUuid, midiFlags.itemUuid, "other", ".midi-qol-bonus-roll .dice-total");
  }
  return true;
}

export function addChatDamageButtonsToHTML(totalDamage, damageList, html, actorId, itemUuid, tag = "damage", toMatch = ".dice-total", style = "margin: 0px;") {

  if (debugEnabled > 1) debug("addChatDamageButtons", totalDamage, damageList, html, actorId, itemUuid, toMatch, html.find(toMatch))
  const btnContainer = $('<span class="dmgBtn-container-mqol"></span>');
  let btnStylinggreen = `width: 20%; height:100%; background-color:lightgreen; line-height:1px; ${style}`;
  let btnStylingred = `width: 20%; height:100%; background-color:lightcoral; line-height:1px; ${style}`;
  const fullDamageButton = $(`<button class="dice-total-full-${tag}-button" style="${btnStylingred}"><i class="fas fa-user-minus" title="Click to apply up to ${totalDamage} damage to selected token(s)."></i></button>`);
  const halfDamageButton = $(`<button class="dice-total-half-${tag}-button" style="${btnStylingred}"><i title="Click to apply up to ${Math.floor(totalDamage / 2)} damage to selected token(s).">&frac12;</i></button>`);
  const doubleDamageButton = $(`<button class="dice-total-double-${tag}-button" style="${btnStylingred}"><i title="Click to apply up to ${totalDamage * 2} damage to selected token(s).">2</i></button>`);
  const fullHealingButton = $(`<button class="dice-total-full-${tag}-healing-button" style="${btnStylinggreen}"><i class="fas fa-user-plus" title="Click to heal up to ${totalDamage} to selected token(s)."></i></button>`);

  btnContainer.append(fullDamageButton);
  btnContainer.append(halfDamageButton);
  btnContainer.append(doubleDamageButton);
  btnContainer.append(fullHealingButton);
  html.find(toMatch).append(btnContainer);
  // Handle button clicks
  let setButtonClick = (buttonID, mult) => {
    let button = html.find(buttonID);
    button.off("click");
    button.click(async (ev) => {
      ev.stopPropagation();
      // const item = game.actors.get(actorId).items.get(itemId);
      const item = MQfromUuid(itemUuid)
      // find solution for non-magic weapons
      let promises: Promise<any>[] = [];
      if (canvas?.tokens) for (let t of canvas.tokens.controlled) {
        let a: any | null = t.actor;
        if (!a) continue;
        let appliedDamage = 0;
        for (let { damage, type } of damageList) {
          appliedDamage += Math.floor(damage * getTraitMult(a, type, item));
        }
        appliedDamage = Math.floor(Math.abs(appliedDamage)) * mult;
        let damageItem = calculateDamage(a, appliedDamage, t, totalDamage, "", null);
        promises.push(a.update({ "data.attributes.hp.temp": damageItem.newTempHP, "data.attributes.hp.value": damageItem.newHP }, { dhp: damageItem.newHP - a.data.data.attributes.hp.value }));
      }
      let retval = await Promise.all(promises);
      return retval;
    });
  };
  setButtonClick(`.dice-total-full-${tag}-button`, 1);
  setButtonClick(`.dice-total-half-${tag}-button`, 0.5);
  setButtonClick(`.dice-total-double-${tag}-button`, 2);
  setButtonClick(`.dice-total-full-${tag}-healing-button`, -1);
  // logic to only show the buttons when the mouse is within the chatcard and a token is selected
  html.find('.dmgBtn-container-mqol').hide();
  $(html).hover(evIn => {
    if (canvas?.tokens?.controlled && canvas.tokens.controlled.length > 0) {
      html.find('.dmgBtn-container-mqol').show();
    }
  }, evOut => {
    html.find('.dmgBtn-container-mqol').hide();
  });
  return html;
}

export function processItemCardCreation(message, user) {
  const midiFlags = message.data.flags["midi-qol"];
  if (user === game.user?.id && midiFlags?.workflowId) { // check to see if it is a workflow
    const workflow = Workflow.getWorkflow(midiFlags.workflowId);
    if (!workflow) return;
    if (!workflow.itemCardId) {
      workflow.itemCardId = message.id;
    }
    if (workflow.kickStart) {
      workflow.kickStart = false;
      workflow.next(WORKFLOWSTATES.NONE);
    }
  }
  if (debugEnabled > 1) debug("Doing item card creation", configSettings.useCustomSounds, configSettings.itemUseSound, midiFlags?.type)
  if (configSettings.useCustomSounds && midiFlags?.type === MESSAGETYPES.ITEM) {
    const playlist = game.playlists?.get(configSettings.customSoundsPlaylist);
    //@ts-ignore playlist.sounds
    const sound = playlist?.sounds.find(s => s.id === midiFlags?.sound);
    const delay = 0;
    if (sound && game.user?.isGM) {
      setTimeout(() => {
        // sound.playing = true;
        //@ts-ignore playSound
        playlist?.playSound(sound);
      }, delay)
    }
  }
}

export async function onChatCardAction(event) {
  event.preventDefault();
  // Extract card data
  const button = event.currentTarget;
  button.disabled = true;
  const card = button.closest(".chat-card");
  const messageId = card.closest(".message").dataset.messageId;
  const message = game.messages?.get(messageId);
  const action = button.dataset.action;
  let targets = game.user?.targets;

  // Validate permission to proceed with the roll
  if (!(game.user?.isGM || message?.isAuthor)) return;
  if (!(targets && targets.size > 0)) return; // cope with targets undefined
  if (action !== "applyEffects") return;

  //@ts-ignore speaker
  const betterRollsFlags: any = message.data.flags.betterrolls5e;
  var actor, item;
  if (betterRollsFlags) {
    actor = game.actors?.get(betterRollsFlags.actorId);
    item = actor.items.get(betterRollsFlags.itemId);
  } else {
    // Recover the actor for the chat card
    //@ts-ignore
    actor = await CONFIG.Item.documentClass._getChatCardActor(card);
    if (!actor) return;

    // Get the Item from stored flag data or by the item ID on the Actor
    const storedData = message?.getFlag(game.system.id, "itemData");
    //@ts-ignore
    item = storedData ? new CONFIG.Item.documentClass(storedData, { parent: actor }) : actor.items.get(card.dataset.itemId);
    if (!item) { // TODO investigate why this is occuring
      // return ui.notifications.error(game.i18n.format("DND5E.ActionWarningNoItem", {item: card.dataset.itemId, name: actor.name}))
    }
  }
  if (!actor || !item) return;
  let workflow = Workflow.getWorkflow(item.uuid);
  if (workflow) {
    workflow.forceApplyEffects = true; // don't overwrite the application targets
    workflow.applicationTargets = game.user?.targets;
    if (workflow.applicationTargets.size > 0) await workflow.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
  } else {
    ui.notifications?.warn(i18nFormat("midi-qo.NoWorkflow", { itemName: item.name }));
  }
  button.disabled = false;
}

export function ddbglPendingFired(data) {
  let { sceneId, tokenId, actorId, itemId, actionType } = data;
  if (!itemId || !["attack", "damage", "heal"].includes(actionType)) {
    error("DDB Game Log - no item/action for pending roll"); return
  }
  // const tokenUuid = `Scene.${sceneId??0}.Token.${tokenId??0}`;
  const token = MQfromUuid(`Scene.${sceneId ?? 0}.Token.${tokenId ?? 0}`);
  const actor = token?.actor ?? game.actors?.get(actorId ?? "");
  if (!actor) {
    warn(" ddb-game-log hook could not find actor");
    return;
  }
  // find the player who controls the charcter.
  let player;
  if (token) {
    player = playerFor(token);
  } else {
    player = game.users?.players.find(p => p.active && actor?.data.permission[p.id ?? ""] === CONST.ENTITY_PERMISSIONS.OWNER)
  }
  if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
  if (player?.id !== game.user?.id) return;

  let item = actor.items.get(itemId);
  if (!item) {
    warn(` ddb-game-log - hook could not find item ${itemId} on actor ${actor.name}`);
    return;
  }

  let workflow: Workflow | undefined = DDBGameLogWorkflow.get(item.uuid);
  if (actionType === "attack") workflow = undefined;
  if (["damage", "heal"].includes(actionType) && item.hasAttack && !workflow) {
    warn(` ddb-game-log damage roll wihtout workflow being started ${actor.name} using ${item.name}`);
    return;
  }
  // if (workflow?.currentState !== WORKFLOWSTATES.WAITFORATTACKROLL) workflow = undefined;

  if (!workflow) {
    const speaker = {
      scene: sceneId,
      token: tokenId,
      actor: actorId,
      alias: token?.name ?? actor.name
    }
    //@ts-ignore
    workflow = new DDBGameLogWorkflow(actor, item, speaker, game.user.targets, {});
    showItemCard.bind(item)(false, workflow, false, true);
    return;
  }

}
export function ddbglPendingHook(data) { // need to propagate this to all players.
  if (!configSettings.optionalRules.enableddbGL) return;
  socketlibSocket.executeForEveryone("ddbglPendingFired", data);
}

export function processCreateDDBGLMessages(message: ChatMessage, options: any, user: string) {
  if (!configSettings.optionalRules.enableddbGL) return;
  const flags: any = message.data.flags;
  if (!flags || !flags["ddb-game-log"] || !game.user) return;
  const ddbGLFlags: any = flags["ddb-game-log"];
  if (!ddbGLFlags || ddbGLFlags.pending) return;
  // let sceneId, tokenId, actorId, itemId;
  //@ts-ignore
  if (!(["attack", "damage", "heal"].includes(flags.dnd5e?.roll?.type))) return;
  const itemId = flags.dnd5e?.roll?.itemId;
  if (!itemId) { error("Could not find item for fulfilled roll"); return }
  const token = MQfromUuid(`Scene.${message.data.speaker.scene}.Token.${message.data.speaker.token}`);
  const actor = token.actor ?? game.actors?.get(message.data.speaker.actor ?? "");
  if (!actor) {
    error("ddb-game-log could not find actor for roll");
    return;
  }
  // find the player who controls the charcter.
  let player;
  if (token) {
    player = playerFor(token);
  } else {
    player = game.users?.players.find(p => p.active && actor?.data.permission[p.id ?? ""] === CONST.ENTITY_PERMISSIONS.OWNER)
  }
  if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
  if (player?.id !== game.user?.id) return;

  const item = actor.items.get(itemId);
  if (!item) {
    error(`ddb-game-log roll could not find item ${flags.dnd5e.roll.itemId} on actor ${actor.name}`);
    return;
  }

  let workflow: Workflow | undefined = DDBGameLogWorkflow.get(item.uuid);
  if (!workflow && flags.dnd5e.roll.type === "damage" && item.hasAttack && ["rwak", "mwak"].includes(item.data.actionType)) {
    warn(`ddb-game-log roll damage roll wihtout workflow being started ${actor.name} using ${item.name}`);
    return;
  }
  if (!workflow) {
    error(`ddb-game-log roll no workflow for ${item.name}`)
    return;
  }
  if (flags.dnd5e.roll.type === "attack") {
    workflow.needItemCard = false;
    workflow.attackRoll = message.roll ?? undefined;
    workflow.attackTotal = message.roll?.total ?? 0;
    workflow.attackRollHTML = message.data.content;
    workflow.attackRolled = true;
    if (workflow.currentState === WORKFLOWSTATES.WAITFORATTACKROLL) {
      // the workflow is already waiting for us - toggle attack roll complete and restart the workflow
      workflow.next(WORKFLOWSTATES.WAITFORATTACKROLL);
    }
  }

  if (["damage", "heal"].includes(flags.dnd5e.roll.type)) {
    workflow.needItemCard = false;
    workflow.attackRolled = true;
    if (!workflow.damageRolled) {
      workflow.damageRoll = message.roll ?? undefined;
      workflow.damageTotal = message.roll?.total ?? 0;
      workflow.damageRollHTML = message.data.content;
    } else if (workflow.needsOtherDamage) {
      workflow.otherDamageRoll = message.roll ?? undefined;
      workflow.otherDamageTotal = message.roll?.total ?? 0;
      workflow.damageRollHTML = message.data.content;
      workflow.needsOtherDamage = false;
    }
    workflow.damageRolled = true;
    if (workflow.currentState === WORKFLOWSTATES.WAITFORDAMAGEROLL) {
      // the workflow is already waiting for us - toggle attack roll complete and restart the workflow
      workflow.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
    }
  }
}