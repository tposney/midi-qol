import { debug, i18n, i18nFormat, error, warn, busyWait, allAttackTypes, debugEnabled, overTimeEffectsToDelete, getStaticID, savedOverTimeEffectsToDelete, GameSystemConfig, systemConcentrationId, MQItemMacroLabel, MODULE_ID, midiReactionEffect, midiBonusActionEffect, MQActivityMacroLabel, ceInterface } from "../midi-qol.js";
import { configSettings, autoRemoveTargets, checkRule, criticalDamage, criticalDamageGM, checkMechanic, safeGetGameSetting, debounceInterval, autoRollDamageOptions, showReactionAttackRollOptions, shouldDisplaySaveDC, DOWNGRADE_IMMUNITY_KEY, ALL_DAMAGE_KEY } from "./settings.js";
import { log } from "../midi-qol.js";
import { AttributionEntry, AttributionMap, AttributionType, AugmentedEvent, DummyWorkflow, Workflow, WorkflowOptions, WorkflowRollOptions } from "./Workflow.js";
import { preferredActiveGM, prepareDamageListToJSON, socketlibSocket, timedAwaitExecuteAsGM, unTimedExecuteAsGM } from "./GMAction.js";
import { dice3dEnabled, installedModules } from "./setupModules.js";
import { concentrationCheckItemDisplayName } from "./Hooks.js";

import { OnUseMacros } from "./apps/Item.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { MidiActivityChoiceDialog } from "./apps/MidiActivityChoiceDialog.js";
import { Activity, ActivityUseConfiguration, CalcDamageOptions, DamageDescription, DamageListEntry, PreComputedAdvantageData, PreSetupDamageListEntry, RollDialogConfig, RollMessageConfig, TokenOrDocument, DND5ETargetDescriptor, SaveDetails } from "../globals.js";

import Token = foundry.canvas.placeables.Token;
import { AnyMutableObject, AnyObject } from "fvtt-types/utils";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

const defaultTimeout = 30;
export type ReactionItemReference = { itemName: string, itemId: string, actionName: string, img: string, id: string, uuid: string } | String;
export type ReactionItem = { itemName: string, itemId: string, actionName: string, img: string, id: string, uuid: string, baseItem: Item } | Activity;

// Helper to create full flag path from a short flag name
export function midiFlag(flag: string): string {
  return `flags.${MODULE_ID}.${flag}`;
}

export function getDamageType(flavorString: string = ''): string | undefined {
  if (flavorString === '') return "none";
  if (GameSystemConfig.damageTypes[flavorString] !== undefined) {
    return flavorString;
  }
  if (GameSystemConfig.healingTypes[flavorString] !== undefined) {
    return flavorString;
  }
  const validDamageTypes = Object.entries(GameSystemConfig.damageTypes).map(([key, { label }]) => [label.toLowerCase(), key]);
  const validHealingTypes = Object.entries(GameSystemConfig.healingTypes).map(([key, { label }]) => [label.toLowerCase(), key]);
  const allTypes = Object.fromEntries(validDamageTypes.concat(validHealingTypes));
  return allTypes[flavorString.toLowerCase()];
}

// This doesn't seem to be used anywhere
// export function getDamageFlavor(damageType): string | undefined {
//   const validDamageTypes = Object.entries(GameSystemConfig.damageTypes).deepFlatten().concat(Object.entries(GameSystemConfig.healingTypes).deepFlatten())
//   const allDamageTypeEntries = Object.entries(GameSystemConfig.damageTypes).concat(Object.entries(GameSystemConfig.healingTypes));
//   if (validDamageTypes.includes(damageType)) {
//     const damageEntry: any = allDamageTypeEntries?.find(e => e[0] === damageType);
//     return damageEntry ? damageEntry[1].label : damageType
//   }
//   return undefined;
// }

/**
*  Modifies the provided damageItem! For use during the isDamaged macro passes.
*/
export function modifyDamageBy({
  damageItem,
  value,
  multiplier = 1,
  type = "none",
  reason
}: {
  damageItem: DamageListEntry;
  value: number;
  multiplier: number;
  type: string;
  reason?: string;
}): {} {
  //reminder: For use during the isDamaged macro passes ONLY!
  if (!damageItem || foundry.utils.isEmpty(damageItem)) return {};
  if (!value) return {};
  const damageModification = { value, active: { multiplier }, type, properties: new Set<string>() };
  if (!configSettings.useDamageDetail) damageItem.hpDamage += value;
  damageItem.damageDetail.push(damageModification);
  if (reason) damageItem.details.push(reason);
  return damageModification;
}

export function createDamageDetail({
  roll,
  activity,
  defaultType = MidiQOL.MQdefaultDamageType
}: {
  roll: Roll | Roll[];
  activity: Activity | null;
  defaultType: string;
}): DamageDescription[] {
  let rolls = roll;
  if (rolls instanceof Roll) {
    rolls = [rolls];
  }
  if (activity?.damage?.parts[0]) {
    defaultType = activity.damage.parts[0].types.first() ?? defaultType;
  }
  rolls = rolls.map(r => {
    r = foundry.utils.deepClone(r);
    // @ts-expect-error no dnd5e-types
    if (!r.options.type) r.options.type = defaultType;
    return r;
  })

  //@ts-expect-error no dnd5e-types
  const aggregatedRolls: CONFIG.Dice.DamageRoll[] = game.system.dice.aggregateDamageRolls(rolls, { respectProperties: true });
  let detail = aggregatedRolls.map(roll => {
    const value = roll.options.type !== "healing" ? Math.max(0, roll.total) : roll.total;
    return { value, damage: value, type: roll.options.type as string, formula: roll.formula as string, properties: new Set(roll.options.properties as string[] ?? []) }
  });
  return detail;
}

export function getOrCreateTokenForActor(actor?: Actor.Implementation) {
  if (!actor) return;
  if (actor.token?.object) return actor.token.object; //actor.token is a token document.
  const token = tokenForActor(actor);
  if (token) return token;
  const tokenData = actor.prototypeToken.toObject();
  tokenData.actorId = actor.id!;
  const cls = globalThis.getDocumentClass("Token");
  // TODO check this - not sure if actor is set correctly
  const tokenDocument = new cls(tokenData, { parent: canvas.scene });
  return new CONFIG.Token.objectClass(tokenDocument);
}

export function getOrCreateTokenForActorAsSet(actor: Actor.Implementation): Set<Token.Implementation> {
  const selfTarget = getOrCreateTokenForActor(actor);
  if (selfTarget) return new Set([selfTarget]);
  return new Set();
}

/** 
 * Work out the appropriate multiplier for DamageTypeString on actor
 * If configSettings.damageImmunities are not being checked always return 1
 * 
 */

export let getTraitMult = (actor: Actor.Implementation, dmgTypeString: string, item: Item.Implementation, damageProperties: string[] = []): number => {
  dmgTypeString = getDamageType(dmgTypeString) ?? "";
  let totalMult = 1;
  if (["healing", "temphp"].includes(dmgTypeString)) totalMult = -1;
  if (dmgTypeString === "midi-none") return 0;
  if (configSettings.damageImmunities === "none") return totalMult;
  const physicalDamageTypes = Object.keys(GameSystemConfig.damageTypes).filter(dt => GameSystemConfig.damageTypes[dt].isPhysical);

  if (dmgTypeString !== "") {
    // if not checking all damage counts as magical
    // @ts-expect-error no dnd5e-types
    let magicalDamage = item.system.magicAvailable;
    // @ts-expect-error no dnd5e-types
    magicalDamage ??= item?.system.properties?.has("mgc");
    // @ts-expect-error no dnd5e-types
    magicalDamage ||= (configSettings.requireMagical === "off" && (item?.system.magicalBonus > 0 || item?.system.attackBonus > 0));
    // @ts-expect-error no dnd5e-types
    magicalDamage ||= (configSettings.requireMagical === "off" && item?.type !== "weapon");
    // @ts-expect-error no dnd5e-types
    magicalDamage ||= (configSettings.requireMagical === "nonspell" && item?.type === "spell");
    magicalDamage ||= damageProperties.includes("mgc");
    // @ts-expect-error no dnd5e-types
    const silverDamage = item?.system.properties.has("sil") || magicalDamage || damageProperties.includes("sil");
    // @ts-expect-error no dnd5e-types
    const adamantineDamage = item?.system.properties?.has("ada") || damageProperties.includes("ada");
    const physicalDamage = physicalDamageTypes.includes(dmgTypeString);

    let traitList = [
      { type: "di", mult: configSettings.damageImmunityMultiplier },
      { type: "dr", mult: configSettings.damageResistanceMultiplier },
      { type: "dv", mult: configSettings.damageVulnerabilityMultiplier }];

    for (let { type, mult } of traitList) {
      // @ts-expect-error no dnd5e-types
      if (!actor.system.traits) continue;
      // @ts-expect-error no dnd5e-types
      let trait = foundry.utils.deepClone(actor.system.traits[type].value);
      // trait = trait.map(dt => dt.toLowerCase());
      let customs: string[] = [];
      // @ts-expect-error no dnd5e-types
      if (actor.system.traits[type].custom?.length > 0) {
        // @ts-expect-error no dnd5e-types
        customs = actor.system.traits[type].custom.split(";").map(s => s.trim())
      }

      // @ts-expect-error no dnd5e-types
      const bypasses = actor.system.traits[type].bypasses ?? new Set();
      // @ts-expect-error no dnd5e-types
      const itemProperties = item?.system.properties ?? new Set()
      let bypassTrait = itemProperties.intersection(bypasses).size > 0;
      if (physicalDamage && bypassTrait) continue;
      // process new custom field versions
      if (!["healing", "temphp"].includes(dmgTypeString)) {
        if (customs.includes(dmgTypeString) || trait.has(dmgTypeString)) {
          totalMult = totalMult * mult;
          continue;
        }
        if (!magicalDamage && (trait.has("nonmagic") || customs.includes(GameSystemConfig.customDamageResistanceTypes?.nonmagic))) {
          totalMult = totalMult * mult;
          continue;
        } else if (!magicalDamage && physicalDamage && (trait.has("physical") || customs.includes(GameSystemConfig.customDamageResistanceTypes?.physical))) {
          totalMult = totalMult * mult;
          continue;
        } else if (magicalDamage && trait.has("magic")) {
          totalMult = totalMult * mult;
          continue;
        }

        // @ts-expect-error no dnd5e-types
        else if (item?.type === "spell" && trait.has("spell")) {
          totalMult = totalMult * mult;
          continue;
        }
        if (customs.length > 0) {
          if (!magicalDamage && (customs.includes("nonmagic") || customs.includes(GameSystemConfig.customDamageResistanceTypes?.nonmagic))) {
            totalMult = totalMult * mult;
            continue;
          } else if (!magicalDamage && physicalDamage && (customs.includes("physical") || customs.includes(GameSystemConfig.customDamageResistanceTypes?.physical))) {
            totalMult = totalMult * mult;
            continue;
          } else if (magicalDamage && (customs.includes("magic") || customs.includes(GameSystemConfig.customDamageResistanceTypes.magic))) {
            totalMult = totalMult * mult;
            continue;
            // @ts-expect-error no dnd5e-types
          } else if (item?.type === "spell" && (customs.includes("spell") || customs.includes(GameSystemConfig.customDamageResistanceTypes.spell))) {
            totalMult = totalMult * mult;
            continue;
          }
        }

        // Support old style leftover settings
        if (configSettings.damageImmunities === "immunityPhysical") {
          if (!magicalDamage && trait.has("physical"))
            physicalDamageTypes.forEach(dt => trait.add(dt))
          if (!(magicalDamage || silverDamage) && trait.has("silver"))
            physicalDamageTypes.forEach(dt => trait.add(dt))
          if (!(magicalDamage || adamantineDamage) && trait.has("adamant"))
            physicalDamageTypes.forEach(dt => trait.add(dt))
        }

      }
      if (trait.has(dmgTypeString))
        totalMult = totalMult * mult;
    }
  }
  return totalMult;
  // Check the custom immunities
}
export async function applyTokenDamage(
  damageDetail: DamageDescription[],
  totalDamage: number,
  theTargets: Set<Token.Implementation>,
  item: Item.Implementation | null | undefined,
  saves: Set<Token.Implementation>,
  options: any = {
    label: "defaultDamage",
    existingDamage: [],
    superSavers: new Set(),
    semiSuperSavers: new Set(),
    workflow: undefined,
    updateOptions: { awaitDamageApplication: configSettings.waitForDamageApplication },
    forceApply: false,
    noConcentrationCheck: false,
  }
): Promise<any[]> {
  let allDamages: Record<string, DamageListEntry> = {};
  damageDetail = damageDetail.map(de => ({ ...de, value: (de.value ?? de.damage) }))
  let workflow: Workflow | undefined = options.workflow;
  if (item && !options.workflow) workflow = Workflow.getWorkflow(item.uuid);

  for (let token of theTargets) {
    const actor = token.actor;
    if (!actor) continue;
    const isHit = true;
    const saved = !!saves?.has(token);
    const superSaver = !!options.superSavers?.has(token);
    const semiSuperSaver = !!options.semiSuperSavers?.has(token);
    let saveMultiplier = 1;

    if (saved) {
      saveMultiplier = getSaveMultiplierForItem(item, "defaultDamage");
    }
    /*    if (superSaver && getSaveMultiplierForItem(item, "defaultDamage") === configSettings.defaultSaveMult) {
          saveMultiplier = saves.has(token) ? 0 : configSettings.defaultSaveMult;
        }
    */

    if (semiSuperSaver && saved) {
      saveMultiplier = 0;
    }
    const calcDamageOptions = {
      invertHealing: true,
      multiplier: 1,
      midi: {
        saved,
        itemType: item?.type,
        saveMultiplier,
        isHit: true,
        superSaver,
        semiSuperSaver,
        sourceActorUuid: actor?.uuid,
        // @ts-expect-error no dnd5e-types
        uncannyDodge: foundry.utils.getProperty(actor, `flags.${MODULE_ID}.uncanny-dodge`) && item?.hasAttack,
        // some options for ripper's module
        save: saved,
        targetUuid: token?.document.uuid,
        fumbleSave: false,
        criticalSave: false,
        isCritical: false,
        isFumble: false
      }
    };
    if (configSettings.saveDROrder === "DRSavedr") {
      calcDamageOptions.midi.saveMultiplier = saveMultiplier;
    } else {
      calcDamageOptions.midi.saveMultiplier = 1;
      calcDamageOptions.multiplier = saveMultiplier;
    }
    // @ts-expect-error no dnd5e-types
    const combinedDamage: DamageDescription[] = foundry.utils.deepClone(actor.calculateDamage(damageDetail, calcDamageOptions));
    const fullDamage = setupDamageDetails({
      actorId: actor.id!,
      actorUuid: actor.uuid,
      critical: false,
      damageDetail: combinedDamage,
      damageDetails: {
        combinedDamage,
        rawcombinedDamage: damageDetail,
        calcDamageOptions: { combinedDamage: calcDamageOptions }
      },
      isHit,
      rawDamageDetail: damageDetail,
      saved,
      sceneId: canvas.scene?.id ?? "",
      semiSuperSaver,
      superSaver,
      totalDamage,
      targetUuid: token.document.uuid,
    }, "combinedDamage", actor);
    if (fullDamage) allDamages[actor.uuid] = fullDamage;
  }

  if (!options.updateOptions?.awaitDamageApplication) {
    options.updateOptions ??= {};
    options.updateOptions.awaitDamageApplication = true;
  }
  const cardIds: string[] = await timedAwaitExecuteAsGM("createReverseDamageCard", {
    autoApplyDamage: configSettings.autoApplyDamage,
    sender: game.user?.name,
    actorId: workflow?.actor?.id,
    actorUuid: workflow?.actor?.uuid,
    charName: workflow?.token?.name ?? workflow?.actor?.name ?? game.user?.name,
    damageList: prepareDamageListToJSON(Object.values(allDamages)),
    chatCardUuid: workflow?.itemCardUuid,
    flagTags: workflow?.flagTags,
    updateOptions: options.updateOptions,
    forceApply: options.forceApply,
  });
  return cardIds;
}

/**
 * Apply different damage/healing amounts to multiple targets, producing a single damage card.
 * Each entry specifies a token and its own damageDetail/totalDamage.
 * @param targetDamages Array of per-target damage specifications
 * @param item The item responsible for the damage (used for card display)
 * @param options Same options as applyTokenDamage (workflow, forceApply, updateOptions, etc.)
 */
export async function applyTokenDamageMany(
  targetDamages: { token: Token.Implementation, damageDetail: DamageDescription[], totalDamage: number }[],
  item: Item.Implementation | null | undefined,
  options: any = {
    workflow: undefined,
    updateOptions: { awaitDamageApplication: configSettings.waitForDamageApplication },
    forceApply: false,
  }
): Promise<any[]> {
  let allDamages: Record<string, DamageListEntry> = {};
  let workflow: Workflow | undefined = options.workflow;
  if (item && !options.workflow) workflow = Workflow.getWorkflow(item.uuid);

  for (const entry of targetDamages) {
    const actor = entry.token.actor;
    if (!actor) continue;
    const damageDetail = entry.damageDetail.map(de => ({ ...de, value: (de.value ?? de.damage) }));
    const calcDamageOptions = {
      invertHealing: true,
      multiplier: 1,
      midi: {
        saved: false,
        itemType: item?.type,
        saveMultiplier: 1,
        isHit: true,
        superSaver: false,
        semiSuperSaver: false,
        sourceActorUuid: actor?.uuid,
        uncannyDodge: false,
        save: false,
        targetUuid: entry.token?.document.uuid,
        fumbleSave: false,
        criticalSave: false,
        isCritical: false,
        isFumble: false
      }
    };
    // @ts-expect-error no dnd5e-types
    const combinedDamage: DamageDescription[] = foundry.utils.deepClone(actor.calculateDamage(damageDetail, calcDamageOptions));
    const fullDamage = setupDamageDetails({
      actorId: actor.id!,
      actorUuid: actor.uuid,
      critical: false,
      damageDetail: combinedDamage,
      damageDetails: {
        combinedDamage,
        rawcombinedDamage: damageDetail,
        calcDamageOptions: { combinedDamage: calcDamageOptions }
      },
      isHit: true,
      rawDamageDetail: damageDetail,
      saved: false,
      sceneId: canvas.scene?.id ?? "",
      semiSuperSaver: false,
      superSaver: false,
      totalDamage: entry.totalDamage,
      targetUuid: entry.token.document.uuid,
    }, "combinedDamage", actor);
    if (fullDamage) allDamages[actor.uuid] = fullDamage;
  }

  if (!options.updateOptions?.awaitDamageApplication) {
    options.updateOptions ??= {};
    options.updateOptions.awaitDamageApplication = true;
  }
  const cardIds: string[] = await timedAwaitExecuteAsGM("createReverseDamageCard", {
    autoApplyDamage: configSettings.autoApplyDamage,
    sender: game.user?.name,
    actorId: workflow?.actor?.id,
    actorUuid: workflow?.actor?.uuid,
    charName: workflow?.token?.name ?? workflow?.actor?.name ?? game.user?.name,
    damageList: prepareDamageListToJSON(Object.values(allDamages)),
    chatCardUuid: workflow?.itemCardUuid,
    flagTags: workflow?.flagTags,
    updateOptions: options.updateOptions,
    forceApply: options.forceApply,
  });
  return cardIds;
}

export interface applyDamageDetails {
  label: string;
  damageDetail: any[];
  damageTotal: number;
  saves?: Set<Token | TokenDocument>;
  superSavers?: Set<Token | TokenDocument>;
  semiSuperSavers?: Set<Token | TokenDocument>;
}
export function mergeDamageDetail(damageDetail: any[]) {
  // merge the damage details into a single array, removing duplicates
  const merged: Record<string, DamageDescription> = {};
  for (const dd of damageDetail) {
    const makeHash = (type, properties = [], active: AnyObject) => [type, ...(true ? Array.from(properties).sort() : []), Array.from(active ? Object.entries(active) : [])].join();
    const key = makeHash(dd.type, dd.properties ?? new Set(), dd.active)
    if (dd.type === "midi-none") continue;
    if (merged[key]) {
      merged[key].value += dd.value;
      merged[key].damage = merged[key].value; // deprecated
      merged[key].formula += " + " + dd.formula;
      if (dd.properties)
        merged[key].properties = merged[key].properties.union(dd.properties);
    } else {
      merged[key] = { ...dd };
    }
  }
  return Object.values(merged);
}
export function setupDamageDetails(actorDamage: PreSetupDamageListEntry, selector: "combinedDamage" | "otherDamage", actor: Actor.Implementation) {
  const mergedDetails = mergeDamageDetail(actorDamage.damageDetails[selector] ?? []);
  let { damage, temp, healing } = (mergedDetails).reduce((acc, d) => {
    if (d.type === "temphp") acc.temp += d.value;
    else if (d.type === "healing") acc.healing += d.value;
    else if (!["midi-none", "vitality"].includes(d.type)) acc.damage += d.value; // Exclude vitality from HP damage
    return acc;
  }, { damage: 0, temp: 0, healing: 0 });
  damage = Math.max(0, damage);
  let totalDamage = damage;
  let healingAdjustedTotalDamage = damage + healing;
  healingAdjustedTotalDamage = healingAdjustedTotalDamage < 0 ? Math.ceil(healingAdjustedTotalDamage) : Math.floor(healingAdjustedTotalDamage);
  const as = actor?.system;
  // @ts-expect-error no dnd5e-types
  if (!as || !as.attributes.hp) return;
  // @ts-expect-error no dnd5e-types
  let effectiveTemp = as.attributes.hp.temp ?? 0;
  const deltaTemp = healingAdjustedTotalDamage > 0 ? Math.min(effectiveTemp, healingAdjustedTotalDamage) : 0;
  // @ts-expect-error no dnd5e-types
  const deltaHP = Math.clamp(healingAdjustedTotalDamage - deltaTemp, -as.attributes.hp.damage, as.attributes.hp.value);
  // @ts-expect-error no dnd5e-types
  const oldTempHP = as.attributes.hp.temp ?? 0;
  const newTempHP = Math.floor(Math.max(0, effectiveTemp - deltaTemp, temp))
  const completeActorDamage: DamageListEntry = {
    damageSelector: selector,
    ...actorDamage,
    updateOptions: {},
    calcDamageOptions: actorDamage.damageDetails.calcDamageOptions[selector] as CalcDamageOptions,
    // @ts-expect-error no dnd5e-types
    oldHP: as.attributes.hp.value,
    // @ts-expect-error no dnd5e-types
    newHP: as.attributes.hp.value - deltaHP,
    oldTempHP,
    useDamageDetail: configSettings.useDamageDetail,
    hpDamage: deltaHP,
    newTempHP,
    // damages.tempDamage = deltaTemp,
    tempDamage: oldTempHP - newTempHP,
    totalDamage: totalDamage,
    healingAdjustedTotalDamage: healingAdjustedTotalDamage,
    details: [],
    wasHit: actorDamage.isHit,
  };
  return completeActorDamage;
}

export async function processDamageRoll(workflow: Workflow, defaultDamageType: string) {
  if (debugEnabled > 0) warn("processDamageRoll |", workflow)
  let hitTargets = new Set([...(workflow.hitTargets ?? []), ...(workflow.hitTargetsEC ?? [])]);
  let theTargets = new Set(workflow.targets);
  // TODO becomes activity.target.affects.type === "self"
  // if (activity.target.affects.type === "self") theTargets = await getOrCreateTokenForActorAsSet(actor) || theTargets;
  let effectsToExpire: string[] = [];
  if (hitTargets.size > 0 && workflow.activity.attack) effectsToExpire.push("1Hit");
  if (hitTargets.size > 0 && workflow.activity.damage) effectsToExpire.push("DamageDealt");
  if (effectsToExpire.length > 0) {
    await expireMyEffects.bind(workflow)(effectsToExpire);
  }

  if (debugEnabled > 0) warn("processDamageRoll | damage details pre merge are ", workflow.rawDamageDetail, workflow.rawBonusDamageDetail ?? []);
  let totalDamage = 0;

  const baseNoDamage = workflow.rawDamageDetail?.length === 0 || (workflow.rawDamageDetail?.length === 1 && workflow?.rawDamageDetail[0]?.type === "midi-none");
  const bonusNoDamage = workflow.rawBonusDamageDetail?.length === 0 || (workflow.rawBonusDamageDetail?.length === 1 && workflow.rawBonusDamageDetail[0]?.type === "midi-none");
  const otherNoDamage = workflow.rawOtherDamageDetail?.length === 0 || (workflow.rawOtherDamageDetail?.length === 1 && workflow.rawOtherDamageDetail[0]?.type === "midi-none");
  if (baseNoDamage && bonusNoDamage && otherNoDamage) return;

  const damagePerActor: Record<string, PreSetupDamageListEntry> = {};
  workflow.damageList = [];
  totalDamage = 0;
  totalDamage = workflow.rawDamageDetail?.reduce((acc, di) => acc + (di.type === "temphp" ? 0 : di.type === "healing" ? -di.value : di.value), 0) ?? 0;
  if (workflow.rawOtherDamageDetail) totalDamage += workflow.rawOtherDamageDetail.reduce((acc, di) => acc + (di.type === "temphp" ? 0 : di.value), 0) ?? 0;
  if (workflow.rawBonusDamageDetail) totalDamage += workflow.rawBonusDamageDetail.reduce((acc, di) => acc + (di.type === "temphp" ? 0 : di.value), 0) ?? 0;
  const defaultSaveMultiplier = getSaveMultiplierForActivity(workflow.activity);
  for (let token of theTargets) {
    const actor = token.actor;
    if (!actor) continue;
    const tokenDocument = token.document;
    let challengeModeScale = 1;
    let challengeModeAR = 0;
    if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor") as string) && workflow.attackRoll && workflow.hitTargetsEC?.has(token)) {
      //scale the damage detail for a glancing blow - only for the first damage list? or all?
      const scale = workflow.challengeModeScale?.[tokenDocument?.uuid ?? "dummy"] ?? 1;
      challengeModeScale = scale;
    } else if (checkRule("challengeModeArmor") === "challenge" && workflow.hitTargetsEC?.has(token)) {
      //@ts-expect-error no dnd5e-types
      challengeModeAR = token.actor?.system.attributes.ac.AR ?? 0;
    }

    const semiSuperSaver = workflow.semiSuperSavers.has(token);
    const superSaver = workflow.superSavers.has(token);
    const hasSaved = workflow.saves.has(token);
    const saveMultiplier = hasSaved
      ? superSaver || semiSuperSaver
        ? 0
        : defaultSaveMultiplier
      : superSaver
        ? defaultSaveMultiplier
        : 1;
    damagePerActor[actor.uuid] = {
      actorId: actor.id!,
      actorUuid: actor.uuid,
      challengeModeScale,
      challengeModeAR,
      critical: workflow.isCritical,
      damageDetail: [],
      damageDetails: { combinedDamage: [], rawcombinedDamage: [], defaultDamage: [], rawdefaultDamage: workflow.rawDamageDetail ?? [], otherDamage: [], rawotherDamage: workflow.rawOtherDamageDetail ?? [], bonusDamage: [], rawbonusDamage: workflow.rawBonusDamageDetail ?? [], calcDamageOptions: {} },
      isHit: hitTargets.has(token),
      rawDamageDetail: [],
      saved: hasSaved,
      sceneId: canvas.scene?.id ?? "",
      semiSuperSaver,
      superSaver,
      totalDamage,
      targetUuid: tokenDocument?.uuid,
    };
    if (!foundry.utils.getProperty(workflow.activity.item, `flags.${MODULE_ID}.noProvokeReaction`) && !workflow?.workflowOptions?.noProvokeReaction) {
      if (totalDamage !== 0 && (workflow.hitTargets.has(token) || workflow.hitTargetsEC.has(token) || workflow.hasSave)) {
        const isHealing = ("heal" === workflow.activity.actionType) || totalDamage < 0;
        await doReactions(token, workflow.tokenUuid, workflow.damageRoll ?? workflow.bonusDamageRoll ?? workflow.otherDamageRoll ?? new Roll("0"), !isHealing ? "reactiondamage" : "reactionheal", { activity: workflow.activity, item: workflow.item, workflow, workflowOptions: { damageDetail: workflow.rawDamageDetail, damageTotal: totalDamage, sourceActorUuid: workflow.actor.uuid, sourceItemUuid: workflow.item.uuid, sourceAmmoUuid: workflow.ammunition?.uuid } });
      }
    }
    const damageDetails = damagePerActor[actor.uuid].damageDetails;
    let combinedRawDamageDetails: DamageDescription[] = [];
    let combinedDamageDetails: DamageDescription[] = [];


    const damageBuckets: [DamageDescription[], "defaultDamage" | "otherDamage" | "bonusDamage"][] = [
      [workflow.damageDetail ?? [], "defaultDamage"],
      [(workflow.otherDamageMatches?.has(token) ?? true) ? (workflow.otherDamageDetail ?? []) : [], "otherDamage"],
      [workflow.bonusDamageDetail ?? [], "bonusDamage"]
    ];

    const buildCalcDamageOptions = (): CalcDamageOptions => {
      const calcDamageOptions: CalcDamageOptions = {
        invertHealing: true,
        multiplier: challengeModeScale,
        // Always initialize ignore to ensure dnd5e calculateDamage processes traits correctly
        ignore: {
          immunity: new Set<string>(),
          resistance: new Set<string>(),
          vulnerability: new Set<string>(),
          modification: new Set<string>(),
          absorption: new Set<string>(),
        },
        midi: {
          challengeModeAR,
          applyDamage: true,
          criticalSave: workflow.criticalSaves.has(token),
          fumbleSave: workflow.fumbleSaves.has(token),
          isCritical: workflow.isCritical,
          isFumble: workflow.isFumble,
          isHit: hitTargets.has(token),
          itemType: workflow.item.type,
          save: hasSaved,
          saved: hasSaved,
          saveMultiplier, // default
          semiSuperSaver,
          sourceActorUuid: workflow.actor.uuid,
          superSaver,
          targetUuid: token.document.uuid,
          // @ts-expect-error no dnd5e-types
          uncannyDodge: actor.flags?.[MODULE_ID]?.["uncanny-dodge"] && workflow.item?.hasAttack
        }
      };
      const categories: Record<string, string> = { "idi": "immunity", "idr": "resistance", "idv": "vulnerability", "ida": "absorption", "idm": "modification" };
      const ignoreTraits = workflow?.activity?.midiProperties?.ignoreTraits;
      if (ignoreTraits) {
        /*
         * Ignore an entire category. "All Damage" traits are stored under the literal "ALL", which
         * is not a member of damageTypes, so enumerating damage types alone left an all-damage
         * trait fully in force.
         */
        const ignoreWholeCategory = (category: string) => {
          if (!calcDamageOptions.ignore?.[category]) foundry.utils.setProperty(calcDamageOptions, `ignore.${category}`, new Set())
          for (let dt of Object.keys(GameSystemConfig.damageTypes)) {
            calcDamageOptions.ignore![category].add(dt);
          }
          calcDamageOptions.ignore![category].add(ALL_DAMAGE_KEY);
        };
        for (let key of Object.keys(categories)) {
          // Check for base key (e.g., "idi") - applies to all damage types
          if (ignoreTraits.has(key)) ignoreWholeCategory(categories[key]);
        }
        // Check for damage-type specific keys (e.g., "idi.fire")
        for (const trait of ignoreTraits) {
          if (trait.includes('.')) {
            const [categoryKey, damageType] = trait.split('.');
            const category = categories[categoryKey];
            if (!category) continue;
            // "ALL" is not offered in the UI - the blanket key covers it - but tolerate it
            // from hand-edited data or a macro: it is shorthand for every damage type.
            if (damageType === ALL_DAMAGE_KEY) {
              ignoreWholeCategory(category);
              continue;
            }
            if (GameSystemConfig.damageTypes[damageType]) {
              if (!calcDamageOptions.ignore?.[category]) foundry.utils.setProperty(calcDamageOptions, `ignore.${category}`, new Set())
              calcDamageOptions.ignore![category].add(damageType);
            }
          }
        }
        /*
         * Downgrade immunity to resistance - ignoring an immunity would leave full damage. Only the
         * types this target is immune to: dnd5e ignores the resistance of a downgraded type that has
         * no immunity to downgrade.
         */
        // @ts-expect-error no dnd5e-types
        const immunities: Set<string> = actor.system.traits?.di?.value ?? new Set();
        const downgradeTypes = (ignoreTraits.has(DOWNGRADE_IMMUNITY_KEY) || ignoreTraits.has(`${DOWNGRADE_IMMUNITY_KEY}.${ALL_DAMAGE_KEY}`))
          ? new Set(immunities)
          : new Set(Array.from(ignoreTraits)
            .filter(trait => trait.startsWith(`${DOWNGRADE_IMMUNITY_KEY}.`))
            .map(trait => trait.split('.')[1])
            .filter(damageType => immunities.has(damageType) || immunities.has(ALL_DAMAGE_KEY)));
        if (downgradeTypes.size) calcDamageOptions.downgrade = downgradeTypes;
      }
      return calcDamageOptions;
    };

    const otherSaveMultiplier = (workflow.otherActivity?.save || workflow.otherActivity?.check)
      ? (() => {
        const defaultOtherMultiplier = getSaveMultiplierForActivity(workflow.otherActivity);
        return hasSaved
          ? superSaver || semiSuperSaver
            ? 0
            : defaultOtherMultiplier
          : superSaver
            ? defaultOtherMultiplier
            : 1;
      })()
      : undefined;

    if (configSettings.singleDamageCalculation) {
      // One calculateDamage call for all of a target's damage. dnd5e treats a damage modification
      // (system.traits.dm.amount) as a budget consumed across the entries of a single call, and midi's
      // own DR (traits.dm.midi) is likewise summed per call - so calling once per category applied both
      // once per category. The only per-category input is the other-damage save multiplier, carried on
      // the entries instead of in the options.
      const calcDamageOptions = buildCalcDamageOptions();
      if (otherSaveMultiplier !== undefined) for (const d of damageBuckets[1][0]) d.midiSaveMultiplier = otherSaveMultiplier;

      const allDamage: DamageDescription[] = [];
      for (const [damages, type] of damageBuckets) {
        for (const d of damages) d.midiCategory = type;
        allDamage.push(...damages);
        damageDetails[`raw${type}`] = damages;
        damageDetails.calcDamageOptions[type] = calcDamageOptions;
      }

      //@ts-expect-error no dnd5e-types
      const calculated: DamageDescription[] = token.actor.calculateDamage(allDamage, calcDamageOptions) ?? [];

      // Partition by tag, never by index: midi's DR pass pushes an aggregate entry and splices out
      // midi-none entries, so the returned array is neither the same length nor order as the input.
      for (const [, type] of damageBuckets) damageDetails[type] = calculated.filter(d => d.midiCategory === type);
      // Injected entries are cross-category, so they ride with the combined total rather than with
      // any single category's display.
      damageDetails.injectedDamage = calculated.filter(d => !d.midiCategory);
      combinedRawDamageDetails = allDamage;
      combinedDamageDetails = (damageDetails.defaultDamage ?? [])
        .concat(damageDetails.otherDamage ?? [], damageDetails.bonusDamage ?? [], damageDetails.injectedDamage);
    } else {
      for (let [damages, type] of damageBuckets) {
        if (!damages) {
          const message = `processDamageRoll | ${type} damages is not defined`;
          TroubleShooter.recordError(new Error("no valid damage"), message);
          error(message);
          continue;
        }
        const calcDamageOptions = buildCalcDamageOptions();
        if (type === "otherDamage" && otherSaveMultiplier !== undefined) calcDamageOptions.midi.saveMultiplier = otherSaveMultiplier;

        //@ts-expect-error no dnd5e-types
        let returnDamages = token.actor.calculateDamage(damages, calcDamageOptions);
        damageDetails[type] = returnDamages;
        damageDetails[`raw${type}`] = damages;
        damageDetails.calcDamageOptions[type] = calcDamageOptions;
        if (configSettings.singleConcentrationRoll) {
          combinedDamageDetails = combinedDamageDetails.concat(returnDamages);
          combinedRawDamageDetails = combinedRawDamageDetails.concat(damages);
        }
      }
    }
    damageDetails.calcDamageOptions.combinedDamage = damageDetails.calcDamageOptions.defaultDamage;
    const injected = damageDetails.injectedDamage ?? [];
    if (configSettings.singleConcentrationRoll) {
      damageDetails["rawcombinedDamage"] = mergeDamageDetail(combinedRawDamageDetails);
      damageDetails["combinedDamage"] = combinedDamageDetails;
    } else {
      damageDetails.rawcombinedDamage = mergeDamageDetail((damageDetails.rawdefaultDamage ?? []).concat(damageDetails.rawbonusDamage ?? []));
      damageDetails.combinedDamage = (damageDetails?.defaultDamage ?? []).concat(damageDetails.bonusDamage ?? [], injected);
    }
  }

  const preDamageList = Object.values(damagePerActor);
  // Explicitly typed because it only ever gets called with this, currently
  const toCheck: ("combinedDamage" | "otherDamage")[] = ["combinedDamage"];
  if (!configSettings.singleConcentrationRoll && workflow.otherDamageRolls) toCheck.push("otherDamage");
  let chatCardUuids: string[] = [];
  for (let selector of toCheck) {
    workflow.damageList = [];
    preDamageList.forEach(damageEntry => {
      damageEntry.damageDetail = damageEntry.damageDetails[selector] ?? damageEntry.damageDetail;
      damageEntry.rawDamageDetail = damageEntry.damageDetails[`raw${selector}`] ?? damageEntry.rawDamageDetail;
      // damageEntry.calcDamageOptions = damageEntry.damageDetails[`calcDamageOptions.${selector}`] ?? damageEntry.calcDamageOptions;
    });

    for (let token of theTargets) {
      const actor = token.actor;
      if (!actor) continue;
      const preDamageDetails = damagePerActor[actor.uuid];
      const damageDetails = setupDamageDetails(preDamageDetails, selector, actor);
      if (damageDetails) {
        damageDetails.damageDetails[selector] = damageDetails.damageDetail;
        workflow.damageList.push(damageDetails);
        await workflow?.callDamageHooksAndMacros(damageDetails, token);
      }
    }
    await timedAwaitExecuteAsGM("createReverseDamageCard", {
      autoApplyDamage: configSettings.autoApplyDamage,
      sender: game.user?.name,
      actorId: workflow.actor.id,
      actorUuid: workflow.actor.uuid,
      charName: workflow.token?.name ?? workflow.actor.name ?? game.user?.name,
      damageList: prepareDamageListToJSON(workflow.damageList),
      chatCardUuid: workflow.itemCardUuid,
      flagTags: workflow.flagTags,
      updateOptions: { noConcentrationCheck: workflow?.workflowOptions?.noConcentrationCheck ?? false, awaitDamageApplication: configSettings.waitForDamageApplication },
      forceApply: false
    }).then(cardIds => {
      if (cardIds) chatCardUuids.push(...cardIds);
      if (workflow && configSettings.undoWorkflow) {
        // Assumes workflow.undoData.chatCardUuids has been initialised
        if (workflow.undoData) {
          workflow.undoData.chatCardUuids = workflow.undoData.chatCardUuids.concat(chatCardUuids);
          unTimedExecuteAsGM("updateUndoChatCardUuids", workflow.undoData);
        }
      }
    });
  }
  if (debugEnabled > 1) debug(`process damage roll complete for ${workflow.item.name} `, workflow.damageList)
}

export function getSaveMultiplierForActivity(activity: Activity) {
  if (!activity) {
    error("getSaveMultiplierForActivity called with no activity");
    return 1;
  }
  if (activity?.damage?.onSave === undefined) return 1;

  let damageOnSave = activity.damage?.onSave;
  // @ts-expect-error no dnd5e-types
  if (activity.item.type === "spell" && activity.item.system.level === 0 && damageOnSave === "none") {
    const midiFlags = activity.actor?.flags?.[MODULE_ID];
    if (midiFlags?.potentCantrip) return configSettings.defaultSaveMult;
  }
  switch (activity.damage.onSave) {
    case "half":
      return configSettings.defaultSaveMult;
    case "none":
      return 0;
    case "full":
      return 1;
    default:
      return configSettings.defaultSaveMult;
  }
}

export let getSaveMultiplierForItem = (item?: Item.Implementation | null, itemDamageType?: string) => {
  // There are no per items settings anymore so just return default saves
  console.warn("getSaveMultiplierForItem is deprecated, use getSaveMultiplierForActivity instead");
  if (!item) return 1;
  // @ts-expect-error no dnd5e-types
  if (item.actor && item.type === "spell" && item.system.level === 0) { // cantrip
    const midiFlags = item.actor?.flags?.[MODULE_ID];
    if (midiFlags?.potentCantrip) return configSettings.defaultSaveMult;
    return 0;
  }
  return configSettings.defaultSaveMult;
};

export interface pcSaveOptions {
  flavor: string,
  requestId: string,
  GMprompt,
  isMagicSave: boolean,
  rollAbilities?: string[],
  rollSkills?: string[],
  rollTools?: string[],
  saveDetails: {
    advantage: boolean | undefined,
    disadvantage: boolean | undefined,
    isFriendly: boolean,
    isMagicSave: boolean,
    isConcentrationCheck: boolean | undefined,
    rollDC: number,
    saveItemUuid: string,
    workflowId: string,
    workflowUuid: string, // deprecated
    workflowOptions: object,
    itemCardUuid: string
  }
};

/**
 * Get the localized label for a tool from the compendium index.
 * dnd5e tools don't have a static `label` property like skills/abilities - their names come from compendium items.
 * @param toolId The tool identifier (e.g., "alchemist", "thief")
 * @returns The tool name, or the toolId as fallback if not found
 */
export function getToolLabel(toolId: string): string {
  const toolUUID = GameSystemConfig.tools[toolId]?.id;
  //@ts-expect-error no dnd5e-types
  const toolIndex = toolUUID ? dnd5e.documents.Trait.getBaseItem(toolUUID, { indexOnly: true }) : null;
  return toolIndex?.name ?? toolId;
}

/**
 * Build an array of choice options for a multi-ability save/check dialog.
 * Each entry includes the ability ID, localized label, and formatted modifier string.
 */
export function buildRollChoices(
  actor: Actor.Implementation,
  rollType: "save" | "check" | "skill" | "tool",
  ids: string[],
  abilityFor?: (id: string) => string | undefined
): { value: string, label: string, modifier: string }[] {
  // A skill or tool rolled with another ability than its own swaps that ability's modifier
  const skillToolTotal = (entry: { total?: number, ability?: string } | undefined, ability: string | undefined): number => {
    const total = entry?.total ?? 0;
    if (!ability || !entry?.ability || ability === entry.ability) return total;
    //@ts-expect-error no dnd5e-types
    const abilities = actor.system.abilities;
    return total - (abilities?.[entry.ability]?.mod ?? 0) + (abilities?.[ability]?.mod ?? 0);
  };
  if (rollType === "skill") {
    return ids.map(skillId => {
      const label = GameSystemConfig.skills[skillId]?.label ?? skillId;
      //@ts-expect-error no dnd5e-types
      const total = skillToolTotal(actor.system.skills?.[skillId], abilityFor?.(skillId));
      const modifier = total >= 0 ? `+${total}` : `${total}`;
      return { value: skillId, label, modifier };
    });
  }
  if (rollType === "tool") {
    return ids.map(toolId => {
      const label = getToolLabel(toolId);
      //@ts-expect-error no dnd5e-types
      const total = skillToolTotal(actor.system.tools?.[toolId], abilityFor?.(toolId));
      const modifier = total >= 0 ? `+${total}` : `${total}`;
      return { value: toolId, label, modifier };
    });
  }
  return ids.map(abilityId => {
    const label = GameSystemConfig.abilities[abilityId]?.label ?? abilityId;
    let total: number;
    //@ts-expect-error no dnd5e-types
    const abilityData = actor.system.abilities?.[abilityId];
    if (rollType === "save") {
      total = abilityData?.save?.value ?? abilityData?.mod ?? 0;
    } else {
      total = (abilityData?.mod ?? 0) + (abilityData?.checkBonus ?? 0);
    }
    const modifier = total >= 0 ? `+${total}` : `${total}`;
    return { value: abilityId, label, modifier };
  });
}

export function selectBestRollChoice(
  rollChoices: { value: string; label: string; modifier: string }[],
  advantageMap?: Record<string, { hasAdvantage: boolean; hasDisadvantage: boolean }>
): { value: string; label: string; modifier: string } | undefined {
  if (rollChoices.length === 0) return undefined;
  if (rollChoices.length === 1) return rollChoices[0];

  // Calculate effective value: modifier + advantage adjustment (+3.325 for adv, -3.325 for disadv)
  const getEffectiveValue = (choice: typeof rollChoices[0]) => {
    const mod = parseInt(choice.modifier) || 0;
    const advData = advantageMap?.[choice.value];
    if (advData?.hasAdvantage && !advData?.hasDisadvantage) return mod + 3.325;
    if (advData?.hasDisadvantage && !advData?.hasAdvantage) return mod - 3.325;
    return mod; // normal or both cancel out
  };

  return rollChoices.reduce((a, b) => getEffectiveValue(b) > getEffectiveValue(a) ? b : a);
}

export function requestPCSave(ability: string, rollType: string | undefined, player: string, actor: Actor.Implementation | null, options: pcSaveOptions): Promise<ChatMessage.Implementation | undefined> | undefined {
  try {
    // display a chat message to the user telling them to save
    const actorName = actor?.name ?? "Unknown";
    // Build display string - show all choices if multiple abilities or skills available
    let abilityString: string;
    const rollAbilities = options.rollAbilities;
    const rollSkills = options.rollSkills;
    const rollTools = options.rollTools;
    if (rollTools && rollTools.length > 0) {
      const labels = rollTools.map(t => getToolLabel(t));
      abilityString = labels.join(` ${i18n("midi-qol.or")} `);
    } else if (rollSkills && rollSkills.length > 0) {
      const labels = rollSkills.map(s => GameSystemConfig.skills[s]?.label ?? s);
      abilityString = labels.join(` ${i18n("midi-qol.or")} `);
    } else if (rollAbilities && rollAbilities.length > 0) {
      const labels = rollAbilities.map(a => GameSystemConfig.abilities[a]?.label ?? a);
      abilityString = labels.join(` ${i18n("midi-qol.or")} `);
    } else {
      // Fallback when no arrays provided (e.g., external callers)
      abilityString = ability || i18n("midi-qol.plain-d20-roll");
      let abilityDetails = GameSystemConfig.abilities[ability];
      if (!abilityDetails) abilityDetails = { ...GameSystemConfig.skills[ability], label: "" };
      if (!abilityDetails) abilityDetails = { ...GameSystemConfig.tools[ability], label: "" };
      if (abilityDetails?.label) abilityString = abilityDetails.label;
    }
    const rollLabel = rollType === "tool" ? i18n("midi-qol.tool-check") : rollType === "skill" ? i18n("midi-qol.skill-check") : rollType === "check" ? i18n("midi-qol.ability-check") : i18n("midi-qol.saving-throw");
    let content = ` ${actorName} ${shouldDisplaySaveDC() ? "DC " + options.saveDetails.rollDC : ""} ${abilityString} ${rollLabel}`;
    if (options.saveDetails.advantage && !options.saveDetails.disadvantage) content = content + ` (${i18n("DND5E.Advantage")}) - ${options.flavor})`;
    else if (!options.saveDetails.advantage && options.saveDetails.disadvantage) content = content + ` (${i18n("DND5E.Disadvantage")}) - ${options.flavor})`;
    else content = content + ` - ${options.flavor})`;
    const chatData = {
      content,
      whisper: [player]
    }
    // think about how to do this if (workflow?.flagTags) chatData.flags = foundry.utils.mergeObject(chatData.flags ?? "", workflow.flagTags);
    return ChatMessage.create(chatData);
  } catch (err) {
    const message = `midi-qol | request PC save`;
    TroubleShooter.recordError(err, message);
    error(message, err);
    return undefined;
  }
}

export function requestPCActiveDefence(player: User, actor: Actor, saveItemName: string, requestId: string, options: { formula: string, bonus: number, coverBonus: number, rollOptions: any, workflow: Workflow }) {
  const useUuid = true;
  const actorId = useUuid ? actor.uuid : actor.id;

  let rollMode = checkRule("activeDefenceShow") ?? CONST.DICE_ROLL_MODES.SELF;
  // TODO: Right check?
  let flavor = `${saveItemName} ${configSettings.optionalRules.activeDefence ? "DC " + options.rollOptions.target : ""} ${i18n("midi-qol.ActiveDefenceString")}`;
  const midiType = "defenceRoll";
  /*  const options = {
      criticalSuccess: criticalTarget,
      criticalFailure: fumbleTarget,
      advantageMode,
      target: this.activeDefenceDC
    };*/
  socketlibSocket.executeAsUser("D20Roll", player.id, { targetUuid: actor.uuid, formula: options.formula, bonus: options.bonus, coverBonus: options.coverBonus, rollOptions: options.rollOptions, rollMode, midiType, flavor, messageData: { speaker: getSpeaker(actor) } }).then(result => {
    if (debugEnabled > 1) debug("D20Roll result ", result);
    log("midi-qol | D20Roll result ", result);
    const handler = options.workflow.defenceRequests[requestId];
    if (!handler) // Roll must have timed out so we can ignore the return value;
      return;
    delete options.workflow.defenceRequests[requestId];
    delete options.workflow.defenceTimeouts[requestId];
    let returnValue;
    try {
      //@ts-expect-error D20Roll
      returnValue = CONFIG.Dice.D20Roll.fromJSON(JSON.stringify(result));
    } catch (err) { returnValue = {} }
    handler(returnValue);
  });
}

// ==================== Midi Flag Types ====================
// Maps flag keys to their value types for effect processing in midiCustomEffect
export var midiFlagTypes: Record<string, string> = {};

export function setupMidiFlagTypes() {
  let attackTypes = allAttackTypes.concat(["heal", "other", "save", "util"])

  attackTypes.forEach(at => {
    midiFlagTypes[`flags.midi-qol.DR.${at}`] = "number"
  });
  midiFlagTypes["flags.midi-qol.onUseMacroName"] = "string";

  if (game.system?.id === "dnd5e") {
    midiFlagTypes[`flags.midi-qol.DR.all`] = "string";
    midiFlagTypes[`flags.midi-qol.DR.non-magical`] = "string";
    midiFlagTypes[`flags.midi-qol.DR.non-silver`] = "string";
    midiFlagTypes[`flags.midi-qol.DR.non-adamant`] = "string";
    midiFlagTypes[`flags.midi-qol.DR.non-physical`] = "string";
    midiFlagTypes[`flags.midi-qol.DR.final`] = "number";

    Object.keys(GameSystemConfig.damageTypes).forEach(dt => {
      midiFlagTypes[`flags.midi-qol.DR.${dt}`] = "string";
    })
  }
}

export function midiCustomEffect(actor: Actor.Implementation, change: ActiveEffect.ChangeData & { effect?: ActiveEffect.Implementation }, current: unknown, delta: unknown, changes: unknown) {
  if (!change.key) return true;
  if (typeof change?.key !== "string") return true;
  // For passive effects originUuid should point to the parent item, rather than the original item.
  const originUuid = change.effect?.transfer ? change.effect.parent?.uuid : change.effect?.origin;
  if (!change.key?.startsWith(`flags.${MODULE_ID}`) && !change.key?.startsWith("system.traits.da.")) return true;
  const deferredEvaluation = [
    `flags.${MODULE_ID}.OverTime`,
    `flags.${MODULE_ID}.optional`,
    `flags.${MODULE_ID}.advantage`,
    `flags.${MODULE_ID}.disadvantage`,
    `flags.${MODULE_ID}.superSaver`,
    `flags.${MODULE_ID}.semiSuperSaver`,
    `flags.${MODULE_ID}.grants`,
    `flags.${MODULE_ID}.fail`,
    `flags.${MODULE_ID}.max.damage`,
    `flags.${MODULE_ID}.min.damage`,
    `flags.${MODULE_ID}.critical`,
    `flags.${MODULE_ID}.noCritical`,
    `flags.${MODULE_ID}.ignoreCover`,
    `flags.${MODULE_ID}.ignoreWalls`,
    `flags.${MODULE_ID}.rangeOverride`
  ];
  // These have trailing data in the change values and should always just be a string
  if (change.key === "flags.dnd5e.DamageBonusMacro") {
    // DAEdnd5e - daeCustom processes these
  } else if (change.key === `flags.${MODULE_ID}.onUseMacroName`) {
    // Change values are not guaranteed to be strings; this flag is only meaningful as one.
    if (typeof change.value !== "string") return true;
    const args = change.value.split(",")?.map(arg => arg.trim());
    const currentFlag = foundry.utils.getProperty(actor, `flags.${MODULE_ID}.onUseMacroName`) as string ?? "";
    if (args[0] === "ActivityMacro" || args[0] === MQActivityMacroLabel) {
      if (change.effect?.flags.dae?.activity) args[0] = `ActivityMacro.${change.effect.flags.dae.activity}`;
      // @ts-expect-error no dnd5e-types
      if (change.effect.transfer) args[0] = `ActivityMacro.${change.effect.parent!.system.activities.contents[0].uuid}`;
      else {
        const origin = fromUuidSync(change.effect?.origin) as Item.Implementation | ActiveEffect.Implementation | Activity | undefined;
        if (origin instanceof Item) {
          // @ts-expect-error no dnd5e-types
          const activities = origin.system.activities?.contents;
          if (activities[0]?.uuid) args[0] = `ActivityMacro.${activities[0].uuid}`;
        } else if (origin instanceof ActiveEffect) {
          // @ts-expect-error no dnd5e-types
          const activities = origin.parent?.system?.activities?.contents;
          if (activities[0]?.uuid) args[0] = `ActivityMacro.${activities[0].uuid}`;
        } else if (origin?.item) {
          args[0] = `ActivityMacro.${change.effect?.origin}`;
        }
      }
    } else if (args[0].startsWith("ActivityMacro") || args[0].startsWith(MQActivityMacroLabel)) {
      const potentialUuid = args[0].split(".").slice(1).join(".");
      if (potentialUuid.includes("Activity.")) { // ActivityMacro.activityUuid
        // since it's already an activity uuid do nothing
      } else {
        const item = fromUuidSync(potentialUuid);
        if (item instanceof Item) {
          // @ts-expect-error no dnd5e-types
          const activities = item.system.activities?.contents;
          if (activities[0]?.uuid) args[0] = `ActivityMacro.${activities[0].uuid}`;
        } else { // Activity.Name or Activity.identifier
          const origin = fromUuidSync(change.effect?.origin);
          if (change.effect?.flags.dae?.activity) {
            // @ts-expect-error no dnd5e-types
            const activities: Collection<Activity> = (fromUuidSync(change.effect.flags.dae.activity) as Activity).item.system.activities;
            const activity = activities.find(a => a.name === potentialUuid || a.identifier === potentialUuid);
            if (activity?.uuid) args[0] = `ActivityMacro.${activity.uuid}`;
          } else if (origin instanceof Item) {
            // @ts-expect-error no dnd5e-types
            const activities: Activity[] = origin.system.activities?.contents;
            const activity = activities.find(a => a.name === potentialUuid || a.identifier === potentialUuid);
            if (activity?.uuid) args[0] = `ActivityMacro.${activity.uuid}`;
          }
        }
      }
    } else if (args[0] === "ItemMacro" || args[0] === MQItemMacroLabel) { // rewrite the ItemMacro if possible
      if (change.effect?.transfer) args[0] = `ItemMacro.${change.effect.parent?.uuid}`;
      // else if (sourceId) args[0] = `ItemMacro.${sourceId}`;
      else {
        if (originUuid?.includes("Item.")) {
          // An origin on an item's effect (an aura's copy points at the aura) is that item's.
          const effectAt = originUuid.indexOf(".ActiveEffect.");
          args[0] = `ItemMacro.${effectAt >= 0 ? originUuid.slice(0, effectAt) : originUuid}`;
        } else {
          const origin = fromUuidSync(change.effect?.origin) as Item.Implementation | ActiveEffect.Implementation | undefined;
          if (origin instanceof Item) args[0] = `ItemMacro.${origin.uuid}`;
          else if (origin instanceof ActiveEffect) args[0] = `ItemMacro.${origin.origin}`;
        }
      }
    }
    if (originUuid?.includes("Item.")) {
      args[0] = `${args[0]}|${originUuid}`;
    }
    const extraFlag = `[${args[1]}]${args[0]}`;
    const macroString = (currentFlag?.length > 0) ? [currentFlag, extraFlag].join(",") : extraFlag;
    foundry.utils.setProperty(actor, `flags.${MODULE_ID}.onUseMacroName`, macroString)
    return true;
  } else if (change.key.startsWith(`flags.${MODULE_ID}.optional.`)
    && (change.value?.trim?.() === "ItemMacro" || change.value?.trim?.() === MQItemMacroLabel)) {
    let macroString = change.value;
    if (originUuid?.includes("Item.")) {
      const itemUuid = originUuid?.includes("ActiveEffect.") ? originUuid.split(".").slice(0, -2).join(".") : originUuid;
      macroString = `ItemMacro.${itemUuid}`;
    } else {
      const origin = fromUuidSync(change.effect?.origin) as Item.Implementation | ActiveEffect.Implementation | undefined;
      if (origin instanceof Item) macroString = `ItemMacro.${origin.uuid}`;
      else if (origin instanceof ActiveEffect) macroString = `ItemMacro.${origin.origin}`;
    }
    foundry.utils.setProperty(actor, change.key, macroString);
    return true;
    /*
     TODO revisit this if going to allow item macro in flags evaluation
     else if (change.key.startsWith(`flags.${MODULE_ID}.`) && typeof change.value === "string" && (change.value.trim().includes("ItemMacro") || change.value.trim().includes(MQItemMacroLabel))) {
       if (originUuid?.includes("Item.")) {
         const macroString = `ItemMacro.${originUuid}`;
         foundry.utils.setProperty(actor, change.key, macroString)
       } else foundry.utils.setProperty(actor, change.key, change.value);
     } */
  } else if (deferredEvaluation.some(k => change.key.startsWith(k))) {
    if (typeof change.value !== "string") foundry.utils.setProperty(actor, change.key, change.value);
    else if (["true", "1"].includes(change.value.trim())) foundry.utils.setProperty(actor, change.key, true);
    else if (["false", "0"].includes(change.value.trim())) foundry.utils.setProperty(actor, change.key, false);
    else foundry.utils.setProperty(actor, change.key, change.value);
  } else if (change.key.match(/system.traits.*custom/)) {
    // do the trait application here - think about how to update both trait and bypass
  } else if (typeof change.value === "string" && change.key.startsWith("flags.midi-qol")) {
    let val: any;
    try {
      switch (midiFlagTypes[change.key]) {
        case "string":
          val = change.value; break;
        case "number":
          val = Number.isNumeric(change.value) ? JSON.parse(change.value) : 0; break;
        default: // boolean by default
          val = evalCondition(change.value, actor.getRollData(), { async: false })
      }
      if (debugEnabled > 0) warn("midiCustomEffect | setting ", change.key, " to ", val, " from ", change.value, " on ", actor.name);
      foundry.utils.setProperty(actor, change.key, val);
      foundry.utils.setProperty(actor, change.key.replace(`flags.${MODULE_ID}`, `flags.${MODULE_ID}.evaluated`), { value: val, effects: [change.effect?.name] });
    } catch (err) {
      const message = `midi-qol | midiCustomEffect | custom flag eval error ${change.key} ${change.value}`;
      TroubleShooter.recordError(err, message);
      console.warn(message, err);
    }
  }
  return true;
}

// Currently unused
// export function checkImmunity(candidate, data, options, user) {
//   // Not using this in preference to marking effect unavailable
//   const parent: Actor | undefined = candidate.parent;
//   if (!parent || !(parent instanceof CONFIG.Actor.documentClass)) return true;

//   // @ts-expect-error no dnd5e-types
//   const ci = parent.system.traits?.ci?.value;
//   const statusId = (data.name ?? (data.label ?? "no effect")).toLocaleLowerCase(); // TODO 11 check this
//   const returnvalue = !(ci.length && ci.some(c => c === statusId));
//   return returnvalue;
// }

export function untargetDeadTokens() {
  if (autoRemoveTargets !== "none") {
    game.user?.targets.forEach((t) => {
      //@ts-expect-error no dnd5e-types
      if (t.actor?.system.attributes.hp.value <= 0) {
        t.setTarget(false, { releaseOthers: false });
      }
    });
  }
}

function replaceAtFields<T>(value: T, context: Record<string, string>, options: { blankValue: string | number, maxIterations: number } = { blankValue: "", maxIterations: 4 }) {
  if (typeof value !== "string") return value;
  let count = 0;
  if (!value.includes("@")) return value;
  let re = /@[\w\._\-]+/g
  let result = foundry.utils.duplicate(value) as string;
  result = result.replace("@item.level", "@itemLevel") // fix for outdated item.level
  result = result.replace(`@flags.${MODULE_ID}`, "@flags.midiqol"); // allow expressions to ignore the "-" in midi-qol
  // Remove @data references allow a little bit of recursive lookup
  do {
    count += 1;
    for (let match of result.match(re) || []) {
      result = result.replace(match.replace("@data.", "@"), (foundry.utils.getProperty(context, match.slice(1)) as string) ?? options.blankValue)
    }
  } while (count < options.maxIterations && result.includes("@"));
  return result;
}

export async function doOverTimeEffect(actor: Actor.Implementation, effect: ActiveEffect.Implementation, startTurn: boolean = true, options: any = { saveToUse: undefined, rollFlags: undefined, isActionSave: false }) {
  if (game.user?.isGM)
    return gmOverTimeEffect(actor, effect, startTurn, options);
  else
    return unTimedExecuteAsGM("gmOverTimeEffect", { actorUuid: actor.uuid, effectUuid: effect.uuid, startTurn, options })
}
export async function doActivityOverTimeEffect(actor: Actor.Implementation, effect: ActiveEffect.Implementation, startTurn: boolean = true, options: any = { saveToUse: undefined, rollFlags: undefined, isActionSave: false }) {
  if (effect.disabled || effect.isSuppressed) return;
  const auraFlags = effect.flags?.ActiveAuras ?? {};
  if (auraFlags.isAura && auraFlags.ignoreSelf) return;
  const ROLL_MODES = CONST.DICE_ROLL_MODES;
  const owner = playerForActor(actor);
  const changes = effect.changes.filter(change => change.key.startsWith(`flags.${MODULE_ID}.ActivityOverTime`));
  let requiresUserExecution = false;
  for (let change of changes) {
    const activity = await getOvertimeActivity(actor, effect, change, startTurn);
    if (!activity) continue;
    if (([ROLL_MODES.PRIVATE, ROLL_MODES.SELF] as string[]).includes(activity.midiProperties?.rollMode ?? "")) {
      requiresUserExecution = owner !== undefined;
      break;
    }
  }
  if (!requiresUserExecution || !owner || owner === game.user || !owner.active)
    return localActivityOverTimeEffect(actor, effect, startTurn, options);
  else {
    return socketlibSocket.executeAsUser("localActivityOverTimeEffect", owner.id, { actorUuid: actor.uuid, effectUuid: effect.uuid, startTurn, options })
  }
}

async function getOvertimeActivity(actor: Actor.Implementation, effect: ActiveEffect.Implementation, change: ActiveEffect.ChangeData, startTurn: boolean) {
  const changeValue = String(change.value ?? "");
  let activity /* MidiActivityMixin */ = await fromUuid(changeValue) as Activity | null;
  if (!activity && effect.transfer) {
    //@ts-expect-error no dnd5e-types
    activity = effect.parent?.system.activities?.find(a => a.identifier === changeValue);
  }
  if (!activity && effect.origin) {
    const originItem = getItemFromEffectOrigin(effect.origin);
    if (originItem) {
      // @ts-expect-error no dnd5e-types
      activity = originItem.system.activities.find(a => a.identifier === changeValue);
    }
  }
  if (!activity) {
    console.error(`getOvertimeActivity | activity not found for changeValue: "${changeValue}"`);
    return undefined;
  }
  const turnChoice = activity.overTimeProperties?.turnChoice ?? "start";
  console.error(`getOvertimeActivity | found activity: ${activity.name}, turnChoice: ${turnChoice}, startTurn: ${startTurn}`);
  // Check start/end turn
  if (turnChoice === "start" && !startTurn) return undefined;
  if (turnChoice === "end" && startTurn) return undefined;
  return activity;

}
export async function localActivityOverTimeEffect(actor: Actor.Implementation, effect: ActiveEffect.Implementation, startTurn: boolean = true, options: any = { saveToUse: undefined, rollFlags: undefined, rollMode: undefined }) {
  // Get the activity
  let changes = effect.changes.filter(change => change.key.startsWith(`flags.${MODULE_ID}.ActivityOverTime`));
  changes = changes.sort((c1, c2) => (c1.priority ?? 10) - (c2.priority ?? 10));
  const castLevel = effect.flags?.[MODULE_ID]?.castData?.castLevel ?? 0;
  const spellLevel = effect.flags?.[MODULE_ID]?.castData?.baseLevel ?? 0;
  for (let change of changes) {
    const activity = await getOvertimeActivity(actor, effect, change, startTurn);
    if (!activity) {
      console.warn(`midi-qol | localActivityOverTime | for actor ${actor} activity ${change.value} not found or not overTime`);
      continue;
    }
    // Determine which actor should roll the overtime activity
    const rollAsChoice = activity.overTimeProperties?.rollAs ?? "target";
    let rollActor = actor; // default: target actor (the actor bearing the effect)
    if (rollAsChoice === "source") {
      const originItem = getItemFromEffectOrigin(effect.origin ?? "");
      if (originItem?.actor) rollActor = originItem.actor;
    }

    // Create an item owned by the rolling actor which has all of the details
    const itemData: any = activity.item.toObject();
    if (castLevel > spellLevel) foundry.utils.setProperty(itemData, "flags.dnd5e.scaling", castLevel - spellLevel);
    foundry.utils.setProperty(itemData, "system.properties", itemData.system.properties.filter(p => p !== "concentration"));
    foundry.utils.setProperty(itemData, "flags.midi-qol.syntheticItem", true);
    const newItem = new CONFIG.Item.documentClass(itemData, { parent: rollActor });
    newItem.prepareData();
    // @ts-expect-error no dnd5e-types
    newItem.prepareFinalAttributes(); // since the actor prepareData is not being called need to call this by hand
    //@ts-expect-error no dnd5e-types
    let overTimeActivity = newItem.system.activities.find(a => a.id === activity.id) as Activity;

    // Check remove Condition
    if ((overTimeActivity.overTimeProperties?.preRemoveConditionText ?? "") !== "" && overTimeActivity.overTimeProperties!.removeConditionBeforeActivity) {
      const conditionData = createConditionData({ actor, workflow: undefined, target: actor, effect });
      if (await evalCondition(activity.overTimeProperties?.preRemoveConditionText ?? "false", conditionData, { async: true })) {
        await effect.delete();
        return;
      }
    }
    if ((overTimeActivity?.useCondition ?? "") !== "") {
      const conditionData = createConditionData({ actor, workflow: undefined, target: actor, effect });
      if (!await evalCondition(activity.useCondition ?? "true", conditionData, { async: true, errorReturn: true })) {
        return; // use condition failed but don't want to thrown an notification warning
      }
    }
    let targetsToUse: Set<Token> | undefined = undefined;
    const checkGMstatus = rollAsChoice === "source" && rollActor !== actor && !rollActor.isOwner;
    // Overtime effects always target the actor bearing the effect
    const token = tokenForActor(actor);
    if (token) targetsToUse = new Set([token]);

    const overTimeWorkflow: Workflow = await completeActivityUse(overTimeActivity,
      { midiOptions: { targetsToUse, checkGMstatus, workflowOptions: { noProvokeReaction: true, autoConsumeResource: "both" } } },
      { configure: overTimeActivity.consumption?.spellSlot === true },
      { create: true }) as Workflow;

    // Check save condition
    if (activity.overTimeProperties?.saveRemoves && overTimeWorkflow?.saves.has(getOrCreateTokenForActor(actor)!)) {
      await effect.delete();
      return;
    }
    // Check remove condition
    if ((activity.overTimeProperties?.postRemoveConditionText ?? "") !== "" && !activity.overTimeProperties!.removeConditionBeforeActivity) {
      const conditionData = createConditionData({ actor, workflow: overTimeWorkflow, target: actor, effect });
      if (await evalCondition(activity.overTimeProperties!.postRemoveConditionText ?? "false", conditionData, { async: true })) {
        await effect.delete();
        return;
      }
    }
  }
}

/** Structured representation of count action (saveCount/failCount) */
export interface CountAction {
  count: number;
  mode: "remove" | "permanent";
  consecutive: boolean;  // If true, counter resets on opposite result
  effectSpec?: string;  // If specified, this effect/status is added to the actor when count is reached
}

/** Result of resolving an ItemMacro specification */
export interface ResolvedItemMacro {
  item: Item.Implementation;
  macroData: Macro.CreateData;
}

/** Result of resolving an ActivityMacro specification */
export interface ResolvedActivityMacro {
  item: Item.Implementation;
  activity: Activity;
  macro: Macro.Implementation;
}

/**
 * Resolve an ItemMacro specification to an item and its macro data.
 * Supports: "ItemMacro", "ItemMacro.itemName", "ItemMacro.itemUuid"
 *
 * @param macroSpec - The macro specification string (e.g., "ItemMacro.Fireball")
 * @param context - Context for resolution
 * @param context.actor - Actor to search for items by name
 * @param context.originItem - Default item to use when spec is just "ItemMacro"
 * @returns The resolved item and macro data, or undefined if not found
 */
export async function resolveItemMacro(
  macroSpec: string,
  context: { actor?: Actor.Implementation; originItem?: Item.Implementation }
): Promise<ResolvedItemMacro | undefined> {
  const { actor, originItem } = context;
  let item: Item.Implementation | undefined;

  if (macroSpec === "ItemMacro" || macroSpec === MQItemMacroLabel) {
    // Use origin item
    item = originItem;
  } else {
    // ItemMacro.itemNameOrUuid
    const itemSpec = macroSpec.replace(/^(ItemMacro|midi-qol\.ItemMacroText)\./, "").trim();

    // Try as UUID first
    const resolved = await fromUuid(itemSpec);
    if (resolved instanceof Item) {
      item = resolved;
    } else if (resolved instanceof ActiveEffect && resolved.parent instanceof Item) {
      item = resolved.parent;
    } else if ((resolved as any)?.item) {
      // Activity UUID - get parent item
      item = (resolved as any).item;
    }

    // Fall back to finding by name on actor
    if (!item && actor) {
      item = actor.items.find(i => i.name === itemSpec && !!(i.flags?.dae?.macro ?? i.flags?.itemacro?.macro));
    }
  }

  if (!item) return undefined;

  const macroData = item.flags?.dae?.macro ?? item.flags?.itemacro?.macro;
  if (!macroData) return undefined;

  return { item, macroData };
}

/**
 * Resolve an ActivityMacro specification to an activity and its macro.
 * Supports: "ActivityMacro", "ActivityMacro.uuid", "ActivityMacro.identifier", "ActivityMacro.name", "ActivityMacro-id"
 *
 * @param macroSpec - The macro specification string (e.g., "ActivityMacro.cast")
 * @param context - Context for resolution
 * @param context.originItem - Item to search for activities
 * @param context.originActivity - Default activity to use when spec is just "ActivityMacro"
 * @returns The resolved item, activity and macro, or undefined if not found
 */
export async function resolveActivityMacro(
  macroSpec: string,
  context: { originItem?: Item.Implementation; originActivity?: Activity }
): Promise<ResolvedActivityMacro | undefined> {
  const { originItem, originActivity } = context;
  let item: Item.Implementation | undefined = originItem;
  let activity: Activity | undefined;

  if (macroSpec === "ActivityMacro" || macroSpec === MQActivityMacroLabel) {
    // Use origin activity
    activity = originActivity;
    item = originItem;
  } else if (macroSpec.startsWith("ActivityMacro-")) {
    // ActivityMacro-id format (from the app)
    const activityId = macroSpec.split("-").slice(1).join("-");
    if (originActivity?.id === activityId) {
      activity = originActivity;
    } else if (originItem) {
      // @ts-expect-error no dnd5e-types
      activity = originItem.system.activities?.find((a: Activity) => a.id === activityId);
    }
    item = originItem;
  } else {
    // ActivityMacro.uuid or ActivityMacro.identifier or ActivityMacro.name
    const activitySpec = macroSpec.replace(/^(ActivityMacro|midi-qol\.ActivityMacroText)\./, "").trim();

    // Try as UUID first
    const resolved: any = await fromUuid(activitySpec);
    if (resolved instanceof Item) {
      item = resolved;
      // @ts-expect-error no dnd5e-types
      activity = item.system.activities?.contents[0];
    } else if (resolved?.item) {
      // It's an activity
      activity = resolved;
      item = resolved.item;
    }

    // Fall back to finding by identifier/id/name on origin item
    if (!activity && originItem) {
      // @ts-expect-error no dnd5e-types
      activity = originItem.system.activities?.find(a =>
        a.identifier === activitySpec || a.id === activitySpec || a.name === activitySpec
      );
      item = originItem;
    }
  }

  if (!activity || !item) return undefined;

  const macro = activity.macro;
  if (!macro?.command) return undefined;

  return { item, activity, macro };
}

/**
 * Resolves DAE itemData stored in effect flags.
 * DAE stores item data in effect flags when transferring effects, allowing
 * ItemMacro resolution even when the original item is not on the actor.
 *
 * @param actor - The actor to search for effects with itemData
 * @param uuid - The UUID to extract the item ID from
 * @returns The stored item data, or undefined if not found
 */
export function resolveDAEItemData(
  actor: Actor.Implementation,
  uuid: string
): Item.InitializedData | undefined {
  let itemId: string;
  if (uuid.includes("Activity.") || uuid.includes("ActiveEffect.")) {
    itemId = uuid.split(".").slice(-3)[0];
  } else {
    itemId = uuid.split(".").slice(-1)[0];
  }
  return actor.effects.find(e => e.flags?.dae?.itemData?._id === itemId)?.flags?.dae?.itemData as Item.InitializedData | undefined;
}

export interface OvertimeDetails {
  turn: "start" | "end";
  label: string;
  // Roll configuration
  rollType: "save" | "check" | "skill" | "damage";
  rollTypeString: string;  // Raw rollType string for multi-type matching
  saveAbility: string[];
  saveAbilityString: string;  // Raw ability string for message flavor
  saveDC: number;
  saveMagic: boolean;
  // Damage configuration
  damageRoll?: string;
  damageType: string;
  damageBeforeSave: boolean;
  saveDamage: "nodamage" | "halfdamage" | "fulldamage";
  // Count thresholds
  saveCount?: CountAction;
  failCount?: CountAction;
  // Action save
  actionSave?: "dialog" | "roll";
  // Conditions
  applyCondition?: string;
  removeCondition?: string;
  // Other options
  allowIncapacitated: boolean;
  killAnim: boolean;
  macro?: string;
  itemName?: string;
  chatFlavor: string;
  rollMode?: string;
  fastForwardDamage: boolean;
  fastForwardAttack: boolean;
  autoRollAttack: boolean;
  autoRollDamage: boolean;
}

/** Parse a boolean from overtime spec string */
export function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1";
}

/**
 * Parse "N" or "N[-+]options" syntax into structured CountAction
 * @param value - The raw string value (e.g., "2", "2-", "2+", "2-petrified", "2+prone")
 * @param defaultMode - Default mode if no action specified ("remove" for saves, "permanent" for fails)
 */
export function parseCountAction(value: string, defaultMode: "remove" | "permanent"): CountAction {
  // Format: n[c][-+]effectSpec where - or + is required, c = consecutive
  // - means remove, + means permanent
  // c means counter resets on opposite result
  // effectSpec (if present) is always added to the actor when count is reached
  // Examples: 2-, 2+, 2c-, 3c+prone, 2-petrified

  // Strip consecutive flag if present (letter 'c' immediately after digits)
  let consecutive = false;
  let working = value;
  const digitEnd = working.search(/\D/);
  if (digitEnd > 0 && working[digitEnd] === "c") {
    consecutive = true;
    working = working.substring(0, digitEnd) + working.substring(digitEnd + 1);
  }

  const minusIndex = working.indexOf("-");
  const plusIndex = working.indexOf("+");

  // Determine which action indicator comes first (after digits)
  let actionIndex = -1;
  let mode: "remove" | "permanent" = defaultMode;
  if (minusIndex > 0 && (plusIndex === -1 || minusIndex < plusIndex)) {
    actionIndex = minusIndex;
    mode = "remove";
  } else if (plusIndex > 0) {
    actionIndex = plusIndex;
    mode = "permanent";
  }

  // If no action indicator found, use default mode
  if (actionIndex === -1) {
    return { count: Number(working), mode: defaultMode, consecutive };
  }

  const count = Number(working.substring(0, actionIndex));
  const effectSpec = working.substring(actionIndex + 1) || undefined; // Everything after - or +

  return { count, mode, effectSpec, consecutive };
}

/**
 * Convert a CountAction back to its action string representation for storage
 * Format: [-+]effectSpec (e.g., "-", "+", "-petrified", "+prone")
 */
export function countActionToString(action: CountAction): string {
  const base = (action.consecutive ? "c" : "") + (action.mode === "remove" ? "-" : "+");
  return action.effectSpec ? `${base}${action.effectSpec}` : base;
}

/** Parameters for actionSave handler functions */
interface ActionSaveContext {
  actor: Actor.Implementation;
  effect: ActiveEffect.Implementation;
  details: OvertimeDetails;
  owner: User.Implementation | null | undefined;
  messageFlavor: Record<string, string>;
}

/**
 * Handle actionSave="dialog" - prompts player with dialog to roll save
 * @returns true if effect should be processed further, false to skip
 */
async function handleActionSaveDialog(ctx: ActionSaveContext): Promise<boolean> {
  const { actor, effect, details, owner } = ctx;
  const { saveDC, saveAbility, saveMagic, rollMode, rollTypeString } = details;

  if (!owner?.active) {
    error(`No active owner to request overtime save for ${actor.name} ${effect.name}`);
    return false;
  }

  // Build SaveDetails with ALL abilities — doRollAbility/setupChoiceDialog handles the choice UI
  const saveDetails: SaveDetails = {
    actorUuid: actor.uuid,
    advantage: undefined,
    disadvantage: undefined,
    modifierTracker: undefined,
    isFriendly: false,
    isMagicSave: saveMagic,
    isConcentrationCheck: false,
    rollDC: saveDC,
    saveItemUuid: "",
    workflowId: "",
    itemCardUuid: "",
    workflowOptions: {},
    rollType: rollTypeString,
    rollAbilities: rollTypeString !== "skill" ? saveAbility : [],
    rollSkills: rollTypeString === "skill" ? saveAbility : [],
    rollTools: [],
    itemId: "",
  };

  // Prompt player for confirmation, then roll via rollAbility on their client
  let saveResult: any = await socketlibSocket.executeAsUser("rollActionSave", owner?.id, {
    actorUuid: actor.uuid,
    effectName: effect.name,
    saveDetails,
    displayOptions: {
      fastForward: false,
      chatMessage: true,
      showTargetDC: true,
      rollMode,
    }
  });

  // Reconstruct Roll from socketlib serialization — same pattern as normalizeRollResults in checkSaves
  //@ts-expect-error no dnd5e types
  const D20Roll = CONFIG.Dice.D20Roll;
  let roll: Roll | undefined;
  if (saveResult instanceof Array) {
    roll = saveResult[0] instanceof Roll ? saveResult[0] : D20Roll.fromJSON(JSON.stringify(saveResult[0]));
  } else if (saveResult && !(saveResult instanceof Roll)) {
    roll = D20Roll.fromJSON(JSON.stringify(saveResult));
  } else {
    roll = saveResult;
  }
  const success = roll?.total !== undefined && roll.total >= saveDC;
  foundry.utils.setProperty(effect, `flags.${MODULE_ID}.actionSaveSuccess`, success === true);
  return true;
}

/**
 * Handle actionSave="roll" response - process player's save roll
 * @returns effect.id if processing should stop, null to continue to next effect
 */
async function handleActionSaveRollResponse(
  ctx: ActionSaveContext,
  options: { saveToUse?: any; rollFlags?: any },
  rollType: string[]
): Promise<string | null | undefined> {
  const { actor, effect, details } = ctx;
  const { saveAbility, saveDC } = details;

  if (!options.rollFlags) return effect.id;
  if (options.rollFlags.type === "ability") options.rollFlags.type = "check";
  if (!rollType.includes(options.rollFlags.type) || !saveAbility.includes(options.rollFlags.ability ?? options.rollFlags.skillId)) {
    return null; // continue to next effect
  }

  const success = options.saveToUse?.options?.success || options.saveToUse?.total >= saveDC || (checkRule("criticalSaves") && options.saveToUse.isCritical);
  if (success !== undefined) {
    const chatCardUuids = effect.getFlag(MODULE_ID, "overtimeChatCardUuids");
    for (let chatcardUuid of chatCardUuids ?? []) {
      const chatCard = fromUuidSync(chatcardUuid) as ChatMessage.Implementation | undefined;
      await chatCard?.delete();
    }
  }

  if (success) {
    await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:actionSave" });
    return effect.id;
  } else {
    await effect.setFlag(MODULE_ID, "actionSaveSuccess", success === true);
  }
  return effect.id;
}

/**
 * Handle actionSave="roll" request - create roll request chat cards
 * @returns effect.id if processing should stop, undefined to continue
 */
async function handleActionSaveRollRequest(ctx: ActionSaveContext, changeTurnEnd: boolean): Promise<string | null | undefined> {
  const { actor, effect, details, owner, messageFlavor } = ctx;
  const { saveAbility, saveDC, rollMode, label, rollTypeString } = details;

  const MessageClass = getDocumentClass("ChatMessage");
  let dataset;
  const chatCardUuids: string[] = [];

  for (let ability of saveAbility) {
    dataset = {
      type: rollTypeString,
      dc: saveDC,
      item: effect.name,
      action: "rollRequest",
      midiOvertimeActorUuid: actor.uuid,
      midiRollMode: rollMode
    };
    if (["check", "save"].includes(rollTypeString)) dataset.ability = ability;
    else if (rollTypeString === "skill") dataset.skill = ability;

    let whisper = ChatMessage.getWhisperRecipients(owner?.name ?? "");
    if (owner?.isGM) {
      whisper = ChatMessage.getWhisperRecipients("GM");
    }

    const buttonDataset = { ...dataset, action: "rollRequest", visibility: "all" };
    const chatData = {
      user: game.user?.id,
      whisper: whisper.map(u => u.id ?? ""),
      rollMode: rollMode ?? "public",
      content: await foundry.applications.handlebars.renderTemplate("systems/dnd5e/templates/chat/roll-request-card.hbs", {
        buttons: [{
          // @ts-expect-error no dnd5e-types
          buttonLabel: game.system.enrichers.createRollLabel({ ...dataset, format: "long", icon: true, hideDC: !owner?.isGM && !shouldDisplaySaveDC() }),
          // @ts-expect-error no dnd5e-types
          hiddenLabel: game.system.enrichers.createRollLabel({ ...dataset, format: "long", icon: true, hideDC: true }),
          dataset: buttonDataset
        }]
      }),
      flavor: `Action: ${label ?? effect.name} ${i18n(messageFlavor[details.rollType])}`,
      speaker: MessageClass.getSpeaker({ actor })
    };

    const chatCard = await ChatMessage.create(chatData);
    if (chatCard) {
      chatCardUuids.push(chatCard.uuid);
      await chatCard?.setFlag(MODULE_ID, "actorUuid", actor.uuid);
    }
  }

  foundry.utils.setProperty(effect, `flags.${MODULE_ID}.actionSaveSuccess`, undefined);
  await effect.setFlag(MODULE_ID, "overtimeChatCardUuids", chatCardUuids);
  await effect.setFlag(MODULE_ID, "actionSaveSuccess", undefined);

  if (changeTurnEnd) return effect.id;
  return undefined;
}

/** Parameters for building overtime item data */
interface OvertimeItemBuildContext {
  actor: Actor.Implementation;
  effect: ActiveEffect.Implementation;
  details: OvertimeDetails;
  label: string;
  isPermanent: boolean;
}

/**
 * Build item and activity data for overtime effect execution
 * @returns Object containing itemData and activityData ready for item creation
 */
async function buildOvertimeItemData(ctx: OvertimeItemBuildContext): Promise<{ itemData: any; activityData: any }> {
  const { actor, effect, details, label, isPermanent } = ctx;
  const { damageRoll, damageType, damageBeforeSave, saveMagic, itemName, chatFlavor, saveDamage } = details;

  // Initialize item data, optionally from existing item
  let itemData: any = {};
  itemData.img = "icons/svg/aura.svg";
  if (typeof itemName === "string") {
    let theItem = await fromUuid(itemName) as Item.Implementation | undefined;
    if (!theItem && itemName.startsWith("Actor.")) {
      const localName = itemName.replace("Actor.", "");
      theItem = actor.items.getName(localName);
    }
    if (!theItem) {
      theItem = game.items?.getName(itemName);
    }
    if (theItem) itemData = theItem.toObject();
  }

  // Build activity data
  let activityData: any = {
    name: label,
    id: "overtime",
    type: "damage"
  };
  if (damageRoll) {
    activityData.damage = {
      parts: [{
        custom: {
          enabled: true,
          formula: damageRoll,
        },
        types: [damageType]
      }]
    };
  }

  // Set properties on both
  activityData.img = effect.img;
  itemData.img = effect.img;
  foundry.utils.setProperty(itemData, "target.affects.type", "self");
  itemData.type = "feat";
  foundry.utils.setProperty(itemData, "system.type.value", "feat");
  foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.noProvokeReaction`, true);
  if (saveMagic) {
    itemData.type = "spell";
    foundry.utils.setProperty(itemData, "system.preparation", { mode: "atwill" });
  }

  // Add save/check/skill activity data if not permanent
  if (!isPermanent) {
    const rollActivityData = buildRollActivityData(details);
    Object.assign(activityData, rollActivityData);
  }

  // Configure damage save behavior
  if (activityData.damage) {
    if (damageBeforeSave || saveDamage === "fulldamage") {
      activityData.damage.onSave = "full";
    } else if (saveDamage === "halfdamage") {
      activityData.damage.onSave = "half";
    } else {
      activityData.damage.onSave = "none";
    }
  }

  // Set final properties
  itemData.name = label;
  activityData.description = { chat: chatFlavor };
  foundry.utils.setProperty(itemData, "system.description.chat", effect.description ?? "");
  itemData._id = foundry.utils.randomID();

  return { itemData, activityData };
}

/**
 * Parse raw overtime spec string into typed OvertimeDetails
 */
export function parseOvertimeDetails(specString: string, rollData: Record<string, any>, effectName: string): OvertimeDetails | null {
  let spec = replaceAtFields(specString, rollData, { blankValue: 0, maxIterations: 3 });
  spec = spec.replace(/\s*=\s*/g, "=").replace(/\s*,\s*/g, ",").replace("\n", "");

  let parts: string[];
  if (spec.includes("#")) parts = spec.split("#");
  else parts = spec.split(",");

  const raw: Record<string, any> = {};
  for (let part of parts) {
    const p = part.split("=");
    raw[p[0]] = p.slice(1).join("=");
  }

  // Parse turn
  const turn = (raw.turn === "end" ? "end" : "start") as "start" | "end";

  // Parse save ability
  const saveAbilityString = raw.saveAbility ?? "";
  const saveAbility = (saveAbilityString.includes("|") ? saveAbilityString.split("|") : [saveAbilityString])
    .map((s: string) => s.trim().toLowerCase());

  // Parse roll type
  const rollTypeString = raw.rollType ?? (saveAbility[0] ? "save" : "damage");
  const rollType = (rollTypeString.includes("|") ? rollTypeString.split("|") : [rollTypeString])
    .map((s: string) => s.trim().toLowerCase())[0] as "save" | "check" | "skill" | "damage";

  // Parse saveDC
  let saveDC = -1;
  if (raw.saveDC) {
    try {
      const dcValue = replaceAtFields(raw.saveDC, rollData, { blankValue: 0, maxIterations: 3 });
      saveDC = dcValue ? Roll.safeEval(dcValue) : -1;
    } catch (err) {
      TroubleShooter.recordError(err, `overTime effect | error evaluating saveDC ${raw.saveDC}`);
    }
  }

  // Parse actionSave with validation
  let actionSave: "dialog" | "roll" | undefined = undefined;
  if (raw.actionSave) {
    if (["dialog", "roll"].includes(raw.actionSave)) {
      actionSave = raw.actionSave as "dialog" | "roll";
    } else {
      console.warn(`midi-qol | parseOvertimeDetails | invalid actionSave: ${raw.actionSave}`);
      if (!["0", "false"].includes(raw.actionSave)) {
        actionSave = "roll";
      }
    }
  }

  // Parse count actions
  let saveCount: CountAction | undefined;
  let failCount: CountAction | undefined;

  // Handle saveCount parameter (e.g., saveCount=1, saveCount=2:petrified)
  if (raw.saveCount !== undefined) {
    saveCount = parseCountAction(raw.saveCount, "remove");
  }
  // Handle saveRemove parameter (deprecated — use saveCount instead)
  else if (raw.saveRemove !== undefined) {
    foundry.utils.logCompatibilityWarning(`midi-qol | parseOvertimeDetails | saveRemove is deprecated, use saveCount instead (saveRemove=${raw.saveRemove})`,
      { since: "midi-qol 13.0.43", until: "midi-qol 13.1.0" });
    if (raw.saveRemove === "true" || raw.saveRemove === "1") {
      saveCount = { count: 1, mode: "remove", consecutive: false };
    } else if (raw.saveRemove === "false" || raw.saveRemove === "0") {
      // saveRemove=false means don't remove on save - use "permanent" mode with count 0
      saveCount = { count: 0, mode: "permanent", consecutive: false };
    } else {
      // Otherwise parse as count action (e.g., "2", "3:-", etc.)
      saveCount = parseCountAction(raw.saveRemove, "remove");
    }
  }
  // Handle failCount parameter
  if (raw.failCount !== undefined) {
    failCount = parseCountAction(raw.failCount, "permanent");
  }
  // Handle failRemove parameter (deprecated — use failCount instead)
  else if (raw.failRemove !== undefined) {
    foundry.utils.logCompatibilityWarning(`midi-qol | parseOvertimeDetails | failRemove is deprecated, use failCount instead (failRemove=${raw.failRemove})`,
      { since: "midi-qol 13.0.43", until: "midi-qol 13.1.0" });
    failCount = parseCountAction(raw.failRemove, "permanent");
  }

  // Default: if neither saveCount nor failCount is specified and there's a valid saveDC,
  // remove the effect on a single successful save.
  if (saveCount === undefined && failCount === undefined && saveDC > -1) {
    saveCount = { count: 1, mode: "remove", consecutive: false };
  }

  return {
    turn,
    label: (raw.name ?? raw.label ?? effectName).replace(/"/g, ""),
    rollType,
    rollTypeString,
    saveAbility,
    saveAbilityString,
    saveDC,
    saveMagic: parseBool(raw.saveMagic, false),
    damageRoll: raw.damageRoll,
    damageType: raw.damageType ?? "",
    damageBeforeSave: parseBool(raw.damageBeforeSave, false),
    saveDamage: (raw.saveDamage ?? "nodamage") as "nodamage" | "halfdamage" | "fulldamage",
    saveCount,
    failCount,
    actionSave,
    applyCondition: raw.applyCondition ?? raw.condition,
    removeCondition: raw.removeCondition,
    allowIncapacitated: parseBool(raw.allowIncapacitated, false),
    killAnim: parseBool(raw.killAnim, false),
    macro: raw.macro,
    itemName: raw.itemName,
    chatFlavor: raw.chatFlavor ?? "",
    rollMode: raw.rollMode,
    fastForwardDamage: parseBool(raw.fastForwardDamage, true),
    fastForwardAttack: parseBool(raw.fastForwardAttack, true),
    autoRollAttack: parseBool(raw.autoRollAttack, true),
    autoRollDamage: parseBool(raw.autoRollDamage, true),
  };
}

/**
 * Serialize overtime form data back to a comma-separated OverTime spec string.
 * Only emits fields that differ from defaults, keeping the string concise.
 */
export function serializeOvertimeDetails(data: Record<string, any>): string {
  const parts: string[] = [];

  if (data.turn && data.turn !== "start") parts.push(`turn=${data.turn}`);
  else parts.push(`turn=start`);

  if (data.label) parts.push(`label=${data.label}`);

  // Roll configuration
  if (data.rollType && data.rollType !== "save") parts.push(`rollType=${data.rollType}`);
  if (data.saveAbility) parts.push(`saveAbility=${data.saveAbility}`);
  if (data.saveDC !== undefined && data.saveDC !== "" && data.saveDC !== "-1") parts.push(`saveDC=${data.saveDC}`);
  if (data.saveMagic) parts.push(`saveMagic=true`);

  // Damage
  if (data.damageRoll) parts.push(`damageRoll=${data.damageRoll}`);
  if (data.damageType) parts.push(`damageType=${data.damageType}`);
  if (data.damageBeforeSave) parts.push(`damageBeforeSave=true`);
  if (data.saveDamage && data.saveDamage !== "nodamage") parts.push(`saveDamage=${data.saveDamage}`);

  // Count thresholds
  if (data.saveCountEnabled && data.saveCountNum) {
    const countStr = `${data.saveCountNum}${data.saveCountConsecutive ? "c" : ""}${data.saveCountMode === "remove" ? "-" : "+"}${data.saveCountEffectSpec || ""}`;
    parts.push(`saveCount=${countStr}`);
  }
  if (data.failCountEnabled && data.failCountNum) {
    const countStr = `${data.failCountNum}${data.failCountConsecutive ? "c" : ""}${data.failCountMode === "remove" ? "-" : "+"}${data.failCountEffectSpec || ""}`;
    parts.push(`failCount=${countStr}`);
  }

  // Action save
  if (data.actionSave && data.actionSave !== "none") parts.push(`actionSave=${data.actionSave}`);

  // Conditions
  if (data.applyCondition) parts.push(`applyCondition=${data.applyCondition}`);
  if (data.removeCondition) parts.push(`removeCondition=${data.removeCondition}`);

  // Advanced options — only emit non-defaults
  if (data.macro) parts.push(`macro=${data.macro}`);
  if (data.itemName) parts.push(`itemName=${data.itemName}`);
  if (data.chatFlavor) parts.push(`chatFlavor=${data.chatFlavor}`);
  if (data.rollMode && data.rollMode !== "default") parts.push(`rollMode=${data.rollMode}`);
  if (!data.fastForwardDamage) parts.push(`fastForwardDamage=false`);
  if (!data.fastForwardAttack) parts.push(`fastForwardAttack=false`);
  if (!data.autoRollAttack) parts.push(`autoRollAttack=false`);
  if (!data.autoRollDamage) parts.push(`autoRollDamage=false`);
  if (data.allowIncapacitated) parts.push(`allowIncapacitated=true`);
  if (data.killAnim) parts.push(`killAnim=true`);

  return parts.join(", ");
}

/**
 * Build activity data for save/check/skill rolls
 */
export function buildRollActivityData(details: OvertimeDetails): Record<string, any> {
  const { rollType, saveAbility, saveDC, saveMagic } = details;
  const activityData: Record<string, any> = {};

  if (rollType === "save" && saveAbility[0] && saveDC > -1) {
    activityData.type = "save";
    activityData.save = {
      ability: saveAbility,
      dc: { calculation: "", formula: String(saveDC) }
    };
    // Note: saveMagic is handled separately (affects magic resistance, not DC calculation)
  } else if (rollType === "check" && saveAbility[0] && saveDC > -1) {
    activityData.type = "check";
    activityData.check = {
      ability: saveAbility[0],
      dc: { calculation: "", formula: String(saveDC) }
    };
  } else if (rollType === "skill" && saveAbility[0] && saveDC > -1) {
    activityData.type = "check";
    activityData.check = {
      associated: saveAbility,
      dc: { calculation: "", formula: String(saveDC) }
    };
  }

  return activityData;
}

async function overTimeRemoveConditionMet(removeCondition: string, rollData: any): Promise<boolean> {
  const value = replaceAtFields(removeCondition, rollData, { blankValue: 0, maxIterations: 3 });
  try {
    return !!await evalCondition(value, rollData, { errorReturn: true, async: true });
  } catch (err) {
    const message = `midi-qol | gmOverTimeEffect | error when evaluating overtime remove condition ${value} - assuming true`;
    TroubleShooter.recordError(err, message);
    console.warn(message, err);
    return true;
  }
}

export async function gmOverTimeEffect(actor: Actor.Implementation, effect: ActiveEffect.Implementation, startTurn: boolean = true, options: any = { saveToUse: undefined, rollFlags: undefined, rollMode: undefined }) {
  const endTurn = !startTurn;
  if (effect.disabled || effect.isSuppressed) return;
  const auraFlags = effect.flags?.ActiveAuras ?? {};
  if (auraFlags.isAura && auraFlags.ignoreSelf) return;
  const rollData = createConditionData({ actor, workflow: undefined, target: actor, effect });
  if (!rollData.flags) rollData.flags = actor.flags;
  rollData.flags.midiqol = rollData.flags[MODULE_ID];
  const changes = effect.changes.filter(change => change.key.startsWith(`flags.${MODULE_ID}.OverTime`));
  if (changes.length > 0) for (let change of changes) {
    // flags.midi-qol.OverTime turn=start/end, damageRoll=rollspec, damageType=string, saveDC=number, saveAbility=str/dex/etc, damageBeforeSave=true/[false], label="String"
    const details = parseOvertimeDetails(change.value, rollData, effect.name);
    if (!details) continue;

    // Evaluate applyCondition
    if (details.applyCondition) {
      let value = replaceAtFields(details.applyCondition, rollData, { blankValue: 0, maxIterations: 3 });
      let result;
      try {
        result = await evalCondition(value, rollData, { async: true });
      } catch (err) {
        const message = `midi-qol | gmOverTimeEffect | error when evaluating overtime apply condition ${value} - assuming true`;
        TroubleShooter.recordError(err, message);
        console.warn(message, err);
        result = true;
      }
      if (!result) continue;
    }

    // Extract commonly used values from details
    const { turn, label, rollTypeString, saveAbility, saveAbilityString, saveDC, rollMode, actionSave } = details;
    const changeTurnStart = turn === "start";
    const changeTurnEnd = turn === "end";

    // Build message flavor for different roll types
    const messageFlavor: Record<string, string> = {
      "save": `${GameSystemConfig.abilities[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.saving-throw")}`,
      "check": `${GameSystemConfig.abilities[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.ability-check")}`,
      "skill": `${GameSystemConfig.skills[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.skill-check")}`
    };
    // For rollType as array matching later
    const rollTypeArray = (rollTypeString.includes("|") ? rollTypeString.split("|") : [rollTypeString]).map(s => s.trim().toLowerCase());

    if (endTurn) {
      const chatCardUuids = effect.getFlag(MODULE_ID, "overtimeChatCardUuids");
      if (chatCardUuids) for (let chatCardUuid of chatCardUuids) {
        const chatCard = fromUuidSync(chatCardUuid) as ChatMessage.Implementation | undefined;
        chatCard?.delete();
      }
    }

    if (options.isActionSave && actionSave === "dialog") {
      // generated by a save roll so we can ignore
      continue;
    }

    // Get actor owner for actionSave handling
    let owner = playerForActor(actor) ?? preferredActiveGM();
    if (!owner?.active) owner = preferredActiveGM();

    // Create context for actionSave handlers
    const actionSaveCtx: ActionSaveContext = { actor, effect, details, owner, messageFlavor };

    // Handle actionSave variants using helper functions
    if (actionSave && startTurn && actionSave === "dialog") {
      const shouldContinue = await handleActionSaveDialog(actionSaveCtx);
      if (!shouldContinue) return effect.id;
    } else if (actionSave && actionSave === "roll" && options.isActionSave && options.saveToUse) {
      const result = await handleActionSaveRollResponse(actionSaveCtx, options, rollTypeArray);
      if (result !== undefined) {
        if (result === null) continue; // continue to next effect
        return result;
      }
    } else if (actionSave === "roll" && startTurn) {
      const result = await handleActionSaveRollRequest(actionSaveCtx, changeTurnEnd);
      if (result !== undefined) return result;
    }

    let actionSaveSuccess = effect.flags?.[MODULE_ID]?.actionSaveSuccess;
    if (actionSaveSuccess === true && changeTurnEnd) {
      await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:actionSave" });
      return effect.id;
    }
    if ((endTurn && changeTurnEnd) || (startTurn && changeTurnStart)) {
      // Extract values from typed details object (already parsed)
      const { damageRoll, damageType, damageBeforeSave, macro: macroToCall, allowIncapacitated, killAnim, saveCount, failCount, fastForwardAttack, fastForwardDamage, autoRollAttack, autoRollDamage } = details;

      if (debugEnabled > 0) warn(`gmOverTimeEffect | Overtime provided data is `, details);
      if (debugEnabled > 0) warn(`gmOverTimeEffect | OverTime label=${label} startTurn=${startTurn} endTurn=${endTurn} damageBeforeSave=${damageBeforeSave} saveDC=${saveDC} saveAbility=${saveAbility} damageRoll=${damageRoll} damageType=${damageType}`);

      // Build item and activity data using helper function
      // isPermanent is true for actionSave items OR if effect was marked permanent by saveCount/failCount
      const effectMarkedPermanent = !!effect.flags?.[MODULE_ID]?.overtime?.permanent;
      const isPermanent = !!actionSave || effectMarkedPermanent;
      // Nothing to roll (an action save is rolled from its own card): no workflow, so no empty card.
      if (isPermanent && !damageRoll && !macroToCall) {
        if (actionSaveSuccess || (details.removeCondition && await overTimeRemoveConditionMet(details.removeCondition, rollData)))
          await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime" });
        return effect.id;
      }
      const { itemData, activityData } = await buildOvertimeItemData({ actor, effect, details, label, isPermanent });

      // roll the damage and save....
      const theTargetToken = getOrCreateTokenForActor(actor)!;
      // Target is passed via targetsToUse in the options below — no need to modify game.user.targets
      // which would clobber the GM's real targets before completeActivityUse can save them.

      // Handle stacking damage rolls
      if (damageRoll && activityData.damage?.parts?.[0]) {
        let damageRollString = damageRoll;
        let stackCount = effect.flags.dae?.stacks ?? 1;
        if (globalThis.EffectCounter && theTargetToken) {
          // This only runs for combatants and
          const counter = globalThis.EffectCounter.findCounter(getTokenDocument(theTargetToken), effect.img ?? effect.icon) //v12 icon -> img
          if (counter) stackCount = counter.getValue();
        }
        for (let i = 1; i < stackCount; i++)
          damageRollString = `${damageRollString} + ${damageRoll}`;
        activityData.damage.parts[0].custom.formula = damageRollString;
      }

      // Set additional item flags
      foundry.utils.setProperty(itemData.flags, "midi-qol.forceCEOff", true);
      if (killAnim) foundry.utils.setProperty(itemData.flags, "autoanimations.killAnim", true)
      if (macroToCall) {
        foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.onUseMacroName`, macroToCall);
        foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.onUseMacroParts`, new OnUseMacros(macroToCall));
      }

      // Try and find the source actor for the overtime effect so that optional bonuses etc can fire.
      let origin: any = fromUuidSync(effect.origin);
      while (origin && !(origin instanceof Actor)) {
        origin = origin?.parent;
      }
      itemData.system.activities = { "overtime": activityData };
      foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.syntheticItem`, true);
      let ownedItem: Item = new CONFIG.Item.documentClass(itemData, { parent: ((origin instanceof Actor) ? origin : actor) });
      ownedItem.prepareData();
      // @ts-expect-error no dnd5e-types
      ownedItem.prepareFinalAttributes();
      // Register effect for save/fail count tracking if either is specified
      // Skip registration if effect is already permanent (no save processing needed)
      if (!actionSave && !isPermanent && (saveCount || failCount) && saveDC > -1) {
        // @ts-expect-error no dnd5e-types
        const activityUuid = ownedItem.system.activities.contents[0].uuid;
        savedOverTimeEffectsToDelete[activityUuid] = {
          uuid: effect.uuid,
          saveCount: saveCount?.count,
          saveCountAction: saveCount ? countActionToString(saveCount) : undefined,
          saveConsecutive: saveCount?.consecutive ?? false,
          failCount: failCount?.count,
          failCountAction: failCount ? countActionToString(failCount) : undefined,
          failConsecutive: failCount?.consecutive ?? false,
        };
      }

      if (details.removeCondition) {
        if (await overTimeRemoveConditionMet(details.removeCondition, rollData)) {
          // @ts-expect-error no dnd5e-types
          const otKey = ownedItem.system.activities.contents[0].uuid;
          overTimeEffectsToDelete[otKey] = { uuid: effect.uuid }
        }
      }
      try {
        const options = {
          createWorkflow: true,
          configureDialog: false,
          saveDC,
          fastForwardAttack,
          fastForwardDamage,
          autoRollAttack,
          autoRollDamage: autoRollDamage ? "onHit" : "none",
          checkGMStatus: true,
          targetsToUse: new Set([theTargetToken]),
          // targetUuids: [theTargetUuid],
          ignoreUserTargets: true,
          workflowOptions: { targetConfirmation: "none", isOverTime: true, allowIncapacitated },
          flags: {
            dnd5e: { "itemData": ownedItem.toObject() },
          }
        };
        foundry.utils.setProperty(options, `flags.${MODULE_ID}.isOverTime`, true);
        await completeItemUse(ownedItem, { midiOptions: options }, { configure: false }, { rollMode: rollMode as keyof CONFIG.Dice.RollModes | undefined, systemCard: false }); // worried about multiple effects in flight so do one at a time
        if (actionSaveSuccess) {
          await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:actionSave" });
        }
        /*
        if (actionSaveSuccess !== undefined && !saveResultDisplayed) {
          let content;
          if (actionSaveSuccess) {
            content = `${effect.name} ${messageFlavor[details.rollType]} ${i18n("midi-qol.save-success")}`;
          } else {
            content = `${effect.name} ${messageFlavor[details.rollType]} ${i18n("midi-qol.save-failure")}`;
          }
          ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
        }
        */
        return effect.id;
      } catch (err) {
        const message = "midi-qol | completeItemUse | error";
        TroubleShooter.recordError(err, message);
        console.warn(message, err);
      } finally {
      }
    }
  }
}

export async function _processActivityOverTime(combat: Combat.Implementation, data: Combat.UpdateData, options: Combat.Database.UpdateOptions, userId: string) {
  if (!preferredActiveGM()?.isSelf) return;
  const combatStart = combat.round === 1 && combat.turn === 0;
  let prev = (combat.previous?.round ?? 0) * 100 + (combat.previous?.turn ?? 0);
  let testTurn = combat.previous?.turn ?? 0;
  let testRound = combat.previous?.round ?? 0;
  const last = (data.round ?? combat.current.round ?? 0) * 100 + (data.turn ?? combat.current.turn ?? 0);

  let toTest = prev;
  let count = 0;
  const maxIterations = combatStart ? 1 : 200;
  while (toTest <= last && count < maxIterations) { // step through each turn from prev to current
    count += 1; // make sure we don't do an infinite loop
    // Check if combat was deleted during processing (can happen with async operations)
    if (!combat.id || !game.combats?.get(combat.id)) return;
    const actor = combat.turns[testTurn]?.actor;
    const endTurn = toTest < last;
    const startTurn = toTest > prev || combatStart;

    if (actor) for (let effect of actor.appliedEffects) {
      if (effect.changes.some(change => change.key.startsWith(`flags.${MODULE_ID}.ActivityOverTime`))) {
        await doActivityOverTimeEffect(actor, effect, startTurn);
      }
    }
    testTurn += 1;
    if (testTurn === combat.turns.length) {
      testTurn = 0;
      testRound += 1;
      toTest = testRound * 100;
    } else toTest += 1;
  }
}
export async function _processOverTime(combat: Combat.Implementation, data: Combat.UpdateData, options: Combat.Database.UpdateOptions, userId: string) {
  if (!preferredActiveGM()?.isSelf) return;
  const combatStart = combat.round === 1 && combat.turn === 0;
  let prev = (combat.previous?.round ?? 0) * 100 + (combat.previous?.turn ?? 0);
  let testTurn = combat.previous?.turn ?? 0;
  let testRound = combat.previous?.round ?? 0;
  const last = (data.round ?? combat.current.round ?? 0) * 100 + (data.turn ?? combat.current.turn ?? 0);

  let toTest = prev;
  let count = 0;
  const maxIterations = combatStart ? 1 : 200;
  while (toTest <= last && count < maxIterations) { // step through each turn from prev to current
    count += 1; // make sure we don't do an infinite loop
    // Check if combat was deleted during processing (can happen with async operations)
    if (!combat.id || !game.combats?.get(combat.id)) return;
    const actor = combat.turns[testTurn]?.actor;
    const endTurn = toTest < last;
    const startTurn = toTest > prev || combatStart;

    // Remove reaction used status from each combatant
    if (actor && toTest !== prev && !installedModules.get("times-up")) {
      // do the whole thing as a GM to avoid multiple calls to the GM to set/remove flags/conditions
      await unTimedExecuteAsGM("removeActionBonusReaction", { actorUuid: actor.uuid });
    }
    if (actor && toTest !== prev) {
      removeActionUsed(actor);
    }

    if (actor) for (let effect of actor.appliedEffects) {
      if (effect.changes.some(change => change.key.startsWith(`flags.${MODULE_ID}.OverTime`))) {
        await doOverTimeEffect(actor, effect, startTurn);
      }
    }
    testTurn += 1;
    if (testTurn === combat.turns.length) {
      testTurn = 0;
      testRound += 1;
      toTest = testRound * 100;
    } else toTest += 1;
  }
}
export async function completeActivityUse(activityRef: Activity | string | undefined,
  usage: ActivityUseConfiguration = {},
  dialog: RollDialogConfig = {},
  message: RollMessageConfig = {}
): Promise<Workflow | undefined> {
  activityRef = foundry.utils.deepClone(activityRef);
  usage.midiOptions ??= {};
  let targetsToUse: Set<Token.Implementation> = new Set();
  if (usage.midiOptions.targetsToUse && !(usage.midiOptions.targetsToUse instanceof Set)) {
    error("completeActivityUse | targetsToUse is not a Set");
  } else if (usage.midiOptions.targetsToUse) {
    targetsToUse = (usage.midiOptions.targetsToUse).map(t => getToken(t)).filter(t => !!t);
  }
  if (usage.midiOptions.targetUuids) {
    for (let targetUuid of usage.midiOptions.targetUuids) {
      const theTarget = getToken(targetUuid);
      if (theTarget) {
        targetsToUse.add(theTarget);
      }
    }
  }
  // Targets to use will be the union of usage.midiOptions.targetsToUse and usage.midiOptions.targetUuids
  const activity = (typeof activityRef === "string") ? fromUuidSync(activityRef) as Activity | undefined : activityRef;
  if (!activity) return;
  let asUser: User.Implementation | undefined | null = (typeof usage.midiOptions.asUser === "string") ? game.users?.get(usage.midiOptions.asUser) : usage.midiOptions.asUser;
  const asUserActive = asUser?.active;
  if (!asUserActive && (usage.midiOptions.checkGMstatus && !game.user?.isGM))
    asUser = preferredActiveGM();
  if (!asUser) asUser = game.user;
  // asUser will be the requested user, a GM user if there is one active or self
  foundry.utils.setProperty(usage, "midiOptions.workflowOptions.forceCompletion", true);
  let localRoll = asUser?.id === game.user?.id;
  if (localRoll) {
    return await new Promise((resolve) => {
      const maxWait = 90; // If the activity usage doesn't complete in 90 seconds then we have a problem
      // Local save of current targets — restored on cleanup
      const localSavedTargetIds = Array.from(game.user?.targets ?? []).map(t => t.id);
      if (usage.midiOptions!.ignoreUserTargets) updateUserTargets([]);
      if (game.user && targetsToUse.size === 0 && activity.target?.affects?.type === "self") {
        const selfTarget = getToken(activity.item.actor);
        if (selfTarget) {
          updateUserTargets([selfTarget.id]);
          targetsToUse = new Set([selfTarget]);
        } else {
          updateUserTargets([]);
        }
      } else if (targetsToUse.size === 0 && !usage.midiOptions!.ignoreUserTargets) {
        targetsToUse = new Set(game.user?.targets);
      }

      let abortHookName = `midi-qol.preAbort.${activity?.uuid}`;
      if (!(activity)) {
        // Magic items create a pseudo item when doing the roll so have to hope we get the right completion
        abortHookName = "midi-qol.preAbort";
      }
      usage.sequenceId = foundry.utils.randomID();
      let completeHookName = `midi-qol.postCleanup.${activity.uuid}`;
      // @ts-expect-error no clue
      if (!activity || activity.activity?.id || activity.type === "cast") {
        // Magic items create a pseudo item when doing the roll so have to hope we get the right completion
        // Forward activities and CastActivity won't fire postCleanup with the cast activity's UUID —
        // the spell workflow fires it with the spell activity's UUID instead.
        // Use the generic hook and rely on sequenceId gating to match the correct workflow.
        completeHookName = "midi-qol.postCleanup";
      }

      // Both hooks and the timeout do the same cleanup: unregister hooks, restore targets, resolve.
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const cleanupAndResolve = (result: any, source?: string) => {
        if (timeoutId !== undefined) { clearTimeout(timeoutId); timeoutId = undefined; }
        //@ts-expect-error dynamic hook name
        Hooks.off(abortHookName, abortHookId);
        //@ts-expect-error dynamic hook name
        Hooks.off(completeHookName, completeHookId);
        if (source && debugEnabled > 0) warn(`completeActivityUse ${source}: ${activity?.item?.name} ${completeHookName}`);
        // Put back the targets saved at the start only if the user's are still the ones this use left: another use
        // (or the player) may have targeted since, and restoring would take its targets away.
        const own = new Set([...((result as Workflow | undefined)?.targets ?? targetsToUse)].map(t => t.id));
        const current = new Set([...(game.user?.targets ?? [])].map(t => t.id));
        if (current.size === own.size && [...current].every(id => own.has(id))) updateUserTargets(localSavedTargetIds);
        resolve(result);
      };

      //@ts-expect-error dynamic hook name
      const abortHookId = Hooks.on(abortHookName, (workflow: Workflow) => {
        if (workflow.sequenceId !== usage.sequenceId) return;
        cleanupAndResolve(workflow, "preAbort");
      });
      //@ts-expect-error dynamic hook name
      const completeHookId = Hooks.on(completeHookName, (workflow: Workflow) => {
        if (workflow.sequenceId !== usage.sequenceId) return;
        cleanupAndResolve(workflow, "postCleanup");
      });
      timeoutId = setTimeout(() => {
        cleanupAndResolve(undefined, "timeout");
      }, maxWait * 1000);
      usage.midiOptions!.targetsToUse = targetsToUse;
      const isMidiActivity = !!(activity as { isMidiActivity?: boolean }).isMidiActivity;
      // Another module's activity reads the user's targets, not midi's options.
      if (!isMidiActivity) updateUserTargets(Array.from(targetsToUse).map(t => t.id));
      // @ts-expect-error no dnd5e-types
      activity.use(usage, dialog, message).then(result => {
        // An activity midi doesn't wrap (another module's) runs no workflow, so no hook will resolve it.
        if (!result || !isMidiActivity) {
          cleanupAndResolve(undefined);
        }
      }).catch(err => {
        TroubleShooter.recordError(err, "completeActivityUse | activity.use failed");
        cleanupAndResolve(undefined, "error");
      });
    });
  } else {
    const newUsage = foundry.utils.deepClone(usage) as unknown as { sequenceId?: string; workflow?: Workflow; midiOptions: SerializedMidiOptions };
    newUsage.midiOptions ??= {};
    newUsage.midiOptions.targetsToUse = Array.from(targetsToUse).map(t => t.document.uuid);
    if (usage.midiOptions.rollAs) newUsage.midiOptions.rollAs = usage.midiOptions.rollAs.uuid;
    const data = {
      activityUuid: activity.uuid,
      actorUuid: activity.item.parent?.uuid,
      usage: newUsage,
      dialog,
      message
    }
    if (asUser)
      return await socketlibSocket.executeAsUser("completeActivityUse", asUser.id, data);
    else
      return await timedAwaitExecuteAsGM("completeActivityUse", data);
  }
}

export type MidiOptions = {
  activityId?: string;
  activityIdentifier?: string;
  advantage?: boolean;
  asUser?: User.Implementation | string;
  chatMessage?: boolean;
  checkGMstatus?: boolean;
  configureDialog?: boolean;
  critical?: number;
  disadvantage?: boolean;
  event?: AugmentedEvent;
  fastForward?: boolean;
  fastForwardAttack?: boolean;
  fastForwardDamage?: boolean;
  fastForwardHeal?: boolean;
  fastForwardSet?: boolean;
  fumble?: boolean | number;
  recomputeAdvantage?: boolean;
  ignoreUserTargets?: boolean;
  isConcentrationCheck?: boolean;
  isCritical?: boolean;
  isDummy?: boolean;
  isFumble?: boolean;
  isMagicSave?: boolean;
  isTriggered?: boolean;
  item?: Item.Implementation;
  itemCardUuid?: string;
  itemUuid?: string;
  noUseWarning?: boolean;
  parts?: string[];
  powerLevel?: number;
  proceedChecks?: {
    checkBonusAction?: boolean;
    checkReaction?: boolean;
    none?: boolean;
  };
  rollAs?: Actor.Implementation | null;
  rollOptions?: WorkflowRollOptions;
  saveItem?: Item.Implementation;
  saveItemUuid?: string;
  saveActivityUuid?: string;
  simulate?: boolean;
  // grantsActor/grantsToken: The opposing entity that grants advantage/disadvantage.
  // For attacks: the defender (target). For saves/checks: the caster (workflow.actor).
  // Falls back to the actor themselves when there is no opposing entity.
  grantsActor?: Actor.Implementation;
  grantsToken?: Token.Implementation;
  spellLevel?: number;
  target?: number;
  targets?: Set<foundry.canvas.placeables.Token.Implementation>;
  targetsToUse?: Set<foundry.canvas.placeables.Token.Implementation>;
  targetUuids?: string[];
  triggeredActivity?: boolean;
  addOptionalBonuses?: boolean;
  updateWorkflow?: boolean;
  workflow?: Workflow;
  workflowId?: string;
  workflowOptions?: WorkflowOptions;
  /** Multiple abilities available for a save/check (e.g., ["str", "dex"]) */
  rollAbilities?: string[];
  /** Multiple skills available for a skill check (e.g., ["ath", "acr"]) */
  rollSkills?: string[];
  /** Multiple tools available for a tool check (e.g., ["thief", "smith"]) */
  rollTools?: string[];
  /** Pre-computed advantage data per choice (ability/skill/tool), populated by Workflow.ts and deserialized by GMAction.
   *  A roll is always ONE type, so one object suffices for abilities, skills, or tools.
   */
  advantageByChoice?: Record<string, PreComputedAdvantageData>;
};
type SerializedMidiOptions = Omit<MidiOptions, "targetsToUse" | "rollAs" | "asUser"> & {
  targetsToUse?: string[];
  rollAs?: string;
}

export async function completeItemUse(itemRef: Item.Implementation | string, config: ActivityUseConfiguration & { legacy?: boolean, chooseActivity?: boolean } = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  const item = (typeof itemRef === "string") ? (await fromUuid(itemRef) as Item.Implementation | undefined) : itemRef;
  const { legacy, chooseActivity, ...activityConfig } = config;
  if (legacy) {
    error("completeItemUse | legacy rolls are no longer supported");
    return;
  }
  config.midiOptions ??= {};
  if (!(item instanceof CONFIG.Item.documentClass)) {
    error("completeItemUse only works for items", item);
    return;
  }
  if (config.midiOptions.activityId || config.midiOptions.activityIdentifier) {
    // @ts-expect-error no dnd5e-types
    const selected: Activity = item.system.activities.find(a => a.id === config.midiOptions.activityId || a.identifier === config.midiOptions.activityIdentifier)
    if (selected) return completeActivityUse(selected, activityConfig, dialog, message);
  }
  // If this spell was created by a CastActivity (cached spell), redirect through the
  // CastActivity so its consumption targets (e.g. Paladin's Smite limited uses) are consumed.
  // This handles the case where external modules call completeItemUse(spell) directly.
  // @ts-expect-error no dnd5e-types
  const linkedCastActivity = item.type === "spell" && item.system.linkedActivity;
  if (linkedCastActivity) {
    return completeActivityUse(linkedCastActivity, activityConfig, dialog, message);
  }
  // @ts-expect-error no dnd5e-types
  // Filter usable activities: exclude riders, automationOnly, and activities that fail visibility checks (canUse)
  const activities = item.system.activities?.filter(a =>
    a.canUse !== false &&
    !item.flags.dnd5e?.riders?.activity?.includes(a.id) &&
    !a.midiProperties?.automationOnly
  );
  if (activities.length === 0) {
    //@ts-expect-error no dnd5e-types
    return item.displayCard(message);
    // error(`completeItemUse | item ${item.name} ${item.uuid} does not have a suitable activity`);
    // return undefined;
  }
  const activity = await MidiActivityChoiceDialog.create(item, { chooseActivity });
  if (activity) return completeActivityUse(activity, activityConfig, dialog, message);
  return undefined;
}

export function untargetAllTokens(combat: Combat.Implementation) {
  let prevTurn = (combat.current.turn ?? 0) - 1;
  if (prevTurn === -1)
    prevTurn = combat.turns.length - 1;

  const previous = combat.turns[prevTurn];
  if ((game.user?.isGM && ["allGM", "all"].includes(autoRemoveTargets)) || (autoRemoveTargets === "all" && canvas.tokens?.controlled.find(t => t.id === previous.token?.id))) {
    // release current targets
    game.user?.targets.forEach((t: Token) => {
      t.setTarget(false, { releaseOthers: false });
    });
  }
}

/**
 * Get the vitality item for an actor (a feature with uses that serves as a vitality pool)
 * @param actor The actor to get the vitality item for
 * @returns The vitality item if found, undefined otherwise
 */
export function getVitalityItem(actor: Actor.Implementation | null | undefined): Item.Implementation | undefined {
  if (!actor) return undefined;
  const itemName = checkRule("vitalityItem");
  if (typeof itemName !== "string" || !itemName) return undefined;
  return actor.items.getName(itemName) ?? undefined;
}

/**
 * Get the current vitality value for an actor
 * @param actor The actor to get vitality for
 * @returns The current vitality value, or undefined if no vitality system is configured
 */
export function getVitalityValue(actor: Actor.Implementation | null | undefined): number | undefined {
  if (!actor) return undefined;

  const vitalityItem = getVitalityItem(actor);
  if (vitalityItem) {
    // @ts-expect-error uses exists on items with uses
    return vitalityItem.system.uses?.value ?? 0;
  }

  return undefined;
}

/**
 * Get the maximum vitality value for an actor
 * @param actor The actor to get max vitality for
 * @returns The maximum vitality value, or undefined if no vitality system is configured
 */
export function getVitalityMax(actor: Actor.Implementation | null | undefined): number | undefined {
  if (!actor) return undefined;

  const vitalityItem = getVitalityItem(actor);
  if (vitalityItem) {
    // @ts-expect-error uses exists on items with uses
    return vitalityItem.system.uses?.max ?? 0;
  }

  return undefined;
}

/**
 * Check if the actor has a vitality system configured
 */
export function hasVitalitySystem(actor: Actor.Implementation | null | undefined): boolean {
  if (!actor) return false;
  return !!getVitalityItem(actor);
}

export function checkDefeated(actorRef: Actor.Implementation | TokenOrDocument | string): 0 | 1 {
  const actor = getActor(actorRef);
  if (!actor) return 0;

  return hasCondition(actor, CONFIG.specialStatusEffects.DEFEATED)
    || hasCondition(actor, configSettings.midiDeadCondition);
}

export function checkIncapacitated(actorRef?: Actor.Implementation | TokenOrDocument | string | null, logResult: boolean = true, warning: boolean = false): string | false {
  const actor: Actor | null | undefined = getActor(actorRef);
  if (!actor) return false;
  let status: string | false = false;
  // @ts-expect-error no dnd5e-types
  if (actor.system.traits?.ci?.value?.has("incapacitated")) return false;

  // Check vitality system
  const vitality = getVitalityValue(actor as Actor.Implementation);
  if (vitality !== undefined) {
    // Check vitalityDeathRequires setting: "vitalityOnly" = dead when vitality=0, "vitalityAndHP" = dead when both are 0
    const deathRequires = configSettings.optionalRules.vitalityDeathRequires || "vitalityOnly";
    // @ts-expect-error no dnd5e-types
    const hpValue = actor?.system.attributes?.hp?.value ?? 0;
    if (deathRequires === "vitalityOnly") {
      // Dead when vitality reaches 0, regardless of HP
      if (vitality <= 0) {
        status = "dead";
      }
    } else {
      // Dead only when both vitality and HP are 0
      if (vitality <= 0 && hpValue <= 0) {
        status = "dead";
      }
    }
  } else {
    // No vitality system - just check HP
    // @ts-expect-error no dnd5e-types
    if (!actor.system?.attributes?.hp?.value) {
      (debug("No hp attribute for ", actor));
    }
    // @ts-expect-error no dnd5e-types
    if (actor?.system?.attributes?.hp?.value <= 0) {
      status = "dead";
    }
  }

  if (configSettings.midiUnconsciousCondition && hasCondition(actor, configSettings.midiUnconsciousCondition)) {
    status = configSettings.midiUnconsciousCondition;
  }
  if (configSettings.midiDeadCondition && hasCondition(actor, configSettings.midiDeadCondition)) {
    status = configSettings.midiDeadCondition;
  }
  const incapCondition = (globalThis.MidiQOL.incapacitatedConditions ?? ["incapacitated"]).find(cond => hasCondition(actor, cond));
  if (incapCondition) {
    status = incapCondition;
  }
  if (status) logIncapacitatedCheckResult(actor.name ?? "unknown", status, logResult, warning);
  return status;
}

export function logIncapacitatedCheckResult(actorName: string, status: string, logResult: boolean = true, warning: boolean = false) {
  const displayString = status === "incapacitated" ? `${actorName} is ${getStatusName(status)}` : `${actorName} is ${getStatusName(status)} and therefore ${getStatusName("incapacitated")}`;
  if (logResult) log(displayString);
  if (warning) ui.notifications?.warn(displayString);
}

export function getUnitDist(x1: number, y1: number, z1: number, token2): number {
  if (!canvas.dimensions) return 0;
  const unitsToPixel = canvas.dimensions.size / canvas.dimensions.distance;
  z1 = z1 * unitsToPixel;
  const x2 = token2.center.x;
  const y2 = token2.center.y;
  const z2 = token2.document.elevation * unitsToPixel;

  const d =
    Math.sqrt(
      Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2) + Math.pow(z2 - z1, 2)
    ) / unitsToPixel;
  return d;
}

export function distancePointToken({ x, y, elevation = 0 }, token, wallblocking = false): number | undefined {
  if (!canvas || !canvas.scene) return undefined;
  let coverACBonus = 0;
  let tokenTileACBonus = 0;

  let coverData;
  if (!canvas.grid || !canvas.dimensions) undefined;
  if (!token || x === undefined || y === undefined) return undefined;
  if (!canvas || !canvas.grid || !canvas.dimensions) return undefined;
  const t2StartX = -Math.max(0, token.document.width / 2 - 0.5);
  const t2StartY = -Math.max(0, token.document.height / 2 - 0.5);
  //  const [row, col] = canvas.grid?.getGridPositionFromPixels(x, y) || [0, 0];
  //  const [xBase, yBase] = canvas.grid?.getPixelsFromGridPosition(row, col) || [0, 0];
  let xc, yc;
  let distance = +Infinity;
  for (let xStep = t2StartX; xStep < token.document.width / 2; xStep += 1) {
    for (let yStep = t2StartY; yStep < token.document.height / 2; yStep += 1) {
      const xBase = xStep * canvas.grid.size + token.center.x;
      const yBase = yStep * canvas.grid.size + token.center.y;
      ({ x: xc, y: yc } = canvas.grid.getCenterPoint({ x: xBase, y: yBase }) || { x: 0, y: 0 });
      // ({ x: xc, y: yc } = canvas.grid.getCenterPoint.bind(canvas.grid)({ x, y }) || { x: 0, y: 0 });
      const newDistance = canvas.grid.measurePath([new PIXI.Point(x, y), { x: xc, y: yc }], {}).distance;
      if (newDistance < 1) {
        coverACBonus += 1;
        tokenTileACBonus += 1;
      }
      if (newDistance < distance) distance = newDistance;
    }
  }
  return distance;
}

export function checkDistance(t1: any, t2: any, distance: number, options: { wallsBlock?: boolean, includeCover?: boolean } = { wallsBlock: false, includeCover: true }): boolean {
  const { wallsBlock = false, includeCover = true } = options;
  const dist = getDistance(t1, t2, { wallsBlock, includeCover });
  return 0 <= dist && dist <= distance;
}

// ==================== PERIMETER DISTANCE HELPERS ====================
// These functions compute the minimum distance between token perimeters (actual shapes)
// rather than between grid square centers. Supports all v13 token shapes:
// rectangles, hexagonal polygons, circles, and ellipses.

/**
 * Get a token's perimeter as a PIXI.Polygon in world coordinates.
 * Uses token.getShape() for the actual shape (hex, circle, ellipse, rectangle)
 * and translates from local to world coordinates.
 */
export function getTokenPerimeterPolygon(token: Token): PIXI.Polygon {
  const shape = token.getShape();
  const { x, y } = token.document;

  let polygon: PIXI.Polygon;
  if (shape instanceof PIXI.Polygon) {
    polygon = shape;
  } else if (shape instanceof PIXI.Circle) {
    //@ts-expect-error Foundry extends PIXI.Circle with toPolygon()
    polygon = shape.toPolygon();
  } else if (shape instanceof PIXI.Ellipse) {
    polygon = ellipseToPolygon(shape);
  } else {
    // PIXI.Rectangle — Foundry extends with toPolygon()
    polygon = (shape as any).toPolygon();
  }

  // Translate from local (origin 0,0) to world coordinates
  const pts = polygon.points;
  const worldPts: number[] = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    worldPts[i] = pts[i] + x;
    worldPts[i + 1] = pts[i + 1] + y;
  }
  return new PIXI.Polygon(worldPts);
}

/**
 * Approximate a PIXI.Ellipse as a PIXI.Polygon.
 * Foundry provides toPolygon() for Circle and Rectangle but not Ellipse.
 */
function ellipseToPolygon(ellipse: PIXI.Ellipse, segments: number = 24): PIXI.Polygon {
  const pts: number[] = [];
  // PIXI.Ellipse stores half-widths in .width and .height properties
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    pts.push(ellipse.x + ellipse.width * Math.cos(angle));
    pts.push(ellipse.y + ellipse.height * Math.sin(angle));
  }
  return new PIXI.Polygon(pts);
}

/**
 * Find the closest point on a polygon's perimeter to a given point.
 * Uses foundry.utils.closestPointToSegment for each edge.
 * @param polygon - The polygon (in world coordinates, closed or open)
 * @param px - X coordinate of the point
 * @param py - Y coordinate of the point
 * @returns The closest point on the polygon's perimeter
 */
export function closestPointOnPerimeter(polygon: PIXI.Polygon, px: number, py: number): { x: number, y: number } {
  const pts = polygon.points;
  const numPts = pts.length;
  if (numPts < 4) return { x: px, y: py };

  const c = { x: px, y: py };
  let bestDistSq = Infinity;
  let best = { x: px, y: py };

  for (let i = 0; i < numPts; i += 2) {
    const ni = (i + 2) % numPts;
    const a = { x: pts[i], y: pts[i + 1] };
    const b = { x: pts[ni], y: pts[ni + 1] };
    // Skip degenerate zero-length edges
    if (a.x === b.x && a.y === b.y) continue;
    const closest = foundry.utils.closestPointToSegment(c, a, b);
    const dx = closest.x - px;
    const dy = closest.y - py;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = closest;
    }
  }
  return best;
}

/**
 * Compute the closest points on two polygon perimeters.
 * @param poly1 - First polygon (in world coordinates)
 * @param poly2 - Second polygon (in world coordinates)
 * @returns The closest points on each polygon's perimeter
 */
export function closestPerimeterPoints(poly1: PIXI.Polygon, poly2: PIXI.Polygon): { p1: { x: number, y: number }, p2: { x: number, y: number } } {
  // Quick overlap check using bounding boxes
  const b1 = poly1.getBounds();
  const b2 = poly2.getBounds();
  const overlapX = b1.left < b2.right && b1.right > b2.left;
  const overlapY = b1.top < b2.bottom && b1.bottom > b2.top;

  if (overlapX && overlapY) {
    // Bounding boxes overlap — check if polygons actually overlap
    // Use centroid containment as a fast check for convex shapes
    const c1 = polygonCentroid(poly1);
    const c2 = polygonCentroid(poly2);
    if (poly1.contains(c2.x, c2.y) || poly2.contains(c1.x, c1.y)) {
      const midX = (c1.x + c2.x) / 2;
      const midY = (c1.y + c2.y) / 2;
      return { p1: { x: midX, y: midY }, p2: { x: midX, y: midY } };
    }
  }

  // Iterative closest-point refinement (converges for convex shapes)
  const c2 = polygonCentroid(poly2);
  let p1 = closestPointOnPerimeter(poly1, c2.x, c2.y);
  let p2 = closestPointOnPerimeter(poly2, p1.x, p1.y);
  p1 = closestPointOnPerimeter(poly1, p2.x, p2.y);
  p2 = closestPointOnPerimeter(poly2, p1.x, p1.y);

  return { p1, p2 };
}

/**
 * Get the centroid of a polygon.
 */
function polygonCentroid(poly: PIXI.Polygon): { x: number, y: number } {
  const pts = poly.points;
  let cx = 0, cy = 0;
  const count = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) {
    cx += pts[i];
    cy += pts[i + 1];
  }
  return { x: cx / count, y: cy / count };
}



/**
 * Options for wall collision checking.
 */
export interface WallCollisionOptions {
  /** Source document for the collision check (typically token document) */
  source?: any;
  /** The wallsBlockRange setting value */
  wallsBlockRange: string;
  /** Pre-computed cover visibility (from external modules like simbuls, levelsautocover) */
  coverVisible?: boolean;
  /** Origin point elevation (for Levels API) */
  originElevation?: number;
  /** Destination point elevation (for Levels API) */
  destElevation?: number;
  /** Origin top elevation (for Levels API) */
  originTopElevation?: number;
  /** Destination top elevation (for Levels API) */
  destTopElevation?: number;
}

/**
 * Check if a wall blocks the path between two points.
 * Respects the wallsBlockRange setting and handles different collision modes.
 *
 * @param origin - Starting point {x, y}
 * @param dest - Destination point {x, y}
 * @param options - Collision check options
 * @returns true if collision detected (path blocked), false if clear
 */
/** Only walls that block movement give total cover: darkness and sight-only walls (curtains) leave a target attackable */
function wallBlocksPath(origin: { x: number, y: number }, dest: { x: number, y: number }, source: any): boolean {
  return !!CONFIG.Canvas.polygonBackends.move.testCollision(origin, dest, { source, mode: "any", type: "move" });
}

export function checkWallCollision(
  origin: { x: number, y: number },
  dest: { x: number, y: number },
  options: WallCollisionOptions
): boolean {
  const { wallsBlockRange, coverVisible, source } = options;
  let blocked: boolean;

  switch (wallsBlockRange) {
    case "center": {
      blocked = !!wallBlocksPath(origin, dest, source);
      return blocked;
    }

    case "centerLevels":
    case "levelsautocover":
      if (installedModules.get("levels")) {
        if (coverVisible === false) {
          return true;
        }
        if (coverVisible === undefined) {
          const p1 = { x: origin.x, y: origin.y, z: options.originElevation ?? 0 };
          const p2 = { x: dest.x, y: dest.y, z: options.destElevation ?? 0 };
          //@ts-expect-error Levels API not typed
          const baseToBase = CONFIG.Levels.API.testCollision(p1, p2, "collision");
          const p1Top = { x: origin.x, y: origin.y, z: options.originTopElevation ?? p1.z };
          const p2Top = { x: dest.x, y: dest.y, z: options.destTopElevation ?? p2.z };
          //@ts-expect-error Levels API not typed
          const topToBase = CONFIG.Levels.API.testCollision(p1Top, p2Top, "collision");
          blocked = baseToBase && topToBase;
          return blocked;
        }
        return false;
      }
      // Fallback to basic check if Levels not installed
      blocked = !!wallBlocksPath(origin, dest, source);
      return blocked;

    case "alternative":
    case "simbuls-cover-calculator":
      if (coverVisible === undefined) {
        blocked = !!wallBlocksPath(origin, dest, source);
        return blocked;
      }
      return false;

    case "simplecover5e":
      // simplecover5e wall blocking is handled entirely by the pre-check (getCover with losCheck: true)
      // No per-ray fallback — if the pre-check didn't resolve, we don't block
      return false;

    case "tokencover":
      // tokencover is handled entirely by pre-check, no per-segment check needed
      return false;

    case "none":
    default:
      return false;
  }
}

/**
 * Compute the minimum grid distance between two token perimeters.
 * This finds the closest points on each token's bounding rectangle perimeter
 * and measures the grid distance between them.
 *
 * @param t1 - First token (or token reference)
 * @param t2 - Second token (or token reference)
 * @param options - Options for distance calculation
 * @returns The grid distance between perimeters, or -1 if blocked/invalid
 */
/**
 * Check if two token shapes overlap.
 * Uses bounding box check then centroid containment for convex shapes.
 */
function shapesOverlap(poly1: PIXI.Polygon, poly2: PIXI.Polygon): boolean {
  const b1 = poly1.getBounds();
  const b2 = poly2.getBounds();
  if (b1.right < b2.left || b1.left > b2.right || b1.bottom < b2.top || b1.top > b2.bottom) return false;
  const c1 = polygonCentroid(poly1);
  const c2 = polygonCentroid(poly2);
  return poly1.contains(c2.x, c2.y) || poly2.contains(c1.x, c1.y);
}

/**
 * Run module-level pre-checks (levelsautocover, simbuls, tokencover, simplecover5e)
 * to determine if a target is fully blocked before doing per-ray wall checks.
 * Returns { blocked: true } if the module says total cover,
 * or { coverVisible } to pass through to per-ray checks.
 */
function computeWallBlockPreCheck(
  t1: Token.Implementation,
  t2: Token.Implementation,
  wallsBlock: boolean,
  includeCover: boolean
): { blocked: boolean, coverVisible?: boolean | undefined } {
  const wallsBlockRange = configSettings.optionalRules.wallsBlockRange;
  //@ts-expect-error
  if (installedModules.get("levelsautocover") && game.settings.get("levelsautocover", "apiMode") && wallsBlock && wallsBlockRange === "levelsautocover" && includeCover) {
    //@ts-expect-error
    const levelsautocoverData = AutoCover.calculateCover(t1, t2, getLevelsAutoCoverOptions());
    const coverVisible = levelsautocoverData.rawCover > 0;
    const result = coverVisible ? { blocked: false, coverVisible: true } : { blocked: true };
    return result;
  } else if (globalThis.CoverCalculator && wallsBlockRange === "simbuls-cover-calculator" && includeCover) {
    if (t1 === t2) return { blocked: false, coverVisible: undefined };
    const coverData = globalThis.CoverCalculator.Cover(t1, t2);
    if (debugEnabled > 0) warn("wallBlockPreCheck | simbuls cover calculator ", t1.name, t2.name, coverData);
    const result = (coverData?.data.results.cover === 3 && wallsBlock) ? { blocked: true } : { blocked: false, coverVisible: true };
    return result;
  } else if (installedModules.get("tokencover") && wallsBlockRange === "tokencover" && includeCover) {
    const coverValue = calcTokenCover(t1, t2);
    const result = (coverValue === 3 && wallsBlock) ? { blocked: true } : { blocked: false, coverVisible: true };
    return result;
  } else if (installedModules.get("simplecover5e") && wallsBlockRange === "simplecover5e" && wallsBlock) {
    //@ts-expect-error
    const simpleCoverApi = game.modules.get("simplecover5e")?.api;
    if (simpleCoverApi) {
      // If we're using simple cover to determine walls block have to use losCheck: true, otherwise will never return more than 3/4 cover
      // const losCheck = !!safeGetGameSetting("simplecover5e", "losCheck");
      const coverResult = simpleCoverApi.getCover({
        attacker: t1,
        target: t2,
        scene: t1.scene,
        losCheck: true
      });
      const result = (coverResult?.bonus === null || coverResult?.cover === "total") ? { blocked: true } : { blocked: false, coverVisible: true };
      return result;
    }
  }
  return { blocked: false, coverVisible: undefined };
}


export function computePerimeterDistance(
  t1: any,
  t2: any,
  options: DistanceOptions = {}
): number {
  let { wallsBlock = false, includeElevation = true, includeCover = true } = options;

  if (!canvas?.scene || !canvas.grid || !canvas.dimensions) return -1;

  const token1 = getPlaceable(t1);
  const token2 = getPlaceable(t2);
  if (!token1 || !token2) return -1;

  // Same token - distance is 0
  if (token1 === token2) return 0;

  // Check ignoreWalls flag
  const actor = (token1 as Token).actor;
  const ignoreWallsFlag = actor ? foundry.utils.getProperty(actor, `flags.${MODULE_ID}.ignoreWalls`) : false;
  if (ignoreWallsFlag) {
    wallsBlock = false;
  }

  const poly1 = getTokenPerimeterPolygon(token1 as Token);
  const poly2 = getTokenPerimeterPolygon(token2 as Token);

  const gridDistance = canvas.dimensions.distance; // typically 5 feet

  // Check if tokens overlap - if so, distance is 0
  if (shapesOverlap(poly1, poly2)) {
    return 0;
  }

  // Find the closest points on each perimeter
  const { p1, p2 } = closestPerimeterPoints(poly1, poly2);

  // Convert to PIXI.Point to match computeDistance behavior
  const origin = new PIXI.Point(p1.x, p1.y);
  const dest = new PIXI.Point(p2.x, p2.y);

  // Check for walls blocking if requested
  if (wallsBlock) {
    const wallsBlockRange = configSettings.optionalRules.wallsBlockRange;
    if (wallsBlockRange !== "none") {
      // Run module pre-checks (simplecover5e, levelsautocover, simbuls, tokencover)
      const preCheck = computeWallBlockPreCheck(token1 as Token, token2 as Token, wallsBlock, includeCover);
      if (preCheck.blocked) return -1;

      // If no module pre-check resolved it, cast rays from attacker center to
      // a grid of 17 boundary test points on the target (same pattern as _canSenseModes).
      // Block only if ALL rays are blocked by walls.
      if (preCheck.coverVisible === undefined) {
        const srcCenter = (token1 as Token).center;
        const tgtCenter = (token2 as Token).center;
        const t = Math.min((token2 as Token).w, (token2 as Token).h) / 4;
        const t2half = Math.min((token2 as Token).w, (token2 as Token).h) / 2 - 2;
        const offsets = t > 0 ? [
          [0, 0], [-t, -t], [-t, t], [t, t], [t, -t], [-t, 0], [t, 0], [0, -t], [0, t],
          [-t2half, -t2half], [-t2half, t2half], [t2half, t2half], [t2half, -t2half], [-t2half, 0], [t2half, 0], [0, -t2half], [0, t2half]
        ] : [[0, 0]];
        const testPoints = offsets.map(o => new PIXI.Point(tgtCenter.x + o[0], tgtCenter.y + o[1]));
        const srcOrigin = new PIXI.Point(srcCenter.x, srcCenter.y);

        const t1Elevation = (token1 as Token).document.elevation ?? 0;
        const t2Elevation = (token2 as Token).document.elevation ?? 0;
        const t1DocSize = Math.max((token1 as Token).document.height ?? 1, (token1 as Token).document.width ?? 1);
        const t2DocSize = Math.min((token2 as Token).document.height ?? 1, (token2 as Token).document.width ?? 1);
        const t1TopElevation = t1Elevation + t1DocSize * (canvas.dimensions?.distance ?? 5);
        const t2TopElevation = t2Elevation + t2DocSize * (canvas.dimensions?.distance ?? 5);

        let allBlocked = true;
        for (const tgtPt of testPoints) {
          const collision = checkWallCollision(srcOrigin, tgtPt, {
            source: (token1 as Token).document,
            wallsBlockRange,
            coverVisible: preCheck.coverVisible,
            originElevation: t1Elevation,
            destElevation: t2Elevation,
            originTopElevation: t1TopElevation,
            destTopElevation: t2TopElevation
          });
          if (!collision) { allBlocked = false; break; }
        }
        if (allBlocked) {
          return -1;
        }
      }
      // coverVisible === true means module says not blocked — continue to distance calc
    }
  }

  // Calculate raw distance between closest perimeter points
  // The approach depends on the grid type and diagonal mode setting
  const isGridless = canvas.grid.isGridless;
  const useGriddedGridless = isGridless && configSettings.griddedGridless;

  let distance: number;

  if (isGridless && !useGriddedGridless) {
    // Pure gridless: calculate raw euclidean distance directly
    const dx = dest.x - origin.x;
    const dy = dest.y - origin.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    const gridSize = canvas.dimensions?.size ?? 100;
    distance = (pixelDistance / gridSize) * gridDistance;
  } else if (useGriddedGridless) {
    // Gridless with griddedGridless: use proxy to treat as SquareGrid
    // measurePath on the proxy will use SquareGrid's _measurePath which respects diagonal mode
    const canvasGridProxy = createSquareGridProxy();
    const result = canvasGridProxy.measurePath([origin, dest], {});
    distance = result?.distance ?? 0;
  } else {
    // Gridded scene: measurePath calculates distance respecting diagonal mode
    const result = canvas.grid.measurePath([origin, dest], {});
    distance = result?.distance ?? 0;
  }

  // Include elevation difference if requested, using diagonal-aware combination
  if (includeElevation) {
    const heightDifference = computeTokenHeightDifference(token1 as Token, token2 as Token);
    distance = combineDistanceWithHeight(distance, heightDifference);
  }

  return distance;
}

/**
 * Measure point-to-point distance using the current grid mode.
 * On gridless scenes with griddedGridless enabled, uses the SquareGrid proxy.
 * Otherwise uses canvas.grid.measurePath directly.
 */
export function measurePointDistance(p1: { x: number, y: number }, p2: { x: number, y: number }): number {
  if (!canvas?.grid) return 0;
  const isGridless = canvas.grid.isGridless;
  if (isGridless && configSettings.griddedGridless) {
    const proxy = createSquareGridProxy();
    return proxy.measurePath([p1, p2], {})?.distance ?? 0;
  }
  return canvas.grid.measurePath([p1, p2], {})?.distance ?? 0;
}

/**
 * Measure distance from a token to a point using perimeter mode.
 * Finds the closest point on the token's perimeter polygon to the destination point,
 * then measures the grid distance between them.
 */
function measureTokenToPointPerimeter(token: Token, destPoint: { x: number, y: number }): number {
  if (!canvas?.grid || !canvas.dimensions) return -1;
  const poly = getTokenPerimeterPolygon(token);

  // Check if the point is inside the token's perimeter
  if (poly.contains(destPoint.x, destPoint.y)) return 0;

  // Find closest point on the token perimeter to the destination
  const closest = closestPointOnPerimeter(poly, destPoint.x, destPoint.y);
  return measurePointDistance(closest, destPoint);
}

const SCENE_UNIT_TO_DND5E: Record<string, string> = {
  ft: "ft", feet: "ft", foot: "ft",
  m: "m", meter: "m", meters: "m", metre: "m", metres: "m",
};

export function rangeToSceneUnits(value: number | undefined | null, units: string | undefined | null): number {
  if (!value || !units) return value ?? 0;
  const sceneUnit = canvas?.scene?.grid?.units?.toLowerCase() ?? "";
  const sceneUnitDnd = SCENE_UNIT_TO_DND5E[sceneUnit] ?? sceneUnit;
  return (globalThis as any).dnd5e?.utils?.convertLength?.(value, units, sceneUnitDnd, { strict: false }) ?? value;
}

/**
 * Get the perimeter-based distance from a token to a point, with gridification.
 * This applies the same gridification formula as getDistance in perimeter mode:
 *   distance = gridDistance + max(0, rawDistance - fudgeFactor)
 * Used for template placement range checks and clamping, always measuring from perimeter.
 * @param token - The token to measure from
 * @param point - The destination point
 * @returns The gridified distance, or -1 if invalid, or 0 if point is inside the token
 */
export function getPerimeterDistanceToPoint(token: Token, point: { x: number, y: number }): number {
  if (!canvas?.grid || !canvas.dimensions) return -1;
  const rawDistance = measureTokenToPointPerimeter(token, point);
  if (rawDistance < 0) return -1;
  if (rawDistance === 0) return 0;
  const gridDistance = canvas.dimensions.distance;
  const fudgeFactor = configSettings.gridlessFudge ?? 0;
  return gridDistance + Math.max(0, rawDistance - fudgeFactor);
}

export interface DistanceOptions {
  /** If true, return -1 if walls block line of sight between closest points */
  wallsBlock?: boolean;
  /** If true, include cover calculations (for modules like levelsautocover) */
  includeCover?: boolean;
  /** If true, include elevation difference in distance calculation */
  includeElevation?: boolean;
}

/**
 * Get the distance between two tokens using the configured measurement method.
 * This is the main token-to-token distance function used throughout midi-qol.
 * It respects the configSettings.optionalRules.distanceMeasurement setting.
 *
 * For token-to-point distance (e.g. template placement), use getPerimeterDistanceToPoint() instead.
 *
 * @param t1 - First token (or token reference)
 * @param t2 - Second token (or token reference)
 * @param options - Options for distance calculation
 * @returns The distance between the tokens, or -1 if invalid/blocked
 */
export function getDistance(t1: any, t2: any, options: DistanceOptions = {}): number {
  const { wallsBlock = false, includeCover = true, includeElevation = configSettings.optionalRules.distanceIncludesHeight } = options;
  const measurementMode = configSettings.optionalRules.distanceMeasurement ?? "center";
  const wallsBlockRange = configSettings.optionalRules.wallsBlockRange;
  const gridDistance = canvas?.dimensions?.distance ?? 5;
  const fudgeFactor = configSettings.gridlessFudge ?? 0;

  let distance: number = 0;

  if (measurementMode === "default") {
    // Default: use Foundry's core measurePath between token centers
    const token1 = getPlaceable(t1);
    const token2 = getPlaceable(t2);
    if (!token1 || !token2 || !canvas?.grid) return -1;
    if (token1 === token2) return 0;
    // Still run wall blocking checks even in default mode
    if (wallsBlock) {
      const preCheck = computeWallBlockPreCheck(token1 as Token.Implementation, token2 as Token.Implementation, wallsBlock, includeCover);
      if (preCheck.blocked) return -1;
      // If no module pre-check resolved (coverVisible is undefined), do a basic center-to-center sight check
      if (preCheck.coverVisible === undefined) {
        const origin = new PIXI.Point(token1.center.x, token1.center.y);
        const dest = new PIXI.Point(token2.center.x, token2.center.y);
        const collision = checkWallCollision(origin, dest, {
          source: token1.document,
          wallsBlockRange: configSettings.optionalRules.wallsBlockRange,
          coverVisible: undefined,
          originElevation: (token1.document as TokenDocument).elevation ?? 0,
          destElevation: (token2.document as TokenDocument).elevation ?? 0,
        });
        if (collision) return -1;
      }
    }
    const result = canvas.grid.measurePath([token1.center, token2.center], {});
    distance = Math.max(0, (result?.distance ?? 0) - fudgeFactor);
  } else if (measurementMode === "center") {
    distance = computeDistance(t1, t2, { wallsBlock, includeCover, includeElevation });
  } else if (measurementMode === "perimeter") {
    // computePerimeterDistance returns raw perimeter-to-perimeter distance (0 for adjacent/overlapping)
    const rawPerimeterDistance = computePerimeterDistance(t1, t2, {
      wallsBlock,
      includeCover,
      includeElevation
    });

    if (rawPerimeterDistance < 0) {
      distance = -1;
    } else {
      // 0 to fudgeFactor → 5 feet (one grid unit)
      // >fudgeFactor → 5 + (rawDistance - fudgeFactor)
      distance = gridDistance + Math.max(0, rawPerimeterDistance - fudgeFactor);
    }
  }
  return distance;
}

/**
 * Compute the height difference between two tokens, accounting for token volume.
 * Returns 0 if elevation ranges overlap, otherwise the gap plus one grid unit.
 */
function computeTokenHeightDifference(token1: Token, token2: Token): number {
  if (!canvas?.dimensions) return 0;
  const gridDistance = canvas.dimensions.distance ?? 5;

  const t1Elevation = token1.document.elevation ?? 0;
  const t2Elevation = token2.document.elevation ?? 0;
  const t1DocWidth = token1.document.width ?? 1;
  const t1DocHeight = token1.document.height ?? 1;
  const t2DocWidth = token2.document.width ?? 1;
  const t2DocHeight = token2.document.height ?? 1;
  const t1TopElevation = t1Elevation + Math.max(t1DocHeight, t1DocWidth) * gridDistance;
  const t2TopElevation = t2Elevation + Math.min(t2DocHeight, t2DocWidth) * gridDistance;

  // If bottom elevation of either token is within the other's elevation range, no height difference
  if ((t2Elevation > t1Elevation && t2Elevation < t1TopElevation) || (t1Elevation > t2Elevation && t1Elevation < t2TopElevation)) {
    return 0;
  }
  if (t1Elevation < t2Elevation) { // t2 above t1
    return Math.max(0, t2Elevation - t1TopElevation) + gridDistance;
  }
  if (t1Elevation > t2Elevation) { // t1 above t2
    return Math.max(0, t1Elevation - t2TopElevation) + gridDistance;
  }
  return 0;
}

/**
 * Combine a flat (horizontal) distance with a height difference using the
 * current diagonal movement rule. Treats the shorter of the two as the
 * "diagonal" component and the remainder as the "straight" component.
 */
function combineDistanceWithHeight(distance: number, heightDifference: number): number {
  if (heightDifference <= 0) return distance;

  let nd = Math.min(distance, heightDifference);
  let ns = Math.abs(distance - heightDifference);
  const diagonals = safeGetGameSetting("core", "gridDiagonals");
  const GRID_DIAGONALS = CONST.GRID_DIAGONALS;

  let cd: number;
  switch (diagonals) {
    case GRID_DIAGONALS.EQUIDISTANT: cd = nd; break;
    case GRID_DIAGONALS.EXACT: cd = Math.SQRT2 * nd; break;
    case GRID_DIAGONALS.APPROXIMATE: cd = 1.5 * nd; break;
    case GRID_DIAGONALS.RECTILINEAR: cd = 2 * nd; break;
    case GRID_DIAGONALS.ALTERNATING_1:
      cd = ((nd + 1) & -2) + (nd >> 1);
      break;
    case GRID_DIAGONALS.ALTERNATING_2:
      cd = ((nd + 1) & -2) + (nd >> 1);
      break;
    case GRID_DIAGONALS.ILLEGAL:
      cd = 2 * nd;
      nd = 0;
      ns = distance + heightDifference;
      break;
    default:
      cd = nd;
      break;
  }
  return ns + cd;
}

/** takes two tokens of any size and calculates the distance between them
*** gets the shortest distance betwen two tokens taking into account both tokens size
*** if wallblocking is set then wall are checked
**/
export function computeDistance(t1: any /*Token*/, t2: any /*Token*/, options: { wallsBlock?: boolean, includeCover?: boolean, includeElevation?: boolean } = { wallsBlock: false, includeCover: true }): number {
  if (!canvas?.scene || !canvas.grid || !canvas.dimensions) return -1;
  t1 = getPlaceable(t1);
  t2 = getPlaceable(t2);
  if (!t1 || !t2) return -1;
  let { wallsBlock = false, includeCover = true, includeElevation = configSettings.optionalRules.distanceIncludesHeight } = options;
  const actor = t1.actor;
  const ignoreWallsFlag = foundry.utils.getProperty(actor, `flags.${MODULE_ID}.ignoreWalls`);
  if (ignoreWallsFlag) {
    wallsBlock = false;
  }
  let t1DocWidth = t1.document.width ?? 1;
  let t1DocHeight = t1.document.height ?? 1;
  let t2DocWidth = t2.document.width ?? 1;
  let t2DocHeight = t2.document.height ?? 1;

  const t1StartX = t1DocWidth >= 1 ? 0.5 : t1DocWidth / 2;
  const t1StartY = t1DocHeight >= 1 ? 0.5 : t1DocHeight / 2;
  const t2StartX = t2DocWidth >= 1 ? 0.5 : t2DocWidth / 2;
  const t2StartY = t2DocHeight >= 1 ? 0.5 : t2DocHeight / 2;
  const t1Elevation = t1.document.elevation ?? 0;
  const t2Elevation = t2.document.elevation ?? 0;
  const t1TopElevation = t1Elevation + Math.max(t1DocHeight, t1DocWidth) * (canvas.dimensions?.distance ?? 5);
  const t2TopElevation = t2Elevation + Math.min(t2DocHeight, t2DocWidth) * (canvas.dimensions?.distance ?? 5); // assume t2 is trying to make itself small
  const wallsBlockRange = configSettings.optionalRules.wallsBlockRange;
  // Module pre-check: full cover means no attack, otherwise skip per-ray los checks
  const preCheck = wallsBlock ? computeWallBlockPreCheck(t1, t2, wallsBlock, includeCover) : { blocked: false, coverVisible: undefined };
  if (preCheck.blocked) return -1;
  const coverVisible = preCheck.coverVisible;

  let segments: { ray: Ray }[] = [];
  let rayDistance, distance;
  let heightDifference = 0;
  if (!(t2.document instanceof WallDocument)) {
    for (let x = t1StartX; x < t1DocWidth; x++) {
      for (let y = t1StartY; y < t1DocHeight; y++) {
        if (y === t1StartY + 1) {
          if (x > t1StartX && x < t1DocWidth - t1StartX) {
            // skip to the last y position;
            y = t1DocHeight - t1StartY;
          }
        }
        const point1 = canvas.grid.getCenterPoint({ x: Math.round(t1.document.x + (canvas.dimensions.size * x)), y: Math.round(t1.document.y + (canvas.dimensions.size * y)) });
        const origin = new PIXI.Point(point1.x, point1.y);
        for (let x1 = t2StartX; x1 < t2DocWidth; x1++) {
          for (let y1 = t2StartY; y1 < t2DocHeight; y1++) {
            if (y1 === t2StartY + 1) {
              if (x1 > t2StartX && x1 < t2DocWidth - t2StartX) {
                // skip to the last y position;
                y1 = t2DocHeight - t2StartY;
              }
            }
            const point2 = canvas.grid.getCenterPoint({ x: Math.round(t2.document.x + (canvas.dimensions.size * x1)), y: Math.round(t2.document.y + (canvas.dimensions.size * y1)) });
            const dest = new PIXI.Point(point2.x, point2.y);
            const r = new foundry.canvas.geometry.Ray(origin, dest);
            if (wallsBlock) {
              const collision = checkWallCollision(origin, dest, {
                source: t1.document,
                wallsBlockRange: configSettings.optionalRules.wallsBlockRange,
                coverVisible,
                originElevation: t1Elevation,
                destElevation: t2Elevation,
                originTopElevation: t1TopElevation,
                destTopElevation: t2TopElevation
              });
              if (collision) continue;
            }
            segments.push({ ray: r });
          }
        }
      }
    }
    if (segments.length === 0) {
      return -1;
    }
    rayDistance = segments.map(ray => midiMeasureDistances([ray], { gridSpaces: true }));
    distance = Math.min(...rayDistance);
    if (includeElevation) {
      heightDifference = computeTokenHeightDifference(t1 as Token, t2 as Token);
    }
  } else {
    const w = t2.document
    const closestPoint = foundry.utils.closestPointToSegment(t1.center, w.object.edge.a, w.object.edge.b);
    distance = midiMeasureDistances([{ ray: new foundry.canvas.geometry.Ray(t1.center, closestPoint) }], { gridSpaces: true });
    if (includeElevation) {
      if (!w.flags?.["wall-height"]) heightDifference = 0;
      else {
        const wh = w.flags?.["wall-height"]
        if (wh.top === null && wh.bottom === null) heightDifference = 0;
        else if (wh.top === null) heightDifference = Math.max(0, wh.bottom - t1Elevation);
        else if (wh.bottom === null) heightDifference = Math.max(0, t1Elevation - wh.top);
        else heightDifference = Math.max(0, wh.bottom - t1TopElevation, t1Elevation - wh.top);
      }
    }
  }
  if (includeElevation) {
    distance = combineDistanceWithHeight(distance, heightDifference);
  }
  return Math.max(distance, 0);
}

let pointWarn = foundry.utils.debounce(() => {
  ui.notifications?.warn("4 Point LOS check selected but dnd5e-helpers not installed")
}, 100)

export function checkActivityRange(activityIn: Activity, tokenRef: TokenOrDocument | string | undefined, targetsRef: Set<TokenOrDocument | string> | undefined, showWarning: boolean = true): { result: string, attackingToken?: Token.Implementation, range?: number | undefined, longRange?: number | undefined } {
  if (!canvas || !canvas.scene) return { result: "normal" };
  const checkRangeFunction = (activity: Activity, token: Token.Implementation, targets: Set<Token.Implementation>): { result: string, reason?: string, range?: number | undefined, longRange?: number | undefined } => {
    if (!canvas || !canvas.scene) return {
      result: "normal",
    }
    // check that a range is specified at all
    if (!activity.range) return {
      result: "normal",
    };

    if (!token) {
      if (debugEnabled > 0) warn(`checkRange | ${game.user?.name} no token selected cannot check range`)
      return {
        result: "fail",
        reason: `${game.user?.name} no token selected`,
      }
    }

    let actor = token.actor;
    // look at undefined versus !
    // Note: currently dnd5e can set value to an empty string instead of a number
    if (!(activity.range.value || activity.range.reach) && !activity.range.long && activity.range.units !== "touch") return {
      result: "normal",
      reason: "no range specified"
    };
    if (activity.target?.affects.type === "self") return {
      result: "normal",
      reason: "self attack",
      range: 0
    };
    // skip non mwak/rwak/rsak/msak types that do not specify a target type
    if (!allAttackTypes.includes(activity.actionType) && !["creature", "ally", "enemy"].includes(activity.target?.affects.type)) return {
      result: "normal",
      reason: "not an attack"
    };

    const attackType = activity.actionType;
    let range = ((activity.range?.value || activity.range?.reach) ?? 0);
    let longRange = (activity.range?.long ?? 0);
    if (activity.actor?.system) { // TODO revisit when/if flags move to activities
      let conditionData;
      let rangeBonus = activity.actor?.flags?.[MODULE_ID]?.range?.[attackType] ?? "0"
      rangeBonus = rangeBonus + " + " + (activity.actor?.flags?.[MODULE_ID]?.range?.all ?? "0");
      if (rangeBonus !== "0 + 0") {
        conditionData = createConditionData({ item: activity.item, activity, actor: activity.actor, target: token })
        const bonusValue = evalCondition(rangeBonus, conditionData, { errorReturn: 0, async: false });
        range = Math.max(0, range + bonusValue);
      };
      let longRangeBonus: string = activity.actor?.flags?.[MODULE_ID]?.long?.[attackType] ?? "0"
      longRangeBonus = longRangeBonus + " + " + (activity.actor?.flags?.[MODULE_ID]?.long?.all ?? "0");
      if (longRangeBonus !== "0 + 0") {
        if (!conditionData)
          conditionData = createConditionData({ item: activity.item, actor: activity.actor, activity, target: token })
        const bonusValue = evalCondition(longRangeBonus, conditionData, { errorReturn: 0, async: false });
        longRange = Math.max(0, longRange + bonusValue);
      };
    }
    if (longRange > 0 && longRange < range) longRange = range;
    if (activity.range?.units) {
      switch (activity.range.units) {
        case "mi": // miles - assume grid units are feet or miles - ignore furlongs/chains whatever
          if (["feet", "ft"].includes(canvas.scene?.grid.units?.toLocaleLowerCase())) {
            range *= 5280;
            longRange *= 5280;
          } else if (["yards", "yd", "yds"].includes(canvas.scene?.grid.units?.toLocaleLowerCase())) {
            range *= 1760;
            longRange *= 1760;
          }
          break;
        case "km": // kilometers - assume grid units are meters or kilometers
          if (["meter", "m", "meters", "metre", "metres"].includes(canvas.scene?.grid.units?.toLocaleLowerCase())) {
            range *= 1000;
            longRange *= 1000;
          }
          break;
        // "none" "self" "ft" "m" "any" "spec" undefined
        default:
          break;
      }
    }
    if (range < longRange && activity.actionType === "rwak" &&
      (actor?.flags?.dnd5e?.sharpShooter || actor?.flags?.[MODULE_ID]?.sharpShooter)) {
      const conditionData = createConditionData({ item: activity.item, actor, activity, target: targets.first() });
      let sharpShooterEnabled = evalCondition(actor?.flags?.dnd5e?.sharpShooter, conditionData);
      sharpShooterEnabled ||= evalCondition(actor?.flags?.[MODULE_ID]?.sharpShooter, conditionData);
      if (sharpShooterEnabled) range = longRange;
    }

    if (activity.actionType === "rsak" && actor?.flags?.dnd5e?.spellSniper) {
      const conditionData = createConditionData({ item: activity.item, actor, activity, target: targets.first() });
      let enabled = evalCondition(actor.flags.dnd5e.spellSniper, conditionData);
      if (enabled) {
        range = 2 * range;
        longRange = 2 * longRange;
      }
    }
    if (activity.range.units === "touch") {
      range = canvas.dimensions?.distance ?? 5;
      // @ts-expect-error no dnd5e-types
      if (activity.item.system.range?.reach) range = activity.item.system.range.reach;
      longRange = 0;
    }

    const meleeActions = new Set(["mwak", "msak"]);
    const isMeleeAttack = meleeActions.has(activity.actionType);
    // @ts-expect-error no dnd5e-types
    const hasThrownProperty = activity.item.labels.properties?.some(p => p.abbr === "thr");

    if (isMeleeAttack && !hasThrownProperty) {
      longRange = 0;
    }

    const isMetric = game.settings.get("dnd5e", "metricLengthUnits") ?? false;

    for (let target of targets) {
      if (target === token) continue;
      // check if target is burrowing
      if (configSettings.optionalRules.wallsBlockRange !== 'none'
        && globalThis.MidiQOL.WallsBlockConditions.some(status => hasCondition(target.actor, status))) {
        return {
          result: "fail",
          reason: `${actor?.name}'s has one or more of ${globalThis.MidiQOL.WallsBlockConditions} so can't be targeted`,
          range,
          longRange
        }
      }
      // check the range TODO riview total cover flag and activity as part of midi properties
      const ignoreTotalCover = activity.midiProperties?.ignoreFullCover;

      const coverOptions = {
        wallsBlock: configSettings.optionalRules.wallsBlockRange !== "none" && !ignoreTotalCover,
        includeCover: !ignoreTotalCover,
      };

      const rawDistance = getDistance(token, target, coverOptions);

      // Wall blocking is indicated by rawDistance < 0, check it first before applying fudge factor
      if (rawDistance < 0) {
        log(`${target.name} has total cover`)
        return {
          result: "fail",
          reason: i18nFormat("midi-qol.TargetTotalCover", { name: actor?.name ?? "" }),
          range,
          longRange
        }
      }

      // Fudge factor is applied in getDistance - no additional adjustment needed here
      const distance = Math.max(0, parseFloat(rawDistance.toFixed(isMetric ? 1 : 0)));

      if ((longRange !== 0 && distance > longRange) || (distance > range && longRange === 0)) {
        log(`${target.name} is too far ${distance} from your character you cannot hit`)
        if (checkMechanic("checkRange") === "longdisadv" && ["rwak", "rsak"].includes(activity.actionType)) {
          return {
            result: "dis",
            reason: `${actor?.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`,
            range,
            longRange
          }
        } else {
          return {
            result: "fail",
            reason: `${actor?.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`,
            range,
            longRange
          }
        }
      }
      if (distance > range) return {
        result: "dis",
        reason: `${actor?.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`,
        range,
        longRange
      }
    }
    return {
      result: "normal",
      range,
      longRange
    }
  }

  const tokenIn = getToken(tokenRef);
  const targetsIn = targetsRef?.map(t => getToken(t)).filter(t => !!t);
  if (!tokenIn || !targetsIn) return { result: "fail", attackingToken: undefined };
  let attackingToken = tokenIn;
  if (!canvas || !canvas.tokens || !tokenIn || !targetsIn) return {
    result: "fail",
    attackingToken: tokenIn,
  }

  let canOverride = tokenIn.actor?.flags?.[MODULE_ID]?.rangeOverride?.attack?.all || tokenIn.actor?.flags?.[MODULE_ID]?.rangeOverride?.attack?.[activityIn.actionType];
  if (typeof canOverride === "string") {
    const tokenInActor = tokenIn.actor;
    const conditionData = createConditionData({ item: activityIn.item, activity: activityIn, actor: tokenInActor });
    canOverride = evalCondition(canOverride, conditionData)
  }

  const { result, reason, range, longRange } = checkRangeFunction(activityIn, attackingToken, targetsIn);
  if (!canOverride) { // no overrides so just do the check
    if (result === "fail" && reason) {
      if (showWarning) ui.notifications?.warn(reason);
    }
    return { result, attackingToken, range, longRange }
  }

  const ownedTokens = canvas.tokens.ownedTokens;
  // Initial Check
  // Now we loop through all owned tokens
  let possibleAttackers = ownedTokens.filter(t => {
    let canOverride = t.actor?.flags?.[MODULE_ID]?.rangeOverride?.attack?.all || t.actor?.flags?.[MODULE_ID]?.rangeOverride?.attack?.[activityIn.actionType];
    if (typeof canOverride === "string") {
      const tActor = t.actor;
      const conditionData = createConditionData({ item: activityIn.item, activity: activityIn, actor: tActor });
      canOverride = evalCondition(canOverride, conditionData)
    }
    return canOverride;
  });

  const successToken = possibleAttackers.find(attacker => checkRangeFunction(activityIn, attacker, targetsIn).result === "normal");
  if (successToken) return { result: "normal", attackingToken: successToken, range, longRange };
  // TODO come back and fix this: const disToken = possibleAttackers.find(attacker => checkRangeFunction(itemIn, attacker, targetsIn).result === "dis");
  return { result: "fail", attackingToken, range, longRange };
}

function getLevelsAutoCoverOptions() {
  const options: {
    tokensProvideCover: boolean;
    ignoreFriendly: boolean;
    // Is this typo present in the actual module?
    copsesProvideCover: boolean;
    tokenCoverAA: unknown;
    precision: unknown;
  } = {
    //@ts-expect-error
    tokensProvideCover: game.settings.get("levelsautocover", "tokensProvideCover"),
    //@ts-expect-error
    ignoreFriendly: game.settings.get("levelsautocover", "ignoreFriendly"),
    //@ts-expect-error
    copsesProvideCover: game.settings.get("levelsautocover", "copsesProvideCover"),
    //@ts-expect-error
    tokenCoverAA: game.settings.get("levelsautocover", "tokenCoverAA"),
    //@ts-expect-error
    precision: game.settings.get("levelsautocover", "coverRestriction")
  };
  return options;
}

export const TOTAL_COVER = Infinity;
// Initialized from CONFIG.DND5E.statusEffects in initCoverConstants(), fallback to dnd5e 2024 defaults
export let THREE_QUARTERS_COVER: number = 5;
export let HALF_COVER: number = 2;

/** Initialize cover constants from CONFIG.DND5E.statusEffects. Call after dnd5e init. */
export function initCoverConstants() {
  //@ts-expect-error CONFIG.DND5E not typed
  THREE_QUARTERS_COVER = CONFIG.DND5E?.statusEffects?.coverThreeQuarters?.coverBonus ?? 5;
  //@ts-expect-error CONFIG.DND5E not typed
  HALF_COVER = CONFIG.DND5E?.statusEffects?.coverHalf?.coverBonus ?? 2;
}

/** Check if an actor has any dnd5e cover status (coverHalf, coverThreeQuarters, or coverTotal). */
export function hasCoverStatus(actor: Actor | null | undefined): boolean {
  const statuses = actor?.statuses;
  return !!(statuses?.has("coverHalf") || statuses?.has("coverThreeQuarters") || statuses?.has("coverTotal"));
}

/**
 * The targets with total cover, which can't be targeted: with *Cover calculation* set, the Total Cover status, or a cover
 * module's total cover. None with *Ignore total cover*.
 */
export function totalCoverTargets(activity: Activity, token: TokenOrDocument | undefined, targets: Iterable<TokenOrDocument>): TokenOrDocument[] {
  const coverCalculation = configSettings.optionalRules.coverCalculation;
  if (!coverCalculation || coverCalculation === "none" || !token || activity.midiProperties?.ignoreFullCover) return [];
  const tokenDocument = getTokenDocument(token);
  return [...targets].filter(target => getTokenDocument(target) !== tokenDocument
    && (hasCoverTotal(getTokenDocument(target)?.actor)
      || (coverCalculation !== "dnd5eStatus" && computeCoverBonus(token, target, activity) === TOTAL_COVER)));
}

/** Warn about targets with total cover; false if there are any */
export function checkTotalCover(activity: Activity, token: TokenOrDocument | undefined, targets: Iterable<TokenOrDocument>): boolean {
  const covered = totalCoverTargets(activity, token, targets);
  if (!covered.length) return true;
  ui.notifications?.warn(i18nFormat("midi-qol.TargetsTotalCover", {
    name: activity.item?.name ?? "", targets: covered.map(target => getTokenPlayerName(target)).join(", ")
  }));
  return false;
}

/** Check if an actor has the coverTotal status (impossible to hit). */
export function hasCoverTotal(actor: Actor | null | undefined): boolean {
  return !!actor?.statuses?.has("coverTotal");
}

/**
 * Get the effective cover bonus for a target, from any source.
 * Returns the higher of the dnd5e status-based cover and the module-computed cover.
 */
export function getCoverBonus(attacker: TokenOrDocument, target: TokenOrDocument, activity?: Activity): number {
  const targetActor = target instanceof TokenDocument ? target.actor : (target as Token)?.actor;
  if (hasCoverTotal(targetActor)) return TOTAL_COVER;
  //@ts-expect-error no dnd5e-types
  const statusCoverBonus: number = targetActor?.system?.attributes?.ac?.cover ?? 0;
  const moduleCoverBonus = computeCoverBonus(attacker, target, activity);
  return Math.max(statusCoverBonus, moduleCoverBonus);
}

/**
 * Returns the raw cover bonus from the configured cover module.
 * Does NOT check cover statuses, apply attack-specific reductions (sharpshooter, etc.),
 * or reconcile with status-based cover.
 */
export function computeCoverBonus(attackerIn: TokenOrDocument, targetIn: TokenOrDocument, activity?: Activity): number {
  const attacker = attackerIn instanceof TokenDocument ? attackerIn.object : attackerIn;
  const target = targetIn instanceof TokenDocument ? targetIn.object : targetIn;
  if (activity instanceof Item) {
    const item = activity;
    activity = undefined;
    foundry.utils.logCompatibilityWarning("computeCoverBonus(attacker, target, item) is deprecated in favor of computeCoverBonus(attacker, target, activity)");
  }
  if (!attacker || !target) return 0;

  let coverBonus = 0;
  try {
    switch (configSettings.optionalRules.coverCalculation) {
      case "levelsautocover":
        //@ts-expect-error
        if (!installedModules.get("levelsautocover") || !game.settings.get("levelsautocover", "apiMode") || !AutoCover) return 0;
        //@ts-expect-error
        const coverData = AutoCover.calculateCover(attacker, target);
        //@ts-expect-error
        const coverDetail = AutoCover.getCoverData();
        if (coverData.rawCover === 0) coverBonus = TOTAL_COVER;
        else if (coverData.rawCover > coverDetail[1].percent) coverBonus = 0;
        else if (coverData.rawCover < coverDetail[0].percent) coverBonus = THREE_QUARTERS_COVER;
        else if (coverData.rawCover < coverDetail[1].percent) coverBonus = HALF_COVER;
        if (coverData.obstructingToken) coverBonus = Math.max(2, coverBonus);
        break;

      case "simbuls-cover-calculator":
        if (!installedModules.get("simbuls-cover-calculator")) return 0;
        if (globalThis.CoverCalculator) {
          const coverData = globalThis.CoverCalculator.Cover(attacker, target);
          if (attacker === target) {
            coverBonus = 0;
            break;
          }
          if (coverData?.data?.results.cover === 3) coverBonus = TOTAL_COVER;
          else coverBonus = -coverData?.data?.results.value || 0;
        }
        break;
        
      case "simplecover5e":
        //@ts-expect-error
        const simpleCoverApi = game.modules.get("simplecover5e")?.api;
        if (!installedModules.get("simplecover5e") || !simpleCoverApi) return 0;
          // simplecover5e caps at 3/4 cover from occluders — check LOS first via wallsBlockRange
          if (attacker !== target && configSettings.optionalRules.wallsBlockRange !== "none") {
            const preCheck = computeWallBlockPreCheck(attacker as Token.Implementation, target as Token.Implementation, true, true);
            if (preCheck.blocked) {
              coverBonus = TOTAL_COVER;
              break;
            }
          }
          const coverOptions: any = {
            attacker,
            target,
            scene: attacker.scene,
            losCheck: true
          };
          if (activity) coverOptions.activity = activity;
          const coverResult = simpleCoverApi.getCover(coverOptions);
          if (!coverResult || coverResult.bonus == null) return TOTAL_COVER;
          coverBonus = coverResult.bonus;
        break;

      case "tokencover":
        if (!installedModules.get("tokencover")) coverBonus = 0;
        else {
          const coverValue = calcTokenCover(attacker, target);
          if (coverValue === 4 || coverValue === 3) coverBonus = TOTAL_COVER;
          else if (coverValue === 2) coverBonus = THREE_QUARTERS_COVER;
          else if (coverValue === 1) coverBonus = HALF_COVER;
          else coverBonus = 0;
        }
        break;
      case "none":
      default:
        coverBonus = 0;
        break;
    }
    return coverBonus;
  } catch (err) {
    const message = "Error in computeCoverBonus";
    error(message, err);
    TroubleShooter.recordError(err, message)
    return 0;
  }
}

/**
 * Result of computing the effective AC for a target in an attack.
 */
export interface TargetACResult {
  effectiveAC: number;          // Final AC to compare against attack roll
  baseAC: number;               // ac.value minus status cover
  statusCoverBonus: number;     // From dnd5e cover status (already baked into ac.value)
  moduleCoverBonus: number;     // Raw value from cover module
  appliedCoverDelta: number;    // Extra cover added beyond status (module - status, if positive)
  effectiveCoverBonus: number;  // Total effective cover after reductions (0 if ignored)
  coverIgnored: boolean;        // Whether cover was stripped by a feat/flag
  flankingMod: number;          // Flanking reduction
  targetACMod: number;          // From targetDescriptors
}

/**
 * Compute the effective AC for a target, reconciling status-based cover with module-computed
 * cover (status acts as minimum), applying attack-specific reductions (ignoreFullCover,
 * sharpShooter, spellSniper, ignoreCover), and incorporating flanking and targetACMod.
 */
export function computeTargetAC(
  attacker: Token,
  target: Token,
  activity: Activity | undefined,
  options: {
    ignoreCover?: boolean;
    flankingMod?: number;
    targetACMod?: number;
  } = {}
): TargetACResult {
  const targetActor = target.actor;
  const item = activity?.item;
  const { ignoreCover = false, flankingMod = 0, targetACMod = 0 } = options;

  //@ts-expect-error no dnd5e-types
  const acValue: number = targetActor?.system?.attributes?.ac?.value ?? 10;
  //@ts-expect-error no dnd5e-types
  let statusCoverBonus: number = targetActor?.system?.attributes?.ac?.cover ?? 0;
  const baseAC = acValue - statusCoverBonus;

  // TOTAL_COVER not set by dnd5e for tokens with total cover
  if (hasCoverTotal(targetActor)) statusCoverBonus = TOTAL_COVER;

  // Get raw module cover
  const moduleCoverBonus = computeCoverBonus(attacker, target, activity);

  // Effective cover is the higher of status vs module
  let effectiveCoverBonus = Math.max(statusCoverBonus, moduleCoverBonus);
  // Delta is what we need to ADD beyond what dnd5e already baked into ac.value
  let appliedCoverDelta = Math.max(moduleCoverBonus - statusCoverBonus, 0);

  // --- Attack-specific reductions ---

  // ignoreFullCover (midi property on activity)
  if (activity?.midiProperties?.ignoreFullCover) {
    //@ts-expect-error item.type includes dnd5e subtypes
    if (item?.type === "spell") {
      // Spells with ignoreFullCover: ignore all cover
      effectiveCoverBonus = 0;
      appliedCoverDelta = 0;
    } else if (effectiveCoverBonus === TOTAL_COVER) {
      // Non-spells: downgrade total cover to three-quarters
      effectiveCoverBonus = THREE_QUARTERS_COVER;
      appliedCoverDelta = Math.max(THREE_QUARTERS_COVER - statusCoverBonus, 0);
    }
  }

  // Sharpshooter (rwak only, not total cover)
  //@ts-expect-error no dnd5e-types
  if ((activity?.actionType ?? item?.system?.actionType) === "rwak"
    && attacker.actor
    && effectiveCoverBonus !== TOTAL_COVER && effectiveCoverBonus !== 0
    && (attacker.actor.flags?.[MODULE_ID]?.sharpShooter || attacker.actor.flags?.dnd5e?.sharpShooter)) {
    const conditionData = createConditionData({ item, actor: attacker.actor, activity, target });
    let enabled = evalCondition(attacker.actor.flags?.dnd5e?.sharpShooter, conditionData);
    enabled ||= evalCondition(attacker.actor.flags?.[MODULE_ID]?.sharpShooter, conditionData);
    if (enabled) {
      effectiveCoverBonus = 0;
      appliedCoverDelta = 0;
    }
  }

  // Spell Sniper (rsak only, not total cover)
  //@ts-expect-error no dnd5e-types
  if (["rsak"].includes(activity?.actionType ?? item?.system?.actionType)
    && attacker.actor
    && attacker.actor.flags?.dnd5e?.spellSniper
    && effectiveCoverBonus !== TOTAL_COVER && effectiveCoverBonus !== 0) {
    const conditionData = createConditionData({ item, actor: attacker.actor, activity, target });
    const enabled: boolean | undefined = evalCondition(attacker.actor.flags.dnd5e.spellSniper, conditionData);
    if (enabled) {
      effectiveCoverBonus = 0;
      appliedCoverDelta = 0;
    }
  }

  // ignoreCover flag (from midi flag evaluation in checkHits)
  let coverIgnored = false;
  if (ignoreCover && effectiveCoverBonus < TOTAL_COVER) {
    coverIgnored = true;
    effectiveCoverBonus = 0;
    appliedCoverDelta = 0;
  }

  // Final AC: start from ac.value (includes status cover except total covere),
  // add delta (module cover above status), subtract status if cover ignored,
  // add targetACMod, subtract flanking
  let effectiveAC = acValue + targetACMod;
  if (coverIgnored) {
    // Remove the status cover baked into ac.value
    effectiveAC -= statusCoverBonus;
  } else {
    // Add any module cover above the status
    effectiveAC += appliedCoverDelta;
  }
  effectiveAC -= flankingMod;

  // Total cover from module/status → auto-miss
  if (effectiveCoverBonus === TOTAL_COVER) effectiveAC = Infinity;

  const result = {
    effectiveAC,
    baseAC,
    statusCoverBonus,
    moduleCoverBonus,
    appliedCoverDelta,
    effectiveCoverBonus,
    coverIgnored,
    flankingMod,
    targetACMod
  };
  return result;
}
export type FastForwardRollType = "attack" | "damage" | "check" | "save" | "skill" | "tool";

export function isAutoFastForward(rollType: FastForwardRollType, { workflow, user }: { workflow?: Workflow, user?: User } = {}): boolean {
  if (rollType === "attack") {
    if (workflow?.rollOptions?.fastForwardAttack !== undefined) return workflow.rollOptions.fastForwardAttack;
    if (workflow?.workflowOptions?.autoFastAttack !== undefined) return workflow.workflowOptions.autoFastAttack;
    if (workflow?.workflowType === "DummyWorkflow") return !!workflow.rollOptions.fastForward;
  } else if (rollType === "damage") {
    if (workflow?.rollOptions?.fastForwardDamage !== undefined) return workflow.rollOptions.fastForwardDamage;
    if (workflow?.workflowOptions?.fastForwardDamage !== undefined) return workflow.workflowOptions.fastForwardDamage;
    if (workflow?.workflowType === "DummyWorkflow") return !!workflow.rollOptions.fastForwardDamage;
  }
  return (user ?? game.user)?.isGM ? configSettings.gmAutoFastForward.includes(rollType) : configSettings.autoFastForward.includes(rollType);
}

export function autoConsumeResource(workflow?: Workflow): string {
  if (workflow?.workflowOptions?.autoConsumeResource !== undefined) return workflow.workflowOptions.autoConsumeResource;
  return game.user?.isGM ? configSettings.gmConsumeResource : configSettings.consumeResource;
}

/**
 * Retrieve consumption deltas from a ChatMessage or a messageConfig object.
 * dnd5e 5.3+ stores consumption in system.deltas / data.system.deltas.
 * dnd5e 5.2.x stored consumption in flags.dnd5e.use.consumed / data.flags.dnd5e.use.consumed.
 */
export function getConsumptionData(source: any): any {
  if (!source) return undefined;
  // ChatMessage case
  if (source.system?.deltas != null) return source.system.deltas;
  if (typeof source.getFlag === "function") return source.getFlag("dnd5e", "use.consumed");
  // messageConfig case (plain object with .data passed to activity.consume())
  return source.data?.system?.deltas ?? source.data?.flags?.dnd5e?.use?.consumed;
}

export function getAutoRollDamage(workflow?: Workflow): string {
  if (workflow?.actor?.type === configSettings.averageDamage || configSettings.averageDamage === "all") return "onHit";
  if (workflow?.workflowOptions?.autoRollDamage) {
    const damageOptions = Object.keys(autoRollDamageOptions);
    if (damageOptions.includes(workflow.workflowOptions.autoRollDamage))
      return workflow.workflowOptions.autoRollDamage;
    console.warn(`midi-qol | getAutoRollDamage | could not find ${workflow.workflowOptions.autoRollDamage} workflowOptions.autoRollDamage must be ond of ${damageOptions} defaulting to "onHit"`)
    return "onHit";
  }
  return game.user?.isGM ? configSettings.gmAutoDamage : configSettings.autoRollDamage;
}

export function getAutoRollAttack(workflow?: Workflow): boolean {
  if (workflow?.systemCard) return false;
  if (workflow?.workflowOptions?.autoRollAttack !== undefined) {
    return workflow.workflowOptions.autoRollAttack;
  }

  return game.user?.isGM ? configSettings.gmAutoAttack : configSettings.autoRollAttack;
}

export function getRemoveAllButtons(activity?: Activity): boolean {
  if (activity) {
    const activitySetting = activity.midiProperties?.removeChatButtons;
    if (activitySetting && activitySetting !== "default") {
      return activitySetting === "everything";
    }
  }
  return game.user?.isGM ?
    configSettings.gmRemoveButtons === "everything" :
    configSettings.removeButtons === "everything";
}

export function getRemoveAttackButtons(activity?: Activity): boolean {
  if (activity) {
    const activitySetting = activity.midiProperties?.removeChatButtons;
    if (activitySetting) {
      if (["all", "attack", "everything"].includes(activitySetting)) return true;
      if (activitySetting !== "default") return false;
    }
  }
  return game.user?.isGM ?
    ["all", "attack", "everything"].includes(configSettings.gmRemoveButtons) :
    ["all", "attack", "everything"].includes(configSettings.removeButtons);
}
export function getRemoveDamageButtons(activity?: Activity): boolean {
  if (activity) {
    const activitySetting = activity.midiProperties?.removeChatButtons;
    if (activitySetting) {
      if (["all", "damage", "everything"].includes(activitySetting)) return true;
      if (activitySetting !== "default") return false;
    }
  }
  return game.user?.isGM ?
    ["all", "damage", "everything"].includes(configSettings.gmRemoveButtons) :
    ["all", "damage", "everything"].includes(configSettings.removeButtons);
}

export function getReactionSetting(player?: User.Implementation | null): string {
  if (!player) return "none";
  return player.isGM ? configSettings.gmDoReactions : configSettings.doReactions;
}

export function getTokenPlayerName(token: TokenOrDocument, checkGM: boolean = false) {
  if (game.user) return getTokenPlayerNameForUser(game.user, token, checkGM);
  return getTokenName(token);
}
export function getTokenPlayerNameForUser(user: User.Implementation, token: TokenOrDocument, checkGM: boolean = false) {
  if (!token) return game.user?.name;
  let name = getTokenName(token);
  if (checkGM && user?.isGM) return name;
  if (game.modules.get("anonymous")?.active) {
    // @ts-expect-error
    const api: any = game.modules.get("anonymous")?.api;
    if (api?.playersSeeName(token.actor)) return name;
    else return api?.getName(token.actor) as string;
  } else if (game.modules.get("hide-npc-names")?.active) {
    return getPlayerNPCNameHideNPCNAmes(token);
  }
  return name;
}

function getPlayerNPCNameHideNPCNAmes(token: TokenOrDocument) {
  const actorFlags: any = foundry.utils.getProperty(token.actor ?? {}, "flags.hide-npc-names");
  if (actorFlags?.nameHiddenOverride === true) return actorFlags.replacementNameOverride as string;
  if (actorFlags?.nameHiddenOverride === false) return getTokenName(token);
  /*
    hideHostile: "hideHostileNames",
    hideNeutral: "hideNeutralNames",
    hideFriendly: "hideFriendlyNames",
    hideSecret: "hideSecretNames",
    hostileNameReplacement: "hostileNameReplacement",
    neutralNameReplacement: "neutralNameReplacement",
    friendlyNameReplacement: "friendlyNameReplacement",
    secretNameReplacement: "secretNameReplacement",
    tokenHiddenSuffix: "tokenHiddenSuffix",
    hideParts: "hideParts",
    showOnActorDirectory: "showOnActorDirectory"
  */
  if (actorFlags === undefined) {
    let hideSetting: boolean;
    switch ((token instanceof TokenDocument ? token : token.document).disposition) {
      case CONST.TOKEN_DISPOSITIONS.FRIENDLY:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideFriendlyNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "friendlyNameReplacement") as string;
        break;
      case CONST.TOKEN_DISPOSITIONS.HOSTILE:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideHostileNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "hostileNameReplacement") as string;
        break;
      case CONST.TOKEN_DISPOSITIONS.SECRET:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideSecretNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "secretNameReplacement") as string;
        break;
      case CONST.TOKEN_DISPOSITIONS.NEUTRAL:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideNeutralNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "neutralNameReplacement") as string;
        break;
    }
  }
  return getTokenName(token)
}

export function getSpeaker(actor: Actor.Implementation) {
  const speaker = ChatMessage.getSpeaker({ actor });
  if (!configSettings.useTokenNames) return speaker;
  let token = actor.token;
  if (!token) token = actor.getActiveTokens(false, true)[0];
  if (token) speaker.alias = token.name;
  return speaker;
}

/** 
 * Find tokens nearby
 * @param {number|null} disposition. same(1), opposite(-1), neutral(0), ignore(null) token disposition
 * @param {Token} token The token to search around
 * @param {number} distance in game units to consider near
 * @param {options} canSee Require that the potential target can sense the token
 * @param {options} isSeen Require that the token can sense the potential target
 * @param {options} includeIcapacitated: boolean count incapacitated tokens
 */

function mapTokenString(disposition: string | number): number | null {
  if (typeof disposition === "number") return disposition
  if (disposition.toLocaleLowerCase().trim() === i18n("TOKEN.DISPOSITION.FRIENDLY")?.toLocaleLowerCase()) return 1;
  else if (disposition.toLocaleLowerCase().trim() === i18n("TOKEN.DISPOSITION.HOSTILE")?.toLocaleLowerCase()) return -1;
  else if (disposition.toLocaleLowerCase().trim() === i18n("TOKEN.DISPOSITION.NEUTRAL")?.toLocaleLowerCase()) return 0;
  else if (disposition.toLocaleLowerCase().trim() === i18n("TOKEN.DISPOSITION.SECRET")?.toLocaleLowerCase()) return -2;
  else if (disposition.toLocaleLowerCase().trim() === i18n("all")?.toLocaleLowerCase()) return null;
  const validStrings = ["TOKEN.DISPOSITION.FRIENDLY", "TOKEN.DISPOSITION.HOSTILE", "TOKEN.DISPOSITION.NEUTRAL", "TOKEN.DISPOSITION.SECRET", "all"].map(s => i18n(s))
  throw new Error(`Midi-qol | findNearby ${disposition} is invalid. Disposition must be one of "${validStrings}"`)
}

type FindNearbyOptions = {
  maxSize?: number,
  includeIncapacitated?: boolean,
  canSee?: boolean,
  isSeen?: boolean,
  includeToken?: boolean,
  relative?: boolean
}
export function findNearbyCount(
  disposition: number | string | null | Array<string | number>,
  token: Token.Implementation | string,
  distance: number,
  options: FindNearbyOptions = {
    includeIncapacitated: false,
    canSee: false,
    isSeen: false,
    includeToken: false,
    relative: true
  }): number {
  return findNearby(disposition, token, distance, options)?.length ?? 0;
}

/**
 * findNearby
 * @param {number} [disposition]          What disposition to match - one of CONST.TOKEN.DISPOSITIONS
 
 * @param {string} [disposition]          What disposition to match - one of (localize) Friendly, Neutral, Hostile, Secret, all
 * @param {null} [disposition]            Match any disposition
 * @param {Array<string>} [disposition]   Match any of the dispostion strings
 * @param {Array<number>} [disposition]   Match any of the disposition numbers
 * @param {Token} [token]                 The token to use for the search
 * @param {string} [token]                A token UUID
 * @param {number} [distance]             The distance from token that will match
 * @param {object} [options]
 * @param {number} [options.MaxSize]      Only match tokens whose width * length < MaxSize
 * @param {boolean} [includeIncapacitated]  Should incapacitated actors be include?
 * @param {boolean} [canSee]              Must the potential target be able to see the token?
 * @param {boolean} isSeen                Must the token token be able to see the potential target?
 * @param {boolean} [includeToken]        Include token in the return array?
 * @param {boolean} [relative]            If set, the specified disposition is compared with the token disposition. 
 *  A specified dispostion of HOSTILE and a token disposition of HOSTILE means find tokens whose disposition is FRIENDLY
 
*/

export function findNearby(
  disposition: number | string | null | Array<string | number>,
  tokenRef: Token.Implementation | string,
  distance: number,
  options: FindNearbyOptions = {
    includeIncapacitated: false,
    canSee: false,
    isSeen: false,
    includeToken: false,
    relative: true
  }
) {
  const token = getToken(tokenRef);
  if (!token) return [];
  if (!canvas || !canvas.scene) return [];
  try {
    if (!(token instanceof Token)) { throw new Error("find nearby token is not of type token or the token uuid is invalid") };
    let relative = options.relative ?? true;
    let targetDisposition: number[] | undefined;
    if (typeof disposition === "string") disposition = mapTokenString(disposition);
    if (disposition instanceof Array) {
      if (disposition.some(s => s === "all")) disposition = [-1, 0, 1];
      else disposition = disposition.map(s => mapTokenString(s) ?? 0);
      targetDisposition = disposition.map(i => typeof i === "number" && [-1, 0, 1].includes(i) && relative ? token.document.disposition * i : (Number.isNumeric(i) ? Number(i) : 0));
    } else if (typeof disposition === "number" && [-1, 0, 1].includes(disposition)) {
      targetDisposition = relative ? [token.document.disposition * disposition] : [disposition];
    } else targetDisposition = [CONST.TOKEN_DISPOSITIONS.HOSTILE, CONST.TOKEN_DISPOSITIONS.NEUTRAL, CONST.TOKEN_DISPOSITIONS.FRIENDLY];

    const canvasPlaceables = canvas.tokens?.placeables ?? [];
    let nearby = canvasPlaceables.filter(t => {
      const tActor = t.actor;
      const tDocument = t.document;
      if (!isValidTarget(t)) return false;
      if (options.maxSize && (tDocument.height ?? 1) * (tDocument.width ?? 1) > options.maxSize) return false;
      if (!options.includeIncapacitated && checkIncapacitated(tActor, debugEnabled > 0, false)) return false;
      let inRange = false;
      if (t.actor &&
        (t.id !== token.id || options?.includeToken) && // not the token
        (disposition === null || targetDisposition.includes(t.document.disposition))) {
        const tokenDistance = getDistance(t, token, { wallsBlock: true });
        inRange = 0 <= tokenDistance && tokenDistance <= distance
      } else return false; // wrong disposition
      if (inRange && options.canSee && !canSense(t, token)) return false; // Only do the canSee check if the token is inRange
      if (inRange && options.isSeen && !canSense(token, t)) return false;
      return inRange;
    });

    return nearby ?? [];
  } catch (err) {
    TroubleShooter.recordError(err, "findnearby error");
    error(err);
    return [];
  }
}

export function checkNearby(
  disposition: number | null | string,
  tokenRef: TokenOrDocument | string | undefined,
  distance: number,
  options: FindNearbyOptions = {
    includeIncapacitated: false,
    canSee: false,
    isSeen: false,
    includeToken: false,
    relative: true
  }
): boolean {
  const token = getToken(tokenRef);
  const tokenDisposition = token?.document.disposition;
  if (tokenDisposition === 0) options.relative = false;
  if (!token) return false;
  return findNearby(disposition, token, distance, options).length !== 0;
}

export function hasCondition(
  actorRef: Actor.Implementation | TokenOrDocument | string | undefined | null,
  condition: string
): 0 | 1 {
  let actor = getActor(actorRef);
  if (!actor) return 0;
  // @ts-expect-error no dnd5e-types
  if (!actor.system.traits || !actor.statuses) return 0;
  // @ts-expect-error no dnd5e-types
  if (actor.system.traits.ci?.value?.has(condition)) return 0;
  if (actor.statuses.has(condition)) return 1;
  const specials = CONFIG.specialStatusEffects;
  switch (condition?.toLocaleLowerCase()) {
    case "blind":
      if (actor.statuses.has(specials.BLIND)) return 1;
      break;
    case "burrow":
    case "burrowing":
      if (actor.statuses.has(specials.BURROW)) return 1;
      break;
    case "dead":
      if (actor.statuses.has(specials.DEFEATED)) return 1;
      break
    case "deaf":
      // @ts-expect-error no dnd5e-types
      if (actor.statuses.has(specials.DEAF)) return 1;
      break;
    case "disease":
    case "diseased":
      // @ts-expect-error no dnd5e-types
      if (actor.statuses.has(specials.DISEASE)) return 1;
      break;
    case "fly":
    case "flying":
      if (actor.statuses.has(specials.FLY)) return 1;
      break;
    case "hidden":
    case "hiding":
      if (actor.statuses.has("hidden") || actor.statuses.has("hiding")) return 1;
      break;
    case "inaudible":
    case "silent":
      // @ts-expect-error no dnd5e-types
      if (actor.statuses.has(specials.INAUDIBLE)) return 1;
      break;
    case "invisible":
      if (actor.statuses.has(specials.INVISIBLE)) return 1;
      break;
    case "poison":
    case "poisoned":
      // @ts-expect-error no dnd5e-types
      if (actor.statuses.has(specials.POISON)) return 1;
      break;
  }
  if (actor.statuses.has(condition.toLocaleLowerCase()) || actor.statuses.has(condition)) return 1;
  return 0;
}

export async function removeInvisible(this: Workflow) {
  if (!canvas || !canvas.scene) return;
  const token = this.attackingToken ?? (fromUuidSync(this.tokenUuid) as TokenDocument.Implementation | undefined);
  removeInvisibleCondition(token);
}

export async function removeInvisibleCondition(tokenRef?: TokenOrDocument | string) {
  const token = getToken(tokenRef);
  if (!token) return;

  await removeTokenConditionEffect(token, i18n(`midi-qol.invisible`) ?? "");

  const invisId = CONFIG.specialStatusEffects.INVISIBLE ?? "invisible";
  if (CONFIG.statusEffects.find(se => se.id === invisId)) {
    await (token.actor)?.toggleStatusEffect(invisId, { active: false })
  }
  if (debugEnabled > 0) log(`Invisibility removed for ${token.name}`)
}

export async function removeHidden(this: Workflow) {
  if (!canvas?.scene) return;
  const token = this.attackingToken ?? (fromUuidSync(this.tokenUuid) as TokenDocument.Implementation | undefined);
  if (!token) return;
  removeHiddenCondition(token);
}

export async function removeHiddenCondition(tokenRef?: TokenOrDocument | string) {
  const token = getToken(tokenRef);
  if (!token) return;
  if (!token.actor) return
  if (CONFIG.statusEffects.find(se => se.id === "hidden")) {
    await token.actor.toggleStatusEffect("hidden", { active: false });
  }
  if (CONFIG.statusEffects.find(se => se.id === "hiding")) {
    await token.actor.toggleStatusEffect("hiding", { active: false });
  }
  // Try and remove hidden if set by another active effect
  await removeTokenConditionEffect(token, i18n(`midi-qol.hidden`) ?? "");
  if (installedModules.get("perceptive")) {
    //@ts-expect-error
    const api: any = game.modules.get("perceptive")?.api;
    api?.PerceptiveFlags.setPerceptiveStealthing(token.document, false);
  }
  if (debugEnabled > 0) log(`Hidden removed for ${token.name}`)
}

export async function removeTokenConditionEffect(token: Token.Implementation, condition: string) {
  if (!token) return;
  const hasEffect = token.actor?.appliedEffects.find(ef => ef.name === condition);
  if (hasEffect) await expireEffects(token.actor!, [hasEffect], { "expiry-reason": `midi-qol:removeTokenCondition:${condition}` });
}

export async function expireMyEffects(this: Workflow, effectsToExpire: string[]) {
  // Concentration checks are automated system responses, not player actions — don't expire effects.
  if (this.item?.flags?.[MODULE_ID]?.isConcentrationCheck) return;
  const expireHit = effectsToExpire.includes("1Hit") && !this.effectsAlreadyExpired.includes("1Hit");
  const expireCritical = effectsToExpire.includes("1Critical") && !this.effectsAlreadyExpired.includes("1Critical");
  const expireFumble = effectsToExpire.includes("1Fumble") && !this.effectsAlreadyExpired.includes("1Fumble");
  let expireAnyAction = effectsToExpire.includes("1Action") && !this.effectsAlreadyExpired.includes("1Action");
  const expireBonusAction = (effectsToExpire.includes("1Action") || effectsToExpire.includes("Bonus Action")) && !this.effectsAlreadyExpired.includes("Bonus Action");
  const expireReaction = (effectsToExpire.includes("1Action") || effectsToExpire.includes("Reaction")) && !this.effectsAlreadyExpired.includes("Reaction");
  const expireTurnAction = (effectsToExpire.includes("1Action") || effectsToExpire.includes("Turn Action")) && !this.effectsAlreadyExpired.includes("Turn Action");
  const expireSpell = effectsToExpire.includes("1Spell") && !this.effectsAlreadyExpired.includes("1Spell");
  const expireAttack = effectsToExpire.includes("1Attack") && !this.effectsAlreadyExpired.includes("1Attack");
  const expireDamage = effectsToExpire.includes("DamageDealt") && !this.effectsAlreadyExpired.includes("DamageDealt");
  const expireInitiative = effectsToExpire.includes("Initiative") && !this.effectsAlreadyExpired.includes("Initiative");
  //
  expireAnyAction ||= expireBonusAction || expireReaction || expireTurnAction;
  if (expireAnyAction) effectsToExpire.push("1Action");
  // expire any effects on the actor that require it
  // if (debugEnabled && false) {
  //   const test = this.actor.effects.map(ef => {
  //     const specialDuration = foundry.utils.getProperty(ef.flags, "dae.specialDuration") as string[];
  //     return [(expireAnyAction && specialDuration?.includes("1Action")),
  //     (expireAttack && specialDuration?.includes("1Attack") && this.item?.hasAttack),
  //     (expireHit && this.item?.hasAttack && specialDuration?.includes("1Hit") && this.hitTargets.size > 0)]
  //   })
  //   if (debugEnabled > 1) debug("expiry map is ", test)
  // }

  let allEffects = getAppliedEffects(this.actor, { includeEnchantments: true });
  const myExpiredEffects = allEffects?.filter(ef => {
    const specialDuration = foundry.utils.getProperty(ef.flags, "dae.specialDuration") as string[];
    if (!specialDuration || !specialDuration?.length) return false;
    return (expireAnyAction && specialDuration.includes("1Action")) ||
      (expireBonusAction && specialDuration.includes("Bonus Action") && this.activity.activation.type === "bonus") ||
      (expireReaction && specialDuration.includes("Reaction") && this.activity.activation.type === "reaction") ||
      (expireTurnAction && specialDuration.includes("Turn Action") && this.activity.activation.type === "action") ||
      (expireAttack && this.activity?.hasAttack && specialDuration.includes("1Attack")) ||
      // @ts-expect-error no dnd5e-types
      (expireSpell && this.item?.type === "spell" && specialDuration.includes("1Spell")) ||
      (expireAttack && this.activity?.hasAttack && specialDuration.includes(`1Attack:${this.activity?.actionType}`)) ||
      (expireHit && this.activity?.hasAttack && specialDuration.includes("1Hit") && this.hitTargets.size > 0) ||
      (expireHit && this.activity?.hasAttack && specialDuration.includes(`1Hit:${this.activity?.actionType}`) && this.hitTargets.size > 0) ||
      (expireCritical && this.activity?.hasAttack && specialDuration.includes("1Critical") && this.isCritical) ||
      (expireFumble && this.activity?.hasAttack && specialDuration.includes("1Fumble") && this.isFumble) ||
      (expireDamage && this.activity?.hasDamage && specialDuration.includes("DamageDealt")) ||
      (expireInitiative && specialDuration.includes("Initiative"))
  });
  if (debugEnabled > 1) debug("expire my effects", myExpiredEffects, expireAnyAction, expireAttack, expireHit);
  this.effectsAlreadyExpired = this.effectsAlreadyExpired.concat(effectsToExpire);
  if (myExpiredEffects?.length > 0) await expireEffects(this.actor, myExpiredEffects, { "expiry-reason": `midi-qol:${effectsToExpire}` });
}

export async function expireRollEffect(this: Actor.Implementation, rolltype: string, abilityId: string, success?: boolean) {
  const rollType = rolltype.charAt(0).toUpperCase() + rolltype.slice(1)
  const expiredEffects = this.appliedEffects?.filter(ef => {
    const specialDuration = ef.flags?.dae?.specialDuration;
    if (!specialDuration) return false;
    if (specialDuration.includes(`is${rollType}`)) return true;
    if (specialDuration.includes(`is${rollType}.${abilityId}`)) return true;
    if (success === true && specialDuration.includes(`is${rollType}Success`)) return true;
    if (success === true && specialDuration.includes(`is${rollType}Success.${abilityId}`)) return true;
    if (success === false && specialDuration.includes(`is${rollType}Failure`)) return true;
    if (success === false && specialDuration.includes(`is${rollType}Failure.${abilityId}`)) return true;
    return false;
  }).map(ef => ef.uuid);
  if (expiredEffects?.length > 0) {
    await timedAwaitExecuteAsGM("removeEffectUuids", {
      actorUuid: this.uuid,
      effects: expiredEffects,
      options: { "expiry-reason": `midi:special-duration:${rollType}:${abilityId}` }
    });
  }
}

// This doesn't actually _need_ to be used anywhere as long as we're strict about things
export function validTargetTokens(tokenSet?: Set<TokenOrDocument>): Set<Token.Implementation> {
  if (!tokenSet) return new Set();
  return tokenSet
    .map(tk => tk instanceof TokenDocument ? tk.object! : tk)
    .filter(tk => !!tk?.actor && isValidTarget(tk));
}

export function fromActorUuid(uuid?: string): Actor.Implementation | null {
  let doc = fromUuidSync(uuid);
  if (doc instanceof Actor) return doc;
  if (doc instanceof TokenDocument) return doc.actor;
  return null;
}

export function actorFromUuid(uuid?: string): any {
  let doc = fromUuidSync(uuid);
  if (doc instanceof Actor) return doc;
  if (doc instanceof TokenDocument) return doc.actor;
  if (doc instanceof Item) return doc.parent;
  if (doc instanceof ActiveEffect) {
    if (doc.parent instanceof Actor) return doc.parent;
    if (doc.parent?.parent instanceof Actor) return doc.parent.parent;
  }
  return null;
}

// TODO: This
export class RollModifyDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  rollExpanded: boolean;
  timeRemaining: number;
  timeoutId: NodeJS.Timeout | undefined;
  secondTimeoutId: NodeJS.Timeout | undefined;
  aborted: boolean = false;

  data: {
    actor: Actor.Implementation,
    flags: string[],
    flagSelector: string,
    targetObject: any,
    // rollId: string,
    // rollTotalId: string,
    // rollHTMLId: string,
    title: string,
    content: HTMLElement | string,
    currentRoll: Roll,
    rollHTML: string,
    callback: () => {},
    close: () => {},
    buttons: any,
    rollMode: string | undefined,
    timeout: number,
    item: Item | undefined,
    flagOwners?: Record<string, any>
  }

  constructor(data) {
    super(data);
    this.data = data;
    this.timeRemaining = this.data.timeout;
    this.rollExpanded = false;
    if (!data.rollMode) data.rollMode = safeGetGameSetting("core", "rollMode");
    this.timeoutId = setTimeout(() => {
      if (this.secondTimeoutId) clearTimeout(this.secondTimeoutId);
      this.timeoutId = undefined;
      this.close();
    }, this.data.timeout * 1000);
    this.set1SecondTimeout();
  }

  static PARTS = {
    dialog: {
      id: "dialog-optional",
      classes: ["dialog", "midi-qol", "optional"],
      template: "modules/midi-qol/templates/dialog.hbs"
    }
  };

  static DEFAULT_OPTIONS = {
    window: {
      resizable: true
    },
    position: {
      height: "auto" as "auto",
      width: 400
    }
  };

  get title() {
    let maxPad = 1;
    if (this.data.timeout < maxPad) maxPad = this.data.timeout
    if (this.data.timeout) {
      const padCount = Math.ceil(this.timeRemaining / (this.data.timeout ?? defaultTimeout) * maxPad);
      const pad = "-".repeat(padCount);
      return `${this.data.title ?? "Dialog"} ${pad} ${this.timeRemaining}`;
    }
    else return this.data.title ?? "Dialog";
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const button of Array.from(this.element.querySelectorAll(".dialog-button"))) {
      button.addEventListener("click", this._onClickButton.bind(this));
    }
    // Michael note: I don't think this was doing anything?
    // document.addEventListener("keydown.chooseDefault", this._onKeyDown.bind(this));
    for (const diceRoll of Array.from(this.element.querySelectorAll<HTMLDivElement>(".dice-roll"))) {
      diceRoll.addEventListener("click", this._onDiceRollClick.bind(this));
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const flagOwners = this.data.flagOwners ?? {};
    const ownerOf = (flagName: string): any => flagOwners[flagName] ?? this.data.actor;
    this.data.flags = this.data.flags.filter(flagName => {
      const owner = ownerOf(flagName);
      if ((getOptionalCountRemaining(this.data.actor, `${flagName}.count`, owner)) < 1) return false;
      return foundry.utils.getProperty(owner, flagName) !== undefined
    });
    if (this.data.flags.length === 0) this.close();
    this.data.buttons = this.data.flags.reduce((obj, flag) => {
      const owner = ownerOf(flag);
      let flagData: any = foundry.utils.getProperty(owner ?? {}, flag) as any; // TODO This should be tightened up
      let value: string | undefined = foundry.utils.getProperty(flagData ?? {}, this.data.flagSelector) as string;
      // Skip object values — can happen if a flag key like "damage.save" gets an extra ".all"
      // appended by DAE deprecation logic, creating a nested object instead of a string
      if (typeof value === "object") value = undefined;
      let icon = "fas fa-dice-d20";
      if (value !== undefined) {
        let labelDetail;
        if (typeof value === "string") {
          labelDetail = Roll.replaceFormulaData(value, this.data.actor.getRollData() as Record<string, unknown>);
          if (value.startsWith("ItemMacro")) {
            icon = CONFIG.Macro.sidebarIcon;
            if (value === "ItemMacro")
              labelDetail = this.data.item?.name ?? "Macro";
            else {
              const uuid = value.split(".").slice(1).join(".");
              const item = fromUuidSync(uuid);
              if (item)
                labelDetail = item.name;
              else
                labelDetail = uuid;
            }
          }
          else if (value.startsWith("function")) {
            icon = CONFIG.Macro.sidebarIcon;
            labelDetail = value.split(".").slice(-1);
          } else if (value.startsWith("Macro")) {
            icon = CONFIG.Macro.sidebarIcon;
            labelDetail = value.split(".").slice(1).join(".");
          }
        } else labelDetail = `${value}`
        obj[foundry.utils.randomID()] = {
          icon: `<i class="${icon}"></i>`,
          //          label: (flagData.label ?? "Bonus") + `  (${foundry.utils.getProperty(flagData, this.data.flagSelector) ?? "0"})`,
          label: (flagData?.label ?? "Bonus") + ` (${labelDetail})`,
          value: `${value}`,
          key: flag,
          callback: this.data.callback
        }
      }
      let selector = this.data.flagSelector.split(".");
      if (selector[selector.length - 1] !== "all") {
        selector[selector.length - 1] = "all";
        const allSelector = selector.join(".");
        value = foundry.utils.getProperty(flagData ?? {}, allSelector) as string | undefined;
        if (typeof value === "object") value = undefined;
        if (value !== undefined) {
          if (typeof value !== "string") value = `${value}`
          let labelDetail = Roll.replaceFormulaData(value, this.data.actor.getRollData() as Record<string, unknown>);
          if (value.startsWith("ItemMacro")) {
            icon = CONFIG.Macro.sidebarIcon;
            if (value === "ItemMacro")
              labelDetail = this.data.item?.name ?? "Macro";
            else {
              const uuid = value.split(".").slice(1).join(".");
              const item = fromUuidSync(uuid) as Item.Implementation | undefined;
              if (item)
                labelDetail = item.name;
              else
                labelDetail = uuid;
            }
          } else if (value.startsWith("function")) {
            icon = CONFIG.Macro.sidebarIcon;
            labelDetail = value.split(".").slice(-1).join(".");
          } else if (value.startsWith("Macro")) {
            icon = CONFIG.Macro.sidebarIcon;
            labelDetail = value.split(".").slice(1).join(".");
          } else labelDetail = value;
          // check force condition. if true call the callback and return obj

          obj[foundry.utils.randomID()] = {
            icon: `<i class="${icon}"></i>`,
            //          label: (flagData.label ?? "Bonus") + `  (${foundry.utils.getProperty(flagData, allSelector) ?? "0"})`,
            label: (flagData?.label ?? "Bonus") + (debugEnabled > 0 ? `: ${labelDetail}` : ""),
            value,
            key: flag,
            callback: this.data.callback
          }
        }
      }
      return obj;
    }, {})
    this.data.buttons.no = {
      icon: '<i class="fas fa-xmark"></i>',
      label: i18n("Cancel"),
      callback: () => {
        this.data.flags = [];
        this.close();
      }
    }

    // this.data.content = await midiRenderRoll(this.data.currentRoll);
    // this.data.content = await this.data.currentRoll.render();
    return {
      ...context,
      content: this.data.content, // This is set by the callback
      buttons: this.data.buttons
    }
  }

  set1SecondTimeout() {
    this.secondTimeoutId = setTimeout(() => {
      clearTimeout(this.secondTimeoutId)
      if (!this.timeoutId) return;
      this.timeRemaining -= 1;
      let color = "red";
      if (this.timeRemaining >= this.data.timeout * 0.75) color = "chartreuse";
      else if (this.timeRemaining >= this.data.timeout * 0.50) color = "yellow";
      else if (this.timeRemaining >= this.data.timeout * 0.25) color = "orange";
      this._updateFrame({ window: { title: this.title } });
      const title = this.element?.querySelector(".window-title");
      if (title) title.setAttribute("style", `color: ${color}`);
      if (this.timeRemaining > 0 && title) this.set1SecondTimeout();
    }, 1000)
  }

  _onDiceRollClick(event: Event) {
    event.preventDefault();
    // Toggle the message flag
    let roll = event.currentTarget as HTMLDivElement;
    this.rollExpanded = !this.rollExpanded

    // Expand or collapse tooltips
    roll?.querySelectorAll(".dice-tooltip")?.forEach(tip => {
      tip.classList.toggle("expanded", this.rollExpanded);
    });
  }

  _onClickButton(event: Event) {
    if (this.secondTimeoutId) {
      clearTimeout(this.secondTimeoutId);
      this.secondTimeoutId = undefined;
    }
    // @ts-expect-error I know better
    const id = event.currentTarget!.dataset?.button;
    const button = this.data.buttons[id];
    this.submit(button);
  }

  // _onKeyDown(event: KeyboardEvent) {
  //   // Close dialog
  //   if (event.key === "Escape" || event.key === "Enter") {
  //     event.preventDefault();
  //     event.stopPropagation();
  //     this.close();
  //   }
  // }

  async submit(button) {
    if (this.secondTimeoutId) {
      clearTimeout(this.secondTimeoutId);
    }
    try {
      if (button.callback) {
        await button.callback(this, button);
        // await this.getData({}; Render will do a get data, doing it twice breaks the button data?

        if (this.secondTimeoutId) {
          clearTimeout(this.secondTimeoutId);
          this.secondTimeoutId = undefined;
        }
        // this.render({force: true});
      }
      // this.close();
    } catch (err) {
      const message = "midi-qol | Optional flag roll error see console for details ";
      ui.notifications?.error(message);
      TroubleShooter.recordError(err, message);
      error(err);
    }
  }

  async close() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
    if (this.secondTimeoutId) clearTimeout(this.secondTimeoutId);
    this.secondTimeoutId = undefined;
    if (this.data.close) this.data.close();
    $(document).off('keydown.chooseDefault');
    return super.close();
  }
}

async function displayBeforeAfterRolls(data: {
  originalRoll: Roll,
  newRoll: Roll,
  rollMode: string,
  title: string,
  player: User.Implementation | undefined,
  options: any,
  actor: Actor.Implementation
}) {
  let { originalRoll, newRoll, rollMode, title, player, options, actor } = data;
  options ??= {};  //TODO match the renderRoll to the roll type
  options.messageData ??= {};
  const newRollHTML = await midiRenderRoll(newRoll);
  const originalRollHTML = await midiRenderRoll(originalRoll);
  const chatData: any = foundry.utils.mergeObject(options.messageData ?? {}, {
    flavor: `${title}`,
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    content: `${originalRollHTML}<br>${newRollHTML}`,
    whisper: [player?.id ?? ""],
    rolls: [originalRoll, newRoll],
    sound: CONFIG.sounds.dice,
  }, { inplace: false });
  // @ts-expect-error
  if (originalRoll.options.rollMode) ChatMessage.applyRollMode(chatData, originalRoll.options.rollMode);
  else ChatMessage.applyRollMode(chatData, rollMode as ChatMessage.PassableRollMode);
  foundry.utils.setProperty(newRoll, `flags.${MODULE_ID}.chatMessageShown`, true);
  return await ChatMessage.create(chatData);
}

export async function bonusDialog(
  bonusFlags: string[],
  flagSelector: string,
  showRoll: boolean,
  title: string,
  roll: Roll | undefined,
  rollType: string,
  options: any = {}
): Promise<Roll | undefined> {
  const showDiceSoNice = !options.hideDSN && dice3dEnabled();
  let timeoutId: NodeJS.Timeout | undefined;
  if (!roll) return undefined;
  let newRoll = roll;
  let originalRoll = roll;
  let rollHTML = await midiRenderRoll(roll);
  const player = playerForActor(this.actor);
  // Map full flag path -> owning document (item enchantment) for flags whose data
  // does not live on the actor. Defaults to actor when not present in the map.
  const flagOwners: Record<string, any> = options.flagOwners ?? {};
  const ownerOf = (flagName: string): any => flagOwners[flagName] ?? this.actor;

  const callback = async (dialog, button) => {
    if (this.secondTimeoutId) {
      clearTimeout(this.secondTimeoutId);
    }

    let reRoll: Roll | undefined;
    let chatMessage: ChatMessage.Implementation | undefined;
    const undoId = foundry.utils.randomID();
    const undoData = {
      id: undoId,
      userId: player?.id ?? "",
      userName: player?.name ?? "Gamemaster",
      itemName: button.label,
      itemUuid: "",
      actorUuid: this.actor.uuid,
      actorName: this.actor.name,
      isReaction: true
    }
    await unTimedExecuteAsGM("queueUndoDataDirect", undoData)

    const buttonOwner = ownerOf(button.key);
    // const rollMode = foundry.utils.getProperty(buttonOwner ?? {}, button.key)?.rollMode ?? safeGetGameSetting("core", "rollMode");
    // @ts-expect-error no dnd5e-types
    let rollMode = roll.options.rollMode;
    rollMode = (foundry.utils.getProperty(buttonOwner ?? {}, button.key) as any)?.rollMode ?? rollMode ?? safeGetGameSetting("core", "rollMode");
    if (!hasEffectGranting(this.actor, button.key, flagSelector, buttonOwner)) return;
    let resultApplied = false; // This is just for macro calls
    let macroToCall: string = "";
    const allFlagSelector = flagSelector.split(".").slice(0, -1).join(".") + ".all";
    let specificMacro = false;
    const possibleMacro = foundry.utils.getProperty(buttonOwner ?? {}, `${button.key}.${flagSelector}`) ||
      foundry.utils.getProperty(buttonOwner ?? {}, `${button.key}.${allFlagSelector}`);
    if (possibleMacro && typeof button.value === "string" && (button.value.trim().startsWith("ItemMacro") || button.value.trim().startsWith("Macro") || button.value.trim().startsWith("function"))) {
      macroToCall = button.value;
      if (macroToCall.startsWith("Macro.")) macroToCall = macroToCall.replace("Macro.", "");
      specificMacro = true;
    } else if ((foundry.utils.getProperty(buttonOwner ?? {}, `${button.key}.macroToCall`) as string)?.trim()) {
      macroToCall = (foundry.utils.getProperty(buttonOwner ?? {}, `${button.key}.macroToCall`) as string)?.trim();
    }
    if (macroToCall) {
      let result: any;
      let workflow: Workflow;
      if (this instanceof Workflow) {
        workflow = this;
      } else {
        const itemUuidOrName = macroToCall.split(".").slice(1).join(".");
        let item = fromUuidSync(itemUuidOrName);
        if (!item && this.actor) item = this.actor.items.getName(itemUuidOrName);
        if (!item && this instanceof Actor) item = this.items.getName(itemUuidOrName);
        workflow = new DummyWorkflow(this.actor ?? this, {}, ChatMessage.getSpeaker({ actor: this.actor }), [], { item });
      }
      const macroData = workflow.getMacroData();
      macroData.macroPass = `${button.key}.${flagSelector}`;
      macroData.workflow = workflow;
      macroData.tag = "optional";
      macroData.roll = roll;

      result = await workflow.callMacro(workflow?.item, macroToCall, macroData, { roll, bonus: (!specificMacro ? button.value : undefined) });
      if (typeof result === "string")
        button.value = result;
      else if (typeof result === "number")
        button.value = `${result}`;
      else if (result instanceof Roll) {
        newRoll = result;
        resultApplied = true;
      }
      if (result === undefined && debugEnabled > 0) warn(`bonusDialog | macro ${button.value} return undefined`)
    }

    // do the roll modifications
    if (!resultApplied) switch (button.value) {
      case "reroll": reRoll = await roll!.reroll();
        if (showDiceSoNice) await displayDSNForRoll(reRoll, rollType, rollMode, undefined, this.actor);
        newRoll = reRoll; break;
      case "reroll-query":
        reRoll = reRoll = await roll!.reroll();
        if (showDiceSoNice) await displayDSNForRoll(reRoll, rollType, rollMode, undefined, this.actor);
        const newRollHTML = await midiRenderRoll(reRoll);
        if (await DialogV2.confirm({ window: { title: "Confirm reroll" }, content: `Replace ${rollHTML} with ${newRollHTML}`, defaultYes: true }))
          newRoll = reRoll
        else
          newRoll = roll!;
        break;
      case "reroll-kh": reRoll = await roll!.reroll();
        if (showDiceSoNice) await displayDSNForRoll(reRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode, undefined, this.actor);
        newRoll = reRoll;
        if (reRoll.total! <= (roll!.total ?? 0)) newRoll = roll!;
        break;
      case "reroll-kl": reRoll = await roll!.reroll();
        newRoll = reRoll;
        if (reRoll.total! > (roll!.total ?? 0)) newRoll = roll!;
        if (showDiceSoNice) await displayDSNForRoll(reRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode, undefined, this.actor);
        break;
      case "reroll-max": newRoll = await roll!.reroll({ maximize: true });
        if (showDiceSoNice) await displayDSNForRoll(newRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode, undefined, this.actor);
        break;
      case "reroll-min": newRoll = await roll!.reroll({ minimize: true });
        if (showDiceSoNice) await displayDSNForRoll(newRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode, undefined, this.actor);
        break;

      case "success":
        newRoll = newRoll = await roll!.clone().evaluate();
        //@ts-expect-error
        newRoll.terms[0].results.forEach(res => res.result = 99);
        //@ts-expect-error
        newRoll._total = 99;
        foundry.utils.setProperty(newRoll, "options", foundry.utils.duplicate(roll!.options))
        foundry.utils.setProperty(newRoll, "options.success", true);
        break;
      case "fail":
        newRoll = newRoll = await roll!.clone().evaluate();
        foundry.utils.setProperty(newRoll, "options", foundry.utils.duplicate(roll!.options))
        foundry.utils.setProperty(newRoll, "options.success", false);
        //@ts-expect-error
        newRoll.terms[0].results.forEach(res => res.result = -1);
        //@ts-expect-error
        newRoll._total = -1;
        break;
      case "critical":
        foundry.utils.setProperty(newRoll, "options", foundry.utils.duplicate(roll!.options));
        //@ts-expect-error
        if (newRoll.options.rollType === "damage") {
          foundry.utils.setProperty(newRoll, "options.isCritical", true);
          foundry.utils.setProperty(newRoll, "options.configured", false);
          newRoll = await newRoll.reroll();
        } else {
          const term = newRoll.terms[0] as foundry.dice.terms.Die;
          const result = term?.results?.find(r => r.active)?.result ?? newRoll.total;
          foundry.utils.setProperty(term, "options.critical", result);
          foundry.utils.setProperty(term, "options.criticalSuccess", result);
          foundry.utils.setProperty(newRoll, "options.criticalSuccess", result);
        }
        if (this instanceof Workflow) this.tracker.critical.force(`${button.key}.${flagSelector}`, "Optional bonus");
        break;
      default:
        if (typeof button.value === "string" && button.value.startsWith("replace ")) {
          const rollParts = button.value.split(" ");
          newRoll = new Roll(rollParts.slice(1).join(" "), { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll!.data });
          newRoll = await newRoll.evaluate();
          if (showDiceSoNice) await displayDSNForRoll(newRoll, rollType, rollMode, undefined, this.actor);
        } else if (typeof button.value == "string" && button.value.startsWith("reroll-withBonus")) {
          let bonus = button.value.split("reroll-withBonus ").slice(1).join(" ");
          if (!bonus.startsWith("+")) bonus = "+" + bonus;
          //@ts-expect-error
          newRoll = await new roll.constructor(`${roll.formula} ${bonus}`, { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll.data }).roll();
          if (showDiceSoNice) await displayDSNForRoll(newRoll, rollType, rollMode, undefined, this.actor);
        } else if (flagSelector.startsWith("damage.")) {
          //@ts-expect-error .DamageRoll
          const DamageRoll = CONFIG.Dice.DamageRoll
          let rollOptions = foundry.utils.duplicate(roll!.options);
          if (foundry.utils.getProperty(buttonOwner ?? this.actor ?? this, `${button.key}.criticalDamage`))
            //@ts-expect-error
            rollOptions.configured = false;
          // rollOptions = { critical: (this.isCritical || this.rollOptions.critical), configured: false };
          //@ts-expect-error D20Roll
          newRoll = CONFIG.Dice.D20Roll.fromRoll(roll);
          const tempRoll = new DamageRoll(`${button.value}`, { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll!.data }, rollOptions);
          await tempRoll.evaluate();
          setRollOperatorEvaluated(tempRoll);
          if (showDiceSoNice) await displayDSNForRoll(tempRoll, rollType, rollMode, undefined, this.actor);
          newRoll = addRollTo(roll!, tempRoll);
        } else if (flagSelector === "ac") {
          let rollOptions = foundry.utils.duplicate(roll!.options);
          //@ts-expect-error
          rollOptions.configured = false;
          //@ts-expect-error D20Roll
          newRoll = CONFIG.Dice.D20Roll.fromRoll(roll);
          const tempRoll = new Roll(`${button.value}`, { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll!.data }, rollOptions);
          await tempRoll.evaluate();
          setRollOperatorEvaluated(tempRoll);
          if (showDiceSoNice) await displayDSNForRoll(tempRoll, rollType, rollMode, undefined, this.actor);
          newRoll = addRollTo(roll!, tempRoll);
        } else {
          //@ts-expect-error
          newRoll = CONFIG.Dice.D20Roll.fromRoll(roll);
          const tempRoll = await (new Roll(`${button.value}`, { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll!.data })).roll();
          if (showDiceSoNice) await displayDSNForRoll(tempRoll, rollType, rollMode, undefined, this.actor);
          newRoll = addRollTo(newRoll, tempRoll);
        }
        break;
    }

    if (showRoll && this.category === "ac") { // TODO do a more general fix for displaying this stuff
      const newRollHTML = await midiRenderRoll(newRoll);
      const chatData: ChatMessage.CreateData = {
        flavor: i18n("DND5E.ArmorClass"),
        content: `${newRollHTML}`,
        whisper: [player?.id ?? ""]
      };
      ChatMessage.applyRollMode(chatData, rollMode);
      chatMessage = await ChatMessage.create(chatData);
    }

    await removeEffectGranting(this.actor, button.key);
    roll = newRoll;
    const optionalsUsed: string[] = foundry.utils.getProperty(roll, `flags.${MODULE_ID}.optionalsUsed`) as string[] ?? [];
    optionalsUsed.push(`${button.key}.${flagSelector}`);
    foundry.utils.setProperty(roll, `flags.${MODULE_ID}.optionalsUsed`, optionalsUsed);
    if (dialog) {
      validFlags = validFlags.filter(bf => bf !== button.key);
      if (validFlags.length === 0) {
        dialog?.close();
        return;
      }

      const newRollHTML = /*reRoll ? await midiRenderRoll(reRoll) :*/ await midiRenderRoll(newRoll);
      dialog.data.flags = validFlags;
      dialog.data.currentRoll = newRoll;
      if (game.user?.isGM) {
        dialog.data.content = newRollHTML;
      } else {
        if (["publicroll", "gmroll", "selfroll"].includes(rollMode)) dialog.data.content = newRollHTML;
        else dialog.data.content = "Hidden Roll";
      }
      dialog.render(true);
      // dialog.close();
    }
    if (chatMessage) unTimedExecuteAsGM("updateUndoChatCardUuidsById", { id: undoId, chatCardUuids: [(await chatMessage).uuid] });
  }

  let parameters: { [key: string]: any } = {};
  if (!(this instanceof Workflow) && this.optionalBonusEffectsAC) {
    let sourceToken = (fromUuidSync(this.triggerTokenUuid) as TokenDocument.Implementation | undefined)?.object;
    const sourceActor = sourceToken?.actor ?? fromUuidSync(this.optionalBonusEffectsAC.workflowOptions?.sourceActorUuid) as Actor.Implementation | undefined;
    if (!sourceToken && sourceActor) sourceToken = getOrCreateTokenForActor(sourceActor);
    parameters = {
      ...this.optionalBonusEffectsAC,
      actor: sourceActor,
      tokenUuid: sourceToken?.document?.uuid,
      target: fromUuidSync(this.tokenUuid) as TokenDocument.Implementation | undefined,
      triggeringRoll: this.roll,
      triggeringRollTotal: this.rollTotal,
      triggeringRollHTML: this.rollHTML,
      options
    }
  } else {
    parameters = {
      activity: this.activity,
      item: this.item,
      actor: this.actor,
      target: this.targets?.first(),
      options
    };
  };
  const conditionData = createConditionData({ workflow: (this instanceof Workflow ? this : undefined), ...parameters });
  let validFlags: string[] = [];
  let lastForceFlag = ""
  const oldRoll = foundry.utils.deepClone(roll);
  for (let flagName of bonusFlags) {
    const owner = ownerOf(flagName);
    if ((getOptionalCountRemaining(this.actor, `${flagName}.count`, owner)) < 1) continue;
    let activationCondition: string | undefined = foundry.utils.getProperty(owner ?? {}, `${flagName}.activation`) as string;
    if (activationCondition !== undefined) {
      activationCondition = await evalCondition(activationCondition, conditionData, { errorReturn: true, async: true });
      if (!activationCondition) continue;
    }
    let forcedCondition: string | undefined = foundry.utils.getProperty(owner ?? {}, `${flagName}.force`) as string;
    if (forcedCondition !== undefined) {
      forcedCondition = await evalCondition(forcedCondition, conditionData, { errorReturn: true, async: true });
      if (forcedCondition) {
        const altFlag = flagSelector.split(".").slice(0, -1).join(".") + ".all";
        await callback(undefined, {
          key: flagName,
          value: foundry.utils.getProperty(owner ?? {}, `${flagName}.${flagSelector}`) ?? foundry.utils.getProperty(owner ?? {}, `${flagName}.${altFlag}`) ?? "",
          label: "none"
        });
        lastForceFlag = flagName;
      }
      continue;
    }
    if (foundry.utils.getProperty(owner, flagName) !== undefined) validFlags.push(flagName);
  }
  if (showRoll && lastForceFlag !== "") {
    DSNMarkDiceDisplayed(roll);
    // const rollMode = foundry.utils.getProperty(this.actor ?? {}, lastForceFlag)?.rollMode ?? options.rollMode ?? safeGetGameSetting("core", "rollMode");
    //@ts-expect-error
    const rollMode = foundry.utils.getProperty(ownerOf(lastForceFlag) ?? {}, lastForceFlag)?.rollMode ?? oldRoll.options.rollMode ?? safeGetGameSetting("core", "rollMode");
    const card = await displayBeforeAfterRolls({ originalRoll: oldRoll, newRoll: roll, rollMode, title, player, options, actor: this.actor });
    if (card?.uuid && this instanceof Workflow) { // this does not work currently since the undoId has not yet been set
      await unTimedExecuteAsGM("updateUndoChatCardUuidsById", { id: this.undoId, chatCardUuids: [card.uuid] });
    }
  }
  if (validFlags.length === 0) return roll;
  let timeout = options.timeout ?? configSettings.reactionTimeout ?? defaultTimeout;
  return new Promise((resolve, reject) => {
    async function onClose() {
      if (timeoutId) clearTimeout(timeoutId);
      // The original roll is dsn displayed before the bonus dialog is called so mark it as displayed
      DSNMarkDiceDisplayed(originalRoll);
      // The new roll has had dsn display done for each bonus term/reroll so mark it as displayed
      DSNMarkDiceDisplayed(newRoll);

      if (showRoll && newRoll !== originalRoll) {
        //@ts-expect-error
        const card = await displayBeforeAfterRolls({ originalRoll, newRoll, rollMode: originalRoll.options.rollMode, title, player, options, actor: this.actor });
        if (card?.uuid && this instanceof Workflow) { // this does not work currently since the undoId has not yet been set
          await unTimedExecuteAsGM("updateUndoChatCardUuidsById", { id: this.undoId, chatCardUuids: [card.uuid] });
        }
      }
      resolve(newRoll)
    }
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        resolve(newRoll);
      }, timeout * 1000);
    }

    let content: string;
    let rollMode: any = options?.rollMode ?? safeGetGameSetting("core", "rollMode");
    if (game.user?.isGM) {
      content = rollHTML;
    } else {
      if (["publicroll", "gmroll", "selfroll"].includes(rollMode)) content = rollHTML;
      else content = "Hidden Roll";
    }
    const dialog = new RollModifyDialog(
      {
        actor: this.actor,
        flags: validFlags,
        flagSelector,
        targetObject: this,
        title,
        content,
        currentRoll: roll,
        rollHTML,
        rollMode: rollType,
        callback,
        close: onClose.bind(this),
        timeout,
        item: this.item,
        workflow: this instanceof Workflow ? this : undefined,
        flagOwners
      }).render({ force: true });
  });
}

export function getOptionalCountRemainingShortFlag(actor: Actor.Implementation, flag: string, owner?: any) {
  const flagPrefix = `flags.${MODULE_ID}.optional.${flag}`;
  const countRemaining = getOptionalCountRemaining(actor, `${flagPrefix}.count`, owner) && getOptionalCountRemaining(actor, `${flagPrefix}.countAlt`, owner);
  return countRemaining;
}

function getOptionalItemUsesItemMatch(actor: Actor.Implementation, countValue: string, returnItem = false) {
  let itemNames = countValue.split(".");
  let itemName: string;
  let item: Item.Implementation;
  if (itemNames[1] === "identifier") {
    itemName = itemNames[2];
    // @ts-expect-error no dnd5e-types
    item = actor.items.find(i => i.identifier === itemName);
  } else if (itemNames[1] === "partialNameMatch") {
    itemName = itemNames[2];
    // @ts-expect-error no dnd5e-types
    item = actor.items.find(i => i.name.includes(itemName));
  } else if (itemNames[1] === "exactNameMatch") {
    itemName = itemNames[2];
    // @ts-expect-error no dnd5e-types
    item = actor.items.getName(itemName);
  } else {
    itemName = itemNames[1];
    // @ts-expect-error no dnd5e-types
    item = actor.items.getName(itemName);
  }
  if (returnItem) {
    if (!item) {
      const message = `midi-qol | removeEffectGranting | could not decrement uses for ${itemName} on actor ${actor.name}`;
      error(message);
      TroubleShooter.recordError(new Error(message), message);
      return undefined;
    } else {
      return item;
    }
  } else {
    // @ts-expect-error no dnd5e-types
    return item?.system.uses.value;
  }
}

function getOptionalActivityUsesActivityMatch(actor: Actor.Implementation, countValue: string, returnActivity = false) {
  let activityNames = countValue.split(".");
  let itemName: string;
  let activityName: string;
  let item: Item.Implementation | undefined;
  let activity: Activity | undefined;
  if (activityNames[1] === "identifier") {
    // Example: ActivityUses.identifier.special-mace.super-attack
    itemName = activityNames[2];
    activityName = activityNames[3];
    // @ts-expect-error no dnd5e-types
    item = actor.items.find(i => i.identifier === itemName);
    // @ts-expect-error no dnd5e-types
    activity = item?.system.activities?.contents?.find(a => a.identifier === activityName);
  } else if (activityNames[1] === "partialNameMatch") {
    // Example: ActivityUses.partialNameMatch.mace.super
    itemName = activityNames[2];
    activityName = activityNames[3];
    item = actor.items.find(i => i.name.includes(itemName));
    // @ts-expect-error no dnd5e-types
    activity = item?.system.activities?.contents?.find(a => a.name.includes(activityName));
  } else if (activityNames[1] === "id") {
    // Example: ActivityUses.id.iLKpfoGF7rGpvNWD.NegUUOdFH35S3xNi
    itemName = activityNames[2];
    activityName = activityNames[3];
    // @ts-expect-error no dnd5e-types
    activity = actor.items.get(itemName)?.system.activities?.get(activityName);
  } else if (activityNames[1] === "exactNameMatch") {
    // Example: ActivityUses.exactNameMatch.Special Mace.Super Attack
    itemName = activityNames[2];
    activityName = activityNames[3];
    item = actor.items.getName(itemName);
    // @ts-expect-error no dnd5e-types
    activity = item?.system.activities?.getName(activityName);
  } else {
    // Example: ActivityUses.Special Mace.Super Attack
    itemName = activityNames[1];
    activityName = activityNames[2];
    item = actor.items.getName(itemName);
    // @ts-expect-error no dnd5e-types
    activity = item?.system.activities?.getName(activityName);
  }
  if (returnActivity) {
    if (!activity) {
      const message = `midi-qol | removeEffectGranting | could not decrement uses for ${itemName}'s activity ${activityName} on actor ${actor.name}`;
      error(message);
      TroubleShooter.recordError(new Error(message), message);
      return undefined;
    } else {
      return activity;
    }
  } else {
    return activity?.uses.value;
  }
}
// `owner` is the document that holds the flag value (defaults to actor). Game-state checks
// (combat turns, reactions, item/activity uses) always use the actor.
export function getOptionalCountRemaining(actor: Actor.Implementation, flag: string, owner?: any) {
  const countValue = foundry.utils.getProperty(owner ?? actor, flag) as string;
  if (!countValue) return 1;
  if (Number.isNumeric(countValue)) return countValue;
  if (["each-round", "each-turn"].includes(countValue) && game.combat) {
    let usedFlag = flag.replace(".count", ".used");
    // check for the flag
    if (foundry.utils.getProperty(actor, usedFlag) === game.combat.uuid) return 0;
  } else if (["turn"].includes(countValue) && game.combat) {
    let usedFlag = flag.replace(".count", ".used");
    if (foundry.utils.getProperty(actor, usedFlag) === game.combat.uuid || game.combat?.turns[game.combat?.turn ?? ""]?.actor?.uuid !== actor?.uuid) return 0;
  } else if (countValue === "reaction") {
    // return await hasUsedReaction(actor)
    return actor.flags?.[MODULE_ID]?.actions?.reactionCombatRound && needsReactionCheck(actor) ? 0 : 1;
  } else if (countValue === "bonusAction") {
    return actor.flags?.[MODULE_ID]?.actions?.bonusActionCombatRound && needsBonusActionCheck(actor) ? 0 : 1;
  } else if (countValue === "every") return 1;
  else if (countValue.startsWith("ActivityUses.")) return getOptionalActivityUsesActivityMatch(actor, countValue, false);
  else if (countValue.startsWith("ItemUses.")) return getOptionalItemUsesItemMatch(actor, countValue, false);
  if (countValue.startsWith("@")) {
    let result = foundry.utils.getProperty(actor?.system ?? {}, countValue.slice(1))
    return result;
  }
  return 1;
}

export async function removeEffectGranting(actor: Actor.Implementation, changeKey: string) {
  const effect = actor.appliedEffects.find(ef => ef.changes.some(c => c.key.includes(changeKey)))
  if (effect === undefined) return;
  const effectData = effect.toObject();

  const count = effectData.changes.find(c => c.key.includes(changeKey) && c.key.endsWith(".count"));
  const countAlt = effectData.changes.find(c => c.key.includes(changeKey) && c.key.endsWith(".countAlt"));
  if (!count) {
    return expireEffects(actor, [effect], { "expiry-reason": "midi-qol:optionalConsumed" })
  }
  if (Number.isNumeric(count.value) || Number.isNumeric(countAlt?.value)) {
    if (Number(count.value) <= 1 || Number(countAlt?.value) <= 1)
      return expireEffects(actor, [effect], { "expiry-reason": "midi-qol:optionalConsumed" })
    else if (Number.isNumeric(count.value)) {
      count.value = `${Number(count.value) - 1}`; // must be a string
    } else if (Number.isNumeric(countAlt?.value)) {
      countAlt!.value = `${Number(countAlt!.value) - 1}`; // must be a string
    }
    await effect.update({ changes: effectData.changes });
  }
  if (typeof count.value === "string" && count.value.startsWith("ItemUses.")) {
    const item = getOptionalItemUsesItemMatch(actor, count.value, true);
    if (!item) return;
    await item.update({ "system.uses.spent": Math.max(0, item.system.uses.spent + 1) });
  }
  if (typeof countAlt?.value === "string" && countAlt.value.startsWith("ItemUses.")) {
    const item = getOptionalItemUsesItemMatch(actor, countAlt.value, true);
    if (!item) return;
    await item.update({ "system.uses.spent": Math.max(0, item.system.uses.spent + 1) });
  }
  if (typeof count.value === "string" && count.value.startsWith("ActivityUses.")) {
    const activity = getOptionalActivityUsesActivityMatch(actor, count.value, true);
    if (!activity) return;
    // @ts-expect-error no dnd5e-types
    await activity.update({ "uses.spent": Math.max(0, activity.uses.spent + 1) });
  }
  if (typeof countAlt?.value === "string" && countAlt.value.startsWith("ActivityUses.")) {
    const activity = getOptionalActivityUsesActivityMatch(actor, countAlt.value, true);
    if (!activity) return;
    // @ts-expect-error no dnd5e-types
    await activity.update({ "uses.spent": Math.max(0, activity.uses.spent + 1) });
  }
  const actorUpdates: any = {};
  if (typeof count.value === "string" && count.value.startsWith("@")) {
    let key = count.value.slice(1);
    if (key.startsWith("system.")) key = key.replace("system.", "")
    // we have an @field to consume
    let charges = foundry.utils.getProperty(actor?.system ?? {}, key) as number;
    if (charges) {
      charges -= 1;
      actorUpdates[`system.${key}`] = charges;
    }
  }
  if (typeof countAlt?.value === "string" && countAlt.value.startsWith("@")) {
    let key = countAlt.value.slice(1);
    if (key.startsWith("system.")) key = key.replace("system.", "")
    // we have an @field to consume
    let charges = foundry.utils.getProperty(actor?.system ?? {}, key) as number;
    if (charges) {
      charges -= 1;
      actorUpdates[`system.${key}`] = charges;
    }
  }

  if (["turn", "each-round", "each-turn"].includes(count.value)) {
    const flagKey = `${changeKey}.used`.replace(`flags.${MODULE_ID}.`, "");
    actorUpdates[`${changeKey}.used`] = game.combat?.uuid;
    // await actor.setFlag(MODULE_ID, flagKey, true);
  }
  if (["turn", "each-round", "each-turn"].includes(countAlt?.value ?? "")) {
    const flagKey = `${changeKey}.used`.replace(`flags.${MODULE_ID}.`, "");
    actorUpdates[`${changeKey}.used`] = game.combat?.uuid;
    // await actor.setFlag(MODULE_ID, flagKey, true);
  }
  if (!foundry.utils.isEmpty(actorUpdates)) await actor.update(actorUpdates);

  if (count.value === "reaction" || countAlt?.value === "reaction") {
    await setReactionUsed(actor);
  }

  if (count.value === "bonusAction" || countAlt?.value === "bonusAction") {
    await setBonusActionUsed(actor);
  }
}

export function hasEffectGranting(actor: Actor.Implementation, key: string, selector: string, owner?: any) {
  // Actually check for the flag being set...
  if (getOptionalCountRemainingShortFlag(actor, key, owner) <= 0) return false;
  const source = owner ?? actor;
  let changeKey = `${key}.${selector}`;
  let hasKey = foundry.utils.getProperty(source ?? {}, changeKey);
  if (hasKey !== undefined) return true;
  let allKey = selector.split(".");
  allKey[allKey.length - 1] = "all";
  changeKey = `${key}.${allKey.join(".")}`;
  hasKey = foundry.utils.getProperty(source ?? {}, changeKey);
  if (hasKey !== undefined) return hasKey;
  return false;
}

function maxCastLevel(actor: Actor.Implementation) {
  if (configSettings.ignoreSpellReactionRestriction) return 9;
  // @ts-expect-error no dnd5e-types
  const spells = actor.system.spells;
  if (!spells) return 0;
  let pactLevel = spells.pact?.value ? spells.pact?.level : 0;
  for (let i = 9; i > pactLevel; i--) {
    if (spells[`spell${i}`]?.value > 0) return i;
  }
  return pactLevel;
}

export const reactionTypes = {
  "reaction": { prompt: "midi-qol.reactionFlavorHit", triggerLabel: "isHit" },
  "reactiontargeted": { prompt: "midi-qol.reactionFlavorTargeted", triggerLabel: "isTargeted" },
  "reactionhit": { prompt: "midi-qol.reactionFlavorHit", triggerLabel: "isHit" },
  "reactionmissed": { prompt: "midi-qol.reactionFlavorMiss", triggerLabel: "isMissed" },
  "reactioncritical": { prompt: "midi-qol.reactionFlavorCrit", triggerLabel: "isCrit" },
  "reactionfumble": { prompt: "midi-qol.reactionFlavorFumble", triggerLabel: "isFumble" },
  "reactionheal": { prompt: "midi-qol.reactionFlavorHeal", triggerLabel: "isHealed" },
  "reactiondamage": { prompt: "midi-qol.reactionFlavorDamage", triggerLabel: "isDamaged" },
  "reactionpreattack": { prompt: "midi-qol.reactionFlavorPreAttack", triggerLabel: "preAttack" },
  "reactionattacked": { prompt: "midi-qol.reactionFlavorAttacked", triggerLabel: "isAttacked" },
  "reactionsave": { prompt: "midi-qol.reactionFlavorSave", triggerLabel: "isSave" },
  "reactionsavefail": { prompt: "midi-qol.reactionFlavorSaveFail", triggerLabel: "isSaveFail" },
  "reactionsavesuccess": { prompt: "midi-qol.reactionFlavorSaveSuccess", triggerLabel: "isSaveSuccess" },
  "reactionmoved": { prompt: "midi-qol.reactionFlavorMoved", triggerLabel: "isMoved" }
};

export function reactionPromptFor(triggerType: string): string {
  if (reactionTypes[triggerType]) return reactionTypes[triggerType].prompt;
  return "midi-qol.reactionFlavorAttack";
}
export function reactionTriggerLabelFor(triggerType: string): string {
  if (reactionTypes[triggerType]) return reactionTypes[triggerType].triggerLabel;
  return "reactionHit";
}

export async function doReactions(targetRef: TokenOrDocument | string, triggerTokenUuid: string | undefined, triggeringRoll: Roll | null | undefined, triggerType: string, options: any = {}): Promise<{ name?: string, uuid?: string, ac?: number, itemName?: string }> {
  const target = getToken(targetRef);
  try {
    const noResult = { name: undefined, uuid: undefined, ac: undefined };
    if (!target) return noResult;
    if (!target.actor || !target.actor.flags) return noResult;

    if (checkIncapacitated(target.actor, debugEnabled > 0, false)) return noResult;
    let player = playerFor(getTokenDocument(target));
    const usedReaction = hasUsedReaction(target.actor);
    if (getReactionSetting(player) === "none") return noResult;
    if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
    if (!player) return noResult;
    const maxLevel = maxCastLevel(target.actor);
    // enableNotifications(false);
    let reactions: ReactionItem[] = [];
    let reactionCount = 0;
    let reactionActivityList: ReactionItemReference[] = [];
    try {
      const items = target.actor.items;
      for (let item of items) {
        // @ts-expect-error no clue when this can happen
        const theItem: Item.Implementation = item instanceof Item ? item : item.baseItem;
        // @ts-expect-error no dnd5e-types
        if (!theItem.system.activities) continue;
        // If the spell is a proxy for a cast ativity skip
        if (!!item.getFlag("dnd5e", "cachedFor")) continue;
        // @ts-expect-error no dnd5e-types
        for (let activity of theItem.system.activities) {
          const activationType = activity.effectiveActivationType ?? activity.activation?.type;
          if (!activationType?.includes("reaction")) continue;
          if (activationType !== "reaction") {
            console.warn(`midi-qol | itemReaction | item ${item.name} ${activity.name} has a reaction type of ${activationType} which is deprecated - please update to reaction and reaction conditions`)
          }
          // Item uses a reaction and actor has used a reaction.
          if ((activity.activation?.value ?? 1) > 0 && usedReaction) continue; // TODO can't specify 0 cost reactions in dnd5e 4.x - have to find another way
          // @ts-expect-error no dnd5e-types
          if (!item.system.attuned && item.system.attunement === "required") continue;
          let reactionCondition = activity.reactionCondition;
          // For cast activities, also check the spell's reaction condition from the activity that will be used
          if (activity.type === "cast" && activity.cachedSpell) {
            const spell = activity.cachedSpell;
            // Get the first usable activity - this is what spell.use() will use
            const spellActivity = spell.system?.activities?.filter((a: any) => a.canUse)?.[0];
            const spellCondition = spellActivity?.reactionCondition || "";
            if (reactionCondition && spellCondition) {
              reactionCondition = `(${reactionCondition}) && (${spellCondition})`;
            } else {
              reactionCondition = reactionCondition || spellCondition;
            }
          }
          // @ts-expect-error no dnd5e-types
          const isSpell = item.type === "spell";
          if (isSpell) {
            if (configSettings.ignoreSpellReactionRestriction) {
              // Skip all validation for spells when this setting is enabled
              reactions.push(activity);
              continue;
            }
            // Filter out unprepared spells
            // @ts-expect-error no dnd5e-types
            if (item.system.prepared === 0 && item.system.method === "spell") continue;
            // Filter spells that can't be cast due to no available slots of required level
            // @ts-expect-error no dnd5e-types
            if (item.system.level > 0 && !["atwill", "innate"].includes(item.system.method) && item.system.level > maxLevel) continue;
          }

          // Use dnd5e's consumption checks for all items/spells
          const config = activity._prepareUsageConfig({ create: false });
          if (isSpell) foundry.utils.setProperty(config, "consume.spellSlot", false);
          const canUse = await activity._prepareUsageUpdates(config, { returnErrors: true });
          if (canUse instanceof Array) continue; // insufficient uses available
          // If no condition is specified, default to requiring isHit
          if (!reactionCondition) {
            reactionCondition = 'reaction === "isHit"';
          }
          const returnvalue = await evalReactionActivationCondition(options.workflow, reactionCondition, target, { async: true, extraData: { reaction: reactionTriggerLabelFor(triggerType) } });
          if (debugEnabled > 0) warn(`for ${target.actor.name} ${theItem.name} using condition ${reactionCondition} condition ${returnvalue}`, options.workflow?.conditionData);
          if (!returnvalue) continue;
          reactions.push(activity);
        }
      };

      if (debugEnabled > 0)
        warn(`doReactions ${triggerType} for ${target.actor.name} ${target.name}`, reactions);
      reactionActivityList = reactions.map(activity => {
        return activity.uuid;
        // magic item details return { "itemName": item.itemName, itemId: item.itemId, "actionName": item.actionName, "img": item.img, "id": item.id, "uuid": item.uuid };
      });
    } catch (err) {
      const message = `midi-qol | fetching reactions`;
      error(message);
      TroubleShooter.recordError(err, message);
    } finally {
      enableNotifications(true);
    }

    if (await asyncHooksCall("midi-qol.ReactionFilter", reactions, options, triggerType, reactionActivityList) === false) {
      console.warn("midi-qol | Reaction processing cancelled by Hook");
      return { name: "Filter", ac: 0, uuid: undefined };
    }
    reactionCount = reactionActivityList?.length ?? 0;
    if (!usedReaction) {
      const midiFlags = target.actor.flags[MODULE_ID];
      reactionCount = reactionCount + Object.keys(midiFlags?.optional ?? [])
        .filter(flag => {
          if (!(triggerType === "reactionattacked" && midiFlags?.optional?.[flag].ac)) return false;
          if (!midiFlags?.optional[flag].count) return true;
          return getOptionalCountRemainingShortFlag(target.actor!, flag) > 0;
        }).length
    }

    if (reactionCount <= 0) return noResult;

    let chatMessage: ChatMessage.Implementation;
    const reactionFlavor = game.i18n?.format(reactionPromptFor(triggerType), { itemName: (options.item?.name ?? "unknown"), actorName: target.name });
    const chatData: ChatMessage.CreateData = {
      content: reactionFlavor,
      whisper: [player.id]
    };
    const workflow: Workflow | undefined = options.workflow ?? Workflow.getWorkflow(options?.activity?.uuid);

    if (configSettings.showReactionChatMessage) {
      const targetDocument = target.document;
      if (configSettings.enableDDBGL && installedModules.get("ddb-game-log")) {
        if (workflow?.flagTags) chatData.flags = workflow.flagTags;
      }
      chatMessage = await ChatMessage.create(chatData) as ChatMessage.Implementation;
    }
    const rollOptions = showReactionAttackRollOptions;
    // {"none": "Attack Hit", "d20": "d20 roll only", "d20Crit": "d20 + Critical", "all": "Whole Attack Roll"},

    let content: string | undefined = reactionFlavor;
    if (["isHit", "isMissed", "isCrit", "isFumble", "isAttacked"].includes(reactionTriggerLabelFor(triggerType))) {
      switch (configSettings.showReactionAttackRoll) {
        case "all":
          content = `${reactionFlavor} - ${i18n(rollOptions.all)} ${triggeringRoll?.total ?? ""}`;
          break;
        case "allCrit":
          //@ts-expect-error
          const criticalString = triggeringRoll?.isCritical ? `<span style="color: green">(${i18n("DND5E.Critical")})</span>` : "";
          content = `${reactionFlavor} - ${i18n(rollOptions.all)} ${triggeringRoll?.total ?? ""} ${criticalString}`;
          break;
        case "d20":
          //@ts-expect-error
          const theRoll = triggeringRoll?.terms[0]?.results ? triggeringRoll.terms[0].results[0].result : triggeringRoll?.terms[0]?.total ? triggeringRoll.terms[0].total : "";
          content = `${reactionFlavor} ${i18n(rollOptions.d20)} ${theRoll}`;
          break;
        default:
          content = reactionFlavor;
      }
    }

    let result: any = await new Promise((resolve) => {
      // set a timeout for taking over the roll
      const timeoutId = setTimeout(() => {
        resolve(noResult);
      }, (configSettings.reactionTimeout ?? defaultTimeout) * 1000 * 2);

      // Compiler does not realise player can't be undefined to get here
      player && requestReactions(target, player, triggerTokenUuid, content ?? "", triggerType, reactionActivityList, resolve, chatMessage, options).then((result) => {
        clearTimeout(timeoutId);
      })
    });
    if (result?.name) {
      let count = 100;
      do {
        await busyWait(50); // allow pending transactions to complete
        count -= 1;
      } while (globalThis.DAE.actionQueue.remaining && count);
      target.actor.reset();
      workflow?.actor.reset();
      // (target.actor as Actor).prepareData(); // allow for any items applied to the actor - like shield spell
    }
    return result;
  } catch (err) {
    const message = `doReactions error ${triggerType} for ${target?.name} ${triggerTokenUuid}`;
    TroubleShooter.recordError(err, message);
    throw err;
  }
}

export async function requestReactions(
  target: Token.Implementation,
  player: User.Implementation,
  triggerTokenUuid: string | undefined,
  reactionFlavor: string,
  triggerType: string,
  reactionActivityList: ReactionItemReference[],
  resolve: ({ }) => void,
  chatPromptMessage: ChatMessage.Implementation,
  options: any = {}
) {
  try {
    const startTime = Date.now();
    if (options.item && options.item instanceof CONFIG.Item.documentClass) {
      options.itemUuid = options.item.uuid;
      delete options.item;
    }

    if (options.workflow) {
      options.workflowId = options.workflow.id;
      delete options.workflow;
    }

    let result;
    if (player.isGM) {
      result = await unTimedExecuteAsGM("chooseReactions", {
        tokenUuid: target.document.uuid,
        reactionFlavor,
        triggerTokenUuid,
        triggerType,
        options,
        reactionActivityList
      });
    } else {
      result = await socketlibSocket.executeAsUser("chooseReactions", player.id, {
        tokenUuid: target.document.uuid,
        reactionFlavor,
        triggerTokenUuid,
        triggerType,
        options,
        reactionActivityList
      });
    }
    const endTime = Date.now();
    if (debugEnabled > 0) warn("requestReactions | returned after ", endTime - startTime, result);
    resolve(result);
    if (chatPromptMessage) chatPromptMessage.delete();
  } catch (err) {
    const message = `requestReactions | error ${triggerType} for ${target?.name} ${triggerTokenUuid}`;
    TroubleShooter.recordError(err, message);
    error(message, err)
    throw err;
  }
}

export async function promptReactions(
  tokenUuid: string,
  reactionActivityList: ReactionItemReference[],
  triggerTokenUuid: string | undefined,
  reactionFlavor: string,
  triggerType: string,
  options: any = {}
) {
  try {
    const startTime = Date.now();
    const target = fromUuidSync(tokenUuid) as TokenDocument.Implementation | undefined;
    const actor = target?.actor;
    if (!actor) return;
    const usedReaction = hasUsedReaction(actor);
    // if ( usedReaction && needsReactionCheck(actor)) return false;
    const midiFlags: any = foundry.utils.getProperty(actor ?? {}, `flags.${MODULE_ID}`);
    let result;
    let reactionActivities: Activity[] = [];
    enableNotifications(false);
    try {
      enableNotifications(false);
      for (let ref of reactionActivityList) {
        if (typeof ref === "string") reactionActivities.push((await fromUuid(ref)) as unknown as Activity);
        else {
          // An object reference (the older form, still used by macros) is its activity when the uuid resolves: the
          // dialog reads the activity's item.
          const activity = "uuid" in ref && ref.uuid ? await fromUuid(ref.uuid) : undefined;
          reactionActivities.push((activity ?? ref) as unknown as Activity);
        }
      };
    } finally {
      enableNotifications(true);
    }
    if (reactionActivities.length > 0) {
      if (await asyncHooksCall("midi-qol.ReactionFilter", reactionActivities, options, triggerType, reactionActivityList) === false) {
        console.warn("midi-qol | Reaction processing cancelled by Hook");
        return { name: "Filter" };
      }
      result = await reactionDialog(actor, triggerTokenUuid, reactionActivities, reactionFlavor, triggerType, options);
      const endTime = Date.now();
      if (debugEnabled > 0) warn("promptReactions | reaction processing returned after ", endTime - startTime, result)
      if (result.uuid) return result; //TODO look at multiple choices here
    }
    if (usedReaction) return { name: "None" };
    if (!midiFlags) return { name: "None" };
    const validFlags = Object.keys(midiFlags?.optional ?? {})
      .filter(flag => {
        if (!midiFlags.optional[flag].ac) return false;
        if (!midiFlags.optional[flag].count) return true;
        return getOptionalCountRemainingShortFlag(actor, flag) > 0;
      }).map(flag => `flags.${MODULE_ID}.optional.${flag}`);
    if (validFlags.length > 0 && triggerType === "reactionattacked") {
      // @ts-expect-error no dnd5e-types
      let acRoll = await new Roll(`${actor.system.attributes.ac.value}`).roll();
      const data = {
        actor,
        tokenUuid,
        optionalBonusEffectsAC: options,
        triggerTokenUuid,
        roll: acRoll,
        rollHTML: reactionFlavor,
        rollTotal: acRoll.total,
      }
      let displayBonusRolls: boolean | undefined = validFlags.reduce((acc: boolean | undefined, flag: string) => (acc || (foundry.utils.getProperty(actor ?? {}, `${flag}.displayBonusRolls`) as boolean)), undefined);
      if (!displayBonusRolls) displayBonusRolls = checkMechanic("displayBonusRolls") as boolean;
      // @ts-expect-error no dnd5e-types
      const newAC = await bonusDialog.bind(data)(validFlags, "ac", displayBonusRolls !== false, `${actor.name} - ${i18n("DND5E.AC")} ${actor.system.attributes.ac.value}`, acRoll, "roll");
      const endTime = Date.now();
      if (debugEnabled > 0) warn("promptReactions | returned via bonus dialog ", endTime - startTime)
      // Only return the AC result if the user actually used an optional bonus (AC changed)
      if (newAC?.total !== acRoll.total) {
        return { name: actor.name, uuid: actor.uuid, ac: newAC?.total };
      }
      return { name: "None" };
    }
    const endTime = Date.now();
    if (debugEnabled > 0) warn("promptReactions | returned no result ", endTime - startTime)
    return { name: "None" };
  } catch (err) {
    const message = `promptReactions ${tokenUuid} ${triggerType} ${reactionActivityList}`;
    TroubleShooter.recordError(err, message);
    throw err;
  }
}

export function playerFor(target?: TokenOrDocument | null): User | null | undefined {
  return playerForActor(target?.actor); // just here for syntax checker
}

export function playerForActor(actor?: Actor | null): User | undefined {
  if (!actor) return undefined;
  let user: User.Implementation | undefined;
  const OWNERSHIP_LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS
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
    user = game.users?.players.find(p => p.active && ownwership[p.id as string] === OWNERSHIP_LEVELS.INHERIT)
  }
  // if all else fails it's an active gm.
  if (!user) user = preferredActiveGM() ?? undefined;
  return user;
}

export async function reactionDialog(
  actor: Actor.Implementation,
  triggerTokenUuid: string | undefined,
  reactionActivities: Activity[],
  rollFlavor: string,
  triggerType: string,
  options: any = {}
) {
  const noResult = { name: "None" };
  try {
    let timeout = (options.timeout ?? configSettings.reactionTimeout ?? defaultTimeout);
    return new Promise((resolve, reject) => {
      let timeoutId = setTimeout(() => {
        dialog.close();
        resolve({});
      }, timeout * 1000);
      const callback = async function (dialog, button) {
        clearTimeout(timeoutId);
        const activity = reactionActivities.find(i => i.uuid === button.key);
        if (activity) {
          dialog.close();
          // For Cast activities that don't override targeting, resolve the effective target type from the spell
          let effectiveTargetType = activity.target?.affects?.type;
          // @ts-expect-error no dnd5e-types for _source.target.override
          if (activity.type === "cast" && !activity._source?.target?.override) {
            // @ts-expect-error no dnd5e-types for CastActivity.cachedSpell / spell
            const spell: Item.Implementation | undefined = activity.cachedSpell ?? fromUuidSync(activity.spell?.uuid);
            if (spell) {
              // @ts-expect-error no dnd5e-types for item.system.activities
              const activities = spell.system?.activities;
              const activityList = (activities instanceof Collection) ? activities.contents : Object.values(activities ?? {});
              const spellActivity = activityList.find((a: any) => a.canUse) ?? activityList[0];
              if (spellActivity?.target?.affects?.type) effectiveTargetType = spellActivity.target.affects.type;
            }
          }
          const itemRollOptions = foundry.utils.mergeObject({
            createWorkflow: true,
            configureDialog: true,
            checkGMStatus: false,
            targetUuids: effectiveTargetType !== "self" ? [triggerTokenUuid] : [getOrCreateTokenForActor(actor)?.document?.uuid],
            isReaction: true,
            workflowOptions: { targetConfirmation: "none" },
            ignoreUserTargets: true
          }, options);

          let useTimeoutId = setTimeout(() => {
            clearTimeout(useTimeoutId);
            resolve({})
          }, ((timeout) - 1) * 1000);
          let result: any = noResult;
          clearTimeout(useTimeoutId);
          if (activity.item instanceof CONFIG.Item.documentClass) { // a nomral item}
            const config = { midiOptions: itemRollOptions };
            result = await completeActivityUse(activity, config, {}, { systemCard: false });
            const workflow = result;  // completeActivityUse returns a workflow when called locally which for reactions it always is
            if (workflow && workflow.currentAction !== workflow.WorkflowState_Cleanup) resolve(noResult);
            else if (workflow) resolve({ name: workflow.activity.name, uuid: workflow.activity.uuid, itemName: workflow.activity.item.name, itemUuid: activity.item.uuid })
            else resolve(noResult);
          }
        }
        // actor.reset();
        resolve(noResult)
      };
      const noReaction = async function (dialog, button) {
        clearTimeout(timeoutId);
        resolve(noResult);
      }
      const dialog = new ReactionDialog({
        actor,
        targetObject: this,
        title: `${actor.name}`,
        activities: reactionActivities,
        content: rollFlavor,
        callback,
        close: noReaction,
        timeout
      });

      dialog.render({ force: true });
    });
  } catch (err) {
    const message = `reaactionDialog error ${actor?.name} ${actor?.uuid} ${triggerTokenUuid}`;
    TroubleShooter.recordError(err, message);
    throw err;
  }
}

// TODO: Probably this
export class ReactionDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  startTime: number;
  endTime: number;
  timeoutId: any;
  timeRemaining: number;

  data: {
    actor: Actor.Implementation,
    activities: Activity[],
    title: string,
    content: HTMLElement,
    callback: () => {},
    close: (args0: any) => {},
    buttons: any,
    completed: boolean,
    timeout: number,
    timeRemaining: number
  }

  constructor(data) {
    super(data);
    this.data = data;
    this.timeRemaining = this.data.timeout;
    this.startTime = this.endTime = Date.now();
    this.data.completed = false;
    this.timeoutId = this.set1Secondtimeout();
  }

  static PARTS = {
    dialog: {
      id: "dialog-reaction",
      classes: ["dialog", "midi-qol", "reaction"],
      template: "modules/midi-qol/templates/dialog.hbs"
    }
  };

  static DEFAULT_OPTIONS = {
    position: {
      width: 400,
      height: "auto" as "auto"
    }
  };

  get title() {
    let maxPad = 45;
    if (this.data.timeout) {
      if (this.data.timeout < maxPad) maxPad = this.data.timeout;
      const padCount = Math.ceil(this.timeRemaining / (this.data.timeout ?? defaultTimeout) * maxPad);
      const pad = "-".repeat(padCount);
      return `${this.data.actor?.name} ${this.data.title ?? "Dialog"} ${pad} ${this.timeRemaining}`;
    }
    else return this.data.title ?? "Dialog";
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const button of Array.from(this.element.querySelectorAll(".dialog-button"))) {
      button.addEventListener("click", this._onClickButton.bind(this));
    }
    // Michael note: I don't think this was doing anything?
    // document.addEventListener("keydown.chooseDefault", this._onKeyDown.bind(this));
    // if ( this.data.render instanceof Function ) this.data.render(this.options.jQuery ? html : html[0]);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.data.buttons = this.data.activities.reduce((acc: {}, activity) => {
      let name = `${activity.item.name}: ${activity.name ?? activity.actionName}`;
      // @ts-expect-error no dnd5e-types
      if (activity.item.system.linkedActivity) {
        // @ts-expect-error no dnd5e-types
        const linked = activity.item.system.linkedActivity;
        name = `${linked.item.name}: ${linked.name ?? linked.actionName}`;
      }
      acc[foundry.utils.randomID()] = {
        // icon: `<image src=${item.img} width="30" height="30">`,
        label: `<div style="display: flex; align-items: center; margin: 5px;"> <image src=${activity.item.img} width="40" height="40"> &nbsp ${name} </div>`,
        value: activity.name ?? activity.actionName,
        key: activity.uuid,
        callback: this.data.callback,
      }
      return acc;
    }, {})
    return {
      ...context,
      content: this.data.content,
      buttons: this.data.buttons,
      timeRemaining: this.timeRemaining
    }
  }

  set1Secondtimeout() {
    this.timeoutId = setTimeout(() => {
      this.timeRemaining -= 1;
      let color = "red";
      if (this.timeRemaining >= this.data.timeout * 0.75) color = "chartreuse";
      else if (this.timeRemaining >= this.data.timeout * 0.50) color = "yellow";
      else if (this.timeRemaining >= this.data.timeout * 0.25) color = "orange";
      this._updateFrame({ window: { title: this.title } });
      const title = this.element?.querySelector(".window-title");
      if (title) title.setAttribute("style", `color: ${color}`);
      if (this.timeRemaining > 0 && title) this.set1Secondtimeout();
    }, 1000)
  }

  _onClickButton(event: Event) {
    // @ts-expect-error I know more than you, machine
    const id = event.currentTarget!.dataset.button;
    const button = this.data.buttons[id];
    debug("Reaction dialog button clicked", id, button, Date.now() - this.startTime)
    this.submit(button);
  }

  // _onKeyDown(event) {
  //   // Close dialog
  //   if (event.key === "Escape" || event.key === "Enter") {
  //     debug("Reaction Dialog onKeyDown esc/enter pressed", event.key, Date.now() - this.startTime);
  //     event.preventDefault();
  //     event.stopPropagation();
  //     this.data.completed = true;
  //     if (this.data.close) this.data.close({ name: "keydown", uuid: undefined });
  //     this.close();
  //   }
  // }

  async submit(button) {
    try {
      clearTimeout(this.timeoutId);
      debug("ReactionDialog submit", Date.now() - this.startTime, button.callback)
      if (button.callback) {
        this.data.completed = true;
        await button.callback(this, button)
        this.close();
      }
    } catch (err: any) {
      const message = `Reaction dialog submit`;
      TroubleShooter.recordError(err, message);
      ui.notifications?.error(err);
      error(err);
      this.data.completed = false;
      this.close()
    }
  }

  async close() {
    clearTimeout(this.timeoutId);
    debug("Reaction Dialog close ", Date.now() - this.startTime, this.data.completed)
    if (!this.data.completed && this.data.close) {
      this.data.close({ name: "Close", uuid: undefined });
    }
    $(document).off('keydown.chooseDefault');
    return super.close();
  }
}

/**
 * 
 * @param actor the actor to check
 * @param itemRef the item to check. An item, an item uuid or an item name.
 * @returns the concentration effect if present and null otherwise
 */
export function getConcentrationEffect(actor?: Actor.Implementation | null, itemRef?: Item.Implementation | string): ActiveEffect.Implementation | undefined {
  let item: Item.Implementation | undefined;
  if (!actor) return;
  if (typeof itemRef === "string") {
    item = fromUuidSync(itemRef) as Item.Implementation | undefined;
    // @ts-expect-error no dnd5e-types
    if (!item) item = actor.concentration.items?.find(i => i.name === itemRef)
  } else item = itemRef;
  // concentration should not be a passive effect so don't need to do applied effects
  if (!item?.id)
    return actor?.effects.find(ef => ef.statuses.has(systemConcentrationId));
  else {
    return actor?.effects.find(ef => ef.statuses.has(systemConcentrationId)
      && (ef.flags?.dnd5e?.item?.id === item.id)
    );
  }
}

async function confirm(title: string = "Are you sure", { content, defaultYes } = { content: "", defaultYes: true }): Promise<any> {
  return DialogV2.confirm({
    window: { title: title ?? "Confirm" },
    content,
    defaultYes
  });
}
function buildEvalSandbox(sandbox: AnyMutableObject, asyncEval: boolean): AnyMutableObject {
  const extras: AnyMutableObject = {
    Roll,
    findNearby,
    findNearbyCount,
    checkNearby,
    hasCondition,
    checkDefeated,
    checkIncapacitated,
    canSee,
    canSense,
    // getDistance is the preferred call: it honours the Distance Measurement setting, so it
    // includes perimeter measurement and agrees with midi's own range checks. computeDistance is
    // the centre-based primitive it delegates to for "center" mode and is kept for compatibility.
    getDistance,
    computeDistance,
    checkActivityRange,
    checkDistance,
    fromUuidSync,
    nonWorkflowTargetedToken: game.user?.targets.first()?.document.uuid,
    combat: game.combat,
    evalRaceOrType: raceOrType,
    evalTypeOrRace: typeOrRace,
    evalTypeOrRaceEval: typeOrRace, // legacy alias - sync eval historically only exposed this name
    sizeNumeric,
    error: console.error,
    warn: console.warn,
    log: console.log
  };
  if (asyncEval) {
    // promise-returning helpers only work where the expression can await them
    extras.contestedRoll = contestedRoll;
    extras.confirm = confirm;
  }
  return foundry.utils.mergeObject(sandbox, extras);
}

function mySafeEvalImpl(expression: string, sandbox: AnyMutableObject, onErrorReturn: any, asyncEval: boolean): any {
  const label = asyncEval ? "asyncMySafeEval" : "mySafeEval";
  const coerceNumeric = (result: any) => Number.isNumeric(result) ? Number(result) : result;
  const handleError = (err: any) => {
    // @ts-expect-error sandbox confuses
    const message = `midi-qol | ${label} | activation condition (${expression}) error, actorUuid: ${sandbox.actorUuid} itemUuid: ${sandbox.item?.uuid} targetUuid: ${sandbox.targetUuid}`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
    return coerceNumeric(onErrorReturn);
  };
  try {
    if (asyncEval) {
      expression = expression.replace(/confirm\((.*)\)/g, "await confirm($1)");
    } else if (expression.includes("Roll(")) {
      error("safeEval | Roll expressions are not supported", expression)
      expression = expression.replaceAll(/evaluate\s*\({\s*async:\s* false\s*}\)/g, "evaluateSync({strict: false})")
      error("Expression replaced with ", expression);
    }
    const src = 'with (sandbox) { return ' + expression + '}';
    // @ts-expect-error
    const evl: (sandboxArg: any) => any = asyncEval ? foundry.utils.AsyncFunction("sandbox", src) : new Function("sandbox", src);
    sandbox = buildEvalSandbox(sandbox, asyncEval);
    const sandboxProxy = new Proxy(sandbox, {
      has: () => true, // Include everything
      get: (t, k) => k === Symbol.unscopables ? undefined : (t[k as string] ?? Math[k]),
      set: () => { error(`midi-qol | ${label} | You may not set properties of the sandbox environment`); return false } // No-op
    });
    if (MidiQOL.logEvaluationData) console.log(`MidiQOL ${label}`, { expression, sandboxProxy });
    const result = evl.call(null, sandboxProxy);
    if (asyncEval) return Promise.resolve(result).then((r: any) => {
      if (MidiQOL.logEvaluationData) console.log(`MidiQOL ${label}`, { result: r });
      return coerceNumeric(r);
    }, handleError);
    if (MidiQOL.logEvaluationData) console.log(`MidiQOL ${label}`, { result });
    return coerceNumeric(result);
  } catch (err) {
    return handleError(err);
  }
}

async function asyncMySafeEval(expression: string, sandbox: AnyMutableObject, onErrorReturn?: any): Promise<any> {
  return mySafeEvalImpl(expression, sandbox, onErrorReturn, true);
};

function mySafeEval(expression: string, sandbox: AnyMutableObject, onErrorReturn?: any): any {
  return mySafeEvalImpl(expression, sandbox, onErrorReturn, false);
};

export async function evalReactionActivationCondition(workflow: Workflow, condition: string | undefined | boolean, target: TokenOrDocument, options: any = {}): Promise<boolean> {
  if (options.errorReturn === undefined) options.errorReturn = false
  // if (condition === undefined || condition === "" || condition === false) return false;
  return evalActivationCondition(workflow, condition, target, options);
}
export async function evalActivationCondition(workflow: Workflow | undefined, condition: string | undefined | boolean, target?: TokenOrDocument, options: any = {}): Promise<boolean> {
  if (condition === undefined || condition === "" || condition === true) return true;
  if (condition === false) return false;
  const conditionData = createConditionData({ workflow, target, actor: workflow?.actor, extraData: options?.extraData, item: options.item });
  options.errorReturn ??= true;
  const returnValue = await evalCondition(condition, conditionData, options);
  return returnValue;
}

export function typeOrRace(entity: TokenOrDocument | Actor | string): string {
  const actor = getActor(entity);
  const systemData = actor?.system;
  if (!systemData) return "";
  // @ts-expect-error no dnd5e-types
  if (systemData.details.type?.value) return systemData.details.type?.value?.toLocaleLowerCase() ?? "";
  // cater to dnd5e 2.4+ where race can be a string or an Item
  // @ts-expect-error no dnd5e-types
  else return (systemData.details?.race?.name ?? systemData.details?.race)?.toLocaleLowerCase() ?? "";
}

export function sizeNumeric(size: string): number | undefined {
  const s = size?.toLowerCase();
  if (!s) return undefined;
  const actorSizes = GameSystemConfig.actorSizes;
  // Direct key match (e.g. "sm", "lg", "grg")
  if (actorSizes[s]?.numerical !== undefined) return actorSizes[s].numerical;
  // Long form match (e.g. "small", "gargantuan") — compare against labels
  for (const [, config] of Object.entries(actorSizes)) {
    if (game.i18n!.localize(config.label).toLowerCase() === s) return config.numerical;
  }
  return undefined;
}

export function raceOrType(entity: TokenOrDocument | Actor | string): string {
  const actor = getActor(entity);
  const systemData = actor?.system;
  if (!systemData) return "";
  // @ts-expect-error no dnd5e-types
  if (systemData.details.race) return (systemData.details?.race?.name ?? systemData.details?.race)?.toLocaleLowerCase() ?? "";
  // @ts-expect-error no dnd5e-types
  return systemData.details.type?.value?.toLocaleLowerCase() ?? "";
}

/**
 * Collects damage types from damage rolls and updates `rollData` if provided,
 * otherwise returns the computed result.
 *
 * @param damageRolls.
 * @param rollData Optional object to which damageTypes and defaultDamageType will be assigned.
 * @returns Void if `rollData` is provided; otherwise an object containing `damageTypes` and `defaultDamageType`.
 */
export function collectDamageTypes(
  damageRolls: {
    options?: { type?: string };
    parts?: string[];
  }[] = [],
  activity?: Activity,
  rollData?: {
    damageTypes?: { [key: string]: boolean };
    defaultDamageType?: { [key: string]: boolean };
    [key: string]: any;
  }
): void | { damageTypes: { [key: string]: boolean }, defaultDamageType?: { [key: string]: boolean } } {
  if (damageRolls.length) return collectDamageRollsDamageTypes(damageRolls, rollData);
  else if (activity) return collectActivityDamageTypes(activity, rollData);
  else if (rollData) {
    rollData.defaultDamageType ??= {};
    rollData.damageTypes ??= {};
    return;
  }
  return { damageTypes: {}, defaultDamageType: {} };
}

function collectDamageRollsDamageTypes(
  damageRolls: {
    options?: { type?: string };
    parts?: string[];
  }[] = [],
  rollData?: {
    damageTypes?: { [key: string]: boolean };
    defaultDamageType?: { [key: string]: boolean };
    [key: string]: any;
  }
): void | { damageTypes: { [key: string]: boolean }, defaultDamageType?: { [key: string]: boolean } } {
  const existingTypes = rollData?.damageTypes ?? {};
  const damageTypes: { [key: string]: boolean } = { ...existingTypes };
  let defaultType: string | undefined = undefined;

  for (const roll of damageRolls) {
    const type = roll.options?.type;
    if (type && !defaultType) defaultType = type;
    if (type) damageTypes[type] = true;

    for (const part of roll.parts ?? []) {
      if (!part?.length) continue;
      const match = [...part.matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim().toLowerCase());
      for (const partType of match) {
        if (!defaultType) defaultType = partType;
        damageTypes[partType] = true;
      }
    }
  }

  const defaultDamageType = defaultType ? { [defaultType]: true } : {};

  if (rollData) {
    rollData.damageTypes = damageTypes;
    rollData.defaultDamageType ??= defaultDamageType;
    return;
  }
  return { damageTypes, defaultDamageType };
}

function collectActivityDamageTypes(
  activity: Activity,
  rollData?: {
    damageTypes?: { [key: string]: boolean };
    defaultDamageType?: { [key: string]: boolean };
    [key: string]: any;
  }
): void | { damageTypes: { [key: string]: boolean }, defaultDamageType?: { [key: string]: boolean } } {
  if (!activity || !["attack", "damage", "heal", "save"].includes(activity.type)) {
    if (rollData) {
      rollData.defaultDamageType ??= {};
      rollData.damageTypes ??= {};
      return;
    }
    return { defaultDamageType: {}, damageTypes: {} };
  }
  const returnDamageTypes = {};
  let returnDefaultDamageType: { type?: boolean } | undefined = undefined;

  const partTypes = (part: any) => {
    if (part.types.size > 1) console.debug("MidiQOL collectActivityDamageTypes: Multiple damage types available for selection; cannot properly evaluate; damageTypes will grab the first of multiple ones");

    const type = part.types.first();
    if (type) {
      if (!returnDefaultDamageType) returnDefaultDamageType = { [type]: true };
      returnDamageTypes[type] = true;
    }
    const formula = part.custom?.formula;
    if (formula && formula !== "") {
      const match = [...formula.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim().toLowerCase());
      for (const m of match) {
        if (!returnDefaultDamageType) returnDefaultDamageType = { [m]: true };
        returnDamageTypes[m] = true;
      }
    }
  }

  if (activity.type === "heal") partTypes(activity.healing);
  else for (const part of activity.damage?.parts ?? []) partTypes(part);
  if (rollData) {
    rollData.damageTypes = returnDamageTypes;
    rollData.defaultDamageType ??= returnDefaultDamageType;
    return;
  }
  return { damageTypes: returnDamageTypes, defaultDamageType: returnDefaultDamageType ?? {} };

}

export function createConditionData(data: {
  workflow?: Workflow,
  target?: TokenOrDocument | Actor | string,
  actor?: Actor.Implementation | null,
  item?: Item | string,
  extraData?: any,
  activity?: Activity,
  tokenUuid?: string,
  targetUuid?: string,
  options?: any | undefined,
  token?: TokenOrDocument, // pretty sure this never actually gets passed but eh
  effect?: ActiveEffect.Implementation,
}) {
  const actor = data.workflow?.actor ?? data.actor;
  let item: Item.Implementation | undefined;
  if (data.item) {
    if (data.item instanceof Item) item = data.item;
    else if (typeof data.item === "string") item = fromUuidSync(data.item) as Item.Implementation | undefined;
  }
  if (!item) item = data.activity?.item ?? data.workflow?.activity?.item ?? data.workflow?.item;
  let rollData: any = data.activity?.getRollData() ?? item?.getRollData() ?? actor?.getRollData() ?? {};
  // Use options.damageRolls as fallback when workflow.damageRolls is empty (not yet populated during bonus processing)
  const damageRolls = data.workflow?.damageRolls?.length ? data.workflow.damageRolls : data.options?.damageRolls;
  collectDamageTypes(damageRolls, data.workflow?.activity, rollData);
  rollData = foundry.utils.mergeObject(rollData, data.extraData ?? {});
  rollData.isAttuned = rollData.item?.attuned || rollData.item?.attunement === "";
  rollData.options = data?.options;
  rollData.isConcentrationCheck = foundry.utils.getProperty(rollData, "options.messageData.flags.midi-qol.isConcentrationCheck");
  rollData.isDeathSave = foundry.utils.getProperty(rollData, "options.messageData.flags.dnd5e.roll.type") === "death";
  rollData.actor = {};
  rollData.actor.raceOrType = actor ? raceOrType(actor) : "";
  rollData.actor.typeOrRace = actor ? typeOrRace(actor) : "";
  rollData.items = actor?.items?.map(i => i.getRollData().item) ?? [];
  rollData.equippedItems = rollData.items.filter(i => i.equipped) ?? [];
  rollData.worldTime = game.time?.worldTime;
  try {
    if (data.target) {
      const theTarget = getToken(data.target);
      if (theTarget) {
        const theTargetActor = theTarget.actor as Actor;

        rollData.target = {
          get system() { return theTargetActor?.system },
          ...theTargetActor?.getRollData()
        };
        rollData.targetUuid = data.targetUuid ?? theTarget.document.uuid
        rollData.targetId = theTarget.id;
        rollData.targetActorUuid = theTargetActor?.uuid;
        rollData.targetActorId = theTargetActor?.id;
        rollData.raceOrType = theTargetActor ? raceOrType(theTargetActor) : "";
        rollData.typeOrRace = theTargetActor ? typeOrRace(theTargetActor) : "";
        rollData.target.raceOrType = theTarget.actor ? raceOrType(theTargetActor) : "";
        rollData.target.typeOrRace = theTarget.actor ? typeOrRace(theTargetActor) : "";
        rollData.target.items = theTargetActor?.items?.map(i => i.getRollData().item) ?? [];
        rollData.target.equippedItems = rollData.target.items.filter(i => i.equipped) ?? [];
        rollData.target.saved = data.workflow?.saves.has(theTarget);
        rollData.target.failedSave = data.workflow?.failedSaves.has(theTarget);
        rollData.target.superSaver = data.workflow?.superSavers.has(theTarget);
        rollData.target.semiSuperSaver = data.workflow?.semiSuperSavers.has(theTarget);
        rollData.target.isHit = data.workflow?.hitTargets.has(theTarget);
        rollData.target.isHitEC = data.workflow?.hitTargets.has(theTarget);
        rollData.target.canSense = data.workflow?.token && data.workflow.targetsCanSense.has(data.workflow.token);
        rollData.target.canSee = data.workflow?.token && data.workflow.targetsCanSee.has(data.workflow.token);
        rollData.canSense = data.workflow?.tokenCanSense?.has(theTarget);
        rollData.canSee = data.workflow?.tokenCanSee?.has(theTarget);
        if (theTarget) rollData.target.isCombatTurn = game.combat?.combatant?.tokenId === theTarget.id;
      }
    }
    rollData.humanoid = globalThis.MidiQOL.humanoid;
    rollData.tokenUuid = data.workflow?.tokenUuid ?? data.tokenUuid;
    rollData.tokenId = (data.token as (TokenOrDocument))?.id ?? data.workflow?.token?.id; // deprecated
    if (data.workflow) {
      rollData.w = data.workflow;
      rollData.workflow = data.workflow;
      rollData.activity = data.workflow.activity;
      rollData.riderStatuses = {};
      data.workflow.activity.applicableEffects?.forEach((effect) => {
        Array.from(effect?.statuses).forEach((status) => (rollData.riderStatuses[status] = true));
        effect.flags?.dnd5e?.riders?.statuses?.forEach((rider) => (rollData.riderStatuses[rider] = true));
      });
      rollData.otherDamageActivity = data.workflow?.otherActivity;
      rollData.hasSave = data.workflow.hasSave;
      rollData.item = data.workflow.item.getRollData().item;
      rollData.shouldRollDamage = data.workflow.shouldRollDamage;
      rollData.hasAttack = data.workflow.activity.attack;
      rollData.hasDamage = data.workflow.activity.hasDamage;
    }
    if (!data.activity && data.workflow) data.activity = data.workflow.activity;
    if (data.activity) {
      rollData.activity = data.activity;
      rollData.a = data.activity;
    }
    if (item) {
      // define like this so it's only called if needed to avoid deprecation warnings
      // @ts-expect-error no dnd5e-types
      Object.defineProperty(rollData.item, "actionType", { get() { return item.system.actionType } });
    }
    if (data.effect) {
      rollData.effect = data.effect;
    }
    if (game.combat) {
      const combat = game.combat;
      rollData.combatRound = combat.round;
      rollData.combatTurn = combat.turn;
      rollData.combatTime = combat.round + (combat.turn ?? 0) / 100;
      rollData.actor.isCombatTurn = combat.combatant?.tokenId === data.workflow?.token?.id;
      rollData.isCombatTurn = rollData.actor.isCombatTurn;
    } else rollData.combatTime = 0;
    rollData.CONFIG = CONFIG;
    rollData.CONST = {};
    let exclusions: string[] = ["DOCUMENT_TYPES"];
    Object.keys(CONST).forEach(key => !exclusions.includes[key] && (rollData.CONST[key] = CONST[key]));
    //Only here to avoid deprecation warnings - remove when we get to v14
  } catch (err) {
    const message = `midi-qol | createConditionData`;
    TroubleShooter.recordError(err, message);
    console.warn(message, err);
  } finally {
    if (data.workflow) data.workflow.conditionData = rollData;
  }
  return rollData;
}

export async function evalAllConditionsAsync(
  actorRef: TokenOrDocument | Actor | string | undefined | null,
  flag: string,
  conditionData: AnyObject,
  errorReturn: any = false
): Promise<any> {
  if (!flag) return errorReturn;
  let actor = getActor(actorRef);
  if (!actor) return errorReturn;
  const effects = actor.appliedEffects.filter(ef => ef.changes.some(change => change.key === flag));
  let keyToUse = flag.replace(`flags.${MODULE_ID}.`, "flags.midi.evaluated.");
  keyToUse = keyToUse.replace("flags.dnd5e.", "flags.midi.evaluated.dnd5e.");
  let returnValue = errorReturn;
  foundry.utils.setProperty(actor, `${keyToUse}.value`, false);
  foundry.utils.setProperty(actor, `${keyToUse}.effects`, [])
  for (let effect of effects) {
    for (let change of effect.changes) {
      if (change.key === flag) {
        const condValue = await evalCondition(change.value, conditionData, { errorReturn, async: true });
        if (debugEnabled > 0) warn("evalAllConditions Async", actor.name, flag, change.value, condValue, conditionData, errorReturn);
        if (condValue) {
          returnValue = condValue;
          foundry.utils.setProperty(actor, `${keyToUse}.value`, condValue);
          (foundry.utils.getProperty(actor, `${keyToUse}.effects`) as string[]).push(effect.name);
        }
      }
    }
  }
  if (effects.length === 0 && foundry.utils.getProperty(actor, flag)) {
    returnValue = await evalCondition(foundry.utils.getProperty(actor, flag) as string, conditionData, { errorReturn, async: true });
    if (returnValue) {
      foundry.utils.setProperty(actor, `${keyToUse}.value`, returnValue);
      (foundry.utils.getProperty(actor, `${keyToUse}.effects`) as string[]).push("flag");
    }
  }
  return returnValue;
}

export function evalAllConditions(
  actorRef: TokenOrDocument | Actor | string,
  flag: string,
  conditionData: any,
  errorReturn: any = false
): any {
  if (!flag) return errorReturn;
  let actor = getActor(actorRef);
  if (!actor) return errorReturn;
  const effects = actor.appliedEffects.filter(ef => ef.changes.some(change => change.key === flag));
  let keyToUse = flag.replace(`flags.${MODULE_ID}.`, "flags.midi.evaluated.");
  keyToUse = keyToUse.replace("flags.dnd5e.", "flags.midi.evaluated.dnd5e.");
  let returnValue = errorReturn;
  foundry.utils.setProperty(actor, `${keyToUse}.value`, false);
  foundry.utils.setProperty(actor, `${keyToUse}.effects`, [])
  for (let effect of effects) {
    for (let change of effect.changes) {
      if (change.key === flag) {
        const condValue = evalCondition(change.value, conditionData, { errorReturn, async: false });
        if (debugEnabled > 0) warn("evalAllConditions ", actor.name, flag, change.value, condValue, conditionData, errorReturn);
        if (condValue) {
          returnValue = condValue;
          foundry.utils.setProperty(actor, `${keyToUse}.value`, condValue);
          (foundry.utils.getProperty(actor, `${keyToUse}.effects`) as string[]).push(effect.name);
        }
      }
    }
  }
  if (effects.length === 0 && foundry.utils.getProperty(actor, flag)) {
    returnValue = evalCondition(foundry.utils.getProperty(actor, flag) as string, conditionData, { errorReturn, async: false })
    if (returnValue) {
      foundry.utils.setProperty(actor, `${keyToUse}.value`, returnValue);
      (foundry.utils.getProperty(actor, `${keyToUse}.effects`) as string[]).push("flag");
    }
  }
  return returnValue;
}

/**
 * Check magic resistance and vulnerability for an actor
 * @param actor The actor to check
 * @param rollAbility The ability being used for the save (optional, for ability-specific flags)
 * @param conditionData Condition data for flag evaluation (optional, will be created if not provided)
 * @returns Object with advantage, disadvantage, magicResistance, and magicVulnerability flags
 */
export async function checkMagicResistanceAndVulnerability(
  actor: Actor.Implementation | undefined | null,
  rollAbility?: string | null,
  conditionData?: ReturnType<typeof createConditionData>
): Promise<{
  advantage: boolean | undefined;
  disadvantage: boolean | undefined;
  magicResistance: boolean;
  magicVulnerability: boolean;
}> {
  if (!actor) {
    return { advantage: undefined, disadvantage: undefined, magicResistance: false, magicVulnerability: false };
  }

  // Create condition data if not provided
  const effectiveConditionData = conditionData ?? createConditionData({ actor, workflow: undefined, target: actor });

  let advantage: boolean | undefined = undefined;
  let disadvantage: boolean | undefined = undefined;
  let magicResistance = false;
  let magicVulnerability = false;

  const mrCustom = (i18n("midi-qol.MagicResistant") ?? "Magic Resistant").trim();
  const mvCustom = (i18n("midi-qol.MagicVulnerable") ?? "Magic Vulnerable").trim();

  // Check magic resistance in custom damage reduction traits
  //@ts-expect-error no dnd5e-types
  if ((actor.system?.traits?.dr?.custom || "").includes(mrCustom)) {
    advantage = true;
  }

  // Check magic resistance as a feature (based on the SRD name as provided by the DnD5e system)
  // @ts-expect-error no dnd5e-types
  if (actor.items?.find(a => a.type === "feat" && a.name === i18n("midi-qol.MagicResistanceFeat")?.trim())) {
    advantage = true;
  }

  // Check magic vulnerability in custom damage vulnerability traits
  //@ts-expect-error no dnd5e-types
  if ((actor.system?.traits?.dv?.custom || "").includes(mvCustom)) {
    disadvantage = true;
  }

  // Check magic resistance flags
  if (await evalAllConditionsAsync(actor, midiFlag(`magicResistance.all`), effectiveConditionData)
    || (rollAbility && await evalAllConditionsAsync(actor, midiFlag(`magicResistance.${rollAbility}`), effectiveConditionData))) {
    advantage = true;
    magicResistance = true;
  }

  // Check magic vulnerability flags
  if (await evalAllConditionsAsync(actor, midiFlag(`magicVulnerability.all`), effectiveConditionData)
    || (rollAbility && await evalAllConditionsAsync(actor, midiFlag(`magicVulnerability.${rollAbility}`), effectiveConditionData))) {
    disadvantage = true;
    magicVulnerability = true;
  }

  if (!advantage) advantage = undefined;
  if (!disadvantage) disadvantage = undefined;

  if (debugEnabled > 1) debug(`${actor.name} resistant to magic : ${advantage}`);
  if (debugEnabled > 1) debug(`${actor.name} vulnerable to magic : ${disadvantage}`);

  return { advantage, disadvantage, magicResistance, magicVulnerability };
}

export function evalCondition(condition: string | number | boolean | undefined, conditionData: any, options: any = { errorReturn: false, async: false }): any | Promise<any> {
  if (typeof condition === "number" || typeof condition === "boolean") return condition;
  if (condition === undefined || condition === "" || typeof condition !== "string") return options?.errorReturn;
  let returnValue;
  try {
    if (condition.includes("@")) {
      condition = Roll.replaceFormulaData(condition, conditionData, { missing: "0" });
    }

    if (options?.async) returnValue = asyncMySafeEval(condition, conditionData, options?.errorReturn);
    else returnValue = mySafeEval(condition, conditionData, options?.errorReturn ?? false);
    if (debugEnabled > 0) warn("evalCondition ", returnValue, condition, conditionData);

  } catch (err) {
    returnValue = options?.errorReturn ?? false;
    const message = `midi-qol | evalCondition | activation condition (${condition}) error, actorUuid: ${conditionData.actorUuid} itemUuid: ${conditionData.item?.uuid} targetUuid: ${conditionData.targetUuid}`;
    TroubleShooter.recordError(err, message);
    console.warn(message, err, conditionData);
  }
  return returnValue;
}

export function computeTemplateShapeDistance(templateDocument: MeasuredTemplateDocument) {
  let { x, y, direction, distance } = templateDocument;
  // let { direction, distance, angle, width } = templateDocument;
  if (!canvas || !canvas.scene) return { shape: undefined, distance: 0 };
  distance ??= 0;
  distance *= canvas.dimensions?.distancePixels ?? 1;
  direction = Math.toRadians(direction);
  if (!templateDocument.object) {
    throw new Error("Template document has no object");
  }
  //@ts-expect-error doesn't like `object.ray`
  templateDocument.object.ray = foundry.canvas.geometry.Ray.fromAngle(x, y, direction, distance);

  let shape: any;
  // @ts-expect-error protected
  templateDocument.object.shape = templateDocument.object._computeShape();
  return { shape: templateDocument.object.shape, distance: templateDocument.distance };
}

let _enableNotifications = true;

export function notificationNotify(wrapped, ...args) {
  if (_enableNotifications) return wrapped(...args);
}
export function enableNotifications(enable: boolean) {
  _enableNotifications = enable;
}

export function getStatusName(statusId: string | undefined): string {
  if (!statusId) return "undefined";
  const se = CONFIG.statusEffects.find(efData => efData.id === statusId);
  return i18n(se?.name ?? statusId) ?? `${statusId}`;
}

export function getWoundedStatus() {
  let condition = CONFIG.statusEffects.find(efData => efData.id === configSettings.midiWoundedCondition);
  if (condition || !ceInterface) return condition;
  return ceInterface.findEffect({ effectId: configSettings.midiWoundedCondition?.replace("zce-", "ce-") });
}

export function getUnconsciousStatus() {
  let condition = CONFIG.statusEffects.find(efData => efData.id === configSettings.midiUnconsciousCondition);
  if (condition || !ceInterface) return condition;
  return ceInterface.findEffect({ effectId: configSettings.midiUnconsciousCondition?.replace("zce-", "ce-") });
}

export function getDeadStatus() {
  let condition = CONFIG.statusEffects.find(efData => efData.id === configSettings.midiDeadCondition);
  if (condition || !ceInterface) return condition;
  return ceInterface.findEffect({ effectId: configSettings.midiDeadCondition?.replace("zce-", "ce-") });
}

export function getVitalityDeadStatus() {
  const conditionId = configSettings.optionalRules.vitalityDeadCondition || "dead";
  let condition = CONFIG.statusEffects.find(efData => efData.id === conditionId);
  if (condition || !ceInterface) return condition;
  return ceInterface.findEffect({ effectId: conditionId?.replace("zce-", "ce-") });
}

export function ConvenientEffectsHasEffect(effectName: string, actor: Actor.Implementation, ignoreInactive: boolean = true) {
  if (ignoreInactive) {
    return CEHasEffectApplied({ effectName, uuid: actor.uuid })
  } else {
    const effect = actor.appliedEffects.find(ef => ef.name === effectName);
    if (!effect) return false;
    return !!isConvenientEffect(effect);
  }
}

export function isInCombat(actor: Actor.Implementation) {
  const actorUuid = actor.uuid;
  let combats: Combat[] | undefined;
  if (actorUuid.startsWith("Scene")) { // actor is a token synthetic actor
    const tokenId = actorUuid.split(".")[3]
    combats = game.combats?.combats.filter(combat =>
      combat.combatants.filter(combatant => combatant?.tokenId === tokenId).length !== 0
    );
  } else { // actor is not a synthetic actor so can use actor Uuid 
    const actorId = actor.id;
    combats = game.combats?.combats.filter(combat =>
      combat.combatants.filter(combatant => combatant?.actorId === actorId).length !== 0
    );
  }
  return (combats?.length ?? 0) > 0;
}

export async function setActionUsed(actor: Actor.Implementation) {
  await actor.setFlag(MODULE_ID, "actions", { action: true });
}

export async function setReactionUsed(actor: Actor.Implementation, active: boolean = true) {
  if (!getReactionEffect()) return;
  const id = "reaction";
  if (!active) {
    await actor.effects.get(getStaticID(id))?.delete();
  } else {
    if (!["all", "displayOnly"].includes(configSettings.enforceReactions) && configSettings.enforceReactions !== actor.type) return;
    const actions = actor.getFlag(MODULE_ID, "actions");
    const newCount = (actions?.reactionsUsed ?? 0) + 1;
    await actor.effects.get(getStaticID(id))?.delete();
    const effect = getReactionEffect()?.clone({}, { keepId: true });
    const allReactionsUsed = newCount >= (actor.getFlag(MODULE_ID, "actions")?.reactionsMax ?? 1);
    if (!effect) return;
    effect.updateSource({
      origin: actor.uuid,
      changes: [
        { key: 'flags.midi-qol.actions.reaction', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: String(allReactionsUsed) },
        { key: 'flags.midi-qol.actions.reactionsUsed', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: String(newCount) },
        { key: 'flags.midi-qol.actions.reactionCombatRound', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: String(game.combat?.round ?? false) }
      ]
    });
    if (actions?.reactionsReset === "eachTurn") {
      effect.updateSource({ duration: { turns: 1 } })
    }
    if (actions?.reactionsReset === "rest") {
      effect.updateSource({ flags: { dae: { specialDuration: ["shortRest"] } } });
    }
    if (actions?.reactionsReset === "never") {
      effect.updateSource({ flags: { dae: { specialDuration: [] } } });
    }
    if (await asyncHooksCall("midi-qol.preSetReactionUsed", actor, effect) === false) return;
    await ActiveEffect.implementation.create(effect.toObject(), { parent: actor, keepId: true });
    await asyncHooksCallAll("midi-qol.setReactionUsed", actor, effect);
  }
}

export async function setBonusActionUsed(actor: Actor.Implementation) {
  if (debugEnabled > 0) warn("setBonusActionUsed | starting");
  if (!["all", "displayOnly"].includes(configSettings.enforceBonusActions) && configSettings.enforceBonusActions !== actor.type) return;
  const id = "bonusaction";
  const actions = (actor.getFlag(MODULE_ID, "actions"));
  const newCount = (actions?.bonusActionsUsed ?? 0) + 1;
  const bonusActionsMax = actions?.bonusActionsMax ?? 1;
  const allBonusActionsUsed = newCount >= bonusActionsMax;
  await actor.effects.get(getStaticID(id))?.delete();
  const effect = getBonusActionEffect()?.clone({}, { keepId: true });
  if (!effect) return;
  effect.updateSource({
    origin: actor.uuid,
    changes: [
      { key: 'flags.midi-qol.actions.bonus', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: String(allBonusActionsUsed) },
      { key: 'flags.midi-qol.actions.bonusActionsUsed', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: String(newCount) },
      { key: 'flags.midi-qol.actions.bonusActionCombatRound', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: String(game.combat?.round ?? false) }
    ]
  });
  if (actions?.bonusActionsReset === "eachTurn") {
    effect.updateSource({ duration: { turns: 1 } })
  }
  if (actions?.bonusActionsReset === "rest") {
    effect.updateSource({ flags: { dae: { specialDuration: ["shortRest"] } } });
  }
  if (actions?.bonusActionsReset === "never") {
    effect.updateSource({ flags: { dae: { specialDuration: [] } } });
  }
  effect.origin = actor.uuid;

  if (await asyncHooksCall("midi-qol.preSetBonusActionUsed", actor, effect) === false) return;
  await ActiveEffect.implementation.create(effect as any, { parent: actor, keepId: true });
  await asyncHooksCallAll("midi-qol.setBonusActionUsed", actor, effect);
}

export async function removeActionUsed(actor: Actor.Implementation) {
  if (game.user?.isGM || actor.isOwner) return await actor?.setFlag(MODULE_ID, "actions", { action: false });
  else return await unTimedExecuteAsGM("_gmSetFlag", { base: MODULE_ID, key: "actions.action", value: false, actorUuid: actor.uuid })
}

export async function removeReactionUsed(actor: Actor.Implementation, force = false) {
  if (debugEnabled > 0) warn("removeReactionUsed | starting", actor);
  if (force || !installedModules.get("times-up")) { // if times-up installed the special duration will expire the effect
    await actor.effects.get(getStaticID("reaction"))?.delete(); // reaction always non-transfer
  }
  // safety net unset of flags - just in case.
  // @ts-expect-error types doesn't recognize `-=validKey` as a valid key
  if (actor.flags?.[MODULE_ID]?.actions?.reaction) await actor.update({ flags: { [MODULE_ID]: { actions: { reactionUsed: 0, "-=reactionCombatRound": null } } } });
}

export function hasUsedAction(actor: Actor.Implementation) {
  return actor?.getFlag(MODULE_ID, "actions")?.action;
}

export function hasUsedReaction(actor: Actor.Implementation) {
  return (actor.getFlag(MODULE_ID, "actions")?.reactionsUsed ?? 0) >= (actor.getFlag(MODULE_ID, "actions")?.reactionsMax ?? 1);
}

export function hasUsedAnyReaction(actor: Actor.Implementation) {
  return (actor.getFlag(MODULE_ID, "actions")?.reactionsUsed ?? 0) > 0;
}

export function reactionsRemaining(actor: Actor.Implementation) {
  const used = actor.getFlag(MODULE_ID, "actions")?.reactionsUsed ?? 0;
  const max = actor.getFlag(MODULE_ID, "actions")?.reactionsMax ?? 1;
  return Math.max(0, max - used);
}

export async function expirePerTurnBonusActions(
  combat: Combat.Implementation,
  data: { round: number; turn: number | null },
  options: { advanceTime: number; direction: number }
) {
  const optionalFlagRe = /flags.midi-qol.optional.[^.]+.(count|countAlt)$/;
  for (let combatant of (combat.turns ?? [])) { // monks combat details does not pass the combat as it should so put in a guard
    const actor = combatant.actor;
    if (!actor) continue;
    const actorAllApplicableEffects = actor.allApplicableEffects();
    for (let effect of actorAllApplicableEffects) {
      for (let change of effect.changes) {
        if (change.key.match(optionalFlagRe)
          && ((change.value === "each-turn")
            || (change.value === "each-round" && data.round !== combat.round))
          || (change.value === "turn" && (data.turn !== null) && combat?.turns[data.turn ?? combat.turn].actor === actor)) {
          const usedKey = change.key.replace(/.(count|countAlt)$/, ".used")
          const isUsed = foundry.utils.getProperty(actor, usedKey);
          if (isUsed) {
            const key = usedKey.replace(`flags.${MODULE_ID}.`, "");
            //TODO turn this into actor updates instead of each flag
            await unTimedExecuteAsGM("_gmUnsetFlag", { actorUuid: actor.uuid, base: MODULE_ID, key });
          }
        }
      }
    }
  }
}

export function hasUsedBonusAction(actor: Actor.Implementation) {
  const currentUsed = actor.getFlag(MODULE_ID, "actions")?.bonusActionsUsed ?? 0;
  const max = actor.getFlag(MODULE_ID, "actions")?.bonusActionsMax ?? 1;
  return currentUsed >= max;
}
export function hasUsedAnyBonusAction(actor: Actor.Implementation) {
  return (actor.getFlag(MODULE_ID, "actions")?.bonusActionsUsed ?? 0) > 0;
}
export async function removeBonusActionUsed(actor: Actor, force = false) {
  if (force || !installedModules.get("times-up")) { // bonus action will be expired by times-up if installed
    await actor.effects.get(getStaticID("bonusaction"))?.delete()
  }
  // Safety net flag reset just in case
  // @ts-expect-error
  if (force) await actor.update({ flags: { [MODULE_ID]: { actions: { bonusActionsUsed: 0, bonus: false, "-=bonusActionCombatRound": null } } } });
}


export function needsReactionCheck(actor: Actor.Implementation) {
  return (configSettings.enforceReactions === "all" || configSettings.enforceReactions === actor.type)
}

export function needsAOOCheck(actor: Actor.Implementation) {
  return (configSettings.recordAOO === "all" || configSettings.recordAOO === actor.type)
}

export function needsBonusActionCheck(actor: Actor.Implementation) {
  return (configSettings.enforceBonusActions === "all" || configSettings.enforceBonusActions === actor.type)
}

export async function asyncHooksCallAll(hook: string, ...args): Promise<boolean | undefined> {
  if (CONFIG.debug.hooks) {
    console.log(`DEBUG | midi-qol async Calling ${hook} hook with args:`);
    console.log(args);
  }
  // console.warn(`DEBUG | midi-qol async Calling ${hook} hook with args:`, ...args);
  const hookEvents = Hooks.events[hook];
  if (debugEnabled > 1) debug("asyncHooksCall", hook, "hookEvents:", hookEvents, args)
  if (!hookEvents) return undefined;
  if (debugEnabled > 0) {
    warn(`asyncHooksCall calling ${hook}`, hookEvents, args)
  }
  for (let entry of Array.from(hookEvents)) {
    //TODO see if this might be better as a Promises.all - disadvantage is that order is not guaranteed.
    // NOTE (Michael): That feels fine. Order's never _really_ guaranteed, and `CallAll` should be calling all anyway
    try {
      if (debugEnabled > 1) {
        log(`asyncHooksCall for Hook ${hook} calling`, entry, args)
      }
      await hookCall(entry, args);
    } catch (err) {
      const message = `hooked function for hook ${hook}`;
      error(message, err);
      TroubleShooter.recordError(err, message);
    }
  }
  return true;
}

/**
 * Call a cancellable midi hook with all standard variants:
 * base, .item.uuid, .activity.uuid, and premades equivalents.
 * Returns false if any hook returns false (short-circuits).
 */
export async function callActivityHooks(activity: { uuid: string; item: { uuid: string } }, hookName: string, ...args): Promise<boolean> {
  if (await asyncHooksCall(hookName, ...args) === false) return false;
  if (await asyncHooksCall(`${hookName}.${activity.item.uuid}`, ...args) === false) return false;
  if (await asyncHooksCall(`${hookName}.${activity.uuid}`, ...args) === false) return false;
  const premadesHook = hookName.replace("midi-qol.", "midi-qol.premades.");
  if (await asyncHooksCall(premadesHook, ...args) === false) return false;
  if (await asyncHooksCall(`${premadesHook}.${activity.item.uuid}`, ...args) === false) return false;
  if (await asyncHooksCall(`${premadesHook}.${activity.uuid}`, ...args) === false) return false;
  return true;
}

export async function asyncHooksCall(hook: string, ...args): Promise<boolean | undefined> {
  if (CONFIG.debug.hooks) {
    console.log(`DEBUG | midi-qol async Calling ${hook} hook with args:`);
    console.log(args);
  }
  // console.warn(`DEBUG | midi-qol async Calling ${hook} hook with args:`, ...args);

  const hookEvents = Hooks.events[hook];
  if (debugEnabled > 1) log("asyncHooksCall", hook, "hookEvents:", hookEvents, args)
  if (!hookEvents) return undefined;
  if (debugEnabled > 0) {
    warn(`asyncHooksCall calling ${hook}`, args, hookEvents)
  }
  for (let entry of Array.from(hookEvents)) {
    let callAdditional: boolean | undefined;
    try {
      if (debugEnabled > 1) {
        log(`asyncHooksCall for Hook ${hook} calling`, entry, args)
      }
      callAdditional = await hookCall(entry, args) as boolean;
    } catch (err) {
      const message = `midi-qol | hooked function for hook ${hook} error`;
      error(message, err, entry);
      TroubleShooter.recordError(err, message);
      callAdditional = true;
    }
    if (callAdditional === false) return false;
  }
  return true;
}
function hookCall(entry: Hooks.HookedFunction, args: any[]) {
  const { hook, id, fn, once } = entry;

  // @ts-expect-error can't know this is valid
  if (once) Hooks.off(hook, id);
  try {
    // @ts-expect-error
    return entry.fn(...args);
  } catch (err: any) {
    const message = `Error thrown in hooked function '${fn?.name}' for hook '${hook}'`;
    TroubleShooter.recordError(err, message);
    error(`midi | ${message}`);
    if (hook !== "error") Hooks.onError("Hooks.#call", err, { message, hook, fn, log: "error" });
  }
}

/**
 * Localization map for attribution types
 */
const attributionTypeLocalization: Record<string, string> = {
  "ADV": "midi-qol.AttribADV",
  "DIS": "midi-qol.AttribDIS",
  "NOADV": "midi-qol.AttribNOADV",
  "NODIS": "midi-qol.AttribNODIS",
  "CRIT": "midi-qol.AttribCRIT",
  "NOCRIT": "midi-qol.AttribNOCRIT",
  "FUMBLE": "midi-qol.AttribFUMBLE",
  "NOFUMBLE": "midi-qol.AttribNOFUMBLE",
  "SUCCESS": "midi-qol.AttribSUCCESS",
  "FAIL": "midi-qol.AttribFAIL",
  "MIN": "midi-qol.AttribMIN",
  "MAX": "midi-qol.AttribMAX"
};

/**
 * Convert an AttributionMap to an array of AttributionEntry for display.
 * @param map - The attribution map (type -> source -> displayName)
 * @returns Array of AttributionEntry objects
 */
export function attributionMapToArray(map: AttributionMap): AttributionEntry[] {
  const entries: AttributionEntry[] = [];
  for (const [type, sources] of Object.entries(map)) {
    if (sources) {
      for (const [source, displayName] of Object.entries(sources)) {
        entries.push({ type: type as AttributionType, source, displayName });
      }
    }
  }
  return entries;
}

/**
 * Add structured attribution to a roll for tooltip display.
 * @param roll - The roll to add attribution to
 * @param attributions - AttributionMap (type -> source -> displayName)
 */
export function addAttribution(roll: Roll, attributions: AttributionMap) {
  if (attributions && Object.keys(attributions).length > 0) {
    // Convert map to array and store on roll options for tooltip rendering
    const entries = attributionMapToArray(attributions);
    foundry.utils.setProperty(roll, "options.attributions", entries);
  }
}

/**
 * Get localized title for a resolved d20 advantage mode.
 * @param mode - Resolved roll advantage mode (`-1` DIS, `0` NORMAL, `1` ADV)
 * @returns Localized title string
 */
export function getAdvantageModeTitle(mode: number | null | undefined): string {
  // @ts-expect-error CONFIG.Dice.D20Roll not typed
  const ADV_MODE: { DISADVANTAGE: number, NORMAL: number, ADVANTAGE: number } = CONFIG.Dice.D20Roll.ADV_MODE;
  if (mode === ADV_MODE.ADVANTAGE) return i18n("DND5E.Advantage");
  if (mode === ADV_MODE.DISADVANTAGE) return i18n("DND5E.Disadvantage");
  return i18n("DND5E.Normal");
}

/**
 * Render an attribution tooltip HTML from an AttributionMap.
 * @param attributions - The attribution map (type -> source -> displayName)
 * @param title - Optional title for the tooltip (e.g., "Advantage" or "Disadvantage")
 * @returns Promise resolving to the rendered HTML string
 */
export async function renderAttributionTooltip(attributions: AttributionMap, title?: string): Promise<string> {
  const entries = attributionMapToArray(attributions);

  const localizedEntries = entries.map(attr => ({
    ...attr,
    localizedType: i18n(attributionTypeLocalization[attr.type] ?? attr.type)
  }));

  // Always render the tooltip, even if empty (will show title or "Normal" state)
  // Compacted: this is HTML-escaped into a data-tooltip-html attribute.
  return compactHTML(await foundry.applications.handlebars.renderTemplate(
    "modules/midi-qol/templates/attribution-tooltip.html",
    { attributions: localizedEntries, title }
  ));
}

/**
 * Legacy function for backwards compatibility.
 * Converts Set-based attribution to structured format and adds to roll.
 * @deprecated Use addAttribution with AttributionEntry[] instead
 */
export function addAdvAttribution(roll: Roll, advAttribution: Set<string>) {
  // <section class="tooltip-part">
  let advHtml: string = "";
  if (advAttribution && advAttribution.size > 0) {
    // Localize the attribution prefixes
    const prefixMap: Record<string, string> = {
      "ADV:": `${i18n("midi-qol.AttribADV")}:`,
      "DIS:": `${i18n("midi-qol.AttribDIS")}:`,
      "CRIT:": `${i18n("midi-qol.AttribCRIT")}:`,
      "NOCRIT:": `${i18n("midi-qol.AttribNOCRIT")}:`,
      "FUMBLE:": `${i18n("midi-qol.AttribFUMBLE")}:`,
      "NOFUMBLE:": `${i18n("midi-qol.AttribNOFUMBLE")}:`
    };
    advHtml = Array.from(advAttribution).reduce((prev, s) => {
      let localized = s;
      for (const [prefix, localizedPrefix] of Object.entries(prefixMap)) {
        if (s.startsWith(prefix)) {
          localized = localizedPrefix + s.slice(prefix.length);
          break;
        }
      }
      return prev + `${localized}<br>`;
    }, "");
    foundry.utils.setProperty(roll, "options.advTooltip", advHtml);
  }
}

function getTooltip(roll: Roll, options: any = {}) {
  const parts = roll.dice?.map(d => d.getTooltipData()) ?? [];

  // Prepare structured attributions with localized type names
  // @ts-expect-error options.attributions
  const rawAttributions: AttributionEntry[] = roll.options?.attributions ?? [];
  const attributions = rawAttributions.map(attr => ({
    ...attr,
    localizedType: i18n(attributionTypeLocalization[attr.type] ?? attr.type)
  }));

  const templateData = {
    // @ts-expect-error
    advTooltip: roll.options?.advTooltip,
    attributions,
    tooltipFormula: options?.tooltipFormula ?? false,
    formula: roll.formula,
    parts
  };
  return foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/tooltip.html", templateData);
}

export async function midiRenderRoll(roll: Roll) {
  return roll.render();
}
export async function midiRenderAttackRoll(roll: Roll, options?: any) {
  options = foundry.utils.mergeObject(options ?? {}, { tooltipFormula: ["formula", "formulaadv"].includes(configSettings.rollAlternate) });
  return midiRenderTemplateRoll(roll, "modules/midi-qol/templates/attack-roll.html", options)
}

export async function midiRenderDamageRoll(roll: Roll, options?: any) {
  options = foundry.utils.mergeObject(options ?? {}, { tooltipFormula: ["formula", "formulaadv"].includes(configSettings.rollAlternate) });
  let html = midiRenderTemplateRoll(roll, "modules/midi-qol/templates/damage-roll.html", options)
  return html;
}

export function midiRenderOtherDamageRoll(roll: Roll, options?: any) {
  options = foundry.utils.mergeObject(options ?? {}, { tooltipFormula: ["formula", "formulaadv"].includes(configSettings.rollAlternate) });
  let html = midiRenderTemplateRoll(roll, "modules/midi-qol/templates/other-damage-roll.html", options);
  return html;
}
export function midiRenderBonusDamageRoll(roll: Roll, options?: any) {
  options = foundry.utils.mergeObject(options ?? {}, { tooltipFormula: ["formula", "formulaadv"].includes(configSettings.rollAlternate) });
  let html = midiRenderTemplateRoll(roll, "modules/midi-qol/templates/bonus-damage-roll.html", options);
  return html;
}

export function midiRenderFormulaRoll(roll: Roll, options?: any) {
  options = foundry.utils.mergeObject(options ?? {}, { tooltipFormula: ["formula", "formulaadv"].includes(configSettings.rollAlternate) });
  return midiRenderTemplateRoll(roll, "modules/midi-qol/templates/roll.html", options);
}

export async function midiRenderTemplateRoll(roll: Roll | undefined, template: string, options?: any) {
  if (!roll) return "";
  const advantageMode = roll.options?.advantageMode;
  let advantageModeStr: string | undefined;
  if (advantageMode === 1) advantageModeStr = "advantage";
  else if (advantageMode === -1) advantageModeStr = "disadvantage";

  // Generate attribution tooltip content if there are attributions
  let attributionTooltip = "";
  // @ts-expect-error options.attributions
  const rawAttributions: AttributionEntry[] = roll.options?.attributions ?? [];
  if (rawAttributions.length > 0) {
    const attributions = rawAttributions.map(attr => ({
      ...attr,
      localizedType: i18n(attributionTypeLocalization[attr.type] ?? attr.type)
    }));
    const title = advantageModeStr === "advantage" ? i18n("DND5E.Advantage") :
                  advantageModeStr === "disadvantage" ? i18n("DND5E.Disadvantage") : "";
    attributionTooltip = compactHTML(await foundry.applications.handlebars.renderTemplate(
      "modules/midi-qol/templates/attribution-tooltip.html",
      { attributions, title }
    ));
  }

  // Extract damage type icon for display next to total
  // @ts-expect-error no dnd5e types
  const damageType: string | undefined = roll.options?.type;
  const damageConfig = damageType
    ? (GameSystemConfig.damageTypes[damageType] ?? GameSystemConfig.healingTypes?.[damageType])
    : undefined;

  const chatData = {
    formula: roll.formula,
    user: game.user?.id,
    tooltip: await getTooltip(roll, options),
    tooltipFormula: options?.tooltipFormula ?? false,
    // @ts-expect-error no dnd5e-types
    flavor: options?.flavor ?? roll.options?.flavor,
    total: (roll.total !== undefined) ? Math.round((roll.total) * 100) / 100 : "???",
    advantageMode: advantageModeStr,
    attributionTooltip,
    damageTypeIcon: damageConfig?.icon,
    damageTypeLabel: damageConfig?.label
  };
  return foundry.applications.handlebars.renderTemplate(template, chatData);
}
export function heightIntersects(targetDocument: TokenDocument.Implementation, flankerDocument: TokenDocument.Implementation): boolean {
  const targetElevation = targetDocument.elevation ?? 0;
  const flankerElevation = flankerDocument.elevation ?? 0;
  const targetTopElevation = targetElevation + Math.max(targetDocument.height, targetDocument.width) * (canvas.dimensions?.distance ?? 5);
  const flankerTopElevation = flankerElevation + Math.min(flankerDocument.height, flankerDocument.width) * (canvas.dimensions?.distance ?? 5); // assume t2 is trying to make itself small
  /* This is for requiring the centers to intersect the height range 
     Which is an alternative rule possiblity
  const flankerCenter = (flankerElevation + flankerTopElevation) / 2;
  if (flankerCenter >= targetElevation || flankerCenter <= targetTopElevation) return true;
  return false;
  */
  if (flankerTopElevation < targetElevation || flankerElevation > targetTopElevation) return false;
  return true;
}
/**
 * Check if a grid cell (identified by pixel coordinates of a point within it) is adjacent to a target token,
 * using purely geometric bounding-box distance. This avoids measurement-mode-dependent calculations
 * (center vs perimeter) that cause inconsistencies with diagonal adjacency under different grid diagonal settings.
 *
 * @param cellPoint - A point within the candidate grid cell (e.g. a token's grid-square center)
 * @param target - The target token to check adjacency against
 * @param maxDistCells - Maximum distance in grid cells (1 for adjacent/5ft, 2 for reach/10ft)
 * @returns true if the cell's bounding box is within maxDistCells of the target's bounding box
 */
function isCellAdjacentToToken(cellPoint: { x: number; y: number }, target: Token.Implementation, maxDistCells: number = 1): boolean {
  if (!canvas?.grid) return false;
  const gridW = canvas.grid.sizeX;
  const gridH = canvas.grid.sizeY;

  // Get the cell's top-left from the point, then compute its bounding box
  const cellTopLeft = canvas.grid.getTopLeftPoint(cellPoint);
  const cellLeft = cellTopLeft.x;
  const cellTop = cellTopLeft.y;
  const cellRight = cellLeft + gridW;
  const cellBottom = cellTop + gridH;

  // Target bounding box
  const targetLeft = target.x;
  const targetTop = target.y;
  const targetRight = target.x + target.document.width * gridW;
  const targetBottom = target.y + target.document.height * gridH;

  // Compute the gap between the two bounding boxes along each axis
  const dx = Math.max(0, cellLeft - targetRight, targetLeft - cellRight);
  const dy = Math.max(0, cellTop - targetBottom, targetTop - cellBottom);

  // For adjacent cells (maxDistCells=1), gap must be 0 (touching/overlapping)
  // For reach cells (maxDistCells=2), gap must be at most 1 grid cell
  const maxGap = (maxDistCells - 1) * Math.max(gridW, gridH);
  // Use Chebyshev-style check: both dx and dy must be within maxGap
  // (since grid adjacency is 8-directional, not Euclidean)
  return dx <= maxGap && dy <= maxGap;
}

/**
 * Get the distance between two tokens for flanking purposes.
 * On gridless scenes, always uses perimeter measurement so that tokens
 * whose borders are close together are correctly identified as adjacent,
 * even when their centers are far apart (e.g. large tokens).
 */
function getFlankingDistance(t1: Token.Implementation, t2: Token.Implementation): number {
  const gridDist = canvas?.dimensions?.distance ?? 5;
  const fudge = configSettings.gridlessFudge ?? 0;
  if (canvas?.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS) {
    const raw = computePerimeterDistance(t1, t2, { wallsBlock: true, includeElevation: false });
    if (raw < 0) return -1;
    return gridDist + Math.max(0, raw - fudge);
  }
  return getDistance(t1, t2, { wallsBlock: true });
}

export function findPotentialFlankers(target: Token.Implementation) {
  const gridDist = canvas?.dimensions?.distance ?? 5;
  const isGridless = canvas?.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS;
  const requiresVisibility = configSettings.optionalRules.flankingRequiresVisibility;

  let allies: Token.Implementation[];
  let reachAllies: Token.Implementation[];

  if (isGridless) {
    // On gridless, use perimeter-based distance for finding nearby flankers
    const canvasPlaceables = canvas?.tokens?.placeables ?? [];
    const allNearby = canvasPlaceables.filter(t => {
      if (!isValidTarget(t)) return false;
      if (!t.actor) return false;
      if (t.id === target.id) return false;
      if (checkIncapacitated(t.actor, debugEnabled > 0, false)) return false;
      // Check disposition: must be hostile to target
      if (t.document.disposition === target.document.disposition) return false;
      if (requiresVisibility && !canSense(target, t)) return false;
      const dist = getFlankingDistance(t, target);
      return dist >= 0 && dist <= gridDist;
    });
    const reachNearby = canvasPlaceables.filter(t => {
      if (!isValidTarget(t)) return false;
      if (!t.actor) return false;
      if (t.id === target.id) return false;
      if (checkIncapacitated(t.actor, debugEnabled > 0, false)) return false;
      if (t.document.disposition === target.document.disposition) return false;
      if (requiresVisibility && !canSense(target, t)) return false;
      if (allNearby.some(a => a === t)) return false;
      //@ts-expect-error no dnd5e-types
      if (!t.actor.items.contents.some(item => item.system?.properties?.has("rch") && item.system.equipped)) return false;
      const dist = getFlankingDistance(t, target);
      return dist >= 0 && dist <= 2 * gridDist;
    });
    allies = allNearby.concat(reachNearby);
  } else {
    allies = findNearby(-1, target, gridDist, requiresVisibility ? { isSeen: true } : {});
    reachAllies = findNearby(-1, target, 2 * gridDist, requiresVisibility ? { isSeen: true } : {}).filter(
      ally => !(allies.some(tk => tk === ally)) &&
        //@ts-expect-error no dnd5e-types
        ally.actor?.items.contents.some(item => item.system?.properties?.has("rch") && item.system.equipped)
    );
    allies = allies.concat(reachAllies);
  }
  return allies;
}

/**
 * Compute the centroid (average pixel position) of a token's occupied hex centers.
 * Falls back to token.center if the grid is not hexagonal or offsets can't be obtained.
 */
function getHexCentroid(target: Token.Implementation): { x: number; y: number } {
  if (!canvas?.grid?.isHexagonal) return target.center;
  const offsets = target.document.getOccupiedGridSpaceOffsets();
  if (!offsets.length) return target.center;
  let sumX = 0, sumY = 0;
  for (const offset of offsets) {
    const center = canvas.grid.getCenterPoint(offset);
    sumX += center.x;
    sumY += center.y;
  }
  return { x: sumX / offsets.length, y: sumY / offsets.length };
}

/**
 * Angle-based flanking test: checks if token and ally are >= 150° apart
 * as seen from a reference point (centroid for hex, center for gridless).
 * Used for hex grids and gridless scenes where ray-through-edges doesn't apply.
 */
function isAngleFlanking(
  token: Token.Implementation,
  ally: Token.Implementation,
  target: Token.Implementation
): boolean {
  // Use hex centroid for hex grids, target center for gridless
  const referencePoint = canvas?.grid?.isHexagonal ? getHexCentroid(target) : target.center;
  const angleToken = Math.atan2(token.center.y - referencePoint.y, token.center.x - referencePoint.x);
  const angleAlly = Math.atan2(ally.center.y - referencePoint.y, ally.center.x - referencePoint.x);
  let diff = Math.abs(angleToken - angleAlly);
  if (diff > Math.PI) diff = 2 * Math.PI - diff; // normalize to [0, π]
  const MIN_FLANKING_ANGLE = (150 / 180) * Math.PI; // 150° in radians
  return diff >= MIN_FLANKING_ANGLE;
}


// TODO: Can definitely probably clean this up some
export async function computeFlankedStatus(target: Token.Implementation): Promise<boolean> {
  if (!checkRule("checkFlanking") || !["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(checkRule("checkFlanking") as string)) return false;
  if (!canvas || !target) return false;
  const allies = findPotentialFlankers(target);
  if (allies.length <= 1) return false; // length 1 means no other allies nearby
  const gridW = canvas.grid?.sizeX ?? 100;
  const gridH = canvas.grid?.sizeY ?? 100;
  /*
   * Corners come from the token DOCUMENT, not the placeable. A Token placeable's x/y are the PIXI
   * container transform, which is only current once the canvas has drawn — in a background tab it
   * reads 0,0 while the document keeps the scene coordinates. The document is the source of truth.
   */
  const targetX = target.document.x;
  const targetY = target.document.y;
  const tl = { x: targetX, y: targetY };
  const tr = { x: targetX + target.document.width * gridW, y: targetY };
  const bl = { x: targetX, y: targetY + target.document.height * gridH };
  const br = { x: targetX + target.document.width * gridW, y: targetY + target.document.height * gridH };
  const top: [x0: number, y0: number, x1: number, y1: number] = [tl.x, tl.y, tr.x, tr.y];
  const bottom: [x0: number, y0: number, x1: number, y1: number] = [bl.x, bl.y, br.x, br.y];
  const left: [x0: number, y0: number, x1: number, y1: number] = [tl.x, tl.y, bl.x, bl.y];
  const right: [x0: number, y0: number, x1: number, y1: number] = [tr.x, tr.y, br.x, br.y];

  while (allies.length > 1) {
    const token = allies.pop();
    if (!token) break;
    if (!heightIntersects(target.document, token.document)) continue;
    if (checkRule("checkFlanking") === "ceflankedNoconga" && installedModules.get("dfreds-convenient-effects")) {
      const CEFlanked = getFlankedEffect();
      const hasFlanked = token.actor && CEFlanked && CEHasEffectApplied({ effectName: CEFlanked.name, uuid: token.actor.uuid });
      if (hasFlanked) continue;
    } else if (checkRule("checkFlanking") === "midiFlankedNoConga") {
      const hasFlanked = token.actor && hasCondition(token.actor, "flanked");
      if (hasFlanked) continue;
    }
    if (token.actor?.flags?.[MODULE_ID]?.canFlank !== undefined) {
      const conditionData = createConditionData({ actor: token.actor, token, target });
      const tokenCanFlank = await evalCondition(token.actor.flags[MODULE_ID]?.canFlank, conditionData, undefined);
      if (tokenCanFlank === false) continue;
    }
    // Loop through each square covered by attacker and ally
    // Use geometric bounding-box adjacency instead of distancePointToken to avoid
    // measurement-mode-dependent distance calculations (center vs perimeter)
    const tokenStartX = -Math.max(0, token.document.width / 2 - 0.5);
    const tokenStartY = -Math.max(0, token.document.height / 2 - 0.5);
    const tokenPoints: any[] = [];
    for (let x = tokenStartX; x < token.document.width / 2; x++) {
      for (let y = tokenStartY; y < token.document.height / 2; y++) {
        let tx = token.center.x + x * gridW;
        let ty = token.center.y + y * gridH;
        if (!isCellAdjacentToToken({ x: tx, y: ty }, target)) continue;
        tokenPoints.push({ x: tx, y: ty });
      }
    }
    for (let ally of allies) {
      if (ally.document.uuid === token.document.uuid) continue;
      const actor: any = ally.actor;
      if (actor?.system.attributes?.hp?.value <= 0) continue;
      if (!heightIntersects(target.document, ally.document)) continue;
      if (hasCondition(actor, "incapacitated")) continue;
      if (checkRule("checkFlanking") === "ceflankedNoconga" && installedModules.get("dfreds-convenient-effects")) {
        const CEFlanked = getFlankedEffect();
        const hasFlanked = CEFlanked && CEHasEffectApplied({ effectName: CEFlanked.name, uuid: ally.actor?.uuid ?? "" });
        if (hasFlanked) continue;
      }
      if (checkRule("checkFlanking") === "midiFlankedNoConga") {
        const hasFlanked = hasCondition(actor, "flanked");
        if (hasFlanked) continue
      }
      // Hex grid or gridless: use angle-based flanking instead of ray-edge intersection
      if (canvas.grid?.isHexagonal || canvas.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS) {
        if (isAngleFlanking(token, ally, target)) return true;
        continue;
      }
      const allyStartX = -Math.max(0, ally.document.width / 2 - 0.5);
      const allyStartY = -Math.max(0, ally.document.height / 2 - 0.5);
      const allyPoints: any[] = [];
      for (let x1 = allyStartX; x1 < ally.document.width / 2; x1++) {
        for (let y1 = allyStartY; y1 < ally.document.height / 2; y1++) {
          let ax = ally.center.x + x1 * gridW;
          let ay = ally.center.y + y1 * gridH;
          if (!isCellAdjacentToToken({ x: ax, y: ay }, target)) continue;
          allyPoints.push({ x: ax, y: ay });
        }
      }
      for (let tokenPoint of tokenPoints) {
        for (let allyPoint of allyPoints) {
          const p1 = canvas.grid?.getCenterPoint(tokenPoint)
          const p2 = canvas.grid?.getCenterPoint(allyPoint);
          if (!p1 || !p2) continue;
          const rayToCheck = new foundry.canvas.geometry.Ray(p1, p2);
          const flankingTop = rayToCheck.intersectSegment(top) && rayToCheck.intersectSegment(bottom);
          const flankingLeft = rayToCheck.intersectSegment(left) && rayToCheck.intersectSegment(right);
          if (flankingLeft || flankingTop) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

// TODO Can definitely probably clean this up
export async function computeFlankingStatus(token: Token.Implementation, target: Token.Implementation): Promise<boolean> {
  if (!checkRule("checkFlanking") || checkRule("checkFlanking") === "off") return false;
  if (!canvas) return false;
  if (!token) return false;
  // For the target see how many square between this token and any friendly targets
  // Find all tokens hostile to the target
  if (!target) return false;
  if (!heightIntersects(target.document, token.document)) return false;
  let range = 1;
  // @ts-expect-error no dnd5e-types
  if (token.actor?.items.contents.some(item => item.system?.properties?.has("rch") && item.system.equipped)) {
    range = 2;
  }
  const flankDist = getFlankingDistance(token, target);
  if (flankDist > range * (canvas.dimensions?.distance ?? 5)) return false;
  // an enemy's enemies are my friends.
  const allies = findPotentialFlankers(target)
  if (!token.document.disposition) return false;
  if (allies.length <= 1) return false;
  const gridW = canvas.grid?.sizeX ?? 100;
  const gridH = canvas.grid?.sizeY ?? 100;
  /*
   * Corners come from the token DOCUMENT, not the placeable. A Token placeable's x/y are the PIXI
   * container transform, which is only current once the canvas has drawn — in a background tab it
   * reads 0,0 while the document keeps the scene coordinates. The document is the source of truth.
   */
  const targetX = target.document.x;
  const targetY = target.document.y;
  const tl = { x: targetX, y: targetY };
  const tr = { x: targetX + target.document.width * gridW, y: targetY };
  const bl = { x: targetX, y: targetY + target.document.height * gridH };
  const br = { x: targetX + target.document.width * gridW, y: targetY + target.document.height * gridH };
  const top: [x0: number, y0: number, x1: number, y1: number] = [tl.x, tl.y, tr.x, tr.y];
  const bottom: [x0: number, y0: number, x1: number, y1: number] = [bl.x, bl.y, br.x, br.y];
  const left: [x0: number, y0: number, x1: number, y1: number] = [tl.x, tl.y, bl.x, bl.y];
  const right: [x0: number, y0: number, x1: number, y1: number] = [tr.x, tr.y, br.x, br.y];

  // Loop through each square covered by attacker and ally
  // Use geometric bounding-box adjacency instead of distancePointToken to avoid
  // measurement-mode-dependent distance calculations (center vs perimeter)
  const tokenStartX = -Math.max(0, token.document.width / 2 - 0.5);
  const tokenStartY = -Math.max(0, token.document.height / 2 - 0.5);
  const tokenPoints: any[] = [];
  for (let x = tokenStartX; x < token.document.width / 2; x++) {
    for (let y = tokenStartY; y < token.document.height / 2; y++) {
      let tx = token.center.x + x * gridW;
      let ty = token.center.y + y * gridH;
      if (!isCellAdjacentToToken({ x: tx, y: ty }, target)) continue;
      tokenPoints.push({ x: tx, y: ty });
    }
  }
  for (let ally of allies) {
    if (ally.document.uuid === token.document.uuid) continue;
    if (!heightIntersects(ally.document, target.document)) continue;
    const actor: any = ally.actor;
    if (checkIncapacitated(ally.actor, debugEnabled > 0, false)) continue;
    if (hasCondition(actor, "incapacitated")) continue;
    if (ally.actor?.flags?.[MODULE_ID]?.canFlank !== undefined) {
      const conditionData = createConditionData({ actor: ally.actor, token: ally, target });
      const allyCanFlank = await evalCondition(ally.actor.flags[MODULE_ID]?.canFlank, conditionData, undefined);
      if (allyCanFlank === false) continue;
    }
    // Hex grid or gridless: use angle-based flanking instead of ray-edge intersection
    if (canvas.grid?.isHexagonal || canvas.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS) {
      if (isAngleFlanking(token, ally, target)) return true;
      continue;
    }
    const allyStartX = -Math.max(0, ally.document.width / 2 - 0.5);
    const allyStartY = -Math.max(0, ally.document.height / 2 - 0.5);

    const allyPoints: any[] = [];
    for (let x1 = allyStartX; x1 < ally.document.width / 2; x1++) {
      for (let y1 = allyStartY; y1 < ally.document.height / 2; y1++) {
        let ax = ally.center.x + x1 * gridW;
        let ay = ally.center.y + y1 * gridH;
        if (!isCellAdjacentToToken({ x: ax, y: ay }, target)) {
          continue;
        }
        allyPoints.push({ x: ax, y: ay });
      }
    }
    for (let tokenPoint of tokenPoints) {
      for (let allyPoint of allyPoints) {
        const p1 = canvas.grid?.getCenterPoint(tokenPoint)
        const p2 = canvas.grid?.getCenterPoint(allyPoint);
        if (!p1 || !p2) continue;
        const rayToCheck = new foundry.canvas.geometry.Ray(p1, p2);
        const flankingTop = rayToCheck.intersectSegment(top) && rayToCheck.intersectSegment(bottom);
        const flankingLeft = rayToCheck.intersectSegment(left) && rayToCheck.intersectSegment(right);
        if (flankingLeft || flankingTop) {
          return true;
        }
      }
    }
  }
  return false;
}

export function getFlankingEffect() {
  return ceInterface?.findEffect({ effectName: "Flanking" });
}

export function getFlankedEffect() {
  return ceInterface?.findEffect({ effectName: "Flanked" });
}

export function getReactionEffect() {
  if (!midiReactionEffect) return undefined;
  return getCPREffect(midiReactionEffect._id!) ?? midiReactionEffect;
}
export function getBonusActionEffect() {
  if (!midiBonusActionEffect) return undefined;
  return getCPREffect(midiBonusActionEffect._id!) ?? midiBonusActionEffect;
}

export function getIncapacitatedStatusEffect() {
  let incapEffect = CONFIG.statusEffects.find(se => se.id === "incapacitated");
  //@ts-expect-error odd
  if (!incapEffect) incapEffect = CONFIG.statusEffects.find(se => se.statuses?.has("incapacitated"));
  if (!incapEffect) incapEffect = CONFIG.statusEffects.find(se => se.name === i18n("DND5E.ConIncapacitated"))
  return incapEffect;
}

export async function markFlanking(token?: Token.Implementation | null, target?: Token.Implementation | null): Promise<boolean> {
  if (!canvas) return false;
  if (!target || !target?.actor) return false;
  const flankingMode = checkRule("checkFlanking") as string;
  if (!flankingMode || flankingMode === "off") return false;

  const isFlankingMode = ["advonly", "ceonly", "midiFlanking"].includes(flankingMode);
  const isFlankedMode = ["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(flankingMode);
  const skipAttackerStatus = (configSettings.optionalRules?.flankingBonus ?? "advantage") !== "advantage";

  if (isFlankingMode) {
    // Attacker-side flanking: requires both token and target
    if (!token || token === target) return false;
    const needsFlanking = await computeFlankingStatus(token, target);
    if (skipAttackerStatus) return needsFlanking;

    // Apply flanking status to attacker (advantage mode only)
    if (flankingMode === "ceonly") {
      if (installedModules.get("dfreds-convenient-effects")) {
        let CEFlanking = getFlankingEffect();
        if (!CEFlanking) return needsFlanking;
        const hasFlanking = CEHasEffectApplied({ effectName: CEFlanking.name ?? "Flanking", uuid: token.actor?.uuid ?? "" });
        if (needsFlanking && !hasFlanking && token.actor) {
          await CEAddEffectWith({ effectName: CEFlanking.name ?? "Flanking", uuid: token.actor.uuid, overlay: false });
        } else if (!needsFlanking && hasFlanking && token.actor) {
          await CERemoveEffect({ effectName: CEFlanking.name ?? "Flanking", uuid: token.actor.uuid });
        }
      }
    } else if (flankingMode === "midiFlanking") {
      const MidiFlanking: any = CONFIG.statusEffects.find(se => se.id === "flanking");
      if (!MidiFlanking) return false;
      let cprEffect: ActiveEffect | undefined = getCPREffect(MidiFlanking?._id as string)
      if (!cprEffect) {
        if (!token.actor?.isOwner) await unTimedExecuteAsGM("toggleStatusEffect", { actorUuid: token.actor?.uuid, statusId: MidiFlanking.id, options: { active: needsFlanking } });
        else await token.actor.toggleStatusEffect(MidiFlanking.id, { active: needsFlanking });
      } else if (needsFlanking) {
        if (!token.actor?.effects.get(cprEffect.id!)) {
          if (!token.actor?.isOwner) await unTimedExecuteAsGM("createEffects", { actorUuid: token.actor?.uuid, effects: [cprEffect.toObject()], options: { keepId: true } });
          else await token.actor.createEmbeddedDocuments("ActiveEffect", [cprEffect.toObject()], { keepId: true });
        }
      } else {
        if (token.actor?.effects.get(cprEffect.id!)) {
          if (!target.actor.isOwner) await unTimedExecuteAsGM("removeEffects", { actorUuid: token.actor.uuid, effects: [cprEffect.id], options: {} });
          await token.actor.deleteEmbeddedDocuments("ActiveEffect", [cprEffect.id!]);
        }
      }
    }
    // advonly: no status to apply
    return needsFlanking;

  } else if (isFlankedMode) {
    // Target-side flanked: applies status to target
    if (!target.actor) return false;
    const needsFlanked = await computeFlankedStatus(target);

    if (["ceflanked", "ceflankedNoconga"].includes(flankingMode)) {
      if (installedModules.get("dfreds-convenient-effects")) {
        let CEFlanked = getFlankedEffect();
        if (!CEFlanked) return false;
        const hasFlanked = CEHasEffectApplied({ effectName: CEFlanked.name ?? "Flanked", uuid: target.actor.uuid });
        if (needsFlanked && !hasFlanked && target.actor) {
          await CEAddEffectWith({ effectName: CEFlanked.name ?? "Flanked", uuid: target.actor.uuid, overlay: false });
        } else if (!needsFlanked && hasFlanked && token?.actor) {
          await CERemoveEffect({ effectName: CEFlanked.name ?? "Flanked", uuid: target.actor.uuid });
        }
      }
    } else if (["midiFlanked", "midiFlankedNoConga"].includes(flankingMode)) {
      const MidiFlanked = CONFIG.statusEffects.find(se => se.id === "flanked");
      if (!MidiFlanked) return false;
      const cprEffect: ActiveEffect | undefined = getCPREffect(MidiFlanked?._id as string)
      if (!cprEffect) {
        if (!target.actor.isOwner) await unTimedExecuteAsGM("toggleStatusEffect", { actorUuid: target.actor.uuid, statusId: MidiFlanked.id, options: { active: needsFlanked } });
        else await target.actor.toggleStatusEffect(MidiFlanked.id, { active: needsFlanked });
      } else if (needsFlanked) {
        if (!target.actor.effects.get(cprEffect.id!)) {
          if (!target.actor.isOwner) await unTimedExecuteAsGM("createEffects", { actorUuid: target.actor.uuid, effects: [cprEffect.toObject()], options: { keepId: true } });
          else await target.actor.createEmbeddedDocuments("ActiveEffect", [cprEffect.toObject()], { keepId: true });
        }
      } else {
        if (target.actor.effects.get(cprEffect.id!)) {
          if (!target.actor.isOwner) await unTimedExecuteAsGM("removeEffects", { actorUuid: target.actor.uuid, effects: [cprEffect.id], options: {} });
          else await target.actor.deleteEmbeddedDocuments("ActiveEffect", [cprEffect.id!]);
        }
      }
    }
  }
  return false;
}

export async function chackFlanking(user: User.Implementation, target: Token.Implementation, targeted: boolean): Promise<boolean> {
  if (user.id !== game.user?.id) return false;
  let token = canvas.tokens?.controlled[0];
  if (user.targets.size === 1) return markFlanking(token, target);
  return false

}

let flankingHighlightContainer: PIXI.Container | null = null;

/**
 * Get the flanking icon path based on the current flanking mode.
 */
function getFlankingHighlightIcon(): string {
  const flankingMode = checkRule("checkFlanking") as string;
  const isFlankedMode = ["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(flankingMode);
  return isFlankedMode ? "modules/midi-qol/icons/encirclement.svg" : "icons/svg/sword.svg";
}

/**
 * Update the flanking highlight overlay. Called when token selection or targeting changes.
 * Highlights grid cells around the current target where an ally could stand to create
 * a flanking condition with the currently selected token using icon sprites.
 */
export async function updateFlankingHighlight(): Promise<void> {
  if (!canvas?.grid || !canvas.interface?.grid) return;

  // Clear previous sprites
  if (flankingHighlightContainer) {
    flankingHighlightContainer.destroy({ children: true });
    flankingHighlightContainer = null;
  }

  // Early exits: setting disabled, flanking mode off, gridless (no cells to highlight)
  if (!configSettings.optionalRules?.showFlankingHighlight) return;
  const flankingMode = checkRule("checkFlanking") as string;
  if (!flankingMode || flankingMode === "off") return;
  if (canvas.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS) return;

  // Need exactly one controlled token and one target
  const token = canvas.tokens?.controlled?.[0];
  const target = game.user?.targets?.first();
  if (!token || !target || token === target) return;
  if (!canvas.dimensions) return;

  // Check selected token is within melee range of target (allow reach if equipped)
  const gridDist = canvas.dimensions.distance ?? 5;
  let tokenRange = 1;
  // @ts-expect-error no dnd5e-types
  if (token.actor?.items.contents.some(item => item.system?.properties?.has("rch") && item.system.equipped)) {
    tokenRange = 2;
  }
  const tokenDist = getDistance(token, target, { wallsBlock: true });
  if (tokenDist > tokenRange * gridDist) return;

  const gridW = canvas.grid.sizeX ?? 100;
  const gridH = canvas.grid.sizeY ?? 100;

  // Adjacency distance — matches computeFlankingStatus logic
  let maxDist = gridDist;
  // @ts-expect-error not in types yet
  if (game.settings.get("core", "gridDiagonals") === 1) maxDist *= Math.sqrt(2);

  // Get target's occupied offsets and their centers for adjacency checks
  const targetOffsets = target.document.getOccupiedGridSpaceOffsets();
  const targetOffsetSet = new Set(targetOffsets.map((o: {i: number, j: number}) => `${o.i},${o.j}`));
  const targetCellCenters = targetOffsets.map((o: {i: number, j: number}) => canvas.grid!.getCenterPoint(o));

  // Expand target bounds by 2 cells in each direction to find candidate cells
  const bounds = {
    x: target.x - 2 * gridW,
    y: target.y - 2 * gridH,
    width: target.document.width * gridW + 4 * gridW,
    height: target.document.height * gridH + 4 * gridH,
  };
  const [i0, j0, i1, j1] = canvas.grid.getOffsetRange(bounds);

  // Build target edge segments for square grid ray testing
  let top: [number, number, number, number] | undefined;
  let bottom: [number, number, number, number] | undefined;
  let left: [number, number, number, number] | undefined;
  let right: [number, number, number, number] | undefined;

  if (!canvas.grid.isHexagonal) {
    const tl = { x: target.x, y: target.y };
    const tr = { x: target.x + target.document.width * gridW, y: target.y };
    const bl = { x: target.x, y: target.y + target.document.height * gridH };
    const br = { x: target.x + target.document.width * gridW, y: target.y + target.document.height * gridH };
    top = [tl.x, tl.y, tr.x, tr.y];
    bottom = [bl.x, bl.y, br.x, br.y];
    left = [tl.x, tl.y, bl.x, bl.y];
    right = [tr.x, tr.y, br.x, br.y];
  }

  // Build token grid points (same multi-square logic as computeFlankingStatus)
  // Use measurePath against target cell centers for hex-grid compatibility
  const tokenPoints: { x: number; y: number }[] = [];
  const tokenStartX = -Math.max(0, token.document.width / 2 - 0.5);
  const tokenStartY = -Math.max(0, token.document.height / 2 - 0.5);
  const tokenMaxDist = tokenRange * maxDist + 1; // +1 tolerance for hex precision
  for (let x = tokenStartX; x < token.document.width / 2; x++) {
    for (let y = tokenStartY; y < token.document.height / 2; y++) {
      const tx = token.center.x + x * gridW;
      const ty = token.center.y + y * gridH;
      let closeEnough = false;
      for (const tc of targetCellCenters) {
        const d = canvas.grid.measurePath([{ x: tx, y: ty }, tc], {}).distance;
        if (d <= tokenMaxDist) { closeEnough = true; break; }
      }
      if (!closeEnough) continue;
      tokenPoints.push({ x: tx, y: ty });
    }
  }
  if (tokenPoints.length === 0) return;

  // Hex flanking uses centroid + angle
  const centroid = canvas.grid.isHexagonal ? getHexCentroid(target) : undefined;
  const MIN_FLANKING_ANGLE = (150 / 180) * Math.PI;

  // Collect valid cell positions
  const validCells: { i: number; j: number }[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      // Skip cells occupied by the target
      if (targetOffsetSet.has(`${i},${j}`)) continue;

      const cellCenter = canvas.grid.getCenterPoint({ i, j });

      // Check candidate is adjacent to target using measurePath against occupied cell centers
      // Add small tolerance (1ft) for floating-point imprecision in hex center coordinates
      let isAdjacent = false;
      for (const tc of targetCellCenters) {
        const d = canvas.grid.measurePath([cellCenter, tc], {}).distance;
        if (d > 0 && d <= maxDist + 1) { isAdjacent = true; break; }
      }
      if (!isAdjacent) continue;

      let isValid = false;

      if (canvas.grid.isHexagonal && centroid) {
        // Hex flanking: check angle from centroid
        for (const tp of tokenPoints) {
          const tokenCenter = canvas.grid.getCenterPoint(tp);
          const angleToken = Math.atan2(tokenCenter.y - centroid.y, tokenCenter.x - centroid.x);
          const angleCandidate = Math.atan2(cellCenter.y - centroid.y, cellCenter.x - centroid.x);
          let diff = Math.abs(angleToken - angleCandidate);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
          if (diff >= MIN_FLANKING_ANGLE) {
            isValid = true;
            break;
          }
        }
      } else if (top && bottom && left && right) {
        // Square grid: ray through opposite edges test
        for (const tp of tokenPoints) {
          const p1 = canvas.grid.getCenterPoint(tp);
          const p2 = cellCenter;
          const ray = new foundry.canvas.geometry.Ray(p1, p2);
          const throughTopBottom = ray.intersectSegment(top) && ray.intersectSegment(bottom);
          const throughLeftRight = ray.intersectSegment(left) && ray.intersectSegment(right);
          if (throughTopBottom || throughLeftRight) {
            isValid = true;
            break;
          }
        }
      }

      if (isValid) validCells.push({ i, j });
    }
  }

  if (validCells.length === 0) return;

  // Load the flanking icon texture and place sprites
  const iconPath = getFlankingHighlightIcon();
  let texture: PIXI.Texture;
  try {
    texture = await PIXI.Assets.load(iconPath);
  } catch {
    return;
  }
  if (!texture?.valid) return;

  // Re-check state after async load — selection/target may have changed
  if (!canvas?.interface?.grid) return;
  if (canvas.tokens?.controlled?.[0] !== token) return;
  if (game.user?.targets?.first() !== target) return;

  flankingHighlightContainer = new PIXI.Container();
  flankingHighlightContainer.name = "midi-qol-flanking-highlight";
  flankingHighlightContainer.zIndex = (CONFIG.Canvas.groups.interface.zIndexScrollingText ?? 1100) - 1;
  flankingHighlightContainer.sortableChildren = false;
  flankingHighlightContainer.eventMode = "none";
  canvas.interface.addChild(flankingHighlightContainer);

  const spriteSize = Math.min(gridW, gridH) * 0.8;
  for (const { i, j } of validCells) {
    const center = canvas.grid.getCenterPoint({ i, j });
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(center.x, center.y);
    sprite.width = spriteSize;
    sprite.height = spriteSize;
    sprite.alpha = 0.6;
    sprite.tint = 0xFF6600;
    flankingHighlightContainer.addChild(sprite);
  }
}

export function getChanges(actorOrItem: Actor.Implementation | Item.Implementation, key: string) {
  let contents = actorOrItem.effects.contents;
  if (actorOrItem instanceof Actor) contents = actorOrItem.appliedEffects;
  return actorOrItem.effects.contents
    .flat()
    .map(e => {
      let c: Array<any> = foundry.utils.duplicate(e.changes);
      c = c.map(change => { change.effect = e; return change; })
      return c
    })
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
/** `forceVision` checks a token without sight as if it had sight, whatever *Force vision when checking* is set to. */
export interface SenseOptions { forceVision?: boolean }
export function canSense(tokenEntity: TokenOrDocument | string, targetEntity: TokenOrDocument | string, validModes: Array<string> = ["all"], options: SenseOptions = {}): boolean {
  return canSenseModes(tokenEntity, targetEntity, validModes, options).length > 0;
}
export function canSenseModes(tokenEntity: TokenOrDocument | string, targetEntity: TokenOrDocument | string, validModes: Array<string> = ["all"], options: SenseOptions = {}): Array<string> {
  const token = getToken(tokenEntity);
  const target = getToken(targetEntity);
  if (!token || !target) return [];
  return _canSenseModes(token, target, validModes, options);
}
const newCheckVisionSource = (tk: Token.Implementation) => new CONFIG.Canvas.visionSourceClass({ sourceId: `${tk.sourceId}.midiCheck`, object: tk });
type CheckVisionSource = ReturnType<typeof newCheckVisionSource> | NonNullable<Token.Implementation["vision"]>;
const checkVisionSources = new WeakMap<Token.Implementation, { key: string, source: CheckVisionSource }>();
let checkVisionGeneration = 0;

export function setupCheckVision() {
  const invalidate = () => { checkVisionGeneration++; };
  Hooks.on("createWall", invalidate);
  Hooks.on("updateWall", invalidate);
  Hooks.on("deleteWall", invalidate);
  Hooks.on("createAmbientLight", invalidate);
  Hooks.on("updateAmbientLight", invalidate);
  Hooks.on("deleteAmbientLight", invalidate);
  Hooks.on("updateScene", invalidate);
  Hooks.on("canvasReady", invalidate);
}

/** A token without sight is checked with the detection modes Foundry gives one with sight. */
function checkDetectionModes(tk: Token.Implementation) {
  const modes = [...tk.detectionModes];
  if (!tk.hasSight) {
    if (!modes.some(m => m.id === "lightPerception")) modes.push({ id: "lightPerception", enabled: true, range: Infinity });
    if (!modes.some(m => m.id === "basicSight")) modes.push({ id: "basicSight", enabled: true, range: tk.document.sight.range });
  }
  return modes;
}

/**
 * The token's own vision source while Foundry keeps one, else one detached from the canvas, so the token is left
 * as it was (#1571). Cached until the token's vision data, the walls, lights or scene change.
 */
function checkVisionSource(tk: Token.Implementation, detectionModes: ReturnType<typeof checkDetectionModes>): CheckVisionSource {
  if (tk.hasSight && tk.vision?.los) return tk.vision;
  const lightPerception = detectionModes.find(m => m.id === "lightPerception");
  const data = {
    // @ts-expect-error protected _getVisionSourceData
    ...tk._getVisionSourceData(),
    lightRadius: lightPerception?.enabled ? tk.getLightRadius(lightPerception.range ?? Infinity) : 0,
    preview: false,
    disabled: false
  };
  // @ts-expect-error protected _getVisionBlindedStates
  const blinded: Record<string, boolean> = tk._getVisionBlindedStates();
  const key = JSON.stringify([data, blinded, checkVisionGeneration]);
  const cached = checkVisionSources.get(tk);
  if (cached?.key === key) return cached.source;
  const source = newCheckVisionSource(tk);
  Object.assign(source.blinded, blinded);
  source.initialize(data);
  if (!source.los) {
    // @ts-expect-error protected
    source.shape = source._createRestrictedPolygon();
    source.los = source.shape;
  }
  checkVisionSources.set(tk, { key, source });
  return source;
}
export function _canSenseModes(token: Token.Implementation, target: Token.Implementation, validModesParam: Array<string> = ["all"], options: SenseOptions = {}): Array<string> {
  const detectionModes = CONFIG.Canvas.detectionModes;
  const DetectionModeCONST = foundry.canvas.perception.DetectionMode;
  if (!token || !target) return ["noToken"];
  if (target.document.hidden || token.document.hidden) return [];
  if (!token.hasSight && !options.forceVision && !configSettings.optionalRules.invisVision) return ["senseAll"];
  const tokenDetectionModes = checkDetectionModes(token);
  const vision = checkVisionSource(token, tokenDetectionModes);
  const matchedModes: Set<string> = new Set();
  // Determine the array of offset points to test.
  // Inner ring at t (min dimension / 4) matches Foundry's standard tolerance.
  // Outer ring at t2 (min dimension / 2 - 2) tests near the token boundary,
  // catching narrow visible slivers that the inner ring misses.
  const t = Math.min(target.w, target.h) / 4;
  const t2 = Math.min(target.w, target.h) / 2 - 2;
  const targetPoint = target.center;
  const offsets = t > 0 ? [
    [0, 0], [-t, -t], [-t, t], [t, t], [t, -t], [-t, 0], [t, 0], [0, -t], [0, t],
    [-t2, -t2], [-t2, t2], [t2, t2], [t2, -t2], [-t2, 0], [t2, 0], [0, -t2], [0, t2]
  ] : [[0, 0]];
  const tests = offsets.map(o => ({
    point: new PIXI.Point(targetPoint.x + o[0], targetPoint.y + o[1]),
    elevation: target?.document.elevation ?? 0,
    los: new Map()
  }));
  const config = { tests, object: target };
  const modes = CONFIG.Canvas.detectionModes;
  let validModes = new Set(validModesParam);

  // Pre-populate the LOS cache using direct ray casting against walls.
  // This is more precise than visionSource.los.contains() which uses a polygon
  // approximation (ClockwiseSweepPolygon) that can miss narrow visible corridors
  // through wall gaps. Foundry uses this same testCollision approach for restricted
  // vision angles; we extend it to 360° vision for accuracy.
  if (vision) {
    const origin = { x: vision.x, y: vision.y };
    for (const test of tests) {
      const collision = CONFIG.Canvas.polygonBackends.sight.testCollision(
        origin,
        test.point,
        { type: "sight", mode: "any", source: vision, useThreshold: true, priority: vision.priority }
      );
      test.los.set(vision, !collision);
    }
  }

  const lightSources = canvas.effects?.lightSources;
  for (const lightSource of (lightSources ?? [])) {
    if (/*!lightSource.data.vision ||*/ !lightSource.active || lightSource.data.disabled) continue;
    if (!validModes.has(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID) && !validModes.has("all")) continue;
    const result = lightSource.testVisibility && lightSource.testVisibility(config);
    if (result === true) matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
  }

  const lightPerception = tokenDetectionModes.find(m => m.id === modes.lightPerception?.id);
  if (lightPerception && ["lightPerception", "all"].some(mode => validModes.has(mode))) {
    // @ts-expect-error DetectionMode somehow different from TokenDetectionMode?
    const result = (lightPerception && vision) ? modes.lightPerception.testVisibility(vision, lightPerception, config) : false;
    if (result === true)
      matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
  }

  const basic = tokenDetectionModes.find(m => m.id === DetectionModeCONST.BASIC_MODE_ID);
  if (basic && ["basicSight", "all"].some(mode => validModes.has(mode))) {
    // @ts-expect-error DetectionMode somehow different from TokenDetectionMode?
    const result = vision ? modes.basicSight.testVisibility(vision, basic, config) : false;
    if (result === true)
      matchedModes.add(detectionModes.basicSight?.id ?? DetectionModeCONST.BASIC_MODE_ID);
  }
  for (const detectionMode of tokenDetectionModes) {
    if (detectionMode.id === DetectionModeCONST.BASIC_MODE_ID) continue;
    if (!detectionMode.enabled) continue;
    const dm = modes[detectionMode.id as string];
    if (validModes.has("all") || validModes.has(detectionMode.id as string)) {
      // @ts-expect-error DetectionMode somehow different from TokenDetectionMode?
      const result = vision ? dm?.testVisibility(vision, detectionMode, config) : false;
      if (result === true) {
        matchedModes.add(detectionMode.id as string);
      }
    }
  }
  return Array.from(matchedModes);
}

export function tokensForActor(actorRef: Actor.Implementation | string | undefined | null): Token.Implementation[] {
  let actor: Actor | null;
  if (!actorRef) return []
  if (typeof actorRef === "string") actor = fromActorUuid(actorRef);
  else actor = actorRef;
  if (!(actor instanceof Actor)) return [];
  if (actor.token) return [actor.token.object].filter(t => !!t);
  const tokens = actor.getActiveTokens();
  if (!tokens.length) return [];
  const controlled = tokens.filter(t => t.controlled);
  return controlled.length ? controlled : tokens;
}

export function tokenForActor(actor: Actor.Implementation | string | undefined | null): Token | undefined {
  const tokens = tokensForActor(actor);
  return tokens[0];
}

export async function doConcentrationCheck(actor: Actor.Implementation, saveDC: number) {
  // actually activity uuids
  //@ts-expect-error no dnd5e-types
  const concentratingOnItemNames = Array.from(actor.concentration.items).map((item) => item.name);
  if (!concentratingOnItemNames.length) concentratingOnItemNames.push("No item");

  const itemDisplayName = `${concentrationCheckItemDisplayName}: ${concentratingOnItemNames.join(", ")}`;
  const itemData: Item.CreateData = {
    name: itemDisplayName,
    // @ts-expect-error no dnd5e-types
    type: "feat",
    img: "./modules/midi-qol/icons/concentrate.png",
    system: {
      activities: {
        concentrationCheck: {
          type: "save",
          activation: {
            type: "special",
          },
          target: {
            affects: {
              choice: false,
              count: "",
              type: "self"
            },
            override: true,
            prompt: false
          },
          damage: {
            parts: [],
            onSave: "half"
          },
          save: {
            // @ts-expect-error no dnd5e-types
            ability: actor.system.attributes.concentration.ability || "con",
            dc: {
              calculation: "",
              formula: `${saveDC}`,
            }
          },
          useConditionText: "",
          forceDialog: false,
          effectConditionText: "",
        }
      },
      identifier: "concentration-check-midi-qol",
    },
    flags: {
      "midi-qol": {
        onUseMacroName: "[postActiveEffects]ItemMacro",
        isConcentrationCheck: true,
        noProvokeReaction: true,
      },
      dae: {
        macro: {
          _id: null,
          name: "Concentration Check - Midi QOL",
          type: "script",
          author: "devnIbfBHb74U9Zv",
          img: "icons/svg/dice-target.svg",
          scope: "global",
          command: `
            if (MidiQOL.configSettings().autoCheckSaves === 'none') return;
            for (let targetUuid of args[0].targetUuids) {
              let target = await fromUuid(targetUuid);
              if (MidiQOL.configSettings().removeConcentration && (target.actor.system.attributes.hp.value === 0 || args[0].failedSaveUuids.find(uuid => uuid === targetUuid))) {
                await target.actor.endConcentration();
              }
            }`
          ,
          folder: null,
          sort: 0,
          flags: {}
        }
      }
    }
  }

  // foundry.utils.setProperty(itemData, "name", itemDisplayName);
  return await _doConcentrationCheck(actor, itemData)
}

async function _doConcentrationCheck(actor: Actor.Implementation, itemData: Item.CreateData) {
  let result: any;
  // actor took damage and is concentrating....
  foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.syntheticItem`, true);
  let ownedItem = new CONFIG.Item.documentClass(itemData, { parent: actor });
  ownedItem.prepareData();
  // @ts-expect-error no dnd5e-types
  ownedItem.prepareFinalAttributes();
  try {
    const midiOptions = { checkGMStatus: true, isConcentrationCheck: true, createWorkflow: true, workflowOptions: { versatile: false, targetConfirmation: "none" } }
    result = await completeItemUse(ownedItem, { midiOptions }, { configure: false }, { systemCard: false }); // worried about multiple effects in flight so do one at a time
  } catch (err) {
    const message = "midi-qol | doConcentrationCheck";
    TroubleShooter.recordError(err, message);
    console.warn(message, err);
  } finally {
    return result;
  }
}

export function hasDAE(workflow: Workflow) {
  return installedModules.get("dae") && (
    workflow.item.effects?.some(ef => ef?.transfer === false)
    || workflow.ammunition?.effects?.some(ef => ef?.transfer === false)
  );
}


export async function displayDSNForRoll(rolls?: Roll | Roll[], rollType?: string, defaultRollMode?: string, saveDisplay?: string, actor?: Actor.Implementation | null) {
  if (!rolls) return;
  if (!(rolls instanceof Array)) rolls = [rolls];
  // Dice So Nice hides NPC rolls only for the chat messages it animates itself. Without an actor (e.g. another module
  // showing a workflow's damage), as DSN: the speaker of the card the rolls belong to.
  // @ts-expect-error originatingMessage is a custom roll option
  const card = game.messages?.get(rolls.find(r => r.options?.originatingMessage)?.options.originatingMessage);
  actor ??= card ? ChatMessage.getSpeakerActor(card.speaker) as Actor.Implementation | null : null;
  // @ts-expect-error no dsn types
  if (dice3dEnabled() && actor && !actor.hasPlayerOwner && game.settings.get("dice-so-nice", "hideNpcRolls")) {
    DSNMarkDiceDisplayed(rolls);
    return;
  }
  /*
  "midi-qol.hideRollDetailsOptions": {
    "none": "None",
    "detailsDSN": "Roll Formula but show DSN roll",
    "details": "Roll Formula",
    "d20Only": "Show attack D20 + Damage total",
    "hitDamage": "Show Hit/Miss + damage total",
    "hitCriticalDamage": "Show Hit/Miss/Critical/Fumble + damage total",
    "d20AttackOnly": "Show attack D20 Only",
    "all": "Entire Roll"
  },*/
  const promises: Promise<any>[] = [];

  for (let roll of rolls) {
    if (dice3dEnabled()) {
      //@ts-expect-error game.dice3d
      const dice3d = game.dice3d;
      let ghostRoll = false;
      let whisperUsers: User.Implementation[] | null = null;
      const rollMode = defaultRollMode || game.settings.get("core", "rollMode");
      let hideRoll = false;
      if (game.user?.isGM) {
        let dsnSetting: string = "show";
        switch (rollType) {
          case "attackRollD20":
          case "attackRoll":
            dsnSetting = configSettings.gmAttackDsn ?? "show";
            break;
          case "damageRoll":
            dsnSetting = configSettings.gmDamageDsn ?? "show";
            break;
          default:
            dsnSetting = "show";
            break;
        }
        if (dsnSetting === "none") {
          hideRoll = true;
        } else if (dsnSetting === "ghost") {
          ghostRoll = true;
        } else if (rollType === "attackRollD20") {
          // For d20-only display, hide non-d20 dice from the animation
          for (let i = 1; i < roll.dice.length; i++) {
            roll.dice[i].results.forEach(r => foundry.utils.setProperty(r, "hidden", true));
          }
        }
      }
      if (!ghostRoll) {
        ghostRoll = rollMode === "blindroll";
      }

      if (rollMode === "selfroll" || rollMode === "gmroll" || rollMode === "blindroll") {
        whisperUsers = ChatMessage.getWhisperRecipients("GM") as unknown as User[];
        if (rollMode !== "blindroll" && game.user) whisperUsers.concat(game.user as unknown as User);
      }
      if (!hideRoll) {
        let displayRoll = Roll.fromData(JSON.parse(JSON.stringify(roll))); // make a copy of the roll
        if (game.user?.isGM && configSettings.addFakeDice) {
          for (let term of displayRoll.terms) {
            if (term instanceof foundry.dice.terms.Die) {
              // for attack rolls only add a d20 if only one was rolled - else it becomes clear what is happening
              if (["attackRoll", "attackRollD20"].includes(rollType ?? "") && term.faces === 20 && term.number !== 1) continue;
              let numExtra = Math.ceil((term.number ?? 1) * Math.random());
              let extraDice = await (new foundry.dice.terms.Die({ faces: term.faces, number: numExtra }).evaluate());
              term.number = (term.number ?? 1) + numExtra;
              term.results = term.results.concat(extraDice.results);
            }
          }
        }
        displayRoll.terms.forEach(term => {
          if (term.options?.flavor) term.options.flavor = (term.options.flavor as string).toLocaleLowerCase();
          // @ts-expect-error no dnd5e-types
          else term.options.flavor = displayRoll.options.type;
        });
        if (ghostRoll) {
          promises.push(dice3d?.showForRoll(displayRoll, game.user, true, ChatMessage.getWhisperRecipients("GM"), !game.user?.isGM));
          //@ts-expect-error
          if (game.settings.get("dice-so-nice", "showGhostDice")) {
            // @ts-expect-error
            displayRoll.ghost = true;
            promises.push(dice3d?.showForRoll(displayRoll, game.user, true, game.users?.players.map(u => (u as User).id), game.user?.isGM));
          }
        } else
          promises.push(dice3d?.showForRoll(displayRoll, game.user, true, whisperUsers, rollMode === "blindroll" && !game.user?.isGM));
      }
    }

  }
  if (promises.length) await Promise.all(promises);
  //mark all dice as shown - so that toMessage does not trigger additional display on other clients
  DSNMarkDiceDisplayed(rolls);
}

export function DSNMarkDiceDisplayed(rolls: Roll | Roll[]) {
  if (rolls instanceof Roll) rolls = [rolls];
  for (let roll of rolls)
    roll.dice.forEach(d => d.results.forEach(r => foundry.utils.setProperty(r, "hidden", true)));
}

export function isReactionItem(item?: Item.Implementation): boolean {
  if (!item) return false;
  // @ts-expect-error no dnd5e-types
  return item.system.activities.some(activity => activity.activation?.type?.includes("reaction"));
}

export function getCriticalDamage() {
  return game.user?.isGM ? criticalDamageGM : criticalDamage;
}

export function isValidTarget(target: TokenOrDocument): boolean {
  if (!target.actor) return false; // Tokens without actors are not valid targets
  // @ts-expect-error no dnd5e-types
  if (target.actor.type === "group") return false;
  if (target.actor.getFlag(MODULE_ID, "neverTarget")) return false;
  if (target instanceof TokenDocument) {
    if (target.isSecret) return false;
    if (target.hidden) return false; // hidden tokens are not valid targets
  } else {
    if (target.document.isSecret) return false;
    if (target.document.hidden) return false; // hidden tokens are not valid targets
  }
  return true;
}

function contestedRollFlavor(baseFlavor: string | undefined, rollType: string, ability: string): string {
  let flavor: string | undefined;
  if (rollType === "test" || rollType === "abil") {
    const label = GameSystemConfig.abilities[ability]?.label ?? ability;
    flavor = game.i18n?.format("DND5E.AbilityPromptTitle", { ability: label });
  } else if (rollType === "save") {
    const label = GameSystemConfig.abilities[ability].label;
    flavor = game.i18n?.format("DND5E.SavePromptTitle", { ability: label });
  } else if (rollType === "skill") {
    flavor = game.i18n?.format("DND5E.SkillPromptTitle", { skill: GameSystemConfig.skills[ability]?.label ?? "" });
  }
  return `${baseFlavor ?? i18n("midi-qol.ContestedRoll")} ${flavor}`;
}

export function validRollAbility(rollType: string, ability: string): string | undefined {
  if (typeof ability !== "string") return undefined;
  ability = ability.toLocaleLowerCase().trim();
  switch (rollType) {
    case "test":
    case "abil":
    case "save":
      if (GameSystemConfig.abilities[ability]) return ability;
      return Object.keys(GameSystemConfig.abilities).find(abl => GameSystemConfig.abilities[abl].label.toLocaleLowerCase() === ability.trim().toLocaleLowerCase())
    case "skill":
      if (GameSystemConfig.skills[ability]) return ability;
      return Object.keys(GameSystemConfig.skills).find(skl => GameSystemConfig.skills[skl].label.toLocaleLowerCase() === ability.trim().toLocaleLowerCase())
    default: return undefined;
  }
}

export async function contestedRoll(data: {
  source: { rollType: string, ability: string, token: TokenOrDocument | string, rollOptions: any },
  target: { rollType: string, ability: string, token: TokenOrDocument | string, rollOptions: any },
  displayResults: boolean,
  itemCardUuid: string,
  flavor: string,
  rollOptions: any,
  success: (results) => {}, failure: (results) => {}, drawn: (results) => {}
}): Promise<{ result: number | undefined, rolls: any[] }> {
  const source = data.source;
  const target = data.target;
  const sourceToken = getToken(source?.token);
  const targetToken = getToken(target?.token);
  const { rollOptions, success, failure, drawn, displayResults, itemCardUuid, flavor } = data;

  let canProceed = true;
  if (!source || !target || !sourceToken || !targetToken || !source.rollType || !target.rollType || !source.ability || !target.ability || !validRollAbility(source.rollType, source.ability) || !validRollAbility(target.rollType, target.ability)) {
    error(`contestRoll | source[${sourceToken?.name}], target[${targetToken?.name}], source.rollType[${source.rollType}], target.rollType[${target?.rollType}], source.ability[${source.ability}], target.ability[${target?.ability}] must all be defined`);
    canProceed = false;
  }
  if (!["test", "abil", "save", "skill"].includes(source?.rollType ?? "")) {
    error(`contestedRoll | sourceRollType must be one of test/abil/skill/save not ${source.rollType}`);
    canProceed = false;
  }
  if (!["test", "abil", "save", "skill"].includes(target?.rollType ?? "")) {
    error(`contestedRoll | target.rollType must be one of test/abil/skill/save not ${target.rollType}`);
    canProceed = false;
  }
  if (!canProceed) return { result: undefined, rolls: [] }

  const sourceDocument = sourceToken!.document;
  const targetDocument = targetToken!.document;

  source.ability = validRollAbility(source.rollType, source.ability) ?? "";
  target.ability = validRollAbility(target.rollType, target.ability) ?? "";

  let player1 = playerFor(sourceToken);
  if (!player1?.active) player1 = preferredActiveGM();
  let player2 = playerFor(targetToken);
  if (!player2?.active) player2 = preferredActiveGM();
  if (!player1 || !player2) return { result: undefined, rolls: [] };
  // Normalize roll types for SaveDetails
  const normalizeRollType = (rt: string): string => {
    if (rt === "abil" || rt === "test") return "check";
    return rt.trim();
  };

  // Build SaveDetails for each participant
  const buildContestedSaveDetails = (
    actorUuid: string,
    rollType: string,
    abilityOrSkill: string
  ): SaveDetails => {
    const normalizedType = normalizeRollType(rollType);
    const isSkill = rollType === "skill";
    return {
      actorUuid,
      advantage: undefined,
      disadvantage: undefined,
      modifierTracker: undefined,
      isFriendly: false,
      isMagicSave: false,
      isConcentrationCheck: undefined,
      rollDC: 0,
      saveItemUuid: "",
      workflowId: "",
      itemCardUuid: itemCardUuid ?? "",
      workflowOptions: {},
      rollType: normalizedType,
      rollAbilities: isSkill ? [] : [abilityOrSkill.trim()],
      rollSkills: isSkill ? [abilityOrSkill.trim()] : [],
      rollTools: [],
      itemId: "",
    };
  };

  const sourceSaveDetails = buildContestedSaveDetails(
    sourceDocument?.actor?.uuid ?? "",
    source.rollType,
    source.ability
  );
  const targetSaveDetails = buildContestedSaveDetails(
    targetDocument?.actor?.uuid ?? "",
    target.rollType,
    target.ability
  );

  const resultPromises = [
    socketlibSocket.executeAsUser("rollAbility", player1.id, {
      saveDetails: sourceSaveDetails,
      displayOptions: { chatMessage: true }
    }),
    socketlibSocket.executeAsUser("rollAbility", player2.id, {
      saveDetails: targetSaveDetails,
      displayOptions: { chatMessage: true }
    }),
  ];

  let results = await Promise.all(resultPromises);
  let roll1 = results[0];
  let roll2 = results[1];
  if (roll1 instanceof Array) roll1 = roll1[0];
  if (roll2 instanceof Array) roll2 = roll2[0];
  let result: number | undefined = roll1.total - roll2.total;
  if (isNaN(result)) result = undefined;
  if (displayResults !== false) {
    let resultString: string;
    if (result === undefined) resultString = "";
    else resultString = result > 0 ? i18n("midi-qol.save-success") : result < 0 ? i18n("midi-qol.save-failure") : result === 0 ? i18n("midi-qol.save-drawn") : "no result"
    const skippedString = i18n("midi-qol.Skipped");
    const content = `${flavor ?? i18n("midi-qol.ContestedRoll")} ${resultString} ${roll1.total ?? skippedString} ${i18n("midi-qol.versus")} ${roll2.total ?? skippedString}`;
    displayContestedResults(itemCardUuid, content, ChatMessage.getSpeaker({ token: sourceToken }), flavor);
  }

  const rollsToReturn = [roll1, roll2];
  if (result === undefined) return { result, rolls: rollsToReturn };
  if (result > 0 && success) success(rollsToReturn);
  else if (result < 0 && failure) failure(rollsToReturn);
  else if (result === 0 && drawn) drawn(rollsToReturn)
  return { result, rolls: rollsToReturn };
}

function displayContestedResults(chatCardUuid: string | undefined, resultContent: string, speaker: ChatMessage.SpeakerData, flavor: string | undefined) {
  let itemCard = (getCachedDocument(chatCardUuid) ?? fromUuidSync(chatCardUuid)) as ChatMessage.Implementation | undefined;
  if (itemCard) {
    let content: string = foundry.utils.duplicate(itemCard.content ?? "")
    const searchRE = /<div class="midi-qol-saves-display">[\s\S]*?<div class="end-midi-qol-saves-display">/;
    const replaceString = `<div class="midi-qol-saves-display">${resultContent}<div class="end-midi-qol-saves-display">`;
    content = content.replace(searchRE, replaceString);
    itemCard.update({ content: compactCardContent(content) });
  } else {
    // const title = `${flavor ?? i18n("miidi-qol:ContestedRoll")} results`;
    ChatMessage.create({ content: `<p>${resultContent}</p>`, speaker });
  }
}

export function hasWallBlockingCondition(target: TokenOrDocument): boolean {
  return globalThis.MidiQOL.WallsBlockConditions.some(cond => hasCondition(target.actor, cond));
}

export function getActor(actorRef?: Actor.Implementation | TokenOrDocument | string | null): Actor.Implementation | undefined | null {
  if (!actorRef) return null;
  const entity = (typeof actorRef === "string") ? fromUuidSync(actorRef) : actorRef;
  if (entity instanceof Actor) return entity;
  if (entity instanceof Token) return entity.actor;
  if (entity instanceof TokenDocument) return entity.actor;
  if (entity instanceof Item && entity.parent instanceof Actor) return entity.parent;
  if (entity instanceof ActiveEffect && entity.parent instanceof Actor) return entity.parent;
  if (entity instanceof ActiveEffect && entity.parent instanceof Item && entity.parent.parent instanceof Actor) return entity.parent.parent;
  return null;
}

export function getTokenDocument(tokenRef?: Actor.Implementation | TokenOrDocument | string | null): TokenDocument.Implementation | undefined {
  if (!tokenRef) return undefined;
  const entity = (typeof tokenRef === "string") ? fromUuidSync(tokenRef) : tokenRef;
  if (entity instanceof TokenDocument) return entity;
  if (entity instanceof Token) return entity.document;
  if (entity instanceof Actor) return tokenForActor(entity)?.document;
  return undefined;
}

export function getToken(tokenRef?: Actor.Implementation | TokenOrDocument | string | null): Token.Implementation | undefined {
  if (!tokenRef) return undefined;
  const entity = (typeof tokenRef === "string") ? fromUuidSync(tokenRef) : tokenRef;
  if (entity instanceof Token) return entity;
  if (entity instanceof TokenDocument) return entity.object ?? undefined;
  if (entity instanceof Actor) return tokenForActor(entity);
  if (entity instanceof Item && entity.parent instanceof Actor) return tokenForActor(entity.parent);
  if (entity instanceof ActiveEffect && entity.parent instanceof Actor) return tokenForActor(entity.parent);
  if (entity instanceof ActiveEffect && entity.parent instanceof Item && entity.parent.parent instanceof Actor) return tokenForActor(entity.parent?.parent);
  return undefined;
}

export function getPlaceable(tokenRef?: Actor.Implementation | TokenOrDocument | string | foundry.canvas.placeables.PlaceableObject | undefined): foundry.canvas.placeables.PlaceableObject | undefined | null {
  if (!tokenRef) return undefined;
  const entity = (typeof tokenRef === "string") ? fromUuidSync(tokenRef) : tokenRef;
  if (entity instanceof foundry.canvas.placeables.PlaceableObject) return entity;
  if (entity instanceof Actor) return tokenForActor(entity);
  if (entity instanceof Item && entity.parent instanceof Actor) return tokenForActor(entity.parent);
  if (entity instanceof ActiveEffect && entity.parent instanceof Actor) return tokenForActor(entity.parent);
  if (entity instanceof ActiveEffect && entity.parent instanceof Item && entity.parent.parent instanceof Actor) return tokenForActor(entity.parent?.parent);
  if (entity instanceof TokenDocument) return entity.object ?? undefined;
  return undefined;
}

export function calcTokenCover(attacker: TokenOrDocument, target: TokenOrDocument): number {
  const attackerToken = getToken(attacker);
  const targetToken = getToken(target);

  //@ts-expect-error .coverCalc
  const coverCalc = attackerToken?.coverCalculator;
  if (!attackerToken || !targetToken || !coverCalc) {
    let message = "midi-qol | calcTokenCover | failed";
    if (!coverCalc)
      message += " tokencover not installed or cover calculator not found";
    if (!attackerToken)
      message += " atacker token not valid";
    if (!targetToken)
      message += " target token not valid";
    const err = new Error("calcTokenCover failed");
    TroubleShooter.recordError(err, message);
    console.warn(message, err);
    return 0;
  }
  let targetCover = coverCalc.targetCover(target);
  return targetCover;
}

const MaxNameLength = 20;
export function getLinkText(entity?: TokenOrDocument | Actor.Implementation | Item.Implementation | null) {
  if (!entity) return "<unknown>";
  let name = entity.name ?? "unknown";
  if (entity instanceof Token && !configSettings.useTokenNames) name = entity.actor?.name ?? name;
  const uuid = entity instanceof Token ? entity.document.uuid : entity.uuid;
  if (entity instanceof Token) return `@UUID[${uuid}]{${name.slice(0, MaxNameLength - 5)}}`;
  return `@UUID[${uuid}]{${name?.slice(0, MaxNameLength - 5)}}`;
}

export function getTokenName(entity?: TokenOrDocument | null): string {
  const token = getToken(entity);
  if (!token) return "<unknown>";
  return getTokenNameExact(token) ?? "<unkown>";
}

export function getTokenNameExact(entity?: Token.Implementation): string | undefined {
  // Somehow?
  if (!(entity instanceof Token)) return undefined;
  let name: string;
  if (configSettings.useTokenNames) name = entity.name ?? entity.actor?.name ?? "<unknown>";
  else name = entity.actor?.name ?? entity.name ?? "<unknown>";
  const suffix = safeGetGameSetting("hide-npc-names", "tokenHiddenSuffix");
  if (suffix) name = name.replace(` ${suffix}`, "");
  return name;
}

export function getIconFreeLink(entity?: TokenOrDocument | Item | Actor | null) {
  if (!entity) return "<unknown>";
  let name = entity.name ?? "unknown";
  if (entity instanceof Token && !configSettings.useTokenNames) name = entity.actor?.name ?? name;
  if (entity instanceof Token) {
    return name;
    // return `<a class="content-link midi-qol" data-uuid="${entity.actor?.uuid}">${name?.slice(0, MaxNameLength)}</a>`;
  } else {
    return name;
    // return `<a class="content-link midi-qol" data-uuid="${entity.uuid}">${name?.slice(0, MaxNameLength)}</a>`
  }
}

/**
 * Creates a proxy around canvas.grid that makes it behave like a SquareGrid.
 * Used for griddedGridless mode to apply square grid measurement rules to gridless scenes.
 * @returns A proxy that redirects grid methods to SquareGrid.prototype
 */
export function createSquareGridProxy(): foundry.grid.BaseGrid {
  if (!canvas.grid) throw new Error("createSquareGridProxy called without canvas.grid");
  const diagonals = safeGetGameSetting("core", "gridDiagonals");
  const canvasGridProxy: foundry.grid.BaseGrid = new Proxy(canvas.grid, {
    get: function (target, prop, _receiver) {
      if (foundry.grid.SquareGrid.prototype[prop] instanceof Function) {
        return foundry.grid.SquareGrid.prototype[prop].bind(canvasGridProxy);
      } else if (prop === "diagonals") {
        return diagonals;
      } else if (prop === "isSquare") return true;
      else if (prop === "isGridless") return false;
      else if (prop === "isHex") return false;
      return Reflect.get(target, prop);
    }
  });
  return canvasGridProxy;
}

export function midiMeasureDistances(segments: { ray: Ray }[], options: any = {}) {
  let isGridless = canvas.grid?.constructor.name === "GridlessGrid";
  const fudgeFactor = configSettings.gridlessFudge ?? 0;
  // The fudge applies on every scene and grid type, not only the gridded-gridless path below.
  // Floored at 0: a zero gap stays zero, only perimeter measurement floors at one grid unit.
  if (!isGridless || !options.gridSpaces || !configSettings.griddedGridless || !canvas.grid) {
    return segments.map(s => canvas.grid?.measurePath([s.ray.A, s.ray.B], {}))
      .map(d => Math.max(0, (d?.distance ?? 0) - fudgeFactor));
  }
  if (!canvas.grid) return [0];
  const diagonals = safeGetGameSetting("core", "gridDiagonals");
  const canvasGridProxy = createSquareGridProxy();
  const GridDiagonals = CONST.GRID_DIAGONALS;
  // First snap the poins to the nearest center point for equidistant/1,2,1/2,1,2
  // I expected this would happen automatically in the proxy call - but didn't and not sure why.
  if ([GridDiagonals.APPROXIMATE, GridDiagonals.EQUIDISTANT, GridDiagonals.ALTERNATING_1, GridDiagonals.ALTERNATING_2].includes(diagonals)) {
    segments = segments.map(s => {
      const gridPosA = canvasGridProxy.getOffset(s.ray.A);
      const aCenter = canvasGridProxy.getCenterPoint(gridPosA);
      const gridPosB = canvasGridProxy.getOffset(s.ray.B);
      const bCenter = canvasGridProxy.getCenterPoint(gridPosB);
      return { ray: new foundry.canvas.geometry.Ray(aCenter, bCenter) };
    });
  }
  let distances = segments.map(s => canvasGridProxy.measurePath([s.ray.A, s.ray.B], {}));
  return distances.map(d => {
    let distance = d.distance;
    switch (diagonals) {
      case GridDiagonals.EQUIDISTANT:
      case GridDiagonals.ALTERNATING_1:
      case GridDiagonals.ALTERNATING_2:
        // already fudged by snapping so no extra adjustment
        break;
      case GridDiagonals.EXACT:
      case GridDiagonals.RECTILINEAR:
        // @ts-expect-error yes it does
        if (d.diagonals > 0)
          distance = Math.max(0, d.distance - (Math.SQRT2 * fudgeFactor));
        else distance = Math.max(0, d.distance - fudgeFactor);
        break;
      case GridDiagonals.APPROXIMATE:
        // @ts-expect-error yes it does
        if (d.diagonals > 0)
          distance = Math.max(0, d.distance - fudgeFactor);
        break;
      case GridDiagonals.ILLEGAL:
      default:
        distance = d.distance;
    }
    return distance;
  });
}

export function getActivityAutoTargetAction(activity?: Activity): string {
  const item = activity?.item;
  if (!item) return configSettings.autoTarget;
  const autoTarget = activity.midiProperties?.autoTargetAction;
  if (!autoTarget || autoTarget === "default") return configSettings.autoTarget;
  return autoTarget;
}

export function getAoETargetType(activity: Activity): string {
  let AoETargetType: string = "any";
  // think about special = allies, self = all but self and any means everyone.
  const activityTarget = activity.target;
  if (activityTarget) {
    if (activityTarget.affects.type === "ally") AoETargetType = "ally";
    if (activityTarget.affects.type === "enemy") AoETargetType = "enemy";
    if (activityTarget.affects.type === "creature") AoETargetType = "any";
  }
  if (activity.midiProperties?.autoTargetType !== "any") {
    AoETargetType = activity.midiProperties?.autoTargetType ?? "";
  }
  return AoETargetType;
}

export function hasAutoPlaceTemplate(item: Item.Implementation): boolean {
  // @ts-expect-error no dnd5e-types
  return item && item.hasAreaTarget && ["self", undefined].includes(item.system.range?.units) && ["radius", "squareRadius"].includes(item.system.target?.type);
}

export function activityHasAutoPlaceTemplate(activity: Activity) {
  return activity && ["self", undefined].includes(activity.range?.units) && ["radius", "squareRadius"].includes(activity.target?.template.type);
}

export function activityHasEmanationNoTemplate(activity: Activity) {
  return activity && activity.target?.template.type === "emanationNoTemplate";
}

export function addRollTo(roll: Roll, bonusRoll: Roll | Roll.Evaluated<Roll.Any>): Roll {
  const OperatorTerm = foundry.dice.terms.OperatorTerm;
  if (!bonusRoll) return roll;
  if (!roll) return bonusRoll;
  //@ts-expect-error protected
  if (!roll._evaluated) roll = roll.clone().evaluate({ async: false }); // V12
  else {
    for (let term of roll.terms) {
      //@ts-expect-error protected
      if (!term._evaluated && term instanceof OperatorTerm) {
        term.evaluate();
      }
    }
  }
  //@ts-expect-error protected
  if (!bonusRoll._evaluated) bonusRoll = bonusRoll.clone().evaluate({ async: false }) // V12
  let terms;
  for (let term of bonusRoll.terms) {
    //@ts-expect-error protected
    if (!term._evaluated && term instanceof OperatorTerm) {
      term.evaluate();
    }
  }
  if (bonusRoll.terms[0] instanceof OperatorTerm) {
    terms = roll.terms.concat(bonusRoll.terms);
  } else {
    const operatorTerm = new OperatorTerm({ operator: "+" });
    // v13 not required operatorTerm.evaluate();
    terms = roll.terms.concat([operatorTerm]);
    terms = terms.concat(bonusRoll.terms);
  }
  //@ts-expect-error
  let newRoll = roll.constructor.fromTerms(terms);
  newRoll.resetFormula();
  newRoll.options = roll.options;
  return newRoll;
}

export async function chooseEffect({ actor, token, item, workflow, options }: {
  actor: Actor.Implementation;
  token: Token.Implementation;
  item: Item.Implementation;
  workflow: Workflow;
  options?: {
    chooseAll?: boolean;
    timeout?: number;
  }
}) {
  if (!item) return false;
  const effects = item.effects.filter(
    (e) => !e.transfer && !!(options?.chooseAll || e.flags?.dae?.dontApply)
  );
  if (effects.length === 0) {
    if (debugEnabled > 0)
      warn(`chooseEffect | no effects found for ${item.name}`);
    return false;
  }
  let targets = workflow.effectTargets;
  let origin = effects[0].uuid; // item?.uuid;
  if (workflow?.chatCard.getFlag("dnd5e", "use.concentrationId")) {
    origin = workflow.actor.effects.get(workflow.chatCard.getFlag("dnd5e", "use.concentrationId") ?? "")?.uuid ?? item?.uuid;
  }
  if (!targets || targets.size === 0) return;

  const { DialogV2 } = foundry.applications.api;
  const timeout = options?.timeout ?? configSettings.reactionTimeout ?? defaultTimeout;
  let timeRemaining = timeout;
  let second1TimeoutId: NodeJS.Timeout;
  let timeoutId: NodeJS.Timeout;

  const titleBase = `${i18n('CONTROLS.CommonSelect')} ${i18n('DOCUMENT.ActiveEffect')}`;
  const targetContent = `<p style="text-align:center"><b>${i18n('EFFECT.StatusTarget')}: [</b>${[...targets].map((t) => t.name)}<b>]</b></p>`;

  const buttons = effects.map(effect => ({
    action: effect.uuid,
    label: effect.name,
    callback: () => effect,
  }));

  const chosenEffect = await DialogV2.wait({
    window: { title: `${titleBase}: ${timeRemaining}s` },
    classes: ["midi-qol-choose-effect"],
    position: { width: 220 },
    content: targetContent,
    buttons,
    render: (_event, dialog) => {
      dialog.element.querySelectorAll<HTMLButtonElement>(".form-footer button").forEach((btn) => {
        const eff = fromUuidSync(btn.dataset.action ?? "") as ActiveEffect;
        if (!eff) return;
        const img = document.createElement('img');
        img.src = eff.img as string;
        const span = btn.querySelector("span");
        if (span) span.dataset.tooltip = eff.name;
        btn.prepend(img);
      });
      // Start countdown timer
      const titleEl = dialog.element.querySelector(".window-title");
      const set1SecondTimeout = function () {
        second1TimeoutId = setTimeout(() => {
          if (!timeoutId) return;
          timeRemaining -= 1;
          if (titleEl) titleEl.textContent = `${titleBase}: ${timeRemaining}s`;
          if (timeRemaining > 0) set1SecondTimeout();
        }, 1000);
      };
      timeoutId = setTimeout(() => {
        if (debugEnabled > 0) warn(`chooseEffect | timeout fired closing dialog`);
        clearTimeout(second1TimeoutId);
        dialog.close();
      }, timeout * 1000);
      set1SecondTimeout();
    },
    close: () => {
      clearTimeout(timeoutId);
      clearTimeout(second1TimeoutId);
    },
  });

  if (!chosenEffect || !(chosenEffect instanceof ActiveEffect)) return false;

  const effectData = chosenEffect.toObject();
  effectData.origin = item.uuid;
  foundry.utils.setProperty(effectData, "flags.dae.dontApply", false);
  const applyItem = item.clone({ effects: [effectData] }, { keepId: true })
  await globalThis.DAE.doEffects(
    applyItem, true, targets, {
    damageTotal: 0,
    origin,
    critical: false,
    fumble: false,
    itemCardUuid: "",
    metaData: {},
    selfEffects: "none",
    // @ts-expect-error no dnd5e-types
    spellLevel: (workflow?.spellLevel ?? applyItem.level ?? 0),
    toggleEffect: workflow?.activity.midiProperties?.toggleEffect,
    tokenUuid: token.document.uuid,
    actorUuid: actor.uuid,
    whisper: false,
    workflowOptions: workflow?.workflowOptions,
    context: {
    }
  });
  if (chosenEffect.toObject()) {
    if (debugEnabled)
      warn(
        `chooseEffect | applying effect ${chosenEffect.name} to ${targets.size} targets`,
        targets
      );
  }
  return chosenEffect;
}

export function canSee(tokenEntity: TokenOrDocument, targetEntity: TokenOrDocument, options: SenseOptions = {}) {
  const NON_SIGHT_CONSIDERED_SIGHT = ["blindsight"];
  const detectionModes = CONFIG.Canvas.detectionModes;
  const sightDetectionModes = Object.keys(detectionModes).filter(
    (d) =>
      detectionModes[d].type === foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT ||
      NON_SIGHT_CONSIDERED_SIGHT.includes(d)
  );
  return canSense(tokenEntity, targetEntity, sightDetectionModes, options);
}

export function sumRolls(rolls: Array<Roll> | undefined = [], countHealing?: "ignore" | "negative" | "positive" | "negativeIgnoreTemp" | "positiveIgnoreTemp"): number {
  if (!rolls) return 0;
  if (countHealing === undefined) countHealing = "positive";
  return rolls.reduce((total, roll) => {
    // @ts-expect-error no dnd5e-types
    const type = roll.options.type;
    if (type === "midi-none") return total;
    if (["temphp"].includes(type) && countHealing === "negativeIgnoreTemp") return total;
    if (["temphp"].includes(type) && countHealing === "positiveIgnoreTemp") return total;
    if (["temphp", "healing"].includes(type) && countHealing === "ignore") return total;
    if (["temphp", "healing"].includes(type) && countHealing?.startsWith("negative")) return total - (roll?.total ?? 0);
    return total + (roll?.total ?? 0);
  }, 0);
}

/* Looks like this is not needed
const updateSemaphore = new foundry.utils.Semaphore(1);
async function _updateActionS(document: foundry.abstract.Document.Any) {
  await updateSemaphore.add(_updateActionS, document);
}
export async function asyncGetCachedDocument(uuid: string | undefined | null): Promise<ChatMessage.Implementation | undefined> {
  if (!uuid) return undefined;
  if (DebounceInterval) return updateSemaphore.add(getCachedDocument, uuid);
}
*/

export function getThrottlingFunction(): (document: foundry.abstract.Document.Any, updates: ChatMessage.UpdateData) => Promise<void> {
  return foundry.utils.throttle(_updateAction, debounceInterval) as (document: foundry.abstract.Document.Any, updates: ChatMessage.UpdateData) => Promise<void>;
}
export const updatesCache = {};
async function _updateAction(document: foundry.abstract.Document.Any, updates: ChatMessage.UpdateData) {
  if (!updates) {
    if (debugEnabled > 0) warn(`_updateAction | No updates found for ${document.uuid}`);
    return document;
  }
  const baseDocument = fromUuidSync(document.uuid) as ChatMessage.Implementation;
  if (!baseDocument) {
    console.warn(`midi-qol | _updateAction | baseDocument not found for ${document.uuid}`);
    return document;
  }
  /* Simulate a slow machine
     updates are passed to the update call - effectively copied at that point.
     Then there are no changes to the chat card until the call returns.
     This creates an opportunity for changes to cached updates which can then be lost if they are cleared
     */
  const updateDelay = 0;
  if (debugEnabled) warn("_updateAction | Starting for", Date.now(), updates)
  delete updates._id
  if (updateDelay) {
    await busyWait(updateDelay); // let other stuff happen.
  }
  //console.warn("Doing chat update", foundry.utils.duplicate(updates));
  await baseDocument?.update(updates);
  if (updateDelay) {
    await busyWait(updateDelay); // let other stuff happen.
  }
  updatesCache[baseDocument.uuid] = foundry.utils.diffObject(updates, updatesCache[baseDocument.uuid] ?? {});
  if (debugEnabled > 1 && updates.content && updatesCache[baseDocument.uuid]?.content)
    warn("_updateAction | queued content differences ", diffStringsFull(updates.content, updatesCache[baseDocument.uuid].content, { ignoreWhitespace: true, ignoreNewlines: true }));
  if (debugEnabled) warn("_updateAction | post update updatesCache", Date.now(), updates);
}

const CARD_DESCRIPTION_RE = /<section class="card-header[\s\S]*?<\/section>\s*<\/section>/;

/** Drop template indentation. One space, not none, so inline elements aren't run together. */
export const compactHTML = (html: string) => html.replace(/[ \t]*\n[ \t]*/g, " ");

/** Compact midi's card markup. Idempotent. The item description is authored prose, so left alone. */
export function compactCardContent(content: string): string {
  if (!content) return content;
  const description = content.match(CARD_DESCRIPTION_RE)?.[0];
  if (!description) return compactHTML(content);
  const at = content.indexOf(description);
  return compactHTML(content.slice(0, at)) + description + compactHTML(content.slice(at + description.length));
}

// NOTE: Typed as a ChatMessage since that's all we use it for
export async function throttledUpdate(document: ChatMessage.Implementation, updates: ChatMessage.UpdateData, throttlingFunc: undefined | ((document: ChatMessage.Implementation, updates: ChatMessage.UpdateData) => Promise<void>) = undefined, immediate = false) {
  if (!document) return; // ChatCard was removed already?;
  updates = foundry.utils.expandObject(updates) as typeof updates;
  if (typeof updates.content === "string") updates.content = compactCardContent(updates.content);
  updates = foundry.utils.mergeObject((updatesCache[document.uuid] ?? {}), updates, { inplace: false, overwrite: true })
  updatesCache[document.uuid] = updates;
  if (!debounceInterval || immediate || !throttlingFunc) {
    if (debugEnabled > 0) warn(`throttledU[date] | immediate update for ${document.uuid}`, updates);
    return await _updateAction(document, foundry.utils.duplicate(updates) as ChatMessage.UpdateData);
  }
  return await throttlingFunc(document, foundry.utils.duplicate(updates) as ChatMessage.UpdateData);
}
export function getUpdatesCache(uuid: string | undefined | null) {
  if (!uuid) return {};
  return updatesCache[uuid] ?? {};
}

export function addUpdatesCacheFlags(uuid: string | undefined | null, updates: any, prepend = MODULE_ID) {
  if (!uuid) return;
  if (prepend) updates = { [prepend]: updates };
  updates = foundry.utils.expandObject({ flags: updates });
  updatesCache[uuid] = foundry.utils.mergeObject(updatesCache[uuid] ?? {}, updates, { insertKeys: true, insertValue: true });
}

export function addUpdatesCache(uuid: string | undefined | null, updates: any) {
  if (!uuid) return;
  updatesCache[uuid] = foundry.utils.mergeObject(updatesCache[uuid] ?? {}, updates, { insertKeys: true, insertValue: true });
}

export function clearUpdatesCache(uuid: string | undefined | null) {
  if (!uuid) return;
  delete updatesCache[uuid];
}


export function getCachedDocument(uuid: string | undefined | null) {
  if (!uuid) return undefined;
  let document = fromUuidSync(uuid) as ChatMessage.Implementation;
  let updates = document?.uuid && updatesCache[document.uuid as string];
  if (!foundry.utils.isEmpty(updates))
    //@ts-expect-error no dnd5e-types - changes not in fvtt types
    document = document.clone(updates, { changes: updates, keepId: true }) as ChatMessage.Implementation;
  return document;
}

export function isEffectExpired(effect: ActiveEffect.Implementation): boolean {
  if (installedModules.get("times-up") && globalThis.TimesUp.isEffectExpired) {
    return globalThis.TimesUp.isEffectExpired(effect);
  }
  // TODO find out how to check some other module can delete expired effects
  // return effect.updateDuration().remaining ?? false;
  // @ts-expect-error types doesn't realize
  return effect.duration.remaining <= 0;
}

export async function expireEffects(actor: Actor.Implementation, effects: ActiveEffect.Implementation[], options: any): Promise<any> {
  if (!effects) return {};
  const actorEffectsToDelete: string[] = [];
  const effectsToDelete: ActiveEffect[] = [];
  const effectsToDisable: ActiveEffect[] = [];
  for (let effect of effects) {
    if (!effect.id) continue;
    if (!fromUuidSync(effect.uuid)) continue;
    if (effect.transfer)
      effectsToDisable.push(effect);
    else if (effect.parent instanceof Actor)
      actorEffectsToDelete.push(effect.id);
    else if (effect.parent instanceof Item) // this should be enchantments
      effectsToDelete.push(effect);
  }
  if (actorEffectsToDelete.length > 0) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", actorEffectsToDelete, options);
  }
  if (effectsToDisable.length > 0) {
    for (let effect of effectsToDisable) {
      await effect.update({ "disabled": true }, options)
    }
  }
  if (effectsToDelete.length > 0) {
    for (let effect of effectsToDelete)
      await effect.delete(options);
  }
  return { deleted: actorEffectsToDelete, disabled: effectsToDisable, itemEffects: effectsToDelete };
}

/** Concentration requests already claimed by this client: a new message renders twice (log and notification). */
const concentrationRequestsHandled = new Set<string>();

export async function processConcentrationRequestMessage(message: ChatMessage.Implementation, html: HTMLElement, data) {
  if (configSettings.doConcentrationCheck !== "chat") return;
  let elt = html.querySelectorAll<HTMLElement>("[data-action=concentration]");
  const hasRolled = foundry.utils.getProperty(message, `flags.${MODULE_ID}.concentrationRolled`);
  if (hasRolled || !preferredActiveGM()?.isSelf || concentrationRequestsHandled.has(message.id!)) return;
  if (elt.length === 1 && !hasRolled) {
    let { action, dc: dcStr, type } = elt[0].dataset;
    let token: Token.Implementation | undefined, actor: Actor.Implementation | undefined | null;
    if (action === "concentration" && type === "midi-concentration") {
      let dc = Number(dcStr);
      let { actor: actorId, alias, scene, token: tokenId } = message.speaker;
      if (scene && tokenId) token = game.scenes?.get(scene)?.tokens.get(tokenId) as Token.Implementation | undefined;
      if (token) actor = token.actor;
      if (!actor && actorId) actor = game.actors?.get(actorId);
      if (actor) {
        // Claimed before the await, so a second render of the same message cannot roll again.
        concentrationRequestsHandled.add(message.id!);
        await message.setFlag(MODULE_ID, "concentrationRolled", true);
        const user = playerForActor(actor);
        if (user?.active) {
          socketlibSocket.executeAsUser("rollConcentration", user.id, { actorUuid: actor.uuid, target: dc, create: true, rollMode: "gmroll" });
          // @ts-expect-error no dnd5e-types
        } else actor.rollConcentration({ legacy: false, target: dc }, {}, { create: true, rollMode: "gmroll" });
      }
    }
  }
}

export function setRollOperatorEvaluated(roll: Roll) {
  // @ts-expect-error protected
  if (!roll._evaluated) return roll;
  roll.terms.forEach(t => {
    // @ts-expect-error protected
    if (!t._evaluated) t.evaluate();
  })
}
export function doSyncRoll(roll: Roll, source: string | undefined) {

  if (!roll.isDeterministic) {
    error(`%c doSyncRoll | dice expressions not supported in v12 [${roll.formula}] and will be ignored ${source}`, "color:red;");
    return new Roll("0").evaluateSync();
  } else
    return roll.evaluateSync()
}

// TODO: See if there's a cleaner way of doing these
export function setRollMinDiceTerm(roll: Roll, minValue: number, count = 1) {
  for (const [i, d] of roll.dice.entries()) {
    if (i >= count) break;
    d.results.forEach(r => {
      if (r.result < minValue) r.result = Math.min(minValue, d.faces ?? 1);
    });
  };
  //@ts-expect-error
  roll._total = roll._evaluateTotal();
  return roll;
}

export function setRollMaxDiceTerm(roll: Roll, maxValue: number, count = 1) {
  for (const [i, d] of roll.dice.entries()) {
    if (i >= count) break;
    d.results.forEach(r => {
      if (r.result > maxValue) r.result = Math.max(1, maxValue);
    });
  };
  //@ts-expect-error
  roll._total = roll._evaluateTotal();
  return roll;
}

export async function addDependent(document: foundry.abstract.Document.Any, dependent: foundry.abstract.Document.Any) {
  if (!document?.uuid) {
    error(`midi-addDependent | document ${document?.name} does not have an uuid`);
    return;
  }
  if (!dependent?.uuid) {
    error(`midi-addDependent | dependent ${dependent?.name} does not have an uuid`);
    return;
  }

  // Always use dnd5e's dependent system - dnd5e's DependentDocumentMixin handles tracking
  // When the parent (Actor/Item/Effect/Template) is deleted, midi-qol's hooks handle cleanup
  //@ts-expect-error
  if (game.user?.isGM || dependent.isOwner) {
    //@ts-expect-error
    return dependent.setFlag("dnd5e", "dependentOn", document.uuid);
  } else {
    return unTimedExecuteAsGM("addDependent", { documentUuid: document.uuid, dependentUuid: dependent.uuid });
  }
}

export async function addConcentrationDependent(actorRef: TokenOrDocument | Actor.Implementation | string, dependent: foundry.abstract.Document.Any, item?: Item.Implementation) {
  if (dependent instanceof Token) dependent = dependent.document;
  if (!dependent.uuid) {
    console.warn(`midi-qol | addConcentrationDependent | dependent ${dependent?.name} must have a uuid`);
    return undefined;
  }
  const actor = getActor(actorRef);
  if (!actor) {
    console.warn(`midi-qol | addConcentrationDependent | actor not found for ${actorRef}`);
    return undefined;
  }

  if (!item) {
    log("addConcentrationDependent | item not supplied - using any concentration effect");
  }
  const concentrationEffect = getConcentrationEffect(actor, item);
  if (!concentrationEffect) {
    console.warn(`midi-qol | addConcentrationDependent | dnd5e concentration effect not found for ${actor.name} ${item?.name ?? "no item"}`);
    return undefined;
  }
  if (game.user?.isGM || actor.isOwner) {
    //@ts-expect-error dnd5e.dependentOn
    return dependent.setFlag("dnd5e", "dependentOn", concentrationEffect.uuid)
  } else
    return unTimedExecuteAsGM("addDependent", { documentUuid: concentrationEffect.uuid, dependentUuid: dependent.uuid });
}

export function getAppliedEffects(actor: Actor.Implementation | null | undefined, { includeEnchantments }: { includeEnchantments: boolean }) {
  if (!actor) return [];
  let effects = actor.appliedEffects;
  if (includeEnchantments) {
    // @ts-expect-error no dnd5e-types
    const enchantments = actor.items.contents.flatMap(i => i.effects.contents).filter(ae => ae.isAppliedEnchantment);
    effects = effects.concat(enchantments);
  }
  return effects;
}

export function getCEEffectByName(name: string) {
  return ceInterface?.findEffect({ effectName: name });
}
export async function CEAddEffectWith(options: { uuid: string, effectName?: string, effectId?: string, origin?: any, effectData?: any, overlay: boolean }) {
  return ceInterface?.addEffect(options);
}

export async function CERemoveEffect(options: { effectName: string, uuid: string, effectId?: string, origin?: string }) {
  return ceInterface?.removeEffect(options);
}

export async function CEToggleEffect(options: { effectName?: string, uuid: string, effectId?: string, origin?: string, overlay?: boolean }) {
  const { effectName, uuid, effectId, origin, overlay } = options;
  return ceInterface?.toggleEffect({ uuids: [uuid], effectName, effectId, origin, overlay });
}

export function CEHasEffectApplied(options: { effectName: string, uuid: string, effectId?: string, origin?: string }): boolean {
  return !!ceInterface?.hasEffectApplied(options);
}

export function isConvenientEffect(effect: ActiveEffect.Implementation): boolean {
  return !!(effect?.flags?.["dfreds-convenient-effects"]?.isConvenient);
}

export function getActivityDefaultDamageType(workflow: Workflow): string {
  let defaultDamageType = workflow.activity.damage?.parts[0]?.types.first();
  if (defaultDamageType) return defaultDamageType;
  if (workflow.defaultDamageType) defaultDamageType = workflow.defaultDamageType;
  if (!defaultDamageType) defaultDamageType = MidiQOL.MQdefaultDamageType;
  return defaultDamageType;
}

export function activityHasAreaTarget(activity?: Activity): boolean {
  return (activity?.target?.template.type ?? "") in GameSystemConfig.areaTargetTypes
}

export interface ConvertedDuration {
  type: "turns" | "seconds" | "none";
  seconds: number | undefined;
  rounds: number | undefined;
  turns: number | undefined;
}

/**
 * Converts activity/item duration to effect duration format.
 * Returns seconds for world time tracking, or rounds/turns for combat tracking.
 *
 * @param durationData - Duration with units and value
 * @param inCombat - Whether the actor is currently in combat
 * @param maxRoundsForTurns - Maximum rounds before switching to seconds (default 10)
 * @returns Converted duration with type, seconds, rounds, and turns
 */
export function convertDuration(
  durationData: { units: string; value: number } | undefined,
  inCombat: boolean,
  maxRoundsForTurns: number = 10
): ConvertedDuration {
  const timesUpActive = installedModules.get("times-up");
  const useTurns = inCombat && timesUpActive;
  const roundTime = CONFIG.time.roundTime ?? 6;

  // No duration or invalid - return minimal duration
  if (!durationData?.units) {
    return useTurns
      ? { type: "turns", seconds: 0, rounds: 0, turns: 1 }
      : { type: "seconds", seconds: 1, rounds: 0, turns: 0 };
  }

  const { units, value } = durationData;

  // Handle special/permanent duration types - no expiry
  if (["spec", "perm", "disp", "dstr"].includes(units)) {
    return { type: "none", seconds: undefined, rounds: undefined, turns: undefined };
  }

  // Handle instantaneous - minimal duration
  if (units === "inst") {
    return useTurns
      ? { type: "turns", seconds: 0, rounds: 0, turns: 1 }
      : { type: "seconds", seconds: 1, rounds: 0, turns: 0 };
  }

  // Handle turn-based durations
  if (["turn", "turns"].includes(units)) {
    return {
      type: useTurns ? "turns" : "seconds",
      seconds: roundTime,
      rounds: 0,
      turns: value
    };
  }

  if (["round", "rounds"].includes(units)) {
    return {
      type: useTurns ? "turns" : "seconds",
      seconds: value * roundTime,
      rounds: value,
      turns: 0
    };
  }

  // Convert time-based durations to seconds using the calendar
  const calendar = game.time?.calendar;
  const secondsPerMinute = calendar?.days?.secondsPerMinute ?? 60;
  const minutesPerHour = calendar?.days?.minutesPerHour ?? 60;
  const hoursPerDay = calendar?.days?.hoursPerDay ?? 24;
  const daysPerWeek = calendar?.days?.values?.length ?? 7;

  const secondsPerHour = secondsPerMinute * minutesPerHour;
  const secondsPerDay = secondsPerHour * hoursPerDay;

  let seconds: number;

  switch (units) {
    case "second":
    case "seconds":
      seconds = value;
      break;
    case "minute":
    case "minutes":
      seconds = value * secondsPerMinute;
      break;
    case "hour":
    case "hours":
      seconds = value * secondsPerHour;
      break;
    case "day":
    case "days":
      seconds = value * secondsPerDay;
      break;
    case "week":
    case "weeks":
      seconds = value * secondsPerDay * daysPerWeek;
      break;
    case "month":
    case "months":
      // Approximate - use 30 days per month
      seconds = value * secondsPerDay * 30;
      break;
    case "year":
    case "years":
      // Approximate - use 365 days per year
      seconds = value * secondsPerDay * 365;
      break;
    default:
      warn(`midi-qol | convertDuration | Unknown duration unit: ${units}`);
      return { type: "none", seconds: undefined, rounds: undefined, turns: undefined };
  }

  const rounds = Math.floor(seconds / roundTime);

  // Use turns for short durations in combat, seconds for longer durations
  if (useTurns && rounds <= maxRoundsForTurns) {
    return { type: "turns", seconds, rounds, turns: 0 };
  }

  return { type: "seconds", seconds, rounds, turns: 0 };
}

export function getSaveRollModeFor(abilityId: string) {
  if (configSettings.rollChecksBlind.includes("all") || configSettings.rollChecksBlind.includes(abilityId))
    return "blindroll";
  return configSettings.autoCheckSaves !== "allShow" ? "gmroll" : "public";
}

export function getCheckRollModeFor(abilityId: string) {
  if (configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes(abilityId))
    return "blindroll";
  return configSettings.autoCheckSaves !== "allShow" ? "gmroll" : "public";
}

/** Whether `action`'s keybinding (midi-qol's by default, or another namespace's such as dnd5e's) is held for `event`. */
export function areMidiKeysPressed(event: AugmentedEvent | undefined, action: string, namespace = "midi-qol") {
  if (!event) return false;
  const activeModifiers = {};
  const KeyBoardManager = game.keyboard;
  //@ts-expect-error
  const MODIFIER_KEYS = KeyBoardManager.constructor.MODIFIER_KEYS;
  //@ts-expect-error
  const MODIFIER_CODES = KeyBoardManager.constructor.MODIFIER_CODES;
  const ClientKeyBindings = game.keybindings;
  const addModifiers = (key, pressed) => {
    activeModifiers[key] = pressed;
    MODIFIER_CODES[key].forEach(n => activeModifiers[n] = pressed);
  };
  addModifiers(MODIFIER_KEYS.CONTROL, event.ctrlKey || event.metaKey);
  addModifiers(MODIFIER_KEYS.SHIFT, event.shiftKey);
  addModifiers(MODIFIER_KEYS.ALT, event.altKey);
  return ClientKeyBindings?.get(namespace, action).some(b => {
    if (KeyBoardManager?.downKeys.has(b.key) && b.modifiers.every(m => activeModifiers[m])) return true;
    if (b.modifiers?.length) return false;
    return activeModifiers[b.key];
  });
}
export function setRangedTargets(tokenToUse: Token.Implementation, targetDetails: Activity["target"]) {
  if (!canvas || !canvas.scene) return true;
  if (!tokenToUse) {
    ui.notifications?.warn(`${i18n("midi-qol.noSelection")}`)
    return true;
  }
  // We have placed an area effect template and we need to check if we over selected
  let dispositions = targetDetails.affects.type === "creature" ? [-1, 0, 1] : targetDetails.affects.type === "ally" ? [tokenToUse.document.disposition] : [-tokenToUse.document.disposition];
  // release current targets
  game.user?.targets.forEach(t => {
    t.setTarget(false, { releaseOthers: false });
  });
  game.user?.targets.clear();
  // min dist is the number of grid squares away.
  let minDist = targetDetails.template.size;
  const targetIds: string[] = [];
  const maxTargets = targetDetails.affects?.count;
  // TODO (Michael): HERE! RIGHT HERE!
  let ignoreToken = (targetDetails.affects.special ?? "").split(";").some(spec => ["-self"].includes(spec)) ? tokenToUse : null;
  if ((targetDetails.affects.special ?? "").split(";").some(spec => "self" === spec)) {
    foundry.utils.logCompatibilityWarning("midi-qol | target specials includes 'self'. Use '-self' to exclude the caster",
      { since: "midi-qol 13.0.19", until: "13.1.0" });
  }
  if (canvas.tokens?.placeables && canvas.grid) {
    const canvasTokens = canvas.tokens?.placeables;
    if (canvasTokens) for (let target of canvasTokens) {
      const targetDocument: TokenDocument = target.document;

      if (maxTargets !== "" && (targetIds.length ?? 0) >= Number(maxTargets)) break;
      if (!isValidTarget(target)) continue;
      const ray = new foundry.canvas.geometry.Ray(target.center, tokenToUse.center);
      const wallsBlock = ["wallsBlock", "wallsBlockIgnoreDefeated", "wallsBlockIgnoreIncapacitated"].includes(configSettings.rangeTarget)
      let inRange = target.actor && dispositions.includes(targetDocument.disposition);
      if (target.actor && ["wallsBlockIgnoreIncapacited", "alwaysIgnoreIncapacitated"].includes(configSettings.rangeTarget))
        inRange = inRange && !checkIncapacitated((target.actor as Actor), debugEnabled > 0, false);
      if (["wallsBlockIgnoreDefeated", "alwaysIgnoreDefeated"].includes(configSettings.rangeTarget))
        inRange = inRange && !checkDefeated(target);
      inRange = inRange && (configSettings.rangeTarget === "none" || !hasWallBlockingCondition(target))
      if (inRange) {
        // if ignoreToken set don't target it.
        if (ignoreToken?.document.uuid === target.document.uuid) {
          inRange = false;
        }
        const distance = getDistance(target, tokenToUse, { wallsBlock });
        inRange = inRange && distance >= 0 && distance <= Number(minDist);
      }
      if (inRange) {
        target.setTarget(true, { user: game.user, releaseOthers: false });
        if (target.document.id) targetIds.push(target.document.id);
      }
    }

    // if (!this.ignoreUserTargets) this.targets = new Set(game.user?.targets ?? []);
    // this.saves = new Set();
    // this.failedSaves = new Set(this.targets)
    // this.hitTargets = new Set(this.targets);
    // this.hitTargetsEC = new Set();
    game.user?.broadcastActivity({ targets: targetIds });
  }
  return true;
}

function getCPREffect(id: string): ActiveEffect.Implementation | undefined {
  if (!game.modules.get("chris-premades")?.active || !game.settings.get("chris-premades", "effectInterface")) return undefined;
  let cprItem = game.items?.find(i => ((i.flags["chris-premades"]))?.effectInterface);
  return cprItem?.effects.get(id) as ActiveEffect;
}

// --- Target save/restore ---

export function updateUserTargets(targetIds: string[]) {
  // @ts-expect-error not in v13 yet
  canvas.tokens?.setTargets(targetIds);
}

/**
 * Module-level target save/restore for self-target workflows only.
 * - pushTargetSave(): captures targets when depth goes from 0→1
 * - popTargetSave(): restores targets when depth goes from 1→0
 * - clearTargetSave(): discards saved state (called when non-self-target
 *   workflow starts, or when user manually retargets)
 *
 * User-initiated retargeting is detected via libWrapper patches on
 * Token._onClickLeft, Token._onClickRight2, and TokenLayer.selectObjects
 * (registered in patching.ts). These set _userInitiatedTarget = true before
 * the wrapped call, and the targetToken hook checks this flag.
 */
let _savedTargetIds: string[] | null = null;
let _targetSaveDepth = 0;

/** Set by libWrapper patches in patching.ts around user-initiated targeting actions. */
export let _userInitiatedTarget = false;
export function setUserInitiatedTarget(value: boolean) { _userInitiatedTarget = value; }

export function pushTargetSave() {
  if (_targetSaveDepth === 0) {
    _savedTargetIds = Array.from(game.user?.targets ?? []).map(t => t.id);
  }
  _targetSaveDepth++;

}

export function popTargetSave() {
  _targetSaveDepth--;
  const willRestore = _targetSaveDepth <= 0 && _savedTargetIds !== null;

  if (willRestore) {
    updateUserTargets(_savedTargetIds!);
    _savedTargetIds = null;
    _targetSaveDepth = 0;
  }
}

export function clearTargetSave() {

  _savedTargetIds = null;
  _targetSaveDepth = 0;
}

/**
 * Called from the targetToken hook. If the user manually changed targets
 * (via click/right-click/box-select), discard any pending self-target save.
 */
export function onUserManualTarget(user: User) {
  if (user === game.user && _userInitiatedTarget) {
    clearTargetSave();
  }
}

export async function cleanCPRFlanked() {
  const flankedId = getStaticID("flanked");
  let cprEffect = getCPREffect(flankedId);
  if (!cprEffect) return;
  let updateNeeded = false;
  const changes = foundry.utils.deepClone(cprEffect.changes);
  changes.forEach(c => {
    if (c.key === "flags.midi-qol.grants.attack.advantage.mwak") {
      c.key = "flags.midi-qol.grants.advantage.attack.mwak";
      updateNeeded = true;
    }
    if (c.key === "flags.midi-qol.grants.attack.advantage.msak") {
      c.key = "flags.midi-qol.grants.advantage.attack.msak";
      updateNeeded = true;
    }
  });
  if (updateNeeded) {
    await cprEffect.update({ "changes": changes });
    console.warn("midi-qol | cleanCPRFlanked | corrected flanked effect", cprEffect);
  }
  cprEffect = getCPREffect(flankedId);
}
export function getItemFromEffectOrigin(origin: string, alreadyVisited: string[] = []): Item.Implementation | undefined {
  let originItem: Item.Implementation | undefined;
  if (alreadyVisited.includes(origin)) return;
  const originDoc = fromUuidSync(origin) as ActiveEffect.Implementation | Item.Implementation | Activity | undefined;
  if (originDoc instanceof Item) return originDoc;
  //@ts-expect-error no dnd5e types - Activity has .item getter
  if (originDoc?.item instanceof Item) return originDoc.item;
  if (originDoc?.parent instanceof Item) {
    originItem = originDoc.parent;
  } else if (typeof originDoc?.origin === "string") {
    originItem = getItemFromEffectOrigin(originDoc.origin, [...alreadyVisited, origin]);
    // recursive so @michael can feel fancy
  }
  // Fallback: if we couldn't resolve to an Item (e.g. grandchild embedded docs on synthetic actors),
  // try stripping the ActiveEffect segment to resolve the parent Item directly
  if (!originItem && (origin.includes(".ActiveEffect.") || origin.includes(".Activity."))) {
    const itemUuid = origin.replace(/\.(?:ActiveEffect|Activity)\.[^.]+$/, "");
    let item = fromUuidSync(itemUuid);
    // If the UUID contains .Actor. segment (synthetic token), try without it
    if (!(item instanceof Item) && itemUuid.includes(".Actor.")) {
      const withoutActor = itemUuid.replace(/\.Actor\.[^.]+/, "");
      item = fromUuidSync(withoutActor);
    }
    if (item instanceof Item) originItem = item;
  }
  return originItem;
}

function getItemFromEffectOriginOLD(origin: string) {
  let originItem: Item.Implementation | undefined;
  const originEffect = fromUuidSync(origin) as ActiveEffect.Implementation | undefined;
  if (originEffect?.origin) {
    if (originEffect.parent instanceof Item) {
      originItem = originEffect.parent;
    } else originItem = fromUuidSync(originEffect?.origin) as Item.Implementation | undefined;
  }
  return originItem;
}

export type OpType = "equal" | "insert" | "delete" | "replace";

export interface EqualOp { type: "equal"; text: string }
export interface InsertOp { type: "insert"; text: string }
export interface DeleteOp { type: "delete"; text: string }
export interface ReplaceOp { type: "replace"; text: string; from: string }

export type DiffOp = EqualOp | InsertOp | DeleteOp | ReplaceOp;

export interface DiffOptions {
  ignoreWhitespace?: boolean; // Ignore spaces and tabs
  ignoreNewlines?: boolean;    // Ignore \n and \r
}

const toCodepoints = (s: string): string[] => Array.from(s);

/**
 * Apply normalization rules based on options and return:
 * - normalized string array
 * - map from normalized index to original index
 */
function normalizeWithMap(str: string, options?: DiffOptions): { norm: string[], map: number[] } {
  const norm: string[] = [];
  const map: number[] = [];
  const chars = toCodepoints(str);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (options?.ignoreWhitespace && /\s/.test(ch) && ch !== "\n" && ch !== "\r") continue;
    if (options?.ignoreNewlines && (ch === "\n" || ch === "\r")) continue;
    norm.push(ch);
    map.push(i);
  }
  return { norm, map };
}

export function diffStringsFull(a: string, b: string, options?: DiffOptions): DiffOp[] {
  if (a === b) return [{ type: "equal", text: a }];

  // Normalize inputs according to options
  const { norm: A, map: mapA } = normalizeWithMap(a, options);
  const { norm: B, map: mapB } = normalizeWithMap(b, options);
  const n = A.length;
  const m = B.length;

  if (n === 0) return [{ type: "insert", text: b }];
  if (m === 0) return [{ type: "delete", text: a }];

  const max = n + m;
  const trace: Array<Map<number, number>> = [];
  let V = new Map<number, number>();
  V.set(1, 0);

  for (let d = 0; d <= max; d++) {
    const Vnext = new Map<number, number>();
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (V.get(k - 1) ?? -Infinity) < (V.get(k + 1) ?? -Infinity))) {
        x = V.get(k + 1) ?? 0; // down
      } else {
        x = (V.get(k - 1) ?? 0) + 1; // right
      }
      let y = x - k;

      while (x < n && y < m && A[x] === B[y]) { x++; y++; }

      Vnext.set(k, x);

      if (x >= n && y >= m) {
        trace.push(Vnext);

        const opsRev: DiffOp[] = [];
        let kk = k, xx = x, yy = y;

        for (let D = d; D > 0; D--) {
          const Vprev = trace[D - 1];
          let kPrev: number;
          if (kk === -D || (kk !== D && (Vprev.get(kk - 1) ?? -Infinity) < (Vprev.get(kk + 1) ?? -Infinity))) {
            kPrev = kk + 1; // down/insert
          } else {
            kPrev = kk - 1; // right/delete
          }
          const xPrev = Vprev.get(kPrev)!;
          const yPrev = xPrev - kPrev;

          // Snake through equals
          while (xx > xPrev && yy > yPrev) {
            xx--; yy--;
            opsRev.push({ type: "equal", text: substringFromMap(a, mapA, xx, xx + 1) });
          }

          if (xPrev < xx) {
            // delete
            opsRev.push({ type: "delete", text: substringFromMap(a, mapA, xPrev, xPrev + 1) });
          } else {
            // insert
            opsRev.push({ type: "insert", text: substringFromMap(b, mapB, yPrev, yPrev + 1) });
          }

          kk = kPrev;
          xx = xPrev;
          yy = yPrev;
        }

        // Leading equals
        while (xx > 0 && yy > 0) {
          xx--; yy--;
          opsRev.push({ type: "equal", text: substringFromMap(a, mapA, xx, xx + 1) });
        }

        opsRev.reverse();
        return coalesceOps(opsRev);
      }
    }
    trace.push(Vnext);
    V = Vnext;
  }
  return [{ type: "replace", text: b, from: a }];
}

function substringFromMap(original: string, map: number[], start: number, end: number): string {
  const chars = toCodepoints(original);
  return chars.slice(map[start], map[end - 1] + 1).join("");
}

export function coalesceOps(ops: DiffOp[]): DiffOp[] {
  if (ops.length === 0) return ops;

  const merged: DiffOp[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type && op.type !== "replace") {
      (last as any).text += (op as EqualOp | InsertOp | DeleteOp).text;
    } else {
      merged.push({ ...op });
    }
  }

  const result: DiffOp[] = [];
  for (let i = 0; i < merged.length; i++) {
    const cur = merged[i];
    const next = merged[i + 1];
    if (cur && next && cur.type === "delete" && next.type === "insert") {
      result.push({ type: "replace", from: cur.text, text: next.text });
      i++;
    } else {
      result.push(cur);
    }
  }

  const final: DiffOp[] = [];
  for (const op of result) {
    const last = final[final.length - 1];
    if (last && last.type === "equal" && op.type === "equal") {
      last.text += op.text;
    } else {
      final.push(op);
    }
  }
  return final;
}

/* -------------------- Example --------------------
const a = "The 🐱\n sat on  the mat.";
const b = "The 🐶 sits   on a mat!";
console.log(diffStringsFull(a, b, { ignoreWhitespace: true, ignoreNewlines: true }));
--------------------------------------------------- */

export function getTargetDescriptor(uuid: string, targetDescriptors: Array<DND5ETargetDescriptor> | undefined): DND5ETargetDescriptor | undefined {
  if (!uuid || !targetDescriptors) return undefined;
  return targetDescriptors?.find(td => td.uuid === uuid);
}

export const throttledScrollBottom = foundry.utils.throttle(() => {
  //@ts-expect-error fvtt-missing scrollBottom
  ui.chat?.scrollBottom({ waitImages: true });
}, 150);