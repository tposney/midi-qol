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
  0.8.74
* OverTime effects now support a rollType="skill", saveAbility=prc/perception etc. Should work with LMRTFY/Monks TB/betterRolls.
* Overtime effects can now call a macro as part of the overTime actions, macro=Name, where name must be a world macro, the macro is passed the results of rolling the overTime item, which will include damage done, saving throws made etc, as if it were an OnUse macro of the Overtime item roll.
* Added hide GM 3D dice rolls option to GM settings tab - attack/damage rolls by the GM if using the merge card will not trigger a dice so nice roll. Overrides otheer show dice settings.
* Added a display "ghost dice" setting, on the GM tab, which will display dice with "?" on the faces when a GM dice roll would otherwise be hidden. There are almost certainly cases I missed so don't enable just before game time.
* Added an enhanced damage roll dialog (workflow tab - damage setion), that lets you choose which of the damage rolls available on the item to be rolled. Thanks @theripper93 for the code. Works when not fastForwarding damage rolls.
* Addded flags.midi-qol.DR.mwak/rwak/msak/rsak which is Damage Reduction against attacks of the specified type.
* Fix for walls block targeting getting the wall direction the wrong way round.
* Fix for sign display problem on damage card when healing.
* Attempted fix for effects with a duration of 1Reaction not always expiring, issue does not occur in 0.9
* Fixed an obscure bug when checking concentration and updating HP > hp.max treating the update as damage.
* **BREAKING** For ranged area of effect spells, with or without a template if range type is set to "special", the caster won't be tqargeted.
* new DamageOnlyWorkflow() reutrns a Promise which when awaited has the completed workflow with damage applied fields filled in etc.
* Preliminary review of 0.9.x compatibility and seems ok (famous last words). 
* update ja.json - thanks @Brother Sharp

0.8.73
* A little tidying of active defence rolls so that duplicate rolls are not performed.
* Fix for midi-qol.RollComplete firing too early in the workflow, leaving workflow.damageList undefined.
* Added fumbleSaves/criticalSaves: Set<Token> to workflow, and fumbleSaves,criticalSaves,fumbleSaveUuids, criticlSaveUuids to onUse/damageBonus macro arguments.

0.8.72
* Fix for active defence error in ac defence roll calculation.
* Added support for ItemMacro.UUID in DamageBonusMacros and OnUse macros to refernce item macros for items not in your inventory.

0.8.71
* Fix for active defence causing a console error for non gm clients.

0.8.70  
  * Fix for damage type none and better rolls (would always do 0 damage).
  * Expirmental: Support for the Active Defence variant rule. Enable via optional rules setting Active Defence. Requires LIMRTFY and does **not** work with better rolls. 
  * Active defence has attacked players roll a defence roll instead of the GM rolling an attack roll, which is meant to keep player engagement up. https://media.wizards.com/2015/downloads/dnd/UA5_VariantRules.pdf
    - If active defence is enabled then when the GM attacks instead of rolling an attack roll for the attacker, the defender is prompted to make a defence roll. The DC of the roll is 11 + the attackers bonus and the roll formula is 1d20 + AC - 10, which means the outcome is identical to an attack roll but instead the defender rolls.
    - As released this had identicial behaviour to the standard rolls with the exception that each player effectively has a individual attack roll made against them.
    - Advantage/disadvantage are correctly processed with attacker advantage meaning defender disadvantage.
    - A fumbled defence roll is a critical hit and a critical defence roll is a fumbled attack, midi checks the attacking weapon for the correct critical hit/fumble rolls.
    - Timeout for player interaction is taken form the saving throw player timeout.
    - Display of the defence roll DC on the defenders prompt is taken from the saving throws display DC setting.
    - Issues: There is only one critical result supported, so if multiple targets are attacked they will all have critical damage rolled against them or none. (future might support individual results)
    - There is only 1 advantaage/disadvantage setting applied, that of the first defender (same as current midi-qol). Future enhancement will use per character advantage/disadvantage settings.
    - Only works for mwak/rwak/rsak/msak.

0.8.69
**Changes coming in dnd5e 1.5**:
* dnd5e 1.5 includes per weapon critical threshold and bonus critical damage dice. There is now a configuration setting to enable/disable the midi-qol field on the item sheet. Once dnd5e 1.5 is released, you are stongly encouraged to migrate to the dnd5e setting and disable the midi-qol flag, via Use Midi Critical in the configuration settings. Soon, I will remove the midi-qol field completely. 
* You can run MidiQOL.reportMidiCriticalFlags() from the console to see which actors/tokens have the midi-qol critical setting defined.
* Enhanced dnd5e critical damage effects. You can make most of the changes that midi-qol supports for critical hits via the new game settings (max base dice, double modifiers as well as dice) and per weapon settings (additional dice). You will need to experiment to cofirm the interaction of the dnd5e critical damage flags and the midi-qol settings, however if you use the dnd5e default setting in midi-qol the rolls will not be modified by midi in any way and the dnd5e system will operate.
  
  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "major")
})