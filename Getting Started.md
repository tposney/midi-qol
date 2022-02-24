**Work in progress - not complete or checked**
[TOC]

## What is this document?
This guide is intended for new users to midi-qol who need some guidance on setting the very many options that exist.
## What can midi-qol do?
Here is a spider attacking a goblin using the base dnd5e system.  
![dnd5e spider bite](GettingStartedPics/Base%20Spider%20Bite.png)

Here is the same spider biting the same goblin with midi-qol automation enabled and configured
| Spider Bite | Extra actions generated with same click |
| ------ | ------ |
| ![midi-qol spider bite](GettingStartedPics/Auto%20Spider%20Bite.png) | <ul><li>The attack and damage rolls have been made</li><li>A check has been made to see if the attack hit the target</li><li>The damage has been rolled, the bite damage and the poison damage</li><li>The goblin has rolled the consitution save</li><li>The save has been checked and the goblin failed</li><li>The damage has been calculated and applied to the goblin. (midi knows about damage resistance and takes that into account)</li><li>A GM only summary damage card has been displayed showing what damage was done and giving the option to revise it.</li></ul> |
## I've installed it but it does not do anything....
Midi-qol is a fairly complex mdoule with many configuration options and dependencies on other modules. To make it work you have to go through a setup process where you configure it to work the way you want.
1. Install the prerequesite modules plus any nice to haves you want.
2. Configure midi-qol to work the way you want.
3. Get some midi-compatible items to make all this autmation stuff work.

## Prequisites
### Modules you must also install
#### libsocket
#### libwrapper
#### Advanced Macros
Whilst not always required, just install it and be done with it.
### Modules you really should install
#### Dynamic Effects using Active Effects.
This is not striclty required but your life will be easier with it installed and is assumed for the rest of this dcoument.

#### Times-up
Required if you want effects to automatically be removed on expiry, either world time on combat turn/round. If you want time to advance in your world both **Simple Calendar** and **Small Time** are highly recommended.

### Modules that are nice to have
#### Combat Utility Belt or Convenient Effects
Convenient Effects provides status effects, like blinded charmed and so pre-configured and can be applied to targets as the result of using an item. In addition when using an item midi can automatically apply the convenient effects defined effects for that spell.

Combat utility belt (CUB) allows configuration of status effects which you can apply with midi-qol.
CUB allows hiding of target names in chat cards for the standard rolls (attack/damage/saves) and complements midis hiding of target names. Midi uses the CUB settings for which actors should be hidden.

CUB Concentration automation and midi-qol concentration automation are not compatible - choose one.

### Monks Token Bar/Let Me Roll That for You.
When automating saving throws both of these modules allow you to have players roll their own saving throws and midi-qol will interact with them to prompt for and record the saving throws. Both are recommended. The only "issue" is that monk's token bar will not hide the monster names when displayed.

#### Automated Animation
This adds some nice animations to item/spell usage and is configured to work with midi-qol. Highly recommended.

#### Dice So Nice
If you like 3d dice rolled to screen this is a must have. It is mostly compatible with midi-qol. Any oddities are the result of midi-qol.

#### Active Token Effects 
This adds to the list of effects you can apply for things like vision lighting and so on.

#### Active Auras
This allows effects to be applied to nearby tokens without having to trigger any items. Think Palading Aura of Protection

#### 
## Configuration
### Conguration overview
First enable combat automation in the midi-qol settings.
The next sections cover configuring how that combat automation works, midi refers to a attack or spell cast as a workflow. You need to click on the workflow settings to manage the next set of settings.
#### Configure targeting
![Targetings](GettingStartedPics/Targeting.png)
#### Configure attack and damage rolls
Midi has several concepts that can be confusing to first time users.
* FastForward - if a roll is fastforwared the confuguation dialog for that roll will be skipped when midi does the roll. For attack and damage that means the advantage/disadvantage dialog is skipped.
* Auto roll - dnd5e creates a chat card with attack and damage buttons when you roll an item (click on the icon next to the item in the character sheet). If a roll is "auto rolled" midi will behave as if the button had been clicked.
* Modifier keys (formerly known as speed keys). When you click on a chat card button (let assume attack) you can hold Control (disadvantage) or Alt (advantage) to skip the roll dialog and use the modifer key settings. Midi allows you to press the alt/ctrl key when clicking on the character sheet icon to auto roll the attack with advantage/disadvantage. You can configure the midi-qol keys from Configure Controls in foundry settings section.

Both of GM and Player tab lets you configure how rolling an item behaves.
Auto Roll attack, when the item is rolled the attack is automatically rolled.
Auto Roll damage, never, only roll if the attack hits or always.
FastForward attack - skip the configuration dialog.
FastForward damage - skip the damage configuration dialog.

This works fine if you are doing an ordinary attack but sometimes you want to do some hand editing of the roll and not do everything automatically. The rollToggle key allows you to do this (dfault T). If you hold T when clicking on the item icon the normal sense of fastForwarding and auto roll is reversed. So if you were doing automatic rolls pressing T will display the Chat card for the item with attack and damage buttons ready for you to click.

##### GM Tab
![GM Attack](GettingStartedPics/GM_Settings.png)  
##### Player Tab
![Player Attack](GettingStartedPics/Player%020Settings.png)
#### Configure checking hits
![Hits](GettingStartedPics/Hits.png)
#### Configure checking saves
![Saves](GettingStartedPics/Saves.png)
#### Configure applying damage
![Damage](GettingStartedPics/Damage.png)
#### Configure active effects
![Special](GettingStartedPics/Special.png)
#### Configure special keys

### Advanced(ish) features
#### Configure Concentration
![Concentration](GettingStartedPics/Concentration.png)
#### Configure Reactions

## Now What
Once you configured combat to work the way you want, simple combats should work with automation, checking hits, rolling and apllying damgae using the standard SRD weapons. Spells that do damage/healing should also work with no further changes.

Beyond that people want to apply "Active Effects" to themselves or the targets to handle spell/feature effects.

To do that you will need to get items that are setup to work with midi-qol's automation and effect application.

There a quite a few sources of items and there are certainly others I am not aware of. And creating your own is doable, but sometimes a little bit complicated.
#### Sources of items
* **The SRD compendiums** A growing number of items in the SRD compendiums come with active effects pre-defined. These are always configured as "transfer effects" which means the effect is created on the actor that has the spell/item. This is usually NOT what you want for use with midi-qol for spells/items.  Simple spells/items can be made usable in midi-qol by changing the effect to no longer has transfer to actor when equipped disabled. The Bless spell is a good example.

* **Convenient Effects**. The module comes with a growing library of preconfigured effects for spells. Midi-qol is able to automatically apply those when the spell is cast - if you want to use these set "Apply convenient effects" to "Apply CE if absent apply item effects". Now any spell/feature with CE effects defined will get applied when the spell is used.

* **Midi Sample Items Compendium** A small number of items/spells/features are provided in the sample item's compendium. They are intended to showcase techniques you can use to create your own effects.

* **Midi SRD and DAE SRD** available as modules these provide quite a lot of items configured and ready to go.

* **@Crynmic** is creating lots of spell/item/feature effects. Access requires patreon support but there are many features available.

* **Others I don't know about** Probably many. 

### There is nothing I can find that does what I want....
If you get to this point then you'll have to create your own item. There are no definitive rules for how to do this. In combination midi-qol/DAE give you quite a lot of tools to implement what you need.
Here is a simple check list to get you started.
* Does the effect apply to a character when it is in their inventory? Example: Cloak of Protection.
Then you probably want a "transfer" (or passive) effect. The effect is transferred from the item to the actor that has it in their inventory. Dnd5e checks for attunement and if the item is equipped for the effect to be active. 
  - Cloak of Protection. Grab the SRD Cloak of Protection and import it. 
  - Edit the clock and click on the effects tab, then click on the edit icon next to the single Cloak of Protection effect.
  - You will see in the effect editor details tab that it is a trasnfer effect and on the effects tab it adds 1 to AC. 
  - Inexplicably the SRD item does not add to saving throws. 
  - To correct this, on the effects tab click the "+" to add a new effect.
  - Then set the attribute key field to data.bonuses.abilities.save, mode to ADD and Effect Value to 1.
  - Add the item to a character.
  - You will that the item has "requires attunement" - you will need to change this to attuned for the item to apply it's effects.
  - The item is not equipped and you will need to equip it for the effects to aplly.
  Once doing all of that the AC of the character goes up by 1 and the saves all go up by 1.
* Does the effect apply when I use the item?
If so you will need to setup non-transfer effects.
Let's do a very quick example using the SRD Bless spell. 
  - Import the spell into your world items and edit the effects from the effects tab. 
  - You will see that it is a transfer effect (the details tab) and on the effects tab a number of bonuses to be applied.
  - Disable the trasnfer to actor on the details tab and save the spell.
  - Make sure that "auto apply active effects to targets" is checked in the midi-qol settigs workflow tab.
  - Add the spell to a characters spell book, target someone and cast the spell by clicking on the spell icon on the character sheet (the same as rolling any item).
  - Examine the target character's sheet and in the effects tab you will see that the bonus effects have been applied to the character, with a durataion specified.

* An item target can be "self". Self targets always apply the effects to the caster.
* There are lots of spell/item/feature effects you can create with this simple model. Look at the DAE and midi-qol readme documents for a list of the available fields you can use. (A little plug for DAE - if you  enable the DAE editor working out which fields can be used is much simpler since both auto complete and a drop down list are available for entering the attribute key).

### Midi-qol special active effects.
Midi defines lots of flags that can affect how combat is adjudicated, for example granting advantage or disadvantage. Please see the readme for a list and explanation.


#### Overtime effects
#### Optional effects

#### Calling macros
There are lots of effects that just can be modeled with active effects. So you'll need to call a macro. Midi/DAE provide lots of ways to call macros. It is required that you have the module **Advanced Macros** active for this to work.

* **As an active effect** Dae supports calling macros as an active effect, macro.execute/macro.ItemMacro will call the macro when the effect is applied (args[0] === "on") or removed (args[0]==="off")

### Advanced ideas
Since items are copied when applied to an actor any time you change the effect for an item it has to  be copied to all actors that have the item. This can be tedious. If you use convenient effects to define the item effects any changes you make to the convenient effect will automatically be picked up by any actor with that item. This can be a big time saver.

**future option** convenient effect macros.
