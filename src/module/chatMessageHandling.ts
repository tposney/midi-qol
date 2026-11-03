import { debug, warn, error, debugEnabled, MODULE_ID } from "../midi-qol.js";
import { Workflow } from "./Workflow.js";
import { nsaFlag, coloredBorders, configSettings, forceHideRoll } from "./settings.js";
import { playerFor, playerForActor, doOverTimeEffect, isInCombat, dnd5eRollType, dnd5eRollItemId } from "./utils.js";
import { preferredActiveGM, socketlibSocket, unTimedExecuteAsGM } from "./GMAction.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
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
  // "death" is deliberately excluded: 6.0 files death saves under the "save" sub-type, where the old
  // flag gave them their own string, so testing the sub-type alone would newly trigger over-time
  // effects on death saves.
  if (!message.rolls?.length || !["skill", "save", "ability", "tool"].includes(dnd5eRollType(message) ?? "")) return true;
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
    // The shape doOverTimeEffect expects.
    const rollFlags: Record<string, unknown> = {
      type: dnd5eRollType(message),
      ability: foundry.utils.getProperty(message, "system.ability"),
      skillId: foundry.utils.getProperty(message, "system.skill"),
      toolId: foundry.utils.getProperty(message, "system.tool")
    };
    let func = async (actor: Actor, _rollFlags: any, roll: Roll) => {
      // @ts-expect-error fvtt-types v14 ActiveEffect
      for (let effect of actor.effects.filter(ef => ef.system.changes.some(change => change.key.startsWith("flags.midi-qol.OverTime")))) {
        await doOverTimeEffect(actor, effect, true, { saveToUse: roll, rollFlags, isActionSave: true })
      }
    };
    func(actor, rollFlags, message.rolls[message.rolls.length - 1]);
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
  // A roll forced blind by midi's settings is not shown to players at all
  if (foundry.utils.getProperty(message, "flags.midi-qol.forcedBlind") && !game.user?.isGM) {
    html.style.display = "none";
    return;
  }
  // Hide rolls which are blind and not the GM if force hide is true
  if ((forceHideRoll && message.blind && !game.user?.isGM)
    // gmHide marks the extra attack/damage messages the old GM attack/damage cards option posted
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
  // Blind-roll dice replacement and obscured-result masking now run in
  // ChatMessageMidi.maskHiddenRolls. This hook fires before the card body exists, so anything
  // reaching into .message-content from here matches nothing. What stays is whole-message hiding,
  // which acts on the message element itself and is unaffected.
  return true;
}
