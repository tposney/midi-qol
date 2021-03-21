0.3.93
* Added check for concentration wehn using a non-spell that requires concentration.
* Fix for better rolls saving throws not being processed as saves.
* Added addtional d20 mode to ONLY show the d20 attack roll, all other roll details are hidden.
0.3.92
* Support for concentration for non-spells. Put "Concentration" in the activation conditions field and using the item will cause concentration to be added to the caster and any active effects applied by the item will be linked to concentration.  
0.3.91
* Fix for onUseMacros being called twice.
* Export of showItemCard and showItemInfo methods for macro writers.
0.3.90
* Fix for special durations not working
0.3.89
* New optional rule to only choose the best Damage Reduction instead of adding all damage reductions together when applying damage.
* Optional rules work with better rolls. There is a "problem" that if a rule blocks a roll you will get a libWrapper warning. This has no impact on the result, but can be annoying.
* Expanded special durations  to includes skill checks and ability tests. All of these trigger when the roll is made, whether you are attacked or not. Save Success and Save Failure only trigger is you are attacked and need to make a save as a consequnce of that.
* Fix for isAttacked special duration not triggering on missed attacks.
* Call midi-qol.DamageRollComplete as soon as the damage roll has been done, rather than waiting for saves.
* Added option for onUseMacros to return {haltEffectsAppication: true} to prevent active effects being applied.
* Added templateId to arguments passed to onUse/DamageBonus macros in case they want to do something with it.
* updated ja.json - thanks @Brother Sharp
0.3.88
Fixed a bug that failed to roll an item if you are not displaying the chat card, not using the merge card but were attempting to fast forward rolls.  
0.3.87
Fix for failing 0 targets when creature target specified and require targets not set.  
Added DamageDealt special duration, expires when the actor does damage.  
Fix for midi & better rolls 1.4.0 not displaying critical hits correctly, damage dealt was correct.  
Fix for mid & better rolls 1.4.0 not displaying saving throw results on merge card.  
0.3.86
support for better rolls 1.4. If you are using better rolls and have updated to 1.4 you need to upgrade midi-qol  
0.3.85  
updated en.json  
0.3.84  
* Fix for error in tidy sheet version checking.  
* Fix for tempHp and spell scaling
0.3.83
* updated sneak attack item
* Fix for ability saves/checks/skill use advantage settings.
* Updated midi-qol to use libWrapper shim. Using libWrapper is strongly recommended and is the configuration that is tested.
* fix for gm sees all messages bug.
* Fix for passing an event to item.roll() being ignored.
* Fix for for hits display being always shown when not using the merge card.
* Removed the special case better rolls flag. Item Cards and magic items will both work with midi + better rolls with no special flags after better rolls 1.4. Until then magic items will just roll to the chat.

[BREAKING] Saving throw multipliers has been reviewed and **some changes were made**.
* TL;DR if you don't know about save multipliers, just ignore this section, the default works like it used to and is pretty much what you'd expect.
  * There is a new config setting, default save multipler (defaults to 0.5). If there are no special overrides then a saving throw will do damage * defaultSaveMultiplier damage. When set to 0.5 saving will do 1/2 dmaage, like most cases for dnd.
  * There are a number of ways to overide the default multiplier.
  * If the item description includes the text "no damage on save" (or the localized equivalent) then a save will do no damage.
  * If the setting "search spell description" is set, items with the text "half as much damage" (or the localized equivalent) will do 1/2 damage on a save ignoring the defalt multiplier. If the text is not found the save will use the defaultSaveMultiplier.
  * For weapons (only) there are weapon properties for 1/2, full or no damage saves. These properties override any other settings. If not present the save multiplier will be worked out as above. 
  * For weapons (only) the save multiplier appplies to the whole damage roll **UNLESS**...
    * You have enabled "Roll other damage on mwak/rwak" (which is intended sepcifically to support attacks that have base damage + extra damage with a save). If the weapon has a save specified **AND** the weapon has an Other Damage formula, the saving throw multiplier applies to the Other damage and the base damage is applied as full damage.
    * Because of the way the SRD monsters have been setup, (i.e. extra damage as versatile damage and the the versatile property not set) the versatile formula will be treated as Other Damage if there is no Other Damage formula and the weapon property "versatile" is not set. 
    * For BetterRolls you have to enter the damage into the Other field and enable roll Other in the better rolls settings. Midi will pick up this damage and apply the saving throw result against it.
    
If you are just using standard items you can just leave things at the defualt and most saves will do 1/2 damage as you'd expect, monsters (like a giant spider) will (if Roll Other Damage is enabled) do base weapon damage and have a save applied to the bonus damage.

For those who have a lot of weapons set up with a save and want the default damage on save to be full damage (which is what a pervious version enabled when search spell description was enabled) just edit the items and set the save to full damage save (preferred) or set the default save multiplier to 1;

0.3.82 fix for saves not working if speed rolls not enabled.
0.3.81
* Clean up keyboard hadling for saves/checks/skill rolls to align with the rest of the midi key settings. See the readme.md for more details.
* catch a couple of edge cases that were throwing some errors.
[removed] [BREAKING] If better rolls is enabled there is a new workflow option. Item roll starts workflow, which if enabled will allow MagicItems spells to work as normal, applying damage etc BUT better rolls item buttons (standard roll etc) will not work as intended. If disabled better rolls item buttons will work as intended but MagicItems spells will not do any auto rolls but better rolls buttons will function as intended. You can't have both, default is disabled.
* [BREAKING] Removed preRollChecks setting. All features of that setting can be enabled from the optional rules settings page.
* [UNBREAKING] for AoE spells (measured template placed) default behaviour is that caster WILL be targeted. Only if the range units field is set to "Special" will the caster be ignored. This means items from the SRD will work as written.
0.3.80
[removed] [BREAKING] Measured templates now target the caster ONLY if range has type "any", othewise the csater won't be targeted by the AoE template.
* Added special durations for specific daamage type, expires if the target takes damage of the specific type.  
* Added special duration isSave. Effect expires if the character makes a saving throw in response to an item usage against it. Also added ability type specific expiry on save.  
Not really sure how useful the ability/dagmage type expriry options but at least 1 person has asked for them both.  requires latest DAE to work.
* Added special durations save.success and save.failure.
* Added flags.midi-qol.advantage.concentration which gives advantage to concentration checks.
* Fix for other damage rolls with saves and dual concentration rolls always doing 1/2 damage on save.
* Fix for checking range of thrown weapons when rule disabled.
* Force set on Use Macro when concentration automation is enabled so that the checks will actually do something.
* Support for better rolls 5e 1.3.11. Quite a lot changed under the hood. midi-qol advantage/disadvantage flags and optional rules should work with better rolls now. If you don't update to this version of midi-qol then concentration automation fails with 1.3.11.

0.3.78/79 Better rolls compatibility fixes
0.3.77
* Tweak to nearby foes disadvantage check. If using a thrown weapon within 5ft of the target, assume that the weapon is not thrown.
0.3.76
* updated cn.json thanks Mitch Hwang
* Fixed a bug I could have sworn I already fixed in TrapWorkflow not getting the right token for spell casting purposes. Resulted in AOE spells not targeting the token that triggered the trap.
* Cleaned up better rolls button handling to avoid fetching the item/actor when rendering the chat card.
* Chat damage buttons retained the item in the chat card, this has been removed.
The combined effect of these seems to reduce memory growth a bit.
* Stopped advantage/disadvantage being "sticky" when rolling from the attack button on the chat card.
* Fix for saves display not being shown in non-merge cards when no player characters are doing a saving throw.  
* Fix for causing DND5E Helpers to display cover checks twice.
* Clean up attack/damage buttons when no longer active.
* Slight change to check range optional rule. Melee weapons with the "Thrown" property will check the range/longrange the same as for ranged attacks. They will also incur disadvantage if a foe is nearby, again as if a ranged attack. If you want a pure melee version, create a second item with melee and 5ft ranage and disable the thrown property.
* Added an additional optional parameter to TrapWorkflow templateLocation
```
  templateLocation: {x: number, y: number, direction: number, removeDelay: number};
```
As well as x,y position and direction you can now specify a delay in real time seconds (not game time seconds) after whih the template will be removed. Gives a nice effect for, say burning hands, which flashes the cone of fire then removes it removeDelay seconds later.
* Suport for midi-qol advantage/disadvantage flags in BettereRolls **1.3.11** and later for attacks, ability saves and checks and skill checks.
* In response to popular demand (well 1 person at least) and becuase I like stats, I've added roll statistics to midi-qol. This is a first cut, so do not expect perfection. 
* To launch the stats dislplay:
  * as GM you can choose show stats from the midi-qol misc settings configuration,
    * or create a macro with the following command, which will work for players and GMs
    ```
    MidiQOL.gameStats.showStats()
    ```
  * See the Readme.md for more details.
* Slight tweak to Sneak Attack. Added a feature "auto sneak attack" which causes the sneak attack feature to get rolled as soon as possible without showing a dialog. Requires you to load the updated sneak attack. If the auto sneak attack feature is removed, or the effect disabled, the dialog will show prompting to use sneak attack.

0.3.75
remove accidental debug left in.

0.3.74
* More work on range checking when casting. Range checks now occur before consuming a spell slot/rolling item card.
* Localisation Support for new text strings in damage card.

0.3.73
updated cn.json, thanks Mitch Hwang.
updated ja.json, thanks to Brother Sharp and @louge
* Fix for reapplying midi-qol calculated values - oops.
* change to chat damage buttons, hopefully more readable.
0.3.72 
* Fix for better rolls processing of criticals, was deciding critical when it shouldn't.
* Fix for disavantage due to nearby foes on ranged attacks.
* Added advantage/disadvantage display for all saving throws, not just magic resistant ones.
* Put chat card damage buttons back to overlay, I think the opening up and closing was just too distracting.
* Display Dice So Nice dice rolls for bonus damage rolls as well.
* Fix for referencing item data in damage rolls, broken by 0.3.71
* Support for bug-reporter.
* Fix for not ignoring self when checking template targets.
* Inclusion of a very little compendium of items that demonstrate some of the features that can be automated in midi-qol with conditional damage macros, sneak attack, hunter's mark and rage.
* Fix for hiding too many chat cards when hide-saves/hide-hits enabled and not using merge cards.
* Fix for check range before rolling, faiing almost all ranged spell attacks.
* Fix for removing measured templates on concentration expiry when no tokens were targeted by the template.
* Fix for not auto targeting itty bitty tokens when placing measured templates. The halflings of the world will rue the day.
* Added "faster" short circuit eval for ItemMacro calls.
* A change to the damage chat card. Instead of a pletheroa of buttons a new streamlined display which shows the icon of the token that was damaged (which can be clicked on to hightlight the token on the map), a summary fo the damge done, and a drop down list of buttons. Calc means the damage after applying immunities and the numeric multipliers refer to the base rolled damage. The tick applies the currently selected mulitplier's damage and the undo always puts the character back to the HP before the attack.
So if the damage was 18 hit points and resistances reduced that to 9, the MQoL multiplier will apply 9 points, the 1X 18, the 2X 36 and the heal will heal the character of 18 points of damage.
* **Many thanks to @Engranado for providing this.**

0.3.71
* bugfix in sneak attack damage application.
* Cleaned up range check when attacking, returns disadvantage when above short range and shorter than long range.
* Added a handful of optional rules on a new options tab, mainly for automated advantage/disadvantage. Consider them experimental. And more will come.
  * If attacking token has an effect "hidden" or "invisible" it gets advantage
* Removed some duplicate checks for advantage/disadvantage - any oddities let me know.
* Added support for conditional damage/onUse Macros macros to be of the form ItemMacro.ItemName, the character's items will be searched for an item that matches the name and has an itemMacro defined on it.
* Added additional parameter (tag) to onUse and damageBonus macros args[0] data, which is "OnUse" when called via onUse macro fields and "DamageBonus" when called via damageBonusMacro.
* update ko.json, thanks @KLO

0.3.70
* Cleaned up display when re-rolling dmage from an existing card. No longer displays old damage on the card while waiting for the roll.
* Provided support for having both bonus damage and rollOtherDamage for things like bite poison damage. If on the merge card both will appear as separate lines, otherwise separate cards.
* Fixed hit and save display ignorind show to gm/player settings for non-merged card rolls.
* Fixed Bonus damage macro rolling by removing dependency on other damage roll setting.
* Display all flavors returned from damageBonusMacro
* Fix for hits/saves display ignoring the workflow display setting if not using merged card.
* Fix for not fast forwarding skill rolls.
* Support for flags.midi-qol.maxDamage.all/flags.midi-qol.maxDamage.rwka/mwak/heal/spell.... which, for non-critical hits, means damage rolls for base damage roll wil be maximum, for actions of the specified type.
* Cleaned up 0.5/full/no damage saves for weapons. If rollOtherDameage is disabled, the item setting will apply to the base damage rolled. If rollOtherDamge is enabled, the base weapon damage will ALWAYS be full damage and the save modifier will apply to the otherDamageRoll damage.
* Put back token selection in saves display (same behaviour as hits/damage cards)

* Better Rolls support got some love.
  * Concentration is now fully supported (except that when caasting a spell requiring concentration no prompt is given to the user, concentration is just removed).
  * Cleaned up damage parsing, should be solid now. Won't include "Other" damage in base rolls.
  * If you disable "auto apply item effects" a button will added to the better rolls chat card to allow you to apply the effects to TARGETED tokens. This means you can apply effects even if not using auto damage/saves.
  * Support rollOtherDamage for mwak/rwak and uses the Other field from the better rolls card.
  * Support for damageBonusMacro. Damage will appear as a spearate card.
  * Critical hit, advantage and disadvantage are populated from the Better Rolls card so whould more accurately represent the better rolls data.

0.3.69
Added advantage/disadvantage to data passed to onUse/Damage bonus macros.
0.3.68
* A small rearrangement of the onuse/damagebonus macro calling.
* export of midi-qol.getDistance(t1, t2, wallsBlock: boolean). Which will return the straight line distance between two tokens allowing for tokens larger than size 1.
* "Fix" for placing rectangular templates and auto targeting, now treats the origin of the template as the center of the template for checking blocking walls. Fixes and incompatibility with dnd5e helpers that replaces circle templates with equivlently size rectangular templates.
0.3.67
* Checking you have tokens targeted now checks the number of tokens targeted.A target type of creature will use the number specified in the spell details and defaults to unlimitted if not specified.
* An addition to TrapWorkflow. Instead of taking {x: xpos, y: ypos}, it will now accept {x: xpos, y: ypos, direciton: rotation_angle_degrees} for placed templates. Previously direction was hard coded to 0 degrees.
* search spell description is now a case insensitive check and handles "&" escaped utf-8 characters in the description.
* when rolling the attack/damage rolls again, on an existing workflow a new chat card is generated. This works well if you pop out the standard roll and use that to keep rolling damage for repeated damage spells. This also fixs the edge case of rolling a standard roll and having attack/damage keep updating the first card.
* onUse macro will now support a comma separated list of macros to call.
* Put back the special evaluation of (expr)dX for damage bonuses. It turns out this is important for critical damage rolls. 2d6 as a damage bonus will get doubled when rolling a critical hit, but (ceil(@class.rogue.level/2))d6 wont.

**For macro/item creators**
* An additional macro call (similar to onUse macro and enabled via the same setting),which is called during the workflow damage calculation. On a successful attack, when midi-qol is calculating damage, midi calls all macros specified in flags.dnd5e.DamageBonusMacro (comma separated list) passing the same information as is passed to onUseMacro, which can be set via active effects or editing the special traits page. Requires furnace advanced macros to pass arguments.
* midi-qol will capture the return value (**not possible for execute as GM macros**) and examine the return data (for example) {damageRoll: "1d4[piercing], flavor: "a string"}.
  * The damageRoll fields for each macro called will be concatenated tor form a single roll expression, which is evaluated in the context of the actor doing the attack, and used to populate the otherDamage field which is included in the final damage application. You should specify the damage type so that midi can work out what sort of damage is being added, if no type is specified it will default to the damage type of the first damage roll in the item definition.
  * The macro does not have to return a damage bonus and can do anything you want, it is simply called each time you are about to do damage.
  * This is compatible with better rolls, but the damage display is (currently) a spearate card.
* Adding damage this way is expensive since it requires a macro compilation and execution each time you do damage. If you can add the damage via bonuses.mwak.damage you should do so.
* Why? If you are using automaation, effects like hunter's mark which require conditional bonuses to be applied in the event you are hitting the marked target can't be handled well. If you are not automating, you just need to remember to add 1d6, but when the roll is being auto calculated/applied you don't get the option. So either you need to always prompt for a bonus (and hope you remember) or the bonus damage needs to be calculated for you.
* Most information about the attack/damage rolled so far is available, so you can customise critical damage beyond the extra dice allowed in the bonus critical dice field.

* Here is a sample hunter's mark onUse and damageBonus macro: (If you are not familiar with args[0].value, please see the readme).  The onUse part sets up the active effects required and the damageBOnus part calculates the additonal damage.

The macro checks an actor flag "midi-qol.huntersMark" to get the tokenId of the marked target. 
The flag midi-qol.huntersMark has to be set via the Hunter's Mark spell. The combined macro looks like this:
```
// Sample Hunters mark onUse macro
if (args[0].hitTargets.length === 0) return;
if (args[0].tag === "OnUse") {
    // Sample Hunters mark
    let target = args[0].hitTargets[0]._id;
    let actorId = args[0].actor._id; // actor who cast the spell
    actor = game.actors.get(actorId);
    if (!actor || !target) {
      console.error("Hunter's Mark: no token/target selected");
      return;
    }
    
    // create an active effect, 
    //  one change showing the hunter's mark icon on the caster
    //  the second setting the flag for the macro to be called when damaging an opponent
    const effectData = {
      changes: [
        {key: "flags.midi-qol.huntersMark", mode: 5, value: target, priority: 20}, // who is marked
        {key: "flags.dnd5e.DamageBonusMacro", mode: 0, value: `ItemMacro.${args[0].item.name}`, priority: 20}, // macro to apply the damage
        {key: "flags.midi-qol.concentration-data.targets", mode: 2, value: {"actorId":  actorId, "tokenId": args[0].tokenId}, priority: 20}
      ],
      origin: args[0].uuid, //flag the effect as associated to the spell being cast
      disabled: false,
      duration: args[0].item.effects[0].duration,
      icon: args[0].item.img,
      label: args[0].item.name
    }
    await actor.createEmbeddedEntity("ActiveEffect", effectData);
} else if (args[0].tag === "DamageBonus") {
    // only weapon attacks
    if (!["mwak","rwak"].includes(args[0].item.data.actionType)) return {};
    let targetId = args[0].hitTargets[0]._id;
    // only on the marked target
    if (targetId !== getProperty(args[0].actor.flags, "midi-qol.huntersMark")) return {};
    let damageType = args[0].item.data.damage.parts[0][1];
    return {damageRoll: `1d6[${damageType}]`, flavor: "Hunters Mark Damage"}
}
```
The macro above are sufficient to implement all of the features of hunter's mark. To change targets simply cast again, but don't consume a spell slot.
0.3.66
Put back config option to roll Other/Versatile damage on failed save for rwak/mwak.
0.3.65
update ja.json thanks @louge
Fix for TrapWorkflow targets not being set
0.3.64
* Added flags.midi-qol.superSaver.all/dex/str etc. If set, then saves against the specified ability do 0/0.5 damage instead of 0.5/1 times the damage. Meant for things like rogues evasion. Apply with an active effect and it will apply, failed save+effect = 1/2 damage, save+effect = 0 damage.
* Fixed a bug in concentration check that 0 damage Other/Versatile damage caused a second concentration check.
* Allowed GM to decide if spider bite, (piercing damage + save against poison damage) causes 1 or 2 concentration checks.
* Token being reduced to 0 automatically removes concentration. At the moment the saving throw is still rolled, but I will find a way to avoid that.
* Fix for flags.midi-qol.fail.skill.acr/... not working.
* [For macro writers] Damage only workflows will no longer trigger CUB concentrator if rolling an item as part of the workflow (niche I know, but annoying).
* Re-organised the config settings into a different disorganised layout.
Please update DAE as well.

0.3.63
* A couple of fixes for sw5e.
* Updated ja.json thanks @louge
* A new option for hiding DM attck rolls (only works with the merged card). "Show Attack D20", players will only see the d20 result, not the roll total, so they get a feel of how good the monster is. This simulates what the players could see at the table (i.e. see the dice roll) but not know what the total is. Otherwise this option behaves the same as Hide Rol Fomula.
* DamageOnlyWorflow will now display all of the targets as normal hit targets so you can see who took damage.
* Support (I think) all of the CUB name replacement options in midi-qol. Names changed on hit/save cards remain changed once the card is placed no matter what you change the settings to. midi-qol uses the CUB options to do name hiding. Midi hideNPCNames removed.
* Fix for data.abilities.str/dex/.../.dc CUSTOM not updating display of spell DCs.
* Initial support for **concentration automation**. The is dependent on DAE and Combat utility belt being installed and of the right version and **requires** CUB concentration automation to be disabled.
Features: (see the full change log for more details).
  * Enabled via config setting (near auto check saves)
  * Get user confirmation before casting a second concentration spell while the first is still active. First concentration is removed if you proceed.
  * Taking damage causes a concentration check, failure removes concentration.
  * If the spell that caused concentration expires concentration is removed
  * Concentration can be removed from the token effects HUD and will work as expected.
  * If concentration is removed any effects due to the spell on any tokens (self + targets) are removed.
  * If concentration is removed any measured templates associated with the spell are removed.
  * No changes are required to any spells/effects for this to work, it keys off the concentration attribute in the spell details.
  * Expect bugs....

* Some more detail on concentation automation:
  * Caveats:
  * CUB concentration automation is NOT comaptible with midi-qol concentration automation. Midi-checks the settings and will disable CUB concentrator if you accept.
  * Midi-qol REQUIRES that CUB be installed and the "Concentrating" condition be setup for midi-qol concentation automation to work. Midi shows a dialog if this is not the case. 
  * Midi will use the CUB concentrating condition when applying concentration (so you can add extra effects if you like, change the name/icon or whatever).
  * Midi-qol concentration automation will add an item to your world items, "Concnentration Check - Midi QOL". It is required for concentration automation and will be recreated as required each time you start the world if midi-qol concentration automation is enabled.
* DAE 0.2.43 is REQUIRED for this version, a notification will be shown and concentration and auto application of effects wont work if DAE not installed. So upgrade/install DAE if you use those features.
* A farily recent version of CUB must also be installed and active.

* Features:
  * Enabled via config setting (near auto check saves)
  * If you cast a spell that requires concentration when you already have concentration, the caster is asked to confirm before casting the new spell and the previous concentration is removed.
  * If a token takes damage and doesn't save concentration is removed. The save will be rolled as a "Concentration Check" item and your settings for token saves will be used, i.e. auto roll/LMRTFY etc.
  * If the spell that caused concentration expires concentration is removed
  * Concentration can be removed from the token effects HUD and will work as expected gme.cub.removeCondition("Concnetrating", tokens) will also trigger the rest of concentration remvoal.
  * If concentration is removed any effects due to the spell on any tokens (self + targets) are removed.
  * If concentration is removed any measured templates associated with the spell are removed.
  * No changes are required to any spells/effects for this to work, it keys off the concentration attribute in the spell details.

* Note this is a first implementation and a) there will be bugs and b) it is quite slow and needs substanital optimisation and c) there will be bugs.
* Better rolls support is limited (and possibly buggy). There is no query for existing concentration, existing concentration is simply removed.
* For the name replacement on midi hit/save cards I have implemented what I guess the funcitonality to be. But I have created the behaviour from scratch so might have missed something.

0.3.62
* Fix bug for over zealously removing damage buttons. 
* Fix for damage only workflow so that useOther defaults to true.
* Fix for BetterRolls self targeted spells not working.
* Fix for BetterRolls not checking isAttacked/isDamaged expiry
0.3.61
* Fix bug not displaying tool item details.
* Fix bug for over zealously removing damage buttons.
* Fix bug in applying damage on auto rolled other damage not including base damage in calculation.
* Fix for possible race condition when expiring specialDuration effects that could cause the effect to be deleted more than once, resulting in server deleted 0 ActiveEffects messages.
* Support for additional argument in the DamageOnlyWorkflow (userOther: boolean, defaults to true) to specify which slot to use on the item card, if it is passed. If true the damage from the roll will be placed immediately below the attack roll, otherwise it will be placed in the normal damage area.
* If CUB is installed and active midi-qol will use CUBs hostile name replacement for hit/save cards. A future release will remove the midi-setting entirely since there is no reason to use midi's hide name if not using CUB hide names.
* New option to DamageOnlyWorkflow, it you pass itemCardId: "new" together with itemData as itemData: itemData, a new chat card for the item will be created and the dmage inserted into the chatcard. (consider this experimental).
* Fix for rolling self targeted items when no token for the actor exists in the current scene.
* Fix for rolling items if no scene exists in the world.
* Fix for not displaing damage total when 0 damage was rolled.

0.3.60
* Now requires dnd5e/sw5e 1.2.3 or later.
* Fix for critical key not being detected for some damage rolls.
* Fix with perfect-vision to not infinte loop.
* Fix for healing damage bonus in other languages not working.
* Fix for Damage vs Healing displayed for healing action types on the item card button.
* Improved (?) behaviour on the 1attack/1hit/isDamaged/isAttacked expiries. There may be some missed edge cases.
* startNextTurn/endNextTurn expiry moved to times-up.
* Implement 5/5/5 distance calcs for ranged area trgeting.

0.3.59
Fix for rwak/mwak and applying Other/versatile damage always rolling something even if no Other or versatile damage (it would roll the weapon damage again)
0.3.58
Fix for 0.3.57 release bug.
Fix for trap worfklow not fastforwarding.
0.3.57
Fix for self targeted attack/action/hit durations. This required quite a few changes in the workflow so it's possible some cases are not covered so be warned.
0.3.56
* Extended the rwak/mwak + saving throw functionality. If the item has "Other" filled in, midi will roll that for the save damage, otherwise it will roll the versatile damage. This change means it should work out of the box with SRD monsters.
* Fix for damage buttons on the item card.
0.3.55 Bugfix release
* fix for LMRTFY override to fix libWrapper problem.
* fix for Other rolls sometimes not displaying saving throws.
* [BREAKING] Change to remove buttons settings to configure attack/damage buttons for GM/Player. You need to reset the settings.
* [BREAKING] If auto roll damage is none and no targets were hit or selected the workflow will complete (triggering effect expiry). If you want to have the dmage buttons available enable it from the workflow (disable remove damage buttons on completion), you will still need to manually apply damage.
* Addition to onUseMacros arguments. Since it is quite possible to have race issues when calling a macro that applies damage to targets as part of an item attack, for onUseMacros args[0].damageList provides a snapshot of the damage/HP totals in the roll so far. In particular if creating a damageOnlyWorkflow you can pass the damageList to the constructor to have the workflow take those values into account. 
```
  new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "piercing", [target], damageRoll, {flavor: "Giant Slayer bonus damage", damageList: args[0].damageList});
```

* [BREAKINGish] DamageOnlyWorkflow damage results will appear in the space reserved for "Other" damage in the combo chat card. This means that you can have a weapon roll normal damage, and run a macro that does other damage and put that damage in the same combo card.
```
  new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "piercing", [target], damageRoll, {flavor: "Giant Slayer bonus damage", damageList: args[0].damageList, itemCardId: args[0].itemCardId});
```
0.3.54 Some big QOL changes in this release. Some significant changes under the hood, so DO NOT UPGRADE on game day.
* fix for advantage from flags.midi-qol.advantage.attack.str/dex on weapons with default ability settings.  Will now check finesse property if ability set to default.  
* Added an apply dynamic effects button which will apply effects to the targeted tokens when pressed.

* [BREAKING] New feature for action type rwak/mwak that have a saving throw. The "Other" formula will be rolled as additional damage. (This required some changes to the damage application logic so should be considered experimental as well)
  * Default is 1/2 damage on save, but you can set the noDamSave or FullDamSave flags to modify the behaviour.
  * The saving throw has no effect on base weapon damage, it always does full damage if the attack hits.
  * You can specify the Other formula as 3d6[poision] and the extra damage will be treated as poison damage for damage resistances/immunities/vulnerabilities.

* [BREAKINGish] Workflows remain active after completion. This means that you can reroll attacks/damage for an item. (This should be considered a little bit "experimental") Because workflows can be restarted there is now much better support for Popped out item cards. A workflow remains viable until another workflow with the same item is started, then it will fail.
  * Popped out item cards. If you pop out the chat card whatever buttons have not been removed remain active (see also setting to keep buttons). So if you pop out magic missile (before the damage is rolled) you can roll the damage multiple times and the damage is applied.  
  * The same applies for attacks and saves. If auto applying damage new damage cards will be created for each set of applied damage. 
  * If the item has an attack and you change targets between one roll and the next the new targets will be used. This does not yet work for damage only items (I need to think about it a bit more).
  * The initial item chat card is updated with new hits/damage. This can be a problem if the display scrolls too far befor you want to roll again.
  * New config settings to help with popped out messages, attack/damage buttons can remain active for both player and GM, and will restart the workflow from that point, so rolling the damage again will re-reoll the damage and apply it to the targets.  

One obvious use case is that if you auto roll everything, adv-dis the roll to get a complete chat card, and then pop out the card and you can re-roll as often as you want.

* Fix to mark workflow settings as global so that DF Settings Clarity does not report workflow settings are per user.

* Support for "Spell Damage" resistance type (resistance/immunity/vulnberability). Any damage from an item of type "spell" will be checked against this resistance/immmunity/vulnerability and if present will change the damage by a factor of 0.5/0/2. You can only get one such multiplier per category, so resistance to "Spell Damage" and Fire will result in a single 0.5 multiplier. The is useful for things like Aura of Warding.  
This is separate to the existing magic resistance support, which gives advantage on saving throws, which remains unchanged.
0.3.53
* Improve/Fix advantage/disadvantage on roll buttons when you have flags that set both advantage and disadvantage. Once you have something that sets advantage and disadvantage the roll will always be done as a normal roll.
* Fix for LMRTFY always rolling with advantage if you change the speed roll settings.
* Fix for LMRTFY to recognise adv/dis keys if you request a LMRTFY+Query roll.
* Improve critical damage display on buttons. The hit/miss card will display the raw result of the roll and the button will display the expected critical status after any flags are applied. So they may not be the same.
* If you want to override the critical button you need to bring up the dialog and choose critical/normal from the dialog, i.e. not fast forward roll.
* Small fix for onUseMacro to pass through critical key status in args[0].isCritical
0.3.52
Fix for versatile button MIA.
0.3.51
* Fix for error being thrown for items that do not have a damage roll.  
[BREAKING] If the action type for an item is blank (so that the damage rolls are not displayed when edited) then no damage button will be displayed/rolled.  
* Yet more advantage/disadvantage/critical changes/improvements (sorry, but hopefully this is the last one).  
Chat card buttons should correctly reflect the status for adnvantage/disadvantage/critical that midi-qol thinks when displaying the buttons (i.e. not auto rolling) and includes looking at various advantage/disadvantage/grants/critical flags.  

Fast forwarding has been cleaned up/changed.

When clicking from the character sheet/macro/token HUD, adv+dis will toggle the attack auto roll status, i.e. if the attack roll normally auto rolls the attack button will be displayed and vice versa.

The behaviour of ctrl+alt (or adv + disadv if using speed rolls) has been changed. It inverts the next attack/damage fast forward status. So if you auto fastforward attacks ctrl+alt will prompt for the advantage/disadvantage and vice versa. So you can set the workflow for what you do most of the time and use adv+disadv to reverse it.

The same applies for critical rolls and the use of ctrl-alt. In addition if your default critical key is alt then ctrl will be set non-critical for the damage.

Be aware that the critical display includes flags.midi-qol settings so the roll may not be a critical roll but the damage button can correctly display critical.

If you do not auto roll an attack or damage roll the fast forward status will be displayed in the attack/damage button (i.e. what clicking on the button will mean), (fast) means that the roll will fast forward.

I'm sure there will be some workflow that someone uses for whom the changes are utterly unbearable, so feel free to let me know (they work for me).

0.3.50
* Fix for damage buttons not being added for non-merge card damage cards.
* Fix some cases of errors being thrown when first loading and canvas not initialised.
* Fix for versatile damage button being displayed when not required.
* If not auto rolling attack rolls and using the merge card, display advantage/disadvantage in the attack button for the item card, as a hint for the roll (based on the various flags that can be set). It will not detect target specific flags however. If auto fast forwarding the roll will be made with the suggested setting, speed keys override the setting as does choosing from the roll dialog.
* Fix for incorrectly displaying advantage/disadvantage on chat card if user selects something else from the damage dialog.
* Fix for blind rolls being completely hidden forever.
* Fix for GM rollNPCSaves set to LMRTFY and player set to auto roll not causing roll to not be completed.
0.3.49
* Revamped DM roll flags (again), due to the various interactions that people had with the workflow settings. There are now 4 gm settings:
  * GM Auto Roll Attack: If true the attack roll will be auto rolled for the GM if set.
  * GM Auto fast forward attack rolls: If true the GM attack rolls will be auto fastforarded. Key modifiers are supported.
  * GM Auto Roll Damage. Options are never, attack hits, always.
  * GM Auto Fast Forward damage: If true roll will be auto fast forwarded. Will pick up whether the attack was critical or not and will recongnise critical and No critical keys if the roll was not auto rolled.
0.3.48
* More tinkering with dadmage critical rolls. If an attack is critical and damage rolls are auto fastforwarded it will use the critical status from the attack roll.
* If not auto rolling damage rolls and auto fast forwarding damage rolls pressing the disadvantage key (ctrl by default) will force the roll to be a normal roll.  
As always there are likely to be some workflow behaviours that I have not tested so ping me if there are any problems.
* [BREAKING] Split GMFullAuto into GM auto roll attack and GM auto roll damage. GMAutoRollDamage ignores other module settings and will auto roll damage for all GM damage rolls if true and will never auto roll if false. I have to thwart a particular bahaviour in my world where players decide to use the shield spell based on how much damage the attack does, but still want their attacks to auto roll damage if they hit.
* Fix for ptentially choosing wrong dice in advantage/disadvantage roll checks.
* [BREAKING] removal of the midi-qol created magical flag for weapons - it is now created by default in dnd5e 1.2.1. It appears the properties have the same id so it should mvoe across seamlessly.
* release of dnd5e 1.2.1 fixed an issue when rolling critical damage via the standard damage dialog. The roll will correctly be rolled as critical if selected. This should fix the issue with modifying critical damage according to the midi-qol settings.
* Support for GM LMRTFY save option, which does a LMRTFY + query for NPC saves to the GM. This allows the GM to specify advantage/disadvantage if not auto fastforwarding saves. 
0.3.47
* Added it.json thanks @Simone [UTC +1]#6710   
* Fix for flags.midi-qol advantage and speed keys being selected.
* Set spellLevel in rollDamage() call correctly.
* support for tidysheet-5e new version config setting
* private rolls by GM no longer show the dice to the players.
0.3.46
* Removed Formula + DSN option from hide roll details. Hiding the roll formula will disable DSN dice on non-gm clients.
* Fix for not displaying hit details on non-combo cards  
First implementation of critical damage flags.  
* flags.midi-qol.critical.all  
* flags.midi-qol.critical.mwak/rwak/msak/rsak/...  
* flags.midi-qol.noCritical.all  
* flags.midi-qol.noCritical.mwak/rwak/msak/rsak/...
* flags.midi-qol.maxRoll.all  
* flags.midi-qol.maxRoll.mwak/rwak/msak/rsak/...
* flags.midi-qol.maxRoll.heal heal damage rolls are always maximized - think "Supreme Healing"

These force the damage roll from attacks by the actor that has the effect to be critical.  

The following grants/fail flags apply ONLY if it is the single target of the attack.
These flags force/disable critical hits when a single target has been hit.  
* flags.midi-qol.grants.critical.all  // All damage rolls are critical  
* flags.midi-qol.grants.critical.mwak/rwak/msak/rsak/other  
If there is a single target (which has the effect) and the attack hit, upgrade the attack to a critical attack. (Think unconcious)  
* flags.midi-qol.fail.critical.all  // no dmage rolls are critical  
* flags.midi-qol.fail.critical.mwak/rwak/msak/rsak/other   
Cause attack on the target to not be critical. (Think adamanitne armor)  

0.3.45  
DSN fix (I hope).  
Support for new tidysheet5e (0.4.0+)  
0.3.44  
Fix for some libwrapper incompatibilities.
Fix for multilevel tokens throwing an error

0.3.43  
* Fix for spell scaling not working if not auto rolling damage.  
* Fix for AOE magic items spells throwing an error.   
* Fix for ammo damage after libwrapper installed.
* Included merge request to refrain from deleting non-special duration effects at combat end. Thanks @DangereosrDan.  
The first 2 fixes required a change to how keyboard event processing is done. As far as I can tell there are no problems, but there are too many workflow variations for me to test them all, so a bug (or many) is possible.  
Don't update just before game time.
0.3.42  
fix for versatile shortcut being ignored.  
0.3.41  
fix for spell scaling not working  
fix for item roll errors when initially rolling - broken universe etc (I hope)  
0.3.40  
* Fix for trapworkflow calling onUse macro twice.  
* Some more clean up of crtical/advantage settings in workflows. Dont pass an event, use optins values  
* Fix for modifying critical damage on all workflow paths  
Fix for perfect vision incompatibility thanks to the module author for the fix.
Deprecation notice: The player controls invisible tokens setting will be removed in a subsequent release since the "conditional visibility" module does a much better job.  
0.3.39  
* updated ja.json thanks @touge  
* fix for auto fast forward ability rolls setting being ignored.  
0.3.38
* fix for sw5e and saving throws  
* Add flavor text in item card.  
0.3.37
* fix for breaking token-action-hud  
0.3.36
* added flags.midi-qol.advantage.deathSave, added flags.midi-qol.disadvantage.deathSave, and death saves also look at flags.midi-qol.(dis)advantage.all
* fix for LMRTFY and speed item roll mappings.
* fix for change from actor.useSpell changes and upscaling of spells.
* use new item.getSaveDC() for spell saves.
* added a new paramter to item.roll({createWorkflow: true}). If you se this to false when calling item.roll a workflow will not be initiated - useful if you have macros that do a complete roll and you don't want midi-qol to start automation for the item roll.

0.3.35
* fixed a bug with speed rolls/auto check saves that caused the attacking player to be prompted for the save type for NPCs.
* added support for configurable list of items that have item details displayed
* added current token's tokenId as argument to onUseMacro data.

[BREAKING] change to special expiry effects: (Reuqires DAE 0.2.27)
* removed from item duration (too cluttered)
* added as option field in Effect Duration panel. (You must use DAE effect editor). The special expriy conditions apply in addition to the normal duration.
* Added support for isAttacked and isDamaged expiry conditions.
Example: Guiding Bolt. Start wi th the SRD guiding bolt spell 
  * Bring up the DAE editor and add an effect.
  * On the duration tab, set the duration to be 1 round + 1 turn and the special expiry isAttacked.
  * On the effects tab add an effect
```
    flags.midi-qol.grants.advantage.attack.all override 1.
```
  * Now when you cast the spell at a target and hit, the effect will be applied that grants advantage on the next attack.

0.3.34
* Slight fix to self targets, should now work without targeting self
* added flags.midi-qol.advantage.attack.dex/str/wis etc to give advantage on dex/str/wis etc mwak/rwak
* added flags.midi-qol.disadvantage.attack.dex/str/wis etc to give disadvantage on dex/str/wis etc mwak/rwak
[BREAKING] "enable workflow automation" is now a client setting, rather than a world setting. This means that players can choose workflow enabled or not independently of the GM and must set it for their client. Default is workflow automation enabled.
* Fix for aborted attack/damage rolls advancing the workflow. Attack/damage buttons remain active until a roll is made (either auto or manual) or a new item roll for that item is started.
* Process damage flavor data for bonus damage (traits/situational bonus) when calclulating damage types, so a bonus of 1d6[Fire] will be recognised as fire damage. If no damage flavor is specified ti will be treated as having a flavor euqal to the first damage type in the item spec.
* Correctly bucket damage types so that multiple damage elements are added before resitances are applied.
* Fix a bug in speed rolls for ability saves/checks ignoring the accelerator keys (introduced in 0.3.33)

* [Requires DAE 0.2.25+] Items support additional active effect durations that can be specified:
  * 1Attack: active effects last for one attack - requires workflow automation
  * 1Action: active effects last for one action - requires workflow automation 
  * 1Hit: active effects last until the next successful hit - requires workflow automation 
  * turnStart: effects last until the start of self/target's next turn (check combat tracker)  
  * turnEnd: effects last until the end of self/target's next turn (checks combat tracker)  
  All of these effects expire at the end of combat
* added flags.midi-qol.fail.skill..... support
* corrected behaviour so that having both advantage and disadvantage for a roll will cancel out to be a normal roll.
* updated ko.json thanks @KLO

* Know Bugs: critical roll modifications do not preserve damage types from bonuses.


0.3.33
* Added a new flags.midi-qol.DR which implements damage reduction, i.e. reduce incoming damage by a fixed amount
flags.midi-qol.DR.all - all incoming damage
flags.midi-qol.DR.non-magical - non-magical bludgeoning/slashing/piercing
flags.midi-qol.DR.acid - specific damage types
flags.midi-qol.DR.bludgeoning
flags.midi-qol.DR.cold
flags.midi-qol.DR.fire
flags.midi-qol.DR.force
flags.midi-qol.DR.lightning
etc
These flags can be set by active effects and are evaluated after derived fields are calculated, so things like dex.mod etc ar available.

* fix for templates and large tokens.
* fix for npcs requiring players to roll saves.
* Added Hooks.callAll("midi-qol.DamageRollComplete", workflow) after damage has been applied.
* updated de.json thanks @acd-jake

0.3.32
Add damage all/restore all buttons to damage card.
Hightlight/select enabled for damage card as well as hits card.
Fix for trap workflow not fastforwarding damage rolls
Don't error if target token has no actor data.
Added a "No Damage" damage type for spells like sleep where the applied damage is always 0.
Fix for crit-key = shift causing all spells without an attack to roll crit damage
Process events passed to item.roll({event}), which got dropped by mistake
0.3.31
0.3.30
* Fix bug in critical damage roll handling of "max base damage".
* Improve, but not completely fix, case of odd number of dice in critical rolls and max crit damage. 
* Correctly pass critical key to feats/spells that do not have an attack roll.
* Fix for speed key setting and advnantage/disadvantage flags not working together.
* Export MidiQOL.doCritModify(roll), which will adjust the roll according to the midi-qol critical damage settings. Useful for macro writers writing damage macros that want to deal with critical damage consistently with the midi-qol game settings.
* Call Hooks.callAll("midi-qol.AttackRollComplete",.... when the attack roll is complete for a workflow. This allows processing if the attack missed and/or damage is not rolled.


Example Divine smite onUse macro (assuming divine smite as a spell)
```
if (args[0].hitTargets.size === 0) {
  console.error("no target selected/hit");
  return
}
let target = canvas.tokens.get(args[0].hitTargets[0]._id)
let numDice = 1 + args[0].spellLevel;
let undead = ["undead", "fiend"].some(type => (target.actor.data.data.details.type || "").toLowerCase().includes(type));
if (undead) numDice += 1;
if (args[0].isCritical) numDice = numDice * 2;
let damageRoll = new Roll(`${numDice}d8`).roll();
if (args[0].isCritical) damageRoll = MidiQOL.doCritModify(damageRoll);
new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "radiant", [target], damageRoll, {flavor: "Divine Smite - Damage Roll (Radiant)", itemCardId: args[0].itemCardId})
```
0.3.29
Fix bug for trap workflow and better rolls workflow when no event passed to constructor.
0.3.28
* Fixed a bug in damage processing with negative modifiers (i.e. bonus/situational bonus) when applying damage. (negative mods turn positive)
* Fixed a bug in chat damage buttons (similar to above)
* Ensure that damage dealt can never be negative and end up incorrectly healing the target.
0.3.27
* Auto fail on ability check flows through to skill rolls for dependent skills.
* Fix for altKey undefined on skill checks and no speedRolls.
* Fix for saves prompting user for adv/disadv/normal when no speed rolls enabled.
* In the quest to provide ever more arcane key combination support, Capslock now acts as an auto fastforward for atttack rolls (like adv+disadv). 
* First installment of:
  flags.midi-qol.fail.spell.all disable all spell casting for the character
  flags.midi-qol.fail.spell.vocal fail casting of spells with vocal components (intended for silenced characters0)
  flags.midi-qol.fail.spell.somatic - perhaps useful for restratined characters or some such.
  flags.midi-qol.fail.spell.material (Can't think when this might be used but added it for completeness)
0.3.26
Fix for consuming last of a consumable when not using automation.
Fix for rejecting spell cast when no target selected even if there is nothing to target.
Added speedAbilityRolls flag which applies your speed item rolls settings to ability rolls and skill rolls.
Added info button to inventory buttons - just shows item info.
0.3.25
* Ability check advantage/disadvantage now apply to skills based on the ability as well. (I'm told that's how it should be)
* added ability to give attack advantage/disadvantage on attacks (only works for midi-qol generated attacks - not better rolls)
 flags.midi-qol.grants.advantage.all  
 flags.midi-qol.grants.advantage.attack,all
 flags.midi-qol.grants.advantage.attack.mwak/rwak/msak/rsak
 and similarly for disadvantage.
0.3.24
* added flags.midi-qol.fail.skill..... support
* corrected behaviour so that having both advantage and disadvantage for a roll will cancel out to be a normal roll.
* updated ko.json thanks @KLO
0.3.23
* Support settings config permissions from user permissions, i.e. trusted players instead of only GM ussers.
* Blind rolls no longer show the hits card except to the GM.
* Don't prompt for critical/normal damage in TrapWorkflow.
* Fix for empty description field causing a problem on saves.
* Fix for self targets being reported as blocked by a wall in range check.
* [BREAKING] Fix for how tmphealing is applied to only use the max of current/tmpHp and not heal HP.  
Support for advantage/disadvantage: actor.setFlag() to enable (permanent) or via active effects (temporary).  
flags.midi-qol.advantage.all All attack/damage/saves/checks/skill rolls have advantage  
flags.midi-qol.advantage.attack.all All attack rolls have advantage  
flags.midi-qol.advantage.attack.mwak melee weapon attacks have advantage   (mwak/rwak/msak/rsa)
flags.midi-qol.advantage.ability.all all ability rolls have advantage  
flags.midi-qol.advantage.ability.save.all all ability saves have advantage  
flags.midi-qol.advantage.ability.save.str Strength saves have advantage (str, dex, wis, dex, cha, con)  
Same for flags.midi-qol.advantage.ability.check...... for ability checks  

flags.midi-qol.advantage.skill.all All skill rolls have advantage  
flags.midi-qol.advantage.skill.slt Sleight of hand has advantage.   
(acr, ani, arc, ath, dec, his, ins, itm, inv, med, nat, prc, prf, per, rel, slt, ste, sur)  
Similarly for disadvantage.  

Auto fail of ability rolls, (adds -100) to the to make sure it fails.
Cause auto failure of checks.  
flags.midi-qol.fail.ability.all fail all ability rolls  
flags.midi-qol.fail.ability.save.all fail all ability saves  
flags.midi-qol.fail.ability.check.all fail all ability checks  
flags.midi-qol.fail.ability.save.dex fail dex saves  
flags.midi-qol.fail.ability.check.dex fail dex check  
Currently no named field support in DAE, but any active effect can set the flag (i.e. CUB/DAE/Macro or can be permanent on the actor via actor.setFlag). 
  
0.3.22
* Added option for GM to auto fastword rolls always, ignoring the rest of the module settings. Intended for GMs who want their players to hit the various roll buttons but skip for their rolls. 
* updated ko.json thans @KLO
0.3.21
* Fix for ignoring speed keys when not auto fast-forwarding rolls.
0.3.19/3.20
Fix for broken saving throws
0.3.18
* Added drag and drop targeting. If you drag a spell/weapon to a target token the token will be targeted and the attack rolled, as if you had targeted and rolled from the character sheet. Thanks to @grape
* Hopefully fix the chat log scroll problem?
* Really hide rolls no longer hides legitimate whisper messages.
* Added on use macro field to the item sheet, plus a setting on the workflow settings to enable it. If a macro name is present then after the roll is complete the macro is called with the following args, the macro is always called, whether you hit or miss or the target saved. Calling the macro does not create any active effects on the target, it is just rune. Use the targets/hitTargets/saves/failedDsaves to work out which tokens to use. :
                actor: the attacking actors data
                item: the attacking item data
                targets: an array of target actors' data
                hitTargets: an array of the hit targets' data
                saves: am array pf the saved targets data
                failedSaves: an array of the falied saves targets's data
                damageRoll: the damage roll if any
                attackRoll: the attack roll if any
                itemCardId: the id of the item card used to display the roll
                isCritical: ciritcal hit?
                isFumble: fumble?
                spellLevel: the spell level if any
                damageTotal: the total damage applied
                damageDetail: an array of the damage detail, amount and type
This should make adding special weapon/spell effects actions much easier.
0.3.17
* Fix for merge cards and dice so nice immediately display card.
* See owned hidden tokens. When token is hidden does not emit light - this is on purpose and contrary to dnd5e spell. Give them a torch token if you want to.
* Some changes to support times-up
0.3.15/0.3.16 oops
## 0.3.14
* reinstate token vision for invisible tokens - EXPERIMENTAL.
* Some more error checking for "impossible" situations
## 0.3.13
Fix for a bad bug in application of DAE effects when dynamic effects not installed.
## 0.3.12
Yet another fix for speed mappings. Should finally squash the ctrlKey error and any saved data problems.
## 0.3.11
* Fix for broken key mapping editing and aligned control|Cmd since on some mac keyboards ctrl-click does not work, use CMD click instead.
* Fix for saving throws beind displayed even if you asked them not to be.
## 0.3.10
Fix for bug with better rolls and ctl/alt etc handling.
Include updated cn.json
## 0.3.9
* Rework of ctl/alt/shift keys:
If speed rolls are off, all of the ctl|cmd/alt/shift keys and roll behaviour behave the same as in core. There is one additional feature, if you click on a damage button in chat, CTRL+ALT click will use the critical/normal hit status from the midi-qol roll data.

If speed rolls are on you need to assign the keys yourself, however you can use the defaults.  
* advantage key modifier, defaults to ALT/Meta
* disadvantage key modifier, defaults to CTRL
* versatile key modifier, defaults to Shift.
* critical damage modifer, defaults to ALT/Meta.
* fast-forward key (turn any attack or damage roll into a fastforwarded one) advnantage+disadvantage.  
If you assign a key multiple meanings the behaviour is going to be confusing at best.

* A hack for the trap workflow due to tokens not updating in a timely fashion. At least that is what I think the cause is.

* A fix for a bug where message.data.user was being incorrectly set.

* Fixes for Damage Only workflows: This is only relevant to people writing macros. There is a new pararmater you can pass to your macro, @itemCardId, which refers to the item card that triggered the macro (i.e. weapon attack spell cast). If you pass that id to the DamageOnlyWorkflow constructor the damage will be inserted into the item card if you are using merged rolls.

For Example:
macro.execute "Divine Smite" @target @item.level @itemCardId
will pass the target token id, the spell cast level, and the item card id to the macro.
```
// do some rolls, lookup the target and the roll will get added to the item card
new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "radiant", [target], damageRoll, {itemCardId: args[3]})
```

## 0.3.8
* Fix thrown error in chatMessage handling when looking at author.
* Some changes to make midi-qol work with SW5e.
* Skills now accept fast forward rolls.
* Hide roll formula now allows you to configure if the DSN dice rolls for players should be randomised or not.
* Clean up the rest of the default damage type issues.

Known Bugs:
Player control invisible tokens not working. **DO NOT USE**

## 0.3.7
* Fix for dice so nice 3d dice rolling and combo card message display.
* Support iten.roll({versatile: boolean}) as an option for midi-qol to roll versatile attacks, useful for macro writers who want to trigger a midi-qol workflow.
* Allow midi-qol combo cards to be popped out from chat. Only the first attack/damage for the card will trigger a workflow with auto rolls and damage application, so damage application will require you to use the chat damage buttons for subsequent rolls.
* Change the default damage type to "none" instead of healing. Healing spells seem to be correct now, so it might be safe to go back to none. If your healing spells start doing damage, check the damage type specified (not the action type since midi-qol only looks at the damage type)

## 0.3.6
clean up some debug messaging
fixed a bug in critical roll changes (0.7.0+) for default critical damage
## 0.3.5
* Order settings into non-alphabetical order (for 0.7.3+). Slight rearrangement of settings.
* Add enable workflow toggle for those who just want features from the main module settings. If disabled none of the settings on the workflow config page will be active.
* Enable critical hit calculation in 0.7.2+ for combo cards and auto apply damage.
## 0.3.4
a few little bug fixes
## 0.3.3
* It turns out there is a bug in midi-qol and better rolls for hidden/blind/private rolls when using the combo card. There are 2 solutions,
1. Don't use the combo card
2. Enable force hide rolls (bnew option) which also fixes the problem and lets you use the combo card with better rolls and still hide from nosy players.
* New setting "Force Hide Rolls", if set any hidden roll (blind/gm only/self) will not be displayed at all on clients that can't see the roll. The code for this is based (stolen) from the actually private rolls module by felix.mueller.86@web.de and all credit to him for solving this problem for me. I have included the code in midi-qol simply because it solves a particular problem that otherwise I could not fix.
* Chat Notifications from Moerill. This excellent module has a small incompatibility with midi-qol, namely private/gm/blind rolls appear in full in the notification window. Enable force hide rolls to fix this. There remains a problem with dice-so-nice, chat notifications and combo rolls. I'll look into this in future.
* If you are hiding roll details from the players and using dice-so-nice 3d dice a smart player can examine the dice rolled and deduce the aggregate pluses from the dice rolled compared to the dice total displayed. In 0.3.3 if roll details are to be hidden then the dice rolled on the players screen will be random meaning they cannot deduce the actual pluses from the 3d dice. This may confuse some players who see a d20 roll of 6 but it is reported as a critical. I'll take feedback on this feature to see if it is generally useful.
* Added getTraitMult as an export to midi-qol.
* removed default debug level of warn, it is now set by the module settings.
## 0.3.2
very little bug fix release for damage-only workflows
## 0.3.1
Port minor-qol pre-roll chakecs to midi-qol. Checks for attack range and incapacity.
Fix auto targeting for ranged spells/attacks.
Fix for temporary hp healing.
## 0.3.0
* fix for better rolls and hiding cards incorrectly.
* re-organize trap workflow to request saves before rolling damage
* improve healing string display to use DND5E
## 0.2.10 
* fix for self rolls
## 0.2.9
* Improved behaviour for blind/private gm rolls and showing/hiding rolls on item card.
* Improved 3d dice showing for blind/private rolls.
* Fixed errors when not show hits/saves to all players and using dice so nice rolls
* Fixed a bug that caused multiple display of undo damage card if more than one GM logged in.
* Fixed an 0.7.2. incompatibility. Not fully checked but should work with 0.7.2
* Fixed a bug that broke midi-qol if item.rollAttack throws an error. E.g. if ammunition is not properly configured.
* Changed default damage type to healing. Some of the SRD spells don't specify a damage type of healing and so were, by default, doing damage rather than healing.
* A blank player save timeout now defaults to 1 second, previously it default to 0 seconds.
* Added Spanish translation - thanks to @Sali Vader
* Update Korean translation - thanks to @KLO

## 0.2.8
* Added auto untarget options.
  * none - obvious
  * **remove dead tokens**. At the end of a roll  (after damage is applied) all dead targets for the player who rolled are untargeted. If you do a roll there is a delay before the untarget happens, since the clients have to know that a token's HP has been set to 0. If you click too fast the roll will still target a dead token. Also, at the end of the turn all dead tokens for all players are untargeted. So if you party kills a monster you won't stay targeted on it.
  * **dead + all token for GM**. A setting just for me, since as GM I frequently forget to untarget tokens and end up rolling attacks against too many targets. At the end of a turn all tokens targeted by the GM are untargeted.
  * all tokens. At the end of a turn all dead tokens are untargeted, all tokens targeted by the GM are untargeted and all targets for the player whose token just had a go are untargeted.
* Custom sounds has been rewritten to use a playlist, which should give better control over volume etc. To use custom sounds, create a play list with the sounds you want in it. Then choose that playlist in the midi-qol settings. Then assign sounds from the playlist to the various entries in the list (which will expand). You can leave an entry blank for no sound for that entry.
  * A tiny selection of sounds is distributed with the module and are available in Data/modules/midi-qol/sounds and can be used to setup a playlist. 
  * Item use sounds are available for combo/non-combo rolls. dice/critical/fumble only for COMBO card.
  * **See the readme.md** for sample settings I use. (Item playlist is a playlist that you will have to create).
* New setting. Hide roll details. When selected the GM can choose how much of the GM's attack/damage roll to hide from players, none, formula (just the formula is hidden), all - plyaers only receive notification that a roll was done. (combo card only)
* Update to Damage Only workflow to support combo cards. The damage only workflow will add to the existing chat card for the item. This means you can have an item and, via a macro, do custom damage and it all looks like a standard roll, see Readme.md for an example. If the macro is an item macro the item is self contained. (Macro application requires dynamicitems).
* Localisation imrpovements. Note for trasnalators, options in the config settings are now localisable. Each option has two parts a lower case string that must not be touched and descriptive text that can be changed, e.g. "onHit": "Attack Hits" - do not change "onHit", but feel free to change "Attack Hits". I have added English versions of these to all language files so that the options won't be blank.
* Big update to the readme to cover settings.
**Bug Fixes**:
* Fixed a bug so that doing damage does not require the GM to be on the same scene.

## 0.2.7
* Added support for dice so nice and combo card.
* Added damage buttons to the combo card damage roll. These duplicate the better rolls 5e hover in/out behaviour. Buttons on the combo card and damage card require a target to be selected (useful if not displaying damage application card). Buttons on the apply damage card apply to the targeted token(s), since there is one button per target.
* Always display the item icon in the combo card since it takes up no more room.
* Fix edge case where item card not displayed for items with no effects.
* Added DamageOnlyWorkflow(actor: Actor5e, token: Token, damageTotal: number, damageType: string, targets: [Token])  
Useful for writing macros that have custom damage effects. E.g. Divine Smite that checks target type. This version does not createa a combo card.
* Added auto fast forward for ability saves/checks option, if speed item rolls enabled. Treat ability saves/checks as if Shift was pressed.
* Corrected icons on damage card, which were all the same.
* Corrected incompatibility with MagicItems and speed rolls. If you attempted to speed roll a magic item (i.e. roll the staff attack for a Staff of the Woodlands) the speed item keys would not be passed through, this has been fixed.
* Allow selective removal of item details, to allow showing of PC tiem descriptions but to hide NPC item descriptions also allow force display of item card. Display an item card if nothing else was being displayed when rolling and item (e.g. no attacks/saves/damage).
* Setting to hide the DC of a saving throw from players in chat cards, chat message prompts and LMRTFY requests.
* Fixed regression that caused speed rolls to get stuck on spell cast (hot fixed to 0.2.6)
* Return a promise resolving to the result of item.roll() as the result of actor.useSpell()

## 0.2.6
* Now requires foundry dnd 0.9.6 or later
* Damage buttons for combo card. Significant update to the undo damage card. You can have the card displayed even if damage is not applied, which gives details of all the hit targets and the damage to be applied. There are now 6 buttons per target, reverse and apply the computed damage which sets the hit points/temp hit points before/after the damage. Then the four normal buttons for each target. These buttons apply directly to the appropriate token, no need to select the target to apply damage. Works for GM only but since players cant apply damage to most tokens it should not matter.
* Users can choose their own sounds via file picker for normal attacks, criticals and fumbles. (Meerge Card Only and not better rolls)
* Added option to remove item description from the chat card. This is in addition/instead of the system setting to hide the item description.
* Added an option to hide saving throw DC on chat cards and requests to players to save. For DMs who want a sense of mystery. (Merge Card)
* Added damage types to damage roll display (combo card) instead of the useless heading "Damage".
* A hack that should allow ctl/alt keyboard settings (if speed rolls enabled) to be carried through to the damage roll of a cast spell.
* A little bit of fiddling with the display of the combo card and the config card.
* Removed "Item Macros use Speed Rolls" setting since midi-qol uses standard dnd5e hotbar macros. If speed item rolls is enabled the macro will pass the event through.
* Speed Item rolls is now a check box, since the Item Card will be shown when it needs to be. In the case that you use full auto and not the combo card you will also get an item card, where you would not before.
* Fixed? an incompatibility with CUB 1.2. With CUB 1.2 if you display token names CUB will not hide those via it's hide names setting.
* Changed the message displayed when checking targets selected before rolling to be less "intimidating".

Bug Fixes
* Fix "Add chat damage buttons" setting being ignored. This has moved from the config settings tab to the main settings, since it can be used even if not using midi-qol to do the rolls.
* Added a fix for trying to use an item which has run out of ammunition. Previously the roll would go ahead and and error to console. Because of the way that dnd5e works with ammo consumption (it is not checked until the attack is rolled) you will get an item card displayed, a warning when you try to roll the attack and the workflow will abort. With spells, if you do not have enough spell slots nothing will be sent to chat.
* Fix a bug in timed out saving throws causing an error.

Known Bugs/Lackings
There is a problem with firefox and picking up the keyboard/mouse event in some cases. 
Some user have a problem with using Mess and template placement.

## 0.2.5
* play dice roll sound for combo card - not supported for better rolls or non-combo card. There were no sounds played when the combo card was displayed, since there is no roll rendered to chat. So, add back the dice sounds. Since we have to play it in the module, support different sounds for dice, critical and fumble. Next pass will create a config panel to add your own.
* added new button, auto roll attack. This will cause the attack roll to be initiated, and auto fast forward is respected.  
* previous support for traps broken in midi-qol. This provides enhanced functionality for trap macro writers.
* Place template button removed from item card when template placed.
Support a TrapWorkflow, triggered by
```
new MidiQOL.TrapWorkflow(actor, item, [targets], {x:number, y:number})
```
Which will roll the atack/and or damage and apply to the passed targets. If the item has an area template it will be placed at x,y and targets auto selected inside the template.
Sample DoTrapAttack replacement:
```
  let tactor = game.actors.entities.find(a => a.name === args[0])
  let item = tactor.items.find(i=>  i.name === args[1])
  if (!item) return `/Whisper GM "DoTrap: Item ${args[1]} not found"`
  let trapToken = canvas.tokens.placeables.find(t=>t.name === args[2])
  new MidiQOL.TrapWorkflow(tactor, item, [token], trapToken.center)
  ```
**Bug fixes:**
* item.roll() was not returning anything. Make it return what the underlying item.roll() returns, or the midi-qol item card if appropriate.
* Correct error when rolling without combo card not displaying attacks/damage.
**Notes** 
For those wanting to hide the item description, just use the system setting "Collapse Item Cards In Chat".

## v0.2.4
* Compatible with 0.6.6
* Remove attack/damage buttons as they are "used" even if not using ombo card.
* Put back ctl/alt/shift clicking on character sheet removed in 0.2.3
* With shift being verstatile attacks, now CTL-ALT substitutes for the "default" fast forward shift.
* Chat damage button disabled until other rolls complete, like attack or placing a template. Corrects problem case of rolling damage before rolling attacks. If you try to roll damage while waiting for a template or attack roll you will get an warning notification.
* Identified, but have not fixed, MESS incompatibility, including with placed templates.
* Improved? background colored player names when highlighting cards.
* If not auto targeting we can wait until the damage roll is done before recording targets. This might enable a workaround for mess not working with midi-qol until a proper fix is found
  * Disable auto roll damage.
  * Let mess place the template
  * then roll damage.
* Set user on auto-rolled ability saving throws thanks @spoider
* Disable damage-only workflow until a better solution is found. This will inactivate divine-smite spell in dynamic-effects.

## v0.2.3
* If player rolled saves is enabled and a token is required to save that has default owner pemission (in addition to tokens ownd by a player) a player will be chosen to roll for that token.
* In merge cards critical hits/fumbles are now highlighted.
* Added a new weapon property "Magical" which is also checked when determining if weapon's attack is magical for damage resistance.
* Corrected a typo in the non-magical damage resistance check. Thanks @Jibby
* Fixed a bug that added all possible buttons to almost every chat card.
* Fixed "inventory button" standard roll to work exactly like a standard roll with no auto rolling.
* Coloring of chat card borders/names now gives npc rolls a GM color instead of the player color if the playere initiated the roll. Mainly relevant for saving throw rolls triggered by a player causing the NPC to save.
* Fix for webm tokens causing an error.
* Added require targets flag in config settings. If enabled items that require pre selected targets won't be allowed to proceed without a target being selected. (Better rolls not supported)

## v0.2.2
Made sure all paths are relative paths.

## v0.2.1
* Fix a saving throw bug where the first player saving throw was hidden.
* Fix a race condition that could case saving throw rolls to fail
* Fix an innacurate identification of a damage only workflow.
* Added the ability to set the token name text color OR background color when highlighting chat cards.
* Fixed inability to set range targeting flag.

## v0.2.0 [BREAKING]
* A big change to speed item rolls and auto shift click.  
Speed item rolls now makes no changes to the character sheet, and does not need module suport to work with token bars/macro hot bar. Instead when it is enabled the mouse event is recorded when you do the roll. **The meaning of the keys have changed**:  
  * ctrl = disadvantage attack
  * alt = advantage attack
  * shift means use versatile damage and ctrl/alt still work. I think this is a big improvement BUT **this is a change from both minor-qol and midi-qol. If it causes too much angst I will put back (as an option) the previous behaviour.**  
* AutoShiftClick has been renamed to auto fast forward and applies for attack and damage rolls. When enabled, if a roll would normally produce a dialog a normal roll will be made for attack rolls that have not been "speed" rolled. Damage rolls will be normal or critical if the attack hit and if the option is not set the dialog will be displayed.  
* Better rolls can now use the merge card.  
* A Bug fix for a better rolls edge case when auto checking saves with players rolling saves but not using LMRTFY.  
* Magic Items are now fully supported with speed rolls, advantage/disadvantage on magic item spells/feats and resource consumption works. The only oddity is when casting an area effect spell (.eg. fireball) the template is not automatically placed, but once placed everything works as expected.  
* Fix for range target auto select config not working.

## v0.1.1
Fixes a bug in better rolls spellcasting.
Fixed a couple of localisation omissions.
If you have merge cards on for better rolls the saving throw results are not displayed - diable merge card for better rolls.
