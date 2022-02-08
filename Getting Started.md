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

## Prequisites
### Modules you must also install
#### libsocket
#### libwrapper
#### Dynamic Effects using Active Effects.
This is not striclty required but your life will be easier with it installed
#### Times-up
Required if you want effects to automatically be removed on expiry, either world time on combat turn/round.

#### Combat Utility Belt or Convenient Effects
Convenient Effects provides status effects, like blinded charmed and so pre-configured and can be applied to targets as the result of using an item. In addition when using a item midi can automatically apply the convenient effects defined effects for that spell.

Combat utility belt (CUB) allows configuration of status effects which you can apply with midi-qol.
CUB allows hiding of target names in chat cards for the standard rolls (attack/damage/saves) and complements midis hiding of target names. Midi respects the CUB settings for which actors should be hidden.
CUB Concentration automation and midi-qol concentration automation are not compatible - choose one.

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
* 
