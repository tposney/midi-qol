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
  return installedModules.get("dice-so-nice") && (game.dice3d?.config?.enabled || game.dice3d.isEnabled());
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
  0.9.06
  * Fix for "midi - qol" text error and others.
  * Added configurable suspend optional rules key (only available to GM). If pressed when rolling an item/attack/damage no optional rules will be applied to the roll(s).
  * Note: if you want to combine keyboard keys with modifier keys (e.g. O+Ctrl for critical other damage roll perhaps) you need to press the O before the modifer key, otherwise it will be treated as control-O which does not match any keybard configurations

  0.9.05
  * Added ability to do game.settings.set("midi-qol", "splashWarnings", false)
    from the console or a macro, to permanently disable midi's notification warnings about missing modules on load. 
  * Notification warnings on load are only shown to the GM.
  * Added config setting Fix Sticky Keys. If enabled midi attempts to fix the cases where adv/dis get stuck "on". Tested specifically with Token Action Hud. If it causes issues you can disable it.
  * Updated ja.json - thanks @Brother Sharp
  * Slight enhancement to the applicaiton of convenient effects when using items.
    - There are 3 options in the workflow setting, Don't Apply, CE take priority, both CE and Item Effects.
    - The first and 3rd settings are pretty obvious. The second option means apply the CE effect if it exists and otherwise apply the item effecs.
    - The apply CE/don't apply CE checkboxes on the item card have slightly different semantics.
      - Don't Apply checked means the workflow setting becomes "Don't Apply".
      - Apply CE Checked means, Don't Apply => CE has priority, CE has priority and Apply both are unchanged.
  **0.9.04**
  * Fix for broken better rolls automation being brokwn.
  - Midi keyboard shortcuts do not apply for attack/damage when better rolls is active.

  **0.9.03**
  * Fixed a number of edge cases when processing alt/ctl/shift that were causing problems.
  * As a side effec token action hud seems to be working agagin.
  * Fixed a problem with flags.midi-qol.grants.critical.all/mwak etc.
  * Fix for bug introduced in 0.9.02 for saving throws in overtime effects.
  * Fix for bug introduced in 0.9.02 when rolling versatile damage. 
  * To roll versatile attacks with advantage/disadvantage press V then alt/ctrl. alt/ctrl then V will not work, nor will shift+Ctrl or Shit+Alt
  * Fix for bardic inspiration valor (and any optional effect that can increase AC).

  **0.9.02**
  * Added the promised flags.midi-qol.DR.mwak etc to the auto complete list.
  * flags.midi-qol.DR.all now supports negative values to deal extra damage when being attacked.
  * midi-qol will now call "midi-qol.XXXX.itemUuid" as well as "midi-qol.XXXX", so you can have multiple rolls in flight and wait on the item specific Hook to be called.
  * Target tooltip on midi-damage card now includes DR settings as well as dr/di/dv.
  * Added option to have spell saves auto fail for friendly targets. If the text "auto fail friendly" or the localised equivalent appears in the spell description then tokens with the same disposition as the caster will auto fail their save. Useful for some spell effects where you don't want to save.
  * **VERY BREAKING** If you used speed keys. Midi-qol now uses core foundry key mapping instead of speed key settings - access from "Configure Controls".
    - This means you will have to redo your speed key mappings (sorry about that) in Configure Controls. 
    - By default these settings are **per user** so have to be set up for each player. There is a midi setting World Key Mappings (misc tab) which, if checked, will force all clients to use the GM settings (changes to World Key Mappings requires a reload).
    - This change has required quite a lot of internal changes and it almost certain there are cases I have not tested - so don't upgrade 5 minutes before game time. v0.9.01 is available for re-installation.
    - Out of the box the configurations are (almost) the default midi-qol setttings, so if you didn't use speed keys you should not notice much difference.
    - There is a new accelerator toggle roll ("T" by defualt) which when held when clicking will toggle  auto roll/fast forward for both the initial click and subsequent chat card button presses. This is an extension of the previous adv+ disadv functionality which is not created by default. You can configure the toggle key to use ctrl/alt if you wish.
    - The existing Caps-Lock functions can't be supported in core key mappings so use "T" instead.
    - Critical now supports "C" for critical in addition to the default Control Key
    - versatile damgae is V+click as well as Shift+click.
    * You can choose to roll "Other Damage" instead of normal or versatile damage via the "O" key when pressinf the item icon. IF using this and you have roll other damage on rwak/mwak set, make sure to roll other damage to "Activation condition" and set the activation conition to false in the item. So that rolling the item won't auto roll the "Other" Damage in addition to the normal damage.
    - Foundry core supports differentiating between left and right ctrl/shift/alt keys, so you have more options to configure things as you wish.

  **0.9.01**
  * Fix for it.json having trailing spaces.
  * Fix for inadvertent breaking of flags.dnd5e.initiativeDisadv 
  * Fix for marking unconscious when dfreds installed. Requires v2.1.1 of Convenient effects.
  * Use dnd5e bleeding effect for wounded is convenient effects not installed.
  * Added new option "log call timing" which will send some elapsed time log messages to the console.log.
  * Support for convenient effects "reaction". If convenient effects is enabled midi will apply the reaction effect when a reaction item is used (either manually or via reaction dialog), remove the reaction marker at the start of the the actors turn and not prompt/allow reaction items to be used if a reaction has already been taken this turn.
  * Added flags.midi-qol.grants.attack.bonus.all/rwak etc which adds a simple numeric bonus to attacker's rolls when checking hits against that target. The chat card does not refelct the bonus.
    e.g. flags.mid-qol.grants.attack.bonus.all OVERRIDE 5 means that all attacks against the actor will get +5 when adjudicating hits. A natural 1 will still miss.
  * Added flags.midi-qol.grants.attack.success.all/rwak etc which means attacks against the actor will always succeed
  * New option for optional effects. If the effect has flags.midi-qol.optional.NAME.count OVERRIDE turn (instead of a number or @field), then the optional effect will be presented once per round (if in combat). Once triggered the actor must be in combat for the count to get reset at the start of their turn, or you can update flags.midi-qol.optional.NAME.used to false. If there is no active combat the effect will be presented each time it might be used.
    - The idea is that some optional rules allow you to do bonus damage once per round and now these can be modelled.
    - Also the effect wont be automatically deleted when used like the other count options. Use a timeout or special expiry to remove the effect.
  * **BREAKING** removed midi-qol critical threshold, since it is now supported in core.
  * **BREAKING** midi-qol now requires dnd5e 1.5.0 or later
  
  **0.8.105**
  * Mark player owned tokens as unsconcious when hp reaches 0, rather than defeated.
  * Overtime effects use the globalThis.EffectCounter count if present for rolling damage.

  **0.8.104**
  * Fix for items that do no damage but apply effects when using better rolls and not auto rolling damage (i.e. add chat damage button is checked).
  * Fix for Shillelagh item macro.
  * Add automatic marking of wounded/unconscious targets, controlled by config settings. Wounded requires a convenient effect whose name is the localised string "Wounded" (midi-qol.Wounded) to be defined (you need to do this). These are very simplistic, for any complex token triggers you should use Combat Utility Belt and Triggler which are excellent. 
  * Added Action Type Reaction Manual which won't trigger a reaction dialog. So there are now 3 reaction types you can set, reaction which triggers when hit, reaction damage which triggers when you take damage and reaction manual which does not trigger the reaction dialog.
  * Fix for inadvertent breaking of flags.midi-qol.initiativeDisadv 
  * Fix for hiding hit/save chat card when not using merge card.
  * Fix for a bug when applying overtime effects when players end their turn, if the next actor in the combat tracker has an overtime effect to apply.
  * Additions to midi-qol.completeItemRoll options:
    - checkGMStatus: boolean, If true non-gm clients will hand the roll to a gm client.
    - options.targetUuids, if present the roll will target the passed list of token uuids (token.document.uuid).
  * Fix for game.data.version deprecation warning.
  * Fix for some edge cases in Damage Reduction processing.

  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "minor")
})