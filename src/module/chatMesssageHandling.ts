import { debug, log, warn, i18n, error, MESSAGETYPES, timelog, gameStats } from "../midi-qol";
//@ts-ignore
import Actor5e from "../../../systems/dnd5e/module/actor/entity.js"
//@ts-ignore
import Item5e  from "../../../systems/dnd5e/module/item/entity.js"

import { installedModules } from "./setupModules";
import { BetterRollsWorkflow, Workflow, WORKFLOWSTATES } from "./workflow";
import { nsaFlag, coloredBorders, criticalDamage, addChatDamageButtons, configSettings, forceHideRoll, enableWorkflow, checkRule } from "./settings";
import { createDamageList, getTraitMult, calculateDamage, addConcentration, MQfromUuid } from "./utils";
import { setupSheetQol } from "./sheetQOL";

export const MAESTRO_MODULE_NAME = "maestro";

export const MODULE_LABEL = "Maestro";

export function mergeCardSoundPlayer(message, update, options, user) {
  debug("Merge card sound player ", message.data, getProperty(update, "flags.midi-qol.playSound"), message.data.sound)
  const firstGM = game.user; //game.users.find(u=> u.isGM && u.active);
  if (game.user !== firstGM) return;
  const updateFlags = getProperty(update, "flags.midi-qol") || {};
  const midiqolFlags = mergeObject(getProperty(message.data, "flags.midi-qol") || {}, updateFlags, { inplace: false, overwrite: true })
  if (midiqolFlags.playSound && configSettings.useCustomSounds) {
    const playlist = game.playlists.get(configSettings.customSoundsPlaylist);
    const sound = playlist?.sounds.find(s=>s.id === midiqolFlags.sound)
    const dice3dActive = game.dice3d && (game.settings.get("dice-so-nice", "settings")?.enabled)
    const delay = (dice3dActive && midiqolFlags?.waitForDiceSoNice && [MESSAGETYPES.HITS].includes(midiqolFlags.type)) ? 500 : 0;
    debug("mergeCardsound player ", update, playlist, sound, sound?'playing sound':'not palying sound', delay)

    if (sound) {
      setTimeout(() => {
       // sound.playing = true;
        playlist.playSound(sound);
      }, delay)
    }

    //@ts-ignore
    // AudioHelper.play({ src: update.sound || midiqolFlags.sound }, true);
    return true;
  }
}

export function processcreateBetterRollMessage(message, options, user) {
  const brFlags = message.data.flags?.betterrolls5e;
  if (!brFlags) return true;
  const flags = message.data.flags;
  if (!flags) return true;
  const itemId = flags["midi-qol"]?.itemId;
  let workflow = BetterRollsWorkflow.get(itemId);
  if (!workflow) return true;
  workflow.itemCardId = message.id;
  workflow.next(WORKFLOWSTATES.NONE);
  return true;
}

export let processpreCreateBetterRollsMessage = (message: ChatMessage, data: any, options:any, user: any) => {
  const brFlags = data.flags?.betterrolls5e;
  if (!brFlags) return true;
  debug("process precratebetteerrollscard ", data, options, installedModules["betterrolls5e"], data.content?.startsWith('<div class="dnd5e red-full chat-card"') )
  
  let speaker;
  let actorId = data.speaker?.actor;
  let tokenId = data.speaker?.token;
  let token: Token = canvas.tokens.get(tokenId)
  let actor: Actor5e = token?.actor;
  if (!actor) {
    actor = game.actors.get(actorId);
    speaker = ChatMessage.getSpeaker({actor})
    token = canvas.tokens.get(speaker.token);
  } else speaker = data.speaker;
  let workflow = BetterRollsWorkflow.get(brFlags.itemId);
  let item;
  if (!workflow) { // not doing the item.roll() TODO remove this when version .13 is out
    item = actor.items.get(brFlags.itemId);
    if (!item) item = game.items.get(brFlags.itemId);
    if (item && brFlags.params?.midiSaveDC) { // TODO this a nasty hack should be fixed
      item.data.data.save.dc = brFlags.params.midiSaveDC;
    }
  } else {
    item = workflow.item;
  }
  if (!item) return;
  // Try and help name hider
  if (!data.speaker.scene) data.speaker.scene = canvas.scene.id;
  if (!data.speaker.token) data.speaker.token = token?.id;

  let damageList = [];
  let otherDamageList = [];

  // Get attack roll info
  const attackEntry = brFlags.entries?.find((e) => e.type === "multiroll" && e.rollType === "attack");
  let attackTotal = attackEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
  let advantage = attackEntry ? attackEntry.rollState === "highest" : undefined;
  let disadvantage = attackEntry ? attackEntry.rollState === "lowest" : undefined;
  let diceRoll = attackEntry ? attackEntry.entries?.find((e) => !e.ignored)?.roll.results[0] : -1;
  let isCritical = false;
  console.error("better rolls roll ", workflow)

  for (let entry of brFlags.entries) {
    if (entry.type === "damage-group") {
      for (const subEntry of entry.entries) {
        let damage = subEntry.baseRoll?.total ?? 0;
        let type = subEntry.damageType;
        if ((entry.isCrit || subEntry.revealed) && subEntry.critRoll) {
          damage += subEntry.critRoll.total;
          isCritical = true;
        }
        // Check for versatile and flag set. TODO damageIndex !== other looks like nonsense.
        if (subEntry.damageIndex !== "other")
          damageList.push({ type, damage });
        else if (configSettings.rollOtherDamage)
          otherDamageList.push({ type, damage });
      }
    }
  }
  // BetterRollsWorkflow.removeWorkflow(item.id);
  setProperty(data, "flags.midi-qol.itemId", item.id);
  const targets = (item?.data.data.target?.type === "self") ? new Set([token]) : new Set(game.user.targets);
  if (!workflow) workflow = new BetterRollsWorkflow(actor, item, speaker, targets, null);
  workflow.isCritical = isCritical;
  workflow.isFumble = diceRoll === 1;
  workflow.attackTotal = attackTotal;
  workflow.attackRoll = new Roll(`${attackTotal}`).roll();
  if (configSettings.keepRollStats && item.hasAttack) {
    gameStats.addAttackRoll({rawRoll: diceRoll, total: attackTotal, fumble: workflow.isFumble, critical: workflow.isCritical}, item);
  }
  workflow.damageDetail = damageList;
  workflow.damageTotal = damageList.reduce((acc, a) => a.damage + acc, 0);

  if (otherDamageList.length > 0) {
    workflow.otherDamageTotal = otherDamageList.reduce((acc, a) => a.damage + acc, 0);
    workflow.otherDamageRoll = new Roll(`${workflow.otherDamageTotal}`).roll();
  }
  workflow.itemLevel = brFlags.params.slotLevel ?? 0;
  workflow.itemCardData = data;
  workflow.advantage = advantage;
  workflow.disadvantage = disadvantage;
  if (!workflow.tokenId) workflow.tokenId = token?.id;
  if (configSettings.concentrationAutomation) {
    let doConcentration = async () => {
      const concentrationName = game.settings.get("combat-utility-belt", "concentratorConditionName");
      const needsConcentration = workflow.item.data.data.components?.concentration;
      const checkConcentration = installedModules.get("combat-utility-belt") && configSettings.concentrationAutomation;
      if (needsConcentration && checkConcentration) {
        const concentrationCheck = item.actor.data.effects.find(i => i.label === concentrationName);
        if (concentrationCheck) {
          await game.cub.removeCondition(concentrationName, [token], {warn: false});
          // await item.actor.unsetFlag("midi-qol", "concentration-data");
        }
        if (needsConcentration)
          addConcentration({workflow});
      }
    }
    doConcentration();
  }
  const hasEffects = workflow.hasDAE && item.data.effects.find(ae=> !ae.transfer);
  if (hasEffects && !configSettings.autoItemEffects) {
    //@ts-ignore
    const searchString = '<footer class="card-footer">';
    const button = `<button data-action="applyEffects">${i18n("midi-qol.ApplyEffects")}</button>`
    const replaceString = `<div class="card-buttons-midi-br">${button}</div><footer class="card-footer">`;
    data.content = data.content.replace(searchString, replaceString);
  }
  // Workflow will be advanced when the better rolls card is displayed.
  return true;
}

export let diceSoNiceHandler = async (message, html, data) => {
  if (!game.dice3d || !installedModules.get("dice-so-nice") || game.dice3d.messageHookDisabled || !game.dice3d.isEnabled()) return;
  debug("Dice so nice handler ", message, html, data);
  // Roll the 3d dice if we are a gm, or the message is not blind and we are the author or a recipient (includes public)
  let rollDice = game.user.isGM ||
        (!message.data.blind && (message.isAuthor || message.data.whisper.length === 0 || message.data.whisper?.includes(game.user.id)));
  if (!rollDice) {
    return;
  }

  if (configSettings.mergeCard) {
    return;
  }

  if (!getProperty(message.data, "flags.midi-qol.waitForDiceSoNice")) return;
  debug("dice so nice handler - non-merge card", html)
  html.hide();
  Hooks.once("diceSoNiceRollComplete", (id) => {
    let savesDisplay = $(html).find(".midi-qol-saves-display").length === 1;
    let hitsDisplay = configSettings.mergeCard ?
       $(html).find(".midi-qol-hits-display").length === 1
       : $(html).find(".midi-qol-single-hit-card").length === 1;
    if (savesDisplay) {
      if (game.user.isGM || (configSettings.autoCheckSaves !== "whisper" && !message.data.blind)) 
        html.show()
    } else if (hitsDisplay) {
      if (game.user.isGM || (configSettings.autoCheckHit !== "whisper" && !message.data.blind)) 
        html.show()
    }
    else {
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
  let actor = game.actors.get(actorId);
  let user = game.users.get(userId);
  if (!user || !actor) return true;
  //@ts-ignore permission is actually not a boolean
  if (actor.data.permission[userId] !== CONST.ENTITY_PERMISSIONS.OWNER && !actor.data.permission["default"] !== CONST.ENTITY_PERMISSIONS.OWNER && !user.isGM) {
    user = game.users.find(p=>p.isGM && p.active)
    if (!user) return true;
  }

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

export let nsaMessageHandler = (data, ...args) => {
  if (!nsaFlag || !data.whisper || data.whisper.length === 0) return true;
  let gmIds = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active).map(u=>u.id);
  let currentIds = data.whisper.map(u=>typeof(u) === "string" ? u : u.id);
  gmIds = gmIds.filter(id => !currentIds.includes(id));
  debug("nsa handler active GMs ", gmIds, " current ids ", currentIds, "extra gmids ", gmIds)
  data.whisper = data.whisper.concat(gmIds);
  return true;
}

let _highlighted = null;

let _onTargetHover = (event) => {

  event.preventDefault();
  if ( !canvas?.scene?.data.active ) return;
  const token = canvas.tokens.get(event.currentTarget.id);
  if ( token?.isVisible ) {
    if ( !token._controlled ) token._onHoverIn(event);
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
  if ( !canvas?.scene?.data.active ) return;
  if (_highlighted ) _highlighted._onHoverOut(event);
  _highlighted = null;
}

let _onTargetSelect = (event) => {
  event.preventDefault();
  if ( !canvas?.scene?.data.active ) return;
  const token = canvas.tokens.get(event.currentTarget.id);
  token.control({ multiSelect: false, releaseOthers: true });
};

export let hideRollRender = (msg, html, data) => {
  if (forceHideRoll && (msg.data.whisper.length > 0 || msg.data?.blind)) {
      if (!game.user.isGM && !msg.isAuthor && msg.data.whisper.indexOf(game.user.id) === -1) {
        warn("hideRollRender | hiding message", msg.data.whisper)
        html.hide();
      }
  }
  return true;
};

export let hideRollUpdate = (message, data, diff, id) => {
  if (forceHideRoll && message.data.whisper.length > 0 || message.data.blind) {
    if (!game.user.isGM && ((!message.isAuthor && (message.data.whisper.indexOf(game.user.id) === -1) || message.data.blind))) {
      let messageLi = $(`.message[data-message-id=${data._id}]`);
      warn("hideRollUpdate: Hiding ", message.data.whisper, messageLi)
      messageLi.hide();
    }
  }
  return true;
};

export let hideStuffHandler = (message, html, data) => {
  debug("hideStuffHandler message: ", message.id, message)

  const midiqolFlags = getProperty(message.data, "flags.midi-qol");
  let ids = html.find(".midi-qol-target-name")
  // const actor = game.actors.get(message?.speaker.actor)
    // let buttonTargets = html.getElementsByClassName("minor-qol-target-npc");
  ids.hover(_onTargetHover, _onTargetHoverOut)
  if (game.user.isGM)  {
    ids.click(_onTargetSelect);
  }

  if (game.user.isGM) {
    html.find(".midi-qol-target-npc-Player").hide();
  } else {
    html.find(".midi-qol-target-npc-GM").hide();
  }
  if (game.user.isGM) {
    if (configSettings.mergeCard) {
      $(html).find(".midi-qol-hits-display").show();
    } else {
      if ($(html).find(".midi-qol-hits-display").length === 1) {
        html.show();
      }
    }
    //@ts-ignore
    ui.chat.scrollBottom
    return;
  }

  if (!game.user.isGM && !configSettings.displaySaveDC) {
    html.find(".midi-qol-saveDC").hide();
  }
  if (message.user?.isGM && !game.user.isGM && configSettings.hideRollDetails !== "none") {
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
    } else if (configSettings.hideRollDetails === "all" || message.data.blind) {
      html.find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      //TODO this should probably just check formula
    } else if (["details", "detailsDSN"].includes(configSettings.hideRollDetails)) {
      html.find(".dice-tooltip").remove();
      html.find(".dice-formula").remove();
    }
  }

  if (configSettings.autoCheckHit === "whisper" || message.data.blind) {
    if (configSettings.mergeCard) {
      html.find(".midi-qol-hits-display").hide();
    } else {
      if (html.find(".midi-qol-single-hit-card").length === 1) {
        html.hide();
      }
    }
  }
  if (configSettings.autoCheckSaves === "whisper" || message.data.blind) {
    if (configSettings.mergeCard) {
      html.find(".midi-qol-saves-display").hide();
    } else {
      if (html.find(".midi-qol-saves-display").length === 1) {
        html.hide();
      }
    }
  } 
  //@ts-ignore
  setTimeout( () => ui.chat.scrollBottom(), 0);
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
  debug("Chat Damage Buttons ", addChatDamageButtons, message, message.data.flags?.dnd5e?.roll?.type, message.data.flags)
  if (!addChatDamageButtons) {
    return true;
  }
  if (["other", "damage"].includes(message.data.flags?.dnd5e?.roll?.type)) {
    let item;
    let itemId;
    let actorId = message.data.speaker.actor;
    if (message.data.flags?.dnd5e?.roll?.type === "damage") {
      itemId = message.data.flags.dnd5e.roll.itemId;
      item = game.actors.get(actorId).items.get(itemId);
      if (!item) {
        warn("Damage roll for non item");
        return;
      }
    }
    let itemUuid = `Actor.${actorId}.Item.${itemId}`;
    // find the item => workflow => damageList, totalDamage
    const defaultDamageType = (item?.data.data.damage.parts[0] && item?.data.data.damage?.parts[0][1]) ?? "bludgeoning";
    const damageList = createDamageList(message.roll, item, defaultDamageType);
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

export function addChatDamageButtonsToHTML(totalDamage, damageList, html, actorId, itemUuid, tag="damage",toMatch=".dice-total", style="margin: 0px;") {

  debug("addChatDamageButtons", totalDamage, damageList, html, actorId, itemUuid, toMatch, html.find(toMatch))
  const btnContainer = $('<span class="dmgBtn-container-mqol"></span>');
  let btnStylinggreen = `width: 20%; height:90%; background-color:lightgreen; line-height:1px; ${style}`;
  let btnStylingred =   `width: 20%; height:90%; background-color:red; line-height:1px; ${style}`;
  const fullDamageButton = $(`<button class="dice-total-full-${tag}-button" style="${btnStylingred}"><i class="fas fa-user-minus" title="Click to apply up to ${totalDamage} damage to selected token(s)."></i></button>`);
  const halfDamageButton = $(`<button class="dice-total-half-${tag}-button" style="${btnStylingred}"><i title="Click to apply up to ${Math.floor(totalDamage/2)} damage to selected token(s).">&frac12;</i></button>`);
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
          let promises = [];
          for (let t of canvas.tokens.controlled) {
              let a = t.actor;
              let appliedDamage = 0;
              for (let { damage, type } of damageList) {
                  appliedDamage += Math.floor(damage * getTraitMult(a, type, item));
              }
              appliedDamage = Math.floor(Math.abs(appliedDamage)) * mult;
              let damageItem = calculateDamage(a, appliedDamage, t, totalDamage, "");
              promises.push(a.update({ "data.attributes.hp.temp": damageItem.newTempHP, "data.attributes.hp.value": damageItem.newHP }));
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
  if (canvas?.tokens.controlled.length > 0) {
    html.find('.dmgBtn-container-mqol').show();
  }
  }, evOut => {
      html.find('.dmgBtn-container-mqol').hide();
  });
  return html;
}

export function processItemCardCreation(message, options, user) {
  const midiqolFlags = message.data.flags["midi-qol"];
  debug("Doing item card creation", configSettings.useCustomSounds, configSettings.itemUseSound, midiqolFlags?.type)
  if (configSettings.useCustomSounds && midiqolFlags?.type === MESSAGETYPES.ITEM) {
    const playlist = game.playlists.get(configSettings.customSoundsPlaylist);
    const sound = playlist?.sounds.find(s=>s.id === midiqolFlags?.sound);
    const delay = 0;
    if (sound) {
      setTimeout(() => {
      // sound.playing = true;
        playlist.playSound(sound);
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
  const message =  game.messages.get(messageId);
  const action = button.dataset.action;
  let targets = game.user.targets;

  // Validate permission to proceed with the roll
  if ( !(game.user.isGM || message.isAuthor ) ) return;
  if (!(targets?.size > 0)) return; // cope with targets undefined
  if (action !== "applyEffects") return;
  
  //@ts-ignore speaker
  const betterRollsFlags = message.data.flags.betterrolls5e;
  var actor, item;
  if (betterRollsFlags) {
    actor = game.actors.get(betterRollsFlags.actorId);
    item = actor.items.get(betterRollsFlags.itemId);
  } else {
    // Recover the actor for the chat card
    //@ts-ignore
    actor = CONFIG.Item.entityClass._getChatCardActor(card);
    if ( !actor ) return;

    // Get the Item from stored flag data or by the item ID on the Actor
    const storedData = message.getFlag("dnd5e", "itemData");
    item = storedData ? this.createOwned(storedData, actor) : actor.getOwnedItem(card.dataset.itemId);
    if ( !item ) { // TODO investigate why this is occuring
      // return ui.notifications.error(game.i18n.format("DND5E.ActionWarningNoItem", {item: card.dataset.itemId, name: actor.name}))
    }
  }
  if (!actor || !item) return;
  let workflow = Workflow.getWorkflow(item.id);
  const hasDAE = installedModules.get("dae") && (item?.effects?.entries.some(ef => ef.data.transfer === false));
  if (hasDAE) {
    //@ts-ignore
    let dae = window.DAE;
    dae.doEffects(item, true, game.user.targets, {whisper: false, spellLevel: workflow?.itemLevel, damageTotal: workflow?.damageTotal, critical: workflow?.isCritical, fumble: workflow?.isFumble, itemCardId: workflow?.itemCardId})
  }

  // Re-enable the button
  button.disabled = false;
}