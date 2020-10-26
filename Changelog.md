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
* Fixed an 0.7.2. incompatibility. Not fully tested but should work with 0.7.2
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
