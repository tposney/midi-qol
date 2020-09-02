import { warn, debug, error, i18n, log, MESSAGETYPES } from "../midi-qol";
import { Workflow, WORKFLOWSTATES } from "./workflow";
import {  configSettings } from "./settings";
import { rollMappings } from "./patching";

function hideChatMessage(hideDefaultRoll: boolean, match: (messageData) => boolean, workflowData: any, selector: string) {
  debug("Setting up hide chat message ", hideDefaultRoll, match, workflowData, selector);

  if (hideDefaultRoll) {
    let hookId = Hooks.on("preCreateChatMessage", (data, options) => {
      if (match(data)) {
        //@ts-ignore
        Hooks.off("preCreateChatMessage", hookId);
        workflowData[selector] = data;
        warn("Setting up hide chat message ", data, options, match, workflowData, selector);
        options.displaySheet = false;
        return false;
      } else return true;
    })
  } else return true;
}

export async function doAttackRoll(options = {event: {shiftKey: false, altKey: false, ctrlKey: false, metaKey:false}}) {
  let workflow: Workflow = Workflow.getWorkflow(this.uuid);
  debug("Entering item attack roll ", event, workflow, Workflow._workflows)
  if (!workflow) { // TODO what to do with a random attack roll
    warn("Roll Attack: No workflow for item ", this.name, this.uuid, event);
    return rollMappings.itemAttack.roll.bind(this)(options)
  }
  if (workflow?.currentState !== WORKFLOWSTATES.WAITFORATTACKROLL) return;
  if (!workflow.noAutoDamage && ["all", "attack"].includes(configSettings.autoFastForward)) {
    options.event.shiftKey = !(options.event.altKey || options.event.ctrlKey || options.event.metaKey)
  }
  hideChatMessage(configSettings.mergeCard, data => data?.type === CONST.CHAT_MESSAGE_TYPES.ROLL, Workflow.workflows[this.uuid], "attackCardData");
  let result: Roll = await rollMappings.itemAttack.roll.bind(this)(options);

  if (workflow.targets?.size === 0) {// no targets recorded when we started the roll grab them now
    workflow.targets = new Set(game.user.targets);
  }
  if (!result) { // attack roll failed.
    workflow._next(WORKFLOWSTATES.ROLLFINISHED);

  } else {
    workflow.attackRoll = result;
    workflow.attackAdvantage = options.event.altKey;
    workflow.attackDisadvantage = options.event.ctrlKey;
    workflow.attackRollHTML = await result.render();
    workflow.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);
  }
  return result;
}

export async function doDamageRoll({event = {shiftKey: false, altKey: false, ctrlKey: false, metaKey:false}, spellLevel = null, versatile = false}) {
  let workflow = Workflow.getWorkflow(this.uuid);
  if (workflow && workflow.currentState !== WORKFLOWSTATES.WAITFORDAMGEROLL){
    switch (workflow?.currentState) {
      case WORKFLOWSTATES.AWAITTEMPLATE:
        return ui.notifications.warn(i18n("midi-qol.noTemplateSeen"));
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        return ui.notifications.warn(i18n("midi-qol.noAttackRoll"));
      default: 
        return ui.notifications.warn(i18n("broken universe"));
    }
  }
  debug(" do damage roll ", event, spellLevel, versatile, this.uuid, Workflow._workflows, workflow)
  if (!workflow) {
    warn("Roll Damage: No workflow for item ", this.name);
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
  //@ts-ignore
  debug("doItemRoll ", event?.shiftKey, event?.ctrlKey, event?.altKey);
  let pseudoEvent = {shiftKey: false, ctrlKey: false, altKey: false, metakey: false, type: undefined}
  let versatile = false;
  // if speed item rolls is on process the mouse event states
  if (configSettings.speedItemRolls) {
    //@ts-ignore
    pseudoEvent = { shiftKey: event?.shiftKey, ctrlKey: event?.ctrlKey, altKey : event?.altKey, metaKey: event?.metaKey, type: event?.type};
    versatile = event?.type === "contextmenu" || (pseudoEvent.shiftKey);
    //@ts-ignore
    if (event?.altKey && event?.ctrlKey) {
      pseudoEvent.shiftKey = true;
      pseudoEvent.ctrlKey = false;
      pseudoEvent.altKey = false;
    }
  }
  
  let speaker = ChatMessage.getSpeaker();
  let spellLevel = this.data.data.level; // we are called with the updated spell level so record it.
  let baseItem = this.actor.getOwnedItem(this.id);
  let workflow: Workflow = new Workflow(this.actor, baseItem, this.actor.token, speaker, pseudoEvent);
  //@ts-ignore event .type not defined
  workflow.versatile = versatile;
  workflow.itemLevel = this.data.data.level;
  // if showing a full card we don't want to auto roll attcks or damage.
  workflow.noAutoDamage = options.showFullCard;
  workflow.noAutoAttack = options.showFullCard;
  let result = await rollMappings.itemRoll.roll.bind(this)({configureDialog:true, rollMode:null, createMessage:false});

  if(!result) {
    //TODO find the right way to clean this up
    // Workflow.removeWorkflow(workflow.id);
    return;
  }
  const needAttckButton = !workflow.someEventKeySet() && !configSettings.autoRollAttack;
  workflow.showCard = configSettings.mergeCard || (configSettings.showItemDetails !== "none") || (
                (baseItem.isHealing && configSettings.autoRollDamage === "none")  || // not rolling damage
                (baseItem.hasDamage && configSettings.autoRollDamage === "none") ||
                (baseItem.hasSave && configSettings.autoCheckSaves === "none") ||
                (baseItem.hasAttack && needAttckButton)) ||
                (!baseItem.hasAttack && !baseItem.hasDamage && !baseItem.hasSave);

  if (workflow.showCard) {
    //@ts-ignore - 
    var itemCard: ChatMessage = await showItemCard.bind(this)(options.showFullCard, workflow)
    workflow.itemCardId = itemCard.id;
    debug("Item Roll: showing card", itemCard, workflow)
  };
  workflow.next(WORKFLOWSTATES.NONE);
  return itemCard;
}

export async function showItemCard(showFullCard: boolean, workflow: Workflow, minimalCard = false) {
  warn("show item card ", this, this.actor, this.actor.token, showFullCard, workflow)
  const token = this.actor.token;
  const needAttckButton = !workflow.someEventKeySet() && !configSettings.autoRollAttack;
  const sceneId = token?.scene && token.scene._id || canvas.scene._id;
  const templateData = {
    actor: this.actor,
    tokenId: token ? `${sceneId}.${token.id}` : null,
    item: this.data,
    data: this.getChatData(),
    labels: this.labels,
    condensed: this.hasAttack && configSettings.mergeCardCondensed,
    hasAttack: !minimalCard && this.hasAttack && (showFullCard || needAttckButton),
    isHealing: !minimalCard && this.isHealing && (showFullCard || configSettings.autoRollDamage === "none"),
    hasDamage: this.hasDamage && (showFullCard || configSettings.autoRollDamage === "none"),
    isVersatile: this.isVersatile && (showFullCard || configSettings.autoRollDamage === "none"),
    isSpell: this.type==="spell",
    hasSave: !minimalCard && this.hasSave && (showFullCard || configSettings.autoCheckSaves === "none"),
    hasAreaTarget: !minimalCard && this.hasAreaTarget,
    hasAttackRoll: !minimalCard && this.hasAttack,
    configSettings,
    hideItemDetails: ["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !this.actor.isPC)};

  const templateType = ["tool"].includes(this.data.type) ? this.data.type : "item";
  const template = `modules/midi-qol/templates/${templateType}-card.html`;
  const html = await renderTemplate(template, templateData);

  debug(" Show Item Card ", configSettings.useTokenNames,(configSettings.useTokenNames && token) ? token?.data?.name : this.actor.name, token, token?.data.name, this.actor.name, ChatMessage.getSpeaker())
  const chatData = {
    user: game.user._id,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    speaker: {
      actor: this.actor._id,
      token: this.actor.token,
      alias: (configSettings.useTokenNames && token) ? token.data.name : this.actor.name
    },
    flags: {"midi-qol": {
      item: workflow.item.id, 
      actor: workflow.actor.id, 
      type: MESSAGETYPES.ITEM, 
      itemUUId: workflow.itemUUId
    }}
  };
  // Toggle default roll mode
  let rollMode = game.settings.get("core", "rollMode");
  if ( ["gmroll", "blindroll"].includes(rollMode) ) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
  if ( rollMode === "blindroll" ) chatData["blind"] = true;

  // Create the chat message
  return ChatMessage.create(chatData);
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