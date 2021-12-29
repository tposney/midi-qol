/**
 * This is your TypeScript entry file for Foundry VTT.
 * Register custom settings, sheets, and constants using the Foundry API.
 * Change this heading to be more descriptive to your module, or remove it.
 * Author: [your name]
 * Content License: [copyright and-or license] If using an existing system
 * 					you may want to put a (link to a) license or copyright
 * 					notice here (e.g. the OGL).
 * Software License: [your license] Put your desired license here, which
 * 					 determines how others may use and modify your module
 */

// Import TypeScript modules
import { registerSettings, fetchParams, configSettings, checkRule, collectSettingData, enableWorkflow } from './module/settings.js';
import { preloadTemplates } from './module/preloadTemplates.js';
import { checkModules, installedModules, setupModules } from './module/setupModules.js';
import { itemPatching, visionPatching, actorAbilityRollPatching, patchLMRTFY, readyPatching, initPatching } from './module/patching.js';
import { initHooks, overTimeJSONData, readyHooks, setupHooks } from './module/Hooks.js';
import { initGMActionSetup, setupSocket, socketlibSocket } from './module/GMAction.js';
import { setupSheetQol } from './module/sheetQOL.js';
import { TrapWorkflow, DamageOnlyWorkflow, Workflow } from './module/workflow.js';
import { applyTokenDamage, checkNearby, completeItemRoll, findNearby, getConcentrationEffect, getDistance, getDistanceSimple, getTraitMult, MQfromActorUuid, MQfromUuid, reportMidiCriticalFlags } from './module/utils.js';
import { ConfigPanel } from './module/apps/ConfigPanel.js';
import { showItemCard, showItemInfo, templateTokens } from './module/itemhandling.js';
import { RollStats } from './module/RollStats.js';
import { OnUseMacroOptions } from './module/apps/Item.js';

export let debugEnabled = 0;
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
export function getCanvas(): Canvas {
  if (!canvas) throw new Error("Canvas not ready");
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
  const regex =  /[^가-힣一-龠ぁ-ゔァ-ヴーa-zA-Z0-9ａ-ｚＡ-Ｚ０-９а-яА-Я々〆〤]/g
  return name.toLowerCase().replace(regex, '').replace("'", '').replace(/ /g, '');
}

/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */

Hooks.once('init', async function () {
  console.log('midi-qol | Initializing midi-qol');
  initHooks();
  // Assign custom classes and constants here

  // Register custom module settings
  registerSettings();
  fetchParams();

  // Preload Handlebars templates
  preloadTemplates();
  // Register custom sheets (if any)
  initPatching();
});

/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function () {
  // Do anything after initialization but before
  // ready
  setupSocket();
  fetchParams();
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
  if (game.system.id === "dnd5e") {
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.weaponProperties["nodam"] = i18n("midi-qol.noDamageSaveProp");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.weaponProperties["fulldam"] = i18n("midi-qol.fullDamageSaveProp");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.weaponProperties["halfdam"] = i18n("midi-qol.halfDamageSaveProp")
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.weaponProperties["critOther"] = i18n("midi-qol.otherCritProp")
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageTypes["midi-none"] = i18n("midi-qol.midi-none");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageResistanceTypes["silver"] = i18n("midi-qol.nonSilverPhysical");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageResistanceTypes["adamant"] = i18n("midi-qol.nonAdamantinePhysical");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageResistanceTypes["spell"] = i18n("midi-qol.spell-damage");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageResistanceTypes["healing"] = CONFIG.DND5E.healingTypes.healing;
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageResistanceTypes["temphp"] = CONFIG.DND5E.healingTypes.temphp;
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.abilityActivationTypes["reactiondamage"] = `${i18n("DND5E.Reaction")} ${i18n("midi-qol.reactionDamaged")}`;
  } else { // sw5e
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.weaponProperties["nodam"] = i18n("midi-qol.noDamageSaveProp");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.weaponProperties["fulldam"] = i18n("midi-qol.fullDamageSaveProp");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.weaponProperties["halfdam"] = i18n("midi-qol.halfDamageSaveProp")
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.weaponProperties["critOther"] = i18n("midi-qol.otherCritProp")
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageTypes["midi-none"] = i18n("midi-qol.midi-none");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageResistanceTypes["silver"] = i18n("midi-qol.nonSilverPhysical");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageResistanceTypes["adamant"] = i18n("midi-qol.nonAdamantinePhysical");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageResistanceTypes["spell"] = i18n("midi-qol.spell-damage");
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageResistanceTypes["healing"] = CONFIG.DND5E.healingTypes.healing;
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.damageResistanceTypes["temphp"] = CONFIG.DND5E.healingTypes.temphp;

  }

  if (configSettings.allowUseMacro) {
    //@ts-ignore CONFIG.DND5E
    CONFIG.DND5E.characterFlags["DamageBonusMacro"] = {
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
  gameStats = new RollStats();
  actorAbilityRollPatching();
  // has to be done before setup api.
  MQOnUseOptions = i18n("midi-qol.onUseMacroOptions");
  if (typeof MQOnUseOptions === "string") MQOnUseOptions = {
    "templatePlaced": "Only callled once a template is placed",
    "preambleComplete": "After targeting complete",
    "preAttackRoll": "Before Attack Roll",
    "preCheckHits": "Before Check Hits",
    "postAttackRoll": "After Attack Roll",
    "preSave": "Before Save",
    "postSave": "After Save",
    "preDamageRoll": "Before Damage Roll",
    "postDamageRoll": "After Damage Roll",
    "preDamageApplication": "Before Damage Application",
    "preActiveEffects": "Before Active Effects",
    "postActiveEffects": "After Active Effects ",
    "all": "All"
  }
  OnUseMacroOptions.setOptions(MQOnUseOptions);

  setupMidiQOLApi();

  if (game.user?.isGM && !installedModules.get("dae")) {
    ui.notifications?.warn("Midi-qol requires DAE to be installed and at least version 0.8.43 or many automation effects won't work");
  }
  if (game.user?.isGM && game.modules.get("betterrolls5e")?.active && !installedModules.get("betterrolls5e")) {
    ui.notifications?.warn("Midi QOL requires better rolls to be version 1.6.6 or later");
  }
  if (isNewerVersion(game.data.version, "0.8.9")) {
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
});

// Add any additional hooks if necessary

// Backwards compatability
function setupMidiQOLApi() {

  //@ts-ignore
  window.MinorQOL = {
    doRoll: doRoll,
    applyTokenDamage: applyTokenDamage
  }
  //@ts-ignore
  window.MidiQOL = {
    applyTokenDamage,
    TrapWorkflow,
    DamageOnlyWorkflow,
    Workflow,
    enableWorkflow,
    configSettings: () => { return configSettings },
    ConfigPanel: ConfigPanel,
    getTraitMult: getTraitMult,
    getDistance: getDistanceSimple,
    midiFlags,
    debug,
    log,
    warn,
    findNearby: findNearby,
    checkNearby: checkNearby,
    showItemInfo: showItemInfo,
    showItemCard: showItemCard,
    gameStats,
    MQFromUuid: MQfromUuid,
    MQfromActorUuid: MQfromActorUuid,
    getConcentrationEffect: getConcentrationEffect,
    selectTargetsForTemplate: templateTokens,
    socket: () => { return socketlibSocket },
    checkRule: checkRule,
    reportMidiCriticalFlags: reportMidiCriticalFlags,
    completeItemRoll: completeItemRoll,
    overTimeJSONData: overTimeJSONData,
    MQOnUseOptions
  }
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
  midiFlags.push("flags.midi-qol.advantage.all")
  midiFlags.push("flags.midi-qol.disadvantage.all")
  midiFlags.push("flags.midi-qol.advantage.attack.all")
  midiFlags.push("flags.midi-qol.disadvantage.attack.all")
  midiFlags.push("flags.midi-qol.critical.all")
  midiFlags.push("flags.midi-qol.noCritical.all")
  midiFlags.push("flags.midi-qol.fail.all")
  midiFlags.push("flags.midi-qol.fail.attack.all")
  midiFlags.push(`flags.midi-qol.grants.advantage.attack.all`);
  midiFlags.push(`flags.midi-qol.grants.disadvantage.attack.all`);
  midiFlags.push(`flags.midi-qol.grants.critical.all`);
  midiFlags.push(`flags.midi-qol.fail.critical.all`);
  // midiFlags.push(`flags.midi-qol.maxDamage.all`); // TODO implement this
  // midiFlags.push(`flags.midi-qol.grants.maxDamage.all`);
  midiFlags.push(`flags.midi-qol.advantage.concentration`)
  midiFlags.push(`flags.midi-qol.disadvantage.concentration`)
  midiFlags.push("flags.midi-qol.ignoreNearbyFoes");
  midiFlags.push(`flags.midi-qol.concentrationSaveBonus`);
  midiFlags.push(`flags.midi-qol.potentCantrip`);
  midiFlags.push(`flags.midi-qol.sculptSpells`);

  allAttackTypes = ["rwak", "mwak", "rsak", "msak"];
  if (game.system.id === "sw5e")
    allAttackTypes = ["rwak", "mwak", "rpak", "mpak"];

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
    midiFlags.push(`flags.midi-qol.maxDamage.${at}`);


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
  midiFlags.push("flags.midi-qol.MR.ability.save.all");


  //@ts-ignore CONFIG.DND5E
  Object.keys(CONFIG.DND5E.abilities).forEach(abl => {
    midiFlags.push(`flags.midi-qol.advantage.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.disadvantage.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.advantage.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.disadvantage.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.advantage.attack.${abl}`);
    midiFlags.push(`flags.midi-qol.disadvantage.attack.${abl}`);
    midiFlags.push(`flags.midi-qol.fail.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.fail.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.superSaver.${abl}`);
    midiFlags.push(`flags.midi-qol.MR.ability.save.${abl}`);

  })
  midiFlags.push(`flags.midi-qol.advantage.skill.all`);
  midiFlags.push(`flags.midi-qol.disadvantage.skill.all`);
  midiFlags.push(`flags.midi-qol.fail.skill.all`);
  //@ts-ignore CONFIG.DND5E
  Object.keys(CONFIG.DND5E.skills).forEach(skill => {
    midiFlags.push(`flags.midi-qol.advantage.skill.${skill}`);
    midiFlags.push(`flags.midi-qol.disadvantage.skill.${skill}`);
    midiFlags.push(`flags.midi-qol.fail.skill.${skill}`);
  })
  midiFlags.push(`flags.midi-qol.advantage.deathSave`);
  midiFlags.push(`flags.midi-qol.disadvantage.deathSave`);

  if (game.system.id === "dnd5e") {
    //@ts-ignore CONFIG.DND5E
    Object.values(CONFIG.DND5E.spellComponents).forEach((comp: string) => {
      midiFlags.push(`flags.midi-qol.fail.spell.${comp.toLowerCase()}`);
    });
    midiFlags.push(`flags.midi-qol.DR.all`);
    midiFlags.push(`flags.midi-qol.DR.non-magical`);
    midiFlags.push(`flags.midi-qol.DR.non-silver`);
    midiFlags.push(`flags.midi-qol.DR.non-adamant`);
    midiFlags.push(`flags.midi-qol.DR.non-physical`);

    midiFlags.push(`flags.midi-qol.DR.final`);

    //@ts-ignore CONFIG.DND5E
    Object.keys(CONFIG.DND5E.damageResistanceTypes).forEach(dt => {
      midiFlags.push(`flags.midi-qol.DR.${dt}`);
    })
  }

  midiFlags.push(`flags.midi-qol.optional.NAME.attack`);
  midiFlags.push(`flags.midi-qol.optional.NAME.check`);
  midiFlags.push(`flags.midi-qol.optional.NAME.save`);
  midiFlags.push(`flags.midi-qol.optional.NAME.label`);
  midiFlags.push(`flags.midi-qol.optional.NAME.skill`);
  midiFlags.push(`flags.midi-qol.optional.NAME.count`);
  midiFlags.push(`flags.midi-qol.uncanny-dodge`);

  midiFlags.push(`flags.midi-qol.OverTime`);

  //@ts-ignore
  const damageTypes = Object.keys(CONFIG.SW5E?.damageTypes ?? CONFIG.DND5E.damageTypes);
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
    //@ts-ignore
    window.DAE.addAutoFields(midiFlags);
  }
}