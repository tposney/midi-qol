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

  0.9.43
  * Added Toll the Dead spell to the midi sample items. It does a few tricks to modify the damage roll of the spell according to the HP of the target being less than max.
  * Fix for direct calling of applyTokenDamageMany throwing an error looking for workflow.actor.name.
  * Fix for auto rolling attacks when they shouldn't be.

  0.9.42
  * Sigh - another fix for DamageOnlyWorkflows.
  * Player Damage cards now are displayed as created by the actor that did the damage roll rather than as GM.
  * Player Damage card - only display the hp updated/hp not updated header if there are player damage buttons on the card. 
  * Added flags.midi-qol.semiSuperSaver for items that cause 0/full damage on save/failed save.

  0.9.41
  * Support for Conditional Visibility hidden/invisible conditions for advantage/disadvantage.
  * Support for application of CV effects is via Convenient Effects, so you need convenient effects/DAE to be able to implement the invisiblity spell. Midi-qol sample items updated to support CV and CV convenient effects. It is suggested that you toggle the CV effects to be "status effects".
  * Some tweaks to spiritual weapon to make it a little more friendly to use. You no longer need to define a "Slash" attack on the spiritual weapon actor, all of the damge rolls etc will be configured when the item is summoned.
  * Added Lay on Hands with resource consumption, dialog for how many points to use etc.
  * Added flags.mid-qol.magicResistance.all/dex/str/etc.
  * For macro writers: Added support for workflow.workflowOptions.lateTargeting, autoConsumeResource etc to set per workflow whether to allow late targeting, prompt for resource consumption. These are useful in preItemRoll macros to configure the workflow to behave a certain way. See lay on hands sample item which skips dialog to consume resources.
  * Fix for overtime effects that call a macro when a non-gm advances the combat tracker.
  * **Breaking** All reaction used tracking/prompting, bonus action tracking/prompting bonus actions, attacks of opportunity tracking are now only performed if the actor is in combat.
  * Added actor based onUse macros. Behaves exactly the same as item onUse macros. You can specify a global macro, identified by name, ItemMacro which refers to the workflow item (not useful), or ItemMacro.item name, (probably the most useful) which allows you add specific item macro calls for any item roll.
  * Can be configured from the Actor sheet or via ...
  * Added flags.midi-qol.onUseMacroName CUSTOM macroName,macroPass - which will cause the specified macro (world macro name, ItemMacro, or ItemMacro.macro name) to be called when midi-qol gets to the workflow point specified by macroPass.
  * Fix for damageOnlyWorkflow and BetterRollsWorkflow throwing an error in getTraitMulti.
  
  0.9.40
  * **Breaking** Change to Requires Magical. New options, "off", "non-spell", "all".
    - Previously non-weapons would do magical damage and "requires magical" only applied to weapons.
    - New options are off (same as previous disabled), "non-spell" all items except spells will do non-magical damage unless the per item midi-qol flag (or weapon magic property) is set to true.
    - "all" All items will do non-magical damage unless they have the magical damage property set.
    - I expect that most people will want "requires magical" to be set to non-spell and make sure that non-spells that do magical damage will have the magical property set.
  * Added dr/dv/di for "Magical Damage" and "Non Magical Damage", where magical/non-magical is determined as above. 
  * Fix some errors being thrown when applying effects due to midiProperties and not removing the apply effects buttons in some cases.
  
    0.9.39
  * Some more features for flanking checks. Checked when targeting a token (1 token selected - the attacker and one target targeted) or when attacking.
    - adv only flanking actor will gain advantage and no icon added to display flanking
    - CE Only, flanking actor will gain CE effect "Flanking" on the attacker and you can configure that however you want, adv to attack or whatever.
    - CE + advantage, grants advantage + whatever the CE "Flanking" effect has.
    - CE Flanked. The flanked target gets the CE "Flanked" condition, rather than the attacker getting flanking. Checking to see if a token is flanked is done whenever the token is targeted or an attack is rolled.
    - CE Flanked No Conga. Flanked tokens cannot contribute to flanking other tokens, meaning the flanking conga line can't form.
  * Support for new item flag, Toggle Effect, each use of the item will toggle any associated active effects/convenient effects. One use to turn on, next use turns off. This can be a viable alternative to passive effects where you click to enable and click again to remove. Should also simply a range of effects currently done as macro.execute/macro.itemMacro where the on/off cases just enable/remove effects. For active effects (as opposed to convenient effects) toggling requires DAE 0.10.01.
  * Added a players version of the GM's damage card. Can be configured separately to GM card to show/not show damage done to NPCs, and show/not show damage done to players (with the option to provide apply damage buttons that the players can use themselves - instead of the DM applying damage). If players try to apply damage to a token they don't own an error (non fatal) will be thrown.
    - Showing the damage applied to NPCs will show the damage resistances of the target in the target tool-tip. But since players will see the modified damage done, it's not that much extra information.
  * Added option to "apply item effects" apply the effects but do not display apply effects buttons. In case players have twitchy fingers and hit the apply effects button when they shouldn't.
  
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

  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "minor")
})
