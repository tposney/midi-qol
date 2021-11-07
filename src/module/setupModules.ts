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
  0.8.80
  * "full damage on save" to configure save damage for spells (like no damage on save it is always checked) - full damage on save would be used for spells that always do their damage but have contingent effects, like poisoned on a failed save.
  * Added roll other damage for spells with the same settings as roll other damage for rwak/mwak.
  * Fix for TrapWorkflow not targeting via templates correctly.
  * Corrected tooltip for saving throw details when using better rolls (was always displaying 1d20).
  * Correction to Divine Smite sample item which was incorrectly adding the bonus damage for improved divine smite.
  * Fix for better rolls AoE spells failing if the template was placed before the damage roll completed (i.e. when dice so nice enabled).
  * Fix for midi-qol not picking up the damage types for versatile damage rolls.
  * Tidied up Readme.md

  * Discovered, but have not fixed that if a) using better rolls, b) not using merge card and c) using dice so nice then save results won't be displayed to the chat. So if using better rolls you should enable merge card.

0.8.79
  * fix for overtime effects duplicating convenient effects when the name of the effect being checked matches a convenient effect.
  * fix for TrapWorkflow not displaying the damage type list in the roll flavor.
  * Add new config option to bypass the spell cast dialog, casting at default level and placing templates. Pressing both Advantage+Disadvantage keys will force display of the casting dialog. If you don't have a spell slot of the level of the spell the dialog will be displayed so you can choose another slot. 
  * exported overTimeJSONData to help macros create items on the fly.  
  FYI: if you want an overtime effect that just calls a macro each turn use  
    flags.midi-qol.overTime OVERRIDE turn=start,macro=macro name, label=My Label  
  The macro will be called with the normal onUse macro data for the overTime effect being rolled.

  0.8.78 
  packaging error

  0.8.77
  * Reversed the "For items with no attack, damage or save (e.g. haste and similar) disabling auto roll attack will stop the automatic application of active effects" feature 0.8.75. There has been enough negative feedback to suggest it causes more problems than it solves.
  * Small update to the force apply/don't apply checkbox for convenient effects so that the check box is ONLY displayed if there is a convenient effect that matches the item name.
 
  0.8.76
  * Fix for broken DamageOnlyWorkflow

  0.8.75
  * Added per item flag to override the midi-qol module "Apply Convenient Effects" setting. If the module setting is on, the per item flag will disable applying convenient effects, if the setting is off the per item flag will enable applying convenient effects for the item.  
  This means you can mix and match between convenient effects and DAE/Midi SRD or homebrew. Set the module setting to the most common use case (probably auto apply convenient effects ON) and then disable the convenient effect on those items that you want to use just the effects on the item.
  * Fix for AoE spells not targeting tokens smaller than 1 unit.
  exactly as auto applying effects does.
  * Fix for DamageOnlyWorkflow failing to apply damage.
  * For the case of using the merge card and **not** auto rolling attacks the targeted tokens will be displayed in the chat card prior to the attack roll being done. After the attack roll is made the hit/miss status will replace the target list. This can be useful if you players often fail to target correctly.
  * If using the merge card, not completing the roll and then re-rolling the item the incomplete chat card will be removed from the chat and replaced with the new item roll.
  * For items with no attack, damage or save (e.g. haste and similar) disabling auto roll attack will stop the automatic applicaiton of active effects, but leave the apply effects button enabled. I'm looking for feedback on this one. It is convenient as a way to not auto apply effects when not auto rolling attacks, but might be inconvenient otherwise.
  * Clicking the apply active effects button on the chat card will now complete the roll and expire effects as required, and other house keeping.
  * If a spell caster with **flags.midi-qol.spellSclpting** set, casts an area of effect (template or ranged) Evocation spell, any tokens targeted before casting the spell will always save against the spell and they take no damage from spells that would normally do 1/2 daqmage on a save. So if casting a fireball into an area with allies, target the allies before casting the spell and they will take no damage.
  * Added MidiQOL.socket().updateEffects({actorUuid, updates}).
  * Added another hook, "midi-qol.preambleComplete" which fires after targets are set,  
  
0.8.74
  * OverTime effects now support a rollType="skill", saveAbility=prc/perception etc. Should work with LMRTFY/Monks TB/betterRolls.
  * Overtime effects can now call a macro as part of the overTime actions, macro=Name, where name must be a world macro, the macro is passed the results of rolling the overTime item, which will include damage done, saving throws made etc, as if it were an OnUse macro of the Overtime item roll.
  * Added hide GM 3D dice rolls option to GM settings tab - attack/damage rolls by the GM if using the merge card will not trigger a dice so nice roll. Overrides other show dice settings.
  * Added a display "ghost dice" setting, on the GM tab, which will display dice with "?" on the faces when a GM dice roll would otherwise be hidden. There are almost certainly cases I missed so don't enable just before game time.
  * Added an enhanced damage roll dialog (workflow tab - damage section), that lets you choose which of the damage rolls available on the item to be rolled. Thanks @theripper93 for the code. Works when not fastForwarding damage rolls.
  * Added flags.midi-qol.DR.mwak/rwak/msak/rsak which is Damage Reduction against attacks of the specified type.
  * Fix for walls block targeting getting the wall direction the wrong way round.
  * Fix for sign display problem on damage card when healing.
  * Attempted fix for effects with a duration of 1Reaction not always expiring, issue does not occur in 0.9
  * Fixed an obscure bug when checking concentration and updating HP > hp.max treating the update as damage.
  * **BREAKING** For ranged area of effect spells, with or without a template if range type is set to "special", the caster won't be targeted.
  * new DamageOnlyWorkflow() reutrns a Promise which when awaited has the completed workflow with damage applied fields filled in etc.
  * Preliminary review of 0.9.x compatibility and seems ok (famous last words). 
  * update ja.json - thanks @Brother Sharp

0.8.73
* A little tidying of active defence rolls so that duplicate rolls are not performed.
* Fix for midi-qol.RollComplete firing too early in the workflow, leaving workflow.damageList undefined.
* Added fumbleSaves/criticalSaves: Set<Token> to workflow, and fumbleSaves,criticalSaves,fumbleSaveUuids, criticlSaveUuids to onUse/damageBonus macro arguments.

  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "major")
})