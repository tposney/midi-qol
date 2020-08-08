import { debug, log, warn, undoDamageText, i18n } from "../midi-qol";
//@ts-ignore
import Actor5e from "/systems/dnd5e/module/actor/entity.js"
//@ts-ignore
import Item5e  from "/systems/dnd5e/module/item/entity.js"
import { installedModules } from "./setupModules";
import { BetterRollsWorkflow, Workflow } from "./workflow";
import { nsaFlag, coloredBorders, criticalDamage, saveRequests, saveTimeouts, checkBetterRolls } from "./settings";

export let processUndoDamageCard = async(message, html, data) => {
  if (!message?.data?.flavor || !message.data.flavor.startsWith(undoDamageText)) {
    return true;
  }
  warn("process undo damage ", message.data.flags, message)
  message.data.flags["midi-qol"] && message.data.flags["midi-qol"].forEach(({tokenID, oldTempHP, oldHP}) => {
    let token = canvas.tokens.get(tokenID);
    if (!token) {
      log(`Token ${tokenID} not found`);
      return;
    }
    let button = html.find(`#${tokenID}`);
    warn("process undo damage ", button)
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
  Hooks.off("createChatMessage", workflow.betterRollsHookId, message);
  workflow.itemCard = message;
  workflow.next();
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
  let token: Token = game.actors.tokens[data.speaker.token];
  let actor: Actor5e = game.actors.tokens[data.speaker.token]?.actor;
  if (!actor) actor = game.actors.get(data.speaker.actor);
  let item: Item5e = actor.items.get(itemId);

  let levelMatch =  title.match(itemRe);
  let itemLevel = levelMatch ? levelMatch[1] : (item.data.data.level || 0);
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
  if (!data.flags) data.flags = {"midi-qol": {}};
  data.flags["midi-qol"].id = item.uuid;
  workflow.betterRollsHookId = Hooks.on("createChatMessage", processcreateBetterRollMessage);
  return true;
}

export let diceSoNiceHandler = (message,html, data) => {
  if (installedModules.get("dice-so-nice") && getProperty(message.data.flags, "midi-qol.waitForDiceSoNice")) {
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
  return true;
}

export let colorChatMessageHandler = (message, html, data) => {
  if (coloredBorders === "none") return true;
  //@ts-ignore .color not defined
  html[0].style.borderColor = game.users.get(message.data.user).color;
  if (coloredBorders === "borderNames") 
    //@ts-ignore .color not defined
    html[0].children[0].children[0].style.backgroundColor = game.users.get(message.data.user).color;
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

export let processPreCreateDamageRoll = (data, options) => {
  if (criticalDamage === "default") return;

  if (!isNewerVersion(game.data.version, "0.6.5")) return;

  if (data.flavor?.includes(i18n("midi-qol.criticalText") || data.flavor?.includes(i18n("midi-qol.criticalTextAlt")))) {
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
  return true;
}

let processBetterRollsChatCard = (message, html, data) => {
  if (!checkBetterRolls && message?.data?.content?.startsWith('<div class="dnd5e red-full chat-card"'))  return;
  warn("*** Inside better rolls chat card ")
  if (debug) log("processBetterRollsChatCard", message. html, data)
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