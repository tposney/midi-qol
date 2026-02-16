import { registerSettings, fetchParams, configSettings, checkRule, enableWorkflow, fetchSoundSettings, midiSoundSettingsBackup, readySettingsSetup, collectSettingData, exportSettingsToJSON, importSettingsFromJSON, safeGetGameSetting, shouldDisplaySaveDC, triggeredActivityTargetOptions, triggeredActivityRollAsOptions, resetConfigSettingsToDefaults } from './module/settings.js';
import { preloadTemplates } from './module/preloadTemplates.js';
import { checkModules, setupModules } from './module/setupModules.js';
import { itemPatching, visionPatching, actorAbilityRollPatching, readyPatching, initPatching, addDiceTermModifiers, computeAbilityAdvantage, computeSkillAdvantage, computeToolAdvantage, processWoundedStatus, getActorWoundedSemaphore } from './module/patching.js';
import { MidiDependentsRegistry } from './module/lib/MidiDependentsRegistry.js';
import { initHooks, readyHooks, setupHooks } from './module/Hooks.js';
import { SaferSocket, initGMActionSetup, setupSocket, socketlibSocket, unTimedExecuteAsGM } from './module/GMAction.js';
import { setupSheetQol } from './module/sheetQOL.js';
import { TrapWorkflow, DamageOnlyWorkflow, Workflow, DummyWorkflow, DDBGameLogWorkflow, UserWorkflow } from './module/Workflow.js';
import { addConcentrationDependent, addRollTo, applyTokenDamage, canSee, canSense, canSenseModes, checkDistance, checkIncapacitated, checkNearby, chooseEffect, completeItemUse, computeCoverBonus, contestedRoll, createConditionData, throttledUpdate, displayDSNForRoll, doConcentrationCheck, doOverTimeEffect, evalAllConditions, evalCondition, findNearby, findNearbyCount, getCachedDocument, getChanges, getConcentrationEffect, getTokenDocument, getOrCreateTokenForActor, getOrCreateTokenForActorAsSet, getTokenPlayerName, getTokenPlayerNameForUser, getTraitMult, hasCondition, hasUsedBonusAction, hasUsedReaction, isValidTarget, midiRenderAttackRoll, midiRenderBonusDamageRoll, midiRenderDamageRoll, midiRenderOtherDamageRoll, midiRenderRoll, fromActorUuid, playerFor, playerForActor, raceOrType, reactionDialog, removeHiddenCondition, removeInvisibleCondition, removeReactionUsed, setBonusActionUsed, setReactionUsed, tokenForActor, typeOrRace, validRollAbility, actorFromUuid, removeActionUsed, removeBonusActionUsed, getCheckRollModeFor, getSaveRollModeFor, completeActivityUse, checkActivityRange, modifyDamageBy, computeDistance, getDistance, addDependent, cleanCPRFlanked, updatesCache, createDamageDetail, activityHasEmanationNoTemplate, getVitalityItem, getVitalityValue, getVitalityMax, hasVitalitySystem, resolveItemMacro, resolveActivityMacro, setupMidiFlagTypes } from './module/utils.js';
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
import { OverTimeEditor } from './module/apps/OverTimeEditor.js';
import { ConditionEditor } from './module/apps/ConditionEditor.js';
import { registerHandlebarsHelpers } from './module/lib/HandlebarsHelpers.js';

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

export let i18n = (key: SelectOptionValue) => {
  const k = typeof key === "object" ? key.label : key;
  return game.i18n?.localize(k) ?? k;
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

export let midiFlags: { name: string, type?: string }[] = [];
// Handle both init orderings: DAE's init may fire before or after midi's init.
// midiInitComplete tracks whether midi's init has set up GameSystemConfig/allAttackTypes.
let daeAddAutoFields: Function | null = null;
let midiInitComplete = false;
Hooks.once("dae.addAutoFields", (addAutoFields: Function) => {
  daeAddAutoFields = addAutoFields;
  // If midi's init already ran, register flags now (DAE init fired late)
  if (midiInitComplete) {
    setupMidiFlags();
    daeAddAutoFields(midiFlags.filter(f => !!f.name));
  }
});
export let allAttackTypes: string[] = []
export let gameStats: RollStats;
export let overTimeEffectsToDelete: Record<string, { uuid: string }> = {};
export let savedOverTimeEffectsToDelete: Record<string, {
  uuid: string;
  saveCount?: number;         // Number of saves required
  saveCountAction?: string;   // "-" = remove (default), "+" = permanent, or effectSpec (prefixed with "c" if consecutive)
  saveConsecutive?: boolean;  // If true, counter resets on a failed save
  failCount?: number;         // Number of fails required
  failCountAction?: string;   // "+" = permanent (default), "-" = remove, or effectSpec (prefixed with "c" if consecutive)
  failConsecutive?: boolean;  // If true, counter resets on a successful save
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
  registerHandlebarsHelpers();
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
  setupMidiFlagTypes();
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
  Hooks.once("dae.ready", api => setupMidiFlagEditors(api));

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
  midiInitComplete = true;
  // Register midi flags with DAE if the hook already fired (normal case: DAE init before midi init).
  // If the hook hasn't fired yet, the Hooks.once callback will handle it.
  if (daeAddAutoFields) {
    setupMidiFlags();
    daeAddAutoFields(midiFlags.filter(f => !!f.name));
  }
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
import { computeTargetsFromTemplates, resolveTargetConfirmation, selectTargetsFromTemplates, showItemInfo } from './module/activities/activityHelpers.js';
import { MidiActivityMixin, setupMidiActivityMixin } from './module/activities/MidiActivityMixin.js';
import { MidiForwardActivity, setupForwardActivity } from './module/activities/ForwardActivity.js';
import { MidiEnchantActivity, setupEnchantActivity } from './module/activities/EnchantActivity.js';
import { MidiTransformActivity, setupTransformActivity } from './module/activities/TransformActivity.js';
import { MidiCombat5e } from './module/MidiCombat5e.js';
import { TokenOrDocument, SelectOptionValue } from './globals.js';
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
    getDistance,
    computeSkillAdvantage,
    computeTargetsFromTemplates,
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
    getActorWoundedSemaphore,
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
    processWoundedStatus,
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
    selectTargetsFromTemplates,
    setBonusActionUsed,
    setReactionUsed,
    showItemInfo: (item: Item.Implementation) => { return showItemInfo.bind(item)() },
    showUndoQueue,
    showUndoWorkflowApp,
    socket: () => { return new SaferSocket(socketlibSocket) },
    testfunc,
    tokenForActor,
    midiPropertiesOptions: {
      triggeredActivityTargetOptions: Object.entries(triggeredActivityTargetOptions).map(([value, opt]) => {
        return { value, label: i18n(opt) }
      }),
      triggeredActivityRollAsOptions: Object.entries(triggeredActivityRollAsOptions).map(([value, opt]) => {
        return { value, label: i18n(opt) }
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
    },
    logEvaluationData: false,
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
    getDistance,
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

function registerFlagLocalization(flagPath: string, templateKey: string, label: string) {
  const lm = globalThis.DAE?.localizationMap;
  if (!lm || !game.i18n) return;
  lm[flagPath] = {
    name: i18nFormat(`midi-qol.flagTemplate.${templateKey}.name`, { label }),
    description: i18nFormat(`midi-qol.flagTemplate.${templateKey}.description`, { label })
  };
}

function setupMidiFlags() {
  const booleanString = (flag: string) => midiFlags.push({ name: flag, type: "booleanString" });
  const untyped = (flag: string) => midiFlags.push({ name: flag });

  booleanString(`flags.${MODULE_ID}.advantage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.all`);
  booleanString(`flags.${MODULE_ID}.disadvantage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.all`);
  // Global flags not generated by per-key loops
  booleanString(`flags.${MODULE_ID}.fail.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.all`);
  booleanString(`flags.${MODULE_ID}.success.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.all`);
  booleanString(`flags.${MODULE_ID}.neverTarget`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.neverTarget`);
  untyped(`flags.${MODULE_ID}.grants.critical.range`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.critical.range`);
  untyped(`flags.${MODULE_ID}.grants.criticalThreshold`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.criticalThreshold`);
  booleanString(`flags.${MODULE_ID}.advantage.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.concentration`);
  booleanString(`flags.${MODULE_ID}.disadvantage.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.concentration`);
  booleanString(`flags.${MODULE_ID}.noAdvantage.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.concentration`);
  booleanString(`flags.${MODULE_ID}.noDisadvantage.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.concentration`);
  booleanString(`flags.${MODULE_ID}.noAdvantage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.all`);
  booleanString(`flags.${MODULE_ID}.noDisadvantage.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.all`);
  booleanString(`flags.${MODULE_ID}.initiativeAdv`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.initiativeAdv`);
  booleanString(`flags.${MODULE_ID}.initiativeDisadv`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.initiativeDisadv`);
  booleanString(`flags.${MODULE_ID}.initiativeNoAdv`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.initiativeNoAdv`);
  booleanString(`flags.${MODULE_ID}.initiativeNoDisadv`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.initiativeNoDisadv`);
  booleanString(`flags.${MODULE_ID}.ignoreNearbyFoes`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.ignoreNearbyFoes`);
  untyped(`flags.${MODULE_ID}.`);
  untyped(`flags.${MODULE_ID}.concentrationSaveBonus`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.concentrationSaveBonus`);
  booleanString(`flags.${MODULE_ID}.potentCantrip`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.potentCantrip`);
  booleanString(`flags.${MODULE_ID}.sculptSpells`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.sculptSpells`);
  booleanString(`flags.${MODULE_ID}.carefulSpells`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.carefulSpells`);
  // magicResistance.all and magicVulnerability.all generated by abilities loop
  // range.all, long.all, rangeOverride.attack.all generated by attack types loop
  booleanString(`flags.${MODULE_ID}.magicResistance.save.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicResistance.save.all`);
  booleanString(`flags.${MODULE_ID}.magicResistance.check.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicResistance.check.all`);
  booleanString(`flags.${MODULE_ID}.magicResistance.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicResistance.skill.all`);
  const extendedAttackTypeLabels: Record<string, string> = { check: "Ability Check", skill: "Skill Check", tool: "Tool Check", all: "All" };
  let attackTypes = allAttackTypes.concat(["save", "check", "skill", "tool", "all"])
  attackTypes.forEach(at => {
    booleanString(`flags.${MODULE_ID}.grants.noAdvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.attack.${at}`);
    booleanString(`flags.${MODULE_ID}.grants.disadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.attack.${at}`);
    booleanString(`flags.${MODULE_ID}.grants.noDisadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.attack.${at}`);
    let label = GameSystemConfig.itemActionTypes[at] ?? extendedAttackTypeLabels[at] ?? at;
    label = label.replace(/ Attack$/, "");
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noAdvantage.attack.${at}`, "grants.noAdvantage.attack", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.disadvantage.attack.${at}`, "grants.disadvantage.attack", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noDisadvantage.attack.${at}`, "grants.noDisadvantage.attack", label);
  });
  attackTypes = allAttackTypes.concat(["heal", "other", "save", "util", "all"])
  attackTypes.forEach(at => {
    untyped(`flags.${MODULE_ID}.range.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.range.${at}`);
    untyped(`flags.${MODULE_ID}.long.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.long.${at}`);
    booleanString(`flags.${MODULE_ID}.advantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.attack.${at}`);
    booleanString(`flags.${MODULE_ID}.disadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.attack.${at}`);
    booleanString(`flags.${MODULE_ID}.noAdvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.attack.${at}`);
    booleanString(`flags.${MODULE_ID}.noDisadvantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.attack.${at}`);
    booleanString(`flags.${MODULE_ID}.fail.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.attack.${at}`);
    booleanString(`flags.${MODULE_ID}.success.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.attack.${at}`);
    booleanString(`flags.${MODULE_ID}.critical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.critical.${at}`);
    booleanString(`flags.${MODULE_ID}.noCritical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noCritical.${at}`);
    booleanString(`flags.${MODULE_ID}.noFumble.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noFumble.${at}`);
    booleanString(`flags.${MODULE_ID}.fumble.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fumble.${at}`);
    booleanString(`flags.${MODULE_ID}.grants.advantage.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.attack.${at}`);
    booleanString(`flags.${MODULE_ID}.grants.critical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.critical.${at}`);
    booleanString(`flags.${MODULE_ID}.grants.noCritical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noCritical.${at}`);
    booleanString(`flags.${MODULE_ID}.grants.noFumble.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noFumble.${at}`);
    booleanString(`flags.${MODULE_ID}.grants.fumble.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.fumble.${at}`);
    booleanString(`flags.${MODULE_ID}.fail.critical.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.critical.${at}`);
    untyped(`flags.${MODULE_ID}.grants.attack.bonus.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.bonus.${at}`);
    booleanString(`flags.${MODULE_ID}.grants.attack.success.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.success.${at}`);
    booleanString(`flags.${MODULE_ID}.grants.attack.fail.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.attack.fail.${at}`);
    if (at !== "heal") untyped(`flags.${MODULE_ID}.DR.${at}`);
    booleanString(`flags.${MODULE_ID}.advantage.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.damage.${at}`);
    untyped(`flags.${MODULE_ID}.max.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.damage.${at}`);
    untyped(`flags.${MODULE_ID}.min.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.damage.${at}`);
    untyped(`flags.${MODULE_ID}.grants.max.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.max.damage.${at}`);
    untyped(`flags.${MODULE_ID}.grants.min.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.min.damage.${at}`);
    untyped(`flags.${MODULE_ID}.grants.bonus.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.bonus.damage.${at}`);
    untyped(`flags.${MODULE_ID}.optional.NAME.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.attack.${at}`);
    untyped(`flags.${MODULE_ID}.optional.NAME.attack.fail.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.attack.fail.${at}`);
    untyped(`flags.${MODULE_ID}.optional.NAME.damage.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.damage.${at}`);
    untyped(`flags.${MODULE_ID}.rangeOverride.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rangeOverride.attack.${at}`);
    let label = GameSystemConfig.itemActionTypes[at] ?? extendedAttackTypeLabels[at] ?? at;
    label = label.replace(/ Attack$/, "");
    registerFlagLocalization(`flags.${MODULE_ID}.range.${at}`, "range", label);
    registerFlagLocalization(`flags.${MODULE_ID}.long.${at}`, "long", label);
    registerFlagLocalization(`flags.${MODULE_ID}.advantage.attack.${at}`, "advantage.attack", label);
    registerFlagLocalization(`flags.${MODULE_ID}.disadvantage.attack.${at}`, "disadvantage.attack", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noAdvantage.attack.${at}`, "noAdvantage.attack", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noDisadvantage.attack.${at}`, "noDisadvantage.attack", label);
    registerFlagLocalization(`flags.${MODULE_ID}.fail.attack.${at}`, "fail.attack", label);
    registerFlagLocalization(`flags.${MODULE_ID}.success.attack.${at}`, "success.attack", label);
    registerFlagLocalization(`flags.${MODULE_ID}.critical.${at}`, "critical", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noCritical.${at}`, "noCritical", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noFumble.${at}`, "noFumble", label);
    registerFlagLocalization(`flags.${MODULE_ID}.fumble.${at}`, "fumble", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.advantage.attack.${at}`, "grants.advantage.attack", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.critical.${at}`, "grants.critical", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noCritical.${at}`, "grants.noCritical", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noFumble.${at}`, "grants.noFumble", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.fumble.${at}`, "grants.fumble", label);
    registerFlagLocalization(`flags.${MODULE_ID}.fail.critical.${at}`, "fail.critical", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.attack.bonus.${at}`, "grants.attack.bonus", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.attack.success.${at}`, "grants.attack.success", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.attack.fail.${at}`, "grants.attack.fail", label);
    if (at !== "heal") registerFlagLocalization(`flags.${MODULE_ID}.DR.${at}`, "DR.attackType", label);
    registerFlagLocalization(`flags.${MODULE_ID}.advantage.damage.${at}`, "advantage.damage", label);
    registerFlagLocalization(`flags.${MODULE_ID}.max.damage.${at}`, "max.damage", label);
    registerFlagLocalization(`flags.${MODULE_ID}.min.damage.${at}`, "min.damage", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.max.damage.${at}`, "grants.max.damage", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.min.damage.${at}`, "grants.min.damage", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.bonus.damage.${at}`, "grants.bonus.damage", label);
    registerFlagLocalization(`flags.${MODULE_ID}.optional.NAME.attack.${at}`, "optional.NAME.attack", label);
    registerFlagLocalization(`flags.${MODULE_ID}.optional.NAME.attack.fail.${at}`, "optional.NAME.attack.fail", label);
    registerFlagLocalization(`flags.${MODULE_ID}.optional.NAME.damage.${at}`, "optional.NAME.damage", label);
    registerFlagLocalization(`flags.${MODULE_ID}.rangeOverride.attack.${at}`, "rangeOverride.attack", label);
  });
  // Ability-scope flags not generated by per-ability loop
  // (advantage.save.all, advantage.check.all, etc. now generated by abilities loop with "all" key)
  booleanString(`flags.${MODULE_ID}.advantage.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.ability.all`);
  booleanString(`flags.${MODULE_ID}.disadvantage.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.ability.all`);
  booleanString(`flags.${MODULE_ID}.fail.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.all`);
  booleanString(`flags.${MODULE_ID}.success.ability.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.ability.all`);
  untyped(`flags.${MODULE_ID}.max.ability.save.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.ability.save.concentration`);
  untyped(`flags.${MODULE_ID}.min.ability.save.concentration`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.ability.save.concentration`);
  booleanString(`flags.${MODULE_ID}.sharpShooter`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.sharpShooter`);

  untyped(`flags.${MODULE_ID}.rollModifiers.damage.all.all`);
  Object.keys(GameSystemConfig.damageTypes).forEach(dt => {
    untyped(`flags.${MODULE_ID}.rollModifiers.damage.all.${dt}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.all.${dt}`);
  })
  untyped(`flags.${MODULE_ID}.rollModifiers.attack.all`);

  attackTypes.forEach(at => {
    untyped(`flags.${MODULE_ID}.rollModifiers.attack.${at}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.attack.${at}`);
    untyped(`flags.${MODULE_ID}.rollModifiers.damage.${at}.all`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${at}.all`);
    Object.keys(GameSystemConfig.damageTypes).forEach(dt => {
      untyped(`flags.${MODULE_ID}.rollModifiers.damage.${at}.${dt}`);
      daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${at}.${dt}`);
    })
  });
  ["weapon", "spell", "tool", "feat"].forEach(it => {
    untyped(`flags.${MODULE_ID}.rollModifiers.attack.${it}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.attack.${it}`);
    untyped(`flags.${MODULE_ID}.rollModifiers.damage.${it}.all`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${it}.all`);
    Object.keys(GameSystemConfig.damageTypes).forEach(dt => {
      untyped(`flags.${MODULE_ID}.rollModifiers.damage.${it}.${dt}`);
      daeFieldBrowserFields.push(`flags.${MODULE_ID}.rollModifiers.damage.${it}.${dt}`);
    })
  })
  untyped(`flags.${MODULE_ID}.actions.reactionsMax`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.actions.reactionsMax`);
  untyped(`flags.${MODULE_ID}.actions.reactionsReset`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.actions.reactionsReset`);
  untyped(`flags.${MODULE_ID}.actions.bonusActionsMax`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.actions.bonusActionsMax`);
  untyped(`flags.${MODULE_ID}.actions.bonusActionsReset`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.actions.bonusActionsReset`);
  // nbs(`flags.${MODULE_ID}.actions.reactionUsed`);
  // daeFieldBrowserFields.push(`flags.${MODULE_ID}.actions.reactionUsed`);

  Object.keys(GameSystemConfig.abilities).concat(["all"]).forEach(abl => {
    // New consistent flag names (without .ability. prefix - matches attack/skill/tool pattern)
    booleanString(`flags.${MODULE_ID}.advantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.check.${abl}`);
    booleanString(`flags.${MODULE_ID}.disadvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.check.${abl}`);
    booleanString(`flags.${MODULE_ID}.advantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.save.${abl}`);
    booleanString(`flags.${MODULE_ID}.disadvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.save.${abl}`);
    booleanString(`flags.${MODULE_ID}.noAdvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.check.${abl}`);
    booleanString(`flags.${MODULE_ID}.noAdvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.save.${abl}`);
    booleanString(`flags.${MODULE_ID}.noDisadvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.check.${abl}`);
    booleanString(`flags.${MODULE_ID}.noDisadvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.save.${abl}`);
    // bs(`flags.${MODULE_ID}.advantage.attack.${abl}`);
    // daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.attack.${abl}`);
    // bs(`flags.${MODULE_ID}.disadvantage.attack.${abl}`);
    // daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.attack.${abl}`);
    booleanString(`flags.${MODULE_ID}.fail.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.check.${abl}`);
    booleanString(`flags.${MODULE_ID}.fail.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.ability.save.${abl}`);
    booleanString(`flags.${MODULE_ID}.success.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.ability.check.${abl}`);
    booleanString(`flags.${MODULE_ID}.success.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.ability.save.${abl}`);
    booleanString(`flags.${MODULE_ID}.superSaver.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.superSaver.${abl}`);
    booleanString(`flags.${MODULE_ID}.semiSuperSaver.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.semiSuperSaver.${abl}`);
    untyped(`flags.${MODULE_ID}.max.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.ability.save.${abl}`);
    untyped(`flags.${MODULE_ID}.min.ability.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.ability.save.${abl}`);
    untyped(`flags.${MODULE_ID}.max.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.ability.check.${abl}`);
    untyped(`flags.${MODULE_ID}.min.ability.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.ability.check.${abl}`);
    untyped(`flags.${MODULE_ID}.optional.NAME.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.save.${abl}`);
    untyped(`flags.${MODULE_ID}.optional.NAME.save.fail.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.save.fail.${abl}`);
    untyped(`flags.${MODULE_ID}.optional.NAME.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.check.${abl}`);
    untyped(`flags.${MODULE_ID}.optional.NAME.check.fail.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.check.fail.${abl}`);
    booleanString(`flags.${MODULE_ID}.magicResistance.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicResistance.${abl}`);
    booleanString(`flags.${MODULE_ID}.magicVulnerability.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.magicVulnerability.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.advantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.save.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.advantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.check.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.advantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.skill.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.disadvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.save.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.disadvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.check.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.disadvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.skill.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.noAdvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.save.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.noDisadvantage.save.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.save.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.noAdvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.check.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.noDisadvantage.check.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.check.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.noAdvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.skill.${abl}`);
    booleanString(`flags.${MODULE_ID}.grants.noDisadvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.skill.${abl}`);
    booleanString(`flags.${MODULE_ID}.advantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.skill.${abl}`);
    booleanString(`flags.${MODULE_ID}.disadvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.skill.${abl}`);
    booleanString(`flags.${MODULE_ID}.noAdvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.skill.${abl}`);
    booleanString(`flags.${MODULE_ID}.noDisadvantage.skill.${abl}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.skill.${abl}`);
    const label = GameSystemConfig.abilities[abl]?.label ?? (abl === "all" ? "All" : abl);
    registerFlagLocalization(`flags.${MODULE_ID}.advantage.check.${abl}`, "advantage.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.disadvantage.check.${abl}`, "disadvantage.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.advantage.save.${abl}`, "advantage.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.disadvantage.save.${abl}`, "disadvantage.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noAdvantage.check.${abl}`, "noAdvantage.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noAdvantage.save.${abl}`, "noAdvantage.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noDisadvantage.check.${abl}`, "noDisadvantage.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noDisadvantage.save.${abl}`, "noDisadvantage.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.fail.ability.check.${abl}`, "fail.ability.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.fail.ability.save.${abl}`, "fail.ability.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.success.ability.check.${abl}`, "success.ability.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.success.ability.save.${abl}`, "success.ability.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.superSaver.${abl}`, "superSaver", label);
    registerFlagLocalization(`flags.${MODULE_ID}.semiSuperSaver.${abl}`, "semiSuperSaver", label);
    registerFlagLocalization(`flags.${MODULE_ID}.max.ability.save.${abl}`, "max.ability.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.min.ability.save.${abl}`, "min.ability.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.max.ability.check.${abl}`, "max.ability.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.min.ability.check.${abl}`, "min.ability.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.optional.NAME.save.${abl}`, "optional.NAME.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.optional.NAME.save.fail.${abl}`, "optional.NAME.save.fail", label);
    registerFlagLocalization(`flags.${MODULE_ID}.optional.NAME.check.${abl}`, "optional.NAME.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.optional.NAME.check.fail.${abl}`, "optional.NAME.check.fail", label);
    registerFlagLocalization(`flags.${MODULE_ID}.magicResistance.${abl}`, "magicResistance", label);
    registerFlagLocalization(`flags.${MODULE_ID}.magicVulnerability.${abl}`, "magicVulnerability", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.advantage.save.${abl}`, "grants.advantage.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.advantage.check.${abl}`, "grants.advantage.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.advantage.skill.${abl}`, "grants.advantage.abilitySkill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.disadvantage.save.${abl}`, "grants.disadvantage.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.disadvantage.check.${abl}`, "grants.disadvantage.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.disadvantage.skill.${abl}`, "grants.disadvantage.abilitySkill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noAdvantage.save.${abl}`, "grants.noAdvantage.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noDisadvantage.save.${abl}`, "grants.noDisadvantage.save", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noAdvantage.check.${abl}`, "grants.noAdvantage.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noDisadvantage.check.${abl}`, "grants.noDisadvantage.check", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noAdvantage.skill.${abl}`, "grants.noAdvantage.abilitySkill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noDisadvantage.skill.${abl}`, "grants.noDisadvantage.abilitySkill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.advantage.skill.${abl}`, "advantage.abilitySkill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.disadvantage.skill.${abl}`, "disadvantage.abilitySkill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noAdvantage.skill.${abl}`, "noAdvantage.abilitySkill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noDisadvantage.skill.${abl}`, "noDisadvantage.abilitySkill", label);
  })

  // advantage/disadvantage/fail/success.skill.all generated by skills loop with "all" key
  // max/min.skill.all kept here since per-skill max/min is replaced by core
  untyped(`flags.${MODULE_ID}.max.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.skill.all`);
  untyped(`flags.${MODULE_ID}.min.skill.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.skill.all`);
  Object.keys(GameSystemConfig.skills).concat(["all"]).forEach(skill => {
    booleanString(`flags.${MODULE_ID}.advantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.skill.${skill}`);
    booleanString(`flags.${MODULE_ID}.disadvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.skill.${skill}`);
    booleanString(`flags.${MODULE_ID}.noAdvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.skill.${skill}`);
    booleanString(`flags.${MODULE_ID}.noDisadvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.skill.${skill}`);
    booleanString(`flags.${MODULE_ID}.fail.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.skill.${skill}`);
    booleanString(`flags.${MODULE_ID}.success.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.skill.${skill}`);
    // bs(`flags.${MODULE_ID}.max.skill.${skill}`); replaced by core
    // bs(`flags.${MODULE_ID}.min.skill.${skill}`); replaced by core
    untyped(`flags.${MODULE_ID}.optional.NAME.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.skill.${skill}`);
    // Per-skill grants flags
    booleanString(`flags.${MODULE_ID}.grants.advantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.skill.${skill}`);
    booleanString(`flags.${MODULE_ID}.grants.disadvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.skill.${skill}`);
    booleanString(`flags.${MODULE_ID}.grants.noAdvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.skill.${skill}`);
    booleanString(`flags.${MODULE_ID}.grants.noDisadvantage.skill.${skill}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.skill.${skill}`);
    const label = GameSystemConfig.skills[skill]?.label ?? (skill === "all" ? "All" : skill);
    registerFlagLocalization(`flags.${MODULE_ID}.advantage.skill.${skill}`, "advantage.skill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.disadvantage.skill.${skill}`, "disadvantage.skill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noAdvantage.skill.${skill}`, "noAdvantage.skill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noDisadvantage.skill.${skill}`, "noDisadvantage.skill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.fail.skill.${skill}`, "fail.skill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.success.skill.${skill}`, "success.skill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.optional.NAME.skill.${skill}`, "optional.NAME.skill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.advantage.skill.${skill}`, "grants.advantage.skill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.disadvantage.skill.${skill}`, "grants.disadvantage.skill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noAdvantage.skill.${skill}`, "grants.noAdvantage.skill", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noDisadvantage.skill.${skill}`, "grants.noDisadvantage.skill", label);
  })
  booleanString(`flags.${MODULE_ID}.advantage.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.deathSave`);
  booleanString(`flags.${MODULE_ID}.disadvantage.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.deathSave`);
  booleanString(`flags.${MODULE_ID}.noAdvantage.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.deathSave`);
  booleanString(`flags.${MODULE_ID}.noDisadvantage.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.deathSave`);
  untyped(`flags.${MODULE_ID}.deathSaveBonus`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.deathSaveBonus`);
  booleanString(`flags.${MODULE_ID}.fail.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.deathSave`);
  booleanString(`flags.${MODULE_ID}.success.deathSave`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.deathSave`);
  // All tool .all entries generated by tools loop with "all" key
  Object.keys(GameSystemConfig.tools).concat(["all"]).forEach(tool => {
    booleanString(`flags.${MODULE_ID}.advantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.advantage.tool.${tool}`);
    booleanString(`flags.${MODULE_ID}.disadvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.disadvantage.tool.${tool}`);
    booleanString(`flags.${MODULE_ID}.noAdvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noAdvantage.tool.${tool}`);
    booleanString(`flags.${MODULE_ID}.noDisadvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.noDisadvantage.tool.${tool}`);
    booleanString(`flags.${MODULE_ID}.fail.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.tool.${tool}`);
    booleanString(`flags.${MODULE_ID}.success.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.success.tool.${tool}`);
    untyped(`flags.${MODULE_ID}.max.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.max.tool.${tool}`);
    untyped(`flags.${MODULE_ID}.min.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.min.tool.${tool}`);
    // Per-tool grants flags
    booleanString(`flags.${MODULE_ID}.grants.advantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.advantage.tool.${tool}`);
    booleanString(`flags.${MODULE_ID}.grants.disadvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.disadvantage.tool.${tool}`);
    booleanString(`flags.${MODULE_ID}.grants.noAdvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noAdvantage.tool.${tool}`);
    booleanString(`flags.${MODULE_ID}.grants.noDisadvantage.tool.${tool}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.grants.noDisadvantage.tool.${tool}`);
    const label = tool === "all" ? "All" : ((globalThis.dnd5e?.documents.Trait.keyLabel(`tool:${tool}`) as string) ?? tool);
    registerFlagLocalization(`flags.${MODULE_ID}.advantage.tool.${tool}`, "advantage.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.disadvantage.tool.${tool}`, "disadvantage.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noAdvantage.tool.${tool}`, "noAdvantage.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.noDisadvantage.tool.${tool}`, "noDisadvantage.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.fail.tool.${tool}`, "fail.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.success.tool.${tool}`, "success.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.max.tool.${tool}`, "max.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.min.tool.${tool}`, "min.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.advantage.tool.${tool}`, "grants.advantage.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.disadvantage.tool.${tool}`, "grants.disadvantage.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noAdvantage.tool.${tool}`, "grants.noAdvantage.tool", label);
    registerFlagLocalization(`flags.${MODULE_ID}.grants.noDisadvantage.tool.${tool}`, "grants.noDisadvantage.tool", label);
  });
  // fix for translations
  ["vocal", "somatic", "material"].forEach(comp => {
    booleanString(`flags.${MODULE_ID}.fail.spell.${comp.toLowerCase()}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.spell.${comp.toLowerCase()}`);
  });
  untyped(`flags.${MODULE_ID}.DR.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.all`);

  untyped(`flags.${MODULE_ID}.DR.non-magical`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.non-magical`);
  untyped(`flags.${MODULE_ID}.DR.non-magical-physical`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.non-magical-physical`);
  untyped(`flags.${MODULE_ID}.DR.non-silver`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.non-silver`);
  untyped(`flags.${MODULE_ID}.DR.non-adamant`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.non-adamant`);
  untyped(`flags.${MODULE_ID}.DR.non-physical`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.non-physical`);
  untyped(`flags.${MODULE_ID}.DR.final`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.final`);
  untyped(`flags.${MODULE_ID}.damage.reroll-kh`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.damage.reroll-kh`);
  untyped(`flags.${MODULE_ID}.damage.reroll-kl`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.damage.reroll-kl`);

  Object.keys(GameSystemConfig.damageTypes).forEach(key => {
    untyped(`flags.${MODULE_ID}.DR.${key}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.${key}`);
    const label = GameSystemConfig.damageTypes[key]?.label ?? key;
    registerFlagLocalization(`flags.${MODULE_ID}.DR.${key}`, "DR.damageType", label);
  });

  untyped(`flags.${MODULE_ID}.DR.healing`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.healing`);
  untyped(`flags.${MODULE_ID}.DR.temphp`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.DR.temphp`);

  // optional.NAME.attack/damage/check/save/skill.all generated by attack types/abilities/skills loops
  untyped(`flags.${MODULE_ID}.optional.NAME.displayBonusRolls`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.displayChatCard`);
  untyped(`flags.${MODULE_ID}.optional.NAME.label`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.label`);
  untyped(`flags.${MODULE_ID}.optional.NAME.skill.fail.all`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.skill.fail.all`);
  untyped(`flags.${MODULE_ID}.optional.NAME.count`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.count`);
  untyped(`flags.${MODULE_ID}.optional.NAME.countAlt`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.countAlt`);
  untyped(`flags.${MODULE_ID}.optional.NAME.ac`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.ac`);
  untyped(`flags.${MODULE_ID}.optional.NAME.criticalDamage`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.criticalDamage`);
  untyped(`flags.${MODULE_ID}.optional.NAME.activation`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.activation`);
  untyped(`flags.${MODULE_ID}.optional.NAME.force`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.optional.NAME.force`);

  booleanString(`flags.${MODULE_ID}.uncanny-dodge`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.uncanny-dodge`);
  untyped(`flags.${MODULE_ID}.OverTime`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.OverTime`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.ActivityOverTime`);
  booleanString(`flags.${MODULE_ID}.inMotion`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.inMotion`);
  const damageTypes = Object.keys(GameSystemConfig.damageTypes);
  for (let key of damageTypes) {
    booleanString(`flags.${MODULE_ID}.absorption.${key}`);
    daeFieldBrowserFields.push(`flags.${MODULE_ID}.absorption.${key}`);
    const label = GameSystemConfig.damageTypes[key]?.label ?? key;
    registerFlagLocalization(`flags.${MODULE_ID}.absorption.${key}`, "absorption", label);
  }
  booleanString(`flags.${MODULE_ID}.fail.disadvantage.heavy`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.fail.disadvantage.heavy`);
  booleanString(`flags.${MODULE_ID}.canFlank`);
  daeFieldBrowserFields.push(`flags.${MODULE_ID}.canFlank`);
  /*
  bs(`flags.${MODULE_ID}.grants.advantage.attack.all`);
  bs(`flags.${MODULE_ID}.grants.disadvantage.attack.all`);
  bs(``);

  bs(``);
  bs(``);
  */
}

function setupMidiFlagEditors(DAEapi: any) {
  // Register pluggable OverTime editor with DAE's field editor API
  if (DAEapi.registerFieldEditor) {
    DAEapi.registerFieldEditor({
      keyMatch: `flags.${MODULE_ID}.OverTime`,
      editor: async (currentValue: string, context: any) => {
        return new Promise<string | null>((resolve) => {
          new OverTimeEditor({
            value: currentValue,
            effect: context.effect,
            parent: context.parent,
            onSubmit: (newValue: string) => resolve(newValue),
            onCancel: () => resolve(null),
          }).render({ force: true });
        });
      },
      icon: "fas fa-clock",
      tooltip: i18n("midi-qol.OverTimeEditor.Tooltip"),
    });

    // Register condition expression editor for midi-qol condition flags
    // Only available when macro-autocomplete is active (provides CodeMirror autocompletion)
    const macroAutoComplete = (game as Game).modules?.get("macro-autocomplete");
    if (macroAutoComplete?.active) {
      const conditionFlagPrefixes = [
        `flags.${MODULE_ID}.advantage.`,
        `flags.${MODULE_ID}.disadvantage.`,
        `flags.${MODULE_ID}.noAdvantage.`,
        `flags.${MODULE_ID}.noDisadvantage.`,
        `flags.${MODULE_ID}.grants.advantage.`,
        `flags.${MODULE_ID}.grants.disadvantage.`,
        `flags.${MODULE_ID}.grants.noAdvantage.`,
        `flags.${MODULE_ID}.grants.noDisadvantage.`,
        `flags.${MODULE_ID}.fail.`,
        `flags.${MODULE_ID}.success.`,
        `flags.${MODULE_ID}.max.`,
        `flags.${MODULE_ID}.min.`,
        `flags.${MODULE_ID}.optional.`,
      ];
      for (const prefix of conditionFlagPrefixes) {
        DAEapi.registerFieldEditor({
          keyMatch: prefix,
          editor: async (currentValue: string, context: any) => {
            return new Promise<string | null>((resolve) => {
              new ConditionEditor({
                value: currentValue,
                key: context.key,
                effect: context.effect,
                parent: context.parent,
                onSubmit: (newValue: string) => resolve(newValue),
                onCancel: () => resolve(null),
              }).render({ force: true });
            });
          },
          icon: "fas fa-code",
          tooltip: i18n("midi-qol.ConditionEditor.Tooltip"),
        });
      }
    }
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
