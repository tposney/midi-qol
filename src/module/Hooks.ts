import { warn, error } from "../midi-qol";
import { processpreCreateAttackRollMessage, processpreCreateDamageRollMessage, processpreCerateSaveRollMessaage, processpreCreateBetterRollsMessage, processcreateAttackRoll, processcreateDamageRoll, processcreateSaveRoll, processUndoDamageCard, colorChatMessageHandler, diceSoNiceHandler, nsaMessageHandler, processPreCreateDamageRoll, hideStuffHandler, chatDamageButtons, processcreateBetterRollMessage } from "./chatMesssageHandling";

export let initHooks = () => {
  error("Init Hooks processing");
  Hooks.on("preCreateChatMessage", (data, options, user) => {
    // debug("preCreateChatMessage entering", data, options, user)
    processpreCreateBetterRollsMessage(data, options, user);
    processPreCreateDamageRoll(data, options);

    return true;
    warn("pre create message hook ", data, options)
    processpreCreateAttackRollMessage(data, options, user);
    processpreCreateDamageRollMessage(data, options, user);
    processpreCerateSaveRollMessaage(data, options, user);
    return true;
  })

  Hooks.on("createChatMessage", (message, options, user) => {
    processcreateBetterRollMessage(message, options, user);
    return true;
    warn("create message hook ", message, options, user)
    processcreateAttackRoll(message, options, user);
    processcreateDamageRoll(message, options, user);
    processcreateSaveRoll(message, options, user);
    // process coloring of the message
    // process whispers if required
    
    return true;
  })
  
  Hooks.on("updateChatMessage", () => {
    // @ts-ignore
    ui.chat.scrollBottom();
  })

  Hooks.on("renderChatMessage", (message, html, data) => {
    //debug("render message hook ", message, html, data);
    hideStuffHandler(message, html, data);
    processUndoDamageCard(message, html, data);
    diceSoNiceHandler(message, html, data);
    colorChatMessageHandler(message, html, data);
    nsaMessageHandler(message, html, data);
    chatDamageButtons(message, html, data);
  })


  // setup for rendering actor sheets
}