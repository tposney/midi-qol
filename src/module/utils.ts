import { debug, i18n, error, warn, MQdefaultDamageType, allAttackTypes, debugEnabled, overTimeEffectsToDelete, geti18nOptions, getStaticID, savedOverTimeEffectsToDelete, GameSystemConfig, systemConcentrationId, MQItemMacroLabel, MODULE_ID, midiReactionEffect, midiBonusActionEffect, MQActivityMacroLabel, ceInterface } from "../midi-qol.js";
import { configSettings, autoRemoveTargets, checkRule, criticalDamage, criticalDamageGM, checkMechanic, safeGetGameSetting, DebounceInterval, _debouncedUpdateAction } from "./settings.js";
import { log } from "../midi-qol.js";
import { AugmentedEvent, DummyWorkflow, Workflow, WorkflowOptions, WorkflowRollOptions } from "./Workflow.js";
import { preferredActiveGM, prepareDamageListToJSON, socketlibSocket, timedAwaitExecuteAsGM, unTimedExecuteAsGM } from "./GMAction.js";
import { dice3dEnabled, installedModules } from "./setupModules.js";
import { concentrationCheckItemDisplayName, midiFlagTypes } from "./Hooks.js";

import { OnUseMacros } from "./apps/Item.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { busyWait } from "./tests/setupTest.js";
import { MidiActivityChoiceDialog } from "./apps/MidiActivityChoiceDialog.js";
import { Activity, ActivityUseConfiguration, CalcDamageOptions, DamageDescription, DamageListEntry, PreSetupDamageListEntry, RollDialogConfig, RollMessageConfig, TokenOrDocument } from "../globals.js";

import Token = foundry.canvas.placeables.Token;
import { AnyMutableObject, AnyObject } from "fvtt-types/utils";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

const defaultTimeout = 30;
export type ReactionItemReference = { itemName: string, itemId: string, actionName: string, img: string, id: string, uuid: string } | String;
export type ReactionItem = { itemName: string, itemId: string, actionName: string, img: string, id: string, uuid: string, baseItem: Item } | Activity;

export function getDamageType(flavorString: string = ''): string | undefined {
  if (flavorString === '') return "none";
  if (GameSystemConfig.damageTypes[flavorString] !== undefined) {
    return flavorString;
  }
  if (GameSystemConfig.healingTypes[flavorString] !== undefined) {
    return flavorString;
  }
  const validDamageTypes = Object.entries(GameSystemConfig.damageTypes).map(([key, {label}]) => [label.toLowerCase(), key]);
  const validHealingTypes = Object.entries(GameSystemConfig.healingTypes).map(([key, {label}]) => [label.toLowerCase(), key]);
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

export function createDamageDetailV4({
  roll,
  activity,
  defaultType = MQdefaultDamageType
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
  rolls = foundry.utils.deepClone(rolls).map(r => {
    // @ts-expect-error no dnd5e-types
    if (!r.options.type) r.options.type = defaultType;
    return r;
  })

  //@ts-expect-error no dnd5e-types
  const aggregatedRolls: CONFIG.Dice.DamageRoll[] = game.system.dice.aggregateDamageRolls(rolls, { respectProperties: true });
  const detail = aggregatedRolls.map(roll => ({ damage: roll.total as number, value: roll.total as number, type: roll.options.type as string, formula: roll.formula as string, properties: new Set(roll.options.properties as string[] ?? []) }));
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
    magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && item?.system.attackBonus > 0);
    // @ts-expect-error no dnd5e-types
    magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && item?.type !== "weapon");
    // @ts-expect-error no dnd5e-types
    magicalDamage = magicalDamage || (configSettings.requireMagical === "nonspell" && item?.type === "spell");
    magicalDamage = magicalDamage || damageProperties.includes("mgc");
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
        // @ts-expect-error no dnd5e-types
        } else if (item?.type === "power" && trait.has("power")) {
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
          // @ts-expect-error no dnd5e-types
          } else if (item?.type === "power" && (customs.includes("power") || customs.includes(GameSystemConfig.customDamageResistanceTypes.power))) {
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
    updateOptions: undefined,
    forceApply: false,
    noConcentrationCheck: false
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
    if (superSaver && getSaveMultiplierForItem(item, "defaultDamage") === configSettings.defaultSaveMultiplier) {
      saveMultiplier = saves.has(token) ? 0 : configSettings.defaultSaveMultiplier;
    }
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
    const fullDamage = setupV3DamageDetails({
      actorId: actor.id!,
      actorUuid: actor.uuid,
      calcDamageOptions,
      critical: false,
      damageDetail: combinedDamage,
      damageDetails: {
        combinedDamage,
        rawcombinedDamage: damageDetail,
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

  const cardIds: string[] = await timedAwaitExecuteAsGM("createReverseDamageCard", {
    autoApplyDamage: configSettings.autoApplyDamage,
    sender: game.user?.name,
    actorId: workflow?.actor?.id,
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

export function setupV3DamageDetails(actorDamage: PreSetupDamageListEntry, selector: "combinedDamage" | "otherDamage", actor: Actor.Implementation) {
  let { amount, temp } = (actorDamage.damageDetails[selector] ?? []).reduce((acc, d) => {
    if (d.type === "temphp") acc.temp += d.value;
    else if (d.type !== "midi-none") acc.amount += d.value;
    return acc;
  }, { amount: 0, temp: 0 });
  amount = amount > 0 ? Math.floor(amount) : Math.ceil(amount);
  let totalDamage = (actorDamage.damageDetails[`raw${selector}`] ?? []).reduce((acc, d) => acc + (["temphp", "midi-none"].includes(d.type) ? 0 : d.value), 0);
  let healingAdjustedTotalDamage = (actorDamage.damageDetails[`raw${selector}`] ?? []).reduce((acc, d) => acc + (["temphp", "midi-none"].includes(d.type) ? 0 : (d.type === "healing" ? -d.value : d.value)), 0);
  const as = actor?.system;
  // @ts-expect-error no dnd5e-types
  if (!as || !as.attributes.hp) return;
  // @ts-expect-error no dnd5e-types
  let effectiveTemp = as.attributes.hp.temp ?? 0;
  const deltaTemp = amount > 0 ? Math.min(effectiveTemp, amount) : 0;
  // @ts-expect-error no dnd5e-types
  const deltaHP = Math.clamp(amount - deltaTemp, -as.attributes.hp.damage, as.attributes.hp.value);
  // @ts-expect-error no dnd5e-types
  const oldTempHP = as.attributes.hp.temp ?? 0;
  const newTempHP = Math.floor(Math.max(0, effectiveTemp - deltaTemp, temp))
  const completeActorDamage: DamageListEntry = {
    ...actorDamage,
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
  const actor = workflow.actor;
  // const re = /.*\((.*)\)/;
  // const defaultDamageType = message.flavor && message.flavor.match(re);

  // Show damage buttons if enabled, but only for the applicable user and the GM

  let hitTargets = new Set([...workflow.hitTargets, ...workflow.hitTargetsEC]);
  let theTargets = new Set(workflow.targets);
  // TODO becomes activity.target.affects.type === "self"
  // if (activity.target.affects.type === "self") theTargets = await getOrCreateTokenForActorAsSet(actor) || theTargets;
  let effectsToExpire: string[] = [];
  if (hitTargets.size > 0 && workflow.activity.attack) effectsToExpire.push("1Hit");
  if (hitTargets.size > 0 && workflow.activity.damage) effectsToExpire.push("DamageDealt");
  if (effectsToExpire.length > 0) {
    await expireMyEffects.bind(workflow)(effectsToExpire);
  }

  if (debugEnabled > 0) warn("processDamageRoll | damage details pre merge are ", workflow.rawDamageDetail, workflow.rawBonusDamageDetail);
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
    if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor") as string) && workflow.attackRoll && workflow.hitTargetsEC?.has(token)) {
      //scale the damage detail for a glancing blow - only for the first damage list? or all?
      const scale = workflow.challengeModeScale?.[tokenDocument?.uuid ?? "dummy"] ?? 1;
      challengeModeScale = scale;
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
      calcDamageOptions: {
        invertHealing: true,
        multiplier: challengeModeScale,
        midi: {
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
      },
      challengeModeScale,
      critical: workflow.isCritical,
      damageDetail: [],
      damageDetails: { combinedDamage: [], rawcombinedDamage: [], defaultDamage: [], rawdefaultDamage: workflow.rawDamageDetail, otherDamage: [], rawotherDamage: workflow.rawOtherDamageDetail, bonusDamage: [], rawbonusDamage: workflow.rawBonusDamageDetail },
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

    const damageArr: [Roll[] | undefined, string][] = [[workflow.damageRolls, "defaultDamage"], [(workflow.otherDamageMatches?.has(token) ?? true) ? workflow.otherDamageRolls : [], "otherDamage"], [workflow.bonusDamageRolls, "bonusDamage"]];
    for (let [rolls, type] of damageArr) {
      if (rolls && rolls.length > 0 && rolls[0]) {
        //@ts-expect-error no dnd5e-types
        const damages: DamageDescription[] = game.system.dice.aggregateDamageRolls(rolls, { respectProperties: true }).map(roll => ({
          value: roll.total,
          type: roll.options.type,
          properties: new Set(roll.options.properties ?? [])
        }));
        const calcDamageOptions = foundry.utils.duplicate(damagePerActor[actor.uuid].calcDamageOptions) as CalcDamageOptions;
        if (type === "otherDamage" && (workflow.otherActivity?.save || workflow.otherActivity?.check)) {
          const defaultSaveMultiplier = getSaveMultiplierForActivity(workflow.otherActivity);
          const saveMultiplier = hasSaved
            ? superSaver || semiSuperSaver
              ? 0
              : defaultSaveMultiplier
            : superSaver
              ? defaultSaveMultiplier
              : 1;
          calcDamageOptions.midi.saveMultiplier = saveMultiplier;
        }
        // const allTargetElts = document.querySelectorAll(`[data-message-id="${workflow.chatCard?.id}"]`)?.[0]?.getElementsByTagName("damage-application");

        const categories = { "idi": "immunity", "idr": "resistance", "idv": "vulnerability", "ida": "absorption" };
        if (workflow.item) {
          for (let key of Object.keys(categories)) {
            const property = workflow.activity.midiProperties?.ignoreTraits.has(key);
            if (property) {
              if (!calcDamageOptions.ignore?.[categories[key]]) foundry.utils.setProperty(calcDamageOptions, `ignore.${categories[key]}`, new Set())
              for (let dt of Object.keys(GameSystemConfig.damageTypes)) {
                calcDamageOptions.ignore![categories[key]].add(dt);
              }
            }
          }
        }

        //@ts-expect-error no dnd5e-types
        let returnDamages = foundry.utils.deepClone(token.actor.calculateDamage(damages, calcDamageOptions));
        if (configSettings.singleConcentrationRoll || type !== "otherDamage") {
          damageDetails[type] = returnDamages;
          damageDetails["combinedDamage"] = damageDetails["combinedDamage"].concat(returnDamages);
          damageDetails[`rawcombinedDamage`] = damageDetails[`rawcombinedDamage`].concat(damages);
          damageDetails[`calcDamageOptions.${type}`] = calcDamageOptions;
          damageDetails["calcDamageOptions.combinedDamage"] = calcDamageOptions;
        } else if (!configSettings.singleConcentrationRoll && type === "otherDamage") {
          damageDetails["otherDamage"] = returnDamages;
          damageDetails[`rawotherDamage`] = damages;
          damageDetails['calcDamageOptions.otherDamage'] = calcDamageOptions;
        }
      }
    }
  }
  const preDamageList = Object.values(damagePerActor);
  // Explicitly typed because it only ever gets called with this, currently
  const toCheck: ("combinedDamage" | "otherDamage")[] = ["combinedDamage"];
  if (!configSettings.singleConcentrationRoll && workflow.otherDamageRolls) toCheck.push("otherDamage");
  let chatCardUuids: string[] = [];
  for (let selector of toCheck) {
    preDamageList.forEach(damageEntry => {
      damageEntry.damageDetail = damageEntry.damageDetails[selector] ?? damageEntry.damageDetail;
      damageEntry.rawDamageDetail = damageEntry.damageDetails[`raw${selector}`] ?? damageEntry.rawDamageDetail;
      damageEntry.calcDamageOptions = damageEntry.damageDetails[`calcDamageOptions.${selector}`] ?? damageEntry.calcDamageOptions;
    });

    for (let token of theTargets) {
      const actor = token.actor;
      if (!actor) continue;
      const preDamageDetails = damagePerActor[actor.uuid];
      const damageDetails = setupV3DamageDetails(preDamageDetails, selector, actor);
      if (damageDetails) {
        await workflow?.callV3DamageHooks(damageDetails, token);
        damageDetails.damageDetails[selector] = damageDetails.damageDetail;
        workflow.damageList.push(damageDetails);
      }
    }
    /*
    const cardIds: string[] = await timedAwaitExecuteAsGM("createReverseDamageCard", {
      autoApplyDamage: configSettings.autoApplyDamage,
      sender: game.user?.name,
      actorId: workflow.actor.id,
      charName: workflow.token?.name ?? workflow.actor.name ?? game.user?.name,
      damageList: prepareDamageListToJSON(workflow.damageList),
      chatCardUuid: workflow.itemCardUuid,
      flagTags: workflow.flagTags,
      updateOptions: { noConcentrationCheck: workflow?.workflowOptions?.noConcentrationCheck ?? false },
      forceApply: false
    });
    if (cardIds) chatCardUuids.push(...cardIds);
  }

  if (workflow && configSettings.undoWorkflow) {
    // Assumes workflow.undoData.chatCardUuids has been initialised
    if (workflow.undoData) {
      workflow.undoData.chatCardUuids = workflow.undoData.chatCardUuids.concat(chatCardUuids);
      unTimedExecuteAsGM("updateUndoChatCardUuids", workflow.undoData);
    }
  }
  */
    await timedAwaitExecuteAsGM("createReverseDamageCard", {
      autoApplyDamage: configSettings.autoApplyDamage,
      sender: game.user?.name,
      actorId: workflow.actor.id,
      charName: workflow.token?.name ?? workflow.actor.name ?? game.user?.name,
      damageList: prepareDamageListToJSON(workflow.damageList),
      chatCardUuid: workflow.itemCardUuid,
      flagTags: workflow.flagTags,
      updateOptions: { noConcentrationCheck: workflow?.workflowOptions?.noConcentrationCheck ?? false },
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
    if (midiFlags?.potentCantrip) return configSettings.defaultSaveMultiplier;
  }
  switch (activity.damage.onSave) {
    case "half":
      return configSettings.defaultSaveMultiplier;
    case "none":
      return 0;
    case "full":
      return 1;
    default:
      return configSettings.defaultSaveMultiplier;
  }
}

export let getSaveMultiplierForItem = (item?: Item.Implementation | null, itemDamageType?: string) => {
  // There are no per items settings anymore so just return default saves
  console.warn("getSaveMultiplierForItem is deprecated, use getSaveMultiplierForActivity instead");
  if (!item) return 1;
  // @ts-expect-error no dnd5e-types
  if (item.actor && item.type === "spell" && item.system.level === 0) { // cantrip
    const midiFlags = item.actor?.flags?.[MODULE_ID];
    if (midiFlags?.potentCantrip) return configSettings.defaultSaveMultiplier;
    return 0;
  }
  return configSettings.defaultSaveMultiplier;
};

export interface pcSaveOptions {
  flavor: string,
  requestId: string,
  GMprompt,
  isMagicSave: boolean,
  magicResistance: boolean,
  magicVulnerability: boolean,
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
export function requestPCSave(ability: string, rollType: string | undefined, player: string, actor: Actor.Implementation | null, options: pcSaveOptions): Promise<ChatMessage.Implementation | undefined> | undefined {
  try {
    // display a chat message to the user telling them to save
    const actorName = actor?.name ?? "Unknown";
    let abilityString = ability;
    let abilityDetails = GameSystemConfig.abilities[ability];
    if (!abilityDetails) abilityDetails = {...GameSystemConfig.tools[ability], label: ""};
    if (abilityDetails?.label) abilityString = abilityDetails.label;
    let content = ` ${actorName} ${configSettings.displaySaveDC ? "DC " + options.saveDetails.rollDC : ""} ${abilityString} ${i18n("midi-qol.saving-throw")}`;
    if (options.saveDetails.advantage && !options.saveDetails.disadvantage) content = content + ` (${i18n("DND5E.Advantage")}) - ${options.flavor})`;
    else if (!options.saveDetails.advantage && options.saveDetails.disadvantage) content = content + ` (${i18n("DND5E.Disadvantage")}) - ${options.flavor})`;
    else content + ` - ${options.flavor})`;
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

  let mode = checkRule("activeDefenceShow") ?? CONST.DICE_ROLL_MODES.SELF;
  // TODO: Right check?
  let flavor = `${saveItemName} ${configSettings.optionalRules.activeDefence ? "DC " + options.rollOptions.target : ""} ${i18n("midi-qol.ActiveDefenceString")}`;
  const midiType = "defenceRoll";
  /*  const options = {
      criticalSuccess: criticalTarget,
      criticalFailure: fumbleTarget,
      advantageMode,
      target: this.activeDefenceDC
    };*/
  socketlibSocket.executeAsUser("D20Roll", player.id, {targetUuid: actor.uuid, formula: options.formula, bonus: options.bonus, coverBonus: options.coverBonus, rollOptions: options.rollOptions, rollMode: mode, midiType, flavor, messageData: { speaker: getSpeaker(actor) } }).then(result => {
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

export function midiCustomEffect(actor: Actor.Implementation, change: ActiveEffect.ChangeData & {effect?: ActiveEffect.Implementation}, current: unknown, delta: unknown, changes: unknown) {
  if (!change.key) return true;
  if (typeof change?.key !== "string") return true;
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
    }
    else if (args[0].startsWith("ActivityMacro") || args[0].startsWith(MQActivityMacroLabel)) {
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
    }
    else if (args[0] === "ItemMacro" || args[0] === MQItemMacroLabel) { // rewrite the ItemMacro if possible
      if (change.effect?.transfer) args[0] = `ItemMacro.${change.effect.parent?.uuid}`;
      // else if (sourceId) args[0] = `ItemMacro.${sourceId}`;
      else {
        if (change.effect?.origin?.includes("Item.")) {
          args[0] = `ItemMacro.${change.effect.origin}`;
        } else {
          const origin = fromUuidSync(change.effect?.origin) as Item.Implementation | ActiveEffect.Implementation | undefined;
          if (origin instanceof Item) args[0] = `ItemMacro.${origin.uuid}`;
          else if (origin instanceof ActiveEffect) args[0] = `ItemMacro.${origin.origin}`;
        }
      }
    }
    if (change.effect?.origin?.includes("Item.")) {
      args[0] = `${args[0]}|${change.effect.origin}`;
    }
    const extraFlag = `[${args[1]}]${args[0]}`;
    const macroString = (currentFlag?.length > 0) ? [currentFlag, extraFlag].join(",") : extraFlag;
    foundry.utils.setProperty(actor, `flags.${MODULE_ID}.onUseMacroName`, macroString)
    return true;
  } else if (change.key.startsWith(`flags.${MODULE_ID}.optional.`) && (change.value.trim() === "ItemMacro" || change.value.trim() === MQItemMacroLabel)) {
    if (change.effect?.origin?.includes("Item.")) {
      const macroString = `ItemMacro.${change.effect.origin}`;
      foundry.utils.setProperty(actor, change.key, macroString)
    } else foundry.utils.setProperty(actor, change.key, change.value);
    return true;
  } /*
  TODO revisit this if going to allow item macro in flags evaluation
  else if (change.key.startsWith(`flags.${MODULE_ID}.`) && (change.value.trim().includes("ItemMacro") || change.value.trim().includes(MQItemMacroLabel))) {
    if (change.effect?.origin?.includes("Item.")) {
      const macroString = `ItemMacro.${change.effect.origin}`;
      foundry.utils.setProperty(actor, change.key, macroString)
    } else foundry.utils.setProperty(actor, change.key, change.value);
  } */
  else if (deferredEvaluation.some(k => change.key.startsWith(k))) {
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
  const changes = effect.changes;
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
  let activity /* MidiActivityMixin */ = await fromUuid(change.value) as Activity | null;
  if (!activity && effect.transfer) {
    //@ts-expect-error no dnd5e-types
    activity = effect.parent?.system.activities?.find(a => a.identifier === change.value);
  }
  if (!activity && effect.origin) {
    const originItem = getItemFromEffectOrigin(effect.origin);
    // @ts-expect-error no dnd5e-types
    if (originItem) activity = originItem.system.activities.find(a => a.identifier === change.value);
  }
  if (!activity) {
    return undefined;
  }
  const turnChoice = activity.overTimeProperties?.turnChoice ?? "start";
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
    // Create an item owned by the target actor which has all of the details
    const itemData: any = activity.item.toObject();
    if (castLevel > spellLevel) foundry.utils.setProperty(itemData, "flags.dnd5e.scaling", castLevel - spellLevel);
    foundry.utils.setProperty(itemData, "system.properties", itemData.system.properties.filter(p => p !== "concentration"));
    let itemActor = activity.item?.actor;
    if (!itemActor) {
      const origin = getItemFromEffectOrigin(effect.origin ?? "");
      // @ts-expect-error types thinks item parent can only ever be actor, not AE... that seems accurate tbh
      if (origin) itemActor = origin.parent instanceof ActiveEffect ? origin.parent.actor : origin.actor;
    }
    foundry.utils.setProperty(itemData, "flags.midi-qol.syntheticItem", true);
    const newItem = new CONFIG.Item.documentClass(itemData, { parent: itemActor ?? actor });
    newItem.prepareData();
    // @ts-expect-error no dnd5e-types
    newItem.prepareFinalAttributes(); // since the actor prepareData is not being called need to call this by hand
    //@ts-expect-error no dnd5e-types
    let overTimeActivity = newItem.system.activities.find(a => a.id === activity.id) as Activity;

    // Check remove Condition
    if ((overTimeActivity.overTimeProperties?.preRemoveConditionText ?? "") !== "" && overTimeActivity.overTimeProperties!.removeConditionBeforeActivity) {
      const conditionData = createConditionData({ actor, workflow: undefined, target: actor });
      if (await evalCondition(activity.overTimeProperties?.preRemoveConditionText ?? "false", conditionData, { async: true })) {
        await effect.delete();
        return;
      }
    }
    if ((overTimeActivity?.useCondition ?? "") !== "") {
      const conditionData = createConditionData({ actor, workflow: undefined, target: actor });
      if (!await evalCondition(activity.useCondition ?? "true", conditionData, { async: true, errorReturn: true })) {
        return; // use condition failed but don't want to thrown an notification warning
      }
    }
    let targetsToUse: Set<Token> | undefined = undefined;
    if (["self", ""].includes(overTimeActivity.target?.affects?.type)) {
      overTimeActivity = foundry.utils.deepClone(overTimeActivity);
      const token = tokenForActor(actor);
      if (token) targetsToUse = new Set([token])
      overTimeActivity.target.affects.type = "";
    }
    const overTimeWorkflow: Workflow = await completeActivityUse(overTimeActivity,
      { midiOptions: { targetsToUse, workflowOptions: { noProvokeReaction: true, autoConsumeResource: "both" } } },
      { configure: overTimeActivity.consumption?.spellSlot === true },
      { create: true }) as Workflow;

    // Check save condition
    if (activity.overTimeProperties?.saveRemoves && overTimeWorkflow?.saves.has(getOrCreateTokenForActor(actor)!)) {
      await effect.delete();
      return;
    }
    // Check remove condition
    if ((activity.overTimeProperties?.postRemoveConditionText ?? "") !== "" && !activity.overTimeProperties!.removeConditionBeforeActivity) {
      const conditionData = createConditionData({ actor, workflow: overTimeWorkflow, target: actor });
      if (await evalCondition(activity.overTimeProperties!.postRemoveConditionText ?? "false", conditionData, { async: true })) {
        await effect.delete();
        return;
      }
    }
  }
}

export async function gmOverTimeEffect(actor: Actor.Implementation, effect: ActiveEffect.Implementation, startTurn: boolean = true, options: any = { saveToUse: undefined, rollFlags: undefined, rollMode: undefined }) {
  const endTurn = !startTurn;
  if (effect.disabled || effect.isSuppressed) return;
  const auraFlags = effect.flags?.ActiveAuras ?? {};
  if (auraFlags.isAura && auraFlags.ignoreSelf) return;
  const rollData = createConditionData({ actor, workflow: undefined, target: actor });
  if (!rollData.flags) rollData.flags = actor.flags;
  rollData.flags.midiqol = rollData.flags[MODULE_ID];
  const changes = effect.changes.filter(change => change.key.startsWith(`flags.${MODULE_ID}.OverTime`));
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
        result = await evalCondition(value, rollData, { async: true });
      } catch (err) {
        const message = `midi-qol | gmOverTimeEffect | error when evaluating overtime apply condition ${value} - assuming true`;
        TroubleShooter.recordError(err, message);
        console.warn(message, err);
        result = true;
      }
      if (!result) continue;
    }

    const changeTurnStart = details.turn === "start" || false;
    const changeTurnEnd = details.turn === "end" || false;
    let actionSave = details.actionSave;
    if (![undefined, "dialog", "roll"].includes(actionSave)) {
      console.warn(`midi-qol | gmOverTimeEffect | invalid actionSave: ${actionSave} for ${actor.name} ${effect.name}`);
      console.warn(`midi-qol | gmOverTimeEffect | valid values are "undefined", "dialog" or "roll"`);
      if (["0", "false"].includes(actionSave)) actionSave = undefined;
      else actionSave = "roll";
      console.warn(`midi-qol | gmOverTimeEffect | setting actionSave to ${actionSave}`);
    }

    const saveAbilityString = (details.saveAbility ?? "");
    const saveAbility = (saveAbilityString.includes("|") ? saveAbilityString.split("|") : [saveAbilityString]).map(s => s.trim().toLocaleLowerCase())
    const label = (details.name ?? details.label ?? effect.name).replace(/"/g, "");
    const chatFlavor = details.chatFlavor ?? "";
    const rollTypeString = details.rollType ?? (saveAbility[0] ? "save" : "damage");
    const rollType = (rollTypeString.includes("|") ? rollTypeString.split("|") : [rollTypeString]).map(s => s.trim().toLocaleLowerCase())
    const saveMagic = JSON.parse(details.saveMagic ?? "false"); //parse the saving throw true/false
    const rollMode = details.rollMode;

    let actionType = "other";
    if (Object.keys(GameSystemConfig.itemActionTypes).includes(details.actionType?.toLocaleLowerCase())) actionType = details.actionType.toLocaleLowerCase();
    const messageFlavor = {
      "save": `${GameSystemConfig.abilities[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.saving-throw")}`,
      "check": `${GameSystemConfig.abilities[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.ability-check")}`,
      "skill": `${GameSystemConfig.skills[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.skill-check")}`
    };
    let saveDC;
    let value;
    let saveResultDisplayed = false;
    try {
      value = replaceAtFields(details.saveDC, rollData, { blankValue: 0, maxIterations: 3 });
      saveDC = !!value && Roll.safeEval(value);
    } catch (err) {
      TroubleShooter.recordError(err, `overTime effect | error evaluating saveDC ${value}`);
    } finally {
      if (!value) saveDC = -1
    }

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
    let owner = playerForActor(actor) ?? preferredActiveGM();
    if (!owner?.active) owner = preferredActiveGM();
    if (actionSave && startTurn && actionSave === "dialog") {
      if (!owner?.active) {
        error(`No active owner to request overtime save for ${actor.name} ${effect.name}`);
        return effect.id;
      }
      let saveResult: any = await new Promise(async (resolve, reject) => {
        let timeoutId: NodeJS.Timeout | undefined;
        if (configSettings.playerSaveTimeout) timeoutId = setTimeout(() => resolve(undefined), configSettings.playerSaveTimeout * 1000)
        const content = `${actor.name} use your action to overcome ${label}`;
        const result = await socketlibSocket.executeAsUser("rollActionSave", owner?.id, {
          title: `${actor.name} Action: ${label}`,
          content,
          actorUuid: actor.uuid,
          request: rollTypeString,
          abilities: saveAbility,
          saveDC,
          actionSave,
          options: {
            simulate: false,
            targetValue: saveDC,
            messageData: { user: owner?.id, flavor: `${label} ${i18n(messageFlavor[details.rollType])}` },
            chatMessage: true,
            rollMode,
            mapKeys: false,
            // advantage: saveDetails.advantage,
            // disadvantage: saveDetails.disadvantage,
            fastForward: false,
            isMagicSave: saveMagic,
            isConcentrationCheck: false
          }
        });
        if (timeoutId) clearTimeout(timeoutId);
        resolve(result);
      });
      if (saveResult?.class) saveResult = JSON.parse(JSON.stringify(saveResult));
      const success = saveResult?.options?.success || saveResult?.total >= saveDC;
      if (saveResult?.options) saveResultDisplayed = true;
      foundry.utils.setProperty(effect, `flags.${MODULE_ID}.actionSaveSuccess`, success === true);
    } else if (actionSave && actionSave === "roll" && options.isActionSave && options.saveToUse) {
      // player has made a save record the save/flags on the effect
      // if a match and saved then record the save success
      if (!options.rollFlags) return effect.id;
      if (options.rollFlags.type === "ability") options.rollFlags.type = "check";
      if (!rollType.includes(options.rollFlags.type) || !saveAbility.includes(options.rollFlags.abilityId ?? options.rollFlags.skillId)) continue;
      const success = options.saveToUse?.options?.success || options.saveToUse?.total >= saveDC || (checkRule("criticalSaves") && options.saveToUse.isCritical);
      if (success !== undefined) {
        const chatCardUuids = effect.getFlag(MODULE_ID, "overtimeChatCardUuids");
        for (let chatcardUuid of chatCardUuids ?? []) {
          const chatCard = fromUuidSync(chatcardUuid) as ChatMessage.Implementation | undefined;
          await chatCard?.delete();
        }
      }
      if (success) {
        expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:actionSave" });
        return effect.id;
      } else {
        await effect.setFlag(MODULE_ID, "actionSaveSuccess", success === true);
      }

      /*
      if (success !== undefined && !saveResultDisplayed) {
        let content;
        if (success) {
          content = `${effect.name} ${messageFlavor[details.rollType]} ${i18n("midi-qol.save-success")}`;
        } else {
          content = `${effect.name} ${messageFlavor[details.rollType]} ${i18n("midi-qol.save-failure")}`;
        }
      }
      */
      return effect.id;
    } else if (actionSave === "roll" && startTurn) {
      const MessageClass = getDocumentClass("ChatMessage");
      let dataset;
      const chatCardUuids: string[] = [];
      for (let ability of saveAbility) {
        dataset = { type: rollTypeString, dc: saveDC, item: effect.name, action: "rollRequest", midiOvertimeActorUuid: actor.uuid, rollMode };
        if (["check", "save"].includes(rollTypeString)) dataset.ability = ability;
        // dataset = { type: rollTypeString, ability, dc: saveDC, item: effect.name, action: "rollRequest", midiOvertimeActorUuid: actor.uuid };
        else if (rollTypeString === "skill") dataset.skill = ability;
        // dataset = { type: rollTypeString, dc: saveDC, skill: ability, item: effect.name, action: "rollRequest", midiOvertimeActorUuid: actor.uuid };
        let whisper = ChatMessage.getWhisperRecipients(owner?.name ?? "");
        if (owner?.isGM) {
          whisper = ChatMessage.getWhisperRecipients("GM");
        }

        // const content = `${effect.name} ${i18n(messageFlavor[details.rollType])} as your action to overcome ${label}`;
        const chatData = {
          user: game.user?.id,
          whisper: whisper.map(u => u.id ?? ""),
          rollMode: rollMode ?? "public",
          content: await foundry.applications.handlebars.renderTemplate("systems/dnd5e/templates/chat/request-card.hbs", {
            // @ts-expect-error no dnd5e-types
            buttonLabel: game.system.enrichers.createRollLabel({ ...dataset, format: "short", icon: true, hideDC: !owner?.isGM && !configSettings.displaySaveDC }),
            // @ts-expect-error no dnd5e-types
            hiddenLabel: game.system.enrichers.createRollLabel({ ...dataset, format: "short", icon: true, hideDC: true }),
            dataset
          }),
          flavor: `Action: ${label ?? effect.name} ${i18n(messageFlavor[details.rollType])}`,
          speaker: MessageClass.getSpeaker({ actor })
        };
        const chatCard = await ChatMessage.create(chatData);
        if (chatCard) {
          chatCardUuids.push(chatCard.uuid);
          chatCard?.setFlag(MODULE_ID, "actorUuid", actor.uuid)
        }
      }
      foundry.utils.setProperty(effect, `flags.${MODULE_ID}.actionSaveSuccess`, undefined);
      effect.setFlag(MODULE_ID, "overtimeChatCardUuids", chatCardUuids)
        .then(() => effect.setFlag(MODULE_ID, "actionSaveSuccess", undefined));

      if (changeTurnEnd) return effect.id;
    }

    let actionSaveSuccess = effect.flags?.[MODULE_ID]?.actionSaveSuccess;
    if (actionSaveSuccess === true && changeTurnEnd) {
      await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:actionSave" });
      return effect.id;
    }
    if ((endTurn && changeTurnEnd) || (startTurn && changeTurnStart)) {
      const saveDamage = details.saveDamage ?? "nodamage";
      const damageRoll = details.damageRoll;
      const damageType = details.damageType ?? "piercing";
      const itemName = details.itemName;
      const damageBeforeSave = JSON.parse(details.damageBeforeSave ?? "false");
      const macroToCall = details.macro;
      const allowIncapacitated = JSON.parse(details.allowIncapacitated ?? "true");
      const fastForwardDamage = details.fastForwardDamage && JSON.parse(details.fastForwardDamage);
      const fastForwardAttack = details.fastForwardAttack && JSON.parse(details.fastForwardAttack);
      const autoRollAttack = details.autoRollAttack && JSON.parse(details.autoRollAttack);
      const autoRollDamage = details.autoRollDamage && JSON.parse(details.autoRollDamage);

      const killAnim = JSON.parse(details.killAnim ?? "false");
      const saveRemove = JSON.parse(details.saveRemove ?? "true");

      if (debugEnabled > 0) warn(`gmOverTimeEffect | Overtime provided data is `, details);
      if (debugEnabled > 0) warn(`gmOverTimeEffect | OverTime label=${label} startTurn=${startTurn} endTurn=${endTurn} damageBeforeSave=${damageBeforeSave} saveDC=${saveDC} saveAbility=${saveAbility} damageRoll=${damageRoll} damageType=${damageType}`);

      let itemData: any = {
      };
      itemData.img = "icons/svg/aura.svg";
      if (typeof itemName === "string") {
        let theItem = await fromUuid(itemName) as Item.Implementation | undefined;
        if (!theItem && itemName.startsWith("Actor.")) {
          const localName = itemName.replace("Actor.", "")
          theItem = actor.items.getName(localName);
        }
        if (!theItem) {
          theItem = game.items?.getName(itemName);
        }
        if (theItem) itemData = theItem.toObject();
      }

      let activityData: any = {
        name: label,
        id: "overtime",
        type: "damage"
      };
      if (damageRoll) activityData.damage = {
        parts: [{
          custom: {
            enabled: true,
            formula: damageRoll,
          },
          types: [damageType]
        }]
      };

      activityData.img = effect.img;
      itemData.img = effect.img; // v12 icon -> img
      foundry.utils.setProperty(itemData, "target.affects.type", "self")
      itemData.type = "feat";
      foundry.utils.setProperty(itemData, "system.type.value", "feat");
      foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.noProvokeReaction`, true);
      if (saveMagic) {
        itemData.type = "spell";
        foundry.utils.setProperty(itemData, "system.preparation", { mode: "atwill" });
      }
      if (rollTypeString === "save" && !actionSave) {
        actionType = "save";
        activityData.type = "save";
        activityData.save = {
          ability: saveAbility[0],
          dc: {
            calculation: "",
            formula: `${saveDC}`,
          }
        }
        actionType = "save";
      }
      if (rollTypeString === "check" && !actionSave) {
        actionType = "check";
        activityData.type = "check";
        activityData.check = {
          ability: saveAbility[0],
          dc: {
            calculation: "",
            formula: `${saveDC}`,
          }
        }
      }
      if (rollTypeString === "skill" && !actionSave) { // skill checks for this is a fiddle - set a midi flag so that the midi save roll will pick it up.
        actionType = "check";
        activityData.type = "check";
        let skill = saveAbility[0];
        let ability = "";
        let skillEntry = GameSystemConfig.skills[skill];
        if (!GameSystemConfig.skills[skill]) { // not a skill id see if the name matches an entry
          let found = Object.entries(GameSystemConfig.skills).find(([id, entry]) => entry.label.toLocaleLowerCase() === skill)
          if (found) {
            skill = found[0];
            skillEntry = found[1];
          }
        }
        if (skillEntry) {
          activityData.check = {
            ability: skillEntry.ability,
            dc: {
              calculation: "",
              formula: `${saveDC}`,
            },
            associated: [skill]
          }
        }
      }

      if (activityData.damage) {
        if (damageBeforeSave || saveDamage === "fulldamage") {
          activityData.damage.onSave = "full";
        } else if (saveDamage === "halfdamage") {
          activityData.damage.onSave = "half";
        } else {
          activityData.damage.onSave = "none";
        }
      }
      itemData.name = label;
      activityData.description = { chat: chatFlavor };
      foundry.utils.setProperty(itemData, "system.description.chat", effect.description ?? "");

      itemData._id = foundry.utils.randomID();
      // roll the damage and save....
      const theTargetToken = getOrCreateTokenForActor(actor)!;
      const theTargetId = theTargetToken?.document.id;
      const theTargetUuid = theTargetToken?.document.uuid;
      if (game.user && theTargetId) updateUserTargets([theTargetId]);

      if (damageRoll) {
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
      if (!actionSave && saveRemove && saveDC > -1)
        // @ts-expect-error no dnd5e-types
        savedOverTimeEffectsToDelete[ownedItem.system.activities.contents[0].uuid] = { uuid: effect.uuid };

      if (details.removeCondition) {
        let value = replaceAtFields(details.removeCondition, rollData, { blankValue: 0, maxIterations: 3 });
        let remove;
        try {
          remove = await evalCondition(value, rollData, { errorReturn: true, async: true });
          // remove = Roll.safeEval(value);
        } catch (err) {
          const message = `midi-qol | gmOverTimeEffect | error when evaluating overtime remove condition ${value} - assuming true`;
          TroubleShooter.recordError(err, message);
          console.warn(message, err);
          remove = true;
        }
        if (remove) {
          // @ts-expect-error no dnd5e-types
          overTimeEffectsToDelete[ownedItem.system.activities.contents[0].uuid] = { uuid: effect.uuid }
        }
      }
      try {
        const options = {
          createWorkflow: true,
          configureDialog: false,
          saveDC,
          fastForwardAttack: true,
          fastForwardDamage: true,
          autoRollAttack: true,
          autoRollDamage: "onHit",
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
        await completeItemUse(ownedItem, { midiOptions: options }, { configure: false }, { rollMode, systemCard: false }); // worried about multiple effects in flight so do one at a time
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
  // These changed since overtime moved to _preUpdate function instead of hook
  // const prev = (combat.previous.round ?? 0) * 100 + (combat.previous.turn ?? 0);
  // let testTurn = combat.previous.turn ?? 0;
  // let testRound = combat.previous.round ?? 0;
  // const last = (combat.current.round ?? 0) * 100 + (combat.current.turn ?? 0);

  let toTest = prev;
  let count = 0;
  const maxIterations = combatStart ? 1 : 200;
  while (toTest <= last && count < maxIterations) { // step through each turn from prev to current
    count += 1; // make sure we don't do an infinite loop
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
  let localRoll = asUser?.id === game.user?.id;;
  if (localRoll) {
    return new Promise((resolve) => {
      const maxWait = 90; // If the activity usage doesn't complete in 90 seconds then we have a problem
      let saveTargets = Array.from(game.user?.targets ?? []).map(t => { return t.id });
      if (usage.midiOptions!.ignoreUserTargets) updateUserTargets([]);
      if (game.user && targetsToUse.size === 0 && activity.target?.affects?.type === "self") {
        updateUserTargets([]);
        const selfTarget = getToken(activity.item.actor);
        if (selfTarget) {
          selfTarget.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
          targetsToUse = new Set([selfTarget]);
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
      const castHookName = "dnd5e.postUseLinkedSpell";
      const castHookId = Hooks.on(castHookName, (activity, activityUsage, results) => {
        // dependent activity fired
        if (usage.sequenceId !== activityUsage.sequenceId) return;
        Hooks.off(castHookName, castHookId);
        //@ts-expect-error
        Hooks.off(abortHookName, abortHookId);
        //@ts-expect-error
        Hooks.off(completeHookName, completeHookId);
        if (debugEnabled > 0) warn(`spell use hook fired: ${activity.item?.name} ${completeHookName}`)
        updateUserTargets(saveTargets);
        resolve(usage.workflow);
      });
      //@ts-expect-error
      const abortHookId = Hooks.on(abortHookName, (workflow) => {
        if (workflow.sequenceId !== usage.sequenceId) return;
        //@ts-expect-error
        Hooks.off(abortHookName, abortHookId);
        //@ts-expect-error
        Hooks.off(completeHookName, completeHookId);
        Hooks.off(castHookName, castHookId);
        if (debugEnabled > 0) warn(`completeItemUse abort hook fired: ${workflow.workflowName} ${abortHookName}`)
        updateUserTargets(saveTargets);
        resolve(workflow);
      });

      let completeHookName = `midi-qol.postCleanup.${activity.uuid}`;
      // @ts-expect-error no clue
      if (!activity || activity.activity?.id) {
        // Magic items create a pseudo item when doing the roll so have to hope we get the right completion
        // forward activities wont call the expected postCleanup Hook
        completeHookName = "midi-qol.postCleanup";
      }
      //@ts-expect-error
      const completeHookId = Hooks.on(completeHookName, (workflow) => {
        if (workflow.sequenceId !== usage.sequenceId) return;
        //@ts-expect-error
        Hooks.off(completeHookName, completeHookId);
        //@ts-expect-error
        Hooks.off(abortHookName, abortHookId);
        Hooks.off(castHookName, castHookId);
        if (debugEnabled > 0) warn(`completeActivityUse complete hook fired: ${workflow.workflowName} ${completeHookName}`)
        updateUserTargets(saveTargets);
        resolve(workflow);
      });
      setTimeout(() => {
        //@ts-expect-error
        Hooks.off(abortHookName, abortHookId);
        //@ts-expect-error
        Hooks.off(completeHookName, completeHookId);
        Hooks.off(castHookName, castHookId);
        resolve(undefined);
      }, maxWait * 1000);
      usage.midiOptions!.targetsToUse = targetsToUse;
      // @ts-expect-error no dnd5e-types
      activity.use(usage, dialog, message).then(result => {
        if (!result) {
          //@ts-expect-error
          Hooks.off(abortHookName, abortHookId);
          //@ts-expect-error
          Hooks.off(completeHookName, completeHookId);
          Hooks.off(castHookName, castHookId);
          resolve(result)
        }
      });
    });
  } else {
    const newUsage = foundry.utils.deepClone(usage) as unknown as {sequenceId?: string; workflow?: Workflow; midiOptions: SerializedMidiOptions};
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
  fromMars5eChatCard?: boolean;
  fumble?: boolean | number;
  ignoreUserTargets?: boolean;
  isConcentrationCheck?: boolean;
  isCritical?: boolean;
  isDummy?: boolean;
  isFumble?: boolean;
  isMagicSave?: boolean;
  isTriggered?: boolean;
  item?: Item.Implementation;
  itemUuid?: string;
  noUseWarning?: boolean;
  parts?: string[];
  powerLevel?: number;
  proceedChecks?: {
    checkBonusAction?: boolean;
    checkReaction?: boolean;
    none?: boolean;
  };
  resetAdvantage?: boolean;
  rollAs?: Actor.Implementation | null;
  rollOptions?: WorkflowRollOptions;
  saveItem?: Item.Implementation;
  saveItemUuid?: string;
  simulate?: boolean;
  spellLevel?: number;
  target?: number;
  targets?: Set<foundry.canvas.placeables.Token.Implementation>;
  targetsToUse?: Set<foundry.canvas.placeables.Token.Implementation>;
  targetUuids?: string[];
  triggeredActivity?: boolean;
  updateWorkflow?: boolean;
  workflow?: Workflow;
  workflowOptions?: WorkflowOptions;
};
type SerializedMidiOptions = Omit<MidiOptions, "targetsToUse" | "rollAs" | "asUser"> & {
  targetsToUse?: string[];
  rollAs?: string;
}

export async function completeItemUse(itemRef: Item.Implementation | string, config: ActivityUseConfiguration & {legacy?: boolean, chooseActivity?: boolean} = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
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
  // @ts-expect-error no dnd5e-types
  const activities = item.system.activities?.filter(a => !item.getFlag("dnd5e", "riders.activity")?.includes(a.id) && !a.midiProperties?.automationOnly);
  if (activities.length === 0) {
    //@ts-expect-error no dnd5e-types
    return item.displayCard(message);
    // error(`completeItemUse | item ${item.name} ${item.uuid} does not have a suitable activity`);
    // return undefined;
  }
  if (activities.length === 1) { // if there is a single non-automation activity use it
    return completeActivityUse(activities[0], activityConfig, dialog, message);
  }

  if (activities?.length > 1 || chooseActivity) {
    const activity = await MidiActivityChoiceDialog.create(item);
    if (activity) return completeActivityUse(activity, activityConfig, dialog, message);

  }
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
  const vitalityResource = checkRule("vitalityResource");
  if (typeof vitalityResource === "string" && foundry.utils.getProperty(actor, vitalityResource.trim()) !== undefined) {
    const vitality = foundry.utils.getProperty(actor, vitalityResource.trim()) ?? 0;
    // @ts-expect-error no dnd5e-types
    if (vitality <= 0 && actor?.system.attributes?.hp?.value <= 0) {
      status = "dead";
    }
  } else {
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
  const dist = computeDistance(t1, t2, { wallsBlock, includeCover });
  return 0 <= dist && dist <= distance;
}

/** takes two tokens of any size and calculates the distance between them
*** gets the shortest distance betwen two tokens taking into account both tokens size
*** if wallblocking is set then wall are checked
**/
// TODO: this monster
export function computeDistance(t1: any /*Token*/, t2: any /*Token*/, options: boolean | { wallsBlock?: boolean, includeCover?: boolean } = { wallsBlock: false, includeCover: true }): number {
  if (!canvas || !canvas.scene) return -1;
  if (!canvas.grid || !canvas.dimensions) return -1;
  t1 = getPlaceable(t1);
  t2 = getPlaceable(t2);
  if (!t1 || !t2) return -1;
  if (!canvas || !canvas.grid || !canvas.dimensions) return -1;
  let wallsBlock: boolean, includeCover: boolean;
  if (typeof options === "boolean") {
    wallsBlock = options;
    includeCover = true;
    foundry.utils.logCompatibilityWarning("computeDistance(t1, t2, wallsBlock?: boolean) is deprecated in favor of computeDistance(t1, t2, { wallsBlock: boolean, includeCover: boolean }).", { since: "11.6.26", until: "12.5.0" });
  }
  else {
    ({ wallsBlock = false, includeCover = true } = options);
  }
  const actor = t1.actor;
  const ignoreWallsFlag = foundry.utils.getProperty(actor, `flags.${MODULE_ID}.ignoreWalls`);
  // get condition data & eval the property
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
  let coverVisible;
  // For levels autocover and simbul's cover calculator pre-compute token cover - full cover means no attack and so return -1
  // otherwise don't bother doing los checks they are overruled by the cover check
  //@ts-expect-error
  if (installedModules.get("levelsautocover") && game.settings.get("levelsautocover", "apiMode") && wallsBlock && configSettings.optionalRules.wallsBlockRange === "levelsautocover" && includeCover) {
    //@ts-expect-error
    const levelsautocoverData = AutoCover.calculateCover(t1, t2, getLevelsAutoCoverOptions());
    coverVisible = levelsautocoverData.rawCover > 0;
    if (!coverVisible) return -1;
  } else if (globalThis.CoverCalculator && configSettings.optionalRules.wallsBlockRange === "simbuls-cover-calculator" && includeCover) {
    if (t1 === t2) return 0; // Simbul's throws an error when calculating cover for the same token
    const coverData = globalThis.CoverCalculator.Cover(t1, t2);
    if (debugEnabled > 0) warn("computeDistance | simbuls cover calculator ", t1.name, t2.name, coverData);
    if (coverData?.data.results.cover === 3 && wallsBlock) return -1;
    coverVisible = true;
  } else if (installedModules.get("tokencover") && configSettings.optionalRules.wallsBlockRange === "tokencover" && includeCover) {
    const coverValue = calcTokenCover(t1, t2);
    if (coverValue === 3 && wallsBlock) return -1;
    coverVisible = true;
  }

  var x, x1, y, y1, d, r, segments: { ray: Ray }[] = [], rayDistance, distance;
  let heightDifference = 0;
  if (!(t2.document instanceof WallDocument)) {
    for (x = t1StartX; x < t1DocWidth; x++) {
      for (y = t1StartY; y < t1DocHeight; y++) {
        if (y === t1StartY + 1) {
          if (x > t1StartX && x < t1DocWidth - t1StartX) {
            // skip to the last y position;
            y = t1DocHeight - t1StartY;
          }
        }
        let origin;
        const point = canvas.grid.getCenterPoint({ x: Math.round(t1.document.x + (canvas.dimensions.size * x)), y: Math.round(t1.document.y + (canvas.dimensions.size * y)) });
        origin = new PIXI.Point(point.x, point.y);
        for (x1 = t2StartX; x1 < t2DocWidth; x1++) {
          for (y1 = t2StartY; y1 < t2DocHeight; y1++) {
            if (y1 === t2StartY + 1) {
              if (x1 > t2StartX && x1 < t2DocWidth - t2StartX) {
                // skip to the last y position;
                y1 = t2DocHeight - t2StartY;
              }
            }
            const point = canvas.grid.getCenterPoint({ x: Math.round(t2.document.x + (canvas.dimensions.size * x1)), y: Math.round(t2.document.y + (canvas.dimensions.size * y1)) });
            let dest = new PIXI.Point(point.x, point.y);
            const r = new foundry.canvas.geometry.Ray(origin, dest);
            if (wallsBlock) {
              switch (configSettings.optionalRules.wallsBlockRange) {
                case "center":
                  let collisionCheck;

                  collisionCheck = CONFIG.Canvas.polygonBackends.sight.testCollision(origin, dest, { source: t1.document, mode: "any", type: "sight" })
                  if (collisionCheck) continue;
                  break;
                case "centerLevels":
                case "levelsautocover":
                  // //@ts-expect-error
                  // TODO include auto cover calcs in checking console.error(AutoCover.calculateCover(t1, t2));
                  if (configSettings.optionalRules.wallsBlockRange === "centerLevels" && installedModules.get("levels")) {
                    if (coverVisible === false) continue;
                    if (coverVisible === undefined) {
                      let p1 = {
                        x: origin.x,
                        y: origin.y,
                        z: t1Elevation
                      }
                      let p2 = {
                        x: dest.x,
                        y: dest.y,
                        z: t2Elevation
                      }
                      //@ts-expect-error
                      const baseToBase = CONFIG.Levels.API.testCollision(p1, p2, "collision");
                      p1.z = t1TopElevation;
                      p2.z = t2TopElevation;
                      //@ts-expect-error
                      const topToBase = CONFIG.Levels.API.testCollision(p1, p2, "collision");
                      if (baseToBase && topToBase) continue;
                    }
                  } else {
                    let collisionCheck;
                    collisionCheck = CONFIG.Canvas.polygonBackends.sight.testCollision(origin, dest, { source: t1.document, mode: "any", type: "sight" })
                    if (collisionCheck) continue;
                  }
                  break;
                case "alternative":
                case "simbuls-cover-calculator":
                  if (coverVisible === undefined) {
                    let collisionCheck;
                    collisionCheck = CONFIG.Canvas.polygonBackends.sight.testCollision(origin, dest, { source: t1.document, mode: "any", type: "sight" })
                    if (collisionCheck) continue;
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
      return -1;
    }
    rayDistance = segments.map(ray => midiMeasureDistances([ray], { gridSpaces: true }));
    distance = Math.min(...rayDistance);
    if (configSettings.optionalRules.distanceIncludesHeight) {
      let t1ElevationRange = Math.max(t1DocHeight, t1DocWidth) * (canvas.dimensions?.distance ?? 5);
      if ((t2Elevation > t1Elevation && t2Elevation < t1TopElevation) || (t1Elevation > t2Elevation && t1Elevation < t2TopElevation)) {
        //check if bottom elevation of each token is within the other token's elevation space, if so make the height difference 0
        heightDifference = 0;
      }
      else if (t1Elevation < t2Elevation) { // t2 above t1
        heightDifference = Math.max(0, t2Elevation - t1TopElevation) + (canvas.dimensions?.distance ?? 5);
      }
      else if (t1Elevation > t2Elevation) { // t1 above t2
        heightDifference = Math.max(0, t1Elevation - t2TopElevation) + (canvas.dimensions?.distance ?? 5);
      }
    }
  } else {
    const w = t2.document
    let closestPoint = foundry.utils.closestPointToSegment(t1.center, w.object.edge.a, w.object.edge.b);
    distance = midiMeasureDistances([{ ray: new foundry.canvas.geometry.Ray(t1.center, closestPoint) }], { gridSpaces: true });
    if (configSettings.optionalRules.distanceIncludesHeight) {
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
  if (configSettings.optionalRules.distanceIncludesHeight) {

    // TODO experimental
    let nd = Math.min(distance, heightDifference);
    let ns = Math.abs(distance - heightDifference);
    // distance = nd + ns;
    let dimension = canvas.dimensions?.distance ?? 5;
    let diagonals = safeGetGameSetting("core", "gridDiagonals");
    const GRID_DIAGONALS = CONST.GRID_DIAGONALS;
    // Determine the offset distance of the diagonal moves
    let cd;
    switch (diagonals) {
      case GRID_DIAGONALS.EQUIDISTANT: cd = nd; break;
      case GRID_DIAGONALS.EXACT: cd = Math.SQRT2 * nd; break;
      case GRID_DIAGONALS.APPROXIMATE: cd = 1.5 * nd; break;
      case GRID_DIAGONALS.RECTILINEAR: cd = 2 * nd; break;
      case GRID_DIAGONALS.ALTERNATING_1:
        // TODO get the diagonals return from MidiMeasureDistances
        // if ( result.diagonals & 1 ) cd = ((nd + 1) & -2) + (nd >> 1);
        // else cd = (nd & -2) + ((nd + 1) >> 1);
        cd = ((nd + 1) & -2) + (nd >> 1);
        break;
      case GRID_DIAGONALS.ALTERNATING_2:
        // TODO get the diagonals return from MidiMeasureDistances
        // if ( result.diagonals & 1 ) cd = (nd & -2) + ((nd + 1) >> 1);
        //  else cd = ((nd + 1) & -2) + (nd >> 1);
        cd = ((nd + 1) & -2) + (nd >> 1);
        break;
      case GRID_DIAGONALS.ILLEGAL:
        // Don't think I want this to be done
        cd = 2 * nd;
        nd = 0;
        // n = di + dj;
        ns = distance + heightDifference;
        break;
    }
    distance = ns + cd;
  }
  return Math.max(distance, 0);
};

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
    if (!(activity.range.value ?? activity.range.reach) && !activity.range.long && activity.range.units !== "touch") return {
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
    let range = (activity.range?.value ?? activity.range?.reach ?? 0);
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

    const meleeActions = new Set(["mwak", "msak", "mpak"]);
    const isMeleeAttack = meleeActions.has(activity.actionType);
    // @ts-expect-error no dnd5e-types
    const hasThrownProperty = activity.item.labels.properties?.some(p => p.abbr === "thr");

    if (isMeleeAttack && !hasThrownProperty) {
      longRange = 0;
    }

    const isMetric = game.settings.get("dnd5e", "metricLengthUnits") ?? false;
    const fudgeFactor = configSettings.gridlessFudge ?? 0;

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
        wallsBlock: !!configSettings.optionalRules.wallsBlockRange && !ignoreTotalCover,
        includeCover: !ignoreTotalCover,
      };

      const rawDistance = computeDistance(token, target, coverOptions);
      const distance = parseFloat(rawDistance.toFixed(isMetric ? 1 : 0)) - fudgeFactor;

      if ((longRange !== 0 && distance > longRange) || (distance > range && longRange === 0)) {
        log(`${target.name} is too far ${distance} from your character you cannot hit`)
        if (checkMechanic("checkRange") === "longdisadv" && ["rwak", "rsak", "rpak"].includes(activity.actionType)) {
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
      if (distance < 0) {
        log(`${target.name} is blocked by a wall`)
        return {
          result: "fail",
          reason: `${actor?.name}'s target is blocked by a wall`,
          range,
          longRange
        }
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

export const FULL_COVER = 999;
export const THREE_QUARTERS_COVER = 5;
export const HALF_COVER = 2;

export function computeCoverBonus(attackerIn: TokenOrDocument, targetIn: TokenOrDocument, activity?: Activity): number {
  const attacker = attackerIn instanceof TokenDocument ? attackerIn.object : attackerIn;
  const target = targetIn instanceof TokenDocument ? targetIn.object : targetIn;
  let existingCoverBonus = target?.actor?.flags?.[MODULE_ID]?.acBonus ?? 0;
  let item: Item.Implementation | undefined;
  if (activity instanceof Item) {
    item = activity;
    activity = undefined;
    foundry.utils.logCompatibilityWarning("computeCoverBonus(attacker, target, item) is deprecated in favor of computeCoverBonus(attacker, target, activity");
  } else if (activity) {
    item = activity.item;
  }
  if (!attacker || !target) return existingCoverBonus;
  let coverBonus = 0;
  try {
    switch (configSettings.optionalRules.coverCalculation) {
      case "levelsautocover":
        //@ts-expect-error
        if (!installedModules.get("levelsautocover") || !game.settings.get("levelsautocover", "apiMode") || !AutoCover) return 0;
        //@ts-expect-error
        const coverData = AutoCover.calculateCover(attacker, target);
        // const coverData = AutoCover.calculateCover(attacker, target, {DEBUG: true});
        //@ts-expect-error
        const coverDetail = AutoCover.getCoverData();
        if (coverData.rawCover === 0) coverBonus = FULL_COVER;
        else if (coverData.rawCover > coverDetail[1].percent) coverBonus = 0;
        else if (coverData.rawCover < coverDetail[0].percent) coverBonus = THREE_QUARTERS_COVER;
        else if (coverData.rawCover < coverDetail[1].percent) coverBonus = HALF_COVER;
        if (coverData.obstructingToken) coverBonus = Math.max(2, coverBonus);
        console.log("midi-qol | ComputerCoverBonus - For token ", attacker.name, " attacking ", target.name, " cover data is ", coverBonus, coverData, coverDetail)
        break;
      case "simbuls-cover-calculator":
        if (!installedModules.get("simbuls-cover-calculator")) return 0;
        if (globalThis.CoverCalculator) {
          const coverData = globalThis.CoverCalculator.Cover(attacker, target);
          if (attacker === target) {
            coverBonus = 0;
            break;
          }
          if (coverData?.data?.results.cover === 3) coverBonus = FULL_COVER;
          else coverBonus = -coverData?.data?.results.value || 0;
          console.log("midi-qol | ComputeCover Bonus - For token ", attacker.name, " attacking ", target.name, " cover data is ", coverBonus, coverData)
        }
        break;
      case "tokencover":
        if (!installedModules.get("tokencover")) coverBonus = 0;
        else {
          const coverValue = calcTokenCover(attacker, target);
          if (coverValue === 4 || coverValue === 3) coverBonus = FULL_COVER;
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

    //TODO is this right or should it be the same as non-spell?
    // @ts-expect-error no dnd5e-types
    if ((activity?.midiProperties?.ignoreFullCover) && item?.type === "spell") coverBonus = 0;
    else if ((activity?.midiProperties?.ignoreFullCover) && coverBonus === FULL_COVER) coverBonus = THREE_QUARTERS_COVER;

    // @ts-expect-error no dnd5e-types
    if ((activity?.actionType ?? item?.system.actionType) === "rwak" && attacker.actor && coverBonus !== FULL_COVER && coverBonus !== 0
      && (attacker.actor?.flags?.[MODULE_ID]?.sharpShooter || attacker.actor?.flags?.dnd5e?.sharpShooter)) {
      const conditionData = createConditionData({ item, actor: attacker.actor, activity, target });
      let sharpShooterEnabled = evalCondition(attacker.actor?.flags?.dnd5e?.sharpShooter, conditionData);
      sharpShooterEnabled ||= evalCondition(attacker.actor?.flags?.[MODULE_ID]?.sharpShooter, conditionData);
      if (sharpShooterEnabled) coverBonus = 0;
    }
    // @ts-expect-error no dnd5e-types
    if (["rsak"/*, "rpak"*/].includes((activity?.actionType ?? item?.system.actionType))
      && attacker.actor
      && (attacker.actor.flags?.dnd5e?.spellSniper)
      && coverBonus !== FULL_COVER && coverBonus !== 0) {
      const conditionData = createConditionData({ item, actor: attacker.actor, activity, target });
      let spellSniperEnabled: boolean | undefined = evalCondition(attacker.actor.flags.dnd5e.spellSniper, conditionData);
      if (spellSniperEnabled) coverBonus = 0;
    }
    if (target.actor && coverBonus > existingCoverBonus)
      foundry.utils.setProperty(target.actor, `flags.${MODULE_ID}.acBonus`, coverBonus);
    else coverBonus = existingCoverBonus;
    return coverBonus;
  } catch (err) {
    const message = "Error in computeCoverBonus";
    error(message, err);
    TroubleShooter.recordError(err, message)
    return 0;
  }
}
export function isAutoFastAttack(workflow?: Workflow): boolean {
  if (workflow?.rollOptions?.fastForwardAttack !== undefined) return workflow.rollOptions.fastForwardAttack
  if (workflow?.workflowOptions?.autoFastAttack !== undefined) return workflow.workflowOptions.autoFastAttack;
  if (workflow?.workflowType === "DummyWorkflow") return !!workflow.rollOptions.fastForward;
  return game.user?.isGM ? configSettings.gmAutoFastForwardAttack : ["all", "attack"].includes(configSettings.autoFastForward);
}

export function isAutoFastDamage(workflow?: Workflow): boolean {
  if (workflow?.rollOptions?.fastForwardDamage !== undefined) return workflow.rollOptions.fastForwardDamage;
  if (workflow?.workflowOptions?.fastForwardDamage !== undefined) return workflow.workflowOptions.fastForwardDamage;
  if (workflow?.workflowType === "DummyWorkflow") return !!workflow.rollOptions.fastForwardDamage;
  return game.user?.isGM ? configSettings.gmAutoFastForwardDamage : ["all", "damage"].includes(configSettings.autoFastForward)
}

export function autoConsumeResource(workflow?: Workflow): string {
  if (workflow?.workflowOptions?.autoConsumeResource !== undefined) return workflow.workflowOptions.autoConsumeResource;
  return game.user?.isGM ? configSettings.gmConsumeResource : configSettings.consumeResource;
}

export function getAutoRollDamage(workflow?: Workflow): string {
  if (workflow?.actor.type === configSettings.averageDamage || configSettings.averageDamage === "all") return "onHit";
  if (workflow?.workflowOptions?.autoRollDamage) {
    const damageOptions = Object.keys(geti18nOptions("autoRollDamageOptions"));
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
      if (["all", "attack"].includes(activitySetting)) return true;
      if (activitySetting !== "default") return false;
    }
  }
  return game.user?.isGM ?
    ["all", "attack"].includes(configSettings.gmRemoveButtons) :
    ["all", "attack"].includes(configSettings.removeButtons);
}
export function getRemoveDamageButtons(activity?: Activity): boolean {
  if (activity) {
    const activitySetting = activity.midiProperties?.removeChatButtons;
    if (activitySetting) {
      if (["all", "damage"].includes(activitySetting)) return true;
      if (activitySetting !== "default") return false;
    }
  }
  return game.user?.isGM ?
    ["all", "damage"].includes(configSettings.gmRemoveButtons) :
    ["all", "damage"].includes(configSettings.removeButtons);
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
      case CONST.TOKEN_DISPOSITIONS.HOSTILE:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideHostileNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "hostileNameReplacement") as string;
      case CONST.TOKEN_DISPOSITIONS.SECRET:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideSecretNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "secretNameReplacement") as string;
      case CONST.TOKEN_DISPOSITIONS.NEUTRAL:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideNeutralNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "neutralNameReplacement") as string;
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
        const tokenDistance = computeDistance(t, token, { wallsBlock: true });
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

  if (CONFIG.statusEffects.find(se => se.id === (CONFIG.specialStatusEffects.INVISIBLE ?? "invisible"))) {
    await (token.actor)?.toggleStatusEffect(CONFIG.specialStatusEffects.INVISIBLE, { active: false })
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
class RollModifyDialog extends HandlebarsApplicationMixin(ApplicationV2) {
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
    item: Item | undefined
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
    this.data.flags = this.data.flags.filter(flagName => {
      if ((getOptionalCountRemaining(this.data.actor, `${flagName}.count`)) < 1) return false;
      return foundry.utils.getProperty(this.data.actor, flagName) !== undefined
    });
    if (this.data.flags.length === 0) this.close();
    this.data.buttons = this.data.flags.reduce((obj, flag) => {
      let flagData: any = foundry.utils.getProperty(this.data.actor ?? {}, flag) as any; // TODO This should be tightened up
      let value: string | undefined = foundry.utils.getProperty(flagData ?? {}, this.data.flagSelector) as string;
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
  if (!options) options = {};
  //TODO match the renderRoll to the roll type
  const newRollHTML = await midiRenderRoll(newRoll);
  const originalRollHTML = await midiRenderRoll(originalRoll);
  const chatData: any = foundry.utils.mergeObject({
    flavor: `${title}`,
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    content: `${originalRollHTML}<br>${newRollHTML}`,
    whisper: [player?.id ?? ""],
    rolls: [originalRoll, newRoll],
    sound: CONFIG.sounds.dice,
  }, options.messageData);
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

    // const rollMode = foundry.utils.getProperty(this.actor ?? {}, button.key)?.rollMode ?? safeGetGameSetting("core", "rollMode");
    // @ts-expect-error no dnd5e-types
    let rollMode = roll.options.rollMode;
    rollMode = (foundry.utils.getProperty(this.actor ?? {}, button.key) as any)?.rollMode ?? rollMode ?? safeGetGameSetting("core", "rollMode");
    if (!hasEffectGranting(this.actor, button.key, flagSelector)) return;
    let resultApplied = false; // This is just for macro calls
    let macroToCall: string = "";
    const allFlagSelector = flagSelector.split(".").slice(0, -1).join(".") + ".all";
    let specificMacro = false;
    const possibleMacro = foundry.utils.getProperty(this.actor ?? {}, `${button.key}.${flagSelector}`) ||
      foundry.utils.getProperty(this.actor ?? {}, `${button.key}.${allFlagSelector}`);
    if (possibleMacro && (button.value.trim().startsWith("ItemMacro") || button.value.trim().startsWith("Macro") || button.value.trim().startsWith("function"))) {
      macroToCall = button.value;
      if (macroToCall.startsWith("Macro.")) macroToCall = macroToCall.replace("Macro.", "");
      specificMacro = true;
    } else if ((foundry.utils.getProperty(this.actor ?? {}, `${button.key}.macroToCall`) as string)?.trim()) {
      macroToCall = (foundry.utils.getProperty(this.actor ?? {}, `${button.key}.macroToCall`) as string)?.trim();
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
        workflow = new DummyWorkflow(this.actor ?? this, undefined, ChatMessage.getSpeaker({ actor: this.actor }), [], { item });
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
        if (showDiceSoNice) await displayDSNForRoll(reRoll, rollType, rollMode);
        newRoll = reRoll; break;
      case "reroll-query":
        reRoll = reRoll = await roll!.reroll();
        if (showDiceSoNice) await displayDSNForRoll(reRoll, rollType, rollMode);
        const newRollHTML = await midiRenderRoll(reRoll);
        if (await DialogV2.confirm({ window: { title: "Confirm reroll" }, content: `Replace ${rollHTML} with ${newRollHTML}`, defaultYes: true }))
          newRoll = reRoll
        else
          newRoll = roll!;
        break;
      case "reroll-kh": reRoll = await roll!.reroll();
        if (showDiceSoNice) await displayDSNForRoll(reRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode);
        newRoll = reRoll;
        if (reRoll.total! <= (roll!.total ?? 0)) newRoll = roll!;
        break;
      case "reroll-kl": reRoll = await roll!.reroll();
        newRoll = reRoll;
        if (reRoll.total! > (roll!.total ?? 0)) newRoll = roll!;
        if (showDiceSoNice) await displayDSNForRoll(reRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode);
        break;
      case "reroll-max": newRoll = await roll!.reroll({ maximize: true });
        if (showDiceSoNice) await displayDSNForRoll(newRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode);
        break;
      case "reroll-min": newRoll = await roll!.reroll({ minimize: true });
        if (showDiceSoNice) await displayDSNForRoll(newRoll, rollType === "attackRoll" ? "attackRollD20" : rollType, rollMode);
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
      default:
        if (typeof button.value === "string" && button.value.startsWith("replace ")) {
          const rollParts = button.value.split(" ");
          newRoll = new Roll(rollParts.slice(1).join(" "), { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll!.data });
          newRoll = await newRoll.evaluate();
          if (showDiceSoNice) await displayDSNForRoll(newRoll, rollType, rollMode);
        } else if (typeof button.value == "string" && button.value.startsWith("reroll-withBonus")) {
          let bonus = button.value.split("reroll-withBonus ").slice(1).join(" ");
          if (!bonus.startsWith("+")) bonus = "+" + bonus;
          //@ts-expect-error
          newRoll = await new roll.constructor(`${roll.formula} ${bonus}`, { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll.data }).roll();
          if (showDiceSoNice) await displayDSNForRoll(newRoll, rollType, rollMode);
        } else if (flagSelector.startsWith("damage.") && foundry.utils.getProperty(this.actor ?? this, `${button.key}.criticalDamage`)) {
          //@ts-expect-error .DamageRoll
          const DamageRoll = CONFIG.Dice.DamageRoll
          let rollOptions = foundry.utils.duplicate(roll!.options);
          //@ts-expect-error
          rollOptions.configured = false;
          // rollOptions = { critical: (this.isCritical || this.rollOptions.critical), configured: false };
          //@ts-expect-error D20Roll
          newRoll = CONFIG.Dice.D20Roll.fromRoll(roll);
          const tempRoll = new DamageRoll(`${button.value}`, { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll!.data }, rollOptions);
          await tempRoll.evaluate();
          setRollOperatorEvaluated(tempRoll);
          if (showDiceSoNice) await displayDSNForRoll(tempRoll, rollType, rollMode);
          newRoll = addRollTo(roll!, tempRoll);
        } else {
          //@ts-expect-error
          newRoll = CONFIG.Dice.D20Roll.fromRoll(roll);
          const tempRoll = await (new Roll(button.value, { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll!.data })).roll();
          if (showDiceSoNice) await displayDSNForRoll(tempRoll, rollType, rollMode);
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
  const oldRoll = foundry.utils.deepClone(roll);;
  for (let flagName of bonusFlags) {
    if ((getOptionalCountRemaining(this.actor, `${flagName}.count`)) < 1) continue;
    let activationCondition: string | undefined = foundry.utils.getProperty(this.actor ?? {}, `${flagName}.activation`) as string;
    if (activationCondition !== undefined) {
      activationCondition = await evalCondition(activationCondition, conditionData, { errorReturn: true, async: true });
      if (!activationCondition) continue;
    }
    let forcedCondition: string | undefined = foundry.utils.getProperty(this.actor ?? {}, `${flagName}.force`) as string;
    if (forcedCondition !== undefined) {
      forcedCondition = await evalCondition(forcedCondition, conditionData, { errorReturn: true, async: true });
      if (forcedCondition) {
        const altFlag = flagSelector.split(".").slice(0, -1).join(".") + ".all";
        await callback(undefined, {
          key: flagName,
          value: foundry.utils.getProperty(this.actor ?? {}, `${flagName}.${flagSelector}`) ?? foundry.utils.getProperty(this.actor ?? {}, `${flagName}.${altFlag}`) ?? "",
          label: "none"
        });
        lastForceFlag = flagName;
      }
      continue;
    }
    if (foundry.utils.getProperty(this.actor, flagName) !== undefined) validFlags.push(flagName);
  }
  if (showRoll && lastForceFlag !== "") {
    DSNMarkDiceDisplayed(roll);
    // const rollMode = foundry.utils.getProperty(this.actor ?? {}, lastForceFlag)?.rollMode ?? options.rollMode ?? safeGetGameSetting("core", "rollMode");
    //@ts-expect-error
    const rollMode = foundry.utils.getProperty(this.actor ?? {}, lastForceFlag)?.rollMode ?? oldRoll.options.rollMode ?? safeGetGameSetting("core", "rollMode");
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
        workflow: this instanceof Workflow ? this : undefined
      }).render({ force: true });
  });
}

export function getOptionalCountRemainingShortFlag(actor: Actor.Implementation, flag: string) {
  const flagPrefix = `flags.${MODULE_ID}.optional.${flag}`;
  const countRemaining = getOptionalCountRemaining(actor, `${flagPrefix}.count`) && getOptionalCountRemaining(actor, `${flagPrefix}.countAlt`);
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
export function getOptionalCountRemaining(actor: Actor.Implementation, flag: string) {
  const countValue = foundry.utils.getProperty(actor, flag) as string;
  if (!countValue) return 1;
  if (Number.isNumeric(countValue)) return countValue;
  if (["each-round", "each-turn"].includes(countValue) && game.combat) {
    let usedFlag = flag.replace(".count", ".used");
    // check for the flag
    if (foundry.utils.getProperty(actor, usedFlag) === game.combat.uuid) return 0;
  } else if (["turn"].includes(countValue) && game.combat?.turn) {
    let usedFlag = flag.replace(".count", ".used");
    if (foundry.utils.getProperty(actor, usedFlag) === game.combat.uuid || game.combat?.turns[game.combat?.turn]?.actor !== actor) return 0;
  } else if (countValue === "reaction") {
    // return await hasUsedReaction(actor)
    return actor.flags?.[MODULE_ID]?.actions?.reactionCombatRound && needsReactionCheck(actor) ? 0 : 1;
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
}

export function hasEffectGranting(actor: Actor.Implementation, key: string, selector: string) {
  // Actually check for the flag being set...
  if (getOptionalCountRemainingShortFlag(actor, key) <= 0) return false;
  let changeKey = `${key}.${selector}`;
  let hasKey = foundry.utils.getProperty(actor ?? {}, changeKey);
  if (hasKey !== undefined) return true;
  let allKey = selector.split(".");
  allKey[allKey.length - 1] = "all";
  changeKey = `${key}.${allKey.join(".")}`;
  hasKey = foundry.utils.getProperty(actor ?? {}, changeKey);
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

export async function doReactions(targetRef: TokenOrDocument | string, triggerTokenUuid: string | undefined, triggeringRoll: Roll | null | undefined, triggerType: string, options: any = {}): Promise<{ name?: string , uuid?: string , ac?: number }> {
  const target = getToken(targetRef);
  try {
    const noResult = { name: undefined, uuid: undefined, ac: undefined };
    if (!target) return noResult;
    if (!target.actor || !target.actor.flags) return noResult;

    // TODO V4 Change no reactions if incapacitated - I think this makes sense.
    if (checkIncapacitated(target.actor, debugEnabled > 0, false)) return noResult;
    if (checkMechanic("incapacitated")) {
      try {
        enableNotifications(false);
        if (checkIncapacitated(target.actor, debugEnabled > 0, false)) return noResult;
      } finally {
        enableNotifications(true);
      }
    }

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
        // @ts-expect-error no dnd5e-types
        for (let activity of theItem.system.activities) {
          // @ts-expect-error no dnd5e-types
          const activationType = item.system.linkedActivity?.activation.type ??
          activity.activation?.type;
          if (!activationType?.includes("reaction")) continue;
          if (activationType !== "reaction") {
            console.warn(`midi-qol | itemReaction | item ${item.name} ${activity.name} has a reaction type of ${activity.activation.type} which is deprecated - please update to reaction and reaction conditions`)
          }
          if ((activity.activation?.value ?? 1) > 0 && usedReaction) continue; // TODO can't specify 0 cost reactions in dnd5e 4.x - have to find another way
          // @ts-expect-error no dnd5e-types
          if (!item.system.attuned && item.system.attunement === "required") continue;
          let reactionCondition = activity.reactionCondition;
          let isValid = false;
          // cast activities will get picked up by the spells they create on the actor
          if (activity instanceof (GameSystemConfig.activityTypes.cast.documentClass as Function)) continue;
          // @ts-expect-error no dnd5e-types
          if (item.type === "spell") {
            // @ts-expect-error no dnd5e-types
            if (item.system.linkedActivity && ["weapon", "consumable", "equipment", "loot", "feat"].includes(item.system.linkedActivity.item.type)) {
              // @ts-expect-error no dnd5e-types
              if (item.system.linkedActivity.item.type === "weapon" && !item.system.linkedActivity.item.system.magicAvailable) continue;
              // @ts-expect-error no dnd5e-types
              if (["weapon", "consumable", "equipment", "loot"].includes(item.system.linkedActivity.item.type)
                // @ts-expect-error no dnd5e-types
              && !theItem.system.linkedActivity.item.system.equipped) continue;
              const config = activity._prepareUsageConfig({ create: false });
              const canUse = await activity._prepareUsageUpdates(config, { returnErrors: true });
              if (canUse instanceof Array) continue; // insufficent uses available
              isValid = true;
            } else if (configSettings.ignoreSpellReactionRestriction) isValid = true;
            // @ts-expect-error no dnd5e-types
            else if (["atwill", "innate"].includes(item.system.preparation.mode)) isValid = true;
            // @ts-expect-error no dnd5e-types
            else if (item.system.level === 0) isValid = true;
            // @ts-expect-error no dnd5e-types
            else if (item.system.preparation?.prepared !== true && item.system.preparation?.mode === "prepared") continue;
            // @ts-expect-error no dnd5e-types
            else if (item.system.level <= maxLevel) isValid = true;
          } else {
            const config = activity._prepareUsageConfig({ create: false });
            const canUse = await activity._prepareUsageUpdates(config, { returnErrors: true });
            if (canUse instanceof Array) continue; // insufficent uses available
            isValid = true;
          }
          if (!isValid) continue;
          if (reactionCondition) {
            if (debugEnabled > 0) warn(`for ${target.actor.name} ${theItem.name} using condition ${reactionCondition}`);
            const returnvalue = await evalReactionActivationCondition(options.workflow, reactionCondition, target, { async: true, extraData: { reaction: reactionTriggerLabelFor(triggerType) } });
            if (!returnvalue) continue;
          } else {
            if (debugEnabled > 0) warn(`for ${target.actor.name} ${theItem.name} using ${triggerType} filter`);
            if (!(activity.activation?.type === triggerType || (triggerType === "reactionhit" && activity.activation?.type === "reaction")))
              continue;
          }
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
    const rollOptions = geti18nOptions("ShowReactionAttackRollOptions");
    // {"none": "Attack Hit", "d20": "d20 roll only", "d20Crit": "d20 + Critical", "all": "Whole Attack Roll"},

    let content: string | undefined = reactionFlavor;
    if (["isHit", "isMissed", "isCrit", "isFumble", "isAttacked"].includes(reactionTriggerLabelFor(triggerType))) {
      switch (configSettings.showReactionAttackRoll) {
        case "all":
          content = `${reactionFlavor} - ${rollOptions.all} ${triggeringRoll?.total ?? ""}`;
          break;
        case "allCrit":
          //@ts-expect-error
          const criticalString = triggeringRoll?.isCritical ? `<span style="color: green">(${i18n("DND5E.Critical")})</span>` : "";
          content = `${reactionFlavor} - ${rollOptions.all} ${triggeringRoll?.total ?? ""} ${criticalString}`;
          break;
        case "d20":
          //@ts-expect-error
          const theRoll = triggeringRoll?.terms[0]?.results ? triggeringRoll.terms[0].results[0].result : triggeringRoll?.terms[0]?.total ? triggeringRoll.terms[0].total : "";
          content = `${reactionFlavor} ${rollOptions.d20} ${theRoll}`;
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
        await busyWait(0.05); // allow pending transactions to complete
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
        // Inaccurate, but simplifies things
        else reactionActivities.push(ref as unknown as Activity);
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
    if (validFlags.length > 0 && triggerType === "reaction") {
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
      let displayBonusRolls: boolean | undefined = validFlags.reduce((acc: boolean | undefined, flag: string) => (acc || (foundry.utils.getProperty(this.actor ?? {}, `${flag}.displayBonusRolls`) as boolean)), undefined);
      if (!displayBonusRolls) displayBonusRolls = checkMechanic("displayBonusRolls") as boolean;
      // @ts-expect-error no dnd5e-types
      const newAC = await bonusDialog.bind(data)(validFlags, "ac", displayBonusRolls !== false, `${actor.name} - ${i18n("DND5E.AC")} ${actor.system.attributes.ac.value}`, acRoll, "roll");
      const endTime = Date.now();
      if (debugEnabled > 0) warn("promptReactions | returned via bonus dialog ", endTime - startTime)
      return { name: actor.name, uuid: actor.uuid, ac: newAC?.total };
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
          // options = foundry.utils.mergeObject(options.workflowOptions ?? {}, {triggerTokenUuid, checkGMStatus: false}, {overwrite: true});
          const itemRollOptions = foundry.utils.mergeObject({
            createWorkflow: true,
            configureDialog: true,
            checkGMStatus: false,
            targetUuids: activity.target?.affects?.type !== "self" ? [triggerTokenUuid] : [getOrCreateTokenForActor(actor)?.document?.uuid],
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
class ReactionDialog extends HandlebarsApplicationMixin(ApplicationV2) {
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
async function asyncMySafeEval(expression: string, sandbox: AnyMutableObject, onErrorReturn?: any): Promise<any> {
  let result;
  try {
    expression = expression.replace(/confirm\((.*)\)/g, "await confirm($1)");
    const src = 'with (sandbox) { return ' + expression + '}';
    let AsyncFunction = foundry.utils.AsyncFunction;
    // @ts-expect-error
    const evl = AsyncFunction("sandbox", src) as ((arg: any) => Promise<any>);;
    sandbox = foundry.utils.mergeObject(sandbox, {
      Roll,
      findNearby,
      findNearbyCount,
      checkNearby,
      hasCondition,
      checkDefeated,
      checkIncapacitated,
      canSee,
      canSense,
      computeDistance,
      checkActivityRange,
      checkDistance,
      contestedRoll,
      fromUuidSync,
      confirm,
      nonWorkflowTargetedToken: game.user?.targets.first()?.document.uuid,
      combat: game.combat,
      evalRaceOrType: raceOrType,
      evalTypeOrRace: typeOrRace
    });
    const sandboxProxy = new Proxy(sandbox, {
      has: () => true, // Include everything
      get: (t, k) => k === Symbol.unscopables ? undefined : (t[k as string] ?? Math[k]),
      set: () => { error("midi-qol | asnycMySafeEval | You may not set properties of the sandbox environment"); return false} // No-op
    });
    result = await evl.call(null, sandboxProxy);
  } catch (err) {
    // @ts-expect-error sandbox confuses
    const message = `midi-qol | asyncMySafeEval | activation condition (${expression}) error, actorUuid: ${sandbox.actorUuid} itemUuid: ${sandbox.item?.uuid} targetUuid: ${sandbox.targetUuid}`;
    console.warn(message, err)
    TroubleShooter.recordError(err, message);
    result = onErrorReturn;
  }
  if (Number.isNumeric(result)) return Number(result)
  return result;
};

function mySafeEval(expression: string, sandbox: AnyMutableObject, onErrorReturn?: any): any {
  let result;
  try {
    const src = 'with (sandbox) { return ' + expression + '}';
    if (expression.includes("Roll(")) {
      error("safeEval | Roll expressions are not supported", expression)
      expression = expression.replaceAll(/evaluate\s*\({\s*async:\s* false\s*}\)/g, "evaluateSync({strict: false})")
      error("Expression replaced with ", expression);
    }
    const evl = new Function('sandbox', src);
    sandbox = foundry.utils.mergeObject(sandbox, {
      Roll,
      findNearby,
      findNearbyCount,
      checkNearby,
      hasCondition,
      checkDefeated,
      checkIncapacitated,
      canSee,
      canSense,
      computeDistance,
      checkActivityRange,
      checkDistance,
      fromUuidSync,
      nonWorkflowTargetedToken: game.user?.targets.first()?.document.uuid,
      combat: game.combat,
      evalRaceOrType: raceOrType,
      evalTypeOrRaceEval: typeOrRace
    });

    const sandboxProxy = new Proxy(sandbox, {
      has: () => true, // Include everything
      get: (t, k) => k === Symbol.unscopables ? undefined : (t[k as string] ?? Math[k]),
      set: () => { error("mySafeEval | You may not set properties of the sandbox environment"); return false } // No-op
    });
    result = evl(sandboxProxy);
  } catch (err) {
    // @ts-expect-error sandbox confuses
    const message = `midi-qol | asyncMySafeEval | activation condition (${expression}) error, actorUuid: ${sandbox.actorUuid} itemUuid: ${sandbox.item?.uuid} targetUuid: ${sandbox.targetUuid}`;
    console.warn(message, err)
    TroubleShooter.recordError(err, message);
    result = onErrorReturn;
  }
  if (Number.isNumeric(result)) return Number(result)
  return result;
};

export function evalReactionActivationCondition(workflow: Workflow, condition: string | undefined | boolean, target: TokenOrDocument, options: any = {}): boolean {
  if (options.errorReturn === undefined) options.errorReturn = false
  // if (condition === undefined || condition === "" || condition === false) return false;
  return evalActivationCondition(workflow, condition, target, options);
}
export function evalActivationCondition(workflow: Workflow | undefined, condition: string | undefined | boolean, target?: TokenOrDocument, options: any = {}): boolean {
  if (condition === undefined || condition === "" || condition === true) return true;
  if (condition === false) return false;
  createConditionData({ workflow, target, actor: workflow?.actor, extraData: options?.extraData, item: options.item });
  options.errorReturn ??= true;
  const returnValue = evalCondition(condition, workflow?.conditionData, options);
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

export function raceOrType(entity: TokenOrDocument | Actor | string): string {
  const actor = getActor(entity);
  const systemData = actor?.system;
  if (!systemData) return "";
  // @ts-expect-error no dnd5e-types
  if (systemData.details.race) return (systemData.details?.race?.name ?? systemData.details?.race)?.toLocaleLowerCase() ?? "";
  // @ts-expect-error no dnd5e-types
  return systemData.details.type?.value?.toLocaleLowerCase() ?? "";
}

export function createConditionData(data: {
  workflow?: Workflow,
  target?: TokenOrDocument | Actor | string,
  actor?: Actor.Implementation | null,
  item?: Item | string,
  extraData?: any,
  activity?: Activity,
  tokenUuid?: string,
  options?: any | undefined
}) {
  const actor = data.workflow?.actor ?? data.actor;
  let item: Item.Implementation | undefined;
  if (data.item) {
    if (data.item instanceof Item) item = data.item;
    else if (typeof data.item === "string") item = fromUuidSync(data.item) as Item.Implementation | undefined;
  }
  if (!item) item = data.activity?.item ?? data.workflow?.activity?.item ?? data.workflow?.item;
  let rollData: any = data.activity?.getRollData() ?? item?.getRollData() ?? actor?.getRollData() ?? {};
  rollData = foundry.utils.mergeObject(rollData, data.extraData ?? {});
  rollData.isAttuned = rollData.item?.attuned || rollData.item?.attunement === "";
  rollData.options = data?.options;
  rollData.isConcentrationCheck = foundry.utils.getProperty(rollData, "options.messageData.flags.midi-qol.isConcentrationCheck");
  rollData.isDeathSave = foundry.utils.getProperty(rollData, "options.messageData.flags.dnd5e.roll.type") === "death";
  rollData.actor = {};
  rollData.actor.raceOrType = actor ? raceOrType(actor) : "";
  rollData.actor.typeOrRace = actor ? typeOrRace(actor) : "";
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
        rollData.targetUuid = theTarget.document.uuid
        rollData.targetId = theTarget.id;
        rollData.targetActorUuid = theTargetActor?.uuid;
        rollData.targetActorId = theTargetActor?.id;
        rollData.raceOrType = theTargetActor ? raceOrType(theTargetActor) : "";
        rollData.typeOrRace = theTargetActor ? typeOrRace(theTargetActor) : "";
        rollData.target.raceOrType = theTarget.actor ? raceOrType(theTargetActor) : "";
        rollData.target.typeOrRace = theTarget.actor ? typeOrRace(theTargetActor) : "";
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
    rollData.tokenId = (data.target as (TokenOrDocument))?.id ?? data.workflow?.token?.id; // deprecated
    if (data.workflow) {
      rollData.w = data.workflow;
      rollData.workflow = data.workflow;
      rollData.activity = data.workflow.activity;
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
export function evalCondition(condition: string | number | boolean | undefined, conditionData: any, options: any = { errorReturn: false, async: false }): any | Promise<any> {
  if (typeof condition === "number" || typeof condition === "boolean") return condition;
  if (condition === undefined || condition === "" || typeof condition !== "string") return options.errorReturn ?? false;
  let returnValue;
  try {
    if (condition.includes("@")) {
      condition = Roll.replaceFormulaData(condition, conditionData, { missing: "0" });
    }

    if (options.async) returnValue = asyncMySafeEval(condition, conditionData, options.errorReturn);
    else returnValue = mySafeEval(condition, conditionData, options.errorReturn ?? false);
    if (debugEnabled > 0) warn("evalCondition ", returnValue, condition, conditionData);

  } catch (err) {
    returnValue = options.errorReturn ?? false;
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
  if (!active) {
    const id = "reaction";
    await actor.effects.get(getStaticID(id))?.delete();
  } else {
    if (!["all", "displayOnly"].includes(configSettings.enforceReactions) && configSettings.enforceReactions !== actor.type) return;
    // await actor.update({"flags.midi-qol.actions.reaction": true, "flags.midi-qol.actions.reactionCombatRound": game.combat?.round});  
    const id = "reaction";
    await actor.effects.get(getStaticID(id))?.delete();
    const effect = foundry.utils.deepClone(getReactionEffect());
    if (!effect) return;
    effect.updateSource({
      origin: actor.uuid,
      changes: [
        { key: 'flags.midi-qol.actions.reaction', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "true" },
        { key: 'flags.midi-qol.actions.reactionCombatRound', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(game.combat?.round ?? false) }
      ]
    });
    // effect.origin = actor.uuid;
    await ActiveEffect.implementation.create(effect.toObject(), { parent: actor, keepId: true });
  }
}

export async function setBonusActionUsed(actor: Actor.Implementation) {
  if (debugEnabled > 0) warn("setBonusActionUsed | starting");
  if (!["all", "displayOnly"].includes(configSettings.enforceBonusActions) && configSettings.enforceBonusActions !== actor.type) return;
  // await actor.update({ "flags.midi-qol.actions.bonus": true, "flags.midi-qol.actions.bonusActionCombatRound": game.combat?.round });
  const id = "bonusaction";
  await actor.effects.get(getStaticID(id))?.delete();
  const effect = foundry.utils.deepClone(getBonusActionEffect());
  if (!effect) return;
  effect.updateSource({
    origin: actor.uuid,
    changes: [
      { key: 'flags.midi-qol.actions.bonus', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "true" },
      { key: 'flags.midi-qol.actions.bonusActionCombatRound', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(game.combat?.round ?? false) }
    ]
  });
  effect.origin = actor.uuid;
  await ActiveEffect.implementation.create(effect as any, { parent: actor, keepId: true });
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
  if (actor.flags?.[MODULE_ID]?.actions?.reaction) await actor.update({ flags: { [MODULE_ID]: { actions: { reaction: false, "-=reactionCombatRound": null } } } });
}

export function hasUsedAction(actor: Actor.Implementation) {
  return actor?.getFlag(MODULE_ID, "actions")?.action;
}

export function hasUsedReaction(actor: Actor.Implementation) {
  return !!actor.getFlag(MODULE_ID, "actions")?.reaction;
}

export async function expirePerTurnBonusActions(
  combat: Combat.Implementation,
  data: { round: number; turn: number | null },
  options: { advanceTime: number; direction: number }
) {
  const optionalFlagRe = /flags.midi-qol.optional.[^.]+.(count|countAlt)$/;
  for (let combatant of combat.turns) {
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
  return actor.getFlag(MODULE_ID, "actions")?.bonus;
}

export async function removeBonusActionUsed(actor: Actor, force = false) {
  if (force || !installedModules.get("times-up")) { // bonus action will be expired by times-up if installed
    await actor.effects.get(getStaticID("bonusaction"))?.delete()
  }
  // Safety net flag reset just in case
  // @ts-expect-error
  if (force) await actor.update({ flags: { [MODULE_ID]: { actions: { bonus: false, "-=bonusActionCombatRound": null } } } });
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

export function addAdvAttribution(roll: Roll, advAttribution: Set<string>) {
  // <section class="tooltip-part">
  let advHtml: string = "";
  if (advAttribution && advAttribution.size > 0) {
    advHtml = Array.from(advAttribution).reduce((prev, s) => prev += `${s}<br>`, "");
    foundry.utils.setProperty(roll, "options.advTooltip", advHtml);
  }
}

function getTooltip(roll: Roll, options: any = {}) {
  const parts = roll.dice?.map(d => d.getTooltipData()) ?? [];
  // parts.tooltipFormula = options?.tooltipFormula ?? false;
  // parts.formula = roll.formula;
  const templateData = {
    // @ts-expect-error
    advTooltip: roll.options?.advTooltip,
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

export async function midiRenderTemplateRoll(roll: Roll | undefined, template: string, options?: any) {
  if (!roll) return "";
  const chatData = {
    formula: roll.formula,
    user: game.user?.id,
    tooltip: await getTooltip(roll, options),
    tooltipFormula: options?.tooltipFormula ?? false,
    // @ts-expect-error no dnd5e-types
    flavor: options?.flavor ?? roll.options?.flavor,
    total: (roll.total !== undefined) ? Math.round((roll.total) * 100) / 100 : "???"
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
export function findPotentialFlankers(target: Token.Implementation) {
  const allies = findNearby(-1, target, (canvas.dimensions?.distance ?? 5));
  const reachAllies = findNearby(-1, target, 2 * (canvas.dimensions?.distance ?? 5)).filter(
    ally => !(allies.some(tk => tk === ally)) &&
      //@ts-expect-error no dnd5e-types
      ally.actor?.items.contents.some(item => item.system?.properties?.has("rch") && item.system.equipped)
  );
  return allies.concat(reachAllies);
}

// TODO: Can definitely probably clean this up some
export async function computeFlankedStatus(target: Token.Implementation): Promise<boolean> {
  if (!checkRule("checkFlanking") || !["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(checkRule("checkFlanking") as string)) return false;
  if (!canvas || !target) return false;
  const allies = findPotentialFlankers(target);
  if (allies.length <= 1) return false; // length 1 means no other allies nearby
  const gridW = canvas.grid?.sizeX ?? 100;
  const gridH = canvas.grid?.sizeY ?? 100;
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
    if (!heightIntersects(target.document, token.document)) continue;
    if (checkRule("checkFlanking") === "ceflankedNoconga" && installedModules.get("dfreds-convenient-effects")) {
      const CEFlanked = getFlankedEffect();
      const hasFlanked = token.actor && CEFlanked && CEHasEffectApplied({ effectName: CEFlanked.name, uuid: token.actor.uuid });
      if (hasFlanked) continue;
    } else if (checkRule("checkFlanking") === "midiFlankedNoConga") {
      const hasFlanked = token.actor && hasCondition(token.actor, "flanked");
      if (hasFlanked) continue;
    }
    // Loop through each square covered by attacker and ally
    let maxDist = (canvas.dimensions?.distance ?? 5);
    const tokenStartX = -Math.max(0, token.document.width / 2 - 0.5);
    const tokenStartY = -Math.max(0, token.document.height / 2 - 0.5);
    const tokenPoints: any[] = [];
    for (let x = tokenStartX; x < token.document.width / 2; x++) {
      for (let y = tokenStartY; y < token.document.height / 2; y++) {
        let tx = token.center.x + x * gridW;
        let ty = token.center.y + y * gridH;
        if ((distancePointToken({ x: tx, y: ty, elevation: token.document.elevation }, target) ?? +Infinity) > maxDist) {
          // console.error("Too far away", tx, ty, ax, ay, token.center, ally.center, target.center);
          continue;
        }
        tokenPoints.push({ x: tx, y: ty });
      }
    }
    // @ts-expect-error not in types yet
    if (game.settings.get("core", "gridDiagonals") === 1) maxDist *= Math.sqrt(2);
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
      const allyStartX = -Math.max(0, ally.document.width / 2 - 0.5);
      const allyStartY = -Math.max(0, ally.document.height / 2 - 0.5);
      const allyPoints: any[] = [];
      for (let x1 = allyStartX; x1 < ally.document.width / 2; x1++) {
        for (let y1 = allyStartY; y1 < ally.document.height / 2; y1++) {
          let ax = ally.center.x + x1 * gridW;
          let ay = ally.center.y + y1 * gridH;
          if ((distancePointToken({ x: ax, y: ay, elevation: ally.document.elevation }, target) ?? +Infinity) > maxDist) {
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
  }
  return false;
}

// TODO Can definitely probably clean this up
export function computeFlankingStatus(token: Token.Implementation, target: Token.Implementation): boolean {
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
  if (computeDistance(token, target, { wallsBlock: true }) > range * (canvas.dimensions?.distance ?? 5)) return false;
  // an enemy's enemies are my friends.
  const allies = findPotentialFlankers(target)

  if (!token.document.disposition) return false; // Neutral tokens can't get flanking
  if (allies.length <= 1) return false; // length 1 means no other allies nearby
  const gridW = canvas.grid?.sizeX ?? 100;
  const gridH = canvas.grid?.sizeY ?? 100;
  let maxDist = (canvas.dimensions?.distance ?? 5);
  //@ts-expect-error
  if (game.settings.get("core", "gridDiagonals") === 1) maxDist *= Math.sqrt(2);
  const tl = { x: target.x, y: target.y };
  const tr = { x: target.x + target.document.width * gridW, y: target.y };
  const bl = { x: target.x, y: target.y + target.document.height * gridH };
  const br = { x: target.x + target.document.width * gridW, y: target.y + target.document.height * gridH };
  const top: [x0: number, y0: number, x1: number, y1: number] = [tl.x, tl.y, tr.x, tr.y];
  const bottom: [x0: number, y0: number, x1: number, y1: number] = [bl.x, bl.y, br.x, br.y];
  const left: [x0: number, y0: number, x1: number, y1: number] = [tl.x, tl.y, bl.x, bl.y];
  const right: [x0: number, y0: number, x1: number, y1: number] = [tr.x, tr.y, br.x, br.y];

  // Loop through each square covered by attacker and ally
  const tokenStartX = -Math.max(0, token.document.width / 2 - 0.5);
  const tokenStartY = -Math.max(0, token.document.height / 2 - 0.5);
  const tokenPoints: any[] = [];
  for (let x = tokenStartX; x < token.document.width / 2; x++) {
    for (let y = tokenStartY; y < token.document.height / 2; y++) {
      let tx = token.center.x + x * gridW;
      let ty = token.center.y + y * gridH;
      if ((distancePointToken({ x: tx, y: ty, elevation: token.document.elevation }, target) ?? +Infinity) > maxDist) {
        // console.error("Too far away", tx, ty, ax, ay, token.center, ally.center, target.center);
        continue;
      }
      tokenPoints.push({ x: tx, y: ty });
    }
  }
  for (let ally of allies) {
    if (ally.document.uuid === token.document.uuid) continue;
    if (!heightIntersects(ally.document, target.document)) continue;
    const actor: any = ally.actor;
    if (checkIncapacitated(ally.actor, debugEnabled > 0, false)) continue;
    if (hasCondition(actor, "incapacitated")) continue;
    const allyStartX = -Math.max(0, ally.document.width / 2 - 0.5);
    const allyStartY = -Math.max(0, ally.document.height / 2 - 0.5);

    const allyPoints: any[] = [];
    for (let x1 = allyStartX; x1 < ally.document.width / 2; x1++) {
      for (let y1 = allyStartY; y1 < ally.document.height / 2; y1++) {
        let ax = ally.center.x + x1 * gridW;
        let ay = ally.center.y + y1 * gridH;
        if ((distancePointToken({ x: ax, y: ay, elevation: ally.document.elevation }, target) ?? +Infinity) > maxDist) {
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
  // checkFlankingStatus requires a flanking token (token) and a target
  // checkFlankedStatus requires only a target token
  if (!canvas) return false;
  let needsFlanking = false;
  if (!target || !target?.actor) return false;
  if (!checkRule("checkFlanking") || checkRule("checkFlanking") === "off") return false;
  if (["ceonly"].includes(checkRule("checkFlanking") as string)) {
    if (!token || token === target) return false;
    needsFlanking = computeFlankingStatus(token, target);
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
  } else if (checkRule("checkFlanking") === "midiFlanking") {
    if (!token || token === target) return false;
    needsFlanking = computeFlankingStatus(token, target);
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
  } else if (checkRule("checkFlanking") === "advonly") {
    if (!token) return false;
    needsFlanking = computeFlankingStatus(token, target);
  } else if (["ceflanked", "ceflankedNoconga"].includes(checkRule("checkFlanking") as string)) {
    if (!target.actor) return false;
    if (installedModules.get("dfreds-convenient-effects")) {
      let CEFlanked = getFlankedEffect();
      if (!CEFlanked) return false;
      const needsFlanked = await computeFlankedStatus(target);
      const hasFlanked = CEHasEffectApplied({ effectName: CEFlanked.name ?? "Flanked", uuid: target.actor.uuid });
      if (needsFlanked && !hasFlanked && target.actor) {
        await CEAddEffectWith({ effectName: CEFlanked.name ?? "Flanked", uuid: target.actor.uuid, overlay: false });
      } else if (!needsFlanked && hasFlanked && token?.actor) {
        await CERemoveEffect({ effectName: CEFlanked.name ?? "Flanked", uuid: target.actor.uuid });
      }
      return false;
    }
  } else if (["midiFlanked", "midiFlankedNoConga"].includes(checkRule("checkFlanking") as string)) {
    if (!target.actor) return false;
    const MidiFlanked = CONFIG.statusEffects.find(se => se.id === "flanked");
    if (!MidiFlanked) return false;
    const cprEffect: ActiveEffect | undefined = getCPREffect(MidiFlanked?._id as string)
    const needsFlanked = await computeFlankedStatus(target);
    if (!cprEffect) {
      if (!target.actor.isOwner) await unTimedExecuteAsGM("toggleStatusEffect", { actorUuid: target.actor.uuid, statusId: MidiFlanked.id, options: { active: needsFlanked } });
      else await target.actor.toggleStatusEffect(MidiFlanked.id, { active: needsFlanked });
    } else {
      if (needsFlanked) {
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
  return needsFlanking;
}

export async function chackFlanking(user: User.Implementation, target: Token.Implementation, targeted: boolean): Promise<boolean> {
  if (user.id !== game.user?.id) return false;
  let token = canvas.tokens?.controlled[0];
  if (user.targets.size === 1) return markFlanking(token, target);
  return false

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
export function canSense(tokenEntity: TokenOrDocument | string, targetEntity: TokenOrDocument | string, validModes: Array<string> = ["all"]): boolean {
  return canSenseModes(tokenEntity, targetEntity, validModes).length > 0;
}
export function canSenseModes(tokenEntity: TokenOrDocument | string, targetEntity: TokenOrDocument | string, validModes: Array<string> = ["all"]): Array<string> {
  const token = getToken(tokenEntity);
  const target = getToken(targetEntity);
  if (!token || !target) return [];
  return _canSenseModes(token, target, validModes);
}
export function initializeVision(tk: Token.Implementation, force = false) {
  tk.document.sight.enabled = true;
  // @ts-expect-error protected
  tk.document._prepareDetectionModes();
  const sourceId = tk.sourceId;
  tk.vision = new CONFIG.Canvas.visionSourceClass({ sourceId, object: tk });

  tk.vision.initialize({
    x: tk.center.x,
    y: tk.center.y,
    elevation: tk.document.elevation,
    radius: Math.clamp(tk.sightRange, 0, canvas.dimensions?.maxR ?? 0),
    externalRadius: tk.externalRadius, // Math.max(tk.mesh.width, tk.mesh.height) / 2,
    angle: tk.document.sight.angle,
    contrast: tk.document.sight.contrast,
    saturation: tk.document.sight.saturation,
    brightness: tk.document.sight.brightness,
    attenuation: tk.document.sight.attenuation,
    rotation: tk.document.rotation,
    visionMode: tk.document.sight.visionMode as foundry.canvas.perception.VisionMode.ConfiguredModes,
    preview: !!tk._original,
    color: tk.document.sight.color?.toNearest(),
    blinded: tk.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND)
  });
  if (!tk.vision.los) {
    // @ts-expect-error protected
    tk.vision.shape = tk.vision._createRestrictedPolygon();
    tk.vision.los = tk.vision.shape;
  }
  if (tk.vision.visionMode) tk.vision.visionMode.animated = false;
  // @ts-expect-error TODO find out why this is an error
  canvas.effects?.visionSources.set(sourceId, tk.vision);
  // tk.document.sight.enabled = sightEnabled;
  return true;
}
export function _canSenseModes(token: Token.Implementation, target: Token.Implementation, validModesParam: Array<string> = ["all"]): Array<string> {
  const detectionModes = CONFIG.Canvas.detectionModes;
  const DetectionModeCONST = foundry.canvas.perception.DetectionMode;
  if (!token || !target) return ["noToken"];
  if (target.document.hidden || token.document.hidden) return [];
  if (!token.hasSight && !configSettings.optionalRules.invisVision) return ["senseAll"];
  if ((!token.vision || !token.vision.los) && !initializeVision(token)) return ["noSight"];
  const matchedModes: Set<string> = new Set();
  // Determine the array of offset points to test
  const t = Math.min(target.w, target.h) / 4;
  const targetPoint = target.center;
  const offsets = t > 0 ? [[0, 0], [-t, -t], [-t, t], [t, t], [t, -t], [-t, 0], [t, 0], [0, -t], [0, t]] : [[0, 0]];
  const tests = offsets.map(o => ({
    point: new PIXI.Point(targetPoint.x + o[0], targetPoint.y + o[1]),
    elevation: target?.document.elevation ?? 0,
    los: new Map()
  }));
  const config = { tests, object: target };
  const tokenDetectionModes = token.detectionModes;
  const modes = CONFIG.Canvas.detectionModes;
  let validModes = new Set(validModesParam);

  const lightSources = canvas.effects?.lightSources;
  for (const lightSource of (lightSources ?? [])) {
    if (/*!lightSource.data.vision ||*/ !lightSource.active || lightSource.data.disabled) continue;
    if (!validModes.has(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID) && !validModes.has("all")) continue;
    const result = lightSource.testVisibility && lightSource.testVisibility(config);
    if (result === true) matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
  }

  const lightPerception = tokenDetectionModes.find(m => m.id === modes.lightPerception?.id);
  if (lightPerception && ["lightPerception", "all"].some(mode => validModes.has(mode))) {
    // const result = modes.lightPerception.testVisibility(token.vision, basic, config);
    // @ts-expect-error DetectionMode somehow different from TokenDetectionMode?
    const result = (lightPerception && token.vision) ? modes.lightPerception.testVisibility(token.vision, lightPerception, config) : false;
    if (result === true)
      matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
  }

  const basic = tokenDetectionModes.find(m => m.id === DetectionModeCONST.BASIC_MODE_ID);
  if (basic && ["basicSight", "all"].some(mode => validModes.has(mode))) {
    // @ts-expect-error DetectionMode somehow different from TokenDetectionMode?
    const result = token.vision ? modes.basicSight.testVisibility(token.vision, basic, config) : false;
    if (result === true)
      matchedModes.add(detectionModes.basicSight?.id ?? DetectionModeCONST.BASIC_MODE_ID);
  }
  for (const detectionMode of tokenDetectionModes) {
    if (detectionMode.id === DetectionModeCONST.BASIC_MODE_ID) continue;
    if (!detectionMode.enabled) continue;
    const dm = modes[detectionMode.id as string];
    if (validModes.has("all") || validModes.has(detectionMode.id as string)) {
      // @ts-expect-error DetectionMode somehow different from TokenDetectionMode?
      const result = token.vision ? dm?.testVisibility(token.vision, detectionMode, config) : false;
      if (result === true) {
        matchedModes.add(detectionMode.id as string);
      }
    }
  }
  for (let tk of [token, target]) {
    if (!tk.document.sight.enabled) {
      const sourceId = tk.sourceId;
      canvas.effects?.visionSources.delete(sourceId);
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
  const concentratingItemUuids = actor.effects
    .filter(effect => effect.statuses.has("concentrating"))
    .map(effect => effect?.flags?.dnd5e?.itemUuid);
  let concentratingItemName: string[] = [];

  for (const itemUuid of concentratingItemUuids) {
    typeof (itemUuid) === "string" ? concentratingItemName.push((fromUuidSync(itemUuid) as Activity | undefined)?.item?.name ?? "") : concentratingItemName.push("No item");
  };

  const itemDisplayName = `${concentrationCheckItemDisplayName}: ${concentratingItemName.join(", ")}`;
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


export async function displayDSNForRoll(rolls?: Roll | Roll[], rollType?: string, defaultRollMode?: string) {
  if (!rolls) return;
  if (!(rolls instanceof Array)) rolls = [rolls];
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
      const hideRollOption = configSettings.hideRollDetails;
      let ghostRoll = false;
      let whisperUsers: User.Implementation[] | null = null;
      const rollMode = defaultRollMode || game.settings.get("core", "rollMode");
      let hideRoll = (["all"].includes(hideRollOption) && game.user?.isGM) ? true : false;
      if (!game.user?.isGM) hideRoll = false;
      else if (hideRollOption !== "none") {
        if (configSettings.gmHide3dDice && game.user?.isGM) hideRoll = true;
        if (game.user?.isGM && !hideRoll) {
          switch (rollType) {
            case "attackRollD20":
              if (["d20Only", "d20AttackOnly", "detailsDSN"].includes(hideRollOption)) {
                for (let i = 1; i < roll.dice.length; i++) { // hide everything except the d20
                  roll.dice[i].results.forEach(r => foundry.utils.setProperty(r, "hidden", true));
                }
                hideRoll = false;
              } else if ((["hitDamage", "all", "hitCriticalDamage", "details"].includes(hideRollOption) && game.user?.isGM))
                hideRoll = true;
              break;
            case "attackRoll":
              hideRoll = hideRollOption !== "detailsDSN";
              break;
            case "damageRoll":
              hideRoll = hideRollOption !== "detailsDSN";
              break;
            default:
              hideRoll = false;
              break;
          }
        }
      }
      if (hideRoll && configSettings.ghostRolls && game.user?.isGM && !configSettings.gmHide3dDice) {
        ghostRoll = true;
        hideRoll = false;
      } else {
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
  const sourceFlavor = contestedRollFlavor(flavor, source.rollType, source.ability)
  const sourceOptions = foundry.utils.mergeObject(foundry.utils.duplicate(source.rollOptions ?? rollOptions ?? {}), {
    mapKeys: false,
    flavor: sourceFlavor,
    title: `${sourceFlavor}: ${sourceToken?.name} vs ${targetToken?.name}`
  });
  const targetFlavor = contestedRollFlavor(flavor, target.rollType, target.ability);
  const targetOptions = foundry.utils.mergeObject(foundry.utils.duplicate(target.rollOptions ?? rollOptions ?? {}), {
    mapKeys: false,
    flavor: targetFlavor,
    title: `${targetFlavor}: ${targetToken?.name} vs ${sourceToken?.name}`
  });
  const sourceConfig = { request: source.rollType.trim(), targetUuid: sourceDocument?.uuid, options: sourceOptions, [source.rollType === "skill" ? "skill" : "ability"]: source.ability.trim() };
  const targetConfig = { request: target.rollType.trim(), targetUuid: targetDocument?.uuid, options: targetOptions, [target.rollType === "skill" ? "skill" : "ability"]: target.ability.trim() };
  const resultPromises = [
    socketlibSocket.executeAsUser("rollAbility", player1.id, sourceConfig),
    socketlibSocket.executeAsUser("rollAbility", player2.id, targetConfig),
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
    itemCard.update({ content });
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

export function midiMeasureDistances(segments: { ray: Ray }[], options: any = {}) {
  let isGridless = canvas.grid?.constructor.name === "GridlessGrid";
  if (!isGridless || !options.gridSpaces || !configSettings.griddedGridless || !canvas.grid) {
    return segments.map(s => canvas.grid?.measurePath([s.ray.A, s.ray.B], {})).map(d => d?.distance ?? 0);;
  }
  if (!canvas.grid) return [0];
  const diagonals = safeGetGameSetting("core", "gridDiagonals");
  const canvasGridProxy = new Proxy(canvas.grid, {
    get: function (target, prop, receiver) {
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
    let fudgeFactor = configSettings.gridlessFudge ?? 0;
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

// TODO: Make this its own application
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
  let second1TimeoutId: NodeJS.Timeout;
  let timeRemaining: number;
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
  let returnValue = new Promise((resolve, reject) => {
    const callback = async function (this: ActiveEffect) {
      clearTimeout(timeoutId);
      const effectData = this.toObject();
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
        toggleEffect: workflow?.activity.midiProperties?.toggleEffect, //TODO Check this
        tokenUuid: token.document.uuid,
        actorUuid: actor.uuid,
        whisper: false,
        workflowOptions: workflow?.workflowOptions,
        context: {
        }
      });
      if (this.toObject()) {
        if (debugEnabled)
          warn(
            `chooseEffect | applying effect ${this.name} to ${targets.size} targets`,
            targets
          );/*
        for (let target of targets) {
          await target.actor.createEmbeddedDocuments('ActiveEffect', [
            effectData,
          ]);
        }*/
      }
      resolve(this);
    };

    const style = `
      <style>
        .dnd5e2.effectNoTarget.dialog {
          max-height: 800px;
          .window-content {
            overflow: auto;
          }
          .dialog-content {
            display: none;
          }
          .dialog-buttons {
            flex-direction: column;
            button.dialog-button {
              border: 5px;
              margin: 0;
              display: grid;			
              grid-template-columns: 40px 150px;
              grid-gap: 5px;
              span {
                overflow: hidden;
                text-overflow: ellipsis;
              }
            }
          }
        }
        .dnd5e2.effectNoTarget.dialog .window-header .window-title {
          visibility: visible;
          color: initial;
          text-align: center;
          font-weight: bold;
        }
      </style>`;
    function render([html]) {
      html.parentElement.querySelectorAll('.dialog-button').forEach((n) => {
        const img = document.createElement('img');
        const eff = fromUuidSync(n.dataset.button) as ActiveEffect;
        img.src = eff.img as string;
        const effNameSpan = document.createElement('span');
        effNameSpan.textContent = eff.name;
        n.innerHTML = '';
        n.appendChild(img);
        n.appendChild(effNameSpan);
        n.dataset.tooltip = eff.name;
      });
    }
    let buttons = {};
    for (let effect of effects) {
      buttons[effect.uuid] = {
        label: effect.name,
        callback: callback.bind(effect),
      };
    }
    let timeout = options?.timeout ?? configSettings.reactionTimeout ?? defaultTimeout;
    timeRemaining = timeout;
    //@ts-expect-error game.system.applications
    const Mixin = game.system?.applications.DialogMixin(foundry.appv1.api.Dialog);
    const dialogOptions = {
      classes: ['dnd5e2', 'effectNoTarget', 'dialog'],
      width: 220,
      height: 'auto',
    };
    const data = {
      title: `${i18n('CONTROLS.CommonSelect')} ${i18n(
        'DOCUMENT.ActiveEffect'
      )}: ${timeRemaining}s`,
      content: `<center><b>${i18n('EFFECT.StatusTarget')}: [</b>${[
        ...targets,
      ].map((t) => t.name)}<b>]</b></center> ${style}`,
      buttons,
      render,
    };

    let dialog = new Mixin(data, dialogOptions);
    dialog.render(true);
    const set1SecondTimeout = function () {
      second1TimeoutId = setTimeout(() => {
        if (!timeoutId) return;
        timeRemaining -= 1;
        dialog.data.title = `${i18n('CONTROLS.CommonSelect')} ${i18n(
          'DOCUMENT.ActiveEffect'
        )}: ${timeRemaining}s`;
        const title = dialog.element[0]?.querySelector(".window-title");
        if (title) title.textContent = dialog.data.title;
        if (timeRemaining > 0) set1SecondTimeout();
      }, 1000);
    };
    let timeoutId = setTimeout(() => {
      if (debugEnabled > 0) warn(`chooseEffect | timeout fired closing dialog`);
      clearTimeout(second1TimeoutId);
      dialog.close();
      reject('timeout');
    }, timeout * 1000);
    set1SecondTimeout();
  });
  return await returnValue;
}

export function canSee(tokenEntity: TokenOrDocument, targetEntity: TokenOrDocument) {
  const NON_SIGHT_CONSIDERED_SIGHT = ["blindsight"];
  const detectionModes = CONFIG.Canvas.detectionModes;
  const sightDetectionModes = Object.keys(detectionModes).filter(
    (d) =>
      detectionModes[d].type === foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT ||
      NON_SIGHT_CONSIDERED_SIGHT.includes(d)
  );
  return canSense(tokenEntity, targetEntity, sightDetectionModes);
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

export const updatesCache = {};
export async function _updateAction(document: foundry.abstract.Document.Any) {
  if (!updatesCache[document.uuid]) return;
  const updates = updatesCache[document.uuid];
  clearUpdatesCache(document.uuid);
  if (debugEnabled > 0) warn("update action | Doing updateAction", updates);
  const baseDocument = fromUuidSync(document.uuid);
  // console.warn(updates, foundry.utils.diffObject(baseDocument, updates));
  // @ts-expect-error not specific enough
  return await baseDocument?.update(updates);
}

// NOTE: Typed as a ChatMessage since that's all we use it for
export async function debouncedUpdate(document: ChatMessage.Implementation, updates: ChatMessage.UpdateData, immediate = false) {
  updates = foundry.utils.expandObject(updates) as typeof updates;
  if (!document) return; // ChatCard was removed already?;
  if (!DebounceInterval) {
    if (debugEnabled > 0) console.warn("debouncedUpdate | performing update", immediate);
    if (updatesCache[document.uuid]) {
      updates = foundry.utils.mergeObject(updatesCache[document.uuid], updates, { insertKeys: true, insertValues: true });
      clearUpdatesCache(document.uuid);
    }
    // console.warn(updates, foundry.utils.diffObject(document, updates));
    const result = await document.update(updates);
    return result;
  }
  if (debugEnabled > 0) {
    if (updatesCache[document.uuid]) {
      warn("debouncedUpdate | Cache not empty");
    } else warn("debouncedUpdate | cache empty");
  }
  updatesCache[document.uuid] = foundry.utils.mergeObject((updatesCache[document.uuid] ?? {}), updates, { overwrite: true })
  if (immediate) {
    const result = await _updateAction(document);
    return result;
  }
  return await _debouncedUpdateAction(document);
}
export function getUpdatesCache(uuid: string | undefined | null) {
  if (!uuid) return {};
  if (!updatesCache[uuid]) return {};
  return updatesCache[uuid];
}

export function addUpdatesCacheFlags(uuid: string | undefined | null, updates: any, prependMidi = false) {
  if (!uuid) return;
  updates = foundry.utils.expandObject(updates);
  if (prependMidi) updates = { [MODULE_ID]: updates };
  updatesCache[uuid] = foundry.utils.mergeObject(updatesCache[uuid] ?? {}, { flags: updates }, { insertKeys: true, insertValue: true });
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
  let document = fromUuidSync(uuid);
  let updates = document?.uuid && updatesCache[document.uuid as string];
  if (updates) {
    // This doesn't feel quite right - Documents are _NOT_ meant to be `deepCloned` - nor can you `mergeObject` into them.
    // Their data, sure, but as-is this is weird
    document = foundry.utils.deepClone(document);
    // @ts-expect-error because this is erroneous
    document = foundry.utils.mergeObject(document, updates, { insertKeys: true, insertValues: true });
    // Object.keys(updates).forEach(key => { foundry.utils.setProperty(document, key, updates[key]) });
  }
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
  if (actorEffectsToDelete.length > 0) await actor.deleteEmbeddedDocuments("ActiveEffect", actorEffectsToDelete, options);
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

export function blankOrUndefinedDamageType(s: string | undefined): string {
  if (!s) return "none";
  if (s === "") return "none";
  return s;
}

export function processConcentrationRequestMessage(message: ChatMessage.Implementation, html: HTMLElement, data) {
  if (configSettings.doConcentrationCheck !== "chat") return;
  let elt = html.querySelectorAll<HTMLElement>("[data-action=concentration]");
  const hasRolled = foundry.utils.getProperty(message, `flags.${MODULE_ID}.concentrationRolled`);
  if (hasRolled || !preferredActiveGM()?.isSelf) return;
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
        const user = playerForActor(actor);
        if (user?.active) {
          // const whisper = game.users?.filter(user => actor.testUserPermission(user, "OWNER")).map(u => (u as User).id);
          socketlibSocket.executeAsUser("rollConcentration", user.id, { actorUuid: actor.uuid, target: dc, create: true, rollMode: "gmroll" });
        // @ts-expect-error no dnd5e-types
        } else actor.rollConcentration({ legacy: false, target: dc }, {}, { create: true, rollMode: "gmroll" });
        message.setFlag(MODULE_ID, "concentrationRolled", true);
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

export function addDependent(document: foundry.abstract.Document.Any, dependent: foundry.abstract.Document.Any) {
  //@ts-expect-error
  if (!document.addDependent) {
    error(`midi-addDependent | document ${document.uuid} does not have addDependent defined`);
    return;
  }
  //@ts-expect-error
  if (game.user?.isGM || document.isOwner) {
    //@ts-expect-error
    document.addDependent(dependent);
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
    // @ts-expect-error no dnd5e-types
    return concentrationEffect.addDependent(dependent);
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
  if (!defaultDamageType) defaultDamageType = MQdefaultDamageType;
  return defaultDamageType;
}

export function getDefaultDamageType(item: Item.Implementation): string {
  // @ts-expect-error no dnd5e-types
  const activity = item.system.activities.get("dnd5eactivity000");
  return activity?.damage?.parts[0]?.types.first() ?? MQdefaultDamageType;
}

export function activityHasAreaTarget(activity?: Activity): boolean {
  return (activity?.target?.template.type ?? "") in GameSystemConfig.areaTargetTypes
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

export function areMidiKeysPressed(event: AugmentedEvent, action: string) {
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
  return ClientKeyBindings?.get("midi-qol", action).some(b => {
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
  // ignoreToken set to null if special target include "self" - otherwise set to token
  // TODO (Michael): HERE! RIGHT HERE!
  let ignoreToken = (targetDetails.affects.special ?? "").split(";").some(spec => spec === "self") ? null : tokenToUse;
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
        if (ignoreToken === target) {
          inRange = false;
        }
        const distance = computeDistance(target, tokenToUse, { wallsBlock });
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
  let cprItem = game.items?.find(i => ((i.flags["chris-premades"]))?.effectInterface);
  return cprItem?.effects.get(id) as ActiveEffect;
}

export function updateUserTargets(targetIds: string[]) {
  // @ts-expect-error not in v13 yet
  canvas.tokens?.setTargets(targetIds);
  // if (!game.user) return;
  // if (game.release.generation > 12) { // TODO make sure this really works NOTE from Michael: Should work now
  //   game.user.broadcastActivity({ targets: targetIds });
  //   // @ts-expect-error types isn't v13 yet but this is how core does it
  //   game.user._onUpdateTokenTargets(targetIds);
  // } else {
  //   //@ts-expect-error types does not have this yet
  //   game.user.updateTokenTargets(targetIds);
  // }
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
function getItemFromEffectOrigin(origin: string, alreadyVisited: string[] = []): Item.Implementation | undefined {
  let originItem: Item.Implementation | undefined;
  if (alreadyVisited.includes(origin)) return;
  const originEffectOrItem = fromUuidSync(origin) as ActiveEffect.Implementation | Item.Implementation | undefined;
  if (originEffectOrItem instanceof Item) return originEffectOrItem;
  if (originEffectOrItem?.origin) {
    if (originEffectOrItem.parent instanceof Item) {
      originItem = originEffectOrItem.parent;
    } else originItem = getItemFromEffectOrigin(originEffectOrItem.origin, [...alreadyVisited, origin]);
    // recursive so @michael can feel fancy
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