import { askBonusDecision } from "./lib/bonusDecisions.js";
import { budget, reset as resetBudget, spend as spendBudget } from "./services/economy/ledger.js";
import { onTurnMoment } from "./lib/turnMoments.js";
import { shownTokenName } from "./services/tokenNames/service.js";
import { tagsView } from "./lib/tags.js";
import { checkRange, type RangeCheckResult } from "./services/range/service.js";
import { queryUser } from "./lib/midiQueries.js";
import { computeDistance } from "./services/distance/provider.js";
import { getDistance } from "./services/distance/service.js";
import { computeFlankedStatus, computeFlankingStatus } from "./services/flanking/service.js";
import { getHexCentroid } from "./services/flanking/provider.js";
import { bonusPromptService } from "./services/rollBonuses/prompt.js";
import { applyOfferedBonus, collectBonusCandidates, type BonusCost, type BonusPhase, type OfferedBonus, type RollBonusQuery } from "./services/rollBonuses/service.js";
import { addCosts as addBonusCosts, canAfford as canAffordBonus } from "./services/rollBonuses/rules.js";
import { crossesOppositeSides, opposedByAngle } from "./services/flanking/rules.js";
import { DialogCountdown } from "./lib/dialogCountdown.js";
import { coverBetween, coverFor } from "./services/cover/service.js";
import { sensesModes } from "./services/perception/service.js";
import { applyDamageRules, collectDamageRules, copyDamageOptions } from "./lib/damageRules.js";
import type { AttackModifier } from "./Workflow.js";
import { TokenDocumentSet, hookTarget, memberCount, rememberSyntheticToken, tokenOf } from "./lib/tokenDocumentSet.js";
import { rollBonusLabel } from "./rolls/attack.js";
import { debug, i18n, error, warn, busyWait, allAttackTypes, debugEnabled, overTimeEffectsToDelete, getStaticID, savedOverTimeEffectsToDelete, GameSystemConfig, systemConcentrationId, MQItemMacroLabel, MODULE_ID, midiReactionEffect, midiBonusActionEffect, MQActivityMacroLabel, ceInterface, i18nFormat } from "../midi-qol.js";
import { configSettings, autoRemoveTargets, checkRule, criticalDamage, criticalDamageGM, checkMechanic, safeGetGameSetting, autoRollDamageOptions, showReactionAttackRollOptions, shouldDisplaySaveDC, DOWNGRADE_IMMUNITY_KEY, ALL_DAMAGE_KEY } from "./settings.js";
import { log } from "../midi-qol.js";
import { AttributionEntry, AttributionMap, AttributionType, AugmentedEvent, DummyWorkflow, jsonSafe, Workflow, WorkflowOptions, WorkflowRollOptions } from "./Workflow.js";
import { preferredActiveGM, prepareDamageListToJSON, socketlibSocket, timedAwaitExecuteAsGM, unTimedExecuteAsGM } from "./GMAction.js";
import { askUser, type IncomingRequest } from "./lib/requests.js";
import { collectReactions } from "./services/reactions/service.js";
import { dice3dEnabled, installedModules } from "./setupModules.js";
import { concentrationCheckItemDisplayName } from "./Hooks.js";

import { OnUseMacros } from "./apps/Item.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { MidiActivityChoiceDialog } from "./apps/MidiActivityChoiceDialog.js";
import { Activity, ActivityUseConfiguration, CalcDamageOptions, MidiChangeData, DamageDescription, DamageDetailsByCategory, DamageListEntry, PreComputedAdvantageData, PreSetupDamageListEntry, RollDialogConfig, RollMessageConfig, TokenOrDocument, DND5ETargetDescriptor, SaveDetails, Dnd5eSystem } from "../globals.js";

import Token = foundry.canvas.placeables.Token;
import { AnyMutableObject, AnyObject } from "fvtt-types/utils";
import { contestedRoll } from "./lib/contestedRoll.js";
import { addCardNote } from "./lib/cardNotes.js";

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
  // dnd5e 6.1's damage cards read every entry's `potential`
  const damageModification = { value, active: { multiplier }, potential: {}, type, properties: new Set<string>() };
  damageItem.calculatedDamages.push(damageModification);
  if (reason) damageItem.details.push(reason);
  // hpDamage and the rest follow the detail, as midi will apply it (isDamaged/isHealed and later macros read them).
  // @ts-expect-error no dnd5e-types
  const hp = fromActorUuid(damageItem.actorUuid)?.system.attributes.hp;
  if (hp) {
    const { totalDamage, deltaHP, deltaTemp, newTempHP } = hpChangeFromDetail(damageItem.calculatedDamages, hp);
    Object.assign(damageItem, { totalDamage, hpDamage: deltaHP, tempDamage: deltaTemp, newHP: hp.value - deltaHP, newTempHP });
  }
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
    if (!r.options.type) r.options.type = defaultType;
    return r;
  })

  const aggregatedRolls = (game.system as Dnd5eSystem).dice.aggregateDamageRolls(rolls, { respectProperties: true });
  let detail = aggregatedRolls.map(roll => {
    const total = roll.total ?? 0;
    const value = roll.options.type !== "healing" ? Math.max(0, total) : total;
    return { value, damage: value, type: roll.options.type as string, formula: roll.formula as string, properties: new Set(roll.options.properties as string[] ?? []) }
  });
  return detail;
}

export function getOrCreateTokenForActor(actor?: Actor.Implementation) {
  if (!actor) return;
  if (actor.token?.object) return actor.token.object; //actor.token is a token document.
  const token = tokenForActor(actor);
  if (token) return token;
  const tokenData = { ...actor.prototypeToken.toObject(), actorId: actor.id };
  const cls = globalThis.getDocumentClass("Token");
  // TODO check this - not sure if actor is set correctly
  const tokenDocument = new cls(tokenData, { parent: canvas.scene });
  const synthetic = new CONFIG.Token.objectClass(tokenDocument);
  rememberSyntheticToken(synthetic);
  return synthetic;
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
    let magicalDamage = itemMagicAvailable(item);
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
  theTargets: Set<TokenOrDocument>,
  item: Item.Implementation | null | undefined,
  saves: Set<TokenOrDocument>,
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
  // A macro running inside the item's use: that use's card (an earlier, finished one would be a guess)
  if (item && !options.workflow) workflow = Workflow.runningFor(item);
  // What a successful save does to the damage; applySaves adds Super Saver and Semi Super Saver.
  const saveMultiplier = workflow?.activity ? getSaveMultiplierForActivity(workflow.activity) : itemSaveMultiplier(item);
  // No dnd5e damage roll to carry the attacker's rules (ignore immunity, downgrade...): collect them as one would
  const damageRules = collectDamageRules(workflow?.actor ?? item?.actor, item ?? workflow?.item);

  // Every member, matched by document: a caller's sets may hold Tokens or TokenDocuments
  const savers = new TokenDocumentSet(saves);
  const superSavers = new TokenDocumentSet(options.superSavers);
  const semiSuperSavers = new TokenDocumentSet(options.semiSuperSavers);
  for (let token of new TokenDocumentSet(theTargets).documents) {
    const actor = token.actor;
    if (!actor?.uuid) continue;
    const isHit = true;
    const saved = savers.has(token);
    const superSaver = superSavers.has(token);
    const semiSuperSaver = semiSuperSavers.has(token);
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
        sourceActorUuid: (workflow?.actor ?? item?.actor)?.uuid ?? undefined,
        // @ts-expect-error no dnd5e-types
        uncannyDodge: foundry.utils.getProperty(actor, `flags.${MODULE_ID}.uncanny-dodge`) && item?.hasAttack,
        // some options for ripper's module
        save: saved,
        targetUuid: getTokenDocument(token)?.uuid ?? "",
        fumbleSave: false,
        criticalSave: false,
        isCritical: false,
        isFumble: false
      }
    };
    applyDamageRules(calcDamageOptions as CalcDamageOptions, damageRules);
    const combinedDamage: DamageDescription[] = foundry.utils.deepClone(actor.calculateDamage(damageDetail, calcDamageOptions) || []);
    const fullDamage = setupDamageDetails({
      actorId: actor.id!,
      actorUuid: actor.uuid,
      options: calcDamageOptions as CalcDamageOptions,
      critical: false,
      calculatedDamages: combinedDamage,
      damages: damageDetail,
      isHit,
      saved,
      sceneId: canvas.scene?.id ?? "",
      semiSuperSaver,
      superSaver,
      totalDamage,
      targetUuid: getTokenDocument(token)?.uuid ?? "",
    }, actor);
    if (fullDamage) allDamages[actor.uuid] = fullDamage;
  }

  if (!options.updateOptions?.awaitDamageApplication) {
    options.updateOptions ??= {};
    options.updateOptions.awaitDamageApplication = true;
  }
  const cardIds: string[] = await timedAwaitExecuteAsGM("createReverseDamageCard", {
    autoApplyDamage: configSettings.autoApplyDamage,
    actorId: (workflow?.actor ?? item?.actor)?.id,
    actorUuid: (workflow?.actor ?? item?.actor)?.uuid,
    charName: workflow?.token?.name ?? workflow?.actor?.name ?? (item?.actor ? tokenForActor(item.actor)?.name ?? item.actor.name : undefined) ?? game.user?.name,
    damageList: prepareDamageListToJSON(Object.values(allDamages)),
    chatCardUuid: workflow?.itemCardUuid,
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
  targetDamages: { token: TokenOrDocument, damageDetail: DamageDescription[], totalDamage: number }[],
  item: Item.Implementation | null | undefined,
  options: any = {
    workflow: undefined,
    updateOptions: { awaitDamageApplication: configSettings.waitForDamageApplication },
    forceApply: false,
  }
): Promise<any[]> {
  let allDamages: Record<string, DamageListEntry> = {};
  let workflow: Workflow | undefined = options.workflow;
  // A macro running inside the item's use: that use's card (an earlier, finished one would be a guess)
  if (item && !options.workflow) workflow = Workflow.runningFor(item);
  const damageRules = collectDamageRules(workflow?.actor ?? item?.actor, item ?? workflow?.item);

  for (const entry of targetDamages) {
    const actor = entry.token.actor;
    if (!actor?.uuid) continue;
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
        sourceActorUuid: (workflow?.actor ?? item?.actor)?.uuid ?? undefined,
        uncannyDodge: false,
        save: false,
        targetUuid: getTokenDocument(entry.token)?.uuid ?? "",
        fumbleSave: false,
        criticalSave: false,
        isCritical: false,
        isFumble: false
      }
    };
    applyDamageRules(calcDamageOptions as CalcDamageOptions, damageRules);
    const combinedDamage: DamageDescription[] = foundry.utils.deepClone(actor.calculateDamage(damageDetail, calcDamageOptions) || []);
    const fullDamage = setupDamageDetails({
      actorId: actor.id!,
      actorUuid: actor.uuid,
      options: calcDamageOptions as CalcDamageOptions,
      critical: false,
      calculatedDamages: combinedDamage,
      damages: damageDetail,
      isHit: true,
      saved: false,
      sceneId: canvas.scene?.id ?? "",
      semiSuperSaver: false,
      superSaver: false,
      totalDamage: entry.totalDamage,
      targetUuid: getTokenDocument(entry.token)?.uuid ?? "",
    }, actor);
    if (fullDamage) allDamages[actor.uuid] = fullDamage;
  }

  if (!options.updateOptions?.awaitDamageApplication) {
    options.updateOptions ??= {};
    options.updateOptions.awaitDamageApplication = true;
  }
  const cardIds: string[] = await timedAwaitExecuteAsGM("createReverseDamageCard", {
    autoApplyDamage: configSettings.autoApplyDamage,
    actorId: (workflow?.actor ?? item?.actor)?.id,
    actorUuid: (workflow?.actor ?? item?.actor)?.uuid,
    charName: workflow?.token?.name ?? workflow?.actor?.name ?? (item?.actor ? tokenForActor(item.actor)?.name ?? item.actor.name : undefined) ?? game.user?.name,
    damageList: prepareDamageListToJSON(Object.values(allDamages)),
    chatCardUuid: workflow?.itemCardUuid,
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
/** Whether a damage detail heals: healing, or damage the target absorbs (Damage Absorption). Shared by the damage card's
 * figures and the damage's application so the two agree. */
export function detailHeals(d: DamageDescription): boolean {
  return d.type === "healing" || !!d.active?.absorption || !!(d.active?.type as Record<string, boolean> | undefined)?.absorption;
}

export function calculateDamageAmounts(damageDetail: DamageDescription[]): { amount: number; temp: number; healing: number; vitality: number; tempMax: number } {
  return damageDetail.reduce((acc, d) => {
    if (d.type === "temphp") acc.temp += d.value;
    else if (d.type === "vitality") acc.vitality += d.value; // Vitality damage (positive) or healing (negative)
    else if (d.type === "maximum") acc.tempMax += d.value; // Max HP reduction (positive = reduce max)
    else if (detailHeals(d)) acc.healing += d.value;
    else if (d.type !== "midi-none") acc.amount += d.value;
    return acc;
  }, { amount: 0, temp: 0, healing: 0, vitality: 0, tempMax: 0 });
}

/** What a damage detail does to these hit points, as midi applies it: the damage list's figures and the hit point update both come from here. */
export function hpChangeFromDetail(damageDetail: DamageDescription[], hp: { value: number; temp?: number | null; damage: number }) {
  let { amount, temp, healing, vitality, tempMax } = calculateDamageAmounts(damageDetail);
  const totalDamage = Math.max(0, amount);
  tempMax = Math.trunc(tempMax);
  let change = totalDamage + healing;
  change = change > 0 ? Math.floor(change) : Math.ceil(change);
  const oldTemp = hp.temp ?? 0;
  const deltaTemp = change > 0 ? Math.min(oldTemp, change) : 0;
  // A positive tempMax lowers the maximum, which can force the current value down.
  const deltaHP = Math.clamp(change - deltaTemp, -hp.damage + tempMax, hp.value - tempMax);
  const newTempHP = Math.max(oldTemp - deltaTemp, temp);
  return { totalDamage, change, temp, healing, vitality, tempMax, deltaTemp, deltaHP, newTempHP };
}

export function setupDamageDetails(actorDamage: PreSetupDamageListEntry, actor: Actor.Implementation): DamageListEntry | undefined {
  // @ts-expect-error no dnd5e-types
  const hp = actor?.system?.attributes?.hp;
  if (!hp) return;
  const { totalDamage, deltaHP, newTempHP } = hpChangeFromDetail(actorDamage.calculatedDamages, hp);
  const oldTempHP = hp.temp ?? 0;
  return withDeprecatedDamageFields({
    ...actorDamage,
    updateOptions: {},
    oldHP: hp.value,
    newHP: hp.value - deltaHP,
    oldTempHP,
    hpDamage: deltaHP,
    newTempHP,
    tempDamage: oldTempHP - newTempHP,
    totalDamage,
    details: [],
    wasHit: actorDamage.isHit,
  });
}

const DAMAGE_CATEGORIES = ["defaultDamage", "otherDamage", "bonusDamage"] as const;

/** midi's names for the record's fields before 14.7.0, and dnd5e's names for them now */
const RENAMED_DAMAGE_FIELDS = { damageDetail: "calculatedDamages", rawDamageDetail: "damages", calcDamageOptions: "options" } as const;

/**
 * Shims for the fields 14.7.0 renamed or stopped storing on a damage entry, worked out from its one record and
 * warning once. Not enumerable, so copies and the card never carry them. Remove them by deleting this function's
 * body.
 */
export function withDeprecatedDamageFields<T extends DamageListEntry>(entry: T): T {
  const warn = (field: string, use: string, until = "14.9.0") => foundry.utils.logCompatibilityWarning(
    `midi-qol | damage entry ${field} is deprecated: use ${use}`, { since: "14.7.0", until, once: true });
  const shim = (field: string, descriptor: PropertyDescriptor) => {
    if (!Object.getOwnPropertyDescriptor(entry, field)) Object.defineProperty(entry, field, { configurable: true, enumerable: false, ...descriptor });
  };
  for (const [field, renamed] of Object.entries(RENAMED_DAMAGE_FIELDS) as [keyof typeof RENAMED_DAMAGE_FIELDS, typeof RENAMED_DAMAGE_FIELDS[keyof typeof RENAMED_DAMAGE_FIELDS]][]) shim(field, {
    get(this: DamageListEntry) { warn(field, renamed); return this[renamed]; },
    set(this: DamageListEntry, value: never) { warn(field, renamed); this[renamed] = value; }
  });
  shim("damageDetails", {
    get(this: DamageListEntry): DamageDetailsByCategory {
      warn("damageDetails", "calculatedDamages / damages (each entry's midiCategory)", "14.8.0");
      const details: DamageDetailsByCategory = {
        calcDamageOptions: { combinedDamage: this.options },
        combinedDamage: this.calculatedDamages,
        rawcombinedDamage: this.damages,
        injectedDamage: this.calculatedDamages.filter(d => !d.midiCategory)
      };
      for (const category of DAMAGE_CATEGORIES) {
        details[category] = this.calculatedDamages.filter(d => d.midiCategory === category);
        details[`raw${category}` as const] = this.damages.filter(d => d.midiCategory === category);
        details.calcDamageOptions[category] = this.options;
      }
      return details;
    }
  });
  shim("healingAdjustedTotalDamage", {
    get(this: DamageListEntry): number {
      warn("healingAdjustedTotalDamage", "hpDamage + tempDamage (what the creature lost; this is the damage before that limit)", "14.8.0");
      // As before 14.7.0: damage plus healing, not limited to the hit points the creature had
      const { amount, healing } = calculateDamageAmounts(this.calculatedDamages);
      const change = Math.max(0, amount) + healing;
      return change > 0 ? Math.floor(change) : Math.ceil(change);
    },
    set(_value: number) { warn("healingAdjustedTotalDamage", "hpDamage / calculatedDamages (setting it changes nothing)", "14.8.0"); }
  });
  return entry;
}

/**
 * The image of whatever granted uncanny dodge, for the damage tray.
 *
 * Resolved while the damage is being calculated because the flag is a reaction's: it is set during
 * the workflow and gone before anything re-renders.
 */
function uncannyDodgeSourceIcon(actor: Actor.Implementation): string | undefined {
  // dnd5e yields only effects that apply to the actor, so unapplied enchantments are already excluded.
  for (const effect of actor.allApplicableEffects?.() ?? []) {
    if (!effect.changes?.some(c => c.key === `flags.${MODULE_ID}.uncanny-dodge`)) continue;
    const origin = effect.origin ? fromUuidSync(effect.origin) : undefined;
    return (origin instanceof Item ? origin.img : undefined) ?? effect.img ?? undefined;
  }
  return undefined;
}

type TargetDamageRecord = Omit<PreSetupDamageListEntry, "options"> & { options?: CalcDamageOptions };

/** The use's total damage (healing negative) from its rolls; undefined when it has none */
function useDamageTotal(workflow: Workflow): number | undefined {
  const none = (detail: DamageDescription[] | undefined) => detail?.length === 0 || (detail?.length === 1 && detail[0]?.type === "midi-none");
  if (none(workflow.rawDamageDetail) && none(workflow.rawBonusDamageDetail) && none(workflow.rawOtherDamageDetail)) return undefined;
  let total = workflow.rawDamageDetail?.reduce((acc, di) => acc + (di.type === "temphp" ? 0 : di.type === "healing" ? -di.value : di.value), 0) ?? 0;
  if (workflow.rawOtherDamageDetail) total += workflow.rawOtherDamageDetail.reduce((acc, di) => acc + (di.type === "temphp" ? 0 : di.value), 0) ?? 0;
  if (workflow.rawBonusDamageDetail) total += workflow.rawBonusDamageDetail.reduce((acc, di) => acc + (di.type === "temphp" ? 0 : di.value), 0) ?? 0;
  return total;
}

/** Other damage gets a list (and card) of its own unless one concentration check covers all of the damage */
function damageSelectors(workflow: Workflow) {
  const selectors: ("combinedDamage" | "otherDamage")[] = ["combinedDamage"];
  if (!configSettings.singleConcentrationRoll && workflow.otherDamageRolls) selectors.push("otherDamage");
  const inSelector = (selector: "combinedDamage" | "otherDamage") => (d: DamageDescription) =>
    selector === "otherDamage" ? d.midiCategory === "otherDamage" : (selectors.length === 1 || d.midiCategory !== "otherDamage");
  return { selectors, inSelector };
}

/**
 * A rebuilt use's damage lists as processDamageRoll leaves them (damageList: the last list; targetDamage: each target's
 * entries), for the targets (`only`: by uuid) no damage card records: worked out now from its stored rolls and the
 * targets as they are, so HP and resistances are today's. No hooks, macros or reactions; nothing applied.
 */
export function reconstructDamageLists(workflow: Workflow, only?: Set<string>): { damageList: DamageListEntry[], targetDamage: Record<string, DamageListEntry[]> } {
  const result = { damageList: [] as DamageListEntry[], targetDamage: {} as Record<string, DamageListEntry[]> };
  const totalDamage = useDamageTotal(workflow);
  if (totalDamage === undefined) return result;
  const hitTargets = workflow.hitTargets.union(workflow.hitTargetsEC);
  const defaultSaveMultiplier = getSaveMultiplierForActivity(workflow.activity);
  const records = workflow.targets.documents.filter(document => !only || only.has(document.uuid ?? "")).map(document => [document, targetDamageRecord(workflow, document, totalDamage, hitTargets, defaultSaveMultiplier)] as const);
  const { selectors, inSelector } = damageSelectors(workflow);
  for (const selector of selectors) {
    result.damageList = [];
    for (const [document, record] of records) {
      const actor = document.actor;
      if (!actor || !record?.options) continue;
      const entry = setupDamageDetails({ ...record, options: copyDamageOptions(record.options),
        calculatedDamages: record.calculatedDamages.filter(inSelector(selector)), damages: record.damages.filter(inSelector(selector)) }, actor);
      if (!entry) continue;
      result.damageList.push(entry);
      if (document.uuid) (result.targetDamage[document.uuid] ??= []).push(entry);
    }
  }
  return result;
}

/** The damage a use's rolls do to one target (dnd5e's calculation, midi's options); no reactions, nothing applied */
export function targetDamageRecord(workflow: Workflow, tokenDocument: TokenDocument.Implementation, totalDamage: number,
  hitTargets: TokenDocumentSet, defaultSaveMultiplier: number): TargetDamageRecord | undefined {
  const actor = tokenDocument.actor;
  if (!actor?.uuid) return undefined;
  let challengeModeScale = 1;
  let challengeModeAR = 0;
  if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor") as string) && workflow.attackRoll && workflow.hitTargetsEC?.has(tokenDocument)) {
    //scale the damage detail for a glancing blow - only for the first damage list? or all?
    const scale = workflow.challengeModeScale?.[tokenDocument?.uuid ?? "dummy"] ?? 1;
    challengeModeScale = scale;
  } else if (checkRule("challengeModeArmor") === "challenge" && workflow.hitTargetsEC?.has(tokenDocument)) {
    //@ts-expect-error no dnd5e-types
    challengeModeAR = actor.system.attributes.ac.AR ?? 0;
  }

  const semiSuperSaver = workflow.semiSuperSavers.has(tokenDocument);
  const superSaver = workflow.superSavers.has(tokenDocument);
  const hasSaved = workflow.saves.has(tokenDocument);
  // What a successful save does to base damage; applySaves adds Super Saver per damage entry.
  const saveMultiplier = defaultSaveMultiplier;
  const record: TargetDamageRecord = {
    actorId: actor.id!,
    actorUuid: actor.uuid,
    challengeModeScale,
    challengeModeAR,
    critical: workflow.isCritical,
    calculatedDamages: [],
    damages: [],
    isHit: hitTargets.has(tokenDocument),
    saved: hasSaved,
    sceneId: tokenDocument.parent?.id ?? "",
    semiSuperSaver,
    superSaver,
    totalDamage,
    targetUuid: tokenDocument?.uuid ?? "",
  };
  const damageBuckets: [DamageDescription[], "defaultDamage" | "otherDamage" | "bonusDamage"][] = [
    [workflow.damageDetail ?? [], "defaultDamage"],
    [workflow.otherDamageFor(tokenDocument), "otherDamage"],
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
        criticalSave: workflow.criticalSaves.has(tokenDocument),
        fumbleSave: workflow.fumbleSaves.has(tokenDocument),
        isCritical: workflow.isCritical,
        isFumble: workflow.isFumble,
        isHit: hitTargets.has(tokenDocument),
        itemType: workflow.item.type,
        save: hasSaved,
        saved: hasSaved,
        saveMultiplier, // default
        semiSuperSaver,
        sourceActorUuid: workflow.actor.uuid ?? undefined,
        itemCardUuid: workflow.itemCardUuid,
        superSaver,
        targetUuid: tokenDocument.uuid ?? undefined,
        // @ts-expect-error no dnd5e-types
        uncannyDodge: actor.flags?.[MODULE_ID]?.["uncanny-dodge"] && workflow.item?.hasAttack,
        uncannyDodgeIcon: uncannyDodgeSourceIcon(actor)
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
    // dnd5e 6.1's attacker rules: downgrade is dnd5e's two steps, unlike Downgrade Immunity above
    return applyDamageRules(calcDamageOptions, workflow.damageRules);
  };

  // One record per target: the raw damage, each entry tagged with its category, and dnd5e's calculation of it
  const calcDamageOptions = buildCalcDamageOptions();
  // Per category, the record's options are the first category's, as calculated with
  let categoryOptions: CalcDamageOptions | undefined = calcDamageOptions;
  const rawDamage: DamageDescription[] = [];
  let calculated: DamageDescription[] = [];
  for (const [damages, type] of damageBuckets) {
    if (!damages) {
      const message = `processDamageRoll | ${type} damages is not defined`;
      TroubleShooter.recordError(new Error("no valid damage"), message);
      error(message);
      continue;
    }
    for (const d of damages) d.midiCategory = type;
    rawDamage.push(...damages.filter(d => d.type !== "midi-none"));
    // dnd5e's damage modification and midi's DR are budgets consumed per call: one call for all of the damage,
    // unless each category is to be calculated on its own
    if (!configSettings.singleDamageCalculation) {
      // False when a hook vetoes the calculation
      const categoryDamage: DamageDescription[] = actor.calculateDamage(damages, categoryOptions ?? buildCalcDamageOptions()) || [];
      categoryOptions = undefined;
      // What midi's DR pass added belongs to this category's damage
      for (const d of categoryDamage) d.midiCategory ??= type;
      calculated = calculated.concat(categoryDamage);
    }
  }
  if (configSettings.singleDamageCalculation) {
    // Tagged entries, never by index: midi's DR pass adds an aggregate entry and splices out midi-none entries
    calculated = actor.calculateDamage(damageBuckets.flatMap(([damages]) => damages ?? []), calcDamageOptions) || [];
  }
  return Object.assign(record, { options: calcDamageOptions, calculatedDamages: calculated, damages: rawDamage });
}

export async function processDamageRoll(workflow: Workflow, defaultDamageType: string) {
  if (debugEnabled > 0) warn("processDamageRoll |", workflow)
  // Every target, with a canvas token or not: damage goes by the token's document and actor
  const hitTargets = workflow.hitTargets.union(workflow.hitTargetsEC);
  const theTargets = workflow.targets.documents;
  // TODO becomes activity.target.affects.type === "self"
  // if (activity.target.affects.type === "self") theTargets = await getOrCreateTokenForActorAsSet(actor) || theTargets;
  let effectsToExpire: string[] = [];
  if (hitTargets.count > 0 && workflow.activity.attack) effectsToExpire.push("1Hit");
  if (hitTargets.count > 0 && workflow.activity.damage) effectsToExpire.push("DamageDealt");
  if (effectsToExpire.length > 0) {
    await expireMyEffects.bind(workflow)(effectsToExpire);
  }

  if (debugEnabled > 0) warn("processDamageRoll | damage details pre merge are ", workflow.rawDamageDetail, workflow.rawBonusDamageDetail ?? []);
  let totalDamage = 0;

  const useTotal = useDamageTotal(workflow);
  if (useTotal === undefined) return;

  const damagePerActor: Record<string, TargetDamageRecord> = {};
  workflow.damageList = [];
  totalDamage = useTotal;
  const defaultSaveMultiplier = getSaveMultiplierForActivity(workflow.activity);
  for (const tokenDocument of theTargets) {
    // Reactions need a Token: drawn, or midi's for an actor with none on the scene
    const token = workflow.targets.placeableOf(tokenDocument);
    const actor = tokenDocument.actor;
    if (!actor?.uuid) continue;
    if (!foundry.utils.getProperty(workflow.activity.item, `flags.${MODULE_ID}.noProvokeReaction`) && !workflow?.workflowOptions?.noProvokeReaction) {
      if (token && totalDamage !== 0 && (workflow.hitTargets.has(tokenDocument) || workflow.hitTargetsEC.has(tokenDocument) || workflow.hasSave)) {
        const isHealing = ("heal" === workflow.activity.actionType) || totalDamage < 0;
        await workflow.askReactionsStep(token, workflow.tokenUuid, workflow.damageRoll ?? workflow.bonusDamageRoll ?? workflow.otherDamageRoll ?? new Roll("0"), !isHealing ? "reactiondamage" : "reactionheal", { activity: workflow.activity, item: workflow.item, workflow, workflowOptions: { damageDetail: workflow.rawDamageDetail, damageTotal: totalDamage, sourceActorUuid: workflow.actor.uuid, sourceItemUuid: workflow.item.uuid, sourceAmmoUuid: workflow.ammunition?.uuid } });
      }
    }
    const record = targetDamageRecord(workflow, tokenDocument, totalDamage, hitTargets, defaultSaveMultiplier);
    if (!record) continue;
    damagePerActor[actor.uuid] = record;
    /*
     * Keep what was actually applied, keyed by target.
     *
     * The card cannot recompute this later: uncanny dodge is a reaction, so the flag it reads is
     * set during the workflow and gone by the time anything re-renders. `processDamageRoll` runs
     * after the damage is displayed, so this is the only point at which the real answer exists.
     */
    if (tokenDocument.uuid) {
      workflow.midiTargetDetail ??= {};
      const { uncannyDodge, uncannyDodgeIcon } = record.options?.midi ?? {};
      workflow.midiTargetDetail[tokenDocument.uuid] = { uncannyDodge, uncannyDodgeIcon };
    }
  }

  const { selectors, inSelector } = damageSelectors(workflow);
  // Each target's damage entries, one per list: the effects' damage components are all of them, as macros leave them
  workflow.targetDamage = {};
  // Damage cards are linked to the usage card (system.origin), so undo finds them.
  for (const selector of selectors) {
    workflow.damageList = [];
    for (const tokenDocument of theTargets) {
      const actor = tokenDocument.actor;
      if (!actor?.uuid) continue;
      const target = damagePerActor[actor.uuid];
      if (!target?.options) continue;
      const damageEntry = setupDamageDetails({
        ...target,
        options: copyDamageOptions(target.options),
        calculatedDamages: target.calculatedDamages.filter(inSelector(selector)),
        damages: target.damages.filter(inSelector(selector))
      }, actor);
      if (damageEntry) {
        workflow.damageList.push(damageEntry);
        if (tokenDocument.uuid) (workflow.targetDamage[tokenDocument.uuid] ??= []).push(damageEntry);
        await workflow?.callDamageHooksAndMacros(damageEntry, tokenDocument);
      }
    }
    // A module may still have replaced the deprecated applyDamageCard port
    const applyDamageCard = workflow.replacedPort("applyDamageCard") ?? (data => timedAwaitExecuteAsGM("createReverseDamageCard", data));
    await applyDamageCard({
      autoApplyDamage: configSettings.autoApplyDamage,
      actorId: workflow.actor.id,
      actorUuid: workflow.actor.uuid,
      charName: workflow.token?.name ?? workflow.actor.name ?? game.user?.name,
      damageList: prepareDamageListToJSON(workflow.damageList),
      chatCardUuid: workflow.itemCardUuid,
      updateOptions: { noConcentrationCheck: workflow?.workflowOptions?.noConcentrationCheck ?? false, awaitDamageApplication: configSettings.waitForDamageApplication },
      forceApply: false
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

/**
 * Whether an item's own damage is magical: a physical item's `magicAvailable` (false while attunement is missing or
 * under antimagic), anything else its Magical property. dnd5e gives every item `magicAvailable`, true for spells and
 * features, which would make all feature damage magical.
 */
export function itemMagicAvailable(item: Item.Implementation | null | undefined): boolean {
  const system = dnd5eItem(item)?.system;
  if (system?.isPhysical && system.magicAvailable !== undefined) return system.magicAvailable;
  return !!system?.properties?.has?.("mgc");
}

/** The dnd5e item fields midi reads for magic: the one place they are read untyped */
function dnd5eItem(item: Item.Implementation | null | undefined): { type?: string, system?: { isPhysical?: boolean, magicAvailable?: boolean, properties?: Set<string> } } | undefined {
  // @ts-expect-error no dnd5e-types
  return item ?? undefined;
}

export function itemIsSpell(item: Item.Implementation | null | undefined): boolean {
  return dnd5eItem(item)?.type === "spell";
}

/** Whether an item is magic for dnd5e's antimagic: a spell, or one with the Magical property */
export function itemIsMagical(item: Item.Implementation | null | undefined): boolean {
  const data = dnd5eItem(item);
  return data?.type === "spell" || !!data?.system?.properties?.has?.("mgc");
}

export const HEALING_BUTTON_KEY = "DND5E.HEAL.HealingButton.Full";

/**
 * A length in another unit (dnd5e's convertLength). No target unit keeps the value: dnd5e would pick the largest unit
 * that fits.
 */
export function convertLengthTo(value: number, from: string | undefined, to: string | undefined | null): number {
  const convert = globalThis.dnd5e?.utils?.convertLength;
  if (!convert || !to || !from) return value;
  return convert(value, from, { to, legacy: false, strict: false })?.value ?? value;
}

/**
 * Whether a calculated damage entry has an active change: on its type, on All Damage (modification), or on a
 * resistance matched by a filter, such as falling (`active.special`).
 */
export function damageActiveHas(damage: DamageDescription, flag: string): boolean {
  return damageChangeHas(damage, "active", flag);
}

/** The same for dnd5e 6.1's `potential` record (what would apply with nothing ignored or downgraded), or `active`. */
export function damageChangeHas(damage: DamageDescription, record: "active" | "potential", flag: string): boolean {
  const changes = damage[record];
  if (changes?.type?.[flag] || changes?.all?.[flag]) return true;
  return Object.values((changes?.special ?? {}) as Record<string, Record<string, unknown>>).some(change => !!change?.[flag]);
}

/**
 * Whether an activity is of a dnd5e activity type: that type, or one dnd5e 6.1 treats as it (`metadata.like`).
 * As `activity.isLike(type)`, but also for an activity's roll data (a roll's `data.activity`), which has no methods.
 */
export function isActivityType(activity: Activity | null | undefined, type: string): boolean {
  if (!activity) return false;
  return typeof activity.isLike === "function" ? activity.isLike(type) : activity.type === type;
}

export let getSaveMultiplierForItem = (item?: Item.Implementation | null, itemDamageType?: string) => {
  console.warn("getSaveMultiplierForItem is deprecated, use getSaveMultiplierForActivity instead");
  return itemSaveMultiplier(item);
};

// With no activity to ask: cantrips none (half with Potent Cantrip), anything else the default
function itemSaveMultiplier(item?: Item.Implementation | null): number {
  if (!item) return 1;
  // @ts-expect-error no dnd5e-types
  if (item.actor && item.type === "spell" && item.system.level === 0) { // cantrip
    const midiFlags = item.actor?.flags?.[MODULE_ID];
    if (midiFlags?.potentCantrip) return configSettings.defaultSaveMult;
    return 0;
  }
  return configSettings.defaultSaveMult;
}

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
      total = abilityData?.check?.value ?? abilityData?.mod ?? 0;
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
    return ChatMessage.create(chatData);
  } catch (err) {
    const message = `midi-qol | request PC save`;
    TroubleShooter.recordError(err, message);
    error(message, err);
    return undefined;
  }
}

/**
 * A player's Active Defence roll, asked through the request core (M5b): their D20Roll dialog shows the requester's
 * deadline; on time-out or disconnect, or the GM's "roll for them" from the player list, `rollForThem` makes it.
 */
export function requestPCActiveDefence(player: User.Implementation, actor: Actor.Implementation, saveItemName: string, tokenUuid: string | undefined,
  options: { formula: string, bonus: number, coverBonus: number, rollOptions: any, rollForThem: () => Promise<Roll>, owner?: object }): Promise<Roll | {}> {
  const rollMode = toMessageMode((checkRule("activeDefenceShow") as string) || "self");
  const flavor = `${saveItemName} ${configSettings.optionalRules.activeDefence ? "DC " + options.rollOptions.target : ""} ${i18n("midi-qol.ActiveDefenceString")}`;
  const data = { targetUuid: actor.uuid, formula: options.formula, bonus: options.bonus, coverBonus: options.coverBonus, rollOptions: options.rollOptions,
    rollMode, midiType: "defenceRoll", flavor, messageData: { speaker: getSpeaker(actor) } };
  return askUser<unknown>(player, {
    type: DEFENCE_REQUEST, data, kind: "defence", owner: options.owner, actorUuid: actor.uuid ?? undefined, tokenUuid,
    label: i18nFormat("midi-qol.PlayerWaits.DefenceLabel", { item: saveItemName }),
    timeoutMs: (configSettings.playerSaveTimeout ?? 0) * 1000,
    fallback: options.rollForThem,
    gmChoices: { roll: options.rollForThem }
  }).settled.then(({ value }) => {
    if (debugEnabled > 1) debug("D20Roll result ", value);
    if (value instanceof Roll) return value;
    // The player's roll comes back serialised
    try {
      //@ts-expect-error D20Roll
      return CONFIG.Dice.D20Roll.fromJSON(JSON.stringify(value));
    } catch { return {}; }
  }, err => { error("requestPCActiveDefence | the defence roll could not be made", err); return {}; });
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

export function midiCustomEffect(target: foundry.abstract.DataModel.Any, change: MidiChangeData & { effect?: ActiveEffect.Implementation }, current: unknown, delta: unknown, changes: unknown) {
  // Foundry 14 applies effects to any data model; midi's keys belong on actors and items (enchantments)
  if (!(target instanceof Actor) && !(target instanceof Item)) return true;
  const actor = target;
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
    // v14 AnyField preserves non-string change values; this flag is only meaningful as a string.
    if (typeof change.value !== "string") return true;
    const args = change.value.split(",")?.map(arg => arg.trim());
    const currentFlag = foundry.utils.getProperty(actor, `flags.${MODULE_ID}.onUseMacroName`) as string ?? "";
    if (!args[0]) {
      // A blank macro name is the effect's own macro: its activity's, else its item's, if it has one
      if (!args[1]) {
        const message = `onUseMacroName change "${change.value}" on ${change.effect?.name ?? "an effect"} (${actor.name}) has no macro pass and is ignored`;
        TroubleShooter.recordError(new Error(message), message);
        return true;
      }
      const activityUuid = change.effect?.flags?.dae?.activity;
      const activity = activityUuid ? fromUuidSync(activityUuid) as Activity | undefined : undefined;
      const origin = originUuid ? fromUuidSync(originUuid) : undefined;
      const item = origin instanceof Item ? origin : (origin instanceof ActiveEffect && origin.parent instanceof Item ? origin.parent : undefined);
      if (activity?.macro?.command) args[0] = `ActivityMacro.${activityUuid}`;
      else if (item && globalThis.DAE?.getItemMacroCommand(item)) args[0] = "ItemMacro";
      else {
        if (debugEnabled > 0) warn(`onUseMacroName change on ${change.effect?.name} (${actor.name}) has a blank macro name and its item has no macro`);
        return true;
      }
    }
    if (args[0] === "ActivityMacro" || args[0] === MQActivityMacroLabel) {
      if (change.effect?.flags.dae?.activity) args[0] = `ActivityMacro.${change.effect.flags.dae.activity}`;
      // @ts-expect-error no dnd5e-types
      else if (change.effect.transfer) args[0] = `ActivityMacro.${change.effect.parent!.system.activities.contents[0].uuid}`;
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
  } else if (change.key.startsWith(`flags.${MODULE_ID}.optional.`) && typeof change.value === "string"
    && (change.value.trim() === "ItemMacro" || change.value.trim() === MQItemMacroLabel)) {
    let macroString = change.value;
    const sourceItemUuid = change.effect ? globalThis.DAE?.getEffectSource(change.effect).itemUuid : undefined;
    if (sourceItemUuid) macroString = `ItemMacro.${sourceItemUuid}`;
    else if (originUuid?.includes("Item.")) {
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
  } else if (deferredEvaluation.some(k => change.key?.startsWith(k))) {
    // v14 AnyField stores values as-is (no auto-coercion), but v13 backward-compat shim's
    // migrateChangeValue ran JSON.parse converting "0"→0, "1"→1, etc. Handle both.
    const changeValue = change.value as string | number | boolean;
    if (typeof changeValue === "boolean") foundry.utils.setProperty(actor, change.key, changeValue);
    else if (changeValue === 0) foundry.utils.setProperty(actor, change.key, false);
    else if (changeValue === 1) foundry.utils.setProperty(actor, change.key, true);
    else if (typeof changeValue !== "string") foundry.utils.setProperty(actor, change.key, changeValue);
    else if (["true", "1"].includes(changeValue.trim())) foundry.utils.setProperty(actor, change.key, true);
    else if (["false", "0"].includes(changeValue.trim())) foundry.utils.setProperty(actor, change.key, false);
    else foundry.utils.setProperty(actor, change.key, changeValue);
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

/** Untargets the user's targets at 0 hit points; with `only`, just those of them (a finished workflow's targets). */
export function untargetDeadTokens(only?: Set<TokenOrDocument>) {
  if (autoRemoveTargets !== "none") {
    game.user?.targets.forEach((t) => {
      if (only && !only.has(t)) return;
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
  // Repeat so values that contain @ references are resolved too
  do {
    count += 1;
    for (let match of result.match(re) || []) {
      result = result.replace(match, (foundry.utils.getProperty(context, match.slice(1)) as string) ?? options.blankValue)
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
  const owner = playerForActor(actor);
  // @ts-expect-error fvtt-types v14 ActiveEffect
  const changes = effect.system.changes.filter(change => change.key.startsWith(`flags.${MODULE_ID}.ActivityOverTime`));
  let requiresUserExecution = false;
  for (let change of changes) {
    const activity = await getOvertimeActivity(actor, effect, change, startTurn);
    if (!activity) continue;
    if (["gm", "self"].includes(toMessageMode(activity.midiProperties?.rollMode ?? ""))) {
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
  // Check start/end turn
  if (turnChoice === "start" && !startTurn) return undefined;
  if (turnChoice === "end" && startTurn) return undefined;
  return activity;

}
export async function localActivityOverTimeEffect(actor: Actor.Implementation, effect: ActiveEffect.Implementation, startTurn: boolean = true, options: any = { saveToUse: undefined, rollFlags: undefined, rollMode: undefined }) {
  // Get the activity
  // @ts-expect-error fvtt-types v14 ActiveEffect
  let changes = effect.system.changes.filter(change => change.key.startsWith(`flags.${MODULE_ID}.ActivityOverTime`));
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
      { midiOptions: { targetsToUse, checkGMstatus, workflowOptions: { noProvokeReaction: true, autoConsumeResource: "both", overTimeEffectUuid: effect.uuid ?? undefined } } },
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
      item = actor.items.find(i => i.name === itemSpec && !!DAE.getItemMacroCommand(i));
    }
  }

  if (!item) return undefined;

  const command = DAE.getItemMacroCommand(item);
  if (!command) return undefined;

  return { item, macroData: { name: item.name, type: "script" as const, command } };
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
    actorUuid: actor.uuid ?? "",
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
  const rolled = options.rollFlags.type === "skill" ? options.rollFlags.skillId
    : options.rollFlags.type === "tool" ? options.rollFlags.toolId : options.rollFlags.ability;
  if (!rollType.includes(options.rollFlags.type) || !saveAbility.includes(rolled)) {
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
  // A save just rolled from the last card may have ended the effect (handleActionSaveRollResponse): nothing to ask for
  const ended = () => !effect.id || !effect.parent?.effects.has(effect.id) || (!!effect.uuid && endingEffects.has(effect.uuid));
  if (ended()) return effect.id;

  const MessageClass = getDocumentClass("ChatMessage");
  const chatCardUuids: string[] = [];
  let whisper = ChatMessage.getWhisperRecipients(owner?.name ?? "");
  if (owner?.isGM) whisper = ChatMessage.getWhisperRecipients("GM");
  // A dnd5e 6 prompt message: not broadcast, so its buttons roll for the message's actor. The flags tell midi's
  // roll wrappers which over-time effect the roll answers.
  // A skill or tool button needs its ability as well, as dnd5e's own request buttons have.
  const buttons = saveAbility.map(id => ({
    type: rollTypeString, format: "long", visibility: "all", dc: Number(saveDC),
    ...(rollTypeString === "skill" ? { skill: id, ability: GameSystemConfig.skills[id]?.ability }
      : rollTypeString === "tool" ? { tool: id, ability: GameSystemConfig.tools[id]?.ability } : { ability: id })
  }));
  const chatCard = await MessageClass.create<ChatMessage.CreateData>({
    whisper: whisper.map(u => u.id ?? ""),
    flavor: `Action: ${label ?? effect.name} ${i18n(messageFlavor[details.rollType])}`,
    speaker: speakerFor({ actor }),
    // @ts-expect-error no dnd5e-types
    type: "prompt", system: { broadcast: false, buttons },
    flags: { [MODULE_ID]: { overtimeActorUuid: actor.uuid ?? undefined, overtimeRollMode: rollMode } }
  });
  if (chatCard) chatCardUuids.push(chatCard.uuid);
  if (ended()) {
    await chatCard?.delete();
    return effect.id;
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
  // No name or image of its own: the card shows the activity type's, not the item's twice.
  let activityData: any = {
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

/** Effect stack count - flags.dae.stacks, or EffectCounter's per-token counter when present. */
export function getEffectStackCount(effect: ActiveEffect.Implementation | undefined, token?: TokenOrDocument): number {
  if (!effect) return 1;
  let stacks = (effect.flags?.dae as any)?.stacks ?? 1;
  if (globalThis.EffectCounter && token) {
    const counter = globalThis.EffectCounter.findCounter(getTokenDocument(token), effect.img ?? (effect as any).icon);
    if (counter) stacks = counter.getValue();
  }
  return Number(stacks) || 1;
}

/**
 * Parse raw overtime spec string into typed OvertimeDetails
 */
const OVERTIME_KEYS = new Set(["actionSave", "allowIncapacitated", "applyCondition", "autoRollAttack", "autoRollDamage",
  "chatFlavor", "condition", "damageBeforeSave", "damageRoll", "damageType", "failCount", "failRemove", "fastForwardAttack",
  "fastForwardDamage", "itemName", "killAnim", "label", "macro", "name", "removeCondition", "rollMode", "rollType",
  "saveAbility", "saveCount", "saveDamage", "saveDC", "saveMagic", "saveRemove", "turn"]);
const warnedOvertimeSpecs = new Set<string>();

/**
 * Split an OverTime spec into its raw fields. A field is `key=` at the start or straight after a "," or "#"; its value
 * runs to the next such field, so commas and "#" inside formulas, conditions and text stay in the value. A value that
 * starts with a quote runs to the matching quote.
 */
export function splitOvertimeSpec(spec: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const keyAt = /\s*([A-Za-z][A-Za-z0-9_]*)\s*=(?![=>])\s*/y;
  const keyFollows = (i: number) => { keyAt.lastIndex = i; return keyAt.test(spec); };
  let pos = 0;
  while (pos < spec.length && /[\s,#]/.test(spec[pos])) pos++;
  while (pos < spec.length) {
    keyAt.lastIndex = pos;
    const match = keyAt.exec(spec);
    if (!match) break;
    const start = keyAt.lastIndex;
    let scanFrom = start;
    const quote = spec[start];
    if (quote && `"'\``.includes(quote)) {
      const close = spec.indexOf(quote, start + 1);
      if (close > start) scanFrom = close + 1;
    }
    let next = spec.length;
    for (let i = scanFrom; i < spec.length; i++) {
      if ((spec[i] === "," || spec[i] === "#") && keyFollows(i + 1)) { next = i; break; }
    }
    fields[match[1]] = spec.slice(start, next).replace(/[\s,#]+$/, "").trim();
    pos = next + 1;
  }
  return fields;
}

const unquote = (value: string | undefined) => value && /^(["'`]).*\1$/s.test(value) ? value.slice(1, -1) : value;

export function parseOvertimeDetails(specString: string, rollData: Record<string, any>, effectName: string): OvertimeDetails | null {
  // A spec that is one @reference may hold several fields, so it is substituted before splitting.
  const single = /^\s*@[\w.-]+\s*$/.test(specString);
  const fields = splitOvertimeSpec(single ? replaceAtFields(specString, rollData, { blankValue: 0, maxIterations: 3 }) : specString);
  const raw: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!OVERTIME_KEYS.has(key) && !warnedOvertimeSpecs.has(specString)) {
      warnedOvertimeSpecs.add(specString);
      console.warn(`midi-qol | OverTime effect "${effectName}": unknown key "${key}" in ${specString}`);
    }
    raw[key] = replaceAtFields(value, rollData, { blankValue: 0, maxIterations: 3 });
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
    itemName: unquote(raw.itemName),
    chatFlavor: unquote(raw.chatFlavor) ?? "",
    // Normalize a legacy stored over-time rollMode to its v14 equivalent (keeps "default"/undefined).
    rollMode: raw.rollMode ? rollModeToMessageMode(raw.rollMode) : raw.rollMode,
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
  const { rollType, saveAbility, saveDC } = details;
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
  // @ts-expect-error fvtt-types v14 ActiveEffect
  const changes = effect.system.changes.filter(change => change.key.startsWith(`flags.${MODULE_ID}.OverTime`));
  if (changes.length > 0) for (let change of changes) {
    // flags.midi-qol.OverTime turn=start/end, damageRoll=rollspec, damageType=string, saveDC=number, saveAbility=str/dex/etc, damageBeforeSave=true/[false], label="String"
    // Read the raw value - parseOvertimeDetails substitutes @fields before details.damageRoll exists.
    // Only damageRoll counts; @stackCount in a condition says nothing about damage scaling.
    const rawDamageRoll = typeof change.value === "string" ? (splitOvertimeSpec(change.value).damageRoll ?? "") : "";
    const authorHandlesStacks = rawDamageRoll.includes("@stackCount");
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

      // Repeat per stack by default; if the spec uses @stackCount the author scales it themselves.
      if (damageRoll && activityData.damage?.parts?.[0]) {
        let damageRollString = damageRoll;
        if (!authorHandlesStacks) {
          const stackCount = getEffectStackCount(effect, theTargetToken);
          for (let i = 1; i < stackCount; i++)
            damageRollString = `${damageRollString} + ${damageRoll}`;
        }
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
      if (!actionSave && !isPermanent && (saveCount || failCount) && saveDC > -1 && effect.uuid) {
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
        if (effect.uuid && await overTimeRemoveConditionMet(details.removeCondition, rollData)) {
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
          workflowOptions: { targetConfirmation: "none", isOverTime: true, allowIncapacitated, overTimeEffectUuid: effect.uuid ?? undefined }
        };
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

/**
 * A combatant's OverTime and ActivityOverTime effects at the start or end of its turn, driven by core's turn events,
 * which name the combatant rather than a position in the (possibly re-sorted) turn order.
 */
export async function processTurnOverTime(combat: Combat.Implementation, combatant: Combatant.Implementation, startTurn: boolean) {
  // Core also fires turn events when a re-sort changes who holds the current turn; no turn has passed.
  if (combat.previous?.round === combat.current.round && combat.previous?.turn === combat.current.turn) return;
  const actor = combatant?.actor;
  if (!actor) return;
  if (startTurn) removeActionUsed(actor);
  for (const effect of actor.appliedEffects) {
    // @ts-expect-error fvtt-types v14 ActiveEffect
    const keys: string[] = effect.system.changes.map(change => change.key);
    if (keys.some(key => key.startsWith(`flags.${MODULE_ID}.OverTime`))) await doOverTimeEffect(actor, effect, startTurn);
    if (keys.some(key => key.startsWith(`flags.${MODULE_ID}.ActivityOverTime`))) await doActivityOverTimeEffect(actor, effect, startTurn);
  }
}
export async function completeActivityUse(activityRef: Activity | string | undefined,
  usage: ActivityUseConfiguration = {},
  dialog: RollDialogConfig = {},
  message: RollMessageConfig = {}
): Promise<Workflow | undefined> {
  activityRef = foundry.utils.deepClone(activityRef);
  // The caller's objects are left as they were: the use's targets, sequence and dnd5e's defaults go in copies, so options
  // reused for another call don't carry this use's (deepClone copies plain objects; documents, Sets and events are kept)
  usage = foundry.utils.deepClone(usage);
  dialog = foundry.utils.deepClone(dialog);
  message = foundry.utils.deepClone(message);
  usage.midiOptions ??= {};
  // The union of targetsToUse and targetUuids, by document: a token on another level or scene has no canvas token but is a target
  let targetsToUse = new TokenDocumentSet();
  const addTarget = (ref: unknown) => {
    const entity = typeof ref === "string" ? fromUuidSync(ref, { strict: false }) : ref;
    if (entity instanceof TokenDocument || entity instanceof foundry.canvas.placeables.Token) targetsToUse.add(entity as TokenOrDocument);
    else {
      const token = getToken(entity as Actor.Implementation | null);
      if (token) targetsToUse.add(token);
    }
  };
  if (usage.midiOptions.targetsToUse && !(usage.midiOptions.targetsToUse instanceof Set)) {
    error("completeActivityUse | targetsToUse is not a Set");
  } else if (usage.midiOptions.targetsToUse) {
    const given = usage.midiOptions.targetsToUse;
    for (const target of given instanceof TokenDocumentSet ? given.documents : given) addTarget(target);
  }
  for (const targetUuid of usage.midiOptions.targetUuids ?? []) addTarget(targetUuid);
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
      // The use's targets travel with the use; the player's targets are left alone (M2 stage 7)
      if (game.user && memberCount(targetsToUse) === 0 && activity.target?.affects?.type === "self") {
        const selfTarget = getToken(activity.item.actor);
        if (selfTarget) targetsToUse = new TokenDocumentSet([selfTarget]);
      } else if (memberCount(targetsToUse) === 0 && !usage.midiOptions!.ignoreUserTargets) {
        targetsToUse = new TokenDocumentSet(game.user?.targets);
      }

      let abortHookName = `midi-qol.preAbort.${activity?.uuid}`;
      if (!(activity)) {
        // Magic items create a pseudo item when doing the roll so have to hope we get the right completion
        abortHookName = "midi-qol.preAbort";
      }
      usage.sequenceId = foundry.utils.randomID();
      let completeHookName = `midi-qol.postCleanup.${activity.uuid}`;
      // @ts-expect-error no clue
      if (!activity || activity.activity?.id || isActivityType(activity, "cast")) {
        // Magic items create a pseudo item when doing the roll so have to hope we get the right completion
        // Forward activities and CastActivity won't fire postCleanup with the cast activity's UUID —
        // the spell workflow fires it with the spell activity's UUID instead.
        // Use the generic hook and rely on sequenceId gating to match the correct workflow.
        completeHookName = "midi-qol.postCleanup";
      }

      // Both hooks and the timeout do the same cleanup: unregister hooks, resolve.
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const cleanupAndResolve = (result: any, source?: string) => {
        if (timeoutId !== undefined) { clearTimeout(timeoutId); timeoutId = undefined; }
        //@ts-expect-error dynamic hook name
        Hooks.off(abortHookName, abortHookId);
        //@ts-expect-error dynamic hook name
        Hooks.off(completeHookName, completeHookId);
        if (source && debugEnabled > 0) warn(`completeActivityUse ${source}: ${activity?.item?.name} ${completeHookName}`);
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
      // Documents in a plain Set, so targets with no canvas token survive the use's config being copied
      usage.midiOptions!.targetsToUse = new Set(targetsToUse.documents);
      const isMidiActivity = !!(activity as { isMidiActivity?: boolean }).isMidiActivity;
      // Another module's activity reads the user's targets, not midi's options.
      if (!isMidiActivity) updateUserTargets(targetsToUse.documents.map(t => t.id!));
      // @ts-expect-error no dnd5e-types
      activity.use(usage, dialog, message).then(result => {
        // An activity midi doesn't wrap (e.g. dnd5e's order) runs no workflow, so no hook will resolve it.
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
    newUsage.midiOptions.targetsToUse = targetsToUse.uuids;
    if (usage.midiOptions.rollAs) newUsage.midiOptions.rollAs = usage.midiOptions.rollAs.uuid ?? undefined;
    const data = {
      activityUuid: activity.uuid,
      actorUuid: activity.item.parent?.uuid,
      usage: newUsage,
      dialog,
      message
    }
    if (asUser)
      return restoreWorkflowTokenSets(await queryUser(asUser, "completeActivityUse", data));
    else
      return restoreWorkflowTokenSets(await timedAwaitExecuteAsGM("completeActivityUse", data));
  }
}

const WORKFLOW_TOKEN_SETS = {
  targets: "targetUuids", hitTargets: "hitTargetUuids", hitTargetsEC: "hitTargetUuidsEC", saves: "saveUuids",
  failedSaves: "failedSaveUuids", criticalSaves: "criticalSaveUuids", fumbleSaves: "fumbleSaveUuids",
  superSavers: "superSaverUuids", semiSuperSavers: "semiSuperSaverUuids"
} as const;

/**
 * Workflow macro data that crossed a socket carries its token sets as uuid arrays; give it back the workflow's
 * token sets (targets, hitTargets, failedSaves, ...). Other values pass through.
 */
export function restoreWorkflowTokenSets<T>(data: T): T {
  if (foundry.utils.getType(data) !== "Object") return data;
  const record = data as Record<string, unknown>;
  for (const [field, uuidField] of Object.entries(WORKFLOW_TOKEN_SETS)) {
    const uuids = record[uuidField];
    if (!Array.isArray(uuids)) continue;
    record[field] = new TokenDocumentSet(uuids);
  }
  return data;
}

export type MidiOptions = {
  activityId?: string;
  /** Rolled for a player by someone who can't act for them (a player, with no GM connected): no optional-bonus prompts */
  unattended?: boolean;
  /** A save asked through the request core (lib/requests.ts): its roll is the one that claims the request */
  requestClaim?: string;
  cardNote?: SaveDetails["cardNote"];
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
    // Whether to classify the use as an attack of opportunity; defaults to checkReaction.
    checkAoO?: boolean;
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
  grantsToken?: TokenOrDocument;
  spellLevel?: number;
  target?: number;
  targets?: Set<TokenOrDocument>;
  targetsToUse?: Set<TokenOrDocument>;
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
  if (!(item instanceof CONFIG.Item.documentClass)) {
    error("completeItemUse only works for items", item);
    return;
  }
  const { activityId, activityIdentifier } = config.midiOptions ?? {};
  if (activityId || activityIdentifier) {
    // @ts-expect-error no dnd5e-types
    const selected: Activity = item.system.activities.find(a => a.id === activityId || a.identifier === activityIdentifier)
    if (selected) return completeActivityUse(selected, activityConfig, dialog, message);
  }
  // @ts-expect-error no dnd5e-types
  // Filter usable activities: exclude riders, automationOnly, and activities that fail visibility checks (canUse)
  const activities = item.system.activities?.filter(a =>
    a.canUse !== false &&
    !a.isRider &&
    !a.midiProperties?.automationOnly
  );
  if (activities.length === 0) {
    //@ts-expect-error no dnd5e-types
    return item.displayCard(message);
    // error(`completeItemUse | item ${item.name} ${item.uuid} does not have a suitable activity`);
    // return undefined;
  }
  // Apply the module prune hook (midi-qol.itemUseActivitySelect) before deciding: create() skips the
  // dialog for a single survivor and returns null (skip the roll) if modules removed them all.
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
  const { x: x2, y: y2 } = tokenSourceCenter(token2);
  const z2 = tokenSourceElevation(token2) * unitsToPixel;

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

  if (!canvas.grid || !canvas.dimensions) undefined;
  if (!token || x === undefined || y === undefined) return undefined;
  if (!canvas || !canvas.grid || !canvas.dimensions) return undefined;
  const tokenPos = tokenSourcePosition(token);
  const tokenCenter = tokenSourceCenter(token);
  const t2StartX = -Math.max(0, tokenPos.width / 2 - 0.5);
  const t2StartY = -Math.max(0, tokenPos.height / 2 - 0.5);
  //  const [row, col] = canvas.grid?.getGridPositionFromPixels(x, y) || [0, 0];
  //  const [xBase, yBase] = canvas.grid?.getPixelsFromGridPosition(row, col) || [0, 0];
  let xc, yc;
  let distance = +Infinity;
  for (let xStep = t2StartX; xStep < tokenPos.width / 2; xStep += 1) {
    for (let yStep = t2StartY; yStep < tokenPos.height / 2; yStep += 1) {
      const xBase = xStep * canvas.grid.size + tokenCenter.x;
      const yBase = yStep * canvas.grid.size + tokenCenter.y;
      ({ x: xc, y: yc } = canvas.grid.getCenterPoint({ x: xBase, y: yBase }) || { x: 0, y: 0 });
      // ({ x: xc, y: yc } = canvas.grid.getCenterPoint.bind(canvas.grid)({ x, y }) || { x: 0, y: 0 });
      const newDistance = measureGridPath(canvas.grid, [new PIXI.Point(x, y), { x: xc, y: yc }])?.distance ?? Infinity;
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
  /** Pre-computed cover visibility (from external modules like levelsautocover) */
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
 * Get the vision height fraction for a token, respecting per-token flags and the global setting.
 * Returns the fraction (0-1) of the token's height to use for vision/targeting elevation.
 */
function getTokenHeightFraction(token: Token.Implementation, flagName: "visionSourceHeight" | "visionTargetHeight"): number {
  const flagValue = foundry.utils.getProperty(token.document, `flags.midi-qol.${flagName}`) as number | undefined;
  if (flagValue != null) return Math.clamp(flagValue, 0, 100) / 100;
  return configSettings.optionalRules.visionTestHeight === "top" ? 1.0 : 0.5;
}

/**
 * Compute the effective elevation for a token based on its vision height flags/setting.
 */
export function getTokenVisionElevation(token: Token.Implementation, flagName: "visionSourceHeight" | "visionTargetHeight"): number {
  const baseElev = tokenSourceElevation(token);
  const gridDistance = canvas.dimensions?.distance ?? 5;
  const depth = token.document.depth ?? 1;
  return baseElev + (depth * gridDistance * getTokenHeightFraction(token, flagName));
}

/**
 * v14: Check if a region surface blocks the path between two elevated points.
 * Returns false immediately for same-elevation rays (no surface can block).
 */
function checkSurfaceCollision(
  origin: { x: number, y: number },
  dest: { x: number, y: number },
  options: WallCollisionOptions
): boolean {
  const originElev = options.originElevation;
  const destElev = options.destElevation;
  if (originElev === undefined || destElev === undefined || originElev === destElev) return false;
  // Test rays at bottom, center, and top of token vertical extents.
  // A surface has openings (e.g. balcony edge) that only some rays pass through.
  // If ANY ray is clear, the attack has a path and is not blocked.
  const originTop = options.originTopElevation ?? originElev;
  const destTop = options.destTopElevation ?? destElev;
  const originMid = (originElev + originTop) / 2;
  const destMid = (destElev + destTop) / 2;
  const elevPairs = [
    [originElev, destElev],
    [originMid, destMid],
    [originTop, destTop],
  ];
  for (const [oElev, dElev] of elevPairs) {
    if (oElev === dElev) return false;
    const blocked = !!canvas.scene?.testSurfaceCollision?.(
      { x: origin.x, y: origin.y, elevation: oElev },
      { x: dest.x, y: dest.y, elevation: dElev },
      // @ts-expect-error fvtt-types: level is optional at runtime (every level is tested)
      { type: "move", mode: "any" }
    );
    if (!blocked) return false;
  }
  return true;
}

/** A token's level, for collision tests: core tests the viewed level unless given one. */
export function collisionLevel(token: Token.Implementation | TokenDocument.Implementation | null | undefined) {
  const document = token instanceof TokenDocument ? token : token?.document;
  // @ts-expect-error no dnd5e-types for document.level / scene.levels
  return canvas?.scene?.levels?.get(document?._source.level) ?? canvas?.level;
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
function wallBlocksPath(origin: { x: number, y: number }, dest: { x: number, y: number }, source: WallCollisionOptions["source"], level: unknown): boolean {
  // @ts-expect-error v14 collision level not in fvtt-types
  return !!CONFIG.Canvas.polygonBackends.move.testCollision(origin, dest, { source, mode: "any", type: "move", level });
}

export function checkWallCollision(
  origin: { x: number, y: number },
  dest: { x: number, y: number },
  options: WallCollisionOptions
): boolean {
  const { wallsBlockRange, coverVisible, source } = options;
  const level = collisionLevel(source);
  let blocked: boolean;

  if (wallsBlockRange === "none") return false;
  // A cover module (AutoCover) has answered for the whole target
  if (coverVisible !== undefined) return !coverVisible;
  blocked = !!wallBlocksPath(origin, dest, source, level);
  // v14: also check region surface collisions for cross-elevation rays
  if (!blocked) blocked = checkSurfaceCollision(origin, dest, options);
  return blocked;
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
export function shapesOverlap(poly1: PIXI.Polygon, poly2: PIXI.Polygon): boolean {
  const b1 = poly1.getBounds();
  const b2 = poly2.getBounds();
  if (b1.right < b2.left || b1.left > b2.right || b1.bottom < b2.top || b1.top > b2.bottom) return false;
  const c1 = polygonCentroid(poly1);
  const c2 = polygonCentroid(poly2);
  return poly1.contains(c2.x, c2.y) || poly2.contains(c1.x, c1.y);
}

/**
 * Whether the selected wall check's cover module says the target is walled off. Only AutoCover is asked, when walls
 * block and cover counts: its total cover follows movement walls. Simple Cover's and Alternative Token Cover's total
 * cover follows sight (a curtain would block an attack, a window wouldn't), so with them, as without a module, midi's
 * movement wall rays decide (`coverVisible` undefined).
 */
export function computeWallBlockPreCheck(
  t1: Token.Implementation,
  t2: Token.Implementation,
  wallsBlock: boolean,
  includeCover: boolean
): { blocked: boolean, coverVisible?: boolean | undefined } {
  if (!wallsBlock || !includeCover || configSettings.optionalRules.wallsBlockRange !== "levelsautocover") return { blocked: false, coverVisible: undefined };
  const tier = autoCoverTier(t1, t2);
  // AutoCover not in use or failed: midi's own wall check
  if (!tier) return { blocked: false, coverVisible: undefined };
  return tier === "total" ? { blocked: true } : { blocked: false, coverVisible: true };
}

/** A point standing in for an attacker (a template's origin for Simple Cover) */
export type CoverPoint = { center: { x: number, y: number }, elevation?: number };

/** The target's test points for wall rays: its centre and two rings around it (as _canSenseModes) */
export function wallTestPoints(target: Token.Implementation): PIXI.Point[] {
  const centre = tokenSourceCenter(target);
  const t = Math.min(target.w, target.h) / 4;
  const edge = Math.min(target.w, target.h) / 2 - 2;
  const offsets = t > 0 ? [
    [0, 0], [-t, -t], [-t, t], [t, t], [t, -t], [-t, 0], [t, 0], [0, -t], [0, t],
    [-edge, -edge], [-edge, edge], [edge, edge], [edge, -edge], [-edge, 0], [edge, 0], [0, -edge], [0, edge]
  ] : [[0, 0]];
  return offsets.map(o => new PIXI.Point(centre.x + o[0], centre.y + o[1]));
}

/**
 * Total cover from walls: every line from the attacker (or the point it stands for, a template's origin) to the
 * target's test points crosses a wall that blocks movement, or a surface. Whatever the wall check setting.
 */
export function wallsGiveTotalCover(attacker: Token.Implementation | CoverPoint, target: Token.Implementation): boolean {
  if (attacker === target || !canvas?.scene) return false;
  const gridDistance = canvas.dimensions?.distance ?? 5;
  let centre: { x: number, y: number }, originElevation: number, originTopElevation: number, source: TokenDocument.Implementation | undefined;
  if (attacker instanceof foundry.canvas.placeables.Token) {
    if (attacker.actor && foundry.utils.getProperty(attacker.actor, `flags.${MODULE_ID}.ignoreWalls`)) return false;
    centre = tokenSourceCenter(attacker);
    originElevation = getTokenVisionElevation(attacker, "visionSourceHeight");
    originTopElevation = tokenSourceElevation(attacker) + Math.max(attacker.document.height ?? 1, attacker.document.width ?? 1) * gridDistance;
    source = attacker.document;
  } else {
    centre = attacker.center;
    originElevation = originTopElevation = attacker.elevation ?? 0;
  }
  const origin = new PIXI.Point(centre.x, centre.y);
  const destElevation = getTokenVisionElevation(target, "visionTargetHeight");
  const destTopElevation = tokenSourceElevation(target) + Math.min(target.document.height ?? 1, target.document.width ?? 1) * gridDistance;
  return wallTestPoints(target).every(point => checkWallCollision(origin, point, {
    source, wallsBlockRange: "center", originElevation, destElevation, originTopElevation, destTopElevation }));
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
    return measureGridPath(proxy, [p1, p2])?.distance ?? 0;
  }
  return measureGridPath(canvas.grid, [p1, p2])?.distance ?? 0;
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
  return convertLengthTo(value, units, sceneUnitDnd);
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
/**
 * The committed position of a token, ignoring any movement animation in flight.
 *
 * Both `token.center` and `token.document.x` interpolate while a move animates: measured during a
 * three-square move, document.x reported 3210, 3300 and 3410 before finally reaching 3500, and
 * `move()` itself resolves at 3410 — before arrival. `movement.state` reads "completed" throughout,
 * so it cannot be used as a gate either. Measuring range mid-animation therefore uses a square the
 * token merely passed through, and an attack made straight after moving is rejected as out of range
 * from the *old* position.
 *
 * `_source` holds the destination from the moment the database write lands and never interpolates,
 * which is why core reads it too - see Token#checkCollision, which derives its origin as
 * `getMovementOrigin(this.document._source)`.
 *
 * Note this is committed state, not intended state: in the few milliseconds between calling move()
 * and the write landing, `_source` is still the origin, and during an uncommitted drag preview it
 * remains the pre-drag position. Both are the correct answer to "where is this token now".
 *
 * Elevation, width and height animate the same way, and a background tab never applies the drawn
 * position at all: `token.x`/`token.y` read 0 there.
 */
export function tokenSourcePosition(tokenRef: any): { x: number, y: number, elevation: number, width: number, height: number } {
  const doc = getTokenDocument(tokenRef) ?? tokenRef;
  const source = doc?._source;
  const committed = (key: string, fallback: number): number =>
    Number.isFinite(source?.[key]) ? source[key] : (Number.isFinite(doc?.[key]) ? doc[key] : fallback);
  return { x: committed("x", 0), y: committed("y", 0), elevation: committed("elevation", 0), width: committed("width", 1), height: committed("height", 1) };
}

/** Centre of a token at its committed position. */
export function tokenSourceCenter(tokenRef: any): { x: number, y: number } {
  const doc = getTokenDocument(tokenRef) ?? tokenRef;
  const pos = tokenSourcePosition(doc);
  if (typeof doc?.getCenterPoint === "function") {
    try { return doc.getCenterPoint({ ...pos }); } catch { /* fall through */ }
  }
  const size = canvas?.dimensions?.size ?? 100;
  return { x: pos.x + (pos.width * size) / 2, y: pos.y + (pos.height * size) / 2 };
}

/** Elevation of a token at its committed position. */
export const tokenSourceElevation = (tokenRef: any): number => tokenSourcePosition(tokenRef).elevation;

/** The token whose space a token occupies: its mount's (followed to the outermost mount) under *Mounted creatures use their mount's space*. */
export function spaceToken(token: any): any {
  if (!configSettings.optionalRules.mountedUseMountSpace || !token?.document) return token;
  const seen = new Set<any>([token]);
  let current = token;
  for (let mount = mountOf(current); mount && !seen.has(mount) && seen.size < 5; mount = mountOf(current)) {
    seen.add(mount);
    current = mount;
  }
  return current;
}

function mountOf(token: any): any {
  const doc = token.document;
  const scene = doc.parent;
  const mountId = foundry.utils.getProperty(doc, `flags.${MODULE_ID}.mount`);
  if (mountId) return scene?.tokens.get(mountId)?.object ?? null;
  if (!game.modules?.get("Rideable")?.active) return null;
  const riding = foundry.utils.getProperty(doc, "flags.Rideable") as { RidingFlag?: boolean, GrappledFlag?: boolean, FamiliarRidingFlag?: boolean } | undefined;
  if (!riding?.RidingFlag || riding.GrappledFlag) return null;
  const mount = scene?.tokens.find((t: TokenDocument.Implementation) => (foundry.utils.getProperty(t, "flags.Rideable.RidersFlag") as string[] | undefined)?.includes(doc.id));
  // Rideable lets riders, but not familiars, move freely within a mount with inside movement
  if (!mount || (foundry.utils.getProperty(mount, "flags.Rideable.InsideMovementFlag") && !riding.FamiliarRidingFlag)) return null;
  return mount.object ?? null;
}

/**
 * Whether an attack is one the range rules bite on: a ranged attack, or a melee weapon being thrown.
 *
 * Shared so the caller deciding whether to check and the branch deciding what a failure means agree
 * about what counts. They did not, and a javelin fell through the gap in both.
 */
export function isRangeCheckable(activity: Activity): boolean {
  const actionType = activity?.actionType ?? "";
  if (["rwak", "rsak"].includes(actionType)) return true;
  if (!["mwak", "msak"].includes(actionType)) return false;
  // @ts-expect-error no dnd5e-types
  return !!activity?.item?.labels?.properties?.some((p: any) => p.abbr === "thr");
}

/**
 * The normal and long range of an activity, in the activity's own units.
 *
 * An activity that does not set its own range reports `range.value` as the furthest usable
 * distance — for a weapon, its long range — so reading that as the normal range makes the two equal
 * and leaves the long-range disadvantage unreachable: everything beyond normal range is also beyond
 * `range`, and the out-of-range test above it has already returned. Measured, no weapon in the game
 * was ever getting disadvantage past its short range, an archer included. The true pair survives on
 * the item.
 *
 * Spells are unaffected either way: a spell's own range is its real one and it has no long range,
 * so the derived value already agrees.
 */
export function activityRanges(activity: Activity): { normal: number, long: number } {
  const own: any = activity?.range ?? {};
  // An activity that overrides its range means it; the item's is no longer relevant.
  if (own.override) return { normal: (own.value || own.reach) || 0, long: Number(own.long) || 0 };
  // @ts-expect-error no dnd5e-types
  const item: any = activity?.item?.system?.range;
  const normal = Number(item?.value) || (own.value || own.reach) || 0;
  const long = Number(item?.long ?? own.long) || 0;
  return { normal, long };
}

/** Whether an activity's targets are in range: asks the range service's provider (midi's: midiActivityRange) */
export function checkActivityRange(activityIn: Activity, tokenRef: TokenOrDocument | string | undefined, targetsRef: Set<TokenOrDocument | string> | undefined, showWarning: boolean = true): RangeCheckResult {
  return checkRange(activityIn, tokenRef, targetsRef, showWarning);
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

/** A position to evaluate cover from, in scene pixels, as `TokenDocument#x`/`y` are. */
export type CoverPosition = { x: number, y: number, elevation?: number };

/** The targets an activity that needs targets it can see is used against that its token can't see */
export function unseenTargets(activity: Activity, token: TokenOrDocument | undefined, targets: Iterable<TokenOrDocument>): TokenOrDocument[] {
  if (!activity.midiProperties?.targetMustBeSeen || !token) return [];
  const tokenDocument = getTokenDocument(token);
  return [...targets].filter(target => getTokenDocument(target) !== tokenDocument && !canSee(token, target));
}

/** Warn about targets the activity needs to see and can't; false when *Targets you can see* is enforced and one isn't seen */
export function checkTargetsSeen(activity: Activity, token: TokenOrDocument | undefined, targets: Iterable<TokenOrDocument>): boolean {
  const mode = checkMechanic("targetMustBeSeen");
  if (!mode || mode === "nothing") return true;
  const unseen = unseenTargets(activity, token, targets);
  if (!unseen.length) return true;
  ui.notifications?.warn(i18nFormat("midi-qol.TargetNotSeen", {
    name: activity.item?.name ?? "", targets: unseen.map(target => getTokenPlayerName(target)).join(", ")
  }));
  return mode !== "enforce";
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
  try {
    return coverFor(attacker, target, { activity: activity instanceof Item ? undefined : activity }).bonus;
  } catch (err) {
    const message = "Error in getCoverBonus";
    error(message, err);
    TroubleShooter.recordError(err, message);
    return 0;
  }
}

/**
 * A view of a token as though it stood somewhere else.
 *
 * Every cover backend answers for a token at its current position, which is no help to anything
 * asking "what cover would the target have if I attacked from over there?" — a planner choosing
 * between squares, a ruler preview, a macro weighing a move. Moving the token to ask is not an
 * option: it is a document update, it is visible, and it is wrong if anything throws in between.
 *
 * So the token is presented at the position instead. Geometry is overridden and everything else —
 * actor, scene, flags, methods — forwards to the real token, because a backend may read any of it.
 */
export function tokenAtPosition(token: Token.Implementation, position: CoverPosition): Token.Implementation {
  const gridX = canvas?.grid?.sizeX ?? 100;
  const gridY = canvas?.grid?.sizeY ?? 100;
  const width = (token.document?.width ?? 1) * gridX;
  const height = (token.document?.height ?? 1) * gridY;
  const elevation = position.elevation ?? tokenSourceElevation(token);
  const center = { x: position.x + width / 2, y: position.y + height / 2 };

  let view: Token.Implementation;
  const documentView = new Proxy(token.document, {
    get(doc, key) {
      if (key === "x") return position.x;
      if (key === "y") return position.y;
      if (key === "elevation") return elevation;
      if (key === "object") return view;
      const value = Reflect.get(doc, key, doc);
      return typeof value === "function" ? value.bind(doc) : value;
    }
  });

  view = new Proxy(token, {
    get(tok, key) {
      switch (key) {
        case "x": return position.x;
        case "y": return position.y;
        case "w": return width;
        case "h": return height;
        case "center": return center;
        case "elevation": return elevation;
        case "document": return documentView;
        case "bounds": return new PIXI.Rectangle(position.x, position.y, width, height);
        case "getCenterPoint": return () => center;
      }
      const value = Reflect.get(tok, key, tok);
      return typeof value === "function" ? value.bind(tok) : value;
    }
  });
  return view;
}

/**
 * Returns the raw cover bonus from the configured cover module.
 * Does NOT check cover statuses, apply attack-specific reductions (sharpshooter, etc.),
 * or reconcile with status-based cover.
 *
 * `options.position` asks the question from a square the attacker is not standing on, in scene
 * pixels and measured from the token's top-left corner as `TokenDocument#x`/`y` are. The configured
 * cover backend still supplies the answer, so a caller planning a move gets the same number the
 * attack will later be resolved with rather than a second opinion of its own.
 */
type AutoCoverTier = "none" | "half" | "threeQuarters" | "total";
let autoCoverFailed = false;

/**
 * AutoCover's (levelsautocover 5.0.1+) cover tier from the attacker, or from `origin` (a template's), to the target:
 * undefined when AutoCover isn't in use or fails, so the caller carries on without it. A failure warns once.
 */
export function autoCoverTier(attacker: TokenOrDocument | undefined, target: TokenOrDocument, origin?: CoverPosition): AutoCoverTier | undefined {
  if (!installedModules.get("levelsautocover")) return undefined;
  const api = game.modules.get("levelsautocover")?.api;
  const targetDocument = getTokenDocument(target);
  const attackerDocument = getTokenDocument(attacker);
  if (!api?.computeCover || !targetDocument?.parent) return undefined;
  try {
    // A point source sits above its floor as AutoCover's own area cover places it
    const scene = targetDocument.parent;
    const source = origin
      ? api.area.pointSource(scene, { x: origin.x, y: origin.y,
        elevation: (origin.elevation ?? attackerDocument?.elevation ?? 0) + scene.grid.distance * (api.area.POINT_HEIGHT ?? 0.5) }, attackerDocument ?? null)
      : attackerDocument;
    if (!source) return undefined;
    const tier = api.computeCover(source, targetDocument)?.tier?.id;
    return tier === "none" || tier === "half" || tier === "threeQuarters" || tier === "total" ? tier : undefined;
  } catch (err) {
    if (!autoCoverFailed) {
      autoCoverFailed = true;
      console.warn("midi-qol | AutoCover's cover check failed: midi carries on without AutoCover's cover", err);
      TroubleShooter.recordError(err instanceof Error ? err : new Error(String(err)), "AutoCover cover check");
    }
    return undefined;
  }
}

export function computeCoverBonus(attackerIn: TokenOrDocument | undefined, targetIn: TokenOrDocument, activity?: Activity,
  options: { position?: CoverPosition, origin?: CoverPosition } = {}): number {
  let attacker = getTokenDocument(attackerIn);
  const target = getTokenDocument(targetIn);
  // As if the attacker stood at `position`: a document at that place, whose canvas token is there too
  if (attacker?.object && options.position) attacker = tokenAtPosition(attacker.object, options.position).document;
  if (activity instanceof Item) {
    activity = undefined;
    foundry.utils.logCompatibilityWarning("computeCoverBonus(attacker, target, item) is deprecated in favor of computeCoverBonus(attacker, target, activity)");
  }
  if (!target) return 0;
  try {
    // The cover service's active provider (services/cover.ts), chosen by the Cover Calculation setting
    return coverBetween({ attacker: attacker ?? undefined, target, activity, origin: options.origin }).bonus;
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
  targetACMod: number;          // From targetDescriptors
}

/**
 * Compute the effective AC for a target, reconciling status-based cover with module-computed
 * cover (status acts as minimum), applying attack-specific reductions (ignoreFullCover,
 * sharpShooter, spellSniper, ignoreCover), and incorporating targetACMod.
 */
export function computeTargetAC(
  attacker: Token,
  target: Token,
  activity: Activity | undefined,
  options: {
    ignoreCover?: boolean;
    targetACMod?: number;
  } = {}
): TargetACResult {
  const targetActor = target.actor;
  const item = activity?.item;
  const { ignoreCover = false, targetACMod = 0 } = options;

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
    let enabled = evalAllConditions(attacker.actor, "flags.dnd5e.sharpShooter", conditionData);
    enabled ||= evalAllConditions(attacker.actor, `flags.${MODULE_ID}.sharpShooter`, conditionData);
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
    const enabled: boolean | undefined = evalAllConditions(attacker.actor, "flags.dnd5e.spellSniper", conditionData);
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

/** Consumption deltas from a ChatMessage (`system.deltas`) or a messageConfig (`data.system.deltas`). */
export function getConsumptionData(source: any): any {
  if (!source) return undefined;
  return source.system?.deltas ?? source.data?.system?.deltas;
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

/**
 * The roll type of a chat message, derived from dnd5e 6's message sub-type and system data, in the
 * vocabulary midi's callers compare against ("save", "death", "skill", "tool", "ability", ...).
 * Accepts a document or raw create data.
 */
export function dnd5eRollType(source: any): string | undefined {
  switch (source?.type) {
    // 6.0 files death saves under "save" and distinguishes them by system.type; the old vocabulary
    // gave them their own string, and midi's callers rely on telling them apart.
    case "save": return foundry.utils.getProperty(source, "system.type") === "death" ? "death" : "save";
    // 6.0 posts initiative as a check message
    case "check": if (foundry.utils.getProperty(source, "system.type") === "initiative") return "initiative";
      return foundry.utils.getProperty(source, "system.tool") ? "tool"
      : foundry.utils.getProperty(source, "system.skill") ? "skill" : "ability";
    case "healing": return "healing";
    case "attack":
    case "damage": return source.type;
    default: return undefined;
  }
}

/** Whether a message is one of dnd5e's roll cards rather than an item/usage card. */
/** What a chat-card save request asks for: the roll that answers it */
export type SaveRequestKind = { rollType: string, abilities: string[], skills: string[], tools: string[] };

/**
 * Whether a dnd5e roll message answers a save request: the right kind of roll, and one of the requested abilities, skills
 * or tools (a choice allows any of them). A skill or tool is matched by itself: dnd5e lets it be rolled with another ability.
 */
export function rollAnswersRequest(message: ChatMessage.Implementation, kind: SaveRequestKind): boolean {
  const rolled = dnd5eRollType(message);
  const oneOf = (list: string[], field: string) => {
    const id = foundry.utils.getProperty(message, `system.${field}`);
    return !list.length || (typeof id === "string" && list.includes(id));
  };
  switch (kind.rollType) {
    case "save": return rolled === "save" && oneOf(kind.abilities, "ability");
    case "check": return rolled === "ability" && oneOf(kind.abilities, "ability");
    case "skill": return rolled === "skill" && oneOf(kind.skills, "skill");
    case "tool": return rolled === "tool" && oneOf(kind.tools, "tool");
    default: return rolled !== undefined && rolled !== "initiative";
  }
}

export function isDnd5eRollMessage(source: any): boolean {
  return dnd5eRollType(source) !== undefined;
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
  if (checkGM && user?.isGM) return getTokenName(token);
  return hiddenTokenName(token, user) ?? getTokenName(token);
}

/**
 * The name the current user is shown for a token (or an actor's token) on a card: as stored for the GM and the
 * token's owners, otherwise as the name-hiding module (Anonymous, Hide NPC Names) or "Hide NPC names" has it.
 */
export function displayTokenName(uuid: string | undefined, name: string): string {
  if (game.user?.isGM || !uuid) return name;
  const document = fromUuidSync(uuid);
  const token = document instanceof TokenDocument ? document
    : document instanceof Actor ? (document.token ?? document.getActiveTokens(false, true)[0]) : null;
  if (!token || token.actor?.isOwner) return name;
  return hiddenTokenName(token) ?? name;
}

/** The name the current user is shown for a token, or undefined if it is not hidden (the tokenNames service). */
function hiddenTokenName(token: TokenOrDocument, user: User.Implementation | null | undefined = game.user): string | undefined {
  return shownTokenName(token, user);
}

export function getSpeaker(actor: Actor.Implementation) {
  const speaker = speakerFor({ actor });
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
    if (!(token instanceof foundry.canvas.placeables.Token)) { throw new Error("find nearby token is not of type token or the token uuid is invalid") };
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

export async function removeInvisibleCondition(tokenRef?: TokenOrDocument | string) {
  const token = getToken(tokenRef);
  if (!token) return;

  await removeTokenConditionEffect(token, i18n(`midi-qol.invisible`) ?? "");

  const invisId = CONFIG.specialStatusEffects.INVISIBLE ?? "invisible";
  if (CONFIG.statusEffects.find(se => se.id === invisId)) {
    await toggleStatus(token.actor, invisId, { active: false })
  }
  if (debugEnabled > 0) log(`Invisibility removed for ${token.name}`)
}

export async function removeHiddenCondition(tokenRef?: TokenOrDocument | string) {
  const token = getToken(tokenRef);
  if (!token) return;
  if (!token.actor) return
  if (CONFIG.statusEffects.find(se => se.id === "hidden")) {
    await toggleStatus(token.actor, "hidden", { active: false });
  }
  if (CONFIG.statusEffects.find(se => se.id === "hiding")) {
    await toggleStatus(token.actor, "hiding", { active: false });
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
  const named = Array.from(token.actor?.allApplicableEffects() ?? []).filter(ef => ef.name === condition);
  const hasEffect = named.find(ef => ef.active) ?? named[0];
  if (hasEffect) await deleteAppliedEffects(token.actor!, [hasEffect], { "expiry-reason": `midi-qol:removeTokenCondition:${condition}` });
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
  // Judged with 1Attack: every path that expires it has settled the hits. A miss is an attack that hits no target.
  const expireMiss = expireAttack && !this.effectsAlreadyExpired.includes("1Miss");
  const missed = !!this.activity?.hasAttack && this.targets.count > 0 && !this.hitTargets.count && !this.hitTargetsEC?.count;
  const expireDamage = effectsToExpire.includes("DamageDealt") && !this.effectsAlreadyExpired.includes("DamageDealt");
  const expireInitiative = effectsToExpire.includes("Initiative") && !this.effectsAlreadyExpired.includes("Initiative");
  //
  expireAnyAction ||= expireBonusAction || expireReaction || expireTurnAction;
  if (expireAnyAction) effectsToExpire.push("1Action");
  // Recorded as done with 1Action, or a later call in the same workflow expires them again
  if (expireBonusAction) effectsToExpire.push("Bonus Action");
  if (expireReaction) effectsToExpire.push("Reaction");
  if (expireTurnAction) effectsToExpire.push("Turn Action");
  if (expireMiss) effectsToExpire.push("1Miss");
  // expire any effects on the actor that require it
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
      (expireHit && this.activity?.hasAttack && specialDuration.includes("1Hit") && this.hitTargets.count > 0) ||
      (expireHit && this.activity?.hasAttack && specialDuration.includes(`1Hit:${this.activity?.actionType}`) && this.hitTargets.count > 0) ||
      (expireMiss && missed && specialDuration.includes("1Miss")) ||
      (expireMiss && missed && specialDuration.includes(`1Miss:${this.activity?.actionType}`)) ||
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
    // DAE offered "isConcentrationSaveFail" (no -ure) as the dropdown label until dae 14.0.14, so it
    // never matched here. Effects saved with it still exist in worlds.
    if (success === false && specialDuration.includes(`is${rollType}Fail`)) return true;
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
/** The members that can be targets (with an actor, not a group…): every member of a token set, with a canvas token or not */
export function validTargetTokens(tokens?: Iterable<TokenOrDocument>): TokenDocumentSet {
  const members = tokens instanceof TokenDocumentSet ? tokens.documents : [...(tokens ?? [])];
  return new TokenDocumentSet(members.filter(token => !!token?.actor && isValidTarget(token)));
}

/**
 * The user's targets, keeping those of `current` with no canvas token (on another level, reached through an opening in
 * a floor): they can't be the user's targets, so re-reading the user's must not drop them.
 */
export function userTargetsKeepingUndrawn(current?: Iterable<TokenOrDocument>): Set<TokenOrDocument> {
  // By document: a token on another scene can share a canvas token's id (a copied scene)
  // A token deleted since is not kept: only midi's own (no id) and those still in their scene
  const exists = (document: TokenDocument.Implementation) => !document.id || document.parent?.tokens.get(document.id) === document;
  const notDrawn = validTargetTokens(current).documents.filter(document => exists(document) && canvas?.tokens?.get(document.id!)?.document !== document);
  return new Set<TokenOrDocument>([...(game.user?.targets ?? []), ...notDrawn]);
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
  countdown: DialogCountdown;
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
    flagOwners?: Record<string, any>,
    /** rollBonuses contributors' optional bonuses, shown after the flag buttons */
    candidates?: OfferedBonus[],
    onCandidate?: (dialog: RollModifyDialog, button: { candidate: OfferedBonus }) => Promise<void>,
    /** Asked through the request core (M5b): the requester's deadline is shown (its pause asks the requester), and the dialog closes when it is answered for the player */
    request?: IncomingRequest
  }

  constructor(data) {
    super(data);
    this.data = data;
    this.timeRemaining = this.data.timeout;
    this.rollExpanded = false;
    if (!data.rollMode) data.rollMode = safeGetGameSetting("core", "messageMode");
    // The request's deadline when asked through the request core, else this dialog's own
    this.countdown = data.request?.countdown() ?? new DialogCountdown({ seconds: this.data.timeout ?? 0, onExpire: () => this.close() });
    data.request?.onSettled(() => { void this.close(); });
  }

  static PARTS = {
    dialog: {
      id: "dialog-optional",
      classes: ["dialog", "midi-qol", "optional"],
      template: "modules/midi-qol/templates/dialog.hbs"
    }
  };

  static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions = {
    window: {
      resizable: true
    },
    position: {
      height: "auto" as "auto",
      width: 400
    }
  };

  get title() {
    return this.data.title ?? "Dialog";
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
    this.countdown.attach(this.element);
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
    if (this.data.flags.length === 0 && !this.data.candidates?.length) this.close();
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
    for (const candidate of this.data.candidates ?? []) {
      const detail = candidate.effect.kind === "add" ? ` (${candidate.effect.formula})` : candidate.effect.kind === "replace" ? ` (${candidate.effect.formula})` : "";
      this.data.buttons[foundry.utils.randomID()] = {
        icon: '<i class="fas fa-dice-d20"></i>',
        label: `${candidate.label}${detail}`,
        key: candidate.id,
        candidate,
        callback: this.data.onCandidate
      };
    }
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
    try {
      if (button.callback) {
        await button.callback(this, button);
        // await this.getData({}; Render will do a get data, doing it twice breaks the button data?
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
    this.countdown.stop();
    if (this.data.close) this.data.close();
    $(document).off('keydown.chooseDefault');
    return super.close();
  }
}

// v14's ChatMessage.applyMode takes message-mode strings (public/gm/blind/self/ic), replacing the
// deprecated ChatMessage.applyRollMode + legacy roll-mode strings. midi still receives legacy
// rollMode values from dnd5e/core, so map them across using literals (not the deprecated
// CONST.DICE_ROLL_MODES). undefined and "roll" fall through so applyMode uses the core messageMode default.
export function rollModeToMessageMode(rollMode?: string): string | undefined {
  switch (rollMode) {
    case "publicroll": return "public";
    case "gmroll": return "gm";
    case "blindroll": return "blind";
    case "selfroll": return "self";
    case "roll": return undefined;
    default: return rollMode;
  }
}

// Normalize any stored/legacy rollMode to a v14 message mode for INTERNAL use. Legacy strings map
// across; "roll"/undefined → the core messageMode default; v14 values pass through unchanged.
/** ChatMessage.getSpeaker for any actor or token: Foundry handles unsaved ones, fvtt-types only declares stored documents. */
export function speakerFor(options: { actor?: Actor.Implementation | null, token?: TokenDocument.Implementation | Token.Implementation | null, scene?: Scene.Implementation | null, alias?: string }): ChatMessage.SpeakerData {
  // @ts-expect-error fvtt-types: getSpeaker accepts unsaved documents
  return ChatMessage.implementation.getSpeaker(options);
}

/** Whether a message mode is one of Foundry 14's (CONFIG.ChatMessage.modes); a legacy roll-mode name is not. */
export function isMessageMode(mode: string | undefined): mode is ChatMessage.Mode {
  return !!mode && mode in CONFIG.ChatMessage.modes;
}

export function toMessageMode(mode?: string): string {
  if (mode === "roll" || mode === undefined || mode === "default") return (safeGetGameSetting("core", "messageMode") as string) ?? "public";
  return rollModeToMessageMode(mode) ?? "public";
}

// Translate a v14 message mode to the legacy roll-mode vocabulary, ONLY for modules that haven't
// migrated (e.g. monks-tokenbar, whose public is "roll"). Accepts legacy input too (idempotent).
export function toLegacyRollMode(mode?: string): string {
  switch (mode) {
    case "public": case "ic": case "publicroll": case "roll": return "roll";
    case "gm": case "gmroll": return "gmroll";
    case "blind": case "blindroll": return "blindroll";
    case "self": case "selfroll": return "selfroll";
    default: return "roll";
  }
}
// fvtt-types has not yet added v14's ChatMessage.applyMode static.
type ChatMessageWithApplyMode = typeof ChatMessage & {
  applyMode(chatData: ChatMessage.CreateData, mode?: string): ChatMessage.CreateData;
};

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
  // The roll's own message data, less what would make this message that roll's (a save's type and its card link)
  const { type: _type, system: _system, ...messageData } = options.messageData ?? {};
  const newRollHTML = await midiRenderRoll(newRoll);
  const originalRollHTML = await midiRenderRoll(originalRoll);
  const chatData: any = foundry.utils.mergeObject(messageData, {
    flavor: `${title}`,
    speaker: speakerFor({ actor: actor }),
    content: `${originalRollHTML}<br>${newRollHTML}`,
    whisper: [player?.id ?? ""],
    rolls: [originalRoll, newRoll],
    sound: CONFIG.sounds.dice,
  }, { inplace: false });
  // @ts-expect-error originalRoll.options.rollMode is not typed
  const rawRollMode: string | undefined = originalRoll.options.rollMode || rollMode;
  (ChatMessage as ChatMessageWithApplyMode).applyMode(chatData, rollModeToMessageMode(rawRollMode));
  foundry.utils.setProperty(newRoll, `flags.${MODULE_ID}.chatMessageShown`, true);
  // A roll made for a use card is shown on the card, beside the roll it changed, to those its roll mode allows
  const card = options.card instanceof ChatMessage ? options.card : options.card ? fromUuidSync(options.card, { strict: false }) : undefined;
  if (card instanceof ChatMessage) {
    const users = game.users?.contents ?? [];
    const allowed = chatData.blind ? users.filter(u => u.isGM) : chatData.whisper?.length ? users.filter(u => chatData.whisper.includes(u.id)) : users;
    const anchor = options.anchor ?? "saves";
    const whisper = allowed.length === users.length ? [] : allowed.map(u => u.id!);
    // The card shows the roll itself: the note says what changed it, each total expanding to its roll's dice. A save's
    // names its target, so the card shows each viewer as much of it as of that target's save (applySaveVisibility).
    const bonuses = foundry.utils.escapeHTML((options.bonusLabels ?? []).join(", ") || title);
    let html = `<strong>${bonuses}</strong>: ${originalRoll.toAnchor().outerHTML} → ${newRoll.toAnchor().outerHTML}`;
    const targetUuid = anchor === "saves" ? (actor?.token ?? actor?.getActiveTokens(false, true)[0])?.uuid : undefined;
    if (targetUuid) html = `<span data-midi-save-target="${targetUuid}">${html}</span>`;
    const note = await addCardNote(card, html, { anchor, whisper });
    if (note) return note;
  }
  return await ChatMessage.create<ChatMessage.CreateData>(chatData);
}

/** The optional AC bonus keys: added to the target's AC, `acOnAttack` when attacked, `acOnHit` once the attack hits */
const OPTIONAL_AC_KEYS = ["acOnAttack", "acOnHit"];
/** The window the bonus prompt service picks (the classic dialog when none is registered). */
function openBonusPrompt(data: object): { render(options?: object): unknown } {
  return bonusPromptService?.get()?.open(data) ?? new RollModifyDialog(data);
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
  if (!roll) return undefined;
  // rollBonuses contributors' candidates for this roll and phase (options.bonusQuery/bonusPhase); flags keep their own path
  const bonusQuery: RollBonusQuery | undefined = options.bonusQuery;
  const bonusPhase: BonusPhase = options.bonusPhase ?? "preResult";
  let optionalCandidates: OfferedBonus[] = (options.candidates ?? []).filter((c: OfferedBonus) => c.optional);
  const automaticCandidates: OfferedBonus[] = (options.candidates ?? []).filter((c: OfferedBonus) => !c.optional);
  if (this instanceof Workflow) options.card ??= this.itemCardUuid;
  options.anchor ??= rollType === "attackRoll" ? "attack" : rollType === "damageRoll" ? "damage" : "saves";
  let newRoll = roll;
  let originalRoll = roll;
  let rollHTML = await midiRenderRoll(roll);
  const player = playerForActor(this.actor);
  // Map full flag path -> owning document (item enchantment) for flags whose data
  // does not live on the actor. Defaults to actor when not present in the map.
  const flagOwners: Record<string, any> = options.flagOwners ?? {};
  const ownerOf = (flagName: string): any => flagOwners[flagName] ?? this.actor;
  const bonusLabel = (flagName: string): string => (foundry.utils.getProperty(ownerOf(flagName) ?? {}, `${flagName}.label`) as string) || flagName.split(".").at(-1) || flagName;
  // The bonuses applied, by name, for the before and after display
  const usedLabels: string[] = options.bonusLabels = [];
  // A bonus's terms are named after it, so the roll's breakdown says where they came from
  const nameTerms = (bonusRoll: Roll, flagName: string) => {
    for (const term of bonusRoll.terms) if (!(term instanceof foundry.dice.terms.OperatorTerm)) term.options.flavor ||= bonusLabel(flagName);
  };

  const callback = async (dialog, button) => {
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
    // const rollMode = foundry.utils.getProperty(buttonOwner ?? {}, button.key)?.rollMode ?? safeGetGameSetting("core", "messageMode");
    // @ts-expect-error no dnd5e-types
    let rollMode = roll.options.rollMode;
    rollMode = (foundry.utils.getProperty(buttonOwner ?? {}, button.key) as any)?.rollMode ?? rollMode ?? safeGetGameSetting("core", "messageMode");
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
        if (await DialogV2.confirm({
          window: { title: i18n("midi-qol.ConfirmReroll.Title") },
          content: `<div class="midi-qol-confirm-reroll"><label>${i18n("midi-qol.ConfirmReroll.Original")}</label>${rollHTML}<label>${i18n("midi-qol.ConfirmReroll.New")}</label>${newRollHTML}</div>`,
          yes: { default: true },
          no: { default: false }
        }))
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
        } else if (OPTIONAL_AC_KEYS.includes(flagSelector)) {
          let rollOptions = foundry.utils.duplicate(roll!.options);
          //@ts-expect-error
          rollOptions.configured = false;
          //@ts-expect-error D20Roll
          newRoll = CONFIG.Dice.D20Roll.fromRoll(roll);
          const tempRoll = new Roll(`${button.value}`, { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll!.data }, rollOptions);
          await tempRoll.evaluate();
          setRollOperatorEvaluated(tempRoll);
          if (showDiceSoNice) await displayDSNForRoll(tempRoll, rollType, rollMode, undefined, this.actor);
          nameTerms(tempRoll, button.key);
          newRoll = addRollTo(roll!, tempRoll);
        } else {
          //@ts-expect-error
          newRoll = CONFIG.Dice.D20Roll.fromRoll(roll);
          const tempRoll = await (new Roll(`${button.value}`, { ...((this.activity ?? this.item ?? this.actor)?.getRollData() ?? {}), ...roll!.data })).roll();
          if (showDiceSoNice) await displayDSNForRoll(tempRoll, rollType, rollMode, undefined, this.actor);
          nameTerms(tempRoll, button.key);
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
      (ChatMessage as ChatMessageWithApplyMode).applyMode(chatData, rollModeToMessageMode(rollMode));
      chatMessage = await ChatMessage.create(chatData);
    }

    await removeEffectGranting(this.actor, button.key);
    roll = newRoll;
    const optionalsUsed: string[] = foundry.utils.getProperty(roll, `flags.${MODULE_ID}.optionalsUsed`) as string[] ?? [];
    optionalsUsed.push(`${button.key}.${flagSelector}`);
    foundry.utils.setProperty(roll, `flags.${MODULE_ID}.optionalsUsed`, optionalsUsed);
    usedLabels.push(bonusLabel(button.key));
    if (dialog) {
      validFlags = validFlags.filter(bf => bf !== button.key);
      if (validFlags.length === 0 && optionalCandidates.length === 0) {
        dialog?.close();
        return;
      }

      const newRollHTML = /*reRoll ? await midiRenderRoll(reRoll) :*/ await midiRenderRoll(newRoll);
      dialog.data.flags = validFlags;
      dialog.data.currentRoll = newRoll;
      if (game.user?.isGM) {
        dialog.data.content = newRollHTML;
      } else {
        if (["public", "gm", "self"].includes(toMessageMode(rollMode))) dialog.data.content = newRollHTML;
        else dialog.data.content = "Hidden Roll";
      }
      dialog.render(true);
      // dialog.close();
    }
    if (chatMessage) unTimedExecuteAsGM("addUndoChatCards", { id: undoId, chatCardUuids: [(await chatMessage).uuid] });
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
      target: this.targets?.documents[0] && hookTarget(this.targets.documents[0]),
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
    // const rollMode = foundry.utils.getProperty(this.actor ?? {}, lastForceFlag)?.rollMode ?? options.rollMode ?? safeGetGameSetting("core", "messageMode");
    //@ts-expect-error
    const rollMode = foundry.utils.getProperty(ownerOf(lastForceFlag) ?? {}, lastForceFlag)?.rollMode ?? oldRoll.options.rollMode ?? safeGetGameSetting("core", "messageMode");
    const card = await displayBeforeAfterRolls({ originalRoll: oldRoll, newRoll: roll, rollMode, title, player, options, actor: this.actor });
    if (card?.uuid && this instanceof Workflow && configSettings.undoWorkflow) await unTimedExecuteAsGM("addUndoChatCards", { id: this.id, chatCardUuids: [card.uuid] });
  }
  const bonusRollData = (this.activity ?? this.item ?? this.actor)?.getRollData() ?? {};
  const candidateContext = (current: Roll) => ({ query: bonusQuery!, phase: bonusPhase, roll: current });
  // What chosen bonuses have spent this roll: a later one drawing on the same pool must still fit
  let bonusSpent: BonusCost = {};
  const stillAffordable = () => { optionalCandidates = optionalCandidates.filter(c => canAffordBonus(c.cost, bonusSpent)); };
  if (bonusQuery && automaticCandidates.length) {
    const before = roll;
    for (const candidate of automaticCandidates) {
      if (!canAffordBonus(candidate.cost, bonusSpent)) continue;
      roll = newRoll = await applyOfferedBonus(candidate, candidateContext(roll), bonusRollData);
      bonusSpent = addBonusCosts(bonusSpent, candidate.cost);
      usedLabels.push(candidate.label);
    }
    stillAffordable();
    if (showRoll && lastForceFlag === "" && roll !== before) {
      DSNMarkDiceDisplayed(roll);
      //@ts-expect-error
      const card = await displayBeforeAfterRolls({ originalRoll: before, newRoll: roll, rollMode: before.options.rollMode ?? safeGetGameSetting("core", "messageMode"), title, player, options, actor: this.actor });
      if (card?.uuid && this instanceof Workflow && configSettings.undoWorkflow) await unTimedExecuteAsGM("addUndoChatCards", { id: this.id, chatCardUuids: [card.uuid] });
    }
  }
  if (!bonusQuery) optionalCandidates = [];
  if (validFlags.length === 0 && optionalCandidates.length === 0) return roll;
  const onCandidate = async (dialog: RollModifyDialog, button: { candidate: OfferedBonus }) => {
    const candidate = button.candidate;
    newRoll = await applyOfferedBonus(candidate, candidateContext(newRoll), bonusRollData);
    roll = newRoll;
    usedLabels.push(candidate.label);
    bonusSpent = addBonusCosts(bonusSpent, candidate.cost);
    optionalCandidates = optionalCandidates.filter(c => c.id !== candidate.id);
    stillAffordable();
    dialog.data.candidates = optionalCandidates;
    if (validFlags.length === 0 && optionalCandidates.length === 0) {
      dialog.close();
      return;
    }
    const newRollHTML = await midiRenderRoll(newRoll);
    const rollMode = options?.rollMode ?? safeGetGameSetting("core", "messageMode");
    dialog.data.currentRoll = newRoll;
    dialog.data.content = game.user?.isGM || ["public", "gm", "self"].includes(toMessageMode(rollMode)) ? newRollHTML : "Hidden Roll";
    dialog.render(true);
  };
  let timeout = options.timeout ?? configSettings.reactionTimeout ?? defaultTimeout;
  // Inside a roll answering a request (a player's requested save): the requester holds the decision, on its deadline and
  // with the GM's skip (lib/bonusDecisions.ts)
  const decision = !options.request && options.withinRequest
    ? await askBonusDecision(options.withinRequest, { actorUuid: this.actor?.uuid, tokenUuid: (this.actor?.token ?? this.actor?.getActiveTokens(false, true)[0])?.uuid, label: title })
    : undefined;
  const request: IncomingRequest | undefined = options.request ?? decision?.incoming;
  const chosen = new Promise<Roll>((resolve, reject) => {
    async function onClose() {
      // The original roll is dsn displayed before the bonus dialog is called so mark it as displayed
      DSNMarkDiceDisplayed(originalRoll);
      // The new roll has had dsn display done for each bonus term/reroll so mark it as displayed
      DSNMarkDiceDisplayed(newRoll);

      if (showRoll && newRoll !== originalRoll) {
        //@ts-expect-error
        const card = await displayBeforeAfterRolls({ originalRoll, newRoll, rollMode: originalRoll.options.rollMode, title, player, options, actor: this.actor });
        if (card?.uuid && this instanceof Workflow && configSettings.undoWorkflow) await unTimedExecuteAsGM("addUndoChatCards", { id: this.id, chatCardUuids: [card.uuid] });
      }
      resolve(newRoll)
    }

    let content: string;
    let rollMode: any = options?.rollMode ?? safeGetGameSetting("core", "messageMode");
    if (game.user?.isGM) {
      content = rollHTML;
    } else {
      if (["public", "gm", "self"].includes(toMessageMode(rollMode))) content = rollHTML;
      else content = "Hidden Roll";
    }
    openBonusPrompt(
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
        flagOwners,
        candidates: optionalCandidates,
        onCandidate,
        request
      }).render({ force: true });
  });
  return chosen.finally(() => decision?.finish());
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
  // @ts-expect-error fvtt-types v14 ActiveEffect
  const effect = actor.appliedEffects.find(ef => ef.system.changes.some(c => c.key.includes(changeKey)))
  if (effect === undefined) return;
  const effectData = effect.toObject();

  const count = effectData.system.changes.find(c => c.key.includes(changeKey) && c.key.endsWith(".count"));
  const countAlt = effectData.system.changes.find(c => c.key.includes(changeKey) && c.key.endsWith(".countAlt"));
  if (!count) {
    return expireEffects(actor, [effect], { "expiry-reason": "midi-qol:optionalConsumed" })
  }
  // The other count's reaction or bonus action is used even when this use ends the effect
  const useActions = async () => {
    if (count.value === "reaction" || countAlt?.value === "reaction") await setReactionUsed(actor);
    if (count.value === "bonusAction" || countAlt?.value === "bonusAction") await setBonusActionUsed(actor);
  };
  if (Number.isNumeric(count.value) || Number.isNumeric(countAlt?.value)) {
    if (Number(count.value) <= 1 || Number(countAlt?.value) <= 1) {
      await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:optionalConsumed" });
      return useActions();
    } else if (Number.isNumeric(count.value)) {
      count.value = `${Number(count.value) - 1}`; // must be a string
    } else if (Number.isNumeric(countAlt?.value)) {
      countAlt!.value = `${Number(countAlt!.value) - 1}`; // must be a string
    }
    // @ts-expect-error fvtt-types v14 ActiveEffect
    await effect.update({ "system.changes": effectData.system.changes });
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
  // Consume one charge of an @field. A value dnd5e derives from a stored `spent` (legendary resistances and actions)
  // is consumed through the `spent`: writing the derived value is dropped.
  const consumeField = (field: string) => {
    let key = field.slice(1);
    if (key.startsWith("system.")) key = key.replace("system.", "");
    const charges = foundry.utils.getProperty(actor?.system ?? {}, key) as number;
    if (!charges) return;
    const spentKey = key.replace(/\.value$/, ".spent");
    const spent = spentKey !== key ? foundry.utils.getProperty(actor?._source.system ?? {}, spentKey) : undefined;
    if (typeof spent === "number") actorUpdates[`system.${spentKey}`] = spent + 1;
    else actorUpdates[`system.${key}`] = charges - 1;
  };
  if (typeof count.value === "string" && count.value.startsWith("@")) consumeField(count.value);
  if (typeof countAlt?.value === "string" && countAlt.value.startsWith("@")) consumeField(countAlt.value);

  if (["turn", "each-round", "each-turn"].includes(count.value)) {
    actorUpdates[`${changeKey}.used`] = game.combat?.uuid;
  }
  if (["turn", "each-round", "each-turn"].includes(countAlt?.value ?? "")) {
    actorUpdates[`${changeKey}.used`] = game.combat?.uuid;
  }
  if (!foundry.utils.isEmpty(actorUpdates)) await actor.update(actorUpdates);

  await useActions();
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

export function maxCastLevel(actor: Actor.Implementation) {
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

/** The optional AC bonus key a reaction phase offers */
const optionalACKey = (triggerType: string): "acOnAttack" | "acOnHit" | undefined =>
  triggerType === "reactionattacked" ? "acOnAttack" : triggerType === "reaction" ? "acOnHit" : undefined;

/** rollBonuses contributors' AC bonuses for a defender: acOnAttack before the attack's result, acOnHit after a hit. */
async function acBonusCandidates(actor: Actor.Implementation, tokenUuid: string | undefined, triggerTokenUuid: string | null | undefined,
  triggerType: string, acRoll: Roll, options: any = {}): Promise<{ query: RollBonusQuery, phase: BonusPhase, candidates: OfferedBonus[] } | undefined> {
  const acKey = optionalACKey(triggerType);
  if (!acKey) return undefined;
  const phase: BonusPhase = acKey === "acOnAttack" ? "preResult" : "postResult";
  const query: RollBonusQuery = {
    kind: "ac", actor, token: tokenUuid ? getTokenDocument(tokenUuid) : undefined,
    target: triggerTokenUuid ? getTokenDocument(triggerTokenUuid) : undefined,
    workflow: options.workflow instanceof Workflow ? options.workflow : undefined, activity: options.activity, item: options.item
  };
  return { query, phase, candidates: await collectBonusCandidates(query, phase, acRoll) };
}

export async function doReactions(targetRef: TokenOrDocument | string, triggerTokenRef: string | null | undefined, triggeringRoll: Roll | null | undefined, triggerType: string, options: any = {}): Promise<{ name?: string, uuid?: string, ac?: number, itemName?: string }> {
  const triggerTokenUuid = triggerTokenRef ?? undefined;
  const target = getToken(targetRef);
  try {
    const noResult = { name: undefined, uuid: undefined, ac: undefined };
    if (!target) return noResult;
    if (!target.actor || !target.actor.flags) return noResult;

    if (checkIncapacitated(target.actor, debugEnabled > 0, false)) return noResult;
    if (hasNoReactionsMarker(target.actor)) return noResult;
    let player = playerFor(getTokenDocument(target));
    const usedReaction = hasUsedReaction(target.actor);
    if (getReactionSetting(player) === "none") return noResult;
    if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
    if (!player) return noResult;
    // enableNotifications(false);
    let reactions: ReactionItem[] = [];
    let reactionCount = 0;
    let reactionActivityList: ReactionItemReference[] = [];
    try {
      // The reactions service's contributors (midi's own: services/reactions/provider.ts), each candidate once, only
      // those that could change the result
      const found = await collectReactions({ workflow: options.workflow, target: target.document, actor: target.actor, triggerType, trigger: reactionTriggerLabelFor(triggerType), triggeringRoll, usedReaction, options });
      for (const { candidate } of found) {
        const activity = fromUuidSync(candidate.activityUuid, { strict: false }) as unknown as Activity | null;
        if (activity) reactions.push(activity);
      }
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
          const acKey = optionalACKey(triggerType);
          if (!(acKey && midiFlags?.optional?.[flag][acKey])) return false;
          if (!midiFlags?.optional[flag].count) return true;
          return getOptionalCountRemainingShortFlag(target.actor!, flag) > 0;
        }).length;
      // @ts-expect-error no dnd5e-types
      const acNow = await new Roll(`${target.actor.system.attributes.ac.value}`).roll();
      reactionCount += (await acBonusCandidates(target.actor, getTokenDocument(target)?.uuid ?? undefined, triggerTokenRef, triggerType, acNow, options))?.candidates.length ?? 0;
    }

    if (reactionCount <= 0) return noResult;
    const workflow: Workflow | undefined = options.workflow ?? Workflow.workflowFor(options?.activity);
    // The reacting player sees the card as it is now
    await workflow?.flushCardWrites();

    let chatMessage: ChatMessage.Implementation | undefined;
    const reactionFlavor = game.i18n?.format(reactionPromptFor(triggerType), { itemName: (options.item?.name ?? "unknown"), actorName: target.name });
    const chatData: ChatMessage.CreateData = {
      content: reactionFlavor,
      whisper: [player.id]
    };

    if (configSettings.showReactionChatMessage) {
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

    // Asked through the request core (lib/requests.ts): its deadline is the reaction timeout, a claim (a reaction chosen)
    // stops it, a GM answers from the player list, a time-out or disconnect is "no reaction"
    const reactingUser = player;
    const data = reactionRequestData(target, triggerTokenUuid, content ?? "", triggerType, reactionActivityList, options);
    const request = askUser<ReactionResult>(reactingUser, {
      type: REACTIONS_REQUEST, data, kind: "reaction", owner: options.workflow, actorUuid: target.actor.uuid ?? undefined, tokenUuid: target.document.uuid ?? undefined,
      label: content ?? "", timeoutMs: (configSettings.reactionTimeout ?? defaultTimeout) * 1000, fallback: () => noResult,
      gmChoices: {
        none: () => noResult,
        // The GM picks the reaction on their own screen, as for a creature with no player
        choose: async () => {
          const gm = preferredActiveGM();
          if (!gm) return noResult;
          return (await askUser<ReactionResult>(gm, { type: REACTIONS_REQUEST, data, kind: "reaction", label: content ?? "", timeoutMs: 0, fallback: () => noResult }).settled).value;
        }
      }
    });
    // A request that couldn't be settled (its fallback failed too) is no reaction
    let result: any = await request.settled.then(settled => settled.value, err => {
      TroubleShooter.recordError(err, `doReactions | ${triggerType} for ${target.name}`);
      return noResult;
    });
    if (chatMessage) void chatMessage.delete();
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

export type ReactionResult = { name?: string, uuid?: string, ac?: number, itemName?: string, itemUuid?: string };

/** The request type a reacting client answers (GMAction registers its handler) */
export const REACTIONS_REQUEST = "midi-qol.reactions";
/** A player's Active Defence roll, asked through the request core (M5b; GMAction._D20Roll answers it) */
export const DEFENCE_REQUEST = "midi-qol.defence";
/** Optional bonuses after a failed save, asked of the actor's player through the request core (M5b; GMAction._bonusCheck) */
export const BONUS_REQUEST = "midi-qol.bonus";
/** A concentration roll asked of the concentrating creature's player through the request core (M5b; GMAction.rollConcentration) */
export const CONCENTRATION_REQUEST = "midi-qol.concentration";

/**
 * What the reacting client needs: the workflow, item and activity as ids and uuids, and only plain data (jsonSafe). The
 * options reach the reaction's own use, so a class instance in them (CAT's bonus session in workflowOptions.cat) would
 * arrive as a plain copy that the reaction's use then treats as its own.
 */
function reactionRequestData(target: Token.Implementation, triggerTokenUuid: string | undefined, reactionFlavor: string, triggerType: string, reactionActivityList: ReactionItemReference[], options: any) {
  const { workflow, item, activity, ...rest } = options ?? {};
  const sent: any = jsonSafe(rest) ?? {};
  if (item instanceof CONFIG.Item.documentClass) sent.itemUuid = item.uuid;
  if (activity?.uuid) sent.activityUuid = activity.uuid;
  if (workflow) {
    sent.workflowId = workflow.id;
    sent.itemCardUuid ??= workflow.itemCardUuid;
  }
  return { tokenUuid: target.document.uuid, reactionFlavor, triggerTokenUuid, triggerType, reactionActivityList, options: sent };
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
      result = await reactionDialog(actor, triggerTokenUuid, reactionActivities, reactionFlavor, triggerType, { ...options, tokenUuid });
      const endTime = Date.now();
      if (debugEnabled > 0) warn("promptReactions | reaction processing returned after ", endTime - startTime, result)
      if (result.uuid) return result; //TODO look at multiple choices here
    }
    if (usedReaction) return { name: "None" };
    if (!midiFlags) return { name: "None" };
    const acKey = optionalACKey(triggerType);
    const validFlags = Object.keys(midiFlags?.optional ?? {})
      .filter(flag => {
        if (!acKey || !midiFlags.optional[flag][acKey]) return false;
        if (!midiFlags.optional[flag].count) return true;
        return getOptionalCountRemainingShortFlag(actor, flag) > 0;
      }).map(flag => `flags.${MODULE_ID}.optional.${flag}`);
    // @ts-expect-error no dnd5e-types
    const acNow = await new Roll(`${actor.system.attributes.ac.value}`).roll();
    const acBonuses = await acBonusCandidates(actor, tokenUuid, triggerTokenUuid, triggerType, acNow, options);
    if ((validFlags.length > 0 || acBonuses?.candidates.length) && acKey) {
      let acRoll = acNow;
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
      const newAC = await bonusDialog.bind(data)(validFlags, acKey, displayBonusRolls !== false, `${actor.name} - ${i18n("DND5E.AC")} ${actor.system.attributes.ac.value}`, acRoll, "roll", { card: options.itemCardUuid, anchor: "hits", bonusQuery: acBonuses?.query, bonusPhase: acBonuses?.phase, candidates: acBonuses?.candidates });
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

/** The scene of the actor's token: its own for a token actor; for a linked actor, none when it has a token on the viewed
 *  scene, else the active scene's, else any scene's. Undefined for an actor with no token placed. */
function actorTokenScene(actor: Actor.Implementation): Scene.Implementation | undefined {
  if (actor.isToken) return actor.token?.parent ?? undefined;
  if (actor.getActiveTokens(false, true).length) return canvas?.scene ?? undefined;
  const placed = (scene: Scene.Implementation | null | undefined) => !!scene?.tokens.some(t => t.actorLink && t.actorId === actor.id);
  if (placed(game.scenes?.active)) return game.scenes!.active!;
  return game.scenes?.find(scene => placed(scene));
}

/**
 * A GM using an item for a creature whose token is on a scene they aren't viewing: other modules' reaction checks
 * (Gambit's Premades), animations and placement only look at the scene being viewed. View that scene first ("viewed"),
 * use it anyway ("use"), or don't ("cancel"); "here" when there is nothing to ask.
 */
export async function confirmUseOffScene(actor: Actor.Implementation | null | undefined): Promise<"here" | "viewed" | "use" | "cancel"> {
  if (!game.user?.isGM || !actor || !canvas?.scene) return "here";
  const scene = actorTokenScene(actor);
  if (!scene || scene.id === canvas.scene.id) return "here";
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: i18n("midi-qol.UseOffScene.Title") },
    position: { width: 420 },
    content: `<p>${i18nFormat("midi-qol.UseOffScene.Content", { actor: actor.name ?? "", scene: scene.name ?? "" })}</p>`,
    buttons: [
      { action: "view", label: i18n("midi-qol.UseOffScene.View"), default: true },
      { action: "use", label: i18n("midi-qol.UseOffScene.Use") },
      { action: "cancel", label: i18n("Cancel") }
    ],
    rejectClose: false
  });
  if (choice === "view") {
    await scene.view();
    return "viewed";
  }
  return choice === "use" ? "use" : "cancel";
}

/**
 * A GM using a reaction for a token on a scene they aren't viewing: view that scene first (targeting, placement and
 * animations need it), use the reaction anyway, or don't use it. The requesting client's timeout is held meanwhile.
 */
async function confirmReactionScene(tokenUuid: string | undefined): Promise<boolean> {
  if (!game.user?.isGM || !tokenUuid) return true;
  const token = fromUuidSync(tokenUuid) as TokenDocument.Implementation | null;
  const scene = token?.parent;
  if (!scene || scene.id === canvas?.scene?.id) return true;
  {
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: i18n("midi-qol.ReactionScene.Title") },
      position: { width: 420 },
      content: `<p>${i18nFormat("midi-qol.ReactionScene.Content", { token: token.name ?? "", scene: scene.name ?? "" })}</p>`,
      buttons: [
        { action: "view", label: i18n("midi-qol.ReactionScene.View"), default: true },
        { action: "run", label: i18n("midi-qol.ReactionScene.Run") },
        { action: "skip", label: i18n("midi-qol.ReactionScene.Skip") }
      ],
      rejectClose: false
    });
    if (choice === "view") {
      await scene.view();
      return true;
    }
    return choice === "run";
  }
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
      const callback = async function (dialog, button) {
        const activity = reactionActivities.find(i => i.uuid === button.key);
        // Claimed: the requester's deadline stops. Refused: a GM or the time-out answered already, so it isn't used too
        const incoming: IncomingRequest | undefined = options.incoming;
        if (activity && incoming && !(await incoming.claim())) {
          resolve(noResult);
          return;
        }
        if (activity) {
          dialog.close();
          // For Cast activities that don't override targeting, resolve the effective target type from the spell
          let effectiveTargetType = activity.target?.affects?.type;
          // @ts-expect-error no dnd5e-types for _source.target.override
          if (isActivityType(activity, "cast") && !activity._source?.target?.override) {
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
          // Targeting another creature, placing an area or teleporting needs the reacting token's scene; a self-only
          // reaction (Shield) is used from any scene
          const needsScene = effectiveTargetType !== "self" || !!activity.target?.template?.type || isActivityType(activity, "teleport");
          if (needsScene && !(await confirmReactionScene(options.tokenUuid))) {
            resolve(noResult);
            return;
          }
          const itemRollOptions = foundry.utils.mergeObject({
            createWorkflow: true,
            configureDialog: true,
            checkGMStatus: false,
            targetUuids: effectiveTargetType !== "self" ? [triggerTokenUuid] : [getOrCreateTokenForActor(actor)?.document?.uuid],
            isReaction: true,
            workflowOptions: { targetConfirmation: "none" },
            ignoreUserTargets: true
          }, (({ incoming: _incoming, ...rest }) => rest)(options));
          let result: any = noResult;
          if (activity.item instanceof CONFIG.Item.documentClass) { // a nomral item}
            const config = { midiOptions: itemRollOptions };
            result = await completeActivityUse(activity, config, {}, { systemCard: false });
            const workflow = result;  // completeActivityUse returns a workflow when called locally which for reactions it always is
            if (workflow && workflow.currentStep !== "midi-qol.Cleanup") resolve(noResult);
            else if (workflow) resolve({ name: workflow.activity.name, uuid: workflow.activity.uuid, itemName: workflow.activity.item.name, itemUuid: activity.item.uuid })
            else resolve(noResult);
          }
        }
        // actor.reset();
        resolve(noResult)
      };
      // Declined (button, close), or closed because the request was answered for the player: no reaction from here
      const noReaction = async function () {
        resolve(noResult);
      }
      const dialog = new ReactionDialog({
        actor,
        tokenUuid: options.tokenUuid,
        targetObject: this,
        title: i18n("midi-qol.ReactionDialog.Title"),
        activities: reactionActivities,
        content: rollFlavor,
        callback,
        close: noReaction,
        timeout,
        // Asked by another client (or this one) through the request core: its deadline, shown; it decides time-outs
        countdown: options.incoming ? options.incoming.countdown() ?? null : undefined
      });
      (options.incoming as IncomingRequest | undefined)?.onSettled(() => {
        dialog.closedForGM = true;
        void dialog.close();
      });
      dialog.render({ force: true });
    });
  } catch (err) {
    const message = `reaactionDialog error ${actor?.name} ${actor?.uuid} ${triggerTokenUuid}`;
    TroubleShooter.recordError(err, message);
    throw err;
  }
}

export class ReactionDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Closed because the GM answered for the player (not the player's own decline). */
  closedForGM?: boolean;
  startTime: number;
  endTime: number;
  countdown: DialogCountdown | undefined;
  timeRemaining: number;

  data: {
    actor: Actor.Implementation,
    /** The reacting token: its name titles the dialog */
    tokenUuid?: string,
    activities: Activity[],
    title: string,
    content: HTMLElement,
    callback: () => {},
    close: () => void,
    buttons: any,
    completed: boolean,
    timeout: number,
    timeRemaining: number,
    /** The request's display-only countdown; null: the request has no deadline; undefined: its own (a direct call) */
    countdown?: DialogCountdown | null
  }

  constructor(data) {
    super(data);
    this.data = data;
    this.timeRemaining = this.data.timeout;
    this.startTime = this.endTime = Date.now();
    this.data.completed = false;
    this.countdown = this.data.countdown === undefined
      ? new DialogCountdown({ seconds: this.data.timeout ?? 0, onExpire: () => this.close() })
      : this.data.countdown ?? undefined;
  }

  static PARTS = {
    dialog: {
      id: "dialog-reaction",
      classes: ["dialog", "midi-qol", "reaction"],
      template: "modules/midi-qol/templates/dialog.hbs"
    }
  };

  static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions = {
    position: {
      width: 400,
      height: "auto" as "auto"
    }
  };

  get title() {
    const token = this.data.tokenUuid ? fromUuidSync(this.data.tokenUuid) as TokenDocument.Implementation | null : null;
    const who = token?.name ?? this.data.actor?.name;
    return who ? `${who}: ${this.data.title ?? "Dialog"}` : this.data.title ?? "Dialog";
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const button of Array.from(this.element.querySelectorAll(".dialog-button"))) {
      button.addEventListener("click", this._onClickButton.bind(this));
    }
    this.countdown?.attach(this.element);
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
        img: activity.item.img,
        name,
        value: activity.name ?? activity.actionName,
        key: activity.uuid,
        callback: this.data.callback,
      }
      return acc;
    }, {});
    // Declining is the default, so Enter (or a stray click) never spends a reaction
    this.data.buttons.none = { name: i18n("midi-qol.PlayerWaits.Choice.none"), decline: true, default: true, cssClass: "decline" };
    return {
      ...context,
      content: this.data.content,
      buttons: this.data.buttons,
      timeRemaining: this.timeRemaining
    }
  }


  _onClickButton(event: Event) {
    // @ts-expect-error I know more than you, machine
    const id = event.currentTarget!.dataset.button;
    const button = this.data.buttons[id];
    debug("Reaction dialog button clicked", id, button, Date.now() - this.startTime)
    // No reaction: closing unanswered declines it
    if (button?.decline) return this.close();
    this.submit(button);
  }

  async submit(button) {
    try {
      this.countdown?.stop();
      debug("ReactionDialog submit", Date.now() - this.startTime, button.callback)
      if (button.callback) {
        this.data.completed = true;
        // The callback closes the dialog once it has the reaction
        await button.callback(this, button);
        if (this.rendered) this.close();
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
    this.countdown?.stop();
    debug("Reaction Dialog close ", Date.now() - this.startTime, this.data.completed)
    if (!this.data.completed && this.data.close) {
      this.data.close();
    }
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
  // concentration should not be a passive effect so don't need to do applied effects.
  // Active ones only, as dnd5e's Actor#concentration counts them: an expired effect awaiting deletion, or a disabled or
  // suppressed one, is not concentration, and a recast of the same spell must not be linked to it.
  if (!item?.id)
    return actor?.effects.find(ef => ef.active && ef.statuses.has(systemConcentrationId));
  else {
    return actor?.effects.find(ef => ef.active && ef.statuses.has(systemConcentrationId)
      && (ef.flags?.dnd5e?.item?.id === item.id)
    );
  }
}

async function confirm(title: string = "Are you sure", { content, defaultYes } = { content: "", defaultYes: true }): Promise<any> {
  // Foundry 14's DialogV2.confirm has no defaultYes: the default button is set on the button
  return DialogV2.confirm({
    window: { title: title ?? "Confirm" },
    content,
    yes: { default: defaultYes !== false },
    no: { default: defaultYes === false }
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

  if (isActivityType(activity, "heal")) partTypes(activity.healing);
  else for (const part of activity.damage?.parts ?? []) partTypes(part);
  if (rollData) {
    rollData.damageTypes = returnDamageTypes;
    rollData.defaultDamageType ??= returnDefaultDamageType;
    return;
  }
  return { damageTypes: returnDamageTypes, defaultDamageType: returnDefaultDamageType ?? {} };

}

/** An item's roll data for conditions, with the dnd5e getters conditions use (getters are not in getRollData). */
function itemConditionData(item: Item.Implementation) {
  const itemData: { magicAvailable?: boolean } = item.getRollData().item ?? {};
  // dnd5e 6.1: attuned if required, magical, and not under antimagic
  itemData.magicAvailable = dnd5eItem(item)?.system?.magicAvailable;
  return itemData;
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
  // A workflow's conditions are about the item it used
  const conditionItem = data.workflow?.item ?? item;
  if (conditionItem) rollData.item = itemConditionData(conditionItem);
  rollData = foundry.utils.mergeObject(rollData, data.extraData ?? {});
  rollData.isAttuned = rollData.item?.attuned || rollData.item?.attunement === "";
  rollData.options = data?.options;
  rollData.isConcentrationCheck = foundry.utils.getProperty(rollData, "options.messageData.flags.midi-qol.isConcentrationCheck");
  rollData.isDeathSave = dnd5eRollType(foundry.utils.getProperty(rollData, "options.messageData")) === "death";
  rollData.actor = {};
  rollData.actor.raceOrType = actor ? raceOrType(actor) : "";
  rollData.actor.typeOrRace = actor ? typeOrRace(actor) : "";
  rollData.items = actor?.items?.map(i => itemConditionData(i)) ?? [];
  rollData.equippedItems = rollData.items.filter(i => i.equipped) ?? [];
  rollData.worldTime = game.time?.worldTime;
  try {
    if (data.target) {
      // The target's document: a target with no canvas token has no Token
      const theTarget = getToken(data.target)?.document ?? getTokenDocument(data.target);
      if (theTarget) {
        const theTargetActor = theTarget.actor as Actor;

        rollData.target = {
          get system() { return theTargetActor?.system },
          ...theTargetActor?.getRollData()
        };
        rollData.targetUuid = data.targetUuid ?? theTarget.uuid
        rollData.targetId = theTarget.id;
        rollData.targetActorUuid = theTargetActor?.uuid;
        rollData.targetActorId = theTargetActor?.id;
        rollData.raceOrType = theTargetActor ? raceOrType(theTargetActor) : "";
        rollData.typeOrRace = theTargetActor ? typeOrRace(theTargetActor) : "";
        rollData.target.raceOrType = theTarget.actor ? raceOrType(theTargetActor) : "";
        rollData.target.typeOrRace = theTarget.actor ? typeOrRace(theTargetActor) : "";
        rollData.target.items = theTargetActor?.items?.map(i => itemConditionData(i)) ?? [];
        rollData.target.equippedItems = rollData.target.items.filter(i => i.equipped) ?? [];
        rollData.target.saved = data.workflow?.saves.has(theTarget);
        rollData.target.failedSave = data.workflow?.failedSaves.has(theTarget);
        rollData.target.superSaver = data.workflow?.superSavers.has(theTarget);
        rollData.target.semiSuperSaver = data.workflow?.semiSuperSavers.has(theTarget);
        rollData.target.isHit = data.workflow?.hitTargets.has(theTarget);
        rollData.target.isHitEC = data.workflow?.hitTargetsEC.has(theTarget);
        // Sight is between placeables
        const drawnTarget = tokenOf(theTarget);
        rollData.target.canSense = !!drawnTarget && data.workflow?.targetsCanSense?.has(drawnTarget);
        rollData.target.canSee = !!drawnTarget && data.workflow?.targetsCanSee?.has(drawnTarget);
        rollData.canSense = !!drawnTarget && data.workflow?.tokenCanSense?.has(drawnTarget);
        rollData.canSee = !!drawnTarget && data.workflow?.tokenCanSee?.has(drawnTarget);
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
      // dnd5e 6 lists effect profiles here, not effects: local ones resolve from the item, remote ones by uuid.
      const activity = data.workflow.activity;
      activity.applicableEffects?.forEach((profile) => {
        const effect = (profile.uuid ? fromUuidSync(profile.uuid) : activity.item?.effects.get(profile._id ?? "")) as ActiveEffect.Implementation | null | undefined;
        effect?.statuses?.forEach(status => {
          rollData.riderStatuses[status] = true;
          // dnd5e 6 also applies a status's own riders, e.g. unconscious adds prone.
          // @ts-expect-error no dnd5e-types
          CONFIG.statusEffects.find(se => se.id === status)?.riders?.forEach((rider: string) => (rollData.riderStatuses[rider] = true));
        });
        // @ts-expect-error no dnd5e-types
        effect?.system?.rider?.statuses?.forEach((rider: string) => (rollData.riderStatuses[rider] = true));
      });
      rollData.otherDamageActivity = data.workflow?.otherActivity;
      rollData.hasSave = data.workflow.hasSave;
      rollData.shouldRollDamage = data.workflow.shouldRollDamage;
      rollData.hasAttack = data.workflow.activity.attack;
      rollData.hasDamage = data.workflow.activity.hasDamage;
      // Tags (M26), worked out when read: about the target when there is one
      const workflow = data.workflow;
      const tagTarget = data.target ? getTokenDocument(data.target) : undefined;
      rollData.choices = workflow.choices;
      Object.defineProperty(rollData, "tags", { get: () => tagsView(workflow, tagTarget), enumerable: false, configurable: true });
    }
    if (!data.activity && data.workflow) data.activity = data.workflow.activity;
    if (data.activity) {
      rollData.activity = data.activity;
      rollData.a = data.activity;
    }
    if (item) {
      // Conditions written for items (@item.actionType) get the action type of the activity being used.
      const activity = data.activity;
      // @ts-expect-error no dnd5e-types
      Object.defineProperty(rollData.item, "actionType", { get() { return (activity ?? item.system.activities?.contents[0])?.actionType } });
    }
    if (data.effect) {
      rollData.effect = data.effect;
      // DAE rewrites @stackCount on a deep clone that never reaches effect.system.changes, so supply it here.
      rollData.stackCount = getEffectStackCount(data.effect, getOrCreateTokenForActor(actor ?? undefined));
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
    Object.keys(CONST).forEach(key => !exclusions.includes(key) && (rollData.CONST[key] = CONST[key]));
    //Only here to avoid deprecation warnings - remove when we get to v14
    // Other modules add their own data, e.g. world state an item's conditions refer to.
    Hooks.callAll("midi-qol.conditionData", rollData, data);
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
  // @ts-expect-error fvtt-types v14 ActiveEffect
  const effects = actor.appliedEffects.filter(ef => ef.system.changes.some(change => change.key === flag));
  let keyToUse = flag.replace(`flags.${MODULE_ID}.`, "flags.midi.evaluated.");
  keyToUse = keyToUse.replace("flags.dnd5e.", "flags.midi.evaluated.dnd5e.");
  keyToUse = keyToUse.replace(/^system\./, "flags.midi.evaluated.system.");
  let returnValue = errorReturn;
  foundry.utils.setProperty(actor, `${keyToUse}.value`, false);
  foundry.utils.setProperty(actor, `${keyToUse}.effects`, [])
  for (let effect of effects) {
    // @ts-expect-error fvtt-types v14 ActiveEffect
    for (let change of effect.system.changes) {
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
  // @ts-expect-error fvtt-types v14 ActiveEffect
  const effects = actor.appliedEffects.filter(ef => ef.system.changes.some(change => change.key === flag));
  let keyToUse = flag.replace(`flags.${MODULE_ID}.`, "flags.midi.evaluated.");
  keyToUse = keyToUse.replace("flags.dnd5e.", "flags.midi.evaluated.dnd5e.");
  keyToUse = keyToUse.replace(/^system\./, "flags.midi.evaluated.system.");
  let returnValue = errorReturn;
  foundry.utils.setProperty(actor, `${keyToUse}.value`, false);
  foundry.utils.setProperty(actor, `${keyToUse}.effects`, [])
  for (let effect of effects) {
    // @ts-expect-error fvtt-types v14 ActiveEffect
    for (let change of effect.system.changes) {
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
    return { shape: undefined, distance: 0 };
  }
  //@ts-expect-error doesn't like `object.ray`
  templateDocument.object.ray = foundry.canvas.geometry.Ray.fromAngle(x, y, direction, distance);

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
  if (actorUuid?.startsWith("Scene")) { // actor is a token synthetic actor
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

/** Spend the action (a facade over the economy ledger's turn window) */
export async function setActionUsed(actor: Actor.Implementation) {
  await spendBudget(actor, "action");
}

/** Spend a reaction (a facade over the economy ledger, M4: services/economy/ledger.ts); `active` false closes the window */
export async function setReactionUsed(actor: Actor.Implementation, active: boolean = true) {
  if (!active) return resetBudget(actor, "reaction");
  await spendBudget(actor, "reaction");
}

/** Spend a bonus action (a facade over the economy ledger) */
export async function setBonusActionUsed(actor: Actor.Implementation) {
  if (debugEnabled > 0) warn("setBonusActionUsed | starting");
  await spendBudget(actor, "bonus");
}

/**
 * The action back: `force` closes the turn window now (a rest, a macro); otherwise its own expiry ends it (turn start,
 * combat end), as the reaction and bonus action markers' do: deleting it here as well races core's expiry, which fails
 * the whole expiry batch. An older world's stored action flag is cleared either way.
 */
export async function removeActionUsed(actor: Actor.Implementation, force = false) {
  if (force) await resetBudget(actor, "action");
  if (!actor._source.flags?.[MODULE_ID]?.actions?.action) return;
  if (game.user?.isGM || actor.isOwner) return await actor?.setFlag(MODULE_ID, "actions", { action: false });
  else return await unTimedExecuteAsGM("_gmSetFlag", { base: MODULE_ID, key: "actions.action", value: false, actorUuid: actor.uuid })
}

export async function removeReactionUsed(actor: Actor.Implementation, force = false) {
  if (debugEnabled > 0) warn("removeReactionUsed | starting", actor);
  if (force) await resetBudget(actor, "reaction"); // otherwise its window ends by its own expiry
  // safety net unset of flags - just in case.
  if (actor.flags?.[MODULE_ID]?.actions?.reaction) await actor.update({ flags: { [MODULE_ID]: { actions: { reactionsUsed: 0, reactionCombatRound: new foundry.data.operators.ForcedDeletion() } } } });
}

export function hasUsedAction(actor: Actor.Implementation) {
  return actor?.getFlag(MODULE_ID, "actions")?.action;
}

export function hasUsedReaction(actor: Actor.Implementation) {
  return budget(actor, "reaction").exhausted;
}

const NO_REACTIONS_EFFECT = "Compendium.dnd5e.effects.ActiveEffect.tZuPpkTWg8lVjxhL";
const NO_REACTIONS_ICON = "systems/dnd5e/icons/svg/statuses/no-reactions.svg";

/** dnd5e 6.1's No Reactions marker (an empty effect from its effects compendium), by its source or icon */
export function hasNoReactionsMarker(actor: Actor.Implementation | null | undefined): boolean {
  return !!actor?.appliedEffects.some(effect => effect._stats?.compendiumSource === NO_REACTIONS_EFFECT || effect.img === NO_REACTIONS_ICON);
}

export function hasUsedAnyReaction(actor: Actor.Implementation) {
  return (actor.getFlag(MODULE_ID, "actions")?.reactionsUsed ?? 0) > 0;
}

/**
 * Optional bonuses' per-turn counts (`flags.midi-qol.optional.NAME.count` each-turn / each-round / turn), reset on the
 * turn moments (M4; core's active GM): each-turn at every turn start, each-round at a round start, turn at the start of
 * the bearer's own turn.
 */
async function resetOptionalBonusCounts(combat: Combat.Implementation, moment: "turnStart" | "roundStart", whose: Actor.Implementation | null | undefined) {
  const optionalFlagRe = /flags.midi-qol.optional.[^.]+.(count|countAlt)$/;
  for (const combatant of combat.turns ?? []) {
    const actor = combatant.actor;
    if (!actor) continue;
    for (const effect of actor.allApplicableEffects()) {
      // @ts-expect-error fvtt-types v14 ActiveEffect
      for (const change of effect.system.changes) {
        if (!change.key.match(optionalFlagRe)) continue;
        const resets = (change.value === "each-turn" && moment === "turnStart")
          || (change.value === "each-round" && moment === "roundStart")
          || (change.value === "turn" && moment === "turnStart" && whose === actor);
        if (!resets) continue;
        const usedKey = change.key.replace(/.(count|countAlt)$/, ".used");
        if (foundry.utils.getProperty(actor, usedKey)) await actor.unsetFlag(MODULE_ID, usedKey.replace(`flags.${MODULE_ID}.`, ""));
      }
    }
  }
}

export function setupOptionalBonusResets() {
  onTurnMoment("turnStart", "midi-qol.optionalBonusCounts", ({ combat, actor }) => resetOptionalBonusCounts(combat, "turnStart", actor));
  onTurnMoment("roundStart", "midi-qol.optionalBonusCounts", ({ combat }) => resetOptionalBonusCounts(combat, "roundStart", undefined));
}

export function hasUsedBonusAction(actor: Actor.Implementation) {
  return budget(actor, "bonus").exhausted;
}
export async function removeBonusActionUsed(actor: Actor.Implementation, force = false) {
  if (force) await resetBudget(actor, "bonus"); // otherwise its window ends by its own expiry
  // Safety net flag reset just in case
  if (force) await actor.update({ flags: { [MODULE_ID]: { actions: { bonusActionsUsed: 0, bonus: false, bonusActionCombatRound: new foundry.data.operators.ForcedDeletion() } } } });
}


/** Removes action markers DAE/dnd5e should have ended (turn start, combat end) but left. */
async function removeLingeringMarkers(actor: Actor.Implementation, shouldHaveEnded: (marker: ActiveEffect.Implementation) => boolean) {
  for (const id of [getStaticID("reaction"), getStaticID("bonusaction")]) {
    const marker = actor.effects.get(id);
    if (marker && shouldHaveEnded(marker)) await queueActorEffects(actor, () => deleteEffectIfPresent(actor, id));
  }
}

/** On the turn moments (M4, core's active GM): after DAE and core have had their go at expiring the markers */
export function setupMarkerChecks() {
  onTurnMoment("combatEnd", "midi-qol.lingeringMarkers", ({ combat }) => {
    // Only the markers there when the combat ended: a window opened since (a reaction just after) is not this combat's
    const ended = new Map<Actor.Implementation, Map<string, number | null | undefined>>();
    for (const actor of combat.combatants.contents.flatMap(c => c.actor ?? [])) {
      const markers = new Map<string, number | null | undefined>();
      for (const id of [getStaticID("reaction"), getStaticID("bonusaction")]) {
        const marker = actor.effects.get(id);
        if (marker) markers.set(id, marker._stats?.createdTime);
      }
      if (markers.size) ended.set(actor, markers);
    }
    setTimeout(() => ended.forEach((markers, actor) => removeLingeringMarkers(actor, marker =>
      markers.has(marker.id ?? "") && markers.get(marker.id ?? "") === marker._stats?.createdTime
      && !!marker.flags?.dae?.specialDuration?.includes("combatEnd"))), 500);
  });
  onTurnMoment("turnStart", "midi-qol.lingeringMarkers", ({ actor, skipped }) => {
    if (actor && !skipped) setTimeout(() => removeLingeringMarkers(actor, isEffectExpired), 500);
  });
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
export async function callActivityHooks(activity: { uuid: string | null; item: { uuid: string | null } }, hookName: string, ...args): Promise<boolean> {
  // A temporary item or activity has no uuid, so no uuid-scoped hook
  const scopes = [activity.item.uuid, activity.uuid].filter((uuid): uuid is string => !!uuid);
  for (const hook of [hookName, hookName.replace("midi-qol.", "midi-qol.premades.")]) {
    if (await asyncHooksCall(hook, ...args) === false) return false;
    for (const scope of scopes) if (await asyncHooksCall(`${hook}.${scope}`, ...args) === false) return false;
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
/**
 * The attribution info icon for a roll, built from the entries the roll already carries.
 *
 * `addAttribution` stores the same array on `roll.options.attributions` that
 * `renderAttributionTooltip` derives from the map, so the icon can be produced at render time from
 * the persisted roll instead of being baked into the card. The escaped tooltip is around 550 bytes —
 * on a card whose whole attack section is now 40, it was the largest thing left in it.
 */
/**
 * A save roll as the saves section shows it: the roll, prefixed with which ability, skill or tool
 * was chosen when the target had a choice.
 *
 * Shared so the card can rebuild it from `message.rolls` instead of storing it — the rendered form
 * measured 1,036 B per target, the largest single field on a save card.
 */
export async function renderSaveRollHTML(roll: Roll | undefined): Promise<string> {
  if (!roll) return "";
  let html = await midiRenderRoll(roll);
  const midiChosenId = foundry.utils.getProperty(roll, "options.midiChosenId");
  if (typeof midiChosenId !== "string" || !midiChosenId) return html;
  let choiceTitle = "";
  if (GameSystemConfig.abilities[midiChosenId]) {
    choiceTitle = i18nFormat("DND5E.SavePromptTitle", { ability: GameSystemConfig.abilities[midiChosenId].label ?? "" });
  } else if (GameSystemConfig.skills[midiChosenId]) {
    choiceTitle = i18nFormat("DND5E.SkillPromptTitle", { skill: GameSystemConfig.skills[midiChosenId].label ?? "", ability: "" });
  } else {
    const toolLabel = getToolLabel(midiChosenId);
    if (toolLabel && toolLabel !== midiChosenId) choiceTitle = i18nFormat("DND5E.ToolPromptTitle", { tool: toolLabel });
  }
  if (choiceTitle) html = `<div style="font-weight:bold; text-align:center;">${choiceTitle}</div>${html}`;
  return html;
}

export async function renderRollAttributionIcon(roll: Roll | undefined): Promise<string> {
  const stored = roll ? foundry.utils.getProperty(roll, "options.attributions") : undefined;
  const entries: AttributionEntry[] = Array.isArray(stored) ? stored : [];
  if (!entries.length) return "";
  const localizedEntries = entries.map(attr => ({
    ...attr,
    localizedType: i18n(attributionTypeLocalization[attr.type] ?? attr.type)
  }));
  const mode = roll ? foundry.utils.getProperty(roll, "options.advantageMode") : undefined;
  const title = getAdvantageModeTitle(typeof mode === "number" ? mode : 0);
  const tooltip = compactHTML(await foundry.applications.handlebars.renderTemplate(
    "modules/midi-qol/templates/attribution-tooltip.html",
    { attributions: localizedEntries, title }
  ));
  if (!tooltip) return "";
  return ` <span class="midi-attribution-info" data-tooltip-html="${foundry.utils.escapeHTML(tooltip)}" data-tooltip-direction="DOWN"><i class="fas fa-info-circle"></i></span>`;
}

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

/** Move roll formula to tooltip's (deprecated) advantage options: the sources of advantage in the roll's breakdown too */
const showAdvantageAttribution = () => ["adv", "formulaadv"].includes(configSettings.rollAlternate);

/** The sources of a roll's advantage/disadvantage for its breakdown, if Move roll formula to tooltip shows them there */
function breakdownAttributions(roll: Roll | undefined) {
  if (!showAdvantageAttribution()) return { attributions: [], advTooltip: undefined };
  // @ts-expect-error options.attributions
  const raw: AttributionEntry[] = roll?.options?.attributions ?? [];
  return {
    attributions: raw.map(attr => ({ ...attr, localizedType: i18n(attributionTypeLocalization[attr.type] ?? attr.type) })),
    // @ts-expect-error advTooltip
    advTooltip: roll?.options?.advTooltip
  };
}

/** A roll's breakdown is dnd5e's (dice and labelled modifiers), with midi's lines at its top (tooltip-extras.html) */
async function getTooltip(roll: Roll, options: any = {}) {
  const extras = (await foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/tooltip-extras.html", {
    ...breakdownAttributions(roll),
    tooltipFormula: options?.tooltipFormula ?? false,
    formula: roll.formula
  })).trim();
  const tooltip = await roll.getTooltip();
  if (!extras) return tooltip;
  const open = '<div class="dice-tooltip">';
  if (tooltip.includes(open)) return tooltip.replace(open, `${open}${extras}`);
  return `<div class="dice-tooltip-collapser">${open}${extras}</div></div>`;
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

/**
 * Render a damage section's rolls as one block rather than one block per roll.
 *
 * dnd5e aggregates damage for display (`CONFIG.DND5E.aggregateDamageDisplay`) and midi follows that
 * flag rather than adding its own: `aggregateDamageRolls` merges the rolls by damage type, and each
 * merged roll's `aggregateTerms()` supplies the breakdown `_simplifyDamageRoll` used to - that method
 * was removed in 6.0. The result is one formula, one total and one icon per damage type, which is
 * what the card showed before the rolls were stored individually.
 */
export async function midiRenderAggregatedDamageRolls(rolls: Roll[], template: string, options: any = {}) {
  if (!rolls?.length) return "";
  const aggregate = GameSystemConfig.aggregateDamageDisplay ?? true;
  const damageRolls = aggregate ? (game.system as Dnd5eSystem).dice.aggregateDamageRolls(rolls) : rolls;

  const breakdowns = damageRolls.map((roll: any) => {
    const part = roll.aggregateTerms();
    const config = GameSystemConfig.damageTypes[part.type] ?? GameSystemConfig.healingTypes?.[part.type];
    return { ...part, config, label: config?.labelShort ?? config?.label ?? "" };
  });

  // aggregateTerms clamps each part at zero, so the displayed total matches the damage tray.
  const total = breakdowns.reduce((sum: number, p: any) => sum + (p.total ?? 0), 0);
  // As DamageMessageData joins them: aggregated rolls carry their own leading operator, others do not.
  const formula = damageRolls.map(r => aggregate ? r.formula : ` + ${r.formula}`).join("").replace(/^ \+ /, "");

  const tooltipFormula = options.tooltipFormula
    ?? ["formula", "formulaadv"].includes(configSettings.rollAlternate);
  const tooltip = await foundry.applications.handlebars.renderTemplate(
    "modules/midi-qol/templates/tooltip.html", {
      ...breakdownAttributions(rolls[0]),
      tooltipFormula,
      formula,
      // One section per damage type, in the shape tooltip.html already renders.
      parts: breakdowns.map((b: any) => ({ rolls: b.dice, flavor: b.label, total: b.total,
        constant: b.constant ? { sign: b.constant < 0 ? "-" : "+", value: Math.abs(b.constant) } : null }))
    });

  return foundry.applications.handlebars.renderTemplate(template, {
    formula,
    total,
    tooltip,
    tooltipFormula,
    user: game.user?.id,
    flavor: options.flavor,
    damageTypes: breakdowns
      .filter((b: any) => b.config?.icon)
      .map((b: any) => ({ icon: b.config.icon, label: b.config.label ?? b.label }))
  });
}

export function midiRenderDamageRolls(rolls: Roll[], options?: any) {
  return midiRenderAggregatedDamageRolls(rolls, "modules/midi-qol/templates/damage-roll.html", options ?? {});
}

export function midiRenderOtherDamageRolls(rolls: Roll[], options?: any) {
  return midiRenderAggregatedDamageRolls(rolls, "modules/midi-qol/templates/other-damage-roll.html", options ?? {});
}

export function midiRenderBonusDamageRolls(rolls: Roll[], options?: any) {
  return midiRenderAggregatedDamageRolls(rolls, "modules/midi-qol/templates/bonus-damage-roll.html", options ?? {});
}

/**
 * The attack roll's tooltip: a chip for every term after the d20 (its value and the label it was rolled with:
 * Strength, Proficiency, Flanking, …, the Roll Bonus with the effects behind it), after whether the d20 had advantage
 * or disadvantage, which alone is coloured (its sources are in the attribution tooltip).
 */
function attackTermChips(roll: Roll, modifiers: AttackModifier[], reasonIcon: (m: AttackModifier, cls: string) => string,
  describeReason: (m: AttackModifier) => string): string {
  const esc = foundry.utils.escapeHTML;
  const sources = (foundry.utils.getProperty(roll, `options.${MODULE_ID}.rollBonusSources`) ?? []) as Array<{ label: string, value?: string }>;
  const chips: string[] = [];
  const advantageMode = roll.options?.advantageMode;
  if (advantageMode === 1) chips.push(`<span class="midi-attack-reason-chip plus">${esc(i18n("DND5E.Advantage"))}</span>`);
  else if (advantageMode === -1) chips.push(`<span class="midi-attack-reason-chip minus">${esc(i18n("DND5E.Disadvantage"))}</span>`);
  let sign = 1;
  roll.terms.forEach((term, index) => {
    if (index === 0) return; // the d20
    if (term instanceof foundry.dice.terms.OperatorTerm) {
      sign = term.operator === "-" ? -1 : 1;
      return;
    }
    const value = sign * Number(term.total ?? 0);
    const label = term.flavor || i18n("midi-qol.AttackTerm.Bonus");
    const valueText = `${value >= 0 ? "+" : ""}${value}`;
    const dice = term instanceof foundry.dice.terms.DiceTerm || term instanceof foundry.dice.terms.ParentheticalTerm ? ` (${esc(term.formula.replace(/\[[^\]]*\]/g, ""))})` : "";
    const modifier = modifiers.find(m => !m.advantage && m.label === label);
    let detail = "";
    if (label === rollBonusLabel() && sources.length) {
      const parts = sources.map(src => src.value ? `${src.value} ${src.label}` : src.label);
      // Plain numbers can be checked against the term; what they don't account for came from elsewhere (the sheet)
      if (sources.every(src => src.value !== undefined && Number.isNumeric(src.value))) {
        const other = value - sources.reduce((sum, src) => sum + Number(src.value), 0);
        if (other) parts.push(`${other > 0 ? "+" : ""}${other} ${i18n("midi-qol.AttackTerm.Other")}`);
      }
      detail = `: ${esc(parts.join(", "))}`;
    }
    chips.push(`<span class="midi-attack-reason-chip">${modifier ? reasonIcon(modifier, "midi-attack-reason-icon") : ""} ${esc(valueText)}${dice} ${esc(label)}${detail}</span>`);
  });
  return chips.length ? `<div class="midi-attack-reason-chips">${chips.join("")}</div>` : "";
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
  const damageType: string | undefined = roll.options?.type;
  const damageConfig = damageType
    ? (GameSystemConfig.damageTypes[damageType] ?? GameSystemConfig.healingTypes?.[damageType])
    : undefined;

  // Attack roll reasons (flanking, granted bonuses) recorded when the roll was built: an icon each beside the total,
  // all of them as chips in the total's tooltip, and their labels left out of the shown formula
  const attackModifiers = (foundry.utils.getProperty(roll, `options.${MODULE_ID}.attackModifiers`) ?? []) as AttackModifier[];
  const describeReason = (m: AttackModifier) => m.advantage ? `${i18n("DND5E.Advantage")}: ${m.label}` : `${m.value} ${m.label}`;
  // Green for what helps the attack (a bonus, advantage), red for a penalty
  const reasonSign = (m: AttackModifier) => (m.advantage || !`${m.value ?? ""}`.startsWith("-")) ? "plus" : "minus";
  const reasonIcon = (m: AttackModifier, cls: string, attrs = "") => m.kind === "granted"
    ? `<i class="fas fa-bolt ${cls}"${attrs}></i>`
    // The SVG as a mask, coloured by the text colour (core's icons carry their own fill); an absolute route, as a
    // url() in a custom property resolves against the stylesheet that uses it
    : `<span class="${cls} midi-attack-reason-mask" style="--midi-reason-icon: url('${foundry.utils.getRoute(m.kind === "flanked" ? "modules/midi-qol/icons/encirclement.svg" : m.kind === "bonus" ? "icons/svg/upgrade.svg" : "icons/svg/sword.svg")}')" role="img" aria-label="${foundry.utils.escapeHTML(m.label)}"${attrs}></span>`;
  const attackReasons = attackModifiers.map(m => reasonIcon(m, `midi-attack-reason ${reasonSign(m)}`, ` data-tooltip="${foundry.utils.escapeHTML(describeReason(m))}"`));
  // Effects behind the roll bonus (Bless and the like) by their own image, outlined green or red; the weapon's own
  // make-up (ability, proficiency, magic, ammunition) is the usual and gets none
  const bonusSources = (foundry.utils.getProperty(roll, `options.${MODULE_ID}.rollBonusSources`) ?? []) as Array<{ label: string, value?: string, img?: string }>;
  for (const src of bonusSources) {
    const text = foundry.utils.escapeHTML(src.value ? `${src.value} ${src.label}` : src.label);
    const sign = `${src.value ?? ""}`.startsWith("-") ? "minus" : "plus";
    attackReasons.push(src.img
      ? `<img src="${foundry.utils.escapeHTML(src.img)}" class="midi-attack-reason midi-attack-reason-effect ${sign}" alt="${foundry.utils.escapeHTML(src.label)}" data-tooltip="${text}">`
      : `<i class="fas fa-wand-magic-sparkles midi-attack-reason ${sign}" data-tooltip="${text}"></i>`);
  }
  // Exhaustion's penalty (dnd5e's condition roll reduction, labelled when the roll was built), by its status image
  const exhaustionLabel = i18n("DND5E.Exhaustion");
  const exhaustionImg = CONFIG.statusEffects.find(effect => effect.id === "exhaustion")?.img;
  let termSign = 1;
  for (const term of template.endsWith("attack-roll.html") ? roll.terms : []) {
    if (term instanceof foundry.dice.terms.OperatorTerm) { termSign = term.operator === "-" ? -1 : 1; continue; }
    if (term.flavor !== exhaustionLabel) continue;
    const value = termSign * Number(term.total ?? 0);
    if (!value) continue;
    const text = foundry.utils.escapeHTML(`${value > 0 ? "+" : ""}${value} ${exhaustionLabel}`);
    attackReasons.push(exhaustionImg
      ? `<img src="${foundry.utils.escapeHTML(exhaustionImg)}" class="midi-attack-reason midi-attack-reason-effect ${value < 0 ? "minus" : "plus"}" alt="${foundry.utils.escapeHTML(exhaustionLabel)}" data-tooltip="${text}">`
      : `<i class="fas fa-face-tired midi-attack-reason ${value < 0 ? "minus" : "plus"}" data-tooltip="${text}"></i>`);
  }
  const attackReasonsTooltip = template.endsWith("attack-roll.html") ? attackTermChips(roll, attackModifiers, reasonIcon, describeReason) : "";

  const chatData = {
    formula: template.endsWith("attack-roll.html") ? roll.formula.replace(/\[[^\]]*\]/g, "") : roll.formula,
    attackReasons,
    attackReasonsTooltip,
    user: game.user?.id,
    tooltip: await getTooltip(roll, options),
    tooltipFormula: options?.tooltipFormula ?? false,
    // @ts-expect-error no dnd5e-types
    flavor: options?.flavor ?? roll.options?.flavor,
    total: (roll.total !== undefined) ? Math.round((roll.total) * 100) / 100 : "???",
    advantageMode: advantageModeStr,
    attributionTooltip,
    damageTypeIcon: damageConfig?.icon,
    damageTypeLabel: damageConfig?.label,
    // Same shape the aggregated renderer emits, so one template serves both paths.
    damageTypes: damageConfig?.icon ? [{ icon: damageConfig.icon, label: damageConfig.label }] : []
  };
  return foundry.applications.handlebars.renderTemplate(template, chatData);
}
export function getFlankingEffect() {
  return ceInterface?.findEffect({ effectName: "Flanking" });
}

export function getFlankedEffect() {
  return ceInterface?.findEffect({ effectName: "Flanked" });
}

export function getReactionEffect() {
  if (!midiReactionEffect) return undefined;
  return midiReactionEffect;
}
export function getBonusActionEffect() {
  if (!midiBonusActionEffect) return undefined;
  return midiBonusActionEffect;
}

let _markFlankingPromise: Promise<boolean> = Promise.resolve(false);
export function markFlanking(token?: Token.Implementation | null, target?: Token.Implementation | null): Promise<boolean> {
  _markFlankingPromise = _markFlankingPromise.then(
    () => _markFlankingImpl(token, target),
    () => _markFlankingImpl(token, target)
  );
  return _markFlankingPromise;
}

async function _markFlankingImpl(token?: Token.Implementation | null, target?: Token.Implementation | null): Promise<boolean> {
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
      if (!token.actor?.isOwner) await unTimedExecuteAsGM("toggleStatusEffect", { actorUuid: token.actor?.uuid, statusId: MidiFlanking.id, options: { active: needsFlanking } });
      else await toggleStatus(token.actor, MidiFlanking.id, { active: needsFlanking });
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
      if (!target.actor.isOwner) await unTimedExecuteAsGM("toggleStatusEffect", { actorUuid: target.actor.uuid, statusId: MidiFlanked.id, options: { active: needsFlanked } });
      else await toggleStatus(target.actor, MidiFlanked.id, { active: needsFlanked });
    }
    return needsFlanked;
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
  if (tokenDist < 0 || tokenDist > tokenRange * gridDist) return;

  const gridW = canvas.grid.sizeX ?? 100;
  const gridH = canvas.grid.sizeY ?? 100;

  // Adjacency distance — matches computeFlankingStatus logic
  let maxDist = gridDist;
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

  // The target's box for the square-grid opposite-sides test
  const targetBox = canvas.grid.isHexagonal ? undefined
    : { x: target.x, y: target.y, width: target.document.width * gridW, height: target.document.height * gridH };

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
        const d = measureGridPath(canvas.grid, [{ x: tx, y: ty }, tc])?.distance ?? Infinity;
        if (d <= tokenMaxDist) { closeEnough = true; break; }
      }
      if (!closeEnough) continue;
      tokenPoints.push({ x: tx, y: ty });
    }
  }
  if (tokenPoints.length === 0) return;

  // Hex flanking uses centroid + angle
  const centroid = canvas.grid.isHexagonal ? getHexCentroid(target) : undefined;

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
        const d = measureGridPath(canvas.grid, [cellCenter, tc])?.distance ?? Infinity;
        if (d > 0 && d <= maxDist + 1) { isAdjacent = true; break; }
      }
      if (!isAdjacent) continue;

      let isValid = false;

      if (canvas.grid.isHexagonal && centroid) {
        // Hex flanking: check angle from centroid
        for (const tp of tokenPoints) {
          if (opposedByAngle(centroid, canvas.grid.getCenterPoint(tp), cellCenter)) {
            isValid = true;
            break;
          }
        }
      } else if (targetBox) {
        // Square grid: a line through opposite sides
        for (const tp of tokenPoints) {
          if (crossesOppositeSides(targetBox, canvas.grid.getCenterPoint(tp), cellCenter)) {
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
  return actorOrItem.effects.contents
    .flat()
    .map(e => {
      // @ts-expect-error v14 system.changes not typed in fvtt-types
      let c: Array<any> = foundry.utils.duplicate(e.system.changes);
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
  return sensesModes(token.document, target.document, { modes: validModes, forceVision: options.forceVision });
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
  const modes = Object.fromEntries(Object.entries(tk.detectionModes));
  if (!tk.hasSight) {
    modes.lightPerception ??= { enabled: true, range: Infinity };
    modes.basicSight ??= { enabled: true, range: tk.document.sight.range };
  }
  return modes;
}

/**
 * The token's own vision source while Foundry keeps one, else one detached from the canvas, so the token is left
 * as it was (https://gitlab.com/tposney/midi-qol/-/issues/1571). Cached until the token's vision data, the walls, lights or scene change.
 */
function checkVisionSource(tk: Token.Implementation, detectionModes: ReturnType<typeof checkDetectionModes>): CheckVisionSource {
  if (tk.hasSight && tk.vision?.los) return tk.vision;
  const lightPerception = detectionModes.lightPerception;
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
  // Use Foundry's getVisibilityTestPoints() which returns constrained test points
  // (removes points behind walls/surfaces from the target's own movement origin).
  // This matches what Foundry's rendering pipeline uses for visibility determination.
  const visTestPoints: Array<{x: number, y: number, elevation?: number}> = target.document.getVisibilityTestPoints?.() ?? [target.center];
  // @ts-expect-error no dnd5e-types for document.level / scene.levels
  const targetLevel = canvas.scene.levels?.get(target.document.level) ?? canvas.level;
  const tests = visTestPoints.map(p => ({
    point: { x: p.x, y: p.y, elevation: p.elevation ?? (target.document.getMovementOrigin?.()?.elevation ?? target.document.elevation ?? 0) },
    level: targetLevel,
    los: new Map() as Map<foundry.canvas.sources.PointVisionSource, boolean>
  }));
  // @ts-expect-error CanvasVisibilityTestConfiguration not in fvtt-types
  const config: CanvasVisibilityTestConfiguration = { tests, object: target, level: targetLevel };
  const modes = CONFIG.Canvas.detectionModes;
  let validModes = new Set(validModesParam);

  // Pre-populate the LOS cache by ray casting in the token's level: core tests 360° vision against the
  // vision polygon (misses narrow gaps between walls), and in the level the GM is viewing.
  const sameLevel = token.document.level === target.document.level;
  if (vision) {
    const origin = { x: vision.x, y: vision.y };
    for (const test of tests) {
      const wallCollision = CONFIG.Canvas.polygonBackends.sight.testCollision(
        origin,
        test.point,
        // @ts-expect-error v14 collision level not in fvtt-types
        { type: "sight", mode: "any", source: vision, useThreshold: true, priority: vision.priority, level: collisionLevel(token) }
      );
      let hasLOS = !wallCollision;
      // For cross-level tokens, also check surface collision (floors/ceilings between levels).
      // vision.elevation already reflects the visionTestHeight setting via getVisionOrigin override.
      if (hasLOS && !sameLevel) {
        const originElev = vision.elevation;
        const destElev = test.point.elevation;
        if (originElev !== destElev) {
          const surfaceBlocked = !!canvas.scene?.testSurfaceCollision?.(
            { x: origin.x, y: origin.y, elevation: originElev },
            { x: test.point.x, y: test.point.y, elevation: destElev },
            // @ts-expect-error fvtt-types: level is optional at runtime (every level is tested)
      { type: "sight", mode: "any" }
          );
          if (surfaceBlocked) hasLOS = false;
        }
      }
      // @ts-expect-error fvtt-types vision doesn't match PointVisionSource Map key
      test.los.set(vision, hasLOS);
    }
  }

  const lightSources = canvas.effects?.lightSources;
  for (const lightSource of (lightSources ?? [])) {
    if (/*!lightSource.data.vision ||*/ !lightSource.active || lightSource.data.disabled) continue;
    if (!validModes.has(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID) && !validModes.has("all")) continue;
    const result = lightSource.testVisibility && lightSource.testVisibility(config);
    if (result === true) matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
  }

  const lightPerception = (tokenDetectionModes as Record<string, any>).lightPerception;
  if (lightPerception && ["lightPerception", "all"].some(mode => validModes.has(mode))) {
    const result = (lightPerception && vision) ? modes.lightPerception.testVisibility(vision, lightPerception, config) : false;
    if (result === true)
      matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
  }

  const basic = tokenDetectionModes[DetectionModeCONST.BASIC_MODE_ID];
  if (basic && ["basicSight", "all"].some(mode => validModes.has(mode))) {
    const result = vision ? modes.basicSight.testVisibility(vision, basic, config) : false;
    if (result === true)
      matchedModes.add(detectionModes.basicSight?.id ?? DetectionModeCONST.BASIC_MODE_ID);
  }
  for (const [modeId, detectionMode] of Object.entries(tokenDetectionModes)) {
    if (modeId === DetectionModeCONST.BASIC_MODE_ID) continue;
    if (!detectionMode.enabled) continue;
    const dm = modes[modeId];
    if (validModes.has("all") || validModes.has(modeId)) {
      const result = vision ? dm?.testVisibility(vision, detectionMode, config) : false;
      if (result === true) {
        matchedModes.add(modeId);
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
  // The actor's dice appearance comes from the speaker; no message id, as DSN would then recompute visibility from it
  const speaker = actor ? speakerFor({ actor, token: actor.token ?? undefined }) : null;
  const diceUser = dsnDiceUser(actor);

  for (let roll of rolls) {
    if (dice3dEnabled()) {
      //@ts-expect-error game.dice3d
      const dice3d = game.dice3d;
      let ghostRoll = false;
      let whisperUsers: User.Implementation[] | null = null;
      // v14 message mode ("public"|"gm"|"blind"|"self"|"ic"); dnd5e + midi always emit v14 modes here.
      const rollMode = defaultRollMode || (safeGetGameSetting("core", "messageMode") as string);
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
          case "save":
          case "check": {
            // Drive save/ability-check DSN visibility from Auto Check Saves, independent of the roll's message mode:
            //   allShow          → full public dice
            //   all / allNoRoll  → ghost (GM sees the real dice; players see ghost dice, not the values)
            //   whisper / gmOnly → GM only (players see nothing)
            const sd = saveDisplay ?? configSettings.autoCheckSaves;
            if (["all", "allNoRoll"].includes(sd)) ghostRoll = true;
            else if (["whisper", "gmOnly"].includes(sd)) whisperUsers = ChatMessage.getWhisperRecipients("GM") as unknown as User[];
            dsnSetting = "show";
            break;
          }
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
        ghostRoll = rollMode === "blind";
      }

      if (rollMode === "self" || rollMode === "gm" || rollMode === "blind") {
        whisperUsers = ChatMessage.getWhisperRecipients("GM") as unknown as User[];
        if (rollMode !== "blind" && game.user) whisperUsers.push(game.user as unknown as User);
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
          else term.options.flavor = displayRoll.options.type;
        });
        if (ghostRoll) {
          promises.push(dice3d?.showForRoll(displayRoll, diceUser, true, ChatMessage.getWhisperRecipients("GM"), !game.user?.isGM, null, speaker));
          //@ts-expect-error
          if (game.settings.get("dice-so-nice", "showGhostDice")) {
            // @ts-expect-error
            displayRoll.ghost = true;
            promises.push(dice3d?.showForRoll(displayRoll, diceUser, true, game.users?.players.map(u => (u as User).id), game.user?.isGM, null, speaker));
          }
        } else
          promises.push(dice3d?.showForRoll(displayRoll, diceUser, true, whisperUsers, rollMode === "blind" && !game.user?.isGM, null, speaker));
      }
    }

  }
  if (promises.length) await Promise.all(promises);
  //mark all dice as shown - so that toMessage does not trigger additional display on other clients
  DSNMarkDiceDisplayed(rolls);
}

/**
 * The user Dice So Nice shows a roll for: the roller, or with DSN's "Force character owner appearance" set to All, the
 * player owning the actor (DSN's rule: whose character it is, else its only non-GM user), as DSN does for its own rolls.
 */
function dsnDiceUser(actor?: Actor.Implementation | null): User.Implementation | null {
  if (!actor?.hasPlayerOwner || safeGetGameSetting("dice-so-nice", "forceCharacterOwnerAppearance") !== "2") return game.user;
  let owner = game.users?.find(u => !u.isGM && u.character?.id === actor.id);
  if (!owner && actor.ownership.default !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
    const users = Object.keys(actor.ownership).filter(id => id !== "default" && game.users?.get(id) && !game.users.get(id)?.isGM);
    if (users.length === 1) owner = game.users?.get(users[0]);
  }
  return owner ?? game.user;
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
  // Group and (dnd5e 6.1) faction actors are not creatures
  if (["group", "faction"].includes(target.actor.type)) return false;
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

export function hasWallBlockingCondition(target: TokenOrDocument): boolean {
  return globalThis.MidiQOL.WallsBlockConditions.some(cond => hasCondition(target.actor, cond));
}

export function getActor(actorRef?: Actor.Implementation | TokenOrDocument | string | null): Actor.Implementation | undefined | null {
  if (!actorRef) return null;
  const entity = (typeof actorRef === "string") ? fromUuidSync(actorRef) : actorRef;
  if (entity instanceof Actor) return entity;
  if (entity instanceof foundry.canvas.placeables.Token) return entity.actor;
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
  if (entity instanceof foundry.canvas.placeables.Token) return entity.document;
  if (entity instanceof Actor) return tokenForActor(entity)?.document;
  return undefined;
}

export function getToken(tokenRef?: Actor.Implementation | TokenOrDocument | string | null): Token.Implementation | undefined {
  if (!tokenRef) return undefined;
  const entity = (typeof tokenRef === "string") ? fromUuidSync(tokenRef) : tokenRef;
  if (entity instanceof foundry.canvas.placeables.Token) return entity;
  if (entity instanceof TokenDocument) return tokenOf(entity as TokenDocument.Implementation);
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
  if (entity instanceof TokenDocument) return tokenOf(entity as TokenDocument.Implementation);
  return undefined;
}

type TokenCoverCalculator = { targetCover(target: TokenOrDocument): number };
type TokenCoverCalculatorClass = {
  createCoverCalculatorForTokenLocation?(token: Token.Implementation, position: { x: number, y: number }, elevation?: number): TokenCoverCalculator | undefined
};

/** Alternative Token Cover's calculator for the attacker, or one for the attacker standing at `origin` (a template's) */
function tokenCoverCalculator(attacker: Token.Implementation, origin?: CoverPosition): TokenCoverCalculator | undefined {
  const calculator = "coverCalculator" in attacker ? attacker.coverCalculator as TokenCoverCalculator | undefined : undefined;
  if (!origin || !calculator) return calculator;
  const calculatorClass = calculator.constructor as TokenCoverCalculatorClass;
  return calculatorClass.createCoverCalculatorForTokenLocation?.(attacker, { x: origin.x, y: origin.y }, origin.elevation) ?? calculator;
}

export function calcTokenCover(attacker: TokenOrDocument, target: TokenOrDocument, origin?: CoverPosition): number {
  const attackerToken = getToken(attacker);
  const targetToken = getToken(target);
  const coverCalc = attackerToken ? tokenCoverCalculator(attackerToken, origin) : undefined;
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
  return coverCalc.targetCover(target);
}

const MaxNameLength = 20;
export function getLinkText(entity?: TokenOrDocument | Actor.Implementation | Item.Implementation | null) {
  if (!entity) return "<unknown>";
  let name = entity.name ?? "unknown";
  if (entity instanceof foundry.canvas.placeables.Token && !configSettings.useTokenNames) name = entity.actor?.name ?? name;
  const uuid = entity instanceof foundry.canvas.placeables.Token ? entity.document.uuid : entity.uuid;
  if (entity instanceof foundry.canvas.placeables.Token) return `@UUID[${uuid}]{${name.slice(0, MaxNameLength - 5)}}`;
  return `@UUID[${uuid}]{${name?.slice(0, MaxNameLength - 5)}}`;
}

/** A token's image on midi's target lists: its actor's portrait for a character with Use Player Portrait; a video as a still */
export async function tokenPortrait(document: TokenDocument.Implementation): Promise<string> {
  let img = document.texture.src || document.actor?.img || "";
  // @ts-expect-error no dnd5e-types
  if (configSettings.usePlayerPortrait && document.actor?.type === "character") img = document.actor.img || document.texture.src || "";
  return foundry.helpers.media.VideoHelper.hasVideoExtension(img) ? videoThumbnail(img) : img;
}

/** A still of a video, from Foundry's cache of the thumbnails it made */
export async function videoThumbnail(src: string): Promise<string> {
  return game.video?.thumbs?.get(src) ?? await game.video?.createThumbnail(src, { width: 100, height: 100 }) ?? "";
}

export function getTokenName(entity?: TokenOrDocument | null): string {
  // No canvas token (another scene or level): named from its document
  const token = getToken(entity) ?? getTokenDocument(entity);
  if (!token) return "<unknown>";
  return getTokenNameExact(token) ?? "<unknown>";
}

export function getTokenNameExact(entity?: TokenOrDocument): string | undefined {
  if (!(entity instanceof foundry.canvas.placeables.Token) && !(entity instanceof TokenDocument)) return undefined;
  let name: string;
  if (configSettings.useTokenNames) name = entity.name ?? entity.actor?.name ?? "<unknown>";
  else name = entity.actor?.name ?? entity.name ?? "<unknown>";
  const suffix = safeGetGameSetting("hide-npc-names", "tokenHiddenSuffix");
  if (suffix) name = name.replace(` ${suffix}`, "");
  return name;
}

/**
 * Creates a proxy around canvas.grid that makes it behave like a SquareGrid.
 * Used for griddedGridless mode to apply square grid measurement rules to gridless scenes.
 * @returns A proxy that redirects grid methods to SquareGrid.prototype
 */
/** fvtt-types' BaseGrid#measurePath accepts nothing: measure with the core grid class the grid is */
export function measureGridPath(grid: foundry.grid.BaseGrid, waypoints: Canvas.Point[]): foundry.grid.BaseGrid.MeasurePathResult | undefined {
  if (grid instanceof foundry.grid.SquareGrid) return grid.measurePath(waypoints, {});
  if (grid instanceof foundry.grid.HexagonalGrid) return grid.measurePath(waypoints, {});
  if (grid instanceof foundry.grid.GridlessGrid) return grid.measurePath(waypoints, {});
  return undefined;
}

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

//@ts-expect-error protected
const isEvaluated = (roll: Roll): boolean => !!roll._evaluated;

/** An evaluated roll as is, a dice-free roll evaluated here; Foundry 14 can only roll dice asynchronously. */
function evaluatedForAdding(roll: Roll): Roll {
  if (isEvaluated(roll)) return roll;
  if (!roll.isDeterministic) {
    throw new Error(`midi-qol | addRollTo: "${roll.formula}" has dice that have not been rolled; use MidiQOL.addRollToAsync, which rolls them`);
  }
  return roll.clone().evaluateSync();
}

/** Add bonusRoll to roll. Dice-free rolls are evaluated here; rolls with dice must already be rolled (see addRollToAsync). */
export function addRollTo(roll: Roll, bonusRoll: Roll | Roll.Evaluated<Roll.Any>): Roll {
  const OperatorTerm = foundry.dice.terms.OperatorTerm;
  if (!bonusRoll) return roll;
  if (!roll) return bonusRoll;
  if (!isEvaluated(roll)) roll = evaluatedForAdding(roll);
  else {
    for (let term of roll.terms) {
      //@ts-expect-error protected
      if (!term._evaluated && term instanceof OperatorTerm) {
        term.evaluate();
      }
    }
  }
  bonusRoll = evaluatedForAdding(bonusRoll);
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
    terms = roll.terms.concat([operatorTerm]);
    terms = terms.concat(bonusRoll.terms);
  }
  //@ts-expect-error
  let newRoll = roll.constructor.fromTerms(terms);
  newRoll.resetFormula();
  newRoll.options = roll.options;
  return newRoll;
}

/** Add bonusRoll to roll, rolling either one first if it has not been evaluated. */
export async function addRollToAsync(roll: Roll, bonusRoll: Roll | Roll.Evaluated<Roll.Any>): Promise<Roll> {
  if (roll && !isEvaluated(roll)) roll = await roll.clone().evaluate();
  if (bonusRoll && !isEvaluated(bonusRoll)) bonusRoll = await bonusRoll.clone().evaluate();
  return addRollTo(roll, bonusRoll);
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
  const concentrationUuid = workflow?.concentrationId ? workflow.actor.effects.get(workflow.concentrationId)?.uuid : undefined;
  if (!targets || targets.count === 0) return;

  const { DialogV2 } = foundry.applications.api;
  const timeout = options?.timeout ?? configSettings.reactionTimeout ?? defaultTimeout;
  let countdown: DialogCountdown | undefined;

  const titleBase = `${i18n('CONTROLS.CommonSelect')} ${i18n('DOCUMENT.ActiveEffect')}`;
  const targetContent = `<p style="text-align:center"><b>${i18n('EFFECT.StatusTarget')}: [</b>${targets.documents.map((t) => t.name)}<b>]</b></p>`;

  const buttons = effects.map(effect => ({
    action: effect.uuid,
    label: effect.name,
    callback: () => effect,
  }));

  const chosenEffect = await DialogV2.wait({
    window: { title: titleBase },
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
      countdown ??= new DialogCountdown({ seconds: timeout, onExpire: () => dialog.close() });
      countdown.attach(dialog.element);
    },
    close: () => {
      countdown?.stop();
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
    concentrationUuid,
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
        `chooseEffect | applying effect ${chosenEffect.name} to ${targets.count} targets`,
        targets
      );
  }
  return chosenEffect;
}

export function canSee(tokenEntity: TokenOrDocument, targetEntity: TokenOrDocument, options: SenseOptions = {}): boolean {
  const token = getToken(tokenEntity);
  const target = getToken(targetEntity);
  if (!token || !target) return false;
  return sensesModes(token.document, target.document, { modes: "sight", forceVision: options.forceVision }).length > 0;
}

export function sumRolls(rolls: Array<Roll> | undefined = [], countHealing?: "ignore" | "negative" | "positive" | "negativeIgnoreTemp" | "positiveIgnoreTemp"): number {
  if (!rolls) return 0;
  if (countHealing === undefined) countHealing = "positive";
  return rolls.reduce((total, roll) => {
    const type = roll.options.type ?? "";
    if (type === "midi-none") return total;
    if (["temphp"].includes(type) && countHealing === "negativeIgnoreTemp") return total;
    if (["temphp"].includes(type) && countHealing === "positiveIgnoreTemp") return total;
    if (["temphp", "healing"].includes(type) && countHealing === "ignore") return total;
    if (["temphp", "healing"].includes(type) && countHealing?.startsWith("negative")) return total - (roll?.total ?? 0);
    return total + (roll?.total ?? 0);
  }, 0);
}


export const updatesCache = {};
/** Whether two roll arrays are the same rolls, by serialised form. */
function rollsMatch(current: readonly unknown[] | undefined, incoming: readonly unknown[]): boolean {
  if ((current?.length ?? 0) !== incoming.length) return false;
  const norm = (r: any) => typeof r === "string" ? r : JSON.stringify(r?.toJSON?.() ?? r);
  return (current ?? []).every((r, i) => norm(r) === norm(incoming[i]));
}

async function _updateAction(document: foundry.abstract.Document.Any, updates: ChatMessage.UpdateData) {
  const baseDocument = document.uuid ? fromUuidSync(document.uuid) as ChatMessage.Stored : null;
  if (document.uuid && isDeleting(document.uuid)) return document;
  if (!baseDocument) {
    console.warn(`midi-qol | _updateAction | baseDocument not found for ${document.uuid}`);
    return document;
  }
  if (debugEnabled) warn("_updateAction | Starting for", Date.now(), updates)
  delete updates._id

  // Every display passes all the rolls; rolls are only ever appended, so a match with the stored ones is no change
  if (Array.isArray(updates.rolls) && rollsMatch(baseDocument.rolls, updates.rolls)) {
    delete updates.rolls;
    // Replaced, not changed in place: getCachedDocument keeps a card's clone while its queue's object is the same
    if (updatesCache[baseDocument.uuid]) {
      const { rolls: _rolls, ...rest } = updatesCache[baseDocument.uuid];
      updatesCache[baseDocument.uuid] = rest;
    }
  }
  withoutEmptyObjects(updates);
  if (foundry.utils.isEmpty(updates)) {
    if (debugEnabled > 1) warn(`_updateAction | nothing left to write for ${document.uuid}`);
    // What is left is empty objects: an emptied queue would still count as changes to write
    if (updatesCache[baseDocument.uuid] && foundry.utils.isEmpty(withoutEmptyObjects(foundry.utils.deepClone(updatesCache[baseDocument.uuid])))) delete updatesCache[baseDocument.uuid];
    return document;
  }
  try {
    await baseDocument.update(updates);
  } catch (err) {
    // A rejected write would be sent again with every later one: its changes are dropped
    delete updatesCache[baseDocument.uuid];
    // The card was deleted while the write was on its way (deleted by hand, a chat clear): nothing to report
    if (!fromUuidSync(baseDocument.uuid)) return document;
    TroubleShooter.recordError(err, `_updateAction | the card ${baseDocument.uuid} rejected an update; its queued changes were dropped`);
    error(`_updateAction | ${baseDocument.uuid} rejected`, updates, err);
    return document;
  }
  const pending = pendingUpdates(updates, updatesCache[baseDocument.uuid] ?? {});
  if (foundry.utils.isEmpty(pending)) delete updatesCache[baseDocument.uuid];
  else updatesCache[baseDocument.uuid] = pending;
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

/**
 * The cached updates still to write once `sent` has landed: those queued while it was in flight. Compared by value,
 * arrays included: `diffObject` always finds a rebuilt array different, so arrays (targets, the hits list) stayed
 * cached and every later write sent their old values again, undoing changes made to the card since.
 */
function pendingUpdates(sent: object, cache: object): object {
  const sentFlat = foundry.utils.flattenObject(sent);
  const pending = Object.entries(foundry.utils.flattenObject(cache))
    .filter(([key, value]) => !(key in sentFlat) || JSON.stringify(sentFlat[key]) !== JSON.stringify(value));
  return withoutEmptyObjects(foundry.utils.expandObject(Object.fromEntries(pending)));
}

/** Empty objects removed, in place: an update merges `{}` as nothing, but it would still make a write */
function withoutEmptyObjects<T extends object>(updates: T): T {
  for (const [key, value] of Object.entries(updates)) {
    if (foundry.utils.getType(value) !== "Object") continue;
    withoutEmptyObjects(value);
    if (foundry.utils.isEmpty(value)) delete (updates as Record<string, unknown>)[key];
  }
  return updates;
}

/**
 * What `updates` changes: values the card already has are dropped, unless they override a queued value (the card would
 * otherwise get the queued one).
 */
function changedUpdates(uuid: string, updates: object): object {
  const card = fromUuidSync(uuid) as ChatMessage.Implementation | null;
  if (!card) return updates;
  const queued = updatesCache[uuid] ?? {};
  const changed = withoutStored(foundry.utils.diffObject(card._source, updates) as Record<string, unknown>, card._source, card);
  return foundry.utils.mergeObject(changed, foundry.utils.diffObject(queued, updates, { inner: true }), { inplace: true });
}

/**
 * What the document already has, or means by leaving out, is not a change: an array stored as is (JSON: diffObject
 * compares arrays of objects by key count, and a stored entry keeps keys whose value is undefined, which JSON drops), and
 * false or null for a system field the document has no value for (declared with no initial value: absent reads as
 * false/none; an undeclared key, e.g. in workflowOptions, can mean something else absent).
 */
function withoutStored(diff: Record<string, unknown>, source: Record<string, any> | undefined, card: ChatMessage.Implementation, path = ""): Record<string, unknown> {
  for (const [key, value] of Object.entries(diff)) {
    const stored = source?.[key];
    const at = path ? `${path}.${key}` : key;
    if (Array.isArray(value)) {
      if (Array.isArray(stored) && JSON.stringify(value) === JSON.stringify(stored)) delete diff[key];
    } else if (foundry.utils.getType(value) === "Object") {
      withoutStored(value as Record<string, unknown>, stored, card, at);
      if (foundry.utils.isEmpty(value)) delete diff[key];
    } else if ((value === false || value === null) && stored === undefined && at.startsWith("system.")
      && declaredField(card.system as foundry.abstract.DataModel.Any | undefined, at.slice(7))) delete diff[key];
  }
  return diff;
}

/** The schema field a model declares at `path`, through its schema and typed-object fields (keyed by any id) */
function declaredField(model: foundry.abstract.DataModel.Any | undefined, path: string): foundry.data.fields.DataField.Any | undefined {
  const { SchemaField, TypedObjectField } = foundry.data.fields;
  let field: foundry.data.fields.DataField.Any | undefined = model?.schema;
  for (const part of path.split(".")) {
    if (field instanceof SchemaField) field = field.fields[part];
    else if (field instanceof TypedObjectField) field = field.element;
    else return undefined;
  }
  return field;
}

/** Queue changes for a card's next write: only what changes the card or its queued changes */
export function queueUpdate(document: ChatMessage.Implementation, updates: ChatMessage.UpdateData): void {
  if (!document?.uuid) return;
  updates = foundry.utils.expandObject(updates) as typeof updates;
  if (typeof updates.content === "string") updates.content = compactCardContent(updates.content);
  // Rolls are compared when written (rollsMatch): the card stores them as strings, so a diff never matches
  const { rolls, ...rest } = updates as ChatMessage.UpdateData & { rolls?: unknown };
  updates = changedUpdates(document.uuid, rest) as typeof updates;
  if (rolls !== undefined) (updates as { rolls?: unknown }).rolls = rolls;
  updatesCache[document.uuid] = foundry.utils.mergeObject((updatesCache[document.uuid] ?? {}), updates, { inplace: false, overwrite: true });
}

/**
 * Write `updates` and the card's queued changes. A workflow queues its card's changes while a state runs and writes them
 * once (Workflow#performThrottledUpdate).
 */
export async function throttledUpdate(document: ChatMessage.Implementation, updates: ChatMessage.UpdateData) {
  if (!document) return; // ChatCard was removed already?;
  const uuid = document.uuid;
  // A temporary card: nothing to write
  if (!uuid) return document;
  queueUpdate(document, updates);
  // One write per card at a time: a write waits for the one in flight, then sends what is still queued
  const write = (cardWrites.get(uuid) ?? Promise.resolve())
    .then(() => _updateAction(document, foundry.utils.duplicate(updatesCache[uuid] ?? {}) as ChatMessage.UpdateData));
  const settled = write.catch(() => undefined);
  cardWrites.set(uuid, settled);
  settled.then(() => { if (cardWrites.get(uuid) === settled) cardWrites.delete(uuid); });
  return await write;
}
const cardWrites = new Map<string, Promise<unknown>>();
// Cards being deleted, and since when: a write sent now would reach the server after the delete and be rejected. Kept a
// while only, in case the server refuses the delete
const deletingCards = new Map<string, number>();
const isDeleting = (uuid: string) => Date.now() - (deletingCards.get(uuid) ?? -Infinity) < 30000;

/**
 * A card about to be deleted, by any client-side delete (ChatMessageMidi._preDeleteOperation): its write in flight lands
 * first, its queued writes are dropped and no new ones sent
 */
export async function settleCardWrites(uuid: string): Promise<void> {
  deletingCards.set(uuid, Date.now());
  delete updatesCache[uuid];
  await cardWrites.get(uuid);
}

/** The card is gone: writes for it are no longer held */
export function forgetDeletingCard(uuid: string): void {
  deletingCards.delete(uuid);
  delete updatesCache[uuid];
}

export function getUpdatesCache(uuid: string | undefined | null) {
  if (!uuid) return {};
  return updatesCache[uuid] ?? {};
}

export function addUpdatesCacheFlags(uuid: string | undefined | null, updates: any, prepend = MODULE_ID) {
  if (!uuid) return;
  if (prepend) updates = { [prepend]: updates };
  updates = changedUpdates(uuid, foundry.utils.expandObject({ flags: updates }));
  updatesCache[uuid] = foundry.utils.mergeObject(updatesCache[uuid] ?? {}, updates, { insertKeys: true, insertValues: true, inplace: false });
}

export function addUpdatesCache(uuid: string | undefined | null, updates: any) {
  if (!uuid) return;
  const { rolls, ...rest } = foundry.utils.expandObject(updates) as Record<string, unknown>;
  const changed = changedUpdates(uuid, rest) as Record<string, unknown>;
  if (rolls !== undefined) changed.rolls = rolls;
  updates = changed;
  updatesCache[uuid] = foundry.utils.mergeObject(updatesCache[uuid] ?? {}, updates, { insertKeys: true, insertValues: true, inplace: false });
}

export function clearUpdatesCache(uuid: string | undefined | null) {
  if (!uuid) return;
  delete updatesCache[uuid];
}


// A card with its queued changes, kept until either changes: the queue's entry is replaced on every change (queueUpdate,
// addUpdatesCache…) and the card's own update drops it
const cardClones = new Map<string, { document: ChatMessage.Implementation, updates: object, clone: ChatMessage.Implementation }>();
let cardClonesHooked = false;

/** A card as it will be once its queued changes are written: the stored card when none are queued */
export function getCachedDocument(uuid: string | undefined | null) {
  if (!uuid) return undefined;
  const document = fromUuidSync(uuid, { strict: false }) as ChatMessage.Implementation;
  const updates = document?.uuid && updatesCache[document.uuid as string];
  if (foundry.utils.isEmpty(updates)) return document;
  if (!cardClonesHooked) {
    cardClonesHooked = true;
    Hooks.on("updateChatMessage", (message: ChatMessage.Implementation) => { if (message.uuid) cardClones.delete(message.uuid); });
    Hooks.on("deleteChatMessage", (message: ChatMessage.Implementation) => { if (message.uuid) cardClones.delete(message.uuid); });
  }
  const kept = cardClones.get(uuid);
  if (kept && kept.document === document && kept.updates === updates) return kept.clone;
  //@ts-expect-error no dnd5e-types - changes not in fvtt types
  const clone = document.clone(updates, { changes: updates, keepId: true }) as ChatMessage.Implementation;
  cardClones.set(uuid, { document, updates, clone });
  return clone;
}

export function isEffectExpired(effect: ActiveEffect.Implementation): boolean {
  if (typeof globalThis.DAE?.isEffectExpired === "function") return globalThis.DAE.isEffectExpired(effect);
  return effect.duration.remaining <= 0;
}

/**
 * End effects by a special duration (or another midi expiry): each goes to DAE's expireEffect, which deletes it or
 * suppresses it (disabled, kept) as its Expiry Mode and DAE's Special Duration Expiry Action say.
 */
export async function expireEffects(actor: Actor.Implementation, effects: ActiveEffect.Implementation[], options: any): Promise<any> {
  if (!effects) return {};
  const expired: string[] = [];
  for (const effect of effects) {
    // another expiry (e.g. a concurrent one for a different key) may have removed it
    if (!effect.id || !effect.parent?.effects.has(effect.id)) continue;
    if (effect.uuid) endingEffects.add(effect.uuid);
    try {
      await globalThis.DAE.expireEffect(effect, options);
      expired.push(effect.id);
    } catch (err) {
      console.warn(`midi-qol | expireEffects: ${effect.name} (${effect.uuid})`, err);
    } finally {
      if (effect.uuid) endingEffects.delete(effect.uuid);
    }
  }
  return { expired };
}
// Effects being expired: still in their collection until the server's reply, so a change made to them meanwhile fails
const endingEffects = new Set<string>();

/** Remove effects: applied effects and enchantments are deleted, an item's own (transfer) effects disabled. */
export async function deleteAppliedEffects(actor: Actor.Implementation, effects: ActiveEffect.Implementation[], options: Record<string, unknown> = {}): Promise<{ deleted: string[], disabled: ActiveEffect[], itemEffects: ActiveEffect[] }> {
  if (!effects) return { deleted: [], disabled: [], itemEffects: [] };
  const actorEffectsToDelete: string[] = [];
  const effectsToDelete: ActiveEffect[] = [];
  const effectsToDisable: ActiveEffect[] = [];
  for (let effect of effects) {
    if (!effect.id) continue;
    if (!effect.uuid || !fromUuidSync(effect.uuid)) continue;
    // @ts-expect-error no dnd5e-types
    if (effect.parent instanceof Item && effect.type === "enchantment") {
      // an applied enchantment; never an enchantment's own definition
      // @ts-expect-error no dnd5e-types
      if (effect.isAppliedEnchantment) effectsToDelete.push(effect);
    } else if (effect.transfer)
      effectsToDisable.push(effect);
    else if (effect.parent instanceof Actor)
      actorEffectsToDelete.push(effect.id);
  }
  if (actorEffectsToDelete.length > 0) await actor.deleteEmbeddedDocuments("ActiveEffect", actorEffectsToDelete, options);
  for (let effect of effectsToDisable) await effect.update({ "disabled": true }, options);
  for (let effect of effectsToDelete) await effect.delete(options);
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
    let token: TokenDocument.Implementation | undefined, actor: Actor.Implementation | undefined | null;
    if (action === "concentration" && type === "midi-concentration") {
      let dc = Number(dcStr);
      let { actor: actorId, scene, token: tokenId } = message.speaker;
      if (scene && tokenId) token = game.scenes?.get(scene)?.tokens.get(tokenId);
      if (token) actor = token.actor;
      if (!actor && actorId) actor = game.actors?.get(actorId);
      if (actor) {
        // Claimed before the await, so a second render of the same message cannot roll again.
        concentrationRequestsHandled.add(message.id!);
        await message.setFlag(MODULE_ID, "concentrationRolled", true);
        const user = playerForActor(actor);
        // @ts-expect-error no dnd5e-types
        const gmRoll = () => actor.rollConcentration({ legacy: false, target: dc }, { configure: false }, { create: true, rollMode: "gm" });
        // The player's roll through the request core (M5b): their dialog shows the deadline; on time-out, disconnect or the
        // GM's choice the GM rolls it here, and a roll the player confirms after that is cancelled (dnd5e's
        // rollConcentration hook ends concentration wherever it's rolled, so two rolls could both count)
        if (user?.active && !user.isSelf) void askUser<unknown>(user, {
          type: CONCENTRATION_REQUEST, data: { actorUuid: actor.uuid, target: dc, create: true, rollMode: "gm" },
          kind: "concentration", actorUuid: actor.uuid ?? undefined, tokenUuid: token?.uuid ?? undefined,
          label: i18nFormat("midi-qol.PlayerWaits.ConcentrationLabel", { dc }),
          timeoutMs: (configSettings.playerSaveTimeout ?? 0) * 1000,
          fallback: gmRoll,
          gmChoices: { roll: { label: "midi-qol.PlayerWaits.Choice.normal", value: gmRoll } }
        }).settled.catch(err => error("concentration | the roll could not be made", err));
        // @ts-expect-error no dnd5e-types
        else actor.rollConcentration({ legacy: false, target: dc }, {}, { create: true, rollMode: "gm" });
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
  if (dependent instanceof foundry.canvas.placeables.Token) dependent = dependent.document;
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
export async function CEAddEffectWith(options: { uuid: string | null | undefined, effectName?: string, effectId?: string, origin?: any, effectData?: any, overlay: boolean }) {
  return ceInterface?.addEffect({ ...options, uuid: options.uuid ?? undefined });
}

export async function CERemoveEffect(options: { effectName: string, uuid: string | null | undefined, effectId?: string, origin?: string | null }) {
  return ceInterface?.removeEffect({ ...options, uuid: options.uuid ?? undefined });
}

export async function CEToggleEffect(options: { effectName?: string, uuid: string, effectId?: string, origin?: string | null, overlay?: boolean }) {
  const { effectName, uuid, effectId, origin, overlay } = options;
  return ceInterface?.toggleEffect({ uuids: [uuid], effectName, effectId, origin, overlay });
}

export function CEHasEffectApplied(options: { effectName: string, uuid: string | null | undefined, effectId?: string, origin?: string }): boolean {
  return !!ceInterface?.hasEffectApplied({ ...options, uuid: options.uuid ?? undefined });
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

/** The templates a use of the activity places by hand: none when it has no area or places its own */
export function expectedTemplateCount(activity?: Activity): number {
  return activity && activityHasAreaTarget(activity) && !activityHasAutoPlaceTemplate(activity) ? Number(activity.target?.template?.count) || 1 : 0;
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
 * @returns Converted duration with type, seconds, rounds, and turns
 */
export function convertDuration(
  durationData: { units: string; value: number } | undefined,
  inCombat: boolean
): ConvertedDuration {
  const roundTime = CONFIG.time.roundTime ?? 6;

  // No duration or invalid - return minimal duration
  if (!durationData?.units) {
    return { type: "seconds", seconds: 1, rounds: 0, turns: 0 };
  }

  const { units, value } = durationData;

  // Handle special/permanent duration types - no expiry
  if (["spec", "perm", "disp", "dstr"].includes(units)) {
    return { type: "none", seconds: undefined, rounds: undefined, turns: undefined };
  }

  // Handle instantaneous - minimal duration
  if (units === "inst") {
    return { type: "seconds", seconds: 1, rounds: 0, turns: 0 };
  }

  // Turns stay turns - core tracks them once a combat exists, and a turn has no seconds equivalent.
  if (["turn", "turns"].includes(units)) {
    return { type: "turns", seconds: undefined, rounds: 0, turns: value };
  }

  if (["round", "rounds"].includes(units)) {
    return {
      type: inCombat ? "turns" : "seconds",
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

  // Time-based units stay seconds - core tracks them in and out of combat.
  return { type: "seconds", seconds, rounds: Math.floor(seconds / roundTime), turns: 0 };
}

export function getSaveRollModeFor(abilityId: string) {
  if (configSettings.rollChecksBlind.includes("all") || configSettings.rollChecksBlind.includes(abilityId))
    return "blind";
  return configSettings.autoCheckSaves !== "allShow" ? "gm" : "public";
}

export function getCheckRollModeFor(abilityId: string) {
  if (configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes(abilityId))
    return "blind";
  return configSettings.autoCheckSaves !== "allShow" ? "gm" : "public";
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
        target.setTarget(true, { releaseOthers: false });
        if (target.document.id) targetIds.push(target.document.id);
      }
    }

    game.user?.broadcastActivity({ targets: targetIds });
  }
  return true;
}

// --- Target save/restore ---

export function updateUserTargets(targetIds: (string | null | undefined)[]) {
  canvas.tokens?.setTargets(targetIds.filter((id): id is string => !!id));
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
let _savedTargetIds: (string | null)[] | null = null;
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

export function getItemFromEffectOrigin(origin: string, alreadyVisited: string[] = []): Item.Implementation | undefined {
  let originItem: Item.Implementation | undefined;
  if (alreadyVisited.includes(origin)) return;
  const originDoc = fromUuidSync(origin) as ActiveEffect.Implementation | Item.Implementation | Activity | undefined;
  if (originDoc instanceof Item) return originDoc;
  if (originDoc?.item instanceof Item) return originDoc.item;
  if (originDoc?.parent instanceof Item) {
    originItem = originDoc.parent;
  } else if (typeof originDoc?.origin === "string") {
    originItem = getItemFromEffectOrigin(originDoc.origin, [...alreadyVisited, origin]);
    // recursive so @michael can feel fancy
  }
  // Fallback: if we couldn't resolve to an Item (e.g. grandchild embedded docs on synthetic actors),
  // try stripping the ActiveEffect or Activity segment to resolve the parent Item directly
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

export function getTargetDescriptor<T extends DND5ETargetDescriptor>(uuid: string, targetDescriptors: Array<T> | undefined): T | undefined {
  if (!uuid || !targetDescriptors) return undefined;
  return targetDescriptors?.find(td => td.actor === uuid);
}

export const throttledScrollBottom = foundry.utils.throttle(() => {
  ui.chat?.scrollBottom({ waitImages: true });
}, 150);

/** Per actor, midi's latest fixed-id effect change. */
const actorEffectQueues = new Map<string | null, Promise<unknown>>();

/** Runs `fn` after midi's earlier fixed-id effect changes for the actor (concurrent ones fail). `fn` must not queue for the same actor. */
export async function queueActorEffects<T>(actor: Actor.Implementation, fn: () => Promise<T>): Promise<T> {
  const key = actor.uuid;
  const run = (actorEffectQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
  actorEffectQueues.set(key, run);
  try {
    return await run;
  } finally {
    if (actorEffectQueues.get(key) === run) actorEffectQueues.delete(key);
  }
}

/** Deletes the actor's effect `id` if present; another caller deleting it first counts as done. */
export async function deleteEffectIfPresent(actor: Actor.Implementation, id: string | null) {
  try {
    await (id ? actor.effects.get(id) : undefined)?.delete();
  } catch (err) {
    if (!/does not exist/.test(String((err as Error)?.message ?? err))) throw err;
  }
}

/** Creates an effect keeping its fixed id; another caller creating it first counts as done. */
export async function createEffectWithId(actor: Actor.Implementation, data: ActiveEffect.CreateData, options: { midiLedger?: boolean } = {}) {
  try {
    await ActiveEffect.implementation.create(data, { parent: actor, keepId: true, ...options });
  } catch (err) {
    if (!/already exists/.test(String((err as Error)?.message ?? err))) throw err;
  }
}

/** actor.toggleStatusEffect, queued; losing a race with another module counts as done. */
export async function toggleStatus(actor: Actor.Implementation | null | undefined, statusId: string,
  options: Actor.ToggleStatusEffectOptions = {}): Promise<ActiveEffect.Implementation | boolean | undefined> {
  if (!actor) return undefined;
  return queueActorEffects(actor, () => applyStatus(actor, statusId, options));
}

/**
 * Apply a status to an actor as the condition itself (the document the token HUD creates), not an effect carrying it.
 * `specialDuration` adds to the status's own; `prepare` sets the rest (origin, dependency). A creature that already
 * has the status keeps it.
 */
export async function applyStatusCondition(actor: Actor.Implementation | null | undefined, statusId: string,
  { specialDuration = [], prepare }: { specialDuration?: string[], prepare?: (effectData: ActiveEffect.CreateData) => void } = {}): Promise<void> {
  if (!actor || !CONFIG.statusEffects.find(se => se.id === statusId)) return;
  const effectData = (await ActiveEffect.implementation.fromStatusEffect(statusId)).toObject();
  prepare?.(effectData);
  const durations = new Set([...((effectData.flags?.dae?.specialDuration as string[] | undefined) ?? []), ...specialDuration]);
  if (durations.size) foundry.utils.setProperty(effectData, "flags.dae.specialDuration", [...durations]);
  const has = () => effectData._id ? actor.effects.has(effectData._id)
    : actor.effects.some(ef => ef.statuses.size === 1 && ef.statuses.has(statusId));
  if (has()) return;
  if (!actor.isOwner) {
    await unTimedExecuteAsGM("createEffects", { actorUuid: actor.uuid, effects: [effectData], options: { keepId: true } });
    return;
  }
  await queueActorEffects(actor, async () => { if (!has()) await createEffectWithId(actor, effectData); });
}

async function applyStatus(actor: Actor.Implementation, statusId: string,
  options: Actor.ToggleStatusEffectOptions): Promise<ActiveEffect.Implementation | boolean | undefined> {
  try {
    return await actor.toggleStatusEffect(statusId, options);
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    if (options.active === true && /already exists/.test(message)) return true;
    if (options.active === false && /does not exist/.test(message)) return false;
    throw err;
  }
}

/**
 * The use's targets as the message's targets (dnd5e's TargetsField descriptors), so dnd5e's use and rolls describe the
 * use's targets rather than reading the player's (M2 stage 7: automated uses don't write game.user.targets). Targets the
 * caller put in the message stay.
 */
export function setMessageTargets<M extends object>(message: M, workflow: { targets?: TokenDocumentSet } | undefined): M {
  if (!workflow?.targets) return message;
  if (foundry.utils.getProperty(message, "data.system.targets") !== undefined) return message;
  const TargetsField = globalThis.dnd5e?.dataModels?.chatMessage?.fields?.TargetsField;
  if (!TargetsField) return message;
  foundry.utils.setProperty(message, "data.system.targets", TargetsField.getDescriptors(workflow.targets.documents));
  return message;
}
