import { registerSettings, fetchParams, configSettings, checkRule, collectSettingData, enableWorkflow, midiSoundSettings, fetchSoundSettings, midiSoundSettingsBackup, disableWorkflowAutomation } from './module/settings.js';
import { preloadTemplates } from './module/preloadTemplates.js';
import { checkModules, installedModules, setupModules } from './module/setupModules.js';
import { itemPatching, visionPatching, actorAbilityRollPatching, patchLMRTFY, readyPatching, initPatching } from './module/patching.js';
import { initHooks, overTimeJSONData, readyHooks, setupHooks } from './module/Hooks.js';
import { initGMActionSetup, setupSocket, socketlibSocket } from './module/GMAction.js';
import { setupSheetQol } from './module/sheetQOL.js';
import { TrapWorkflow, DamageOnlyWorkflow, Workflow, DummyWorkflow } from './module/workflow.js';
import { addConcentration, applyTokenDamage, canSense, checkNearby, checkRange, completeItemRoll, completeItemUse, distancePointToken, doConcentrationCheck, doOverTimeEffect, findNearby, getChanges, getConcentrationEffect, getDistance, getDistanceSimple, getSurroundingHexes, getSystemCONFIG, getTraitMult, midiRenderRoll, MQfromActorUuid, MQfromUuid, reportMidiCriticalFlags, tokenForActor } from './module/utils.js';
import { ConfigPanel } from './module/apps/ConfigPanel.js';
import { showItemCard, showItemInfo, templateTokens } from './module/itemhandling.js';
import { RollStats } from './module/RollStats.js';
import { OnUseMacroOptions } from './module/apps/Item.js';
import { MidiKeyManager } from './module/MidiKeyManager.js';
import { MidiSounds } from './module/midi-sounds.js';

export let debugEnabled = 0;
export let debugCallTiming: any = false;
// 0 = none, warnings = 1, debug = 2, all = 3
export let debug = (...args) => { if (debugEnabled > 1) console.log("DEBUG: midi-qol | ", ...args) };
export let log = (...args) => console.log("midi-qol | ", ...args);
export let warn = (...args) => { if (debugEnabled > 0) console.warn("midi-qol | ", ...args) };
export let error = (...args) => console.error("midi-qol | ", ...args);
export let timelog = (...args) => warn("midi-qol | ", Date.now(), ...args);

declare global {
  interface LenientGlobalVariableTypes {
    game: any; // the type doesn't matter
  }
}
export function getCanvas(): Canvas | undefined {
  if (!canvas || !canvas.scene) {
    error("Canvas/Scene not ready - roll automation will not function");
    return undefined;
  }
  return canvas;
}

export let i18n = key => {
  return game.i18n.localize(key);
};
export let i18nFormat = (key, data = {}) => {
  return game.i18n.format(key, data);
}
export function geti18nOptions(key) {
  const translations = game.i18n.translations["midi-qol"] ?? {};
  //@ts-ignore _fallback not accessible
  let translation = translations[key] ?? game.i18n._fallback["midi-qol"][key];
  return translation ?? {};
}
export function geti18nTranslations() {
  let translations = game.i18n.translations["midi-qol"];
  //@ts-ignore _fallback not accessible
  if (!translations) translations = game.i18n._fallback["midi-qol"];
  return translations ?? {};
}

export let setDebugLevel = (debugText: string) => {
  debugEnabled = { "none": 0, "warn": 1, "debug": 2, "all": 3 }[debugText] || 0;
  // 0 = none, warnings = 1, debug = 2, all = 3
  if (debugEnabled >= 3) CONFIG.debug.hooks = true;
  debugCallTiming = game.settings.get("midi-qol", "debugCallTiming") ?? false;
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
export let failedSaveOverTimeEffectsToDelete = {}
export let MQItemMacroLabel: string;
export let MQDeferMacroLabel: string;
export let MQOnUseOptions
export const MESSAGETYPES = {
  HITS: 1,
  SAVES: 2,
  ATTACK: 3,
  DAMAGE: 4,
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
  installedModules.set("levels", CONFIG.Levels.API)
});

Hooks.once('init', async function () {
  console.log('midi-qol | Initializing midi-qol');
  allAttackTypes = ["rwak", "mwak", "rsak", "msak"];
  if (game.system.id === "sw5e")
    allAttackTypes = ["rwak", "mwak", "rpak", "mpak"];
  initHooks();
  // Assign custom classes and constants here

  // Register custom module settings
  registerSettings();
  fetchParams();
  fetchSoundSettings();

  // Preload Handlebars templates
  preloadTemplates();
  // Register custom sheets (if any)
  initPatching();
  globalThis.MidiKeyManager = new MidiKeyManager();
  globalThis.MidiKeyManager.initKeyMappings();
});

/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function () {
  // Do anything after initialization but before
  // ready
  setupSocket();
  fetchParams();
  fetchSoundSettings();
  itemPatching();
  visionPatching();
  setupModules();
  registerSettings();
  initGMActionSetup();
  patchLMRTFY();
  setupMidiFlags();
  setupHooks();
  undoDamageText = i18n("midi-qol.undoDamageFrom");
  savingThrowText = i18n("midi-qol.savingThrowText");
  savingThrowTextAlt = i18n("midi-qol.savingThrowTextAlt");
  MQdefaultDamageType = i18n("midi-qol.defaultDamageType");
  MQItemMacroLabel = i18n("midi-qol.ItemMacroText");
  if (MQItemMacroLabel === "midi-qol.ItemMacroText") MQItemMacroLabel = "ItemMacro";
  MQDeferMacroLabel = i18n("midi-qol.DeferText");
  if (MQDeferMacroLabel === "midi-qol.DeferText") MQDeferMacroLabel = "[Defer]";

  let config = getSystemCONFIG();

  if (game.system.id === "dnd5e" || game.system.id === "n5e") {
    config.midiProperties = {};
    config.midiProperties["nodam"] = i18n("midi-qol.noDamageSaveProp");
    config.midiProperties["fulldam"] = i18n("midi-qol.fullDamageSaveProp");
    config.midiProperties["halfdam"] = i18n("midi-qol.halfDamageSaveProp");
    config.midiProperties["rollOther"] = i18n("midi-qol.rollOtherProp");
    config.midiProperties["critOther"] = i18n("midi-qol.otherCritProp");
    config.midiProperties["magicdam"] = i18n("midi-qol.magicalDamageProp");
    config.midiProperties["magiceffect"] = i18n("midi-qol.magicalEffectProp");
    config.midiProperties["concentration"] = i18n("midi-qol.concentrationEffectProp");
    config.midiProperties["toggleEffect"] = i18n("midi-qol.toggleEffectProp");

    config.damageTypes["midi-none"] = i18n("midi-qol.midi-none");
    config.damageResistanceTypes["silver"] = i18n("midi-qol.NonSilverPhysical");
    config.damageResistanceTypes["adamant"] = i18n("midi-qol.NonAdamantinePhysical");
    config.damageResistanceTypes["spell"] = i18n("midi-qol.spell-damage");
    config.damageResistanceTypes["nonmagic"] = i18n("midi-qol.NonMagical");
    config.damageResistanceTypes["magic"] = i18n("midi-qol.Magical");

    config.damageResistanceTypes["healing"] = config.healingTypes.healing;
    config.damageResistanceTypes["temphp"] = config.healingTypes.temphp;

    config.abilityActivationTypes["reactiondamage"] = `${i18n("DND5E.Reaction")} ${i18n("midi-qol.reactionDamaged")}`;
    config.abilityActivationTypes["reactionmanual"] = `${i18n("DND5E.Reaction")} ${i18n("midi-qol.reactionManual")}`;
  } else { // sw5e
    config.midiProperties = {};
    config.midiProperties["nodam"] = i18n("midi-qol.noDamageSaveProp");
    config.midiProperties["fulldam"] = i18n("midi-qol.fullDamageSaveProp");
    config.midiProperties["halfdam"] = i18n("midi-qol.halfDamageSaveProp")
    config.midiProperties["rollOther"] = i18n("midi-qol.rollOtherProp");
    config.midiProperties["critOther"] = i18n("midi-qol.otherCritProp");
    config.midiProperties["concentration"] = i18n("midi-qol.concentrationActivationCondition");

    config.damageTypes["midi-none"] = i18n("midi-qol.midi-none");
    config.damageResistanceTypes["silver"] = i18n("midi-qol.nonSilverPhysical");
    config.damageResistanceTypes["adamant"] = i18n("midi-qol.nonAdamantinePhysical");
    config.damageResistanceTypes["spell"] = i18n("midi-qol.spell-damage");
    config.damageResistanceTypes["healing"] = config.healingTypes.healing;
    config.damageResistanceTypes["temphp"] = config.healingTypes.temphp;
    config.abilityActivationTypes["reactiondamage"] = `${i18n("DND5E.Reaction")} ${i18n("midi-qol.reactionDamaged")}`;
    config.abilityActivationTypes["reactionmanual"] = `${i18n("DND5E.Reaction")} ${i18n("midi-qol.reactionManual")}`;
  }

  if (configSettings.allowUseMacro) {
    config.characterFlags["DamageBonusMacro"] = {
      hint: i18n("midi-qol.DamageMacro.Hint"),
      name: i18n("midi-qol.DamageMacro.Name"),
      placeholder: "",
      section: i18n("midi-qol.DAEMidiQOL"),
      type: String
    };
  };
  setupSheetQol();

});

/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */
Hooks.once('ready', function () {
  const exclusionMacro = game.macros?.getName("Warning Exclusions for Midi");
  if (exclusionMacro) exclusionMacro?.execute();

  gameStats = new RollStats();
  actorAbilityRollPatching();
  // has to be done before setup api.
  MQOnUseOptions = i18n("midi-qol.onUseMacroOptions");
  if (typeof MQOnUseOptions === "string") MQOnUseOptions = {
    "preItemRoll": "Called before the item is rolled (*)",
    "templatePlaced": "Only called once a template is placed",
    "preambleComplete": "After targeting complete",
    "preAttackRoll": "Before Attack Roll",
    "preCheckHits": "Before Check Hits",
    "postAttackRoll": "After Attack Roll",
    "preSave": "Before Save",
    "postSave": "After Save",
    "preDamageRoll": "Before Damage Roll",
    "postDamageRoll": "After Damage Roll",
    "damageBonus": "return a damage bonus",
    "preDamageApplication": "Before Damage Application",
    "preActiveEffects": "Before Active Effects",
    "postActiveEffects": "After Active Effects ",
    "all": "All"
  }
  OnUseMacroOptions.setOptions(MQOnUseOptions);
  MidiSounds.midiSoundsReadyHooks();
  getSystemCONFIG().characterFlags["spellSniper"] = {
    name: "Spell Sniper",
    hint: "Spell Sniper",
    section: i18n("DND5E.Feats"),
    type: Boolean
  };

  setupMidiQOLApi();

  if (game.settings.get("midi-qol", "splashWarnings") && game.user?.isGM) {
    if (game.user?.isGM && !installedModules.get("dae")) {
      ui.notifications?.warn("Midi-qol requires DAE to be installed and at least version 0.9.05 or many automation effects won't work");
    }
    if (game.user?.isGM && game.modules.get("betterrolls5e")?.active && !installedModules.get("betterrolls5e")) {
      ui.notifications?.warn("Midi QOL requires better rolls to be version 1.6.6 or later");
    }
  }
  //@ts-ignore game.version
  if (isNewerVersion(game.version ? game.version : game.version, "0.8.9")) {
    const noDamageSavesText: string = i18n("midi-qol.noDamageonSaveSpellsv9");
    noDamageSaves = noDamageSavesText.split(",")?.map(s => s.trim()).map(s => cleanSpellName(s));
  } else {
    //@ts-ignore
    noDamageSaves = i18n("midi-qol.noDamageonSaveSpells")?.map(name => cleanSpellName(name));
  }
  checkModules();
  checkConcentrationSettings();
  readyHooks();
  readyPatching();
  if (midiSoundSettingsBackup) game.settings.set("midi-qol", "MidiSoundSettings-backup", midiSoundSettingsBackup)

  // Make midi-qol targets hoverable
  $(document).on("mouseover", ".midi-qol-target-name", (e) => {
    const tokenid = e.currentTarget.id
    const tokenObj = canvas?.tokens?.get(tokenid)
    if (!tokenObj) return;
    //@ts-ignore
    tokenObj._hover = true
  });

  // This seems to cause problems for localisation for the items compendium (at least for french)
  // Try a delay before doing this - hopefully allowing localisation to complete
  setTimeout(MidiSounds.getWeaponBaseTypes, 5000);
  if (installedModules.get("betterrolls5e")) {
    //@ts-ignore console:
    ui.notifications?.error("midi-qol automation disabled", {permanent: true, console: true})
    //@ts-ignore console:
    ui.notifications?.error("Please make sure betterrolls5e is disabled", {permanent: true, console: true})
    //@ts-ignore console:
    ui.notifications?.error("Until further notice better rolls is NOT compatible with midi-qol", {permanent: true, console: true})
    disableWorkflowAutomation();
    setTimeout(disableWorkflowAutomation, 2000)
  }
  Hooks.callAll("midi-qol.midiReady");
});



import { setupMidiTests } from './module/tests/setupTest.js';
Hooks.once("midi-qol.midiReady", () => {
  setupMidiTests();
});

// Add any additional hooks if necessary

// Backwards compatability
function setupMidiQOLApi() {

  //@ts-ignore
  window.MinorQOL = {
    doRoll: () => {console.error("MinorQOL is no longer supported please use MidiQOL.doRoll")},
    applyTokenDamage: () => {console.error("MinorQOL is no longer supported please use MidiQOL.applyTokenDamage")},
  }
  //@ts-ignore
  globalThis.MidiQOL = {
    addConcentration,
    applyTokenDamage,
    canSense, 
    checkNearby,
    checkRange,
    checkRule: checkRule,
    completeItemRoll,
    completeItemUse,
    ConfigPanel,
    configSettings: () => { return configSettings },
    DamageOnlyWorkflow,
    debug,
    doConcentrationCheck,
    doOverTimeEffect,
    DummyWorkflow,
    enableWorkflow,
    findNearby,
    gameStats,
    getChanges,
    getConcentrationEffect,
    getDistance: getDistanceSimple,
    getTraitMult: getTraitMult,
    log,
    midiFlags,
    midiRenderRoll,
    midiSoundSettings: () => { return midiSoundSettings },
    MQfromActorUuid,
    MQfromUuid,
    MQFromUuid: MQfromUuid,
    MQOnUseOptions,
    overTimeJSONData,
    reportMidiCriticalFlags: reportMidiCriticalFlags,
    selectTargetsForTemplate: templateTokens,
    showItemCard,
    showItemInfo,
    socket: () => { return socketlibSocket },
    tokenForActor,
    TrapWorkflow,
    warn,
    Workflow,
  };
  globalThis.MidiQOL.actionQueue = new Semaphore();
}


export function checkConcentrationSettings() {
  const needToUpdateCubSettings = installedModules.get("combat-utility-belt") && (
    game.settings.get("combat-utility-belt", "enableConcentrator")
  );
  if (game.user?.isGM && configSettings.concentrationAutomation && needToUpdateCubSettings) {
    let d = new Dialog({
      // localize this text
      title: i18n("dae.confirm"),
      content: `<p>You have enabled midi-qol concentration automation.</p><p>This requires Combat Utility Belt Concentration to be disabled.</p><p>Choose which concentration automation to disable</p>`,
      buttons: {
        one: {
          icon: '<i class="fas fa-cross"></i>',
          label: "Disable CUB",
          callback: () => {
            game.settings.set("combat-utility-belt", "enableConcentrator", false);
          }
        },
        two: {
          icon: '<i class="fas fa-cross"></i>',
          label: "Disable Midi",
          callback: () => {
            configSettings.concentrationAutomation = false;
            game.settings.set("midi-qol", "ConfigSettings", configSettings)
          }
        }
      },
      default: "one"
    });
    d.render(true);
  }
}

// Minor-qol compatibility patching
function doRoll(event = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, type: "none" }, itemName, options = { type: "", versatile: false }) {
  error("doRoll is deprecated and will be removed");
  const speaker = ChatMessage.getSpeaker();
  var actor;
  if (speaker.token) {
    const token = canvas?.tokens?.get(speaker.token)
    actor = token?.actor;
  } else {
    actor = game.actors?.get(speaker.actor ?? "");
  }
  if (!actor) {
    if (debugEnabled > 0) warn("No actor found for ", speaker);
    return;
  }
  let pEvent = {
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    type: (event?.type === "contextmenu") || options.versatile ? "contextmenu" : ""
  }
  let item = actor?.items?.get(itemName) // see if we got an itemId
  if (!item) item = actor?.items?.find(i => i.name === itemName && (!options.type || i.type === options.type));
  if (item) {
    return item.roll({ event: pEvent })
  } else {
    ui.notifications?.warn(game.i18n.format("DND5E.ActionWarningNoItem", { item: itemName, name: actor.name }));
  }
}

function setupMidiFlags() {
  let config = getSystemCONFIG();
  midiFlags.push("system.test.this")
  midiFlags.push("flags.midi-qol.advantage.all")
  midiFlags.push("flags.midi-qol.disadvantage.all")
  midiFlags.push("flags.midi-qol.advantage.attack.all")
  midiFlags.push("flags.midi-qol.disadvantage.attack.all")
  midiFlags.push("flags.midi-qol.critical.all")
  midiFlags.push(`flags.midi-qol.max.damage.all`);
  midiFlags.push(`flags.midi-qol.min.damage.all`);
  midiFlags.push("flags.midi-qol.noCritical.all")
  midiFlags.push("flags.midi-qol.fail.all")
  midiFlags.push("flags.midi-qol.fail.attack.all")
  midiFlags.push(`flags.midi-qol.grants.advantage.attack.all`);
  midiFlags.push(`flags.midi-qol.grants.disadvantage.attack.all`);
  // TODO work out how to do grants damage.max
  midiFlags.push(`flags.midi-qol.grants.attack.success.all`);
  midiFlags.push(`flags.midi-qol.grants.attack.bonus.all`);
  midiFlags.push(`flags.midi-qol.grants.critical.all`);
  midiFlags.push(`flags.midi-qol.grants.critical.range`);
  midiFlags.push('flags.midi-qol.grants.criticalThreshold');
  midiFlags.push(`flags.midi-qol.fail.critical.all`);
  midiFlags.push(`flags.midi-qol.advantage.concentration`)
  midiFlags.push(`flags.midi-qol.disadvantage.concentration`)
  midiFlags.push("flags.midi-qol.ignoreNearbyFoes");
  midiFlags.push("flags.midi-qol.")
  midiFlags.push(`flags.midi-qol.concentrationSaveBonus`);
  midiFlags.push(`flags.midi-qol.potentCantrip`);
  midiFlags.push(`flags.midi-qol.sculptSpells`);
  midiFlags.push(`flags.midi-qol.carefulSpells`);
  midiFlags.push("flags.midi-qol.magicResistance.all")
  midiFlags.push("flags.midi-qol.magicVulnerability.all")

  let attackTypes = allAttackTypes.concat(["heal", "other", "save", "util"])

  attackTypes.forEach(at => {
    midiFlags.push(`flags.midi-qol.advantage.attack.${at}`);
    midiFlags.push(`flags.midi-qol.disadvantage.attack.${at}`);
    midiFlags.push(`flags.midi-qol.fail.attack.${at}`);
    midiFlags.push(`flags.midi-qol.critical.${at}`);
    midiFlags.push(`flags.midi-qol.noCritical.${at}`);
    midiFlags.push(`flags.midi-qol.grants.advantage.attack.${at}`);
    midiFlags.push(`flags.midi-qol.grants.disadvantage.attack.${at}`);
    midiFlags.push(`flags.midi-qol.grants.critical.${at}`);
    midiFlags.push(`flags.midi-qol.fail.critical.${at}`);
    midiFlags.push(`flags.midi-qol.grants.attack.bonus.${at}`);
    midiFlags.push(`flags.midi-qol.grants.attack.success.${at}`);
    midiFlags.push(`flags.midi-qol.DR.${at}`);
    midiFlags.push(`flags.midi-qol.max.damage.${at}`);
    midiFlags.push(`flags.midi-qol.min.damage.${at}`);
    midiFlags.push(`flags.midi-qol.optional.NAME.attack.${at}`);
    midiFlags.push(`flags.midi-qol.optional.NAME.damage.${at}`);
  });
  midiFlags.push("flags.midi-qol.advantage.ability.all");
  midiFlags.push("flags.midi-qol.advantage.ability.check.all");
  midiFlags.push("flags.midi-qol.advantage.ability.save.all");
  midiFlags.push("flags.midi-qol.disadvantage.ability.all");
  midiFlags.push("flags.midi-qol.disadvantage.ability.check.all");
  midiFlags.push("flags.midi-qol.disadvantage.ability.save.all");
  midiFlags.push("flags.midi-qol.fail.ability.all");
  midiFlags.push("flags.midi-qol.fail.ability.check.all");
  midiFlags.push("flags.midi-qol.fail.ability.save.all");
  midiFlags.push("flags.midi-qol.superSaver.all");
  midiFlags.push("flags.midi-qol.semiSuperSaver.all");
  midiFlags.push("flags.midi-qol.max.ability.save.all");
  midiFlags.push("flags.midi-qol.max.ability.check.all");
  midiFlags.push("flags.midi-qol.min.ability.save.all");
  midiFlags.push("flags.midi-qol.min.ability.check.all");
  midiFlags.push("flags.midi-qol.sharpShooter");
  midiFlags.push("flags.midi-qol.onUseMacroName");

  Object.keys(config.abilities).forEach(abl => {
    midiFlags.push(`flags.midi-qol.advantage.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.disadvantage.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.advantage.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.disadvantage.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.advantage.attack.${abl}`);
    midiFlags.push(`flags.midi-qol.disadvantage.attack.${abl}`);
    midiFlags.push(`flags.midi-qol.fail.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.fail.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.superSaver.${abl}`);
    midiFlags.push(`flags.midi-qol.semiSuperSaver.${abl}`);
    midiFlags.push(`flags.midi-qol.max.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.min.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.max.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.min.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.optional.NAME.save.${abl}`);
    midiFlags.push(`flags.midi-qol.optional.NAME.check.${abl}`);
    midiFlags.push(`flags.midi-qol.magicResistance.${abl}`);
    midiFlags.push(`flags.midi-qol.magicVulnerability.all.${abl}`);
  })

  midiFlags.push(`flags.midi-qol.advantage.skill.all`);
  midiFlags.push(`flags.midi-qol.disadvantage.skill.all`);
  midiFlags.push(`flags.midi-qol.fail.skill.all`);
  midiFlags.push("flags.midi-qol.max.skill.all");
  midiFlags.push("flags.midi-qol.min.skill.all");
  Object.keys(config.skills).forEach(skill => {
    midiFlags.push(`flags.midi-qol.advantage.skill.${skill}`);
    midiFlags.push(`flags.midi-qol.disadvantage.skill.${skill}`);
    midiFlags.push(`flags.midi-qol.fail.skill.${skill}`);
    midiFlags.push(`flags.midi-qol.max.skill.${skill}`);
    midiFlags.push(`flags.midi-qol.min.skill.${skill}`);
    midiFlags.push(`flags.midi-qol.optional.NAME.skill.${skill}`);
  })
  midiFlags.push(`flags.midi-qol.advantage.deathSave`);
  midiFlags.push(`flags.midi-qol.disadvantage.deathSave`);

  if (game.system.id === "dnd5e") {
    // fix for translations
    ["vocal", "somatic", "material"].forEach(comp => {
      midiFlags.push(`flags.midi-qol.fail.spell.${comp.toLowerCase()}`);
    });
    midiFlags.push(`flags.midi-qol.DR.all`);
    midiFlags.push(`flags.midi-qol.DR.non-magical`);
    midiFlags.push(`flags.midi-qol.DR.non-silver`);
    midiFlags.push(`flags.midi-qol.DR.non-adamant`);
    midiFlags.push(`flags.midi-qol.DR.non-physical`);
    midiFlags.push(`flags.midi-qol.DR.final`);

    Object.keys(config.damageResistanceTypes).forEach(dt => {
      midiFlags.push(`flags.midi-qol.DR.${dt}`);
    })
    midiFlags.push(`flags.midi-qol.DR.healing`);
    midiFlags.push(`flags.midi-qol.DR.temphp`);


  }

  midiFlags.push(`flags.midi-qol.optional.NAME.attack.all`);
  midiFlags.push(`flags.midi-qol.optional.NAME.attack.fail`);
  midiFlags.push(`flags.midi-qol.optional.NAME.damage.all`);
  midiFlags.push(`flags.midi-qol.optional.NAME.check.all`);
  midiFlags.push(`flags.midi-qol.optional.NAME.save.all`);
  midiFlags.push(`flags.midi-qol.optional.NAME.check.fail`);
  midiFlags.push(`flags.midi-qol.optional.NAME.save.fail`);
  midiFlags.push(`flags.midi-qol.optional.NAME.label`);
  midiFlags.push(`flags.midi-qol.optional.NAME.skill.all`);
  midiFlags.push(`flags.midi-qol.optional.NAME.skill.fail`);
  midiFlags.push(`flags.midi-qol.optional.NAME.count`);
  midiFlags.push(`flags.midi-qol.optional.NAME.countAlt`);
  midiFlags.push(`flags.midi-qol.optional.NAME.ac`);
  midiFlags.push(`flags.midi-qol.optional.NAME.criticalDamage`);
  midiFlags.push(`flags.midi-qol.optional.Name.onUse`);
  midiFlags.push(`flags.midi-qol.optional.NAME.macroToCall`);


  midiFlags.push(`flags.midi-qol.uncanny-dodge`);
  midiFlags.push(`flags.midi-qol.OverTime`);
  midiFlags.push("flags.midi-qol.inMotion");
  //@ts-ignore
  const damageTypes = Object.keys(config.damageTypes);
  for (let key of damageTypes) {
    midiFlags.push(`flags.midi-qol.absorption.${key}`);
  }

  /*
  midiFlags.push(`flags.midi-qol.grants.advantage.attack.all`);
  midiFlags.push(`flags.midi-qol.grants.disadvantage.attack.all`);
  midiFlags.push(``);

  midiFlags.push(``);
  midiFlags.push(``);
  */
  if (installedModules.get("dae")) {
    const initDAE = async () => {
      for (let i = 0; i < 100; i++) {
        if (globalThis.DAE) {
          globalThis.DAE.addAutoFields(midiFlags);
          return true;
        } else {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      return false;
    };
    initDAE().then(value => { if (!value) console.error(`midi-qol | initDae settings failed`) });
  }
}

// Revisit to find out how to set execute as GM
const MQMacros = [
  {
    name: "MidiQOL.UpdateHP",
    commandText: `
    // Macro Auto created by midi-qol
    const theActor = await fromUuid(args[0]);
    if (!theActor || isNaN(args[1])) return;
    await theActor.update({"system.attributes.hp.value": Number(args[1])}, {onUpdateCalled: true});`
  }

]
export function createMidiMacros() {
  if (game?.user?.isGM) {
    for (let macroSpec of MQMacros) {
      let macro = game.macros?.getName(macroSpec.name);
      while (macro) {
        macro.delete();
        macro = game.macros?.getName(macroSpec.name);
      }
      const macroData = {
        _id: null,
        name: macroSpec.name,
        type: 'script',
        author: game.user.id,
        img: 'icons/svg/dice-target.svg',
        scope: 'global',
        command: macroSpec.commandText,
        folder: null,
        sort: 0,
        permission: {
          default: 0,
        },
        flags: {},
      };
    }
  }
}