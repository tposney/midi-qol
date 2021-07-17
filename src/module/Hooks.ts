import { warn, error, debug, i18n } from "../midi-qol.js";
import { colorChatMessageHandler, diceSoNiceHandler, nsaMessageHandler, hideStuffHandler, chatDamageButtons, mergeCardSoundPlayer, processItemCardCreation, hideRollUpdate, hideRollRender, onChatCardAction, betterRollsButtons, processCreateBetterRollsMessage } from "./chatMesssageHandling.js";
import { processUndoDamageCard } from "./GMAction.js";
import { untargetDeadTokens, untargetAllTokens, midiCustomEffect, getSelfTarget, getSelfTargetSet, isConcentrating } from "./utils.js";
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
    actor.data.update({"flags.midi-qol.concentration-damage": hpDiff})
    return true;
  })

  // Handle removing effects when the token is moved.
  Hooks.on("updateToken", (tokenDocument, update, diff, userId) => {
    if (game.user?.id !== userId) return;
    if ((update.x ?? update.y) === undefined) return;
    const actor = tokenDocument.actor;
    const expiredEffects = actor.effects.filter(ef => {
      const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
      return specialDuration?.includes("isMoved");
    });
    if (expiredEffects.length > 0) actor?.deleteEmbeddedEntity("ActiveEffect", expiredEffects.map(ef=>ef.id));
  })

  // Have to trigger on preUpdate to check the HP before the update occured.
  Hooks.on("updateActor", async (actor, update, diff, user) => {
    if (!configSettings.concentrationAutomation) return true;
    const hpUpdate = getProperty(update, "data.attributes.hp.value");
    if (hpUpdate === undefined) return true;
    const hpDiff = getProperty(actor.data, "flags.midi-qol.concentration-damage")
    if (!hpDiff || hpDiff <= 0) return true;
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
      itemData.name = concentrationCheckItemDisplayName;
      // actor took damage and is concentrating....
      const saveDC = Math.max(10, Math.floor(hpDiff / 2));
      const saveTargets = game.user?.targets;
      const theTarget = getSelfTarget(actor)?.document.id;
      if (game.user && theTarget) game.user.updateTokenTargets([theTarget]);
      let ownedItem: Item = new CONFIG.Item.documentClass(itemData, { parent: actor })
      //@ts-ignore save
      ownedItem.data.data.save.dc = saveDC;
      try {
        if (installedModules.get("betterrolls5e") && isNewerVersion(game.modules.get("betterrolls5e")?.data.version ?? "", "1.3.10")) { // better rolls breaks the normal roll process
          //@ts-ignore
          await BetterRolls.rollItem(ownedItem, { adv: 0, disadv: 0, midiSaveDC: saveDC }).toMessage();
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

  // Concentration Check is rolled as an item roll so we need an item.
  if (installedModules.get("combat-utility-belt")) {
    //@ts-ignore game.cub
    const concentrationCondition = game.cub.getCondition(game.settings.get("combat-utility-belt", "concentratorConditionName"))
    itemJSONData.name = concentrationCheckItemName
    itemJSONData.img = concentrationCondition.icon;
  } else {
    itemJSONData.name = concentrationCheckItemName;
  }


}
export let initHooks = () => {
  warn("Init Hooks processing");
  Hooks.on("preCreateChatMessage", (message: ChatMessage, data, options, user) => {
    debug("preCreateChatMessage entering", message, data, options, user)
    // recalcCriticalDamage(data, options);
    // processpreCreateBetterRollsMessage(message, data, options, user);
    nsaMessageHandler(message, data, options, user);
    return true;
  })

  Hooks.on("createChatMessage", (message: ChatMessage, options, user) => {
    debug("Create Chat Meesage ", message.id, message, options, user)
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
  })

  Hooks.on("renderChatMessage", (message, html, data) => {
    debug("render message hook ", message.id, message, html, data);
    hideStuffHandler(message, html, data);
    chatDamageButtons(message, html, data);
    processUndoDamageCard(message, html, data);
    diceSoNiceHandler(message, html, data);
    colorChatMessageHandler(message, html, data);
    hideRollRender(message, html, data);
    betterRollsButtons(message, html, data);
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
  })

  function _chatListeners(html) {
    html.on("click", '.card-buttons button', onChatCardAction.bind(this))
  }

  Hooks.on("renderChatLog", (app, html, data) => _chatListeners(html));

  Hooks.on('dropCanvasData', function (canvas: Canvas, dropData:any) {
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

export const itemJSONData = {
  "name": "Concentration Check - Midi QOL",
  "type": "weapon",
  "img": "modules/combat-utility-belt/icons/concentrating.svg",
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
          "command": "for (let targetData of args[0].targets) {\n   let target = canvas.tokens.get(targetData._id);\n   if (MidiQOL.configSettings().removeConcentration && (target.actor.data.data.attributes.hp.value === 0 || args[0].failedSaves.find(tData => tData._id === target.id))) {\n     const concentrationLabel = game.cub?.active ? game.settings.get(\"combat-utility-belt\", \"concentratorConditionName\") : \"Concentrating\";\n   \n    const concentrationEffect = target.actor.effects.find(effect => effect.data.label === concentrationLabel);\n    if (concentrationEffect) await concentrationEffect.delete();\n}\n}",
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