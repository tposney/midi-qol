import { warn, debug, error, i18n, log, MESSAGETYPES } from "../midi-qol";
import { Workflow, WORKFLOWSTATES } from "./workflow";
import {  configSettings, itemDeleteCheck, enableWorkflow, criticalDamage } from "./settings";
import { rollMappings } from "./patching";
import { getSelfTargetSet } from "./utils";

function hideChatMessage(hideDefaultRoll: boolean, match: (messageData) => boolean, workflow: Workflow, selector: string) {
  debug("Setting up hide chat message ", hideDefaultRoll, match, workflow, selector);

  if (hideDefaultRoll) {
    let hookId = Hooks.on("preCreateChatMessage", (data, options) => {
      if (match(data)) {
        //@ts-ignore
        Hooks.off("preCreateChatMessage", duplicate(workflow.displayHookId));
        workflow.displayHookId = null;
        workflow[selector] = data;
        warn("Setting up hide chat message ", data, options, match, workflow, selector);
        options.displaySheet = false;
        return false;
      } else return true;
    })
    workflow.displayHookId = hookId;
  } else return true;
}

export async function doAttackRoll(options = {event: {shiftKey: false, altKey: false, ctrlKey: false, metaKey:false}, versatile: false}) {
  let workflow: Workflow = Workflow.getWorkflow(this.uuid);
  debug("Entering item attack roll ", event, workflow, Workflow._workflows)
  if (!workflow || !enableWorkflow) { // TODO what to do with a random attack roll
    if (enableWorkflow) warn("Roll Attack: No workflow for item ", this.name, this.uuid, event);
    return rollMappings.itemAttack.roll.bind(this)(options)
  }
  if (workflow?.currentState !== WORKFLOWSTATES.WAITFORATTACKROLL) return;

  workflow.processAttackEventOptions(options?.event);
  workflow.checkTargetAdvantage();
  // we actually want to collect the html from the attack roll, so need to render and grab
  hideChatMessage(configSettings.mergeCard, data => data?.type === CONST.CHAT_MESSAGE_TYPES.ROLL, Workflow.workflows[this.uuid], "attackCardData");
  let result: Roll = await rollMappings.itemAttack.roll.bind(this)(options = workflow.rollOptions);
  if (workflow.targets?.size === 0) {// no targets recorded when we started the roll grab them now
    workflow.targets = new Set(game.user.targets);
  }
  if (!result) { // attack roll failed.
    workflow._next(WORKFLOWSTATES.ROLLFINISHED);
  } else {
    workflow.attackRoll = result;
    //TODO get rid of workflow attackadvantage instead use rollOptions
    workflow.attackAdvantage = workflow.rollOptions.advantage;
    workflow.attackDisadvantage = workflow.rollOptions.disdavantage;
    workflow.attackRollHTML = await result.render();
    workflow.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);
  }
  return result;
}

export async function doDamageRoll({event = {shiftKey: false, altKey: false, ctrlKey: false, metaKey:false}, spellLevel = null, versatile = null}) {
  let workflow = Workflow.getWorkflow(this.uuid);
  if (!enableWorkflow) {
    return rollMappings.itemDamage.roll.bind(this)({event})
  }
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
  if (!workflow) {
    warn("Roll Damage: No workflow for item ", this.name);
    return rollMappings.itemDamage.roll.bind(this)({event, spellLevel, versatile})
  }
  // we actually want to collect the html from the damage roll, so need to rendere and grab
  hideChatMessage(configSettings.mergeCard, data => data?.type === CONST.CHAT_MESSAGE_TYPES.ROLL, Workflow.workflows[this.uuid], "damageCardData");
  workflow.processDamageEventOptions(event);
  // Allow overrides form the caller
  if (spellLevel) workflow.rollOptions.spellLevel = spellLevel;
  if (versatile !== null) workflow.rollOptions.versatile = versatile;
  let result: Roll = await rollMappings.itemDamage.roll.bind(this)(workflow.rollOptions)
  if (workflow.isCritical) result = doCritModify(result);
  workflow.damageRoll = result;
  if (!result.total) { // user backed out of damage roll
    workflow.next(WORKFLOWSTATES.ROLLFINISHED);
  }
  workflow.damageTotal = result.total;
  workflow.damageRollHTML = await result.render();
  workflow.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);
  return result;
}

export async function doItemRoll(options = {showFullCard: false, versatile: false}) {
  if (!enableWorkflow) {
    return rollMappings.itemRoll.roll.bind(this)({configureDialog:true, rollMode:null, createMessage:true});
  }
  const shouldAllowRoll = !configSettings.requireTargets // we don't care about targets
                          || (game.user.targets.size > 0) // there are some target selected
                          || (this.data.data.target?.type === "self") // self target
                          || (this.hasAreaTarget && configSettings.autoTarget) // area effectspell and we will auto target
                          || (configSettings.rangeTarget && this.data.data.target?.units === "ft" && ["creature", "ally", "enemy"].includes(this.data.data.target?.type)) // rangetarget
                          || (!this.hasAttack && !this.hasDamage && !this.hasSave); // does not do anything - need to chck dynamic effects
  if (!shouldAllowRoll) {
    ui.notifications.warn(i18n("midi-qol.noTargets"));
    warn(`${game.username} attempted to roll with no targets selected`)
    return;
  }
  //@ts-ignore
  debug("doItemRoll ", event?.shiftKey, event?.ctrlKey, event?.altKey);
  let pseudoEvent = {shiftKey: false, ctrlKey: false, altKey: false, metakey: false, type: undefined}
  let speaker = ChatMessage.getSpeaker();
  let spellLevel = this.data.data.level; // we are called with the updated spell level so record it.
  let baseItem = this.actor.getOwnedItem(this.id);
  const targets = (baseItem?.data.data.target?.type === "self") ? getSelfTargetSet(this.actor) : new Set(game.user.targets);
  let workflow: Workflow = new Workflow(this.actor, baseItem, this.actor.token, speaker, targets, event);
  //@ts-ignore event .type not defined
  workflow.rollOptions.versatile = workflow.rollOptions.versatile || options.versatile;
  // workflow.versatile = versatile;
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

export async function showItemInfo() {
  const token = this.actor.token;
  const sceneId = token?.scene && token.scene._id || canvas.scene._id;

  const templateData = {
    actor: this.actor,
    tokenId: token ? `${sceneId}.${token.id}` : null,
    item: this.data,
    data: this.getChatData(),
    labels: this.labels,
    condensed: false,
    hasAttack: false,
    isHealing: false,
    hasDamage: false,
    isVersatile: false,
    isSpell: this.type==="spell",
    hasSave: false,
    hasAreaTarget: false,
    hasAttackRoll: false,
    configSettings,
    hideItemDetails: false};

  const templateType = ["tool"].includes(this.data.type) ? this.data.type : "item";
  const template = `modules/midi-qol/templates/${templateType}-card.html`;
  const html = await renderTemplate(template, templateData);

  const chatData = {
    user: game.user,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    speaker: {
      actor: this.actor._id,
      token: this.actor.token,
      alias: (configSettings.useTokenNames && token) ? token.data.name : this.actor.name,
      // scene: canvas.scene.id
    },
    flags: {
      "core": {"canPopout": true}
    }
  };
  // Toggle default roll mode
  let rollMode = game.settings.get("core", "rollMode");
  if ( ["gmroll", "blindroll"].includes(rollMode) ) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
  if ( rollMode === "blindroll" ) chatData["blind"] = true;
  if (rollMode === "selfroll") chatData["whisper"] = [game.user.id];

  // Create the chat message
  return ChatMessage.create(chatData);
}
export async function showItemCard(showFullCard: boolean, workflow: Workflow, minimalCard = false) {
  warn("show item card ", this, this.actor, this.actor.token, showFullCard, workflow)
  const token = this.actor.token;
  const needAttckButton = !workflow.someEventKeySet() && !configSettings.autoRollAttack;
  const sceneId = token?.scene && token.scene._id || canvas.scene._id;

  let isPlayerOwned = this.actor.hasPlayerOwner;
  if (isNewerVersion("0.6.9", game.data.version)) isPlayerOwned = this.actor.isPC
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
    hideItemDetails: ["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !isPlayerOwned)};

  const templateType = ["tool"].includes(this.data.type) ? this.data.type : "item";
  const template = `modules/midi-qol/templates/${templateType}-card.html`;
  const html = await renderTemplate(template, templateData);

  debug(" Show Item Card ", configSettings.useTokenNames,(configSettings.useTokenNames && token) ? token?.data?.name : this.actor.name, token, token?.data.name, this.actor.name, ChatMessage.getSpeaker())
  let theSound = configSettings.itemUseSound;
  if (this.type === "weapon") theSound = configSettings.weaponUseSound;
  else if (this.type === "spell") theSound = configSettings.spellUseSound;
  else if (this.type === "consumable" && this.name.toLowerCase().includes(i18n("midi-qol.potion").toLowerCase())) theSound = configSettings.potionUseSound;
  const chatData = {
    user: game.user,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    speaker: {
      actor: this.actor._id,
      token: this.actor.token,
      alias: (configSettings.useTokenNames && token) ? token.data.name : this.actor.name,
      // scene: canvas.scene.id
    },
    flags: {
      "midi-qol": {
        item: workflow.item.id, 
        actor: workflow.actor.id, 
        sound: theSound,
        type: MESSAGETYPES.ITEM, 
        itemUUId: workflow.itemUUId
      },
    "core": {"canPopout": true}
  }
  };
  if ( (this.data.type === "consumable") && !this.actor.items.has(this.id) ) {
    chatData.flags["dnd5e.itemData"] = this.data;
    console.error("Adding item data to chat card", chatData.flags)
  }
  // Toggle default roll mode
  let rollMode = game.settings.get("core", "rollMode");
  if ( ["gmroll", "blindroll"].includes(rollMode) ) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
  if ( rollMode === "blindroll" ) chatData["blind"] = true;
  if (rollMode === "selfroll") chatData["whisper"] = [game.user.id];

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
  setTimeout(() => {
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
      if (!selfTarget && this.token === t.id) {
        return false;
      }
      // skip special tokens with a race of trigger
      if (t.actor.data.data.details.race === "trigger") return false;
      t = canvas.tokens.get(t.id);
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
  }, 250);
};

function doCritModify(result: Roll) {
  if (criticalDamage === "default") return result;
  if (isNewerVersion("0.7.0", game.data.version)) return result;;
  let rollBase = new Roll(result.formula);
  if (criticalDamage === "maxDamage") {// max base damage
    //@ts-ignore .terms not defined
    rollBase.terms = rollBase.terms.map(t => {
      if (t?.number) t.number = t.number/2;
      return t;
    });
    //@ts-ignore .evaluate not defined
    rollBase.evaluate({maximize: true});
    return result;
  } else if (criticalDamage === "maxCrit") { // see about maximising one dice out of the two
    let rollCrit = new Roll(result.formula);
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
    return rollBase;
  } else if (criticalDamage === "maxAll") {
    result = new Roll(result.formula);
    //@ts-ignore .evaluate not defined
    result.evaluate({maximize: true});
    return result;
  }
}