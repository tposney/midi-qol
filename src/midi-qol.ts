import { registerSettings, fetchParams, configSettings, checkRule, enableWorkflow, fetchSoundSettings, midiSoundSettingsBackup, readySettingsSetup, collectSettingData, exportSettingsToJSON, importSettingsFromJSON, safeGetGameSetting, shouldDisplaySaveDC, triggeredActivityTargetOptions, triggeredActivityRollAsOptions, resetConfigSettingsToDefaults } from './module/settings.js';
import { preloadTemplates } from './module/preloadTemplates.js';
import { checkModules, setupModules } from './module/setupModules.js';
import { itemPatching, visionPatching, actorAbilityRollPatching, readyPatching, initPatching, addDiceTermModifiers, MidiDependentsRegistry, computeAbilityAdvantage, computeSkillAdvantage, computeToolAdvantage } from './module/patching.js';
import { initHooks, readyHooks, setupHooks } from './module/Hooks.js';
import { SaferSocket, initGMActionSetup, setupSocket, socketlibSocket, unTimedExecuteAsGM } from './module/GMAction.js';
import { setupSheetQol } from './module/sheetQOL.js';
import { TrapWorkflow, DamageOnlyWorkflow, Workflow, DummyWorkflow, DDBGameLogWorkflow, UserWorkflow } from './module/Workflow.js';
import { addConcentrationDependent, addRollTo, applyTokenDamage, canSee, canSense, canSenseModes, checkDistance, checkIncapacitated, checkNearby, chooseEffect, completeItemUse, computeCoverBonus, contestedRoll, createConditionData, throttledUpdate, displayDSNForRoll, doConcentrationCheck, doOverTimeEffect, evalAllConditions, evalCondition, findNearby, findNearbyCount, getCachedDocument, getChanges, getConcentrationEffect, getTokenDocument, getOrCreateTokenForActor, getOrCreateTokenForActorAsSet, getTokenPlayerName, getTokenPlayerNameForUser, getTraitMult, hasCondition, hasUsedBonusAction, hasUsedReaction, isValidTarget, midiRenderAttackRoll, midiRenderBonusDamageRoll, midiRenderDamageRoll, midiRenderOtherDamageRoll, midiRenderRoll, fromActorUuid, playerFor, playerForActor, raceOrType, reactionDialog, removeHiddenCondition, removeInvisibleCondition, removeReactionUsed, setBonusActionUsed, setReactionUsed, tokenForActor, typeOrRace, validRollAbility, actorFromUuid, removeActionUsed, removeBonusActionUsed, getCheckRollModeFor, getSaveRollModeFor, completeActivityUse, checkActivityRange, modifyDamageBy, computeDistance, addDependent, cleanCPRFlanked, updatesCache, createDamageDetail, activityHasEmanationNoTemplate, getVitalityItem, getVitalityValue, getVitalityMax, hasVitalitySystem, resolveItemMacro, resolveActivityMacro } from './module/utils.js';
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
import { RollModifierTracker } from './module/lib/RollModifierTracker.js';
import { ChatLogMidi } from './module/ChatClasses/ChatLogMidi.js';
import { injectMidiCompletions } from './module/lib/midiCompletions.js';

// Register macro-autocomplete hook handler at module load time so it's
// ready before macro-autocomplete fires "macro-autocomplete.ready" in its ready hook.
injectMidiCompletions();

export function getCanvas(): foundry.canvas.Canvas | undefined {
  if (!canvas || !canvas.scene) {
    error("Canvas/Scene not ready - roll automation will not function");
    return undefined;
  }
  return canvas;
}

export let ceInterface: {
  findEffects: () => ActiveEffect.Implementation[];
  findEffect: (input: {
    folderId?: string,
    effectId?: string,
    effectName?: string
  }) => ActiveEffect.Implementation | null;
  hasEffectApplied: (input: {
    effectId?: string,
    effectName?: string,
    uuid?: string
  }) => boolean;
  addEffect: (input: {
    effectId?: string,
    effectName?: string,
    effectData?: ActiveEffect.CreateData,
    uuid?: string,
    overlay?: boolean,
    origin?: string | null,
  }) => Promise<ActiveEffect.Implementation[]>;
  removeEffect: (input: {
    effectId?: string,
    effectName?: string,
    uuid?: string,
    origin?: string | null,
  }) => Promise<void>;
  toggleEffect: (input: {
    effectId?: string,
    effectName?: string,
    uuids?: string[],
    overlay?: boolean;
    prioritizeTargets?: boolean;
    origin?: string | null
  }) => Promise<void>
} | undefined;

export let BaseChatLogClass;
export let debugEnabled = 0;
// 0 = none, warnings = 1, debug = 2, all = 3
export let debug = (...args: any[]) => { if (debugEnabled > 1) console.log("DEBUG: midi-qol | ", ...args) };
export let log = (...args: any[]) => console.log("midi-qol | ", ...args);
export let warn = (...args: any[]) => { if (debugEnabled > 0) console.warn("midi-qol | ", ...args) };
export let error = (...args: any[]) => console.error("midi-qol | ", ...args);
export let timelog = (...args: any[]) => warn("midi-qol | ", Date.now(), ...args);
export let levelsAPI: any;
// export let allDamageTypes;
export const MODULE_ID = "midi-qol";

const { StringField } = foundry.data.fields;

export let i18n = (key: string) => {
  return game.i18n?.localize(key) ?? key;
}

export let i18nFormat = (key: string, data = {}) => {
  return game.i18n?.format(key, data) ?? key;
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

export async function busyWait(milliSeconds: number) {
  return (new Promise(resolve => setTimeout(resolve, milliSeconds)));
}

export let midiFlags: string[] = [];
export let allAttackTypes: string[] = []
export let gameStats: RollStats;
export let overTimeEffectsToDelete: Record<string, { uuid: string }> = {};
export let savedOverTimeEffectsToDelete: Record<string, {
  uuid: string;
  saveCount?: number;        // Number of saves required
  saveCountAction?: string;  // "-" = remove (default), "+" = permanent, or effectSpec
  failCount?: number;        // Number of fails required
  failCountAction?: string;  // "+" = permanent (default), "-" = remove, or effectSpec
}> = {}
export let MQItemMacroLabel: string;
export let MQActivityMacroLabel: string;
export let MQOnUseOptions: Record<string, string>;
export let GameSystemConfig: typeof CONFIG.DND5E;
export let systemConcentrationId: string;
export let midiReactionEffect: ActiveEffect.Implementation | undefined;
export let midiBonusActionEffect: ActiveEffect.Implementation | undefined;
export let midiFlankingEffect: ActiveEffect.Implementation | undefined;
export let midiFlankedEffect: ActiveEffect.Implementation | undefined;

export const MESSAGE_TYPES = {
  HITS: 1,
  SAVES: 2,
  ATTACK: 3,
  DAMAGE: 4,
  OTHER: 5,
  ITEM: 0
};
export let MQDamageRollTypes = ["defaultDamage", "otherDamage", "bonusDamage"];

/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
//@ts-expect-error
Hooks.once("levelsReady", function () {
  // @ts-expect-error
  levelsAPI = CONFIG.Levels.API;
});
Hooks.once("init", () => {
  setupChatMessageMidi();
  //@ts-expect-error
  CONFIG.ChatMessage.documentClass = ChatMessageMidi;
  // @ts-expect-error
  CONFIG.Combat.documentClass = MidiCombat5e;
});

// @ts-expect-error it'll get populated don't worry
globalThis.MidiQOL ??= {}
globalThis.MidiQOL.checkIncapacitated = checkIncapacitated;
globalThis.MidiQOL.getVitalityItem = getVitalityItem;
globalThis.MidiQOL.getVitalityValue = getVitalityValue;
globalThis.MidiQOL.getVitalityMax = getVitalityMax;
globalThis.MidiQOL.hasVitalitySystem = hasVitalitySystem;
// @ts-expect-error - these are new helper functions for macro resolution
globalThis.MidiQOL.resolveItemMacro = resolveItemMacro;
// @ts-expect-error - these are new helper functions for macro resolution
globalThis.MidiQOL.resolveActivityMacro = resolveActivityMacro;

function setupActivities() {
  // @ts-expect-error it'll get populated don't worry
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
  setupTransformActivity();
  globalThis.MidiQOL.activityTypes["transform"] = { documentClass: MidiTransformActivity };
  setupUtilityActivity();
  globalThis.MidiQOL.activityTypes["utility"] = { documentClass: MidiUtilityActivity };
  setupForwardActivity();
  globalThis.MidiQOL.activityTypes["forward"] = { documentClass: MidiForwardActivity };
  globalThis.MidiQOL.activityTypes["MidiActivityMixin"] = MidiActivityMixin;
}

Hooks.once('init', async function () {
  GameSystemConfig = CONFIG.DND5E;
  log('Initializing midi-qol');
  window.customElements.define("midi-damage-application", DamageApplicationElementMidi as unknown as CustomElementConstructor);
  setupActivities();
  // Only install ChatLogMidi if chatlog-prune module is not active
  if (game.settings.get("midi-qol", "pruneChatLog") && !game.modules.get("chatlog-prune")?.active) {
    foundry.utils.logCompatibilityWarning(
      "midi-qol | Built-in chat log pruning is deprecated. Please install and activate the 'chatlog-prune' module instead.",
      { since: "13.0.37", until: "14.0.0" }
    );
    BaseChatLogClass = CONFIG.ui.chat;
    //@ts-expect-error - lots of incorrect missing elements from the class
    CONFIG.ui.chat = ChatLogMidi;
  }

  // @ts-expect-error no dnd5e-types
  systemConcentrationId = CONFIG.specialStatusEffects.CONCENTRATING;
  //@ts-expect-error
  Hooks.once('dfreds-convenient-effects.ready', () => {
    setupMidiStatusEffects();
  });
  Hooks.once("dae.ready", api => setupMidiFlags(api));

  addConfigOptions();
  GameSystemConfig.areaTargetTypes["emanationNoTemplate"] = {
    label: i18n("midi-qol.emanationNoTemplate"),
    template: "rect",
    standard: true,
    counted: "midi-qol.emanationTemplate.counted"
  };

  GameSystemConfig.damageTypes["none"] = { label: i18n("midi-qol.noType"), icon: `systems/${game.system?.id}/icons/svg/trait-damage-immunities.svg` };
  GameSystemConfig.damageTypes["midi-none"] = { label: i18n("midi-qol.midi-none"), icon: `systems/${game.system?.id}/icons/svg/trait-damage-immunities.svg` };
  GameSystemConfig.damageTypes["vitality"] = { label: i18n("midi-qol.vitalityDamage"), icon: `modules/${MODULE_ID}/icons/vitality.svg` };
  GameSystemConfig.healingTypes["vitality"] = { label: i18n("midi-qol.vitalityHealing"), icon: `modules/${MODULE_ID}/icons/vitality.svg` };
  allAttackTypes = ["rwak", "mwak", "rsak", "msak"];
  initHooks();

  // globalThis.MidiQOL = { checkIncapacitated };
  // Assign custom classes and constants here

  // Register custom module settings
  registerSettings();
  fetchParams();
  fetchSoundSettings();
  // This seems to cause problems for localisation for the items compendium (at least for french)
  // Try a delay before doing this - hopefully allowing localisation to complete
  // If babele is installed then wait for it to be ready
  if (game.modules.get("babele")?.active) {
    //@ts-expect-error
    Hooks.once("babele.ready", MidiSounds.getWeaponBaseTypes);
  } else {
    Hooks.once("ready", MidiSounds.getWeaponBaseTypes);
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
  gameStats = new RollStats();
});
//@ts-expect-error
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

//@ts-expect-error
Hooks.on("dae.modifyBaseValues", (specKey: string, baseValues, _characterSpec) => {
  baseValues[`flags.${MODULE_ID}.ActivityOverTime`] = [new StringField({ initial: "" }), -1];
});
//@ts-expect-error
Hooks.on("dae.addFieldMappings", (fieldMappings) => {
  GameSystemConfig = CONFIG.DND5E;
  let allAttackTypes = ["rwak", "mwak", "rsak", "msak"];
  registerSettings();
  fetchParams();
  for (let key of Object.keys(GameSystemConfig.damageTypes ?? {})) {
    fieldMappings[`flags.${MODULE_ID}.DR.${key}`] = `system.traits.dm.amount.${key}`;
    fieldMappings[`flags.${MODULE_ID}.absorption.${key}`] = `system.traits.da.${key}`;
  }
  for (let key of Object.keys(GameSystemConfig.healingTypes ?? {})) {
    fieldMappings[`flags.${MODULE_ID}.DR.${key}`] = `system.traits.dm.amount.${key}`;
    fieldMappings[`flags.${MODULE_ID}.absorption.${key}`] = `system.traits.da.${key}`;
  }
  fieldMappings[`flags.${MODULE_ID}.DR.all`] = "system.traits.dm.midi.all";
  fieldMappings[`flags.${MODULE_ID}.absorption.all`] = "system.traits.da.midi.all";

  Object.keys(GameSystemConfig.itemActionTypes).forEach(aType => {
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
  if (GameSystemConfig.skills) for (let skill of Object.keys(GameSystemConfig.skills)) {
    fieldMappings[`flags.${MODULE_ID}.max.skill.${skill}`] = `system.skills.${skill}.roll.max`;
    fieldMappings[`flags.${MODULE_ID}.min.skill.${skill}`] = `system.skills.${skill}.roll.min`;
  }
  fieldMappings[`flags.${MODULE_ID}.max.ability.save.concentration`] = `system.attributes.concentration.roll.max`;
  fieldMappings[`flags.${MODULE_ID}.min.ability.save.concentration`] = `system.attributes.concentration.roll.min`;
  fieldMappings[`flags.${MODULE_ID}.concentrationSaveBonus`] = `system.attributes.concentration.bonuses.save`;
  fieldMappings[`flags.${MODULE_ID}.sharpShooter`] = `flags.dnd5e.sharpShooter`;
  fieldMappings[`flags.${MODULE_ID}.grants.fail.advantage.attack.all`] = `flags.${MODULE_ID}.grants.noAdvantage.attack.all`;
  fieldMappings[`flags.${MODULE_ID}.grants.fail.disadvantage.attack.all`] = `flags.${MODULE_ID}.grants.noDisadvantage.attack.all`;

  // Deprecated flag mappings: advantage.ability.save/check -> advantage.save/check (consistent with attack/skill/tool)
  // These allow old effects to continue working while users transition to the new naming convention
  fieldMappings[`flags.${MODULE_ID}.advantage.ability.save.all`] = `flags.${MODULE_ID}.advantage.save.all`;
  fieldMappings[`flags.${MODULE_ID}.disadvantage.ability.save.all`] = `flags.${MODULE_ID}.disadvantage.save.all`;
  fieldMappings[`flags.${MODULE_ID}.advantage.ability.check.all`] = `flags.${MODULE_ID}.advantage.check.all`;
  fieldMappings[`flags.${MODULE_ID}.disadvantage.ability.check.all`] = `flags.${MODULE_ID}.disadvantage.check.all`;
  // Per-ability mappings for saves and checks
  for (let abl of Object.keys(GameSystemConfig.abilities)) {
    fieldMappings[`flags.${MODULE_ID}.advantage.ability.save.${abl}`] = `flags.${MODULE_ID}.advantage.save.${abl}`;
    fieldMappings[`flags.${MODULE_ID}.disadvantage.ability.save.${abl}`] = `flags.${MODULE_ID}.disadvantage.save.${abl}`;
    fieldMappings[`flags.${MODULE_ID}.advantage.ability.check.${abl}`] = `flags.${MODULE_ID}.advantage.check.${abl}`;
    fieldMappings[`flags.${MODULE_ID}.disadvantage.ability.check.${abl}`] = `flags.${MODULE_ID}.disadvantage.check.${abl}`;
  }
  if (debugEnabled > 0) warn("fieldMappings", fieldMappings);

});

Hooks.on("dae.addSpecialDurations", daeSpecialDurations => {
  daeSpecialDurations["1Action"] = i18n("dae.1Action");
  daeSpecialDurations["Bonus Action"] = i18n("dae.Bonus Action");
  daeSpecialDurations["Reaction"] = i18n("dae.Reaction");
  daeSpecialDurations["Turn Action"] = i18n("dae.Turn Action");
  daeSpecialDurations["1Spell"] = i18n("dae.1Spell");
  daeSpecialDurations["1Attack"] = i18nFormat("dae.1Attack", { type: `${i18n("dae.spell")}/${i18n("dae.weapon")} ${i18n("dae.attack")}` });
  daeSpecialDurations["1Hit"] = i18nFormat("dae.1Hit", { type: `${i18n("dae.spell")}/${i18n("dae.weapon")}` });
  daeSpecialDurations["1Critical"] = i18n("dae.1Critical");
  daeSpecialDurations["1Fumble"] = i18n("dae.1Fumble");
  //    daeSpecialDurations["1Hit"] = i18n("dae.1Hit");
  daeSpecialDurations["1Reaction"] = i18n("dae.1Reaction")
  let attackTypes = ["mwak", "rwak", "msak", "rsak"];
  attackTypes.forEach(at => {
    daeSpecialDurations[`1Attack:${at}`] = `${GameSystemConfig.itemActionTypes[at]}: ${i18nFormat("dae.1Attack", { type: GameSystemConfig.itemActionTypes[at] })}`;
    daeSpecialDurations[`1Hit:${at}`] = `${GameSystemConfig.itemActionTypes[at]}: ${i18nFormat("dae.1Hit", { type: GameSystemConfig.itemActionTypes[at] })}`;
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
    let ablString = GameSystemConfig.abilities[abl].label;
    daeSpecialDurations[`isSave.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isSaveDetail")}`;
    daeSpecialDurations[`isSaveSuccess.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isSaveDetail")}: ${i18n("dae.success")}`;
    daeSpecialDurations[`isSaveFailure.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isSaveDetail")}: ${i18n("dae.failure")}`;
    daeSpecialDurations[`isCheck.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isCheckDetail")}`;
  });
  Object.keys(GameSystemConfig.damageTypes).forEach(key => {
    daeSpecialDurations[`isDamaged.${key}`] = `${i18n("dae.isDamaged")}: ${GameSystemConfig.damageTypes[key].label}`;
  });
  daeSpecialDurations[`isDamaged.healing`] = `${i18n("dae.isDamaged")}: ${GameSystemConfig.healingTypes["healing"].label}`;
  Object.keys(GameSystemConfig.skills).forEach(skillId => {
    daeSpecialDurations[`isSkill.${skillId}`] = `${i18n("dae.isRollBase")} ${i18n("dae.isSkillDetail")} ${GameSystemConfig.skills[skillId].label}`;
  });

})

let daeFieldBrowserFields: Array<string> = [];

Hooks.on("dae.setFieldData", fieldData => {
  fieldData["MidiQOL"] = Array.from(new Set(daeFieldBrowserFields)).sort();
  log("setDaeFieldData | fieldData", fieldData);
});

/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function () {
  // Do anything after initialization but before ready
  setupModules();
  setupSocket();
  fetchParams();
  fetchSoundSettings();
  itemPatching();
  visionPatching();
  initGMActionSetup();
  setupHooks();
  MidiQOL.MQdefaultDamageType = i18n("midi-qol.defaultDamageType");
  MQItemMacroLabel = i18n("midi-qol.ItemMacroText") ?? "ItemMacro";
  MQActivityMacroLabel = i18n("midi-qol.ActivityMacroText") ?? "ActivityMacro";
  setupSheetQol();
  createMidiMacros();
  setupMidiQOLApi();
});

Hooks.once("ready", () => {
  // can't hook off simple cover ready as it fires too early to be able to call api.setLibraryMode
  if (configSettings.optionalRules.coverCalculation === "simplecover5e" && game.modules.get("simplecover5e")?.active) {
    //@ts-expect-error
    game.modules.get("simplecover5e")?.api?.setLibraryMode(true);
  }
})

function addConfigOptions() {

  let config = GameSystemConfig ?? {};
  config.damageTypes["none"] = { label: i18n("midi-qol.noType"), icon: "systems/dnd5e/icons/svg/trait-damage-immunities.svg" };
  config.damageTypes["midi-none"] = { label: i18n("midi-qol.midi-none"), icon: "systems/dnd5e/icons/svg/trait-damage-immunities.svg" };
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

  // config.damageResistanceTypes = config.damageResistanceTypes ?? {};
  // config.damageResistanceTypes["silver"] = i18n("midi-qol.NonSilverPhysical");
  // config.damageResistanceTypes["adamant"] = i18n("midi-qol.NonAdamantinePhysical");
  // config.damageResistanceTypes["physical"] = i18n("midi-qol.NonMagicalPhysical");
  // config.damageResistanceTypes["spell"] = i18n("midi-qol.spell-damage");
  // config.damageResistanceTypes["nonmagic"] = i18n("midi-qol.NonMagical");
  // config.damageResistanceTypes["magic"] = i18n("midi-qol.Magical");
  // config.damageResistanceTypes["healing"] = config.healingTypes?.healing?.label;
  // config.damageResistanceTypes["temphp"] = config.healingTypes?.temphp?.label;

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
  const dnd5eReaction = `DND5E.Reaction`;
  // config.abilityActivationTypes["reactionpreattack"] = `${i18n(dnd5eReaction)} ${i18n("midi-qol.reactionPreAttack")}`;
  // config.abilityActivationTypes["reactiondamage"] = `${i18n(dnd5eReaction)} ${i18n("midi-qol.reactionDamaged")}`;
  // config.abilityActivationTypes["reactionmanual"] = `${i18n(dnd5eReaction)} ${i18n("midi-qol.reactionManual")}`;
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
/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */
Hooks.once('ready', function () {
  cleanCPRFlanked();
  addConfigOptions();
  // allDamageTypes = {};
  // allDamageTypes.none = foundry.utils.duplicate(GameSystemConfig.damageTypes["midi-none"]);
  // allDamageTypes.none.label = i18n("DND5E.None");
  // allDamageTypes[""] = allDamageTypes.none
  // allDamageTypes = foundry.utils.mergeObject(allDamageTypes, foundry.utils.mergeObject(GameSystemConfig.damageTypes, GameSystemConfig.healingTypes, { inplace: false }));
  registerSettings();
  actorAbilityRollPatching();
  setupMidiStatusEffects();

  MQOnUseOptions = {
    "preTargeting": "Called before targeting is resolved (*)",
    "preItemRoll": "Called before the item is rolled (*)",
    "templatePlaced": "Only called once a template is placed",
    "preAttackRoll": "Before Attack Roll",
    "preAttackRollConfig": "Before Attack Configuration",
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

  globalThis.dnd5e.config.areaTargetTypes["emanationNoTemplate"] = {
    label: i18n("midi-qol.emanationNoTemplate"),
    template: "rect",
    standard: true,
    counted: "midi-qol.emanationTemplate.counted"
  };

  if (game.user?.isGM && game.settings) {
    const instanceId = game.settings.get(MODULE_ID, "instanceId") as string;
    if ([undefined, ""].includes(instanceId)) {
      game.settings.set(MODULE_ID, "instanceId", foundry.utils.randomID());
    }
    const oldVersion = game.settings.get(MODULE_ID, "last-run-version") as number | string;
    const newVersion = game.modules.get(MODULE_ID)?.version;
    if (foundry.utils.isNewerVersion(newVersion, oldVersion)) {
      console.warn(`midi-qol | instance ${game.settings.get(MODULE_ID, "instanceId")} version change from ${oldVersion} to ${newVersion}`);
      game.settings.set(MODULE_ID, "last-run-version", newVersion);
      // look at sending a new version has been installed.
    }
    readySettingsSetup();
  }
  Hooks.callAll("midi-qol.ready")

  checkModules();
  readyHooks();
  readyPatching();
  // injectMidiCompletions() moved to module load time (top-level) so the
  // Hooks.on("macro-autocomplete.ready") handler is registered before
  // macro-autocomplete fires it during its own ready hook.

  // @ts-expect-error no types for CE
  ceInterface = game.modules.get("dfreds-convenient-effects")?.api;

  if (midiSoundSettingsBackup) game.settings.set(MODULE_ID, "MidiSoundSettings-backup", midiSoundSettingsBackup)

  // Make midi-qol targets hoverable
  // TODO: Does this work? Consider moving away from jquery
  $(document).on("mouseover", ".midi-qol-target-name", (e) => {
    const tokenId = e.currentTarget.id
    const tokenObj = canvas.tokens?.get(tokenId)
    if (!tokenObj) return;
    tokenObj.hover = true
  });

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

import { setupChatMessageMidi, ChatMessageMidi } from './module/ChatClasses/ChatMessageMidi.js';
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
import { MidiTransformActivity, setupTransformActivity } from './module/activities/TransformActivity.js';
import { MidiCombat5e } from './module/MidiCombat5e.js';
import { TokenOrDocument } from './globals.js';
import { DamageApplicationElementMidi } from './module/ChatClasses/DamageApplicationElementMidi.js';

// Add any additional hooks if necessary
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
  globalThis.MidiQOL = {
    ...globalThis.MidiQOL,
    activityHasEmanationNoTemplate,
    addDependent,
    addConcentrationDependent,
    addRollTo,
    addUndoChatMessage,
    RollModifierTracker,
    applyTokenDamage,
    canSee,
    canSense,
    canSenseModes,
    checkIncapacitated,
    checkDistance,
    checkNearby,
    checkActivityRange,
    checkRule,
    completeItemUse,
    completeActivityUse,
    computeAbilityAdvantage,
    computeCoverBonus,
    computeDistance,
    computeSkillAdvantage,
    computeToolAdvantage,
    ConfigPanel,
    configSettings: () => { return configSettings },
    get currentConfigSettings() { return configSettings },
    collectSettingData,
    exportSettingsToJSON,
    importSettingsFromJSON,
    resetConfigSettingsToDefaults,
    contestedRoll,
    createConditionData,
    createDamageDetail,
    DamageOnlyWorkflow,
    debouncedUpdate: throttledUpdate,
    debug,
    displayDSNForRoll,
    doConcentrationCheck,
    doOverTimeEffect,
    evalAllConditions,
    evalCondition,
    DummyWorkflow,
    chooseEffect,
    enableWorkflow,
    fetchParams,
    findNearby,
    findNearbyCount,
    gameStats,
    getCachedChatMessage: getCachedDocument,
    getChanges, // (actorOrItem, key) - what effects on the actor or item target the specific key
    getConcentrationEffect,
    getSaveRollModeFor,
    getCheckRollModeFor,
    getTokenPlayerName,
    getTokenPlayerNameForUser,
    getTokenForActor: getOrCreateTokenForActor,
    getTokenForActorAsSet: getOrCreateTokenForActorAsSet,
    getTraitMult,
    getUndoQueue,
    getVitalityItem,
    getVitalityMax,
    getVitalityValue,
    hasCondition,
    hasUsedBonusAction,
    hasUsedReaction,
    hasVitalitySystem,
    humanoid,
    incapacitatedConditions: ["incapacitated", "Convenient Effect: Incapacitated", "stunned", "Convenient Effect: Stunned", "paralyzed", "paralysis", "Convenient Effect: Paralyzed", "unconscious", "Convenient Effect: Unconscious", "dead", "Convenient Effect: Dead", "petrified", "Convenient Effect: Petrified"],
    InvisibleDisadvantageVisionModes,
    isTargetable: isValidTarget,
    TargetConfirmationDialog,
    log,
    midiFlags,
    MidiDependentsRegistry,
    midiRenderRoll,
    midiRenderAttackRoll,
    midiRenderDamageRoll,
    midiRenderBonusDamageRoll,
    midiRenderOtherDamageRoll,
    get midiSoundSettings() { return game.settings.get("midi-qol", "MidiSoundSettings") },
    MidiSounds,
    modifyDamageBy,
    MQfromActorUuid: fromActorUuid,
    actorFromUuid,
    MQfromUuid: fromUuidSync,
    fromUuidSync,
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
    resolveTargetConfirmation,
    safeGetGameSetting,
    shouldDisplaySaveDC,
    selectTargetsForTemplate: templateTokens,
    setBonusActionUsed,
    setReactionUsed,
    showItemInfo: (item: Item.Implementation) => { return showItemInfo.bind(item)() },
    showUndoQueue,
    showUndoWorkflowApp,
    socket: () => { return new SaferSocket(socketlibSocket) },
    testfunc,
    tokenForActor,
    midiPropertiesOptions: {
      triggeredActivityTargetOptions: Object.entries(triggeredActivityTargetOptions).map(([value, label]) => {
        return { value, label: i18n(label) }
      }),
      triggeredActivityRollAsOptions: Object.entries(triggeredActivityRollAsOptions).map(([value, label]) => {
        return { value, label: i18n(label) }
      }),
    },
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
    moveToken,
    moveTokenAwayFromPoint,
    createEffects,
    removeEffects,
    updateEffects,
    get updatesCache() { return updatesCache },
    ChatClasses: {
      ChatLogMidi,
      ChatMessageMidi,
      DamageApplicationElementMidi
    }
  }

  //@ts-expect-error
  game.modules.get("midi-qol").api = globalThis.MidiQOL;

  globalThis.MidiDAEEval = {
    testfunc,
    canSee,
    canSense,
    canSenseModes,
    checkIncapacitated,
    checkDistance,
    checkNearby,
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
    getTraitMult,
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

export async function moveToken(tokenRef: TokenOrDocument | string, newCenter: { x: number, y: number }, animate: boolean = true) {
  const tokenUuid = getTokenDocument(tokenRef)?.uuid;
  if (tokenUuid) return unTimedExecuteAsGM("moveToken", { tokenUuid, newCenter, animate });
}

export async function moveTokenAwayFromPoint(targetRef: TokenOrDocument | string, distance: number, point: { x: number, y: number }, animate: boolean = true, checkCollision: boolean = false) {
  const targetUuid = getTokenDocument(targetRef)?.uuid;
  if (point && targetUuid && distance)
    return unTimedExecuteAsGM("moveTokenAwayFromPoint", { targetUuid, distance, point, animate, checkCollision })
}

export async function createEffects(data: { actorUuid: string, effects: ActiveEffect.CreateData[], options: { keepId: boolean } }) {
  const { actorUuid, effects, options = { keepId: true } } = data;
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
}

export async function removeEffects(data: { actorUuid: string, effects: string[] }) {  // data: {actorUuid, effects: [<effect.ids>]}
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
}

export async function updateEffects(data: { actorUuid: string, updates: ActiveEffect.UpdateData[] }) {
  if (data.actorUuid && data.updates?.length)
    return unTimedExecuteAsGM("updateEffects", data);
  else {
    error("updateEffects failed missing data which should include {actorUuid, updates: []} but got", data)
    return false;
  }
}

function setupMidiFlags(DAEapi: any) {
  midiFlags.push(`flags.${MODULE_ID}.advantage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.all`);
  midiFlags.push(`flags.${MODULE_ID}.advantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.noAdvantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.attack.all`);
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
  midiFlags.push(`flags.${MODULE_ID}.noFumble.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noFumble.all`);
  midiFlags.push(`flags.${MODULE_ID}.fumble.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fumble.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.all`);
  midiFlags.push(`flags.${MODULE_ID}.success.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.all`);
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
  // Deprecated: use grants.noAdvantage.attack.all instead
  // midiFlags.push(`flags.${MODULE_ID}.grants.fail.advantage.attack.all`);
  // daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fail.advantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.attack.all`);
  // Deprecated: use grants.noDisadvantage.attack.all instead
  // midiFlags.push(`flags.${MODULE_ID}.grants.fail.disadvantage.attack.all`);
  // daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fail.disadvantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.attack.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.tool.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.tool.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.advantage.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.tool.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.tool.all`);
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
  midiFlags.push(`flags.${MODULE_ID}.grants.noFumble.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noFumble.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.fumble.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fumble.all`);
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
  midiFlags.push(`flags.${MODULE_ID}.noAdvantage.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.concentration`);
  midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.concentration`);
  midiFlags.push(`flags.${MODULE_ID}.noAdvantage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.all`);
  midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.all`);
  midiFlags.push(`flags.${MODULE_ID}.initiativeAdv`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.initiativeAdv`);
  midiFlags.push(`flags.${MODULE_ID}.initiativeDisadv`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.initiativeDisadv`);
  midiFlags.push(`flags.${MODULE_ID}.initiativeNoAdv`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.initiativeNoAdv`);
  midiFlags.push(`flags.${MODULE_ID}.initiativeNoDisadv`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.initiativeNoDisadv`);
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
    // Deprecated: use grants.noAdvantage.attack.${at} instead
    // midiFlags.push(`flags.${MODULE_ID}.grants.fail.advantage.attack.${at}`);
    // daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fail.advantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.attack.${at}`);
    // Deprecated: use grants.noDisadvantage.attack.${at} instead
    // midiFlags.push(`flags.${MODULE_ID}.grants.fail.disadvantage.attack.${at}`);
    // daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fail.disadvantage.attack.${at}`);
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
    midiFlags.push(`flags.${MODULE_ID}.noAdvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.success.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.critical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.critical.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.noCritical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noCritical.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.noFumble.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noFumble.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.fumble.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fumble.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.advantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.critical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.critical.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noCritical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noCritical.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noFumble.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noFumble.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.fumble.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fumble.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.critical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.critical.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.attack.bonus.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.bonus.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.attack.success.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.success.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.attack.fail.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.fail.${at}`);
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
  // New consistent flag names (without .ability. prefix for save/check - matches attack/skill/tool pattern)
  midiFlags.push(`flags.${MODULE_ID}.advantage.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.advantage.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.noAdvantage.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.noAdvantage.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.check.all`);
  // Keep advantage.ability.all for targeting all ability-based rolls
  midiFlags.push(`flags.${MODULE_ID}.advantage.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.ability.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.ability.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.ability.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.ability.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.save.all`);
  midiFlags.push(`flags.${MODULE_ID}.success.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.ability.all`);
  midiFlags.push(`flags.${MODULE_ID}.success.ability.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.ability.check.all`);
  midiFlags.push(`flags.${MODULE_ID}.success.ability.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.ability.save.all`);
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
  Object.keys(GameSystemConfig.damageTypes).forEach(dt => {
    midiFlags.push(`flags.${MODULE_ID}.rollModifiers.damage.all.${dt}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.all.${dt}`);
  })
  midiFlags.push(`flags.${MODULE_ID}.rollModifiers.attack.all`);

  attackTypes.forEach(at => {
    midiFlags.push(`flags.${MODULE_ID}.rollModifiers.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.attack.${at}`);
    midiFlags.push(`flags.${MODULE_ID}.rollModifiers.damage.${at}.all`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${at}.all`);
    Object.keys(GameSystemConfig.damageTypes).forEach(dt => {
      midiFlags.push(`flags.${MODULE_ID}.rollModifiers.damage.${at}.${dt}`);
      daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${at}.${dt}`);
    })
  });
  ["weapon", "spell", "tool", "feat"].forEach(it => {
    midiFlags.push(`flags.${MODULE_ID}.rollModifiers.attack.${it}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.attack.${it}`);
    midiFlags.push(`flags.${MODULE_ID}.rollModifiers.damage.${it}.all`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${it}.all`);
    Object.keys(GameSystemConfig.damageTypes).forEach(dt => {
      midiFlags.push(`flags.${MODULE_ID}.rollModifiers.damage.${it}.${dt}`);
      daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${it}.${dt}`);
    })
  })
  midiFlags.push(`flags.${MODULE_ID}.actions.reactionsMax`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.actions.reactionsMax`);
  midiFlags.push(`flags.${MODULE_ID}.actions.reactionsReset`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.actions.reactionsReset`);
  midiFlags.push(`flags.${MODULE_ID}.actions.bonusActionsMax`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.actions.bonusActionsMax`);
  midiFlags.push(`flags.${MODULE_ID}.actions.bonusActionsReset`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.actions.bonusActionsReset`);
  // midiFlags.push(`flags.${MODULE_ID}.actions.reactionUsed`);
  // daeFieldBrowserFields.push(`flags.${MODULE_ID}.actions.reactionUsed`);

  Object.keys(GameSystemConfig.abilities).forEach(abl => {
    // New consistent flag names (without .ability. prefix - matches attack/skill/tool pattern)
    midiFlags.push(`flags.${MODULE_ID}.advantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.disadvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.advantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.disadvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.noAdvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.noAdvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.save.${abl}`);
    // midiFlags.push(`flags.${MODULE_ID}.advantage.attack.${abl}`);
    // daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.attack.${abl}`);
    // midiFlags.push(`flags.${MODULE_ID}.disadvantage.attack.${abl}`);
    // daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.attack.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.success.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.ability.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.success.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.ability.save.${abl}`);
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
    midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.save.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.check.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.skill.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.skill.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.advantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.skill.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.disadvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.skill.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.noAdvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.skill.${abl}`);
    midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.skill.${abl}`);
  })

  midiFlags.push(`flags.${MODULE_ID}.advantage.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.noAdvantage.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.success.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.max.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.skill.all`);
  midiFlags.push(`flags.${MODULE_ID}.min.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.skill.all`);
  Object.keys(GameSystemConfig.skills).forEach(skill => {
    midiFlags.push(`flags.${MODULE_ID}.advantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.skill.${skill}`);
    midiFlags.push(`flags.${MODULE_ID}.disadvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.skill.${skill}`);
    midiFlags.push(`flags.${MODULE_ID}.noAdvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.skill.${skill}`);
    midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.skill.${skill}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.skill.${skill}`);
    midiFlags.push(`flags.${MODULE_ID}.success.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.skill.${skill}`);
    // midiFlags.push(`flags.${MODULE_ID}.max.skill.${skill}`); replaced by core
    // midiFlags.push(`flags.${MODULE_ID}.min.skill.${skill}`); replaced by core
    midiFlags.push(`flags.${MODULE_ID}.optional.NAME.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.skill.${skill}`);
    // Per-skill grants flags
    midiFlags.push(`flags.${MODULE_ID}.grants.advantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.skill.${skill}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.skill.${skill}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.skill.${skill}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.skill.${skill}`);
  })
  midiFlags.push(`flags.${MODULE_ID}.advantage.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.deathSave`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.deathSave`);
  midiFlags.push(`flags.${MODULE_ID}.noAdvantage.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.deathSave`);
  midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.deathSave`);
  midiFlags.push(`flags.${MODULE_ID}.deathSaveBonus`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.deathSaveBonus`);
  midiFlags.push(`flags.${MODULE_ID}.fail.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.deathSave`);
  midiFlags.push(`flags.${MODULE_ID}.success.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.deathSave`);
  midiFlags.push(`flags.${MODULE_ID}.advantage.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.tool.all`);
  midiFlags.push(`flags.${MODULE_ID}.disadvantage.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.tool.all`);
  midiFlags.push(`flags.${MODULE_ID}.noAdvantage.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.tool.all`);
  midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.tool.all`);
  midiFlags.push(`flags.${MODULE_ID}.fail.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.tool.all`);
  midiFlags.push(`flags.${MODULE_ID}.success.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.tool.all`);
  midiFlags.push(`flags.${MODULE_ID}.max.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.tool.all`);
  midiFlags.push(`flags.${MODULE_ID}.min.tool.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.tool.all`);
  Object.keys(GameSystemConfig.tools).forEach(tool => {
    midiFlags.push(`flags.${MODULE_ID}.advantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.tool.${tool}`);
    midiFlags.push(`flags.${MODULE_ID}.disadvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.tool.${tool}`);
    midiFlags.push(`flags.${MODULE_ID}.noAdvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.tool.${tool}`);
    midiFlags.push(`flags.${MODULE_ID}.noDisadvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.tool.${tool}`);
    midiFlags.push(`flags.${MODULE_ID}.fail.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.tool.${tool}`);
    midiFlags.push(`flags.${MODULE_ID}.success.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.tool.${tool}`);
    midiFlags.push(`flags.${MODULE_ID}.max.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.tool.${tool}`);
    midiFlags.push(`flags.${MODULE_ID}.min.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.tool.${tool}`);
    // Per-tool grants flags
    midiFlags.push(`flags.${MODULE_ID}.grants.advantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.tool.${tool}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.tool.${tool}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noAdvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.tool.${tool}`);
    midiFlags.push(`flags.${MODULE_ID}.grants.noDisadvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.tool.${tool}`);
  });
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

  Object.keys(GameSystemConfig.damageTypes).forEach(key => {
    midiFlags.push(`flags.${MODULE_ID}.DR.${key}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.${key}`);
  });

  midiFlags.push(`flags.${MODULE_ID}.DR.healing`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.healing`);
  midiFlags.push(`flags.${MODULE_ID}.DR.temphp`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.temphp`);

  midiFlags.push(`flags.${MODULE_ID}.optional.NAME.displayBonusRolls`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.displayChatCard`);
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
  const damageTypes = Object.keys(GameSystemConfig.damageTypes);
  for (let key of damageTypes) {
    midiFlags.push(`flags.${MODULE_ID}.absorption.${key}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.absorption.${key}`);
  }
  midiFlags.push(`flags.${MODULE_ID}.fail.disadvantage.heavy`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.disadvantage.heavy`);
  midiFlags.push(`flags.${MODULE_ID}.canFlank`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.canFlank`);
  /*
  midiFlags.push(`flags.${MODULE_ID}.grants.advantage.attack.all`);
  midiFlags.push(`flags.${MODULE_ID}.grants.disadvantage.attack.all`);
  midiFlags.push(``);

  midiFlags.push(``);
  midiFlags.push(``);
  */
  DAEapi.addAutoFields(midiFlags);
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

// TODO: Examine what's needed here
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
            await macro.update({ command: macroSpec.commandText, "flags.midi-version": macroSpec.version }, {} as never);
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

export function setupMidiStatusEffects() {
  // @ts-expect-error no dnd5e-types
  systemConcentrationId = CONFIG.specialStatusEffects.CONCENTRATING;
  if (!CONFIG.statusEffects.find(e => e.id === systemConcentrationId)) {
    // @ts-expect-error not expecting special
    CONFIG.statusEffects.push({ id: systemConcentrationId, name: i18n("EFFECT.DND5E.StatusConcentrating"), img: "systems/dnd5e/icons/svg/statuses/concentrating.svg", special: "CONCENTRATING" });
  }
  // Initialise these effects so that we don't need to make a raft of code async only to fetch these
  if (configSettings.enforceBonusActions !== "none") {
    if (!CONFIG.statusEffects.find(e => e._id === getStaticID("bonusaction"))) {
      CONFIG.statusEffects.push({
        id: "bonusaction",
        _id: getStaticID("bonusaction"),
        name: i18n("midi-qol.bonusActionUsed"),
        changes: [
          { key: "flags.midi-qol.actions.bonus", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" },
          { key: "Flags.midi-qol.actions.bonusActionsUsed", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1", priority: 20 }
        ],
        img: "modules/midi-qol/icons/bonus-action.svg",

        flags: { dae: { specialDuration: ["turnStart", "combatEnd", "shortRest"] } }
      });
    }
    ActiveEffect.implementation.fromStatusEffect("bonusaction").then(effect => {
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
        changes: [
          { key: "flags.midi-qol.actions.reaction", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" },
          { key: "Flags.midi-qol.actions.reactionsUsed", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1", priority: 20 }
        ],
        img: "modules/midi-qol/icons/reaction.svg",
        // effectData: { transfer: false },
        flags: { dae: { specialDuration: ["turnStart", "combatEnd", "shortRest"] } }
      });
    }
    ActiveEffect.implementation.fromStatusEffect("reaction").then(effect => {
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
      // effectData: { transfer: false },
      flags: { dae: { specialDuration: ["combatEnd"] } }
    });
  }

  ActiveEffect.implementation.fromStatusEffect("flanking").then(effect => {
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
      // effectData: { transfer: false },
      flags: { dae: { specialDuration: ["combatEnd"] } }
    });
  };

  ActiveEffect.implementation.fromStatusEffect("flanked").then(effect => {
    midiFlankedEffect = effect;
    globalThis.MidiQOL.midiFlankedEffect = effect;
  });
}
