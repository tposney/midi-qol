# midi-qol
Midi-qol is a replacement for minor-qol and you should not have both modules active at the same time, but both can be installed at the same time.
This is an 0.1 release and should be considered beta. It is unlikely to destory your world, but I guess it might.
Because there are some subtle differences in the way the module works, comapared to minor-qol you will need to experiment with the settings.
See minor-qol for most of the feature description.

Changes in midi-qol:
* Speed item rolls has only a single function now, to enable ctl/shift/alt when clicking on the item icon. All other workflow features are configured separately.
* There is support for a merged chat card containing attack/damage/hits/saves. (The merged card does not yet support better rolls). You can disable the merge card to restore the same operation as in minor-qol.
* midi-qol works with MagicItems, there may be some wrinkles aoutstanding there.
* backwards compatibility for the minor-qol.doRoll function.
* Lots more configuration options, accessed by a configuration screen.

## CUB and midi-qol
If you have just upgraded CUB to 1.2 There is an incompatibility until CUB 1.2.1 is released.
If this is your problem you will see an error (Uncaught in Promise) cannot read property 'data' of null in itemhandling.js.
If you are adventurous you can change 
line 143 in Data/modules/combat-utility-belt/hide-names/hide-npc-names.js 
from
```
        const token = canvas.tokens.get(messageTokenId) ?? tokenData ? new Token(tokenData) : null;
```
to
```
        const token = canvas.tokens.get(messageTokenId) ?? (tokenData ? new Token(tokenData) : null);
```
and the problem should go away. I'm hoping that a fix for that will appear soon in CUB

## Changelog
https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md


## Technical Differences:
* midi-qol does not use the creation of chat messages as the triggeer anymore, rather it hooks the standard item.roll, item.rollAttack, item.rollDamage.
* midi-qol uses the new 0.9.5 chat message meta-data to determine if a roll is a damage/attack/save roll which means the specific text matching piece is gone.

## Settings for  full auto mode:
* Speed Item Rolls on - if you want to be able to shift/ctl/alt click.
* Merge to One card checked,
* Condense attack/damage cards checked.
* Auto Target on template Draw - walls block
* auto range target. Leave off until you are comfortable with the way everything else works.
* Auto shift click - attack and damage. If you want to be prompted as to advantage/disadvanate/cirital/normal adjust appropriately. Even if enabled midi-qol will use the result of an attack (critica/normal) to do the roll.
* Auto Check Attacks - Check your choice as to whether the players see the results.
* Auto roll damage - Attack Hits
* Saves - Save, your choice of whether the players see the results
* Check text save - depends on you. If enabled the text of the spell description is searched to see if the damage on save is half/no damage.
* Players Roll saves - Let Me Roll That For you
* PLayer save timout - I give my players 20 seconds but you can choose what works for you.
* Auto apply damage - yes + undo damage card
* damage immunities - apply immunities + physical. (if a weapon attack has a plus in the item detail or the damage came from a spell) the damage is considered magical.
* auto apply item effects to targets checked. This will apply any dynamic effects to targets when:
1. The item has a save and the save fails.
2. The item has an attack and the attack hits.
3. There is no attack or save.

## Bugs
probably many however....
* Language translations are not up to date.
* Unselect targets at end of turn not implemented yet.

## Notes
For modules that want to call midi-qol it is easier than in minor-qol.
Just call item.roll, and if you pass an event via item.roll({event}) you can have key accelerators.
event.altKey: true => advantage roll
event.crtlKey: true => disadvantage roll
event.shiftKey: true => auto roll the attack roll

## Sample Chat Logs
![No Combo Card](pictures/nocombo.png) ![Combo Card](pictures/combo.png)
