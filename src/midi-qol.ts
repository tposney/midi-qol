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
import { setupModules } from './module/setupModules';
import { itemPatching, visionPatching, actorAbilityRollPatching, patchLMRTFY } from './module/patching';
import { initHooks } from './module/Hooks';
import { initGMActionSetup } from './module/GMAction';
import { setupSheetQol } from './module/sheetQOL';
import { TrapWorkflow, DamageOnlyWorkflow, Workflow } from './module/workflow';
import { applyTokenDamage, getTraitMult } from './module/utils';
import { ConfigPanel } from './module/apps/ConfigPanel';
import { doCritModify } from './module/itemhandling';

export let debugEnabled = 0;
// 0 = none, warnings = 1, debug = 2, all = 3
export let debug = (...args) => {if (debugEnabled > 1) console.log("DEBUG: midi-qol | ", ...args)};
export let log = (...args) => console.log("midi-qol | ", ...args);
export let warn = (...args) => {if (debugEnabled > 0) console.warn("midi-qol | ", ...args)};
export let error = (...args) => console.error("midi-qol | ", ...args)
export let i18n = key => {
  return game.i18n.localize(key);
};
export let setDebugLevel = (debugText: string) => {
  debugEnabled = {"none": 0, "warn": 1, "debug": 2, "all": 3}[debugText] || 0;
  // 0 = none, warnings = 1, debug = 2, all = 3
  CONFIG.debug.hooks = debugEnabled >= 3;
}

export let noDamageSaves = [];
export let undoDamageText;
export let savingThrowText;
export let savingThrowTextAlt;
export let MQdefaultDamageType;

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
  CONFIG.DND5E.weaponProperties["fulldam"] = i18n("midi-qol.fullDamageSaveProp")
  CONFIG.DND5E.damageTypes["midi-none"] = i18n("midi-qol.midi-none");
  CONFIG.DND5E.damageResistanceTypes["spell"] = i18n("midi-qol.spell-damage");
  //@ts-ignore
  noDamageSaves = i18n("midi-qol.noDamageonSaveSpells").map(name => cleanSpellName(name));
  setupSheetQol();
  setupMinorQolCompatibility();
}); 

/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */
Hooks.once('ready', function() {
  if (!game.modules.get("lib-wrapper")?.active && game.user.isGM)
    ui.notifications.warn("The 'Midi QOL' module recommends to install and activate the 'libWrapper' module.");

  // Do anything once the module is ready
  actorAbilityRollPatching();
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
    doCritModify: doCritModify
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
