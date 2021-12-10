import { debug, error, debugEnabled, i18n } from "../midi-qol.js";
import { log } from "../midi-qol.js";
import { configSettings } from "./settings.js";

let modules = {"about-time": "0.0", 
              "betterrolls5e": "1.6.6", 
              "dice-so-nice": "4.1.1", 
              "itemacro": "1.0.0", 
              "lmrtfy": "0.9",
              "lib-wrapper": "1.3.5",
              "dae": "0.8.43",
              "combat-utility-belt": "1.3.8",
              "times-up": "0.1.2",
              "conditional-visibility": "0.0",
              "monks-tokenbar": "1.0.55",
              "socketlib": "0.0",
              "advanced-macros": "1.0",
              "dnd5e-helpers":  "3.0.0",
              "dfreds-convenient-effects": "1.8.0",
              "levels": "1.7.0",
              "levelsvolumetrictemplates": "0.0.0",
              "lib-changelogs": "0.0.0",
              "df-qol": "1.6.0",
              "ddb-game-log": "0.0.0"
            };
export let installedModules = new Map();

export let setupModules = () => {
  for (let name of Object.keys(modules)) { 
    const modVer = game.modules.get(name)?.data.version || "0.0.0";
    const neededVer = modules[name];
    const isValidVersion = isNewerVersion(modVer, neededVer) || !isNewerVersion(neededVer, modVer) ;
    installedModules.set(name, game.modules.get(name)?.active && isValidVersion) 
    if (!installedModules.get(name)) {
      if (game.modules.get(name)?.active)
        error(`midi-qol requires ${name} to be of version ${modules[name]} or later, but it is version ${game.modules.get(name)?.data.version}`);
      else console.warn(`midi-qol | module ${name} not active - some features disabled`)
    }
  }
  if (debugEnabled > 0)
  for (let module of installedModules.keys()) 
    log(`module ${module} has valid version ${installedModules.get(module)}`);
}

export function dice3dEnabled() {
  //@ts-ignore
  // return installedModules.get("dice-so-nice") && game.dice3d?.isEnabled();
  return installedModules.get("dice-so-nice");
}

export function checkModules() {
  if (game.user?.isGM && !installedModules.get("socketlib")) {
    //@ts-ignore expected one argument but got 2
    ui.notifications.error("midi-qol.NoSocketLib", {permanent: true, localize: true});
  }
  //@ts-ignore
  const midiVersion = game.modules.get("midi-qol").data.version;
  const notificationVersion = game.settings.get("midi-qol", "notificationVersion");

  //@ts-ignore
  if (game.user?.isGM && !installedModules.get("lib-changelogs") && isNewerVersion(midiVersion, notificationVersion)) {
    game.settings.set("midi-qol", "notificationVersion", midiVersion);
    //@ts-ignore expected one argument but got 2
    ui.notifications?.warn("midi-qol.NoChangelogs", {permanent: true, localize: true});
  }
  checkCubInstalled();
}

export function checkCubInstalled() {
  return;
  if (game.user?.isGM && configSettings.concentrationAutomation && !installedModules.get("combat-utility-belt")) {
    let d = new Dialog({
      // localize this text
      title: i18n("midi-qol.confirm"),
      content: i18n("midi-qol.NoCubInstalled"), 
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

Hooks.once('libChangelogsReady', function() {
  //@ts-ignore
  libChangelogs.register("midi-qol",`
  0.8.92
  * Fix for non english games with no translation for midi-qol failing to open config. panel.
  * Fix for removing "missed" chat cards when not auto rolling damage.
  * Include missing Absorb Elements Spell

  0.8.91
  * Fix for rectangular templates coupled with wall blocking producing odd results.
  * Support editing targets after placing an AoE template but before rolling damage for items without an attack roll (attacks lock the targets).
  * Fix for better rolls saving throws results NOT being displayed for the player that did the save when using dice so nice.
  * Fix for ability test saves not working.
  * Breaking - libWrapper is now a dependency for midi-qol.
  * Added some new midi-qol flags, flags.midi-qol.absorption.acid/bludgeoning etc, which converts damage of that type to healing, for example Clay Golem
  * Added noDamageAlt and fullDamageAlt strings, mainly of use for language translators.
  * Support for monks token bar 1.0.55 to set advantage/disadvantage on saving throws as required. Midi-qol REQUIRES monk's token bar 1.0.55.
  * Change to reaction processing. 
    - Added an additional reaction type, Reaction Damage as well as the existing Reaction.
    - Items with activation type Reaction will get applied after the attack roll has been made, but before it is adjudicated.
    - Items with activation type Reaction Damage will get called before damage is applied, but after it is determined that damage is going to be applied.
    - The activation condition is no longer consulted for reactions, only the activation type.
  * Added Absorb Elements to the sample item compendium.

  * OnUse macros - added some control for macro writers to decide when their macro should get called, this is meant to be more convenient that a macro that registers for hooks. The macro data will be current for the state of the workflow. e.g. [postActiveEffects]ItemMacro. Many thanks to @Seriousnes#7895 for almost all of the code for this.
      [preAttackRoll] before the attack roll is made
      [preCheckHits] after the attack roll is made but before hits are adjudicated
      [postAttackRoll] after the attack is adjudicated
      [preSave] before saving throws are rolled
      [postSave] after saving throws are rolled
      [preDamageRoll] before damage is rolled
      [postDamageRoll] after the damage roll is made
      [preDamageApplication] before damage is applied
      [preActiveEffects] before active effects are applied
      [postActiveEffects] after active effects are applied
      [All] call the macro for each of the above cases
    - the macro arguments have an additional parameter args[0].macroPass set to the pass being called, being one of:
      preAttackRoll
      preCheckHits
      postAttackRoll
      preSave
      postSave
      preDamageRoll
      postDamageRoll
      preDamageApplication
      preActiveEffects
      postActiveEffects
    - all is special, being called with each value of args[0].macroPass. You can differentiate by checking args[0].macroPass to decide which ones to act on.
    - You can specify (for example):
      [postAttackRoll]ItemMacro, [postDmageApplication]ItemMacro for multiple passes, or use All  
    - The default pass is "postActiveEffects", to correspond to the existing behaviour.
    * Note: if you are creating a damage only workflow in your macro it is best to run it in "postActiveEffects". 
    * Note: For better rolls the preAttackRoll, preDamageRoll don't really mean anything.
    * If you wish to make changes to the workflow in these macros you will need to do: (remembering that if the macro is an execute as GM macro being run on the GM client, the Workflow.get may return undefined)
    
    const workflow = MidiQOL.Workflow.getWorkflow(args[0].uuid)
    workflow.... = .....
  
  0.8.90
  * Reinstated the intended behaviour of the "Apply Active Effects" button, which is to apply effects to targeted tokens, rather than tokens targeted when the item was first rolled.
  * Fix for better rolls saving throws not being hidden.
  * Fix for a bug when using LMRTFY and midi, where midi would (sometimes) cause LMRTFY to do all rolls as normal rolls (ignoring the private/blind setting in LMRTFY).
  * Fix for failed initialisation in non-english versions.
  * Fixed wrong image in Readme.md for Hold person.
  * Fix for some spells being ignored when doing reactions.

  0.8.89
  * Added "heal" action type to ddb-game-log support
  * Fix for broken "no damage on save" cantrip list.

  0.8.88
  * Fix for ddbgl breakage in 0.8.87
 
  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "major")
})