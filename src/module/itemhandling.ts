import { warn, debug, error, i18n, log, MESSAGETYPES, i18nFormat, midiFlags, allAttackTypes, gameStats } from "../midi-qol";
import { BetterRollsWorkflow, defaultRollOptions, DummyWorkflow, Workflow, WORKFLOWSTATES } from "./workflow";
import { configSettings, itemDeleteCheck, enableWorkflow, criticalDamage, autoFastForwardAbilityRolls, checkRule } from "./settings";
import { addConcentration, checkRange, getAutoRollAttack, getAutoRollDamage, getRemoveDamageButtons, getSelfTarget, getSelfTargetSet, isAutoFastAttack, isAutoFastDamage, itemHasDamage, itemIsVersatile, untargetAllTokens, validTargetTokens } from "./utils";
import { installedModules } from "./setupModules";
import { setupSheetQol } from "./sheetQOL";

export async function doAttackRoll(wrapped, options = { event: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }, versatile: false, resetAdvantage: false, chatMessage: false }) {
  let workflow: Workflow | undefined = Workflow.getWorkflow(this.id);
  debug("Entering item attack roll ", event, workflow, Workflow._workflows);
  if (!workflow || !enableWorkflow) { // TODO what to do with a random attack roll
    if (enableWorkflow) warn("Roll Attack: No workflow for item ", this.name, this.id, event);
    const roll = await wrapped(options);
    // if (configSettings.keepRollStats) gameStats.addAttackRoll(roll, this);
    return roll;
  }

  if (workflow.workflowType === "Workflow") {
    workflow.targets = (this.data.data.target?.type === "self") ? new Set(await getSelfTargetSet(this.actor)) : validTargetTokens(game.user.targets);
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
    workflow.targets = validTargetTokens(game.user.targets);
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

export async function doDamageRoll(wrapped, { event = null, spellLevel = null, versatile = null } = {}) {
  let workflow = Workflow.getWorkflow(this.id);
  if (!enableWorkflow || !workflow) {
    if (!workflow)
      warn("Roll Damage: No workflow for item ", this.name);
    return await wrapped({ event, versatile })
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
      await Workflow.removeAttackDamageButtons(this.id);
      delete data._id;
      workflow.itemCardId = (await ChatMessage.create(data)).id;
    }
  }
  workflow.processDamageEventOptions(event);
  // Allow overrides form the caller
  if (spellLevel) workflow.rollOptions.spellLevel = spellLevel;
  if (versatile !== null) workflow.rollOptions.versatile = versatile;
  warn("rolling damage  ", this.name, this);

  let result: Roll = await wrapped({
    critical: workflow.rollOptions.critical,
    spellLevel: workflow.rollOptions.spellLevel,
    powerLevel: workflow.rollOptions.spellLevel,
    versatile: workflow.rollOptions.versatile || versatile,
    fastForward: workflow.rollOptions.fastForward,
    // TODO enable this when possible via options "data.default": (workflow.rollOptions.critical || workflow.isCritical) ? "critical" : "normal",
    options: {
      fastForward: workflow.rollOptions.fastForward,
      chatMessage: false //!configSettings.mergeCard
    }
  })
  if (!result) { // user backed out of damage roll or roll failed
    return;
  }

  // If the roll was a critical or the user selected crtical
  //@ts-ignore
  if (result.terms[0].options?.critical)
    result = doCritModify.bind(this)(result);
  else if (workflow.rollOptions.maxDamage)
    //@ts-ignore .evaluate not defined.
    result = (new Roll(result.formula)).evaluate({ maximize: true });
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
      const actionFlavor = game.i18n.localize(this.data.data.actionType === "heal" ? "SW5E.Healing" : "SW5E.DamageRoll");
    }

    const title = `${this.name} - ${actionFlavor}`;
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    let messageData = mergeObject({
      title,
      flavor: this.labels.damageTypes.length ? `${title} (${this.labels.damageTypes})` : title,
      speaker,
    }, { "flags.dnd5e.roll": { type: "damage", itemId: this.id } });
    result.toMessage(messageData, game.settings.get("core", "rollMode"))
    if (otherResult) {
      messageData = mergeObject({
        title,
        flavor: title,
        speaker,
      }, { "flags.dnd5e.roll": { type: "other", itemId: this.id } });
      otherResult.toMessage(messageData, game.settings.get("core", "rollMode"))
    }
  }
  const dice3dActive = game.dice3d && (game.settings.get("dice-so-nice", "settings")?.enabled)
  if (dice3dActive && configSettings.mergeCard) {
    let whisperIds = null;
    const rollMode = game.settings.get("core", "rollMode");
    if ((configSettings.hideRollDetails !== "none" && game.user.isGM) || rollMode === "blindroll") {
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
  let shouldAllowRoll = !configSettings.requireTargets // we don't care about targets
    || (validTargetTokens(game.user.targets).size > 0) // there are some target selected
    || (this.data.data.target?.type === "self") // self target
    || isAoESpell // area effectspell and we will auto target
    || isRangeSpell // rangetarget and will autotarget
    || (!this.hasAttack && !itemHasDamage(this) && !this.hasSave); // does not do anything - need to chck dynamic effects

  if (configSettings.requireTargets && !isRangeSpell && !isAoESpell && this.data.data.target?.type === "creature" && validTargetTokens(game.user.targets).size === 0) shouldAllowRoll = false;
  // only allow weapon attacks against at most the specified number of targets
  let allowedTargets = (this.data.data.target?.type === "creature" ? this.data.data.target?.value : 9099) ?? 9999
  let speaker = ChatMessage.getSpeaker({ actor: this.actor });
  // do pre roll checks
  if (checkRule("checkRange")) {
    if (speaker.token && checkRange(this.actor, this, speaker.token, validTargetTokens(game.user.targets)) === "fail")
      return;
  }
  if (game.system.id === "dnd5e" && configSettings.requireTargets && validTargetTokens(game.user.targets)> allowedTargets) {
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
  const checkConcentration = installedModules.get("combat-utility-belt") && configSettings.concentrationAutomation;
  if (needsConcentration && checkConcentration) {
    const concentrationName = game.settings.get("combat-utility-belt", "concentratorConditionName");
    const concentrationCheck = this.actor.data.effects.find(i => i.label === concentrationName);

    if (concentrationCheck) {
      let d = await Dialog.confirm({
        title: i18n("midi-qol.ActiveConcentrationSpell.Title"),
        content: i18n("midi-qol.ActiveConcentrationSpell.Content"),
        yes: async () => {
          game.cub.removeCondition(concentrationName, [await getSelfTarget(this.actor)], { warn: false });
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

  const targets = (this?.data.data.target?.type === "self") ? await getSelfTargetSet(this.actor) : validTargetTokens(game.user.targets);

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

  if (workflow.showCard) {
    let item = this;
    if (workflow.itemLevel !== this.data.data.level) {
      const upcastData = mergeObject(this.data, {"data.level": workflow.itemLevel}, {inplace: false});
      item = this.constructor.createOwned(upcastData, this.actor);  // Replace the item with an upcast version
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
    user: game.user,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    speaker: {
      actor: this.actor._id,
      token: this.actor.token,
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
  const sceneId = token?.scene && token.scene._id || canvas.scene?._id;
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
    tokenId: token ? `${sceneId}.${token.id}` : null,
    item: this.data,
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
    user: game.user,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    flavor: this.data.data.chatFlavor || this.name,
    speaker: {
      actor: this.actor,
      token: this.actor.token,
      alias: (configSettings.useTokenNames && token) ? token.data.name : this.actor.name,
      scene: canvas?.scene?.id
    },
    flags: {
      "midi-qol": {
        item: workflow.item.id,
        actor: workflow.actor.id,
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

export function getTargetedTokens(scene, data, selfTarget) {
  let targeting = configSettings.autoTarget;
  // release current targets
  game.user.targets.forEach(t => {
    //@ts-ignore
    t.setTarget(false, { releaseOthers: false });
  });
  game.user.targets.clear();

  let wallsBlockTargeting = targeting === "wallsBlock";
  let templateDetails = canvas.templates.get(data._id);
  let tdx = data.x;
  let tdy = data.y;
  // Extract and prepare data
  let { direction, distance, angle, width } = data;
  distance *= canvas.scene.data.grid / canvas.scene.data.gridDistance;
  width *= canvas.scene.data.grid / canvas.scene.data.gridDistance;
  direction = toRadians(direction);

  var shape
  // Get the Template shape
  switch (data.t) {
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
  return canvas.tokens.placeables.filter(t => {
    if (!t.actor) return false;
    if (selfTarget === t.id) return false;
    t = canvas.tokens.get(t.id);
    // skip special tokens with a race of trigger
    if (t.actor.data?.data.details.race === "trigger") return false;
    const w = t.width >= 1 ? 0.5 : t.data.width / 2;
    const h = t.height >= 1 ? 0.5 : t.data.height / 2;
    const gridSize = canvas.scene.data.grid;
    let contained = false;
    for (let xstep = w; xstep <= t.data.width && !contained; xstep++) {
      for (let ystep = h; ystep <= t.data.height && !contained; ystep++) {
        const tx = t.x + xstep * gridSize;
        const ty = t.y + ystep * gridSize;

        if (shape.contains(tx - tdx, ty - tdy)) {
          if (!wallsBlockTargeting) {
            contained = true;
          } else {
            if (data.t === "rect") {
              // for rectangles the origin is top left, so measure from the centre instaed.
              let template_x = templateDetails.x + shape.width / 2;
              let template_y = templateDetails.y + shape.height / 2;
              const r = new Ray({ x: tx, y: ty }, { x: template_x, y: template_y });
              contained = !canvas.walls.checkCollision(r);
            } else {
              const r = new Ray({ x: tx, y: ty }, templateDetails.data);
              contained = !canvas.walls.checkCollision(r);
            }
          }
        }
      }
    }
    if (contained) t.setTarget(true, { user: game.user, releaseOthers: false });
    return contained;
  });
}

export function selectTargets(scene, data, options) {
  let item = this.item;
  let targeting = configSettings.autoTarget;
  if (data.user !== game.user._id) {
    return true;
  }
  if (targeting === "none") { // this is no good
    Hooks.callAll("midi-qol-targeted", validTargetTokens(game.user.targets));
    return true;
  }
  if (!data) return true;
  this.templateId = data._id;

  // if the item specifies a range of "self" don't target the caster.

  let selfTarget = (item?.data.data.range?.units === "spec") ? this.tokenId : null;
  setTimeout(() => {
    getTargetedTokens(scene, data, selfTarget)
    // Assumes area affect do not have a to hit roll
    this.saves = new Set();
    this.targets = validTargetTokens(game.user.targets);
    this.hitTargets = validTargetTokens(game.user.targets);
    this.templateData = data;
    return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
  }, 250);
};

export function doCritModify(result: Roll, criticalModify = criticalDamage) {
  if (criticalModify === "default") return result;
  let rollBase = new Roll(result.formula);
  const bonusDice = this.actor.data.flags.dnd5e?.meleeCriticalDamageDice ?? 0;
  if (criticalModify === "maxDamage") {// max base damage
    //@ts-ignore .terms not defined
    if (rollBase.terms[0].number) rollBase.terms[0].number = rollBase.terms[0].number - bonusDice;
    //@ts-ignore .terms not defined
    rollBase.terms = rollBase.terms.map(t => {
      if (t?.number) t.number = Math.floor(t.number / 2);
      return t;
    });
    rollBase = new Roll(rollBase.formula);
    //@ts-ignore .evaluate not defined
    rollBase.evaluate({ maximize: true });
    return rollBase;
  } else if (criticalModify === "maxCrit") { // see about maximising one dice out of the two
    let rollCrit = new Roll(result.formula);
    //@ts-ignore .terms not defined
    if (rollCrit.terms[0].number) rollCrit.terms[0].number = rollCrit.terms[0].number - bonusDice;
    //@ts-ignore .terms not defined
    if (rollBase.terms[0].number) rollBase.terms[0].number = rollBase.terms[0].number - bonusDice;
    //@ts-ignore .terms not defined
    rollCrit.terms = rollCrit.terms.map(t => {
      if (t?.number) t.number = Math.ceil(t.number / 2);
      if (typeof t === "number") t = 0;
      return t;
    });
    //@ts-ignore .terms not defined
    if (rollCrit.terms[0].number) rollCrit.terms[0].number = rollCrit.terms[0].number + bonusDice;
    //@ts-ignore .terms not defined
    rollBase.terms = rollBase.terms.map(t => {
      if (t?.number) t.number = Math.floor(t.number / 2);
      return t;
    });
    //@ts-ignore .evaluate not defined
    rollCrit.evaluate({ maximize: true });
    //@ts-ignore.terms not defined
    rollBase.terms.push("+")
    //@ts-ignore .terms not defined
    rollBase.terms.push(rollCrit.total)
    rollBase._formula = rollBase.formula;
    rollBase.roll();
    return rollBase;
  } else if (criticalModify === "maxAll") {
    result = new Roll(result.formula);
    //@ts-ignore .evaluate not defined
    result.evaluate({ maximize: true });
    return result;
  } else if (criticalModify === "doubleDice") {
    //@ts-ignore
    if (rollBase.terms[0].number) rollBase.terms[0].number = rollBase.terms[0].number - bonusDice;
    //@ts-ignore .evaluate not defined
    rollBase.terms = rollBase.terms.map(t => {
        if (t?.number)
            t.number = Math.floor(t.number / 2);
        return t;
    });
    let splitedFormula = rollBase.formula.split(' ');
    splitedFormula[0] = '(' + splitedFormula[0] + ' * 2)';
    let formula = splitedFormula.join(' ');
    rollBase = new Roll(formula);
    rollBase.roll();
    return rollBase;
  }
}
