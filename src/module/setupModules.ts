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
      else console.warn(`module ${name} not active - some features disabled`)
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

0.8.58
* Added flags.midi-qol.DR.final which is damage reduction applied AFTER damage resistance/saves etc. Not RAW but useful.
* Fixed ranged target selection to support meters. Sorry about that, and I live in a metric country - hangs head in shame.
* Some updates to activation conditions.
  * Since it is so common @raceOrType, will return the targets race (if there is one) or the targets type, in lowercase.
  @worflow provides access to the midi-qol workflow that caused the roll.
* Fix for saving throws not being rolled at all

0.8.57
* Fix for incorrect failed saves calculation if there was a to hit roll as well.

0.8.56
* Fix for broken configure settings dialog (oops)

0.8.55
* If concentration is set to inactive, taking damage won't trigger a consitution saving throw. I'm not sure it really makes sense to set concentration inactive, but I don't see that it causes any problems and can be convenient when tweakingg Hit Points.
* A fix for OverTime removeComdition which was not being evaluated correctly.
* Added flags.midi-qol.potentCantrip, if enabled cantrip saves always do 1/2 damage instead of (possibly) no damage.
*  Fixed a reference to deleteOwnedItem for 0.9 compatibility.

* Reworked "Roll Other formula for rwak/mwak" flag to make it more flexible, you can now implement slayer items without any macros.  

Roll Other Damage now has 3 options, "off": never auto roll the other damage, "ifsave": roll the other damage if a save is present (this is the same as the current roll other damage true setting) and "activation": if the activation condition evaluates to true then roll the Other damage even if no save is present. "activation" also requires that the item attunement not be "Attunement Required", i.e. dragon slayer weapons do no extra damage if they are not attuned.

Most creature attacks with extra damage (poisonous bite) equate to the ifSave setting.
Magic items that roll additional damage if a particular condition is true (slayer weapons) require the "activation" setting.

midi will evaluate the activation condition as an expression, providing, the actor, item and target actor's (@target) roll data. For example:

    "@target.details.type.value".includes("dragon")

will only roll if the target has a type of dragon. 
**An empty activation condition** will evaluate as true. If you don't want a specfic weapon to roll Other Damage set Activation Condition false.

You can add the above conditon to the SRD slayer items to make the bonus damage automated based on target type.

If the weapon rolling the attack has ammunition AND the weapon does not have it's own Other Roll defined, the Other roll and saving throw from ammunition will be used. (Arrow of Slaying).

There is a new weapon property "Crit Other Roll" which if set means that the "Other Damage" roll will be rolled as critical if the base roll is critical. Previosly Other Damage would never roll critical damage. You can decide if your Arrow of Slaying can do critical damage or not.

* Added a few new items to the sample compendium,
  * Flaming Sphere, this does pretty much everything the spell is supposed to do. Requires Active Auras and DAE. (Treat it as experimental - as I have not tried it in game yet).
  * Dragon Slayer LongSword.
  * Arrow of Slaying (Dragon). Use it by equipping and setting the bow ammunition to arrow of slaying
### 0.8.54
* Fix for Sorcerer's Apprentice OverTime bug. If you have an overtime effect with a label equal to a convenient effect's name AND you are auto applying convenient effects the effect would be applied repeatedly, 1->2->4->8 etc.
* Added OverTime removeCondition=expression which if true will remove the effect. (renamed condition to applyCondtion - but supports the existing condition label as well).
* Oops - I managed to remove a check in one of the previous updates which means OverTime effects are applied for each user logged in. Fixed.


  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "major")
})