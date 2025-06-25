import { registerSettings, fetchParams, configSettings, checkRule, enableWorkflow, midiSoundSettings, fetchSoundSettings, midiSoundSettingsBackup, disableWorkflowAutomation, readySettingsSetup, collectSettingData, safeGetGameSetting } from './module/settings.js';
import { preloadTemplates } from './module/preloadTemplates.js';
import { checkModules, installedModules, setupModules } from './module/setupModules.js';
import { itemPatching, visionPatching, actorAbilityRollPatching, readyPatching, initPatching, addDiceTermModifiers } from './module/patching.js';
import { initHooks, readyHooks, setupHooks } from './module/Hooks.js';
import { SaferSocket, initGMActionSetup, setupSocket, socketlibSocket, unTimedExecuteAsGM } from './module/GMAction.js';
import { setupSheetQol } from './module/sheetQOL.js';
import { TrapWorkflow, DamageOnlyWorkflow, Workflow, DummyWorkflow, DDBGameLogWorkflow, UserWorkflow } from './module/Workflow.js';
import { addConcentrationDependent, addRollTo, applyTokenDamage, canSee, canSense, canSenseModes, checkDistance, checkIncapacitated, checkNearby, checkRange, chooseEffect, completeItemUse, computeCoverBonus, contestedRoll, createConditionData, debouncedUpdate, displayDSNForRoll, doConcentrationCheck, doOverTimeEffect, evalAllConditions, evalCondition, findNearby, findNearbyCount, getCachedDocument, getChanges, getConcentrationEffect, getTokenDocument, getOrCreateTokenForActor, getOrCreateTokenForActorAsSet, getTokenPlayerName, getTokenPlayerNameForUser, getTraitMult, hasCondition, hasUsedBonusAction, hasUsedReaction, isValidTarget, midiRenderAttackRoll, midiRenderBonusDamageRoll, midiRenderDamageRoll, midiRenderOtherDamageRoll, midiRenderRoll, fromActorUuid, playerFor, playerForActor, raceOrType, reactionDialog, removeHiddenCondition, removeInvisibleCondition, removeReactionUsed, reportMidiCriticalFlags, setBonusActionUsed, setReactionUsed, tokenForActor, typeOrRace, validRollAbility, MQfromUuidSync, actorFromUuid, createDamageDetail, removeActionUsed, removeBonusActionUsed, getCheckRollModeFor, getSaveRollModeFor, completeActivityUse, checkActivityRange, modifyDamageBy, computeDistance, addDependent, cleanCPRFlanked, updatesCache } from './module/utils.js';
import { ConfigPanel } from './module/apps/ConfigPanel.js';
import { RollStats } from './module/RollStats.js';
import { OnUseMacroOptions } from './module/apps/Item.js';
import { MidiKeyManager } from './module/MidiKeyManager.js';
import { MidiSounds } from './module/midi-sounds.js';
import { addUndoChatMessage, getUndoQueue, removeMostRecentWorkflow, showUndoQueue, undoMostRecentWorkflow } from './module/undo.js';
import { showUndoWorkflowApp } from './module/apps/UndoWorkflow.js';
import { TroubleShooter } from './module/apps/TroubleShooter.js';
import { TargetConfirmationDialog } from './module/apps/TargetConfirmation.js';
import { MidiAttackActivity, setupAttackActivity } from './module/activities/AttackActivity.js';

export function getGame(): Game | undefined {
  return game as Game;
}

export function getCanvas(): Canvas | undefined {
  if (!canvas || !canvas.scene) {
    error("Canvas/Scene not ready - roll automation will not function");
    return undefined;
  }
  return canvas;
}

export let debugEnabled = 0;
// 0 = none, warnings = 1, debug = 2, all = 3
export let debug = (...args) => { if (debugEnabled > 1) console.log("DEBUG: midi-qol | ", ...args) };
export let log = (...args) => console.log("midi-qol | ", ...args);
export let warn = (...args) => { if (debugEnabled > 0) console.warn("midi-qol | ", ...args) };
export let error = (...args) => console.error("midi-qol | ", ...args);
export let timelog = (...args) => warn("midi-qol | ", Date.now(), ...args);
export var levelsAPI;
export var allDamageTypes;
export const MODULE_ID = "midi-qol";
export const ArrayField = foundry.data.fields.ArrayField;
export const ObjectField = foundry.data.fields.ObjectField
export const BooleanField = foundry.data.fields.BooleanField;
export const NumberField = foundry.data.fields.NumberField;
export const StringField = foundry.data.fields.StringField;
export const SchemaField = foundry.data.fields.SchemaField;
//@ts-expect-error
export const TokenClass = foundry.canvas.placeables.Token;
export var isDnD = false;


export let i18n = (key: string) => {
  return getGame()?.i18n?.localize(key) ?? key;
};
export function i18nSystem(key) {
  const keyHeader = game.system?.id.toUpperCase();
  return i18n(`${keyHeader}.${key}`);
}
export let i18nFormat = (key: string, data = {}) => {
  return game.i18n?.format(key, data) ?? key;
}
export function geti18nOptions(key) {
  let translation: any = game.i18n?.translations[MODULE_ID] ?? {};
  //@ts-ignore _fallback not accessible
  let fallback: any = game.i18n._fallback[MODULE_ID] ?? {};
  fallback = (fallback instanceof String) ? fallback : (foundry.utils.getProperty(fallback, key) ?? {});
  translation = (translation instanceof String) ? translation : (foundry.utils.getProperty(translation, key) ?? {});

  translation = foundry.utils.mergeObject(fallback ?? {}, translation ?? {}, { overwrite: true, inplace: false });
  return translation;
}
export function geti18nTranslations() {
  //@ts-expect-error
  return foundry.utils.mergeObject(game.i18n?._fallback[MODULE_ID] ?? {}, game.i18n.translations[MODULE_ID] ?? {});
}

export function getStaticID(id: string): string {
  id = `dnd5e${id}`;
  if (id.length >= 16) return id.substring(0, 16);
  return id.padEnd(16, "0");
}

export let setDebugLevel = (debugText: string) => {
  debugEnabled = { "none": 0, "warn": 1, "debug": 2, "all": 3 }[debugText] || 0;
  // 0 = none, warnings = 1, debug = 2, all = 3
  if (debugEnabled >= 3) CONFIG.debug.hooks = true;
}

export let noDamageSaves: string[] = [];
export let undoDamageText;
export let savingThrowText;
export let savingThrowTextAlt;
export let MQdefaultDamageType;
export let midiFlags: string[] = [];
export let allAttackTypes: string[] = []
export let gameStats: RollStats;
export let overTimeEffectsToDelete = {};
export let savedOverTimeEffectsToDelete = {}
export let MQItemMacroLabel: string;
export let MQActivityMacroLabel: string;
export let MQDeferMacroLabel: string;
export let MQOnUseOptions;
export let GameSystemConfig;
export let SystemString;
export let systemConcentrationId;
export let midiReactionEffect;
export let midiBonusActionEffect;
export let midiFlankingEffect;
export let midiFlankedEffect;

export const NumericTerm = foundry.dice.terms.NumericTerm;
export const MESSAGE_TYPES = {
  HITS: 1,
  SAVES: 2,
  ATTACK: 3,
  DAMAGE: 4,
  OTHER: 5,
  ITEM: 0
};
export let cleanSpellName = (name: string): string => {
  // const regex = /[^가-힣一-龠ぁ-ゔァ-ヴーa-zA-Z0-9ａ-ｚＡ-Ｚ０-９々〆〤]/g
  const regex = /[^가-힣一-龠ぁ-ゔァ-ヴーa-zA-Z0-9ａ-ｚＡ-Ｚ０-９а-яА-Я々〆〤]/g
  return name.toLowerCase().replace(regex, '').replace("'", '').replace(/ /g, '');
}

/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
Hooks.once("levelsReady", function () {
  //@ts-ignore
  levelsAPI = CONFIG.Levels.API;
});
export let systemString = "DND5E"
export let MQDamageRollTypes = ["defaultDamage", "otherDamage", "bonusDamage"];
Hooks.once("init", () => {
  // @ts-expect-error
  CONFIG.ChatMessage.documentClass = defineChatMessageMidiClass(CONFIG.ChatMessage.documentClass);
  // @ts-expect-error
  CONFIG.Combat.documentClass = MidiCombat5e;
});

globalThis.MidiQOL ??= {}
globalThis.MidiQOL.checkIncapacitated = checkIncapacitated;

function setupSheets() {
  setupMidiItemSheet5e();
}

function setupActivities() {
  globalThis.MidiQOL.activityTypes = {};
  setupMidiActivityMixin();
  setupAttackActivity();
  globalThis.MidiQOL.activityTypes["attack"] = { documentClass: MidiAttackActivity };
  setupDamageActivity();
  globalThis.MidiQOL.activityTypes["damage"] = { documentClass: MidiDamageActivity };
  setupCastActivity();
  globalThis.MidiQOL.activityTypes["cast"] = { documentClass: MidiCastActivity };
  setupSaveActivity();
  globalThis.MidiQOL.activityTypes["save"] = { documentClass: MidiSaveActivity };
  setupCheckActivity(); // must happen after setupSaveActivity
  globalThis.MidiQOL.activityTypes["check"] = { documentClass: MidiCheckActivity };
  setupEnchantActivity();
  globalThis.MidiQOL.activityTypes["enchant"] = { documentClass: MidiEnchantActivity };
  setupHealActivity();
  globalThis.MidiQOL.activityTypes["heal"] = { documentClass: MidiHealActivity };
  setupSummonActivity();
  globalThis.MidiQOL.activityTypes["summon"] = { documentClass: MidiSummonActivity };
  setupUtilityActivity();
  globalThis.MidiQOL.activityTypes["utility"] = { documentClass: MidiUtilityActivity };
  setupForwardActivity();
  globalThis.MidiQOL.activityTypes["forward"] = { documentClass: MidiForwardActivity };
  globalThis.MidiQOL.activityTypes["MidiActivityMixin"] = MidiActivityMixin;
}

Hooks.once('init', async function () {
  //@ts-expect-error
  GameSystemConfig = game.system.config;
  //@ts-expect-error
  if (game.release.generation < 12) Math.clamp = Math.clamped;
  log('Initializing midi-qol');
  setupActivities();
  setupSheets();
  //@ts-expect-error
  const systemVersion = game.system.version;
  Hooks.once('dfreds-convenient-effects.ready()', () => {
    setupMidiStatusEffects();
  });
  addConfigOptions();
  //@ts-expect-error
  game.system.config.areaTargetTypes["emanationNoTemplate"] = {
    label: i18n("midi-qol.emanationNoTemplate"),
    template: "rect",
    standard: true,
    counted: "midi-qol.emanationTemplate.counted"
  };


  //@ts-expect-error
  if (game.release.generation < 12 && !Math.clamp) Math.clamp = Math.clamped;

  GameSystemConfig.damageTypes["none"] = { label: i18n("midi-qol.noType"), icon: `systems/${game.system?.id}/icons/svg/trait-damage-immunities.svg` };
  GameSystemConfig.damageTypes["midi-none"] = { label: i18n("midi-qol.midi-none"), icon: `systems/${game.system?.id}/icons/svg/trait-damage-immunities.svg` };
  SystemString = game.system?.id.toUpperCase();
  allAttackTypes = ["rwak", "mwak", "rsak", "msak"];
  if (game.system?.id === "sw5e")
    allAttackTypes = ["rwak", "mwak", "rpak", "mpak"];
  initHooks();

  // @ts-expect-error no dnd5e-types
  systemConcentrationId = CONFIG.specialStatusEffects.CONCENTRATING;

  // globalThis.MidiQOL = { checkIncapacitated };
  // Assign custom classes and constants here

  // Register custom module settings
  registerSettings();
  fetchParams();
  fetchSoundSettings();
  // This seems to cause problems for localisation for the items compendium (at least for french)
  // Try a delay before doing this - hopefully allowing localisation to complete
  // If babele is installed then wait for it to be ready
  if (game.modules?.get("babele")?.active) {
    Hooks.once("babele.ready", MidiSounds.getWeaponBaseTypes);
  } else {
    setTimeout(MidiSounds.getWeaponBaseTypes, 6000);
  }
  // Preload Handlebars templates
  preloadTemplates();
  // Register custom sheets (if any)
  initPatching();
  addDiceTermModifiers();
  globalThis.MidiKeyManager = new MidiKeyManager();
  globalThis.MidiKeyManager.initKeyMappings();
  Hooks.on("error", (...args) => {
    let [message, err] = args;
    TroubleShooter.recordError(err, message);
  });
});
Hooks.on("dae.modifySpecials", (specKey, specials, _characterSpec) => {
  specials[`flags.${MODULE_ID}.onUseMacroName`] = [new StringField(), CONST.ACTIVE_EFFECT_MODES.CUSTOM];
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.onUseMacroName`);
  specials[`flags.${MODULE_ID}.optional.NAME.macroToCall`] = [new StringField(), CONST.ACTIVE_EFFECT_MODES.CUSTOM];
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.macroToCall`);
  for (let type of ["dm", "da", "di", "dv", "dr"]) {
    // specials[`system.traits.${type}.midi.all`] = [new StringField(), -1];
    // daeFieldBrowserFields.push(`system.traits.${type}.midi.all`);
    specials[`system.traits.${type}.midi.magical`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.${type}.midi.magical`);
    specials[`system.traits.${type}.midi.non-magical`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.${type}.midi.non-magical`);
    specials[`system.traits.${type}.midi.non-magical-physical`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.${type}.midi.non-magical-physical`);
    specials[`system.traits.${type}.midi.non-silver-physical`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.${type}.midi.non-silver-physical`);
    specials[`system.traits.${type}.midi.non-adamant-physical`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.${type}.midi.non-adamant-physical`);
    specials[`system.traits.${type}.midi.non-physical`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.${type}.midi.non-physical`);
    specials[`system.traits.${type}.midi.physical`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.${type}.midi.physical`);
    specials[`system.traits.${type}.midi.spell`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.${type}.midi.spell`);
    specials[`system.traits.${type}.midi.non-spell`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.${type}.midi.non-spell`);
    if (!["dm", "da"].includes(type)) allAttackTypes.forEach(attackType => {
      specials[`system.traits.${type}.midi.${attackType}`] = [new StringField(), -1];
      daeFieldBrowserFields.push(`system.traits.${type}.midi.${attackType}`);
    });
  }

  if (GameSystemConfig.damageTypes) {
    specials[`system.traits.dm.midi.all`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.dm.midi.all`);
    Object.keys(GameSystemConfig.damageTypes).forEach(dType => {
      specials[`system.traits.dm.amount.${dType}`] = [new StringField(), -1]
      daeFieldBrowserFields.push(`system.traits.dm.${dType}`);
    });
    Object.keys(GameSystemConfig.itemActionTypes).forEach(aType => {
      specials[`system.traits.dm.midi.${aType}`] = [new StringField(), -1];
      daeFieldBrowserFields.push(`system.traits.dm.midi.${aType}`);
    });
    Object.keys(GameSystemConfig.healingTypes).forEach(dType => {
      specials[`system.traits.dm.amount.${dType}`] = [new StringField(), -1];
      daeFieldBrowserFields.push(`system.traits.dm.midi.${dType}`);
    });
    specials[`system.traits.da.midi.all`] = [new StringField(), -1];
    daeFieldBrowserFields.push(`system.traits.da.midi.all`);
    Object.keys(GameSystemConfig.damageTypes).forEach(dType => {
      specials[`system.traits.da.${dType}`] = [new StringField(), -1];
      daeFieldBrowserFields.push(`system.traits.da.${dType}`);
    });
    Object.keys(GameSystemConfig.itemActionTypes).forEach(aType => {
      specials[`system.traits.da.midi.${aType}`] = [new StringField(), -1];
      daeFieldBrowserFields.push(`system.traits.da.midi.${aType}`);
    });
    Object.keys(GameSystemConfig.healingTypes).forEach(dType => {
      specials[`system.traits.da.${dType}`] = [new StringField(), -1];
      daeFieldBrowserFields[`system.traits.da.${dType}`] = [new StringField(), -1];
    });
  }

  // specials[`system.traits.dm.midi.final`] = [new StringField(), -1];
  specials[`system.traits.idi.value`] = [new StringField(), -1];
  daeFieldBrowserFields.push(`system.traits.idi.value`);
  specials[`system.traits.idr.value`] = [new StringField(), -1];
  daeFieldBrowserFields.push(`system.traits.idr.value`);
  specials[`system.traits.idv.value`] = [new StringField(), -1];
  daeFieldBrowserFields.push(`system.traits.idv.value`);
  specials[`system.traits.ida.value`] = [new StringField(), -1];
  daeFieldBrowserFields.push(`system.traits.ida.value`);
  specials[`system.traits.idm.value`] = [new StringField(), -1];
  daeFieldBrowserFields.push(`system.traits.idm.value`);
});

Hooks.on("dae.modifyBaseValues", (specKey: string, baseValues, _characterSpec) => {
  baseValues[`flags.${MODULE_ID}.ActivityOverTime`] = [new StringField({initial: ""}), -1];
});
Hooks.on("dae.addFieldMappings", (fieldMappings) => {
  let allAttackTypes = ["rwak", "mwak", "rsak", "msak"];
  if (game.system?.id === "sw5e") allAttackTypes = ["rwak", "mwak", "rpak", "mpak"];
  registerSettings();
  fetchParams();
  //@ts-expect-error
  for (let key of Object.keys(game.system.config.damageTypes ?? {})) {
    fieldMappings[`flags.${MODULE_ID}.DR.${key}`] = `system.traits.dm.amount.${key}`;
    fieldMappings[`flags.${MODULE_ID}.absorption.${key}`] = `system.traits.da.${key}`;
  }
  //@ts-expect-error
  for (let key of Object.keys(game.system.config.healingTypes ?? {})) {
    fieldMappings[`flags.${MODULE_ID}.DR.${key}`] = `system.traits.dm.amount.${key}`;
    fieldMappings[`flags.${MODULE_ID}.absorption.${key}`] = `system.traits.da.${key}`;
  }
  fieldMappings[`flags.${MODULE_ID}.DR.all`] = "system.traits.dm.midi.all";
  fieldMappings[`flags.${MODULE_ID}.absorption.all`] = "system.traits.da.midi.all";

  //@ts-expect-error
  Object.keys(game.system.config.itemActionTypes).forEach(aType => {
    fieldMappings[`flags.${MODULE_ID}.DR.${aType}`] = `system.traits.dm.midi.${aType}`;
  });
  fieldMappings[`flags.${MODULE_ID}.DR.all`] = `system.traits.dm.midi.all`;
  fieldMappings[`flags.${MODULE_ID}.DR.non-magical`] = `system.traits.dm.midi.non-magical`;
  fieldMappings[`flags.${MODULE_ID}.DR.non-magical-physical`] = `system.traits.dm.midi.non-magical-physical`;
  fieldMappings[`flags.${MODULE_ID}.DR.non-silver`] = `system.traits.dm.midi.non-silver-physical`;
  fieldMappings[`flags.${MODULE_ID}.DR.non-adamant`] = `system.traits.dm.midi.non-adamant-physical`;
  fieldMappings[`flags.${MODULE_ID}.DR.non-physical`] = `system.traits.dm.midi.non-physical`;
  fieldMappings[`flags.${MODULE_ID}.DR.non-spell`] = `system.traits.dm.midi.non-spell`;
  fieldMappings[`flags.${MODULE_ID}.DR.spell`] = `system.traits.dm.midi.spell`;

  // fieldMappings[`flags.${MODULE_ID}.DR.final`] = `system.traits.dm.midi.final`;
  fieldMappings[`flags.${MODULE_ID}.concentrationSaveBonus`] = "system.attributes.concentration.bonuses.save";
  fieldMappings[`flags.${MODULE_ID}.fail.critical.all`] = `flags.${MODULE_ID}.grants.noCritical.all`;
  for (let attackType of allAttackTypes) {
    fieldMappings[`flags.${MODULE_ID}.fail.critical.${attackType}`] = `flags.${MODULE_ID}.grants.noCritical.${attackType}`;
  }
  let attackTypes = allAttackTypes.concat(["save", "check", "skill", "tool"])
  attackTypes.forEach(attackType => {
    fieldMappings[`flags.${MODULE_ID}.grants.fail.advantage.attack.${attackType}`] = `flags.${MODULE_ID}.grants.noAdvantage.attack.${attackType}`;
    fieldMappings[`flags.${MODULE_ID}.grants.fail.disadvantage.attack.${attackType}`] = `flags.${MODULE_ID}.grants.noDisadvantage.attack.${attackType}`;
  })
  //@ts-expect-error
  if (game.system.config.skills) for (let skill of Object.keys(game.system.config.skills)) {
    fieldMappings[`flags.${MODULE_ID}.max.skill.${skill}`] = `system.skills.${skill}.roll.max`;
    fieldMappings[`flags.${MODULE_ID}.min.skill.${skill}`] = `system.skills.${skill}.roll.min`;
  }
  fieldMappings[`flags.${MODULE_ID}.max.ability.save.concentration`] = `system.attributes.concentration.roll.max`;
  fieldMappings[`flags.${MODULE_ID}.min.ability.save.concentration`] = `system.attributes.concentration.roll.min`;
  fieldMappings[`flags.${MODULE_ID}.concentrationSaveBonus`] = `system.attributes.concentration.bonuses.save`;
  fieldMappings[`flags.${MODULE_ID}.sharpShooter`] = `flags.dnd5e.sharpShooter`;
  fieldMappings[`flags.${MODULE_ID}.grants.fail.advantage.attack.all`] = `flags.${MODULE_ID}.grants.noAdvantage.attack.all`;
  fieldMappings[`flags.${MODULE_ID}.grants.fail.disadvantage.attack.all`] = `flags.${MODULE_ID}.grants.noDisadvantage.attack.all`;
  if (debugEnabled > 0) warn("fieldMappings", fieldMappings);

});

Hooks.on("dae.addSpecialDurations", daeSpecialDurations => {
  daeSpecialDurations["1Action"] = i18n("dae.1Action");
  daeSpecialDurations["Bonus Action"] = i18n("dae.Bonus Action");
  daeSpecialDurations["Reaction"] = i18n("dae.Reaction");
  daeSpecialDurations["Turn Action"] = i18n("dae.Turn Action");
  daeSpecialDurations["1Spell"] = i18n("dae.1Spell");
  daeSpecialDurations["1Attack"] = game.i18n?.format("dae.1Attack", { type: `${i18n("dae.spell")}/${i18n("dae.weapon")} ${i18n("dae.attack")}` });
  daeSpecialDurations["1Hit"] = game.i18n?.format("dae.1Hit", { type: `${i18n("dae.spell")}/${i18n("dae.weapon")}` });
  daeSpecialDurations["1Critical"] = i18n("dae.1Critical");
  daeSpecialDurations["1Fumble"] = i18n("dae.1Fumble");
  //    daeSpecialDurations["1Hit"] = i18n("dae.1Hit");
  daeSpecialDurations["1Reaction"] = i18n("dae.1Reaction")
  let attackTypes = ["mwak", "rwak", "msak", "rsak"];
  if (game.system?.id === "sw5e") attackTypes = ["mwak", "rwak", "mpak", "rpak"];
  attackTypes.forEach(at => {
    daeSpecialDurations[`1Attack:${at}`] = `${GameSystemConfig.itemActionTypes[at]}: ${game.i18n?.format("dae.1Attack", { type: GameSystemConfig.itemActionTypes[at] })}`;
    daeSpecialDurations[`1Hit:${at}`] = `${GameSystemConfig.itemActionTypes[at]}: ${game.i18n?.format("dae.1Hit", { type: GameSystemConfig.itemActionTypes[at] })}`;
  })
  daeSpecialDurations["DamageDealt"] = i18n("dae.DamageDealt");
  daeSpecialDurations["isAttacked"] = i18n("dae.isAttacked");
  daeSpecialDurations["isDamaged"] = i18n("dae.isDamaged");
  daeSpecialDurations["isHealed"] = i18n("dae.isHealed");
  daeSpecialDurations["zeroHP"] = i18n("dae.ZeroHP");
  daeSpecialDurations["isHit"] = i18n("dae.isHit");
  daeSpecialDurations["isHitCritical"] = i18n("dae.isHitCritical");
  daeSpecialDurations["isSave"] = `${i18n("dae.isRollBase")} ${i18n("dae.isSaveDetail")}`;
  daeSpecialDurations["isSaveSuccess"] = `${i18n("dae.isRollBase")} ${i18n("dae.isSaveDetail")}: ${i18n("dae.success")}`;
  daeSpecialDurations["isSaveFailure"] = `${i18n("dae.isRollBase")} ${i18n("dae.isSaveDetail")}: ${i18n("dae.failure")}`;
  daeSpecialDurations["isConcentrationSave"] = i18n("dae.isConcentrationSave");
  daeSpecialDurations["isConcentrationSaveFail"] = `${i18n("dae.isConcentrationSave")}: ${i18n("dae.failure")}`;
  daeSpecialDurations["isConcentrationSaveSuccess"] = `${i18n("dae.isConcentrationSave")}: ${i18n("dae.success")}`;
  daeSpecialDurations["isCheck"] = `${i18n("dae.isRollBase")} ${i18n("dae.isCheckDetail")}`;
  daeSpecialDurations["isSkill"] = `${i18n("dae.isRollBase")} ${i18n("dae.isSkillDetail")}`;
  daeSpecialDurations["isInitiative"] = `${i18n("dae.isRollBase")} ${i18n("dae.isInitiativeDetail")}`;

  daeSpecialDurations["isMoved"] = i18n("dae.isMoved");
  daeSpecialDurations["longRest"] = i18n("DND5E.LongRest");
  daeSpecialDurations["shortRest"] = i18n("DND5E.ShortRest");
  daeSpecialDurations["newDay"] = `${i18n("DND5E.NewDay")}`;
  Object.keys(GameSystemConfig.abilities).forEach(abl => {
    //@ts-expect-error .version
    let ablString = foundry.utils.isNewerVersion(game.system.version, "2.1.5")
      ? GameSystemConfig.abilities[abl].label
      : GameSystemConfig.abilities[abl];
    daeSpecialDurations[`isSave.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isSaveDetail")}`;
    daeSpecialDurations[`isSaveSuccess.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isSaveDetail")}: ${i18n("dae.success")}`;
    daeSpecialDurations[`isSaveFailure.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isSaveDetail")}: ${i18n("dae.failure")}`;
    daeSpecialDurations[`isCheck.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isCheckDetail")}`;
  })
  //@ts-expect-error
  if (foundry.utils.isNewerVersion(game.system.version, "2.9.99")) {
    Object.keys(GameSystemConfig.damageTypes).forEach(key => {
      daeSpecialDurations[`isDamaged.${key}`] = `${i18n("dae.isDamaged")}: ${GameSystemConfig.damageTypes[key].label}`;
    });

  } else {
    Object.keys(GameSystemConfig.damageTypes).forEach(dt => {
      daeSpecialDurations[`isDamaged.${dt}`] = `${i18n("dae.isDamaged")}: ${GameSystemConfig.damageTypes[dt]}`;
    });
  }
  //@ts-expect-error
  if (foundry.utils.isNewerVersion(game.system.version, "2.9.99")) {
    daeSpecialDurations[`isDamaged.healing`] = `${i18n("dae.isDamaged")}: ${GameSystemConfig.healingTypes["healing"].label}`;
  } else {
    daeSpecialDurations[`isDamaged.healing`] = `${i18n("dae.isDamaged")}: ${GameSystemConfig.healingTypes["healing"]}`;
  }
  Object.keys(GameSystemConfig.skills).forEach(skillId => {
    daeSpecialDurations[`isSkill.${skillId}`] = `${i18n("dae.isRollBase")} ${i18n("dae.isSkillDetail")} ${GameSystemConfig.skills[skillId].label}`;
  });

})

var daeFieldBrowserFields: Array<string> = [];

Hooks.on("dae.setFieldData", (fieldData: Record<string, string[]>) => {
  fieldData["MidiQOL"] = Array.from(new Set(daeFieldBrowserFields)).sort();
  log("setDaeFieldData | fieldData", fieldData);
});

/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function () {
  // Do anything after initialization but before
  //@ts-expect-error
  isDnD = game.system.id === "dnd5e" && foundry.utils.isNewerVersion(game.system.version, "3.3.99");
  setupModules();
  setupMidiFlags();
  setupSocket();
  fetchParams();
  fetchSoundSettings();
  itemPatching();
  visionPatching();
  initGMActionSetup();
  setupHooks();
  undoDamageText = i18n("midi-qol.undoDamageFrom");
  savingThrowText = i18n("midi-qol.savingThrowText");
  savingThrowTextAlt = i18n("midi-qol.savingThrowTextAlt");
  MQdefaultDamageType = i18n("midi-qol.defaultDamageType");
  MQItemMacroLabel = i18n("midi-qol.ItemMacroText") ?? "ItemMacro";
  MQActivityMacroLabel = i18n("midi-qol.ActivityMacroText") ?? "ActivityMacro";
  MQDeferMacroLabel = i18n("midi-qol.DeferText") ?? "[Defer]";
  setupSheetQol();
  createMidiMacros();
  setupMidiQOLApi();
});

function addConfigOptions() {

  //@ts-expect-error
  let config = game.system?.config ?? {};
  if (game.system?.id === "dnd5e" || game.system?.id === "n5e") {
    config.midiProperties = {};
    config.damageTypes["none"] = { label: i18n("midi-qol.noType"), icon: "systems/dnd5e/icons/svg/trait-damage-immunities.svg", toString: function () { return this.label } };
    config.damageTypes["midi-none"] = { label: i18n("midi-qol.midi-none"), icon: "systems/dnd5e/icons/svg/trait-damage-immunities.svg", toString: function () { return this.label } };
    // sliver, adamant, spell, nonmagic, magic are all deprecated and should only appear as custom
    config.customDamageResistanceTypes = {
      "spell": i18n("midi-qol.SpellDamage"),
      "nonSpell": i18n("midi-qol.NonSpellDamage"),
      "magical": i18n("midi-qol.Magical"),
      "nonMagical": i18n("midi-qol.NonMagical"),
      "physical": i18n("midi-qol.Physical"),
      "nonMagicalPhysical": i18n("midi-qol.NonMagicalPhysical"),
      "nonSilverPhysical": i18n("midi-qol.NonSilverPhysical"),
      "nonAdamantPhysical": i18n("midi-qol.NonAdamantinePhysical"),
    };


    config.damageResistanceTypes = config.damageResistanceTypes ?? {};
    config.damageResistanceTypes["silver"] = i18n("midi-qol.NonSilverPhysical");
    config.damageResistanceTypes["adamant"] = i18n("midi-qol.NonAdamantinePhysical");
    config.damageResistanceTypes["physical"] = i18n("midi-qol.NonMagicalPhysical");
    config.damageResistanceTypes["spell"] = i18n("midi-qol.spell-damage");
    config.damageResistanceTypes["nonmagic"] = i18n("midi-qol.NonMagical");
    config.damageResistanceTypes["magic"] = i18n("midi-qol.Magical");
    config.damageResistanceTypes["healing"] = config.healingTypes?.healing?.label;
    config.damageResistanceTypes["temphp"] = config.healingTypes?.temphp?.label;

    config.traits.di.configKey = "damageTypes";
    config.traits.dr.configKey = "damageTypes";
    config.traits.dv.configKey = "damageTypes";
    if (!config.traits.da && game.system?.id === "dnd5e") {
      config.traits.da = {
        labels: { title: "Damage Absorption", localization: "midi-qol.DamageAbsorption" },
        icon: "systems/dnd5e/icons/svg/damageresistances.svg",
        configKey: "damageTypes"
      }
    } else if (config.traits.da) {
      config.traits.da.configKey = "damageTypes"
    }
    const dnd5eReaction = `${SystemString}.Reaction`;
    config.abilityActivationTypes["reactionpreattack"] = `${i18n(dnd5eReaction)} ${i18n("midi-qol.reactionPreAttack")}`;
    config.abilityActivationTypes["reactiondamage"] = `${i18n(dnd5eReaction)} ${i18n("midi-qol.reactionDamaged")}`;
    config.abilityActivationTypes["reactionmanual"] = `${i18n(dnd5eReaction)} ${i18n("midi-qol.reactionManual")}`;
  } else if (game.system?.id === "sw5e") { // sw5e
    //@ts-expect-error
    config = CONFIG.SW5E;
    config.midiProperties = {};
    config.damageTypes["midi-none"] = i18n("midi-qol.midi-none");
    config.abilityActivationTypes["reactiondamage"] = `${i18n("DND5E.Reaction")} ${i18n("midi-qol.reactionDamaged")}`;
    config.abilityActivationTypes["reactionmanual"] = `${i18n("DND5E.Reaction")} ${i18n("midi-qol.reactionManual")}`;
    config.customDamageResistanceTypes = {
      "spell": i18n("midi-qol.spell-damage"),
      "power": i18n("midi-qol.spell-damage"),
      "nonmagic": i18n("midi-qol.NonMagical"),
      "magic": i18n("midi-qol.Magical"),
      "physical": i18n("midi-qol.NonMagicalPhysical")
    }
  }
  if (game.system?.id === "dnd5e") {
    globalThis.dnd5e.config.characterFlags["DamageBonusMacro"] = {
      type: String,
      name: "Damage Bonus Macro",
      hint: "Macro to use for damage bonus",
      section: "Midi QOL"
    };
    globalThis.dnd5e.config.characterFlags["initiativeHalfProficiency"] = {
      type: Boolean,
      name: "Half Proficiency for Initiative",
      hint: "add 1/2 proficiency to initiative",
      section: "Midi QOL"
    };
    globalThis.dnd5e.config.characterFlags["initiativeDisadv"] = {
      type: Boolean,
      name: "Disadvantage on Initiative",
      hint: "Provided by fears or magical items",
      section: "Midi QOL"
    };
    globalThis.dnd5e.config.characterFlags["spellSniper"] = {
      type: Boolean,
      name: "Spell Sniper",
      hint: "Provided by feats or magical items",
      section: "Midi QOL"
    };

    globalThis.dnd5e.config.characterFlags["sharpShooter"] = {
      type: Boolean,
      name: "Sharp Shooter",
      hint: "Provided by feats or magical items",
      section: "Midi QOL"
    };
  }
}
/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */
Hooks.once('ready', function () {
  cleanCPRFlanked();
  //@ts-expect-error
  const config = game.system.config;
  addConfigOptions();
  allDamageTypes = {};
  allDamageTypes.none = foundry.utils.duplicate(config.damageTypes["midi-none"]);
  allDamageTypes.none.label = i18n(`${SystemString}.None`);
  allDamageTypes[""] = allDamageTypes.none
  allDamageTypes = foundry.utils.mergeObject(allDamageTypes, foundry.utils.mergeObject(config.damageTypes, config.healingTypes, { inplace: false }));
  registerSettings();
  gameStats = new RollStats();
  actorAbilityRollPatching();
  setupMidiStatusEffects();

  MQOnUseOptions = {
    "preTargeting": "Called before targeting is resolved (*)",
    "preItemRoll": "Called before the item is rolled (*)",
    "templatePlaced": "Only called once a template is placed",
    "preAttackRoll": "Before Attack Roll",
    "preCheckHits": "Before Check Hits",
    "postAttackRoll": "After Attack Roll",
    "preSave": "Before Save",
    "postSave": "After Save",
    "preDamageRoll": "Before Damage Roll",
    "postDamageRoll": "After Damage Roll",
    "damageBonus": "return a damage bonus",
    "preDamageRollConfig": "Before Damage Configuration",
    "preDamageApplication": "Before Damage Application",
    "preActiveEffects": "Before Active Effects",
    "postActiveEffects": "After Active Effects ",
    "isTargeted": "Target is targeted but before item is rolled",
    "isPreAttacked": "Target is about to be attacked, before reactions",
    "isAttacked": "Target is attacked",
    "isHit": "Target is hit",
    "preTargetSave": "Target is about to roll a saving throw",
    "isSave": "Target rolled a save",
    "isSaveSuccess": "Target rolled a successful save",
    "isSaveFailure": "Target failed a saving throw",
    "preTargetDamageApplication": "Target is about to be damaged by an item",
    "postTargetEffectApplication": "Target has an effect applied by a rolled item",
    "isDamaged": "Target is damaged by an attack",
    "all": "All"
  }
  for (let key of Object.keys(Workflow.stateTable)) {
    const camelKey = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    if (MQOnUseOptions[`pre${camelKey}`] === undefined) {
      MQOnUseOptions[`pre${camelKey}`] = `Before state ${camelKey}`;
    } else error(`pre${camelKey} already exists`);
    if (MQOnUseOptions[`post${camelKey}`] === undefined) {
      MQOnUseOptions[`post${camelKey}`] = `After state ${camelKey}`;
    } else error(`post${camelKey} already exists`);
  }
  OnUseMacroOptions.setOptions(MQOnUseOptions);
  globalThis.MidiQOL.MQOnUseOptions = MQOnUseOptions;

  MidiSounds.midiSoundsReadyHooks();

  if (game.system && game.system?.id === "dnd5e") {
    globalThis.dnd5e.config.areaTargetTypes["emanationNoTemplate"] = {
      label: i18n("midi-qol.emanationNoTemplate"),
      template: "rect",
      standard: true,
      counted: "midi-qol.emanationTemplate.counted"
    };

    if (game.user?.isGM && game.settings) {
      //@ts-expect-error
      const instanceId = game.settings?.get(MODULE_ID, "instanceId") as string;
      if ([undefined, ""].includes(instanceId)) {
        //@ts-expect-error
        game.settings.set(MODULE_ID, "instanceId", foundry.utils.randomID());
      }
      //@ts-expect-error
      const oldVersion = game.settings.get(MODULE_ID, "last-run-version") as number | string;
      const newVersion = game.modules.get(MODULE_ID)?.version;
      if (foundry.utils.isNewerVersion(newVersion, oldVersion)) {
        //@ts-expect-error
        console.warn(`midi-qol | instance ${game.settings.get(MODULE_ID, "instanceId")} version change from ${oldVersion} to ${newVersion}`);
        //@ts-expect-error
        game.settings.set(MODULE_ID, "last-run-version", newVersion);
        // look at sending a new version has been installed.
      }
      readySettingsSetup();
    }
    Hooks.callAll("midi-qol.ready")
  }

  checkModules();
  if (game.user?.isGM && configSettings.gmLateTargeting !== "none") {
    ui.notifications?.notify("Late Targeting has been replaced with Target Confirmation. Please update your settings", "info", { permanent: true });
    new TargetConfirmationConfig({}).render({ force: true });
    configSettings.gmLateTargeting = "none";
    //@ts-expect-error
    game.settings.set(MODULE_ID, "ConfigSettings", configSettings)
  }
  //@ts-expect-error
  if (!game.user?.isGM && game.settings.get(MODULE_ID, "LateTargeting") !== "none") {
    ui.notifications?.notify("Late Targeting has been replaced with Target Confirmation. Please update your settings", "info", { permanent: true });
    new TargetConfirmationConfig({}).render({ force: true });
    //@ts-expect-error
    game.settings.set(MODULE_ID, "LateTargeting", "none");
  }
  readyHooks();
  readyPatching();

  //@ts-expect-error
  if (midiSoundSettingsBackup) game.settings.set(MODULE_ID, "MidiSoundSettings-backup", midiSoundSettingsBackup)

  // Make midi-qol targets hoverable
  $(document).on("mouseover", ".midi-qol-target-name", (e) => {
    const tokenId = e.currentTarget.id
    const tokenObj = canvas?.tokens?.get(tokenId)
    if (!tokenObj) return;
    //@ts-ignore
    tokenObj._hover = true
  });

  if (installedModules.get("betterrolls5e")) {
    ui.notifications?.error("midi-qol automation disabled", { permanent: true, console: true })
    ui.notifications?.error("Please make sure betterrolls5e is disabled", { permanent: true, console: true })
    ui.notifications?.error("Until further notice better rolls is NOT compatible with midi-qol", { permanent: true, console: true })
    disableWorkflowAutomation();
    setTimeout(disableWorkflowAutomation, 2000)
  }
  Hooks.callAll("midi-qol.midiReady");

  if (game.user?.isGM) { // need to improve the test
    const problems = TroubleShooter.collectTroubleShooterData().problems
    for (let problem of problems) {
      const message = `midi-qol ${problem.problemSummary} | Open TroubleShooter to fix`;
      if (problem.severity === "Error")
        ui.notifications?.error(message, { permanent: false });
      else console.warn(message);
    }
  }
});

import { setupMidiTests } from './module/tests/setupTest.js';
import { TargetConfirmationConfig } from './module/apps/TargetConfirmationConfig.js';
import { defineChatMessageMidiClass } from './module/ChatMessageMidi.js';
import { MidiSaveActivity, setupSaveActivity } from './module/activities/SaveActivity.js';
import { MidiUtilityActivity, setupUtilityActivity } from './module/activities/UtilityActivity.js';
import { MidiSummonActivity, setupSummonActivity } from './module/activities/SummonActivity.js';
import { MidiDamageActivity, setupDamageActivity } from './module/activities/DamageActivity.js';
import { MidiCastActivity, setupCastActivity } from './module/activities/CastActivity.js';
import { MidiCheckActivity, setupCheckActivity } from './module/activities/CheckActivity.js';
import { MidiHealActivity, setupHealActivity } from './module/activities/HealActivity.js';
import { resolveTargetConfirmation, showItemInfo, templateTokens } from './module/activities/activityHelpers.js';
import { MidiActivityMixin, setupMidiActivityMixin } from './module/activities/MidiActivityMixin.js';
import { MidiForwardActivity, setupForwardActivity } from './module/activities/ForwardActivity.js';
import { MidiEnchantActivity, setupEnchantActivity } from './module/activities/EnchantActivity.js';
import { MidiCombat5e } from './module/MidiCombat5e.js';
import { setupMidiItemSheet5e } from './module/ItemSheet5e.js';

Hooks.once("midi-qol.midiReady", () => {
  setupMidiTests();
});

// Add any additional hooks if necessary
Hooks.on("monaco-editor.ready", (registerTypes) => {
  registerTypes("midi-qol/index.ts", `
  const MidiQOL = {
    addRollTo: function addRollTo(roll: Roll, bonusRoll: Roll): Roll,
    addConcentrationDependent: async function addConcentrationDependent(actor: ActorRef, dependent, item?: Item),
    addDependent: async function addDependent(document: Document, dependent),
    applyTokenDamage: async function applyTokenDamage(damageDetail, totalDamage, theTargets, item, saves, options: any = { existingDamage: [], superSavers: new Set(), semiSuperSavers: new Set(), workflow: undefined, updateContext: undefined, forceApply: false, noConcentrationCheck: false }): Promise<any[]>,
    canSense: function canSense(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, validModes: Array<string> = ["all"]): boolean,
    canSense: function canSee(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string): boolean,
    cansSenseModes: function canSenseModes(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, validModes: Array<string> = ["all"]): Array<string>,
    checkDistance: function checkDistance(tokenEntity1: Token | TokenDocument | string, tokenEntity2: Token | TokenDocument | string, distance: number, wallsBlock?: boolean): boolean,
    checkIncapacitated: function checkIncapacitated(actor: Actor, logResult?: true, warning?: false): boolean,
    checkNearby: function checkNearby(tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, range: number): boolean,
    checkRange: function checkRange(item: Item, tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, range: number): boolean,
    checkActivityRange: function checkActivityRange(activity: Activity, tokenEntity: Token | TokenDocument | string, targetEntity: Token | TokenDocument | string, range: number): boolean,
    checkRule: function checkRule(rule: string): boolean,
    completeItemUse: async function completeItemUse(item, config: any = {}, options: any, dialog, message),
    completeActivityUse: async function completeActivityUse(activity: Activity, config: any = {}, dialog: message: any = {}),
    computeCoverBonus: function computeCoverBonus(attacker: Token | TokenDocument, target: Token | TokenDocument, item: any = undefined): number,
    computeDistance: function computeDistance(t1: Token, t2: Token, {wallBlocking = false, includeCover = true}),
    configSettings: function configSettings(): any,
    contestedRoll: async function contestedRoll(data: {
      source: { rollType: string, ability: string, token: Token | TokenDocument | string, rollOptions: any },
      target: { rollType: string, ability: string, token: Token | TokenDocument | string, rollOptions: any },
      displayResults: boolean,
      itemCardUuid: string,
      flavor: string,
      rollOptions: any,
      success: (results) => {}, failure: (results) => {}, drawn: (results) => {}
    }): Promise<{ result: number | undefined, rolls: any[] }>,
    createConditionData: function createConditionData(data: { workflow?: Workflow | undefined, target?: Token | TokenDocument | undefined, actor?: Actor | undefined, item?: Item | string | undefined, extraData?: any }
    DamageOnlyWorkflow: class DamageOnlyWorkflow,
    debug: function debug(...args: any[]): void,
    displayDSNForRoll: async function displayDSNForRoll(roll: Roll | undefined, rollType: string | undefined, defaultRollMode: string | undefined = undefined),
    doMidiConcentrationCheck: async function doMidiConcentrationCheck(actor: Actor, saveDC),
    evalAllConditions: function evalAllConditions(actor: Actor | Token | TokenDocument | string, flagRef: string, conditionData: any, errorReturn: any = true): any,
    evalAllConditionsAsync: async unction evalAllConditions(actor: Actor | Token | TokenDocument | string, flagRef: string, conditionData: any, errorReturn: any = true): Promise<any>,
    evalCondition: function evalCondition(condition: string, conditionData: any, {errorReturn: any = true, async = false): any,
    findNearby(disposition: number | string | null | Array<string | number>, token: any /*Token | uuuidString */, distance: number, options: { maxSize: number | undefined, includeIncapacitated: boolean | undefined, canSee: boolean | undefined, isSeen: boolean | undefined, includeToken: boolean | undefined, relative: boolean | undefined } = { maxSize: undefined, includeIncapacitated: false, canSee: false, isSeen: false, includeToken: false, relative: true }): Token[],
    findNearbyCount(disposition: number | string | null | Array<string | number>, token: any /*Token | uuuidString */, distance: number, options: { maxSize: number | undefined, includeIncapacitated: boolean | undefined, canSee: boolean | undefined, isSeen: boolean | undefined, includeToken: boolean | undefined, relative: boolean | undefined } = { maxSize: undefined, includeIncapacitated: false, canSee: false, isSeen: false, includeToken: false, relative: true }): number;
    getCachedChatMessage(),
    getChanges: function getChanges(actorOrItem: Actor | Item, key: string): any[],
    getConcentrationEffect: function getConcentrationEffect(actor: Actor): ActiveEffect | undefined,
    geti18nOptions: function geti18nOptions(key: string): any,
    geti18nTranslations: function geti18nTranslations(): any,
    getSaveRollModeFor: function getSaveRollModeFor(abilityId: string): string,
    getCheckRollModeFor: function getSaveRollModeFor(abilityId: string): string,
    getTokenForActor: function getTokenForActor(actor: Actor): Token | undefined,
    getTokenForActorAsSet: function getTokenForActorAsSet(actor: Actor): Set<Token>,
    getTokenPlayerName: function getTokenPlayerName(token: Token | TokenDocument | string): string,
    getTokenPlayerNameForUser: function getTokenPlayerName(user: User, token: Token | TokenDocument | string): string,
    getTraitMult: function getTraitMult(actor: Actor, damageType: string, item: Item): number,
    hasCondition: function hasCondition(tokenRef: Token | TokenDocument | UUID, condition: string): boolean,
    hasUsedBonusAction: function hasUsedBonusAction(actor: Actor): boolean,
    hasUsedReaction: function hasUsedReaction(actor: Actor): boolean,
    incapacitatedConditions: string[],
    InvisibleDisadvantageVisionModes: string[],
    isTargetable: function isTargetable(token: Token | TokenDocument | UUID): boolean,
    TargetConfirmationDialog: class TargetConfirmationDialog,
    log: function log(...args: any[]): void,
    midiFlags: string[],
    midiRenderRoll: function midiRenderRoll(roll: Roll),
    midiRenderAttackRoll: function midiRenderAttackRoll(roll, options);
    midiRenderDamageRoll: function midiRenderDamageRoll(roll, options);
    midiRenderBonusDamageRoll: function midiRenderBonusDamageRoll(roll, options);
    midiRenderOtherDamageRoll: function midiRenderOtherDamageRoll(roll, options);
    modifyDamageBy: function modifyDamageBy({damageItem = {}, value, multiplier = 1, type = "none", reason}), 
    MQfromActorUuid: function MQfromActorUuid(actorUuid: string): Actor | undefined,
    MQfromUuid: function MQfromUuid(uuid: string): Actor | Item | TokenDocument | undefined,
    MQOnUseOptions: any,
    overTimeJSONData: any,
    playerFor: function playerFor(target: TokenDocument | Token | undefined): User | undefined,
    playerForActor: function playerForActor(actor: Actor): User | undefined,
    raceOrType(entity: Token | Actor | TokenDocument | string): string,
    reactionDialog: class reactionDialog,
    typeOrRace(entity: Token | Actor | TokenDocument | string): string,
    reportMidiCriticalFlags: function reportMidiCriticalFlags(): void,
    removeHiddenCondition: async function removeHiddenCondition(tokenRef: Token | TokenDocument | UUID), 
    removeInvisibleCondition: async function removeInvisibleCondition(tokenRef: Token | TokenDocument | UUID),
    resolveTargetConfirmation: async function resolveTargetConfirmation(targetConfirmation: any, item: Item, actor: Actor, token: Token, targets: any, options: any = { existingDamage: [], superSavers: new Set(), semiSuperSavers: new Set(), workflow: undefined, updateContext: undefined, forceApply: false, noConcentrationCheck: false }): Promise<any[]>,
    safeGetGameSettings function safeGetGameSetting(module: string key: string): string | undefined,
    selectTargetsForTemplate: templateTokens,
    removeBonusActionUsed: function removeBonusActionUsed(actor: Actor): boolean,
    setBonusActionUsed: function setBonusActionUsed(actor: Actor): boolean,
    removeBonusActionUsed: function removeBonusActionUsed(actor: Actor): boolean,
    setReactionUsed: function setReactionUsed(actor: Actor): boolean,
    removeReactionUsed: function removeReactionUsed(actor: Actor): boolean,
    showItemInfo: async function showItemInfo(item: Item): void,
    showUndoQueue: function showUndoQueue(): void,
    showUndoWorkflowApp: function showUndoWorkflowApp(): void,
    socket: function socket(): SaferSocket,
    testfunc,
    tokenForActor: function tokenForActor(actor: Actor): Token | undefined,
    TrapWorkflow: class TrapWorkflow extends Workflow,
    TroubleShooter: class TroubleShooter,
    undoMostRecentWorkflow,
    validRollAbility: function validRollAbility(rollType: string, ability: string): string | undefined,
    WallsBlockConditions: string[],
    warn: function warn(...args: any[]): void,
    Workflow: class Workflow,
    moveToken: async function (tokenRef: Token | TokenDocument | UUID, newCenter: { x: number, y: number }, animate: boolean = true),
    moveTokenAwayFromPoint: async function (targetRef: Token | TokenDocument | UUID, distance: number, point: { x: number, y: number }, animate: boolean = true, checkCollision: boolean = false),
    createEffects: async function (data: { actorUuid: string, effects: [], options: { keepId: true } }),
    removeEffects: async function (data: { actorUuid: string, effects: [] }),
    updateEffects: async function (data: { actorUuid: string, updates: [] })
  }
});

`);
});// Backwards compatability
function setupMidiQOLApi() {

  const detectionModes = CONFIG.Canvas.detectionModes;
  let InvisibleDisadvantageVisionModes = Object.keys(detectionModes)
    //@ts-expect-error I think imprecise is added by a module - TODO Check
    .filter(dm => !detectionModes[dm].imprecise);

  let WallsBlockConditions = [
    "burrow"
  ];

  let humanoid = ["human", "humanoid", "elven", "elf", "half-elf", "drow", "dwarf", "dwarven", "halfling", "gnome", "tiefling", "orc", "dragonborn", "half-orc"];
  const Workflows = { "Workflow": Workflow, "DamageOnlyWorkflow": DamageOnlyWorkflow, "TrapWorkflow": TrapWorkflow, "DummyWorkflow": DummyWorkflow, "DDBGameLogWorkflow": DDBGameLogWorkflow };
  //@ts-ignore
  globalThis.MidiQOL = foundry.utils.mergeObject(globalThis.MidiQOL ?? {}, {
    addConcentration: () => {error("addConcentration is no longer supported.") },
    addDependent,
    addConcentrationDependent,
    addRollTo,
    addUndoChatMessage,
    applyTokenDamage,
    canSee,
    canSense,
    canSenseModes,
    checkIncapacitated,
    checkDistance,
    checkNearby,
    checkRange,
    checkActivityRange,
    checkRule,
    completeItemRoll: () => error("completeItemRoll is no longer supported. Please use completeItemUse instead"),
    completeItemUse,
    completeActivityUse,
    computeCoverBonus,
    computeDistance,
    ConfigPanel,
    configSettings: () => { return configSettings },
    get currentConfigSettings() { return configSettings },
    collectSettingData,
    contestedRoll,
    createConditionData,
    createDamageDetail,
    DamageOnlyWorkflow,
    debouncedUpdate,
    debug,
    displayDSNForRoll,
    doConcentrationCheck,
    doOverTimeEffect,
    evalAllConditions,
    evalCondition,
    DummyWorkflow,
    chooseEffect,
    enableWorkflow,
    findNearby,
    findNearbyCount,
    gameStats,
    getCachedChatMessage: getCachedDocument,
    getChanges, // (actorOrItem, key) - what effects on the actor or item target the specific key
    getConcentrationEffect,
    geti18nOptions,
    geti18nTranslations,
    getSaveRollModeFor,
    getCheckRollModeFor,
    getTokenPlayerName,
    getTokenPlayerNameForUser,
    getTokenForActor: getOrCreateTokenForActor,
    getTokenForActorAsSet: getOrCreateTokenForActorAsSet,
    getTraitMult: getTraitMult,
    getUndoQueue,
    hasCondition,
    hasUsedBonusAction,
    hasUsedReaction,
    humanoid,
    incapacitatedConditions: ["incapacitated", "Convenient Effect: Incapacitated", "stunned", "Convenient Effect: Stunned", "paralyzed", "paralysis", "Convenient Effect: Paralyzed", "unconscious", "Convenient Effect: Unconscious", "dead", "Convenient Effect: Dead", "petrified", "Convenient Effect: Petrified"],
    InvisibleDisadvantageVisionModes,
    isTargetable: isValidTarget,
    TargetConfirmationDialog,
    log,
    midiFlags,
    midiRenderRoll,
    midiRenderAttackRoll,
    midiRenderDamageRoll,
    midiRenderBonusDamageRoll,
    midiRenderOtherDamageRoll,
    //@ts-expect-error
    get midiSoundSettings() { return game.settings?.get("midi-qol", "MidiSoundSettings") },
    MidiSounds,
    modifyDamageBy,
    MQfromActorUuid: fromActorUuid,
    actorFromUuid,
    MQfromUuid: MQfromUuidSync,
    MQfromUuidSync,
    MQOnUseOptions,
    playerFor,
    playerForActor,
    raceOrType,
    typeOrRace,
    reactionDialog,
    removeHiddenCondition,
    removeInvisibleCondition,
    removeMostRecentWorkflow,
    removeActionUsed,
    removeBonusActionUsed,
    removeReactionUsed,
    reportMidiCriticalFlags,
    resolveTargetConfirmation,
    safeGetGameSetting,
    selectTargetsForTemplate: templateTokens,
    setBonusActionUsed,
    setReactionUsed,
    showItemInfo: (item) => { return showItemInfo.bind(item)() },
    showUndoQueue,
    showUndoWorkflowApp,
    socket: () => { return new SaferSocket(socketlibSocket) },
    testfunc,
    tokenForActor,
    TrapWorkflow,
    TroubleShooter,
    undoMostRecentWorkflow,
    validRollAbility,
    WallsBlockConditions,
    warn,
    Workflow,
    UserWorkflow,
    workflowClass: Workflow,
    Workflows,
    moveToken: async (tokenRef: Token | TokenDocument | string, newCenter: { x: number, y: number }, animate: boolean = true) => {
      const tokenUuid = getTokenDocument(tokenRef)?.uuid;
      if (tokenUuid) return unTimedExecuteAsGM("moveToken", { tokenUuid, newCenter, animate });
    },
    moveTokenAwayFromPoint: async (targetRef: Token | TokenDocument | string, distance: number, point: { x: number, y: number }, animate: boolean = true, checkCollision: boolean = false) => {
      const targetUuid = getTokenDocument(targetRef)?.uuid;
      if (point && targetUuid && distance)
        return unTimedExecuteAsGM("moveTokenAwayFromPoint", { targetUuid, distance, point, animate, checkCollision })
    },
    createEffects: async (data: { actorUuid: string, effects: [], options: { keepId: true } }) => {
      const { actorUuid, effects, options } = data;
      if (!actorUuid) {
        error("createEffects failed. Missing actorUuid")
        return false;
      }
      if (effects?.length)
        return unTimedExecuteAsGM("createEffects", { actorUuid, effects, options });
      else {
        error("createEffects failed with missing data, which should include {actorUuid, effects: [], options: {}} but got", data);
        return false;
      }
    },
    removeEffects: async (data: { actorUuid: string, effects: string[] }) => {  // data: {actorUuid, effects: [<effect.ids>]}
      if (!data.actorUuid) {
        error("createEffects failed. Missing actorUuid")
        return false;
      };
      if (!data.effects.length) {
        error("removeEffects failed with missing data, which should include {actorUuid, effects: [<effectIDs>],} but got", data)
        return false;
      }
      const statusEffectIds = new Set(CONFIG.statusEffects.map((statusEffect) => statusEffect.id));

      for (let i = 0; i < data.effects.length; i++) {
        const statusId = data.effects[i];
        if (statusEffectIds.has(statusId)) {
          data.effects[i] = getStaticID(statusId);
        }
      }
      return unTimedExecuteAsGM("removeEffects", data);
    },
    updateEffects: async (data: { actorUuid: string, updates: [] }) => {
      if (data.actorUuid && data.updates?.length)
        return unTimedExecuteAsGM("updateEffects", data);
      else {
        error("updateEffects failed missing data which should include {actorUuid, updates: []} but got", data)
        return false;
      }
    },
    get updatesCache() { return updatesCache }
  });
  globalThis.MidiDAEEval = {
    testfunc,
    canSee,
    canSense,
    canSenseModes,
    checkIncapacitated,
    checkDistance,
    checkNearby,
    checkRange,
    checkActivityRange,
    checkRule,
    computeCoverBonus,
    computeDistance,
    contestedRoll,
    displayDSNForRoll,
    doConcentrationCheck,
    chooseEffect,
    findNearby,
    findNearbyCount,
    getTraitMult: getTraitMult,
    hasCondition,
    hasUsedBonusAction,
    hasUsedReaction,
    humanoid,
    isTargetable: isValidTarget,
    raceOrType,
    typeOrRace,
    safeGetGameSetting,
    setBonusActionUsed,
    setReactionUsed,
  }
  globalThis.MidiQOL.actionQueue = new foundry.utils.Semaphore();
  Hooks.callAll("midi-qol.setup", globalThis.MidiQOL);
}

export function testfunc(...args: any[]) {
  console.warn("MidiQOL testfunc called ", ...args)
}

function setupMidiFlags() {
  //@ts-expect-error
  let config = game.system.config;
  midiFlags.push(`flags.${MODULE_ID}.advantage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.all`);
  midiFlags.push(`flags.${MODULE_ID}.advantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.critical.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.critical.all`);
  midiFlags.push(`flags.${MODULE_ID}.max.damage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.damage.all`);
  midiFlags.push(`flags.${MODULE_ID}.min.damage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.damage.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.max.damage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.max.damage.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.min.damage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.min.damage.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.bonus.damage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.bonus.damage.all`);
  midiFlags.push(`flags.${MODULE_ID}.noCritical.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noCritical.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.success.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.advantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.advantage.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.advantage.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.advantage.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.advantage.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.fail.advantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fail.advantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.fail.disadvantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fail.disadvantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.neverTarget`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.neverTarget`);
  midiFlags.push(`flags.${MODULE_ID}.grants.attack.success.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.success.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.attack.fail.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.fail.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.attack.bonus.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.bonus.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.critical.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.critical.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noCritical.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noCritical.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.critical.range`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.critical.range`);
  midiFlags.push(`flags.${MODULE_ID}.grants.criticalThreshold`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.criticalThreshold`);
  midiFlags.push(`flags.${MODULE_ID}.fail.critical.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.critical.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noCritical.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noCritical.all`);
  midiFlags.push(`flags.${MODULE_ID}.advantage.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.concentration`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.concentration`);
  midiFlags.push(`flags.${MODULE_ID}.ignoreNearbyFoes`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.ignoreNearbyFoes`);
  midiFlags.push(`flags.${MODULE_ID}.`);
  midiFlags.push(`flags.${MODULE_ID}.concentrationSaveBonus`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.concentrationSaveBonus`);
  midiFlags.push(`flags.${MODULE_ID}.potentCantrip`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.potentCantrip`);
  midiFlags.push(`flags.${MODULE_ID}.sculptSpells`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.sculptSpells`);
  midiFlags.push(`flags.${MODULE_ID}.carefulSpells`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.carefulSpells`);
  midiFlags.push(`flags.${MODULE_ID}.magicResistance.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicResistance.all`);
  midiFlags.push(`flags.${MODULE_ID}.magicResistance.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicResistance.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.magicResistance.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicResistance.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.magicResistance.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicResistance.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.magicVulnerability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicVulnerability.all`);
  midiFlags.push(`flags.${MODULE_ID}.rangeOverride.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.rangeOverride.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.range.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.range.all`);
  midiFlags.push(`flags.${MODULE_ID}.long.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.long.all`);
  let attackTypes = allAttackTypes.concat(["save", "check", "skill", "tool"])
  attackTypes.forEach(at => {
    midiFlags.push(`flags.${MODULE_ID}.grants.fail.advantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fail.advantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.fail.disadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fail.disadvantage.attack.${at}`);
  });
  attackTypes = allAttackTypes.concat(["heal", "other", "save", "util"])
  attackTypes.forEach(at => {
    midiFlags.push(`flags.${MODULE_ID}.range.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.range.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.long.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.long.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.advantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.disadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.success.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.critical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.critical.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.noCritical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noCritical.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.advantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.critical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.critical.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noCritical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noCritical.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.critical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.critical.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.attack.bonus.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.bonus.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.attack.success.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.success.${at}`);
    if (at !== "heal") midiFlags.push(`flags.${MODULE_ID}.DR.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.advantage.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.damage.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.max.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.damage.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.min.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.damage.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.max.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.max.damage.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.min.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.min.damage.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.bonus.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.bonus.damage.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.optional.NAME.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.optional.NAME.attack.fail.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.attack.fail.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.optional.NAME.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.damage.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.rangeOverride.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rangeOverride.attack.${at}`);
  });
  midiFlags.push(`flags.${MODULE_ID}.advantage.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.ability.all`);
  midiFlags.push(`flags.${MODULE_ID}.advantage.ability.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.ability.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.advantage.ability.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.ability.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.ability.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.ability.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.ability.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.ability.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.ability.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.ability.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.ability.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.superSaver.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.superSaver.all`);
  midiFlags.push(`flags.${MODULE_ID}.semiSuperSaver.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.semiSuperSaver.all`);
  midiFlags.push(`flags.${MODULE_ID}.max.ability.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.ability.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.max.ability.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.ability.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.max.ability.save.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.ability.save.concentration`);
  midiFlags.push(`flags.${MODULE_ID}.min.ability.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.ability.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.min.ability.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.ability.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.min.ability.save.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.ability.save.concentration`);
  midiFlags.push(`flags.${MODULE_ID}.sharpShooter`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.sharpShooter`);

  midiFlags.push(`flags.${MODULE_ID}.rollModifiers.damage.all.all`);
  midiFlags.push(`flags.${MODULE_ID}.rollModifiers.attack.all`);

  attackTypes.forEach(at => {
    midiFlags.push(`flags.${MODULE_ID}.rollModifiers.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.rollModifiers.damage.${at}.all`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${at}.all`);
    Object.keys(config.damageTypes).forEach(dt => {
      midiFlags.push(`flags.${MODULE_ID}.rollModifiers.damage.${at}.${dt}`);
      daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${at}.${dt}`);
    })
  });
  ["weapon", "spell", "tool", "feat"].forEach(it => {
    midiFlags.push(`flags.${MODULE_ID}.rollModifiers.attack.${it}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.attack.${it}`);
    midiFlags.push(`flags.${MODULE_ID}.rollModifiers.damage.${it}.all`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${it}.all`);
    Object.keys(config.damageTypes).forEach(dt => {
      midiFlags.push(`flags.${MODULE_ID}.rollModifiers.damage.${it}.${dt}`);
      daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${it}.${dt}`);
    })
  })

  Object.keys(config.abilities).forEach(abl => {
    midiFlags.push(`flags.${MODULE_ID}.advantage.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.ability.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.disadvantage.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.ability.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.advantage.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.ability.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.disadvantage.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.ability.save.${abl}`);
    // midiFlags.push(`flags.${MODULE_ID}.advantage.attack.${abl}`);
    // daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.attack.${abl}`);
    // midiFlags.push(`flags.${MODULE_ID}.disadvantage.attack.${abl}`);
    // daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.attack.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.superSaver.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.superSaver.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.semiSuperSaver.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.semiSuperSaver.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.max.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.ability.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.min.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.ability.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.max.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.ability.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.min.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.ability.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.optional.NAME.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.optional.NAME.save.fail.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.save.fail.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.optional.NAME.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.optional.NAME.check.fail.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.check.fail.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.magicResistance.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicResistance.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.magicVulnerability.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicVulnerability.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.advantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.advantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.advantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.skill.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.skill.${abl}`);
  })

  midiFlags.push(`flags.${MODULE_ID}.advantage.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.max.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.min.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.skill.all`);
  Object.keys(config.skills).forEach(skill => {
    midiFlags.push(`flags.${MODULE_ID}.advantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.skill.${skill}`);
    midiFlags.push(`flags.${MODULE_ID}.disadvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.skill.${skill}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.skill.${skill}`);
    // midiFlags.push(`flags.${MODULE_ID}.max.skill.${skill}`); replaced by core
    // midiFlags.push(`flags.${MODULE_ID}.min.skill.${skill}`); replaced by core
    midiFlags.push(`flags.${MODULE_ID}.optional.NAME.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.skill.${skill}`);
  })
  midiFlags.push(`flags.${MODULE_ID}.advantage.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.deathSave`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.deathSave`);
  midiFlags.push(`flags.${MODULE_ID}.deathSaveBonus`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.deathSaveBonus`);
  if (game.system?.id === "dnd5e") {
    // fix for translations
    ["vocal", "somatic", "material"].forEach(comp => {
      midiFlags.push(`flags.${MODULE_ID}.fail.spell.${comp.toLowerCase()}`);
      daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.spell.${comp.toLowerCase()}`);
    });
    midiFlags.push(`flags.${MODULE_ID}.DR.all`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.all`);

    midiFlags.push(`flags.${MODULE_ID}.DR.non-magical`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.non-magical`);
    midiFlags.push(`flags.${MODULE_ID}.DR.non-magical-physical`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.non-magical-physical`);
    midiFlags.push(`flags.${MODULE_ID}.DR.non-silver`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.non-silver`);
    midiFlags.push(`flags.${MODULE_ID}.DR.non-adamant`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.non-adamant`);
    midiFlags.push(`flags.${MODULE_ID}.DR.non-physical`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.non-physical`);
    midiFlags.push(`flags.${MODULE_ID}.DR.final`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.final`);
    midiFlags.push(`flags.${MODULE_ID}.damage.reroll-kh`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.damage.reroll-kh`);
    midiFlags.push(`flags.${MODULE_ID}.damage.reroll-kl`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.damage.reroll-kl`);

    Object.keys(config.damageTypes).forEach(key => {
      midiFlags.push(`flags.${MODULE_ID}.DR.${key}`);
      daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.${key}`);
    });

    midiFlags.push(`flags.${MODULE_ID}.DR.healing`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.healing`);
    midiFlags.push(`flags.${MODULE_ID}.DR.temphp`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.temphp`);
  } else if (game.system?.id === "sw5e") {
    midiFlags.push(`flags.${MODULE_ID}.DR.all`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.all`);
    midiFlags.push(`flags.${MODULE_ID}.DR.final`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.final`);
    Object.keys(config.damageResistanceTypes).forEach(dt => {
      midiFlags.push(`flags.${MODULE_ID}.DR.${dt}`);
      daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.${dt}`);
    })
    midiFlags.push(`flags.${MODULE_ID}.DR.healing`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.healing`);
    midiFlags.push(`flags.${MODULE_ID}.DR.temphp`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.temphp`);
  }

  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.attack.fail.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.attack.fail.all`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.damage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.damage.all`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.check.fail.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.check.fail.all`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.save.fail.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.save.fail.all`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.label`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.label`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.skill.fail.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.skill.fail.all`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.count`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.count`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.countAlt`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.countAlt`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.ac`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.ac`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.criticalDamage`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.criticalDamage`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.activation`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.activation`);
  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.force`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.force`);

  midiFlags.push(`flags.${MODULE_ID}.uncanny-dodge`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.uncanny-dodge`);
  midiFlags.push(`flags.${MODULE_ID}.OverTime`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.OverTime`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.ActivityOverTime`);
  midiFlags.push(`flags.${MODULE_ID}.inMotion`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.inMotion`);
  //@ts-ignore
  const damageTypes = Object.keys(config.damageTypes);
  for (let key of damageTypes) {
    midiFlags.push(`flags.${MODULE_ID}.absorption.${key}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.absorption.${key}`);
  }
  midiFlags.push(`flags.${MODULE_ID}.fail.disadvantage.heavy`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.disadvantage.heavy`);

  /*
  midiFlags.push(`flags.${MODULE_ID}.grants.advantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.attack.all`);
  midiFlags.push(``);

  midiFlags.push(``);
  midiFlags.push(``);
  */
  if (installedModules.get("dae")) {
    const initDAE = async () => {
      for (let i = 0; i < 120; i++) {
        if (globalThis.DAE) {
          globalThis.DAE.addAutoFields(midiFlags);
          return true;
        } else {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
      return false;
    };
    initDAE().then(value => { if (!value) error(`initDae settings failed`) });
  }
}

// Revisit to find out how to set execute as GM
const MQMacros = [
  {
    name: "MidiQOL.showTroubleShooter",
    checkVersion: true,
    version: "11.0.9",
    permission: { default: 1 },
    commandText: `
    new MidiQOL.TroubleShooter().render(true)`
  },
  {
    name: "MidiQOL.exportTroubleShooterData",
    checkVersion: true,
    version: "11.0.9.1",
    permission: { default: 1 },
    commandText: `MidiQOL.TroubleShooter.exportTroubleShooterData()`
  },
  {
    name: "MidiQOL.GMShowPlayerDamageCards",
    checkVersion: true,
    version: "11.4.10",
    commandText: `
    const matches = document.querySelectorAll(".midi-qol-player-damage-card");
    matches.forEach(element => {
      let target = element.parentElement.parentElement.parentElement;
      target.style.display = "inherit";
    })`
  }
]
export async function createMidiMacros() {
  const midiVersion = "11.0.9"
  if (game.user?.isGM) {
    for (let macroSpec of MQMacros) {
      try {
        let existingMacros = game.macros?.filter(m => m.name === macroSpec.name) ?? [];
        if (existingMacros.length > 0) {
          for (let macro of existingMacros) {
            if (macroSpec.checkVersion
              && !foundry.utils.isNewerVersion(macroSpec.version, (macro.flags["midi-version"] ?? "0.0.0")))
              continue; // already up to date
            //@ts-expect-error
            await macro.update({command: macroSpec.commandText, "flags.midi-version": macroSpec.version}, {} as never);
          }
        } else {
          const macroData = {
            _id: null,
            name: macroSpec.name,
            type: "script",
            author: game.user?.id,
            img: 'icons/svg/dice-target.svg',
            scope: 'global',
            command: macroSpec.commandText,
            folder: null,
            sort: 0,
            permission: {
              default: 1,
            },
            flags: { "midi-version": macroSpec.version ?? "midiVersion" }
          };
          // @ts-expect-error createDocuments bug
          await Macro.createDocuments([macroData]);
          log(`Macro ${macroData.name} created`);
        }
      } catch (err) {
        const message = `createMidiMacros | failed to create macro ${macroSpec.name}`
        TroubleShooter.recordError(err, message);
        error(err, message);
      }
    }
  }
}


const midiOldErrorHandler = globalThis.onerror;
function midiOnerror(event: string | Event, source?: string | undefined, lineno?: number | undefined, colno?: number | undefined, error?: Error) {
  console.warn("midi-qol detected error", event, source, lineno, colno, error);
  TroubleShooter.recordError(error, "uncaught global error");
  if (midiOldErrorHandler) return midiOldErrorHandler(event, source, lineno, colno, error);
  return false;
}

export function setupMidiStatusEffects() {
  // @ts-expect-error no dnd5e-types
  systemConcentrationId = CONFIG.specialStatusEffects.CONCENTRATING;
  if (!CONFIG.statusEffects.find(e => e.id === systemConcentrationId)) {
    // @ts-expect-error not expecting special
    CONFIG.statusEffects.push({ id: systemConcentrationId, name: i18n(`EFFECT.${SystemString}.StatusConcentrating`), img: "systems/dnd5e/icons/svg/statuses/concentrating.svg", special: "CONCENTRATING" });
  }
  // Initialise these effects so that we don't need to make a raft of code aysnc only to fetch these
  if (configSettings.enforceBonusActions !== "none") {
    if (!CONFIG.statusEffects.find(e => e._id === getStaticID("bonusaction"))) {
      CONFIG.statusEffects.push({
        id: "bonusaction",
        _id: getStaticID("bonusaction"),
        name: i18n("midi-qol.bonusActionUsed"),
        changes: [{ key: "flags.midi-qol.actions.bonus", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" }], img: "modules/midi-qol/icons/bonus-action.svg",
        //@ts-expect-error
        flags: { dae: { specialDuration: ["turnStart", "combatEnd", "shortRest"] } }
      });
    }
    // @ts-expect-error not expecting keepId
    ActiveEffect.implementation.fromStatusEffect("bonusaction", { keepId: true }).then(effect => {
      midiBonusActionEffect = effect
      globalThis.MidiQOL.midiBonusActionEffect = effect;
    });
  }

  if (configSettings.enforceReactions !== "none") {
    if (!CONFIG.statusEffects.find(e => e._id === getStaticID("reaction"))) {
      CONFIG.statusEffects.push({
        id: "reaction",
        _id: getStaticID("reaction"),
        name: i18n("midi-qol.reactionUsed"),
        changes: [{ key: "flags.midi-qol.actions.reaction", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" }],
        img: "modules/midi-qol/icons/reaction.svg",
        effectData: { transfer: false },
        //@ts-expect-error
        flags: { dae: { specialDuration: ["turnStart", "combatEnd", "shortRest"] } }
      });
    }
    // @ts-expect-error not expecting keepId
    ActiveEffect.implementation.fromStatusEffect("reaction", { keepId: true }).then(effect => {
      midiReactionEffect = effect;
      globalThis.MidiQOL.midiReactionEffect = effect;
    });
  }
  if (!CONFIG.statusEffects.find(e => e._id === getStaticID("flanking"))) {
    CONFIG.statusEffects.push({
      id: "flanking",
      _id: getStaticID("flanking"),
      name: i18n("midi-qol.Flanking"),
      changes: [
        { key: "flags.midi-qol.advantage.attack.mwak", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" },
        { key: "flags.midi-qol.advantage.attack.msak", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" }
      ],
      img: "icons/svg/sword.svg",
      effectData: { transfer: false },
      //@ts-expect-error
      flags: { dae: { specialDuration: ["combatEnd"] } }
    });
  }

  //@ts-expect-error not expecting keepId
  ActiveEffect.implementation.fromStatusEffect("flanking", { keepId: true }).then(effect => {
    midiFlankingEffect = effect;
    globalThis.MidiQOL.midiFlankingEffect = effect;
  });

  if (!CONFIG.statusEffects.find(e => e._id === getStaticID("flanked"))) {
    CONFIG.statusEffects.push({
      id: "flanked",
      _id: getStaticID("flanked"),
      name: i18n("midi-qol.Flanked"),
      changes: [
        { key: "flags.midi-qol.grants.advantage.attack.mwak", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" },
        { key: "flags.midi-qol.grants.advantage.attack.msak", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" }
      ],
      img: "modules/midi-qol/icons/encirclement.svg",
      effectData: {
        transfer: false,
      },
      //@ts-expect-error
      flags: { dae: { specialDuration: ["combatEnd"] } }
    });
  };

  //@ts-expect-error not expecting keepId
  ActiveEffect.implementation.fromStatusEffect("flanked", { keepId: true }).then(effect => {
    midiFlankedEffect = effect;
    globalThis.MidiQOL.midiFlankedEffect = effect;
  });
}
// globalThis.onerror = midiOnerror;
