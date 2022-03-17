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
  0.9.35
  * Fix for errors when rolling with check flanking enabled and convenient effects not active.
  
  0.9.34
  * Some changes to flanking. 
    - Only applies to mwak/msak.
    - Flanking is only applied if you have a token selected on screen when making the attack The attack will proceed but flanking will not be checked.
    - if convenient effects is enabled midi adds convenient effects flanking indicator. The indicator is updated when you target a single enemy (and have a token selected) or roll an attack. 
    - if you target an enemy and then move your token the flanking indicator might be wrong - it will be corrected when you roll or re target - this is an efficiency consideration so that flanking is not computed too often.
    - Allies with the convenient effects effect "Incapacitated" are ignored for flanking as well as those with 0 hp.
    - Flanking does not work with hex grids.
  * Fix for flanking check enabled and some edge cases throwing an error if no target selected.
  * **Breaking** Midi critical damage settings now always include per item critical extra dice.
  * Removed extra call to Hooks.call("preDamageRoll) in workflow.ts. Thanks @Elwin#1410
  * Fix for max damage causing critical rolls to double the number of dice it should.
  * When using a reaction from a magic item provided spell/feature the user is prompted with the use charges dialog.

  0.9.33
  * Fix for proliferating critical hits if optional rules disabled. Live and learn, turns out (false > -1) is true.

  0.9.32
  * (Hopefully) better fix for item rolls being blocked if custom sounds turned off. (bug introduced in 0.9.30)
  * New optional rule, "Critical Roll Margin". You can specify a numeric margin such that if the attack roll >= target AC + margin the roll is a critical hit, otherwise not (even if the roll is a 20). Apparently this variant is in use in some countries. The rule is only applied if there is a single target, since midi can only track one critical status for the roll. Setting the margin to -1 (the default) disables the check. Works with better rolls, but the dice total will not be highlighted in green.

  0.9.31
  * Fix for item rolls being blocked if custom sounds turned off. (bug introduced in 0.9.30)

  0.9.30
  * Tweak to custom sounds so that if dice so nice is enabled attack/damage sounds are played before the roll rather than after. This should mean the same configuration will work with dice so nice or not.
  * With the introduction of the per item flag (also roll other - which means roll other damage if the activation condition is met/empty), it is suggested that you use that route to enable/disable rolling of the other damage, especially for spells, rather than the global setting.
  * Updated slayer's prey sample item so that it works for v9
  * If you are not hiding roll details when an attack is made and the result is influenced by flags.grants effects the modified attack roll will be displayed on the hit card.
  * Fix for "turn" optional effects that were not being marked as used and hence would be prompted each roll.
  * Fix for asyncHooksCall missing awaiting the result. Thanks @Elwin#1410
  * New special duration ZeroHP, the effect will expire if the actor goes to 0 hp. Requires DAE 0.9.11
  * **Breaking** Slight change to reaction/bonus action checking. New option display which will cause the reaction/bonus action icon to be added when an item that is used. Don't Check now means don't display anything for reactions/bonus actions, whereas it used to mean display but don't check.
  * If you use a weapon with ammunition and the ammunition has active effects they will be applied to the target in addition to those of the ranged weapon. Useful for special ammunition like arrows of wounding etc. Any activation condition on the ammunition will be checked before applying the effect.
  * New misc tab setting, Alternate Rolls. At this stage only a boolean which if set moves the roll formula to the roll tooltip, to give a less cluttered look.
  * First implementation of flanking (optional rule - in optional settings).  
    - If any line drawn between the centre of any square covered by the attacking token and the centre of any ally's covered squares passes through the top and bottom, or left ad right of the target the attacker will have advantage. 
    - In the case that both the attacker and ally are of size 1, this ends up meaning that a line between the centres of the two tokens passes through the top and bottom, or left and right, of the target, which is the common version of the rule statement.
    - An ally is any token that is of the opposite disposition of the target (friendly/neutral/enemy - my enemy's enemy is my ally) is not incapacitated (meaning hp === 0). 
    - The attacker must be within 5 feet of the target.
    - Seems to work with the corner cases.
    - There are probably special cases I've missed so errors are possible.

  0.9.29
  * Added roll other damage for per item setting to roll other damage. Works with activation conditions.
  * Separated Bonus Action usage and Reaction usage checking, which can be configured separately.
  * **VERY BREAKING** 
  **Custom Sounds Complete rewrite as of v0.9.29**
  Existing custom sounds will be disabled.
    * Custom sounds work best with the merge card.
    * Custom sounds now apply to both merge and non-merge cards. However non-merge cards will always roll the dice sound in addition to any midi custom sounds. I am unaware of any way to disable the dice sounds for standard dnd5e cards.
    * Custom sounds Will play with dice so nice active. It is suggested that you set the dice so nice sound volume to 0, so that midi can control the sounds made when a weapon is rolled.
    * If using Dice so nice key the main sound effect on the item roll (specify the weapon subtype) and have no sound for the rwak/mwak, this way the sound will play while the dice are rolling. If not using dice so nice key on rwak/mwak/rsak/msak and the sound will play while whole the card is displaying.
    * The General Format is to specify a sound for
      - Item Class (any/weapon/spell/etc)
      - Item Subtype (all, Martial Melee, Evocation etc)
      - Action, roll the item, attack, mwak, roll damage, damage of specific types
      - Playlist to get the sound from, you can use any playlist you have.
      - Name of the sound to use, drawn from the specified playlist 
      - You can now use as many playlists as you wish). 
      - Support for special sound names, "none" (no sound) and "random", pick a sound randomly from the playlist.
      
    * In the case that more than one setting might apply midi always chooses the more specific first. So:
        - Weapon/Martial Melee/mwak will be used in preference to 
        - Weapon/all/mwak, which will be used in preference to  
        - Any/all/mwak
  
    **Actions**
      * Item Roll is checked when the item is first rolled to chat.
      * attack/rwak/mwak/msak/rsak/hit/miss/critical/fumble etc are checked after the attack roll is complete and hits have been checked
      * Damage/damage:type are checked after the damage roll is complete.
  
    * Custom sounds be configured from the Configure Midi Sounds panel immediately below the midi workflow panel on module config settings. Custom sounds are only active if the Enable Custom Sounds is checked on the misc tab of workflow settings.
    * You can create very complex setups, but don't need to.
    * To get your toes wet, enable custom sounds on the workflow panel - misc tab (where it has always been).
    * Open the configure midi custom sounds panel.
      - From the quick settings tab, choose create sample playlist, which will create a playlist with a few sounds already configured
      - Also on the quick settings tab choose Basic Settings, which will setup a simple configuration of custom sounds. This is roughly equivalent to what can be configured with the existing midi-qol custom sounds, but has a few more options and can be extended. (Basic settings are configured to work best with merge cards and no dice so nice).

  0.9.28
  * Fix for overtime effects broken in 0.9.27.
  * Fix for Longsword of Life Stealing in midi sample items compendium

  0.9.27
  * If not auto rolling damage and using the merge card midi will display a roll count for the second and subsequent attack rolls on the same item card. Should help stop sneaky players mashing roll until it hits.
  * Optional setting to display how much an attack hit or missed by.
  * Fix for non spells with measured templates being tagged for concentration.
  * Fix for race condition when marking wounded and applying effects at the same time.
  * Tracking of bonus actions as well as reaction usage. Enabling enforce reactions also enabled checking bonus action usage.
  * **Experimental** support for getting reaction items/features from magic items. Enable from the reaction settings on the optional tab.
  * **For macro writers** Support for async Hook functions. For any of the midi-qol.XXXXX hooks, you can pass an async function and midi-qol will await the function call.
  * **For macro writers** When midi expires an effect as an options[expriy-reason] is set to a string "midi-qol:reason", describing the reason which you can process as you wish.
  * **Potentially breaking** Implemented fulldam/halfdam/nodam/critOther for weapons/spells/features rather than just weapons and this change replaces the weapon properties that were previously created by midi-qol.
    - Weapons with the old properties set should continue to work and the first time you edit the item it will auto migrate to the new data scheme (but of course there might be bugs).
    - Setting fulldam etc check box for a spell/feature/weapon will take precedence over the text description search. If none are set the text description will still take place.
    - Added concentration property for any weapon/feature/spell (allows you to specify that concentration should be set when rolling the item via a check box) This is in addition to the now deprecated activation condition === Concentration.

  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "minor")
})
