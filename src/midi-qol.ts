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
import { registerSettings, fetchParams, configSettings } from './module/settings';
import { preloadTemplates } from './module/preloadTemplates';
import { installedModules, setupModules } from './module/setupModules';
import { itemPatching, visionPatching, actorAbilityRollPatching, patchLMRTFY } from './module/patching';
import { initHooks, readyHooks } from './module/Hooks';
import { initGMActionSetup } from './module/GMAction';
import { setupSheetQol } from './module/sheetQOL';
import { TrapWorkflow, DamageOnlyWorkflow, Workflow } from './module/workflow';
import { applyTokenDamage, checkNearby, findNearby, getDistance, getTraitMult } from './module/utils';
import { ConfigPanel } from './module/apps/ConfigPanel';
import { doCritModify } from './module/itemhandling';
import { RollStats } from './module/RollStats';

export let debugEnabled = 0;
// 0 = none, warnings = 1, debug = 2, all = 3
export let debug = (...args) => {if (debugEnabled > 1) console.log("DEBUG: midi-qol | ", ...args)};
export let log = (...args) => console.log("midi-qol | ", ...args);
export let warn = (...args) => {if (debugEnabled > 0) console.warn("midi-qol | ", ...args)};
export let error = (...args) => console.error("midi-qol | ", ...args);
export let timelog = (...args) => warn("midi-qol | ", Date.now(), ...args);

export let i18n = key => {
  return game.i18n.localize(key);
};
export let i18nFormat = (key, data = {}) => {
  return game.i18n.format(key, data);
}

export let setDebugLevel = (debugText: string) => {
  debugEnabled = {"none": 0, "warn": 1, "debug": 2, "all": 3}[debugText] || 0;
  // 0 = none, warnings = 1, debug = 2, all = 3
  if (debugEnabled >= 3) CONFIG.debug.hooks = true;
}

export let noDamageSaves = [];
export let undoDamageText;
export let savingThrowText;
export let savingThrowTextAlt;
export let MQdefaultDamageType;
export let allDamageTypes;
export let midiFlags = [];
export let allAttackTypes = []
export let gameStats: RollStats;
export const MESSAGETYPES = {
  HITS: 1,
  SAVES: 2,
  ATTACK: 3,
  DAMAGE: 4,
  ITEM: 0
};
export let cleanSpellName = (name) => {
  return name.toLowerCase().replace(/[^가-힣一-龠ぁ-ゔァ-ヴーa-zA-Z0-9ａ-ｚＡ-Ｚ０-９々〆〤]/g, '').replace("'", '').replace(/ /g, '');
}

/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */

Hooks.once('init', async function() {
  console.log('midi-qol | Initializing midi-qol');
  initHooks();
	// Assign custom classes and constants here
	
	// Register custom module settings
	registerSettings();
  fetchParams();
	
	// Preload Handlebars templates
  preloadTemplates();
  // Register custom sheets (if any)

});

/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function() {
	// Do anything after initialization but before
  // ready

  setupMidiFlags();
  fetchParams();
  itemPatching();
  visionPatching();
  setupModules();
  patchLMRTFY();
  registerSettings();
  initGMActionSetup();
  undoDamageText = i18n("midi-qol.undoDamageFrom");
  savingThrowText = i18n("midi-qol.savingThrowText");
  savingThrowTextAlt = i18n("midi-qol.savingThrowTextAlt");
  MQdefaultDamageType = i18n("midi-qol.defaultDamageType");
  CONFIG.DND5E.weaponProperties["nodam"] = i18n("midi-qol.noDamageSaveProp");
  CONFIG.DND5E.weaponProperties["fulldam"] = i18n("midi-qol.fullDamageSaveProp");
  CONFIG.DND5E.weaponProperties["halfdam"] = i18n("midi-qol.halfDamageSaveProp")
  CONFIG.DND5E.damageTypes["midi-none"] = i18n("midi-qol.midi-none");
  CONFIG.DND5E.damageResistanceTypes["spell"] = i18n("midi-qol.spell-damage");
  allDamageTypes = mergeObject(CONFIG.DND5E.damageTypes, CONFIG.DND5E.healingTypes, {inplace:false});

  if (configSettings.allowUseMacro) {
    /*
    CONFIG.DND5E.characterFlags["AttackBonusMacro"] = {
      hint: i18n("midi-qol.AttackMacro.Hint"),
      name: i18n("midi-qol.AttackMacro.Name"),
      placeholder: "",
      section: i18n("midi-qol.DAEMidiQOL"),
      type: String
    };
    */
    CONFIG.DND5E.characterFlags["DamageBonusMacro"] = {
      hint: i18n("midi-qol.DamageMacro.Hint"),
      name: i18n("midi-qol.DamageMacro.Name"),
      placeholder: "",
      section: i18n("midi-qol.DAEMidiQOL"),
      type: String
    };
  };

  //@ts-ignore
  noDamageSaves = i18n("midi-qol.noDamageonSaveSpells").map(name => cleanSpellName(name));
  setupSheetQol();
}); 

/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */
Hooks.once('ready', function() {
  if (!game.modules.get("lib-wrapper")?.active && game.user.isGM)
    ui.notifications.warn("The 'Midi QOL' module recommends to install and activate the 'libWrapper' module.");
  gameStats = new RollStats();

  // Do anything once the module is ready
  actorAbilityRollPatching();
  setupMinorQolCompatibility();

  if (game.user.isGM && !installedModules.get("dae")) {
    ui.notifications.warn("Midi-qol requires DAE to be installed and at least version 0.2.43 or many automation effects won't work");
  }
  checkCubInstalled();
  checkConcentrationSettings();
  readyHooks();
});

// Add any additional hooks if necessary

// Backwards compatability
function setupMinorQolCompatibility() {

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
    configSettings,
    ConfigPanel: ConfigPanel,
    getTraitMult: getTraitMult,
    doCritModify: doCritModify,
    getDistance: getDistance,
    midiFlags,
    debug,
    log,
    warn,
    findNearby: findNearby,
    checkNearby: checkNearby,
    gameStats
  }
}

export function checkCubInstalled() {
  if (game.user?.isGM && configSettings.concentrationAutomation && !installedModules.get("combat-utility-belt")) {
    let d = new Dialog({
      // localize this text
      title: i18n("dae.confirm"),
      content: `<p>You have enabled midi-qol concentration automation. This requires that you install and activate Combat Utility Belt as well. Concentration Automation will be disalbed</p>`,
      buttons: {
          one: {
              icon: '<i class="fas fa-check"></i>',
              label: "OK",
              callback: ()=>{
                configSettings.concentrationAutomation = false;
              }
          }
      },
      default: "one"
    })
    d.render(true);
  }
}

export function checkConcentrationSettings() {
  const needToUpdateCubSettings = installedModules.get("combat-utility-belt") && (
    game.settings.get("combat-utility-belt", "enableConcentrator")
    // game.settings.get("combat-utility-belt", "autoConcentrate") ||
    // game.settings.get("combat-utility-belt", "concentratorPromptPlayer")
    // game.settings.get("combat-utility-belt", "concentratorOutputToChat")
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
            callback: ()=>{
              game.settings.set("combat-utility-belt", "enableConcentrator", false)
              // game.settings.set("combat-utility-belt", "autoConcentrate", false);
              // game.settings.set("combat-utility-belt", "concentratorPromptPlayer", false);
              // game.settings.set("combat-utility-belt", "concentratorOutputToChat", false);
            }
        },
        two: {
          icon: '<i class="fas fa-cross"></i>',
          label: "Disable Midi",
          callback: ()=>{
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
function doRoll(event={shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, type: "none"}, itemName, options = {type: "", versatile: false})
{
  const speaker = ChatMessage.getSpeaker();
  var actor;
  if (speaker.token) {
    const token = canvas.tokens.get(speaker.token)
    actor = token.actor;
  } else {
    actor = game.actors.get(speaker.actor);
  }
  if (!actor) {
    warn("No actor found for ", speaker);
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
    return item.roll({event: pEvent})
  } else {
    ui.notifications.warn(game.i18n.format("DND5E.ActionWarningNoItem", {item: itemName, name: actor.name}));
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
  midiFlags.push(`flags.midi-qol.grants.noCritical.all`);
  midiFlags.push(`flags.midi-qol.maxDamage.all`);
  midiFlags.push(`flags.midi-qol.grants.maxDamage.all`);
  midiFlags.push(`flags.midi-qol.advantage.concentration`)
  // midiFlags.push(`flags.midi-qol.disadvantage.concentration`)



  allAttackTypes = ["rwak","mwak","rsak", "msak"];
  if (game.system.id === "sw5e")
    allAttackTypes = ["rwak","mwak","rpak", "mpak"];
  
  let attackTypes = allAttackTypes.concat(["heal", "other", "save", "util"])

  attackTypes.forEach(at => {
    midiFlags.push(`flags.midi-qol.advantage.attack.${at}`);
    midiFlags.push(`flags.midi-qol.disadvantage.attack.${at}`);
    midiFlags.push(`flags.midi-qol.fail.attack.${at}`);
    midiFlags.push(`flags.midi-qol.critical.${at}`);
    midiFlags.push(`flags.midi-qol.noCritical.${at}`);
    midiFlags.push(`flags.midi-qol.grants.advantage.attack.${at}`);
    midiFlags.push(`flags.midi-qol.grants.disadvantage.attack.${at}`);
    midiFlags.push(`flags.midi-qol.grants.critical.damage.${at}`);
    midiFlags.push(`flags.midi-qol.grants.noCritical.attack.${at}`);
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

  Object.keys(CONFIG.DND5E.abilities).forEach(abl => {
    midiFlags.push(`flags.midi-qol.advantage.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.disadvantage.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.advantage.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.disadvantage.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.fail.ability.check.${abl}`);
    midiFlags.push(`flags.midi-qol.fail.ability.save.${abl}`);
    midiFlags.push(`flags.midi-qol.superSaver.${abl}`);
  })
  midiFlags.push(`flags.midi-qol.advantage.skill.all`);
  midiFlags.push(`flags.midi-qol.disadvantage.skill.all`);
  midiFlags.push(`flags.midi-qol.fail.skill.all`);
  Object.keys(CONFIG.DND5E.skills).forEach(skill => {
    midiFlags.push(`flags.midi-qol.advantage.skill.${skill}`);
    midiFlags.push(`flags.midi-qol.disadvantage.skill.${skill}`);
    midiFlags.push(`flags.midi-qol.fail.skill.${skill}`);
  })
  midiFlags.push(`flags.midi-qol.advantage.deathSave`);
  midiFlags.push(`flags.midi-qol.disadvantage.deathSave`);

  if (game.system.id === "dnd5e") {
    Object.values(CONFIG.DND5E.spellComponents).forEach((comp: string) => {
      midiFlags.push(`flags.midi-qol.fail.spell.${comp.toLowerCase()}`);  
    });
    midiFlags.push(`flags.midi-qol.DR.all`);
    midiFlags.push(`flags.midi-qol.DR.non-magical`);
    Object.keys(CONFIG.DND5E.damageTypes).forEach(dt => {
      midiFlags.push(`flags.midi-qol.DR.${dt}`);  
    })
  }
  
  /*
  midiFlags.push(`flags.midi-qol.grants.advantage.attack.all`);
  midiFlags.push(`flags.midi-qol.grants.disadvantage.attack.all`);
  midiFlags.push(``);

  midiFlags.push(``);
  midiFlags.push(``);
  */
  midiFlags.sort()
}




