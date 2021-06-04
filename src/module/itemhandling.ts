import { warn, debug, error, i18n, log, MESSAGETYPES, i18nFormat, midiFlags, allAttackTypes, gameStats } from "../midi-qol";
import { BetterRollsWorkflow, defaultRollOptions, DummyWorkflow, Workflow, WORKFLOWSTATES } from "./workflow";
import { configSettings, itemDeleteCheck, enableWorkflow, criticalDamage, autoFastForwardAbilityRolls, checkRule } from "./settings";
import { addConcentration, checkRange, getAutoRollAttack, getAutoRollDamage, getRemoveDamageButtons, getSelfTarget, getSelfTargetSet, isAutoFastAttack, isAutoFastDamage, itemHasDamage, itemIsVersatile, untargetAllTokens, validTargetTokens } from "./utils";
import { installedModules } from "./setupModules";
import { setupSheetQol } from "./sheetQOL";

export async function doAttackRoll(wrapped, options = { event: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }, versatile: false, resetAdvantage: false, chatMessage: false }) {
  let workflow: Workflow | undefined = Workflow.getWorkflow(this.uuid);
  debug("Entering item attack roll ", event, workflow, Workflow._workflows);
  if (!workflow || !enableWorkflow) { // TODO what to do with a random attack roll
    if (enableWorkflow) warn("Roll Attack: No workflow for item ", this.name, this.id, event);
    const roll = await wrapped(options);
    // if (configSettings.keepRollStats) gameStats.addAttackRoll(roll, this);
    return roll;
  }

  if (workflow.workflowType === "Workflow") {
    workflow.targets = (this.data.data.target?.type === "self") ? await getSelfTargetSet(this.actor) : await validTargetTokens(game.user.targets);
    if (workflow.attackRoll) { // we are re-rolling the attack.
      workflow.damageRoll = undefined;
      await Workflow.removeAttackDamageButtons(this.id)
      workflow.itemCardId = (await showItemCard.bind(this)(false, workflow, false)).id;
    }
  }
  if (options.resetAdvantage) {
    workflow.advantage = false;
    workflow.disadvantage = false;
    workflow.rollOptions = duplicate(defaultRollOptions);
  }
  workflow.processAttackEventOptions(options?.event);
  workflow.checkAttackAdvantage();
  workflow.rollOptions.fastForward = workflow.rollOptions.fastForwardKey ? !isAutoFastAttack(workflow) : isAutoFastAttack(workflow);
  if (!workflow.rollOptions.fastForwardKey && (workflow.rollOptions.advKey || workflow.rollOptions.disKey))
    workflow.rollOptions.fastForward = true;
  workflow.rollOptions.advantage = workflow.disadvantage ? false : workflow.advantage;
  workflow.rollOptions.disadvantage = workflow.advantage ? false : workflow.disadvantage;
  const defaultOption = workflow.rollOptions.advantage ? "advantage" : workflow.rollOptions.disadvantage ? "disadvantage" : "normal";
  {
    //@ts-ignore
    options.advantage = workflow.rollOptions.advantage;
    //@ts-ignore
    options.disadvantage = workflow.rollOptions.disadvantage;
  }

  if (workflow.workflowType === "TrapWorkflow") workflow.rollOptions.fastForward = true;
  let displayChat = !configSettings.mergeCard;
  if (workflow.workflowType === "BetterRollsWorkflow") displayChat = options.chatMessage;
  if (!Hooks.call("midi-qol.preAttackRoll", this, workflow)) {
    console.warn("midi-qol | attack roll blocked by pre hook");
  }
  let result: Roll = await wrapped({
    advantage: workflow.rollOptions.advantage,
    disadvantage: workflow.rollOptions.disadvantage,
    chatMessage: displayChat,
    fastForward: workflow.rollOptions.fastForward,
    // dialogOptions: { default: defaultOption } TODO Enable this when supported in core
  });

  if (!result) return result;
  if (workflow.workflowType === "BetterRollsWorkflow") {
    // we are rolling this for better rolls
    return result;
  }

  if (configSettings.keepRollStats) {
    //@ts-ignore
    const terms = result.terms;
    const rawRoll = terms[0].total;
    const total = result.total;
    const fumble = rawRoll <= terms[0].options.fumble;
    const critical = rawRoll >= terms[0].options.critical;
    gameStats.addAttackRoll({ rawRoll, total, fumble, critical }, this);
  }
  const dice3dActive = game.dice3d && (game.settings.get("dice-so-nice", "settings")?.enabled)
  if (dice3dActive && configSettings.mergeCard) {
    let whisperIds = null;
    const rollMode = game.settings.get("core", "rollMode");
    if ((["details", "all"].includes(configSettings.hideRollDetails) && game.user.isGM) || rollMode === "blindroll") {
      whisperIds = ChatMessage.getWhisperRecipients("GM")
    } else if (rollMode === "selfroll" || rollMode === "gmroll") {
      whisperIds = ChatMessage.getWhisperRecipients("GM").concat(game.user);
    }
    await game.dice3d.showForRoll(result, game.user, true, whisperIds, rollMode === "blindroll" && !game.user.isGM)
  }

  if (workflow.targets?.size === 0) {// no targets recorded when we started the roll grab them now
    workflow.targets = await validTargetTokens(game.user.targets);
  }
  if (!result) { // attack roll failed.
    error("Itemhandling rollAttack failed")
    return;
    // workflow._next(WORKFLOWSTATES.ROLLFINISHED);
  }
  workflow.attackRoll = result;
  workflow.attackRollHTML = await result.render();
  workflow.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);
  return result;
}

export async function doDamageRoll(wrapped, { event = {}, spellLevel = null, powerLevel = null, versatile = null, options = {} } = {}) {
  let workflow = Workflow.getWorkflow(this.uuid);
  if (!enableWorkflow || !workflow) {
    if (!workflow)
      warn("Roll Damage: No workflow for item ", this.name);
    return await wrapped({ event, versatile, options })
  }
  const midiFlags = workflow.actor.data.flags["midi-qol"]
  if (workflow.currentState !== WORKFLOWSTATES.WAITFORDAMAGEROLL) {
    switch (workflow?.currentState) {
      case WORKFLOWSTATES.AWAITTEMPLATE:
        return ui.notifications.warn(i18n("midi-qol.noTemplateSeen"));
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        return ui.notifications.warn(i18n("midi-qol.noAttackRoll"));
    }
  }

  if (workflow.damageRoll) { // we are re-rolling the damage. redisplay the item card but remove the damage
    let chatMessage = game.messages.get(workflow.itemCardId);
    //@ts-ignore
    let content = chatMessage && chatMessage.data.content;
    let data;
    if (content) {
      data = duplicate(chatMessage.data);
      //@ts-ignore
      content = data.content;
      let searchRe = /<div class="midi-qol-damage-roll">[\s\S\n\r]*<div class="end-midi-qol-damage-roll">/;
      let replaceString = `<div class="midi-qol-damage-roll"><div class="end-midi-qol-damage-roll">`
      content = content.replace(searchRe, replaceString);
      searchRe = /<div class="midi-qol-other-roll">[\s\S\n\r]*<div class="end-midi-qol-other-roll">/;
      replaceString = `<div class="midi-qol-other-roll"><div class="end-midi-qol-other-roll">`
      content = content.replace(searchRe, replaceString);
      searchRe = /<div class="midi-qol-bonus-roll">[\s\S\n\r]*<div class="end-midi-qol-bonus-roll">/;
      replaceString = `<div class="midi-qol-bonus-roll"><div class="end-midi-qol-bonus-roll">`
      content = content.replace(searchRe, replaceString);
    }
    if (data) {
      await Workflow.removeAttackDamageButtons(this.uuid);
      delete data._id;
      workflow.itemCardId = (await ChatMessage.create(data)).id;
    }
  }
  workflow.processDamageEventOptions(event);
  // Allow overrides form the caller
  if (spellLevel) workflow.rollOptions.spellLevel = spellLevel;
  if (powerLevel) workflow.rollOptions.spellLevel = powerLevel;
  if (versatile !== null) workflow.rollOptions.versatile = versatile;
  warn("rolling damage  ", this.name, this);

  if (!Hooks.call("midi-qol.preDamageRoll", this, workflow)) {
    console.warn("midi-qol | Damaage roll blocked via pre-hook");
    return;
  }
  let result: Roll = await wrapped({
    critical: workflow.rollOptions.critical,
    spellLevel: workflow.rollOptions.spellLevel,
    powerLevel: workflow.rollOptions.spellLevel,
    versatile: workflow.rollOptions.versatile || versatile,
    fastForward: workflow.rollOptions.fastForward,
    event: {},
    // TODO enable this when possible via options "data.default": (workflow.rollOptions.critical || workflow.isCritical) ? "critical" : "normal",
    options: {
      fastForward: workflow.rollOptions.fastForward,
      chatMessage: false //!configSettings.mergeCard
    }
  })
  if (!result) { // user backed out of damage roll or roll failed
    return;
  }
  let otherResult = undefined;
  if (
    configSettings.rollOtherDamage &&
    workflow.item.hasSave && ["rwak", "mwak"].includes(workflow.item.data.data.actionType)
  ) {
    if (workflow.item.data.data.formula !== "")
      otherResult = new Roll(workflow.item.data.data.formula, workflow.actor?.getRollData()).roll();
    else if (this.isVersatile && !this.data.data.properties.ver) otherResult = await wrapped({
      // roll the versatile damage if there is a versatile damage field and the weapn is not marked versatile
      // TODO review this is the SRD monsters change the way extra damage is represented
      critical: false,
      powerLevel: workflow.rollOptions.spellLevel,
      spellLevel: workflow.rollOptions.spellLevel,
      versatile: true,
      fastForward: true,
      event: {},
      // "data.default": (workflow.rollOptions.critical || workflow.isCritical) ? "critical" : "normal",
      options: {
        fastForward: true,
        chatMessage: false //!configSettings.mergeCard,
      }
    });
  }
  if (!configSettings.mergeCard) {
    let actionFlavor;
    if (game.system.id === "dnd5e") {
      actionFlavor = game.i18n.localize(this.data.data.actionType === "heal" ? "DND5E.Healing" : "DND5E.DamageRoll");
    } else {
      actionFlavor = game.i18n.localize(this.data.data.actionType === "heal" ? "SW5E.Healing" : "SW5E.DamageRoll");
    }

    const title = `${this.name} - ${actionFlavor}`;
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    let messageData = mergeObject({
      title,
      flavor: this.labels.damageTypes.length ? `${title} (${this.labels.damageTypes})` : title,
      speaker,
    }, { "flags.dnd5e.roll": { type: "damage", itemId: this.id } });
    result.toMessage(messageData, {rollMode: game.settings.get("core", "rollMode")});
    if (otherResult) {
      messageData = mergeObject({
        title,
        flavor: title,
        speaker,
      }, { "flags.dnd5e.roll": { type: "other", itemId: this.id } });
      otherResult.toMessage(messageData, {rollMode: game.settings.get("core", "rollMode")})
    }
  }
  const dice3dActive = game.dice3d && (game.settings.get("dice-so-nice", "settings")?.enabled)
  if (dice3dActive && configSettings.mergeCard) {
    let whisperIds = null;
    const rollMode = game.settings.get("core", "rollMode");
    if ((!["none", "detailsDSN"].includes(configSettings.hideRollDetails) && game.user.isGM) || rollMode === "blindroll") {
      whisperIds = ChatMessage.getWhisperRecipients("GM")
    } else if (rollMode === "selfroll" || rollMode === "gmroll") {
      whisperIds = ChatMessage.getWhisperRecipients("GM").concat(game.user);
    }
    await game.dice3d.showForRoll(result, game.user, true, whisperIds, rollMode === "blindroll" && !game.user.isGM)
    if (configSettings.rollOtherDamage && otherResult)
      await game.dice3d.showForRoll(otherResult, game.user, true, whisperIds, rollMode === "blindroll" && !game.user.isGM)
  }

  workflow.damageRoll = result;
  workflow.damageTotal = result.total;
  workflow.damageRollHTML = await result.render();
  workflow.otherDamageRoll = otherResult;
  workflow.otherDamageTotal = otherResult?.total;
  workflow.otherDamageHTML = await otherResult?.render();
  workflow.bonusDamageRoll = null;
  workflow.bonusDamageHTML = null;
  workflow.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);
  return result;
}

export async function doItemRoll(wrapped, options = { showFullCard: false, createWorkflow: true, versatile: false, configureDialog: true, event}) {
  let showFullCard = options?.showFullCard ?? false;
  let createWorkflow = options?.createWorkflow ?? true;
  let versatile = options?.versatile ?? false;
  let configureDialog = options?.configureDialog ?? true;
  if (!enableWorkflow || createWorkflow === false) {
    return await wrapped(options);
  }
  const isRangeSpell = configSettings.rangeTarget && this.data.data.target?.units === "ft" && ["creature", "ally", "enemy"].includes(this.data.data.target?.type);
  const isAoESpell = this.hasAreaTarget && configSettings.autoTarget;
  const myTargets = await await validTargetTokens(game.user.targets);
  const requiresTargets = configSettings.requiresTargets === "always" || (configSettings.requiresTargets === "combat" &&  game.combat);
  let shouldAllowRoll = !requiresTargets // we don't care about targets
    || (myTargets.size > 0) // there are some target selected
    || (this.data.data.target?.type === "self") // self target
    || isAoESpell // area effectspell and we will auto target
    || isRangeSpell // rangetarget and will autotarget
    || (!this.hasAttack && !itemHasDamage(this) && !this.hasSave); // does not do anything - need to chck dynamic effects

  if (requiresTargets && !isRangeSpell && !isAoESpell && this.data.data.target?.type === "creature" && myTargets.size === 0) shouldAllowRoll = false;
  // only allow weapon attacks against at most the specified number of targets
  let allowedTargets = (this.data.data.target?.type === "creature" ? this.data.data.target?.value : 9099) ?? 9999
  let speaker = ChatMessage.getSpeaker({ actor: this.actor });
  // do pre roll checks
  if (checkRule("checkRange")) {
    if (speaker.token && checkRange(this.actor, this, speaker.token, myTargets) === "fail")
      return;
  }
  if (game.system.id === "dnd5e" && requiresTargets && myTargets.size > allowedTargets) {
    shouldAllowRoll = false;
    ui.notifications.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
    warn(`${game.user.name} ${i18nFormat("midi-qol.midi-qol.wrongNumberTargets", { allowedTargets })}`)
    return;
  }
  if (this.type === "spell" && shouldAllowRoll) {
    const midiFlags = this.actor.data.flags["midi-qol"];
    const needsVerbal = this.data.data.components?.vocal;
    const needsSomatic = this.data.data.components?.somatic;
    const needsMaterial = this.data.data.components?.material;


    //TODO Consider how to disable this check for Damageonly workflowa and trap workflowss
    if (midiFlags?.fail?.spell?.all) {
      ui.notifications.warn("You are unable to cast the spell");
      return null;
    }
    if (midiFlags?.fail?.spell?.verbal && needsVerbal) {
      ui.notifications.warn("You make no sound and the spell fails");
      return null;
    }
    if (midiFlags?.fail?.spell?.somatic && needsSomatic) {
      ui.notifications.warn("You can't make the gestures and the spell fails");
      return null;
    }
    if (midiFlags?.fail?.spell?.material && needsMaterial) {
      ui.notifications.warn("You can't use the material component and the spell fails");
      return null;
    }
  }
  const needsConcentration = this.data.data.components?.concentration || this.data.data.activation?.condition?.includes("Concentration");
  const checkConcentration = configSettings.concentrationAutomation; // installedModules.get("combat-utility-belt") && configSettings.concentrationAutomation;
  if (needsConcentration && checkConcentration) {
    const concentrationName = installedModules.get("combat-utility-belt")
      ? game.settings.get("combat-utility-belt", "concentratorConditionName")
      : i18n("midi-qol.Concentrating");
    const concentrationCheck = this.actor.effects.contents.find(i => i.data.label === concentrationName);

    if (concentrationCheck) {
      let d = await Dialog.confirm({
        title: i18n("midi-qol.ActiveConcentrationSpell.Title"),
        content: i18n("midi-qol.ActiveConcentrationSpell.Content"),
        yes: async () => {
          if (installedModules.get("combat-utility-belt"))
            game.cub.removeCondition(concentrationName, [await getSelfTarget(this.actor)], { warn: false });
          else concentrationCheck.delete();
        },
        no: () => { shouldAllowRoll = false; }
      });
    }
    if (!shouldAllowRoll) return; // user aborted spell
  }

  if (!shouldAllowRoll) {
    ui.notifications.warn(i18n("midi-qol.noTargets"));
    warn(`${game.user.name} attempted to roll with no targets selected`)
    return;
  }

  const targets = (this?.data.data.target?.type === "self") ? await getSelfTargetSet(this.actor) : myTargets;

  let workflow: Workflow;
  if (installedModules.get("betterrolls5e")) { // better rolls will handle the item roll
    workflow = new BetterRollsWorkflow(this.actor, this, speaker, targets, event || options.event);
    return wrapped(options);
  }
  workflow = new Workflow(this.actor, this, speaker, targets, { event: options.event || event });
  workflow.rollOptions.versatile = workflow.rollOptions.versatile || versatile;
  // if showing a full card we don't want to auto roll attcks or damage.
  workflow.noAutoDamage = showFullCard;
  workflow.noAutoAttack = showFullCard;
  let result = await wrapped({ configureDialog, rollMode: null, createMessage: false });
  if (!result) {
    //TODO find the right way to clean this up
    // Workflow.removeWorkflow(workflow.id); ?
    return null;
  }
  /* need to get spell level from the html returned in result */
  if (this.type === "spell") {
    //TODO look to use returned data when available
    let spellStuff = result.content?.match(/.*data-spell-level="(.*)">/);
    workflow.itemLevel = parseInt(spellStuff[1]) || this.data.data.level;
    if (needsConcentration) addConcentration({ workflow })
  }
  if (this.type === "power") {
    //TODO look to use returned data when available
    let spellStuff = result.content?.match(/.*data-power-level="(.*)">/);
    workflow.itemLevel = parseInt(spellStuff[1]) || this.data.data.level;
    if (needsConcentration) addConcentration({ workflow })
  }

  workflow.processAttackEventOptions(event);
  workflow.checkAttackAdvantage();
  const needAttckButton = !workflow.someEventKeySet() && !getAutoRollAttack();
  workflow.showCard = configSettings.mergeCard || (configSettings.showItemDetails !== "none") || (
    (this.isHealing && getAutoRollDamage() === "none") || // not rolling damage
    (itemHasDamage(this) && getAutoRollDamage() === "none") ||
    (this.hasSave && configSettings.autoCheckSaves === "none") ||
    (this.hasAttack && needAttckButton)) ||
    (!this.hasAttack && !itemHasDamage(this) && !this.hasSave);

  if (workflow.showCard) { //TODO check this against dnd5e 1.30
    let item = this;
    if (this.data.data.level && (workflow.itemLevel !== this.data.data.level)) {
      item = this.clone({"data.level": workflow.itemLevel}, {keepId: true});
      item.data.update({_id: this.id});
      item.prepareFinalAttributes();
    }
    var itemCard: ChatMessage = await showItemCard.bind(item)(showFullCard, workflow)
    workflow.itemCardId = itemCard.id;
    debug("Item Roll: showing card", itemCard, workflow);
  }
  workflow.next(WORKFLOWSTATES.NONE);
  return itemCard ?? result;
}

export async function showItemInfo() {
  const token = this.actor.token;
  const sceneId = token?.scene && token.scene.id || canvas.scene.id;

  const templateData = {
    actor: this.actor,
    tokenId: token?.uuid || null, //TODO come back and fix? this
    item: this.data,
    itemUuid: this.uuid,
    data: this.getChatData(),
    labels: this.labels,
    condensed: false,
    hasAttack: false,
    isHealing: false,
    hasDamage: false,
    isVersatile: false,
    isSpell: this.type === "spell",
    isPower: this.type === "power",
    hasSave: false,
    hasAreaTarget: false,
    hasAttackRoll: false,
    configSettings,
    hideItemDetails: false,
    hasEffects: false,
    isMerge: false
  };

  const templateType = ["tool"].includes(this.data.type) ? this.data.type : "item";
  const template = `modules/midi-qol/templates/${templateType}-card.html`;
  const html = await renderTemplate(template, templateData);

  const chatData = {
    user: game.user.id,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    speaker: {
      actor: this.actor.id,
      token: this.actor.token?.id,
      alias: (configSettings.useTokenNames && token) ? token.data.name : this.actor.name,
      scene: canvas?.scene?.id
    },
    flags: {
      "core": { "canPopout": true }
    }
  };

  // Toggle default roll mode
  let rollMode = game.settings.get("core", "rollMode");
  if (["gmroll", "blindroll"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").filter(u => u.active);
  if (rollMode === "blindroll") chatData["blind"] = true;
  if (rollMode === "selfroll") chatData["whisper"] = [game.user.id];

  // Create the chat message
  return ChatMessage.create(chatData);
}


export async function showItemCard(showFullCard: boolean, workflow: Workflow, minimalCard = false) {
  warn("show item card ", this, this.actor, this.actor.token, showFullCard, workflow);

  const token = this.actor.token;
  let needAttackButton = !workflow.someEventKeySet() && !configSettings.autoRollAttack;
  needAttackButton = true || needAttackButton || !getAutoRollAttack();
  needAttackButton = needAttackButton || (getAutoRollAttack() && workflow.rollOptions.fastForwardKey)
  const needDamagebutton = itemHasDamage(this) && (getAutoRollDamage() === "none" || !getRemoveDamageButtons() || showFullCard);
  const needVersatileButton = itemIsVersatile(this) && (showFullCard || getAutoRollDamage() === "none");
  const sceneId = token?.scene && token.scene.id || canvas.scene?.id;
  let isPlayerOwned = this.actor.hasPlayerOwner;

  if (isNewerVersion("0.6.9", game.data.version)) isPlayerOwned = this.actor.isPC
  const hideItemDetails = (["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !isPlayerOwned))
    || !configSettings.itemTypeList.includes(this.type);
  const hasEffects = workflow.hasDAE && workflow.workflowType === "Workflow" && this.data.effects.find(ae => !ae.transfer);
  let dmgBtnText = (this.data?.data?.actionType === "heal") ? i18n("DND5E.Healing") : i18n("DND5E.Damage");
  if (isAutoFastDamage()) dmgBtnText += ` ${i18n("midi-qol.fastForward")}`;
  let versaBtnText = i18n("DND5E.Versatile");
  if (isAutoFastDamage()) versaBtnText += `${i18n("DND5E.Versatile")} ${i18n("midi-qol.fastForward")}`;
  const templateData = {
    actor: this.actor,
    tokenId: token?.uuid || null, //TODO come back and fix? this
    item: this.data,
    itemUuid: this.uuid,
    data: this.getChatData(),
    labels: this.labels,
    condensed: this.hasAttack && configSettings.mergeCardCondensed,
    hasAttack: !minimalCard && this.hasAttack && (showFullCard || needAttackButton),
    isHealing: !minimalCard && this.isHealing && (showFullCard || configSettings.autoRollDamage === "none"),
    hasDamage: needDamagebutton,
    isVersatile: needVersatileButton,
    isSpell: this.type === "spell",
    isPower: this.type === "power",
    hasSave: !minimalCard && this.hasSave && (showFullCard || configSettings.autoCheckSaves === "none"),
    hasAreaTarget: !minimalCard && this.hasAreaTarget,
    hasAttackRoll: !minimalCard && this.hasAttack,
    configSettings,
    hideItemDetails,
    dmgBtnText,
    versaBtnText,
    showProperties: workflow.workflowType === "Workflow",
    hasEffects,
    isMerge: configSettings.mergeCard
  }
  const templateType = ["tool"].includes(this.data.type) ? this.data.type : "item";
  const template = `modules/midi-qol/templates/${templateType}-card.html`;
  const html = await renderTemplate(template, templateData);
  debug(" Show Item Card ", configSettings.useTokenNames, (configSettings.useTokenNames && token) ? token?.data?.name : this.actor.name, token, token?.data.name, this.actor.name)
  let theSound = configSettings.itemUseSound;
  if (this.type === "weapon") theSound = configSettings.weaponUseSound;
  else if (["spell", "power"].includes(this.type)) theSound = configSettings.spellUseSound;
  else if (this.type === "consumable" && this.name.toLowerCase().includes(i18n("midi-qol.potion").toLowerCase())) theSound = configSettings.potionUseSound;
  const chatData = {
    user: game.user.id,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    flavor: this.data.data.chatFlavor || this.name,
    speaker: {
      actor: this.actor?.id,
      token: this.actor?.token?.id,
      alias: (configSettings.useTokenNames && token) ? token.data.name : this.actor.name,
      scene: canvas?.scene?.id
    },
    flags: {
      "midi-qol": {
        itemUuid: workflow.item.uuid,
        actorUuid: workflow.actor.uuid,
        sound: theSound,
        type: MESSAGETYPES.ITEM,
        itemId: workflow.itemId
      },
      "core": { "canPopout": true }
    }
  };
  if ((this.data.type === "consumable") && !this.actor.items.has(this.id)) {
    chatData.flags["dnd5e.itemData"] = this.data;
  }
  // Toggle default roll mode
  let rollMode = game.settings.get("core", "rollMode");
  if (["gmroll", "blindroll"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
  if (rollMode === "blindroll") chatData["blind"] = true;
  if (rollMode === "selfroll") chatData["whisper"] = [game.user.id];
  // Create the chat message
  return ChatMessage.create(chatData);
}

function isTokenInside(token, wallsBlockTargeting) {
  const grid = canvas.scene.data.grid,
		templatePos = { x: this.data.x, y: this.data.y };
	// Check for center of  each square the token uses.
	// e.g. for large tokens all 4 squares
	const startX = token.width >= 1 ? 0.5 : token.width / 2;
	const startY = token.height >= 1 ? 0.5 : token.height / 2;
  // console.error(grid, templatePos, startX, startY, token.width, token.height, token)
	for (let x = startX; x < token.width; x++) {
		for (let y = startY; y < token.height; y++) {
			const currGrid = {
				x: token.x + x * grid - templatePos.x,
				y: token.y + y * grid - templatePos.y,
			};
			let contains = this.shape?.contains(currGrid.x, currGrid.y);
			if (contains && wallsBlockTargeting) {
        const r = new Ray({x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y}, templatePos);
        contains = !canvas.walls.checkCollision(r);
      }
      if (contains) return true;
		}
	}
	return false;
}

export function templateTokens(template) {
  if (configSettings.autoTarget === "none") return;
  const wallsBlockTargeting = configSettings.autoTarget === "wallsBlock";
	const tokens = canvas.tokens.placeables.map(t=>t.data)
  let targets = [];
  let tokenInside = isTokenInside.bind(template)
  for (const tokenData of tokens) {
    if (tokenInside(tokenData, wallsBlockTargeting)) {
      targets.push(tokenData._id);
    }
  }
  // console.error("targets", targets)
  game.user.updateTokenTargets(targets);
}

export function selectTargets(templateDocument, data, user) {
  let item = this?.item;
  let targeting = configSettings.autoTarget;
  if (user !== game.user.id) {
    return true;
  }
  this.templateId = templateDocument?.id;
  this.templateUuid = templateDocument?.uuid;
  if (targeting === "none") { // this is no good
    Hooks.callAll("midi-qol-targeted", this.targets);
    return true;
  }
  if (!templateDocument.data) return true;

  // if the item specifies a range of "self" don't target the caster.
  let selfTarget = (item?.data.data.range?.units === "spec") ? canvas.tokens.get(this.tokenId) : null;
  if (selfTarget && game.user.targets.has(selfTarget)) {
    // we are targeted and should not be
    selfTarget.setTarget(false, {user: game.user, releaseOther: false})
    game.user.targets.delete(selfTarget)
  }
  this.saves = new Set();
  this.targets = game.user.targets;
  this.hitTargets = game.user.targets;
  this.templateData = templateDocument.data;
  return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
};
