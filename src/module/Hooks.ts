import { warn, error, debug, i18n, debugEnabled, overTimeEffectsToDelete } from "../midi-qol.js";
import { colorChatMessageHandler, diceSoNiceHandler, nsaMessageHandler, hideStuffHandler, chatDamageButtons, processItemCardCreation, hideRollUpdate, hideRollRender, onChatCardAction, betterRollsButtons, processCreateBetterRollsMessage, processCreateDDBGLMessages, ddbglPendingHook, betterRollsUpdate } from "./chatMesssageHandling.js";
import { deleteItemEffects, processUndoDamageCard, timedAwaitExecuteAsGM } from "./GMAction.js";
import { untargetDeadTokens, untargetAllTokens, midiCustomEffect, getSelfTarget, MQfromUuid, processOverTime, checkImmunity, getConcentrationEffect, applyTokenDamage, getConvenientEffectsUnconscious, ConvenientEffectsHasEffect, getConvenientEffectsDead, removeReactionUsed, removeBonusActionUsed, checkflanking } from "./utils.js";
import { OnUseMacros, activateMacroListeners } from "./apps/Item.js"
import { checkRule, configSettings, dragDropTargeting } from "./settings.js";
import { installedModules } from "./setupModules.js";
import { preUpdateItemOnUseMacro } from "./patching.js";

export const concentrationCheckItemName = "Concentration Check - Midi QOL";
export var concentrationCheckItemDisplayName = "Concentration Check";


export let readyHooks = async () => {
  // need to record the damage done since it is not available in the update actor hook
  Hooks.on("preUpdateActor", (actor, update, diff, user) => {
    const hpUpdate = getProperty(update, "data.attributes.hp.value");
    if (hpUpdate === undefined) return true;

    let hpDiff = actor.data.data.attributes.hp.value - hpUpdate;
    if (hpUpdate >= (actor.data.data.attributes.hp.tempmax ?? 0) + actor.data.data.attributes.hp.max) hpDiff = 0;
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
    if (expiredEffects.length > 0) actor?.deleteEmbeddedDocuments("ActiveEffect", expiredEffects.map(ef => ef.id), { "expiry-reaason": "midi-qol:isMoved" });
  })

  Hooks.on("targetToken", debounce(checkflanking, 150));
  
  Hooks.on("ddb-game-log.pendingRoll", (data) => {
    ddbglPendingHook(data);
  });

  // Handle updates to the characters HP
  // Handle concentration checks
  Hooks.on("updateActor", async (actor, update, diff, user) => {
    if (user !== game.user?.id) return;
    const hpUpdate = getProperty(update, "data.attributes.hp.value");
    if (hpUpdate === undefined) return true;

    if (!configSettings.concentrationAutomation) return true;

    const hpDiff = getProperty(actor.data, "flags.midi-qol.concentration-damage")
    if (!hpDiff || hpDiff <= 0) return true;
    // expireRollEffect.bind(actor)("Damaged", ""); - not this simple - need to think about specific damage types
    concentrationCheckItemDisplayName = i18n("midi-qol.concentrationCheckName");
    const concentrationEffect: ActiveEffect | undefined = getConcentrationEffect(actor)
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
          await globalThis.BetterRolls.rollItem(ownedItem, { itemData: ownedItem.data, vanilla: false, adv: 0, disadv: 0, midiSaveDC: saveDC, workflowOptions: { lateTargeting: false } }).toMessage();
        } else {
          //@ts-ignore
          await ownedItem.roll({ showFullCard: false, createWorkflow: true, versatile: false, configureDialog: false, workflowOptions: { lateTargeting: false } })
        }
      } finally {
        if (saveTargets && game.user) game.user.targets = saveTargets;
      }
    }

    return true;
  });

  Hooks.on("renderChatMessage", (message, html, data) => {
    if (debugEnabled > 1) debug("render message hook ", message.id, message, html, data);
    diceSoNiceHandler(message, html, data);
  });

  Hooks.on("renderActorArmorConfig", (app, html, data) => {
    if (configSettings.optionalRules.challengeModeArmor) {
      const ac = data.ac;
      const element = html.find(".stacked"); // TODO do this better
      let ARHtml = $(`<div>EC: ${ac.EC}</div><div>AR: ${ac.AR}</div>`);
      element.append(ARHtml);
    }
  });

  // Handle removal of concentration
  Hooks.on("deleteActiveEffect", (...args) => {
    let [effect, options, user] = args;
    let gmToUse = game.users?.find(u => u.isGM && u.active);
    if (gmToUse?.id !== game.user?.id) return;
    if (!(effect.parent instanceof CONFIG.Actor.documentClass)) return;

    let changeFunc = async () => {

      const checkConcentration = globalThis.MidiQOL?.configSettings()?.concentrationAutomation;
      if (!checkConcentration) return;
      let concentrationLabel: any = i18n("midi-qol.Concentrating");
      if (installedModules.get("dfreds-convenient-effects")) {
        let concentrationId = "Convenient Effect: Concentrating";
        let statusEffect: any = CONFIG.statusEffects.find(se => se.id === concentrationId);
        if (statusEffect) concentrationLabel = statusEffect.label;
      } else if (installedModules.get("combat-utility-belt")) {
        concentrationLabel = game.settings.get("combat-utility-belt", "concentratorConditionName")
      }
      let isConcentration = effect.data.label === concentrationLabel;
      if (!isConcentration) return;

      // If concentration has expired effects and times-up installed - leave it to TU.
      if (installedModules.get("times-up")) {
        let expired = effect.data.duration?.seconds && (game.time.worldTime - effect.data.duration.startTime) >= effect.data.duration.seconds;
        const duration = effect.duration;
        expired = expired || (duration && duration.remaining <= 0 && duration.type === "turns");
        if (expired) return;
      }
      // Handle removal of concentration
      const actor = effect.parent;
      const concentrationData = actor.getFlag("midi-qol", "concentration-data");
      if (!concentrationData) return;
      try {
        await actor.unsetFlag("midi-qol", "concentration-data")
        if (concentrationData.templates) {
          for (let templateUuid of concentrationData.templates) {
            const template = await fromUuid(templateUuid);
            if (template) await template.delete();
          }
        }
        for (let removeUuid of concentrationData.removeUuids) {
          const entity = await fromUuid(removeUuid);
          if (entity) await entity.delete(); // TODO check if this needs to be run as GM
        }
        await deleteItemEffects({ ignore: [effect.uuid], targets: concentrationData.targets, origin: concentrationData.uuid });
      } catch (err) {
        error("error when attempting to remove concentration ", err)
      }
    };
    changeFunc();
  })

  Hooks.on("restCompleted", restManager);

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
  removeReactionUsed(actor); // remove reaction used for a rest
  removeBonusActionUsed(actor);
  const myExpiredEffects = actor.effects.filter(ef => {
    const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
    return specialDuration && ((result.longRest && specialDuration.includes(`longRest`))
      || (result.newDay && specialDuration.includes(`newDay`))
      || specialDuration.includes(`shortRest`));
  }).map(ef => ef.id);;
  if (myExpiredEffects?.length > 0) actor?.deleteEmbeddedDocuments("ActiveEffect", myExpiredEffects, { "expiry-reason": "midi-qol:rest" });
}

export function initHooks() {
  if (debugEnabled > 0) warn("Init Hooks processing");
  Hooks.on("preCreateChatMessage", (message: ChatMessage, data, options, user) => {
    if (debugEnabled > 1) debug("preCreateChatMessage entering", message, data, options, user)
    nsaMessageHandler(message, data, options, user);
    return true;
  })

  Hooks.on("createChatMessage", (message: ChatMessage, options, user) => {
    if (debugEnabled > 1) debug("Create Chat Meesage ", message.id, message, options, user)
    processCreateBetterRollsMessage(message, user);
    processItemCardCreation(message, user);
    processCreateDDBGLMessages(message, options, user);
    return true;
  })

  Hooks.on("updateChatMessage", (message, update, options, user) => {
    hideRollUpdate(message, update, options, user);
    betterRollsUpdate(message, update, options, user);
    //@ts-ignore scrollBottom
    ui.chat?.scrollBottom();
  })

  Hooks.on("updateCombat", (combat, data, options, user) => {
    untargetAllTokens(combat, data.options, user);
    untargetDeadTokens();
    // updateReactionRounds(combat, data, options, user); This is handled in processOverTime
  })

  Hooks.on("renderChatMessage", (message, html, data) => {
    if (debugEnabled > 1) debug("render message hook ", message.id, message, html, data);
    chatDamageButtons(message, html, data);
    processUndoDamageCard(message, html, data);
    colorChatMessageHandler(message, html, data);
    hideRollRender(message, html, data);
    betterRollsButtons(message, html, data);
    hideStuffHandler(message, html, data);
  })

  Hooks.on("midi-qol.RollComplete", (workflow) => {
    const wfuuid = workflow.uuid;

    if (overTimeEffectsToDelete[wfuuid]) {
      if (workflow.saves.size === 1 || !workflow.hasSave) {
        let effectId = overTimeEffectsToDelete[wfuuid].effectId;
        let actor = overTimeEffectsToDelete[wfuuid].actor;
        actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]), { "expiry-reason": "midi-qol:overTime" };
      }
      delete overTimeEffectsToDelete[wfuuid];
    }
    if (debugEnabled > 1) debug("Finished the roll", wfuuid)
  })
  Hooks.on("applyActiveEffect", midiCustomEffect);
  Hooks.on("preCreateActiveEffect", checkImmunity);
  Hooks.on("preUpdateItem", preUpdateItemOnUseMacro);
  Hooks.on("renderItemSheet", (app, html, data) => {
    const element = html.find('input[name="data.chatFlavor"]').parent().parent();
    if (configSettings.allowUseMacro) {
      const labelText = i18n("midi-qol.onUseMacroLabel");
      const macros = new OnUseMacros(getProperty(app.object.data, "flags.midi-qol.onUseMacroName"));
      const macroField = `<h4 class="damage-header">${labelText}
  <a class="macro-control damage-control add-macro"><i class="fas fa-plus"></i></a>
</h4>
  <ol class="damage-parts onusemacro-group form-group">
    ${macros.selectListOptions}
  </ol>`;
      element.append(macroField)
    }
    const labelText = i18n("midi-qol.EffectActivation");
    let currentEffectActivation = getProperty(app.object.data, "flags.midi-qol.effectActivation") ?? "";
    const activationField = `<div class="form-group"><label>${labelText}</label><input type="checkbox" name="flags.midi-qol.effectActivation" ${currentEffectActivation ? "checked" : ""}/> </div>`;

    element.append(activationField);

    if (installedModules.get("dfreds-convenient-effects")) {
      //@ts-ignore dfreds
      const ceForItem = game.dfreds.effects.all.find(e => e.name === app.object.name);
      if (ceForItem) {
        const element = html.find('input[name="data.chatFlavor"]').parent().parent();
        if (["both", "cepri"].includes(configSettings.autoCEEffects)) {
          const offLabel = i18n("midi-qol.convenientEffectsOff");
          const currentEffect = getProperty(app.object.data, "flags.midi-qol.forceCEOff") ?? false;
          const effect = `<div class="form-group"><label>${offLabel}</label><input type="checkbox" name="flags.midi-qol.forceCEOff" data-dtype="Boolean" ${currentEffect ? "checked" : ""}></div>`
          element.append(effect)
        }
        if (["none", "itempri"].includes(configSettings.autoCEEffects)) {
          const onLabel = i18n("midi-qol.convenientEffectsOn");
          const currentEffect = getProperty(app.object.data, "flags.midi-qol.forceCEOn") ?? false;
          const effect = `<div class="form-group"><label>${onLabel}</label><input type="checkbox" name="flags.midi-qol.forceCEOn" data-dtype="Boolean" ${currentEffect ? "checked" : ""}></div>`
          element.append(effect)
        }
      }
    }
    //@ts-ignore
    const midiProps = CONFIG.DND5E.midiProperties;
    if (app.object && ["spell", "feat", "weapon"].includes(app.object.type)) {
      const data = app.object.data;
      if (data.flags.midiProperties === undefined) {
        data.flags.midiProperties = {};
        for (let prop of Object.keys(midiProps)) {
          if (getProperty(data.data, `properties.${prop}`) && data.flags.midiProperties[prop] === undefined) {
            data.flags.midiProperties[prop] = true;
            delete data.data.properties.nodam;
          }
        }
      }
      if (data.data.properties?.fulldam !== undefined) {
        app.object.update({
          "data.properties.-=fulldam": null,
          "data.properties.-=halfdam": null,
          "data.properties.-=nodam": null,
          "data.properties.-=critOther": null,
          "flags.midiProperties": data.flags.midiProperties
        })
      }

      let newHtml = `<div><div class="form-group stacked weapon-properties">
          <label>${i18n("midi-qol.MidiProperties")}</label>`;
      for (let prop of Object.keys(midiProps)) {
        newHtml += `<label class="checkbox">
        <input type="checkbox" name="flags.midiProperties.${prop}" ${data.flags.midiProperties[prop] ? "checked" : ""} /> ${midiProps[prop]}
        </label>`;
      }
      newHtml += "</div></div>"
      /*
      const templateData = {
         data: app.object.data,
         //@ts-ignore
         config: CONFIG.DND5E
      }
      
      renderTemplate("modules/midi-qol/templates/midiProperties.html", templateData).then(template => {
        element.append(template)
      })
      */
      element.append(newHtml);
    }
    activateMacroListeners(app, html);
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
      x: dropData.x - grid_size! / 2,
      y: dropData.y - grid_size! / 2,
      height: grid_size!,
      width: grid_size!
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

export function setupHooks() {
}
export const overTimeJSONData = {
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
    "preparation": { "mode": "atwill" },
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
          "command": `
              if (MidiQOL.configSettings().autoCheckSaves === 'none') return;
              for (let targetUuid of args[0].targetUuids) {
                let target = await fromUuid(targetUuid);
                if (MidiQOL.configSettings().removeConcentration 
                  && (target.actor.data.data.attributes.hp.value === 0 || args[0].failedSaveUuids.find(uuid => uuid === targetUuid))) {
                const concentrationEffect = MidiQOL.getConcentrationEffect(target.actor);
                if (concentrationEffect) await concentrationEffect.delete();
                }
              }`,
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
  }
}