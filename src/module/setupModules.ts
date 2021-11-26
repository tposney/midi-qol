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
  0.8.87
  * Fix for (I think) longstanding bug that if monster saving rolls would be displayed to plaers - even if midi setting was to hide them.
  * Fix to Spirit Guardians to not create multiple sequencer/Automated animations effects. Midi smaple items are in folders if compendium folders is enabled.
  * Correction DF Quality of Life is the template targeting preview module (apologies to @flamewave000 for the wrong attribution).
  * Change so that if player reacitons are enabled and no logged in player with ownership of the actor exists, the GM will be prompted to do the player's reaction rolls.
  * Fixed a problem where midi was trying to get unconnected players to roll saves. It simply would not take no for an answer.
  * Fix for divine smite in v9.
  
  * Experimental - first cut integration with ddb-game-logs. **You need to be a patreon of ddb-game-log for this to work**. Requires a yet to be released version of ddb-game-log.
  - Midi will accept attack/damage/saving throw rolls from ddb-game-log. If you roll an attack or roll damage for a feature with no attack, midi will create a workflow and check hits/saves and apply damage using the ddb-game-log rolls.
  - The link is one way, from dnd beyond to midi and there is no feedback from midi-qol to update dnd-beyond, like changing hit points or active effects.
  - Since the character settings are taken from dnd beyond NONE of the midi-qol advantage/disadvantage settings will apply to the roll. Similarly with damage rolls none of the foundry local bonuses etc will apply. Simple summary, everything relating to the dnd beyond generated rolls (attack, damage and saves) is taken from dnd beyond.
  - If you want to use dnd beyond saving throws make sure the auto roll save setting is "Chat Message".
  - Hits/saves/Damage application will take into account the foundry's copy of values for AC, etc.
  - If set, midi will add damage buttons to ddb-game-log damage rolls which function exactly as for non game-log rolls.
  * Fix for setting not sticking for ddb-game-log integration.
  
  0.8.86
  Change to coloured borders. Now messages are coloured according to the user that created it.
  * Made chat card border colouring a bit more aggressive - it should now colour most everything.
  * New template targeting setting - "Use DF QOL". DfReds Qol has support for RAW template targeting, so by using this setting you can finally get templates that work "correctly" which should resolve long standing frustrations with midi-qol's template targeting. This also resolves an issue, that if DF QoL template targeting is enabled it would "fight" with midi and the winner would be essentially random.
  * Various fixes for roll other damage spell settings.
  * Added an option to create a chat message when a player is prompted for a reaction. After the reaction is resolved the chat message is removed.
  * Midi/dae/times-up will now remove Sequencer permanent effects created by Automated Animation when the initiating effect is removed. The midi sample spirit guardians is an example.
  * Automated Animations permanent effects, if created via a midi-qol effect will be auto removed on spell expiration. Requires a DAE and times-up update as well.
  * Note - includes code for pre-release ddb-gamelog support which is not yet operational.
  * MidiQOL.selectTargetsForTemplate now returns an array of targeted tokens.
  
  * Fix for drop down lists not populating in 0.9 dev 2. Midi seems to work in 9 dev 2.
  
  0.8.85
  * Allow items to be set to not provoke a reaction (set item.data.flags.midi-qol.noProvokeReaction to true). No UI for this yet.
  * Fix for silvered weapons check causing problems if there is no item in the workflow.
  * Added resistance/immunity/vulnerability to non-adamantine weapons. Added DR against adamantine weapons.
  * Added new overTime option, killAnim: boolean, to force automated animations not to fire for the overtime effect (niche I know, but I needed it for Spirit Guardian).
  * New improved Spirit Guardian sampel item, requires active auras to work and assumes there is a combat active.
  Supports the following:
    - If a token enters the Spirit Guardian's range on their turn they will save && take damage.
    - At the start of an affected token's turn they will save && take damage.
    - If the token moves out of range of the effect they won't take damage anymore.
    - All effects removed on expiry/loss of concentration.
    - Spell scaling is supported automatically.
    - If using automated animations, only the initial cast will spawn the automated animation, whcih is VERY pretty by the way.
    - Works with better rolls.
  Not Supported: picking tokens to be exlcuded, the spell will only target enemies.

  0.8.84
  * Fix for triggering reactions (Hellish Rebuke) when someone heals you.
  * Fix for duplicated lines in en.json.
  0.8.83
  * Fix for better rolls activation condition processing.
  * Added non magical silver physical damage resistance/immunity/vulnerability, which is bypassed by magical and silvered weapons.
  * Fix for removing cocnentration effects when one of the target tokens has been removed from the scene.
  * Monk's token bar saves now displays the DC based on the midi midi show DC setting.
  * Fix for bug introduced in 0.8.81 with critical damage configuration - if you have Default DND5e as you setting, midi would incorrectly interpret that as no damage bonus.
  * Fix for 1Reaction effects not expiring on a missed attack.
  * Fix for localisation problem if using midi's concentration effect (i.e. no CUB/Convenient Effects).
  * Addition to reactions. As well as triggering on attacks, reactions can trigger on damage application. Midi uses the activation condition of the item to work out which one is applicable.  
  Most feats/spells have a blank activation conditon and midi will treat those as attack triggered reactions, or if the localised string attacked is in the activation condition.  
  
  Hellish Rebuke, for example, has "Which you take in response to being **damaged** by a creature within 60 feet of you that you can see", and midi will tirgger those with the word damage in the activation conditon when a character is damage. (Hellish rebuke is a special one since it triggers only if you took damage).
  
  * Added new item field "Active Effect Condtion". If set the activation condition must evaluate to true for the active effect to be applied. The saving throw if any must also be failed for the effect to be applied. For example, the included mace of disruption does additional damage to undead and if an undead fails it's save it is frightened. By setting the Activation Condition and Active Effect Activation Condition to checked only undead will suffer extra damage and be set frightened if they fail the save.
  
  * Implemented Optional Rule: Challenge Mode Armor. See the readme.md for more information. My testing indicates that this is extremly unfavourable to higher level tank characters, dramatically increasing the amount of damage they take. I have implemented a modified version that, 1) scales the damage from an EC hit and 2) Armor provides damage reduction equal to the AR for all hits.
  
  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "major")
})