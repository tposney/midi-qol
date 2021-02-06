import { warn, error, debug, i18n } from "../midi-qol";
import { processpreCreateBetterRollsMessage, colorChatMessageHandler, diceSoNiceHandler, nsaMessageHandler, hideStuffHandler, chatDamageButtons, processcreateBetterRollMessage, mergeCardSoundPlayer, recalcCriticalDamage, processItemCardCreation, hideRollUpdate, hideRollRender, _onChatCardAction } from "./chatMesssageHandling";
import { processUndoDamageCard } from "./GMAction";
import { untargetDeadTokens, untargetAllTokens, midiCustomEffect, getSelfTarget, getSelfTargetSet } from "./utils";
import { configSettings, dragDropTargeting } from "./settings";
import { installedModules } from "./setupModules";

const concentrationCheckItemName = "Concentration Check - Midi QOL";
const concentrationCheckItemDisplayName = "Concentration Check";


export let readyHooks = async () => {
  //  const item = game.items.getName("Concentration Check")


  if (installedModules.get("combat-utility-belt")) {
    Hooks.on("preUpdateActor", (actor, update, diff) => {
      if (!configSettings.concentrationAutomation) return true;
      const hpUpdate = getProperty(update, "data.attributes.hp.value");
      if (hpUpdate === undefined) return true;
      const concentrationName = game.settings.get("combat-utility-belt", "concentratorConditionName");
      if (!game.cub?.hasCondition(concentrationName, actor)) return true;
      const hpDiff = actor.data.data.attributes.hp.value - hpUpdate;
      if (hpDiff <= 0) return true;
      Hooks.once("updateActor", async () => {
        const item = game.items.getName(concentrationCheckItemName);
        item.data.data.name = concentrationCheckItemDisplayName;
        // actor took damage and is concentrating....
        const saveDC = Math.max(10, Math.floor(hpDiff/2));
        const saveTargets = game.user.targets;
        game.user.targets = await getSelfTargetSet(actor);
        const ownedItem = Item.createOwned(item.data, actor)
        ownedItem.data.data.save.dc = saveDC;
        try {
          //@ts-ignore
          ownedItem.roll({showFullCard:false, createWorkflow:true, versatile:false, configureDialog:false})
        } finally {
          game.user.targets = saveTargets;
        }
      })
      return true;
    })

    Hooks.on("preUpdateToken", (scene, tokenData, update, diff) => {
      if (!configSettings.concentrationAutomation) return true;
      const hpUpdate = getProperty(update, "actorData.data.attributes.hp.value");
      if (hpUpdate === undefined) return true;
      const token = canvas.tokens.get(tokenData._id);
      const concentrationName = game.settings.get("combat-utility-belt", "concentratorConditionName");
      if (!game.cub?.hasCondition(concentrationName, token)) return true;
 
      const hpDiff = token.actor.data.data.attributes.hp.value - hpUpdate;
      if (hpDiff <= 0) return true;
      Hooks.once("updateToken", async () => {
        const item = game.items.getName(concentrationCheckItemName);
        item.data.data.name = concentrationCheckItemDisplayName;
        // actor took damage and is concentrating....
        const saveDC = Math.max(10, Math.floor(hpDiff/2));
        const saveTargets = game.user.targets;
        game.user.targets = new Set([token]);

        const ownedItem = Item.createOwned(item.data, token.actor)
        ownedItem.data.data.save.dc = saveDC;
        try {
          //@ts-ignore
          ownedItem.roll({showFullCard:false, createWorkflow:true, versatile:false, configureDialog:false})
        } finally {
          game.user.targets = saveTargets;
        }
      })
      return true;
    })
  }

  // Concentration Check is rolled as an item roll so we need an item.
  // A temporary item would be good, but users would need create item permission which is a bit sily for just this
  // Any GM that logs in lookds for the item and either creates/updates the item using the canned data at the end.
  // When the check is rolled the name of the Item is changed.
  if (installedModules.get("combat-utility-belt")) {
    if (game.user.isGM) {
      const concentrationCondition = game.cub.getCondition(game.settings.get("combat-utility-belt", "concentratorConditionName"))
      itemJSONData.name = concentrationCheckItemName
      itemJSONData.img = concentrationCondition.icon;
      const currentItem = game.items.getName(concentrationCheckItemName)
      if (!currentItem)
        await Item.create(itemJSONData)
      else  await currentItem.update(itemJSONData, {});
    }
  }
}
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
    html.on("click", '.card-buttons button', _onChatCardAction.bind(this))
  }

  Hooks.on("renderChatLog", (app, html, data) => _chatListeners(html));

  Hooks.on('dropCanvasData', function(canvas, dropData) {
    if (!dragDropTargeting) return true;
    if (dropData.type !== "Item") return true;;
    let grid_size = canvas.scene.data.grid

    canvas.tokens.targetObjects({
        x: dropData.x-grid_size/2,
        y: dropData.y-grid_size/2,
        height: grid_size,
        width: grid_size
    });

    const actor = game.actors.get(dropData.actorId);
    const item = actor && actor.items.get(dropData.data._id);
    if (!actor || !item) error("actor / item broke ", actor, item);
    if (item.type === "spell") {
      //@ts-ignore
      actor.useSpell(item, {configureDialog: true})
    } else {
      //@ts-ignore
      item.roll();
    }
  })
}

const itemJSONData = {
  "_id": "yoMNjpJyjx7kIfiq",
  "name": "Concentration Check - Midi QOL",
  "type": "weapon",
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
      "fulldam": false
    },
    "proficient": false,
    "attributes": {
      "spelldc": 10
    }
  },
  "sort": 23700000,
  "flags": {
    "midi-qol": {
      "onUseMacroName": "ItemMacro"
    },
    "itemacro": {
      "macro": {
        "_data": {
          "name": "Concentration Check",
          "type": "script",
          "scope": "global",
          "command": "if (args[0].failedSaves.length === 0) return;\nconst failed = canvas.tokens.get(args[0].failedSaves[0]._id);\ngame.cub.removeCondition(game.settings.get(\"combat-utility-belt\", \"concentratorConditionName\"), failed, {warn: false});",
          "author": "devnIbfBHb74U9Zv"
        },
        "data": {
          "name": "Concentration Check",
          "type": "script",
          "scope": "global",
          "command": "if (args[0].failedSaves.length === 0) return;\nconst failed = canvas.tokens.get(args[0].failedSaves[0]._id);\ngame.cub.removeCondition(game.settings.get(\"combat-utility-belt\", \"concentratorConditionName\"), failed,  {warn: false});",
          "author": "devnIbfBHb74U9Zv"
        },
        "options": {},
        "apps": {},
        "compendium": null
      }
    },
    "exportSource": {
      "world": "testWorld",
      "system": "dnd5e",
      "coreVersion": "0.7.9",
      "systemVersion": "1.2.4"
    }
  },
  "img": "icons/svg/mystery-man.svg",
  "effects": []
};