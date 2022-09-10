import { debug, i18n, error, warn, noDamageSaves, cleanSpellName, MQdefaultDamageType, allAttackTypes, gameStats, debugEnabled, overTimeEffectsToDelete, geti18nOptions, failedSaveOverTimeEffectsToDelete } from "../midi-qol.js";
import { configSettings, autoRemoveTargets, checkRule, lateTargeting } from "./settings.js";
import { log } from "../midi-qol.js";
import { BetterRollsWorkflow, DummyWorkflow, Workflow, WORKFLOWSTATES } from "./workflow.js";
import { socketlibSocket, timedAwaitExecuteAsGM } from "./GMAction.js";
import { installedModules } from "./setupModules.js";
import { concentrationCheckItemDisplayName, itemJSONData, midiFlagTypes, overTimeJSONData } from "./Hooks.js";

import { OnUseMacros } from "./apps/Item.js";
import { actorAbilityRollPatching, Options } from "./patching.js";
import { ModifierFlags, reduceEachTrailingCommentRange } from "typescript";

export function getDamageType(flavorString): string | undefined {
  const validDamageTypes = Object.entries(getSystemCONFIG().damageTypes).deepFlatten().concat(Object.entries(getSystemCONFIG().healingTypes).deepFlatten())
  const allDamageTypeEntries = Object.entries(getSystemCONFIG().damageTypes).concat(Object.entries(getSystemCONFIG().healingTypes));
  if (validDamageTypes.includes(flavorString)) {
    const damageEntry: any = allDamageTypeEntries?.find(e => e[1] === flavorString);
    return damageEntry ? damageEntry[0] : flavorString
  }
  return undefined;
}

export function getDamageFlavor(damageType): string | undefined {
  const validDamageTypes = Object.entries(getSystemCONFIG().damageTypes).deepFlatten().concat(Object.entries(getSystemCONFIG().healingTypes).deepFlatten())
  const allDamageTypeEntries = Object.entries(getSystemCONFIG().damageTypes).concat(Object.entries(getSystemCONFIG().healingTypes));
  if (validDamageTypes.includes(damageType)) {
    const damageEntry: any = allDamageTypeEntries?.find(e => e[0] === damageType);
    return damageEntry ? damageEntry[1] : damageType
  }
  return undefined;
}

/**
 *  return a list of {damage: number, type: string} for the roll and the item
 */
export function createDamageList({ roll, item, versatile, defaultType = MQdefaultDamageType }): { damage: unknown; type: string; }[] {
  let damageParts = {};
  const rollTerms = roll.terms;
  let evalString = "";
  let parts = duplicate(item?.system.damage.parts ?? []);
  if (versatile && item?.system.damage.versatile) {
    parts[0][0] = item.system.damage.versatile;
  }
  // create data for a synthetic roll
  let rollData = item ? item.getRollData() : {};
  rollData.mod = 0;
  if (debugEnabled > 1) debug("CreateDamageList: Passed roll is ", roll)
  if (debugEnabled > 1) debug("CreateDamageList: Damage spec is ", parts)
  let partPos = 0;
  const validDamageTypes = Object.entries(getSystemCONFIG().damageTypes).deepFlatten().concat(Object.entries(getSystemCONFIG().healingTypes).deepFlatten())
  const allDamageTypeEntries = Object.entries(getSystemCONFIG().damageTypes).concat(Object.entries(getSystemCONFIG().healingTypes));

  // If we have an item we can use it to work out each of the damage lines that are being rolled
  for (let [spec, type] of parts) { // each spec,type is one of the damage lines
    if (partPos >= rollTerms.length) continue;
    // TODO look at replacing this with a map/reduce
    if (debugEnabled > 1) debug("CreateDamageList: single Spec is ", spec, type, item)
    let formula = Roll.replaceFormulaData(spec, rollData, { missing: "0", warn: false });
    // TODO - need to do the .evaluate else the expression is not useful 
    // However will be a problem longer term when async not supported?? What to do
    let dmgSpec: Roll | undefined;
    try {
      // TODO Check if we actually have to to do the roll - intermeidate terms and simplifying the roll are the two bits to think about
      dmgSpec = new Roll(formula, rollData).evaluate({ async: false });
    } catch (err) {
      console.warn("midi-qol | Dmg spec not valid", formula)
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
      // eventually rollTerms[partPos] will become undefined so it can't run forever
      while (rollTerms[partPos] instanceof CONFIG.Dice.termTypes.OperatorTerm &&
        !(dmgSpec.terms[i] instanceof CONFIG.Dice.termTypes.OperatorTerm)) {
        evalString += rollTerms[partPos].operator + " ";
        partPos += 1;
      }
      if (rollTerms[partPos]) {
        if (rollTerms[partPos] instanceof OperatorTerm) {
          evalString += rollTerms[partPos].operator + " ";
        }
        if (rollTerms[partPos] instanceof DiceTerm || rollTerms[partPos] instanceof NumericTerm) {
          const flavorDamageType = getDamageType(rollTerms[partPos]?.options?.flavor);
          type = flavorDamageType ?? type;
          if (!rollTerms[partPos]?.options.flavor) {
            setProperty(rollTerms[partPos].options, "flavor", getDamageFlavor(type));
          }
          evalString += rollTerms[partPos]?.total;
          let result = Roll.safeEval(evalString)
          damageParts[type || defaultType] = (damageParts[type || defaultType] || 0) + result;
          evalString = "";
        }
      }
      partPos += 1;
    }
    // Each damage line is added together and we can skip the operator term
    partPos += 1;
    if (evalString !== "") {
      let result = Roll.safeEval(evalString)
      damageParts[type || defaultType] = (damageParts[type || defaultType] || 0) + result;
      evalString = "";
    }
  }
  // We now have all of the item's damage lines (or none if no item)
  // Now just add up the other terms - using any flavor types for the rolls we get
  // we stepped one term too far so step back one
  partPos = Math.max(0, partPos - 1);

  // process the rest of the roll as a sequence of terms.
  // Each might have a damage flavour so we do them expression by expression

  evalString = "";
  let damageType: string | undefined = defaultType;
  let numberTermFound = false; // We won't evaluate until at least 1 numeric term is found
  while (partPos < rollTerms.length) {
    // Accumulate the text for each of the terms until we have enough to eval
    const evalTerm = rollTerms[partPos];
    partPos += 1;
    if (evalTerm instanceof DiceTerm) {
      // this is a dice roll
      damageType = getDamageType(evalTerm.options?.flavor) ?? damageType;
      if (!evalTerm?.options.flavor) {
        setProperty(evalTerm, "options.flavor", getDamageFlavor(damageType));
      }
      numberTermFound = true;
      evalString += evalTerm.total;
    } else if (evalTerm instanceof Die) { // special case for better rolls that does not return a proper roll
      damageType = getDamageType(evalTerm.options?.flavor) ?? damageType;
      if (!evalTerm?.options.flavor) {
        setProperty(evalTerm, "options.flavor", getDamageFlavor(damageType));
      }
      numberTermFound = true;
      evalString += evalTerm.total;
    } else if (evalTerm instanceof NumericTerm) {
      damageType = getDamageType(evalTerm.options?.flavor) ?? damageType;
      if (!evalTerm?.options.flavor) {
        setProperty(evalTerm, "options.flavor", getDamageFlavor(damageType));
      }
      numberTermFound = true;
      evalString += evalTerm.total;
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
          damageType = defaultType;
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
  const damageList = Object.entries(damageParts).map(([type, damage]) => { return { damage, type } });
  if (debugEnabled > 1) debug("CreateDamageList: Final damage list is ", damageList);
  return damageList;
}

export async function getSelfTarget(actor): Promise<Token | TokenDocument | undefined> {
  if (actor.token) return actor.token.object; //actor.token is a token document.
  const speaker = ChatMessage.getSpeaker({ actor })
  if (speaker.token) return canvas?.tokens?.get(speaker.token);
  return actor.getTokenData(); // TODO test this sometime
}

export async function getSelfTargetSet(actor): Promise<Set<Token | TokenDocument>> {
  const selfTarget = await getSelfTarget(actor);
  if (selfTarget) return new Set([selfTarget]);
  return new Set();
}

// Calculate the hp/tempHP lost for an amount of damage of type
export function calculateDamage(a: Actor, appliedDamage, t: Token, totalDamage, dmgType, existingDamage) {
  if (debugEnabled > 1) debug("calculate damage ", a, appliedDamage, t, totalDamage, dmgType)
  let prevDamage = existingDamage?.find(ed => ed.tokenId === t.id);
  //@ts-ignore attributes
  var hp = a.system.attributes.hp;
  var oldHP, tmp;
  if (prevDamage) {
    oldHP = prevDamage.newHP;
    tmp = prevDamage.newTempHP;
  } else {
    oldHP = hp.value;
    tmp = parseInt(hp.temp) || 0;
  }
  let value = Math.floor(appliedDamage);
  if (dmgType.includes("temphp")) { // only relevent for healing of tmp HP
    var newTemp = Math.max(tmp, -value, 0);
    var newHP: number = oldHP;
  } else {
    var dt = value > 0 ? Math.min(tmp, value) : 0;
    var newTemp = tmp - dt;
    var newHP: number = Math.clamped(oldHP - (value - dt), 0, hp.max + (parseInt(hp.tempmax) || 0));
  }
  //TODO review this awfulness
  // Stumble around trying to find the actual token that corresponds to the multi level token TODO make this sane
  //@ts-ignore .flags v10  
  const altSceneId = getProperty(t.flags, "multilevel-tokens.sscene");
  let sceneId = altSceneId ?? t.scene?.id;
  //@ts-ignore .flags v10
  const altTokenId = getProperty(t.flags, "multilevel-tokens.stoken");
  let tokenId = altTokenId ?? t.id;
  const altTokenUuid = (altTokenId && altSceneId) ? `Scene.${altSceneId}.Token.${altTokenId}` : undefined;
  let tokenUuid = altTokenUuid; // TODO this is nasty fix it.
  if (!tokenUuid && t.document) tokenUuid = t.document.uuid;

  if (debugEnabled > 1) debug("calculateDamage: results are ", newTemp, newHP, appliedDamage, totalDamage)
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

export let getTraitMult = (actor, dmgTypeString, item): number => {
  dmgTypeString = dmgTypeString.toLowerCase();
  let totalMult = 1;
  if (dmgTypeString.includes("healing") || dmgTypeString.includes("temphp")) totalMult = -1;
  if (dmgTypeString.includes("midi-none")) return 0;
  if (configSettings.damageImmunities === "none") return totalMult;
  /*
  let attacker = item?.parent;
  if (attacker) {
    const ignoreFlags = getProperty(attacker.flags, "midi-qol.ignoreTrait"
  }
  */
  if (dmgTypeString !== "") {
    // if not checking all damage counts as magical
    let magicalDamage = item?.system.properties?.mgc || item?.flags.midiProperties?.magicdam;
    magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && item?.system.attackBonus > 0);
    magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && item?.type !== "weapon");
    magicalDamage = magicalDamage || (configSettings.requireMagical === "nonspell" && item?.type === "spell");
    const silverDamage = item?.system.properties?.sil;
    const adamantineDamage = item?.system.properties?.ada;
    let traitList = [{ type: "di", mult: 0 }, { type: "dr", mult: configSettings.damageResistanceMultiplier }, { type: "dv", mult: configSettings.damageVulnerabilityMultiplier }];
    // for sw5e use sdi/sdr/sdv instead of di/dr/dv
    if (game.system.id === "sw5e" && actor.type === "starship" && actor.system.attributes.hp.tenp > 0) {
      traitList = [{ type: "sdi", mult: 0 }, { type: "sdr", mult: configSettings.damageResistanceMultiplier }, { type: "sdv", mult: configSettings.damageVulnerabilityMultiplier }];
    }
    for (let { type, mult } of traitList) {
      let trait = actor.system.traits[type].value;
      if (configSettings.damageImmunities === "immunityPhysical") {
        if (!magicalDamage && trait.includes("physical"))
          trait = trait.concat("bludgeoning", "slashing", "piercing")
        if (!(magicalDamage || silverDamage) && trait.includes("silver"))
          trait = trait.concat("bludgeoning", "slashing", "piercing")
        if (!(magicalDamage || adamantineDamage) && trait.includes("adamant"))
          trait = trait.concat("bludgeoning", "slashing", "piercing")
      }
      if (!magicalDamage && trait.find(t => t === "nonmagic") && !["healing", "temphp"].includes(dmgTypeString))
        totalMult = totalMult * mult;
      else if (magicalDamage && trait.find(t => t === "magic") && !["healing", "temphp"].includes(dmgTypeString))
        totalMult = totalMult * mult;
      else if (item?.type === "spell" && trait.includes("spell") && !["healing", "temphp"].includes(dmgTypeString))
        totalMult = totalMult * mult;
      else if (item?.type === "power" && trait.includes("power") && !["healing", "temphp"].includes(dmgTypeString))
        totalMult = totalMult * mult;
      else if (trait.includes(dmgTypeString))
        totalMult = totalMult * mult;
    }
  }
  return totalMult;
  // Check the custom immunities
}

export async function applyTokenDamage(damageDetail, totalDamage, theTargets, item, saves,
  options: any = { existingDamage: [], superSavers: new Set(), semiSuperSavers: new Set(), workflow: undefined, updateContext: undefined, forceApply: false }): Promise<any[]> {
  return legacyApplyTokenDamageMany([damageDetail], [totalDamage], theTargets, item, [saves], {
    existingDamage: options.existingDamage,
    superSavers: options.superSavers ? [options.superSavers] : [],
    semiSuperSavers: options.semiSuperSavers ? [options.semiSuperSavers] : [],
    workflow: options.workflow,
    updateContext: options.updateContext,
    forceApply: options.forceApply ?? true
  });
}

export interface applyDamageDetails {
  label: string;
  damageDetail: any[];
  damageTotal: number;
  saves?: Set<Token | TokenDocument>;
  superSavers?: Set<Token | TokenDocument>;
  semiSuperSavers?: Set<Token | TokenDocument>;
}

export async function applyTokenDamageMany({ applyDamageDetails, theTargets, item,
  options = { existingDamage: [], workflow: undefined, updateContext: undefined, forceApply: false } }:
    { applyDamageDetails: applyDamageDetails[]; theTargets: Set<Token | TokenDocument>; item: any; options?: { existingDamage: any[][]; workflow: Workflow | undefined; updateContext: any | undefined; forceApply: boolean }; }): Promise<any[]> {
  let damageList: any[] = [];
  let targetNames: string[] = [];
  let appliedDamage;
  let workflow: any = options.workflow ?? {};
  if (debugEnabled > 0) warn("Apply token damage ", applyDamageDetails, theTargets, item, workflow)
  if (!theTargets || theTargets.size === 0) {
    workflow.currentState = WORKFLOWSTATES.ROLLFINISHED;
    // probably called from refresh - don't do anything
    return [];
  }
  if (!(item instanceof CONFIG.Item.documentClass)) {
    if (workflow && workflow.item) item = workflow.item;
    else if (item?.uuid) {
      item = MQfromUuid(item.uuid);
    } else if (item) {
      error("ApplyTokenDamage item must be of type Item or null/undefined");
      return [];
    }
  }
  const damageDetailArr = applyDamageDetails.map(a => a.damageDetail);
  const highestOnlyDR = false;
  let totalDamage = applyDamageDetails.reduce((a, b) => a + (b.damageTotal ?? 0), 0);
  let totalAppliedDamage = 0;
  let appliedTempHP = 0;
  const itemSaveMultiplier = getSaveMultiplierForItem(item);
  for (let t of theTargets) {
    //@ts-ignore
    const targetToken: Token = (t instanceof TokenDocument ? t.object : t) ?? t;
    //@ts-ignore
    const targetTokenDocument: TokenDocument = t instanceof TokenDocument ? t : t.document;

    if (!targetTokenDocument || !targetTokenDocument.actor) continue;
    let targetActor: any = targetTokenDocument.actor;

    appliedDamage = 0;
    appliedTempHP = 0;
    let DRAll = 0;
    // damage absorption:
    const flags = getProperty(targetActor.flags, "midi-qol.absorption");
    let absorptions: string[] = [];
    if (flags) {
      absorptions = Object.keys(flags)
    }
    const firstDamageHealing = applyDamageDetails[0].damageDetail && ["healing", "temphp"].includes(applyDamageDetails[0].damageDetail[0]?.type);
    const isHealing = ("heal" === workflow?.item?.system.actionType) || firstDamageHealing;
    const noDamageReactions = (item?.hasSave && item.flags?.midiProperties?.nodam && workflow.saves?.has(t));
    const noProvokeReaction = workflow.item && getProperty(workflow.item, "flags.midi-qol.noProvokeReaction");

    if (totalDamage > 0 && workflow && !isHealing && !noDamageReactions && !noProvokeReaction && [Workflow, BetterRollsWorkflow].includes(workflow.constructor)) {
      // TODO check that the targetToken is actually taking damage
      // Consider checking the save multiplier for the item as a first step
      let result = await doReactions(targetToken, workflow.tokenUuid, workflow.damageRoll, "reactiondamage", { item: workflow.item, workflow, workflowOptions: { damageDetail: workflow.damageDetail, damageTotal: totalDamage, sourceActorUuid: workflow.actor.uuid, sourceItemUuid: workflow.item?.uuid, sourceAmmoUuid: workflow.ammo?.uuid } });
    }
    const uncannyDodge = getProperty(targetActor, "flags.midi-qol.uncanny-dodge") && workflow.item?.hasAttack;
    if (game.system.id === "sw5e" && targetActor?.type === "starship") {
      // TODO: maybe expand this to work with characters as well?
      // Starship damage resistance applies only to attacks
      if (item && ["mwak", "rwak"].includes(item?.system.actionType)) {
        DRAll = getProperty(t, "actor.system.attributes.equip.armor.dr") ?? 0;;
      }
    } else if (getProperty(targetActor, "flags.midi-qol.DR.all") !== undefined)
      DRAll = (new Roll((`${getProperty(targetActor, "flags.midi-qol.DR.all") || "0"}`), targetActor.getRollData())).evaluate({ async: false }).total ?? 0;
    if (item?.hasAttack && getProperty(targetActor, `flags.midi-qol.DR.${item?.system.actionType}`)) {
      DRAll += (new Roll((`${getProperty(targetActor, `flags.midi-qol.DR.${item?.system.actionType}`) || "0"}`), targetActor.getRollData())).evaluate({ async: false }).total ?? 0;
    }
    // const magicalDamage = (item?.type !== "weapon" || item?.system.attackBonus > 0 || item?.system.properties["mgc"]);
    let magicalDamage = item?.system.properties?.mgc || item?.system.midiProperties?.magicdam;
    magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && item?.system.attackBonus > 0);
    magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && item?.type !== "weapon");
    magicalDamage = magicalDamage || (configSettings.requireMagical === "nonspell" && item?.type === "spell");

    const silverDamage = magicalDamage || (item?.type !== "weapon" || item?.system.attackBonus > 0 || item?.system.properties["sil"]);
    const adamantineDamage = magicalDamage || (item?.type !== "weapon" || item?.system.attackBonus > 0 || item?.system.properties["ada"]);
    const physicalDamage = !magicalDamage;

    let AR = 0; // Armor reduction for challenge mode armor etc.
    const ac = targetActor.system.attributes.ac;
    let damageDetail;
    let damageDetailResolved: any[] = [];
    for (let i = 0; i < applyDamageDetails.length; i++) {
      if (workflow.activationFails?.has(targetTokenDocument.uuid) && applyDamageDetails[i].label === "otherDamage") continue; // don't apply other damage is activationFails includes the token
      damageDetail = duplicate(applyDamageDetails[i].damageDetail ?? []);
      let attackRoll = workflow.attackTotal;
      let saves = applyDamageDetails[i].saves ?? new Set();
      let superSavers: Set<Token | TokenDocument> = applyDamageDetails[i].superSavers ?? new Set();
      let semiSuperSavers: Set<Token | TokenDocument> = applyDamageDetails[i].semiSuperSavers ?? new Set();
      var dmgType;

      // This is overall Damage Reduction
      let maxDR = 0;

      if (checkRule("challengeModeArmor") && checkRule("challengeModeArmorScale")) {
        AR = workflow.isCritical ? 0 : ac.AR;
      } else if (checkRule("challengeModeArmor") && attackRoll) {
        AR = ac.AR;
      } else AR = 0;
      let maxDRIndex = -1;

      for (let [index, damageDetailItem] of damageDetail.entries()) {
        if (checkRule("challengeModeArmor") && checkRule("challengeModeArmorScale") && attackRoll && workflow.hitTargetsEC.has(t)) {
          //scale te damage detail for a glancing blow - only for the first damage list? or all?
          const scale = getProperty(targetActor, "flags.midi-qol.challengeModeScale");
          damageDetailItem.damage *= scale;
        }
      }
      let nonMagicalDRUsed = false;
      let nonPhysicalDRUsed = false;
      let nonSilverDRUsed = false;
      let nonAdamantineDRUsed = false;
      let physicalDRUsed = false;

      // Calculate the Damage Reductions for each damage type
      for (let [index, damageDetailItem] of damageDetail.entries()) {
        let { damage, type } = damageDetailItem;
        type = type ?? MQdefaultDamageType;
        if (absorptions.includes(type)) {
          type = "healing";
          damageDetailItem.type = "healing"
        }
        let DRType = 0;
        if (type.toLowerCase() !== "temphp") dmgType = type.toLowerCase();
        // Pick the highest DR applicable to the damage type being inflicted.
        if (getProperty(targetActor, `flags.midi-qol.DR.${type}`)) {
          DRType = (new Roll((`${getProperty(targetActor, `flags.midi-qol.DR.${type}`) || "0"}`), targetActor.getRollData())).evaluate({ async: false }).total ?? 0;
        }
        if (DRType === 0 && !nonMagicalDRUsed && ["bludgeoning", "slashing", "piercing"].includes(type) && !magicalDamage) {
          const DR = (new Roll((`${getProperty(targetActor, `flags.midi-qol.DR.non-magical`) || "0"}`), targetActor.getRollData())).evaluate({ async: false }).total ?? 0;
          nonMagicalDRUsed = DR > DRType;
          DRType = Math.max(DRType, DR);
        }
        if (DRType === 0 && !nonSilverDRUsed && ["bludgeoning", "slashing", "piercing"].includes(type) && !silverDamage) {
          const DR = (new Roll((`${getProperty(targetActor, `flags.midi-qol.DR.non-silver`) || "0"}`), targetActor.getRollData())).evaluate({ async: false }).total ?? 0;
          nonSilverDRUsed = DR > DRType;
          DRType = Math.max(DRType, DR);
        }
        if (DRType === 0 && !nonAdamantineDRUsed && ["bludgeoning", "slashing", "piercing"].includes(type) && !adamantineDamage) {
          const DR = (new Roll((`${getProperty(targetActor, `flags.midi-qol.DR.non-adamantine`) || "0"}`), targetActor.getRollData())).evaluate({ async: false }).total ?? 0
          nonAdamantineDRUsed = DR > DRType;
          DRType = Math.max(DRType, DR);
        }
        if (DRType === 0 && !physicalDRUsed && ["bludgeoning", "slashing", "piercing"].includes(type) && physicalDamage && getProperty(targetActor, `flags.midi-qol.DR.physical`)) {
          const DR = (new Roll((`${getProperty(targetActor, `flags.midi-qol.DR.physical`) || "0"}`), targetActor.getRollData())).evaluate({ async: false }).total ?? 0;
          physicalDRUsed = DR > DRType;
          DRType = Math.max(DRType, DR);
        }
        if (DRType === 0 && !nonPhysicalDRUsed && !["bludgeoning", "slashing", "piercing"].includes(type) && !physicalDamage && getProperty(targetActor, `flags.midi-qol.DR.non-physical`)) {
          const DR = (new Roll((`${getProperty(targetActor, `flags.midi-qol.DR.non-physical`) || "0"}`), targetActor.getRollData())).evaluate({ async: false }).total ?? 0;
          nonPhysicalDRUsed = DR > DRType;
          DRType = Math.max(DRType, DR);
        }
        DRType = Math.min(damage, DRType);
        // We have the DRType for the current damage type
        if (DRType >= maxDR) {
          maxDR = DRType;
          maxDRIndex = index;
        }
        damageDetailItem.DR = DRType;
      }

      if (DRAll > 0 && DRAll < maxDR && checkRule("maxDRValue")) DRAll = 0;
      let DRAllRemaining = Math.max(DRAll, 0);
      // Now apportion DRAll to each damage type if required
      for (let [index, damageDetailItem] of damageDetail.entries()) {
        let { damage, type, DR } = damageDetailItem;
        if (checkRule("maxDRValue")) {
          if (index !== maxDRIndex) {
            damageDetailItem.DR = 0;
            DR = 0;
          } else if (DRAll > maxDR) {
            damageDetailItem.DR = 0;
            DR = 0;
          }
        }
        if (DR < damage && DRAllRemaining > 0) {
          damageDetailItem.DR = Math.min(damage, DR + DRAllRemaining);
          DRAllRemaining = Math.max(0, DRAllRemaining + DR - damage);
        }
        // Apply AR here
      }

      for (let [index, damageDetailItem] of damageDetail.entries()) {
        let { damage, type, DR } = damageDetailItem;
        let mult = saves.has(t) ? itemSaveMultiplier : 1;
        if (superSavers.has(t) && itemSaveMultiplier === 0.5) {
          mult = saves.has(t) ? 0 : 0.5;
        }
        if (semiSuperSavers.has(t) && itemSaveMultiplier === 0.5)
          mult = saves.has(t) ? 0 : 1;

        // TODO this should end up getting removed when the prepare data is done. Currently depends on 1Reaction expiry.
        if (uncannyDodge) mult = mult / 2;

        if (!type) type = MQdefaultDamageType;
        const resMult = getTraitMult(targetActor, type, item);
        mult = mult * resMult;
        damageDetailItem.damageMultiplier = mult;
        if (!["healing", "temphp"].includes(type)) damage -= DR; // Damage reduction does not apply to healing
        //        else damage -= DR;
        let typeDamage = Math.floor(damage * Math.abs(mult)) * Math.sign(mult);

        if (type.includes("temphp")) {
          appliedTempHP += typeDamage
        } else {
          appliedDamage += typeDamage
        }

        // TODO: consider mwak damage reduction - we have the workflow so should be possible
      }
      damageDetailResolved = damageDetailResolved.concat(damageDetail);
      if (debugEnabled > 0) console.warn("midi-qol | Damage Details plus resistance/save multiplier for ", targetActor.name, duplicate(damageDetail))
    }
    if (DRAll < 0) { // negative DR is extra damage
      damageDetailResolved = damageDetailResolved.concat({ damage: -DRAll, type: "DR", DR: 0 });
      appliedDamage -= DRAll;
      totalDamage -= DRAll;
    }
    if (!Object.keys(getSystemCONFIG().healingTypes).includes(dmgType)) {
      totalDamage = Math.max(totalDamage, 0);
      appliedDamage = Math.max(appliedDamage, 0);
    }
    //@ts-ignore
    if (AR > 0 && appliedDamage > 0 && !Object.keys(getSystemCONFIG().healingTypes).includes(dmgType) && checkRule("challengeModeArmor")) {
      totalDamage = appliedDamage;
      if (checkRule("challengeModeArmorScale") || workflow.hitTargetsEC.has(t))
        appliedDamage = Math.max(0, appliedDamage - AR)
    }

    totalAppliedDamage += appliedDamage;
    if (!dmgType) dmgType = "temphp";
    if (!["healing", "temphp"].includes(dmgType) && getProperty(targetActor, `flags.midi-qol.DR.final`)) {
      let DRType = (new Roll((getProperty(targetActor, `flags.midi-qol.DR.final`) || "0"), targetActor.getRollData())).evaluate({ async: false }).total ?? 0;
      appliedDamage = Math.max(0, appliedDamage - DRType)
    }

    // Deal with vehicle damage threshold.
    if (appliedDamage > 0 && appliedDamage < (targetActor.system.attributes.hp.dt ?? 0)) appliedDamage = 0;
    let ditem: any = calculateDamage(targetActor, appliedDamage, targetToken, totalDamage, dmgType, options.existingDamage);
    ditem.tempDamage = ditem.tempDamage + appliedTempHP;
    if (appliedTempHP <= 0) { // temp healing applied to actor does not add only gets the max
      ditem.newTempHP = Math.max(ditem.newTempHP, -appliedTempHP);
    } else {
      ditem.newTempHP = Math.max(0, ditem.newTempHP - appliedTempHP)
    }
    ditem.damageDetail = duplicate(damageDetailArr);
    await asyncHooksCallAll("midi-qol.damageApplied", t, { item, workflow, ditem });
    damageList.push(ditem);
    targetNames.push(t.name)
  }
  if (theTargets.size > 0) {
    await timedAwaitExecuteAsGM("createReverseDamageCard", {
      autoApplyDamage: configSettings.autoApplyDamage,
      sender: game.user?.name,
      actorId: workflow.actor?.id,
      charName: workflow.actor?.name ?? game?.user?.name,
      damageList: damageList,
      targetNames,
      chatCardId: workflow.itemCardId,
      flagTags: workflow?.flagTags,
      updateContext: options?.updateContext,
      forceApply: options.forceApply
    })
  }
  if (configSettings.keepRollStats) {
    gameStats.addDamage(totalAppliedDamage, totalDamage, theTargets.size, item)
  }
  return damageList;
};

export async function legacyApplyTokenDamageMany(damageDetailArr, totalDamageArr, theTargets, item, savesArr, 
    options: { existingDamage: any[][], superSavers: Set<any>[], semiSuperSavers: Set<any>[], workflow: Workflow | undefined, updateContext: any, forceApply: any } 
      = { existingDamage: [], superSavers: [], semiSuperSavers: [], workflow: undefined, updateContext: undefined, forceApply: false }): Promise<any[]> {
  const mappedDamageDetailArray: applyDamageDetails[] = damageDetailArr.map((dd, i) => {
    return {
      label: "test",
      damageDetail: dd,
      damageTotal: totalDamageArr[i],
      saves: savesArr[i],
      superSavers: options.superSavers[i],
      semiSuperSavers: options.semiSuperSavers[i],
    }
  });
  return applyTokenDamageMany({ applyDamageDetails: mappedDamageDetailArray, theTargets, item, options })
}

export async function processDamageRoll(workflow: Workflow, defaultDamageType: string) {
  if (debugEnabled > 0) warn("Process Damage Roll ", workflow)
  // proceed if adding chat damage buttons or applying damage for our selves
  let appliedDamage: any[] = [];
  const actor = workflow.actor;
  let item = workflow.item;

  // const re = /.*\((.*)\)/;
  // const defaultDamageType = message.flavor && message.flavor.match(re);

  // Show damage buttons if enabled, but only for the applicable user and the GM

  let theTargets = new Set([...workflow.hitTargets, ...workflow.hitTargetsEC]);
  if (item?.system.target?.type === "self") theTargets = await getSelfTargetSet(actor) || theTargets;
  let effectsToExpire: string[] = [];
  if (theTargets.size > 0 && item?.hasAttack) effectsToExpire.push("1Hit");
  if (theTargets.size > 0 && item?.hasDamage) effectsToExpire.push("DamageDealt");
  if (effectsToExpire.length > 0) {
    await expireMyEffects.bind(workflow)(effectsToExpire);
  }

  warn("damge details pre merge are ", workflow.damageDetail, workflow.bonusDamageDetail);
  let totalDamage = 0;
  let merged = workflow.damageDetail.concat(workflow.bonusDamageDetail ?? []).reduce((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + item.damage;
    return acc;
  }, {});
  //TODO come back and decide if -ve damage per type should be allowed, no in the case of 1d4 -2, yes? in the case of -1d4[fire]
  const newDetail = Object.keys(merged).map((key) => { return { damage: Math.max(0, merged[key]), type: key } });
  totalDamage = newDetail.reduce((acc, value) => acc + value.damage, 0);
  workflow.damageDetail = newDetail;
  workflow.damageTotal = totalDamage;
  warn("merged damage details are  ", newDetail);
  workflow.bonusDamageDetail = undefined;
  workflow.bonusDamageTotal = undefined;
  // TODO come back and remove bonusDamage from the args to applyTokenDamageMany
  // Don't check for critical - RAW say these don't get critical damage
  // if (["rwak", "mwak"].includes(item?.system.actionType) && configSettings.rollOtherDamage !== "none") {
  if (workflow.shouldRollOtherDamage) {
    if ((workflow.otherDamageFormula ?? "") !== "" && configSettings.singleConcentrationRoll) {
      appliedDamage = await applyTokenDamageMany(
        {
          applyDamageDetails: [
            { label: "defaultDamage", damageDetail: workflow.damageDetail, damageTotal: workflow.damageTotal },
            {
              label: "otherDamage",
              damageDetail: workflow.otherDamageDetail,
              damageTotal: workflow.otherDamageTotal,
              saves: workflow.saves,
              superSavers: workflow.superSavers,
              semiSuperSavers: workflow.semiSuperSavers
            },
            { label: "bonusDamage", damageDetail: workflow.bonusDamageDetail, damageTotal: workflow.bonusDamageTotal }
          ],
          theTargets,
          item,
          options: { existingDamage: [], workflow, updateContext: undefined, forceApply: false }
        }
      );
    } else {
      let savesToUse = (workflow.otherDamageFormula ?? "") !== "" ? undefined : workflow.saves;
      appliedDamage = await applyTokenDamageMany(
        {
          applyDamageDetails: [
            {
              label: "defaultDamage",
              damageDetail: workflow.damageDetail,
              damageTotal: workflow.damageTotal,
              saves: savesToUse,
              superSavers: workflow.superSavers,
              semiSuperSavers: workflow.semiSuperSavers
            },
            {
              label: "bonusDamage",
              damageDetail: workflow.bonusDamageDetail,
              damageTotal: workflow.bonusDamageTotal,
              saves: savesToUse,
              superSavers: workflow.superSavers,
              semiSuperSavers: workflow.semiSuperSavers
            },

          ],
          theTargets,
          item,
          options: { existingDamage: [], workflow, updateContext: undefined, forceApply: false }
        }
      );
      if (workflow.otherDamageRoll) {
        // assume previous damage applied and then calc extra damage
        appliedDamage = await applyTokenDamageMany(
          {
            applyDamageDetails: [{
              label: "otherDamage",
              damageDetail: workflow.otherDamageDetail,
              damageTotal: workflow.otherDamageTotal,
              saves: workflow.saves,
              superSavers: workflow.superSavers,
              semiSuperSavers: workflow.semiSuperSavers
            }],
            theTargets,
            item,
            options: { existingDamage: [], workflow, updateContext: undefined, forceApply: false }
          }
        );
      }
    }
  } else {
    appliedDamage = await applyTokenDamageMany(
      {
        applyDamageDetails: [
          {
            label: "defaultDamage",
            damageDetail: workflow.damageDetail,
            damageTotal: workflow.damageTotal,
            saves: workflow.saves,
            superSavers: workflow.superSavers,
            semiSuperSavers: workflow.semiSuperSavers
          },
          {
            label: "bonusDamage",
            damageDetail: workflow.bonusDamageDetail,
            damageTotal: workflow.bonusDamageTotal,
            saves: workflow.saves,
            superSavers: workflow.superSavers,
            semiSuperSavers: workflow.semiSuperSavers
          },
        ],
        theTargets,
        item,
        options: {
          existingDamage: [],
          workflow,
          updateContext: undefined,
          forceApply: false
        }
      });
  }
  workflow.damageList = appliedDamage;

  if (debugEnabled > 1) debug("process damage roll: ", configSettings.autoApplyDamage, workflow.damageDetail, workflow.damageTotal, theTargets, item, workflow.saves)
}

export let getSaveMultiplierForItem = (item: Item) => {
  // find a better way for this ? perhaps item property
  if (!item) return 1;
  //@ts-ignore
  if (item.actor && item.type === "spell" && item.system.level === 0) { // cantrip
    //@ts-ignore .flags v10
    const midiFlags = getProperty(item.actor.flags, "midi-qol");
    if (midiFlags?.potentCantrip) return 0.5;
  }

  //@ts-ignore item.falgs v10
  const itemProperties: any = item.flags.midiProperties;
  if (itemProperties?.nodam) return 0;
  if (itemProperties?.fulldam) return 1;
  if (itemProperties?.halfdam) return 0.5;
  //@ts-ignore item.system v10
  let description = TextEditor.decodeHTML((item.system.description?.value || "")).toLocaleLowerCase();
  if (description.includes(i18n("midi-qol.fullDamage").toLocaleLowerCase().trim()) || description.includes(i18n("midi-qol.fullDamageAlt").toLocaleLowerCase().trim())) {
    return 1;
  }
  //@ts-ignore item.name v10
  if (noDamageSaves.includes(cleanSpellName(item.name))) return 0;
  if (description?.includes(i18n("midi-qol.noDamage").toLocaleLowerCase().trim()) || description?.includes(i18n("midi-qol.noDamageAlt").toLocaleLowerCase().trim())) {
    return 0.0;
  }
  if (!configSettings.checkSaveText) return configSettings.defaultSaveMult;
  if (description?.includes(i18n("midi-qol.halfDamage").toLocaleLowerCase().trim()) || description?.includes(i18n("midi-qol.halfDamageAlt").toLocaleLowerCase().trim())) {
    return 0.5;
  }
  //  Think about this. if (checkSavesText true && item.hasSave) return 0; // A save is specified but the half-damage is not specified.
  return configSettings.defaultSaveMult;
};

export function requestPCSave(ability, rollType, player, actor, advantage, flavor, dc, requestId, GMprompt) {
  const useUuid = true; // for  LMRTFY
  const actorId = useUuid ? actor.uuid : actor.id;
  const playerLetme = !player?.isGM && ["letme", "letmeQuery"].includes(configSettings.playerRollSaves);
  const playerLetMeQuery = "letmeQuery" === configSettings.playerRollSaves;
  const gmLetmeQuery = "letmeQuery" === GMprompt;
  const gmLetme = player.isGM && ["letme", "letmeQuery"].includes(GMprompt);
  if (player && installedModules.get("lmrtfy") && (playerLetme || gmLetme)) {
    if (((!player.isGM && playerLetMeQuery) || (player.isGM && gmLetmeQuery))) {
      // TODO - reinstated the LMRTFY patch so that the event is properly passed to the roll
      advantage = 2;
    } else {
      advantage = (advantage === true ? 1 : advantage === false ? -1 : 0);
    }
    //@ts-ignore
    let mode = isNewerVersion(game.version ?? game.version, "0.9.236") ? "publicroll" : "roll";
    if (player.isGM && configSettings.autoCheckSaves !== "allShow") {
      mode = "blindroll";
    }
    let message = `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.saving-throw")} ${flavor}`;
    if (rollType === "abil")
      message = `${configSettings.displaySaveDC ? "DC " + dc : ""} ${i18n("midi-qol.ability-check")} ${flavor}`;
    if (rollType === "skill")
      message = `${configSettings.displaySaveDC ? "DC " + dc : ""} ${flavor}`;
    // Send a message for LMRTFY to do a save.
    const socketData = {
      user: player.id,
      actors: [actorId],
      abilities: rollType === "abil" ? [ability] : [],
      saves: rollType === "save" ? [ability] : [],
      skills: rollType === "skill" ? [ability] : [],
      advantage,
      mode,
      title: i18n("midi-qol.saving-throw"),
      message,
      formula: "",
      attach: { requestId },
      deathsave: false,
      initiative: false
    }
    if (debugEnabled > 1) debug("process player save ", socketData)
    game.socket?.emit('module.lmrtfy', socketData);
    //@ts-ignore - global variable
    LMRTFY.onMessage(socketData);
  } else { // display a chat message to the user telling them to save
    let actorName = actor.name;
    let content = ` ${actorName} ${configSettings.displaySaveDC ? "DC " + dc : ""} ${getSystemCONFIG().abilities[ability]} ${i18n("midi-qol.saving-throw")}`;
    content = content + (advantage ? ` (${i18n("DND5E.Advantage")})` : "") + ` - ${flavor}`;
    const chatData = {
      content,
      whisper: [player]
    }
    // think about how to do this if (workflow?.flagTags) chatData.flags = mergeObject(chatData.flags ?? "", workflow.flagTags);

    ChatMessage.create(chatData);
  }
}

export function requestPCActiveDefence(player, actor, advantage, saveItemName, rollDC, formula, requestId) {
  const useUuid = true; // for  LMRTFY
  const actorId = useUuid ? actor.uuid : actor.id;
  if (!player.isGM && false) {
    // TODO - reinstated the LMRTFY patch so that the event is properly passed to the roll
    advantage = 2;
  } else {
    advantage = (advantage === true ? 1 : advantage === false ? -1 : 0);
  }
  //@ts-ignore
  let mode = isNewerVersion(game.version ?? game.version, "0.9.236") ? "publicroll" : "roll";
  if (player.isGM && configSettings.autoCheckSaves !== "allShow") {
    mode = "selfroll";
  }
  let message = `${saveItemName} ${configSettings.displaySaveDC ? "DC " + rollDC : ""} ${i18n("midi-qol.ActiveDefenceString")}`;
  // Send a message for LMRTFY to do a save.
  const socketData = {
    "abilities": [],
    "saves": [],
    "skills": [],
    mode: "selfroll",
    "title": i18n("midi-qol.ActiveDefenceString"),
    message,
    "tables": [],
    user: player.id,
    actors: [actorId],
    advantage,
    formula,
    attach: { requestId, disableMessage: true },
    deathsave: false,
    initiative: false
  }
  if (debugEnabled > 1) debug("process player save ", socketData)
  game.socket?.emit('module.lmrtfy', socketData);
  //@ts-ignore - global variable
  LMRTFY.onMessage(socketData);
}

export function midiCustomEffect(actor, change) {
  if (typeof change?.key !== "string") return true;
  if (!change.key?.startsWith("flags.midi-qol")) return true;
  const variableKeys = [
    "flags.midi-qol.OverTime", 
    "flags.midi-qol.optional", 
    "flags.midi-qol.advantage", 
    "flags.midi-qol.disadvantage",
    "flags.midi-qol.grants",
    "flags.midi-qol.fails"
  ]; // These have trailing data in the change key change.key values and should always just be a string
  if (change.key === "flags.midi-qol.onUseMacroName") {
    const args = change.value.split(",")?.map(arg => arg.trim());
    const currentFlag = getProperty(actor, "flags.midi-qol.onUseMacroName") ?? "";
    const extraFlag = `[${args[1]}]${args[0]}`;
    let macroString;
    if (currentFlag.length === 0)
      macroString = extraFlag;
    else
      macroString = [currentFlag, extraFlag].join(",");
    setProperty(actor, "flags.midi-qol.onUseMacroName", macroString)
    return true;
  } else if (variableKeys.some(k => change.key.startsWith(k))) {
    if (typeof change.value !== "string") setProperty(actor, change.key, change.value);
    else if (["true", "1"].includes(change.value.trim())) setProperty(actor, change.key, true);
    else if (["false", "0"].includes(change.value.trim())) setProperty(actor, change.key, false);
    else setProperty(actor, change.key, change.value);
  } else if (typeof change.value === "string") {
    let val: any;
    try {
      switch (midiFlagTypes[change.key]) {
        case "string":
          val = change.value; break;
        case "number":
          val = Number.isNumeric(change.value) ? JSON.parse(change.value) : 0; break;
        default: // boolean by default
          val = JSON.parse(change.value) ? true : false;
      }
      setProperty(actor, change.key, val);
    } catch (err) {
      console.warn(`midi-qol | custom flag eval error ${change.key} ${change.value}`, err)
    }
  } else {
    setProperty(actor, change.key, change.value)
  }
  return true;
}

export function checkImmunity(candidate, data, options, user) {
  // Not using this in preference to marking effect unavailable
  const parent: Actor | undefined = candidate.parent;
  if (!parent || !(parent instanceof CONFIG.Actor.documentClass)) return true;

  //@ts-ignore .traits
  const ci = parent.system.traits?.ci?.value;
  const statusId = (data.label ?? "no effect").toLocaleLowerCase();
  const returnvalue = !(ci.length && ci.some(c => c === statusId));
  return returnvalue;
}

export function untargetDeadTokens() {
  if (autoRemoveTargets !== "none") {
    game.user?.targets.forEach((t: Token) => {
      //@ts-ignore .system v10
      if (t.actor?.system.attributes.hp.value <= 0) {
        t.setTarget(false, { releaseOthers: false });
      }
    });
  }
}

function replaceAtFields(value, context, options: { blankValue: string | number, maxIterations: number } = { blankValue: "", maxIterations: 4 }) {
  if (typeof value !== "string") return value;
  let count = 0;
  if (!value.includes("@")) return value;
  let re = /@[\w\.]+/g
  let result = duplicate(value);
  result = result.replace("@item.level", "@itemLevel") // fix for outdated item.level
  result = result.replace("@flags.midi-qol", "@flags.midiqol");
  // Remove @data references allow a little bit of recursive lookup
  do {
    count += 1;
    for (let match of result.match(re) || []) {
      result = result.replace(match.replace("@data.", "@"), getProperty(context, match.slice(1)) ?? options.blankValue)
    }
  } while (count < options.maxIterations && result.includes("@"));
  return result;
}

export async function processOverTime(wrapped, data, options, user) {
  if (data.round === undefined && data.turn === undefined) return wrapped(data, options, user);
  try {
    await expirePerTurnBonusActions(this);
    await _processOverTime(this, data, options, user)
  } catch (err) {
    error("processOverTime", err)
  } finally {
    return wrapped(data, options, user);
  }
}

export async function doOverTimeEffect(actor, effect, startTurn: boolean = true, options: any = { saveToUse: undefined, rollFlags: undefined }) {
  const endTurn = !startTurn;
  if (effect.disabled || effect.isSuppressed) return;
  const auraFlags = effect.flags?.ActiveAuras ?? {};
  if (auraFlags.isAura && auraFlags.ignoreSelf) return;
  const rollData = actor.getRollData();
  if (!rollData.flags) rollData.flags = actor.flags;
  rollData.flags.midiqol = rollData.flags["midi-qol"];
  const changes = effect.changes.filter(change => change.key.startsWith("flags.midi-qol.OverTime"));
  if (changes.length > 0) for (let change of changes) {
    // flags.midi-qol.OverTime turn=start/end, damageRoll=rollspec, damageType=string, saveDC=number, saveAbility=str/dex/etc, damageBeforeSave=true/[false], label="String"
    let spec = change.value;
    spec = replaceAtFields(spec, rollData, { blankValue: 0, maxIterations: 3 });
    spec = spec.replace(/\s*=\s*/g, "=");
    spec = spec.replace(/\s*,\s*/g, ",");
    spec = spec.replace("\n", "");
    let parts;
    if (spec.includes("#")) parts = spec.split("#");
    else parts = spec.split(",");
    let details: any = {};
    for (let part of parts) {
      const p = part.split("=");
      details[p[0]] = p.slice(1).join("=");
    }
    if (details.turn === undefined) details.turn = "start";
    if (details.applyCondition || details.condition) {
      let applyCondition = details.applyCondition ?? details.condition; // maintain support for condition
      let value = replaceAtFields(applyCondition, rollData, { blankValue: 0, maxIterations: 3 });
      let result;
      try {
        result = Roll.safeEval(value);
      } catch (err) {
        console.warn("midi-qol | error when evaluating overtime apply condition - assuming true", value, err)
        result = true;
      }
      if (!result) continue;
    }

    const changeTurnStart = details.turn === "start" ?? false;
    const changeTurnEnd = details.turn === "end" ?? false;
    const actionSave = JSON.parse(details.actionSave ?? "false");
    if ((endTurn && changeTurnEnd) || (startTurn && changeTurnStart) || (actionSave && options.saveToUse)) {
      const label = (details.label ?? "Damage Over Time").replace(/"/g, "");
      let saveDC;
      try {
        const value = replaceAtFields(details.saveDC, rollData, { blankValue: 0, maxIterations: 3 });
        saveDC = Roll.safeEval(value);
      } catch (err) { saveDC = -1 }
      const saveAbilityString = (details.saveAbility ?? "");
      const saveAbility = (saveAbilityString.includes("|") ? saveAbilityString.split("|") : [saveAbilityString]).map(s => s.trim().toLocaleLowerCase())
      const saveDamage = details.saveDamage ?? "nodamage";
      const saveMagic = JSON.parse(details.saveMagic ?? "false"); //parse the saving throw true/false
      const damageRoll = details.damageRoll;
      const damageType = details.damageType ?? "piercing";
      const itemName = details.itemName;
      const damageBeforeSave = JSON.parse(details.damageBeforeSave ?? "false");
      const macroToCall = details.macro;
      const rollTypeString = details.rollType ?? "save";
      const rollType = (rollTypeString.includes("|") ? rollTypeString.split("|") : [rollTypeString]).map(s => s.trim().toLocaleLowerCase())

      const killAnim = JSON.parse(details.killAnim ?? "false");
      const saveRemove = JSON.parse(details.saveRemove ?? "true");

      if (debugEnabled > 0) warn(`Overtime provided data is `, details);
      if (debugEnabled > 0) warn(`OverTime label=${label} startTurn=${startTurn} endTurn=${endTurn} damageBeforeSave=${damageBeforeSave} saveDC=${saveDC} saveAbility=${saveAbility} damageRoll=${damageRoll} damageType=${damageType}`);
      if (actionSave && options.saveToUse) {
        if (!options.rollFlags) return effect.id;
        if (!rollType.includes(options.rollFlags.type) || !saveAbility.includes(options.rollFlags.abilityId)) return effect.id;
        let content;
        if (options.saveToUse.total >= saveDC) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]), { "expiry-reason": "midi-qol:overTime:actionSave" };
          content = `${effect.label} ${i18n("midi-qol.saving-throw")} ${i18n("midi-qol.save-success")}`;
        } else
          content = `${effect.label} ${i18n("midi-qol.saving-throw")} ${i18n("midi-qol.save-failure")}`;
        ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
        return effect.id;
      }

      let itemData: any = duplicate(overTimeJSONData);
      if (typeof itemName === "string") {
        if (itemName.startsWith("Actor.")) { // TODO check this
          const localName = itemName.replace("Actor.", "")
          const theItem = actor.items.getName(localName);
          if (theItem) itemData = theItem.toObject();
        } else {
          const theItem = game.items?.getName(itemName);
          if (theItem) itemData = theItem.toObject();
        }
      }

      itemData.img = effect.icon;
      itemData.system.save.dc = saveDC;
      itemData.system.save.scaling = "flat";
      setProperty(itemData, "flags.midi-qol.noProvokeReaction", true);
      if (saveMagic) {
        itemData.type = "spell";
        itemData.system.preparation = { mode: "atwill" }
      }
      if (rollTypeString === "save" && !actionSave) {
        itemData.system.actionType = "save";
        itemData.system.save.ability = saveAbility[0];

      }
      if (rollTypeString === "check" && !actionSave) {
        itemData.systsem.actionType = "abil";
        itemData.system.save.ability = saveAbility[0];
      }
      if (rollTypeString === "skill" && !actionSave) { // skill checks for this is a fiddle - set a midi flag so that the midi save roll will pick it up.
        itemData.system.actionType = "save";
        let skill = saveAbility[0];
        let skillId = getSystemCONFIG().skills[saveAbility[0]];
        if (!skillId) {
          //@ts-ignore
          const hasEntry = Object.values(getSystemCONFIG().skills).map(id => id.toLowerCase()).includes(saveAbility)

          if (hasEntry) {
            skill = Object.keys(getSystemCONFIG().skills).find(id => getSystemCONFIG().skills[id].toLocaleLowerCase() === saveAbility[0])
          }
        }
        setProperty(itemData, "flags.midi-qol.overTimeSkillRoll", skill)
      }
      if (actionSave) {
        itemData.system.actionType = "other";
        itemData.system.save.dc = undefined;
        itemData.system.save.ability = undefined;
        itemData.system.save.scaling = undefined;
      }

      if (damageBeforeSave || saveDamage === "fulldamage") {
        //@ts-ignore
        setProperty(itemData.flags, "midiProperties.fulldam", true);
      } else if (saveDamage === "halfdamage" || !damageRoll) {
        //@ts-ignore
        setProperty(itemData.flags, "midiProperties.halfdam", true);
      } else {
        //@ts-ignore
        setProperty(itemData.flags, "midiProperties.nodam", true);
      }
      itemData.name = label;
      //@ts-ignore
      itemData._id = randomID();
      // roll the damage and save....
      const theTargetToken = await getSelfTarget(actor);
      const theTargetId = (theTargetToken instanceof Token) ? theTargetToken?.document.id : theTargetToken?.id;
      const theTargetUuid = (theTargetToken instanceof Token) ? theTargetToken?.document.uuid : theTargetToken?.uuid;
      if (game.user?.isGM && theTargetId) game.user.updateTokenTargets([theTargetId]);

      if (damageRoll) {
        let damageRollString = damageRoll;
        let stackCount = effect.flags.dae?.stacks ?? 1;
        if (globalThis.EffectCounter && theTargetToken) {
          const counter = globalThis.EffectCounter.findCounter(theTargetToken, effect.icon)
          if (counter) stackCount = counter.getValue();
        }
        for (let i = 1; i < stackCount; i++)
          damageRollString = `${damageRollString} + ${damageRoll}`;
        //@ts-ignore
        itemData.system.damage.parts = [[damageRollString, damageType]];
      }
      setProperty(itemData.flags, "midi-qol.forceCEOff", true);
      if (killAnim) setProperty(itemData.flags, "autoanimations.killAnim", true)
      if (macroToCall) {
        setProperty(itemData, "flags.midi-qol.onUseMacroName", macroToCall);
        setProperty(itemData, "flags.midi-qol.onUseMacroParts", new OnUseMacros(macroToCall));
      }
      let ownedItem: Item = new CONFIG.Item.documentClass(itemData, { parent: actor });
      if (!actionSave && saveRemove && saveDC > -1)
        failedSaveOverTimeEffectsToDelete[ownedItem.uuid] = { actor, effectId: effect.id };

      if (details.removeCondition) {
        let value = replaceAtFields(details.removeCondition, rollData, { blankValue: 0, maxIterations: 3 });
        let remove;
        try {
          remove = Roll.safeEval(value);
        } catch (err) {
          console.warn("midi-qol | error when evaluating overtime remove condition - assuming true", value, err)
          remove = true;
        }
        if (remove) {
          overTimeEffectsToDelete[ownedItem.uuid] = { actor, effectId: effect.id }
        }
      }


      try {

        const options = {
          showFullCard: false, createWorkflow: true, versatile: false, configureDialog: false, saveDC, checkGMStatus: true, targetUuids: [theTargetUuid],
          workflowOptions: { lateTargeting: "none", autoRollDamage: "onHit", autoFastDamage: true }
        };
        await completeItemUse(ownedItem, {}, options); // worried about multiple effects in flight so do one at a time
      } finally {
      }
    }
  }
}

export async function _processOverTime(combat, data, options, user) {
  let prev = (combat.current.round ?? 0) * 100 + (combat.current.turn ?? 0);
  let testTurn = combat.current.turn ?? 0;
  let testRound = combat.current.round ?? 0;
  const last = (data.round ?? combat.current.round) * 100 + (data.turn ?? combat.current.turn);

  // These changed since overtime moved to _preUpdate function instead of hook
  // const prev = (combat.previous.round ?? 0) * 100 + (combat.previous.turn ?? 0);
  // let testTurn = combat.previous.turn ?? 0;
  // let testRound = combat.previous.round ?? 0;
  // const last = (combat.current.round ?? 0) * 100 + (combat.current.turn ?? 0);

  let toTest = prev;
  let count = 0;
  while (toTest <= last && count < 200) { // step through each turn from prev to current
    count += 1; // make sure we don't do an infinite loop
    const actor = combat.turns[testTurn]?.actor;
    const endTurn = toTest < last;
    const startTurn = toTest > prev;

    // Remove reaction used status from each combatant
    if (actor && toTest !== prev) {
      if (await hasUsedReaction(actor)) await removeReactionUsed(actor);
      if (await hasUsedBonusAction(actor)) await removeBonusActionUsed(actor);
    }

    // Remove any per turn optional bonus effects
    const midiFlags: any = getProperty(actor, "flags.midi-qol");
    if (actor && toTest !== prev && midiFlags) {
      if (midiFlags.optional) {
        for (let key of Object.keys(midiFlags.optional)) {
          if (midiFlags.optional[key].used) {
            await actor.setFlag("midi-qol", `optional.${key}.used`, false)
          }
        }
      }
    }

    if (actor) for (let effect of actor.effects) await doOverTimeEffect(actor, effect, startTurn);

    testTurn += 1;
    if (testTurn === combat.turns.length) {
      testTurn = 0;
      testRound += 1;
      toTest = testRound * 100;
    } else toTest += 1;
  }
}

export async function completeItemRoll(item, options: any) {
  //@ts-ignore .version
  if (isNewerVersion(game.version, "10.278)"))
    console.warn("midi-qol | completeItemRoll(item, options) is deprecated please use completeItemUse(item, config, options)")
  return completeItemUse(item, {}, options);
}
export async function completeItemUse(item, config: any = {}, options: any = { checkGMstatus: false },) {
  let theItem = item;
  if (!(item instanceof CONFIG.Item.documentClass)) {
    // TODO magic items fetch the item call - see when v10 supported
    theItem = new CONFIG.Item.documentClass(await item.item.data(), { parent: item.actor })
  }

  if (game.user?.isGM || !options.checkGMStatus) {

    return new Promise((resolve) => {
      let saveTargets = Array.from(game.user?.targets ?? []).map(t => { return t.id });
      let selfTarget = false;
      if (options.targetUuids && game.user && theItem.system.target.type !== "self") {
        game.user.updateTokenTargets([]);
        for (let targetUuid of options.targetUuids) {
          const theTarget = MQfromUuid(targetUuid);
          if (theTarget) theTarget.object.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
        }
      }
      let hookName = `midi-qol.RollComplete.${item?.uuid}`;
      if (!(item instanceof CONFIG.Item.documentClass)) {
        // Magic items create a pseudo item when doing the roll so have to hope we get the right completion
        hookName = "midi-qol.RollComplete";
      }

      Hooks.once(hookName, (workflow) => {
        if (saveTargets && game.user) {
          game.user?.updateTokenTargets(saveTargets);
          Array.from(game.user?.targets ?? []).map(t => { return t.id });
        }
        resolve(workflow);
      });

      if (item.magicItem) {
        item.magicItem.magicItemActor.roll(item.magicItem.id, item.id)
        //@ts-ignore .version v10
      } else if (installedModules.get("betterrolls5e") && isNewerVersion(game.modules.get("betterrolls5e")?.version ?? "", "1.3.10")) { // better rolls breaks the normal roll process  
        // TODO check this v10
        globalThis.BetterRolls.rollItem(theItem, { itemData: item.toObject(), vanilla: false, adv: 0, disadv: 0, midiSaveDC: options.saveDC }).toMessage()
      } else {
        const result = item.use(config, options).then(result => { if (!result) resolve(result) });
      }
    })
  } else {
    const targetUuids = options.targetUuids ? options.targetUuids : Array.from(game.user?.targets || []).map(t => t.document.uuid); // game.user.targets is always a set of tokens
    const data = {
      itemData: theItem.toObject(),
      actorUuid: theItem.parent.uuid,
      targetUuids,
      config,
      options
    }
    return await timedAwaitExecuteAsGM("completeItemUse", data)
  }
}

export function untargetAllTokens(...args) {
  let combat: Combat = args[0];
  //@ts-ignore - combat.current protected - TODO come back to this
  let prevTurn = combat.current.turn - 1;
  if (prevTurn === -1)
    prevTurn = combat.turns.length - 1;

  const previous = combat.turns[prevTurn];
  if ((game.user?.isGM && ["allGM", "all"].includes(autoRemoveTargets)) || (autoRemoveTargets === "all" && canvas?.tokens?.controlled.find(t => t.id === previous.token?.id))) {
    // release current targets
    game.user?.targets.forEach((t: Token) => {
      t.setTarget(false, { releaseOthers: false });
    });
  }
}

export function checkIncapacitated(actor: Actor, item: Item | undefined = undefined, event: any) {
  //@ts-ignore .system v10
  if (actor?.system.attributes?.hp?.value <= 0) {
    log(`minor-qol | ${actor.name} is incapacitated`)
    ui.notifications?.warn(`${actor.name} is incapacitated`)
    return true;
  }
  return false;
}
export function getUnitDist(x1: number, y1: number, z1: number, token2): number {
  if (!canvas?.dimensions) return 0;
  const unitsToPixel = canvas.dimensions.size / canvas.dimensions.distance;
  z1 = z1 * unitsToPixel;
  const x2 = token2.center.x;
  const y2 = token2.center.y;
  //@ts-ignore
  const z2 = token2.document.elevation * unitsToPixel;

  const d =
    Math.sqrt(
      Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2) + Math.pow(z2 - z1, 2)
    ) / unitsToPixel;
  return d;
}

// not working properly yet
export function getSurroundingHexes(token: Token) {
  let start = canvas?.grid?.grid?.getGridPositionFromPixels(token.center.x, token.center.y);
  // console.error("starting position is ", start);
  if (!start) return;

  const surrounds: any[][] = new Array(11);
  for (let r = 0; r < 11; r++) {
    surrounds[r] = new Array(11);
  }
  for (let c = -5; c <= 5; c++)
    for (let r = -5; r <= 5; r++) {
      const row = start[0] + r;
      const col = start[1] + c
      let [x1, y1] = canvas?.grid?.grid?.getPixelsFromGridPosition(row, col) ?? [0, 0];
      let [x, y] = canvas?.grid?.getCenter(x1, y1) ?? [0, 0];
      if (!x && !y) continue;
      const distance = distancePointToken({ x, y }, token);
      surrounds[r + 5][c + 5] = ({ r: row, c: col, d: distance })
    }
  //  for (let r = -5; r <=5; r++)
  //  console.error("Surrounds are ", ...surrounds[r+5]);
  const filtered = surrounds.map(row => row.filter(ent => {
    const entDist = ent.d / (canvas?.dimensions?.distance ?? 5);
    //@ts-ignore .width v10
    const tokenWidth = token.document.width / 2;
    // console.error(ent.r, ent.c, ent.d, entDist, tokenWidth)
    //@ts-ignore .width v10
    if (token.document.width % 2)
      return entDist >= tokenWidth && entDist <= tokenWidth + 0.5
    else return entDist >= tokenWidth && entDist < tokenWidth + 0.5
  }));
  const hlt = canvas?.grid?.highlightLayers["mylayer"] || canvas?.grid?.addHighlightLayer("mylayer");
  hlt?.clear();

  for (let a of filtered) if (a.length !== 0) {
    a.forEach(item => {
      let [x, y] = canvas?.grid?.grid?.getPixelsFromGridPosition(item.r, item.c) ?? [0, 0];
      // console.error("highlighting ", x, y, item.r, item.c)
      //@ts-ignore
      canvas?.grid?.highlightPosition("mylayer", { x, y, color: game?.user?.color });
    })
    // console.error(...a);
  }
}

export function distancePointToken({ x, y, elevation = 0 }, token, wallblocking = false) {
  if (!canvas || !canvas.scene) return undefined;
  let coverACBonus = 0;
  let tokenTileACBonus = 0;
  let coverData;
  if (!canvas.grid || !canvas.dimensions) undefined;
  if (!token || x == undefined || y === undefined) return undefined;
  if (!canvas || !canvas.grid || !canvas.dimensions) return undefined;
  const t2StartX = -Math.max(0, token.document.width - 1);
  const t2StartY = -Math.max(0, token.document.heidght - 1);
  var d, r, segments: { ray: Ray }[] = [], rdistance, distance;
  const [row, col] = canvas.grid.grid?.getGridPositionFromPixels(x, y) || [0, 0];
  const [xbase, ybase] = canvas.grid.grid?.getPixelsFromGridPosition(row, col) || [0, 0];
  const [xc, yc] = canvas.grid.grid?.getCenter(xbase, ybase) || [0, 0];
  // const snappedOrigin = canvas?.grid?.getSnappedPosition(x,y)
  const origin = new PIXI.Point(x, y);
  const tokenCenter = token.center;
  const ray: Ray = new Ray(origin, tokenCenter)
  distance = canvas?.grid?.grid?.measureDistances([{ ray }], { gridSpaces: false })[0];
  distance = Math.max(0, distance);
  return distance;
}

export function getDistanceSimple(t1: Token, t2: Token, includeCover, wallBlocking = false) {
  return getDistance(t1, t2, includeCover, wallBlocking).distance;
}
/** takes two tokens of any size and calculates the distance between them
*** gets the shortest distance betwen two tokens taking into account both tokens size
*** if wallblocking is set then wall are checked
**/
//TODO change this to TokenData
export function getDistance(t1: any /*Token*/, t2: any /*Token*/, includeCover, wallblocking = false): { distance: number, acBonus: number | undefined } {
  const noResult = { distance: -1, acBonus: undefined }
  if (!canvas || !canvas.scene) return noResult;
  let coverACBonus = 0;
  let tokenTileACBonus = 0;
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

  const t1StartX = t1.document.width >= 1 ? 0.5 : t1.document.width / 2;
  const t1StartY = t1.document.height >= 1 ? 0.5 : t1.document.height / 2;
  const t2StartX = t2.document.width >= 1 ? 0.5 : t2.document.width / 2;
  const t2StartY = t2.document.height >= 1 ? 0.5 : t2.document.height / 2;
  const t1Elevation = t1.document.elevation ?? 0;
  const t2Elevation = t2.document.elevation ?? 0;
  const t1TopElevation = t1Elevation + Math.max(t1.document.height, t1.document.width) * (canvas?.dimensions?.distance ?? 5);
  const t2TopElevation = t2Elevation + Math.min(t2.document.height, t2.document.width) * (canvas?.dimensions?.distance ?? 5); // assume t2 is trying to make itself small

  var x, x1, y, y1, d, r, segments: { ray: Ray }[] = [], rdistance, distance;
  for (x = t1StartX; x < t1.document.width; x++) {
    for (y = t1StartY; y < t1.document.height; y++) {
      const origin = new PIXI.Point(...canvas.grid.getCenter(Math.round(t1.document.x + (canvas.dimensions.size * x)), Math.round(t1.document.y + (canvas.dimensions.size * y))));
      for (x1 = t2StartX; x1 < t2.document.width; x1++) {
        for (y1 = t2StartY; y1 < t2.document.height; y1++) {
          const dest = new PIXI.Point(...canvas.grid.getCenter(Math.round(t2.document.x + (canvas.dimensions.size * x1)), Math.round(t2.document.y + (canvas.dimensions.size * y1))));
          const r = new Ray(origin, dest)
          if (wallblocking && configSettings.optionalRules.wallsBlockRange === "centerLevels" && installedModules.get("levels")) {
            let p1 = {
              x: origin.x,
              y: origin.y,
              //@ts-ignore
              z: t1Elevation
            }
            let p2 = {
              x: dest.x,
              y: dest.y,
              //@ts-ignore
              z: t2Elevation
            }
            //@ts-ignore
            const baseToBase = CONFIG.Levels.API.testCollision(p1, p2, "sight");
            p1.z = t1TopElevation;
            p2.z = t2TopElevation;
            //@ts-ignore
            const topToBase = CONFIG.Levels.API.testCollision(p1, p2, "sight");
            if (baseToBase && topToBase) continue;
          } else if (wallblocking) {
            // TODO use four point rule and work out cover
            switch (configSettings.optionalRules.wallsBlockRange) {
              case "center":
              case "centerLevels":
                if (canvas.walls?.checkCollision(r, { mode: "any" })) continue;
                break;
              case "dnd5eHelpers":
              case "dnd5eHelpersAC":
                if (!includeCover) {
                  if (canvas.walls?.checkCollision(r, { mode: "any" })) continue;
                }
                //@ts-ignore 
                else if (installedModules.get("dnd5e-helpers") && window.CoverCalculator) {
                  //@ts-ignore TODO this is being called in the wrong spot (should not do the loops if using this)
                  if (coverData.data.results.cover === 3) continue; // TODO check this v10
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
  if (segments.length === 0) {
    return noResult;
  }
  //@ts-ignore
  rdistance = segments.map(ray => canvas.grid.measureDistances([ray], { gridSpaces: true })[0]);
  distance = rdistance[0];
  rdistance.forEach(d => { if (d < distance) distance = d; });
  if (configSettings.optionalRules.distanceIncludesHeight) {
    let heightDifference = 0;
    let t1ElevationRange = Math.max(t1.document.height, t1.document.width) * (canvas?.dimensions?.distance ?? 5);
    if (Math.abs(t2Elevation - t1Elevation) < t1ElevationRange) {
      // token 2 is within t1's size so height difference is functionally 0
      heightDifference = 0;
    } else if (t1Elevation < t2Elevation) { // t2 above t1
      heightDifference = t2Elevation - t1TopElevation;
    } else if (t1Elevation > t2Elevation) { // t1 above t2
      heightDifference = t1Elevation - t2TopElevation;
    }
    //@ts-ignore diagonalRule from DND5E
    const rule = canvas.grid.diagonalRule
    if (["555", "5105"].includes(rule)) {
      let nd = Math.min(distance, heightDifference);
      let ns = Math.abs(distance - heightDifference);
      distance = nd + ns;
      let dimension = canvas?.dimensions?.distance ?? 5;
      if (rule === "5105") distance = distance + Math.floor(nd / 2 / dimension) * dimension;

    } else distance = Math.sqrt(heightDifference * heightDifference + distance * distance);
  }
  return { distance, acBonus: coverACBonus + tokenTileACBonus }; // TODO update this with ac bonus
};

let pointWarn = debounce(() => {
  ui.notifications?.warn("4 Point LOS check selected but dnd5e-helpers not installed")
}, 100)

export function checkRange(item, token, targets): string {
  if (!canvas || !canvas.scene) return "normal"
  // check that a range is specified at all
  if (!item.system.range) return "normal";
  //TODO think about setting default range for mwak/etc
  // if (["mwak", "msak", "mpak"].includes(itemData.actionType) && !itemData.properties?.thr) {
  //    itemData.range.value = 5; // set default range for melee attacks
  //}

  if (!token) return "fail";
  let actor = token.actor;
  if (!item.system.range.value && !item.system.range.long && item.system.range.units !== "touch") return "normal";
  if (item.system.target?.type === "self") return "normal";
  // skip non mwak/rwak/rsak/msak types that do not specify a target type
  if (!allAttackTypes.includes(item.system.actionType) && !["creature", "ally", "enemy"].includes(item.system.target?.type)) return "normal";

  if (!token) {
    if (debugEnabled > 0) warn(`${game.user?.name} no token selected cannot check range`)
    ui.notifications?.warn(`${game.user?.name} no token selected`)
    return "fail";
  }

  let range = item.system.range?.value || 0;
  let longRange = item.system.range?.long || 0;
  if (getProperty(actor, "flags.midi-qol.sharpShooter") && range < longRange) range = longRange;
  if (item.system.actionType === "rsak" && getProperty(actor, "flags.dnd5e.spellSniper")) {
    range = 2 * range;
    longRange = 2 * longRange;
  }
  if (item.system.range.units === "touch") {
    range = canvas?.dimensions?.distance ?? 5;
    longRange = 0;
  }
  if (["mwak", "msak", "mpak"].includes(item.system.actionType) && !item.system.properties?.thr) longRange = 0;
  for (let target of targets) {
    if (target === token) continue;
    // check the range
    if (target.actor) setProperty(target.actor, "flags.midi-qol.acBonus", 0);
    const distanceDetails = getDistance(token, target, true, true);
    let distance = distanceDetails.distance;
    // spell sniper ignores cover ac bonus for rsak spells
    if (target.actor && distanceDetails.acBonus && (item?.system.actionType !== "rsak" || !getProperty(actor, "flags.dnd5e.spellSniper")))
      setProperty(target.actor, "flags.midi-qol.acBonus", distanceDetails.acBonus);
    if ((longRange !== 0 && distance > longRange) || (distance > range && longRange === 0)) {
      log(`${target.name} is too far ${distance} from your character you cannot hit`)
      ui.notifications?.warn(`${actor.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`)
      return "fail";
    }
    if (distance > range) return "dis";
    if (distance < 0) {
      log(`${target.name} is blocked by a wall`)
      ui.notifications?.warn(`${actor.name}'s target is blocked by a wall`)
      return "fail";
    }
  }
  return "normal";
}

export function isAutoFastAttack(workflow: Workflow | undefined = undefined): boolean {
  if (workflow?.workflowOptions?.autoFastAttack !== undefined) return workflow.workflowOptions.autoFastAttack;
  if (workflow && workflow.workflowType === "DummyWorkflow") return workflow.rollOptions.fastForward;
  return game.user?.isGM ? configSettings.gmAutoFastForwardAttack : ["all", "attack"].includes(configSettings.autoFastForward);
}

export function isAutoFastDamage(workflow: Workflow | undefined = undefined): boolean {
  if (workflow?.workflowOptions?.autoFastDamage !== undefined) return workflow.workflowOptions.autoFastDamage;
  if (workflow?.workflowType === "DummyWorkflow") return workflow.rollOptions.fastForwardDamage;
  return game.user?.isGM ? configSettings.gmAutoFastForwardDamage : ["all", "damage"].includes(configSettings.autoFastForward)
}

export function isAutoConsumeResource(workflow: Workflow | undefined = undefined): string {
  if (workflow?.workflowOptions.autoConsumeResource !== undefined) return workflow?.workflowOptions.autoConsumeResource;
  return game.user?.isGM ? configSettings.gmConsumeResource : configSettings.consumeResource;
}

export function getAutoRollDamage(workflow: Workflow | undefined = undefined): string {
  if (workflow?.workflowOptions?.autoRollDamage) {
    const damageOptions = Object.keys(geti18nOptions("autoRollDamageOptions"));
    if (damageOptions.includes(workflow.workflowOptions.autoRollDamage))
      return workflow.workflowOptions.autoRollDamage;
    console.warn(`midi-qol | could not find ${workflow.workflowOptions.autoRollDamage} workflowOptions.autoRollDamage must be ond of ${damageOptions} defaulting to "onHit"`)
    return "onHit";
  }
  return game.user?.isGM ? configSettings.gmAutoDamage : configSettings.autoRollDamage;
}

export function getAutoRollAttack(workflow: Workflow | undefined = undefined): boolean {
  if (workflow?.workflowOptions?.autoRollAttack !== undefined)
    return workflow.workflowOptions.autoRollAttack;
  return game.user?.isGM ? configSettings.gmAutoAttack : configSettings.autoRollAttack;
}

export function getLateTargeting(workflow: Workflow | undefined = undefined): String {
  if (workflow?.workflowOptions?.lateTargeting !== undefined) return workflow?.workflowOptions?.lateTargeting;
  return game.user?.isGM ? configSettings.gmLateTargeting : lateTargeting;
}

export function itemHasDamage(item) {
  return item?.system.actionType !== "" && item?.hasDamage;
}

export function itemIsVersatile(item) {
  return item?.system.actionType !== "" && item?.isVersatile;
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

export function getReactionSetting(player: User | null | undefined): string {
  if (!player) return "none";
  return player.isGM ? configSettings.gmDoReactions : configSettings.doReactions;
}

export function getTokenPlayerName(token: TokenDocument | Token) {
  if (!token) return game.user?.name;
  if (!installedModules.get("combat-utility-belt")) return token.name;
  if (!game.settings.get("combat-utility-belt", "enableHideNPCNames")) return token.name;
  //@ts-ignore .flags v10
  if (getProperty(token.actor?.flags ?? {}, "combat-utility-belt.enableHideName"))
    //@ts-ignore .flags v10
    return getProperty(token.actor?.flags ?? {}, "combat-utility-belt.hideNameReplacement")
  if (token.actor?.hasPlayerOwner) return token.name;
  //@ts-ignore .disposition
  switch ((token.document ?? token).disposition) {
    case -1:
      if (game.settings.get("combat-utility-belt", "enableHideHostileNames"))
        return game.settings.get("combat-utility-belt", "hostileNameReplacement")
      break;
    case 1:

      if (game.settings.get("combat-utility-belt", "enableHideFriendlyNames"))
        return game.settings.get("combat-utility-belt", "friendlyNameReplacement")
    default:
    case 0:
      if (game.settings.get("combat-utility-belt", "enableHideNeutralNames"))
        return game.settings.get("combat-utility-belt", "neutralNameReplacement")
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

export interface ConcentrationData {
  item: any;
  targets: Set<Token>;
  templateUuid: string;
}
export async function addConcentration(actor, concentrationData: ConcentrationData) {
  await addConcentrationEffect(actor, concentrationData );
  await setConcentrationData(actor, concentrationData);
}
// Add the concentration marker to the character and update the duration if possible
export async function addConcentrationEffect(actor, concentrationData: ConcentrationData) {
  const item = concentrationData.item;
  // await item.actor.unsetFlag("midi-qol", "concentration-data");
  let selfTarget = actor.token ? actor.token.object : await getSelfTarget(actor);
  if (!selfTarget) return;
  let statusEffect;
  if (installedModules.get("dfreds-convenient-effects")) {
    statusEffect = CONFIG.statusEffects.find(se => se.id === "Convenient Effect: Concentrating");
  }
  if (!statusEffect && installedModules.get("combat-utility-belt")) {
    const conditionName = game.settings.get("combat-utility-belt", "concentratorConditionName")
    statusEffect = CONFIG.statusEffects.find(se => se.id.startsWith("combat-utility-belt") && se.label == conditionName);
  }
  if (statusEffect) { // found a cub or convenient status effect.
    const itemDuration = item?.system.duration;
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
    setProperty(statusEffect.flags, "midi-qol.isConcentration", statusEffect.origin);
    setProperty(statusEffect.flags, "dae.transfer", false);
    setProperty(statusEffect, "transfer", false);

    const existing = selfTarget.actor?.effects.find(e => e.getFlag("core", "statusId") === statusEffect.id);
    if (!existing) {
      return await selfTarget.toggleEffect(statusEffect, { active: true })
      setTimeout(
        () => {
          selfTarget.toggleEffect(statusEffect, { active: true })
        }, 100);
      // return await selfTarget.toggleEffect(statusEffect, { active: true })
    }
    return true;
  } else {
    let concentrationName = i18n("midi-qol.Concentrating");
    const existing = selfTarget.actor?.effects.find(e => e.label === concentrationName);
    if (existing) return undefined; // make sure that we don't double apply concentration

    const inCombat = (game.combat?.turns.some(combatant => combatant.token?.id === selfTarget.id));
    const effectData = {
      changes: [],
      origin: item.uuid, //flag the effect as associated to the spell being cast
      disabled: false,
      icon: itemJSONData.img,
      label: concentrationName,
      duration: {},
      flags: {
        "midi-qol": { isConcentration: item?.uuid },
        "dae": { transfer: false }
      }
    }
    if (installedModules.get("dae")) {
      const convertedDuration = globalThis.DAE.convertDuration(item.system.duration, inCombat);
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
    return await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  }
}

export async function setConcentrationData(actor, concentrationData: ConcentrationData) {
  if (actor && concentrationData.targets) {
    let targets: { tokenUuid: string | undefined, actorUuid: string | undefined }[] = [];
    const selfTargetUuid = actor.uuid;
    let selfTargeted = false;
    for (let hit of concentrationData.targets) {
      const tokenUuid = hit.document?.uuid ?? hit.uuid;
      const actorUuid = hit.actor?.uuid ?? "";
      targets.push({ tokenUuid, actorUuid });
      if (selfTargetUuid === actorUuid) selfTargeted = true;
    }

    if (!selfTargeted) {
      let selfTarget = actor.token ? actor.token.object : await getSelfTarget(actor);
      targets.push({ tokenUuid: selfTarget.uuid, actorUuid: actor.uuid })
    }
    let templates = concentrationData.templateUuid ? [concentrationData.templateUuid] : [];
    await actor.setFlag("midi-qol", "concentration-data", { uuid: concentrationData.item.uuid, targets: targets, templates: templates, removeUuids: [] })
  }
}

/** 
 * Find tokens nearby
 * @param {number|null} disposition. same(1), opposite(-1), neutral(0), ignore(null) token disposition
 * @param {Token} token The token to search around
 * @param {number} distance in game units to consider near
 */

export function findNearby(disposition: number | null, token: any /*Token | undefined */, distance: number, maxSize: number | undefined = undefined): Token[] {
  if (!token) return [];
  if (!(token instanceof Token)) { throw new Error("find nearby token is not of type token") };
  if (!canvas || !canvas.scene) return [];
  //@ts-ignore .disposition v10
  let targetDisposition = token.document.disposition * (disposition ?? 0);
  let nearby = canvas.tokens?.placeables.filter(t => {
    //@ts-ignore .height .width v10
    if (maxSize && t.document.height * t.document.width > maxSize) return false;
    if (t.actor &&
      t.id !== token.id && // not the token
      //@ts-ignore attributes
      t.actor.system.attributes?.hp?.value > 0 && // not incapacitated
      //@ts-ignore .disposition v10      
      (disposition === null || t.document.disposition === targetDisposition)) {
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

  //@ts-ignore specialStatusEffects
  if (condition === "invisible" && (token.document ?? token).hasStatusEffect(CONFIG.specialStatusEffects.INVISIBLE)) return true;
  if ((token.document ?? token).hasStatusEffect(condition)) return true;

  //@ts-ignore
  if (installedModules.get("conditional-visibility") && token.actor && game.modules.get('conditional-visibility').api.hasCondition(token, condition)) return true;
  //@ts-ignore
  const cub = game.cub;
  if (installedModules.get("combat-utility-belt") && condition === "invisible" && cub.hasCondition("Invisible", [token], { warn: false })) return true;
  if (installedModules.get("combat-utility-belt") && condition === "hidden" && cub.hasCondition("Hidden", [token], { warn: false })) return true;
  //@ts-ignore
  const CEInt = game.dfreds?.effectInterface;
  if (installedModules.get("dfreds-convenient-effects")) {
    const localCondition = i18n(`midi-qol.${condition}`);
    if (CEInt.hasEffectApplied(localCondition, token.actor.uuid)) return true;
  }
  return false;
}

export async function removeInvisible() {
  if (!canvas || !canvas.scene) return;
  const token: Token | undefined = canvas.tokens?.get(this.tokenId);
  if (!token) return;
  // 
  await removeTokenCondition(token, i18n(`midi-qol.${"invisible"}`));
  await removeTokenCondition(token, i18n(`conditional-visibility.${"invisible"}`));
  //@ts-ignore
  await (token.document ?? token).toggleActiveEffect({ id: CONFIG.specialStatusEffects.INVISIBLE }, { active: false });
  log(`Hidden/Invisibility removed for ${this.actor.name} due to attack`)
}

export async function removeHidden() {
  if (!canvas || !canvas.scene) return;
  const token: Token | undefined = canvas.tokens?.get(this.tokenId);
  if (!token) return;
  // 
  await removeTokenCondition(token, i18n(`midi-qol.${"hidden"}`));
  await removeTokenCondition(token, "Stealth (CV)");
  await removeTokenCondition(token, "Stealthed (CV)");
  await removeTokenCondition(token, i18n(`conditional-visibility.${"hidden"}`));
  await removeTokenCondition(token, i18n(`conditional-visibility.${"stealthed"}`));
  await removeTokenCondition(token, i18n(`conditional-visibility.${"stealth"}`));
  //@ts-ignore
  log(`Hidden removed for ${this.actor.name} due to attack`)
}

export async function removeTokenCondition(token: Token, condition: string) {
  if (!token) return;
  //@ts-ignore .label v10
  const hasEffect = token.actor?.effects.find(ef => ef.label === condition);
  if (hasEffect) await hasEffect.delete();
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
      const specialDuration = getProperty(ef.flags, "dae.specialDuration");
      return [(expireAction && specialDuration?.includes("1Action")),
      (expireAttack && specialDuration?.includes("1Attack") && this.item?.hasAttack),
      (expireHit && this.item?.hasAttack && specialDuration?.includes("1Hit") && this.hitTargets.size > 0)]
    })
    if (debugEnabled > 1) debug("expiry map is ", test)
  }
  const myExpiredEffects = this.actor.effects?.filter(ef => {
    const specialDuration = getProperty(ef.flags, "dae.specialDuration");
    if (!specialDuration || !specialDuration?.length) return false;
    return (expireAction && specialDuration.includes("1Action")) ||
      (expireAttack && this.item?.hasAttack && specialDuration.includes("1Attack")) ||
      (expireSpell && this.item?.type === "spell" && specialDuration.includes("1Spell")) ||
      (expireAttack && this.item?.hasAttack && specialDuration.includes(`1Attack:${this.item?.system.actionType}`)) ||
      (expireHit && this.item?.hasAttack && specialDuration.includes("1Hit") && this.hitTargets.size > 0) ||
      (expireHit && this.item?.hasAttack && specialDuration.includes(`1Hit:${this.item?.system.actionType}`) && this.hitTargets.size > 0) ||
      (expireDamage && this.item?.hasDamage && specialDuration.includes("DamageDealt")) ||
      (expireInitiative && specialDuration.includes("Initiative"))
  }).map(ef => ef.id);
  if (debugEnabled > 1) debug("expire my effects", myExpiredEffects, expireAction, expireAttack, expireHit);
  this.effectsAlreadyExpired = this.effectsAlreadyExpired.concat(effectsToExpire);
  if (myExpiredEffects?.length > 0) await this.actor?.deleteEmbeddedDocuments("ActiveEffect", myExpiredEffects, { "expiry-reason": `midi-qol:${effectsToExpire}` });
}

export async function expireRollEffect(rolltype: string, abilityId: string, success: boolean | undefined) {
  const rollType = rolltype.charAt(0).toUpperCase() + rolltype.slice(1)
  const expiredEffects = this.effects?.filter(ef => {
    const specialDuration = getProperty(ef.flags, "dae.specialDuration");
    if (!specialDuration) return false;
    if (specialDuration.includes(`is${rollType}`)) return true;
    if (specialDuration.includes(`is${rollType}.${abilityId}`)) return true;
    if (success === true && specialDuration.includes(`is${rollType}Success`)) return true;
    if (success === true && specialDuration.includes(`is${rollType}Success.${abilityId}`)) return true;
    if (success === false && specialDuration.includes(`is${rollType}Failure`)) return true;
    if (success === false && specialDuration.includes(`is${rollType}Failure.${abilityId}`)) return true;

    return false;
  }).map(ef => ef.id);
  if (expiredEffects?.length > 0) {
    timedAwaitExecuteAsGM("removeEffects", {
      actorUuid: this.uuid,
      effects: expiredEffects,
      options: { "midi-qol": `special-duration:${rollType}:${abilityId}` }
    });
  }
}

// TODO revisit the whole synth token piece. find out why USERTARGETS is not
export function validTargetTokens(tokenSet: Set<Token> | undefined | any): Set<Token> {
  if (!canvas || !canvas.scene) return tokenSet;
  if (!tokenSet) return new Set();
  if (!game.modules.get("multilevel-tokens")?.active) return tokenSet;
  const multiLevelTokens = [...tokenSet].filter(t => getProperty(t.document, "flags.multilevel-tokens"));
  //@ts-ignore t.document.flags
  // const localTokens = multiLevelTokens.filter(t => canvas.tokens?.get(t.document.flags["multilevel-tokens"].stoken))
  let normalTokens = [...tokenSet].filter(a => a.actor);
  multiLevelTokens.forEach(mlt => {
    ui.notifications?.warn(`midi-qol You cannot target Multi Level Token ${mlt.name}`);
  })
  return new Set(normalTokens);
  // TODO revisit this to see if the rest of midi can work with MLT
  let synthTokens = multiLevelTokens.map(t => {
    const mlFlags: any = t.flags["multilevel-tokens"];
    let tokenDocument = MQfromUuid(`Scene.${mlFlags.sscene ?? canvas?.scene?.id}.Token.${mlFlags.stoken}`);
    tokenDocument = deepClone(tokenDocument);
    tokenDocument.x = t.x;
    tokenDocument.y = t.y;
    t.document = tokenDocument;
    return t;
  });
  return new Set(normalTokens.concat(synthTokens));
}

export function MQfromUuid(uuid): any | null {
  if (!uuid || uuid === "") return null;
  //@ts-ignore foundry v10 types
  return fromUuidSync(uuid)
}

export function MQfromActorUuid(uuid): any | null {
  let doc = MQfromUuid(uuid);
  //@ts-ignore doc.actor: any rather than Actor
  if (doc instanceof CONFIG.Token.documentClass) return doc.actor;
  if (doc instanceof CONFIG.Actor.documentClass) return doc;
  return null;
}


class RollModifyDialog extends Application {
  rollExpanded: boolean;

  data: {
    //@ts-ignore dnd5e v10
    actor: globalThis.dnd5e.documents.Actor5e,
    flags: string[],
    flagSelector: string,
    targetObject: any,
    rollId: string,
    rollTotalId: string,
    rollHTMLId: string,
    title: string,
    content: HTMLElement | JQuery<HTMLElement> | string,
    currentRoll: Roll,
    rollHTML: string,
    callback: () => {},
    close: () => {},
    buttons: any
  }

  constructor(data, options) {
    options.height = "auto";
    options.resizable = true;
    super(options);
    this.data = data;
    this.rollExpanded = false;
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      template: "modules/midi-qol/templates/dialog.html",
      classes: ["dialog"],
      width: 600,
      jQuery: true
    }, { overwrite: true });
  }
  get title() {
    return this.data.title || "Dialog";
  }

  async getData(options) {
    this.data.flags = this.data.flags.filter(flagName => {
      if ((getOptionalCountRemaining(this.data.actor, `${flagName}.count`)) < 1) return false;
      return getProperty(this.data.actor, flagName) !== undefined
    });
    if (this.data.flags.length === 0) this.close();
    this.data.buttons = this.data.flags.reduce((obj, flag) => {
      const flagData = getProperty(this.data.actor, flag);
      let value = getProperty(flagData, this.data.flagSelector);
      if (value !== undefined) {
        const labelDetail = Roll.replaceFormulaData(value, this.data.actor.getRollData())
        obj[randomID()] = {
          icon: '<i class="fas fa-dice-d20"></i>',
          //          label: (flagData.label ?? "Bonus") + `  (${getProperty(flagData, this.data.flagSelector) ?? "0"})`,
          label: (flagData.label ?? "Bonus") + `  (${labelDetail})`,
          value,
          key: flag,
          callback: this.data.callback
        }
      }
      let selector = this.data.flagSelector.split(".");
      selector[selector.length - 1] = "all";
      const allSelector = selector.join(".");
      value = getProperty(flagData, allSelector);
      if (value !== undefined) {
        const labelDetail = Roll.replaceFormulaData(value, this.data.actor.getRollData());

        obj[randomID()] = {
          icon: '<i class="fas fa-dice-d20"></i>',
          //          label: (flagData.label ?? "Bonus") + `  (${getProperty(flagData, allSelector) ?? "0"})`,
          label: (flagData.label ?? "Bonus") + `  (${labelDetail})`,
          value,
          key: flag,
          callback: this.data.callback
        }
      }
      return obj;
    }, {})
    // this.data.content = await midiRenderRoll(this.data.currentRoll);
    //@ts-ignore
    // this.data.content = await this.data.currentRoll.render();
    return {
      content: this.data.content, // This is set by the callback
      buttons: this.data.buttons
    }
  }

  activateListeners(html) {
    html.find(".dialog-button").click(this._onClickButton.bind(this));
    $(document).on('keydown.chooseDefault', this._onKeyDown.bind(this));
    html.on("click", ".dice-roll", this._onDiceRollClick.bind(this));
  }

  _onDiceRollClick(event) {
    event.preventDefault();
    // Toggle the message flag
    let roll = event.currentTarget;
    this.rollExpanded = !this.rollExpanded

    // Expand or collapse tooltips
    const tooltips = roll.querySelectorAll(".dice-tooltip");
    for (let tip of tooltips) {
      if (this.rollExpanded) $(tip).slideDown(200);
      else $(tip).slideUp(200);
      tip.classList.toggle("expanded", this.rollExpanded);
    }
  }

  _onClickButton(event) {
    const oneUse = true;
    const id = event.currentTarget.dataset.button;
    const button = this.data.buttons[id];
    this.submit(button);
  }

  _onKeyDown(event) {
    // Close dialog
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  async submit(button) {
    try {
      if (button.callback) {
        await button.callback(this, button);
        // await this.getData({}); Render will do a get data, doing it twice breaks the button data?
        this.render(true);
      }
      // this.close();
    } catch (err) {
      ui.notifications?.error("midi-qol | Optional flag roll error see console for details ");
      error(err);
    }
  }

  async close() {
    if (this.data.close) this.data.close();
    $(document).off('keydown.chooseDefault');
    return super.close();
  }
}

export async function processAttackRollBonusFlags() { // bound to workflow
  let attackBonus = "attack.all";
  if (this.item && this.item.hasAttack) attackBonus = `attack.${this.item.system.actionType}`;
  const optionalFlags = getProperty(this, "actor.flags.midi-qol.optional") ?? {};
  let bonusFlags = Object.keys(optionalFlags)
    .filter(flag => {
      const hasAttackFlag = getProperty(this.actor.flags, `midi-qol.optional.${flag}.attack.all`) !== undefined ||
        getProperty(this.actor.flags, `midi-qol.optional.${flag}.${attackBonus}`) !== undefined;
      if (!hasAttackFlag) return false;
      if (!this.actor.flags["midi-qol"].optional[flag].count) return true;
      return getOptionalCountRemainingShortFlag(this.actor, flag) > 0;
    })
    .map(flag => `flags.midi-qol.optional.${flag}`);

  if (bonusFlags.length > 0) {
    this.attackRollHTML = await midiRenderRoll(this.attackRoll);
    await bonusDialog.bind(this)(bonusFlags, attackBonus, true, `${this.actor.name} - ${i18n("DND5E.Attack")} ${i18n("DND5E.Roll")}`, "attackRoll", "attackTotal", "attackRollHTML")
  }
  if (this.targets.size === 1) {
    const targetAC = this.targets.entries().next().value[0].actor.system.attributes.ac.value;
    this.processAttackRoll();
    const isMiss = this.isFumble || this.attackRoll.total < targetAC;
    if (isMiss) {
      bonusFlags = Object.keys(this.actor.flags["midi-qol"]?.optional ?? [])
        .filter(flag => {
          const hasAttackFlag = getProperty(this.actor.flags, `midi-qol.optional.${flag}.attack.fail`) !== undefined;
          if (!hasAttackFlag) return false;
          if (!this.actor.flags["midi-qol"].optional[flag].count) return true;
          return getOptionalCountRemainingShortFlag(this.actor, flag) > 0;
        })
        .map(flag => `flags.midi-qol.optional.${flag}`);
      attackBonus = "attack.fail"
      if (bonusFlags.length > 0) {
        this.attackRollHTML = await midiRenderRoll(this.attackRoll);
        await bonusDialog.bind(this)(bonusFlags, attackBonus, true, `${this.actor.name} - ${i18n("DND5E.Attack")} ${i18n("DND5E.Roll")}`, "attackRoll", "attackTotal", "attackRollHTML")
      }
    }
  }
  return this.attackRoll;
}

export async function processDamageRollBonusFlags(): Promise<Roll> { // bound to a workflow
  let damageBonus = "damage.all";
  if (this.item) damageBonus = `damage.${this.item.system.actionType}`;
  const optionalFlags = getProperty(this, "actor.flags.midi-qol.optional") ?? {};
  const bonusFlags = Object.keys(optionalFlags)
    .filter(flag => {
      const hasDamageFlag = getProperty(this.actor.flags, `midi-qol.optional.${flag}.damage.all`) !== undefined ||
        getProperty(this.actor.flags, `midi-qol.optional.${flag}.${damageBonus}`) !== undefined;
      if (!hasDamageFlag) return false;
      return getOptionalCountRemainingShortFlag(this.actor, flag) > 0;
    })
    .map(flag => `flags.midi-qol.optional.${flag}`);
  if (bonusFlags.length > 0) {
    this.damageRollHTML = await midiRenderRoll(this.damageRoll);
    await bonusDialog.bind(this)(bonusFlags, damageBonus, false, `${this.actor.name} - ${i18n("DND5E.Damage")} ${i18n("DND5E.Roll")}`, "damageRoll", "damageTotal", "damageRollHTML")
  }
  return this.damageRoll;
}

export async function bonusDialog(bonusFlags, flagSelector, showRoll, title, rollId: string, rollTotalId: string, rollHTMLId: string) {
  return new Promise((resolve, reject) => {
    const callback = async (dialog, button) => {
      let newRoll;
      let reRoll;
      if (!hasEffectGranting(this.actor, button.key, flagSelector)) return;
      switch (button.value) {
        case "reroll": reRoll = await this[rollId].reroll({ async: true });
          newRoll = reRoll; break;
        case "reroll-kh": reRoll = await this[rollId].reroll({ async: true });
          newRoll = reRoll;
          if (reRoll.total <= this[rollId].total) newRoll = this[rollId]; break;
        case "reroll-kl": reRoll = await this[rollId].reroll({ async: true });
          newRoll = reRoll;
          if (reRoll.total > this[rollId].total) newRoll = this[rollId]; break;
        case "reroll-max": newRoll = await this[rollId].reroll({ async: true, maximize: true }); break;
        case "reroll-min": newRoll = await this[rollId].reroll({ async: true, minimize: true }); break;
        case "success": newRoll = await new Roll("99").evaluate({ async: true }); break;
        default:
          if (typeof button.value === "string" && button.value.startsWith("replace ")) {
            const rollParts = button.value.split(" ");
            newRoll = new Roll(rollParts.slice(1).join(" "), (this.item ?? this.actor).getRollData());
          } else if (flagSelector.startsWith("damage.") && getProperty(this.actor, `${button.key}.criticalDamage`)) {
            const rollOptions = { critical: (this.isCritical || this.rollOptions.critical) };
            //@ts-ignore DamageRoll
            newRoll = new CONFIG.Dice.DamageRoll(`${this[rollId].result} + ${button.value}`, this.actor.getRollData(), rollOptions);
          } else {
            newRoll = new Roll(`${this[rollId].result} + ${button.value}`, (this.item ?? this.actor).getRollData());
          }
          newRoll = await newRoll.evaluate({ async: true });
          break;
      }
      if (showRoll && this.category === "ac") { // TODO do a more general fix for displaying this stuff
        const player = playerForActor(this.actor)?.id ?? "";
        // const oldRollHTML = await this[rollId].render() ?? this[rollId].result
        const newRollHTML = await midiRenderRoll(newRoll);
        const chatData: any = {
          // content: `${this[rollId].result} -> ${newRoll.formula} = ${newRoll.total}`,
          flavor: game.i18n.localize("DND5E.ArmorClass"),
          content: `${newRollHTML}`,
          whisper: [player]
        };
        const chatMessage = await ChatMessage.create(chatData);
      } else if (showRoll) {
        const oldRollHTML = await this[rollId].render() ?? this[rollId].result
        const player = playerForActor(this.actor)?.id ?? "";
        const newRollHTML = reRoll ? await midiRenderRoll(reRoll) : await midiRenderRoll(newRoll);
        const chatData: any = {
          // content: `${this[rollId].result} -> ${newRoll.formula} = ${newRoll.total}`,
          flavor: `${title} ${button.value}`,
          content: `${oldRollHTML}<br>${newRollHTML}`,
          whisper: [player]
        };
        const chatMessage = await ChatMessage.create(chatData);
      }
      this[rollId] = newRoll;
      this[rollTotalId] = newRoll.total;
      this[rollHTMLId] = await midiRenderRoll(newRoll);
      const macroToCall = getProperty(this.actor, `${button.key}.macroToCall`)?.trim();
      if (macroToCall) {
        if (this instanceof Workflow) {
          const macroData = this.getMacroData();
          this.callMacro(this.item, macroToCall, macroData)
        } else if (this.actor) {
          let item;
          if (typeof macroToCall === "string" && macroToCall.startsWith("ItemMacro.")) {
            const itemName = macroToCall.split(".").slice(1).join(".");
            item = this.actor.items.getName(itemName);
          }
          const dummyWorkflow = new DummyWorkflow(this.actor, item, ChatMessage.getSpeaker({ actor: this.actor }), [], {});
          dummyWorkflow.callMacro(item, macroToCall, dummyWorkflow.getMacroData())
        } else console.warn(`midi-qol | RollModifyDialog no way to call macro ${macroToCall}`)
      }

      dialog.data.rollHTML = this[rollHTMLId];
      dialog.data.content = this[rollHTMLId];
      await removeEffectGranting(this.actor, button.key);
      bonusFlags = bonusFlags.filter(bf => bf !== button.key)
      // this.actor.reset();
      if (bonusFlags.length === 0) { 

        dialog.close();
        resolve(null);
      }
      dialog.data.flags = bonusFlags;
      dialog.render(true);
      // dialog.close();
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

//@ts-ignore dnd5e v10
export function getOptionalCountRemainingShortFlag(actor: globalThis.dnd5e.documents.Actor5e, flag: string) {
  return getOptionalCountRemaining(actor, `flags.midi-qol.optional.${flag}.count`) && getOptionalCountRemaining(actor, `flags.midi-qol.optional.${flag}.countAlt`)

  return getOptionalCountRemaining(actor, `flags.midi-qol.optional.${flag}.count`)
}
//@ts-ignore dnd5e v10
export function getOptionalCountRemaining(actor: globalThis.dnd5e.documents.Actor5e, flag: string) {
  const countValue = getProperty(actor, flag);
  if (!countValue) return 1;

  if (["turn", "each-round", "each-turn"].includes(countValue) && game.combat) {
    let usedFlag = flag.replace(".countAlt", ".used");
    usedFlag = flag.replace(".count", ".used");
    // check for the flag
    if (getProperty(actor, usedFlag)) return 0;
  } else if (countValue === "reaction") {
    // return await hasUsedReaction(actor)
    return actor.getFlag("midi-qol", "reactionCombatRound") && needsReactionCheck(actor) ? 0 : 1;
  } else if (countValue === "every") return 1;
  if (Number.isNumeric(countValue)) return countValue;
  if (countValue.startsWith("ItemUses.")) {
    const itemName = countValue.split(".")[1];
    const item = actor.items.getName(itemName);
    return item?.system.uses.value;
  }
  if (countValue.startsWith("@")) {
    let result = getProperty(actor.system, countValue.slice(1))
    return result;
  }
  return 1; //?? TODO is this sensible? Probably yes since monks get always on optional rolls
}

//@ts-ignore dnd5e v10
export async function removeEffectGranting(actor: globalThis.dnd5e.documents.Actor5e, changeKey: string) {
  const effect = actor.effects.find(ef => ef.changes.some(c => c.key.includes(changeKey)))
  if (effect === undefined) return;
  const effectData = effect.toObject();

  const count = effectData.changes.find(c => c.key.includes(changeKey) && c.key.endsWith(".count"));
  const countAlt = effectData.changes.find(c => c.key.includes(changeKey) && c.key.endsWith(".countAlt"));
  if (!count) {
    return actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id], { "expiry-reason": "midi-qol:optionalConsumed" })
  }
  if (Number.isNumeric(count.value) || Number.isNumeric(countAlt?.value)) {
    if (count.value <= 1 || countAlt?.value <= 1)
      return actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id], { "expiry-reason": "midi-qol:optionalConsumed" })
    else if (Number.isNumeric(count.value)) {
      count.value = `${count.value - 1}`; // must be a string
    } else if (Number.isNumeric(countAlt?.value)) {
      countAlt.value = `${countAlt.value - 1}`; // must be a string
    }
    actor.updateEmbeddedDocuments("ActiveEffect", [effectData], { "expiry-reason": "midi-qol:optionalConsumed" })
  }
  if (typeof count.value === "string" && count.value.startsWith("ItemUses.")) {
    const itemName = count.value.split(".")[1];
    const item = actor.items.getName(itemName);
    if (!item) {
      ui.notifications?.warn(`midi-qol | could not decrement uses for ${itemName} on actor ${actor.name}`);
      console.warn(`midi-qol | could not decrement uses for ${itemName} on actor ${actor.name}`);
      return;
    }
    await item.update({ "system.uses.value": Math.max(0, item.system.uses.value - 1) });
  }
  if (typeof countAlt?.value === "string" && countAlt.value.startsWith("ItemUses.")) {
    const itemName = countAlt.value.split(".")[1];
    const item = actor.items.getName(itemName);
    if (!item) {
      ui.notifications?.warn(`midi-qol | could not decrement uses for ${itemName} on actor ${actor.name}`);
      console.warn(`midi-qol | could not decrement uses for ${itemName} on actor ${actor.name}`);
      return;
    }
    await item.update({ "system.uses.value": Math.max(0, item.system.uses.value - 1) });
  }

  const actorUpdates: any[] = [];
  if (typeof count.value === "string" && count.value.startsWith("@")) {
    let key = count.value.slice(1);
    if (key.startsWith("system.")) key = key.replace("system.", "")
    // we have a @field to consume
    let charges = getProperty(actor.system, key)
    if (charges) {
      charges -= 1;
      const update = {};
      update[`system.${key}`] = charges;
      actorUpdates.push(update);
    }
  }
  if (typeof countAlt?.value === "string" && countAlt.value.startsWith("@")) {
    let key = countAlt.value.slice(1);
    if (key.startsWith("system.")) key = key.replace("system.", "")
    // we have a @field to consume
    let charges = getProperty(actor.system, key)
    if (charges) {
      charges -= 1;
      const update = {};
      update[`system.${key}`] = charges;
      actorUpdates.push(update);
    }
  }
  if (actorUpdates.length > 0) await actor.update(actorUpdates);

  if (["turn", "each-round", "each-turn"].includes(count.value)) {
    const flagKey = `${changeKey}.used`.replace("flags.midi-qol.", "");
    await actor.setFlag("midi-qol", flagKey, true);
  }
  if (["turn", "each-round", "each-turn"].includes(countAlt?.value)) {
    const flagKey = `${changeKey}.used`.replace("flags.midi-qol.", "");
    await actor.setFlag("midi-qol", flagKey, true);
  }

  if (count.value === "reaction") {
    setReactionUsed(actor);
  }
  if (countAlt?.value === "reaction") {
    setReactionUsed(actor);
  }
}

//@ts-ignore dnd5e v10
export function hasEffectGranting(actor: globalThis.dnd5e.documents.Actor5e, key: string, selector: string) {
  // Actually check for the flag being set...
  if (getOptionalCountRemainingShortFlag(actor, key) <= 0) return false;
  let changeKey = `${key}.${selector}`;
  // let hasKey = actor.effects.find(ef => ef.changes.some(c => c.key === changeKey) && getOptionalCountRemainingShortFlag(actor, key) > 0)
  let hasKey = getProperty(actor, changeKey);
  if (hasKey !== undefined) return true;
  let allKey = selector.split(".");
  allKey[allKey.length - 1] = "all";
  changeKey = `${key}.${allKey.join(".")}`;
  // return actor.effects.find(ef => ef.changes.some(c => c.key === changeKey) && getOptionalCountRemainingShortFlag(actor, key) > 0)
  hasKey = getProperty(actor, changeKey);
  if (hasKey !== undefined) return true;
  return false;

}

//TODO fix this to search 
//@ts-ignore dnd5e v10
export function isConcentrating(actor: globalThis.dnd5e.documents.Actor5e): undefined | ActiveEffect {
  const concentrationName = installedModules.get("combat-utility-belt") && !installedModules.get("dfreds-convenient-effects")
    ? game.settings.get("combat-utility-belt", "concentratorConditionName")
    : i18n("midi-qol.Concentrating");
  return actor.effects.contents.find(e => e.label === concentrationName && !e.disabled && !e.isSuppressed);
}

function maxCastLevel(actor) {
  if (configSettings.ignoreSpellReactionRestriction) return 9;
  const spells = actor.system.spells;
  if (!spells) return 0;
  let pactLevel = spells.pact?.value ? spells.pact?.level : 0;
  for (let i = 9; i > pactLevel; i--) {
    if (spells[`spell${i}`]?.value > 0) return i;
  }
  return pactLevel;
}

async function getMagicItemReactions(actor: Actor, triggerType: string): Promise<Item[]> {
  if (!globalThis.MagicItems) return [];
  const items: Item[] = []
  try {
    const magicItemActor = globalThis.MagicItems.actor(actor.id);
    if (!magicItemActor) return [];
    // globalThis.MagicItems.actor(_token.actor.id).items[0].ownedEntries[0].ownedItem
    for (let magicItem of magicItemActor.items) {
      for (let ownedItem of magicItem.ownedEntries) {
        try {
          // TODO when magicitems ready see what it looks like v10
          const theItem = await ownedItem.item.data()
          if (theItem.system.activation.type === triggerType) {
            items.push(ownedItem);
          }
        } catch (err) {
          console.warn("midi-qol | err fetching magic item ", ownedItem, err);
        }
      }
    }
  } catch (err) {
    console.warn(`midi-qol | Fetching magic item spells/features on ${actor.name} failed - ignoring`, err)
  }
  return items;
}

function itemReaction(item, triggerType, maxLevel, onlyZeroCost) {
  //@ts-ignore activation
  if (item.system.activation?.type !== triggerType) return false;
  if (item.system.activation?.cost > 0 && onlyZeroCost) return false;
  if (item.type === "spell") {
    if (configSettings.ignoreSpellReactionRestriction) return true;
    if (item.system.preparation.mode === "atwill") return true;
    if (item.system.level === 0) return true;
    if (item.system.preparation?.prepared !== true && item.system.preparation?.mode === "prepared") return false;
    if (item.system.preparation.mode !== "innate") return item.system.level <= maxLevel;
  }
  if (item.system.attunement === getSystemCONFIG().attunementTypes.REQUIRED) return false;
  if (!item._getUsageUpdates({ consumeRecharge: item.system.recharge?.value, consumeResource: true, consumeSpellLevel: false, consumeUsage: item.system.uses?.max > 0, consumeQuantity: item.type === "consumable" })) return false;
  return true;
}

export async function doReactions(target: Token, triggerTokenUuid: string | undefined, attackRoll: Roll, triggerType: string, options: any = {}): Promise<{ name: string | undefined, uuid: string | undefined, ac: number | undefined }> {
  const noResult = { name: undefined, uuid: undefined, ac: undefined };
  //@ts-ignore attributes
  if (!target.actor || !target.actor.flags) return noResult;
  if (checkRule("incapacitated")) {
    try {
      enableNotifications(false);
      if (checkIncapacitated(target.actor, undefined, undefined)) return noResult;
    } finally {
      enableNotifications(true);
    }
  }

  // TODO if hasUsedReactions only allow 0 activation cost reactions
  const usedReaction = await hasUsedReaction(target.actor);
  // if (usedReaction && needsReactionCheck(target.actor)) return noResult;
  let player = playerFor(target.document ?? target);
  if (getReactionSetting(player) === "none") return noResult;
  if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
  if (!player) return noResult;
  const maxLevel = maxCastLevel(target.actor);
  enableNotifications(false);
  let reactions;
  let reactionCount = 0;
  let reactionItemUuidList;
  try {
    reactions = target.actor.items.filter(item => itemReaction(item, triggerType, maxLevel, usedReaction));
    reactionItemUuidList = reactions.map(item => item.uuid);
    if (getReactionSetting(player) === "allMI") {
      reactions = reactions.concat(await getMagicItemReactions(target.actor, triggerType));
    }
    reactionCount = reactions.length;
  } finally {
    enableNotifications(true);
  }

  // TODO Check this for magic items if that makes it to v10
  if (!await asyncHooksCall("midi-qol.ReactionFilter", reactions, options )) {
    console.warn("midi-qol | Reaction processing cancelled by Hook");
    return { name: "Filter", ac: 0, uuid: undefined };
  } else reactionItemUuidList = reactions.map(item => item.uuid);

  // if (usedReaction) return noResult;
  if (!usedReaction) {
    //@ts-ignore .flags v10
    const midiFlags: any = target.actor.flags["midi-qol"];
    reactions = reactionCount + Object.keys(midiFlags?.optional ?? [])
      .filter(flag => {
        if (triggerType !== "reaction" || !midiFlags?.optional[flag].ac) return false;
        if (!midiFlags?.optional[flag].count) return true;
        return getOptionalCountRemainingShortFlag(target.actor, flag) > 0;
      }).length
  }

  if (reactionCount <= 0) return noResult;
  const promptString = triggerType === "reactiondamage" ? "midi-qol.reactionFlavorDamage" : "midi-qol.reactionFlavorAttack";
  let chatMessage;
  const reactionFlavor = game.i18n.format(promptString, { itemName: (options.item?.name ?? "unknown"), actorName: target.name });
  const chatData: any = {
    content: reactionFlavor,
    whisper: [player]
  };

  if (configSettings.showReactionChatMessage) {
    const player = playerFor(target.document)?.id ?? "";
    if (configSettings.enableddbGL && installedModules.get("ddb-game-log")) {
      const workflow = Workflow.getWorkflow(options?.item?.uuid);
      if (workflow?.flagTags) chatData.flags = workflow.flagTags;
    }
    chatMessage = await ChatMessage.create(chatData);
  }
  const rollOptions = geti18nOptions("ShowReactionAttackRollOptions");
  // {"none": "Attack Hit", "d20": "d20 roll only", "all": "Whole Attack Roll"},

  let content;
  if (triggerType === "reactiondamage") content = reactionFlavor;
  else switch (configSettings.showReactionAttackRoll) {
    case "all":
      content = `<h4>${reactionFlavor} - ${rollOptions.all} ${attackRoll?.total ?? ""}</h4>`;
      break;
    case "d20":
      //@ts-ignore
      const theRoll = attackRoll?.terms[0].results[0].result ?? "";
      content = `<h4>${reactionFlavor} ${rollOptions.d20} ${theRoll}</h4>`;
      break;
    default:
      content = reactionFlavor;
  }

  
  return await new Promise((resolve) => {
    // set a timeout for taking over the roll
    const timeoutId = setTimeout(() => {
      warn("doReactions | player timeout expired ", player?.name)
      resolve(noResult);
    }, (configSettings.reactionTimeout || 30) * 1000);

    // Compiler does not realise player can't be undefined to get here
    player && requestReactions(target, player, triggerTokenUuid, content, triggerType, reactionItemUuidList, resolve, chatMessage, options).then(() => {
      clearTimeout(timeoutId);
    })
  })
}

export async function requestReactions(target: Token, player: User, triggerTokenUuid: string | undefined, reactionFlavor: string, triggerType: string, reactionItemUuidList: string[], resolve: ({ }) => void, chatPromptMessage: ChatMessage, options: any = {}) {
  const startTime = Date.now();
  if (options.item && options.item instanceof CONFIG.Item.documentClass) {
    options.itemUuid = options.item.uuid;
    delete options.item;
  };
  if (options.workflow && options.workflow instanceof Workflow) 
    options.workflow = options.workflow.getMacroData();

  const result = (await socketlibSocket.executeAsUser("chooseReactions", player.id, {
    tokenUuid: target.document?.uuid ?? target.uuid,
    reactionFlavor,
    triggerTokenUuid,
    triggerType,
    options,
    reactionItemUuidList
  }));
  const endTime = Date.now();
  warn("request reactions returned after ", endTime - startTime, result);
  resolve(result);
  if (chatPromptMessage) chatPromptMessage.delete();
}

export async function promptReactions(tokenUuid: string, reactionItemList: string[], triggerTokenUuid: string | undefined, reactionFlavor: string, triggerType: string, options: any = {}) {
  const startTime = Date.now();
  const target: Token = MQfromUuid(tokenUuid);
  const actor: Actor | null = target.actor;
  if (!actor) return;
  const usedReaction = await hasUsedReaction(actor);
  // if ( usedReaction && needsReactionCheck(actor)) return false;
  const midiFlags: any = getProperty(actor, "flags.midi-qol");
  let result;
  let reactionItems;
  const maxLevel = maxCastLevel(target.actor);
  enableNotifications(false);
  try {
    reactionItems = reactionItemList.map(uuid => MQfromUuid(uuid));
    // reactionItems = actor.items.filter(item => itemReaction(item, triggerType, maxLevel, usedReaction));
    if (getReactionSetting(game?.user) === "allMI")
      reactionItems = reactionItems.concat(await getMagicItemReactions(actor, triggerType));
  } finally {
    enableNotifications(true);
  }
  
  if (reactionItems.length > 0) {
    /*
    if (!await asyncHooksCall("midi-qol.ReactionFilter", reactionItems, options )) {
      console.warn("midi-qol | Reaction processing cancelled by Hook");
      return { name: "Filter" };
    }
    */
    result = await reactionDialog(actor, triggerTokenUuid, reactionItems, reactionFlavor, triggerType, options);
    const endTime = Date.now();
    warn("prompt reactions reaction processing returned after ", endTime - startTime, result)
    if (result.uuid) return result; //TODO look at multiple choices here
  }
  if (usedReaction) return { name: "None" };
  if (!midiFlags) return { name: "None" };
  const bonusFlags = Object.keys(midiFlags?.optional ?? {})
    .filter(flag => {
      if (!midiFlags.optional[flag].ac) return false;
      if (!midiFlags.optional[flag].count) return true;
      return getOptionalCountRemainingShortFlag(actor, flag) > 0;
    }).map(flag => `flags.midi-qol.optional.${flag}`);
  if (bonusFlags.length > 0 && triggerType === "reaction") {
    //@ts-ignore attributes
    let acRoll = await new Roll(`${actor.system.attributes.ac.value}`).roll({async: true});
    const data = {
      actor,
      roll: acRoll,
      rollHTML: reactionFlavor,
      rollTotal: acRoll.total,
    }
    //@ts-ignore attributes
    await bonusDialog.bind(data)(bonusFlags, "ac", true, `${actor.name} - ${i18n("DND5E.AC")} ${actor.system.attributes.ac.value}`, "roll", "rollTotal", "rollHTML")
    const endTime = Date.now();
    warn("prompt reactions returned via bonus dialog ", endTime - startTime)
    return { name: actor.name, uuid: actor.uuid, ac: data.roll.total };
  }
  const endTime = Date.now();
  warn("prompt reactions returned no result ", endTime - startTime)
  return { name: "None" };
}

export function playerFor(target: TokenDocument): User | undefined {
  return playerForActor(target.actor ?? undefined); // just here for syntax checker
}

export function playerForActor(actor: Actor | undefined): User | undefined {
  if (!actor) return undefined;
  let user;
  //@ts-ignore DOCUMENT_PERMISSION_LEVELS.OWNER v10
  const OWNERSHIP_LEVELS = CONST.DOCUMENT_PERMISSION_LEVELS;
  //@ts-ignore ownership v10
  const ownwership = actor.ownership;
  // find an active user whose character is the actor
  if (actor.hasPlayerOwner) user = game.users?.find(u => u.character?.id === actor?.id && u.active);
  if (!user) // no controller - find the first owner who is active
    user = game.users?.players.find(p => p.active && ownwership[p.id ?? ""] === OWNERSHIP_LEVELS.OWNER)
  if (!user) // find a non-active owner
    user = game.users?.players.find(p => p.character?.id === actor?.id);
  if (!user) // no controlled - find an owner that is not active
    user = game.users?.players.find(p => ownwership[p.id ?? ""] === OWNERSHIP_LEVELS.OWNER)
  if (!user && ownwership.default === OWNERSHIP_LEVELS.OWNER) {
    // does anyone have default owner permission who is active
    user = game.users?.players.find(p => p.active && ownwership[p.id] === OWNERSHIP_LEVELS.INHERIT)
  }
  // if all else fails it's and active gm.
  if (!user) user = game.users?.find(p => p.isGM && p.active);
  return user;
}

//@ts-ignore dnd5e v10
export async function reactionDialog(actor: globalThis.dnd5e.documents.Actor5e, triggerTokenUuid: string | undefined, reactionItems: any[], rollFlavor: string, triggerType: string, options: any) {
  return new Promise((resolve, reject) => {
    let timeoutId = setTimeout(() => {
      dialog.close();
      resolve({});
    }, ((configSettings.reactionTimeout || 30) - 1) * 1000);
    const callback = async function (dialog, button) {
      clearTimeout(timeoutId);
      const item = reactionItems.find(i => i.id === button.key);
      // await setReactionUsed(actor);
      // No need to set reaction effect since using item will do so.
      dialog.close();
      // options = mergeObject(options.workflowOptions ?? {}, {triggerTokenUuid, checkGMStatus: false}, {overwrite: true});
      options.lateTargeting = "none";
      const itemRollOptions = mergeObject(options, {
        showFullCard: false,
        createWorkflow: true,
        versatile: false,
        configureDialog: true,
        checkGMStatus: false,
        targetUuids: [triggerTokenUuid]
      });
      await completeItemUse(item, {}, itemRollOptions);
      // actor.reset();
      resolve({ name: item.name, uuid: item.uuid })
    };

    const dialog = new ReactionDialog({
      actor,
      targetObject: this,
      title: `${actor.name}`,
      items: reactionItems,
      content: rollFlavor,
      callback,
      close: resolve,
    }, {
      width: 400
    });

    dialog.render(true);
  });
}


class ReactionDialog extends Application {
  startTime: number;
  endTime: number;

  data: {
    //@ts-ignore dnd5e v10
    actor: globalThis.dnd5e.documents.Actor5e,
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
    this.startTime = Date.now();
    this.data = data;
    this.data.completed = false
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      template: "modules/midi-qol/templates/dialog.html",
      classes: ["dialog"],
      width: 150,
      height: "auto",
      jQuery: true
    });
  }
  get title() {
    return this.data.title || "Dialog";
  }
  async getData(options) {
    this.data.buttons = this.data.items.reduce((acc: {}, item: Item) => {
      acc[randomID()] = {
        icon: `<div class="item-image"> <image src=${item.img} width="50" height="50" style="margin:10px"></div>`,
        label: `${item.name}`,
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
    warn("Reaction dialog button clicked", id, button, Date.now() - this.startTime)
    this.submit(button);
  }

  _onKeyDown(event) {
    // Close dialog
    if (event.key === "Escape" || event.key === "Enter") {
      warn("Reaction Dialog onKeyDown esc/enter pressed", event.key, Date.now() - this.startTime);
      event.preventDefault();
      event.stopPropagation();
      this.data.completed = true;
      if (this.data.close) this.data.close({ name: "keydown", uuid: undefined });
      this.close();
    }
  }

  async submit(button) {
    try {
      warn("ReactionDialog submit", Date.now() - this.startTime, button.callback)
      if (button.callback) {
        this.data.completed = true;
        await button.callback(this, button)
        this.close();
        // this.close();
      }
    } catch (err) {
      ui.notifications?.error(err);
      error(err);
      this.data.completed = false;
      this.close()
    }
  }

  async close() {
    warn("Reaction Dialog close ", Date.now() - this.startTime, this.data.completed)
    if (!this.data.completed && this.data.close) {
      this.data.close({ name: "Close", uuid: undefined });
    }
    $(document).off('keydown.chooseDefault');
    return super.close();
  }
}


export function reportMidiCriticalFlags() {
  let report: string[] = [];
  if (game?.actors) for (let a of game.actors) {
    for (let item of a.items.contents) {
      if (!["", "20", 20].includes((getProperty(item, "flags.midi-qol.criticalThreshold") || ""))) {
        report.push(`Actor ${a.name}'s Item ${item.name} has midi critical flag set ${getProperty(item, "flags.midi-qol.criticalThreshold")}`)
      }
    }
  }
  if (game?.scenes) for (let scene of game.scenes) {
    for (let tokenDocument of scene.tokens) { // TODO check this v10
      if (tokenDocument.actor) for (let item of tokenDocument.actor.items.contents) {
        if (!tokenDocument.isLinked && !["", "20", 20].includes((getProperty(item, "flags.midi-qol.criticalThreshold") || ""))) {
          report.push(`Scene ${scene.name}, Token Name ${tokenDocument.name}, Actor Name ${tokenDocument.actor.name}, Item ${item.name} has midi critical flag set ${getProperty(item, "flags.midi-qol.criticalThreshold")}`)
        }
      }
    }
  }
  console.log("Items with midi critical flags set are\n", ...(report.map(s => s + "\n")));
}

/**
 * 
 * @param actor the actor to check
 * @returns the concentration effect if present and null otherwise
 */
export function getConcentrationEffect(actor): ActiveEffect | undefined {
  let concentrationLabel: any = i18n("midi-qol.Concentrating");
  if (game.modules.get("dfreds-convenient-effects")?.active) {
    let concentrationId = "Convenient Effect: Concentrating";
    let statusEffect: any = CONFIG.statusEffects.find(se => se.id === concentrationId);
    if (statusEffect) concentrationLabel = statusEffect.label;
  } else if (game.modules.get("combat-utility-belt")?.active) {
    concentrationLabel = game.settings.get("combat-utility-belt", "concentratorConditionName")
  }
  const result = actor.effects.contents.find(i => i.label === concentrationLabel);
  return result;
}

function mySafeEval(expression: string, sandbox: any) {
  let result;
  try {

    const src = 'with (sandbox) { return ' + expression + '}';
    const evl = new Function('sandbox', src);
    result = evl(mergeObject(sandbox, Roll.MATH_PROXY));
  } catch (err) {
    console.warn("midi-qol | expression evaluation failed ", err);
    result = undefined;
  }
  if (Number.isNumeric(result)) return Number(result)
  return result;
};

export function evalActivationCondition(workflow: Workflow, condition: string | undefined, target: Token | TokenDocument): boolean {
  if (condition === undefined || condition === "") return true;
  createConditionData({workflow, target, actor: workflow.actor});
  const returnValue = evalCondition(condition, workflow.conditionData);
  return returnValue;
}

export function createConditionData(data: {workflow: Workflow | undefined, target: Token | TokenDocument | undefined, actor: Actor | undefined}) {
  const rollData = data.workflow?.otherDamageItem?.getRollData() ?? data.workflow?.actor?.getRollData() ?? data.actor?.getRollData() ?? {};
  try {
    if (data.target) {
      rollData.target = data.target.actor?.getRollData();
      if (rollData.target.details.type?.value) rollData.raceOrType = rollData.target.details.type?.value.toLocaleLowerCase() ?? "";
      else rollData.raceOrType = rollData.target.details.race?.toLocaleLowerCase() ?? "";
    }
    rollData.workflow = {};
    Object.assign(rollData.workflow, data.workflow);
  } catch (err) {

  } finally {
    if (data.workflow) data.workflow.conditionData = rollData;
  }
  return rollData;
}

export function evalCondition(condition: string, conditionData: any): boolean {
  if (condition === undefined || condition === "") return true;
  if (typeof condition !== "string") return condition;
  let returnValue;
  try {
    if (condition.includes("@")) {
      condition = Roll.replaceFormulaData(condition, conditionData, { missing: "0" });
    }
    returnValue = mySafeEval(condition, conditionData);
    warn("evalActivationCondition ", returnValue, condition, conditionData);

  } catch (err) {
    returnValue = true;
    console.warn(`midi-qol | activation condition (${condition}) error `, err, conditionData)
  }
  return returnValue;
}

export function computeTemplateShapeDistance(templateDocument: MeasuredTemplateDocument): { shape: string, distance: number } {
  //@ts-ignore direction etc v10
  let { direction, distance, angle, width } = templateDocument;
  if (!canvas || !canvas.scene) return { shape: "none", distance: 0 };
  const dimensions = canvas.dimensions || { size: 1, distance: 1 };
  distance *= dimensions.size / dimensions.distance;
  width *= dimensions.size / dimensions.distance;
  direction = Math.toRadians(direction);
  let shape: any;
  //@ts-ignore .t v10
  switch (templateDocument.t) {
    case "circle":
      shape = new PIXI.Circle(0, 0, distance);
      break;
    case "cone":
      //@ts-ignore
      shape = templateDocument._object._getConeShape(direction, angle, distance);
      break;
    case "rect":
      //@ts-ignore
      shape = templateDocument._object._getRectShape(direction, distance);
      break;
    case "ray":
      //@ts-ignore
      shape = templateDocument._object._getRayShape(direction, distance, width);
  }
  //@ts-ignore distance v10
  return { shape, distance: templateDocument.distance };
}

var _enableNotifications = true;

export function notificationNotify(wrapped, ...args) {
  if (_enableNotifications) return wrapped(...args);
  return;
}
export function enableNotifications(enable: boolean) {
  _enableNotifications = enable;
}

export function getConvenientEffectsReaction() {
  //@ts-ignore
  return game.dfreds?.effects?._reaction;
}

export function getConvenientEffectsBonusAction() {
  //@ts-ignore
  return game.dfreds?.effects?._bonusAction;
}
export function getConvenientEffectsUnconscious() {
  //@ts-ignore
  return game.dfreds?.effects?._unconscious;
}
export function getConvenientEffectsDead() {
  //@ts-ignore
  return game.dfreds?.effects?._dead;
}

export async function ConvenientEffectsHasEffect(effectName: string, uuid: string) {
  //@ts-ignore
  return game.dfreds.effectInterface.hasEffectApplied(effectName, uuid);
}

export function isInCombat(actor: Actor) {
  const actorUuid = actor.uuid;
  let combats;
  if (actorUuid.startsWith("Scene")) { // actor is a token synthetic actor
    const tokenId = actorUuid.split(".")[3]
    combats = game.combats?.combats.filter(combat =>
      //@ts-ignore .tokenId v10
      combat.combatants.filter(combatant => combatant?.tokenId === tokenId).length !== 0
    );
  } else { // actor is not a synthetic actor so can use actor Uuid 
    const actorId = actor.id;
    combats = game.combats?.combats.filter(combat =>
      //@ts-ignore .actorID v10
      combat.combatants.filter(combatant => combatant?.actorId === actorId).length !== 0
    );
  }
  return (combats?.length ?? 0) > 0;
}

export async function setReactionUsed(actor: Actor) {
  if (getConvenientEffectsReaction()) {
    //@ts-ignore
    await game.dfreds?.effectInterface.addEffect({ effectName: getConvenientEffectsReaction().name, uuid: actor.uuid });
  }
  await actor.setFlag("midi-qol", "reactionCombatRound", game.combat?.round);
}

export async function setBonusActionUsed(actor: Actor) {
  if (getConvenientEffectsBonusAction()) {
    //@ts-ignore
    await game.dfreds?.effectInterface.addEffect({ effectName: getConvenientEffectsBonusAction().name, uuid: actor.uuid });
  }
  await actor.setFlag("midi-qol", "bonusActionCombatRound", game.combat?.round);
}
export async function removeReactionUsed(actor: Actor, removeCEEffect = false) {
  if (removeCEEffect && getConvenientEffectsReaction()) {
    //@ts-ignore
    if (await game.dfreds?.effectInterface.hasEffectApplied(getConvenientEffectsReaction().name, actor.uuid)) {
      //@ts-ignore
      await game.dfreds.effectInterface?.removeEffect({ effectName: getConvenientEffectsReaction().name, uuid: actor.uuid });
    }
  }
  return await actor?.unsetFlag("midi-qol", "reactionCombatRound");
}


export async function hasUsedReaction(actor: Actor) {
  if (actor.getFlag("midi-qol", "reactionCombatRound")) return true;
  if (getConvenientEffectsReaction()) {
    //@ts-ignore
    if (await game.dfreds?.effectInterface.hasEffectApplied(getConvenientEffectsReaction().name, actor.uuid)) return true;
  }
  return false;
}


export async function expirePerTurnBonusActions(combat: Combat) {
  const optionalFlagRe = /flags.midi-qol.optional.[^.]+.count$/;
  for (let combatant of combat.turns) {
    const actor = combatant.actor;
    if (actor) {
      for (let effect of actor.effects) {
        //@ts-ignore .changes v10
        for (let change of effect.changes) {
          if (change.key.match(optionalFlagRe) && change.value === "each-turn") {
            actor.unsetFlag("midi-qol", change.key.replace(/.count$/, ".used").replace("flags.midi-qol.", ""));
          }
        }
      }
    }
  }
}

export async function hasUsedBonusAction(actor: Actor) {
  if (actor.getFlag("midi-qol", "bonusActionCombatRound")) return true;
  if (getConvenientEffectsBonusAction()) {
    //@ts-ignore
    if (await game.dfreds?.effectInterface.hasEffectApplied(getConvenientEffectsBonusAction().name, actor.uuid)) return true;
  }
  return false;
}

export async function removeBonusActionUsed(actor: Actor, removeCEEffect = false) {
  if (removeCEEffect && getConvenientEffectsBonusAction()) {
    //@ts-ignore
    if (await game.dfreds?.effectInterface.hasEffectApplied(getConvenientEffectsBonusAction().name, actor.uuid)) {
      //@ts-ignore
      await game.dfreds.effectInterface?.removeEffect({ effectName: getConvenientEffectsBonusAction().name, uuid: actor.uuid });
    }
  }
  return await actor?.unsetFlag("midi-qol", "bonusActionCombatRound");
}

export function needsReactionCheck(actor) {
  return (configSettings.enforceReactions === "all" || configSettings.enforceReactions === actor.type)
}

export function needsBonusActionCheck(actor) {
  return (configSettings.enforceBonusActions === "all" || configSettings.enforceBonusActions === actor.type)
}
export function mergeKeyboardOptions(options: any, pressedKeys: Options | undefined) {
  if (!pressedKeys) return;
  options.advantage = options.advantage || pressedKeys.advantage;
  options.disadvantage = options.disadvantage || pressedKeys.disadvantage;
  options.versatile = options.versatile || pressedKeys.versatile;
  options.other = options.other || pressedKeys.other;
  options.rollToggle = options.rollToggle || pressedKeys.rollToggle;
  options.fastForward = options.fastForward || pressedKeys.fastForward;
  options.fastForwardAbility = options.fastForwardAbility || pressedKeys.fastForwardAbility;
  options.fastForwardDamage = options.fastForwardDamage || pressedKeys.fastForwardDamage;
  options.fastForwardAttack = options.fastForwardAttack || pressedKeys.fastForwardAttack;
  options.parts = options.parts || pressedKeys.parts;
  options.critical = options.critical || pressedKeys.critical;
}

export async function asyncHooksCallAll(hook, ...args) {
  if (CONFIG.debug.hooks) {
    console.log(`DEBUG | midi-qol async Calling ${hook} hook with args:`);
    console.log(args);
  }
  //@ts-ignore
  if (!(hook in Hooks.events)) return true;

  //@ts-ignore
  for (let entry of Array.from(Hooks.events[hook])) {
    //TODO see if this might be better as a Promises.all
    //@ts-ignore
    await hookCall(entry, args);
  }
  return true;
}

export async function asyncHooksCall(hook, ...args) {
  if (CONFIG.debug.hooks) {
    console.log(`DEBUG | midi-qol async Calling ${hook} hook with args:`);
    console.log(args);
  }
  //@ts-ignore Hooks.events v10
  if (!(hook in Hooks.events)) return true;

  //@ts-ignore
  for (let entry of Array.from(Hooks.events[hook])) {
    //@ts-ignore
    let callAdditional = await hookCall(entry, args);
    if (callAdditional === false) return false;
  }
  return true;
}
function hookCall(entry, args) {
  const { hook, id, fn, once } = entry;
  if (once) Hooks.off(hook, id);
  try {
    return entry.fn(...args);
  } catch (err) {
    const msg = `Error thrown in hooked function '${fn?.name}' for hook '${hook}'`;
    console.warn(`${vtt} | ${msg}`);
    //@ts-ignore Hooks.onError v10
    if (hook !== "error") Hooks.onError("Hooks.#call", err, { msg, hook, fn, log: "error" });
  }
}

export function addAdvAttribution(html: any, advAttribution: any = undefined) {
  // <section class="tooltip-part">
  let advHtml: string = "";
  if (advAttribution && Object.keys(advAttribution).length > 0) {
    advHtml = Object.keys(advAttribution).reduce((prev, s) => prev += `${s}<br>`, "");
    html = html.replace(`<section class="tooltip-part">`, `<section class="tooltip-part">${advHtml}`);
  }
  return html;
}

export async function midiRenderRoll(roll: Roll | undefined) {
  if (!roll) return "";
  switch (configSettings.rollAlternate) {
    case "formula":
    case "formulaadv": return roll.render({ template: "modules/midi-qol/templates/rollAlternate.html" });
    case "adv":
    case "off":
    default: return roll.render(); // "off"
  }
}

export async function computeFlankedStatus(target): Promise<boolean> {
  if (!checkRule("checkFlanking") || !["ceflanked", "ceflankedNoconga"].includes(checkRule("checkFlanking"))) return false;
  if (!canvas || !target) return false;
  const allies: any /*Token v10*/[] = findNearby(-1, target, 5);
  if (allies.length <= 1) return false; // length 1 means no other allies nearby
  if (canvas?.grid?.grid instanceof SquareGrid) {
    let gridW = canvas?.grid?.w ?? 100;
    let gridH = canvas?.grid?.h ?? 100;
    const tl = { x: target.x, y: target.y };
    const tr = { x: target.x + target.document.width * gridW, y: target.y };
    const bl = { x: target.x, y: target.y + target.document.height * gridH };
    const br = { x: target.x + target.document.width * gridW, y: target.y + target.document.height * gridH };
    const top: [x0: number, y0: number, x1: number, y1: number] = [tl.x, tl.y, tr.x, tr.y];
    const bottom: [x0: number, y0: number, x1: number, y1: number] = [bl.x, bl.y, br.x, br.y];
    const left: [x0: number, y0: number, x1: number, y1: number] = [tl.x, tl.y, bl.x, bl.y];
    const right: [x0: number, y0: number, x1: number, y1: number] = [tr.x, tr.y, br.x, br.y];

    while (allies.length > 1) {
      const token = allies.pop();
      if (!token) break;
      if (checkRule("checkFlanking") === "ceflankedNoconga" && installedModules.get("dfreds-convenient-effects")) {
        //@ts-ignore
        const CEFlanked = game.dfreds.effects._flanked;
        //@ts-ignore
        const hasFlanked = token.actor && CEFlanked && await game.dfreds.effectInterface?.hasEffectApplied(CEFlanked.name, token.actor.uuid);
        if (hasFlanked) continue;
      }
      // Loop through each square covered by attacker and ally
      const tokenStartX = token.document.width >= 1 ? 0.5 : token.document.width / 2;
      const tokenStartY = token.document.height >= 1 ? 0.5 : token.document.height / 2;
      for (let ally of allies) {
        if (ally.document.uuid === token.document.uuid) continue;
        const actor: any = ally.actor;
        if (actor?.system.attrbutes?.hp?.value <= 0) continue;
        if (installedModules.get("dfreds-convenient-effects")) {
          //@ts-ignore
          if (actor?.effects.some(ef => ef.label === game.dfreds.effects._incapacitated.name)) continue;
        }
        if (checkRule("checkFlanking") === "ceflankedNoconga" && installedModules.get("dfreds-convenient-effects")) {
          //@ts-ignore
          const CEFlanked = game.dfreds.effects._flanked;
          //@ts-ignore
          const hasFlanked = CEFlanked && await game.dfreds.effectInterface?.hasEffectApplied(CEFlanked.name, ally.actor.uuid);
          if (hasFlanked) continue;
        }
        const allyStartX = ally.document.width >= 1 ? 0.5 : ally.document.width / 2;
        const allyStartY = ally.document.height >= 1 ? 0.5 : ally.document.height / 2;
        var x, x1, y, y1, d, r;
        for (x = tokenStartX; x < token.document.width; x++) {
          for (y = tokenStartY; y < token.document.height; y++) {
            for (x1 = allyStartX; x1 < ally.document.width; x1++) {
              for (y1 = allyStartY; y1 < ally.document.height; y1++) {
                let tx = token.x + x * gridW;
                let ty = token.y + y * gridH;
                let ax = ally.x + x1 * gridW;
                let ay = ally.y + y1 * gridH;
                const rayToCheck = new Ray({ x: tx, y: ty }, { x: ax, y: ay });
                // console.error("Checking ", tx, ty, ax, ay, token.center, ally.center, target.center)
                const flankedTop = rayToCheck.intersectSegment(top) && rayToCheck.intersectSegment(bottom);
                const flankedLeft = rayToCheck.intersectSegment(left) && rayToCheck.intersectSegment(right);
                if (flankedLeft || flankedTop) {
                  return true;
                }
              }
            }
          }
        }
      }
    }
  } else if (canvas?.grid?.grid instanceof HexagonalGrid) {
    return false;
  }
  return false;
}

export function computeFlankingStatus(token, target): boolean {
  if (!checkRule("checkFlanking") || checkRule("checkFlanking") === "off") return false;
  if (!canvas) return false;
  if (!token) return false;
  // For the target see how many square between this token and any friendly targets
  // Find all tokens hostile to the target
  if (!target) return false;
  // console.error("Distance is ", getDistance(token, target, false, true));
  if (getDistance(token, target, false, true).distance > 5) return false;
  // an enemy's enemies are my friends.
  const allies: any /* Token v10 */[] = findNearby(-1, target, 5);

  if (allies.length === 1) return false; // length 1 means no other allies nearby

  if (canvas?.grid?.grid instanceof SquareGrid) {
    let gridW = canvas?.grid?.w ?? 100;
    let gridH = canvas?.grid?.h ?? 100;
    const tl = { x: target.x, y: target.y };
    const tr = { x: target.x + target.document.width * gridW, y: target.y };
    const bl = { x: target.x, y: target.y + target.document.height * gridH };
    const br = { x: target.x + target.document.width * gridW, y: target.y + target.document.height * gridH };
    const top: [x0: number, y0: number, x1: number, y1: number] = [tl.x, tl.y, tr.x, tr.y];
    const bottom: [x0: number, y0: number, x1: number, y1: number] = [bl.x, bl.y, br.x, br.y];
    const left: [x0: number, y0: number, x1: number, y1: number] = [tl.x, tl.y, bl.x, bl.y];
    const right: [x0: number, y0: number, x1: number, y1: number] = [tr.x, tr.y, br.x, br.y];

    // Loop through each square covered by attacker and ally
    const tokenStartX = token.document.width >= 1 ? 0.5 : token.document.width / 2;
    const tokenStartY = token.document.height >= 1 ? 0.5 : token.document.height / 2;


    for (let ally of allies) {
      if (ally.document.uuid === token.document.uuid) continue;
      const actor: any = ally.actor;
      if (actor?.system.attrbutes?.hp?.value <= 0) continue;
      if (installedModules.get("dfreds-convenient-effects")) {
        //@ts-ignore
        if (actor?.effects.some(ef => ef.label === game.dfreds.effects._incapacitated.name)) continue;
      }

      const allyStartX = ally.document.width >= 1 ? 0.5 : ally.document.width / 2;
      const allyStartY = ally.document.height >= 1 ? 0.5 : ally.document.height / 2;
      var x, x1, y, y1, d, r;
      for (x = tokenStartX; x < token.document.width; x++) {
        for (y = tokenStartY; y < token.document.height; y++) {
          for (x1 = allyStartX; x1 < ally.document.width; x1++) {
            for (y1 = allyStartY; y1 < ally.document.height; y1++) {
              let tx = token.x + x * gridW;
              let ty = token.y + y * gridH;
              let ax = ally.x + x1 * gridW;
              let ay = ally.y + y1 * gridH;
              const rayToCheck = new Ray({ x: tx, y: ty }, { x: ax, y: ay });
              // console.error("Checking ", tx, ty, ax, ay, token.center, ally.center, target.center)
              const flankedTop = rayToCheck.intersectSegment(top) && rayToCheck.intersectSegment(bottom);
              const flankedLeft = rayToCheck.intersectSegment(left) && rayToCheck.intersectSegment(right);
              if (flankedLeft || flankedTop) {
                return true;
              }
            }
          }
        }
      }
    }
  } else if (canvas?.grid?.grid instanceof HexagonalGrid) {
    let grid: HexagonalGrid = canvas?.grid?.grid;
    const tokenRowCol = grid.getGridPositionFromPixels(token.center.x, token.center.y);
    const targetRowCol = grid.getGridPositionFromPixels(target.center.x, target.center.y);
    const allAdjacent: [number, number][] = [];
    for (let ally of allies) {
      let allyRowCol = grid?.getGridPositionFromPixels(ally.center.x, ally.center.y);
    }
    return false;
  }
  return false;
}


export async function markFlanking(token, target): Promise<boolean> {
  if (!canvas) return false;
  let needsFlanking = false;
  if (!token || !target || !checkRule("checkFlanking") || checkRule["checkFlanking"] === "off") return false;
  if (["ceonly", "ceadv"].includes(checkRule("checkFlanking"))) {
    needsFlanking = computeFlankingStatus(token, target);
    if (installedModules.get("dfreds-convenient-effects")) {
      //@ts-ignore
      const CEFlanking = game.dfreds.effects._flanking;
      if (!CEFlanking) return needsFlanking;
      //@ts-ignore
      const hasFlanking = token.actor && await game.dfreds.effectInterface?.hasEffectApplied(CEFlanking.name, token.actor.uuid)
      if (needsFlanking && !hasFlanking && token.actor) {
        //@ts-ignore
        await game.dfreds.effectInterface?.addEffect({ effectName: CEFlanking.name, uuid: token.actor.uuid });
      } else if (!needsFlanking && hasFlanking && token.actor) {
        //@ts-ignore
        await game.dfreds.effectInterface?.removeEffect({ effectName: CEFlanking.name, uuid: token.actor.uuid });
      }
    }
  } else if (checkRule("checkFlanking") === "advonly") {
    needsFlanking = computeFlankingStatus(token, target);
  } else if (["ceflanked", "ceflankedNoconga"].includes(checkRule("checkFlanking"))) {
    if (installedModules.get("dfreds-convenient-effects")) {
      //@ts-ignore
      const CEFlanked = game.dfreds.effects._flanked;
      if (!CEFlanked) return false;
      const needsFlanked = await computeFlankedStatus(target);
      //@ts-ignore
      const hasFlanked = token.actor && await game.dfreds.effectInterface?.hasEffectApplied(CEFlanked.name, target.actor.uuid);
      if (needsFlanked && !hasFlanked && token.actor) {
        //@ts-ignore
        await game.dfreds.effectInterface?.addEffect({ effectName: CEFlanked.name, uuid: target.actor.uuid });
      } else if (!needsFlanked && hasFlanked && token.actor) {
        //@ts-ignore
        await game.dfreds.effectInterface?.removeEffect({ effectName: CEFlanked.name, uuid: target.actor.uuid });
      }
      return false;
    }
  }
  return needsFlanking;
}

export async function checkflanking(user: User, target: Token, targeted: boolean): Promise<boolean> {
  if (user !== game.user) return false;
  let token = canvas?.tokens?.controlled[0];
  if (!token) {
    log("Flanking check: No token selected - no flanking applied");
    return false;
  }
  if (user.targets.size === 1 && canvas?.tokens?.controlled.length === 1) return markFlanking(token, target);
  return false

}

export function getChanges(actorOrItem, key: string) {
  return actorOrItem.effects.contents
    .flat()
    .map(e => e.changes)
    .flat()
    .filter(c => c.key.includes(key))
    .sort((a, b) => a.key < b.key ? -1 : 1)
}

/**
 * 
 * @param token 
 * @param target 
 * 
 * @returns {boolean}
 */

export function canSense(tokenEntity: Token | TokenDocument, targetEntity: Token | TokenDocument): boolean {
  //@ts-ignore
  let target: Token = targetEntity instanceof TokenDocument ? targetEntity.object : targetEntity;
  //@ts-ignore
  let token: Token = tokenEntity instanceof TokenDocument ? tokenEntity.object : tokenEntity;
  if (!token || !target) return true;

  if (!token.vision.active) return true; //TODO work out what to do with tokens with no vision

  //@ts-ignore specialStatusEffects
  const specialStatuses = CONFIG.specialStatusEffects;


  // Determine the array of offset points to test
  const t = Math.min(target.w, target.h) / 4;
  const targetPoint = target.center;
  const offsets = t > 0 ? [[0, 0], [-t, -t], [-t, t], [t, t], [t, -t], [-t, 0], [t, 0], [0, -t], [0, t]] : [[0, 0]];
  const tests = offsets.map(o => ({
      point: new PIXI.Point(targetPoint.x + o[0], targetPoint.y + o[1]), 
      los: new Map() }));
  const config = { tests, object: targetEntity };

  // First test basic detection for light sources which specifically provide vision
  //@ts-ignore
  for ( const lightSource of canvas?.effects?.lightSources.values() ?? []) {
    if ( !lightSource.data.vision || !lightSource.active || lightSource.disabled ) continue;
    const result = lightSource.testVisibility(config);
    if ( result === true ) return true;
  }

  //@ts-ignore
  const tokenDetectionModes = token.detectionModes;
  //@ts-ignore
  const modes = CONFIG.Canvas.detectionModes;
  //@ts-ignore v10
  const DetectionModeCONST = DetectionMode;
  const basic = tokenDetectionModes.find(m => m.id === DetectionModeCONST.BASIC_MODE_ID);
  if (basic && token.vision.active) {
    const result = modes.basicSight.testVisibility(token.vision, basic, config);
    if (result === true) return true;
  }

  for (const detectionMode of tokenDetectionModes) {
    if (detectionMode.id === DetectionModeCONST.BASIC_MODE_ID) continue;
    if (!detectionMode.enabled) continue;
    const dm = modes[detectionMode.id];
    const result = dm?.testVisibility(token.vision, detectionMode, config)
    if (result === true) {
      //  TODO see if this is needed token.detectionFilter = dm.constructor.getDetectionFilter();
      return true;
    }
  }
  return false;
}
export function getSystemCONFIG(): any {
  switch (game.system.id) {
    //@ts-ignore .
    case "dnd5e": return CONFIG.DND5E;
    //@ts-ignore .
    case "sw5e": return CONFIG.DND5E;
    //@ts-ignore .
    case "n5e": return CONFIG.N5E;
    default: return {};
  }
}

export function tokenForActor(actor): Token | undefined {
  const tokens = actor.getActiveTokens();
  if (!tokens.length) return undefined;
  const controlled = tokens.filter(t => t._controlled);
  return controlled.length ? controlled.shift() : tokens.shift();
}

export async function doMidiConcentrationCheck(actor, saveDC) {
  if (configSettings.noConcnetrationDamageCheck) return;
  const itemData = duplicate(itemJSONData);
  setProperty(itemData, "system.save.dc", saveDC);
  setProperty(itemData, "system.save.ability", "con");
  setProperty(itemData, "system.save.scaling", "flat");
  setProperty(itemData, "name", concentrationCheckItemDisplayName);
  setProperty(itemData, "system.target.type", "self");
  return doConcentrationCheck(actor, itemData)
}

export async function doConcentrationCheck(actor, itemData) {
  let result;
  // actor took damage and is concentrating....
  const saveTargets = game.user?.targets;
  const theTargetToken = await getSelfTarget(actor);
  const theTarget = theTargetToken instanceof Token ? theTargetToken?.document.id : theTargetToken?.id;
  if (game.user && theTarget) game.user.updateTokenTargets([theTarget]);
  let ownedItem: Item = new CONFIG.Item.documentClass(itemData, { parent: actor })
  if (configSettings.displaySaveDC) {
    //@ts-ignore 
    ownedItem.getSaveDC()
  }
  try {
    //@ts-ignore version v10
    if (installedModules.get("betterrolls5e") && isNewerVersion(game.modules.get("betterrolls5e")?.version ?? "", "1.3.10")) { // better rolls breaks the normal roll process
      //@ts-ignore
      // await ownedItem.roll({ vanilla: false, showFullCard: false, createWorkflow: true, versatile: false, configureDialog: false })
      await globalThis.BetterRolls.rollItem(ownedItem, { itemData: ownedItem.toObject(), vanilla: false, adv: 0, disadv: 0, midiSaveDC: saveDC, workflowOptions: { lateTargeting: "none" } }).toMessage();
    } else {
      //@ts-ignore
      result = await completeItemUse(ownedItem, {}, { showFullCard: false, createWorkflow: true, versatile: false, configureDialog: false, workflowOptions: { lateTargeting: "none" } })
      // await ownedItem.roll({ showFullCard: false, createWorkflow: true, versatile: false, configureDialog: false, workflowOptions: { lateTargeting: "none" } })
    }
  } finally {
    if (saveTargets && game.user) game.user.targets = saveTargets;
    return result;
  }
}
