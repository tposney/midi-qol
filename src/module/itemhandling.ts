import { warn, debug, error, i18n, log, MESSAGETYPES } from "../midi-qol";
import { Workflow, WORKFLOWSTATES } from "./workflow";
import {  configSettings, itemDeleteCheck, enableWorkflow, criticalDamage } from "./settings";
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

export async function doAttackRoll(wrapped, options = {event: {shiftKey: false, altKey: false, ctrlKey: false, metaKey:false}, versatile: false}) {
  let workflow: Workflow = Workflow.getWorkflow(this.uuid);
  debug("Entering item attack roll ", event, workflow, Workflow._workflows)
  if (!workflow || !enableWorkflow) { // TODO what to do with a random attack roll
    if (enableWorkflow) warn("Roll Attack: No workflow for item ", this.name, this.uuid, event);
    return await wrapped(options);
  }
  if (workflow?.currentState !== WORKFLOWSTATES.WAITFORATTACKROLL) {
    warn("Workflow state not wait for attack roll");
    return;
  }

  workflow.processAttackEventOptions(options?.event);
  workflow.checkTargetAdvantage();
  workflow.checkAbilityAdvantage();
  // we actually want to collect the html from the attack roll, so need to render and grab
  // hideChatMessage(configSettings.mergeCard && enableWorkflow, data => data?.type === CONST.CHAT_MESSAGE_TYPES.ROLL, Workflow.workflows[this.uuid], "attackCardData");
  let result: Roll = await wrapped({
    advantage: workflow.rollOptions.advantage,
    disadvantage: workflow.rollOptions.disadvantage,
    chatMessage: !configSettings.mergeCard,
    event: {shiftKey: workflow.rollOptions.fastForward}
  });
  if (workflow.targets?.size === 0) {// no targets recorded when we started the roll grab them now
    workflow.targets = new Set(game.user.targets);
  }
  if (!result) { // attack roll failed.
    error("Itemhandling rollAttack failed")
    return;
    // workflow._next(WORKFLOWSTATES.ROLLFINISHED);
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

export async function doDamageRoll(wrapped, {event = null, spellLevel = null, versatile = null} = {}) {
  let workflow = Workflow.getWorkflow(this.uuid);
  if (!enableWorkflow) {
    return await wrapped({event, versatile})
  }
  if (!workflow) {
    warn("Roll Damage: No workflow for item ", this.name);
    return await wrapped({event, spellLevel, versatile})
  }
  if (workflow.currentState !== WORKFLOWSTATES.WAITFORDAMGEROLL){
    switch (workflow?.currentState) {
      case WORKFLOWSTATES.AWAITTEMPLATE:
        return ui.notifications.warn(i18n("midi-qol.noTemplateSeen"));
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        return ui.notifications.warn(i18n("midi-qol.noAttackRoll"));
      default: 
        return ui.notifications.warn(i18n("broken universe"));
    }
  }
  // we actually want to collect the html from the damage roll, so need to render and grab
  // hideChatMessage(configSettings.mergeCard && enableWorkflow, data => data?.type === CONST.CHAT_MESSAGE_TYPES.ROLL, Workflow.workflows[this.uuid], "damageCardData");
  workflow.processDamageEventOptions(event);
  // Allow overrides form the caller
  if (spellLevel) workflow.rollOptions.spellLevel = spellLevel;
  if (versatile !== null) workflow.rollOptions.versatile = versatile;
  let result: Roll = await wrapped({
    critical: workflow.rollOptions.critical, 
    spellLevel: workflow.rollOptions.spellLevel, 
    versatile: workflow.rollOptions.versatile || versatile, 
    event: {shiftKey: workflow.rollOptions.fastForward},
    options: {
      fastForward: workflow.rollOptions.fastForward, 
      chatMessage: !configSettings.mergeCard,
    }})
  if (!result?.total) { // user backed out of damage roll or roll failed
    return;
  }
// If the roll was a critical or the user selected crtical
//@ts-ignore
  if (workflow.isCritical || result.terms[0].options?.critical) 
    result = doCritModify(result);
  workflow.damageRoll = result;
  workflow.damageTotal = result.total;
  workflow.damageRollHTML = await result.render();

  // roll a critical as well
  let critResult: Roll = await wrapped({
    critical: true, 
    spellLevel: workflow.rollOptions.spellLevel, 
    versatile: workflow.rollOptions.versatile || versatile, 
    event: {shiftKey: workflow.rollOptions.fastForward},
    options: {
      fastForward: true, 
      chatMessage: false
    }})
  critResult = doCritModify(critResult);
  workflow.criticalRoll = critResult;
  workflow.criticalTotal = critResult.total;
  workflow.criticalRollHTML = await critResult.render();
  workflow.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);
  return result;
}

export async function doItemRoll(wrapped, options = {showFullCard:false, createWorkflow:true, versatile:false, configureDialog:true}) {
  let showFullCard = options?.showFullCard ?? false;
  let createWorkflow = options?.createWorkflow ?? true;
  let versatile = options?.versatile ?? false;
  let configureDialog = options?.configureDialog ?? true;
  if (!enableWorkflow || createWorkflow === false) {
    return await wrapped({configureDialog:true, rollMode:null, createMessage:true});
  }
  const shouldAllowRoll = !configSettings.requireTargets // we don't care about targets
                          || (game.user.targets.size > 0) // there are some target selected
                          || (this.data.data.target?.type === "self") // self target
                          || (this.hasAreaTarget && configSettings.autoTarget) // area effectspell and we will auto target
                          || (configSettings.rangeTarget && this.data.data.target?.units === "ft" && ["creature", "ally", "enemy"].includes(this.data.data.target?.type)) // rangetarget
                          || (!this.hasAttack && !this.hasDamage && !this.hasSave); // does not do anything - need to chck dynamic effects

  if (this.type === "spell") {
    const midiFlags = this.actor.data.flags["midi-qol"];
    const needsVocal = this.data.data.components?.vocal;
    const needsSomatic = this.data.data.components?.somatic;
    const needsMaterial = this.data.data.components?.material;

    if (midiFlags?.fail?.spell?.all) {
      ui.notifications.warn("You are unable to cast the spell");
      return;
    }
    if (midiFlags?.fail?.spell?.vocal && needsVocal) {
      ui.notifications.warn("You make no sound and the spell fails");
      return;
    }
    if (midiFlags?.fail?.spell?.somatic && needsSomatic) {
      ui.notifications.warn("You can't make the gestures and the spell fails");
      return;
    }
    if (midiFlags?.fail?.spell?.material && needsMaterial) {
      ui.notifications.warn("You can't use the material component and the spell fails");
      return;
    }
  }
  if (!shouldAllowRoll) {
    ui.notifications.warn(i18n("midi-qol.noTargets"));
    warn(`${game.username} attempted to roll with no targets selected`)
    return;
  }
  //@ts-ignore
  debug("doItemRoll ", event?.shiftKey, event?.ctrlKey, event?.altKey);
  let speaker = ChatMessage.getSpeaker();

  let baseItem = this.actor.getOwnedItem(this.id);
  const targets = (baseItem?.data.data.target?.type === "self") ? getSelfTargetSet(this.actor) : new Set(game.user.targets);
  let workflow: Workflow = new Workflow(this.actor, baseItem, this.actor.token?.id, speaker, targets, event);
  //@ts-ignore event .type not defined
  workflow.rollOptions.versatile = workflow.rollOptions.versatile || versatile;
  // workflow.versatile = versatile;
  // if showing a full card we don't want to auto roll attcks or damage.
  workflow.noAutoDamage = showFullCard;
  workflow.noAutoAttack = showFullCard;
  let result = await wrapped({configureDialog, rollMode:null, createMessage:false});
  /* need to get spell level from the html returned in result */
  if(!result) {
    //TODO find the right way to clean this up
    // Workflow.removeWorkflow(workflow.id);
    return;
  }
  workflow.itemLevel = this.data.data.level;
  if (this.type === "spell") {
    //TODO look to use returned data when available
    let spellStuff = result.content?.match(/.*data-spell-level="(.*)">/);
    workflow.itemLevel = parseInt(spellStuff[1]) || this.data.data.level;;
  }

  const needAttckButton = !workflow.someEventKeySet() && !configSettings.autoRollAttack;
  workflow.showCard = configSettings.mergeCard || (configSettings.showItemDetails !== "none") || (
                (baseItem.isHealing && configSettings.autoRollDamage === "none")  || // not rolling damage
                (baseItem.hasDamage && configSettings.autoRollDamage === "none") ||
                (baseItem.hasSave && configSettings.autoCheckSaves === "none") ||
                (baseItem.hasAttack && needAttckButton)) ||
                (!baseItem.hasAttack && !baseItem.hasDamage && !baseItem.hasSave);

  let item = this;
  if (this.data.data.level !== workflow.itemLevel) {
    const upcastData = mergeObject(this.data, {"data.level": workflow.itemLevel}, {inplace: false});
    item = this.constructor.createOwned(upcastData, this.actor);  // Replace the item with an upcast version
  }
  if (workflow.showCard) {
    //@ts-ignore - 
    var itemCard: ChatMessage = await showItemCard.bind(item)(showFullCard, workflow)
    workflow.itemCardId = itemCard.id;
    debug("Item Roll: showing card", itemCard, workflow)
  };
  workflow.next(WORKFLOWSTATES.NONE);
  return itemCard ?? result;
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
  const hideItemDetails = (["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !isPlayerOwned)) 
                            || !configSettings.itemTypeList.includes(this.type);
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
    hideItemDetails
  }
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
    flavor: this.data.data.chatFlavor || this.name,
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
      t = canvas.tokens.get(t.id);
      // skip special tokens with a race of trigger
      if (t.actor.data?.data.details.race === "trigger") return false;
      const w = t.width >= 1 ? 0.5 : t.data.width / 2;
      const h = t.height >= 1 ? 0.5 : t.data.height / 2;
      const gridSize = canvas.scene.data.grid;
      let contained = false;
      for (let xstep = w; xstep < t.data.width && !contained; xstep++) {
        for (let ystep = h; ystep < t.data.height && !contained; ystep++) {
          const tx = t.x + xstep * gridSize;
          const ty = t.y + ystep * gridSize;
          if (shape.contains(tx - tdx, ty - tdy)) {
            if (!wallsBlockTargeting) {
              contained = true;
            } else {
              let r = new Ray({ x: tx, y: ty}, templateDetails.data);
              contained = !canvas.walls.checkCollision(r);
            }
          }
        }
      }
      return contained;
    }).forEach(t => {
      t.setTarget(true, { user: game.user, releaseOthers: false });
      game.user.targets.add(t);
    });
    // game.user.broadcastActivity({targets: game.user.targets.ids});

    // Assumes area affect do not have a to hit roll
    this.saves = new Set();
    this.targets = new Set(game.user.targets);
    this.hitTargets = new Set(game.user.targets);
    this.templateData = data;
  return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
  }, 250);
};

export function doCritModify(result: Roll) {
  if (criticalDamage === "default") return result;
  let rollBase = new Roll(result.formula);
  if (criticalDamage === "maxDamage") {// max base damage
    //@ts-ignore .terms not defined
    rollBase.terms = rollBase.terms.map(t => {
      if (t?.number) t.number = Math.floor(t.number/2);
      return t;
    });
    //@ts-ignore .evaluate not defined
    rollBase.evaluate({maximize: true});
    return rollBase;
  } else if (criticalDamage === "maxCrit") { // see about maximising one dice out of the two
    let rollCrit = new Roll(result.formula);
    //@ts-ignore .terms not defined
    rollCrit.terms = rollCrit.terms.map(t => {
      if (t?.number) t.number = Math.ceil(t.number/2);
      if (typeof t === "number") t = 0;
      return t;
    });
    //@ts-ignore .terms not defined
    rollBase.terms = rollBase.terms.map(t => {
      if (t?.number) t.number = Math.floor(t.number/2);
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