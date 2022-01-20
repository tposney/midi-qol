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
  return installedModules.get("dice-so-nice") && (game.dice3d?.config?.enabled || game.dice3d.isEnabled());
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
    ui.notifications?.warn("midi-qol.NoChangelogs", {permanent: false, localize: true});
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
  08.104
  * Fix for items that do no damage but apply effects when using better rolls and not auto rolling damage (i.e. add chat damage button is checked).
  * Fix for Shillelagh item macro.
  * Add automatic marking of wounded/unconscious targets, controlled by config settings. Wounded requires a convenient effect whose name is the localised string "Wounded" (midi-qol.Wounded) to be defined (you need to do this). These are very simplistic, for any complex token triggers you should use Combat Utility Belt and Triggler which are excellent. 
  * Added Action Type Reaction Manual which won't trigger a reaction dialog. So there are now 3 reaction types you can set, reaction which triggers when hit, reaction damage which triggers when you take damage and reaction manual which does not trigger the reaction dialog.
  * Fix for inadvertent breaking of flags.midi-qol.initiativeDisadv 
  * Fix for hiding hit/save chat card when not using merge card.
  * Fix for a bug when applying overtime effects when players end their turn, if the next actor in the combat tracker has an overtime effect to apply.
  * Additions to midi-qol.completeItemRoll options:
    - checkGMStatus: boolean, If true non-gm clients will hand the roll to a gm client.
    - options.targetUuids, if present the roll will target the passed list of token uuids (token.document.uuid).
  * Fix for game.data.version deprecation warning.
  * Fix for some edge cases in Damage Reduction processing.
  
  0.8.103
  * Fix for tools using wrong advantage/disadvantage flags
  * Fix for overtime effects stalling combat tracker when using better rolls with damage button enabled.
  * Added ability to use different sounds for melee/ranged weapons/spell.
  * Fix for monks token bar ability checks as saving throws not working.
  * Fix for midi-qol making some monks rolls impossible to roll by hiding the roll button.
  * Fix for initiative formula when token has no referenced actor.
  * Compatibility change for Convenient Effects 2.0.1
  
  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "minor")
})