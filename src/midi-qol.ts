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
import { registerSettings, fetchParams } from './module/settings.js';
import { preloadTemplates } from './module/preloadTemplates.js';
import { setupModules } from './module/setupModules.js';
import { readyPatching, initPatching } from './module/patching.js';
import { initHooks } from './module/Hooks.js';
import { initGMActionSetup } from './module/GMAction.js';
import { setupSheetQol } from './module/sheetQOL.js';

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

export const MESSAGETYPES = {
  hitData: 1,
  saveData: 2
};
export let cleanSpellName = (name) => {
  return name.toLowerCase().replace(/[^가-힣一-龠ぁ-ゔァ-ヴーa-zA-Z0-9ａ-ｚＡ-Ｚ０-９々〆〤]/g, '').replace("'", '').replace(/ /g, '');
}

/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
Hooks.once('init', async function() {
	console.log('midi-qol | Initializing midi-qol');

	// Assign custom classes and constants here
	
	// Register custom module settings
	registerSettings();
  fetchParams();
	
	// Preload Handlebars templates
  await preloadTemplates();
  initHooks();
  initPatching();

	// Register custom sheets (if any)
});

/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function() {
	// Do anything after initialization but before
  // ready
  setupModules();
  initGMActionSetup();
  undoDamageText = i18n("midi-qol.undoDamageFrom");
  savingThrowText = i18n("midi-qol.savingThrowText");
  savingThrowTextAlt = i18n("midi-qol.savingThrowTextAlt");
  //@ts-ignore
  noDamageSaves = i18n("midi-qol.noDamageonSaveSpells").map(name => cleanSpellName(name));
  setupSheetQol();
}); 

/* ------------------------------------ */
/* When ready							*/
/* ------------------------------------ */
Hooks.once('ready', function() {
  // Do anything once the module is ready
  readyPatching();

});

// Add any additional hooks if necessary
