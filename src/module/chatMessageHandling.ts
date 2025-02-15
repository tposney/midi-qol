import { debug, warn, i18n, error, debugEnabled, i18nFormat, MODULE_ID } from "../midi-qol.js";
import { DDBGameLogWorkflow, Workflow } from "./Workflow.js";
import { nsaFlag, coloredBorders, configSettings, forceHideRoll, safeGetGameSetting } from "./settings.js";
import { playerFor, playerForActor, doOverTimeEffect, isInCombat, MQfromUuidSync, isAutoFastAttack } from "./utils.js";
import { socketlibSocket, unTimedExecuteAsGM } from "./GMAction.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
export const MAESTRO_MODULE_NAME = "maestro";
export const MODULE_LABEL = "Maestro";

export let colorChatMessageHandler = (message, html, data) => {
  if (coloredBorders === "none") return true;
  let actorId = message.speaker.actor;
  let userId = message.author;
  let actor = game.actors?.get(actorId);
  let user = game.users?.get(userId) as User.Implementation | undefined;

  if (actor) user = playerForActor(actor);
  if (!user) return true;
  html[0].style.borderColor = user.color;
  const sender = html.find('.message-sender')[0];
  if (!sender) return;
  if (coloredBorders === "borderNamesBackground") {
    sender.style["text-shadow"] = `1px 1px 1px #FFFFFF`;
    sender.style.backgroundColor = user.color;
  } else if (coloredBorders === "borderNamesText") {
    sender.style.color = user.color;
    sender.style["text-shadow"] = `1px 1px 1px ${sender.style.color}`;
  }
  return true;
}

// TODO think about monks tb on preUpdateChatMessage?
// Also should ideally be async.
export function checkOverTimeSaves(message, data, options, user) {
  if (!message.rolls?.length || !["skill", "save", "ability"].includes(data.flags?.dnd5e?.roll?.type)) return true;
  let actor: Actor | undefined | null = game.actors?.get(message.speaker.actor);
  if (message.speaker.token) {
    actor = game.scenes?.get(message.speaker.scene)?.tokens?.get(message.speaker.token)?.actor;
  }
  if (!actor) return true;
  const overtimeActorUuid = foundry.utils.getProperty(message, "flags.midi-qol.overtimeActorUuid");
  if (actor.uuid !== overtimeActorUuid) {
    if (overtimeActorUuid) {
      const overTimeActor = MQfromUuidSync(overtimeActorUuid);
      ui.notifications?.warn(`Over time actor mismatch ${actor.name} should be ${overTimeActor.name}`);
    }
    return true;
  }
  // Check that it is the actor's turn
  let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id)
  const isTurn = activeCombatants?.includes(ChatMessage.getSpeaker({ actor })?.token);
  const inCombat = isInCombat(actor);
  if (!isTurn && inCombat) {
    return true;
  }

  try {
    let func = async (actor: Actor, rollFlags: any, roll: Roll) => {
      for (let effect of actor.effects.filter(ef => ef.changes.some(change => change.key === "flags.midi-qol.OverTime"))) {
        await doOverTimeEffect(actor, effect, true, { saveToUse: roll, rollFlags: data.flags?.dnd5e?.roll, isActionSave: true })
      }
    };
    func(actor, data.flags.dnd5e.roll, message.rolls[message.rolls.length - 1]);
  } catch (err) {
    const message = `checkOverTimeSaves error for ${actor?.name} ${actor.uuid}`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  } finally {
    return true;
  }
}

export let nsaMessageHandler = (message, data, ...args) => {
  if (!nsaFlag || !message.whisper || message.whisper.length === 0) return true;
  let gmIds = ChatMessage.getWhisperRecipients("GM").filter(u => (u as unknown as User).active)?.map(u => u.id);
  let currentIds = message.whisper.map(u => typeof (u) === "string" ? u : u.id);
  gmIds = gmIds.filter(id => !currentIds.includes(id));
  if (debugEnabled > 1) debug("nsa handler active GMs ", gmIds, " current ids ", currentIds, "extra gmIds ", gmIds)
  if (gmIds.length > 0) message.updateSource({ "whisper": currentIds.concat(gmIds) });
  return true;
}

let _highlighted: Token | null = null;

let _onTargetHover = (event) => {
  event.preventDefault();
  if (!(canvas?.scene as unknown as Scene)?.active) return;
  const token: Token | undefined = canvas?.tokens?.get(event.currentTarget.dataset.id) as Token;
  if (token?.isVisible) {
    //@ts-expect-error _controlled, _onHoverIn
    if (!token?._controlled) token._onHoverIn(event);
    _highlighted = token;
  }
}

/* -------------------------------------------- */

/**
 * Handle mouse-unhover events for a combatant in the chat card
 * @private
 */
let _onTargetHoverOut = (event) => {
  event.preventDefault();
  if (!(canvas?.scene as unknown as Scene)?.active) return;
  //@ts-expect-error onHoverOut
  if (_highlighted) _highlighted._onHoverOut(event);
  _highlighted = null;
}

let _onTargetSelect = (event) => {
  event.stopPropagation();
  event.preventDefault();
  if (!(canvas?.scene as unknown as Scene)?.active) return;
  const token: Token = canvas?.tokens?.get(event.currentTarget.dataset.id) as Token;
  if (token?.controlled) token?.release();
  else if (token && token?.isVisible && game.user && (token.actor as Actor)?.testUserPermission(game.user, "OWNER")) {
    token?.control({ releaseOthers: false });
    canvas?.animatePan(token.center)
  }

};

function _onTargetShow(event) {
  event.stopImmediatePropagation();
  event.preventDefault();
  if (!(canvas?.scene as unknown as Scene)?.active) return;
  const token = canvas?.tokens?.get(event.currentTarget.dataset.id) as Token;
  if (game.user && (token?.actor as Actor)?.testUserPermission(game.user, "OWNER")) {
    (token.actor as Actor).sheet?.render(true);
  }
}

export let hideRollRender = (msg, html, data) => {
  if (forceHideRoll && (msg.whisper.length > 0 || msg?.blind)) {
    if (!game.user?.isGM && !msg.isAuthor && msg.whisper.indexOf(game.user?.id) === -1) {
      if (debugEnabled > 0) warn("hideRollRender | hiding message", msg.whisper);
      html.hide();
      // It seems that html.remove() can get called before the messagge is rendered to the dom?
      setTimeout(() => { html.remove() }, 10);
    }
  }
  return true;
};


export let hideRollUpdate = (message, data, diff, id) => {
  if (forceHideRoll && message.whisper.length > 0 || message.blind) {
    if (!game.user?.isGM && ((!message.isAuthor && (message.whisper.indexOf(game.user?.id) === -1) || message.blind))) {
      let messageLi = $(`.message[data-message-id=${data._id}]`);
      if (debugEnabled > 0) warn("hideRollUpdate: Hiding ", message.whisper, messageLi)
      messageLi.hide();
      //@ts-expect-error
      if (window.ui.sidebar.popouts.chat) {
        //@ts-expect-error
        let popoutLi = window.ui.sidebar.popouts.chat.element.find(`.message[data-message-id=${data._id}]`)
        popoutLi.hide();
      }
    }
  }
  return true;
};

export let hideStuffHandler = (message, html, data) => {
  if (debugEnabled > 1) debug("hideStuffHandler message: ", message.id, message)
  // if (foundry.utils.getProperty(message, "flags.monks-tokenbar")) return;
  const midiqolFlags = foundry.utils.getProperty(message, "flags.midi-qol");
  // Hide rolls which are blind and not the GM if force hide is true
  if (forceHideRoll && message.blind && !game.user?.isGM) {
    html.hide();
    return;
  }
  const authorId = message.author?.id;
  // message.shouldDisplayChallenge returns true for message owners, which is not quite what we want.
  let shouldDisplayChallenge = true;
  if (game.user?.isGM) shouldDisplayChallenge = true;
  else switch (safeGetGameSetting("dnd5e", "challengeVisibility")) {
    case "all": shouldDisplayChallenge = true; break;
    case "player": shouldDisplayChallenge = !message.author?.isGM; break;
    default: shouldDisplayChallenge = false; break;
  }
  // If force hide rolls and your are not the author/target of a whisper roll hide it.
  if (forceHideRoll
    && !game.user?.isGM
    && message.whisper.length > 0 && !message.whisper.includes(game.user?.id)
    && !message.isAuthor) {
    html.remove();
    return;
  }

  if (game.user?.id !== authorId) {
    html.find(".midi-qol-attack-buttons").hide();
    html.find(".midi-qol-damage-buttons").hide();
    html.find(".midi-qol-otherDamage-button").hide();
    html.find(".midi-qol-versatile-damage-button").hide();
  }

  let ids = html.find(".midi-qol-target-select")
  ids.hover(_onTargetHover, _onTargetHoverOut)
  ids.click(_onTargetSelect);
  ids.contextmenu(_onTargetShow)
  if (game.user?.isGM) {
    html.find(".midi-qol-playerTokenName").remove();
    if (configSettings.hidePlayerDamageCard && $(html).find(".midi-qol-player-damage-card").length) html.hide();

    if ($(html).find(".midi-qol-hits-display").length) {
      $(html).find(".midi-qol-hits-display").show();
    }
    html.find(".midi-qol-target-npc-Player").hide();
    if (!configSettings.highlightSuccess) {
      html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("success");
      html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("failure");
      html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("critical");
      html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("fumble");
    }
    if (!configSettings.highlightSuccess || !shouldDisplayChallenge) {
      html.find(".midi-qol-saves-display .midi-qol-save-class").removeClass("success");
      html.find(".midi-qol-saves-display .midi-qol-save-class").removeClass("failure");
      html.find(".midi-qol-saves-display .midi-qol-save-class").removeClass("critical");
      html.find(".midi-qol-saves-display .midi-qol-save-class").removeClass("fumble");
    }

    // @ts-expect-error protected - but this isn't doing anything, is it?
    ui.chat.scrollBottom
    return;

  } else {
    if (message.blind) {
      html.find(".midi-attack-roll .dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      // html.find(".midi-damage-roll .dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      if (!(message.flags && message.flags["monks-tokenbar"])) // not a monks roll
        html.find(".dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      // html.find(".dice-result").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`); Monks saving throw css
      //TODO this should probably just check formula
    }
    if (configSettings.autoCheckHit === "whisper" || message.blind || safeGetGameSetting("dnd5e", "attackRollVisibility") === "none") {
      html.find(".midi-qol-hits-display").hide();
    }
    if ((configSettings.autoCheckSaves === "whisper" || message.blind)) {
      html.find(".midi-qol-saves-display").hide();
    }

    // hide tool tips from non-gm
    if (configSettings.autoCheckSaves !== "allShow") html.find(".midi-qol-save-tooltip").hide();
    // Hide the save dc if required
    if (!configSettings.displaySaveDC || !shouldDisplayChallenge) {
      html.find(".midi-qol-saveDC").remove();
    }
    if (!["allShow", "all"].includes(configSettings.autoCheckSaves)) {
      html.find(".midi-qol-npc-save-total").remove();
    }
    if (!shouldDisplayChallenge || !configSettings.highlightSuccess)
      html.find(".midi-qol-saves-display .midi-qol-save-symbol").remove();
    if (!configSettings.highlightSuccess || !shouldDisplayChallenge) {
      html.find(".midi-qol-saves-display .midi-qol-save-class").removeClass("success");
      html.find(".midi-qol-saves-display .midi-qol-save-class").removeClass("failure");
      html.find(".midi-qol-saves-display .midi-qol-save-class").removeClass("critical");
      html.find(".midi-qol-saves-display .midi-qol-save-class").removeClass("fumble");
    }
    if (safeGetGameSetting("dnd5e", "attackRollVisibility")) {
      const visibility = safeGetGameSetting("dnd5e", "attackRollVisibility");
      if (visibility === "none") {
        html.find(".midi-qol-attack-roll .dice-total").removeClass("success");
        html.find(".midi-qol-attack-roll .dice-total").removeClass("failure");
        html.find(".midi-qol-attack-roll .dice-total").removeClass("fumble");
        html.find(".midi-qol-attack-roll .dice-total").removeClass("critical");
        html.find(".midi-qol-attack-roll .dice-total .icons").remove();

        html.find(".midi-qol-hits-display .midi-qol-hit-symbol").remove();
        html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("success");
        html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("failure");
        html.find(".midi-qol-hit-symbol").remove();
        html.find(".midi-qol-npc-ac").remove();
      } else if (visibility === "hideAC" || !configSettings.displayHitResultNumeric) {
        html.find(".midi-qol-npc-ac").remove();
        if (!configSettings.highlightSuccess) {
          html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("success");
          html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("failure");
          html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("critical");
          html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("fumble");
        }
      }
    } else {
      if (!shouldDisplayChallenge) {
        html.find(".midi-qol-hits-display .midi-qol-hit-symbol").remove();
        html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("success");
        html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("failure");
      }
      if (!configSettings.displayHitResultNumeric || !shouldDisplayChallenge) {
        html.find(".midi-qol-npc-ac").remove();
      }
      if (!configSettings.highlightSuccess) {
        html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("success");
        html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("failure");
        html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("critical");
        html.find(".midi-qol-hits-display .midi-qol-hit-class").removeClass("fumble");
      }
    }
    if (authorId !== game.user?.id || configSettings.confirmAttackDamage === "gmOnly") {
      html.find(".midi-qol-confirm-damage-roll-complete-hit").hide();
      html.find(".midi-qol-confirm-damage-roll-complete-miss").hide();
      html.find(".midi-qol-confirm-damage-roll-complete-critical").hide();
    }

    if (!game.user?.isGM) {
      // Can update the attack roll here, but damage rolls are redone in the ChatmessageMidi code so do the hiding for those there
      html.find(".midi-qol-confirm-damage-roll-cancel").hide();
      // hide the gm version of the name from` players
      html.find(".midi-qol-gmTokenName").remove();
    }
  }
  // @ts-expect-error protected
  setTimeout(() => ui.chat?.scrollBottom(), 0);
  return true;

}

export function processItemCardCreation(message, user) {
  const midiFlags = message.flags[MODULE_ID];
  if (user === game.user?.id && midiFlags?.workflowId) { // check to see if it is a workflow
    const workflow = Workflow.getWorkflow(midiFlags.workflowId);
    if (!workflow) return;
    if (debugEnabled > 0) warn("processItemCardCreation", message.id, workflow.itemCardId, workflow.ItemCardUuid, workflow.workflowName)
    workflow.itemCardId = message.id;
    workflow.itemCardUuid = message.uuid;
    workflow.needItemCard = false;
    const shouldUnsuspend = ([workflow.WorkflowState_AwaitItemCard, workflow.WorkflowState_AwaitTemplate, workflow.WorkflowState_NoAction].includes(workflow.currentAction) && workflow.suspended && !workflow.needTemplate && !workflow.needItemCard && workflow.preItemUseComplete); if (debugEnabled > 0) warn(`chat card created: unsuspending ${workflow.workflowName} ${workflow.nameForState(workflow.currentAction)} unsuspending: ${shouldUnsuspend}, workflow suspended: ${workflow.suspended} needs template: ${workflow.needTemplate}, needs Item card ${workflow.needItemCard}, itemUseomplete: ${workflow.preItemUseComplete}`);
    if (shouldUnsuspend) {
      workflow.unSuspend({ itemCardId: message.id, itemCarduuid: message.uuid, itemUseComplete: true });
    }
  }
}

export function ddbglPendingFired(data:{sceneId: string, tokenId: string, actorId: string, itemId: string, actionType: string}) {
  let { sceneId, tokenId, actorId, itemId, actionType } = data;
  if (!itemId || !["attack", "damage", "heal"].includes(actionType)) {
    error("DDB Game Log - no item/action for pending roll"); return
  }
  // const tokenUuid = `Scene.${sceneId??0}.Token.${tokenId??0}`;
  const token: Token | undefined = MQfromUuidSync(`Scene.${sceneId ?? 0}.Token.${tokenId ?? 0}`);
  const actor: Actor | undefined = (token instanceof CONFIG.Token.documentClass) ? token?.actor ?? game.actors?.get(actorId ?? "") : undefined;
  if (!actor || !(token instanceof CONFIG.Token.documentClass)) {
    warn(" ddb-game-log hook could not find actor");
    return;
  }
  // find the player who controls the character.
  let player;
  if (token) {
    player = playerFor(token);
  } else {
    player = game.users?.players.find(p => p.active && actor?.testUserPermission(p, "OWNER"));
  }
  if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => (u as unknown as User).active);
  if (player?.id !== game.user?.id) return;

  let item = actor.items.get(itemId);
  if (!item) {
    warn(` ddb-game-log - hook could not find item ${itemId} on actor ${actor.name}`);
    return;
  }

  let workflow: Workflow | undefined = DDBGameLogWorkflow.get(item.uuid);
  if (actionType === "attack") {
    if (DDBGameLogWorkflow.get(item.uuid)) Workflow.removeWorkflow(item.uuid);
    workflow = undefined;
  }

  // @ts-expect-error no dnd5e-types
  if (["damage", "heal"].includes(actionType) && item.hasAttack && !workflow) {
    warn(` ddb-game-log damage roll without workflow being started ${actor.name} using ${item.name}`);
    return;
  }

  if (!workflow) {
    const speaker = {
      scene: sceneId,
      token: tokenId,
      actor: actorId,
      alias: token?.name ?? actor.name
    }
    workflow = new DDBGameLogWorkflow(actor, item, speaker, Array.from(game.user?.targets ?? new Set()), {});
    // @ts-expect-error no dnd5e-types
    item.displayCard({ showFullCard: false, workflow, createMessage: false, defaultCard: true });
    // showItemCard.bind(item)(false, workflow, false, true);
    return;
  }
}
export function ddbglPendingHook(data) { // need to propagate this to all players.
  if (!configSettings.optionalRules.enableddbGL) return;
  socketlibSocket.executeForEveryone("ddbglPendingFired", data);
}

export function processCreateDDBGLMessages(message: ChatMessage, options: any, user: string) {
  if (!configSettings.optionalRules.enableddbGL) return;

  const flags: any = message.flags;
  if (!flags || !flags["ddb-game-log"] || !game.user) return;
  const ddbGLFlags: any = flags["ddb-game-log"];
  if (!ddbGLFlags || ddbGLFlags.pending) return;
  // let sceneId, tokenId, actorId, itemId;
  if (!(["attack", "damage", "heal"].includes(flags.dnd5e?.roll?.type))) return;
  const itemId = flags.dnd5e?.roll?.itemId;
  if (!itemId) { error("Could not find item for fulfilled roll"); return }
  const token = MQfromUuidSync(`Scene.${message.speaker.scene}.Token.${message.speaker.token}`);
  const actor = token.actor ?? game.actors?.get(message.speaker.actor ?? "");
  if (!actor) {
    error("ddb-game-log could not find actor for roll");
    return;
  }
  // find the player who controls the charcter.
  let player;
  if (token) {
    player = playerFor(token);
  } else {
    player = game.users?.players.find(p => p.active && actor?.testUserPermission(p, "OWNER"));
  }
  if (!player || !player.active) player = game.users?.activeGM;
  if (player?.id !== game.user?.id) return;

  const item = actor.items.get(itemId);
  if (!item) {
    error(`ddb-game-log roll could not find item ${flags.dnd5e.roll.itemId} on actor ${actor.name}`);
    return;
  }

  let workflow: Workflow | undefined = DDBGameLogWorkflow.get(item.uuid);
  if (!workflow && flags.dnd5e.roll.type === "damage" && item.hasAttack && ["rwak", "mwak"].includes(item.actionType)) {
    warn(`ddb-game-log roll damage roll wihtout workflow being started ${actor.name} using ${item.name}`);
    return;
  }
  if (!workflow) {
    error(`ddb-game-log roll no workflow for ${item.name}`)
    return;
  }
  if (configSettings.undoWorkflow && workflow.undoData && message) {
    if (!workflow.undoData.chatCardUuids) workflow.undoData.chatCardUuids = [];
    workflow.undoData.chatCardUuids = workflow.undoData.chatCardUuids.concat([message.uuid]);
    unTimedExecuteAsGM("updateUndoChatCardUuids", workflow.undoData);
  }
  if (flags.dnd5e.roll.type === "attack") {
    let rolls = message.rolls;
    if (!(rolls instanceof Array)) rolls = [rolls];
    workflow.needItemCard = false;
    workflow.attackRoll = rolls[0] ?? undefined;
    workflow.attackTotal = rolls[0]?.total ?? 0;
    workflow.needsDamage = workflow.item.hasDamage;
    workflow.attackRollHTML = message.content;
    workflow.attackRolled = true;
    if (workflow.currentAction === workflow.WorkflowState_WaitForAttackRoll) {
      if (workflow.suspended) workflow.unSuspend({ attackRoll: workflow.attackRoll })
      // TODO NW workflow.performState(workflow.WorkflowState_WaitForAttackRoll,{attackRoll: workflow.attackRoll});
    }
  }

  if (["damage", "heal"].includes(flags.dnd5e.roll.type)) {
    let rolls = message.rolls;
    if (!rolls) return;
    workflow.needItemCard = false;
    workflow.attackRolled = true;
    if (!(rolls instanceof Array)) rolls = [rolls];
    if (workflow.needsDamage && rolls?.length) {
      workflow.needsDamage = false;
      workflow.setDamageRolls(rolls);
    } else if (workflow.needsOtherDamage && rolls?.length) {
      workflow.setOtherDamageRolls(rolls);
      workflow.needsOtherDamage = false;
    }
    if (workflow.currentAction === workflow.WorkflowState_WaitForDamageRoll) {
      if (workflow.suspended) workflow.unSuspend({ damageRoll: workflow.damageRoll })
      // TODO NW workflow.performState(workflow.WorkflowState_WaitForDamageRoll);
    }
  }
}

function legacyApplyTokenDamageMany(arg0: any[], arg1: Set<Token>, arg2: null, arg3: { existingDamage: never[]; workflow: undefined; updateContext: undefined; }) {
  throw new Error("Function not implemented.");
}

