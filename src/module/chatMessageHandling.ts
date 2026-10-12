import { debug, warn, i18n, error, debugEnabled, i18nFormat, MODULE_ID } from "../midi-qol.js";
import { DDBGameLogWorkflow, Workflow } from "./Workflow.js";
import { nsaFlag, coloredBorders, configSettings, forceHideRoll } from "./settings.js";
import { playerFor, playerForActor, doOverTimeEffect, isInCombat, isAutoFastForward } from "./utils.js";
import { preferredActiveGM, socketlibSocket, unTimedExecuteAsGM } from "./GMAction.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
export const MAESTRO_MODULE_NAME = "maestro";
export const MODULE_LABEL = "Maestro";
export let colorChatMessageHandler = (message: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData) => {
  if (coloredBorders === "none") return true;
  let userId = message.author?.id ?? "";
  let actor = message.speakerActor;
  let user = game.users?.get(userId) as User.Implementation | undefined;

  if (actor) user = playerForActor(actor);
  if (!user) return true;
  const color = user.color.toString();
  // The colour is a variable on the message element and the styling lives in the stylesheet: dnd5e
  // rebuilds the header (and its .title name) after this hook, so styles set on those elements are lost.
  // Left side only: the bottom border is dnd5e's roll-mode marker (whisper/blind) and keeps its colour.
  html.style.setProperty("--midi-qol-player-color", color);
  html.classList.add("midi-qol-colored-border");
  if (coloredBorders === "borderNamesBackground") html.classList.add("midi-qol-colored-name-background");
  else if (coloredBorders === "borderNamesText") html.classList.add("midi-qol-colored-name");
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
  const overtimeActorUuid = data.flags?.[MODULE_ID]?.overtimeActorUuid;
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
      // @ts-expect-error fvtt-types v14 ActiveEffect
      for (let effect of actor.effects.filter(ef => ef.system.changes.some(change => change.key.startsWith("flags.midi-qol.OverTime")))) {
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

// For rolls forced blind with blindRollDisplay === "obscured": the card is public, but non-GM
// players see the result replaced with "??" and the dice breakdown stripped. GMs see everything.
export let obscureRollRender = (msg: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData) => {
  if (game.user?.isGM) return true;
  if (!foundry.utils.getProperty(msg, `flags.${MODULE_ID}.obscureRoll`)) return true;
  // Replace the result with "??", strip the dice breakdown, and remove the success/failure/crit/fumble
  // colouring classes (otherwise a nat 1/20 or pass/fail would still be given away by the highlight).
  const HIGHLIGHT = ["critical", "fumble", "success", "failure", "min", "max"];
  const apply = () => {
    html.querySelectorAll<HTMLElement>(".dice-total").forEach((el) => { el.textContent = "??"; el.classList.remove(...HIGHLIGHT); });
    html.querySelectorAll(".dice-tooltip").forEach((el) => el.remove());
    html.querySelectorAll<HTMLElement>(".critical, .fumble, .success, .failure, .min, .max").forEach((el) => el.classList.remove(...HIGHLIGHT));
    HIGHLIGHT.forEach((c) => html.classList.remove(c));
  };
  apply();
  // dnd5e paints the crit/fumble/success/failure colouring AFTER the render hooks (next frame),
  // so re-apply once more on the following frame to strip the classes it adds.
  requestAnimationFrame(apply);
  return true;
};


export let hideRollUpdate = (message: ChatMessage.Implementation, data: ChatMessage.UpdateData, options: ChatMessage.Database.UpdateOptions, id: string) => {
  return true;
  /*
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
  */
};

export let hideStuffHandler = (message: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData) => {
  if (debugEnabled > 1) debug("hideStuffHandler message: ", message.id, message)
  // Hide rolls which are blind and not the GM if force hide is true
  if ((forceHideRoll && message.blind && !game.user?.isGM)
    || (foundry.utils.getProperty(message, "flags.midi-qol.gmHide") && game.user?.isGM)) {
    html.style.display = "none";
    return;
  }
  // If force hide rolls and you are not the author/target of a whisper roll hide it.
  if (forceHideRoll
    && !(game.user?.isGM && nsaFlag)
    && message.whisper.length > 0 && !message.whisper.includes(game.user?.id ?? "")
    && !message.isAuthor) {
    html.style.display = "none";
    return;
  }
  // Blind roll dice replacement — affects non-midi messages too (monks-tokenbar etc.)
  if (!game.user?.isGM && message.blind) {
    html.querySelectorAll(".midi-attack-roll .dice-roll").forEach(el => {
      el.outerHTML = `<span>${i18n("midi-qol.DiceRolled")}</span>`;
    });
    if (!(message.flags && message.flags["monks-tokenbar"]))
      html.querySelectorAll(".dice-roll").forEach(el => {
        el.outerHTML = `<span>${i18n("midi-qol.DiceRolled")}</span>`;
      });
  }
  return true;
}

export function ddbglPendingFired(data: { sceneId: string, tokenId: string, actorId: string, itemId: string, actionType: string }) {
  let { sceneId, tokenId, actorId, itemId, actionType } = data;
  if (!itemId || !["attack", "damage", "heal"].includes(actionType)) {
    error("DDB Game Log - no item/action for pending roll"); return
  }
  // const tokenUuid = `Scene.${sceneId??0}.Token.${tokenId??0}`;
  const token = fromUuidSync(`Scene.${sceneId ?? 0}.Token.${tokenId ?? 0}`)?.object as Token.Implementation | undefined;
  const actor = token?.actor ?? game.actors?.get(actorId ?? "");
  if (!actor) {
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
  if (!workflow && flags.dnd5e.roll.type === "damage" && item.system.activities?.some(a => ["rwak", "mwak"].includes(a.actionType))) {
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


