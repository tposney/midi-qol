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

0.8.68
* Fix for betterrolls and OverTime effects not rolling damage correctly/at all.
* Fix for bettereolls saving throws not being detected in chat message saves workflow.
* Overtime effects saveDC now supports expressions rather than just numbers/field lookups. No dice expressions.
* Fix for reaction checks throwing an error if no midi-qol flags are set on the actor.

0.8.65/66/67
* Fixes for template targeting and various module interactions. (Including the elusive bug exposed when token magic fx not installed).

0.8.64
* Added healing and temp helaing to resistance/immunity/vulnerability types so that actor can be immune to healing.

0.8.63
* Fix for OverTime effects - now supports stacking of the same effect (should be regarded as experimental).
* Added the ability to use # instead of , to separate OverTime fields. You have to use one or the other for the whole OverTime field.
* Fix for BonusDamageRoll rolls and dice so nice not being displayed.
* new MidiQOL.completeItemRoll function. Can use with  await MidiQOL.completeItemRoll(ownedItem, options) which will return the worfklow when the entire roll is complete and damage (if any) applied.
* Template targeting clean up. 
  - If using levels you can set the midi-qol optional rule setting to check + levels, which will check template overage including height and levels walls blocking for all attacks. The midi template height check is VERY naive and in addition to 2d targeting simply checks a sphere centered on the template origin and if further away it is considered out of range.
  - If you want proper volumetic templates use the levelsvolumetrictemplates module (patreon) which does a great job of working out how much of the token is in the template and midi uses the result of that calculation. This version supports walls blocking for volumetric templates and uses volumetric templates for the preview targeting.
  - Midi also supports the levels "place next template at this height" setting from the left hand hud and if not set, will cast at the tokens current LoS height.
  - If levels is installed midi will use levels' check collision code, which deals with wall heights.

  
  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "major")
})