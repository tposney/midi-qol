import { warn, debug, error, i18n } from "../midi-qol";
import { Workflow, WORKFLOWSTATES } from "./workflow";
import {  configSettings } from "./settings";
import { rollMappings } from "./patching";

function hideChatMessage(hideDefaultRoll: boolean, match: (messageData) => boolean, workflowData: any, selector: string) {
  debug("Setting up hide chat message ", hideDefaultRoll, match, workflowData, selector);
  if (hideDefaultRoll) {
    let hookId = Hooks.on("preCreateChatMessage", (data: {}, options) => {
      if (match(data)) {
        //@ts-ignore
        Hooks.off("preCreateChatMessage", hookId);
        workflowData[selector] = data;
        //@ts-ignore
        setProperty(data, "flags.midi-qol.permaHide", true);
        debug("hideChatMessage: workflow data ", selector, data);
        return false;
      } else return true;
    })
  } else return true;
}

export async function doAttackRoll({event = {shiftKey: false, altKey: false, ctrlKey: false, metaKey:false}}) {
  let workflow: Workflow = Workflow.getWorkflow(this.uuid);
  if (workflow?.currentState !== WORKFLOWSTATES.WAITFORATTACKROLL) return;
  debug("Entering item attack roll ", event, workflow, Workflow._workflows)
  if (!workflow) { // TODO what to do with a random attack roll
    warn("No workflow for item ", this.name, this.uuid, event);
    return rollMappings.itemAttack.roll.bind(this)({event})
  }
  if (!workflow.noAutoDamage && ["all", "attack"].includes(configSettings.autoFastForward)) {
    event.shiftKey = !(event.altKey || event.ctrlKey || event.metaKey)
  }
  hideChatMessage(configSettings.mergeCard, data => data?.type === CONST.CHAT_MESSAGE_TYPES.ROLL, Workflow.workflows[this.uuid], "attackCardData");
  debug("doAttack Roll ", rollMappings.itemAttack, event)
  let result: Roll = await rollMappings.itemAttack.roll.bind(this)({event});
  workflow.attackRoll = result;
  workflow.attackAdvantage = event.altKey;
  workflow.attackDisadvantage = event.ctrlKey;
  workflow.attackRollHTML = await result.render();
  workflow.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);
  return result;
}

export async function doDamageRoll({event = {shiftKey: false, altKey: false, ctrlKey: false, metaKey:false}, spellLevel = null, versatile = false}) {
  let workflow = Workflow.getWorkflow(this.uuid);
  if (workflow.currentState !== WORKFLOWSTATES.WAITFORDAMGEROLL){
    switch (workflow.currentState) {
      case WORKFLOWSTATES.AWAITTEMPLATE:
        return ui.notifications.warn(i18n("midi-qol.noTemplateSeen"));
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        return ui.notifications.warn(i18n("midi-qol.noAttackRoll"));
      default: 
        return ui.notifications.warn(i18n("broken universe"));
    }
  }
  debug(" do damage roll ", event, spellLevel, versatile, this.uuid, Workflow._workflows, workflow)
  if (!workflow) { //TODO - what to do with a random roll damage for an item?
    warn("No workflow for item ", this.name);
    return rollMappings.itemDamage.roll.bind(this)({event, spellLevel, versatile})
  }
  hideChatMessage(configSettings.mergeCard, data => data?.type === CONST.CHAT_MESSAGE_TYPES.ROLL, Workflow.workflows[this.uuid], "damageCardData");
  if (!(workflow.noAutoDamage) && ["all", "damage"].includes(configSettings.autoFastForward)) event.shiftKey = !(event.altKey || event.ctrlKey || event.metaKey)
  let result: Roll = await rollMappings.itemDamage.roll.bind(this)({event, spellLevel, versatile})
  workflow.damageRoll = result;
  workflow.damageTotal = result.total;
  workflow.damageRollHTML = await result.render();
  workflow.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);
  return result;
}

export async function doItemRoll(options = {showFullCard: false}) {
  warn("do item roll ", options.showFullCard, event)
  const shouldAllowRoll = !configSettings.requireTargets // we don't care about targets
                          || (game.user.targets.size > 0) // there are some target selected
                          || (this.data.data.target?.type === "self") // self target
                          || (this.hasAreaTarget && configSettings.autoTarget) // area effectspell and we will auto target
                          || (configSettings.rangeTarget && this.data.data.target?.units === "ft" && ["creature", "ally", "enemy"].includes(this.data.data.target?.type)); // rangetarget
  if (!shouldAllowRoll) {
    ui.notifications.warn(i18n("midi-qol.noTargets"));
    warn(`${game.username} attempted to roll with no targets selected`)
    return;
  }
  warn("event is ", event)
  let pseudoEvent = {shiftKey: false, ctrlKey: false, altKey: false, metakey: false, type: undefined}
  // if speed item rolls is on process the mouse event states
  if (configSettings.speedItemRolls !== "off") pseudoEvent = {
    //@ts-ignore
    shiftKey: event.shiftKey,
    //@ts-ignore
    ctrlKey: false || event.ctrlKey,
    //@ts-ignore
    altKey : false || event.altKey,
    //@ts-ignore
    metaKey: false || event.metaKey,
    type: event.type
  }
  const verstaile = event?.type === "contextmenu" || (pseudoEvent.shiftKey);
  //@ts-ignore
  if (event.altKey && event.ctrlKey) {
    pseudoEvent.shiftKey = true;
    pseudoEvent.ctrlKey = false;
    pseudoEvent.altKey = false;
  }
  let speaker = ChatMessage.getSpeaker();
  let spellLevel = this.data.data.level; // we are called with the updated spell level so record it.
  let baseItem = this.actor.getOwnedItem(this.id);
  let workflow: Workflow = new Workflow(this.actor, baseItem, speaker.token, speaker, pseudoEvent);
  //@ts-ignore event .type not defined
  workflow.versatile = verstaile;

  workflow.itemLevel = this.data.data.level;
  // if showing a full card we don't want to auto roll attcks or damage.
  workflow.noAutoDamage = options.showFullCard;
  workflow.noAutoAttack = options.showFullCard;
  hideChatMessage(true, data => true, workflow, "itemCardData"); // how to tell if it is an item card
  await rollMappings.itemRoll.roll.bind(this)().then(async (result) => {
    const needAttckButton = !workflow.someEventKeySet() && !["all", "attack"].includes(configSettings.autoFastForward);

    workflow.showCard = ["onCard", "off"].includes(configSettings.speedItemRolls) || configSettings.mergeCard || (
                  (baseItem.isHealing && configSettings.autoRollDamage === "none")  || // not rolling damage
                  (baseItem.hasDamage && configSettings.autoRollDamage === "none") ||
                  baseItem.hasSave && configSettings.autoCheckSaves === "none" ||
                  (baseItem.hasAttack && needAttckButton));

    if (workflow.showCard) {
      //@ts-ignore - 
      let itemCard: ChatMessage = await showItemCard(this, options.showFullCard, workflow)
      workflow.itemCardId = itemCard.id;
      debug("Item Roll: showing card", itemCard, workflow)
    };
    workflow.next(WORKFLOWSTATES.NONE);
  });
}

let showItemCard = async (item, showFullCard: boolean, workflow: Workflow)  => {
  const token = item.actor.token;
  const needAttckButton = !workflow.someEventKeySet() && !["all", "attack"].includes(configSettings.autoFastForward);
warn("show item card ", item, showFullCard, workflow)
  const templateData = {
    actor: item.actor,
    tokenId: token ? `${token.scene._id}.${token.id}` : null,
    item: item.data,
    data: item.getChatData(),
    labels: item.labels,
    condensed: item.hasAttack && configSettings.mergeCardCondensed,
    hasAttack: item.hasAttack && (showFullCard || needAttckButton),
    isHealing: item.isHealing && (showFullCard || configSettings.autoRollDamage === "none"),
    hasDamage: item.hasDamage && (showFullCard || configSettings.autoRollDamage === "none"),
    isVersatile: item.isVersatile && (showFullCard || configSettings.autoRollDamage === "none"),
    isSpell: item.type==="spell",
    hasSave: item.hasSave && (showFullCard || configSettings.autoCheckSaves === "none"),
    hasAreaTarget: item.hasAreaTarget,
    hasAttackRoll: item.hasAttack
  };

  const templateType = ["tool"].includes(item.data.type) ? item.data.type : "item";
  const template = `modules/midi-qol/templates/${templateType}-card.html`;
  const html = await renderTemplate(template, templateData);

  debug(" do item roll ", configSettings.useTokenNames,(configSettings.useTokenNames && token) ? token.data.name : item.actor.name, token, token?.data.name, item.actor.name, ChatMessage.getSpeaker())
  const chatData = {
    user: game.user._id,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    speaker: {
      actor: item.actor._id,
      token: item.actor.token,
      alias: configSettings.useTokenNames && token ? token.data.name : item.actor.name
    }
  };
  // Toggle default roll mode
  let rollMode = game.settings.get("core", "rollMode");
  if ( ["gmroll", "blindroll"].includes(rollMode) ) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
  if ( rollMode === "blindroll" ) chatData["blind"] = true;

  // Create the chat message
  return await ChatMessage.create(chatData);
}

export function selectTargets(scene, data, options) {
  debug("select targets ", this._id, this.placeTemlateHoodId, scene, data)
  let item = this.item;
  let targeting = configSettings.autoTarget;
  if (data.user !== game.user._id) {
      return true;
  }
  if (targeting === "none") { // this is no good
    Hooks.callAll("midi-qol-targeted", game.user.targets);
    return true;
  } 
  if (data) {
    // release current targets
    game.user.targets.forEach(t => {
      //@ts-ignore
      t.setTarget(false, { releaseOthers: false });
    });
    game.user.targets.clear();
  }

  // if the item specifies a range of "self" don't target the caster.
  let selfTarget = !(item?.data.data.range?.units === "self")

  let wallsBlockTargeting = targeting === "wallsBlock";
  let templateDetails = canvas.templates.get(data._id);

  let tdx = data.x;
  let tdy = data.y;
// Extract and prepare data
  let {direction, distance, angle, width} = data;
  distance *= canvas.scene.data.grid / canvas.scene.data.gridDistance;
  width *= canvas.scene.data.grid / canvas.scene.data.gridDistance;
  direction = toRadians(direction);

  var shape
// Get the Template shape
switch ( data.t ) {
  case "circle":
    shape = templateDetails._getCircleShape(distance);
    break;
  case "cone":
    shape = templateDetails._getConeShape(direction, angle, distance);
    break;
  case "rect":
    shape = templateDetails._getRectShape(direction, distance);
    break;
  case "ray":
    shape = templateDetails._getRayShape(direction, distance, width);
  }
  canvas.tokens.placeables.filter(t => {
    if (!t.actor) return false;
    // skip the caster
    if (!selfTarget && this.token === t.id) return false;
    // skip special tokens with a race of trigger
    if (t.actor.data.data.details.race === "trigger") return false;
    if (!shape.contains(t.center.x - tdx, t.center.y - tdy))
      return false;
    if (!wallsBlockTargeting)
      return true;
    // construct a ray and check for collision
    let r = new Ray({ x: t.center.x, y: t.center.y}, templateDetails.data);
    return !canvas.walls.checkCollision(r);
  }).forEach(t => {
    t.setTarget(true, { user: game.user, releaseOthers: false });
    game.user.targets.add(t);
  });
  // game.user.broadcastActivity({targets: game.user.targets.ids});

  // Assumes area affect do not have a to hit roll
  this.saves = new Set();
  this.targets = new Set(game.user.targets);
  this.hitTargets = new Set(game.user.targets);
 return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
};