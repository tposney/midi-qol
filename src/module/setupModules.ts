import { debug, error, debugEnabled, i18n } from "../midi-qol.js";
import { log } from "../midi-qol.js";
import { configSettings } from "./settings.js";

let modules = {"about-time": "0.0", 
              "betterrolls5e": "1.6.6", 
              "dice-so-nice": "4.1.1", 
              "itemacro": "1.0.0", 
              "lmrtfy": "0.9",
              "lib-wrapper": "1.3.5",
              "dae": "0.9.05",
              "combat-utility-belt": "1.3.8",
              "times-up": "0.1.2",
              "conditional-visibility": "0.0",
              "monks-tokenbar": "1.0.55",
              "socketlib": "0.0",
              "advanced-macros": "1.0",
              "dnd5e-helpers":  "3.0.0",
              "dfreds-convenient-effects": "2.1.0",
              "levels": "1.7.0",
              "levelsvolumetrictemplates": "0.0.0",
              "lib-changelogs": "0.0.0",
              "df-templates": "1.0.0",
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
  return installedModules.get("dice-so-nice") && (game.dice3d?.config?.enabled || game.dice3d?.isEnabled());
}

export function checkModules() {
  if (game.user?.isGM && !installedModules.get("socketlib")) {
    //@ts-ignore expected one argument but got 2
    ui.notifications.error("midi-qol.NoSocketLib", {permanent: true, localize: true});
  }
  //@ts-ignore
  const midiVersion = game.modules.get("midi-qol").data.version;
  const notificationVersion = game.settings.get("midi-qol", "notificationVersion");

  if (game.user?.isGM && 
    !installedModules.get("lib-changelogs") 
    && !game.modules.get("module-credits")?.active
    //@ts-ignore
    && isNewerVersion(midiVersion, notificationVersion)) {
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

  0.9.48
  * Added MidiQOL.doOverTimeEffect(actor: Actor5e, effect: ActiveEffect, turnStart: boolean), which will perform the overtime processing for the passed effect, turnStart === true, do turn=start changes, false do turn=end changes. The effect does not need to be present on the actor to work, but can be.
  * Fix for rolling tool checks not supporting alt/ctrl/T.
  * Fix for concentration advantage bug - thanks @kampffrosch94.
  * Added support for different sounds to be played for characters/npcs in midi custom sounds.
  * Added support for weapon subtypes in midi custom sounds. Set the weapon base type on the item sheet to whatever you want and you can specify weapon sub types in the sound config to be any of the valid base types. Existing sound config should be automatically migrated and midi makes a backup of your existing settings. You can restore the old settings via (after rollback of the midi version)
    game.settings.set("midi-qol", "MidiSoundSettings", getProperty("midi-qol", "MidiSoundSettings-backup"));
  * Added flags.midi-qol.optional.NAME.criticalDamage which allows optional bonus damage to do critical damage.
  * Fix for editing actor onUseMacros duplicating active effect created onUseMacros.
  
  0.9.47
  * Fix for token hud rolling bug introduced in 0.9.46
  
  0.9.46
  * Restore the order or arguments for actor.data.flags.midi-qol.onUseMacro to be macro name, macro pass - thanks @Elwin
  * Fix for typo in template targeting walls block test.
  * Fix for CE active and non player tokens -> 0 hp, not marking dead in combat tracker.
  * Fix for player damage card not obscuring actor name if CUB hid name settings enabled.
  * Change to item.roll(options: {workflowOptions: {lateTargeting: true/false}}) behaviour. The lateTargeting setting (if passed) will override the midi-qol module settings, so you can force enable/disable late targeting for a particular item roll.
  
  0.9.45
  * Added exploding dice option for critical hit dice.
  * Fix for levels module not initialising if no canvas is defined throwing an error.
  * Fix for rpg damage numbers and unlinked tokens.
  * Fix for applying concentration even if spell aborted via preItemRoll on use macro call.
  * Added notification if item use blocked by preItem roll macro.
  * Adding actor onUseMacro edtiing as a separate configuration options.
  * Clean up for levelsvolumetrictemplates. If the modules is enabled, midi defers to it for targeting calculations and ignores the midi walls block settings (levelsvolumetictemplates has it's own setting for walls block).
  
  0.9.44
  * Fix for levels (the module) and template placement heights.
  * Add advantage attribution as part of the dice tooltip. Works with formula as tooltip or not. This is very experimental.
  * Check Vehicle motionless and flat ac when in motion to determing hits. Added flags.midi-qol.inMotion to mark a vehicle in motion.
  * Fix for sw5e starship sdi,sdr,sdv handling.
  * Fix for actor onUse macros with spaces in name/specification
  * Added sample feature Blessed Healer, that uses an actor onUse macro to do the bonus healing. Does not require modifying any spells to have the effect applied.
  
  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "minor")
})
