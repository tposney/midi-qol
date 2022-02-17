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
  0.9.15
  * Fix for warning when applying effects with no origin.
  * Fix for optional.ac effects being triggered on damage rolls
  * Fix for optional effects not being triggered if other reactions are available.
  * Added chatmessage to show the results of an optional.ac effect (previously you had to deduce the result).
  * Optional effects can now have a count of "reaction". This is very similar to "turn", except that it will apply the convenient effects reaction effect and blocks other reactions being used until the start of the actors next turn. This means you can create optional effects that will count as using your reaction. So improving save throw/attack roll/damage roll/ac bonus can count as a reaction.
  * New auto apply damage setting, auto apply to NPC but not to characters. If selected damage will be applied automatically for NPC targets but not "character" targets. Targets who do not have damage applied will be marked with "*" to the left of the target icon. The tick button will apply damage to those targets normally. The test for PC is that the actor is of type "character", so if you have NPCs of type character they will also be excluded from the damage application.
  * Some improvement to the activation condition evaluation. If an activation condition contains an @field reference it will be evaluated as currently. If not, it will be evaluated in a sandbox that contains the current workflow, target, actor and item data. So
    workflow.targets.some(t=> t.actor.effects.find(i=>i.data.label === "Poisoned")
    works. 
    - If the condition contains an @field reference it will be evaluated as currently. 
    - If not the expression is given a sanitised version of the same data, but only as data so actor/token/item functions will work, eg. actor.update(). The above expression works without modification.
    
0.9.14
* Fix for roll other damage for spells not applying other damage.
* Fix for chat damage buttons not working for "Other" damage.
* Fix for a reported error when canvas disabled - there are probably more.
* Enhancement to optional effects
  * **Breaking** **You must upgrade to DAE 0.9.05**, which is required for optional effects to continue to work. You will get a warning if the correct version of DAE is not installed even if you don't have optional effects. And midi will behave as if DAE is not installed.
  * flags.midi-qol.optional.Name.attack is deprecated in favour of flags.midi-qol.optional.Name.attack.all. Similarly .check, .save, .skill, .damage all need to be changed to check.all, save.all, skill.all and damage.all. If you have the old style effects you will get deprecation errors but they will be treated as .all.
  * Additional support for skill.all/itm/per/prc etc.
  * Additional support for check.all/dex/str etc.
  * Additional support for save.all/dex/str etc.
  * Additional support for attack.all/mwak/rwak/rsak/msak
  * Additional support for damage.all/mwak/rwak/rsak/msak
  * Updated Bardic Inspiration and Lucky for the changes. Upgrade these in game to avoid deprecation errors.
* Put back rollOptions in the arguments passed to onUse macros and added isVersatile.
* Calculate damage detail before and after the call to any Damage Bonus Macros. Damage bonus Macros are now able to adjust the damage roll recorded for the item.

0.9.13
  * Fix for quick inserts causing midi to think control key was left on.
  * Added Item effects take priority when  choosing to apply convenient effects.

0.9.12
  * Fix for typo in reaction processing for reaction manual.
  * Fix for trapworkflows - again.
  * Removed requirement for itemData being passed to damageonlyworflows to trigger bonus features.
  * Fix for challenge mode armor AC.AR/AC/ER not being modifiable from active effects.
  * Fix for macro.execute to make sure actor and token are available inside the macro.
  * Small tweak if you are not auto rolling damage. If the roll is not complete(i.e. you have not rolled damage) you ca re-roll the attack and the chat card will update (i.e. you forgot advantage or some such) and the workflow will continue form then on. The only change is that the chat card will update rather, than displaying another chat card
  
0.9.11
  * Fix for TrapWorkflow setter only error.
  * Fix for showing hit result to players (when it should be hidden) when merge card not being used.
  * Fix for broken flags.midi-qol.crticial.EVERYTHING., fags.midi-qol.grants.critical.EVERYTHING. These flags only apply if exactly one target is hit.
  * Fix for stuck advantage/disadvantage when rerolling an item from the chat card.
  * Allow optional.Name.skill.acr etc to trigger only on acrobatics etc skill rolls
  * Allow optional.Name.save.dex etc to trigger only of dex etc saving throws.
  * Allow optional.Name.check.dex etc to trigger only of dex etc ability checks.
  * Support reroll-max and reroll-min in flags.midi-qol.optional.NAME.XXX to reroll with max or min dice,
  * Added flags.midi-qol.max.damage.all.mwak/etc which forces maximum rolls on all dice terms. (grants to follow)
  * Added flags.midi-qol.max/min.ability.check/save/skill.all/abilityid/skillId to maximise check/save/skill rolls.
  * Pass through dialogOptions in rollDamage and rollAttack.
  * Do't pass a null event to any of the item roll calls.
  * Concentration checks now list the effect that has concentration when prompting for removal. Thanks spappz.

0.9.10
  * Fix for template error in midi-qol settings template.

  0.9.09
  * Make the suspend options rules key actually only available to the GM, not all players.
  * Some GMs don't want their players to know if the baddy saving had advantage or not, so there is a new setting in the saves section of the workflow tab 
    - "Display if save had advantage/disadvantage" (default true).
  * Correct keyboard adv/dis interaction with flags adv/dis.
  * Another tweak to the fix sticky rolls. This one seems to work perfectly with Token Action Hud.
  * First release of Midi Qol Quick Settings (treat as experimental and export your settings before playing to be safe). Idea for this thanks to @MrPrimate
    - Provides a way to set a group of settings in midi to achieve a desired configuration.
    - When these are applied a dialog is displayed showing what setting changes were made.
    - There are 2 "full" configurations "Full Auto" and "All Manual", both of which overwrite the entire configuration settings when activated.
    - There are a small number (seeking feedback on what else would be useful) of sub groups that achieve specific settings, for example GM Auto/Manual rolls will set a group of midi settings in what I think might be a sensible configuration for GM auto/Manual rolls. These can be applied without (hopefully) disturbing other configuration details.
    - I'm actively seeking feedback on whether this is useful and what else should be added. Primarily looking for feedback from users who are not all that comfortable with the midi settings or new to midi.


  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "minor")
})