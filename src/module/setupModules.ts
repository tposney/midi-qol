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

  0.9.26
  * Added missing flags.midi-qol.optional.NAME.save.dex/wis etc to auto complete fields 
  * Added "every" option to count fields, means you can use the effect every time it matches without it ever expiring.
  * Fix for rolling tools with late targeting enabled.
  * Concentration will be applied to the user of an item (even if all targets saved) if the item places a measured template and has non-instantaneous duration - wall of fire/thorns etc.
  * Fix for the removal on any effect causing the removal of concentration.
  * Overtime effects that roll damage no longer wait for the damage roll button to be pressed, instead they damage is auto rolled and fast forwarded.
  * Support for GMs to apply effects (via the apply effects button) for other players. Effects are applied to whoever the GM has targeted.
  * For macro writers: Additional workflow processing options to itemRoll(options)/completeItemRoll(item, options: {...., workflowOptions}).
  You can set 
    lateTargeting: boolean to force enable/disable late targeting for the items workflow
    autoRollAttack: boolean force enable/disable auto rolling of the attack,
    autoFastAttack: boolean force enable/disable fast forwarding of the attack
    autoRollDamage: string (always, onHit, none)
    autoFastDamage: boolean force enable/disable fast Forward of the damage roll.
    Leaving these undefined means that the configured workflow options from the midi-qol configuration panel will apply.

0.9.25
  * Fix for user XXX lacks permission to delete active effect on token introduced in 0.9.23 for concentration - same symptom different cause.

0.9.24
  * Fix for user XXX lacks permission to delete active effect on token introduced in 0.9.23 for concentration

0.9.23
* Fix for double dice so nice dice rolling for damage bonus macro dice.
* Fix for late targeting causing concentration save to late target.
* A tweak to using monk's token bar for saving throws. Player rolls always are always visible to other players. If there are GM rolls and the player's are not allowed to see the rolls, the GM rolls will be split to a separate card and displayed only to the GM. This resolves the issue of NPC names being shown to players when doing saving throws with Monk's Token Bar.
* Fix for a maybe edge case where concentration removal was not working (concentration was removed but stayed on the actor).
* Tidy up so that late targeting does not apply when doing reactions, concentration saving throws or overtime effects.
* Late targeting window now appears next to the chat log so that you are well position to hit the damage button if required.
* Reactions now prompt for spell level when casting reaction spells and the reaction executes on the correct player client.
* Damage bonus macro damage is now added to base weapon damage by type before checking resistance/immunity (with a minimum of 0), so if you have 2 lots of piercing one that does 3 points and a bonus damage macro providing 5 the total damage of 8 will be applied (as it was before). If you have damage resistance to piercing the damage applied will be 4 points, instead of 3 points as it would have been when the damage resistance was calculated on each slashing damage and then added together. Should you wish to implement (who knows why) damage bonus macros that reduce damage, i.e. you do 1d4 less piercing damage because your're eyesight is bad, the damage bonus macro can return "-1d4[piercing]"


  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "minor")
})
