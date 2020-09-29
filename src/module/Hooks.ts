import { warn, error, debug } from "../midi-qol";
import { processpreCreateBetterRollsMessage, colorChatMessageHandler, diceSoNiceHandler, nsaMessageHandler, hideStuffHandler, chatDamageButtons, processcreateBetterRollMessage, mergeCardSoundPlayer, diceSoNiceUpdateMessge, recalcCriticalDamage, processItemCardCreation, hideRollUpdate, hideRollRender } from "./chatMesssageHandling";
import { processUndoDamageCard } from "./GMAction";
import { untargetDeadTokens, untargetAllTokens } from "./utils";

export let initHooks = () => {
  warn("Init Hooks processing");
  Hooks.on("preCreateChatMessage", (data, options, user) => {
    debug("preCreateChatMessage entering", data, options, user)
    recalcCriticalDamage(data, options);
    processpreCreateBetterRollsMessage(data, options, user);
    return true;
  })

  Hooks.on("createChatMessage", (message, options, user) => {
    debug("Create Chat Meesage ", message.id, message, options, user)
    processcreateBetterRollMessage(message, options, user);
    processItemCardCreation(message, options, user);
    return true;
  })
  
  Hooks.on("updateChatMessage", (message, update, options, user) => {
    diceSoNiceUpdateMessge(message, update, options, user);
    mergeCardSoundPlayer(message, update, options, user);
    hideRollUpdate(message, update, options, user)
    //@ts-ignore
    ui.chat.scrollBottom();
  })

  Hooks.on("updateCombat", (...args) => {
    untargetAllTokens(...args);
    untargetDeadTokens();
  })
  
  Hooks.on("renderChatMessage", (message, html, data) => {
    debug("render message hook ", message.id, message, html, data);
    hideStuffHandler(message, html, data);
    chatDamageButtons(message, html, data);
    processUndoDamageCard(message, html, data);
    diceSoNiceHandler(message, html, data);
    colorChatMessageHandler(message, html, data);
    nsaMessageHandler(message, html, data);
    hideRollRender(message, html, data);
  })
}