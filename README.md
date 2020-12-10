# midi-qol
Midi-qol is a replacement for minor-qol and you should not have both modules active at the same time, but both can be installed at the same time.
Because there are some subtle differences in the way the module works, comapared to minor-qol you will need to experiment with the settings.

## HELP! My midi-qol disappeared.
If you've just updated midi-qol and it disappears from your in game list of modules you probably need to update your dnd5e system to the latest one.

## 0.7.8 + Hotfix
If you are running 0.7.8 plus the hotfix then processing of damage flavours is broken, that is damage flavors don't work. If you want them to come back changes lines 7661 of foundry.js to look like this:
```
    if (hasInner) {
      const formula = this.constructor.cleanFormula(this.terms);
      this.terms = this._identifyTerms(formula, {step: 1});
    }
### Changes in midi-qol:
* Speed item rolls has only a single function now, to enable ctl/shift/alt when clicking on the item icon. All other workflow features are configured separately. See **speed item rolls** below.
* There is support for a merged chat card containing attack/damage/hits/saves. (The merged card does not yet support better rolls). You can disable the merge card to restore the same operation as in minor-qol.
* midi-qol works with MagicItems, there may be some wrinkles aoutstanding there.
* backwards compatibility for the minor-qol.doRoll function.
* Lots more configuration options, accessed by a configuration screen.

## Changelog
https://gitlab.com/tposney/midi-qol/-/blob/master/Changelog.md


## (In)Compatibilities? ##
Any module that overloads item.roll is potentially incompatible.  

**Better Rolls** If you are using BetterRolls (which is a great module), midi-qol takes over once the hit/damage card is placed by better rolls. This means that resource consumption, template placement and critical/fumble, advantage/disadvantage determination are **all** handled by BetterRolls before midi-qol kicks in. Midi-qol checks hits, saves, applies damage and calls active effects.  In particular better rolls does not use any of the flags.midi-qol....   
**Magic Items** Thanks to @simone for his help and midi-qol is fully compatible with magic-items. The only issue is that spell templates for spells in a mgaic item are not auto placed on cast. Once placed everything works as expected.   
**Mess** Midi-qol and Mess dnd5e effects are not compatible. Template effects and the other features of that excellent module should work. If you want Mess attack/damage cards don't use midi-qol.  
**Cozy player** Minor-qol was not compatible with cozy-player, with targets being lost before attack/damage rolls were made. I have done only limited testing but it seems that there are no problems with cozy-player and midi-qol.  
**Cautious GM** Midi-qol breaks the blind chats by hidden GM feature of cautious GM.  
**Chat Portraits** If using Chat portraits the changes made by midi-qol to the token/actor name in chat cards are overwritten/lost. Choose which sort of highlighting you want - only one will work. Otherwise all seems to work.
**Ez-Roller** The send to chat log feature of ez-roller will disable combo cards in midi-qol.  
**Combat Utility Belt** There seems to be an incompatibility with CUB if you have Use Token Names set in midi-qol, so **DO NOT SET THIS IN Midi-qol** if you use CUB, which I do. The symptoms of the issue vary, but include many console error messages, not being able to roll attacks/damage or being unable to update some actors. If you use CUB disable Use Token Names in midi-qol  

## Technical Differences compared to minor-qol:
* midi-qol does not use the creation of chat messages as the trigger anymore, rather it hooks the standard item.roll, item.rollAttack, item.rollDamage. This means it is automatically compatible with any actor/npc sheet that uses standrd rolls (almost all of them)
* midi-qol uses the new 0.9.5 chat message meta-data to determine if a roll is a damage/attack/save roll which means the specific text matching piece is gone.

## Short Guide to the settings:
### Workflow settings
* **Speed Item Rolls** 
If speed rolls are off, all of the ctl/alt|meta/shift keys and roll behaviour behave the same as in core. There is one additional feature, if you click on a damage button in chat, CTRL+ALT click will use the critical/normal hit status from the midi-qol roll data.

If speed rolls are on you need to assign the keys yourself.
If you enable spee abilty rolls as well your key mappings will apply to ability check, save and skill rolls as well.

* advantage key modifier, defaults to ALT/Meta
* disadvantage key modifier, defaults to CTRL
* versatile key modifier, defaults to Shift.
* critical damage modifer, defaults to ALT/Meta.
* fast-forward key (turn any attack or damage roll into a fastforwarded one) advnantage+disadvantage.

If you assign a key multiple meanings the behaviour is going to be confusing at best.

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
  * The item has the exact text "no damage on save" in its description in which case there is no damage on save.   
For weapons the weapon properties (if set) take precedence over the description fields.

### Hits ###
You can enable auto checking of hits. Funbles automatically miss and criticals automatically hit. As GM you can mouse over the name of the hit target to highlight the token and click to select it. This is useful if you are not auto applying damage, since you can do all the damage application from the chat log, by clicking on the targets name, the clicking on the appropriate damage button.

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

## Custom Sounds ##
* Midi-qol uses whatever playlist you want for sounds, but they must all be in the same playlist. I will be extending the sound options, next will be specific sounds by damage type, then sounds per item use.
* A tiny selection of sounds is distributed with the module and are available in Data/modules/midi-qol/sounds and can be used to setup a playlist. 
* Attack, critical and fumble sounds are only available if using a combo card.
* Item use sounds are available when midi-qol is enabled and handling the roll (i.e. not better rolls).  
![Custom Sound Settings](pictures/sound.png)
## Other QOL settings ##
* **Add attack damage buttons to the inventory** If enabled a set of buttons (to bypass the midi-qol behaviour) are added to the description drop down in the inventory.
* **Fast forward ability rolls** If enabled allows you to bypass the advantage/disadvantage question when roll ability saves/checks, ctrl/alt are supported.
* **Critical Damage Type** adds options for how critical damage is treated. Only in core 0.7+.
* **Add Damage Buttons to Chat** If enabled then any dnd5e standard damage roll (not mess/BR etc) will have damage buttons added that appear on hovering over the card, provided a token is selected and allow applying damage to the **SELECTED** token, the damage immunities setting is used. This is the only place where midi-qol uses the selected token rather than targeted.
* **Item Delete Check** Displays a confirmation dialog if an item is deleted from the inventory.
* **Colored Border** Use the player color to put a colored border and/or color the actor/token name on chat messages.
* **DM sees all whispered messages** Copy the GM on all whispered messages.
* **Untarget at end of turn** At the end of a players turn(i.e. combat tracker is advanced) all/dead targeted tokens are untargeted. There is a GM option since I regularly forget to untarget after an attack and break things on the next turn. If midi-qol is managing the roll then dead tokens are untargeted after an attack, so that players can avoid "flogging a dead horse" as it were.
* **Players control invisible tokens** 0.7.1+. If enabled then players can both see and control tokens they own that are hidden. Also any token they own will **always** appear on their map. **Broken** in 0.7.4
* **Force Hide Rolls** If enabled private/blind/gm only rolls will only appear on the recipients chat log. This must be enabled if you are using better rolls and combo cards.  

## Not settings....
### Magic resistance.
If the target token has the SRD feat "Magic Resistance" or a custom damage reistance trait equal to exactly magic-resistant the auto rolled saving throws against magic effects (item type spell) with be rolled with advantage. This is really intended for NPCs with magic resistance to have their auto rolled saving throws made with advantage.    

If the above was all too tedious here are the setings I use.
## Settings for  full auto mode:
* Speed Item Rolls on - if you want to be able to shift/ctl/alt click.
* Merge to One card checked,
* Condense attack/damage cards checked.
* Auto Target on template Draw - walls block
* auto range target. Leave off until you are comfortable with the way everything else works.
* Auto FastForward - attack and damage. If you want to be prompted as to advantage/disadvanate/cirital/normal adjust appropriately. Even if enabled midi-qol will use the result of an attack (critica/normal) to do the roll.
* Auto Check Hits - Check your choice as to whether the players see the results - I use on.
* Auto roll damage - Attack Hits
* Saves - Save, your choice of whether the players see the results - I use players see reults.
* Check text save - depends on you. If enabled the text of the spell  description is searched to see if the damage on save is half/no damage.
* Players Roll saves - Let Me Roll That For you
* PLayer save timout - I give my players 20 seconds but you can choose what works for you.
* Auto apply damage - yes + undo damage card
* damage immunities - apply immunities + physical. (if a weapon attack has a plus in the item detail or the damage came from a spell or the Magical property is checked) the damage is considered magical.
* auto apply item effects to targets checked. This will apply any dynamic effects to targets when:
1. The item has a save and the save fails.
2. The item has an attack and the attack hits.
3. There is no attack or save.

## Special Active Effect Expiry
* [Requires DAE 0.2.25+]  Effects support additional expiry options (which apply in addition to the normal duration based expiry) (available on the DAE effect duration screen) that can be chosen:
  * 1Attack: active effects last for one attack - requires workflow automation
  * 1Action: active effects last for one action - requires workflow automation 
  * 1Hit: active effects last until the next successful hit - requires workflow automation 
  * turnStart: effects last until the start of self/target's next turn (check combat tracker)  
  * turnEnd: effects last until the end of self/target's next turn (checks combat tracker)  
  * isAttacked: the effect lasts until the next attack against the target.
  * isDamaged: the effect lasts until the target takes damage.
All of these effects expire at the end of the comabt


## flags.midi-qol
Midi-qol supports a number of flags values that alter how attacks/casts are rolled. They are supported by an modules that use item.rollI(), item.rollAttack(), item.rollDamage() or actor.useSpell() [the standard dnd5e rolls]. Usually you would apply these via active effects.  
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

flags.midi-qol.fail.all/ability.all/ability.check.all/ability.save.all/skill.all etc to auto fail a given roll.  

* flags.midi-qol.fail.spell.all
* flags.midi-qol.fail.spell.vocal/somatic/materical  
Fails attempts to cast spells with the specified components (or all).

* flags.midi-qol.grants.advantage.attack.all
* flags.midi-qol.grants.advantage.attack.mwak/rwak/msak/rsak  
Gives the attacker advantage on attacks made against the target. Midi-qol only checks the first target in the event that multiple are selected.


* flags.midi-qol.critical.all
* flags.midi-qol.critical.mwak/rwak/msak/rsak/other
* flags.midi-qol.noCritical.all
* flags.midi-qol.noCritical.mwak/rwak/msak/rsak/other
* flags.midi-qol.DR.all - all incoming damage
* flags.midi-qol.DR.non-magical - non-magical bludgeoning/slashing/piercing
* flags.midi-qol.DR.acid - specific damage types
* flags.midi-qol.DR.bludgeoning
* flags.midi-qol.DR.cold
* flags.midi-qol.DR.fire
* flags.midi-qol.DR.force
* flags.midi-qol.DR.lightning
* etc  
These flags can be used to grant damage reduction to a character and can be set by active effects and are evaluated after derived fields are calclulated, so things like dex.mod etc ar available.  
flags.midi-qol.DR.all upgrade 3, will give 3 points of damage reduction to all incoming damage.

## Bugs
probably many however....
* Language translations are not up to date.

## Notes For Macro writers
For modules that want to call midi-qol it is easier than in minor-qol. Just call item.roll() or actor.useSpell, and if you pass an event via item.roll({event}) you can have key accelerators. (the meanings of shift/ctl/alt will be interpreted using the speed rolls settings)
event.altKey: true => advantage roll
event.crtlKey: true => disadvantage roll
event.shiftKey: true => auto roll the attack roll

* MinorQOL.doRoll and MinorQOL.applyTokenDamage remain supported.
* MidiQOL.applyTokenDamage is exported.
* If you have macros that depend on being called when the roll is complete, that is still supported, both "minor-qol.RollComplete" and "midi-qol.RollComplete" are called when the roll is finished. The passed data has changed, it is a copy of the workflow which contains a big superset of the data passed in the minor-qol version, but some of the field names have changed. See also the onUse macro field which can be used to achieve similar results.

* midi-qol supports a TrapWorkflow, triggered by
```
new MidiQOL.TrapWorkflow(actor, item, [targets], {x:number, y:number})
```
Which will roll the atack/and or damage and apply to the passed targets. If the item has an area template it will be placed at x,y and targets auto selected inside the template.

Sample DoTrapAttack replacement:
```
  let tactor = game.actors.entities.find(a => a.name === args[0])
  let item = tactor.items.find(i=>  i.name === args[1])
  let trapToken = canvas.tokens.placeables.find(t=>t.name === args[2])
  new MidiQOL.TrapWorkflow(tactor, item, [token], trapToken.center)
  ```

* midi-qol supports a DamageOnlyWorkflow to support items/spells with special damage rolls. Divine Smite is a good example, the damage depends on whether the target is a fiend/undead. This is my implementation, which assumes it is activated via midi-qol's onUse macro field.
I have created a spell called "Divine Smite", with no saving throw or damage or attack, (although you can have such things) which has an onUse macro set to Divine Smite. (see the onUse mcro details below)

```
if (args[0].hitTargets.size === 0) {
console.error("no target selected");
return
}
let target = canvas.tokens.get(args[0].hitTargets[0]._id)
let numDice = 1 + (Number(args[2]) || 1)
let undead = ["undead", "fiend"].some(type => (target.actor.data.data.details.type || "").toLowerCase().includes(type));
if (undead) numDice += 1;
let damageRoll = new Roll(`${numDice}d8`).roll();
new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "radiant", [target], damageRoll, {flavor: "Divine Smite - Damage Roll (Radiant)", itemCardId: args[0].itemCardId})
```

Flavor is only used if you are not using combo cards.  
The args[0].itemCardId passes the id of the item card that caused the macro to be rolled, i.e. for divine smite the ItemCard of the Divine Smite spell/feature. By passing this to the  DamageOnlyWorkflow the damage roll can be added to the ItemCard making the whole effect look like an item damage roll (almost). 

You can use this feature to roll custom damage via a macro for any item, just leave the item damage blank and roll the damage in a macro and then pass the itemCardId to the DamageOnlyWorkflow.

### OnUse Macro Item detail field
This field lets you specify a macro to call after the item roll is complete. It is ALWAYS called whether the attack hit/missed and is passed the following data as args[0]. The field should contain ONLY the macro name and recognises the exact text ItemMacro to mean calling the items itemMacro if any.
```
  actor = actor.data (the actor using the item)
  item = item.data (the item, i.e. spell/weapon/feat)
  targets = [token.data] (an array of token data taken from game.user.targets)
  hitTargets = [token.data] (and arry of tokend ata take from targets that were hit)
  saves= [token.data] (and arry of tokend ata take from targets that made a save)
  failedSaves = [token.data] (and arry of tokend ata take from targets that failed the save)
  damageRoll = the Roll object for the damage roll (if any)
  attackRoll = the Roll object for the attack roll (if any)
  itemCardId = the id of the chat message item card (see below)
  isCritical = true/false
  isFumble = true/false
  spellLevel = spell/item level
  damageTotal = damage total
  damageDetail = [type: string, damage: number] an array of the specific damage items for the attack/spell e.g. [{type: "piercing", damage: 10}]
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

## Sample Chat Logs
![No Combo Card](pictures/nocombo.png) ![Combo Card](pictures/combo.png)
