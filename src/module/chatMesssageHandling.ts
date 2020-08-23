import { debug, log, warn, undoDamageText, i18n, error } from "../midi-qol";
//@ts-ignore
import Actor5e from "../../../systems/dnd5e/module/actor/entity.js"
//@ts-ignore
import Item5e  from "../../../systems/dnd5e/module/item/entity.js"
import { installedModules } from "./setupModules";
import { BetterRollsWorkflow, Workflow, WORKFLOWSTATES, DamageOnlyWorkflow, getTraitMult, calculateDamage, createDamageList } from "./workflow";
import { nsaFlag, coloredBorders, criticalDamage, saveRequests, saveTimeouts, checkBetterRolls, hideNPCNames, autoCheckSaves, autoCheckHit, mergeCard, addChatDamageButtons } from "./settings";

export let processUndoDamageCard = async(message, html, data) => {
  if (!message?.data?.flavor || !game.user.isGM || !message.data.flavor.startsWith(undoDamageText)) {
    return true;
  }
  message.data.flags["midi-qol"] && message.data.flags["midi-qol"].forEach(({tokenID, oldTempHP, oldHP}) => {
    let token = canvas.tokens.get(tokenID);
    if (!token) {
      log(`Token ${tokenID} not found`);
      return;
    }
    let button = html.find(`#${tokenID}`);
    button.click(async (ev) => {
      log(`Setting HP back to ${oldTempHP} and ${oldHP}`);
      let actor = canvas.tokens.get(tokenID).actor;
      await actor.update({ "data.attributes.hp.temp": oldTempHP, "data.attributes.hp.value": oldHP });
      ev.stopPropagation();
    });
  })
}

export function processpreCreateAttackRollMessage(data, options, user) {
  // debug ("process create attack roll ", data, options, user);
  return true;
}
export function processpreCreateDamageRollMessage(data, options, user) {
}

export function processpreCerateSaveRollMessaage(data, options, user) {
}

export function processcreateAttackRoll(message, options, user) {
  // debug ("process create attack roll ", message, options, user);
  return true;
}

export function processcreateDamageRoll(message, options, user) {
}

export function processcreateSaveRoll(message, options, user) {
}


export function processcreateBetterRollMessage(message, options, user) {
  let flags = message.data?.flags && message.data.flags["midi-qol"];
  if (!flags?.id) return;
  let workflow: BetterRollsWorkflow = BetterRollsWorkflow.get(flags.id);
  debug("process better rolls card", flags?.id, message, workflow, workflow.betterRollsHookId);
  //@ts-ignore - does not support 
  Hooks.off("createChatMessage", workflow.betterRollsHookId);
  workflow.itemCardId = message.id;
  workflow.next(WORKFLOWSTATES.NONE);
}

export let processpreCreateBetterRollsMessage = async (data: any, options:any, user: any) => {
  if (installedModules["betterrolls5e"] || !data.content?.startsWith('<div class="dnd5e red-full chat-card"')) return true;
  debug("process precratebetteerrollscard ", data, options, installedModules["betterrolls5e"], data.content?.startsWith('<div class="dnd5e red-full chat-card"') )

  const requestId = data.speaker.token;
  let html = $(data.content);
  const title = html.find(".item-name")[0]?.innerHTML;

  let rollDivs = html.find(".dice-roll.red-dual");//.find(".dice-row-item");
  let rollData = html.find("red-full");
  if (debug) log("better rolls ", rollData, rollDivs)

  let itemId = html[0].attributes["data-item-id"];
  if (!itemId) return true; // not an item roll.
 
  itemId = itemId.nodeValue;
  let itemRe = /[^(]\(([\d]*)[^)]*\)/
  let token: Token = canvas.tokens.get(data.speaker.token)
  let actor: Actor5e = game.actors.tokens[data.speaker.token];
  if (!actor) game.actors.tokens[data.speaker.token]?.actor;
  if (!actor) actor = game.actors.get(data.speaker.actor);
  let item: Item5e = actor.items.get(itemId);

  let levelMatch =  title.match(itemRe);
  let itemLevel = levelMatch ? levelMatch[1] : (item?.data.data.level || 0);
  let damageStart = 0;
  let attackTotal = -1;
  let diceRoll;

  if (item.hasAttack) {
    damageStart = 1
    const attackRolls = $(rollDivs[0]).find(".dice-total");
    let diceRolls = $(rollDivs[0]).find(".roll.die.d20");
    for (let i = 0; i < attackRolls.length; i++) {
      if (!attackRolls[i].classList.value.includes("ignore")) {
        attackTotal = parseInt(attackRolls[i]?.innerHTML);
        diceRoll = parseInt(diceRolls[i]?.innerHTML);
        break;
      }
    }
  }

  // each weapon has it's own critical threshold
  let criticalThreshold = item.data.flags.betterRolls5e?.critRange?.value || 20;
  if (item.data.type === "weapon") criticalThreshold = Math.min(criticalThreshold, actor.data.flags.dnd5e?.weaponCriticalThreshold || 20);
  let isCritical = diceRoll >= criticalThreshold;

  let damageList = [];
  if (debug) log("Better Rolls Chat card", title, itemLevel, attackTotal, damageStart, isCritical)
  // document.activeElement.blur();
  for (let i = damageStart; i < rollDivs.length; i++) {
    let child = rollDivs[i].children;
    let damage = 0;
    // Structure is [flavor-text, dice-result]. If there is no flavor-text use the first else the second
    let resultIndex = child.length === 1 ? 0 : 1;
    for (let j = 0; j < $(child[resultIndex]).find(".dice-total")[0]?.children?.length; j++) {
      let damageDiv = $(child[resultIndex]).find(".dice-total")[0].children[j];
      // see if this damage is critical damage or not
      let isCriticalDamage = false;
      if (!isCritical) {
        for (let k = 0; k < damageDiv.classList.length; k++) {
          if (damageDiv.classList[k] === "red-crit-damage" ) isCriticalDamage = true;
        }
      }
      if (!isCritical && isCriticalDamage) continue;
      let damageitem = parseInt(damageDiv.innerHTML);
      if (!isNaN(damageitem)) damage += damageitem;
    }
    const typeString = child[0].innerHTML;
    //@ts-ignore - entry[1] type unknown
    let type = (Object.entries(CONFIG.DND5E.damageTypes).find(entry => typeString.includes(entry[1])) || ["unmatched"])[0];
    //@ts-ignore - entry[1] type unknown
    if (type === "unmatched") type = (Object.entries(CONFIG.DND5E.healingTypes).find(entry => typeString.includes(entry[1])) || ["unmatched"])[0];
    damageList.push({type, damage})
  }
  let workflow = new BetterRollsWorkflow(actor, item, token, data.speaker, null);
  workflow.isCritical = diceRoll >= criticalThreshold;
  workflow.isFumble = diceRoll === 1;
  workflow.attackTotal = attackTotal;
  workflow.damageDetail = damageList;
  workflow.damageTotal = damageList.reduce((acc, a) => a.damage + acc, 0);
  workflow.itemLevel = itemLevel;
  workflow.itemCardData = data;
  if (!data.flags) data.flags = {"midi-qol": {}};
  data.flags["midi-qol"].id = item.uuid;
//  workflow.next(WORKFLOWSTATES.NONE);
  return true;
}

export let diceSoNiceHandler = (message, html, data) => {
  if (installedModules.get("dice-so-nice") && getProperty(message.data.flags, "midi-qol.waitForDiceSoNice")) {
    if (mergeCard) {
      let hideTag = getProperty(message.data, "flags.midi-qol.hideTag")
        html.find(hideTag).hide();
        Hooks.once("diceSoNiceRollComplete", (id) => {
          html.find(hideTag).show(); 
          //@ts-ignore
          ui.chat.scrollBottom()
        });
        setTimeout(() => {
          html.find(hideTag).show(); 
          //@ts-ignore
          ui.chat.scrollBottom()
        }, 3000); // backup display of messages
    } else {
      html.hide();
      Hooks.once("diceSoNiceRollComplete", (id) => {
        html.show(); 
        //@ts-ignore
        ui.chat.scrollBottom()
      });
      setTimeout(() => {
        html.show(); 
        //@ts-ignore
        ui.chat.scrollBottom()
      }, 3000); // backup display of messages
    }
  }
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
  if (actor.data.permission[userId] !== CONST.ENTITY_PERMISSIONS.OWNER && !user.isGM) {
    user = game.users.find(p=>p.isGM && p.active)
  }

  //@ts-ignore .color not defined
  html[0].style.borderColor = user.data.color;
  if (coloredBorders === "borderNamesBackground") {
    //@ts-ignore .color not defined
    html[0].children[0].children[0].style.backgroundColor = user.data.color;
  } else if (coloredBorders === "borderNamesText") {
    //@ts-ignore .color not defined
    html[0].children[0].children[0].style.color = user.data.color;
  }
 return true;
}

export let nsaMessageHandler = (message, html, data) => {
  if (!nsaFlag || !data.whisper  || data.whisper.length === 0) return true;
  let gmIds = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active).map(u=>u.id);
  let currentIds = data.whisper.map(u=>typeof(u) === "string" ? u : u.id);
  gmIds = gmIds.filter(id => !currentIds.includes(id));
  data.whisper = data.whisper.concat(gmIds);
  return true;
}

let _highlighted = null;

let _onTargetHover = (event) => {

  event.preventDefault();
  if ( !canvas.scene.data.active ) return;
//  const li = event.currentTarget;
//  const token = canvas.tokens.get(li.id);
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
  if ( !canvas.scene.data.active ) return;
  if (_highlighted ) _highlighted._onHoverOut(event);
  _highlighted = null;
}

let _onTargetSelect = (event) => {
  event.preventDefault();
  if ( !canvas.scene.data.active ) return;
  const token = canvas.tokens.get(event.currentTarget.id);
  token.control({ multiSelect: false, releaseOthers: true });
};

export let hideStuffHandler = (message, html, data) => {

  debug("hide info handler message: ", message)
  if (getProperty(message, "data.flags.midi-qol.permaHide") && false) {
    html.hide();
    return;
  }
  let ids = html.find(".midi-qol-target-name")
  // let buttonTargets = html.getElementsByClassName("minor-qol-target-npc");
  ids.hover(_onTargetHover, _onTargetHoverOut)
  if (game.user.isGM)  {
    ids.click(_onTargetSelect);
  }
  if (!game.user.isGM && hideNPCNames.length > 0) {
    ids=html.find(".midi-qol-target-npc");
    ids.text(hideNPCNames);
  }
  if (game.user.isGM) {
    //@ts-ignore
    ui.chat.scrollBottom
    return;
  }
  if (autoCheckHit === "whisper") {
    $(html).find(".midi-qol-hits-display").hide()
  }
  if (autoCheckSaves === "whisper") {
    $(html).find(".midi-qol-saves-display").hide()
  }
  //@ts-ignore
  // ui.chat.scrollBottom();
}

export let processPreCreateDamageRoll = (data, ...args) => {
  if (data.flags?.dnd5e?.roll.type === "damage") {
    warn("Process pre create Damage roll ", data.flags?.dnd5e?.roll.type, data, ...args)
    let token: Token = canvas.tokens.get(data.speaker.token)
    let actor: Actor5e = game.actors.tokens[data.speaker.token];
    if (!actor) game.actors.tokens[data.speaker.token]?.actor;
    if (!actor) actor = game.actors.get(data.speaker.actor);
    let item: Item5e = actor.items.get((data.flags.dnd5e.roll.itemId));
    if (item) {
      if (data.flags.dnd5e.roll.critical) {
        if (criticalDamage === "default") return;
        if (isNewerVersion("0.7.0", game.data.version)) return;
        let r = Roll.fromJSON(data.roll);
        let rollBase = new Roll(r.formula);
        if (criticalDamage === "maxDamage") {
          //@ts-ignore .terms not defined
          rollBase.terms = rollBase.terms.map(t => {
            if (t?.number) t.number = t.number/2;
            return t;
          });
          //@ts-ignore .evaluate not defined
          rollBase.evaluate({maximize: true});
          rollBase._formula = rollBase.formula;
          data.roll = JSON.stringify(rollBase);
          data.content = `${rollBase.total}`;
        } else if (criticalDamage === "maxCrit") {
          let rollCrit = new Roll(r.formula);
          //@ts-ignore .terms not defined
          rollCrit.terms = rollCrit.terms.map(t => {
            if (t?.number) t.number = t.number/2;
            if (typeof t === "number") t = 0;
            return t;
          });
          //@ts-ignore .terms not defined
          rollBase.terms = rollBase.terms.map(t => {
            if (t?.number) t.number = t.number/2;
            return t;
          });
          //@ts-ignore .evaluate not defined
          rollCrit.evaluate({maximize: true});
          //@ts-ignore.terms not defined
          rollBase.terms.push("+")
          //@ts-ignore .terms not defined
          rollBase.terms.push(rollCrit.total)
          rollBase._formula = rollBase.formula;
          rollBase.roll();
          data.total = rollBase.total;
          data.roll = JSON.stringify(rollBase);
        } else if (criticalDamage === "maxAll") {
          //@ts-ignore .evaluate not defined
          rollBase.evaluate({maximize: true});
          data.roll = JSON.stringify(rollBase);
          data.content = `${rollBase.total}`;
        }
      }
    } else { // have a damage roll without an item
      warn("damage roll without item detected ", data.flags.dnd5e.roll.flavor)
      let wf = new DamageOnlyWorkflow(actor, token, data.speaker, parseInt(data.content), data.flags.dnd5e.roll.flavor || "radiant");
      wf.next(WORKFLOWSTATES.NONE);
    }
  }
  return true;
}

export let processBetterRollsChatCard = (message, html, data) => {
  if (!checkBetterRolls && message?.data?.content?.startsWith('<div class="dnd5e red-full chat-card"'))  return;
  debug("processBetterRollsChatCard", message. html, data)
  const requestId = message.data.speaker.actor;
  if (!saveRequests[requestId]) return true;
  const title = html.find(".item-name")[0]?.innerHTML
  if (!title) return true;
  if (!title.includes("Save")) return true;
  const formula = "1d20";
  const total = html.find(".dice-total")[0]?.innerHTML;
  clearTimeout(saveTimeouts[requestId]);
  saveRequests[requestId]({total, formula})
  delete saveRequests[requestId];
  delete saveTimeouts[requestId];
  return true;
}

export let chatDamageButtons = (message, html, data) => {
  debug("Chat Damage Buttons ", addChatDamageButtons, message, message.data.flags?.dnd5e?.roll.type)
  if (!addChatDamageButtons) return true;
  if (message.data.flags?.dnd5e?.roll.type !== "damage") return true;
  const itemId = message.data.flags.dnd5e.roll.itemId;
  const item = game.actors.get(message.data.speaker.actor).items.get(itemId);
  if (!item) {
    warn("Damage roll for non item");
    return;
  }
  // find the item => workflow => damageList, totalDamage
  let defaultDamageType = item.data.data.damage?.parts[0][1] || "bludgeoning";
  const damageList = createDamageList(message.roll, item, defaultDamageType);
  const totalDamage = message.roll.total;
  addChatDamageButtonsToHTML(totalDamage, damageList, html, item)
  return true;
}

export function addChatDamageButtonsToHTML(totalDamage, damageList, html, item) {
  const btnContainer = $('<span class="dmgBtn-container" style="position:absolute; right:0; bottom:1px;"></span>');
  let btnStyling = "width: 22px; height:22px; font-size:10px;line-height:1px";
  const fullDamageButton = $(`<button class="dice-total-full-damage-button" style="${btnStyling}"><i class="fas fa-user-minus" title="Click to apply full damage to selected token(s)."></i></button>`);
  const halfDamageButton = $(`<button class="dice-total-half-damage-button" style="${btnStyling}"><i class="fas fa-user-shield" title="Click to apply half damage to selected token(s)."></i></button>`);
  const doubleDamageButton = $(`<button class="dice-total-double-damage-button" style="${btnStyling}"><i class="fas fa-user-injured" title="Click to apply double damage to selected token(s)."></i></button>`);
  const fullHealingButton = $(`<button class="dice-total-full-healing-button" style="${btnStyling}"><i class="fas fa-user-plus" title="Click to apply full healing to selected token(s)."></i></button>`);
  btnContainer.append(fullDamageButton);
  btnContainer.append(halfDamageButton);
  btnContainer.append(doubleDamageButton);
  btnContainer.append(fullHealingButton);
  $(html).find(".dice-total").append(btnContainer);
  // Handle button clicks
  let setButtonClick = (buttonID, mult) => {
      let button = $(html).find(buttonID);
      button.off("click");
      button.click(async (ev) => {
          ev.stopPropagation();
          if (canvas.tokens.controlled.length === 0) {
              console.warn(`Midi-qol | user ${game.user.name} ${i18n("midi-qol.noTokens")}`);
              return ui.notifications.warn(`${game.user.name} ${i18n("midi-qol.noTokens")}`);
          }
          // find solution for non-magic weapons
          let promises = [];
          for (let t of canvas.tokens.controlled) {
              let a = t.actor;
              let appliedDamage = 0;
              for (let { damage, type } of damageList) {
                  let typeMult = mult * Math.abs(getTraitMult(a, type, item,)); // ignore damage type for buttons
                  appliedDamage += Math.floor(Math.abs(damage * typeMult)) * Math.sign(typeMult);
              }
              let damageItem = calculateDamage(a, appliedDamage, t, totalDamage, "");
              promises.push(a.update({ "data.attributes.hp.temp": damageItem.newTempHP, "data.attributes.hp.value": damageItem.newHP }));
          }
          let retval = await Promise.all(promises);
          return retval;
      });
  };
  setButtonClick(".dice-total-full-damage-button", 1);
  setButtonClick(".dice-total-half-damage-button", 0.5);
  setButtonClick(".dice-total-double-damage-button", 2);
  setButtonClick(".dice-total-full-healing-button", -1);
  return html;
}
