import { debug, warn, i18n, error, debugEnabled, i18nFormat, MODULE_ID, MESSAGE_TYPES } from "../midi-qol.js";
import { DDBGameLogWorkflow, Workflow, WorkflowDataFlags } from "./Workflow.js";
import { nsaFlag, coloredBorders, configSettings, forceHideRoll, safeGetGameSetting, SaveToChatCard } from "./settings.js";
import { playerFor, playerForActor, doOverTimeEffect, isInCombat, isAutoFastAttack } from "./utils.js";
import { preferredActiveGM, socketlibSocket, unTimedExecuteAsGM } from "./GMAction.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { MidiSaveActivity } from "./activities/SaveActivity.js";
export const MAESTRO_MODULE_NAME = "maestro";
export const MODULE_LABEL = "Maestro";
import Token = foundry.canvas.placeables.Token;

export let colorChatMessageHandler = (message: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData) => {
  if (coloredBorders === "none") return true;
  let actorId = message.speaker.actor ?? "";
  let userId = message.author?.id ?? "";
  let actor = message.speakerActor;
  let user = game.users?.get(userId) as User.Implementation | undefined;

  if (actor) user = playerForActor(actor);
  if (!user) return true;
  html.style.borderColor = user.color.toString();
  const sender = html.querySelector<HTMLElement>('.message-sender');
  if (!sender) return;
  if (coloredBorders === "borderNamesBackground") {
    sender.style["text-shadow"] = `1px 1px 1px #FFFFFF`;
    sender.style.backgroundColor = user.color.toString();
  } else if (coloredBorders === "borderNamesText") {
    sender.style.color = user.color.toString();
    sender.style["text-shadow"] = `1px 1px 1px ${sender.style.color}`;
  }
  return true;
}

// TODO think about monks tb on preUpdateChatMessage?
// Also should ideally be async.
export function checkOverTimeSaves(message: ChatMessage.Implementation, data: ChatMessage.CreateData, options: ChatMessage.Database.CreateOptions, user: string) {
  if (!message.rolls?.length || !["skill", "save", "ability"].includes(data.flags?.dnd5e?.roll?.type ?? "")) return true;
  let actor = message.speakerActor;
  if (message.speaker.token) {
    actor = game.scenes?.get(message.speaker?.scene ?? "")?.tokens?.get(message.speaker.token)?.actor ?? actor;
  }
  if (!actor) return true;
  const overtimeActorUuid = message.flags?.[MODULE_ID]?.overtimeActorUuid;
  if (actor.uuid !== overtimeActorUuid) {
    if (overtimeActorUuid) {
      const overTimeActor = fromUuidSync(overtimeActorUuid) as Actor.Implementation | undefined;
      ui.notifications?.warn(`Over time actor mismatch ${actor.name} should be ${overTimeActor?.name}`);
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
    func(actor, data.flags?.dnd5e?.roll, message.rolls[message.rolls.length - 1]);
  } catch (err) {
    const message = `checkOverTimeSaves error for ${actor?.name} ${actor.uuid}`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  } finally {
    return true;
  }
}

export let nsaMessageHandler = (message: ChatMessage.Implementation, data: ChatMessage.CreateData, options: ChatMessage.Database.PreCreateOptions, user: string) => {
  if (!nsaFlag || !message.whisper || message.whisper.length === 0) return true;
  let gmIds = ChatMessage.getWhisperRecipients("GM").filter(u => u.active).map(u => u.id);
  let currentIds = message.whisper as string[];
  gmIds = gmIds.filter(id => !currentIds.includes(id));
  if (debugEnabled > 1) debug("nsa handler active GMs ", gmIds, " current ids ", currentIds, "extra gmIds ", gmIds)
  if (gmIds.length > 0) message.updateSource({ "whisper": currentIds.concat(gmIds) });
  return true;
}

let _highlighted: Token.Implementation | null = null;

let _onTargetHover = (event) => {
  event.preventDefault();
  if (!canvas.scene?.active) return;
  const token = canvas.tokens?.get(event.currentTarget?.dataset?.id ?? "");
  if (token?.isVisible) {
    //@ts-expect-error _onHoverIn
    if (!token.controlled) token._onHoverIn(event);
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
  if (!canvas.scene?.active) return;
  //@ts-expect-error onHoverOut
  if (_highlighted) _highlighted._onHoverOut(event);
  _highlighted = null;
}

let _onTargetSelect = (event) => {
  event.stopPropagation();
  event.preventDefault();
  if (!canvas.scene?.active) return;
  const token = canvas.tokens?.get(event.currentTarget.dataset.id);
  if (token?.controlled) token?.release();
  else if (token && token?.isVisible && game.user && token.actor?.testUserPermission(game.user, "OWNER")) {
    token.control({ releaseOthers: false });
    canvas.animatePan(token.center)
  }

};

function _onTargetShow(event) {
  event.stopImmediatePropagation();
  event.preventDefault();
  if (!canvas.scene?.active) return;
  const token = canvas.tokens?.get(event.currentTarget.dataset.id);
  if (game.user && token?.actor?.testUserPermission(game.user, "OWNER")) {
    token.actor.sheet?.render(true);
  }
}

export let hideRollRender = (msg: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData) => {
  if (forceHideRoll && (msg.whisper.length > 0 || msg?.blind)) {
    if (!game.user?.isGM && !msg.isAuthor && msg.whisper.indexOf(game.user?.id ?? "") === -1) {
      if (debugEnabled > 0) warn("hideRollRender | hiding message", msg.whisper);
      html.style.display = "none";
      // It seems that html.remove() can get called before the message is rendered to the dom?
      setTimeout(() => { html.remove() }, 10);
    }
  }
  return true;
};


export let hideRollUpdate = (message: ChatMessage.Implementation, data: ChatMessage.UpdateData, options: ChatMessage.Database.UpdateOptions, id: string) => {
  if (forceHideRoll && (message.whisper.length > 0 || message.blind)) {
    if (!game.user?.isGM && ((!message.isAuthor && (message.whisper.indexOf(game.user?.id ?? "") === -1) || message.blind))) {
      let messageLi = document.querySelector<HTMLLIElement>(`.message[data-message-id=${data._id}]`);
      if (debugEnabled > 0) warn("hideRollUpdate: Hiding ", message.whisper, messageLi)
      if (messageLi) messageLi.style.display = "none";
      if (ui.sidebar?.popouts.chat) {
        let popoutLi = ui.sidebar.popouts.chat.element.querySelector<HTMLLIElement>(`.message[data-message-id=${data._id}]`)
        if (popoutLi) popoutLi.style.display = "none";
      }
    }
  }
  return true;
};

export let hideStuffHandler = (message: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData) => {
  const messageActor = (fromUuidSync(message.flags?.[MODULE_ID]?.[WorkflowDataFlags.actor]) as Actor.Implementation ?? message.speakerActor);
  const messageActorOwner = messageActor?.isOwner;
  if (debugEnabled > 1) debug("hideStuffHandler message: ", message.id, message)
  // Hide rolls which are blind and not the GM if force hide is true
  if (forceHideRoll && message.blind && !game.user?.isGM) {
    html.style.display = "none";
    return;
  }
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
    && message.whisper.length > 0 && !message.whisper.includes(game.user?.id ?? "")
    && !message.isAuthor) {
    html.style.display = "none";
    return;
  }
  if (foundry.utils.getProperty(message, "flags.midi-qol.type") === MESSAGE_TYPES.SAVES) {
    html.querySelectorAll<HTMLButtonElement>(`[data-action="rollSave"]`).forEach((el) => { el.disabled = false });
    html.querySelectorAll<HTMLButtonElement>(`[data-action="rollCheck"]`).forEach((el) => { el.disabled = false });
  }

  if (!message.isAuthor && !(messageActorOwner && SaveToChatCard)) {
    html.querySelectorAll<HTMLDivElement>(".midi-qol-attack-buttons").forEach((el) => { el.style.display = "none" });
    html.querySelectorAll<HTMLDivElement>(".midi-qol-damage-buttons").forEach((el) => { el.style.display = "none" });
    html.querySelectorAll<HTMLButtonElement>(".midi-qol-otherDamage-button").forEach((el) => { el.style.display = "none" });
  }

  let ids = html.querySelectorAll<HTMLLIElement>(".midi-qol-target-select")
  ids.forEach((el) => {
    el.addEventListener("mouseenter", _onTargetHover);
    el.addEventListener("mouseleave", _onTargetHoverOut);
    el.addEventListener("click", _onTargetSelect);
    el.addEventListener("contextmenu", _onTargetShow);
  })
  if (game.user?.isGM) {
    html.querySelectorAll(".midi-qol-playerTokenName").forEach(el => el.remove());
    if (configSettings.hidePlayerDamageCard && $(html).find(".midi-qol-player-damage-card").length) html.style.display = "none";

    html.querySelectorAll<HTMLDivElement>(".midi-qol-hits-display").forEach((el) => el.style.display = "");
    html.querySelectorAll<HTMLElement>(".midi-qol-target-npc-Player").forEach(el => el.style.display = "none");
    if (!configSettings.highlightSuccess) {
      html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("success"));
      html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("failure"));
      html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("critical"));
      html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("fumble"));
    }
    if (!configSettings.highlightSuccess || !shouldDisplayChallenge) {
      html.querySelectorAll<HTMLElement>(".midi-qol-saves-display .midi-qol-save-class").forEach(el => el.classList.remove("success"));
      html.querySelectorAll<HTMLElement>(".midi-qol-saves-display .midi-qol-save-class").forEach(el => el.classList.remove("failure"));
      html.querySelectorAll<HTMLElement>(".midi-qol-saves-display .midi-qol-save-class").forEach(el => el.classList.remove("critical"));
      html.querySelectorAll<HTMLElement>(".midi-qol-saves-display .midi-qol-save-class").forEach(el => el.classList.remove("fumble"));
    }
    return;
  } else {
    if (message.blind) {
      html.querySelectorAll(".midi-attack-roll .dice-roll").forEach(el => {
        el.outerHTML = `<span>${i18n("midi-qol.DiceRolled")}</span>`;
      });
      // html.find(".midi-damage-roll .dice-roll").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`);
      if (!(message.flags && message.flags["monks-tokenbar"])) // not a monks roll
        html.querySelectorAll(".dice-roll").forEach(el => {
          el.outerHTML =  `<span>${i18n("midi-qol.DiceRolled")}</span>`;
        });
      // html.find(".dice-result").replaceWith(`<span>${i18n("midi-qol.DiceRolled")}</span>`); Monks saving throw css
      //TODO this should probably just check formula
    }
    if (configSettings.autoCheckHit === "whisper" || message.blind || safeGetGameSetting("dnd5e", "attackRollVisibility") === "none") {
      html.querySelectorAll<HTMLElement>(".midi-qol-hits-display").forEach(el => el.style.display = "none");
    }
    if ((configSettings.autoCheckSaves === "whisper" || message.blind)) {
      html.querySelectorAll<HTMLElement>(".midi-qol-saves-display").forEach(el => el.style.display = "none");
    }

    const displayNPCSaves = safeGetGameSetting("dnd5e", "challengeVisibility") === "all";
    const displayPlayerSaves = safeGetGameSetting("dnd5e", "challengeVisibility") !== "none";
    // hide tool tips from non-gm
    if (!displayPlayerSaves) 
      html.querySelectorAll(".midi-qol-save-tooltip").forEach(el => el.remove());
    else if (!displayNPCSaves || configSettings.autoCheckSaves !== "allShow") 
      html.querySelectorAll(".midi-qol-npc-save-tooltip").forEach(el => el.remove());

    if (!displayPlayerSaves) html.querySelectorAll(".midi-qol-save-total").forEach(el => el.remove());
    else if (!["allShow", "all"].includes(configSettings.autoCheckSaves) || !displayNPCSaves) {
      html.querySelectorAll(".midi-qol-npc-save-total").forEach(el => el.remove());
    }

    if (!displayPlayerSaves)
      html.querySelectorAll(".midi-qol-saves-display .midi-qol-save-symbol").forEach(el => el.remove());
    else if (!displayNPCSaves) 
      html.querySelectorAll(".midi-qol-npc-save-symbol").forEach(el => el.remove());
    else if (!shouldDisplayChallenge || configSettings.autoCheckSaves === "whisper")
      html.querySelectorAll(".midi-qol-saves-display .midi-qol-save-symbol").forEach(el => el.remove());
    if (!configSettings.highlightSuccess || !shouldDisplayChallenge) {
      html.querySelectorAll<HTMLElement>(".midi-qol-saves-display .midi-qol-save-class").forEach(el => el.classList.remove("success"));
      html.querySelectorAll<HTMLElement>(".midi-qol-saves-display .midi-qol-save-class").forEach(el => el.classList.remove("failure"));
      html.querySelectorAll<HTMLElement>(".midi-qol-saves-display .midi-qol-save-class").forEach(el => el.classList.remove("critical"));
      html.querySelectorAll<HTMLElement>(".midi-qol-saves-display .midi-qol-save-class").forEach(el => el.classList.remove("fumble"));
    }
    // TODO: Right check?
    if (!configSettings.optionalRules.activeDefence) {
      html.querySelectorAll<HTMLElement>(".midi-qol-active-defence-dc").forEach(el => el.remove());
    }
    if (safeGetGameSetting("dnd5e", "attackRollVisibility")) {
      const visibility = safeGetGameSetting("dnd5e", "attackRollVisibility");
      if (visibility === "none") {
        html.querySelectorAll<HTMLElement>(".midi-qol-attack-roll .dice-total").forEach(el => el.classList.remove("success"));
        html.querySelectorAll<HTMLElement>(".midi-qol-attack-roll .dice-total").forEach(el => el.classList.remove("failure"));
        html.querySelectorAll<HTMLElement>(".midi-qol-attack-roll .dice-total").forEach(el => el.classList.remove("fumble"));
        html.querySelectorAll<HTMLElement>(".midi-qol-attack-roll .dice-total").forEach(el => el.classList.remove("critical"));
        html.querySelectorAll(".midi-qol-attack-roll .dice-total .icons").forEach(el => el.remove());

        html.querySelectorAll(".midi-qol-hits-display .midi-qol-hit-symbol").forEach(el => el.remove());
        html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("success"));
        html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("failure"));
        html.querySelectorAll(".midi-qol-hit-symbol").forEach(el => el.remove());
        html.querySelectorAll(".midi-qol-npc-ac").forEach(el => el.remove());
      } else if (visibility === "hideAC" || !configSettings.displayHitResultNumeric) {
        html.querySelectorAll(".midi-qol-npc-ac").forEach(el => el.remove());
        if (!configSettings.highlightSuccess) {
          html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("success"));
          html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("failure"));
          html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("critical"));
          html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("fumble"));
        }
      }
    } else {
      if (!shouldDisplayChallenge) {
        html.querySelectorAll(".midi-qol-hits-display .midi-qol-hit-symbol").forEach(el => el.remove());
        html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("success"));
        html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("failure"));
      }
      if (!configSettings.displayHitResultNumeric || !shouldDisplayChallenge) {
        html.querySelectorAll(".midi-qol-npc-ac").forEach(el => el.remove());
      }
      if (!configSettings.highlightSuccess) {
        html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("success"));
        html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("failure"));
        html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("critical"));
        html.querySelectorAll<HTMLElement>(".midi-qol-hits-display .midi-qol-hit-class").forEach(el => el.classList.remove("fumble"));
      }
    }
    if (message.isAuthor || configSettings.confirmAttackDamage === "gmOnly") {
      html.querySelectorAll<HTMLElement>(".midi-qol-confirm-damage-roll-complete-hit").forEach(el => el.style.display = "none");
      html.querySelectorAll<HTMLElement>(".midi-qol-confirm-damage-roll-complete-miss").forEach(el => el.style.display = "none");
      html.querySelectorAll<HTMLElement>(".midi-qol-confirm-damage-roll-complete-critical").forEach(el => el.style.display = "none");
    }

    if (!game.user?.isGM) {
      // Can update the attack roll here, but damage rolls are redone in the ChatMessageMidi code so do the hiding for those there
      html.querySelectorAll<HTMLElement>(".midi-qol-confirm-damage-roll-cancel").forEach(el => el.style.display = "none");
      // hide the gm version of the name from` players
      html.querySelectorAll<HTMLElement>(".midi-qol-gmTokenName").forEach(el => el.remove());
    }
  }
  // @ ts-expect-error protected
  // setTimeout(() => ui.chat?.scrollBottom(), 0);
  return true;

}

export function ddbglPendingFired(data: { sceneId: string, tokenId: string, actorId: string, itemId: string, actionType: string }) {
  let { sceneId, tokenId, actorId, itemId, actionType } = data;
  if (!itemId || !["attack", "damage", "heal"].includes(actionType)) {
    error("DDB Game Log - no item/action for pending roll"); return
  }
  // const tokenUuid = `Scene.${sceneId??0}.Token.${tokenId??0}`;
  const token = fromUuidSync(`Scene.${sceneId ?? 0}.Token.${tokenId ?? 0}`)?.object as Token.Implementation | undefined;
  const actor = (token instanceof TokenDocument) ? token?.actor ?? game.actors?.get(actorId ?? "") : undefined;
  if (!actor || !(token instanceof CONFIG.Token.documentClass)) {
    warn(" ddb-game-log hook could not find actor");
    return;
  }
  // find the player who controls the character.
  let player: User.Implementation | null | undefined;
  if (token) {
    player = playerFor(token);
  } else {
    player = game.users?.players.find(p => p.active && actor?.testUserPermission(p, "OWNER"));
  }
  if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
  if (player?.id !== game.user?.id) return;

  let item = actor.items.get(itemId);
  if (!item) {
    warn(` ddb-game-log - hook could not find item ${itemId} on actor ${actor.name}`);
    return;
  }

  let workflow: DDBGameLogWorkflow | undefined = DDBGameLogWorkflow.get(item.uuid);
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
    // @ts-expect-error TODO: Halp. Item? Activity?
    workflow = new DDBGameLogWorkflow(actor, item, speaker, Array.from(game.user?.targets ?? new Set()), {});
    // @ts-expect-error no dnd5e-types
    item.displayCard({ showFullCard: false, workflow, createMessage: false, defaultCard: true });
    // showItemCard.bind(item)(false, workflow, false, true);
    return;
  }
}

export function ddbglPendingHook(data) { // need to propagate this to all players.
  if (!configSettings.enableDDBGL) return;
  socketlibSocket.executeForEveryone("ddbglPendingFired", data);
}

export function processCreateDDBGLMessages(message: ChatMessage.Implementation, options: ChatMessage.Database.CreateOptions, user: string) {
  if (!configSettings.enableDDBGL) return;

  const flags = message.flags;
  if (!flags || !flags["ddb-game-log"] || !game.user) return;
  const ddbGLFlags: any = flags["ddb-game-log"];
  if (!ddbGLFlags || ddbGLFlags.pending) return;
  // let sceneId, tokenId, actorId, itemId;
  if (!(["attack", "damage", "heal"].includes(flags.dnd5e?.roll?.type ?? ""))) return;
  const itemId = flags.dnd5e?.roll?.itemId;
  if (!itemId) { error("Could not find item for fulfilled roll"); return }
  const token = fromUuidSync(`Scene.${message.speaker.scene}.Token.${message.speaker.token}`)?.object as Token.Implementation | null;
  const actor = token?.actor ?? game.actors?.get(message.speaker.actor ?? "");
  if (!actor) {
    error("ddb-game-log could not find actor for roll");
    return;
  }
  // find the player who controls the character.
  let player: User.Implementation | null | undefined;
  if (token) {
    player = playerFor(token);
  } else {
    player = game.users?.players.find(p => p.active && actor?.testUserPermission(p, "OWNER"));
  }
  if (!player || !player.active) player = preferredActiveGM();
  if (player?.id !== game.user?.id) return;

  const item = actor.items.get(itemId);
  if (!item) {
    error(`ddb-game-log roll could not find item ${flags?.dnd5e?.roll?.itemId} on actor ${actor.name}`);
    return;
  }

  let workflow: DDBGameLogWorkflow | undefined = DDBGameLogWorkflow.get(item.uuid);
  //@ts-expect-error no dnd5e-types
  if (!workflow && flags.dnd5e.roll.type === "damage" && item.hasAttack && ["rwak", "mwak"].includes(item.actionType)) {
    warn(`ddb-game-log roll damage roll without workflow being started ${actor.name} using ${item.name}`);
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
  if (flags?.dnd5e?.roll?.type === "attack") {
    let rolls = message.rolls;
    if (!(rolls instanceof Array)) rolls = [rolls];
    // workflow.needItemCard = false; TODO revisit this
    workflow.attackRoll = rolls[0] ?? undefined;
    workflow.attackTotal = rolls[0]?.total ?? 0;
    // @ts-expect-error no dnd5e-types
    workflow.needsDamage = workflow.item.hasDamage;
    workflow.attackRollHTML = message.content;
    workflow.attackRolled = true;
    if (workflow.currentAction === workflow.WorkflowState_WaitForAttackRoll) {
      if (workflow.suspended) workflow.unSuspend({ attackRoll: workflow.attackRoll })
      // TODO NW workflow.performState(workflow.WorkflowState_WaitForAttackRoll,{attackRoll: workflow.attackRoll});
    }
  }

  if (["damage", "heal"].includes(flags.dnd5e?.roll?.type ?? "")) {
    let rolls = message.rolls;
    if (!rolls) return;
    // workflow.needItemCard = false; TODO revisit this
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


