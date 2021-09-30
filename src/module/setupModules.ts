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
              "monks-tokenbar": "0.0",
              "socketlib": "0.0",
              "advanced-macros": "1.0",
              "dnd5e-helpers":  "3.0.0",
              "dfreds-convenient-effects": "1.8.0",
              "levels": "1.7.0",
              "levelsvolumetrictemplates": "0.0.0",
              "lib-changelogs": "0.0.0"
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
  return installedModules.get("dice-so-nice") && game.dice3d?.isEnabled();
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
  0.8.62
  * Fix for ranged AOE spells using meters instead of feet.
  * Fix for error thrown when expiring effects after a fumbled roll.
  * Fix for overtime effects with no save expiring after one round.
  * Fix for overtime effects being unable to roll damage if auto rolling damage is disabled.
  * Added LMRTFY+Query mode for GM saving throws. And a reminder, if using monks token bar rolls, you cannot set advantage/disadvantage for concentration checks, you have to do it manually.
  * Added per player RollStats in addition to existing stats. Player stats cover all actors they might control and have lifetime/session/item stats.
  * Switched LMRTFY saving throws to use the actor uuid instead of id, so that for unlinked tokens the synthetic actor data is used instead of the base actor. (Make sure your LMRTFY is up to date).
  * Be a bit more aggressive about adding concentration, for spells like wall of flame, stinking cloud which are AoE but might not target anyone when cast.
  * Clarification: If a spell has concentration it will only be applied AFTER the roll is complete, which includes rolling damage if the item has damage, e.g. SRD Hunter's Mark.
  * Updated Branding Smite to remove concentration when attack is made (as well as actor effect).
  * Added MidiQOL.getConcentrationEffect(actor) which will return the concenttation active effect for the curent passed actor, suitable for MidiQOL.getConcenttrationEffect(actor)?.delete() to remove concentration from an actor.

  0.8.61
  * Various/significant concentration fixes if you have combat-utility-belt AND/OR convenient effects installed or none. Symptoms included, duplicated concentration saves required, not removing concentration, generally breaking.
  * Optional rule for saving throws auto save/fail on critical roll/fumble
  * Updated Flaming sphere. After a lot of testing, removing the item on expriy/removal of concentration was causing many bugs, which were not present in 0.9. Until then the summoned shere will not be auto deleted, everything else should work.

  0.8.60
  * Fixed acid arrow (which had the wrong rounds duration 1 instead of 2).
  * Fix for healing not working - oops.

  Clarification, overtime effects share some features with other active effects.  
  - if an overtime effect is applied as a passive effect (think regenerate) then using @fields will evaluate in the scope of the actor that has the effect and be evaluated each turn, no processing is done when creating the effect on the actor.  
  - if the overtime effects is applied as a non-transfer effect (i.e. the result of a failed save or an attack that hits) @fields will evaluate in the scope of the caster exactly once when the effect is applied to the target, and ##fields will apply in the scope of the target each time the effect is tested.  
  
  Example: a character with 50 HP with a spell, cast at level 3,  has a applied effect attacks a beast with 20 hp, then a removeCondition (for example) of 
  @attributes.hp.value < 30 && @spellLevel > 2 will evaluate to 50 < 20 && 3 > 2 before the effect is created on the target actor and will always be false.  
  
  Of special usefulness is an expression like damageRoll=(@spellLevel)d4, which is evalated when applying the effect and returns an expression like (3)d4 if the spell was cast at level 3.  
  \\#\\#attributes.hp.value < 30 will evaluate to @attributes.hp.value < 30 and will be evaluated each round until the targets hp are less than 30.  
  
  The ## versus @ behaviour is standard for DAE/Midi active effects.  

 0.8.59
* improve condition immunity behaviour. If you try to apply a condition whose statusId (usually name) matches a condition immunity application will be blocked. (For unlinked tokens this is not possible so the condtion is marked as disabled).  
* Fix for not applying empty effects (for tracking expiry).  
Sample Items:  
Added Longsword of sharpness.  
Added Acid Arrow.  

  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "major")
})