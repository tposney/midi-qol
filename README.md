Midi-qol is a module designed to help automate various parts of your game, specifically rolling attacks/casting spells and applying damage/effects.

It has LOTS of configuration options which can be daunting.

# Bug reports
**As of version 0.8.19** you can export your midi-qol settings to a json file. When posting a midi-qol bug report export your settings and add the json file to the issue. I won't look at issues without this information.

# midi-qol
Midi-qol is a replacement for minor-qol and you should not have both modules active at the same time.  (Both can be INTSALLED at the same time, but only one should be ACTIVATED.)  Because there are some subtle differences in the way the midi-qol works compared to minor-qol you will need to experiment with the settings.

## HELP! My midi-qol disappeared.
If you've just updated midi-qol and it disappears from your in-game list of modules you probably need to update your dnd5e system to the latest one.

## I just upgraded and nothing works anymore. 
I've seen a couple of cases where after migration of foundry versions the per player setting "enable workflow automation" gets set to off. This flag being unset causes midi to do nothing with rolls (hence the nothing works). **Also note that this is a per player setting, so each user needsd to make sure it is on.**

## Midi works for some players and not for others....
Same problem as above - check workflow automation is enabled on all clients. You can use the module SocketSettings to force set the setting on all clients.

## Items I bring in from the sample compendium don't work. 
Some of the items require creating a DamageBonusMacro, make sure that is enabled in the midi settings. Also, if the damage bonus macro effect runs an ItemMacro.ItemName, the name of the feature needs to match the name of the item macro being run. For example Rage MQ0.8.9, will have to be renamed Rage when equipped on a character or the damage bonus macro won't run. I know this is not ideal, but I wanted to make clear when the version of the items changed.

[TOC]

# Changes in dnd5e 1.5:
## Weapon Critical Threshold
* dnd5e 1.5 includes per weapon critical threshold and bonus critical damage dice. There is now a configuration setting to enable/disable the midi-qol field on the item sheet. You are stongly encouraged to migrate to the dnd5e setting and disable the midi-qol flag, via Use Midi Critical in the configuration settings. Soon, I will remove the midi-qol field completely. You can run ```MidiQOL.reportMidiCriticalFlags()``` from the console to see which actors/tokens have the midi-qol critical setting defined.
## Enhanced dnd5e critical damage effects. 
You can make most of the changes that midi-qol supports for critical hits via the new game settings (max base dice, double modifiers as well as dice) and per weapon settings (additional dice). You will need to experiment to cofirm the interaction of the dnd5e critical damage flags and the midi-qol settings, however if you use the dnd5e default setting in midi-qol the rolls will not be modified by midi in any way and the dnd5e system will operate.

# Changelog
https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md

# Symbiotic Modules
I don't spend a lot of time examining all of the modules that are written (and there are hundreds) so it is almost certain that other modules can substitute for the Highly Recommended/Good to Have just as well. If your favorite module is not in the list, it probably means I just don't know about it.

## Required Modules
* libwrapper
* socketlib

## Almost Required
You can survive without these but midi pretty much assumes they are installed.
* Advanced Macros
* DAE
* Times-up - for automated expiry of effects. If you don't use combat expriy then you can use about-time instead.
* Simple calendar - to manage the game clock

## Highly Recommended
* Either LMRTFY or Monks Token Bar (or both) to manage saving throws
* Either Convenient Effects or Combat Utility Belt (or both)
* Item Macros
* DAE SRD/Midi SRD (elots of prebuilt items)
* Token Magic - lets you add some spiffye graphical effects to spells.
* libChangeLogs - will show the midi change log when it changes
* Smalltime - to make time advancement easy.
* Active Auras - works well with midi/dae and some of the sample items require it.
* Automated Animations - If you have the jb2a module this will automatically add lots of animations to spell/weapon effects.

## Good To Have
* Active Token Lighting
* levels - if you are doing anything with height.
* levels - Volumetric Templates
* dnd5e-helpers
* Dice So Nice if you like 3d dice rolling pretty much the only choice.
* Better Rolls if you don't like the default dnd attack/damage roll cards. Better Rolls is mostly compatible with midi-qol.

# (In)Compatibilities? ##
As already mentioned I don't look at lots of modules, so there will be others that do/don't work with midi. As they come to my attention I'll try and update the list.

## Dice So Nice
Midi generally works with dice so nice, but the interactions are more complicated with the merge card.

## Let Me Roll That For You
Midi-qol can use Let Me Roll That For You for player/gm saving throws and is the preferred roller.

## Monks Token Bar
Midi-qol can use Monk's Token Bar to roll saves. If using Monk's token bar flags.midi-qol.(dis)advantage.concentration and magic resistance won't work.

## Convenient Effects
Midi supports the application of Convenient Effects spell/item effects (configuration setting - Apply Convenient Effects) and matches those by name. For example, if you cast the spell Bless midi will see if there is a convenient effect "Bless" and apply it to any targets that were hit by the spell.

If you have apply convenient effects set and use items from the DAE SRD/Midi SRD modules, **you will get a double up of the effect**. You need to choose how you want the item to behave, if using convenient effects, delete the DAE SRD effects. The double up problem is intentional, since you might wish to augment the Concenient Effect definition with your own extra effects on the item.

There is an additional check box available on the item sheet, for items that have corresponding convenient effects. The check box reverses the apply convenient effects setting for that item. If you have "auto apply convenient effect" set to true, the check box will disable the auto applicaiton for that one item. Similarly, if you have "auto apply convenient effect" set to false, the check box will enable the auto applicaiton for that one item. 

## levels
- Midi-qol will use the levels wall collision detection for it's distance calculations/LOS calculations.

## levelVolumeticTemplates
- Midi-qol will use levels volumetric template target calculations if installed.

## DF Quality of Life
- Midi-qol does NOT implement the RAW Dnd5e template coverage, it uses the Foundry template coverage. DF Quality of Life implements the correct dnd5e template coverage, so you can disable midis auto area of effect targeting and use DF Quality of Life instead, but you won't get on the fly targeting.

## Furnace (deprecated for Foundry 0.8.x - Use Advanced Macros)
If you intend to make use of any of the macro features in midi-qol you will need to install the Advanced Macros module.

## Better Rolls
If you are using Better Rolls (which is a great module), midi-qol takes over once the hit/damage card is placed by Better Rolls. This means that resource consumption, template placement, critical/fumble, and  advantage/disadvantage determination are **all** handled by Better Rolls before midi-qol kicks in. Midi-qol checks hits, saves, applies damage, and calls active effects.  In particular, Better Rolls does not use any of the flags.midi-qol....   

## Magic Items
**(Thanks to @simone for his help)**
Midi-qol is mostly compatible with magic-items. The only issue is that spell templates for spells in a magic item are not auto-placed on casting. Once placed everything works as expected. Spells/features that can be rolled will work.  
Items that create changes by being present in the characters inventory (i.e. passive/transfer effects) won't behave as expected since they are actually held in the characters inventory, this includes transfer active effects.  
Reaction processing won't recongise Magic Item spells.

## Mess
 Midi-qol and Mess dnd5e effects are not compatible. Template effects and the other features of that excellent module should work. If you want Mess attack/damage cards don't use midi-qol.  

## Cozy player
Minor-qol was not compatible with cozy-player, with targets being lost before attack/damage rolls were made. I have done only limited testing but it seems that there are no problems with cozy-player and midi-qol.  

## Cautious GM
Midi-qol breaks the blind chats by hidden GM feature of cautious GM.  

## Chat Portraits
 If using Chat Portraits, the changes made by midi-qol to the token/actor name in chat cards are overwritten/lost. Choose which sort of highlighting you want - only one will work. Otherwise, all seems to work.

## Ez-Roller
The send to chat log feature of ez-roller will disable combo cards in midi-qol.  

## Combat Utility Belt
CUB concentrator and midi-qol concentration automation are incompatible. Choose one or the other. If you want concentration to expire at the end of the spell you need to install times-up.

## Maestro
Maestro looks for the attack roll chat card in the chat log to play its critical/attack/fumble sounds. If you are using the merge card then the attack roll card is never created and Maestro can't play its sounds. You can use the midi-qol custom sounds instead.

## Item Macro
 You can create itemMacro macros with this module and call them from midi's onUse/DamageBonus macro fields by adding ItemMacro (case-sensitive) in the macro field.

If you have installed itemmacro please make sure you disable the ItemMacro config settings:

  * "character sheet hook" else when you use the item the macro will get called bypassing midi-qol/dae completely and none of the arguments will get populated.

  * "override default macro execution"  If this is enabled the hotbar hooks will directly call the item macro and won't work as expected for dae/midi.  
The settings are per player so each player needs to change the setting to disabled.  

## Dnd5e-helpers
Midi-qol has configuration options (in the optional rules section) to incorporate the AC bonus calculated by dnd5e-helpers. There are two settings dnd5e-helpers which allows an attack if any of the 4 corners of the target are visible and dnd5e-helpers+AC which will include the AC bonus from armor when calculating a hit. The bonus AC on the target will be displayed in the to hit card.

# Short Guide to configuration settings
The heading says short, but it really isn't.

## Workflow settings
* **Speed Item Rolls** 
Poorly named, but historical, speed item rolls let you configure how the ctl/alt/shift keys work.

If speed rolls are off, all of the ctrl/alt|meta/shift keys and roll behaviour are the same as in core. There is one additional feature: if you click on a damage button in chat, CTRL+ALT click will use the critical/normal hit status from the midi-qol roll data.

If speed rolls are enabled you need to assign the keys yourself.
If you enable speed ability rolls as well, your key mappings will apply to ability check, save and skill rolls as well.

* advantage key modifier, defaults to Alt/Meta
* disadvantage key modifier, defaults to Ctrl
* versatile key modifier, defaults to Shift.
* critical damage modifier, defaults to Alt/Meta.
* fast-forward key (turn any attack or damage roll into a fast-forwarded or disable auto fast-forward if set) advantage+disadvantage.

If you have speed item rolls enabled **Caps-Lock** behaves as if advantage & disadvantage are both pressed, which will invert the fast forward automation setting for rolls. 

If you assign a key multiple meanings the behaviour is going to be confusing at best.

## Display
* **Card styles** Midi-qol supports two options for item/attack/damage/save rolls. The Merge card combines all of those rolls into a single card. If Merge card is disabled you will get a separate chat card for each roll, which is the default dnd5e look and feel. The condensed Merge card simply puts attack and damage next to each other to conserve a bit more space. The merge card is recommended.
* **Show Item details in chat card**. You can configure whether the item details are included in the chat card. If disabled, the item description is not added to the card, you can configure which items have the info displayed. If enabled, you can use the dnd5e setting to choose if it is expanded or hidden when displayed. 
* **Chat cards use token names**. If the field is blank actual actor/token names will be used in the chat card, hits/saves display for non-GMs. If set to a string the actual names will be replaced in the chat cards with the string. This feature is not a replacement for Combat Utility Belts hide names feature, rather it addresses those fields that CUB does not know about. For full hiding of names on cards and the tracker you need to use CUB in conjunction with midi-qol.
* **Chat cards use token name** By default chat cards are sent with the name of the actor (i.e. "Orc"). If enabled, the name of the token will be used instead (i.e. "Orc with a terrible limp").
* **Hide Roll Details** There are several settings, hide roll formula, hide all details, d20Attack + hide roll formula, show d20 attack roll only amongst others. Some only work with the merge card.

## Targeting
Almost everywhere midi-qol uses the **targeted** tokens to apply hits/saves/damage not **selected** tokens. Targeted tokens have 4 arrows pointing at the token and selected tokens have a box around them.

* **Auto target on template draw** If a spell/feature has an area effect template then enabling this setting will auto target (for later damage application) all tokens inside the template once placed. Also, the roll will not progress (i.e. roll saves or apply damage) until the template is placed. If "walls-block" is selected then any wall between the template origin and the token will block the targeting.
* **Auto target for ranged spells/attacks** If the item specifies a ranged target with a target type of creature/enemy/ally then all tokens within range of the caster will be auto targeted when the effect is cast. “enemy/ally” are enemies/allies of the caster. 
* **Auto roll attack**, **Auto roll damage** and **Auto fast forward rolls**. The auto roll attack and damage settings tell midi-qol to start an attack roll or damage roll if there is one. The auto fast forward settings determine if the advantage/disadvantage and/or critical/normal dialogs are shown or suppressed. Damage can be set to “Attack Hits”, which will roll damage only if the attack roll was sufficient to hit the target. These are settable on the GM/Player tabs.
* **Require targets to be selected before rolling** It is incredibly common in my games that players forget to target before starting the roll. This setting will not allow them to roll if they have not selected a target and one is needed. (Auto-target spells - like a fireball - are not affected by this setting.)

## Saving Throws
* **Auto Check Saves** Set this to “None” if you wish the players or GM to be responsible for rolling and evaluating saving throws.  (If you want only one group to roll manually and the other to roll automatically, set this to “None” and make appropriate choices for the “Prompt Players to Roll Saves” and “Prompt GM to Roll Saves” settings).  Otherwise, set this to control the visibility of saving throws that will be automatically rolled and evaluated for each targeted token.
  * Save - all see results. Saves are rolled and who saved/failed to save is visible to all users.
  * Save - only GM sees. Saves are rolled and the save/fail display is only visible to the GM.
  * Save - All see results + Rolls. Normally the NPC rolls are hidden; this option shows the roll chat cards to all players.
* **Prompt Players to Roll Saves** If "None" set the module will automatically roll all saves.  If set to another value, the system will prompt the player to roll their save and wait up to **Delay before rolling** seconds before auto rolling the save for them. You can also specify Monks Token Bar for saves. Monk's token bar rolls do not support setting of advantage by midi-qol.
  * Chat Message. If selected, an impacted player will receive a whisper in chat prompting them to roll a saving throw.  The module will assume that the next saving throw in the chat stream from this player was the requested roll and evaluate it.  
  * Let Me Roll That For You.  If selected (and LMRTFY is installed and enabled), midi-qol while use LMRTFY to prompt the player who controls the target (or, if there is none, a randomly chosen player with ownership rights to the target) to make the roll.  The specific roll details are passed to LMRTFY and multiple rolled (i.e. more than one spell requiring a save) will be correctly allocated.
  * Monks Token Bar. If selected (and monks-tokenbar is installed and active) characters with a logged in player owner will be added to a monks token bar savng thow dialog. Completing the roll from the dialog will be used as the save. Monk's token bar rolls do not support setting of advantage by midi-qol.
* **Prompt GM to Roll Saves** Set this to “Auto” to have midi-qol automatically roll and evaluate NPC saving throws on behalf of the GM.  Set to “Let Me Roll That For You” to instead have the LMRTFY module prompt the GM for NPC saving throws. You can also use Monks Token Bar saving throws.
* **Display Saving throw DC**. Determines if the saving throw DC is displayed to the players and on the chat cards. If unchecked, saving throws will display on the chat card with the value replaced by “??”. 

**Saving Throw Multiplier**
You can ignore this section until you find spells/weapons that don't do what you'd expect.
TL;DR: If you are just using standard items you can just leave things at the defualt and most saves will do 1/2 damage as you'd expect, monsters (like a giant spider) will (if Roll Other Damage is enabled) do base weapon damage and have a save applied to the bonus poison damage.
  * There is a config setting, default save multipler (defaults to 0.5). If there are no special overrides then a saving throw will do 
    `rolled damage * defaultSaveMultiplier` damage. When set to 0.5 saving against the attack will do 1/2 dmaage, like most cases for dnd.
  * There are a number of ways to overide the default multiplier.
  * If the item description includes the text "no damage on save" (or the localized equivalent) then a save will do no damage.
  * If the item description includes the text "full damage on save" (or the localized equivalent) then a save will still do full damage. You can use this for attacks that do damage, and have a save for a condition being applied, like poisoned and so on.
 *  flags.midi-qol.potentCantrip, if set cantrips cast by the actor will do 1/2 damage instead of no damage. Overrides any other damage multiplier settings.
  * If the setting "search spell description" is set, items with the text "half as much damage" (or the localized equivalent) will do 1/2 damage on a save ignoring the defalt multiplier. If the text is not found the save will use the defaultSaveMultiplier.
  * For weapons (only) there are weapon properties for 1/2, full or no damage saves. These properties override any other settings. If not present the save multiplier will be worked out as above. 
  * For weapons (only) the save multiplier appplies to the whole damage roll **UNLESS**...
    * You have enabled "Roll other damage on mwak/rwak" (which is intended sepcifically to support attacks that have base damage + extra damage with a save - think spider bite). If the weapon has a save specified **AND** the weapon has an Other Damage formula, the saving throw multiplier applies to the Other damage and the base damage is applied as full damage.
    * Because of the way the SRD monsters have been setup, (i.e. extra damage as versatile damage and the the versatile property not set) the versatile formula will be treated as Other Damage if there is no Other Damage formula and the weapon property "versatile" is not set. 
    * For BetterRolls you have to enter the damage into the Other field and enable roll Other in the better rolls settings. Midi will pick up this damage and apply the saving throw result against it.

For those who have a lot of weapons set up with a save and want the default damage on save to be full damage (which is what a pervious version enabled when search spell description was enabled) just edit the items and set the save to full damage on save (preferred) or set the default save multiplier to 1.

## Hits
You can enable auto checking of hits. Fumbles automatically miss and criticals automatically hit. As GM you can mouse over the name of the hit target to highlight the token and click to select it. This is useful if you are not auto applying damage, since you can do all the damage application from the chat log, by clicking on the targets name, then clicking on the appropriate damage button.

## Damage
* **Auto apply damage to target**
  * Yes: Damage is auto-applied to targeted tokens (**or self if self-target is specified**) that were hit or did not save, or that saved and take half damage.
  * "+ damage card": If included, a chat card is sent to the GM which includes each target that had damage applied with details of the damage, any immunities/resistances and 6 buttons. They set the target hit points based on the calculation displayed. The first sets the hp back the way they were before the roll and the second sets them as displayed in the calculation (an undo/redo). The next 4 are the standard DND apply damage buttons but **do not** take into account resistance/immunity.


* **Apply Damage immunities** Midi-qol will use the target’s resistance/immunity/vulnerability settings for each type of damage in the attack and calculate how much of the damage applies. If "+physical" is set midi-qol will look at the item that did the attack to see if the damage is magical or not according to the following:
  * If the item is:
    * not a weapon: the damage is assumed to be magical
    * a weapon has an attack bonus > 0: it is assumed to be magical
    * a weapon has the "Magical" property set: attacks are considered magical. (The magical property for weapons only exists if midi-qol is enabled)
* **Auto apply item effects to target** If the item had dynamic effects which are currently active as specified and the target was hit and did not save; OR did not save; OR there are no attacks or saves: dynamic effects is called to apply the active effects to each such target. This includes self if a self target is specified.

### **Roll Other formula for rwak/mwak** **Roll Other formula for spells**

Roll Other Damage has 3 options, "off": never auto roll the other damage, "ifsave": roll the other damage if a save is present (this is the same as the earliere version of this setting) and "activation": if the item's activation condition evaluates to true then roll the Other damage even if no save is present. "activation" also requires that the item attunement not be "Attunement Required", i.e. dragon slayer weapons do no extra damage if they are not attuned.

Most creature attacks with extra damage (poisonous bite) equate to the ifSave setting.
Magic items that roll additional damage if a particular condition is true (slayer weapons) require the "activation" setting.

midi will evaluate the activation condition as an expression, providing, the actor, item and target actor's (@target) roll data. For example:
```
    "@target.details.type.value".includes("dragon")
```
will only roll if the target has a type of dragon. 
**An empty activation condition** will evaluate as true. If you don't want a specfic weapon to roll Other Damage set Activation Condition false.

You can add the above conditon to the SRD slayer items to make the bonus damage automated based on target type.

If the weapon rolling the attack has ammunition AND the weapon does not have it's own Other Roll defined, the Other activation condition, Other roll and saving throw from the ammunition will be used instead of the attacking weapon. (Arrow of Slaying).

There is a new weapon property "Crit Other Roll" which if set means that the "Other Damage" roll will be rolled as critical if the base roll is critical. Previosly Other Damage would never roll critical damage. You can decide if your Arrow of Slaying can do critical damage or not.

## Custom Sounds
* Midi-qol uses whatever audio files you want for sounds, but they must all be in the same playlist. I will be extending the sound options, next will be specific sounds by damage type, then sounds per item use.
* A tiny selection of sounds is distributed with the module and are available in Data/modules/midi-qol/sounds and can be used to setup a playlist. 
* Attack, critical and fumble sounds are only available if using a combo card.
* Item use sounds are available when midi-qol is enabled and handling the roll (i.e. not Better Rolls).  
![Custom Sound Settings](pictures/sound.png)

## Other QOL settings
* **Add attack damage buttons to the inventory** If enabled then a set of buttons (to bypass the midi-qol behaviour) are added to the description drop down in the inventory.
* **Fast forward ability rolls** If enabled, allows you to bypass the advantage/disadvantage question when rolling ability saves/checks; ctrl/alt are supported.
* **Critical Damage Type** adds options for how critical damage is treated. Only in core 0.7+.
* **Add Damage Buttons to Chat** If enabled then any dnd5e standard damage roll (not mess/BR etc.) will have damage buttons added that appear on hovering over the card, provided a token is selected and allow applying damage to the **SELECTED** token, the damage immunities setting is used. This is the only place where midi-qol uses the selected token rather than targeted.
* **Item Delete Check** Displays a confirmation dialog if an item is deleted from the inventory.
* **Colored Border** Use the player color to put a colored border and/or color the actor/token name on chat messages.
* **DM sees all whispered messages** Copy the GM on all whispered messages.
* **Untarget at end of turn** At the end of a players turn(i.e. combat tracker is advanced) all/dead targeted tokens are untargeted. There is a GM option since I regularly forget to untarget after an attack and break things on the next turn. If midi-qol is managing the roll then dead tokens are untargeted after an attack, so that players can avoid "flogging a dead horse" as it were.
* **Players control invisible tokens** 0.7.1+. If enabled then players can both see and control tokens they own that are hidden.  Also, any token they own will **always** appear on their map. **Deprecated** Please use the excellent Your Tokens Visible instead.
* **Force Hide Rolls** If enabled then private/blind/gm only rolls will only appear on the recipient’s chat log. This must be enabled if you are using Better Rolls and combo cards.  

## Optional Rules
Midi supports various optional rule settings that can be useful.
* **Incapacitated Actors cant make attacks.**
If a token has 0 HP, they cannot attack
* **Invisible/Hidden Token attack with advantage**
If a token is invisible/hidden (CUB/Condtional Visibility) it attacks with advantage.
* **Attack remvoes hidden/invisible**
Remove invisible/hidden when making an attack
* **Check Weapon range when attacking**
Check the range of the weapon when doing an attack. Impose disadvantage for range > short range. Fail if range is > max range.
* **Include Height in range calculation**
Take token height differences into account when checking range.
* **Ranged attacks when Foes are closer than X have disadvantage**
If you make a ranged attack when a foe is less than X feet/meters from you the attack is made at disadvantage.
* **House rule for Damage Reduction**
Choose how to combine Damage Reduction
* **Critical/Fumble for saving throws**
Critical saves always succeed, fumbled saves always fail.
* **(House Rule) Ranged attacks at foes with nearby allies have disadvantage**
If making a ranged attack at a target whose size is less than that specified and there is an ally within 5 feet of the target the ranged attack is made with disadvantage. (You want to avoid hitting your friends but really big targets can still be hit safely).
* **Active Defence**
Expirmental: Support for the Active Defence variant rule. Enable via optional rules setting Active Defence. 

Requires LIMRTFY and does **not** work with better rolls. 
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


### Settings for full auto mode:
If the above was discussion was all too tedious here are the settings I use.
* Speed Item Rolls on - if you want to be able to shift/ctrl/alt click.
* Merge to One card checked,
* Condense attack/damage cards checked.
* Auto Target on template Draw - walls block
* auto range target. Leave off until you are comfortable with the way everything else works.
* Auto FastForward - attack and damage. If you want to be prompted as to advantage/disadvantage/critical/normal adjust appropriately. Even if enabled midi-qol will use the result of an attack (critical/normal) to do the roll.
* Auto Check Hits - Check your choice as to whether the players see the results - I use on.
* Auto roll damage - Attack Hits
* Saves - Save, your choice of whether the players see the results - I use players see results.
* Check text save - depends on you. If enabled the text of the spell  description is searched to see if the damage on save is half/no damage.
* Players Roll saves - Let Me Roll That For you
* Player save timeout - I give my players 20 seconds but you can choose what works for you.
* Auto apply damage - yes + undo damage card
* damage immunities - apply immunities + physical. (if a weapon attack has a plus in the item detail or the damage came from a spell or the Magical property is checked) the damage is considered magical.
* auto apply item effects to targets checked. This will apply any dynamic effects to targets when:
1. The item has a save and the save fails.
2. The item has an attack and the attack hits.
3. There is no attack or save.


### midi-qol Alternate QuickStart Settings
**contributed by dstein766 (aka OokOok on Foundry discord)**
Another collection of settings, designed to achieve these goals:
* Players always roll their own attacks, damage, saves, etc.  (The computer still rolls the dice, but the player is always in charge of initiating the rolls.  The computer never rolls dice without the player’s interaction.)
* Support automatic application of relevant dynamic active effects for the widest possible set of PCs and NPCs.
* Support automatic application of advantage and disadvantage without player selection.
* Do NOT display hit/miss results to players – let them wait for the DM to tell them the result.
* Do NOT display the success/failure of saving throws automatically – let the DM tell the players when it is appropriate.
* Do NOT generate damage results until a hit is confirmed.  
* Do NOT display saving throw DCs to players.
* Targeting is optional.  (This increases the workload on the GM…but experience around my table is that players don’t like the extra step so I made it optional.)
* Place useful information into chat regarding spells cast or items used, but do NOT print fluff for weapons.  (Weapon attacks happen often enough that anything beyond dice roll results causes too much “bloat” in the chat window.)
* Support (optional) rolling of physical dice by players while retaining as many of the prior goals as possible.  To support physical dice rolling I use the module DF Manual Rolls.  The player rolls his physical dice and inputs his UNMODIFIED results into a dialog.  Those results are then passed to midi-qol, which applies all appropriate modifiers and proceeds as if the computer had rolled the supplied results.  End result is that players can roll physical dice OR let the computer roll the dice, but ultimately everyone benefits from the midi-qol workflow.
#### Basic module settings:  CHECK (enable) the following OR select from the drop-down: 
* Enable roll automation support
* Add attack/damage buttons to item inventory list
* Add damage buttons to chat message
* GM sees all whispered messages
* Really hide private/blind/self rolls
* Fast forward ability rolls
* Choose how to roll critical damage: as per your house rules
* Experimental: Apply checks before doing speed/macro roll
* Colored Border Messages: your choice (I use Borders Only)
* Untarget at end of turn: your choice (I use untarget dead and all GM)
* Players control owned hidden tokens
#### Workflow/GM: CHECK (enable) the following OR select from the drop-down:
* Auto roll attack
* Auto fast forward attack
* Auto roll damage: Never
* Auto fast forward damage
* Remove chat card buttons after roll: your choice (I use Off)
* Hide roll details: your choice (I use none, which means anyone can click on the result to display the roll formula and actual die rolls)
#### Workflow/Player: CHECK (enable) the following OR select from the drop-down:
* Auto roll attack: UNCHECKED
* Auto roll damage: Never
* Auto fast forward rolls: Attack and Damage
* Remove chat card buttons after roll: Attack and Damage
#### Workflow/Workflow: CHECK (enable) the following OR select from the drop-down:
* Auto target on template draw: Walls Block
* Add macro to call on use [none of the Goals require this…but it enables me to use macros to do things like cool animations.  Turning this on does nothing on its own – it has to be paired with actual macros.  However, turning it on w/o having any useful macros also won’t hurt you.]
* Enable concentration check [and make sure you turn off CUB Concentrator if you are also use Combat Utility Belt]
* Single concentration check
* Auto apply item effects to target
* Auto check if attack hits target: Check – only GM sees
* Auto check saves: Off
* Display saving throw DC: UNCHECKED
* Search spell description
* Prompt players to roll saves: Chat Message
* Prompt GM to roll saves: Auto
* Delay before rolling for players: 20
* Auto apply damage to target: No [this makes more work for the GM, but if players aren’t forced to designate their targets you’ve already signed up for this]
* Apply damage immunities: apply immunities + physical
* Roll Other formula on failed save for rwak/mwak

#### Workflow/Misc: CHECK (enable) the following OR select from the drop-down:
* Show item details on chat card: Card + Details: NPC + PC
* Show details: I have everything checked EXCEPT weapon.  This means that * every time someone “rolls an item” all the item text get shown in chat.  So when someone casts a spell, the full text of the spell shows up so everyone can review it.  Ditto for inventory items, wands, staves, rings, etc.  I do NOT do this for weapons because I don’t want to see all the details about Bob’s sword every single time he makes an attack.
* Merge rolls to one card
* Condense Attack/Damage rolls
* Chat cards use token name
* Keep roll statistics (save every 20)
* Enable speed item rolls
* Enable speed ability (save/check/skill) rolls
* Advantage=alt, disadvantage=ctrl|cmd, critical=alt, versatile=shift
* As of the time of this writing (March 8, 2021) I am using ALL the optional rules except that last one (labeled “House Rule”).

# Some Features

## **Roll Statistics.**
  * Most of the time when an attack roll is made or a spell is cast that does damage, the actual attack and damage rolls are recorded. This is recorded for every unique actor, on both a session and lifetime basis, as well as recording the same data for each item used by the actor on a session basis. So you might be able to answer questions like "is my longsword better than my dagger given the foes we are fighting?" The data kept is
  * #attack rolls
  * #criticals
  * #fumbles
  * #number of natural 20's
  * #rolls that did damage
  * The average damage rolled per attack. This is the raw damage before resistances/saves. If you were using the wrong weapon against a target then the total damage might be high, but the applied damage would be low. For AoE spells the total of the dice rolled is recorded, ignoring the number of targets.  
  * The average damage applied per attack.  If you have an area effect spell this might do X points of damage to Y opponents, meaning the applied damage is X * Y and then modified by saves/resistances. The applied damage includes saves and immunities so might be an effective measure of damage per use, but recognizes the value of AoE spells in doing mass damage.  
  
  The data is stored in settings.db, via a world setting. You probably don't want to hit the database for every roll made by any player/monster, so you can specify how often the data is saved, I suggest every 10-20 rolls, rather than every roll. The graphical display is updated whenever the data is saved to permanent storage and locally for players own rolls.  
  * MidiQOL.gameStats.clearStats() to reset all data. (GM Only)
  * MidiQOL.gameStats.clearActorStats(actorId) to clear the stats for a given actor. (GM only)
  * MidiQOL.gameStats.endSession() to end the current session and start a new one. (GM only)
  * MidiQOL.gameStats.showStats() display a window displaying the statistics kept. Players only see their own characters.
  * MidiQOL.gameStats.statData returns the current statData (have a look and see what is stored)

## Concentration Checks
support for **concentration automation**. The is dependent on DAE being installed and of the right version and **requires** CUB concentration automation to be disabled. Midi will work with Convenient Effects, Combat Utility Belt of use it's own effect for concentration.
  * Enabled via config setting (near auto check saves)
  * Get user confirmation before casting a second concentration spell while the first is still active. First concentration is removed if you proceed.
  * Taking damage causes a concentration check, failure removes concentration.
  * If the spell that caused concentration expires concentration is removed
  * Concentration can be removed from the token effects HUD and will work as expected.
  * If concentration is removed any effects due to the spell on any tokens (self + targets) are removed.
  * If concentration is removed any measured templates associated with the spell are removed.
  * No changes are required to any spells/effects for this to work, it keys off the concentration attribute in the spell details.
  * Support for concentration for non-spells. Put "Concentration" in the activation conditions field and using the item will cause concentration to be added to the caster and any active effects applied by the item will be linked to concentration.  

## Magic Resistance
If the target token has the SRD feat "Magic Resistance" or a custom damage resistance trait equal to exactly magic-resistant the auto rolled saving throws against magic effects (item type spell) with be rolled with advantage. This is really intended for NPCs with magic resistance to have their auto rolled saving throws made with advantage.    

## Special Active Effect Expiry
* [Requires DAE 0.2.25+]  Effects support additional expiry options (which apply in addition to the normal duration based expiry) (available on the DAE effect duration screen) that can be chosen:
  * 1Attack: active effects last for one attack - requires workflow automation
  * 1Action: active effects last for one action - requires workflow automation 
  * 1Hit: active effects last until the next successful hit - requires workflow automation 
  * turnStart: Moved to times-up
  * turnEnd: Moved to times-up
  * isAttacked: the effect lasts until the next attack against the target.
  * isHitL the effect lasts until the next hit against the target.
  * isDamaged: the effect lasts until the target takes damage, i.e. from any item that causes damage.
  * isSave, isCheck, isSkill: if a character rolls one of these the effect is removed.
  * isSaveSuccess, isSaveFailure: If the character succeeded with or failed a saving throw the effect is removed.
  * isSaveSuccess.str, isSaveFailure.dex (etc): If the character succeeded with or failed a saving/chjeck throw of the specified ability the effect is removed.
  * isSave.str, IsSave.dex...., isCheck.str, isCheck.dex....: If the character made one of these rolls the effect is removed.
  * isSkill.acr, isSkill.per....: If the character made a skill check for the specified skill the effect is removed.
All of these effects expire at the end of the combat if no other duration is specified.

## Reactions
If the config settings for reaction checks is enabled midi will check a target that is hit by an attack for any items/feautres/spells that have an activation type of reaction and prompt the target if they want to use any of their reactions, which will then initiate a midi workflow for that item/feature/spell targeting the attacker (so hellish rebuke for example works). Currently does not support spells from magic items.


## flags.midi-qol 
Midi-qol supports a lot of flags values that alter how attacks/casts are rolled. They are supported by any modules that use item.rollI(), item.rollAttack(), item.rollDamage() or actor.useSpell() [the standard dnd5e rolls]. Usually you would apply these via active effects. Mostly they work with better rolls.

There is a handy spreadsheet that has a table of flags plus explanation thanks to (dstein766) https://docs.google.com/spreadsheets/d/1Vze_sJhhMwLZDj1IKI5w1pvfuynUO8wxE2j8AwNbnHE/edit?usp=sharing

flags.midi-qol...... need to be set via **CUSTOM** or **OVERRIDE**. Core foundry behaviour (as of 0.8.something) ignores **ADD** if the target value is undefined. Flags are undefined until set, so add does not work.

* flags.midi-qol.advantage.all  - gives advantage as if all of the settings below were set
* flags.midi-qol.advantage.attack.all
* flags.midi-qol.advantage.attack.mwak/rwak/msak/rsak
* flags.midi-qol.advantage.attack.dex/str/wis etc advantage on rwak/rwak using the attribute
* flags.midi-qol.advantage.attack.dex/str/wis... disadvantage on mwak/rwak using the attribute
* flags.midi-qol.advantage.ability.all (saves,checks and skills)
* flags.midi-qol.advantage.ability.check.all (checks & skills)
* flags.midi-qol.advantage.ability.save.all (saves only)
* flags.midi-qol.advantage.ability.check.str/dex/wis/cha/int/con
* flags.midi-qol.advantage.ability.save.str/dex/wis/cha/int/con
* flags.midi-qol.advantage.skill.all
* flags.midi-qol.advantage.skill.acr/ani/arc/ath/dec/his/ins/itm/inv/med/nat/prc/prf/per/rel/slt/ste/sur - if you have custom skills they should besupported automatically.  
* flags.midi-qol.advantage.deathSave - gives advantage on death saves
Similarly for disadvantage.  
Advantage/disadvantage on checks for an ability check also grants advantage on the corresponding skill rolls.  
* flags.midi-qol.advantage.concentration/midi-qol.disadvantage.concentration: advantage/disadvantage on concentration saves. Monk's token bar rolls do not support setting of advantage by midi-qol.
* flags.midi-qol.concentrationSaveBonus, a roll expression, which is added to concentration saves (auto, letme, monks, prompted). The roll will display without the bonus on the roll card, but the save result display will reflect the bonus. The revised saving throw formula is available in the tooltip on the save results card.
* flags.midi-qol.uncanny-dodge which halves damage applied if set

flags.midi-qol.fail.all/ability.all/ability.check.all/ability.save.all/skill.all etc to auto fail a given roll.  
* flags.midi-qol.ingoreNearbyFoes - when set cancels ranged attack disadvantage from a nearby enemy. Useful for sharpshooter feat.
* flags.midi-qol.fail.spell.all
* flags.midi-qol.fail.spell.vocal|verbal/somatic/material  
Fails attempts to cast spells with the specified components (or all).

* flags.midi-qol.grants.advantage.attack.all
* flags.midi-qol.grants.advantage.attack.mwak/rwak/msak/rsak  
Gives the attacker advantage on attacks made against the target. Midi-qol only checks the first target in the event that multiple tokens are selected.

* flags.midi-qol.critical.all
* flags.midi-qol.critical.mwak/rwak/msak/rsak/other
* flags.midi-qol.noCritical.all
* flags.midi-qol.noCritical.mwak/rwak/msak/rsak/other
* flags.midi-qol.grants.critical.all (applies when targeted)
* flags.midi-qol.grants.critical.mwak/rwak/msak/rsak/other (applies when targeted)
* flags.midi-qol.fail.critical.all (applies when targeted)
* flags.midi-qol.fail.critical.mwak/rwak/msak/rsak/other (applies when targeted)
* flags.midi-qol.DR.all - all incoming damage
* flags.midi-qol.DR.non-magical - non-magical bludgeoning/slashing/piercing
* flags.midi-qol.DR.acid - specific damage types
* flags.midi-qol.DR.bludgeoning
* flags.midi-qol.DR.cold
* flags.midi-qol.DR.fire
* flags.midi-qol.DR.force
* flags.midi-qol.DR.lightning
* glags.midi-qol.DR.rwak/mwak/rsak/msak
* etc  
These flags can be used to grant damage reduction to a character and can be set by active effects and are evaluated after derived fields are calculated, so things like dex.mod etc are available.  
flags.midi-qol.DR.all CUSTOM 3, will give 3 points of damage reduction to all incoming damage.
Negative DR is not supported (i.e. to increase damage taken).  

flags.midi-qol.superSaver.all/dex/str etc. If a save is required then the saver will take 0.5/0 damage on failed/successful save, compared to the normal 1/0.5. Useful for things like rogue's/monks evasion class feature.  

flags.midi-qol.ignoreNearbyFoes which, when set, means disadvantage from nearby foes (optional rules) will not affect the actor.

flags.midi-qol.potentCantrip, if set cantrips cast by the actor will do 1/2 damage instead of no damage. Overrides any other damage multiplier settings.

## Optional Bonus Effects
Optional flags cause a dialog to be raised when an opportunity to apply the effect comes up (i.e. the player is hit by an attack).

An optional attack bonus prompts the attacker after the attack roll is made, but before the attack is adjudicated, givin the attacker the option to modify the roll. Effects last for one application unless the count flag is set.

* flags.midi-qol.optional.Name.damage	bonus to apply to damage done		
* flags.midi-qol.optional.Name.skill	bonus to apply to skill rolls		
* flags.midi-qol.optional.Name.attack	the bonus is added after the attack roll		
* flags.midi-qol.optional.Name.check	the bonus is added after the ability check roll		
* flags.midi-qol.optional.Name.label	label to use in the dialog		
* flags.midi-qol.optional.Name.count	how many uses the effect has (think lukcy which has 3), if absent the bonus will be single use (bardic inspiration).   
You can specify a resource to consume in the count field, e.g. @resources.tertiary.value which will decrement the tertiary resource field until it is all used up (i.e. 0). Resources can be set to refresh on rests, so this will support the full uses per day definition.  
* flags.midi-qol.optional.Name.save	the bonus is added after the save roll. Requires auto fast forward		
* flags.midi-qol.optional.Name.ac	bonus to apply to AC of the target - prompted on the target's owner's client. (A bit like a reaction roll)  

Values for the optional roll bonus flags include a dice expression, a number, reroll (rerolling the roll completely) or success which changes the roll to 99 ensuring success.

## Spell Sculpting: flags.midi-qol.spellSculpting
If a spell caster with flags.midi-qol.spellSculpting set to 1, casts an area of effect (template or ranged) Evocation spell, any tokens targeted before casting the spell will always save against the spell and they take no damage from spells that would normally do 1/2 damage on a save. So if casting a fireball into an area with allies, target the allies before casting the spell and they will take no damage.

## flags.midi-qol.OverTime
Intended for damage over time effects or until save effects, but can do a bunch of things.
```
flags.midi-qol.OverTime OVERRIDE specification
```
where specification is a comma separated list of fields.
  * turn=start/end (check at the start or end of the actor's turn) The only required field.
  * applyCondition=expression, if present must evaluate to true or rest of the processing will be aborted.
  e.g. appplyCondition=@attributes.hp.value > 0 - for regeneration.
  * removeCondition=expression, if present and evaluates to true the effect is removed after the rest of the processing.
  Saving Throw: the entire active effect will be removed when the saving throw is made (or the effect duration expires)
  * rollType=check/save/skill (default save), roll an ability check, save or skill.
  * saveAbility=dex/con/etc prc/perception etc The actor's ability/skill to use for rolling the saving throw
  * saveDC=number
  * saveDamage=halfdamage/nodamage/fulldamage - default nodamage
  * saveMagic=true/false (default false) The saving throw is treated as a "magic saving throw" for the purposes of magic resistance.
  * damageBeforeSave=true/false, true means the damage will be applied before the save is adjudicated (Sword of Wounding). false means the damage will only apply if the save is failed.
  Damage:
  * damageRoll=roll expression, e.g. 3d6
  * damageType=piercing/bludgeoning etc. You can specify "healing" or "temphp" which apply healing or temphp. temphp will only apply if the rolled temphp > exisiting temphp. overtime healing is a way to implement regeneration.
  * macro="World Macro Name" call the macro as part of the damage application stage, where name must be a world macro, the macro is passed the results of rolling the overTime item, which will include damage done, saving throws made etc, as if it were an OnUse macro of the Overtime item roll.

  If the effect is configured to be stackable with a stack count, of say 2, the damage will 3d6 + 3d6.
  *label=string - displayed when rolling the saving throw

  The most common use for this feature is damage over time effects. However you can include an OverTime effect with just a save can be used to apply any other changes (in the same active effect) until a save is made (Hold Person).

  You can use @field references, e.g.
  ```
  saveDC=@attributes.spelldc
  damageRoll=1d6+@abilities.str.mod
  ```
  Examples: 
  * Longsword of Wounding (Non-transfer effect, should have stackable set to "each stack increases stack count by 1")
  ```
  flags.midi-qol.OverTime OVERRIDE turn=start,damageBeforeSave=true,label=Wounded,damageRoll=1d4,damageType=necrotic,saveDC=15,saveAbility=con
  ```
  * Devil's Glaive (Infernal Wound) (Non-transfer effect, should have stackable set to "each stack increases stack count by 1")
  ```
  flags.midi-qol.OverTime OVERRIDE turn=end,damageRoll=1d10+3,type=slashing,saveDC=12,saveAbility=con,label=Infernal Wound
  ```
  * Hold Person (1 non-transfer effect, but 2 changes both of which get removed on save)
  ```
  flags.midi-qol.OverTime OVERRIDE turn=end,saveAbility=wis,saveDC=@attributes.spelldc,saveMagic=true,label=Hold Person
  StatusEffect OVERRIDE Convenient Effect: Paralyzed
  ```

  There several "traps" for use of @fields. If the effect is created on the actor via transfer effects or hand editing of the effect the @ fields refer to the actor which has the effect.

  **If you are applying the effect via using an item** @ fields are ambiguous, should they refer to the caster or the target? There are reasons to have both interpreations, an ongoing saving throw should refer to the caster, e.g. ```saveDC=@attributes.spelldc```. Regeneration has appplyCondition=@attributes.hp.value > 0, which should refer to the target.

  Effects transferred via item usage, require DAE and use it's evaluation to resolve the problem. Fields written as simple @ fields (``@attributes.spelldc``) ALWAYS refer to the caster.  
  If you want the @field to refer to the target that requires use of a DAE feature, ``##field`` will not be evaluated on the caster, but will be converted to an ``@field`` after the effect is applied to the target. The example ``appplyCondition=@attributes.hp.value > 0`` would be written ``appplyCondition=##attributes.hp.value > 0``.

Here's an example, if I add the following effect to a weapon, so that the effect is applied to the target when the weapon hits:
```
flags.midi-qol.Overtime  OVERRIDE  applyCondition=@attributes.hp.value > 0
flags.midi-qol.Overtime  OVERRIDE  applyCondition=##attributes.hp.value > 0
```
will result in being created on the target (assuming the attacker has 75 hit points) 
```
flags.midi-qol.Overtime  OVERRIDE  applyCondition=75 > 0
flags.midi-qol.Overtime  OVERRIDE  applyCondition=@attributes.hp.value > 0
```

# Bugs
probably many however....
* Language translations are not up to date.

# Notes For Macro writers
For modules that want to call midi-qol it is easier than in minor-qol. Just call item.roll() and if you pass an event via item.roll({event}) you can have key accelerators. (the meanings of shift/ctrl/alt will be interpreted using the speed rolls settings)
event.altKey: true => advantage roll
event.crtlKey: true => disadvantage roll
event.shiftKey: true => auto roll the attack roll

* MinorQOL.doRoll and MinorQOL.applyTokenDamage remain supported.
* MidiQOL.applyTokenDamage is exported.
* If you have macros that depend on being called when the roll is complete, that is still supported, both "minor-qol.RollComplete" and "midi-qol.RollComplete" are called when the roll is finished. See also the onUse macro field which can be used to achieve similar results.

## Midi-qol called Hooks
Item and workflow are "live" so changes will affect subsequent actions. In particular preAttackRoll and preDamageRoll will affect the roll about to be done.  

  * Hooks.call("midi-qol.preAttackRoll", item, workflow) - called immediately before the item attack roll is made. If the hook returns false, the roll is aborted. 
  Hooks.callAll("midi-qol.AttackRollComplete", this) - Called after the attack roll is made and hits are checked, but before damage is rolled.
  *  Hooks.call("midi-qol.preDamageRoll", item, workflow) - called immediately before the item damage roll is made. If the hook returns false, the roll is aborted.
  * Hooks.callAll("midi-qol.preDamageRollComplete", this) - called before the damage roll processing starts        
  * Hooks.callAll("midi-qol.damageRollComplete", this) - called after damage application is complete. The targets may not have their hit points updated when this call is made since the hit point update is farmed off to a gm client
  *  Hooks.callAll("midi-qol.RollComplete", this);

* midi-qol supports a TrapWorkflow, triggered by
```
new MidiQOL.TrapWorkflow(actor, item, [targets], {x:number, y:number})
```
Which will roll the atack/and or damage and apply to the passed targets. If the item has an area template it will be placed at x,y and targets auto selected inside the template.

Sample DoTrapAttack replacement:
```
// @Token[Fireball]@Trigger[click]@ChatMessage[/DoTrapAttack _Traps Fireball Fireball 2]

let tactor = game.actors.getName(args[0])
if (!tactor) return console.error(`DoTrap: Target token ${args[0]} not found`);
let item = tactor.items.getName(args[1])
if (!item) return console.error(`DoTrap: Item ${args[1]} not found`)
let trapToken = canvas.tokens.placeables.find(t=>t.name === args[2]);
const templateLocation = trapToken.center;
templateLocation.removeDelay = parseInt(args[3]) || 2;
new MidiQOL.TrapWorkflow(tactor, item, [token], templateLocation)
if (trapToken) await trapToken.update({"hidden" : true});
```

* midi-qol supports a DamageOnlyWorkflow to support items/spells with special damage rolls. Divine Smite is a good example, the damage depends on whether the target is a fiend/undead. This is my implementation, which assumes it is activated via midi-qol's onUse macro field.
I have created a spell called "Divine Smite", with no saving throw or damage or attack, (although you can have such things) which has an onUse macro set to Divine Smite. (see the onUse macro details below). The total damage field passed in is only used in the final display on the apply damage card, the individual damage elements are all taken from the damageRoll.

```
let target = await fromUuid(args[0].hitTargetUuids[0] ?? "");
let numDice = 1 + args[0].spellLevel;
if (numDice > 5) numDice = 5;
// Apparently improved divine smite should not be added to the divine smite. Uncomment these lines if you want it to be included
// if (improvedDivineSmite) numDice += 1;
// let improvedDivineSmite = args[0].actor.items.find(i=> i.name ==="Improved Divine Smite");
let undead = ["undead", "fiend"].some(type => (target?.actor.data.data.details.type?.value || "").toLowerCase().includes(type));
if (undead) numDice += 1;
if (args[0].isCritical) numDice = numDice * 2;
let damageRoll = new Roll(`${numDice}d8`).roll();
new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "radiant", target ? [target] : [], damageRoll, {flavor: "Divine Smite - Damage Roll (Radiant)", itemCardId: args[0].itemCardId})```
```

Flavor is only used if you are not using combo cards.  
The args[0].itemCardId passes the id of the item card that caused the macro to be rolled, i.e. for divine smite the ItemCard of the Divine Smite spell/feature. By passing this to the  DamageOnlyWorkflow the damage roll can be added to the ItemCard making the whole effect look like an item damage roll (almost). 

You can use this feature to roll custom damage via a macro for any item - just leave the item damage blank and roll the damage in a macro and then pass the itemCardId to the DamageOnlyWorkflow.

## OnUse Macro(per Item) and Damage Bonus Macro (actor special traits) fields

These field lets you specify a macro to call during the roll. 

**OnUse macros** are called after the item roll is complete. It is ALWAYS called whether the attack hit/missed and is passed the following data as args[0]. The field should contain ONLY the macro name and recognizes the exact text ItemMacro to mean calling the items itemMacro if any. The intention is that you can customise the behaviour of how a particular item behaves.

**Damage bonus macros** are called after hits/misses/saves are adjudicated but BEFORE damage is applied, so you can specify extra damage if required, e.g. hunter's mark. The intention is support effects that are based on the character's state, rather than being related to a specific item. You can do whatever processing you want there, so could create a condition on some of the targets, do extra damage to specifc creatues/types of creatures and so on. Damage bonus macros can return an array of ``` [{damageRoll: string, flavor: string}]``` which will be added to the damage of the attack. The damage roll is a roll expression and flavor should be a damage type, e.g. fire. Damage returned via the damage bonus will NOT be increased for critical hits.

Both calls supply the following data
```
  actorData = actor.data (the actor using the item).
  actor = actor.data (same as above, kept for backwards compatibility)
  actorUuid = actor.uuid
  tokenId
  tokenUuid
  item = item.data (the item, i.e. spell/weapon/feat)
  itemUuid the item uuid
  targets = [token.data] (an array of token data taken from game.user.targets)
  targetUuids = [uuid]
  hitTargets = [token.data] (an array of token data taken from targets that were hit)
  hitTargetUuids [uuid]
  saves= [token.data] (an array of token data taken from targets that made a save)
  saveUuids = [uuid]
  failedSaves = [token.data] (an array of token data taken from targets that failed the save)
  failedSaveUuids = [uuid]
  criticalSaves = [token.data]
  criticalSaveUuids = [uuid]
  fumbleSaves = [token.data]
  fumbleSaveUuids = [uuid]
  damageRoll = the Roll object for the damage roll (if any)
  attackRoll = the Roll object for the attack roll (if any)
  itemCardId = the id of the chat message item card (see below)
  attackTotal: this.attackTotal,
  itemCardId: this.itemCardId,
  isCritical = true/false
  isFumble = true/false
  spellLevel = spell/item level
  damageTotal = damage total
  damageDetail = [type: string, damage: number] an array of the specific damage items for the attack/
  otherDamageTotal: damage total for "Other Roll" (if any)
  otherDamageDetail: damage detail for "the Other Roll" (if any)
  id: the id of the item that caused the workflow (if any)
  uuid: a unique Id for the workflow
  rollData: this.actor.getRollData(),
  tag: either "OnUse" or "DamageBonus" indicating where in the workflow it was called. You can use this to allow the same macro to be used in both cases
  templateId: the template.id field for the placed measured template (if any)
  concentrationData: getProperty(this.actor.data.flags, "midi-qol.concentration-data"),
  templateUuid - preferred over templateId
```
You can use the various target details to work out which tokens to apply the effect to, for example hitTargets is only those targets that the item roll "hit" if any.

The combo card has some special divs included to allow you to easily add data to the card.
```
    <div class="midi-qol-attack-roll"></div>
    <div class="midi-qol-damage-roll"></div>
    <div class="midi-qol-hits-display"></div>
    <div class="midi-qol-saves-display"></div>
```
Which it uses to update the card when things happen, like attacks damage saves etc. You can take over those fields to create custom items.

This is the code that puts the hit roll detail on the item card
```
const chatMessage: ChatMessage = game.messages.get(args[0].itemCardId);
var content = duplicate(chatMessage.data.content);    
const searchString =  '<div class="midi-qol-hits-display"></div>';
const replaceString = `<div class="midi-qol-hits-display">${hitContent}</div>`
content = content.replace(searchString, replaceString);
chatMessage.update({content: content});
```
hitContent is just html, so you could insert whatever you want in any of the divs above.

## Some Tricks you can do...
This is just a place where I'll write down some ideas that I think are cute. I'll assume that DAE/times-up is avaialable as well.

* Activation Conditions can be useful to tailor effects without requiring additional macro code. Activation Condition is checked when the config setting for Roll Other Damage is set to activation and allows fine tuning of bonus damage, think slayer items. The Active Effect Condition allows you apply active effects to targets, e.g. mace of disruption only frightens undead, use ```['fiend', 'undead'].includes('@raceOrType')``` to only apply active effects to undead.

* Items/Weapons that do full damage and a save to avoid application of an effect (like blinded).
Set full damage save (on a weapon it's a property on anything else the text "full damage on save"). Add Blinded as a "Status Effect" active effect to the item.

* Attacks that do some damage and a save for additional damage (like spider's poisonous bite). You need to enable the midi-qol setting "Roll Other Damage on rwak/mwak). Set the "Other Damage" to the poison damage. Midi will notice that the attack has other damage to roll and apply the saving throw to the "Other Damage" rather than the main damage. (Special Trick, if the other damage field is blank AND the weapon does not have the versatile type set midi will roll the versatile damage instead - this is because the dnd5e SRD chooses to make this damage versatile - which I think is wrong).

* The activation condition setting on Roll Other damage... makes implementing special condition items pretty easy, like slayer weapns - use the condition to check the target type and the "Other" damage will get rolled if it matches. "@raceOrType".includes("dragon") is a simple sample condtion for dragon slaying.

* Active Auras can be very useful for proximity effects. If you make the aura effect a midi-qol OverTime effect, the tricky while within 10 feet of X take damage on the start of your turn (with or without a save) are very easy to implement. The effect will be removed when the target moves away from the aura generating token but the damage will only get rolled at the right time. Flaming Sphere (in the midi-qol sample items uses this trick) and also summons a token for the sphere with the aura effect on the sphere.

* Overtime effects. It turns out that this has lots of applications. One that is not obvious is that you can use the overtime effect as a switch to turn on and off other effects. If you have one effect with multiple changes, one of which is an OverTime effect, they will ALL be applied and ALL removed on a save. Here's a screen shot of Hold Person, which has an overtime effect for the save and a payload of applying the paralyzed status effect to a target.

* How to set the special duration of an effect. There are lots of various ways to expire a condition (too many to list here) but one common problem is setting an effect to expire at the start of the targets next turn/next attack by the caster. If you don't specify a seconds/rounds/turns duration as well, then the default of 1 round will apply, which may be before the special duration expires. So if putting a special duration make sure to set the duration of the effect to be larger than the special duration will take to happen. If the item generating the effect has a duration that will get used if there is no time based duration specified.

* WHich sort of Macro to use?
  - macro.execute/macro.ItemMacro effects (DAE) are applied to the target (run when added and run again when deleted) and are able to access fields from the caster and the target (see the DAE readme). They can be especially useful if you need to change a field that should not be changed via active effects, like temphp (or any effect that might get changed after the effect is applied, hp is the classic example). They are only applied to the target if the attack hit or the target did not save. Since the macro is also called when the active effect is removed from the target you are able to do any cleanup you want.
  - OnUse macros (set on the item sheet). These are run whenever the item is used, even if the attack missed. You can do pretty much anything inside the macro and the result is awaited. Look in here for the information that is provided. You can't pass arguments to OnUse macros yourself. Useful if you want to do something to targets/other tokens/self that can't be expressed/should not be done with active effects.
  - DamageBonusMacro, this is run whenever an attack rolls damage. The main idea is to enhance the damage rolled by the attack which does not depend on the item used, things like sneak attack/hunter's mark and so on. The same information is passed to the macro and can be awaited.
  - If you want to store information about the state of things you can do ```setProperty(actor,"flags.myflag.something", value)``` and retrieve it with ```getProperty(actor, "flags.myflag.somethng")```. The information will be reset on a game reload (so it really should be short term data) and is ONLY available on the same client that set the infromation, but does not require a database transaction so is very cheap. If it needs to last over game reloads or be accessible on other clients you need to do actor.setFlag...

## Sample Chat Logs
![No Combo Card](pictures/nocombo.png) ![Combo Card](pictures/combo.png)


