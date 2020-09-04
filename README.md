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

## Short Guide to the settings:
### Workflow settings
* **Speed Item Rolls** - this enables some key bindings for initiating a roll in midi-qol. If enabled:
ctl-click = roll with disadvantage.
alt-click = roll with advantage.
shift-click = roll a versatile attack (ctl/alt still apply) so ctl-shift click is a versatile attack with advantage.
ctl-alt is equivalent to the core shfit-click, i.e. skip the dialog for attack type.

### Display ###
* **Card styles** Midi-qol supports two options for item/attack/damge/save rolls. The combo card merges all of those rolls into a single card. If Megre card is disabled you will get a separate chat card for each roll, the default dnd5e look and feel. The condensed combo card simply put attack and damage next to eachother to convserve a bit more space.
* **Item display**. You can configure whether the item details are included in the combo card. If disabled the item descrition is not added to the card. If enabld you can use the dnd5e setting to choose if it is expanded or hidden when displayed. 
* **Hide Token names**. If the field is blank actual actor/token names will be used in the chat card, hits/saves display for non-GMs. If set to a string the actual names will be replaced in the chat cards with the string. This feature is not a replacement for Combat Utility Belts hide names feature, rather it addresses those fields that CUB does not know about. For full hiding of names on cards and the tracker you need to use CUB in conjunction with midi-qol.
* **Chat cards use token name** By default chat cards are sent with the name of the actor (i.e. "Orc"). If enabled the name of the token will be used instead (i.e. "Orc with a terrible limp").

### Targeting ##
* **Auto target on template draw** If a spell/feature has an area effect templete setting this will auto target (for later damage application) all tokens inside the template when placed. Also the roll will not progress (i.e. roll saves or apply damage) until the template is placed. If "walls-block" is selected then any wall between the template origin and the token will block the targeting.
* **Auto target ranged spells/attacks** If the item specifies a ranged target with a target type of creature/enemy/ally all tokens within range of the caster will be auto targeted whent the effect is cast. enenmy/ally are enemies/allies of the caster. 
* **Auto roll attack**, **Auto roll damage** and **auto fast forward**. The auto roll attack and damage settings tell midi-qol to start an attack roll or damage roll if there is one. The auto fast forward settings determine if the advnatage/disadvantage, critical/normal dialogs are shown or not. Damage can be set to attack hits, which will roll damage only if the attack hits.
* **Require targets to be selected before rolling** It is incredibly common in my games that players forget to target before starting the roll. This setting will not allow them to roll if they have not selected a target and one is needed. (auto target spells, like a fireball are not affected by this setting)

### Saving Throws ###
* **Auto Check Saves** If set to anything other than "Off" saving throws will be created for each targeted token.
  * Save - all see results. Saves are rolled and who saved/failed to save is visible to all users.
  * Save - only GM sees. Saves are rolled and the save/fail display is only visible to the GM.
  * Save - all see + Rolls. Normally the NPC rolls are hidden, this options shows the roll chat cards to all players.
* **Prompt Players to Roll Saves** If "off" set the module will auto roll all saves. If enabled the system will prompt the player to roll their save and wait up to **Delay before rolling** seconds before auto rolling the save for them.
  * Chat Message. A chat message is sent to the player telling them to roll a save. The module will take the next saving throw form the player as the response. They type/dc of the save is not checked so players can roll the "wrong" save.
  * LMRTFY. If the module Let Me Roll That For You is installed and enabled midi-qol will use that to prompt the active player who controls the target (or if there is none, a randomly chose player with ownereship rights to the token) to make the roll. The specific roll details are passed to LMRTFY and multiple rolls (i.e. more than one spell requiring a save) will be correctly allocated.
  * LMRTFY + Query. As above but the player gets to chose advantage/disadvantage.
* **Display Spell DC**. Determines if the saving throw DC is displayed to the players and on the chat cards.
* **Check Spell Text** Affects what the outcome of a save is (i.e. how much damage is applied). 
** The default behaviour is **
  * Assume a saving throw does half damage **unless**:
    * The item is found in a module default list of no-damage spells, SRD cantrips plus SRD spells Disintegrate etc. These are search for by the name of the item being cast, so if you change the name of the spell it will go back to 1/2 damage.
    * The item has the exact text "no damage on save" in its description in which case there is no damage on save.  
If you want to use saving throws to control the application of dynamic effects or calling macros etc, but to not affect the damage applied, think of a weapon that does damage and requires a saving throw or be poisoned. To support those set **Check Spell Text** to true. The behaviour becomes.
  * A saving throw has no effect on damage caused **unless** the item has the exact text "half as much damage" (used in the SRD) or "half damage" in the spell description.

### Damage ###
* **Auto apply damge**
  * Yes, means that damage is auto applied to targeted tokens (**or self if self target is specified**) who were hit or did not save, or who waved and take half damage.
  * "+ damage card". If included a chat card is sent to the GM which includes each target that had damage applied with details of the damge, any immunities/resitances and 6 buttons. The set the target hit points based on the calculation displaed. The first the hp back they way they were before the roll and the second sets them as displayed in the calculation (an undo/redo). The next 4 are the standard DND apply damage buttons but **do not** take into account resitance/immunity.
* **Apply Damage immunities** Midi-qol will use the target resitance/immunity for each type of damage in the attack and calculate how uch of the damage applies. If "+physical" is set midi-qol will look at the item that did the attack to see if the damage is magical or not accoring to the following;
  * If the item is:
    * not a weapon the damge is assumed to be magical
    * a weapon has an attack bonus > 0 it is assumed to be magical
    * a weapon has the "Magical" property set attacks are considered magical. (The magical property for weapons only exists if midi-qol is enabled)
* **Auto Apply Item Effects** If the item had dynamiceffects active effects specified and the target was hit and did not save, or did not save or there are no attacks or saves dynamiceffects is called to apply the active effects to each such target. This includes self if a self target is specified.

## Other QOL settings ##
* **Add attack damage buttons to the inventory** If enabled a set of buttons (to bypass the midi-qol behaviour) are added to the description drop down in the inventory.
* **Fast forward ability rolls** If enabled allows you to bypass the advantage/disadvantage question when roll ability saves/checks, ctrl/alt are supported.
* **Critical Damage Type** adds options for how critical damage is treated. Only in core 0.7+.
* **Add Damage Buttons to Chat** If enabled then any dnd5e standard damage roll (not mess/BR etc) will have damage buttons added that appear on hovering over the card, provided a token is selected and allow applying damage to the **SELECTED** token, the damage immunities setting is used. This is the only place where midi-qol uses the selected token rather than targeted.
* **Item Delete Check** Displays a confirmation dialog if an item is deleted from the inventory.
* **Colored Border** Use the player color to put a colored border and/or color the actor/token name on chat messages.
* **DM sees all whispered messages** Copy the GM on all whispered messages.
* **Untarget at end of turn** At the end of a players turn(i.e. combat tracker is advanced) all/dead targeted tokens are untargeted. There is a GM option since I regularly forget to untarget after an attack and break things on the next turn. If midi-qol is managing the roll then dead tokens are untargeted after an attack, so that players can avoid "flogging a dead horse" as it were.
* **Players control invisible tokens** 0.7.1+. If enabled then players can both see and control tokens they own that are hidden. Also any token they own will **always** appear on their map.

If the above was all too tedious here are the setings I use which .
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

## Notes
For modules that want to call midi-qol it is easier than in minor-qol.
Just call item.roll, and if you pass an event via item.roll({event}) you can have key accelerators.
event.altKey: true => advantage roll
event.crtlKey: true => disadvantage roll
event.shiftKey: true => auto roll the attack roll

## Sample Chat Logs
![No Combo Card](pictures/nocombo.png) ![Combo Card](pictures/combo.png)
