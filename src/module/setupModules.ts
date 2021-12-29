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
  
  0.8.100
  * Remove accidental debug left in
  * Fix for incomplete lang.json files.

  0.8.99
  * Fix for Rakish Audacity and Sneak Attack sample items which break in v9 stable.
  * Extend skip consume spell slot to cover skipping all consumption dialogs, pressing adv/dis when clicking causes the dialogs to be shown.
  * Fix for expiring effects when actor has none. (v9 tweak I think).
  * Removed unintentional reference to inappropriate icon from the module that shall not be named.

  
  0.8.98
  * Support core damage numbers for all damage/healing application.
  * Remove accidental debugger call.
  
  0.8.97
  * Process flags.midi-qol.advantage..., flags.midi-qol.disadvantage.... when doing initiative rolls (dex check advantage will give initiative advantage).
  * Fix for sneak attack and v9.
  * Fix for v9 scrolling damage display not working with midi apply damage.
  * 2 new onUseMacro call points, templatePlaced and preambleComplete.

  0.8.96
  * Fix for concentration save bonus being ignored. Thanks @SagaTympana#8143.
  * Fix reactions ignoring prepared status on spells - broken in 0.8.95
  * Remove context field from onUseMacros when using betterrolls5e
  * Experimental "late targeting mode" for items that are NOT Template, Range or Self targeting. If auto roll attack is enabled then after you start the roll (click on the icon):
    - token + targeting will be selected in the controls tab, 
    - the character sheet will be minimised and midi will wait for you to target tokens.
    - You signal that you are ready by changing the control selection to anything other than token targeting.
    - The sheet will be restoed and the workflow continue.

  0.8.95
  * Reactions now check for resource availability and spell slot availability. (Probably some bugs in this).
  * Added another midi-qol Hook call, Hooks.call("midi-qol.damageApplied", token, {item, workflow, damageData} => ());
  * 
  0.8.94
  * Fix for empty onUseMacro field failing to allow adding onUseMacros
  * Incapacitated actors can't take reactions

  0.8.93
  * Fix for better rolls not AoE template targeting correctly.
  * Fix for No Damage On Save spell list failing in cyrillic alphabets.
  * Fix for onUseMacros and tidy itemsheet5e display issues. Thanks @Seriousnes#7895
  
  0.8.92
  * Fix for non english games with no translation for midi-qol failing to open config. panel.
  * Fix for removing "missed" chat cards when not auto rolling damage.
  * Include missing Absorb Elements Spell
  * **BREAKING** as of 0.8.91 if using uncanny dodge from the compendium, you will need to change it's activation cost to "Reaction Damaged" or it won't function. I failed to update the compendium but will do it later. 

  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "minor")
})