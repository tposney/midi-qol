import { warn, error, debug, i18n, debugEnabled, overTimeEffectsToDelete } from "../midi-qol.js";
import { colorChatMessageHandler, diceSoNiceHandler, nsaMessageHandler, hideStuffHandler, chatDamageButtons, mergeCardSoundPlayer, processItemCardCreation, hideRollUpdate, hideRollRender, onChatCardAction, betterRollsButtons, processCreateBetterRollsMessage } from "./chatMesssageHandling.js";
import { processUndoDamageCard, socketlibSocket } from "./GMAction.js";
import { untargetDeadTokens, untargetAllTokens, midiCustomEffect, getSelfTarget, getSelfTargetSet, isConcentrating, MQfromUuid, expireRollEffect, processOverTime } from "./utils.js";
import { configSettings, dragDropTargeting } from "./settings.js";
import { installedModules } from "./setupModules.js";

export const concentrationCheckItemName = "Concentration Check - Midi QOL";
export var concentrationCheckItemDisplayName = "Concentration Check";

export let readyHooks = async () => {
  // need to record the damage done since it is not available in the update actor hook
  Hooks.on("preUpdateActor", (actor, update, diff, user) => {
    const hpUpdate = getProperty(update, "data.attributes.hp.value");
    if (hpUpdate === undefined) return true;
    const hpDiff = actor.data.data.attributes.hp.value - hpUpdate;
    actor.data.update({ "flags.midi-qol.concentration-damage": hpDiff })
    return true;
  })

  // Handle removing effects when the token is moved.
  Hooks.on("updateToken", (tokenDocument, update, diff, userId) => {
    if (game.user?.id !== userId) return;
    if ((update.x || update.y) === undefined) return;
    const actor = tokenDocument.actor;
    const expiredEffects = actor?.effects.filter(ef => {
      const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
      return specialDuration?.includes("isMoved");
    }) ?? [];
    if (expiredEffects.length > 0) actor?.deleteEmbeddedDocuments("ActiveEffect", expiredEffects.map(ef => ef.id));
  })

  // Have to trigger on preUpdate to check the HP before the update occured.
  Hooks.on("updateActor", async (actor, update, diff, user) => {
    if (!configSettings.concentrationAutomation) return true;
    const hpUpdate = getProperty(update, "data.attributes.hp.value");
    if (hpUpdate === undefined) return true;
    const hpDiff = getProperty(actor.data, "flags.midi-qol.concentration-damage")
    if (!hpDiff || hpDiff <= 0) return true;
    // expireRollEffect.bind(actor)("Damaged", ""); - not this simple - need to think about specific damage types
    concentrationCheckItemDisplayName = i18n("midi-qol.concentrationCheckName");
    let concentrationName;
    if (installedModules.get("combat-utility-belt")) {
      concentrationName = game.settings.get("combat-utility-belt", "concentratorConditionName");
    } else {
      concentrationName = i18n("midi-qol.Concentrating");
    }
    const concentrationEffect: ActiveEffect | undefined = isConcentrating(actor)
    if (!concentrationEffect) return true;
    if (actor.data.data.attributes.hp.value === 0) {
      concentrationEffect.delete();
    } else {
      const itemData = duplicate(itemJSONData);
      const saveDC = Math.max(10, Math.floor(hpDiff / 2));
      itemData.data.save.dc = saveDC;
      itemData.data.save.ability = "con";
      itemData.data.save.scaling = "flat";
      itemData.name = concentrationCheckItemDisplayName;
      // actor took damage and is concentrating....
      const saveTargets = game.user?.targets;
      const theTargetToken = getSelfTarget(actor);
      const theTarget = theTargetToken?.document ? theTargetToken?.document.id : theTargetToken?.id;
      if (game.user && theTarget) game.user.updateTokenTargets([theTarget]);
      let ownedItem: Item = new CONFIG.Item.documentClass(itemData, { parent: actor })
      if (configSettings.displaySaveDC) {
        //@ts-ignore 
        ownedItem.getSaveDC()
      }
      try {
        if (installedModules.get("betterrolls5e") && isNewerVersion(game.modules.get("betterrolls5e")?.data.version ?? "", "1.3.10")) { // better rolls breaks the normal roll process
          //@ts-ignore
          // await ownedItem.roll({ vanilla: false, showFullCard: false, createWorkflow: true, versatile: false, configureDialog: false })
          await globalThis.BetterRolls.rollItem(ownedItem, { itemData: ownedItem.data, vanilla: false, adv: 0, disadv: 0, midiSaveDC: saveDC }).toMessage();
        } else {
          //@ts-ignore
          await ownedItem.roll({ showFullCard: false, createWorkflow: true, versatile: false, configureDialog: false })
        }
      } finally {
        if (saveTargets && game.user) game.user.targets = saveTargets;
      }
    }
    return true;
  })

  Hooks.on("renderChatMessage", (message, html, data) => {
    if (debugEnabled > 1) debug("render message hook ", message.id, message, html, data);
    diceSoNiceHandler(message, html, data);
  })

  Hooks.on("restCompleted", restManager);

  Hooks.on("deleteActiveEffect", (...args) => {
    let [effect, option, userId] = args;
    if (game.user?.id !== userId) return true;
    //@ts-ignore documentClass
    if (!(effect.parent instanceof CONFIG.Actor.documentClass)) return true;
    const actor = effect.parent;
    const token = actor.token ? actor.token : actor.getActiveTokens()[0];
    const checkConcentration = globalThis.MidiQOL?.configSettings()?.concentrationAutomation;
    if (checkConcentration) {
      /// result = await wrapped(...args);
      handleRemoveConcentration(effect, [token]);
    }
    return true;
  });

  // Concentration Check is rolled as an item roll so we need an item.
  if (installedModules.get("combat-utility-belt")) {
    //@ts-ignore game.cub
    const concentrationCondition = game.cub.getCondition(game.settings.get("combat-utility-belt", "concentratorConditionName"))
    itemJSONData.name = concentrationCheckItemName
    itemJSONData.img = concentrationCondition?.icon;
  } else {
    itemJSONData.name = concentrationCheckItemName;
  }
}

export function restManager(actor, result) {
  if (!actor || !result) return;
  const myExpiredEffects = actor.effects.filter(ef => {
    const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
    return specialDuration && ((result.longRest && specialDuration.includes(`longRest`))
      || (result.newDay && specialDuration.includes(`newDay`))
      || specialDuration.includes(`shortRest`));
  }).map(ef => ef.id);;
  if (myExpiredEffects?.length > 0) actor?.deleteEmbeddedDocuments("ActiveEffect", myExpiredEffects);
}

async function handleRemoveConcentration(effect, tokens) {
  // TODO fix this to be localised
  let actor = effect.parent;
  let concentrationLabel: any = "Concentrating";
  if (installedModules.get("dfreds-convenient-effects")) {
    let concentrationId = "Convenient Effect: Concentrating";
    let statusEffect: any = CONFIG.statusEffects.find(se => se.id === concentrationId);
    if (statusEffect) concentrationLabel = statusEffect.label;
  } else if (installedModules.get("combat-utility-belt")) {
    concentrationLabel = game.settings.get("combat-utility-belt", "concentratorConditionName")
  }
  // Change this to 
  let isConcentration = effect.data.label === concentrationLabel;
  if (!isConcentration) return false;

  // If concentration has expired and times-up installed - leave it to TU.
  if (installedModules.get("times-up")) {
    const worldTime = game.time.worldTime
    let expired = effect.data.duration?.seconds && (game.time.worldTime - effect.data.duration.startTime) >= effect.data.duration.seconds;
    const duration = effect.duration;
    expired = expired || (duration && duration.remaining <= 0 && duration.type === "turns");
    if (expired) return true;
  }
  const concentrationData = actor.getFlag("midi-qol", "concentration-data");
  if (!concentrationData) return false;
  try {
    await actor.unsetFlag("midi-qol", "concentration-data")
    if (concentrationData.templates) {
      for (let templateUuid of concentrationData.templates) {
        await MQfromUuid(templateUuid).delete();
      }
    }
    socketlibSocket.executeAsGM("deleteItemEffects", { ignore: [effect.uuid], targets: concentrationData.targets, origin: concentrationData.uuid });
  } catch (err) {
    console.warn("dae | error deleteing concentration effects: ", err)
  }
  return true;
}

export let initHooks = () => {
  if (debugEnabled > 0) warn("Init Hooks processing");
  Hooks.on("preCreateChatMessage", (message: ChatMessage, data, options, user) => {
    if (debugEnabled > 1) debug("preCreateChatMessage entering", message, data, options, user)
    // recalcCriticalDamage(data, options);
    // processpreCreateBetterRollsMessage(message, data, options, user);
    nsaMessageHandler(message, data, options, user);
    return true;
  })

  Hooks.on("createChatMessage", (message: ChatMessage, options, user) => {
    if (debugEnabled > 1) debug("Create Chat Meesage ", message.id, message, options, user)
    processCreateBetterRollsMessage(message, user);
    processItemCardCreation(message, user);
    return true;
  })

  Hooks.on("updateChatMessage", (message, update, options, user) => {
    mergeCardSoundPlayer(message, update, options, user);
    hideRollUpdate(message, update, options, user);
    //@ts-ignore scrollBottom
    ui.chat?.scrollBottom();
  })

  Hooks.on("updateCombat", (combat, data, options, user) => {
    untargetAllTokens(combat, data.options, user);
    untargetDeadTokens();
    // updateReactionRounds(combat, data, options, user); This is handled in processOverTime
    processOverTime(combat, data, options, user);
  })

  Hooks.on("renderChatMessage", (message, html, data) => {
    if (debugEnabled > 1) debug("render message hook ", message.id, message, html, data);
    hideStuffHandler(message, html, data);
    chatDamageButtons(message, html, data);
    processUndoDamageCard(message, html, data);
    colorChatMessageHandler(message, html, data);
    hideRollRender(message, html, data);
    betterRollsButtons(message, html, data);
  })

  Hooks.on("midi-qol.RollComplete", (workflow) => {
    const wfuuid = workflow.uuid;

    if (overTimeEffectsToDelete[wfuuid]) {
      if (workflow.saves.size === 1 || !workflow.hasSave) {
        let effectId = overTimeEffectsToDelete[wfuuid].effectId;
        let actor = overTimeEffectsToDelete[wfuuid].actor;
        actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
      }
      delete overTimeEffectsToDelete[wfuuid];
    }
    if (debugEnabled > 1) debug("Finished the roll", wfuuid)
  })
  Hooks.on("applyActiveEffect", midiCustomEffect);

  Hooks.on("renderItemSheet", (app, html, data) => {
    if (configSettings.allowUseMacro) {
      const element = html.find('input[name="data.chatFlavor"]').parent().parent();
      const labelText = i18n("midi-qol.onUseMacroLabel");
      const currentMacro = getProperty(app.object.data, "flags.midi-qol.onUseMacroName") ?? "";
      const macroField = `<div class="form-group"><label>${labelText}</label><input type="text" name="flags.midi-qol.onUseMacroName" value="${currentMacro}"/> </div>`;
      element.append(macroField)
    }
    if (!installedModules.get("betterrolls5e") && isNewerVersion("1.5.0", game.system.data.version)) { // 1.5.0 will include per weapon criticals
      const element2 = html.find('input[name="data.attackBonus"]').parent().parent();
      const labelText2 = i18n('midi-qol.criticalThreshold');
      const criticalThreshold = getProperty(app.object.data, "flags.midi-qol.criticalThreshold") ?? 20;
      const criticalField = `<div class="form-group"><label>${labelText2}</label><div class="form-fields"><input type="text" name="flags.midi-qol.criticalThreshold" value="${criticalThreshold}"/></div></div>`;
      element2.append(criticalField);
    }
  })

  function _chatListeners(html) {
    html.on("click", '.card-buttons button', onChatCardAction.bind(this))
  }

  Hooks.on("renderChatLog", (app, html, data) => _chatListeners(html));

  Hooks.on('dropCanvasData', function (canvas: Canvas, dropData: any) {
    if (!dragDropTargeting) return true;
    if (dropData.type !== "Item") return true;;
    let grid_size = canvas.scene?.data.grid

    canvas.tokens?.targetObjects({
      x: dropData.x - grid_size / 2,
      y: dropData.y - grid_size / 2,
      height: grid_size,
      width: grid_size
    });

    let actor: Actor | undefined | null = game.actors?.get(dropData.actorId);
    if (dropData.tokenId) {
      let token = canvas.tokens?.get(dropData.tokenId)
      if (token) actor = token.actor;
    }
    const item = actor && actor.items.get(dropData.data._id);
    if (!actor || !item) error("actor / item broke ", actor, item);
    //@ts-ignore roll
    item?.roll();
    return true;
  })
}

export const saveJSONData = {
  "name": "OverTime Item",
  "type": "weapon",
  "img": "icons/svg/aura.svg",
  "data": {
    "description": {
      "value": "",
      "chat": "",
      "unidentified": ""
    },
    "source": "",
    "quantity": 1,
    "weight": 0,
    "price": 0,
    "attuned": false,
    "attunement": 0,
    "equipped": false,
    "rarity": "",
    "identified": true,
    "activation": {
      "type": "special",
      "cost": 0,
      "condition": ""
    },
    "duration": {
      "value": null,
      "units": ""
    },
    "target": {
      "value": null,
      "width": null,
      "units": "",
      "type": "creature"
    },
    "range": {
      "value": null,
      "long": null,
      "units": ""
    },
    "uses": {
      "value": 0,
      "max": "0",
      "per": ""
    },
    "consume": {
      "type": "",
      "target": "",
      "amount": null
    },
    "preparation": {"mode": "atwill"},
    "ability": "",
    "actionType": "save",
    "attackBonus": 0,
    "chatFlavor": "",
    "critical": null,
    "damage": {
      "parts": [],
      "versatile": ""
    },
    "formula": "",
    "save": {
      "ability": "con",
      "dc": 10,
      "scaling": "flat"
    },
    "armor": {
      "value": 0
    },
    "hp": {
      "value": 0,
      "max": 0,
      "dt": null,
      "conditions": ""
    },
    "weaponType": "simpleM",
    "properties": {
      "ada": false,
      "amm": false,
      "fin": false,
      "fir": false,
      "foc": false,
      "hvy": false,
      "lgt": false,
      "lod": false,
      "mgc": false,
      "rch": false,
      "rel": false,
      "ret": false,
      "sil": false,
      "spc": false,
      "thr": false,
      "two": false,
      "ver": false,
      "nodam": false,
      "fulldam": false,
      "halfdam": false
    },
    "proficient": false,
    "attributes": {
      "spelldc": 10
    }
  },
  "effects": [],
  "sort": 0,
  "flags": {
    "midi-qol": {
      "noCE": true
    }
  }
};

export const itemJSONData = {
  "name": "Concentration Check - Midi QOL",
  "type": "weapon",
  "img": "./modules/midi-qol/icons/concentrate.png",
  "data": {
    "description": {
      "value": "",
      "chat": "",
      "unidentified": ""
    },
    "source": "",
    "quantity": 1,
    "weight": 0,
    "price": 0,
    "attuned": false,
    "attunement": 0,
    "equipped": false,
    "rarity": "",
    "identified": true,
    "activation": {
      "type": "special",
      "cost": 0,
      "condition": ""
    },
    "duration": {
      "value": null,
      "units": ""
    },
    "target": {
      "value": null,
      "width": null,
      "units": "",
      "type": "creature"
    },
    "range": {
      "value": null,
      "long": null,
      "units": ""
    },
    "uses": {
      "value": 0,
      "max": "0",
      "per": ""
    },
    "consume": {
      "type": "",
      "target": "",
      "amount": null
    },
    "ability": "",
    "actionType": "save",
    "attackBonus": 0,
    "chatFlavor": "",
    "critical": null,
    "damage": {
      "parts": [],
      "versatile": ""
    },
    "formula": "",
    "save": {
      "ability": "con",
      "dc": 10,
      "scaling": "flat"
    },
    "armor": {
      "value": 10
    },
    "hp": {
      "value": 0,
      "max": 0,
      "dt": null,
      "conditions": ""
    },
    "weaponType": "simpleM",
    "properties": {
      "ada": false,
      "amm": false,
      "fin": false,
      "fir": false,
      "foc": false,
      "hvy": false,
      "lgt": false,
      "lod": false,
      "mgc": false,
      "rch": false,
      "rel": false,
      "ret": false,
      "sil": false,
      "spc": false,
      "thr": false,
      "two": false,
      "ver": false,
      "nodam": false,
      "fulldam": false,
      "halfdam": true
    },
    "proficient": false,
    "attributes": {
      "spelldc": 10
    }
  },
  "effects": [],
  "sort": 0,
  "flags": {
    "midi-qol": {
      "onUseMacroName": "ItemMacro",
      "isConcentrationCheck": true
    },
    "itemacro": {
      "macro": {
        "data": {
          "_id": null,
          "name": "Concentration Check - Midi QOL",
          "type": "script",
          "author": "devnIbfBHb74U9Zv",
          "img": "icons/svg/dice-target.svg",
          "scope": "global",
          "command": "if (MidiQOL.configSettings().autoCheckSaves === 'none') return;\n for (let targetData of args[0].targets) {\ let target = canvas.tokens.get(targetData._id);\n   if (MidiQOL.configSettings().removeConcentration && (target.actor.data.data.attributes.hp.value === 0 || args[0].failedSaves.find(tData => tData._id === target.id))) {\n     const concentrationLabel = game.modules.get('combat-utility-belt')?.active ? game.settings.get(\"combat-utility-belt\", \"concentratorConditionName\") : \"Concentrating\";\n   \n    const concentrationEffect = target.actor.effects.find(effect => effect.data.label === concentrationLabel);\n    if (concentrationEffect) await concentrationEffect.delete();\n}\n}",
          "folder": null,
          "sort": 0,
          "permission": {
            "default": 0
          },
          "flags": {}
        }
      }
    },
    "exportSource": {
      "world": "testWorld",
      "system": "dnd5e",
      "coreVersion": "0.8.8",
      "systemVersion": "1.3.6"
    },
    "magicitems": {
      "enabled": false,
      "equipped": false,
      "attuned": false,
      "charges": "0",
      "chargeType": "c1",
      "destroy": false,
      "destroyFlavorText": "reaches 0 charges: it crumbles into ashes and is destroyed.",
      "rechargeable": false,
      "recharge": "0",
      "rechargeType": "t1",
      "rechargeUnit": "r1",
      "sorting": "l"
    },
    "betterRolls5e": {
      "quickOther": {
        "context": "",
        "value": true,
        "altValue": true,
        "type": "Boolean"
      },
      "critRange": {
        "value": null,
        "type": "String"
      },
      "critDamage": {
        "value": "",
        "type": "String"
      },
      "quickDesc": {
        "value": false,
        "altValue": false,
        "type": "Boolean"
      },
      "quickSave": {
        "value": true,
        "altValue": true,
        "type": "Boolean"
      },
      "quickProperties": {
        "value": true,
        "altValue": true,
        "type": "Boolean"
      },
      "quickVersatile": {
        "value": false,
        "altValue": false,
        "type": "Boolean"
      },
      "quickFlavor": {
        "value": true,
        "altValue": true,
        "type": "Boolean"
      },
      "quickCharges": {
        "value": {
          "quantity": false,
          "use": false,
          "resource": true
        },
        "altValue": {
          "quantity": false,
          "use": false,
          "resource": true
        },
        "type": "Boolean"
      },
      "quickAttack": {
        "type": "Boolean",
        "value": true,
        "altValue": true
      },
      "quickDamage": {
        "type": "Array",
        "value": [],
        "altValue": [],
        "context": []
      },
      "quickTemplate": {
        "type": "Boolean",
        "value": true,
        "altValue": true
      },
      "quickPrompt": {
        "type": "Boolean",
        "value": false,
        "altValue": false
      }
    },
    "autoanimations": {
      "killAnim": false,
      "override": false,
      "animType": "t1",
      "animName": "",
      "color": "n1",
      "dtvar": "dt1",
      "explosion": false,
      "explodeVariant": "ev1",
      "explodeColor": "ec1",
      "explodeRadius": "0",
      "explodeLoop": "1",
      "hmAnim": "a1",
      "selfRadius": "5",
      "animTint": "#ffffff",
      "auraOpacity": 0.75,
      "ctaOption": false
    }
  }
}
