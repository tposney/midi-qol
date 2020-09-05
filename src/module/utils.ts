import { debug, i18n, error, warn, noDamageSaves, cleanSpellName } from "../midi-qol";
import { itemRollButtons, configSettings, checkBetterRolls, autoRemoveTargets } from "./settings";
import { log } from "../midi-qol";
import { Workflow, WORKFLOWSTATES } from "./workflow";
import { broadcastData } from "./GMAction";
import { installedModules } from "./setupModules";

/**
 *  return a list of {damage: number, type: string} for the roll and the item
 */
export let createDamageList = (roll, item, defaultType = "radiant") => {
  if (isNewerVersion(game.data.version, "0.6.9") ) {
    let damageList = []
    let rollTerms = roll.terms;
    let partPos = 0;
    let evalString;
    let damageSpec = item ? item.data.data.damage : {parts: []};
    debug("CreateDamageList: Passed roll is ", roll)
    debug("CreateDamageList: Damage spec is ", damageSpec)
    for (let [spec, type] of damageSpec.parts) {
      debug("CreateDamageList: single Spec is ", spec, type, item)
      if (item) {
        //@ts-ignore replaceFromulaData - blank out @fields with 0
        let formula = Roll.replaceFormulaData(spec, {}, {missing: "0", warn: false});
        var rollSpec: Roll = new Roll(formula, item.actor?.getRollData() || {}).roll();
      }
      debug("CreateDamageList: rollSpec is ", spec, rollSpec)

      //@ts-ignore
      let specLength = rollSpec.terms.length;
      evalString = "";

      //@ts-ignore
      debug("CreateDamageList: Spec Length ", specLength, rollSpec.terms)
      for (let i = 0; i < specLength && partPos < rollTerms.length; i++) {
        if (typeof rollTerms[partPos] !== "object") {
          evalString += rollTerms[partPos];
        } else {
          debug("CreateDamageList: roll parts ", rollTerms[partPos])
          let total = rollTerms[partPos].total;
          evalString += total;
        }
        partPos += 1;
      }
      let damage = new Roll(evalString).roll().total;
      debug("CreateDamageList: Damage is ", damage, type, evalString)
      damageList.push({ damage: damage, type: type });
      partPos += 1; // skip the plus
    }
    debug(partPos, damageList)
    evalString = "";
    while (partPos < rollTerms.length) {
      debug(rollTerms[partPos])
      if (typeof rollTerms[partPos] === "object") {
        let total = rollTerms[partPos].total;
        evalString += total;
      }
      else evalString += rollTerms[partPos];
      partPos += 1;
    }
    if (evalString.length > 0) {
      debug("CreateDamageList: Extras part is ", evalString)
      let damage = new Roll(evalString).roll().total;
      let type = damageSpec.parts[0] ? damageSpec.parts[0][1] : defaultType;
      damageList.push({ damage, type});
      debug("CreateDamageList: Extras part is ", evalString)
    }
    debug("CreateDamageList: Final damage list is ", damageList)
    return damageList;
  }
  let damageList = [];
  let rollParts = roll.parts;
  let partPos = 0;
  let evalString;
  let damageSpec = item ? item.data.data.damage : {parts: []};
  debug("CreateDamageList: Passed roll is ", roll)
  debug("CreateDamageList: Damage spec is ", damageSpec)
  for (let [spec, type] of damageSpec.parts) {
    debug("CreateDamageList: single Spec is ", spec, type, item)
    if (item) {
      var rollSpec = new Roll(spec, item.actor?.getRollData() || {}).roll();
    }
    debug("CreateDamageList: rollSpec is ", spec, rollSpec)
    let specLength = rollSpec.parts.length;
    evalString = "";

    debug("CreateDamageList: ", specLength, rollSpec.parts)
    for (let i = 0; i < specLength && partPos < rollParts.length; i++) {
      if (typeof rollParts[partPos] === "object") {
        debug("CreateDamageList: roll parts ", rollParts[partPos])
        let total = rollParts[partPos].total;
        evalString += total;
      }
      else evalString += rollParts[partPos];
      partPos += 1;
    }
    let damage = new Roll(evalString).roll().total;
    debug("CreateDamageList: Damage is ", damage, type, evalString)

    damageList.push({ damage: damage, type: type });
    partPos += 1; // skip the plus
  }
  debug("CreateDamageList: ", partPos, damageList)

  evalString = "";
  while (partPos < rollParts.length) {
    debug("CreateDamageList: ", rollParts[partPos])
    if (typeof rollParts[partPos] === "object") {
      let total = rollParts[partPos].total;
      evalString += total;
    }
    else evalString += rollParts[partPos];
    partPos += 1;
  }
  if (evalString.length > 0) {
    debug("CreateDamageList: Extras part is ", evalString)
      let damage = new Roll(evalString).roll().total;
      let type = damageSpec.parts[0] ? damageSpec.parts[0][1] : "radiant";
      damageList.push({ damage, type});
      debug("CreateDamageList: Extras part is ", evalString)
  }
  debug("CreateDamageList: Final damage list is ", damageList)
  return damageList;
}

export function getSelfTarget(actor) {
  if (actor.isPC) return actor.getActiveTokens()[0]; // if a pc always use the represented token
  const speaker = ChatMessage.getSpeaker()
  if (speaker.token) return canvas.tokens.get(speaker.token);
  if (actor.token) return actor.token;
  return undefined;
}

export function getSelfTargetSet(actor) {
  return new Set([getSelfTarget(actor)])
}

export let getParams = () => {
  return ` 
    itemRollButtons: ${itemRollButtons} <br>
    configSettings.speedItemRolls: ${configSettings.speedItemRolls} <br>
    configSettings.autoTarget: ${configSettings.autoTarget} <br>
    configSettings.autoCheckHit: ${configSettings.autoCheckHit} <br>
    configSettings.autoCheckSaves: ${configSettings.autoCheckSaves} <br>
    configSettings.autoApplyDamage: ${configSettings.autoApplyDamage} <br>
    configSettings.autoRollDamage: ${configSettings.autoRollDamage} <br>
    configSettings.playerRollSaves: ${configSettings.playerRollSaves} <br>
    checkBetterRolls: ${checkBetterRolls} `
}
// Calculate the hp/tempHP lost for an amount of damage of type
export function calculateDamage(a, appliedDamage, t, totalDamage, dmgType) {
  debug("calculate damage ", a, appliedDamage, t, totalDamage, dmgType)
  let value = Math.floor(appliedDamage);
  if (dmgType.includes("temphp")) { // only relavent for healing of tmp HP
    var hp = a.data.data.attributes.hp;
    var tmp = parseInt(hp.temp) || 0;
    var oldHP = hp.value;
    var newTemp = Math.max(tmp - value, 0);
    var newHP: number = hp.value;
  } else {
    var hp = a.data.data.attributes.hp, tmp = parseInt(hp.temp) || 0, dt = value > 0 ? Math.min(tmp, value) : 0;
    var newTemp = tmp - dt;
    var oldHP = hp.value;
    var newHP: number = Math.clamped(hp.value - (value - dt), 0, hp.max + (parseInt(hp.tempmax)|| 0));
  }

  if (game.user.isGM)
      log(`${a.name} takes ${value} reduced from ${totalDamage} Temp HP ${newTemp} HP ${newHP}`);
  return {tokenID: t.id, actorID: a._id, tempDamage: dt, hpDamage: oldHP - newHP, oldTempHP: tmp, newTempHP: newTemp,
          oldHP: oldHP, newHP: newHP, totalDamage: totalDamage, appliedDamage: value};
}

/** 
 * Work out the appropriate multiplier for DamageTypeString on actor
 * If configSettings.damageImmunities are not being checked always return 1
 * 
 */

export let getTraitMult = (actor, dmgTypeString, item) => {
  if (dmgTypeString.includes("healing") || dmgTypeString.includes("temphp")) return -1;

  if (configSettings.damageImmunities !== "none" && dmgTypeString !== "") {
    // if not checking all damage counts as magical
    const magicalDamage = (item?.type !== "weapon" || item?.data.data.attackBonus > 0 || item.data.data.properties["mgc"]);
    for (let {type, mult}  of [{type: "di", mult: 0}, {type:"dr", mult: 0.5}, {type: "dv", mult: 2}]) {
      let trait = actor.data.data.traits[type].value;
      if (!magicalDamage && trait.includes("physical")) trait = trait.concat("bludgeoning", "slashing", "piercing")
      if (trait.includes(dmgTypeString)) return mult;
    }
  }
  // Check the custom immunities
  return 1;
};

export let applyTokenDamage = (damageDetail, totalDamage, theTargets, item, saves) => {
  let damageList = [];
  let targetNames = [];
  let appliedDamage;
  let workflow = (Workflow.workflows && Workflow._workflows[item?.uuid]) || {};
  debug("Apply token damage ", damageDetail, totalDamage, theTargets, item, saves, workflow)

  if (!theTargets || theTargets.size === 0) {
    workflow.currentState = WORKFLOWSTATES.ROLLFINISHED;
    // probably called from refresh - don't do anything
    return true;
  }
  for (let t of theTargets) {
      let a = t.actor;
      if (!a) continue;
      appliedDamage = 0;
      for (let { damage, type } of damageDetail) {
        //let mult = 1;
          let mult = saves.has(t) ? getSaveMultiplierForItem(item) : 1;
          mult = mult * getTraitMult(a, type, item);
          appliedDamage += Math.floor(damage * Math.abs(mult)) * Math.sign(mult);
          var dmgType = type;
        }
      damageList.push(calculateDamage(a, appliedDamage, t, totalDamage, dmgType));
      targetNames.push(t.name)
  }
  if (theTargets.size > 0) {
    let intendedGM = game.user.isGM ? game.user : game.users.entities.find(u => u.isGM && u.active);
    if (!intendedGM) {
      ui.notifications.error(`${game.user.name} ${i18n("midi-qol.noGM")}`);
      error("No GM user connected - cannot apply damage");
      return;
    }

    broadcastData({
      action: "reverseDamageCard",
      autoApplyDamage: configSettings.autoApplyDamage,
      sender: game.user.name,
      intendedFor: intendedGM.id,
      damageList: damageList,
      settings: getParams(),
      targetNames,
      chatCardId: workflow.itemCardId
    });
  }
  return appliedDamage;
};

export async function processDamageRoll(workflow: Workflow, defaultDamageType: string) {
  warn("Process Damage Roll ", workflow)
  // proceed if adding chat damage buttons or applying damage for our selves
  let appliedDamage = 0;
  const actor = workflow.actor;
  let item = workflow.item;
  // const re = /.*\((.*)\)/;
  // const defaultDamageType = message.data.flavor && message.data.flavor.match(re);

  // Show damage buttons if enabled, but only for the applicable user and the GM
  
  let theTargets = workflow.hitTargets;
  if (item?.data.data.target?.type === "self") theTargets = getSelfTargetSet(actor) || theTargets;
  appliedDamage = applyTokenDamage(workflow.damageDetail, workflow.damageTotal, theTargets, item, workflow.saves);
  debug("process damage roll: ", configSettings.autoApplyDamage, workflow.damageDetail, workflow.damageTotal, theTargets, item, workflow.saves)
}

export let getSaveMultiplierForItem = item => {
  // find a better way for this ? perhaps item property
  if (!item) return 1;
  if (noDamageSaves.includes(cleanSpellName(item.name))) return 0;
  if (item.data.data.description.value.includes(i18n("midi-qol.noDamageText"))) {
    return 0.0;
  } 
  if (!configSettings.checkSaveText) return 0.5;
  if (item.data.data.description.value.includes(i18n("midi-qol.halfDamage")) || item.data.data.description.value.includes(i18n("midi-qol.halfDamageAlt"))) {
    return 0.5;
  }
  //  Think about this. if (checkSavesText true && item.hasSave) return 0; // A save is specified but the half-damage is not specified.
  return 1;
  };

export function requestPCSave(ability, playerId, actorId, advantage, flavor, dc, requestId) {
  if (installedModules.get("lmrtfy") && ["letme", "letmeQuery"].includes(configSettings.playerRollSaves)) {
    const socketData = {
      user: playerId,
      actors: [actorId],
      abilities: [],
      saves: [ability],
      skills: [],
      advantage: configSettings.playerRollSaves === "letmeQuery"? 2 : (advantage ? 1 : 0),
      mode: "roll",
      title: i18n("midi-qol.saving-throw"),
      message: `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.saving-throw")} ${flavor}`,
      formula: "",
      attach: requestId,
      deathsave: false,
      initiative: false
    }
    debug("process player save ", socketData)
    //@ts-ignore - emit not in types
    game.socket.emit('module.lmrtfy', socketData);
   //@ts-ignore - global variable
    LMRTFY.onMessage(socketData);
  } else {
    let player = game.users.get(playerId);
    let actorName = game.actors.get(actorId).name;
    let content = ` ${actorName} ${configSettings.displaySaveDC ? "DC " + dc : ""} ${CONFIG.DND5E.abilities[ability]} ${i18n("midi-qol.saving-throw")}`;
    content = content + (advantage ? `(${i18n("DND5E.Advantage")}` : "") + ` - ${flavor}`;
    ChatMessage.create({
      content,
      whisper: [player]
    });
  }
}

export function untargetDeadTokens() {
  if (autoRemoveTargets !== "none") {
      game.user.targets.forEach(t => {
      if (t.actor?.data.data.attributes.hp.value <= 0) {
        //@ts-ignore
        t.setTarget(false, { releaseOthers: false });
        game.user.targets.delete(t)
      }
    });
  }
}

export function untargetAllTokens(...args) {
  let combat: Combat = args[0];
  //@ts-ignore
  if ((game.user.isGM && ["allGM","all"].includes(autoRemoveTargets)) || (autoRemoveTargets === "all" && canvas.tokens.controlled.find(t=>t.id === combat.previous?.tokenId))) {
    // release current targets
    game.user.targets.forEach(t => {
        //@ts-ignore
        t.setTarget(false, { releaseOthers: false });
    });
    game.user.targets.clear()
  }
}