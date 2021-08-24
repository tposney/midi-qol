import { warn, debug, error, i18n, MESSAGETYPES, i18nFormat, gameStats, getCanvas } from "../midi-qol.js";
import { BetterRollsWorkflow, defaultRollOptions, Workflow, WORKFLOWSTATES } from "./workflow.js";
import { configSettings, enableWorkflow, checkRule } from "./settings.js";
import { checkRange, getAutoRollAttack, getAutoRollDamage, getRemoveDamageButtons, getSelfTargetSet, getSpeaker, isAutoFastAttack, isAutoFastDamage, itemHasDamage, itemIsVersatile, processAttackRollBonusFlags, processDamageRollBonusFlags, validTargetTokens } from "./utils.js";
import { dice3dEnabled, installedModules } from "./setupModules.js";

export async function doAttackRoll(wrapped, options = { event: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }, versatile: false, resetAdvantage: false, chatMessage: undefined }) {
  let workflow: Workflow | undefined = Workflow.getWorkflow(this.uuid);
  debug("Entering item attack roll ", event, workflow, Workflow._workflows);
  if (!workflow || !enableWorkflow) { // TODO what to do with a random attack roll
    if (enableWorkflow) warn("Roll Attack: No workflow for item ", this.name, this.id, event);
    const roll = await wrapped(options);
    // if (configSettings.keepRollStats) gameStats.addAttackRoll(roll, this);
    return roll;
  }

  if (workflow.workflowType === "Workflow") {
    workflow.targets = (this.data.data.target?.type === "self") ? getSelfTargetSet(this.actor) : await validTargetTokens(game.user?.targets);
    if (workflow.attackRoll) { // we are re-rolling the attack.
      workflow.damageRoll = undefined;
      await Workflow.removeAttackDamageButtons(this.id)
      workflow.itemCardId = (await showItemCard.bind(this)(false, workflow, false, true)).id;
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
  if (!Hooks.call("midi-qol.preAttackRoll", this, workflow)) {
    console.warn("midi-qol | attack roll blocked by pre hook");
    return;
  }
  let result: Roll = await wrapped({
    advantage: workflow.rollOptions.advantage,
    disadvantage: workflow.rollOptions.disadvantage,
    chatMessage: (["TrapWorkflow", "Workflow"].includes(workflow.workflowType)) ? false : options.chatMessage,
    fastForward: workflow.rollOptions.fastForward,
    messageData: {
      speaker: getSpeaker(this.actor)
    }
    // dialogOptions: { default: defaultOption } TODO Enable this when supported in core
  });

  if (!result) return result;
  console.warn("Advantage/Disadvantage sources: ", advDisadvAttribution(this.actor));
  result = Roll.fromJSON(JSON.stringify(result.toJSON()))
  if (workflow.workflowType === "BetterRollsWorkflow") {
    // we are rolling this for better rolls
    return result;
  }

  workflow.attackRoll = result;
  result = await processAttackRollBonusFlags.bind(workflow)();
  if (!configSettings.mergeCard) result.toMessage({
    speaker: getSpeaker(this.actor)
  });
  if (configSettings.keepRollStats) {
    const terms = result.terms;
    const rawRoll = Number(terms[0].total);
    const total = result.total;
    const options: any = terms[0].options
    const fumble = rawRoll <= options.fumble;
    const critical = rawRoll >= options.critical;
    gameStats.addAttackRoll({ rawRoll, total, fumble, critical }, this);
  }
  if (dice3dEnabled() && configSettings.mergeCard) {
    let whisperIds: User[] | null = null;
    const rollMode = game.settings.get("core", "rollMode");
    if ((["details", "all"].includes(configSettings.hideRollDetails) && game.user?.isGM) || rollMode === "blindroll") {
      whisperIds = ChatMessage.getWhisperRecipients("GM")
    } else if (rollMode === "selfroll" || rollMode === "gmroll") {
      whisperIds = ChatMessage.getWhisperRecipients("GM")
      if (game.user) whisperIds.concat(game.user);
    }

    //@ts-ignore game.dice3d
    await game.dice3d.showForRoll(workflow.attackRoll, game.user, true, whisperIds, rollMode === "blindroll" && !game.user.isGM)
  }

  if (workflow.targets?.size === 0) {// no targets recorded when we started the roll grab them now
    workflow.targets = await validTargetTokens(game.user?.targets);
  }
  if (!result) { // attack roll failed.
    error("Itemhandling rollAttack failed")
    return;
    // workflow._next(WORKFLOWSTATES.ROLLFINISHED);
  }
  // workflow.attackRoll = result; already set
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
        return ui.notifications?.warn(i18n("midi-qol.noTemplateSeen"));
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        return ui.notifications?.warn(i18n("midi-qol.noAttackRoll"));
    }
  }

  if (workflow.damageRoll) { // we are re-rolling the damage. redisplay the item card but remove the damage
    let chatMessage = game.messages?.get(workflow.itemCardId ?? "");
    let content = (chatMessage && chatMessage.data.content) ?? "";
    let data;
    if (content) {
      data = duplicate(chatMessage?.data);
      content = data.content || "";
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
      workflow.itemCardId = (await ChatMessage.create(data))?.id;
    }
  };

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
  // need to do this nonsense since the returned roll _formula has a trailing + for ammo
  result = Roll.fromJSON(JSON.stringify(result.toJSON()))
  workflow.damageRoll = result;
  workflow.damageTotal = Number(result.total);
  workflow.damageRollHTML = await result.render();
  result = await processDamageRollBonusFlags.bind(workflow)();
  let otherResult: Roll | undefined = undefined;
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
    const speaker = getSpeaker(this.actor)
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
  
    if (dice3dEnabled() && configSettings.mergeCard) {
    let whisperIds: User[] | null = null;
    const rollMode = game.settings.get("core", "rollMode");
    if ((!["none", "detailsDSN"].includes(configSettings.hideRollDetails) && game.user?.isGM) || rollMode === "blindroll") {
      whisperIds = ChatMessage.getWhisperRecipients("GM");
    } else if (rollMode === "selfroll" || rollMode === "gmroll") {
      whisperIds = ChatMessage.getWhisperRecipients("GM");
      if (game.user) whisperIds.concat(game.user);
    }
    //@ts-ignore game.dice3d
    await game.dice3d.showForRoll(result, game.user, true, whisperIds, rollMode === "blindroll" && !game.user.isGM)
    if (configSettings.rollOtherDamage && otherResult)
    //@ts-ignore game.dice3d
    await game.dice3d.showForRoll(otherResult, game.user, true, whisperIds, rollMode === "blindroll" && !game.user.isGM)
  }


  workflow.otherDamageRoll = otherResult;
  workflow.otherDamageTotal = otherResult?.total;
  workflow.otherDamageHTML = await otherResult?.render();
  workflow.bonusDamageRoll = null;
  workflow.bonusDamageHTML = null;
  workflow.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);
  return result;
}

export async function doItemRoll(wrapped, options = { showFullCard: false, createWorkflow: true, versatile: false, configureDialog: true, createMessage: undefined, event}) {
  let showFullCard = options?.showFullCard ?? false;
  let createWorkflow = options?.createWorkflow ?? true;
  let versatile = options?.versatile ?? false;
  let configureDialog = options?.configureDialog ?? true;
  if (!enableWorkflow || createWorkflow === false) {
    return await wrapped(options);
  }
  const isRangeSpell = configSettings.rangeTarget && this.data.data.target?.units === "ft" && ["creature", "ally", "enemy"].includes(this.data.data.target?.type);
  const isAoESpell = (this.hasAreaTarget && configSettings.autoTarget);
  const myTargets = game.user?.targets && await validTargetTokens(game.user?.targets);
  const requiresTargets = configSettings.requiresTargets === "always" || (configSettings.requiresTargets === "combat" &&  game.combat);
  let shouldAllowRoll = !requiresTargets // we don't care about targets
    || ((myTargets?.size || 0) > 0) // there are some target selected
    || (this.data.data.target?.type === "self") // self target
    || isAoESpell // area effectspell and we will auto target
    || isRangeSpell // rangetarget and will autotarget
    || (!this.hasAttack && !itemHasDamage(this) && !this.hasSave); // does not do anything - need to chck dynamic effects

  if (requiresTargets && !isRangeSpell && !isAoESpell && this.data.data.target?.type === "creature" && (myTargets?.size || 0) === 0) shouldAllowRoll = false;
  // only allow weapon attacks against at most the specified number of targets
  let allowedTargets = (this.data.data.target?.type === "creature" ? this.data.data.target?.value : 9999) ?? 9999
  let speaker = getSpeaker(this.actor);
  // do pre roll checks
  if (checkRule("checkRange") && !isAoESpell && !isRangeSpell) {
    if (speaker.token && checkRange(this.actor, this, speaker.token, myTargets) === "fail")
      return null;
  }
  if (game.system.id === "dnd5e" && requiresTargets && myTargets && myTargets.size > allowedTargets) {
    shouldAllowRoll = false;
    ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
    warn(`${game.user?.name} ${i18nFormat("midi-qol.midi-qol.wrongNumberTargets", { allowedTargets })}`)
    return null;
  }
  if (this.type === "spell" && shouldAllowRoll) {
    const midiFlags = this.actor.data.flags["midi-qol"];
    const needsVerbal = this.data.data.components?.vocal;
    const needsSomatic = this.data.data.components?.somatic;
    const needsMaterial = this.data.data.components?.material;

    //TODO Consider how to disable this check for Damageonly workflowa and trap workflowss
    if (midiFlags?.fail?.spell?.all) {
      ui.notifications?.warn("You are unable to cast the spell");
      return null;
    }
    if ((midiFlags?.fail?.spell?.verbal || midiFlags?.fail?.spell?.vocal) && needsVerbal) {
      ui.notifications?.warn("You make no sound and the spell fails");
      return null;
    }
    if (midiFlags?.fail?.spell?.somatic && needsSomatic) {
      ui.notifications?.warn("You can't make the gestures and the spell fails");
      return null;
    }
    if (midiFlags?.fail?.spell?.material && needsMaterial) {
      ui.notifications?.warn("You can't use the material component and the spell fails");
      return null;
    }
  }
  const needsConcentration = this.data.data.components?.concentration || this.data.data.activation?.condition?.includes("Concentration");
  const checkConcentration = configSettings.concentrationAutomation; // installedModules.get("combat-utility-belt") && configSettings.concentrationAutomation;
  if (needsConcentration && checkConcentration) {
    let concentrationLabel: any = "Concentrating";
    if (game.modules.get("dfreds-convenient-effects")?.active) {
      let concentrationId =  "Convenient Effect: Concentrating";
      let statusEffect: any = CONFIG.statusEffects.find(se => se.id === concentrationId);
      if (statusEffect) concentrationLabel = statusEffect.label;
    } else if (game.modules.get("combat-utility-belt")?.active) {
      
      concentrationLabel = game.settings.get("combat-utility-belt", "concentratorConditionName") 
    }
    const concentrationCheck = this.actor.effects.contents.find(i => i.data.label === concentrationLabel);

    if (concentrationCheck) {
      shouldAllowRoll = false;
      let d = await Dialog.confirm({
        title: i18n("midi-qol.ActiveConcentrationSpell.Title"),
        content: i18n("midi-qol.ActiveConcentrationSpell.Content"),
        yes: () => {shouldAllowRoll = true},
      });
      if (!shouldAllowRoll) return; // user aborted spell
      await concentrationCheck.delete();
    }
  }

  if (!shouldAllowRoll) {
    ui.notifications?.warn(i18n("midi-qol.noTargets"));
    warn(`${game.user?.name} attempted to roll with no targets selected`)
    return;
  }

  const targets = (this?.data.data.target?.type === "self") ? getSelfTargetSet(this.actor) : myTargets;

  let workflow: Workflow;
  if (installedModules.get("betterrolls5e")) { // better rolls will handle the item roll
    if (!this.id) this.data._id  = randomID();
    workflow = new BetterRollsWorkflow(this.actor, this, speaker, targets, event || options.event);
    // options.createMessage = true;
    const result = await  wrapped(options);
    return result;
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
    // if (needsConcentration) addConcentration({ workflow })
  }
  if (this.type === "power") {
    //TODO look to use returned data when available
    let spellStuff = result.content?.match(/.*data-power-level="(.*)">/);
    workflow.itemLevel = parseInt(spellStuff[1]) || this.data.data.level;
    // if (needsConcentration) addConcentration({ workflow })
  }

  workflow.processAttackEventOptions(event);
  workflow.checkAttackAdvantage();
  const needAttckButton = !workflow.someEventKeySet() && !getAutoRollAttack();
  workflow.showCard = true;
  /*configSettings.mergeCard || (configSettings.showItemDetails !== "none") || (
    (this.isHealing && getAutoRollDamage() === "none") || // not rolling damage
    (itemHasDamage(this) && getAutoRollDamage() === "none") ||
    (this.hasSave && configSettings.autoCheckSaves === "none") ||
    (this.hasAttack && needAttckButton)) ||
    (!this.hasAttack && !itemHasDamage(this) && !this.hasSave);
*/
  if (workflow.showCard) { 
    let item = this;
    if (this.data.data.level && (workflow.itemLevel !== this.data.data.level)) {
      item = this.clone({"data.level": workflow.itemLevel}, {keepId: true});
      item.data.update({_id: this.id});
      item.prepareFinalAttributes();
    }
    result = await showItemCard.bind(item)(showFullCard, workflow, false, options.createMessage)
    /*
    if (options.createMessage !== false) {
      workflow.itemCardId = result.id;
      workflow.next(WORKFLOWSTATES.NONE);
    } 
    */
    debug("Item Roll: showing card", result, workflow);
  }
  return result;
}

export async function showItemInfo() {
  const token = this.actor.token;
  const sceneId = token?.scene && token.scene.id || getCanvas().scene?.id;

  const templateData = {
    actor: this.actor,
    // tokenId: token?.id,
    tokenId: token?.document?.uuid ?? token?.uuid, 
    tokenUuid: token?.document?.uuid ?? token?.uuid,
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
    user: game.user?.id,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    speaker: getSpeaker(this.actor),
    flags: {
      "core": { "canPopout": true }
    }
  };

  // Toggle default roll mode
  let rollMode = game.settings.get("core", "rollMode");
  if (["gmroll", "blindroll"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").filter(u => u.active);
  if (rollMode === "blindroll") chatData["blind"] = true;
  if (rollMode === "selfroll") chatData["whisper"] = [game.user?.id];

  // Create the chat message
  return ChatMessage.create(chatData);
}


export async function showItemCard(showFullCard: boolean, workflow: Workflow, minimalCard = false, createMessage = true) {
  warn("show item card ", this, this.actor, this.actor.token, showFullCard, workflow);

  let token = this.actor.token;
  if (!token) token = this.actor.getActiveTokens()[0];
  let needAttackButton = !workflow.someEventKeySet() && !configSettings.autoRollAttack;
  needAttackButton = true || needAttackButton || !getAutoRollAttack();
  needAttackButton = needAttackButton || (getAutoRollAttack() && workflow.rollOptions.fastForwardKey)
  const needDamagebutton = itemHasDamage(this) && (getAutoRollDamage() === "none" || !getRemoveDamageButtons() || showFullCard);
  const needVersatileButton = itemIsVersatile(this) && (showFullCard || getAutoRollDamage() === "none" || !getRemoveDamageButtons());
  const sceneId = token?.scene && token.scene.id || getCanvas().scene?.id;
  const isPlayerOwned = this.actor.hasPlayerOwner;
  const hideItemDetails = (["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !isPlayerOwned))
    || !configSettings.itemTypeList.includes(this.type);
  const hasEffects = workflow.hasDAE && workflow.workflowType === "Workflow" && this.data.effects.find(ae => !ae.transfer);
  let dmgBtnText = (this.data?.data?.actionType === "heal") ? i18n("DND5E.Healing") : i18n("DND5E.Damage");
  if (isAutoFastDamage()) dmgBtnText += ` ${i18n("midi-qol.fastForward")}`;
  let versaBtnText = i18n("DND5E.Versatile");
  if (isAutoFastDamage()) versaBtnText += ` ${i18n("midi-qol.fastForward")}`;
  const templateData = {
    actor: this.actor,
    // tokenId: token?.id,
    tokenId: token?.document?.uuid ?? token?.uuid, 
    tokenUuid: token?.document?.uuid ?? token?.uuid,
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
    user: game.user?.id,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    flavor: this.data.data.chatFlavor || this.name,
    speaker: getSpeaker(this.actor),
    flags: {
      "midi-qol": {
        itemUuid: workflow.item.uuid,
        actorUuid: workflow.actor.uuid,
        sound: theSound,
        type: MESSAGETYPES.ITEM,
        itemId: workflow.itemId,
        workflowId: workflow.item.uuid
      },
      "core": { "canPopout": true }
    }
  };
  
  // Temp items (id undefined) or consumables that were removed need itemdata set.
  if (!this.id || (this.data.type === "consumable" && !this.actor.items.has(this.id))) {
    chatData.flags[`${game.system.id}.itemData`] = this.data;
  }

  // Toggle default roll mode
  let rollMode = game.settings.get("core", "rollMode");
  if (["gmroll", "blindroll"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
  if (rollMode === "blindroll") chatData["blind"] = true;
  if (rollMode === "selfroll") chatData["whisper"] = [game.user?.id];
  return createMessage ? ChatMessage.create(chatData) : chatData;
}

function isTokenInside(templateDetails: {x: number, y: number, shape: any}, token, wallsBlockTargeting) {
  const grid = getCanvas().scene?.data.grid;
  const templatePos = { x: templateDetails.x, y: templateDetails.y };

	// Check for center of  each square the token uses.
	// e.g. for large tokens all 4 squares
	const startX = token.width >= 1 ? 0.5 : token.width / 2;
	const startY = token.height >= 1 ? 0.5 : token.height / 2;
	for (let x = startX; x < token.width; x++) {
		for (let y = startY; y < token.height; y++) {
			const currGrid = {
				x: token.x + x * grid - templatePos.x,
				y: token.y + y * grid - templatePos.y,
			};
			let contains = templateDetails.shape?.contains(currGrid.x, currGrid.y);
			if (contains && wallsBlockTargeting) {
        const r = new Ray({x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y}, templatePos);
        contains = !getCanvas().walls?.checkCollision(r);
      }
      if (contains) return true;
		}
	}
	return false;
}

export function templateTokens(templateDetails: {x: number, y: number, shape: any} | MeasuredTemplate) {
  if (configSettings.autoTarget === "none") return;
  const wallsBlockTargeting = ["wallsBlock", "wallsBlockIgnoreDefeated"].includes(configSettings.autoTarget);
	const tokens = getCanvas().tokens?.placeables || []; //.map(t=>t.data)
  let targets: string[] = [];
  for (const token of tokens) {
    if (token.actor && isTokenInside(templateDetails, token.data, wallsBlockTargeting)) {
      const actorData: any = token.actor?.data;
      if (actorData?.data.details.type?.custom === "NoTarget") continue;
      if (["wallsBlock", "always"].includes(configSettings.autoTarget) || actorData?.data.attributes.hp.value > 0) {
        if (token.document.id) targets.push(token.document.id);
      }
    }
  }
  game.user?.updateTokenTargets(targets);
  game.user?.broadcastActivity({targets});
}

export function selectTargets(templateDocument: MeasuredTemplateDocument, data, user) {
  //@ts-ignore .shapre
  if (user !== game.user?.id) {
    return true;
  }
  let item = this?.item;
  let targeting = configSettings.autoTarget;
  this.templateId = templateDocument?.id;
  this.templateUuid = templateDocument?.uuid;
  if (targeting === "none") { // this is no good
    Hooks.callAll("midi-qol-targeted", this.targets);
    return true;
  }


  //@ts-ignore
  if (templateDocument.object?.shape) templateTokens(templateDocument.object);
  else {
    let {direction, distance, angle, width} = templateDocument.data;
    const dimensions = getCanvas().dimensions || {size: 1, distance: 1};
    distance *= dimensions.size  / dimensions.distance;
    width *= dimensions.size  / dimensions.distance;
    direction = Math.toRadians(direction);
    let shape: any;
    switch ( templateDocument.data.t ) {
      case "circle":
        shape = new PIXI.Circle(0, 0, distance);
        break;
      case "cone":
        //@ts-ignore
        shape = templateDocument._object._getConeShape(direction, angle, distance);
        break;
      case "rect":
        //@ts-ignore
        shape = templateDocument._object._getRectShape(direction, distance);
        break;
      case "ray":
        //@ts-ignore
        shape = templateDocument._object._getRayShape(direction, distance, width);
        templateTokens({x: templateDocument.data.x, y: templateDocument.data.y, shape});

    }
  }

  // if the item specifies a range of "special" don't target the caster.
  let selfTarget = (item?.data.data.range?.units === "spec") ? getCanvas().tokens?.get(this.tokenId) : null;
  if (selfTarget && game.user?.targets.has(selfTarget)) {
    // we are targeted and should not be
    selfTarget.setTarget(false, {user: game.user, releaseOthers: false})
  }
  this.saves = new Set();
  const userTargets = game.user?.targets;
  this.targets = new Set(userTargets);
  this.hitTargets = new Set(userTargets);
  this.templateData = templateDocument.data;
  return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
};

export function advDisadvAttribution(actor) {
  const attributions: any[] = [];
  if (!actor.data.effects) return attributions;
  for (let effect of actor.data.effects) {
    for (let change of effect.data.changes) {
      if (change.key.includes("advantage") && !effect.data.disabled) {
        attributions.push({
          label: effect.data.label,
          key: change.key,
          mode: change.mode,
          value: change.value
        })
      }
    }
  }
  return attributions;
}