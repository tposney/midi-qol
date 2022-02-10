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
  0.9.11
  * Fix for TrapWorkflow setter only error.
  * Fix for showing hit result to players without merge card being used.
  * Fix for broken flags.midi-qol.crticial.EVERYTHING., fags.midi-qol.grants.critical.EVERYTHING. These flags omly apply if exactly one target is hit.
  * Fix for stuck advantage/disadvantage when rerolling an item from the chat card.
  * Allow optional.Name.skill.acr etc to trigger only on acrobatics etc skill rolls
  * Allow optional.Name.save.dex etc to trigger only of dex etc saving throws.
  * Allow optional.Name.check.dex etc to trigger only of dex etc ability checks.
  * Support reroll-max and reroll-min in flags.midi-qol.optional.NAME.XXX to reroll with max or min dice,
  * Added flags.midi-qol.max.damage.all.mwak/etc which forces maximum rolls on all dice terms. (grants to follow)
  * Added flags.midi-qol.max/min.ability.check/save/skill.all/abilityid/skillId to maximise check/save/skill rolls.
  * Pass through dialogOptions in rollDamage and rollAttack.
  * Dom't pass a null event to any of the item roll calls.
  * Comcemtration checks now list the effect that has concentration when prompting for removal. Thanks spappz.

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
    
  0.9.08
  * Fix for "skipping consume dialog setting" enabled throwing an error.
  * Fix for overtimeEffects when better rolls enabled.
  * Removed the over eager custom sound effects from every workflow settings tab.

  0.9.07
  * Turns out restricted key bindings did not mean what I thought they did. So the world key mappings setting is temporarily disabled no matter what you set it to and key bindings are per client until further notice.
  * Trying a new fix for sticky keys. I've not seen any adverse effects, but there might be - if so disabe it.

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


  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "minor")
})