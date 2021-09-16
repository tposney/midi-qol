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
      else console.warn(`module ${name} not active - some features disabled`)
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
### 0.8.53
* Fix for Damage Reduction being applied to healing
* Added condition=expression to midi-qol OverTime, the rest of the overtime effects are only processed if condition evaluates to true. e.g. @attributes.hp.value > 0. You can use any actor fields in the expression, but not dice rolls. Undefined fields (e.g. flags) will evaluate to 0.
 Added sample Regeneration Item that checks for HP > 0 before applying.

### 0.8.52
* Allow flags.midi-qol.OverTime.NAME (name optional) will allow multiple effects to be recorded on the actor (with or without NAME the effects will still be processed - this is just cosmetic).
* Support rollType = check (default is save) in OverTime speicifcation, roll an ability check instead of an ability save.
* Clarification:
  * "healing" and "temphp" work as damage types doing the obvious - healing damage is a way to implment regeneration. 
  * @field replacement on overtime active effects only works if DAE is enabled.
* Fix for longsword of wounding doing an unnecessary saving throw. Fix for Hold Person not being removed on a save.
* Addition of regeneration feature which adds HP at the start of the turn. If the optional rule for incapacited targets is enabled HP will be regenerated only if the actor has at least 1 HP.
* The ability to do a reaction now resets at the start of an actors next turn.
* Rewrite of Damage Reduction. Should now do something sensible when apportioning damage reduction across attacks with multiple damage types. It is not obvious what should happen in all cases so expect some confusion on this one - don't update 2 minutes before game time. The tests I've done suggest it is doing something sensible. I've enqbled a developer console warning message detailing the DR apportionment midi has done.
* Update for sheet buttons on Better NPC sheets, thanks @mejari (gitlab).
* Only display ChangeLogs module warning once per midi-qol update.
* Comcenration: If a spell/item with concentration has an attack/save only apply concentration to the attack/caster if there are hit targets or some failed saves.

### 0.8.51
* Short term patch for ATL equip/unequip
* Fix for midi-qol OverTime boolean flags processing which was broken.
* added to flags.midi-qol.OverRide saveDamage=halfdamage/nodamage/fulldamage - default nodamage
* added to flags.midi-qol.OverRide saveRemove=true/false - remove effect on save - default true.
* midi-qol recognises aura effects and will not apply OverTime effects if the effect is an aura and the aura has ignore self set. See included spirit guardians.
* Added some sample items, Longsword of Wounding, Devil's Glaive, Hold Person (assumes convenient effects), Spirit Guardians (requires Active Aura's)

### 0.8.50
  * Fix for Combat Utility Belt concentration not toggling from status HUD.
  * Added Support for ChangeLogs module.
  * Reinstated bug reporter support.
  * Some efficiency options for latest volumetric template checking and AoE spells.
  * Fix for "isHit" special duration.
  * Fix for adv/dis keys on "tool" rolls.
  * Fix for sw5e and an inadvertent dnd5e reference.
  * Reactions
    * only prepared spells are selected for reaction rolls.
    * only 1 reaction per combat round is allowed. If not in combat you get a reaction each time.
  
  * **New** support for Over Time effects - which only apply to actors in combat.

  flags.midi-qol.OverTime OVERRIDE specification

  where specification is a comma separated list of fields.  
  * turn=start/end (check at the start or end of the actor's turn) The only required field.  
    Saving Throw: the entire active effect will be removed when the saving throw is made (or the effect duration expires)
  * saveAbility=dex/con/etc The actor's ability to use for rolling the saving throw  
  * saveDC=number
  * saveMagic=true/false (default false) The saving throw is treated as a "magic saving throw" for the purposes of magic resistance.
  * damageBeforeSave=true/false, true means the damage will be applied before the save is adjudicated (Sword of Wounding). false means the damage will only apply if the save is made.
    Damage:  
  * damageRoll=<roll expression>, e.g. 3d6  
  * damageType=piercing/bludgeoning etc  
  If the effect is configured to be stackable with a stack count, of say 2, the damage will 3d6 + 3d6.  
  * label=string - displayed when rolling the saving throw  
  
    The most common use for this feature is damage over time effects. However you can include an OverTime effect with just a save can be used to apply any other changes (in the same active effect) until a save is made (Hold Person).
    Examples:  
    **Longsword of Wounding** (Should have stackable set to "each stack increases stack count by 1")  

    flags.midi-qol.OverTime OVERRIDE turn=start,damageBeforeSave=true,label=Wounded,damageRoll=1d4,damageType=necrotic,saveDC=15,saveAbility=con

    **Devil's Glaive** (Infernal Wound) (Should have stackable set to "each stack increases stack count by 1")

    flags.midi-qol.OverTime OVERRIDE turn=end,damageRoll=1d10,type=slashing,saveDC=12,saveAbility=con,label=Infernal Wound

    **Hold Person**

    flags.midi-qol.OverTime OVERRIDE turn=end,saveAbility=wis,saveDC=@attributes.spelldc,saveMagic=true,label=Hold Person
    macro.CE CUSTOM Paralyzed

  [Full Changelog](https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md)`,
  "major")
})