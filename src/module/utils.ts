import { debug, i18n, error, warn, noDamageSaves, cleanSpellName, MQdefaultDamageType, allAttackTypes, gameStats, debugEnabled, midiFlags, getCanvas } from "../midi-qol.js";
import { configSettings, autoRemoveTargets, checkRule } from "./settings.js";
import { log } from "../midi-qol.js";
import { Workflow, WORKFLOWSTATES } from "./workflow.js";
import { socketlibSocket } from "./GMAction.js";
import { installedModules } from "./setupModules.js";
import { actorAbilityRollPatching, baseEvent } from "./patching.js";
import { concentrationCheckItemName, itemJSONData } from "./Hooks.js";
//@ts-ignore
import Actor5e from "../../../systems/dnd5e/module/actor/entity.js"

/**
 *  return a list of {damage: number, type: string} for the roll and the item
 */
export let createDamageList = (roll, item, defaultType = MQdefaultDamageType) => {
  let damageParts = {};
  const rollTerms = roll.terms;
  let evalString = "";
  let damageSpec = item ? item.data.data.damage : { parts: [] };
  // create data for a synthetic roll
  let rollData = item ? item.getRollData() : {};
  rollData.mod = 0;
  debug("CreateDamageList: Passed roll is ", roll)
  debug("CreateDamageList: Damage spec is ", damageSpec)
  let partPos = 0;

  // If we have an item we can use it to work out each of the damage lines that are being rolled
  for (let [spec, type] of damageSpec.parts) { // each spec,type is one of the damage lines
    if (partPos >= rollTerms.length) continue;
    // TODO look at replacing this with a map/reduce
    debug("CreateDamageList: single Spec is ", spec, type, item)
    //@ts-ignore replaceFromulaData - blank out @field - do this to avoid @XXXX not found
    let formula = Roll.replaceFormulaData(spec, rollData, { missing: "0", warn: false });
    // TODO - need to do the .evaluate else the expression is not useful 
    // However will be a problem longer term when async not supported?? What to do
    let dmgSpec: Roll | undefined;
    try {
      dmgSpec = new Roll(formula, rollData).evaluate({ async: false });
    } catch (err) {
      console.warn("Dmg spec not valid", formula)
      dmgSpec = undefined;
      break;
    }
    if (!dmgSpec || dmgSpec.terms?.length < 1) break;
    // dmgSpec is now a roll with the right terms (but nonsense value) to pick off the right terms from the passed roll
    // Because damage spec is rolled it drops the leading operator terms, so do that as well
    for (let i = 0; i < dmgSpec.terms.length; i++) { // grab all the terms for the current damage line
      // rolls can have extra operator terms if mods are negative so test is
      // if the current roll term is an operator but the next damage spec term is not 
      // add the operator term to the eval string and advance the roll term counter
      // evemtually rollTerms[partPos] will become undefined so it can't run forever
      while (rollTerms[partPos] instanceof CONFIG.Dice.termTypes.OperatorTerm &&
        !(dmgSpec.terms[i] instanceof CONFIG.Dice.termTypes.OperatorTerm)) {
        evalString += rollTerms[partPos].total;
        partPos += 1;
      }
      evalString += rollTerms[partPos].total;
      partPos += 1;
    }
    // Each damage line is added together and we can skip the operator term
    partPos += 1;
    if (evalString) {
      let result = Roll.safeEval(evalString)
      damageParts[type || defaultType] = (damageParts[type || defaultType] || 0) + result;
      evalString = "";
    }
  }
  // We now have all of the item's damage lines (or none if no item)
  // Now just add up the other terms - using any flavor types for the rolls we get
  // we stepped one term too far so step back one
  partPos = Math.max(0, partPos -1);

  // process the rest of the roll as a sequence of terms.
  // Each might have a damage flavour so we do them expression by expression
  //@ts-ignore CONFIG.DND5E
  const validTypes = Object.entries(CONFIG.DND5E.damageTypes).deepFlatten().concat(Object.entries(CONFIG.DND5E.healingTypes).deepFlatten())

  evalString = "";
  let damageType: string | undefined = "";
  let numberTermFound = false; // We won't evaluate until at least 1 numeric term is found
  while (partPos < rollTerms.length) {
    // Accumulate the text for each of the terms until we have enough to eval
    const evalTerm = rollTerms[partPos];
    partPos += 1;
    if (evalTerm instanceof DiceTerm) {
      // this is a dice roll
      evalString += evalTerm.total;
      damageType = evalTerm.options.flavor;
      numberTermFound = true;
    } else if (evalTerm instanceof Die) { // special case for better rolls that does not return a proper roll
      damageType = evalTerm.options.flavor;
      numberTermFound = true;
      evalString +=  evalTerm.total;
    } else if (evalTerm instanceof NumericTerm) {
      evalString += evalTerm.total;
      damageType = evalTerm.options.flavor || damageType; // record this if we get it
      numberTermFound = true;
    } if (evalTerm instanceof OperatorTerm) {
      if (["*", "/"].includes(evalTerm.operator)) {
        // multiply or divide keep going
        evalString += evalTerm.total
      } else if (["-", "+"].includes(evalTerm.operator)) {
        if (numberTermFound) { // we have a number and a +/- so we can eval the term (do it straight away so we get the right damage type)
          let result = Roll.safeEval(evalString);
          damageParts[damageType || defaultType] = (damageParts[damageType || defaultType] || 0) + result;
          // reset for the next term - we don't know how many there will be
          evalString = "";
          damageType = "";
          numberTermFound = false;
          evalString = evalTerm.operator;
        } else { // what to do with parenthetical term or others?
          evalString += evalTerm.total;
        }
      }
    }
  }
  // evalString contains the terms we have not yet evaluated so do them now
  if (evalString) {
    const damage = Roll.safeEval(evalString);
    // we can always add since the +/- will be recorded in the evalString
    damageParts[damageType || defaultType] = (damageParts[damageType || defaultType] || 0) + damage;
  }
  const damageList = Object.entries(damageParts).map(([type, damage]) => { return { damage, type } })
  debug("CreateDamageList: Final damage list is ", damageList)
  return damageList;
}

export function getSelfTarget(actor): Token | undefined {
  if (actor.token) return actor.token;
  const speaker = ChatMessage.getSpeaker({ actor })
  if (speaker.token) return getCanvas().tokens?.get(speaker.token);
  //@ts-ignore this is a token document not a token ??
  return new CONFIG.Token.documentClass(actor.getTokenData(), { actor });
}

export function getSelfTargetSet(actor): Set<Token> {
  const selfTarget = getSelfTarget(actor);
  if (selfTarget) return new Set([selfTarget]);
  return new Set();
}

// Calculate the hp/tempHP lost for an amount of damage of type
export function calculateDamage(a: Actor, appliedDamage, t: Token, totalDamage, dmgType, existingDamage) {
  debug("calculate damage ", a, appliedDamage, t, totalDamage, dmgType)
  let prevDamage = existingDamage?.find(ed => ed.tokenId === t.id);
  //@ts-ignore attributes
  var hp = a.data.data.attributes.hp;
  var oldHP, tmp;
  if (prevDamage) {
    oldHP = prevDamage.newHP;
    tmp = prevDamage.newTempHP;
  } else {
    oldHP = hp.value;
    tmp = parseInt(hp.temp) || 0;
  }
  let value = Math.floor(appliedDamage);
  if (dmgType.includes("temphp")) { // only relavent for healing of tmp HP
    var newTemp = Math.max(tmp, -value, 0);
    var newHP: number = oldHP;
  } else {
    var dt = value > 0 ? Math.min(tmp, value) : 0;
    var newTemp = tmp - dt;
    var newHP: number = Math.clamped(oldHP - (value - dt), 0, hp.max + (parseInt(hp.tempmax) || 0));
  }
  //TODO review this awfulness
  // Stumble around trying to find the actual token that corresponds to the multi level token TODO make this sane
  const altSceneId = getProperty(t.data.flags, "multilevel-tokens.sscene");
  let sceneId = altSceneId ?? t.scene?.id;
  const altTokenId = getProperty(t.data.flags, "multilevel-tokens.stoken");
  let tokenId = altTokenId ?? t.id;
  const altTokenUuid = (altTokenId && altSceneId) ? `Scene.${altSceneId}.Token.${altTokenId}` : undefined;
  let tokenUuid = altTokenUuid; // TODO this is nasty fix it.
  if (!tokenUuid && t.document) tokenUuid = t.document.uuid;

  debug("calculateDamage: results are ", newTemp, newHP, appliedDamage, totalDamage)
  if (game.user?.isGM)
    log(`${a.name} ${oldHP} takes ${value} reduced from ${totalDamage} Temp HP ${newTemp} HP ${newHP} `);
  // TODO change tokenId, actorId to tokenUuid and actor.uuid
  return {
    tokenId, tokenUuid, actorId: a.id, actorUuid: a.uuid, tempDamage: tmp - newTemp, hpDamage: oldHP - newHP, oldTempHP: tmp, newTempHP: newTemp,
    oldHP: oldHP, newHP: newHP, totalDamage: totalDamage, appliedDamage: value, sceneId
  };
}

/** 
 * Work out the appropriate multiplier for DamageTypeString on actor
 * If configSettings.damageImmunities are not being checked always return 1
 * 
 */

export let getTraitMult = (actor, dmgTypeString, item) => {
  dmgTypeString = dmgTypeString.toLowerCase()
  if (dmgTypeString.includes("healing") || dmgTypeString.includes("temphp")) return -1;
  if (dmgTypeString.includes("midi-none")) return 0;
  let totalMult = 1;
  if (configSettings.damageImmunities !== "none" && dmgTypeString !== "") {
    // if not checking all damage counts as magical
    const magicalDamage = (item?.type !== "weapon"
      || (item?.data.data.attackBonus > 0 && !configSettings.requireMagical)
      || item.data.data.properties["mgc"]);
    for (let { type, mult } of [{ type: "di", mult: 0 }, { type: "dr", mult: 0.5 }, { type: "dv", mult: 2 }]) {
      let trait = actor.data.data.traits[type].value;
      if (!magicalDamage && trait.includes("physical")) trait = trait.concat("bludgeoning", "slashing", "piercing")
      if (item?.type === "spell" && trait.includes("spell")) totalMult = totalMult * mult;
      else if (item?.type === "power" && trait.includes("power")) totalMult = totalMult * mult;
      else if (trait.includes(dmgTypeString)) totalMult = totalMult * mult;
    }
  }
  return totalMult;
  // Check the custom immunities
  return 1;
};

export let applyTokenDamage = (damageDetail, totalDamage, theTargets, item, saves, options: { existingDamage: any[], superSavers: Set<any> } = { existingDamage: [], superSavers: new Set() }): any[] => {
  return applyTokenDamageMany([damageDetail], [totalDamage], theTargets, item, [saves], { existingDamage: options.existingDamage, superSavers: [options.superSavers] });
}

export let applyTokenDamageMany = (damageDetailArr, totalDamageArr, theTargets, item, savesArr, options: { existingDamage: any[][], superSavers: Set<any>[] } = { existingDamage: [], superSavers: [] }): any[] => {
  let damageList: any[] = [];
  let targetNames: string[] = [];
  let appliedDamage;
  let workflow = (Workflow.workflows && Workflow._workflows[item?.uuid]) || {};
  warn("Apply token damage ", damageDetailArr, totalDamageArr, theTargets, item, savesArr, workflow)

  if (!theTargets || theTargets.size === 0) {
    workflow.currentState = WORKFLOWSTATES.ROLLFINISHED;
    // probably called from refresh - don't do anything
    return [];
  }
  const highestOnlyDR = false;
  let totalDamage = totalDamageArr.reduce((a, b) => (a ?? 0) + b)
  let totalAppliedDamage = 0;
  let appliedTempHP = 0;
  for (let t of theTargets) {
    let a = t?.actor;
    if (!a) continue;
    appliedDamage = 0;
    appliedTempHP = 0;
    const magicalDamage = (item?.type !== "weapon" || item?.data.data.attackBonus > 0 || item.data.data.properties["mgc"]);
    let DRTotal = 0;

    for (let i = 0; i < totalDamageArr.length; i++) {
      let damageDetail = damageDetailArr[i];
      let saves = savesArr[i] ?? new Set();
      let superSavers: Set<Token> = options.superSavers[i] ?? new Set();
      var dmgType;

      for (let { damage, type } of damageDetail) {
        //let mult = 1;
        let mult = saves.has(t) ? getSaveMultiplierForItem(item) : 1;
        if (superSavers.has(t) && getSaveMultiplierForItem(item) === 0.5) {
          mult = saves.has(t) ? 0 : 0.5;
        }
        // TODO this should end up getting removed when the prepare data is done.
        if (getProperty(t.actor, "data.flags.midi-qol.uncanny-dodge") && mult >= 0) {
          mult = mult / 2;
        }
        if (!type) type = MQdefaultDamageType;
        mult = mult * getTraitMult(a, type, item);
        let typeDamage = Math.floor(damage * Math.abs(mult)) * Math.sign(mult);
        if (type.toLowerCase() !== "temphp") dmgType = type.toLowerCase();
        //         let DRType = parseInt(getProperty(t.actor.data, `flags.midi-qol.DR.${type}`)) || 0;
        let DRType = (new Roll((getProperty(t.actor.data, `flags.midi-qol.DR.${type}`) || "0"), t.actor.getRollData())).evaluate({ async: false }).total ?? 0;
        if (DRType === 0 && ["bludgeoning", "slashing", "piercing"].includes(type) && !magicalDamage) {
          DRType = Math.max(DRType, (new Roll((getProperty(t.actor.data, `flags.midi-qol.DR.non-magical`) || "0"), t.actor.getRollData())).evaluate({ async: false }).total ?? 0);
          //         DRType = parseInt(getProperty(t.actor.data, `flags.midi-qol.DR.non-magical`)) || 0;
        } 
        if (DRType === 0 && ["bludgeoning", "slashing", "piercing"].includes(type) && getProperty(t.actor.data, `flags.midi-qol.DR.physical`)) {
          DRType = Math.max(DRType, (new Roll((getProperty(t.actor.data, `flags.midi-qol.DR.physical`) || "0"), t.actor.getRollData())).evaluate({ async: false }).total ?? 0);
          //         DRType = parseInt(getProperty(t.actor.data, `flags.midi-qol.DR.non-magical`)) || 0;
        } 
        if (DRType === 0 && !["bludgeoning", "slashing", "piercing"].includes(type) && getProperty(t.actor.data, `flags.midi-qol.DR.non-physical`), t.actor.getRollData()) {
          DRType = Math.max(DRType, (new Roll((getProperty(t.actor.data, `flags.midi-qol.DR.non-physical`) || "0"), t.actor.getRollData())).evaluate({ async: false }).total ?? 0);
        }

        if (type.includes("temphp")) {
          appliedTempHP += typeDamage
        } else {
          appliedDamage += typeDamage
          DRType = Math.clamped(0, typeDamage, DRType || 0);
          if (checkRule("maxDRValue"))
            DRTotal = Math.max(DRTotal, DRType)
          else
            DRTotal += DRType;
        }
        // TODO: consider mwak damage reduCtion
      }
    }
    const DR = Math.clamped(0, appliedDamage, (new Roll((getProperty(t.actor.data, "flags.midi-qol.DR.all") || "0"), a.getRollData())).evaluate({ async: false }).total ?? 0);
    //      const DR = parseInt(getProperty(t.actor.data, "flags.midi-qol.DR.all")) || 0;
    if (checkRule("maxDRValue"))
      DRTotal = Math.max(DRTotal, DR)
    else
      DRTotal = Math.clamped(0, appliedDamage, DR + DRTotal);
    appliedDamage -= DRTotal;

    //@ts-ignore CONFIG.DND5E
    if (!Object.keys(CONFIG.DND5E.healingTypes).includes(dmgType)) {
      totalDamage = Math.max(totalDamage, 0);
      appliedDamage = Math.max(appliedDamage, 0);
    }
    totalAppliedDamage += appliedDamage;
    if (!dmgType) dmgType = "temphp";
    let ditem = calculateDamage(a, appliedDamage, t, totalDamage, dmgType, options.existingDamage);
    ditem.tempDamage = ditem.tempDamage + appliedTempHP;
    if (appliedTempHP <= 0) { // tmphealing applied to actor does not add only gets the max
      ditem.newTempHP = Math.max(ditem.newTempHP, -appliedTempHP);
    } else {
      ditem.newTempHP = Math.max(0, ditem.newTempHP - appliedTempHP)
    }
    damageList.push(ditem);
    targetNames.push(t.name)
  }
  if (theTargets.size > 0) {
    socketlibSocket.executeAsGM("createReverseDamageCard", {
      autoApplyDamage: configSettings.autoApplyDamage,
      sender: game.user?.name,
      damageList: damageList,
      targetNames,
      chatCardId: workflow.itemCardId,
    })
  }
  if (configSettings.keepRollStats) {
    gameStats.addDamage(totalAppliedDamage, totalDamage, theTargets.size, item)
  }
  return damageList;
};

export async function processDamageRoll(workflow: Workflow, defaultDamageType: string) {
  warn("Process Damage Roll ", workflow)
  // proceed if adding chat damage buttons or applying damage for our selves
  let appliedDamage: any[] = [];
  const actor = workflow.actor;
  let item = workflow.item;

  // const re = /.*\((.*)\)/;
  // const defaultDamageType = message.data.flavor && message.data.flavor.match(re);

  // Show damage buttons if enabled, but only for the applicable user and the GM

  let theTargets = workflow.hitTargets;
  if (item?.data.data.target?.type === "self") theTargets = getSelfTargetSet(actor) || theTargets;
  let effectsToExpire: string[] = [];
  if (theTargets.size > 0 && item?.hasAttack) effectsToExpire.push("1Hit");
  if (theTargets.size > 0 && item?.hasDamage) effectsToExpire.push("DamageDealt");
  if (effectsToExpire.length > 0) {
    await expireMyEffects.bind(workflow)(effectsToExpire);
  }

  // Don't check for critical - RAW say these don't get critical damage
  if (["rwak", "mwak"].includes(item?.data.data.actionType) && configSettings.rollOtherDamage) {
    if (workflow.otherDamageRoll && configSettings.singleConcentrationRoll) {
      appliedDamage = applyTokenDamageMany(
        [workflow.damageDetail, workflow.otherDamageDetail, workflow.bonusDamageDetail ?? []],
        [workflow.damageTotal, workflow.otherDamageTotal, workflow.bonusDamageTotal ?? 0],
        theTargets,
        item,
        [new Set(), workflow.saves, new Set()],
        {
          existingDamage: [],
          superSavers: [new Set(), workflow.superSavers, new Set()]
        });

    } else {
      let savesToUse = workflow.otherDamageRoll ? new Set() : workflow.saves;
      appliedDamage = applyTokenDamageMany(
        [workflow.damageDetail, workflow.bonusDamageDetail ?? []],
        [workflow.damageTotal, workflow.bonusDamageTotal ?? 0],
        theTargets,
        item,
        [savesToUse, savesToUse],
        {
          existingDamage: [],
          superSavers: [workflow.superSavers, workflow.superSavers]
        });

      //      appliedDamage = await applyTokenDamage(workflow.damageDetail, workflow.damageTotal, theTargets, item, new Set(), {existingDamage: [], superSavers: new Set()});
      if (workflow.otherDamageRoll) {
        // assume pervious damage applied and then calc extra damage
        appliedDamage = applyTokenDamage(
          workflow.otherDamageDetail, 
          workflow.otherDamageTotal, 
          theTargets, 
          item, 
          workflow.saves, 
          { existingDamage: appliedDamage, superSavers: workflow.superSavers }
        );
      }
    }
  } else {
    appliedDamage = applyTokenDamageMany(
      [workflow.damageDetail, workflow.bonusDamageDetail ?? []],
      [workflow.damageTotal, workflow.bonusDamageTotal ?? 0],
      theTargets,
      item,
      [workflow.saves, workflow.saves],
      {
        existingDamage: [],
        superSavers: [workflow.superSavers, workflow.superSavers]
      });
  }
  workflow.damageList = appliedDamage;
  debug("process damage roll: ", configSettings.autoApplyDamage, workflow.damageDetail, workflow.damageTotal, theTargets, item, workflow.saves)
}

export let getSaveMultiplierForItem = (item: Item) => {
  // find a better way for this ? perhaps item property
  if (!item) return 1;
  const itemData: any = item.data;
  const itemProperties: any = itemData.data.properties;
  if (itemProperties?.nodam) return 0;
  if (itemProperties?.fulldam) return 1;
  if (itemProperties?.halfdam) return 0.5;
  if (noDamageSaves.includes(cleanSpellName(itemData.name))) return 0;
  let description = TextEditor.decodeHTML((itemData.data.description?.value || "")).toLocaleLowerCase();
  if (description?.includes(i18n("midi-qol.noDamageText").toLocaleLowerCase())) {
    return 0.0;
  }

  if (!configSettings.checkSaveText) return configSettings.defaultSaveMult;
  if (description?.includes(i18n("midi-qol.halfDamage").toLocaleLowerCase()) || description?.includes(i18n("midi-qol.halfDamageAlt").toLocaleLowerCase())) {
    return 0.5;
  }
  //  Think about this. if (checkSavesText true && item.hasSave) return 0; // A save is specified but the half-damage is not specified.
  return configSettings.defaultSaveMult;
};

export function requestPCSave(ability, rollType, player, actor, advantage, flavor, dc, requestId, GMprompt) {
  const useUuid = false;
  const actorId = useUuid ? actor.uuid : actor.id;
  const playerLetme = !player?.isGM && ["letme", "letmeQuery"].includes(configSettings.playerRollSaves);
  const gmLetme = player.isGM && ["letme", "letmeQuery"].includes(GMprompt);
  if (player && installedModules.get("lmrtfy") && (playerLetme || gmLetme)) {
    if ((configSettings.playerRollSaves === "letmeQuery")) {
      // TODO - reinstated the LMRTFY patch so that the event is properly passed to the roll
      advantage = 2;
    } else {
      advantage = (advantage === true ? 1 : advantage === false ? -1: 0);
    }
    let mode = "roll";
    if (player.isGM && configSettings.autoCheckSaves !== "allShow") {
      mode = "blindroll";
    }
    let message = `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.saving-throw")} ${flavor}`;
    if (rollType === "abil")
      message = `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.ability-check")} ${flavor}`;
    // Send a message for LMRTFY to do a save.
    const socketData = {
      user: player.id,
      actors: [actorId],
      abilities: rollType === "abil" ? [ability] : [],
      saves: rollType !== "abil" ? [ability] : [],
      skills: [],
      advantage: player.isGM ? 2 : advantage,
      mode,
      title: i18n("midi-qol.saving-throw"),
      message: `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.saving-throw")} ${flavor}`,
      formula: "",
      attach: requestId,
      deathsave: false,
      initiative: false
    }
    debug("process player save ", socketData)
    game.socket?.emit('module.lmrtfy', socketData);
    //@ts-ignore - global variable
    LMRTFY.onMessage(socketData);
  } else { // display a chat message to the user telling them to save
    let actorName = actor.name;
    //@ts-ignore CONFIG.DND5E
    let content = ` ${actorName} ${configSettings.displaySaveDC ? "DC " + dc : ""} ${CONFIG.DND5E.abilities[ability]} ${i18n("midi-qol.saving-throw")}`;
    content = content + (advantage ? ` (${i18n("DND5E.Advantage")})` : "") + ` - ${flavor}`;
    ChatMessage.create({
      content,
      whisper: [player]
    });
  }
}

export function midiCustomEffect(actor, change) {
  if (!change.key.startsWith("flags.midi-qol")) return;
  //@ts-ignore
  const val = Number.isNumeric(change.value) ? parseInt(change.value) : 1;
  setProperty(actor.data, change.key, change.value)
}

export function untargetDeadTokens() {
  if (autoRemoveTargets !== "none") {
    game.user?.targets.forEach((t: Token) => {
      const actorData: any = t.actor?.data;
      if (actorData?.data.attributes.hp.value <= 0) {
        t.setTarget(false, { releaseOthers: false });
      }
    });
  }
}

export function untargetAllTokens(...args) {
  let combat: Combat = args[0];
  //@ts-ignore - combat.current protected - TODO come back to this
  let prevTurn = combat.current.turn - 1;
  if (prevTurn === -1)
    prevTurn = combat.turns.length - 1;

  const previous = combat.turns[prevTurn];
  if ((game.user?.isGM && ["allGM", "all"].includes(autoRemoveTargets)) || (autoRemoveTargets === "all" && getCanvas().tokens?.controlled.find(t => t.id === previous.token?.id))) {
    // release current targets
    game.user?.targets.forEach((t: Token) => {
      t.setTarget(false, { releaseOthers: false });
    });
  }
}

export function checkIncapcitated(actor: Actor, item: Item, event) {
  const actorData: any = actor.data;
  if (actorData?.data.attributes?.hp?.value <= 0) {
    console.log(`minor-qol | ${actor.name} is incapacitated`)
    ui.notifications?.warn(`${actor.name} is incapacitated`)
    return true;
  }
  return false;
}

export function getDistanceSimple(t1: Token, t2: Token, includeCover, wallBlocking = false) {
  return getDistance(t1, t2, includeCover, wallBlocking).distance;
}
/** takes two tokens of any size and calculates the distance between them
*** gets the shortest distance betwen two tokens taking into account both tokens size
*** if wallblocking is set then wall are checked
**/
//TODO change this to TokenData
export function getDistance(t1: Token, t2: Token, includeCover, wallblocking = false): {distance: number, acBonus: number | undefined} {
  const canvas = getCanvas();
  let coverACBonus = 0;
  let tokenTileACBonus = 0;
  const noResult = {distance: -1, acBonus: undefined}
  let coverData;
  if (!canvas.grid || !canvas.dimensions) noResult;
  if (!t1 || !t2) return noResult
  if (!canvas || !canvas.grid || !canvas.dimensions) return noResult;
  //@ts-ignore
  if (window.CoverCalculator && includeCover && ["dnd5eHelpers", "dnd5eHelpersAC"].includes(configSettings.optionalRules.wallsBlockRange)) {
    //@ts-ignore TODO this is being called in the wrong spot (should not do the loops if using this)
    coverData = CoverCalculator.Cover(t1, t2);
    if (coverData?.data.results.cover === 3) return noResult;
  }

  const t1StartX = t1.data.width >= 1 ? 0.5 : t1.data.width / 2;
	const t1StartY = t1.data.height >= 1 ? 0.5 : t1.data.height / 2;
  const t2StartX = t2.data.width >= 1 ? 0.5 : t2.data.width / 2;
	const t2StartY = t2.data.height >= 1 ? 0.5 : t2.data.height / 2;
  var x, x1, y, y1, d, r, segments: { ray: Ray }[] = [], rdistance, distance;
  for (x = t1StartX; x < t1.data.width; x++) {
    for (y = t1StartY; y < t1.data.height; y++) {
      const origin = new PIXI.Point(...canvas.grid.getCenter(Math.round(t1.data.x + (canvas.dimensions.size * x)), Math.round(t1.data.y + (canvas.dimensions.size * y))));
      for (x1 = t2StartX; x1 < t2.data.width; x1++) {
        for (y1 = t2StartY; y1 < t2.data.height; y1++) {
          const dest = new PIXI.Point(...canvas.grid.getCenter(Math.round(t2.data.x + (canvas.dimensions.size * x1)), Math.round(t2.data.y + (canvas.dimensions.size * y1))));
          const r = new Ray(origin, dest)
          if (wallblocking && configSettings.optionalRules.wallsBlockRange === "centerLevels" && installedModules.get("levels")) { 
            let p1 = {
              x: origin.x,
              y: origin.y,
              //@ts-ignore
              z: _levels.getTokenLOSheight(t1)
            }
            let p2 = {
              x: dest.x,
              y: dest.y,
              //@ts-ignore
              z: _levels.getTokenLOSheight(t2)
            }
            //@ts-ignore
            if (_levels.testCollision(p1, p2, "sight")) continue;
          } else if (wallblocking) {
            // TODO use four point rule and work out cover
            switch (configSettings.optionalRules.wallsBlockRange) {
              case "center":
              case "centerLevels":
                  if (canvas.walls?.checkCollision(r)) continue; 
                  break;
              case "dnd5eHelpers":
              case "dnd5eHelpersAC":
                if (!includeCover) {
                  if (canvas.walls?.checkCollision(r)) continue; 
                }
                //@ts-ignore 
                else if (installedModules.get("dnd5e-helpers") && window.CoverCalculator) {
                  //@ts-ignore TODO this is being called in the wrong spot (should not do the loops if using this)
                  if (coverData.data.results.cover === 3) continue;
                  if (configSettings.optionalRules.wallsBlockRange === "dnd5eHelpersAC") coverACBonus = -coverData.data.results.value;
                } else {
                  pointWarn();
                  // ui.notifications?.warn("dnd5e helpers LOS check selected but dnd5e-helpers not installed")
                  if (canvas.walls?.checkCollision(r)) continue;
                }
                break;
              case "none":
              default:
            }
          }
          segments.push({ ray: r });
        }
      }
    }
  }
  // console.log(segments);
  if (segments.length === 0) {
    return noResult;
  }
  //@ts-ignore
  rdistance = segments.map(ray => getCanvas()?.grid.measureDistances([ray], {gridSpaces: true})[0]);
  distance = rdistance[0];
  rdistance.forEach(d => { if (d < distance) distance = d; });
  if (configSettings.optionalRules.distanceIncludesHeight) {
    let height = Math.abs((t1.data.elevation || 0) - (t2.data.elevation || 0))
    //@ts-ignore diagonalRule from DND5E
    const rule = getCanvas().grid?.diagonalRule
    if (["555", "5105"].includes(rule)) {
      let nd = Math.min(distance, height);
      let ns = Math.abs(distance - height);
      distance = nd + ns;
      let dimension = canvas?.dimensions?.distance ?? 5;
      if (rule === "5105") distance = distance + Math.floor(nd / 2 / dimension) * dimension;

    } else distance = Math.sqrt(height * height + distance * distance);
  }
  return {distance, acBonus: coverACBonus + tokenTileACBonus}; // TODO update this with ac bonus
};

let pointWarn = debounce(() => {
  ui.notifications?.warn("4 Point LOS check selected but dnd5e-helpers not installed")
}, 100)

export function checkRange(actor, item, tokenId, targets) {
  let itemData = item.data.data;

  // check that a range is specified at all
  if (!itemData.range) return;
  if (!itemData.range.value && !itemData.range.long && itemData.range.units !== "touch") return "normal";
  if (itemData.target?.type === "self") return "normal";
  // skip non mwak/rwak/rsak/msak types that do not specify a target type
  if (!allAttackTypes.includes(itemData.actionType) && !["creature", "ally", "enemy"].includes(itemData.target?.type)) return "normal";

  let token: Token | undefined = getCanvas().tokens?.get(tokenId);
  if (!token) {
    warn(`${game.user?.name} no token selected cannot check range`)
    ui.notifications?.warn(`${game.user?.name} no token selected`)
    return "fail";
  }

  let range = itemData.range?.value || 0;
  let longRange = itemData.range?.long || 0;
  if (itemData.range.units === "touch") {
    range = canvas?.dimensions?.distance ?? 5;
    longRange = 0;
  }
  if (["mwak", "msak", "mpak"].includes(itemData.actionType) && !itemData.properties?.thr) longRange = 0;
  for (let target of targets) {
    if (target === token) continue;
    // check the range
    if (target.actor) setProperty(target.actor.data, "flags.midi-qol.acBonus", 0);
    const distanceDetails = getDistance(token, target, true, true);
    let distance = distanceDetails.distance;
    if (target.actor && distanceDetails.acBonus)
      setProperty(target.actor.data, "flags.midi-qol.acBonus", distanceDetails.acBonus);
    if ((longRange !== 0 && distance > longRange) || (distance > range && longRange === 0)) {
      console.log(`minor-qol | ${target.name} is too far ${distance} from your character you cannot hit`)
      ui.notifications?.warn(`${actor.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`)
      return "fail";
    }
    if (distance > range) return "dis";
    if (distance < 0) {
      console.log(`minor-qol | ${target.name} is blocked by a wall`)
      ui.notifications?.warn(`${actor.name}'s target is blocked by a wall`)
      return "fail";
    }
  }
  return "normal";
}

export function testKey(keyString, event: typeof baseEvent | undefined | null): boolean {
  if (!event) return false;
  switch (keyString) {
    case "altKey":
      return event?.altKey;
    case "shiftKey":
      return event?.shiftKey;
    case "ctrlKey":
      return event?.ctrlKey || event?.metaKey;
    default:
      error("Impossible key mapping for speed roll");
      return false;
  }
}

export function isAutoFastAttack(workFlow: Workflow | undefined = undefined): boolean {
  if (workFlow && workFlow.workflowType === "DummyWorkflow") return workFlow.rollOptions.fastForward;
  return game.user?.isGM ? configSettings.gmAutoFastForwardAttack : ["all", "attack"].includes(configSettings.autoFastForward);
}

export function isAutoFastDamage(workFlow: Workflow | undefined = undefined): boolean {
  if (workFlow && workFlow.workflowType === "DummyWorkflow") return workFlow.rollOptions.fastForward;;
  return game.user?.isGM ? configSettings.gmAutoFastForwardDamage : ["all", "damage"].includes(configSettings.autoFastForward)
}

export function getAutoRollDamage(): string {
  return game.user?.isGM ? configSettings.gmAutoDamage : configSettings.autoRollDamage;
}

export function getAutoRollAttack(): boolean {
  return game.user?.isGM ? configSettings.gmAutoAttack : configSettings.autoRollAttack;
}

export function itemHasDamage(item) {
  return item?.data.data.actionType !== "" && item?.hasDamage;
}

export function itemIsVersatile(item) {
  return item?.data.data.actionType !== "" && item?.isVersatile;
}

export function getRemoveAttackButtons() {
  return game.user?.isGM ?
    ["all", "attack"].includes(configSettings.gmRemoveButtons) :
    ["all", "attack"].includes(configSettings.removeButtons);
}
export function getRemoveDamageButtons() {
  return game.user?.isGM ?
    ["all", "damage"].includes(configSettings.gmRemoveButtons) :
    ["all", "damage"].includes(configSettings.removeButtons);
}

export function getReactionSetting(player: User | undefined): string {
  if (!player) return "none";
  return player.isGM ? configSettings.gmDoReactions : configSettings.doReactions;
}

export function getTokenPlayerName(token: Token) {
  if (!token) return game.user?.name;
  if (!installedModules.get("combat-utility-belt")) return token.name;
  if (!game.settings.get("combat-utility-belt", "enableHideNPCNames")) return token.name;
  if (getProperty(token.actor?.data.flags ?? {}, "combat-utility-belt.enableHideName"))
    return getProperty(token.actor?.data.flags ?? {}, "combat-utility-belt.hideNameReplacement")
  if (token.actor?.hasPlayerOwner) return token.name;
  switch (token.data.disposition) {
    case -1:
      if (game.settings.get("combat-utility-belt", "enableHideHostileNames"))
        return game.settings.get("combat-utility-belt", "hostileNameReplacement")
      break;
    case 0:
      if (game.settings.get("combat-utility-belt", "enableHideNeutralNames"))
        return game.settings.get("combat-utility-belt", "neutralNameReplacement")
    case 1:
      if (game.settings.get("combat-utility-belt", "enableHideFriendlyNames"))
        return game.settings.get("combat-utility-belt", "friendlyNameReplacement")
    default:
  }
  return token.name;
}

export function getSpeaker(actor) {
  const speaker = ChatMessage.getSpeaker({ actor });
  if (!configSettings.useTokenNames) return speaker;
  let token = actor.token;
  if (!token) token = actor.getActiveTokens()[0];
  if (token) speaker.alias = token.name;
  return speaker
}

// Add the concentration marker to the character and update the duration if possible
export async function addConcentration(options: { workflow: Workflow }) {
  if (!configSettings.concentrationAutomation) return;
  const item = options.workflow.item;
  // await item.actor.unsetFlag("midi-qol", "concentration-data");
  let selfTarget = item.actor.token ? item.actor.token.object : getSelfTarget(item.actor);
  if (!selfTarget) return;
  let statusEffect;
  if (installedModules.get("dfreds-convenient-effects")) {
    statusEffect = CONFIG.statusEffects.find(se => se.id === "Convenient Effect: Concentrating");
  }
  if (!statusEffect && installedModules.get("combat-utility-belt")) {
    statusEffect = CONFIG.statusEffects.find(se => se.id === "combat-utility-belt.concentration");
  }
  if (statusEffect) { // found a cub or convenient status effect.
    const itemDuration = item.data.data.duration;
    statusEffect = duplicate(statusEffect);
    // set the token as concentrating
    // Update the duration of the concentration effect - TODO remove it CUB supports a duration
    if (installedModules.get("dae")) {
      const inCombat = (game.combat?.turns.some(combatant => combatant.token?.id === selfTarget.id));
      const convertedDuration = globalThis.DAE.convertDuration(itemDuration, inCombat);
      if (convertedDuration?.type === "seconds") {
        statusEffect.duration = { seconds: convertedDuration.seconds, startTime: game.time.worldTime }
      } else if (convertedDuration?.type === "turns") {
        statusEffect.duration = {
          rounds: convertedDuration.rounds,
          turns: convertedDuration.turns,
          startRound: game.combat?.round,
          startTurn: game.combat?.turn
        }
      }
    }
    statusEffect.origin = item?.uuid
    statusEffect.img = "modules/combat-utility-belt/icons/concentrating.svg"
    setProperty(statusEffect.flags, "midi-qol.isConcentration", statusEffect.origin);

    const existing = selfTarget.actor?.effects.find(e => e.getFlag("core", "statusId") === statusEffect.id);
    if (!existing) {
      setTimeout(
        () => {
          selfTarget.toggleEffect(statusEffect, { active: true })
      }, 100);
      // return await selfTarget.toggleEffect(statusEffect, { active: true })
    }
    return true;
  } else {
    let actor = options.workflow.actor;
    let concentrationName = i18n("midi-qol.Concentrating");
    const inCombat = (game.combat?.turns.some(combatant => combatant.token?.id === selfTarget.id));
    //const itemData = duplicate(itemJSONData);
    // const currentItem: Item = new CONFIG.Item.documentClass(itemData)
    const effectData = {
      changes: [],
      origin: item.uuid, //flag the effect as associated to the spell being cast
      disabled: false,
      icon: itemJSONData.img,
      label: concentrationName,
      duration: {},
      flags: { "midi-qol": { isConcentration: item?.uuid } }
    }
    if (installedModules.get("dae")) {
      const convertedDuration = globalThis.DAE.convertDuration(item.data.data.duration, inCombat);
      if (convertedDuration?.type === "seconds") {
        effectData.duration = { seconds: convertedDuration.seconds, startTime: game.time.worldTime }
      } else if (convertedDuration?.type === "turns") {
        effectData.duration = {
          rounds: convertedDuration.rounds,
          turns: convertedDuration.turns,
          startRound: game.combat?.round,
          startTurn: game.combat?.turn
        }
      }
    }
    setTimeout(
      () => {
        actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    }, 100);
    return true;
    // return await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  }
}

//  the second setting the flag for the macro to be called when damaging an opponent

/** 
 * Find tokens nearby
 * @param {number|null} disposition. same(1), opposite(-1), neutral(0), ignore(null) token disposition
 * @param {Token} token The token to search around
 * @param {number} distance in game units to consider near
 */

export function findNearby(disposition: number | null, token: Token | undefined, distance: number, maxSize: number | undefined = undefined) {
  if (!token) return [];
  let targetDisposition = token.data.disposition * (disposition ?? 0);
  let nearby = getCanvas().tokens?.placeables.filter(t => {
    if (maxSize && t.data.height * t.data.width > maxSize) return false;
    if (t.actor &&
      t.id !== token.id && // not the token
      //@ts-ignore attributes
      t.actor.data.data.attributes?.hp?.value > 0 && // not incapacitated
      (disposition === null || t.data.disposition === targetDisposition)) {
      const tokenDistance = getDistance(t, token, false, true).distance;
      return 0 < tokenDistance && tokenDistance <= distance
    } else return false;
  });
  return nearby ?? [];
}

export function checkNearby(disposition: number | null, token: Token | undefined, distance: number): boolean {
  return findNearby(disposition, token, distance).length !== 0;;
}

export function hasCondition(token, condition: string) {
  if (!token) return false;
  const localCondition = i18n(`midi-qol.${condition}`);
  if (installedModules.get("conditional-visibility") && getProperty((token.actor.data.flags), `conditional-visibility.${condition}`)) return true;
  //@ts-ignore game.cub
  if (installedModules.get("combat-utility-belt") && game.cub.getCondition(localCondition)) {
    //@ts-ignore game.cub
    return game.cub.hasCondition(localCondition, [token], { warn: false });
  }
  return false;
}

export async function removeHiddenInvis() {
  const token: Token | undefined = getCanvas().tokens?.get(this.tokenId);
  await removeTokenCondition(token, "hidden");
  await removeTokenCondition(token, "invisible");
  log(`Hidden/Invisibility removed for ${this.actor.name} due to attack`)
}

export async function removeCondition(condition: string) {
  const token: Token | undefined = getCanvas().tokens?.get(this.tokenId);
  removeTokenCondition(token, condition);
}

export async function removeTokenCondition(token, condition: string) {
  if (!token) return;
  //@ts-ignore
  const CV = window.ConditionalVisibility;
  const localCondition = i18n(`midi-qol.${condition}`);
  if (condition === "hidden") {
    CV?.unHide([token]);
  } else CV?.setCondition([token], condition, false);
  if (installedModules.get("combat-utility-belt")) {// && game.cub.getCondition(localCondition)) {
    //@ts-ignore game.cub
    game.cub.removeCondition(localCondition, token, { warn: false });
  }
}

// this = {actor, item, myExpiredEffects}
export async function expireMyEffects(effectsToExpire: string[]) {
  const expireHit = effectsToExpire.includes("1Hit") && !this.effectsAlreadyExpired.includes("1Hit");
  const expireAction = effectsToExpire.includes("1Action") && !this.effectsAlreadyExpired.includes("1Action");
  const expireSpell = effectsToExpire.includes("1Spell") && !this.effectsAlreadyExpired.includes("1Spell");
  const expireAttack = effectsToExpire.includes("1Attack") && !this.effectsAlreadyExpired.includes("1Attack");
  const expireDamage = effectsToExpire.includes("DamageDealt") && !this.effectsAlreadyExpired.includes("DamageDealt");
  const expireInitiative = effectsToExpire.includes("Initiative") && !this.effectsAlreadyExpired.includes("Initiative");

  // expire any effects on the actor that require it
  if (debugEnabled && false) {
    const test = this.actor.effects.map(ef => {
      const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
      return [(expireAction && specialDuration?.includes("1Action")),
      (expireAttack && specialDuration?.includes("1Attack") && this.item?.hasAttack),
      (expireHit && this.item?.hasAttack && specialDuration?.includes("1Hit") && this.hitTargets.size > 0)]
    })
    debug("expiry map is ", test)
  }
  const myExpiredEffects = this.actor.effects.filter(ef => {
    const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
    if (!specialDuration || !specialDuration?.length) return false;
    return (expireAction && specialDuration.includes("1Action")) ||
      (expireAttack && this.item?.hasAttack && specialDuration.includes("1Attack")) ||
      (expireSpell && this.item?.type === "spell" &&  specialDuration.includes("1Spell")) ||
      (expireAttack && this.item?.hasAttack && specialDuration.includes(`1Attack:${this.item.data.data.actionType}`)) ||
      (expireHit && this.item?.hasAttack && specialDuration.includes("1Hit") && this.hitTargets.size > 0) ||
      (expireHit && this.item?.hasAttack && specialDuration.includes(`1Hit:${this.item.data.data.actionType}`) && this.hitTargets.size > 0) ||
      (expireDamage && this.item?.hasDamage && specialDuration.includes("DamageDealt")) ||
      (expireInitiative && specialDuration.includes("Initiative"))
  }).map(ef => ef.id);
  debug("expire my effects", myExpiredEffects, expireAction, expireAttack, expireHit);
  this.effectsAlreadyExpired = this.effectsAlreadyExpired.concat(effectsToExpire);
  if (myExpiredEffects?.length > 0) await this.actor?.deleteEmbeddedDocuments("ActiveEffect", myExpiredEffects);
}

// this = actor
export function expireRollEffect(rollType: string, abilityId: string) {
  const expiredEffects = this.effects?.filter(ef => {
    const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
    if (!specialDuration) return false;
    if (specialDuration.includes(`is${rollType}`)) return true;
    if (specialDuration.includes(`is${rollType}.${abilityId}`)) return true;
    return false;
  }).map(ef => ef.id);
  if (expiredEffects?.length > 0) {
    socketlibSocket.executeAsGM("removeEffects", {
      actorUuid: this.uuid,
      effects: expiredEffects,
    })
  }
}

// TODO revisit the whole synth token piece.
export async function validTargetTokens(tokenSet: UserTargets | Set<Token> | undefined): Promise<Set<Token>> {
  if (!tokenSet) return new Set();
  const multiLevelTokens = [...tokenSet].filter(t => getProperty(t.data, "flags.multilevel-tokens"));
  //@ts-ignore t.data.flags
  const nonLocalTokens = multiLevelTokens.filter(t => !getCanvas().tokens?.get(t.data.flags["multilevel-tokens"].stoken))
  let normalTokens = [...tokenSet].filter(a => a.actor);
  // return new Set(normalTokens);
  let tokenData;
  let synthTokens = nonLocalTokens.map(t => {
    const mlFlags: any = t.data.flags["multilevel-tokens"];
    const token = MQfromUuid(`Scene.${mlFlags.sscene}.Token.${mlFlags.stoken}`);
    return token;
  });
  // const testToken = await Token.create(tokenData, {temporary: true});

  // const synthTokens = await Promise.all(synthTokenPromises);
  return new Set(normalTokens.concat(synthTokens));
}

export function MQfromUuid(uuid) {
  let parts = uuid.split(".");
  let doc;

  const [docName, docId] = parts.slice(0, 2);
  parts = parts.slice(2);
  const collection = CONFIG[docName].collection.instance;
  doc = collection.get(docId);

  // Embedded Documents
  while (doc && parts.length > 1) {
    const [embeddedName, embeddedId] = parts.slice(0, 2);
    doc = doc.getEmbeddedDocument(embeddedName, embeddedId);
    parts = parts.slice(2);
  }
  return doc || null;
}

export function MQfromActorUuid(uuid) {
  let doc = MQfromUuid(uuid);
  if (doc instanceof CONFIG.Token.documentClass) doc = doc.actor;
  return doc || null;
}


class RollModifyDialog extends Application {
  data: {
    actor: Actor5e,
    flags: string[],
    flagSelector: string,
    targetObject: any,
    rollId: string,
    rollTotalId: string,
    rollHTMLId: string,
    title: string,
    content: HTMLElement | JQuery<HTMLElement>,
    currentRoll: Roll,
    rollHTML: string,
    callback: () => {},
    close: () => {},
    buttons: any
  }

  constructor(data, options) {
    super(options);
    this.data = data;
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      template: "templates/hud/dialog.html",
      classes: ["dialog"],
      width: 400,
      jQuery: true
    });
  }
  get title() {
    return this.data.title || "Dialog";
  }

  async getData(options) {
    this.data.flags = this.data.flags.filter(flagName => {
      if (getOptionalCountRemaining(this.data.actor, `${flagName}.count`) < 1) return false;
      return getProperty(this.data.actor.data, flagName)
    });
    if (this.data.flags.length === 0) this.close();
    this.data.buttons = this.data.flags.reduce((obj, flag) => {
      const flagData = getProperty(this.data.actor.data, flag);
      obj[randomID()] = {
        icon: '<i class="fas fa-dice-d20"></i>',
        label: (flagData.label ?? "Bonus") + `  (${flagData[this.data.flagSelector] ?? "0"})`,
        value: flagData[this.data.flagSelector] ?? "0",
        key: flag,
        callback: this.data.callback
      }
      return obj;
    }, {})
    this.data.content = $(await this.data.currentRoll.render());
    return {
      content: this.data.rollHTML,
      buttons: this.data.buttons
    }
  }

  activateListeners(html) {
    html.find(".dialog-button").click(this._onClickButton.bind(this));
    $(document).on('keydown.chooseDefault', this._onKeyDown.bind(this));
    // if ( this.data.render instanceof Function ) this.data.render(this.options.jQuery ? html : html[0]);
  }

  _onClickButton(event) {
    const id = event.currentTarget.dataset.button;
    const button = this.data.buttons[id];
    this.submit(button);
  }

  _onKeyDown(event) {
    // Close dialog
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (this.data.close) this.data.close();
      this.close();
    }
  }

  async submit(button) {
    try {
      if (button.callback) {
        await button.callback(this, button);
        await this.getData({});
        this.render(true);
      }
      // this.close();
    } catch (err) {
      ui.notifications?.error(err);
      throw new Error(err);
    }
  }

  async close() {
    if (this.data.close) this.data.close();
    $(document).off('keydown.chooseDefault');
    return super.close();
  }
}

export async function processAttackRollBonusFlags() { // bound to workflow
  // const bonusFlags = ["flags.midi-qol.bardicInspiration"];
  const bonusFlags = Object.keys(this.actor.data.flags["midi-qol"]?.optional ?? [])
    .filter(flag => {
      if (!this.actor.data.flags["midi-qol"].optional[flag].attack) return false;
      if (!this.actor.data.flags["midi-qol"].optional[flag].count) return true;
      return getOptionalCountRemainingShortFlag(this.actor, flag) > 0;
    })
    .map(flag => `flags.midi-qol.optional.${flag}`);
  if (bonusFlags.length > 0) {
    this.attackRollHTML = await this.attackRoll.render();
    await bonusDialog.bind(this)(bonusFlags, "attack", false, `${this.actor.name} - ${i18n("DND5E.Attack")} ${i18n("DND5E.Roll")}`, "attackRoll", "attackTotal", "attackRollHTML")
  }
  return this.attackRoll;
}

export async function processDamageRollBonusFlags() { // bound to a workflow
  const bonusFlags = Object.keys(this.actor.data.flags["midi-qol"]?.optional ?? [])
    .filter(flag => {
      if (!this.actor.data.flags["midi-qol"].optional[flag].damage) return false;
      if (!this.actor.data.flags["midi-qol"].optional[flag].count) return true;
      return getOptionalCountRemainingShortFlag(this.actor, flag) > 0;
    })
    .map(flag => `flags.midi-qol.optional.${flag}`);
  if (bonusFlags.length > 0) {
    this.damageRollHTML = await this.damageRoll.render();
    await bonusDialog.bind(this)(bonusFlags, "damage", false, `${this.actor.name} - ${i18n("DND5E.Damage")} ${i18n("DND5E.Roll")}`, "damageRoll", "damageTotal", "damageRollHTML")
  }
  return this.damageRoll;
}

export async function bonusDialog(bonusFlags, flagSelector, showRoll, title, rollId: string, rollTotalId: string, rollHTMLId: string) {
  return new Promise((resolve, reject) => {
    const callback = async (dialog, button) => {
      if (!hasEffectGranting(this.actor, button.key, flagSelector)) return;
      var newRoll;
      if (button.value === "reroll") {
        newRoll = await this[rollId].reroll({ async: true });
      } else if (button.value === "success") {
        newRoll = await new Roll("99").evaluate({ async: true })
      } else {
        newRoll = new Roll(`${this[rollId].result} + ${button.value}`, this.actor.getRollData());
        await newRoll.evaluate({ async: true })
      }
      this[rollId] = newRoll;
      this[rollTotalId] = newRoll.total;
      this[rollHTMLId] = await newRoll.render();
      dialog.data.rollHTML = this[rollHTMLId];
      await removeEffectGranting(this.actor, button.key);
      this.actor.prepareData();
    }

    const dialog = new RollModifyDialog(
      {
        actor: this.actor,
        flags: bonusFlags,
        flagSelector,
        targetObject: this,
        rollId,
        rollTotalId,
        rollHTMLId,
        title,
        content: this[rollHTMLId],
        currentRoll: this[rollId],
        rollHTML: this[rollHTMLId],
        callback,
        close: resolve
      }, {
      width: 400
    }).render(true);
  });
}

export function getOptionalCountRemainingShortFlag(actor: Actor5e, flag: string) {
  return getOptionalCountRemaining(actor, `flags.midi-qol.optional.${flag}.count`)
}
export function getOptionalCountRemaining(actor: Actor5e, flag: string) {
  const countValue = getProperty(actor.data, flag);
  if (!countValue) return 1;
  if (Number.isNumeric(countValue)) return countValue;
  if (countValue.startsWith("@")) {
    let result = getProperty(actor.data.data, countValue.slice(1))
    return result;
  }
  return 1; //?? TODO is this sensible?
}

export async function removeEffectGranting(actor: Actor5e, changeKey: string) {
  // TODO implement charges rather than single value

  const effect = actor.effects.find(ef => ef.data.changes.some(c => c.key.includes(changeKey)))
  if (!effect) return;
  const effectData = effect.toObject();

  const count = effectData.changes.find(c => c.key.includes(changeKey) && c.key.endsWith(".count"));
  if (!count) {
    return actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id])
  } else if (Number.isNumeric(count.value)) {
    if (count.value <= 1)
      return actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id])
    else {
      count.value -= 1;
      actor.updateEmbeddedDocuments("ActiveEffect", [effectData])
    }
  } else if (count.value.startsWith("@")) {
    let key = count.value.slice(1);
    if (key.startsWith("data.")) key = key.replace("data.", "")
    // we have a @field to consume
    let charges = getProperty(actor.data.data, key)
    if (charges) {
      charges -= 1;
      const update = {};
      update[`data.${key}`] = charges;
      return actor.update(update);
    }
  }
}

export function hasEffectGranting(actor: Actor5e, key: string, selector: string) {
  const changeKey = `${key}.${selector}`;
  return actor.effects.find(ef => ef.data.changes.some(c => c.key === changeKey) && getOptionalCountRemainingShortFlag(actor, key) > 0)
}

//TODO fix this to search 
export function isConcentrating(actor: Actor5e): undefined | ActiveEffect {
  const concentrationName = installedModules.get("combat-utility-belt")
    ? game.settings.get("combat-utility-belt", "concentratorConditionName")
    : i18n("midi-qol.Concentrating");
  return actor.effects.contents.find(i => i.data.label === concentrationName);
}

export async function doReactions(target: Token, triggerTokenUuid: string | undefined, attackRoll: Roll): Promise<{ name: string | undefined, uuid: string | undefined, ac: number | undefined }> {
  const noResult = { name: undefined, uuid: undefined, ac: undefined };
  if (!target.actor || !target.actor.data.flags || !target.actor.data.flags["midi-qol"]) return noResult;
  let player = playerFor(target) || ChatMessage.getWhisperRecipients("GM").find(u => u.active);
  if (!player) return noResult;
  if (getReactionSetting(player) === "none") return noResult;
  //@ts-ignore activation
  let reactions = target.actor.items.filter(item => item.data.data.activation?.type === "reaction").length;
  const midiFlags: any = target.actor.data.flags["midi-qol"];
  reactions = reactions + Object.keys(midiFlags?.optional ?? [])
    .filter(flag => {
      if (!midiFlags?.optional[flag].ac) return false;
      if (!midiFlags?.optional[flag].count) return true;
      return getOptionalCountRemainingShortFlag(target.actor, flag) > 0;
    }).length
  if (reactions <= 0) return noResult;
  return new Promise((resolve) => {
    // set a timeout for taking over the roll
    setTimeout(() => {
      resolve(noResult);
    }, (configSettings.reactionTimeout || 30) * 1000);
    // Complier does not realise player can't be undefined to get here
    player && requestReactions(target, player, triggerTokenUuid, attackRoll, resolve)
  })
}

export async function requestReactions(target: Token, player: User, triggerTokenUuid: string | undefined, attackRoll: Roll, resolve: ({ }) => void) {
  const result = (await socketlibSocket.executeAsUser("chooseReactions", player.id, {
    tokenUuid: target.document.uuid,
    attackRoll: JSON.stringify(attackRoll.toJSON()),
    triggerTokenUuid
  }));
  resolve(result);
}

export async function promptReactions(tokenUuid: string, triggerTokenUuid: string | undefined, attackRoll: Roll) {
  const target: Token = MQfromUuid(tokenUuid);
  const actor: Actor | null = target.actor;
  if (!actor) return;
  let result;
  //@ts-ignore activation
  let reactionItems = actor.items.filter(item => item.data.data.activation?.type === "reaction");
  if (reactionItems.length > 0) {
    if (!Hooks.call("midi-qol.ReactionFilter", reactionItems)) {
      console.warn("Reaction processing cancelled by Hook");
      return { name: "Filter"};
    }
    result = await reactionDialog(actor, triggerTokenUuid, reactionItems, attackRoll)
    if (result.uuid) return result;
  }
  const midiFlags: any = actor.data.flags["midi-qol"];
  if (!midiFlags) return { name: "None" };
  const bonusFlags = Object.keys(midiFlags?.optional ?? [])
    .filter(flag => {
      if (!midiFlags.optional[flag].ac) return false;
      if (!midiFlags.optional[flag].count) return true;
      return getOptionalCountRemainingShortFlag(actor, flag) > 0;
    }).map(flag => `flags.midi-qol.optional.${flag}`);
  if (bonusFlags.length > 0) {
    //@ts-ignore attributes
    let acRoll = new Roll(`${actor.data.data.attributes.ac.value}`).roll();
    const data = {
      actor,
      roll: acRoll,
      rollHTML: "D20 - " + attackRoll.terms[0].total,
      rollTotal: acRoll.total,
    }
    //@ts-ignore attributes
    await bonusDialog.bind(data)(bonusFlags, "ac", true, `${actor.name} - ${i18n("DND5E.AC")} ${actor.data.data.attributes.ac.value}`, "roll", "rollTotal", "rollHTML")
    return { name: actor.name, uuid: actor.uuid, ac: data.roll.total };
  }
  return { name: "None" };
}

export function playerFor(target: Token): User | undefined {
  // find the controlling player
  let player = game.users?.players.find(p => p.character?.id === target.actor?.id);
  if (!player?.active) { // no controller - find the first owner who is active
    player = game.users?.players.find(p => p.active && target.actor?.data.permission[p.id ?? ""] === CONST.ENTITY_PERMISSIONS.OWNER)
    if (!player) player = game.users?.players.find(p => p.active && target.actor?.data.permission.default === CONST.ENTITY_PERMISSIONS.OWNER)
  }
  return player;
}

export async function reactionDialog(actor: Actor5e, triggerTokenUuid: string | undefined, reactionItems: any[], attackRoll: Roll) {

  return new Promise((resolve, reject) => {
    const callback = async (dialog, button) => {
      const item = reactionItems.find(i => i.id === button.key);
      Hooks.once("midi-qol.RollComplete", () => {
        setTimeout(() => {
          actor.prepareData();
          resolve({ name: item.name, uuid: item.uuid })
        }, 50);
      });
      if (item.data.data.target?.type === "creature" && triggerTokenUuid) {
        const [dummy1, sceneId, dummy2, tokenId] = triggerTokenUuid.split(".");
        // TODO change this when token targets take uuids instead of ids.
        if (sceneId === canvas?.scene?.id) {
          game.user?.updateTokenTargets([tokenId]);
        }
      }
      await item.roll();
    }

    const rollOptions = Object(i18n("midi-qol.ShowReactionAttackRollOptions"));
    // {"none": "Attack Hit", "d20": "d20 roll only", "all": "Whole Attack Roll"},

    let content;
    switch (configSettings.showReactionAttackRoll) {
      case "all":
        content = `<h4>${rollOptions.all} ${attackRoll.total}</h4>`;
        break;
      case "d20":
        //@ts-ignore
        const theRoll = attackRoll.terms[0].results[0].result;
        content = `<h4>${rollOptions.d20} ${theRoll}</h4>`; break;
      default:
        content = rollOptions.none;
    }

    const dialog = new ReactionDialog(
      {
        actor,
        targetObject: this,
        title: `${actor.name}`,
        items: reactionItems,
        content,
        callback,
        close: resolve
      }, {
      width: 400
    }).render(true);
  });
}


class ReactionDialog extends Application {
  data: {
    actor: Actor5e,
    items: Item[],
    title: string,
    content: HTMLElement | JQuery<HTMLElement>,
    callback: () => {},
    close: (any) => {},
    buttons: any,
    completed: boolean
  }

  constructor(data, options) {
    super(options);
    this.data = data;
    this.data.completed = false
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      template: "templates/hud/dialog.html",
      classes: ["dialog"],
      width: 400,
      jQuery: true
    });
  }
  get title() {
    return this.data.title || "Dialog";
  }

  async getData(options) {
    this.data.buttons = this.data.items.reduce((acc: {}, item: Item) => {
      acc[randomID()] = {
        icon: '<i class="fas fa-dice-d20"></i>',
        label: item.name,
        value: item.name,
        key: item.id,
        callback: this.data.callback,
      }
      return acc;
    }, {})
    return {
      content: this.data.content,
      buttons: this.data.buttons
    }
  }

  activateListeners(html) {
    html.find(".dialog-button").click(this._onClickButton.bind(this));
    $(document).on('keydown.chooseDefault', this._onKeyDown.bind(this));
    // if ( this.data.render instanceof Function ) this.data.render(this.options.jQuery ? html : html[0]);
  }

  _onClickButton(event) {
    const id = event.currentTarget.dataset.button;
    const button = this.data.buttons[id];
    this.submit(button);
  }

  _onKeyDown(event) {
    // Close dialog
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      this.data.completed = true;
      if (this.data.close) this.data.close({ name: "keydown", uuid: undefined });
      this.close();
    }
  }

  async submit(button) {
    try {
      if (button.callback) {
        this.data.completed = true;
        await button.callback(this, button)
        this.close();
        // this.close();
      }
    } catch (err) {
      ui.notifications?.error(err);
      console.error(err);
      this.data.completed = false;
      this.close()
    }
  }

  async close() {
    if (!this.data.completed && this.data.close) {
      this.data.close({ name: "Close", uuid: undefined });
    }
    $(document).off('keydown.chooseDefault');
    return super.close();
  }
}
