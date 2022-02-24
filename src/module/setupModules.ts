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
0.9.22
* Fix for empty combat causing all attack rolls error.
* Late targeting now shows a panel that displays which tokens have been targeted and has roll/cancel buttons for the player to select. Any item that has a target type of creature (or does not have creature specified as the target type and is not an AoE item) will go through late targeting if enabled. I think this makes late targeting much easier to understand/use.
* Late targeting changed to a per client setting for players and a global setting for the GM, so each player can choose. Defaults to false, so you'll need to tell your players what to set or use a global settings enforcement module like "Force Client Settings" which I use, but there are others.
* Due to ~~complaining~~ popular demand I have reinstated the behaviour that players can always see the saving/ability/skill rolls made by other players. 
* **Heads up** if you are overriding a reaction prompt and want to roll with advantage/disadvantage you need to hold alt/ctrl while clicking yes.
* Another DamageOnlyWorkflow fix.

0.9.21
* Fix for breaking damage only workflows in 0.9.20

0.9.20
* Fix for EnforceReactions "Do Not Check" now really does not check.
* Fix for optional.NAME.damage.heal
* Fix for broken concentration automation if using CUB and convenient effects not installed.
* (Several) Fixes for better rolls and Monks Token Bar interactions when using midi.
* Magic resistance/concentration advantage work with MTB.
* Fix for reactions incorrectly targeting and incorrectly displaying the original hit card.  09.9.19 introduced some bad funkiness which this is supposed to fix.
* Be warned if you turn off enforce reaction checking then you can continue to do reactions to reactions until the end of time or you run out of spell slots. Enabling enforce reaction checking will stop that happening. You can still use items marked as reaction/reaction damage etc, but will be prompted to do so if rolling from the character sheet. 
* If enforce reactions is enabled and you have used your reaction for the round you won't be prompted to choose a reaction when hit/damaged until the reaction marker is cleared.

0.9.19
* **breaking** flags.midi-qol.optional.NAME.check will no logner be triggered for skill checks. To trigger both skills and ability checks add both flags.midi-qol.optional.NAME.check and flags.midi-qol.optional.NAME.skill to the active effect.
  - This prevents some confusing behaviour when trying to combine with other effects.
* Fix for over zealously hiding roll formula from players.
* Fix for always hiding roll details when using betterrolls5e.
* Fix for not hiding saving throws when using betterrolls5e.
* Reaction dialogs will now be removed if the reactee does not respond in time.
* Another fix for players ending their own turn when overtime effects are present (causing the combat tracker to not update).
* When Enforce Reactions is set to "Do Not Check" you can take as many reactions as you want - i.e will get prompted any time you might take a reaction.
* Added reroll-kh, reroll-kl to optional.NAME.xxx effects. Will keep the higher/lower of the rerolled and original roll.
* Ability saves/check/skills optiona.NAME effects will now send a message to chat indicating the roll.
* Ability saves/check/skills optiona.NAME effects dialog will remain open as long as there are valid optional flags available.
* onUse macro (postDamageRoll) supports modifying the workflows damage roll, details in Readme.
* Update Lucky to reflect the new reroll-kh facility.

0.9.18
* Fix for error thrown when checking hits.

0.9.17
* Added additional onUseMacro call "preItemRoll", this is called before the item is rolled, which means before resource/spell slot consumption. If the macro returns false the roll is aborted, before the spell slot/other resources are consumed. This allows you to implement special item usage conditions.
* Added additional Hook "midi-qol.preItemRoll" which allows you to do general preItem checks. If the hook returns false the workflow is aborted.
* Aborting the casting of a concentration spell by closing the spell slot usage dialog no longer removes concentration if it already existed.
* Fix for magic resistance and concentration advantage. Broken with the move to new key mapping. 
  - When using LMRTFY + query the display will not include magic resistance/concentration advantage/disadvantage, however the roll query will correctly set the default option.
  - When using LMRTFY, all sources of advantage/disadvantage will be merged and the advantage/disadvantage LMRTFY will refelect those sources.
  - When using Monk's token bar magic resistance/concentration check advantage won't be set - you'll have to manually hit atl/control as required. Other sources of advantage/disadvantage work.
* Some cleanup on blind rolls and hiding of rolls.
  - If the player makes a blind gm roll, instead of seeing nothing in chat, they will see the Item card, but attack and damage will be "Rolled" and they will not see the results of the roll.
  - If you are not using auto roll attack/damage and do a blind gm roll instead of being unable to complete the roll the attack/damage buttons will be displayed on the chat card, but when you roll the results of the roll will be "Rolled".
  -  I've changed "Really Hide Private Rolls" to a per client setting so each player can decide if they want the "X privately rolled some dice" message or not. As a reminder the "Rally Hide Private Rolls" setting only refers to core dnd5e attack/damage/save/skill rolls. When using the merge card attack/damage roll cards are never displayed.
* Optional rule incapacitated now checks before the item is rolled so that you won't have to answer questions and the discover that you can't do the roll. Similarly reactions won't be prompted for inacapacitated actors.
* Added deflect missiles to sample item compendium - deals with the damage reduction part.

* Some enhancements to reaction processing. All reaction processing settings have moved to the Optional settings tab.
  - Reaction processing is much clearer when convenient effects is installed as there is a visual indicator when a reaction has been used.
  - New optional rule, "Record Oppotunity Attacks". If an actor who is in comabt makes an attack roll when it is not their turn in the combat tracker a reaction marker will be applied (if using CE) and record that they have used their reaction for the round. Settings are:
    - None: don't check this
    - Characters: record this for characters but not NPCs
    - All: record for all actors.
  - New optional rule, "Enforce Reactions", same options as record attacks of opportunity. If enabled, when using an item that would be counted as a reaction (has reaction set in the item details or is an attack of opportunity) the player/GM is queried if they want to continue because they have already used their reaction for the round. This replaces the previous automatic blocking of using reaction items if a reaction had already been taken.

  - Reactions are now tested via either the convenient effects reaction effect or midi's internal reaction tracker, midi automatically applies both. Both are reset at the start of the actors turn or when the CE reaction is removed.
  - If an actor is not in combat attacks won't be recorded as reactions.
  - The test for in combat covers all combats, not just the current combat.
  * To help macro writers creating reacion items, args[0] now contains an additional field, workflowOptions which includes some data from the attack that triggered the reaction.
    - workflowOptions.sourceActorUuid: the uuid of the actor that triggered the reaction, fetch the actor via fromUuid.
    - workflowOptions.sourceItemUuid: the uuid of the item that triggered the reaction, feth the item via fromUuid.
    - workflowOptions.triggerTokenUuid: the uuid of the toekn that triggered the reaction, fetch the token via fromUuid.
    - workflowOptions.damageTotal: the total damage of the attack (if a reaction damaged reaction).
    - workflowOptions.damageDetail: the detail of the damage done which is an arry of {damage: number, type: string}. Where the string is piercing, fire etc.
    - Be aware when writing macros that if the item is rolled from the character sheet these fields will not be populated.
  - **warning** There has been quite a lot of refactoring of the reaction management code so errors could well be present.
  - If you were part way through a combat with reactions used and update midi you might see some odd behaviour until at least one round has been completed.

* Known issue: 
  - Checking reactions for NPC's can be confusing. If you double click to open an NPC sheet, attacks of opportunity rolled from that sheet will ALWAYS refer to the token you double clicked on - even if you select a new token on the canvas. This can be confusing (and one of the reasons that there is a character only option for reaction checking).
  - If you use "Token Action HUD" to do your rolls the selected token will be used.

0.9.16
* fix for bonus dialog debug left in

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


  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "minor")
})