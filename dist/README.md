# Bug reports
**As of version 0.8.19** you can export your midi-qol settings to a json file. When posting a midi-qol bug report export your settings and add the json file to the issue. I won't look at issues without this information.

# midi-qol
Midi-qol is a replacement for minor-qol and you should not have both modules active at the same time.  (Both can be INTSALLED at the same time, but only one should be ACTIVATED.)  Because there are some subtle differences in the way the midi-qol works compared to minor-qol you will need to experiment with the settings.

## HELP! My midi-qol disappeared.
If you've just updated midi-qol and it disappears from your in-game list of modules you probably need to update your dnd5e system to the latest one.

## I just upgraded and nothing works anymore. 
I've seen a couple of cases where after migration of foundry versions the per player setting "enaable workflow automation" gets set to off. This flag being unset causes midi to do nothing with rolls (hence the nothing works). Also not that this is a per player setting, so each user needsd to make sure it is on.

## Midi works for some players and not for others....
Same problem as above - check workflow automation is enabled on all clients. You can use the module SocketSettings to force set the setting on all clients.

## Items I bring in from the sample compendium don't work. 
Some of the items require creating a DamageBonusMacro, make sure that is enabled in the midi settings. Also, if the damage bonus macro effect runs an ItemMacro.ItemName, the name of the feature needs to match the name of the item macro being run. For example Rage MQ0.8.9, will have to be renamed Rage when equipped on a character or the damage bonus macro won't run. I know this is not ideal, but I wanted to make clear when the version of the items changed.

### Changes in midi-qol:
* Speed item rolls has only a single function now to enable ctrl/shift/alt when clicking on the item icon.  All other workflow features are configured separately. See **speed item rolls** below.
* There is support for a merged chat card containing attack/damage/hits/saves. (The merged card does not yet support Better Rolls). You can disable the merge card to restore the same operation as in minor-qol.
* midi-qol works with MagicItems, although there may be some wrinkles outstanding there.
* Backward compatibility for the minor-qol.doRoll function.
* Many more configuration options, accessed by a configuration screen.

## Changelog
https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md


## (In)Compatibilities? ##
Any module that overloads item.roll is potentially incompatible.  



- **Furnace (deprecated for Foundry 0.8.x - Use Advanced Macros).** If you intend to make use of any of the macro features in midi-qol you will need to install the Furnace module and enable advanced macros (which is the feature you need/should enable).

- **Better Rolls.** If you are using Better Rolls (which is a great module), midi-qol takes over once the hit/damage card is placed by Better Rolls. This means that resource consumption, template placement, critical/fumble, and  advantage/disadvantage determination are **all** handled by Better Rolls before midi-qol kicks in. Midi-qol checks hits, saves, applies damage, and calls active effects.  In particular, Better Rolls does not use any of the flags.midi-qol....   

- **Magic Items.** (Thanks to @simone for his help) Midi-qol is fully compatible with magic-items. The only issue is that spell templates for spells in a magic item are not auto-placed on casting. Once placed everything works as expected. Spells/features that can be rolled will work. However, items that create changes by being present in the characters inventory won't behave as expected since they are actually held in the characters inventory, this includes transfer active effects.

- **Mess.** Midi-qol and Mess dnd5e effects are not compatible. Template effects and the other features of that excellent module should work. If you want Mess attack/damage cards don't use midi-qol.  

- **Cozy player.** Minor-qol was not compatible with cozy-player, with targets being lost before attack/damage rolls were made. I have done only limited testing but it seems that there are no problems with cozy-player and midi-qol.  

- **Cautious GM.** Midi-qol breaks the blind chats by hidden GM feature of cautious GM.  

- **Chat Portraits.** If using Chat Portraits, the changes made by midi-qol to the token/actor name in chat cards are overwritten/lost. Choose which sort of highlighting you want - only one will work. Otherwise, all seems to work.

- **Ez-Roller.** The send to chat log feature of ez-roller will disable combo cards in midi-qol.  

- **Combat Utility Belt.** CUB concentrator and midi-qol concentration automation are incompatible. Choose one or the other. If you want concentration to expire at the end of the spell you need to install times-up.

- **Maestro.** Maestro looks for the attack roll chat card in the chat log to play its critical/attack/fumble sounds. If you are using the merge card then the attack roll card is never created and Maestro can't play its sounds. You can use the midi-qol custom sounds instead.

- **Dfreds Convenient Effects** If "Apply Convenient Effects" is enabled midi-qol will check convenient effects for an effect that matches the name of the item being rolled and apply the effect as if it was an active effect on the item. So casting the "Bless" spell will apply the convenient effect Bless to the targets. Requires auto appply active effects to be enabled.

- **Item Macro.**  You can create itemMacro macros with this module and call them from midi's onUse/DamageBonus macro fields by adding ItemMacro (case-sensitive) in the macro field.
If you have installed itemmacro please make sure you disable the ItemMacro config settings:

  * "character sheet hook" else when you use the item the macro will get called bypassing midi-qol/dae completely and none of the arguments will get populated.

  * "override default macro execution"  If this is enabled the hotbar hooks will directly call the item macro and won't work as expected for dae/midi.  
The settings are per player so each player needs to change the setting to disabled.  

- **Dnd5e-helpers** midi-qol has configuration options (in the optional rules section) to incorporate the AC bonus calculated by dnd5e-helpers. There are two settings dnd5e-helpers which allows an attack if any of the 4 corners of the target are visible and dnd5e-helpers+AC which will include the AC bonus from armor when calculating a hit. The bonus AC on the target will be displayed in the to hit card.

**Roll Statistics.**
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

## Short Guide to the settings:
### Workflow settings
* **Speed Item Rolls** 
If speed rolls are off, all of the ctrl/alt|meta/shift keys and roll behaviour are the same as in core. There is one additional feature: if you click on a damage button in chat, CTRL+ALT click will use the critical/normal hit status from the midi-qol roll data.

If speed rolls are enabled you need to assign the keys yourself.
If you enable speed ability rolls as well, your key mappings will apply to ability check, save and skill rolls as well.

* advantage key modifier, defaults to Alt/Meta
* disadvantage key modifier, defaults to Ctrl
* versatile key modifier, defaults to Shift.
* critical damage modifier, defaults to Alt/Meta.
* fast-forward key (turn any attack or damage roll into a fast-forwarded or disable auto fast-forward if set) advantage+disadvantage.

If you assign a key multiple meanings the behaviour is going to be confusing at best.

### Display ###
* **Card styles** Midi-qol supports two options for item/attack/damage/save rolls. The Merge card combines all of those rolls into a single card. If Merge card is disabled you will get a separate chat card for each roll, which is the default dnd5e look and feel. The condensed Merge card simply puts attack and damage next to each other to conserve a bit more space.  
* **Show Item details in chat card**. You can configure whether the item details are included in the chat card. If disabled, the item description is not added to the card. If enabled, you can use the dnd5e setting to choose if it is expanded or hidden when displayed. 
* **Chat cards use token names**. If the field is blank actual actor/token names will be used in the chat card, hits/saves display for non-GMs. If set to a string the actual names will be replaced in the chat cards with the string. This feature is not a replacement for Combat Utility Belts hide names feature, rather it addresses those fields that CUB does not know about. For full hiding of names on cards and the tracker you need to use CUB in conjunction with midi-qol.
* **Chat cards use token name** By default chat cards are sent with the name of the actor (i.e. "Orc"). If enabled, the name of the token will be used instead (i.e. "Orc with a terrible limp").
* **Hide Roll Details** There are 4 settings, hide roll formula, hide all details, d20Attack + hide roll formula, show d20 attack roll only. The last two options ONLY work with the merge card.

### Targeting ###
* **Auto target on template draw** If a spell/feature has an area effect template then enabling this setting will auto target (for later damage application) all tokens inside the template once placed. Also, the roll will not progress (i.e. roll saves or apply damage) until the template is placed. If "walls-block" is selected then any wall between the template origin and the token will block the targeting.
* **Auto target for ranged spells/attacks** If the item specifies a ranged target with a target type of creature/enemy/ally then all tokens within range of the caster will be auto targeted when the effect is cast. “enemy/ally” are enemies/allies of the caster. 
* **Auto roll attack**, **Auto roll damage** and **Auto fast forward rolls**. The auto roll attack and damage settings tell midi-qol to start an attack roll or damage roll if there is one. The auto fast forward settings determine if the advantage/disadvantage and/or critical/normal dialogs are shown or suppressed. Damage can be set to “Attack Hits”, which will roll damage only if the attack roll was sufficient to hit the target.
* **Require targets to be selected before rolling** It is incredibly common in my games that players forget to target before starting the roll. This setting will not allow them to roll if they have not selected a target and one is needed. (Auto-target spells - like a fireball - are not affected by this setting.)

### Saving Throws ###
* **Auto Check Saves** Set this to “None” if you wish the players or GM to be responsible for rolling and evaluating saving throws.  (If you want only one group to roll manually and the other to roll automatically, set this to “None” and make appropriate choices for the “Prompt Players to Roll Saves” and “Prompt GM to Roll Saves” settings).  Otherwise, set this to control the visibility of saving throws that will be automatically rolled and evaluated for each targeted token.
  * Save - all see results. Saves are rolled and who saved/failed to save is visible to all users.
  * Save - only GM sees. Saves are rolled and the save/fail display is only visible to the GM.
  * Save - All see results + Rolls. Normally the NPC rolls are hidden; this option shows the roll chat cards to all players.
* **Prompt Players to Roll Saves** If "None" set the module will automatically roll all saves.  If set to another value, the system will prompt the player to roll their save and wait up to **Delay before rolling** seconds before auto rolling the save for them. You can also specify Monks Token Bar for saves.
  * Chat Message. If selected, an impacted player will receive a whisper in chat prompting them to roll a saving throw.  The module will assume that the next saving throw in the chat stream from this player was the requested roll and evaluate it.  
  * Let Me Roll That For You.  If selected (and LMRTFY is installed and enabled), midi-qol while use LMRTFY to prompt the player who controls the target (or, if there is none, a randomly chosen player with ownership rights to the target) to make the roll.  The specific roll details are passed to LMRTFY and multiple rolled (i.e. more than one spell requiring a save) will be correctly allocated.
  * Monks Token Bar. If selected (and monks-tokenbar is installed and active) characters with a logged in player owner will be added to a monks token bar savng thow dialog. Completing the roll from the dialog will be used as the save.
* **Prompt GM to Roll Saves** Set this to “Auto” to have midi-qol automatically roll and evaluate NPC saving throws on behalf of the GM.  Set to “Let Me Roll That For You” to instead have the LMRTFY module prompt the GM for NPC saving throws. You can also use Monks Token Bar saving throws.
* **Display Saving throw DC**. Determines if the saving throw DC is displayed to the players and on the chat cards. If unchecked, saving throws will display on the chat card with the value replaced by “??”. 

**Saving Throw Multiplier**
  * There is a config setting, default save multipler (defaults to 0.5). If there are no special overrides then a saving throw will do 
    `rolled damage * defaultSaveMultiplier` damage. When set to 0.5 saving against the attack will do 1/2 dmaage, like most cases for dnd.
  * There are a number of ways to overide the default multiplier.
  * If the item description includes the text "no damage on save" (or the localized equivalent) then a save will do no damage.
  * If the setting "search spell description" is set, items with the text "half as much damage" (or the localized equivalent) will do 1/2 damage on a save ignoring the defalt multiplier. If the text is not found the save will use the defaultSaveMultiplier.
  * For weapons (only) there are weapon properties for 1/2, full or no damage saves. These properties override any other settings. If not present the save multiplier will be worked out as above. 
  * For weapons (only) the save multiplier appplies to the whole damage roll **UNLESS**...
    * You have enabled "Roll other damage on mwak/rwak" (which is intended sepcifically to support attacks that have base damage + extra damage with a save -think spider bite). If the weapon has a save specified **AND** the weapon has an Other Damage formula, the saving throw multiplier applies to the Other damage and the base damage is applied as full damage.
    * Because of the way the SRD monsters have been setup, (i.e. extra damage as versatile damage and the the versatile property not set) the versatile formula will be treated as Other Damage if there is no Other Damage formula and the weapon property "versatile" is not set. 
    * For BetterRolls you have to enter the damage into the Other field and enable roll Other in the better rolls settings. Midi will pick up this damage and apply the saving throw result against it.
    
If you are just using standard items you can just leave things at the defualt and most saves will do 1/2 damage as you'd expect, monsters (like a giant spider) will (if Roll Other Damage is enabled) do base weapon damage and have a save applied to the bonus poison damage.

For those who have a lot of weapons set up with a save and want the default damage on save to be full damage (which is what a pervious version enabled when search spell description was enabled) just edit the items and set the save to full damage save (preferred) or set the default save multiplier to 1.

### Hits ###
You can enable auto checking of hits. Fumbles automatically miss and criticals automatically hit. As GM you can mouse over the name of the hit target to highlight the token and click to select it. This is useful if you are not auto applying damage, since you can do all the damage application from the chat log, by clicking on the targets name, then clicking on the appropriate damage button.

### Damage ###
* **Auto apply damage to target**
  * Yes: Damage is auto-applied to targeted tokens (**or self if self-target is specified**) that were hit or did not save, or that saved and take half damage.
  * "+ damage card": If included, a chat card is sent to the GM which includes each target that had damage applied with details of the damage, any immunities/resistances and 6 buttons. They set the target hit points based on the calculation displayed. The first sets the hp back the way they were before the roll and the second sets them as displayed in the calculation (an undo/redo). The next 4 are the standard DND apply damage buttons but **do not** take into account resistance/immunity.

* **Roll Other formula for rwak/mwak**

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

* **Apply Damage immunities** Midi-qol will use the target’s resistance/immunity/vulnerability settings for each type of damage in the attack and calculate how much of the damage applies. If "+physical" is set midi-qol will look at the item that did the attack to see if the damage is magical or not according to the following:
  * If the item is:
    * not a weapon: the damage is assumed to be magical
    * a weapon has an attack bonus > 0: it is assumed to be magical
    * a weapon has the "Magical" property set: attacks are considered magical. (The magical property for weapons only exists if midi-qol is enabled)
* **Auto apply item effects to target** If the item had dynamic effects which are currently active as specified and the target was hit and did not save; OR did not save; OR there are no attacks or saves: dynamic effects is called to apply the active effects to each such target. This includes self if a self target is specified.

## Custom Sounds ##
* Midi-qol uses whatever audio files you want for sounds, but they must all be in the same playlist. I will be extending the sound options, next will be specific sounds by damage type, then sounds per item use.
* A tiny selection of sounds is distributed with the module and are available in Data/modules/midi-qol/sounds and can be used to setup a playlist. 
* Attack, critical and fumble sounds are only available if using a combo card.
* Item use sounds are available when midi-qol is enabled and handling the roll (i.e. not Better Rolls).  
![Custom Sound Settings](pictures/sound.png)
## Other QOL settings ##
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

## Not settings....
### Magic resistance.
If the target token has the SRD feat "Magic Resistance" or a custom damage resistance trait equal to exactly magic-resistant the auto rolled saving throws against magic effects (item type spell) with be rolled with advantage. This is really intended for NPCs with magic resistance to have their auto rolled saving throws made with advantage.    

If the above was all too tedious here are the settings I use.

## Settings for full auto mode:
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

## midi-qol Alternate QuickStart Settings - contributed by dstein766 (aka OokOok on Foundry discord):
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
### Basic module settings:  CHECK (enable) the following OR select from the drop-down: 
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
### Workflow/GM: CHECK (enable) the following OR select from the drop-down:
* Auto roll attack
* Auto fast forward attack
* Auto roll damage: Never
* Auto fast forward damage
* Remove chat card buttons after roll: your choice (I use Off)
* Hide roll details: your choice (I use none, which means anyone can click on the result to display the roll formula and actual die rolls)
### Workflow/Player: CHECK (enable) the following OR select from the drop-down:
* Auto roll attack: UNCHECKED
* Auto roll damage: Never
* Auto fast forward rolls: Attack and Damage
* Remove chat card buttons after roll: Attack and Damage
### Workflow/Workflow: CHECK (enable) the following OR select from the drop-down:
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

### Workflow/Misc: CHECK (enable) the following OR select from the drop-down:
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


## flags.midi-qol
There is a handy spreadsheet that has a table of flags plus explanation thanks to (dstein766) https://docs.google.com/spreadsheets/d/1Vze_sJhhMwLZDj1IKI5w1pvfuynUO8wxE2j8AwNbnHE/edit?usp=sharing
Midi-qol supports a number of flags values that alter how attacks/casts are rolled. They are supported by an modules that use item.rollI(), item.rollAttack(), item.rollDamage() or actor.useSpell() [the standard dnd5e rolls]. Usually you would apply these via active effects. 

flags.midi-qol...... need to be set via **CUSTOM** (preferred) or **OVERRIDE**. Core foundry behaviour (as of 0.8.something) ignores **ADD** if the target value is undefined. Flags are undefined until set, so add does not work.

* flags.midi-qol.advantage.all  - gives advantage as if all of the settings below were set
* flags.midi-qol.advantage.attack.all
* flags.midi-qol.advantage.attack.mwak/rwak/msak/rsak
* flags.midi-qol.advantage.attack.dex/str/wis etc advantage on rwak/rwak using the attribute
* flags.midi-qol.advantage.attack.dex/str/wis... disadvantage on mwak/rwak using the attribute
* flags.midi-qol.advantage.ability.all
* flags.midi-qol.advantage.ability.check.all
* flags.midi-qol.advantage.ability.save.all
* flags.midi-qol.advantage.ability.check.str/dex/wis/cha/int/con
* flags.midi-qol.advantage.ability.save.str/dex/wis/cha/int/con
* flags.midi-qol.advantage.skill.all
* flags.midi-qol.advantage.skill.acr/ani/arc/ath/dec/his/ins/itm/inv/med/nat/prc/prf/per/rel/slt/ste/sur - if you have custom skills they should besupported automatically.  
* flags.midi-qol.advantage.deathSave - gives advantage on death saves
Similarly for disadvantage.  
Advantage/disadvantage on checks for an ability check also grants advantage on the corresponding skill rolls.  
* flags.midi-qol.advantage.concentration/midi-qol.disadvantage.concentration: advantage/disadvantage on cocentration saves
* flags.midi-qol.concentrationSaveBonus, a roll expression, which is added to concentration saves (auto, letme, monks, prompted). The roll will display without the bonus on the roll card, but the save result display will reflect the bonus. The revised saving throw formula is available in the tooltip on the save results card.

flags.midi-qol.fail.all/ability.all/ability.check.all/ability.save.all/skill.all etc to auto fail a given roll.  
* flags.midi-qol.ingoreNearbyFoes - when set cancels ranged attack disadvantage from a nearby enemy.
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
* etc  
These flags can be used to grant damage reduction to a character and can be set by active effects and are evaluated after derived fields are calculated, so things like dex.mod etc are available.  
flags.midi-qol.DR.all CUSTOM 3, will give 3 points of damage reduction to all incoming damage.
Negative DR is not supported (i.e. to increase damage taken).  

flags.midi-qol.superSaver.all/dex/str etc. If a save is required then the saver will take 0.5/0 damage on failed/successful save, compared to the normal 1/0.5. Useful for things like rogue's evasion class feature.  

flags.midi-qol.ignoreNearbyFoes which, when set, means disadvantage from nearby foes (optional rules) will not affect the actor.

flags.midi-qol.potentCantrip, if set cantrips cast by the actor will do 1/2 damage instead of no damage. Overrides any other damage multiplier settings.

**Optional Bonus Effects**	
Optional flags cause a dialog to be raised when an opportunity to apply the effect comes up. So an optional attack bonus prompts the attacker after the attack roll is made, but before the attack is adjudicated, givin the attacker the option to modify the roll. Effects last for one application unless the count flag is set.

flags.midi-qol.optional.Name.ac	bonus to apply to AC of the target - prompted on the target's owner's client. (A bit like a reaction roll)		.
flags.midi-qol.optional.Name.damage	bonus to apply to damage done		
flags.midi-qol.optional.Name.skill	bonus to apply to skill rolls		
flags.midi-qol.optional.Name.attack	the bonus is added after the attack roll		
flags.midi-qol.optional.Name.save	the bonus is added after the save roll. Requires auto fast forward		
flags.midi-qol.optional.Name.check	the bonus is added after the ability check roll		
flags.midi-qol.optional.Name.label	label to use in the dialog		
flags.midi-qol.optional.Name.count	how many uses the effect has (think lukcy which has 3), if absent the bonus will be single use (bardic inspiration). You can specify a resource to consume in the count field, e.g. @resources.tertiary.value which will decrement the tertiary resource field until expire (i.e. 0).

Values for the optional roll bonus flags include a dice expression, a number, reroll (rerolling the roll completely) or success which changes the roll to 99 ensuring success.

## Reactions
If the config settings for reaction checks is enabled midi will check a target that is hit by an attack for any items/feautres/spells that have an activation type of reaction and prompt the target if they want to use any of their reactions, which will then initiate a midi workflow for that item/feature/spell targeting the attacker. Currently does not support spells from magic items.

## flags.midi-qol.OverTime
Intended for damage over time effects or until save effects
```
flags.midi-qol.OverTime OVERRIDE specification
```
where specification is a comma separated list of fields.
  * turn=start/end (check at the start or end of the actor's turn) The only required field.
  * applyCondition=expression, if present must evaluate to true or rest of the processing will be aborted.
  e.g. condition=@attributes.hp.value > 0 - for regeneration.
  * removeCondition=expression, if present and evaluates to true the effect is removed after the rest of the processing.
  Saving Throw: the entire active effect will be removed when the saving throw is made (or the effect duration expires)
  * saveAbility=dex/con/etc The actor's ability to use for rolling the saving throw
  * saveDC=number
  * rollType=check/save (default save), roll an ability check or save.
  * saveMagic=true/false (default false) The saving throw is treated as a "magic saving throw" for the purposes of magic resistance.
  * damageBeforeSave=true/false, true means the damage will be applied before the save is adjudicated (Sword of Wounding). false means the damage will only apply if the save is made.
  Damage:
  * damageRoll=roll expression, e.g. 3d6
  * damageType=piercing/bludgeoning etc. You can specify "healing" or "temphp" which apply healing or temphp. temphp will only apply if the rolled temphp > exisiting temphp. overtime healing is a way to implement regeneration.
  If the effect is configured to be stackable with a stack count, of say 2, the damage will 3d6 + 3d6.
  *label=string - displayed when rolling the saving throw

  The most common use for this feature is damage over time effects. However you can include an OverTime effect with just a save can be used to apply any other changes (in the same active effect) until a save is made (Hold Person).

    For non-transfer effects (things applied to a target) you can use @field references, e.g.
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
  macro.CE CUSTOM Paralyzed
  ```

## Bugs
probably many however....
* Language translations are not up to date.

## Notes For Macro writers
For modules that want to call midi-qol it is easier than in minor-qol. Just call item.roll() or actor.useSpell, and if you pass an event via item.roll({event}) you can have key accelerators. (the meanings of shift/ctrl/alt will be interpreted using the speed rolls settings)
event.altKey: true => advantage roll
event.crtlKey: true => disadvantage roll
event.shiftKey: true => auto roll the attack roll

* MinorQOL.doRoll and MinorQOL.applyTokenDamage remain supported.
* MidiQOL.applyTokenDamage is exported.
* If you have macros that depend on being called when the roll is complete, that is still supported, both "minor-qol.RollComplete" and "midi-qol.RollComplete" are called when the roll is finished. See also the onUse macro field which can be used to achieve similar results.

* ## Midi-qol called Hooks
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
let target = canvas.tokens.get(args[0].hitTargets[0]?._id);
let improvedDivineSmite = args[0].actor.items.find(i=> i.name ==="Improved Divine Smite");
let numDice = 1 + args[0].spellLevel;
if (numDice > 6) numDice = 6;
if (improvedDivineSmite) numDice += 1;
let undead = ["undead", "fiend"].some(type => (target?.actor.data.data.details.type?.value || "").toLowerCase().includes(type));
if (undead) numDice += 1;
if (args[0].isCritical) numDice = numDice * 2;
let damageRoll = new Roll(`${numDice}d8`).roll();
if (args[0].isCritical) damageRoll = MidiQOL.doCritModify(damageRoll)
new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "radiant", target ? [target] : [], damageRoll, {flavor: "Divine Smite - Damage Roll (Radiant)", itemCardId: args[0].itemCardId})
```

Flavor is only used if you are not using combo cards.  
The args[0].itemCardId passes the id of the item card that caused the macro to be rolled, i.e. for divine smite the ItemCard of the Divine Smite spell/feature. By passing this to the  DamageOnlyWorkflow the damage roll can be added to the ItemCard making the whole effect look like an item damage roll (almost). 

You can use this feature to roll custom damage via a macro for any item - just leave the item damage blank and roll the damage in a macro and then pass the itemCardId to the DamageOnlyWorkflow.

### OnUse Macro Item detail field

This field lets you specify a macro to call after the item roll is complete. It is ALWAYS called whether the attack hit/missed and is passed the following data as args[0]. The field should contain ONLY the macro name and recognizes the exact text ItemMacro to mean calling the items itemMacro if any.
```
  actor = actor.data (the actor using the item)
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

### Weapon Critical Threshold
An additional field is added to the weapon item sheet, **Critical Threshold**, which changes the critical threshold for attacks made with that weapon. The value used for the attack crtical threshold is the lower of the actors critical threshold (from the special traits page) and the weapon critical threshold.

## Sample Chat Logs
![No Combo Card](pictures/nocombo.png) ![Combo Card](pictures/combo.png)


