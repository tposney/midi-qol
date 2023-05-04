### 10.0.41
* Reverted original change that caused applyTokenDamage problems. Added applyTokenDamage to my test cases, so should not happen again.
* Fix for undoWorkflow to remove flags that should be removed. Thanks @thatlonelybugbear

### 10.0.40
* Fix for applyTokenDamageMany with a null/undefined item.
* Added exports of displayDSNForRoll, playerFor(token), playerForActor(actor)
* Fix for not colorising damage rolls when using dice so nice.
* First implementation of undo workflow. **NOT SUITABLE FOR PRIME TIME**. Enable on the mechanics tab. If enabled midi records undo data for all item rolls in a stack stored on the GM client. You can undo item rolls via MidiQOL.undoMostRecentWorkflow() which must be executed on the GM client (there is currently no UI for undoing rolls), which restores affected actors to a state before the item roll was started - dropping **ALL** subsequent changes. The stack is cleared on a game reload (currently). Resotring concentration known not to work. Non-merge card attack/damage roll cards not removed, but merge cards and damage cards are. Does support undoing reaction effects which are included in undoing the roll that triggered them. Feedback from the brave appreciated.

### 10.0.39
* Put back definition of item when calling an onUse macro

### 10.0.38
* reenable flags.midi-qol.optional.NAME.criticalDamage which allows the bonus roll in the optional field to do critical damage if the damage roll is critical.
* Reaction processing requires "enforce reaction checking" to be all/match the actor type for midi to prompt for reactions.
* Some fixes for rolling damage with other damage when no token is on the map/no token targeted.
* Some clean up for sw5e.
* Added await for some of the triggerTargetMacro calls - thanks @Elwin
* Additional feature for activation conditions and roll other damage. To be able to implement features/weapons that only do damage against a specific type of creature (or other activation condition), you can put 0 damage in the damage formula (not blank) and put all the damage in the other formula. Midi will evaluate the condition (per token) and if there is damage to apply the other damage will be displayed as the main damage and applied to targets for whom the activation condition evaluates to true, make sure to set roll other damage on the item. Have a look at the sample undead smite for how to set this up.

### 10.0.37
* Nearby foe rule now does not include incapacitated foes and checks to see that the foe can see the target.
* Some cleanup of using ammunition with saving throws (use the ammo name for the save). If both the original item and ammo have other damage rolls/saving throws the ammo item will be used for saving throw type/dc and other damage roll.
* Typo fix for template placing - thanks @elwin
* Checks for tokens being incapacitated now will check for the CE condition incapacitated and core/CE stunned condition as well.
* Additional option for overTime effects allowIncapacitated=true|false. If true overtime effect will still be processed for incapacitated actors. Useful for effects that allow a saving throw to remove a condition, e.g. power word stun.
* Added Power Word Stun to midi sample items compendium.
* Added Darkvision 60ft as an example of how to use ATL effects.
* Added two versions of goggles of night, one that follows RAW and one that uses light amplification mode since it looks very cool. Equipping the item causes the effects to be applied, unequipping removes them.
* target macros are now awaited. Thanks @Elwin
* If the only damage type done on an attack is "none" do not display an apply damage card. Thanks @Elwin
* Removed midi-qol item delete check support, since it is now covered by dnd5e/core and caused a compatibility issue when deleting classes.
* Rewrite of midi dice so nice support. Midi will now display a dice so nice 3d dice whenever it is rolled and display subsequent dice as required. So if you roll and attack roll the d20 will be immediately displayed (unless hidden by gm settings) and then any optional bonus dice will be rolled when the optional bonus is used. The final formula will include the optional bonus. This removes the case where optional bonuses would cause the d20 to be rolled again with the same value.
* Fixed a bug with optional bonuses which reroll the d20 not triggering criticals/funmbles.
* Fixed a bug with reactions from magic item spells.
 * if midi is checking the special duration (all of the isXXXX special durations), the first effect that triggers will cause all subsequently applied effects to trigger as well (no matter what there special duration is). 
* New flags.midi-qol.damage.reroll-kh, flags.midi-qol.damage.reroll-kl which will roll damage and otherFormula (if required) twice and keep the highest/lowest of the two rolls.
* First steps for v11 compatibility. Informal tests suggest that it more or less works but is NOT ready for prime time.


### 10.0.36
* Change so that neutral tokens NEVER contribute to flanking/flanked condition checking or get the flanking status. If you 
want a token to contribute to flanking you must set it to be hostile to the target token.
* Fix to allow oevertime effects action saves to support multiple skill rolls, e.g. actionSave=true, rollType=skill, saveAbility=acr|ath to allow an acrobatics or athletics check.
* reduce number of "actor is incapacitated messages generated".
* Fix for template spells provided by the magic items module not picking up targets.
* Fix for flags.midi-qol.DR.all reducing healing
* Slight change to damage application which treats the whole of the damage for the purposes of saving throws, rather than adjudicating the save per damage type (will increase damage by up to 1 point if there are two damage items each being an odd number - e.g. 3bludgeoning + 5cold and saved against, previously would be 3/2 + 5/2 = 1 + 2 = 3pts, now will be [3 + 5]/2=4 points).
* Fix for late targeting being disabled after first roll.

### 10.0.35
* Bug fix for unable to roll damage/mark wounded if optional rules disabled.
* Niche request, whereever you specify a an itemOnUseMacro or actorOnUseMacro midi now supports function.**functionName**, where function name is the name of any function available in the global scope. The function is called via
```js
functionName.bind(workflow)({ speaker, actor, token, character, item, args })
```
and gets the same argumens as would be passed to the macro function. So for example
flags.midi-qol.onUseMacroName CUSTOM function.MidiQOL.log, preItemRoll
* removed some left over debug error messages

### 10.0.34
* Fix for numeric values in concentrationSaveBonus throwing an error (i.e. 5 instead of +5).
* Added flags.midi-qol.grants.max.damage.all/heal/mwak etc. Useful for Beacon of Hope, with flags.grants.max.damage.heal set on the target, healing actions (i.e. spells/potions/features marked as healing actions) will do max possible healing.
* Added flags.midi-qol.grants.min.damage.all/heal/mwak etc
As with the other flags.grants for attacks/damage rolls only the first target is checked and that is used for all targets.
* Added rollMode to overtime effects settings. You can specify gmroll, blindroll, publicroll, selfroll and the rollmode will be applied to the overtime item roll
* Fix for respecting the "don't auto roll ability rolls" setting when using monk's token bar.
* Additional option for flags.midi-qol.absorption.type, you can now specify a numeric value instead of true false. The damage type will be converted to healing and the quantum of the damage will be multiplied by the specified value (e.g. flags.midi-qol.absorption.acid OVERRIDE 0.5 will convert incoming acid damage to heal 1/2 of the acid damage). Negative numbers can be specified. So flags.midi-qol.absorption.acid ADD -1.5 will cause acid damage to do 1.5 times as much damage and be of type healing so will ignore acid damage resistance/vulnerability.
* By request included an optional game mechanic to re-roll initiative at the start of a round. **Warning** this may screw with the expiration of effects  with a duration in rounds/turns, since they will expire on the round/turn specified, even if the actor they are associated with has moved in the initiative order.
* Fix for marking dead/unconscious misbehaving after 10.0.33
* Added additional token actor macro calls for preApplyTargetDamage and preTargetSave, called before applying damage, but after damage is calculated so you can change the damage done, and before target saves are rolled to let you change things like advantage or bonuses etc.
* Change to flags.midi-qol.DR.healing to allow negative values, which will increase healing. There may be some oddities if you have an item that both heals and does damage - so probably don't do that. flags.midi-qol.DR.heal (the action) is disabled, always use .healing to adjust the specific healing on the roll.


### 10.0.33
* Fix for not picking up Build a bonus save dc bonuses.
* More changes for the new version of convenient effects, not setting duration correctly.
* Fix for DamageOnlyWorkflow not displaying item card correctly.
* Fix for "chat message" save handling not picking up the save rolls.
* New Reaction option, reaction Pre Attack Roll. The reaction is processed after the attack roll is initiated but BEFORE the attack is actually rolled, so that effects that impose advantage/disadvantage on the attack roller can be implemented. 
* Sample items Warding Flare which causes the attack to be made with disadvantage; Make Miss which causes the attack to miss.
* Fix for item.displayCard() throwing an error.
* Added hasUsedReaction(actor), setReactionUse(actor), hasUsedBonusAction(actor), setBonusActionUsed(actor) to MidiQOL exports.
* Updated Sneak Attack and Rakish Audacity(10.0.33) to reflect all critical damage settings when rolling a sneak attack/rakish audacity attack. This uses the dnd5e DamageRoll and dnd5e settings to do the calc so can be a useful way to do other rolls that need to be aware of critical damage.
* **Breaking** Currently when rolling 1 attack per target all workflows are removed at the end of the roll (since the workflow refers to a single target not all the targets). Now if there is only 1 target the workflow will be left.

* Added optional rule for vitality (homebrew - first release). If enabled you can specify a field in the actor (usually a resource - system.resources.primary.value) to act as a vitality pool. Once HP are exhausted damage is done to vitality, if vitality is exhausted the character is dead. Characters suffer no penalties when hp drop to 0. Any incapacitated check **should** now look for vitality of 0. Vitality cannot be healed by cure spells.

* There are some additional actor onUse macro triggers (but NOT item triggers) available when the actor is the target of an attack/spell/feature use:
  - "isAttacked": the actor is a target of an attack
  - "isHit": the actor is a target of a hit
  - "isSave": the actor makes a successful save in response to being targeted
  - "isSaveSuccess": the actor makes a successful save in response to being targeted
  - "isSaveFailure": the actor makes a failed save in response to being targeted
  - "isDamaged": "the actor is damaged by an item roll
  * Be aware that the macroData is passed in the same way as for all other onuse macros, so args[0].actor will be the actor that made the attack/cast the spell/used the feature.
  * args[0].options.actor, args[0].options.token will be the actor/token that was attackd/hit/damaged etc
  * Added item Retribution which when added to an actor does 1d12 damage to the attacker when the target is damaged. Shows how to use the new actor onUse flags and references the item macro from the compendium.

### 10.0.32
* Turns out I missed quite a lot of changes needed for Convenient Effects 4.0.2. Should fix flanking, wounded/dead markingincapacitated checking. This is (hopefully) all of them.

### 10.0.31
* Midi merge cards should now be compatible with quick-reveal
* Tool checks now benefit from optional bonuses that apply to ability checks.
* Improved behaviour when checking flanked status and tokens are at different heights.
* midi-qol is now compatible with and **requires** Convenient Effects v4.0.2. Backwards compatibility with previous versions is not supported.
* **Breaking** Addition to findNearby to allow inclusion of incapacitated actors, MidiQOL.findNearby(disposition, token, distance, {maxSize, includeIncapacitated}). Only breaking if you were including a maxSize before, you'll need to use {maxSize: size} instead.
* For @Elwin only register for the createTemplate hook if the item has areaTargets set.

### 10.0.30
* Fix for cases where players end turn in combat causing over time errors.
* Fix for es.json not supporting monk's token bar saving throw option
* Guard for players attempting to apply damage to tokens they do not own in players damage card.
* Fix for late targeting thinking that targets were selected after using an item and then reusing it.
* Fix for throwing an error when a malformed message is sent to the chat log and trying to color the borders/name of the message.
* Fix for no full cover flag not applying. Spell with no full cover set will now give NO cover save bonus at all. This means you can have fireball do what it is supposed to do. To use this you must set targeting to all (without or without ignore defeated) and rely on the cover module you are using to generate the correct bonuses to saves. If targeting is not set to all walls will block the target token from being targeted at all.
* The default branch for midi-qol is now the v10 branch.

### 10.0.29
* Fix for optional bonuses that are roll expressions rather than just numbers.
* Fix for findNearby not counting tokens of distance 0 from the token.
* Hack to avoid problems with perfect vision and checking canSee.
* Looks like conditional visibility is not going to make it to v10 so I've removed support for it.
* Added additional expiry checks - thanks @Elwin

### 10.0.28
* Support decimals in ranged attack disadvantage to support metric based systems, e.g. 1.5 meteres.
* Fix for advantage/disadvantage not using the correct visible/not visible test.
* Fix for workflow.setAttackRoll() might break if the target has Reactions and you set the AttackRoll to a NumericTerm - thanks @thatlonelybugbear.
* Color saves/failed saves if highlight hits/misses/saves is set in the misc tab.
* **Breaking** If you have attack roll per target set and attempt to roll with no targets set,midi will obey the require targets settings. So if no requirement for selecting targets before rolling is set midi will do the roll with no targets.
* Added DR.slashing/piercing etc to sw5e.
* Some cleanup for rolling saving throws with optional effects, removed duplicate dice so nice display, fixed interaction with LMRTFY (causing saves to not register) and updated display of the roll to show the modified roll (with pluses etc and the original dice rolls).

### 10.0.27
* When critical margin is enabled (optional rule) you can allow natural 20s to still be criticals.
* Override default foundry behaviour so that when clicking a button on a form alt/ctrl will still work.
* Fix for Aura of Protection using Build a Bonus.
* Added heal temphp button to damage card in line with dnd5e apply damage menu.
* Fix for late targeting/attack per roll interaction causing late targeting to be called multiple times.
* Compatibility change for lmrtfy 3.1.2 (which midi now requires - or later).
* Ability to color highlight hit/miss on hit miss display (on misc tab).
* Fix for dnd 2.0.3 and fetching baseItem.
* updated ja.json

### 10.0.26
* More fixes for changes in traits changing to Set
* Revert minimum version to 2.0.3 to avoid midi disappearing from module list
* Reenable support for advantage/disadvantage keys when using late targeting.
* Fix for always deleting first actor on use macro rather than the selected one
Known Bug: Midi keyboard handling has been scrambled by a found change (not sure when) to auto release pressed keys when clicking on a button - which means cases where clicking on a form button while holding alt/ctrl/etc will be treated as a simple key press.

### 10.0.25
* Fix for dnd5e 2.1 traits changing to sets rather than arrays
* Fix for dnd5e 2.1 changes to getBaseItem in midi-sounds throwing deprecation warning
* Fix for dnd5e 2.1 changes to initiative handling.

Changes should be backwards compatible with 2.0.3 but have not tested in detail. So only upgrade if you have moved to dnd5e 2.1.x

### 10.0.24
* Fix for editing actor on use macros when there is an active effect also providing an onUseMacro
* Fix for levelsAutoCover giving too much cover.
* Support for pool terms "{1d6+2}" in damage rolls. Due to dnd5e's treatment of pool terms, pool terms in damage rolls will NOT do critical dbuildamage.
* Added support for the "anonymous" module. If installed it will take precedence over combat-utility-belt for hiding names in chat/hit/saves etc. The hide item details feature of anonymous works with midi-qol.
* Fix for DamageOnlyWorkflow and cover calculations.
* Dice so nice attack rolls display all dice even if an optional roll is triggered.
* Added auto save friendly item property, which when set means allies of the caster/attacker will always save.
* Fix for reaction optional flags not firing if no other reaction items are present.
* Hooks that fire on midi-qol.DamageRollComplete can now modify the damage roll and the chat card displaying the damage will update accordingly.
* Added ko-fi link https://ko-fi.com/tposney for those that want to support the module financially.

### 10.0.23
* Added off hand midi property, if set weapons won't do modifier damage bonus (think two weapon fighting).
* Added friends fail (saves) property. Exactly same behaviour as the existing string "auto fail friendly" in item description.
* Fix for (occasional) issue with item delete check causing odd effects with tidy sheet.
* Fix for action saves in overtime effects mis-behaving.
* Added option to auto roll damage for items with saves only.
* Fix to support BaBbonus fumble range.
* Fix for incorrectly removing concentration when a actor effect is removed, only relevant if you have "remove concentration when effects removed" set to Check Effects or Check Effects + Templates
* Updated Hunter's Mark for the case that you have multiple copies of the spell. Also correctly transfer marked status when casting the spell when the target is dead/removed, not consuming a spell slot and keeping the existing duration.

### 10.0.22
* Fix for castdata not being set correctly
* Fix for error thrown when using Automatic Animations to remove templates. If you are using automatic animations auto remove templates then midi's cover calculations for templates are disabled as the template is removed before midi does its checks.
* Fix for damage reduction applied twice.
* Fix a bug When there are no token for the actor rolling an attack with cover calculations enabled throwing an error. Now will simply ignore cover when there is no attacking token.
* Don't remove the chat card attack button unless the setting is enabled.
* Fix for simbul's cover calculator throwing an error when calculating LOS if the targeted tokens includes the attacking token.
* Slight clean up of dsn ghost dice behaviour when using hide roll but show DSN dice.
* Fix for bug not displaying damage bonus dice rolls in DSN.
* Fix (?) for removing concentration not removing actor effects on unlinked actors.
* Fix for infinite loop when action saves are checked. (Occurs when turn start is true and actor make a save of the correct type during their turn).

### 10.0.21
* Fix so that midi picks up the damage type for ammo items specified via the drop down list.
* Update damage resistance etc to pickup custom damage resistance etc fields that map to an actual damage types. So to have custom damage types you need to update CONFIG.DND5E.damageTypes with your new damage type, then either also update CONFIG.DND5E.damageResistanceTypes (in which case it will appear in the drop down list) or use the custom field specifying the custom damage type as a damage flavor.  So to add a new damage type use
```js
CONFIG.DND5E.damageTypes["fubar"] = "Fubar";
CONFIG.DND5E.damageResistanceTypes["fubar"] = "Fubar";
```
and fubar will appear in damage type dropdown and damage resistance form, or just 
```js
CONFIG.DND5E.damageTypes["fubar"] = "Fubar";
```
and fubar will appear in the damage drop down and you'll need to put fubar in the custom resitances.
* Added No Full Cover option to item properties. If set a target can't benefit from full cover (will be downgraded to 3/4 cover for spells like Fireball that go round corners.
* castData added to onUseMacro data args[0].

### 10.0.20
* Disable levels auto cover debug.
* Fix a bundle of typos. Thanks @Elwin
* Fix for magically growing cover options in config panel.
* Cleaned up handling of Advantage Reminders text. The new version will lead to some duplication which I'll have to review in the next release.
* Disabled Simbul's Cover Calculator for AoE spell save bonus. When the required function is available in Simbul's Cover Calculator it will be auto enabled.
* Added preTargeting onUse macro call and preTargeting Hook. This is called before any item use processing is done It is also called before the workflow is created so only very limited data is available. A dummy workflow (if a workflow does not already exist for the item) is created, with the item/actor and selected targets is passed to the macro/hook.
* Experimental support for players (other than the one that case the spell) (i.e. GM) to place the measured template for a spell. So if a player on a "limited" machine casts a fireball the GM can place the template for them instead.

### 10.0.19
* **BREAKING** Updated behaviour for critical damage "Double Rolled Damage". This will now double the result of each damage dice rolled, rather than rolling each dice twice. If you want to double numeric terms as well use the DnD5e setting for that.
* Revamped walls block ranged attacks and cover providing bonuses behaviour. Support for Simbul's Cover Calculator and Levels Auto Cover.
* **Walls Block targeting** options are:
  - No - walls do not block ranged attacks.
  - Center Check - Midi will draw a line from the center of each square covered by the attacker and target, if there is at least one line with no collision the attack will be allowed to continue.
  - Center Check + Levels - Draw a line from the centers, but take into account wall height and token height. Requires levels + wall height to be installed.
  - Levels Auto Cover - if the amount of the token visible is less than the 3/4 cover setting (i.e. not much visible) the attack will fail.
  - Simbul's Cover Calculator - if the cover value is full cover the attack will be fail.
* **New Setting - Compute Cover Bonus**: You do not need to enable this if you are used to using Levels Auto Cover or Simblu's Cover Calculator, but if you want the AC to be automatically evaluated by midi you can enable it.
    - None - do not add a cover bonus to the target AC
    - Levels Auto Cover - check the cover percentages (as specified) and apply a bonus of 5 (3/4 cover), 2 (half cover) or 0. The cover percentage for "no cover" is either the 3rd element in the module setting (if there is one), otherwise 90% visible. To have midi use levels auto cover you should set "levels api mode" to checked in the levels auto cover config settings.
    * Midi Spell Sniper and Sharpshooter flags negate the cover bonus.
  * Cover calcs impact dexterity saves. This includes all types of items causing a dex save - not sure if this is right or not. Midi Spell Sniper/Sharp Shooter flags negate the cover bonus.
  * Please note that for cover/walls blocking I simply call the API provided by the module. Cover calculations are not performed by midi, so any "odd" behaviour with cover values are probably not midi's fault.
* Fix for infinite loop caused when dragging a starter hero to the canvas. This does not resolve the foundry errors but does stop the infinite loop.
* Midi now uses the dnd5e Hooks for death saves, rather than wrapping the function. No difference to the end user. Over time I will look to migrate as much of midi's functionality to use the new dnd5e hooks as I can.
* removed non-working flags.midi-qol.optional.NAME.criticalDamage
* Fix for damage rolls like 1d4 / 2 incorrectly evaluating the applied damage.
* Fix for flanking not working in metric worlds. Midi will now use the canvas dimensions to check adjacent squares.

### 10.0.18
* Include correct fix for stack overflow

### 10.0.17
* Fix for bug when processing onUseMacro edits.
* Fix for Shillelagh not setting magical property or spellcasting modifier. Thanks @OokOok
* Fix for Branding Smite under certain midi-qol settings. Thanks @OokOok.
* Fix for Chill Touch, creates damage immunity to healing instead of resistance. Thanks @OokOok
* Removing concentration when removing effects/templates is now configurable.
* Fix for walls blocking not working with current foundry version for both ranged attacks and template placement.
* Fix for chat message coloring not integrating with some other modules.
* Fix for reaction processing throwing a call stack exceeded.

### 10.0.16
* **BREAKING** untarget at end of turn is now a per client setting, so that each player can decide if they want to untarget at the end of the turn. The deprecated setting "untarget dead and all GM" will be matched to untarget dead (for non GM) and untarget all for the GM. You can use one of the force setting modules to ensure the client settings are correctly configured.
* Cleaned up styling of damage buttons to ensure there is a gap to reveal the damage roll tooltip.
* Overtime effects now support the same expressions as flag condition do.
* Added effects (the source actors effects) to the available data in evaluating conditions, so a condition could be
``flags.midi-qol.disadvantage.attack.all CUSTOM effects.some(ef=>ef.label==="Restrained")``
* Small change to concentration processing. If the last active effect/template associated with the concentration effect is removed concentration will be removed. For example, if you bless 2 characters and then bless is removed from both of those characters, concentration will be removed from the caster.
* Fix for getSelfTarget throwing an error when there is no token for the actor on the current scene.
* Added Melf's Minute Meteors to sample items compendium. This uses the new (10.0.10) dae feature to create an item on the caster which does the meteor attacks. There is a spell Melf's Minute Meteors which grabs the Melf's Minute Meteors feature from the compendium and creates it on the caster with the correct duration. On expiry of the spell the feature is automatically removed.
* Added some sorcery features to the sample items compendium, Font of Magic (required for the other features), Quickened Spell and Twinned Spell. All need to have the resource consumption set to Font Of Magic in the feature details. Font of Magic macro stolen from @Zhell with a few tweaks. 
  - Font of Magic handles conversion of spell slots to/from sorcery points (and stores the number of sorcery points).
  - Quickened spell prompts to select the spell to be cast and then changes the casting time to a bonus action.
  - Twinned spell allows you to choose two targets, then which spell to cast.
* Added a few playful items to the sample items compendium (i.e. they sort of work but are not perfect), goggles of night, bullseye lantern and lantern of revealing.
  - Goggles of night grant light amplification when equipped (rather than dark vision cause it looks cool). This item is really just for fun until ATE is ready to do it properly.
  - Bullseye lantern is pretty self explanatory. Activated by using the item (set it to consume oil flasks if you are into tracking such things).
  - Lantern of Revealing. This is not actually correct, it only grants see invisible to the holder of the lantern, rather than all tokens in the light range (will need to wait for AA to do this correclty). Activate by using the item and set it to consume oil flasks if you are into tracking such things.

### 10.0.15
* findNearby now accepts a tokenUuid or a token.
* added findNearby to activation condition evaluation, so 
```
flags.midi-qol.disadvantage.attack.rwak CUSTOM findNearby(-1, tokenUuid, 5, 0).length > 0
```
will give disadvantage on ranged weapon attacks if there is a foe within 5 feet (the same as the midi-qol optional rule - but less efficient) or
```
flags.midi-qol.disadvantage.concentration CUSTOM findNearby(-1, tokenUuid, 5, 0).length > 0
```
will give disadvantage on concentration saves if there is a foe within 5 feet.
* Fix for rage not processing mwak with default ability.
* Minor fixes for magic items/confirmation that midi + magicItems works in v10.
* Change to item rolling, midi now overrides the default item card.
* Fix for concentration removal throwing an error "No permission".
* Fixed an odd race condition when removing concentration when casting another concentration spell.
* Update behaviour of inventory item attack/damage buttons to replicate the behaviour of standard chat card buttons and using core dnd5e accelerator keys.
* Fix for incorrect highlighting of critical success when rolling tool checks.
* I am making build-a-bonus a recommended module for midi-qol, because it provides some great functionality. The sample item's compendium will assume build-a-bonus is installed. This is most obvious for aura effects.
* For settings in the config settings mechanics section enabling optional rules is not required. Similary, if those settings were already enabled but rendered inactive due to the optional rules setting, they will now be active. So check those settings.
* Macro references, actor/item onUseMacros can now refer directly to compendium macros - a name like Compendium.scope.packName.macroName or Compendium.scope.packName.macroId (e.g. Compendium.dae.premadeitems.echo) will fetch the macro from the compendium and execute it. If there is more than one match the "first" will be used.
* Added mechanics setting for advantage with ability checks giving advantage on corresponding skill rolls or not - default true.
* Stop damage rolls from having the damage type appended to each term of the roll.


### 10.0.14
* Fix for item/actor onUseMacro editing.
* Fix for typo in humanoid list.

### 10.0.13
* Gratuitous changes to midi-qol config panel - first step to adding some more game mechanics changes, like legendary/lair action count resets at combat update or moving those to another module and removing them if I make a module for those.
* Fix for wrong error thrown when doing self target effects with no token on the canvas.
* Any effect applied via using an item will populate (on the effect):
flags["midi-qol"].castData with {baseLevel: number, castLevel: number, itemUuid: string}.
  - Also works for convenient effects applied by midi when using an item.
* Added config option for damage immunity to specify the amount of damage passed through, like damage resistance - in case you do not want immunity to be quite so immune. So a value of 0.25 means 25% of the damage will get through if immune to the damage type. (Default 0). If you want a creature to be immune to the first (say) 10 points of slashing damage create an effect and use flags.midi-qol.DR.slashing OVERRIDE 10 - or flags.midi-qol.DR.phsyical OVERRIDE 10 for all slashing/bludgeoning/piercing.
* Added support for combat utility belt and reactions/bonus actions. If Convenient Effects is not installed midi will look at the CUB conditions and if there is a condition whose name is the localised text of DND5E.Reaction(Reaction)/DND5E.BonusAction(Bonus Action) it will be applied/removed to/from the actor when use of a reaction/bonus action is recorded.
* Sample items updated to use dae 10.0.9 feature where ItemMacro (as a flag value - e.g. damage bonus macros) does not need to specify a name, on application of the effect (passive or active) ItemMacro will be mapped to ItemMacro.<item.uuid> which will fetch the correct macro rather than a name match. (Hunter's Mark and Sneak Attack)
* Fix for broken Shillelagh cantrip macro.
* Fix for Actor onUseMacros not saving when edited.
* Fix for nearby foe disadvantage for thrown weapons when standing next to an opponent, assume attacker will use the weapon as a melee weapon instead.

### 10.0.12
**Breaking** 10.0.12 **requires** dnd5e 2.0.3 or later and won't activate without it.
* Fixed a bug where templates were sometimes not removed with concentration if concentration expired.
* Change to DR (damage reduction behaviour). Negative DR (meaning extra damage) is always applied in full if there is damage of the appropriate type. so flags.midi-qol.DR.mwak OVERRIDE -10 means any melee weapon attack will do an extra 10 points of damage. This is independent of other DR that may be present on the actor.
* Fix for optional effects not consuming resources. (Lucky is an example).
* Fix for isHit special duration expiring whenever the character takes damage/healing (i.e. cure wounds spell).
* Fix for overtime effect removal not working when players end their turn (rather than GM advancing combat tracker).
* Added Chill Touch to the sample items compendium, supports no healing and disadvantage by undead against caster. Has no macros, all done with flags evaluation. Creates two effects since there are two different expiry duration for the effects.
* Added targetId and targetUuid to the fields available for activation conditions, saves nasty workflow... expressions. See Chill Touch.
* multilevel-tokens 1.6.0 now supports targeting of MLT cloned tokens for targeting/damage/effects so I've removed the restriction on targeting/attack MLT cloned tokens. There are some issues when applying complex active effects (hiding token, tokenMagic effects etc) and scrolling text on tokens to unlinked tokens which I've not investigated too deeply, targeting/damage application/vanilla effects seem to work.

* **Breaking** DnD 2.0.3 introduces damage bypasses for magical/silver/adamant weapons.
  - Midi supports the new dnd5e bypasses when calculating damage applied.
  - Any of the existing midi extended list of immunity/resistance/vulnerability already setup on an actor will continue to work.
  - From 10.0.12 any of the midi extended immunity/resistance/vulnerability settings must be entered as custom values and the name must match exactly when editing di/dr/dv by hand in the custom field ["Spell Damage", "Non-Magical Damage", "Magical Damage", "Healing", "Healing (Temporary)"]
  - There is no longer any need (and it is strongly discouraged) to use midi's physical/non-magical/non-silvered/non-adamantine damage resistance types since they can be represented in core dnd5e.
  - DAE has been updated to support the changed dr/di/dv scheme, including dr/di/dv.bypasses. dr/di/dv.value will only support damage types, not the extended damage resistance types, dr/di/dv.custom now provides a drop down for choosing the custom field.

  - When you edit the trait (di/dr/dv) on an actor midi will migrate existing traits to the new scheme automatically.
    - non-silver/non-magical/non-adamantine/physical will map to the new dnd5e scheme.
    - others will be mapped to custom damage resistances.
  - TL;DR
    - you don't need to do anything, all damage resistance/immunity/vulnerability should continue to work.
    - If you want to edit those you will need to populate the Custom damage fields.
    - Existing traits.di/dr/dv will be migrated on first edit of the actor.

### 10.0.11
* restore active layer and ui control/target when using late targeting.
* Fix for incorrectly processing DR.physical when a magical weapon is used.
* FIx for MidiQOL.createEffects creating transfer effects by default. If you want to create transfer effects set transfer: true in the effect data.
* Change the point at which preDamageApplication onUse macro is called - now called after damageList is created so you can examine per token damage details. Sample item Mace of disruption uses this to destroy targets that have 25 of less HP after the damage is applied, by upgrading the damage done.
* Added CONFIG and CONST to the fields available to activation conditions - so you can now check item.attunement !== CONFIG.DND5E.attunementTypes.REQUIRED instead of the more opaque (but much shorter) 1.
* Fix for ranged targeting.
* Fix for intermittent failure of template targeting.
* Fix for error thrown when making saving throws with debug enabled.
* Sample items compendium pack updated for foundry v10. (Items are marked at 10.0.10). Make sure to check the description for items that need to be renamed on equip.

### 10.0.10
* Remove debug accidentally left in.
* Fix for typo in versatile processing.
* Fix for DamageOnlyWorkflow and applyTokenDamage ignoring midi-settings for damage application
* ~~Almost all sample items updated for v10 - test will be tonight in my game~~

### 10.0.9
* Support multiple damage types in item damage lines/versatile damage.
* Fix for incorrectly processing negative damage items (like -1d4);
* Fix for incapacitated check in flanking checks.
* Fix for overtime effects failing to roll saves.

### 10.0.8
* Fix for template targeting small tokens (width < 1).
* Fix for drag and drop targeting.
* Include merge to support Wild Jammer vehicles module.
* Fix for optional bonus rolls that should be rolled by the GM being prompted on player clients
* Clarification: When using activation conditions (either from an item or a midi-qol.flags setting), you can use the ``@details.alignment`` form, in which case the expression must be enclosed in ``""`` marks if it is a string or you can just use the expresssion ``details.alignment``. Here is an example:
``details.alignment==="Lawful Neutral"``
vs
``"@details.alignment"==="Lawful Neutral"``
or
``["fiend", "undead"].includes(raceOrType)``
vs
``["fiend", "undead"].includes("@raceOrType")``
* Clarification: as of foundry 10.284/dnd5e 2.0.2 better rolls and midi-qol are not compatible (that may change with a subsequent release of better rolls but I'm not sure). If Better rolls is installed midi-qol will throw a notification error.
* Added better rolls warning and midi automation disable if better rolls active.
* Support for 3rd party concentration application/removal.
  - "Concentration Automation" enabled will apply concentration on use of an item with the item property concentration.
  - "Remove concentration on failed save" will perform the standard dnd5e concentration roll when damage is taken.
  - if remove concentration on failed save is not checked the save will be rolled and reported but concentration will not be removed.
  - If MidiQOL.configSettings().noConcnetrationDamageCheck is true midi will NOT do a concentration saving throw. (There is no UI for this flags, it has to be set programatically).
  - Midi now exports the additional function:
    - MidiQOL.addConcentration(actor, {item: Item, targets: Set<Token>,templateUuid: string});
  - To remove concentration you need to do which can be triggered however you want
  ```js
   const concentrationEffect = MidiQOL.getConcentrationEffect(actor);
  if (concentrationEffect) await concentrationEffect.delete();
  ```

### 10.0.7
* Fix for broken module.json wanting to install other systems.

### 10.0.6
**Important** When submitting a bug report ALWAYS include your exported (from the misc tab) midi-qol settings. I really can't work out what is going on without them.
* Fix for not including mod in skill.ability check/ability save rolls.
* Fix for Healing button showing as damage.
* Fix for export settings which broke.

### 10.0.5
* Foundry 10.279/10.280 broke most of midi's roll handling and targeting. This release adjusts to the changes (I hope), but has required a rewwite of the basic item handling code, so there could be bugs.
* Midi now **REQUIRES** foudnry 10.279+ and dnd 2.0.1 or later.
* **BREAKING** dnd 2.0.0-alpha3 has changed the name/arguments for ``item.roll(options: any)`` to ``item.use(config: any, options: any)``, which breaks the current item.roll() wrapping behaviour. As of 10.0.5 midi will do the same. 
* All of the elements passed in item.roll(options) will be mapped across as item.use({}, options) by dnd5e 2.0.1 and generate a deprecation warning.
* completeItemRoll(item, options) is replaced by completItemUse(item, config, options). completeItemRoll(item, options) will call completeItemUse(item, {}, options) and generate a deprecation warning.
* Tiny change to support DAE change now using suppression instead of disabling effects when not equipped/attuned - in line with core now.
* Fix for not auto rolling damage ignoring critical damage settings.
* Fix for not removing CV stealthed condition.
* Fix for template targeting, broken in 10.279+.
* Fix for lateTargeting, broken in 10.279+.
* Fix for item uses, broken in 10.279+ since item.use does not return until the template is placed.
* Fix (?) for displaying empty damage types when 0 damage is rolled.
* Auto removing spell templates is now a configuration option.
* Update to self apply effects, you can now choose always apply to self or apply to self if any target would receive an effect.
* **Breaking** Remove Hidden/Invisible setting now ONLY removes the hidden/stealth condition from the character. To remove invisibility use special durations to auto remove the effect. Updated the sample invisibility/greater invisibility to work with foundry vision modes.
* Reinstated canSee (renamed canSense) to utilise foundry vision modes. If the attacker can't be sensed by the defender the attack is with advantage, if the attacker can't sense the defender the attack is with disadvantage. 

If using Convenient Effects to create invisible tokens you need to execute
```js
  if (game.modules.get("dfreds-convenient-effects")?.active) {
    CONFIG.specialStatusEffects.INVISIBLE =  "Convenient Effect: Invisible";
    CONFIG.specialStatusEffects.BLIND =  "Convenient Effect: Blinded"
  }
```
to make those the foundry conditions for invisible/blinded. This works for both midi and core foundry handling of vision/blinded.
* Added experimental support for rolling attack/damage per target, rather than a single attack/damage roll for all targets. Configured from the workflow tab.
* Note: players control hidden tokens seems to continue to work with the new foundry vision modes. There is no reason to hide a token to make it invisible anymore, just use the foundry invisible condition.

### 10.0.4
* Fix for apply active effects button being left on card.
* Fix for respecting CUB hide names settings.
* Fix for unclickable drop down lists in sound config.
* When reaction checking, show the attack roll to the GM while reaction checking is taking place. For non GMs they will see "attack rolled" on the chat card, so they know something happened, rather than just the attack button being displayed.
* Rewrote midi's critical damage handling to match the damage types for critical rolls.
  - if maximising critial damage dice and you roll 1d4 Bludgeoning and 1d8 piercing, the damage roll will be displayed as 1d4 + 1d8 + 4 + 8 and the damage types of the maximised values will be bludgeoning and piecrcing respectively or as 1d4 + 1d8 + 1d4min4 + 1d8min8.
  - If maxing critical dice you can either have just a flat number for the critical dice (takes less space) or roll the critical dice with the dice roll being upgraded to maximum.
  - if you use the default dnd 5e critical damage rolling the type of the critical damage will default to the base damage for the weapon (which is not correct).
  - Midi now respects the dnd5e setting to apply the multiplier to the fixed numeric terms of the damage roll.
  - With these changes I now suggest using midi's critical damage options, rather than leaving it to dnd5e.
* Midi now displays the damage types for all dice rolls (via roll flavour) and uses the localised damage name, rather than the internal damage type.
* You can use ``1d4[fire]`` or ``1d4[Fire]`` when specifying a damage flavour, the first is the dnd5e internal label for the damage type, the second is whatever the localised version of the string is.
* Damage types are passed to DSN for all damage roll elements.
* Added support for using df Walled Templates to do target selection for AoE spells. (Not sure if the module is v10 ready yet).
* Templates created when casting AoE spells with a duration are now auto removed on spell expiry.
  - Templates drawn for instantaneous spells are removed after 1 turn or 1 second of game time.
  - If you have an effect "<Item Name> Template" on the item midi will use that as a base to create the remove template effect, so you can put special durations etc in the effect.
* **New feature for overTime effects**. You can add actionSave=true which means overtime effects won't auto roll the save, rather it waits for the actor to roll an appropriate save when it is the actor's turn (just roll the save from the character sheet - or anything that creates a chat message saving throw - LMRTFY but not monk's token bar) and if the save is higher than the overtime effects saveDC the effect will be immediately removed. 
  - This allows you to support "the character can use its action to save against the effect".
  - Simply add actionSave=true to the overtime effect definition and mid will watch for saving throws on the actors turn and if the type matches the overtime efffect it will check the roll versus the saveDC and remove the effect if the save is successful.
* **Big change** flags.midi-qol.advantage/disadvantage etc will row evaluate the "value" as if it is an activation condition expression, so ``flags.midi-qol.advantage.attack.all CUSTOM "@raceOrType".includes("dragon")`` will mean attacks against dragons will be made with advantage. The spreadsheet of flags has been updated to include all valid flags (I hope) and now specifies the type of the field. Any field marked as Activation Condition will also accept simple boolean fields.
  - There are bound to be some edge cases I've not thought about so regard this as a work in progress. The flag condition evaluation is backwards compatible with the existing true/false/0/1 behaviour.
  - Known issues: when rolling a saving throw the workflow, item and source actor are not available, so condition evaluation is limited to fields that exist on the actor doing the saving throw.

### 10.0.3
Bug Fixes
* Fix for aborting saving throw when not auto checking saves causing the saving throw button to remain disabled.
* Fixed a bug in self targeted items.
* Fix for double concentration when no CUB/CE and not auto applying effects.
* Fix for Challenge mode armor failing to roll damage.
* Fix for late targeting dialog not displaying token image.
* Fix for custom midi damage sounds not playing if dice so nice enabled.
* Fix for optional effects not calling a macro when specified.
* Updated some of the items to work with v10. More to come.

* Roll flavors that are not dnd5e damage types now are treated as the default damage type for the item.
* Confirming damage flavours can be upper or lower case.
* **BREAKING** When rolling damage the diceflavor will be set to the damage for each dice roll which means DSN daamge rolls will be correctly colored and the damage type of each damage roll will be displayed in the chat card.

* Added support for spell sniper, flags.dnd5e.spellSniper.

* Change to roll other damage. Other damage is only rolled if required (more or less). Specifically if there is an activation condtion, "Other" damage will only be rolled if the activation condition evaluates to true on at least one of hit targets.
* **BREAKING** Change to roll other damage. Versatile will only be rolled instead of the "Other" formula if the item is a weapon and the versatile property is not selected.

* Optional effects now support count && countAlt for tracking available usage. Both must have available uses for the optional bonus to be triggered. Leaving countAlt undefined means it won't be checked.

* Invisible/Hidden advantage checking now also uses core foundry's vision modes. Note that this is now RAW which state that if a target is invisible they get advantage EVEN if the target can see them. Which I think is dumb.
* If you can't see your target (invisible/hidden) you attack at disadvantage if invisibility advantage is being checked.

* Include token size in distance calculations. 
  - Assumes a token can attack at any elevation from the token's elevation to the token's elevation plus size and that a target can be attacked at any elevation from the target's elevation to the target's elevation plus size. So a 2 * 2 token at elevation 0 can attack at 0 or 10 feet.
* Include token size in LOS checks with levels module's LOS checking.
* Fix for nsa message handling.

* **BREAKING** If you are recording Attacks of Opportunity and an actor makes an attack of opportunity, range checking for that attack is disabled, including long range disadvantage. The logic is that at some point during the turn they must have been in range to trigger the AoO so the attack can happen, even if when the roll is done the target is out of range. This means the GM does not have to move the token back to do the attack of opportunity.

### 10.0.2
* When combat ends reactions/bonus indicators are removed from all combatants.
* Created a gap between damage buttons so that the underlying card can be clicked to expose the roll details.
* Fixed an error in overtime effects processing, where removeCondition would be ignored if there is no saving trhow.
* Add notification if you try to edit the midi-qol config if roll automation is disabled.
* Fixed an error in checking incapacitated actors.
* Fixed an error condition if the macroName is enclosed in quotes, which is should not be.

### 10.0.1
* v10 branch pre-release
* This is definitely NOT ready for gameplay
  - integration with most other modules has not been deeply tested tested. And except for itemMacro I am using the current release - not a v10 branch if there is one.
    - Combat Utility Belt - not tested
    - Convenient Effects - tested with the v9 release - seems to work,
    - DAE - tested with v10 release - seems to work
    - Dice So Nice - tested with v9 release - seems to work.  (with MANY compatibility warnings) and you can't edit the dsn settings.
    - dnd5e helpers - not tested
    - Item Macro - does not work for editing macros. Using item macros in rolls works. Itemmacro v10 branch more or less works. A change for edting macros is required.
    - levels/levels volumetric templates - tested with pre-release of levels v10 - does not work
    - libWrapper - tested with v9 release - seems to work (with compatibility warnings)
    - lmrtfy - tested with v9 release - seems to work
    - magic items - not tested.
    - monks token bar - tested with v9 release - seems to work.
    - monaco macro editor - tested with current release - seems to work
    - socketlib - tested with v9 release - seems to work (with compatibility warnings)
    - times-up - tested with v10 relase - seems to work.
    - Token Action Hud - tested with v9 release - seems to work
    - Token Magic - not tested.
    - df-templates - not tested
    - wall-heights - not tested.


* Known Issues
  * Distance checking triggers an error in foundry core - waiting on core fix.
  * Port of sample items compendium not complete - will require more work.

* Changes
  - rewrote asyncHooksCall, asyncHooksCallAll for v10 changes - usage remains the same.

### 0.9.65
* updated Arcane Ward that does not use temphp to manage the ward - requires DAE 0.10.24. The modification to damage is applied AFTER the damage card is created, so will not include the ward damage reduction.
* Fix for concentration removal not expiring convenient effects.
* Be reminded of **Fixed an error where removing concentration would remove transfer (passive) effects from the actor**. If effects are not being removed when removing concentration make sure they are not transfer effects.
* Fix for late targeting requiring target details being set for weapons.
* Fix for combat utility belt concentration condition. If CE is not enabled midi will use CUB's concentration condition. **Requires** Enhanced conditions to be enabled.
* Midi supports the new DAE (0.10.24) selfTarget. If set on an effect, when the item is rolled the effect will be applied the user of the item, rather than the target. The effect will only be applied if effects would otherwise be applied to the target, i.e. the attack hit, at least one target failed to save and so on.
  - The activationCondition will be considered true (for selfTarget effects) if it evaluated true for any of the targets, the require activation condition setting for active effects applies to selfTargetEffects.
  - This means an item can have a mix of effects, some applied to the targets and some to the actor using the item, by having more than one effect on the item you can mix and match self target versus ordinary effects.
  - Convenient effects can be marked self target if you wish and will behave as you might expect.
  -  If the item only has effects that targets user of the item, you can continue setting target self in the item details, no need to change.

### 0.9.64
* Added special duration for rolling Initiative to remove an effect.
* Fixed a bug in export stats for item/actor names that contain a ",".
* corrected pt-br.json which was causing an error in DAE editing items in pt-br.
* corrected check for lateTargeting to include all items that have a target that do not have AoE targeting.
* Reaction now respects the optional "check incapacitated" setting, rather than blanked stopping reactions when hp <= 0.
* added async function doContentrationCheck(actor: Actor5e, saveDC: number), which will roll a full concnetration check, removing concentration if failed, use via
```js
await MidiQOL.doConcentrationCheck(actor, 15);
```
* First part of support for 0 cost reaction items. If the activation cost of an item is 0 reaction/reaction damaged the reaction will be available to use even if the target has used it's reaction for the turn and using the item will not flag the actor as having used a reaction. 
* added workflow.setAttackRoll, workflow.setDamageRoll, workflow.setBonusDamageRoll, setOtherDamageRollworkflow which will set the appropriate roll, the total for the roll and correctly create the HTML for the roll. Mainly for macro writers who want to change the rolls in onUseMacros/Hooks.call.

### 0.9.63
* Added flags.midi-qol.optional.NAME.attack.fail which will trigger if the attack failed - intended for stroke of luck or similar.
* Fix for indomitable feat so that prompt to use indomitable is displayed on player's client rather than attacker's client.
* Fix for evasion (superSavers) not working with certain midi-qol settings.
* Respect Dice So Nice setting to not roll 3d dice for NPCs.
* Update sample item Deflect Missile.
  - The item has been configured to consume Ki points as defined by the dnd5e (1.6) monk class advancement. (you will need to edit the item when first applied to the actor setup the ki consumption).
  - Support firing the missile back if caught. Firing back will consume a Ki point.
  - If the attacking item has ammunition specified, the ammunition will be used for the return attack, if not the base item will be used. So if you are using ammunition make sure that the ammunition specifies the damage for the ranged weapon attack.
* Added Arcane Ward to sample items. This uses tempHp to implement the ward. Ward expires on long rest and will be recharged by casting abjuration spells.
* Added Warding Bond, requires DAE 0.10.21. See DAE readme/changelog for more details. This item requires the GM damage card to be displayed to work (auto apply damage will auto apply warding bond damage).
* Re-implemented Hunter's Mark to showcase new DAE 0.10.21 feature - you do not need to use the new one. You must rename to Hunter's Mark when equipped to a character.
* Added Simple Warding Bond (example item only) to share damage dealt between two actors (requires DAE 0.10.21).
* When not fast forwarding attack rolls adjust the attack roll advantage/disadvantage flavor to match that selected on the roll dialog.
* New setting for player damage cards to only show the player damage card if the rolled damage is different to the applied damage.
* Updated setting for marking actors defeated, you can specify overlay (big icon) or icon (like other status effects)
* **BREAKING** isDamaged special duration will now only expire if the target actually takes damage from the attack. immunity/damage reduction that reduces the damage to 0 will cause the effect to stay.
* **BREAKING** Midi property rollOtherDam will now check that the item is set to attunement not required/attuned before applying other damage.
* **BREAKING** Fixed an error where removing concentration would remove transfer (passive) effects from the actor.
* Updated ja.json. Thanks @Brother Sharp


### 0.9.62
* Added an extra macro pass for item macros. damageBonus - this is called when midi is evaluating damage bonus macros (the actor wide bonus damage macros) so that you can have complex bonus damage behaviour for an item as well as for the actor.
  - The macro should return an object like ```{damageRoll: "2d6[acid]+1d8[fire], flavor: "my special damage}```
  - For example special critical damage for the item that can't be handled with either the dnd5e or mid-qol critical damage rules. 
  - Another way to handle doing extra damage under certain conditions instead of using the roll other damage feature.
* Reinstated ability to display hit/miss and if the attack is critical as well as hit/miss not showing critical attack
* Lots of spelling corrections in lots of documents - thanks various contributors.

### 0.9.61
* Fix for sw5e chat cards.
* Fix for exploding dice criticals when using ammo.
* Added optional rule setting to expire attack/hit/action special duration effects as soon as the roll is done, instead of waiting for the damage roll before removing. Be careful with this since it may break macros that depend on the timing of effect removal.
* Added damage settings to configure how much vulnerability increases damage or resistance reduces damage - set on the workflow tab. Defaults to dnd5e 2 time and 1/2 damage.
* Added flags.midi-qol.optional.NAME.save.fail/check.fail/skill.fail which will trigger when a midi initiated (i.e. in response to a weapon/spell use) save/check/skill roll is failed.  Useful for features that allow you to reroll failed saving throws, e.g. indomitable feat. Can be used with all of the other optional.NAME flags to handle resource consumption etc.
  - If you trigger a saving throw through LMRTY/Monks Token bar directly, rather than rolling an item, the optional.NAME.save.fail will not fire.
* Added additional option for optional.NAME.count ItemUses.ItemName, which will use the value of the `uses` field for the item name ItemName (which must be on the actor), it means you don't need to use a resources entry for these any longer.
* Added sample class feature Indomitable, which is setup to allow rerolling a save when failed (if the save is initiated by midi-qol) and will consume the Indomitable item's uses.
* Added new optional setting to ignore preparedness/spell slots when choosing reaction spells. Useful if using some other system for casting spells. Usually this should be off.

### 0.9.60
* Put back ability to run chat macros as onUse macros.
* Added item uuid to onUse macros args[0].item/itemData
* applyTokenDamage will now work with the onuse macros args[0].item/itemData

### 0.9.59
* Fix for inadvertently requiring convenient effects to be installed.
* Fix for flags.midi-qol.optional.NAME.macroToCall throwing an error when applied to saving throws/checks, only world macros and ItemMacro."Item Name" are supported, ItemMacro will have no effect.
* Added flags.midi-qol.grants.critical.range, set the vale of the effect to be the maximum range an attacker can be from the target to get an auto critical attack. Useful for the paralysed condition.
* Fix for throwing an error in certain activation condition evaluations.

### 0.9.58
* Some changes to hidden invisibility giving advantage
  - Hidden/Invisibility advantage check will use Conditional Invisibility if installed to determine if a target is visible.
  - Hidden/Invisibility check will always check if the attacker is visible according to foundry vision rules.
  - If conditional visibility is not installed a hidden/invisible token (CUB/CE conditions) will have advantage.
* If you are not displaying the roll details or only showing hit/miss for the attack roll then the hits display will only show hit or miss (not critically hits). Also critical hits/fumbles will not be highlighted, you'll just see hit/miss.
* Support for overriding the fumble threshold for attack rolls per item. If not blank midi will use the value in "Fumble Threshold" as the fumble value for the roll. A threshold less than or equal to 0 means the attack roll can never fumble.
* Fix for raceOrType being incorrectly set for characters
* Fix for spiritual weapon in sample items compendium to remove the extra proficiency bonus applied to attack rolls.
* Added some more hooks during workflow processing
  * Hooks.callAll("midi-qol.preCheckSaves", workflow) - called before auto checking saving throws
  * Hooks.callAll(`midi-qol.preCheckSaves.${item.uuid}`, workflow) - called before auto checking saving throws
  * Hooks.callAll("midi-qol.postCheckSaves", workflow) - called after auto checking saving throws but before displaying who saved. Allows modification of who did/did not save.
  * Hooks.callAll(`midi-qol.postCheckSaves.${item.uuid}`, workflow) - called after auto checking saving throws but before displaying who saved. Allows modification of who did/did not save.
  * Added DummyWorkflow, which is an initialised workflow that does no actions. Will be useful for macro writers who want to check conditions/advantage and so on.
    - Support simulateRoll(target: Token). Will update the workflow with an attack roll, set advantage/disadvantage (and advantageAttribution) and set workflow.expectedAttackRoll to the expected value of the attack roll.


### 0.9.57
* Added a preview for midi-qol quick settings which allows you to accept or reject the proposed changes.
  - Cleaned up full auto/manual changes to reflect current settings.
* Fix for damage resistance/immunity all blocking healing from weapons. (Niche case I know).
* **Breaking** Removed support for targeting Multi Level Tokens ghost tokens - too many errors - they will now be ignored.
* Fix for not respecting levels module template height manual setting.
* Fix for auto applying a convenient effect, type non-stacking would apply multiple copies of the effect.
* Fix for sometimes trying to access _levels before initialisation.
* If an attacker is not visible to a target (i.e. not illuminated or visible via the target's sight configuration), the attacker will have advantage on attacks if the optional rule "hidden/invisible" attackers have advantage is enabled. Tokens with "Token Vision" disabled won't check visibility.
* Fix for concentration not being removed when using better rolls.
* Optional setting for temphp damage to count towards requiring a concentration save. It appears that RAW/RAI states that temphp damage DOES count towards breaking concentration.
* Added don't apply CE effects to item card when global apply CE effects is "item Effects if absent CE effects", to ensure that CE effect is not applied, apply CE effects checkbox still means CE takes precedence over item active effect.
* Update fr.json


### 0.9.56
* **Breaking** Changes to activation conditions and application of other damage and applying active effects. Rather than checking the first target for application of other damage/effects each target is processed separately.
  - Other damage (if enabled) is ALWAYS rolled, but only applied to targets that match the activation condition.
  -  So a dragon slayer (assuming multiple targets) will always roll the "other" damage, but only apply it to targets that are 'dragons'. Similarly Mace of Disruption will only apply the Frightened condition to undead/fiend targets.
* Possibly **breaking**. Midi-qol no longer depends on advanced macros (or core macros) for item macro execution.
* Fix for dr/di/dv.traits.all resisting healing damage.
* Fix for extra item card being shown in various cases when using attack/damage buttons in the chat log.
* Added replace <roll expression> to optional bonus settings. This will replace the existing roll with <roll expression> which is just a normal roll expression, e.g.
   ```
   flags.midi-qol.optional.NAME.attack.all OVERRIDE replace 11 + @mod + @prof
   ```
  will replace the existing roll with 11 + @mod + @prof, which is the average for a 1d20 roll.
* Added flags.midi-qol.optional.Name.macroToCall OVERRIDE <macroname> | ItemMacro | ItemMacro.<itemName>, which will be called when an optional bonus roll is clicked. ItemMacro will refer to the item that created the bonus roll. Arguments are the same as for any onUse macro.
* Fix? for undefined roll.options throwing an error.
* Fix for possible failed initialisation when levels installed.
* Fix for edge case of using levels volumetric templates, token magic template effects and the template NOT selecting any targets, incorrectly selecting many targets.
* Fixed pt-BR.json.

### 0.9.55
* Fix for inadvertent breaking of overTime effects.

###  0.9.54
* Fix for localisation problems with armour/weapon proficiencies.
* Fix for ammo usage for items that don't roll an attack.
* Fix for damage configuration dialog to pass all arguments to wrapped function.
* Preferred mode for setting flags.midi-qol.xxxx (if the flag is meant to be a boolean field) is now CUSTOM, which will correctly set values to the correct type. Setting a midi-flag to 0/1/true/false via other modes will always result in the flag being treated as true. For non-boolean fields you can leave the mode as override.
* Enhancement to optional rolls count. "turn" remains unchanged - meaning once per round which is confusing. Added two new options "each-turn", which means the roll can be made each combat tracker turn, and "each-round", which means the bonus can be rolled once per round (the same as the current "turn").
* If DSN enabled, using Monks token bar for saves, auto checking concentration enabled and the check was forced by an item with a saving throw, the concentration check would always fail - fixed.
* For macro writers, added MidiQOL.action queue, a foundry semaphore based single thread for actions to be done, useful if you are queuing actor/token updates and want to ensure they are executed strictly in order.


### 0.9.53
* DAE 0.10.13 adds support for condition immunity matching the effect label to the condition immunity and disabling the effect.
* Added magicVulnerability (the reverse of magicResistance) saves against magic are made at disadvantage.
* Fixed typo in magicResistance auto complete data (magiResistance -> magicResistance).
* max/min rolls will now display the roll flavor (type of roll).
* Fix to initiative advantage flags not working in dnd5e 1.6
* Updated ja.json thanks @Brother Sharp
* Display full roll in optional bonus dialog (tooltip expansion now works).
* Will remove support for ChangeLog module - if you want to see the changelog on updates use Module Management+.

### 0.9.52
* Added workflowOption.critical that can be passed to item.roll() or MidiQOL.completeItemRoll(item, optons) to force the damage roll for the item to be a critical roll. The complete critical damage process is applied to the roll.
* Updated the Sneak Attack Item to work in dnd5e 1.6
* Fix for not showing Advantage Reminders' Damage  reminder messages - thanks @kaelad.
* Fix for some midi sample items being out of date. Especially Sneak Attack/Rakish Audacity.
* Fix for uncanny dodge to require the attacking item to have an attack.
* fix for MidiQOL.applyTokenDamage failing with .has undefined error.

**Breaking Change** to flags.midi-qol.min/flags.midi-qol.max. The value field is now **numeric** and the sense of max/min has **swapped** so that the displayed dice roll modifier matches the field name. The feature now allows you to implement various minimum/maximum results for skill/save/check rolls.
  flags.midi-qol.max and flags.midi-qol.min
  flags.midi-qol.min/max.ability.all OVERRIDE value
  flags.midi-qol.min/max.ability.save.all/dex/str/etc. OVERRIDE value
  flags.midi-qol.min/max.ability.check.all/dex/str/etc. OVERRIDE value
  flags.midi-qol.min/max.skill.all/acr/per/prc/etc. OVERRIDE value

  The flags support modifying saving throws, ability checks and skill rolls. min means that each the d20 roll will be at LEAST value, max mean that the d20 will be at MOST value. The value field must be numeric, you can force lookups by using   ``[[@abilities.dex.value]]`` for example.

  As before flags.midi-qol.ability.check does **NOT** affect skill rolls, you need to specify both changes in an effect.

  To replicate the previous behaviour (almost) of max and min flags use
    flags.midi-qol.max... -> flags.midi-qol.min... OVERRIDE 20
    flags.midi-qol.min... -> flags.midi-qol.max... OVERRIDE 1

### 0.9.51
* Fix for actor onUseMacro editor failing to open on some characters.
* Added bardic inspiration for dnd5e 1.6 using the new scale fields. (much simpler). You must migrate your actor to the new dnd 1.6 advancement for this to work.
* Update of bardic inspiration to activate for skill rolls as well (oversight on my part).
* No damage on save spells will not trigger a reaction damaged if the target saves.
* When using an item with ammunition, if the ammunition has a saving throw that will be used to determining the saving throw for the effect, as will active effects. So an exploding arrow with a save and damage can be used in a mundane bow with no save and should behave as expected.

### 0.9.50
* Fix for Items compendium opening with no icons.
* Split the auto consume config, to allow auto consume spell slots/resources/both/none.
* Hovering on targets in midi cards now auto selects them, rather than requiring clicking. Thanks @theripper93 

### 0.9.49
* added midi-qol advantage/disadvantage attribution for attack rolls to the ADV-Reminders module display (attack rolls only).
* Guard the DAE setup calls to wait for DAE setup to be complete - seems to cause a problem in at least one game.
* Fix for overTime effects not applying damage.
* Fix for levels not installed.

### 0.9.48
* Added MidiQOL.doOverTimeEffect(actor: Actor5e, effect: ActiveEffect, turnStart: boolean), which will perform the overtime processing for the passed effect, turnStart === true, do turn=start changes, false do turn=end changes. The effect does not need to be present on the actor to work, but can be.
* Fix for rolling tool checks not supporting alt/ctrl/T.
* Fix for concentration advantage bug - thanks @kampffrosch94.
* Added support for different sounds to be played for characters/npcs in midi custom sounds.
* Added support for weapon subtypes in midi custom sounds. Set the weapon "base type" on the item sheet to whatever you want and you can specify weapon sub types in the sound config to be any of the valid base types. 
* Existing sound config should be automatically migrated and midi makes a backup of your existing settings. You can restore the old settings via (after rollback of the midi version)
```js 
game.settings.set("midi-qol", "MidiSoundSettings", game.settings.get("midi-qol", "MidiSoundSettings-backup"));
```
* Added flags.midi-qol.optional.NAME.criticalDamage which allows optional bonus damage to do critical damage.
* Fix for editing actor onUseMacros duplicating active effect created onUsemacros.

### 0.9.47
* Fix for token hud rolling bug introduced in 0.9.46

### 0.9.46
* Restore the order or arguments for actor.data.flags.midi-qol.onUseMacro to be macro name, macro pass - thanks @Elwin
* Fix for typo in template targeting walls block test.
* Fix for CE active and non player tokens -> 0 hp, not marking dead in combat tracker.
* Fix for player damage card not obscuring actor name if CUB hid name settings enabled.
* Change to ``item.roll(options: {workflowOptions: {lateTargeting: true/false}})`` behaviour. The lateTargeting setting (if passed) will override the midi-qol module settings, so you can force enable/disable late targeting for a particular item roll.

### 0.9.45
* Added exploding dice option for critical hit dice.
* Fix for levels module not initialising if no canvas is defined throwing an error.
* Fix for rpg damage numbers and unlinked tokens.
* Fix for applying concentration even if spell aborted via preItemRoll on use macro call.
* Added notification if item use blocked by preItem roll macro.
* Adding actor onUseMacro editing as a separate configuration options.
* Clean up for levelsvolumetrictemplates. If the modules is enabled, midi defers to it for targeting calculations and ignores the midi walls block settings (levelsvolumetrictemplates has it's own setting for walls block).

### 0.9.44
* Fix for levels (the module) and template placement heights.
* Add advantage attribution as part of the dice tooltip. Works with formula as tooltip or not. This is very experimental.
* Check Vehicle motionless and flat ac when in motion to determining hits. Added flags.midi-qol.inMotion to mark a vehicle in motion.
* Fix for sw5e starship sdi,sdr,sdv handling.
* Fix for actor onUse macros with spaces in name/specification
* Added sample feature Blessed Healer, that uses an actor onUse macro to do the bonus healing. Does not require modifying any spells to have the effect applied.

### 0.9.43
* Added Toll the Dead spell to the midi sample items. It does a few tricks to modify the damage roll of the spell according to the HP of the target being less than max.
* Fix for direct calling of applyTokenDamageMany throwing an error looking for workflow.actor.name.
* Fix for auto rolling attacks when they shouldn't be.
* Fix for accidental translation of spell component flags when language is not english.
* FIx for concentration advantage and disadvantage not cancelling out.
* Clarification: enabling concentration checks forces allow onUse macros to be true, since it is required for concentration automation.
* Rough cut of attack roll advantage/disadvantage attribution, displayed as console warning. Not really usable yet.

### 0.9.42
* Sigh - another fix for DamageOnlyWorkflows.
* Player Damage cards now are displayed as created by the actor that did the damage roll rather than as GM.
* Player Damage card - only display the hp updated/hp not updated header if there are player damage buttons on the card. 
* Added flags.midi-qol.semiSuperSaver for items that cause 0/full damage on save/failed save.

### 0.9.41
* Support for Conditional Visibility hidden/invisible conditions for advantage/disadvantage.
* Support for application of CV effects is via Convenient Effects, so you need convenient effects/DAE to be able to implement the invisibility spell. Midi-qol sample items updated to support CV and CV convenient effects. It is suggested that you toggle the CV effects to be "status effects".
* Some tweaks to spiritual weapon to make it a little more friendly to use. You no longer need to define a "Slash" attack on the spiritual weapon actor, all of the damage rolls etc. will be configured when the item is summoned.
* Added Lay on Hands with resource consumption, dialog for how many points to use etc.
* Added flags.mid-qol.magicResistance.all/dex/str/etc.
* For macro writers: Added support for workflow.workflowOptions.lateTargeting, autoConsumeResource etc. to set per workflow whether to allow late targeting, prompt for resource consumption. These are useful in preItemRoll macros to configure the workflow to behave a certain way. See lay on hands sample item which skips dialog to consume resources.
* Fix for overtime effects that call a macro when a non-gm advances the combat tracker.
* **Breaking** All reaction used tracking/prompting, bonus action tracking/prompting bonus actions, attacks of opportunity tracking are now only performed if the actor is in combat.
* Added actor based onUse macros. Behaves exactly the same as item onUse macros. You can specify a global macro, identified by name, ItemMacro which refers to the workflow item (not useful), or ItemMacro.item name, (probably the most useful) which allows you to add specific item macro calls for any item roll.
* Can be configured from the Actor sheet or via ...
* Added flags.midi-qol.onUseMacroName CUSTOM macroName,macroPass - which will cause the specified macro (world macro name, ItemMacro, or ItemMacro.macro name) to be called when midi-qol gets to the workflow point specified by macroPass.
* Fix for damageOnlyWorkflow and BetterRollsWorkflow throwing an error in getTraitMulti.

### 0.9.40
* **Breaking** Change to Requires Magical. New options, "off", "non-spell", "all".
  - Previously non-weapons would do magical damage and "requires magical" only applied to weapons.
  - New options are off (same as previous disabled), "non-spell" all items except spells will do non-magical damage unless the per item midi-qol flag (or weapon magic property) is set to true.
  - "all" All items will do non-magical damage unless they have the magical damage property set.
  - I expect that most people will want "requires magical" to be set to non-spell and make sure that non-spells that do magical damage will have the magical property set.
* Added dr/dv/di for "Magical Damage" and "Non-Magical Damage", where magical/non-magical is determined as above. 
* Fix some errors being thrown when applying effects due to midiProperties and not removing the apply effects buttons in some cases.

### 0.9.39
* Some more features for flanking checks. Checked when targeting a token (1 token selected - the attacker and one target targeted) or when attacking.
  - adv only flanking actor will gain advantage and no icon added to display flanking
  - CE Only, flanking actor will gain CE effect "Flanking" on the attacker and you can configure that however you want, adv to attack or whatever.
  - CE + advantage, grants advantage + whatever the CE "Flanking" effect has.
  - CE Flanked. The flanked target gets the CE "Flanked" condition, rather than the attacker getting flanking. Checking to see if a token is flanked is done whenever the token is targeted or an attack is rolled.
  - CE Flanked No Conga. Flanked tokens cannot contribute to flanking other tokens, meaning the flanking conga line can't form.
* Support for new item flag, Toggle Effect, each use of the item will toggle any associated active effects/convenient effects. One use to turn on, next use turns off. This can be a viable alternative to passive effects where you click to enable and click again to remove. Should also simply a range of effects currently done as macro.execute/macro.itemMacro where the on/off cases just enable/remove effects. For active effects (as opposed to convenient effects) toggling requires DAE 0.10.01.
* Added a player's version of the GM's damage card. Can be configured separately to GM card to show/not show damage done to NPCs, and show/not show damage done to players (with the option to provide apply damage buttons that the players can use themselves - instead of the DM applying damage). If players try to apply damage to a token they don't own an error (non fatal) will be thrown.
  - Showing the damage applied to NPCs will show the damage resistances of the target in the target tool-tip. But since players will see the modified damage done, it's not that much extra information.
* Added option to "apply item effects" apply the effects but do not display apply effects buttons. In case players have twitchy fingers and hit the apply effects button when they shouldn't.

### 0.9.38
* Bugfix for checkflanking error.

### 0.9.37 
* Bugfix for checkflanking error.

### 0.9.36
* Fixed bug when checking spell slots available for reaction spells with 0 pact slots available.
* Add flags.midi-qol.sharpShooter which removes long range disadvantage on ranged attacks.
* flags.midi-qol.grants.attack.bonus.all/mwak etc. now accept roll expressions not just numbers.
* Two new properties for items. 
  - magical damage - the item does magical damage for checking immunity/resistance.
  - magical effect - the item counts as magical for checking advantage on saving throws with magic resistance (previously was just for spells).
* Fix for chat card damage button to roll versatile damage not working.
* Cleanup of some edge cases when editing midi sound config starting with an empty sound config.
* Cleaned up non "default dnd5e" critical damage dice to work properly.
* Respect dnd5e settings for other damage criticals and dnd5e default damage.
* Fix for check flanking advantage and invalid tokens throwing an error.
* Fix for saving throw and ability check special expiry not working.

### 0.9.35
* Fix for errors when rolling with check flanking enabled and convenient effects not active.

### 0.9.34
* Some changes to flanking. 
  - Only applies to mwak/msak.
  - Flanking is only applied if you have a token selected on screen when making the attack. The attack will proceed but flanking will not be checked.
  - if convenient effects is enabled midi adds convenient effects flanking indicator. The indicator is updated when you target a single enemy (and have a token selected) or roll an attack. 
  - if you target an enemy and then move your token the flanking indicator might be wrong - it will be corrected when you roll or retarget - this is an efficiency consideration so that flanking is not computed too often.
  - Allies with the convenient effects effect "Incapacitated" are ignored for flanking as well as those with 0 hp.
  - Flanking does not work with hex grids.
* Fix for flanking check enabled and some edge cases throwing an error if no target selected.
* **Breaking** Midi critical damage settings now always include per item critical extra dice.
* Removed extra call to Hooks.call("preDamageRoll") in workflow.ts. Thanks @Elwin#1410
* Fix for max damage causing critical rolls to double the number of dice it should.
* When using a reaction from a magic item provided spell/feature the user is prompted with the use charges dialog.

### 0.9.33
* Fix for proliferating critical hits if optional rules disabled. Live and learn, turns out (false > -1) is true.

### 0.9.32
* (Hopefully) better fix for item rolls being blocked if custom sounds turned off. (bug introduced in 0.9.30)
* New optional rule, "Critical Roll Margin". You can specify a numeric margin such that if the attack roll >= target AC + margin the roll is a critical hit, otherwise not (even if the roll is a 20). Apparently this variant is in use in some countries. The rule is only applied if there is a single target, since midi can only track one critical status for the roll. Setting the margin to -1 (the default) disables the check. Works with better rolls, but the dice total will not be highlighted in green.

### 0.9.31
* Fix for item rolls being blocked if custom sounds turned off. (bug introduced in 0.9.30)

### 0.9.30
* Tweak to custom sounds so that if dice so nice is enabled attack/damage sounds are played before the roll rather than after. This should mean the same configuration will work with dice so nice or not.
* With the introduction of the per item flag (also roll other - which means roll other damage if the activation condition is met/empty), it is suggested that you use that route to enable/disable rolling of the other damage, especially for spells, rather than the global setting.
* Updated slayer's prey sample item so that it works for v9
* If you are not hiding roll details when an attack is made and the result is influenced by flags.grants effects the modified attack roll will be displayed on the hit card.
* Fix for "turn" optional effects that were not being marked as used and hence would be prompted each roll.
* Fix for asyncHooksCall missing awaiting the result. Thanks @Elwin#1410
* New special duration ZeroHP, the effect will expire if the actor goes to 0 hp. Requires DAE 0.9.11
* **Breaking** Slight change to reaction/bonus action checking. New option display which will cause the reaction/bonus action icon to be added when an item that is used. Don't Check now means don't display anything for reactions/bonus actions, whereas it used to mean display but don't check.
* If you use a weapon with ammunition and the ammunition has active effects they will be applied to the target in addition to those of the ranged weapon. Useful for special ammunition like arrows of wounding etc. Any activation condition on the ammunition will be checked before applying the effect.
* New misc tab setting, Alternate Rolls. At this stage only a boolean which if set moves the roll formula to the roll tooltip, to give a less cluttered look.
* First implementation of flanking (optional rule - in optional settings).  
  - If any line drawn between the centre of any square covered by the attacking token and the centre of any ally's covered squares passes through the top and bottom, or left ad right of the target the attacker will have advantage. 
  - In the case that both the attacker and ally are of size 1, this ends up meaning that a line between the centres of the two tokens passes through the top and bottom, or left and right, of the target, which is the common version of the rule statement.
  - An ally is any token that is of the opposite disposition of the target (friendly/neutral/enemy - my enemy's enemy is my ally) is not incapacitated (meaning hp === 0). 
  - The attacker must be within 5 feet of the target.
  - Seems to work with the corner cases.
  - There are probably special cases I've missed so errors are possible.

### 0.9.29
* Added roll other damage for per item setting to roll other damage. Works with activation conditions.
* Separated Bonus Action usage and Reaction usage checking, which can be configured separately.
* **VERY BREAKING** 
**Custom Sounds Complete rewrite as of v0.9.29**
Existing custom sounds will be disabled.
  * Custom sounds work best with the merge card.
  * Custom sounds now apply to both merge and non-merge cards. However non-merge cards will always roll the dice sound in addition to any midi custom sounds. I am unaware of any way to disable the dice sounds for standard dnd5e cards.
  * Custom sounds Will play with dice so nice active. It is suggested that you set the dice so nice sound volume to 0, so that midi can control the sounds made when a weapon is rolled.
  * ~~If using Dice so nice key the main sound effect on the item roll (specify the weapon subtype) and have no sound for the rwak/mwak, this way the sound will play while the dice are rolling.~~ If not using dice so nice key on rwak/mwak/rsak/msak and the sound will play while whole the card is displaying.
  * The General Format is to specify a sound for
    - Item Class (any/weapon/spell/etc)
    - Item Subtype (all, Martial Melee, Evocation etc)
    - Action, roll the item, attack, mwak, roll damage, damage of specific types
    - Playlist to get the sound from, you can use any playlist you have.
    - Name of the sound to use, drawn from the specified playlist 
    - You can now use as many playlists as you wish). 
    - Support for special sound names, "none" (no sound) and "random", pick a sound randomly from the playlist.
    
  * In the case that more than one setting might apply midi always chooses the more specific first. So:
      - Weapon/Martial Melee/mwak will be used in preference to 
      - Weapon/all/mwak, which will be used in preference to  
      - Any/all/mwak

  **Actions**
    * Item Roll is checked when the item is first rolled to chat.
    * attack/rwak/mwak/msak/rsak/hit/miss/critical/fumble etc. are checked after the attack roll is complete and hits have been checked
    * Damage/damage:type are checked after the damage roll is complete.

  * Custom sounds be configured from the Configure Midi Sounds panel immediately below the midi workflow panel on module config settings. Custom sounds are only active if the Enable Custom Sounds is checked on the misc tab of workflow settings.
  * You can create very complex setups, but don't need to.
  * To get your toes wet, enable custom sounds on the workflow panel - misc tab (where it has always been).
  * Open the configure midi custom sounds panel.
    - From the quick settings tab, choose create sample playlist, which will create a playlist with a few sounds already configured
    - Also on the quick settings tab choose Basic Settings, which will setup a simple configuration of custom sounds. This is roughly equivalent to what can be configured with the existing midi-qol custom sounds, but has a few more options and can be extended. (Basic settings are configured to work best with merge cards and no dice so nice).
  
### 0.9.28
* Fix for overtime effects broken in 0.9.27.
* Fix for Longsword of Life Stealing in midi sample items compendium

### 0.9.27
* If not auto rolling damage and using the merge card midi will display a roll count for the second and subsequent attack rolls on the same item card. Should help stop sneaky players mashing roll until it hits.
* Optional setting to display how much an attack hit or missed by.
* Fix for non spells with measured templates being tagged for concentration.
* Fix for race condition when marking wounded and applying effects at the same time.
* Tracking of bonus actions as well as reaction usage. Enabling enforce reactions also enabled checking bonus action usage.
* **Experimental** support for getting reaction items/features from magic items. Enable from the reaction settings on the optional tab.
* **For macro writers** Support for async Hook functions. For any of the midi-qol.XXXXX hooks, you can pass an async function and midi-qol will await the function call.
* **For macro writers** When midi expires an effect as an options[expiry-reason] is set to a string "midi-qol:reason", describing the reason which you can process as you wish.
* **Potentially breaking** Implemented fulldam/halfdam/nodam/critOther for weapons/spells/features rather than just weapons and this change replaces the weapon properties that were previously created by midi-qol.
  - Weapons with the old properties set should continue to work and the first time you edit the item it will auto migrate to the new data scheme (but of course there might be bugs).
  - Setting fulldam etc. check box for a spell/feature/weapon will take precedence over the text description search. If none are set the text description will still take place.
  - Added concentration property for any weapon/feature/spell (allows you to specify that concentration should be set when rolling the item via a check box) This is in addition to the now deprecated activation condition === Concentration.

### 0.9.26
  * Added missing flags.midi-qol.optional.NAME.save.dex/wis etc. to auto complete fields 
  * Added "every" option to count fields, means you can use the effect every time it matches without it ever expiring.
  * Fix for rolling tools with late targeting enabled.
  * Concentration will be applied to the user of an item (even if all targets saved) if the item places a measured template and has non-instantaneous duration - wall of fire/thorns etc.
  * Fix for the removal on any effect causing the removal of concentration.
  * Overtime effects that roll damage no longer wait for the damage roll button to be pressed, instead they damage is auto rolled and fast forwarded.
  * Support for GMs to apply effects (via the apply effects button) for other players. Effects are applied to whoever the GM has targeted.
  * For macro writers: Additional workflow processing options to itemRoll(options)/completeItemRoll(item, options: {...., workflowOptions}).
  You can set 
    lateTargeting: boolean to force enable/disable late targeting for the items workflow
    autoRollAttack: boolean force enable/disable auto rolling of the attack,
    autoFastAttack: boolean force enable/disable fast forwarding of the attack
    autoRollDamage: string (always, onHit, none)
    autoFastDamage: boolean force enable/disable fast Forward of the damage roll.
    Leaving these undefined means that the configured workflow options from the midi-qol configuration panel will apply.
  * Added Aura of Vitality to sample items compendium - when used creates a new feature Aura of Vitality Cure which does 2d6 healing to the target. For macro writers: this uses a different approach to removing the item when the spell expires. The created item is registered for removal on the spells concentration data, so the macro can run as an onUse macro (only called once), rather than macro.ItemMacro.

### 0.9.25
  * Fix for user XXX lacks permission to delete active effect on token introduced in 0.9.23 for concentration - same symptom different cause.

### 0.9.24
  * Fix for user XXX lacks permission to delete active effect on token introduced in 0.9.23 for concentration

### 0.9.23
  * Fix for double dice so nice dice rolling for damage bonus macro dice.
  * Fix for late targeting causing concentration save to require late targeting.
  * A tweak to using monk's token bar for saving throws. Player rolls always are always visible to other players. If there are GM rolls and the player's are not allowed to see the rolls, the GM rolls will be split to a separate card and displayed only to the GM. This resolves the issue of NPC names being shown to players when doing saving throws with Monk's Token Bar.
  * Fix for a maybe edge case where concentration removal was not working (concentration was removed but stayed on the actor).
  * Tidy up so that late targeting does not apply when doing reactions, concentration saving throws or overtime effects.
  * Late targeting window now appears next to the chat log so that you are well position to hit the damage button if required.
  * Reactions now prompt for spell level when casting reaction spells and the reaction executes on the correct player client.
  * Damage bonus macro damage is now added to base weapon damage by type before checking resistance/immunity (with a minimum of 0), so if you have 2 lots of piercing one that does 3 points and a bonus damage macro providing 5 the total damage of 8 will be applied (as it was before). If you have damage resistance to piercing the damage applied will be 4 points, instead of 3 points as it would have been when the damage resistance was calculated on each slashing damage and then added together. Should you wish to implement (who knows why) damage bonus macros that reduce damage, i.e. you do 1d4 less piercing damage because your eyesight is bad, the damage bonus macro can return "-1d4[piercing]"

### 0.9.22
  * Fix for empty combat causing all attack rolls error.
  * Late targeting now shows a panel that displays which tokens have been targeted and has roll/cancel buttons for the player to select. Any item that has a target type of creature (or does not have creature specified as the target type and is not an AoE item) will go through late targeting if enabled. I think this makes late targeting much easier to understand/use.
  * Late targeting changed to a per client setting for players and a global setting for the GM, so each player can choose. Defaults to false, so you'll need to tell your players what to set or use a global settings enforcement module like "Force Client Settings" which I use, but there are others.
  * Due to ~~complaining~~ popular demand I have reinstated the behaviour that players can always see the saving/ability/skill rolls made by other players. 
  * **Heads up** if you are overriding a reaction prompt and want to roll with advantage/disadvantage you need to hold alt/ctrl while clicking yes.
  * Another DamageOnlyWorkflow fix.

### 0.9.21
  * Fix for breaking damage only workflows in 0.9.20

### 0.9.20
  * Fix for EnforceReactions "Do Not Check" now really does not check.
  * Fix for optional.NAME.damage.heal
  * Fix for broken concentration automation if using CUB and convenient effects not installed.
  * (Several) Fixes for better rolls and Monks Token Bar interactions when using midi.
  * Magic resistance/concentration advantage work with MTB.
  * Fix for reactions incorrectly targeting and incorrectly displaying the original hit card.  09.9.19 introduced some bad funkiness which this is supposed to fix.
  * Be warned if you turn off enforce reaction checking then you can continue to do reactions to reactions until the end of time or you run out of spell slots. Enabling enforce reaction checking will stop that happening. You can still use items marked as reaction/reaction damage etc, but will be prompted to do so if rolling from the character sheet. 
  * If enforce reactions is enabled and you have used your reaction for the round you won't be prompted to choose a reaction when hit/damaged until the reaction marker is cleared.

### 0.9.19
  * **breaking** flags.midi-qol.optional.NAME.check will no longer be triggered for skill checks. To trigger both skills and ability checks add both flags.midi-qol.optional.NAME.check and flags.midi-qol.optional.NAME.skill to the active effect.
    - This prevents some confusing behaviour when trying to combine with other effects.
  * Fix for over zealously hiding roll formula from players.
  * Fix for always hiding roll details when using betterrolls5e.
  * Fix for not hiding saving throws when using betterrolls5e.
  * Reaction dialogs will now be removed if the reactee does not respond in time.
  * Another fix for players ending their own turn when overtime effects are present (causing the combat tracker to not update).
  * When Enforce Reactions is set to "Do Not Check" you can take as many reactions as you want - i.e will get prompted any time you might take a reaction.
  * Added reroll-kh, reroll-kl to optional.NAME.xxx effects. Will keep the higher/lower of the rerolled and original roll.
  * Ability saves/check/skills optional.NAME effects will now send a message to chat indicating the roll.
  * Ability saves/check/skills optional.NAME effects dialog will remain open as long as there are valid optional flags available.
  * onUse macro (postDamageRoll) supports modifying the workflows damage roll, details in Readme.
  * Update Lucky to reflect the new reroll-kh facility.

### 0.9.18
  * Fix for error thrown when checking hits.

### 0.9.17
  * Added additional onUseMacro call "preItemRoll", this is called before the item is rolled, which means before resource/spell slot consumption. If the macro returns false the roll is aborted, before the spell slot/other resources are consumed. This allows you to implement special item usage conditions.
  * Added additional Hook "midi-qol.preItemRoll" which allows you to do general preItem checks. If the hook returns false the workflow is aborted.
  * Aborting the casting of a concentration spell by closing the spell slot usage dialog no longer removes concentration if it already existed.
  * Fix for magic resistance and concentration advantage. Broken with the move to new key mapping. 
    - When using LMRTFY + query the display will not include magic resistance/concentration advantage/disadvantage, however the roll query will correctly set the default option.
    - When using LMRTFY, all sources of advantage/disadvantage will be merged and the advantage/disadvantage LMRTFY will reflect those sources.
    - When using Monk's token bar magic resistance/concentration check advantage won't be set - you'll have to manually hit atl/control as required. Other sources of advantage/disadvantage work.
  * Some cleanup on blind rolls and hiding of rolls.
    - If the player makes a blind gm roll, instead of seeing nothing in chat, they will see the Item card, but attack and damage will be "Rolled" and they will not see the results of the roll.
    - If you are not using auto roll attack/damage and do a blind gm roll instead of being unable to complete the roll the attack/damage buttons will be displayed on the chat card, but when you roll the results of the roll will be "Rolled".
    -  I've changed "Really Hide Private Rolls" to a per client setting so each player can decide if they want the "X privately rolled some dice" message or not. As a reminder the "Rally Hide Private Rolls" setting only refers to core dnd5e attack/damage/save/skill rolls. When using the merge card attack/damage roll cards are never displayed.
  * Optional rule incapacitated now checks before the item is rolled so that you won't have to answer questions and the discover that you can't do the roll. Similarly reactions won't be prompted for incapacitated actors.
  * Added deflect missiles to sample item compendium - deals with the damage reduction part.

  * Some enhancements to reaction processing. All reaction processing settings have moved to the Optional settings tab.
    - Reaction processing is much clearer when convenient effects is installed as there is a visual indicator when a reaction has been used.
    - New optional rule, "Record Oppotunity Attacks". If an actor who is in combat makes an attack roll when it is not their turn in the combat tracker a reaction marker will be applied (if using CE) and record that they have used their reaction for the round. Settings are:
      - None: don't check this
      - Characters: record this for characters but not NPCs
      - All: record for all actors.
    - New optional rule, "Enforce Reactions", same options as record attacks of opportunity. If enabled, when using an item that would be counted as a reaction (has reaction set in the item details or is an attack of opportunity) the player/GM is queried if they want to continue because they have already used their reaction for the round. This replaces the previous automatic blocking of using reaction items if a reaction had already been taken.

    - Reactions are now tested via either the convenient effects reaction effect or midi's internal reaction tracker, midi automatically applies both. Both are reset at the start of the actors turn or when the CE reaction is removed.
    - If an actor is not in combat attacks won't be recorded as reactions.
    - The test for in combat covers all combats, not just the current combat.
    * To help macro writers creating reaction items, args[0] now contains an additional field, workflowOptions which includes some data from the attack that triggered the reaction.
      - workflowOptions.sourceActorUuid: the uuid of the actor that triggered the reaction, fetch the actor via fromUuid.
      - workflowOptions.sourceItemUuid: the uuid of the item that triggered the reaction, feth the item via fromUuid.
      - workflowOptions.triggerTokenUuid: the uuid of the toekn that triggered the reaction, fetch the token via fromUuid.
      - workflowOptions.damageTotal: the total damage of the attack (if a reaction damaged reaction).
      - workflowOptions.damageDetail: the detail of the damage done which is an array of {damage: number, type: string}. Where the string is piercing, fire etc.
      - Be aware when writing macros that if the item is rolled from the character sheet these fields will not be populated.
    - **warning** There has been quite a lot of refactoring of the reaction management code so errors could well be present.
    - If you were part way through a combat with reactions used and update midi you might see some odd behaviour until at least one round has been completed.

  * Known issue: 
    - Checking reactions for NPC's can be confusing. If you double click to open an NPC sheet, attacks of opportunity rolled from that sheet will ALWAYS refer to the token you double clicked on - even if you select a new token on the canvas. This can be confusing (and one of the reasons that there is a character only option for reaction checking).
    - If you use "Token Action HUD" to do your rolls the selected token will be used.

### 0.9.16
  * fix for bonus dialog debug left in
 
### 0.9.15
  * Fix for warning when applying effects with no origin.
  * Fix for optional.ac effects being triggered on damage rolls
  * Fix for optional effects not being triggered if other reactions are available.
  * Added chatmessage to show the results of an optional.ac effect (previously you had to deduce the result).
  * Optional effects can now have a count of "reaction". This is very similar to "turn", except that it will apply the convenient effects reaction effect and blocks other reactions being used until the start of the actors next turn. This means you can create optional effects that will count as using your reaction. So improving save throw/attack roll/damage roll/ac bonus can count as a reaction.
  * New auto apply damage setting, auto apply to NPC but not to characters. If selected damage will be applied automatically for NPC targets but not "character" targets. Targets who do not have damage applied will be marked with "*" to the left of the target icon. The tick button will apply damage to those targets normally. The test for PC is that the actor is of type "character", so if you have NPCs of type character they will also be excluded from the damage application.
  * Some improvement to the activation condition evaluation. If an activation condition contains an @field reference it will be evaluated as currently. If not, it will be evaluated in a sandbox that contains the current workflow, target, actor and item data. So
```
  workflow.targets.some(t=> t.actor.effects.find(i=>i.data.label === "Poisoned")
```
  works. 
    - If the condition contains an @field reference it will be evaluated as currently. 
    - If not the expression is given a sanitised version of the same data, but only as data so actor/token/item functions will work, eg. actor.update(). The above expression works without modification.

### 0.9.14
  * Fix for roll other damage for spells not applying other damage.
  * Fix for chat damage buttons not working for "Other" damage.
  * Fix for a reported error when canvas disabled - there are probably more.
  * Enhancement to optional effects
    * **Breaking** **You must upgrade to DAE 0.9.05**, which is required for optional effects to continue to work. You will get a warning if the correct version of DAE is not installed even if you don't have optional effects. And midi will behave as if DAE is not installed.
    * flags.midi-qol.optional.Name.attack is deprecated in favour of flags.midi-qol.optional.Name.attack.all. Similarly .check, .save, .skill, .damage all need to be changed to check.all, save.all, skill.all and damage.all. If you have the old style effects you will get deprecation errors but they will be treated as .all.
    * Additional support for skill.all/itm/per/prc etc.
    * Additional support for check.all/dex/str etc.
    * Additional support for save.all/dex/str etc.
    * Additional support for attack.all/mwak/rwak/rsak/msak
    * Additional support for damage.all/mwak/rwak/rsak/msak
    * Updated Bardic Inspiration and Lucky for the changes. Upgrade these in game to avoid deprecation errors.
  * Put back rollOptions in the arguments passed to onUse macros and added isVersatile.
  * Calculate damage detail before and after the call to any Damage Bonus Macros. Damage bonus Macros are now able to adjust the damage roll recorded for the item.

  ### 0.9.13
* Fix for quick inserts causing midi to think control key was left on.
* Added Item effects take priority when choosing to apply convenient effects.

### 0.9.12
* Fix for typo in reaction processing for reaction manual.
* Fix for trapworkflows - again.
* Removed requirement for itemData being passed to DamageOnlywWorkflow to trigger bonus features.
* Fix for challenge mode armor AC.AR/AC/ER not being modifiable from active effects.
* Fix for macro.execute to make sure actor and token are available inside the macro.
* Small tweak if you are not auto rolling damage. If the roll is not complete(i.e. you have not rolled damage) you ca re-roll the attack and the chat card will update (i.e. you forgot advantage or some such) and the workflow will continue form then on. The only change is that the chat card will update rather, than displaying another chat card

### 0.9.11
* Fix for TrapWorkflow setter only error.
* Fix for showing hit result to players (when it should be hidden) when merge card not being used.
* Fix for broken flags.midi-qol.critical.EVERYTHING., fags.midi-qol.grants.critical.EVERYTHING. These flags only apply if exactly one target is hit.
* Fix for stuck advantage/disadvantage when rerolling an item from the chat card.
* Allow optional.Name.skill.acr etc. to trigger only on acrobatics etc. skill rolls
* Allow optional.Name.save.dex etc. to trigger only of dex etc. saving throws.
* Allow optional.Name.check.dex etc. to trigger only of dex etc. ability checks.
* Support reroll-max and reroll-min in flags.midi-qol.optional.NAME.XXX to reroll with max or min dice,
* Added flags.midi-qol.max.damage.all.mwak/etc. which forces maximum rolls on all dice terms. (grants to follow)
* Added flags.midi-qol.max/min.ability.check/save/skill.all/abilityid/skillId to maximise check/save/skill rolls.
* Pass through dialogOptions in rollDamage and rollAttack.
* Don't pass a null event to any of the item roll calls.
* Concentration checks now list the effect that has concentration when prompting for removal. Thanks spappz.

### 0.9.10
  0.9.10
  * Fix for template error in midi-qol settings template.

### 0.9.09
  * Make the suspend options rules key actually only available to the GM, not all players.
  * Some GMs don't want their players to know if the baddy saving had advantage or not, so there is a new setting in the saves section of the workflow tab 
    - "Display if save had advantage/disadvantage" (default true).
  * Correct keyboard adv/dis interaction with flags adv/dis.
  * Another tweak to the fix sticky rolls. This one seems to work perfectly with Token Action Hud.
  * First release of Midi Qol Quick Settings (treat as experimental and export your settings before playing to be safe). Idea for this thanks to @MrPrimate
    - Provides a way to set a group of settings in midi to achieve a desired configuration.
    - When these are applied a dialog is displayed showing what setting changes were made.
    - There are 2 "full" configurations "Full Auto" and "All Manual", both of which overwrite the entire configuration settings when activated.
    - There are a small number (seeking feedback on what else would be useful) of sub groups that achieve specific settings, for example GM Auto/Manual rolls will set a group of midi settings in what I think might be a sensible configuration for GM auto/Manual rolls. These can be applied without (hopefully) disturbing other configuration details.
    - I'm actively seeking feedback on whether this is useful and what else should be added. Primarily looking for feedback from users who are not all that comfortable with the midi settings or new to midi..

### 0.9.08
  * Fix for "skipping consume dialog setting" enabled throwing an error.
  * Fix for overtimeEffects when better rolls enabled.
  * Removed the over eager custom sound effects from every workflow settings tab.
  
### 0.9.07
  * Turns out restricted key bindings did not mean what I thought they did. So the world key mappings setting is temporarily disabled no matter what you set it to and key bindings are per client until further notice.
  * Trying a new fix for sticky keys. I've not seen any adverse effects, but there might be - if so disable it.

### 0.9.06
  * Fix for "midi - qol" text error and others.
  * Added configurable suspend optional rules key (only available to GM). If pressed when rolling an item/attack/damage no optional rules will be applied to the roll(s).
  * Note: if you want to combine keyboard keys with modifier keys (e.g. O+Ctrl for critical other damage roll perhaps) you need to press the O before the modifier key, otherwise it will be treated as control-O which does not match any keyboard configurations

### 0.9.05
  * Added ability to do game.settings.set("midi-qol", "splashWarnings", false)
    from the console or a macro, to permanently disable midi's notification warnings about missing modules on load. 
  * Notification warnings on load are only shown to the GM.
  * Added config setting Fix Sticky Keys. If enabled midi attempts to fix the cases where adv/dis get stuck "on". Tested specifically with Token Action Hud. If it causes issues you can disable it.
  * Updated ja.json - thanks @Brother Sharp
  * Slight enhancement to the application of convenient effects when using items.
    - There are 3 options in the workflow setting, Don't Apply, CE take priority, both CE and Item Effects.
    - The first and 3rd settings are pretty obvious. The second option means apply the CE effect if it exists and otherwise apply the item effecs.
    - The apply CE/don't apply CE checkboxes on the item card have slightly different semantics.
      - Don't Apply checked means the workflow setting becomes "Don't Apply".
      - Apply CE Checked means, Don't Apply => CE has priority, CE has priority and Apply both are unchanged.

### 0.9.04
  * Fix for broken better rolls automation being broken.
    - Midi keyboard shortcuts do not apply for attack/damage when better rolls is active.

### 0.9.03
  * Fixed a number of edge cases when processing alt/ctl/shift that were causing problems.
  * As a side effec token action hud seems to be working again.
  * Fixed a problem with flags.midi-qol.grants.critical.all/mwak etc.
  * Fix for bug introduced in 0.9.02 for saving throws in overtime effects.
  * Fix for bug introduced in 0.9.02 when rolling versatile damage. 
  * To roll versatile attacks with advantage/disadvantage press V then alt/ctrl. alt/ctrl then V will not work, nor will shift+Ctrl or Shit+Alt
  * Fix for bardic inspiration valor (and any optional effect that can increase AC).

### 0.9.02
  * Added the promised flags.midi-qol.DR.mwak etc. to the auto complete list.
  * flags.midi-qol.DR.all now supports negative values to deal extra damage when being attacked.
  * midi-qol will now call "midi-qol.XXXX.itemUuid" as well as "midi-qol.XXXX", so you can have multiple rolls in flight and wait on the item specific Hook to be called.
  * Target tooltip on midi-damage card now includes DR settings as well as dr/di/dv.
  * Added option to have spell saves auto fail for friendly targets. If the text "auto fail friendly" or the localised equivalent appears in the spell description then tokens with the same disposition as the caster will auto fail their save. Useful for some spell effects where you don't want to save.
  * **VERY BREAKING** If you used speed keys. Midi-qol now uses core foundry key mapping instead of speed key settings - access from "Configure Controls".
    - This means you will have to redo your speed key mappings (sorry about that) in Configure Controls. 
    - By default these settings are **per user** so have to be set up for each player. There is a midi setting World Key Mappings (misc tab) which, if checked, will force all clients to use the GM settings (changes to World Key Mappings requires a reload).
    - This change has required quite a lot of internal changes and it almost certain there are cases I have not tested - so don't upgrade 5 minutes before game time. v0.9.01 is available for re-installation.
    - Out of the box the configurations are (almost) the default midi-qol settings, so if you didn't use speed keys you should not notice much difference.
    - There is a new accelerator toggle roll ("T" by default) which when held when clicking will toggle  auto roll/fast forward for both the initial click and subsequent chat card button presses. This is an extension of the previous adv+ disadv functionality which is not created by default. You can configure the toggle key to use ctrl/alt if you wish.
    - The existing Caps-Lock functions can't be supported in core key mappings so use "T" instead.
    - Critical now supports "C" for critical in addition to the default Control Key
    - versatile damage is V+click as well as Shift+click.
    * You can choose to roll "Other Damage" instead of normal or versatile damage via the "O" key when pressing the item icon. IF using this and you have roll other damage on rwak/mwak set, make sure to roll other damage to "Activation condition" and set the activation condition to false in the item. So that rolling the item won't auto roll the "Other" Damage in addition to the normal damage.
    - Foundry core supports differentiating between left and right ctrl/shift/alt keys, so you have more options to configure things as you wish.

### 0.9.01
**This is the last midi release that is compatible with versions earlier than 9.**
* Fix for it.json having trailing spaces.
* Fix for inadvertent breaking of flags.dnd5e.initiativeDisadv 
* Fix for marking unconscious when dfreds installed. Requires v2.1.1 of Convenient effects.
* Use dnd5e bleeding effect for wounded is convenient effects not installed.
* Added new option "log call timing" which will send some elapsed time log messages to the console.log.
* Support for convenient effects "reaction". If convenient effects is enabled midi will apply the reaction effect when a reaction item is used (either manually or via reaction dialog), remove the reaction marker at the start of the the actors turn and not prompt/allow reaction items to be used if a reaction has already been taken this turn.
* Added flags.midi-qol.grants.attack.bonus.all/rwak etc. which adds a simple numeric bonus to attacker's rolls when checking hits against that target. The chat card does not reflect the bonus.
  e.g. flags.mid-qol.grants.attack.bonus.all OVERRIDE 5 means that all attacks against the actor will get +5 when adjudicating hits. A natural 1 will still miss.
* Added flags.midi-qol.grants.attack.success.all/rwak etc. which means attacks against the actor will always succeed
* New option for optional effects. If the effect has flags.midi-qol.optional.NAME.count OVERRIDE turn (instead of a number or @field), then the optional effect will be presented once per round (if in combat). Once triggered the actor must be in combat for the count to get reset at the start of their turn, or you can update flags.midi-qol.optional.NAME.used to false. If there is no active combat the effect will be presented each time it might be used.
  - The idea is that some optional rules allow you to do bonus damage once per round and now these can be modelled.
  - Also the effect wont be automatically deleted when used like the other count options. Use a timeout or special expiry to remove the effect.
* **BREAKING** removed midi-qol critical threshold, since it is now supported in core.
* **BREAKING** midi-qol now requires dnd5e 1.5.0 or later

### 0.8.105
* Mark player owned tokens as unconscious when hp reaches 0, rather than defeated.
* Overtime effects use the globalThis.EffectCounter count if present for rolling damage.

### 0.8.104
* Fix for items that do no damage but apply effects when using better rolls and not auto rolling damage (i.e. add chat damage button is checked).
* Fix for Shillelagh item macro.
* Add automatic marking of wounded/unconscious targets, controlled by config settings. Wounded requires a convenient effect whose name is the localised string "Wounded" (midi-qol.Wounded) to be defined (you need to do this). These are very simplistic, for any complex token triggers you should use Combat Utility Belt and Triggler which are excellent. 
* Added Action Type Reaction Manual which won't trigger a reaction dialog. So there are now 3 reaction types you can set, reaction which triggers when hit, reaction damage which triggers when you take damage and reaction manual which does not trigger the reaction dialog.
* Fix for inadvertent breaking of flags.dnd5e.initiativeDisadv 
* Fix for hiding hit/save chat card when not using merge card.
* Fix for a bug when applying overtime effects when players end their turn, if the next actor in the combat tracker has an overtime effect to apply.
* Additions to midi-qol.completeItemRoll options:
  - checkGMStatus: boolean, If true non-gm clients will hand the roll to a gm client.
  - options.targetUuids: string[], if present the roll will target the passed array of token uuids (token.document.uuid).
* Fix for game.data.version deprecation warning.
* Fix for some edge cases in Damage Reduction processing.

### 0.8.103
* Fix for tools using wrong advantage/disadvantage flags
* Fix for overtime effects stalling combat tracker when using better rolls with damage button enabled.
* Added ability to use different sounds for melee/ranged weapons/spell.
* Fix for monks token bar ability checks as saving throws not working.
* Fix for midi-qol making some monks rolls impossible to roll by hiding the roll button.
* Fix for initiative formula when token has no referenced actor.
* Compatibility change for Convenient Effects 2.0.1


### 0.8.102
* rerelease for package problem

### 0.8.101
* Fix for change from roll -> publicroll in v9 rollmode.
* Fix for sculpt spell flag and better rolls.
* Fix for roll other damage with activation condition still applying saving throw.

### 0.8.100
* Remove accidental debug left in
* Fix for incomplete lang.json files.

### 0.8.99
* Fix for Rakish Audacity and Sneak Attack sample items which break in v9 stable.
* Extend skip consume spell slot to cover skipping all consumption dialogs, pressing adv/dis when clicking causes the dialogs to be shown.
* Fix for expiring effects when actor has none. (v9 tweak I think).
* Removed unintentional reference to inappropriate icon from the module that shall not be named.

### 0.8.98
* Support core damage numbers for all damage/healing application.
* Remove accidental debugger call.

### 0.8.97
* Process flags.midi-qol.advantage..., flags.midi-qol.disadvantage.... when doing initiative rolls (dex check advantage will give initiative advantage).
* Fix for sneak attack and v9.
* Fix for v9 scrolling damage display not working with midi apply damage.
* 2 new onUseMacro call points, templatePlaced and preambleComplete.

### 0.8.96
* Fix for concentration save bonus being ignored. Thanks @SagaTympana#8143.
* Fix reactions ignoring prepared status on spells - broken in 0.8.95
* Remove context field from onUseMacros when using betterrolls5e
* Experimental "late targeting mode" for items that are NOT Template, Range or Self targeting. If auto roll attack is enabled then after you start the roll (click on the icon):
  - token + targeting will be selected in the controls tab, 
  - the character sheet will be minimised and midi will wait for you to target tokens.
  - You signal that you are ready by changing the control selection to anything other than token targeting.
  - The sheet will be restored and the workflow continue.

**Known Issues**. If the item does not have any targets, you will still have to complete the targeting process by clicking away from token targeting.
This is really intended for players who really, really can't get the hang of targeting before they do the roll.

### 0.8.95
* Reactions now check for resource availability and spell slot availability. (Probably some bugs in this).
* Added another midi-qol Hook call, Hooks.call("midi-qol.damageApplied", token, {item, workflow, damageData} => ());

damageData:
  actorId: "BGiR3QTov6V63oY7"
  actorUuid: "Scene.XRSav5mOrp1iEC7S.Token.fJYVrQVkOtulpQ8W"
  appliedDamage: 7
  damageDetail: Array(2)
    0: {damage: 7, type: 'fire', DR: 0, damageMultiplier: 0.5}
    1: {damage: 4, type: 'acid', DR: 0, damageMultiplier: 1}
  hpDamage: 7
  newHP: 493
  newTempHP: 0
  oldHP: 500
  oldTempHP: 0
  sceneId: "XRSav5mOrp1iEC7S"
  tempDamage: 0
  tokenId: "fJYVrQVkOtulpQ8W"
  tokenUuid: "Scene.XRSav5mOrp1iEC7S.Token.fJYVrQVkOtulpQ8W"
  totalDamage: 11

### 0.8.94
* Fix for empty onUseMacro field failing to allow adding onUseMacros
* Incapacitated actors can't take reactions

### 0.8.93
* Fix for better rolls not AoE template targeting correctly.
* Fix for No Damage On Save spell list failing in cyrillic alphabets.
* Fix for onUseMacros and tidy itemsheet5e display issues. Thanks @Seriousnes#7895

### 0.8.92
* Fix for non english games with no translation for midi-qol failing to open config. panel.
* Fix for removing "missed" chat cards when not auto rolling damage.
* Fix for onUseMacro settings and Foriens Unidentified Items.
* Fix for activation condition concentration not working.
* **BREAKING** as of 0.8.91 if using uncanny dodge from the compendium, you will need to change it's activation cost to "Reaction Damaged" or it won't function. I failed to update the compendium but will do it later. 

### 0.8.91
* Fix for rectangular templates coupled with wall blocking producing odd results.
* Support editing targets after placing an AoE template but before rolling damage for items without an attack roll (attacks lock the targets).
* Fix for better rolls saving throws results NOT being displayed for the player that did the save when using dice so nice.
* Fix for ability test saves not working.
* Breaking - libWrapper is now a dependency for midi-qol.
* Added some new midi-qol flags, flags.midi-qol.absorption.acid/bludgeoning etc, which converts damage of that type to healing, for example Clay Golem
* Added noDamageAlt and fullDamageAlt strings, mainly of use for language translators.
* Support for monk's token bar 1.0.55 to set advantage/disadvantage on saving throws as required. Midi-qol REQUIRES monk's token bar 1.0.55.
* Change to reaction processing. 
  - Added an additional reaction type, Reaction Damage as well as the existing Reaction.
  - Items with activation type Reaction will get applied after the attack roll has been made, but before it is adjudicated.
  - Items with activation type Reaction Damage will get called before damage is applied, but after it is determined that damage is going to be applied.
  - The activation condition is no longer consulted for reactions, only the activation type.
* Added Absorb Elements to the sample item compendium.

* OnUse macros - added some control for macro writers to decide when their macro should get called, this is meant to be more convenient that a macro that registers for hooks. The macro data will be current for the state of the workflow. e.g. ``[postActiveEffects]ItemMacro``. Many thanks to @Seriousnes#7895 for almost all of the code for this.
```
    [preAttackRoll] before the attack roll is made
    [preCheckHits] after the attack roll is made but before hits are adjudicated
    [postAttackRoll] after the attack is adjudicated
    [preSave] before saving throws are rolled
    [postSave] after saving throws are rolled
    [preDamageRoll] before damage is rolled
    [postDamageRoll] after the damage roll is made
    [preDamageApplication] before damage is applied
    [preActiveEffects] before active effects are applied
    [postActiveEffects] after active effects are applied
    [All] call the macro for each of the above cases
```
  - the macro arguments have an additional parameter args[0].macroPass set to the pass being called, being one of:
    preAttackRoll
    preCheckHits
    postAttackRoll
    preSave
    postSave
    preDamageRoll
    postDamageRoll
    preDamageApplication
    preActiveEffects
    postActiveEffects
  - all is special, being called with each value of args[0].macroPass. You can differentiate by checking ```args[0].macroPass``` to decide which ones to act on.
  - You can specify (for example):
    ```[postAttackRoll]ItemMacro, [postDamageApplication]ItemMacro``` for multiple passes, or use All
  - The default pass is "postActiveEffects", to correspond to the existing behaviour.
  * Note: if you are creating a damage only workflow in your macro it is best to run it in "postActiveEffects". 
  * Note: For better rolls the preAttackRoll, preDamageRoll don't really mean anything.
  * If you wish to make changes to the workflow in these macros you will need to do: (remembering that if the macro is an execute as GM macro being run on the GM client, the Workflow.get may return undefined)
  ```
  const workflow = MidiQOL.Workflow.getWorkflow(args[0].uuid)
  workflow.... = .....
  ```

### 0.8.90
* Reinstated the intended behaviour of the "Apply Active Effects" button, which is to apply effects to targeted tokens, rather than tokens targeted when the item was first rolled.
* Fix for better rolls saving throws not being hidden.
* Fix for a bug when using LMRTFY and midi, where midi would (sometimes) cause LMRTFY to do all rolls as normal rolls (ignoring the private/blind setting in LMRTFY).
* Fix for failed initialisation in non-english versions.
* Fixed wrong image in Readme.md for Hold person.
* Fix for some spells being ignored when doing reactions.

### 0.8.89
* Added "heal" action type to ddb-game-log support
* Fix for broken "no damage on save" cantrip list.

### 0.8.88
* Fix for ddbgl breakage in 0.8.87

### 0.8.87
* Fix for (I think) longstanding bug that if monster saving rolls would be displayed to players - even if midi setting was to hide them.
* Fix to Spirit Guardians to not create multiple sequencer/Automated animations effects. Midi sample items are in folders if compendium folders is enabled.
* Correction DF Quality of Life is the template targeting preview module (apologies to @flamewave000 for the wrong attribution).
* Change so that if player reactions are enabled and no logged in player with ownership of the actor exists, the GM will be prompted to do the player's reaction rolls.
* Fixed a problem where midi was trying to get unconnected players to roll saves. It simply would not take no for an answer.
* Fix for divine smite in v9.

* Experimental - first cut integration with ddb-game-logs. **You need to be a patreon of ddb-game-log for this to work**. Requires a yet to be released version of ddb-game-log.
  - Midi will accept attack/damage/saving throw rolls from ddb-game-log. If you roll an attack or roll damage for a feature with no attack, midi will create a workflow and check hits/saves and apply damage using the ddb-game-log rolls.
  - The link is one way, from dnd beyond to midi and there is no feedback from midi-qol to update dnd-beyond, like changing hit points or active effects.
  - Since the character settings are taken from dnd beyond NONE of the midi-qol advantage/disadvantage settings will apply to the roll. Similarly with damage rolls none of the foundry local bonuses etc. will apply. Simple summary, everything relating to the dnd beyond generated rolls (attack, damage and saves) is taken from dnd beyond.
  - If you want to use dnd beyond saving throws make sure the auto roll save setting is "Chat Message".
  - Hits/saves/Damage application will take into account the foundry's copy of values for AC, etc.
  - If set, midi will add damage buttons to ddb-game-log damage rolls which function exactly as for non game-log rolls.
  * Fix for setting not sticking for ddb-game-log integration.


### 0.8.86
Change to coloured borders. Now messages are coloured according to the user that created it.
* Made chat card border colouring a bit more aggressive - it should now colour most everything.
* New template targeting setting - "Use DF QOL". DF Qol has support for RAW template targeting, so by using this setting you can finally get templates that work "correctly" which should resolve long standing frustrations with midi-qol's template targeting. This also resolves an issue, that if DF QoL template targeting is enabled it would "fight" with midi and the winner would be essentially random.
* Various fixes for roll other damage spell settings.
* Added an option to create a chat message when a player is prompted for a reaction. After the reaction is resolved the chat message is removed.
* Midi/dae/times-up will now remove Sequencer permanent effects created by Automated Animation when the initiating effect is removed. The midi sample spirit guardians is an example.
* Automated Animations permanent effects, if created via a midi-qol effect will be auto removed on spell expiration. Requires a DAE and times-up update as well.
* Note - includes code for pre-release ddb-gamelog support which is not yet operational.
* MidiQOL.selectTargetsForTemplate now returns an array of targeted tokens.

* Fix for drop down lists not populating in 0.9 dev 2. Midi seems to work in 9 dev 2.

### 0.8.85
* Allow items to be set to not provoke a reaction (set item.data.flags.midi-qol.noProvokeReaction to true). No UI for this yet.
* Fix for silvered weapons check causing problems if there is no item in the workflow.
* Added resistance/immunity/vulnerability to non-adamantine weapons. Added DR against adamantine weapons.
* Added new overTime option, killAnim: boolean, to force automated animations not to fire for the overtime effect (niche I know, but I needed it for Spirit Guardian).
* New improved Spirit Guardian sample item, requires active auras to work and assumes there is a combat active.
Supports the following:
  - If a token enters the Spirit Guardian's range on their turn they will save && take damage.
  - At the start of an affected token's turn they will save && take damage.
  - If the token moves out of range of the effect they won't take damage anymore.
  - All effects removed on expiry/loss of concentration.
  - Spell level scaling is supported automatically.
  - If using automated animations, only the initial cast will spawn the automated animation, which is VERY pretty by the way.
  - Works with better rolls.
Not Supported: picking tokens to be excluded, the spell will only target enemies.

### 0.8.84
* Fix for triggering reactions (Hellish Rebuke) when someone heals you.
* Fix for duplicated lines in en.json.

### 0.8.83
* Fix for better rolls activation condition processing.
* Added non-magical silver physical damage resistance/immunity/vulnerability, which is bypassed by magical and silvered weapons.
* Fix for removing concentration effects when one of the target tokens has been removed from the scene.
* Monk's token bar saves now displays the DC based on the midi midi show DC setting.
* Fix for bug introduced in 0.8.81 with critical damage configuration - if you have Default DND5e as you setting, midi would incorrectly interpret that as no damage bonus.
* Fix for 1Reaction effects not expiring on a missed attack.
* Fix for localisation problem if using midi's concentration effect (i.e. no CUB/Convenient Effects).
* Addition to reactions. As well as triggering on attacks, reactions can trigger on damage application. Midi uses the activation condition of the item to work out which one is applicable.  
Most feats/spells have a blank activation condition and midi will treat those as attack triggered reactions, or if the localised string attacked is in the activation condition.  

Hellish Rebuke, for example, has "Which you take in response to being **damaged** by a creature within 60 feet of you that you can see", and midi will trigger those with the word damage in the activation condition when a character is damaged. (Hellish rebuke is a special one since it triggers only if you took damage).

* Added new item field "Active Effect condition". If set the activation condition must evaluate to true for the active effect to be applied. The saving throw if any must also be failed for the effect to be applied. For example, the included mace of disruption does additional damage to undead and if an undead fails it's save it is frightened. By setting the Activation Condition and Active Effect Activation Condition to checked only undead will suffer extra damage and be set frightened if they fail the save.

* Implemented Optional Rule: Challenge Mode Armor. See the readme.md for more information. My testing indicates that this is extremely unfavourable to higher level tank characters, dramatically increasing the amount of damage they take. I have implemented a modified version that, 1) scales the damage from an EC hit and 2) Armor provides damage reduction equal to the AR for all hits.

### 0.8.82
* Fix for better rolls and merge card throwing an error.

### 0.8.81
* Fix for bug introduced in 0.8.80 for onUse/Damage Bonus macros where targets was not set correctly. Impacted concentration not being removed automatically.
* Added localisation support for Critical Damage Options and Debug Options

### 0.8.80
* "full damage on save" to configure save damage for spells (like no damage on save it is always checked) - full damage on save would be used for spells that always do their damage but have contingent effects, like poisoned on a failed save.
* Added roll other damage for spells with the same settings as roll other damage for rwak/mwak.
* Fix for TrapWorkflow not targeting via templates correctly.
* Corrected tooltip for saving throw details when using better rolls (was always displaying 1d20).
* Correction to Divine Smite sample item which was incorrectly adding the bonus damage for improved divine smite.
* Fix for better rolls AoE spells failing if the template was placed before the damage roll completed (i.e. when dice so nice enabled).
* Fix for midi-qol not picking up the damage types for versatile damage rolls.
* Tidied up Readme.md

* Discovered, but have not fixed that if a) using better rolls, b) not using merge card and c) using dice so nice then save results won't be displayed to the chat. So if using better rolls you should enable merge card.

### 0.8.79
* fix for overtime effects duplicating convenient effects when the name of the effect being checked matches a convenient effect.
* fix for TrapWorkflow not displaying the damage type list in the roll flavor.
* Add new config option to bypass the spell cast dialog, casting at default level and placing templates. Pressing both Advantage+Disadvantage keys will force display of the casting dialog. If you don't have a spell slot of the level of the spell the dialog will be displayed so you can choose another slot. 
* exported overTimeJSONData to help macros create items on the fly.
FYI: if you want an overtime effect that just calls a macro each turn use  
```flags.midi-qol.overTime OVERRIDE turn=start,macro=macro name, label=My Label```
The macro will be called with the normal onUse macro data for the overTime effect being rolled.

### 0.8.78
* packaging error

### 0.8.77
* Reversed the "For items with no attack, damage or save (e.g. haste and similar) disabling auto roll attack will stop the automatic application of active effects" feature 0.8.75. There has been enough negative feedback to suggest it causes more problems than it solves.
* Small update to the force apply/don't apply checkbox for convenient effects so that the check box is ONLY displayed if there is a convenient effect that matches the item name.
 
### 0.8.76
* Fix for broken DamageOnlyWorkflow

### 0.8.75
* Added per item flag to override the midi-qol module "Apply Convenient Effects" setting. If the module setting is on, the per item flag will disable applying convenient effects, if the setting is off the per item flag will enable applying convenient effects for the item.  
This means you can mix and match between convenient effects and DAE/Midi SRD or homebrew. Set the module setting to the most common use case (probably auto apply convenient effects ON) and then disable the convenient effect on those items that you want to use just the effects on the item.
* Fix for AoE spells not targeting tokens smaller than 1 unit.
exactly as auto applying effects does.
* Fix for DamageOnlyWorkflow failing to apply damage.
* For the case of using the merge card and **not** auto rolling attacks the targeted tokens will be displayed in the chat card prior to the attack roll being done. After the attack roll is made the hit/miss status will replace the target list. This can be useful if you players often fail to target correctly.
* If using the merge card, not completing the roll and then re-rolling the item the incomplete chat card will be removed from the chat and replaced with the new item roll.
* For items with no attack, damage or save (e.g. haste and similar) disabling auto roll attack will stop the automatic application of active effects, but leave the apply effects button enabled. I'm looking for feedback on this one. It is convenient as a way to not auto apply effects when not auto rolling attacks, but might be inconvenient otherwise.
* Clicking the apply active effects button on the chat card will now complete the roll and expire effects as required, and other house keeping.
* If a spell caster with **flags.midi-qol.spellSculpting** set, casts an area of effect (template or ranged) Evocation spell, any tokens targeted before casting the spell will always save against the spell and they take no damage from spells that would normally do 1/2 damage on a save. So if casting a fireball into an area with allies, target the allies before casting the spell and they will take no damage.
* Added MidiQOL.socket().updateEffects({actorUuid, updates}).
* Added another hook, "midi-qol.preambleComplete" which fires after targets are set.  

### 0.8.74
* OverTime effects now support a rollType="skill", saveAbility=prc/perception etc. Should work with LMRTFY/Monks TB/betterRolls.
* Overtime effects can now call a macro as part of the overTime actions, macro=Name, where name must be a world macro, the macro is passed the results of rolling the overTime item, which will include damage done, saving throws made etc, as if it were an OnUse macro of the Overtime item roll.
* Added hide GM 3D dice rolls option to GM settings tab - attack/damage rolls by the GM if using the merge card will not trigger a dice so nice roll. Overrides other show dice settings.
* Added a display "ghost dice" setting, on the GM tab, which will display dice with "?" on the faces when a GM dice roll would otherwise be hidden. There are almost certainly cases I missed so don't enable just before game time.
* Added an enhanced damage roll dialog (workflow tab - damage section), that lets you choose which of the damage rolls available on the item to be rolled. Thanks @theripper93 for the code. Works when not fastForwarding damage rolls.
* Added flags.midi-qol.DR.mwak/rwak/msak/rsak which is Damage Reduction against attacks of the specified type.
* Fix for walls block targeting getting the wall direction the wrong way round.
* Fix for sign display problem on damage card when healing.
* Attempted fix for effects with a duration of 1Reaction not always expiring, issue does not occur in 0.9
* Fixed an obscure bug when checking concentration and updating HP > hp.max treating the update as damage.
* **BREAKING** For ranged area of effect spells, with or without a template if range type is set to "special", the caster won't be targeted.
* new DamageOnlyWorkflow() returns a Promise which when awaited has the completed workflow with damage applied fields filled in etc.
* Preliminary review of 0.9.x compatibility and seems ok (famous last words). 
* update ja.json - thanks @Brother Sharp

### 0.8.73
* A little tidying of active defence rolls so that duplicate rolls are not performed.
* Fix for midi-qol.RollComplete firing too early in the workflow.
* Added fumbleSaves/criticalSaves: Set<Token> to workflow, and fumbleSaves,criticalSaves,fumbleSaveUuids, criticalSaveUuids to onUse/damageBonus macro arguments.
### 0.8.72
* Fix for active defence error in ac defence roll calculation.
* Added support for ItemMacro.UUID in DamageBonusMacros and OnUse macros to refernce item macros for items not in your inventory.

### 0.8.71
* Fix for active defence causing a console error for non gm clients.

### 0.8.70
* Fix for damage type none and better rolls (would always do 0 damage).
* Fix for expiry of type isSave, isCheck, isSkill when doing auto saves/checks/skill rolls.
* Experimental: Support for the Active Defence variant rule. Enable via optional rules setting Active Defence. Requires LIMRTFY and does **not** work with better rolls. 
  * Active defence has attacked players roll a defence roll instead of the GM rolling an attack roll, which is meant to keep player engagement up. https://media.wizards.com/2015/downloads/dnd/UA5_VariantRules.pdf
  - If active defence is enabled then when the GM attacks instead of rolling an attack roll for the attacker, the defender is prompted to make a defence roll. The DC of the roll is 11 + the attackers bonus and the roll formula is 1d20 + AC - 10, which means the outcome is identical to an attack roll but instead the defender rolls.
  - As released this had identical behaviour to the standard rolls with the exception that each player effectively has a individual attack roll made against them.
  - Advantage/disadvantage are correctly processed with attacker advantage meaning defender disadvantage.
  - A fumbled defence roll is a critical hit and a critical defence roll is a fumbled attack, midi checks the attacking weapon for the correct critical hit/fumble rolls.
  - Timeout for player interaction is taken form the saving throw player timeout.
  - Display of the defence roll DC on the defenders prompt is taken from the saving throws display DC setting.
  - Issues: There is only one critical result supported, so if multiple targets are attacked they will all have critical damage rolled against them or none. (future might support individual results)
  - There is only 1 advantage/disadvantage setting applied, that of the first defender (same as current midi-qol). Future enhancement will use per character advantage/disadvantage settings.
  - Only works for mwak/rwak/rsak/msak.

### 0.8.69
**Changes coming in dnd5e 1.5**:
* dnd5e 1.5 includes per weapon critical threshold and bonus critical damage dice. There is now a configuration setting to enable/disable the midi-qol field on the item sheet. Once dnd5e 1.5 is released, you are strongly encouraged to migrate to the dnd5e setting and disable the midi-qol flag, via Use Midi Critical in the configuration settings. Soon, I will remove the midi-qol field completely. You can run ```MidiQOL.reportMidiCriticalFlags()``` from the console to see which actors/tokens have the midi-qol critical setting defined.
* Enhanced dnd5e critical damage effects. You can make most of the changes that midi-qol supports for critical hits via the new game settings (max base dice, double modifiers as well as dice) and per weapon settings (additional dice). You will need to experiment to confirm the interaction of the dnd5e critical damage flags and the midi-qol settings, however if you use the dnd5e default setting in midi-qol the rolls will not be modified by midi in any way and the dnd5e system will operate.

### 0.8.68
* Fix for betterrolls and OverTime effects not rolling damage correctly/at all.
* Fix for betterolls saving throws not being detected in chat message saves workflow.
* Overtime effects saveDC now supports expressions rather than just numbers/field lookups. No dice expressions.
* Fix for reaction checks throwing an error if no midi-qol flags are set on the actor.

### 0.8.65/66/67
* Fixes for template targeting and various module interactions.

### 0.8.64
* Added healing and temp healing to resistance/immunity/vulnerability types so that actor can be immune to healing.
* ~~Fix for template placing not working.~~

### 0.8.63
* Fix for OverTime effects - now supports stacking of the same effect (should be regarded as experimental).
* Added the ability to use # instead of , to separate OverTime fields. You have to use one or the other for the whole OverTime field.
* Fix for BonusDamageRoll rolls and dice so nice not being displayed.
* new MidiQOL.completeItemRoll function. Can use with  ```await MidiQOL.completeItemRoll(ownedItem, options)``` which will return the workflow when the entire roll is complete and damage (if any) applied.
* Template targeting clean up. 
  - If using levels you can set the midi-qol optional rule setting to check + levels, which will check template overage including height and levels walls blocking for all attacks. The midi template height check is VERY naive and in addition to 2d targeting simply checks a sphere centered on the template origin and if further away it is considered out of range.
  - If you want proper volumetric templates use the levelsvolumetrictemplates module (patreon) which does a great job of working out how much of the token is in the template and midi uses the result of that calculation. This version supports walls blocking for volumetric templates and uses volumetric templates for the preview targeting.
  - Midi also supports the levels "place next template at this height" setting from the left hand hud and if not set, will cast at the tokens current LoS height.
  - If levels is installed midi will use levels' check collision code, which deals with wall heights.
  

### 0.8.62
* Fix for ranged AOE spells using meters instead of feet.
* Fix for error thrown when expiring effects after a fumbled roll.
* Fix for overtime effects with no save expiring after one round.
* Fix for overtime effects being unable to roll damage if auto rolling damage is disabled.
* Added LMRTFY+Query mode for GM saving throws. And a reminder, if using monks token bar rolls, you cannot set advantage/disadvantage for concentration checks, you have to do it manually.
* Added per player RollStats in addition to existing stats. Player stats cover all actors they might control and have lifetime/session/item stats.
* Switched LMRTFY saving throws to use the actor uuid instead of id, so that for unlinked tokens the synthetic actor data is used instead of the base actor. (Make sure your LMRTFY is up to date).
* Be a bit more aggressive about adding concentration, for spells like wall of flame, stinking cloud which are AoE but might not target anyone when cast.
* Clarification: If a spell has concentration it will only be applied AFTER the roll is complete, which includes rolling damage if the item has damage, e.g. SRD Hunter's Mark.
* Updated Branding Smite to remove concentration when attack is made (as well as actor effect).
* Added MidiQOL.getConcentrationEffect(actor) which will return the concentration active effect for the curent passed actor, suitable for MidiQOL.getConcenttrationEffect(actor)?.delete() to remove concentration from an actor.

### 0.8.61
* Various/significant concentration fixes if you have combat-utility-belt AND/OR convenient effects installed or none. Symptoms included, duplicated concentration saves required, not removing concentration, generally breaking.
* Optional rule for saving throws auto save/fail on critical roll/fumble
* Updated Flaming sphere. After a lot of testing, removing the item on expiry/removal of concentration was causing many bugs, which are not present in 0.9. Until then the summoned sphere will not be auto deleted, everything else should work.
* Small fix for potentCantrip if the actor had no other midi-flags set.

### 0.8.60
* Fixed acid arrow (which had the wrong rounds duration 1 instead of 2).
* Fix for healing not working - oops.

Clarification, overtime effects share some features with other active effects.
  - if an overtime effect is applied as a passive effect (think regenerate) then using @fields will evaluate in the scope of the actor that has the effect and be evaluated each turn, no processing is done when creating the effect on the actor.
  - if the overtime effects is applied as a non-transfer effect (i.e. the result of a failed save or an attack that hits) @fields will evaluate in the scope of the caster exactly once when the effect is applied to the target, and ##fields will apply in the scope of the target each time the effect is tested.
  Example: a character with 50 HP with a spell, cast at level 3,  has a applied effect attacks a beast with 20 hp, then a removeCondition (for example) of
  ```@attributes.hp.value < 30 && @spellLevel > 2``` will evaluate to ```50 < 20 && 3 > 2``` before the effect is created on the target actor and will always be false. Of special usefulness is an expression like ```damageRoll=(@spellLevel)d4```, which is evaluated when applying the effect and returns an expression like (3)d4 if the spell was cast at level 3.
  ```##attributes.hp.value < 30``` will evaluate to ```@attributes.hp.value < 30``` and will be evaluated each round until the targets hp are less than 30.
  The ## versus @ behaviour is standard for DAE/Midi active effects.

### 0.8.59
* improve condition immunity behaviour. If you try to apply a condition whose statusId (usually name) matches a condition immunity application will be blocked. (For unlinked tokens this is not possible so the condition is marked as disabled).
* Fix for not applying empty effects (for tracking expiry).
Sample Items:
Added Longsword of sharpness.
Added Acid Arrow.

### 0.8.58
* Added flags.midi-qol.DR.final which is damage reduction applied AFTER damage resistance/saves etc. Not RAW but useful.
* Fixed ranged target selection to support meters. Sorry about that, and I live in a metric country - hangs head in shame.
* Some updates to activation conditions.
  * Since it is so common @raceOrType, will return the targets race (if there is one) or the targets type, in lowercase.
  @wokrflow provides access to the midi-qol workflow that caused the roll.
* Fix for saving throws not being rolled at all.
Sample items:
Longsword of Lifestealing (has an itemMacro).

### 0.8.57
* Fix for incorrect failed saves calculation if there was a to hit roll as well.

### 0.8.56
* Fix for broken configure settings dialog (oops).

### 0.8.55
* If concentration is set to inactive, taking damage won't trigger a constitution saving throw. I'm not sure it really makes sense to set concentration inactive, but I don't see that it causes any problems and can be convenient when tweakingg Hit Points.
* A fix for OverTime removeCondition which was not being evaluated correctly.
* Added flags.midi-qol.potentCantrip, if enabled cantrip saves always do 1/2 damage instead of (possibly) no damage.
*  Fixed a reference to deleteOwnedItem for 0.9 compatibility.

* Reworked "Roll Other formula for rwak/mwak" flag to make it more flexible, you can now implement slayer items without any macros.  

Roll Other Damage now has 3 options, "off": never auto roll the other damage, "ifsave": roll the other damage if a save is present (this is the same as the current roll other damage true setting) and "activation": if the activation condition evaluates to true then roll the Other damage even if no save is present. "activation" also requires that the item attunement not be "Attunement Required", i.e. dragon slayer weapons do no extra damage if they are not attuned. **Better Rolls** only supports none/ifSave until the next release.

Most creature attacks with extra damage (poisonous bite) equate to the ifSave setting.
Magic items that roll additional damage if a particular condition is true (slayer weapons) require the "activation" setting.

midi will evaluate the activation condition as an expression, providing, the actor, item (@item) and target actor's (@target) roll data. For example:
```
    "@target.details.type.value".includes("dragon")
```
will only roll if the target has a type of dragon. 
**An empty activation condition** will evaluate as true. If you don't want a specfic weapon to roll Other Damage set Activation Condition false.

You can add the above condition to the SRD slayer items to make the bonus damage automated based on target type.

If the weapon rolling the attack has ammunition AND the weapon does not have it's own Other Roll defined, the activation condition, Other roll and saving throw from the ammunition will be used. (Arrow of Slaying). **This does not work with Better Rolls (and probably wont)**

There is a new weapon property "Crit Other Roll" which if set means that the "Other Damage" roll will be rolled as critical if the base roll is critical. Previously Other Damage would never roll critical damage. You can decide if your Arrow of Slaying can do critical damage or not. **This does not work with Better Rolls** (yet)

* Added a few new items to the sample compendium,
  * Flaming Sphere, this does pretty much everything the spell is supposed to do. Requires Active Auras and DAE. (Treat it as experimental - as I have not tried it in game yet).
  * Dragon Slayer LongSword. Example of simple activation roll other damage.
  * Arrow of Slaying (Dragon). Example of ammunition other roll damage, use it by adding to the character and setting the bow's ammunition to arrow of slaying.

* Updated ko.json - thanks @klo

### 0.8.54
* Fix for Sorcerer's Apprentice OverTime bug. If you have an overtime effect with a label equal to a convenient effect's name AND you are auto applying convenient effects the effect would be applied repeatedly, 1->2->4->8 etc.
* Added OverTime removeCondition=expression which if true will remove the effect. (renamed condition to applyCondition - but supports the existing condition label as well).
* Oops - I managed to remove a check in one of the previous updates which means OverTime effects are applied for each user logged in. Fixed.

### 0.8.53
* Fix for Damage Reduction being applied to healing
* Added condition=expression to midi-qol OverTime, the rest of the overtime effects are only processed if condition evaluates to true. e.g. @attributes.hp.value > 0. You can use any actor fields in the expression, but not dice rolls. Undefined fields (e.g. flags) will evaluate to 0.
 Added sample Regeneration Item that checks for HP > 0 before applying.

### 0.8.52
* Allow flags.midi-qol.OverTime.NAME (name optional) will allow multiple effects to be recorded on the actor (with or without NAME the effects will still be processed - this is just cosmetic).
* Support rollType = check (default is save) in OverTime specification, roll an ability check instead of an ability save.
* Clarification:
  * "healing" and "temphp" work as damage types doing the obvious - healing damage is a way to implement regeneration. 
  * @field replacement on overtime active effects only works if DAE is enabled.
* Fix for longsword of wounding doing an unnecessary saving throw. Fix for Hold Person not being removed on a save.
* Addition of regeneration feature which adds HP at the start of the turn. If the optional rule for incapacitated targets is enabled HP will be regenerated only if the actor has at least 1 HP.
* The ability to do a reaction now resets at the start of an actors next turn.
* Rewrite of Damage Reduction. Should now do something sensible when apportioning damage reduction across attacks with multiple damage types. It is not obvious what should happen in all cases so expect some confusion on this one - don't update 2 minutes before game time. The tests I've done suggest it is doing something sensible. I've enabled a developer console warning message detailing the DR apportionment midi has done.
* Update for sheet buttons on Better NPC sheets, thanks @mejari (gitlab).
* Only display ChangeLogs module warning once per midi-qol update.
* Concentration: If a spell/item with concentration has an attack/save only apply concentration to the attack/caster if there are hit targets or some failed saves.

### 0.8.51
* Fix for midi-qol OverTime boolean flags processing which was broken.
* added to flags.midi-qol.OverTime saveDamage=halfdamage/nodamage/fulldamage - default nodamage
* added to flags.midi-qol.OverTime saveRemove=true/false - remove effect on save - default true.
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
* Reactions updates
  * only prepared spells are selected for reaction rolls.
  * only 1 reaction per combat round is allowed. If not in combat you get a reaction each time.

* **New** support for Over Time effects - which only apply to actors in combat.
```
flags.midi-qol.OverTime OVERRIDE specification
```
where specification is a comma separated list of fields.
  * turn=start/end (check at the start or end of the actor's turn) The only required field.
  Saving Throw: the entire active effect will be removed when the saving throw is made (or the effect duration expires)
  * saveAbility=dex/con/etc. The actor's ability to use for rolling the saving throw
  * saveDC=number
  * saveMagic=true/false (default false) The saving throw is treated as a "magic saving throw" for the purposes of magic resistance.
  * damageBeforeSave=true/false, true means the damage will be applied before the save is adjudicated (Sword of Wounding). false means the damage will only apply if the save is made.
  Damage:
  * damageRoll=roll expression, e.g. 3d6
  * damageType=piercing/bludgeoning etc
  If the effect is configured to be stackable with a stack count, of say 2, the damage will 3d6 + 3d6.
  *label=string - displayed when rolling the saving throw

  The most common use for this feature is damage over time effects. However you can include an OverTime effect with just a save can be used to apply any other changes (in the same active effect) until a save is made (Hold Person).

    For non-transfer effects (things applied to a target) you can use @field references, e.g.
  ```
  saveDC=@attributes.spelldc
  damageRoll=1d6+@abilities.str.mod
  ```
  Examples: 
  * Longsword of Wounding (Should have stackable set to "each stack increases stack count by 1")
  ```
  flags.midi-qol.OverTime OVERRIDE turn=start,damageBeforeSave=true,label=Wounded,damageRoll=1d4,damageType=necrotic,saveDC=15,saveAbility=con
  ```
  * Devil's Glaive (Infernal Wound) (Should have stackable set to "each stack increases stack count by 1")
  ```
  flags.midi-qol.OverTime OVERRIDE turn=end,damageRoll=1d10+3,type=slashing,saveDC=12,saveAbility=con,label=Infernal Wound
  ```
  * Hold Person (1 effect, but 2 changes both of which get removed on save)
  ```
  flags.midi-qol.OverTime OVERRIDE turn=end,saveAbility=wis,saveDC=@attributes.spelldc,saveMagic=true,label=Hold Person
  macro.CE CUSTOM Paralyzed
  ```

## 0.8.49
* Added additional option for GM saves. You can specify auto/prompted rolls for linked/unlinked tokens separately. So boss tokens (which might be linked) will can get special treatment for saving throws.
* Added flags.midi-qol.ignoreNearbyFoes which, when set, means disadvantage from nearby foes wont affect the actor.
* Fall back to midi-qol internal concentration when convenient effects/cub not setup as expected.
* Added support for the levels module collision checking (which incorporates wall height/floors etc) - in walls block settings (optional rules - center + Levels). This works for templates and range checking. If levelsvolumetrictemplates is installed it will take over the template checking.
* Support for levels-autocover (choose check + levels in option rules).
* Support for levelsvolumetrictemplates when auto-targeting templates.
* Added flags.midi-qol.concentrationSaveBonus, a roll expression, which is added to any midi-qol rolled concentration saves (auto, letme, monks, prompted). The roll will display without the bonus on roll card, but the save result display will reflect the bonus. The revised saving throw formula is available in the tooltip on the save results card.
* Fix for concentration, when convenient effects not setup as expected, throwing an error.
* Fix for special duration 1Spell and non attack/damage spells.
* Fix for distance measuring including height when 5105 measuring set.
* Fix for isDamaged.damageType special duration, e.g. isDamaged.fire.
* Fix for rectangular measured templates - walls blocking measured from the center of the template instead of the corner.

Notes: When calculating walls blocking and cover you can either use levels-autocover (which is center to center) or dnd5e-helpers which does not support walls/floors from levels, but not both.

## 0.8.48
* Fix for sneak attack not correctly recording that a sneak attack has been made in the current round. Seems to have broken in 0.8.9+
* Reaction item rolls will now target the attacker if the reaction item has an appropriate target type, e.g. hellish rebuke. For the caster the target will be set when casting so they can see who they hit.
* If dnd-helpers 3.0.0 or later is installed, there are 2 new options for walls blocking ranged attacks, dnd5e-helpers - an attack will be possible if any of the corners of the target token are visible, dnd5eHelpers+AC - target AC will be modified by the cover that the target has. You can disable the dnd-helpers apply AC setting, it will be automatically included by midi-qol when calculating an rwak/mwak/rsak/rsak. The rest of the dnd5e-helpers settings will be used when calculating cover including wall and tile settings. The to hit card will show any armor plusses due to cover. This should be regarded as experimental.

## 0.8.47
* Fix for mac crit damage dice and bonus critical damage dice.
* Fix for mook AI targets being deselected.

## 0.8.46
* Fix for error thrown in long rest checking.
* Fix for incorrectly hiding monks token bar saving throws when hide all details is set.
* Fix for versatile damage not working.
* Fix for GM Sees all chat messages and some instances of private rolls.
* Fix for "double" disadvantage on skill rolls overriding advantage.
* Fix for self target items with no token on the canvas calling an onUse macro.
* Fix for better rolls other damage rolls.
* Added support for isHit special duration.

## 0.8.45
* Changed "close window" behaviour on concentration effect to mean don't remove concentration
* Fixed check for conditional visibility installed - will impact advantage check when CV hidden or invisible is set.
* Removed a reference to deleteEmbeddedEntity
* Fix for applying active effects on some items.
* Added special duration expiries of, short rest, long rest and new day. It appears that dnd5e only sets new day if the rest is a long rest. So short rests specified as new day won't trigger the new day effect expiry. Requires DAE 0.8.44
* Fix for ranged targets on spells.
* Fix for an incompatibility with Giffyglyph's 5e Monster Maker

## 0.8.44
* Include damage bonus macro damage/r oll results in arguments to onUsemacros.
* Support ability specific save success/failure special durations.
* Added new attack display option hit/miss + damage total
* Fix for DR (damage reduction) for specific damage types not supporting field lookups.
* Fix for concentration origin/duration not being set for spells with no active effects.
* Fix for concentration settings when automation is not completed (not check saves etc)
* Moved removeConcentration from DAE to midi-qol
* midi-qol requires dae 0.8.43 and if 0.8.42 is installed concentration removal will throw errors.

## 0.8.43
* Support better rolls rolls for saves/test/skills - requires better rolls 1.6.6. (Finally)
* Fixed a bug introduced in 0.8.42 that swapped ability save/checks when auto rolling a save for a actor.
* Fixed a bug for earlier versions of CUB that did not include an effect icon for concentration.
* If Convenient Effects is enabled use the concentration status effect from Convenient Effects preferentially to other choices.
* Fix for spells with a range area effect to measure all squares covered by the potential target token.
* Fix for special duration effects being removed as a result of the attack that created the effect (i.e. isAttacked etc).
* Fix for missing targets with a lower AC than the hit roll. Some actors are being created with a string in ac.value, rather than a number, which was confusing midi-qol.
* Modified the d20 attack roll + damage total to hide the damage formula from players.

## 0.8.42
* Fix for template targeting with token magic fx.

## 0.8.41
* Fix for speed keys not working.
* Revers better rolls skill/save/check changes - until I can find a better solution

## 0.8.40
* Added MidiQOL.selectTargetsForTemplate(MeasuredTemplate). If you have a MeasuredTemplateDocument you need to pass templateDocument.object.
* Fix for scaling MagicItems
* Fix for concentration checks not removing concentration with better rolls enabled.
* FIx for concentration application when nothing hits.
* Fix for distance measuring when token is < 1 square wide or high
* Fix for skill/save/check rolls with better rolls enabled not rolling dual dice. As a side effect of this change flags.midi-qol.optional.Name.save/check/skill will have no effect when using better rolls.
* Fix for midi-qol overriding better rolls accelerator keys.
* Fix for dice not showing with latest dice-so-nice release.
* Fix for targets not being updated on other clients with AoE targeting.


## 0.8.39
* Fix for failed rolls/info when no token present for actor.
* Fix for LMRTFY always rolling with disadvantage.
* Fix for error thrown when cancelling a skill/save/check roll.
* Fix for concentration automation and non-english installs. Requires dae 0.8.36
* Added 
```
Hooks.call("midi-qol.ReactionFilter", (itemlist) => {})
```
 when checking for reactions. Return false to abort reaction processing, you can remove items from the list via ```delete itemList[i]```

## 0.8.38
* Fix for trailing + signs in damage rolls.
* Fix for re-rolls in better rolls not picking up new targets.
* Added critical threshold per item. Can be set as item.data.flags.midi-qol.criticalThreshold or from the item sheet. Will override the actor critical threshold if lower. Disabled for better rolls.
* Fix for concentration check on unlinked tokens.
* Fix for special duration isDamage.damageType not expiring when taking damage if saved.
* Fix for double damage critical damage setting.
* Added option for convenient effects module support. If enabled midi-qol will search for a "convenient effect" with the same name as the item rolled and apply any effects to the targets. (Experimental)

## 0.8.37
* Don't check conditional visibility flags if the module is disabled since they won't be removed.
* Fix for broken sneak attack introduced in 0.8.36

## 0.8.36
* Fix for versatile damage rolls
* Fix for better rolls no speaker defined.
* Fix for damage rolls when single concentration check not set.
* Fix for players control visible tokens for the GM. 
* Fix for measuring distance using 5/10/5 scheme.
* Remove any world identifying data from settings export.

## 0.8.35
* Fix for not displaying versatile button.
* Fix for players control visible tokens conflict with other modules. (the conflict with levels will go away, but players control visible tokens will not function with levels).
* Fix for another DamageOnlyWorkflow edge case throwing an error.
* Fix for concentration throwing an error when DAE not installed (DAE is required for concentration to work properly). Fix for concentration icon not being displayed.
* Added option to hide saving throw totals on save card.
* Fix for distance measure not using center of tokens.

## 0.8.34
* Major clean up to work with foundry league of developers types.
* Fix for displaying both GM only and PC obscured names in hit result cards.
* Fix for Damage Reduction not working with physical DR.
* Fix for duplicate damage rolls being displayed when not using merge card.
* Fix for TrapWorkflow and spells that require a template.
* Fix for not picking up player saving throws when using prompt player chatMessage, rather than auto or LMRTFY/MonksTokenBar.
* Fix for duplicate concentration application removing concentration.
* Added special duration 1Spell
* Added export roll stats to json/csv. This is the raw data so you'll need to do some arithmetic.

## 0.8.33
* Added flags.midi-qol.optional.NAME.damage which allows bonus dice to be added to damage rolls (i.e. Bard College of valour)
* Added flags.midi-qol.optional.NAME.ac, which allows adding bonus dice to AC when attack hits (i.e. Bard College of valour).
* Fix for GMAction rollAbility
* Fix for TrapWorkflow rolling the attack twice.
* Fix for midi-qol adding critical damage twice when not fast forwarding damage rolls.
* Change to check saving throw behaviour. If set to only GM sees or All see, players will only see the dice rolls for their own saves as separate chat cards, all other saving throw rolls will be hidden, this includes for the GM. The GM can always check the save results card which has the player roll details available as tooltip text. This is intended to reduce the clutter in the chat log when many saves are performed.

## 0.8.32 
* updated es.json
* Added special duration "isMoved" - the effect will expire if the token is moved. Requires DAE 0.8.31
* Fix for player sees invisible tokens warning - which caused lots of warnings about socketlib/libwrapper.
* Fix for DamagaeOnlywokrflows without a passed item causing errors.

## 0.8.31
* Fix for not using token/actor names in skill checks/ability saves/ability check rolls.
* Put back test for only one concentration automation solution, cub or midi.
* Make "Use Token Names" work for linked tokens work again.
* Fix for damage multipliers in damage card not working.
* Added flags.midi-qol.optional.NAME.skill to allow  pre-roll bonus checks to affect skill rolls. 
* Stopped bonus checks from firing when there are no available charges for a bonus (e.g. lucky with recharge).
* Support for adv/dis/fast forward of skill/ability checks & saves when auto-fastforward disabled.

Known issues: An attack that removes concentration that also should marks the target as wounded creates a race condition with CUB - either the adding wounded or concentration removal may fail to apply properly, seems to affect unlinked tokens.

## 0.8.30
* Fix for failing to apply concentration to non-linked tokens.
* Slight tweak for application of self effects interacting with CUB.
* Fix for reaction checks causing an error when no GM is connected.
* Fix for DamageOnly workflow throwing an error on item card creation.
* Added support for special duration 1Hit.mwak/rwak/msak/rsak to expire when a hit with a particular type of attack is made. Useful for some of the various paladin smites.
* Added targetUuids, hitTargetUuids, saveUuids, superSaverUuids and failedSaveUUids to the args[0] argument to onUse/DamageMacro macro calls.
* Ability bonus effects (bardic inspiration etc) can now specify an effect of success which means the roll will bet set to 99 - useful for effects that turn a failure into a save.
* flags.midi-qol.optional.NAME.count now support @fields, so you can consume a resource, like legendary resistance (@resources.legres.value). Sample legendary resistance included.
* Added a different Lucky feature "Luck (Recharge)" which consumes resource points (tertiary in the sample). Resource details are updated by the active effect so luck recharges on a long rest. Just drag the Lucky (Recharge) item to the character and Luck should just work, recharging on a long rest.
* Added Sample Branding Smite (requires DamageBonus/onUse macros enabled plus Active Token Lighting for the dim light effect), that implements the damage bonus, removes invisibility and adds Dim Light to the target when hit and expires after a successful hit.
* Added sample dragon slayer long sword which does bonus damage against dragons and knows about critical hits (assumes double dice for the critical hit).
* Added sample sword of wounding which applies damage each round until the target saves.
* Added sample devil's glaive that causes infernal wounds which bleed each round in combat and count how many applications.

* Conditional visibility is definitely still causing midi/dae problems, both as an active effect and in general use, so be warned.

## 0.8.29
* Fix for saving throw button disabled on chat card.
* Shift socketlib initialisation into setup rather than init.
* Significant reworking of chat message handling to fix double item card rolls with magic items. All seems to be working (merge card/non-merge card, damage only workflow, better rolls and magic items all seem to roll correctly), but this change affects lots of workflow processing so please don't upgrade 5 minutes before gametime.
* Put back support for concentration token hud toggle if CUB active.
* Added option for critical hits to only do normal damage.
* Updated ko.json thanks @drdwing

## 0.8.28
Forgot to push changes to concentration check item. Updated.

## 0.8.27
* 1st stage refactor of better rolls processing, should reduce some odd race conditions (but not all).
* Slight rejig of concentration handling.
* Some timing fixes for reaction rolls.
* Fix for checking reactions on wokrflows without an attack roll - i.e. DamageOnlyWorkflows.

## 0.8.26
* Maybe fix for not picking the correct d20 roll when rolled with advantage on reaction processing.

## 0.8.25
* Added dice formula and roll as tooltips for saving throws on the save chat card. Only displayed for GM.
* Added new flags.midi-qol.uncanny-dodge which halves damage applied if set.

* First cut release for reaction automation. [EXPERIMENTAL]
  - Requires dae 0.8.24 for 1Reaction special duration. 
  - Works with better rolls, but you always know the attack roll since it is sent to chat before midi can intervene.

 You actually don't have to do much for this to work.
1. Configure reactions settings from the config panel for GM/Players
2. Set a timeout for the reactions check to timeout, 0 = 30 seconds.
3. Choose how much of the attack roll to show to the one being attacked

In this first release reactions are ONLY checked when a target is hit, but before the attack roll is displayed (better rolls always displays the attack roll). The code searches the target's items for those with an activation of "reaction" and displays a dialog allowing you to choose one to use which is then rolled.

For example:
* Hellish Rebuke the player doing the attack, target whoever hit the player and choose Hellsih Rebuke from the dialog. (TODO auto target the attacker)
* Shield spell and your AC will be updated BEFORE the to hit check is finalised. So a hit can be turned into a miss.
* Reactions that only apply for the duration of the attack, require a little bit of setup (for example uncanny dodge included in the sample items compendium). Reactions are active effects with the special duration of "1 reaction". 
* Such effects expire at the end of the roll that triggered the reaction. You set these up like any other effect, making sure the item target is self, create the effects you want and give them the special duration (make sure they are NOT transfer effects).

Notes: If you are not using reaction automation, but players manually roll reactions before the attack roll is complete (i.e. you manually roll damage after they do their reaction) effects with a duration of 1 reaction will be removed after the damage roll is completed.

## 0.8.24
Fix release for duplicate attack roll cards being shown.

## 0.8.23
* Modified Add Chat Damage Buttons setting to allow none/GM/Players/All rather than just on or off. You will need to set this setting after upgrade.
* Fix for isAttacked special expiry.
* Fix for forcing better rolls to roll attacks twice.
* Added a half-baked emboldening bond feature in the sample items compendium (that only works in combat).
* Fix for rolls not displaying if roll automation is turned off.

## 0.8.22
* Fix for concentration effect origin not being set.
* Remove outdated spiritual weapon from compendium - use the one from DAE SRD

## 0.8.21
* Fix for applying active effects via manual effect button.
* Added option for auto targeting to ignore targets with 0 or less HP (i.e. defeated).
* Fixed  hunter's mark (again).
* Fir async LMRTFY _makeRoll patching.
* I needed GM inspiration in my game so created an Item (GM Inspiration) that the GM can drop onto an actors character sheet. When the item is used it grants advantage on the next roll and removes the item from the actors inventory. (Does work with better rolls)
* First cut solution for Bardic Inspiration and others, such as Lucky,

* **Experimental** bonus effects applied after the roll but before the roll is applied. This release includes a framework for creating such effects and includes example Bardic Inspiration and Lucky feats.
  - A dialog is displayed after the attack/save/check roll is made, but before it is applied, allowing the player to decide to apply a bonus or not. (click on the button to apply, click close or press esc/enter to continue).
  - Multiple effects are supported and each will have a button displayed for the player to choose, when all uses of the bonus are exhausted the button is removed.
  - The value of the bonus is either a roll expression (1d4, @abilities.cha.mod, 10) or the word reroll, which will reroll the entire roll (for the lucky feat).

* Bonus effects can be created by giving the actor an active effect with the following flags (Name is just for grouping name and does not matter)
  - flags.midi-qol.optional.Name.attack - the bonus is added after the attack roll
  - flags.midi-qol.optional.Name.save - the bonus is added after the save roll. Requires auto fast forward 
  - flags.midi-qol.optional.Name.check - the bonus is added after the ability check roll
  - flags.midi-qol.optional.Name.label - label to use in the dialog
  - flags.midi-qol.optional.Name.count - how many uses the effect has (think lucky which has 3), if absent the bonus will be single use (bardic inspiration)

This should be regarded as experimental since there are certain to be changes over time.
Known Issues:
* Does not work with better rolls - yet. Not sure if it's possible but will investigate.
* The dice roll does not display the initial dice roll with dice so nice, so with dice so nice only the last bonus roll will be displayed. Will be fixed in a later release.
* Pending a change to LMRTFY, unlinked tokens only apply optional effects if they are present on the base actor. Monks token bar and auto rolls take the bonus into account for unlinked tokens.

* Sample Bardic Inspiration and Lucky feats are included in the "MidiQOL Sample Items" compendium included with the module.
* How to use "Bardic Inspiration"
  - Add the "Bardic Inspiration" feature to the bard, and set the number of charges per long rest according to the Bard's level.
  - Inspire someone by targeting the recipient of inspiration and rolling the Bardic Inspiration feature, which will add the Inspiration effect to the target.
  - When Inspiration is present the recipient will be prompted with a dialog to add the bardic inspiration roll on attack/save/check rolls. 
  - The inspiration dice correctly reflect the bards level when applying the effect. A little  fancy footwork was required to get that to work - see the Bardic Inspiration Dice passive effect for how to do that. You need dae for this to work.
  - If you don't use dae then use Bardic Inspirtion (No DAE) and modify the dice settings yourself.
  - Once used, the Inspiration effect is removed from the target character and no more prompts are shown.
  
  * How to use Lucky. 
  - Currently you muse "use" the feature at the start of the day - a later release will fix this to reapply after a long rest.
  - Using Lucky gives you 3 options to re-roll an attack/saving/ability check roll before the roll is applied.

Possible Issues:
* To ensure that the right player gets the optional bonus dialog, saving throws/ability checks have been "massaged" to run on the right client, rather than sometimes having the GM just do the roll (auto roll saves). I have seen no issues with this but there might be edge cases.

## 0.8.20
* Fix for accidentally breaking better rolls

## 0.8.19
* Fix for rolling magic item spells when not auto rolling attack/damage.
* Added import/export midi-qol settings.
* Fixed really hide private rolls and GM sees all hidden rolls.
* If GM sees all hidden rolls is enabled the "privately rolled some dice" message will have it's contents displayed to the GM. Really hid private/hidden rolls will disable the "privately rolled some dice" messages from being shown

**As of version 0.8.19** you can export your midi-qol settings to a json file. When posting a midi-qol bug report please export your settings and add the json file to the report.

## 0.8.18
* Fix for typo in 0.8.17

## 0.8,17
* Fix for itemData passed via macro calls.

## 0.8.16
* Support both flags.midi-qol.fail.spell.vocal and flags.midi-qol.fail.spell.verbal
* Fix for better rolls and critical damage.

## 0.8.15
* Fix for Hunter's Nark/onUseMacro
* Fix for edge case on OnUseMacro

## 0.8.14 
* Fix for displaying hits when attacking, not using merge cards, and only showing gm the results which would generate a player does not have permission to create chat message.
* Fix for DamageOnlyWorkflow passed itemData with active effects in place.

## 0.8.13
* Fix for concentration with cub installed not setting duration correctly.
* Fix for incorrect data passed to OnUse/DamageBonus macros for saves, failed saves, hits - which broke a couple of sample items.

## 0.8.12
* Fix for concentration throwing an error.
* Fix for tool rolls not rolling.
* Small change to concentration application, so that caster is included in concentration targets
* fix for hunter's mark MQ0.8.12 so that effect does not immediately expire.
* Little tidy up to reverse damage card tooltips for damage resistance.


## 0.8.11
* Fix for players receiving "User does not have permission to create chat message" when not using the merge card. There is a small overhead when using the non-merge card or showing non-pc rolls.
* Yet another fix for damage rolls with lots of pluses and minuses in them confusing midi-qol.
* Fix for supplied Hunter's Mark which relied on a non-existent macro. If you use hunter's mark please use this one.
* Fix for preAttackRoll not respecting the return status of the hook.

## 0.8.10
* Fix for replaceAll errors when starting up with an old chatlog

## 0.8.9
* Some internal cleanup of damage application card
* Some more changes for rolling actors that have no token on the canvas.
* Reinstate support for (ceil(expr))d6 damage rolls. (Sneak attack via dnd beyond import).
* Ranged attacks against self are always normal, never out of range.
* Fix for monks token bar saves by non-gm clients.
* Updated compendium with Hunter's mark/Divine smite/Rage - names have MQ0.8.9 appended to distinguish them. You are free to call them whatever you want.


## 0.8.8
* Improved behaviour when trying to roll a character that has no token on the canvas.
* Fixed a bug in ignoring self in area templates.

## 0.8.7
* Fix a typo/bug in show Gm all whispered messages.
* Fix a bug not allowing you to set the default save modifier.
* Changed Requires Targets to accept never (never require targets), "in combat" (only required if in combat), "always" (you must always have a target select when rolling something that requires targets).

## 0.8.6
* Fix for a bug in damage handling that means midi would fail to calculate damage (either returning NaN or throwing an error) when there were any extra damage items in the damage roll, like bonuses and so on. (There might still be error cases).

## 0.8.5
* Fix for player lacks permission to update sounds error when using custom
* Cleaned up critical hit handling.
* Fix for player no longer has item message for damage buttons.
* Fix for Divine Smite item to reflect the new typed "creature type".
* Added auto complete for flags.midi-qol.advantage.attack.str/etc


## 0.8.4
* Fix for DF Manual Rolls - no longer request roll to be entered twice. Requires critical damage to be dnd5e default (fix pending for critical damage).
* Fix for token tooltip showing damage resistance/immunity/vulnerabilty not being dislayed on damage card.
* [BRAKING] Setting saving throw roll time out to 0 means that the system will NEVER auto roll the save for the player. If saves are not rolled (either auto or by request) they will never be resolved. This will help in the some cases where players incorrectly place templates.
* Added support for Monks Token Bar saving throws. Can be for players or NPCs. There is no timeout supported for this. The GM can always click on the roll if they get tired of waiting. Monk's token bar rolls do not support setting of advantage by midi-qol.
* Fix for DamageOnlyWorkflow error when initialising with no item.

## 0.8.3
* 0.8.5 compatible and becomes the main branch for midi-qol.
* Fix for error when displaying player character avatar image in damage card.
* Added two hooks, midi-qol.preAttackRoll and midi-qol.preDamageRoll, which are called just before the call to item.rollAttack and item.rollDamage. They are passed the item and the workflow, both as "live" objects so changes will affect the roll that is about to be done. return true for the roll to continue and false for the toll to be aborted. 
* Compatability with BetterRolls 1.1.14-beta seems to work, but only limited testing.
* Players control invisible tokens seems to be working. The player vision set is the union of all their owned tokens and they can see invisible tokens they own.
* Update lmrtfy patch so that the current version works with midi-qol.
* Fix for calling item macros where the macro name includes "." characters.
* Verified midi works with advanced-macros (instead of/as well as furnace).
* Alternate concentration system which works even if CUB is not installed. Midi will still use cub conditions if available.

## 0.8.2
Auto targeting now shows targeted tokens while previewing the template (i.e. before final placement).
updated for 0.8.4 compatibility.
auto-fastforward on tool rolls.

## 0.8.1
* Needs to be sideloaded from:  
 https://gitlab.com/tposney/midi-qol/raw/08x/package/module.json  
* Cleaned up the deprecation warnings
* Updated Hunter's mark spell showing some of the way things can/should be done now.
Until Itemacro is updated for 0.8.x the OnUse macro needs to call a global macro. Here is the macro text for the script macro Hunter's Mark
```
// Sample Hunters mark onUse macro
console.error(args[0])
if (args[0].hitTargets.length === 0) return;
if (args[0].tag === "OnUse") {
    // Sample Hunters mark
    let targetUuid = args[0].hitTargets[0].uuid;
    let actor = await MidiQOL.MQfromActorUuid(args[0].actorUuid); // actor who cast the spell
    if (!actor || !targetUuid) {
      console.error("Hunter's Mark: no token/target selected");
      return;
    }
    
    // create an active effect, 
    //  one change showing the hunter's mark icon on the caster
    //  the second setting the flag for the macro to be called when damaging an opponent
    const effectData = {
      changes: [
        {key: "flags.midi-qol.huntersMark", mode: 5, value: targetUuid, priority: 20}, // who is marked
        // {key: "flags.dnd5e.DamageBonusMacro", mode: 0, value: `ItemMacro.${args[0].item.name}`, priority: 20} // macro to apply the damage
        {key: "flags.dnd5e.DamageBonusMacro", mode: 0, value: `${args[0].item.name}`, priority: 20} // macro to apply the damage
      ],

      origin: args[0].itemUuid, //flag the effect as associated to the spell being cast
      disabled: false,
      duration: args[0].item.effects.contents[0].data.duration,
      icon: args[0].item.img,
      label: args[0].item.name
    }
    Hooks.once("midi-qol.RollComplete", workflow => {
      let cd = getProperty(actor.data, "flags.midi-qol.concentration-data");
      let targets = duplicate(cd.targets || [])
      targets.push({"actorUuid": args[0].actorUuid, "tokenUuid": args[0].tokenUuid});
      actor.setFlag("midi-qol", "concentration-data.targets", targets);
    });
    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
} else if (args[0].tag === "DamageBonus") {
    // only weapon attacks
    if (!["mwak","rwak"].includes(args[0].item.data.actionType)) return {};
    let targetUuid = args[0].hitTargets[0].uuid;
    // only on the marked target
    if (targetUuid !== getProperty(args[0].actor.flags, "midi-qol.huntersMark")) return {};
    let damageType = args[0].item.data.damage.parts[0][1];
    const diceMult = args[0].isCritical ? 2: 1;
    return {damageRoll: `${diceMult}d6[${damageType}]`, flavor: "Hunters Mark Damage"}
}
```

Issues:
* multilevel tokens not 0.8.3 compatible so no testing of mirrored actor targeting.
* CUB not 0.8.3 compatible so no testing of CUB
* Conditional visibility not 0.8.x compatible so no testing.
* Better Rolls not tested.
* Added temporary patch for LMRTFY problem in 0.8.x - works with patch.


## 0.8.0
First implementation for 0.8.3 and dnd 1.3.0 both required.
* [BREAKING] token.uuid and actor.uuid are used almost everywhere and passed to macros.
* New function MidiQOL.MQfromActorUuid(tokenUuid | actorUuid) which returns the actor for the specified Uuid (actor or token). Works across scenes and returns the synthetic actor if required.
* Attacks/Damage and active effect application work even if the GM is not on the same scene as the player.
* [BREAKING] OnUse/Damage bonus macros receive TokenDocuments, rather than token.data, which means you can fetch the Uuid.
* ~~Updated Hunter's mark spell showing some of the way things can/should be done now.~~

* Updated range targeting to support walls block option.

## 0.3.102
* Updated ja.json - thanks @Brother Sharp

## 0.3.101
* Fix for super savers and cantrips.
* Implement height difference as optional rule in distance calculations. Does not work for AoE templates.
* Rakish Audacity add cha modifier to initiative rolls as an active effect.
* Fix for fr.json having the wrong text for "no damage on save" which meant lots of spells could end up being no damage on save spells erroneously.
* Fix for critical flag processing.
* Added @lookups for flags.midi-qol.DR (i.e. @prof etc)
* Added support for attacks against multi-level tokens whose source token is on another scene. Only damage works, no effects application. If the original token is also present on the scene the attack will fail. Also CUB breaks when applying statuses to multi-level
* Fix override of item.damageRoll snaffling the options parameter.

## 0.3.100
* Fix for data.traits.dr.all double counting resistance to spells.
* Added flags.midi-qol.DR.non-physical damage reduction, for damage which is not bludgeoning, slashing or piercing.
* [BREAKING] added dependency on socketlib
* fix for damage card not displaying webm icons.
* Updated DamageOnlyWorkflow to support damage types in the roll passed, i.e.  
```
2d10[radiant] + 1d10[fire]  
```
will pick up the correct damage types. Any terms that have no damage attached will be treated as the default damage type.
* Check nearby foe setting now accepts a distance in scene units, rather than a check box. Intended for those playing metric unit worlds. Defaults to 5 units if previously enabled. 0 disables.
* Updated rakish audacity in compendium to align with a midi-qol change. 
* Added option to use character portrait in chat log messages instead of token image. Applies to actors of type "character" only.

## 0.3.99
* [BREAKING] requires DAE 0.2.61
* Fix for temp healing adding to temphp instead of being max of current and new.
* Fix for non-merge card display of item damage/healing roll.
* New setting, if set, requires the magical property of a weapon to be set for damage to be considered magical even if the weapon has a bonus to hit.
* New Setting, remove concentration on failed save when concentration automation enabled. When taking damage and failing a save concentration will be removed, if unset the save is still rolled and reported, but concentration will not be automatically removed.
* [BREAKING] Changed MidiQOL.configSettings to a function that returns the current settings, i.e. MidiQOL.configSettings(). 
* Fix for sw5e power scaling.
* Fix for critical damage modification when there are additional critical damage dice.

## 0.3.98
* Fix a TrapWorkflow bug that would loop if there was a save with no damage.
* Fix untargetAll at end of turn to untarget at the end of the turn instead of the start of your turn.
* Fix for speed keys in skill rolls when flags.midi-qol set for some skill.
* Moved the check for expired special duration effects (isAttacked/isDamaged) to before dynamic effects are applied. This should stop effects applied via an attack and expiring when attacked from expiring immediately on application.

## 0.3.97
* Fix for LMRTFY and advantage for player rolls.
* If LMRTFY + query is set and auto fast forward ability rolls is set the LMRTFY adv/dis dialog will not bSe displayed, but accelerator keys will be processed.
* Fix edge case for saves card not being displayed to GM.
* Updated es.json - thanks @WallaceMcGregor
* Updated ja.json - thanks @Brother Sharp
* Tidied Changelog - thanks José Joaquín Bocanegra

## 0.3.96
* Fix for ammo consumption on drag/drop targeting.
* Fix for temphp ONLY spells not applying temphp healing.
* Support for DR + DV to the same damage type. Damage immunity takes precedence over the others.
* Fix for flags.midi-qol.fail.critical.all/flags.midi-qol.fail.critical.mwak/rwak.... auto complete text
* Fix for ranged AoE not working with type creature when require targets is set.

## 0.3.95
* Fix for rollstats causing player does not have permission to update setting error. Thanks @KephalosThoth
* Show saving throw DC to GM even if display DC is disabled.

## 0.3.94
* Fix for accelerator keys not working with better rolls and midi-qol.
* Fix for LMRTFY and speed rolls.
* Fix for sw5e powers/scaling.
* Updates to it.json and support upper case in special text strings.
* Fix for super savers not taking 1/2 damage on failed save.
* Fix for flags.midi-qol.fail.spell.verbal [BREAKING] this is a change from flags.midi-qol.fail.spell.vocal
* Fix for re-rolling damage being whispered.
* FIx for items that do healing AND temphealing at the same time.
* Removed support for modifying critical damage if workflow automation not enabled.
* Fix for custom damage types not being displayed on damage rolls.
* Updated ja.json - thanks @Brother Sharp

## 0.3.93
* Added check for concentration when using a non-spell that requires concentration.
* Fix for better rolls saving throws not being processed as saves.
* Added additional d20 mode to ONLY show the d20 attack roll, all other roll details are hidden. Only works with merge card enabled.

## 0.3.92
* Support for concentration for non-spells. Put "Concentration" in the activation conditions field and using the item will cause concentration to be added to the caster and any active effects applied by the item will be linked to concentration.  

## 0.3.91
* Fix for onUseMacros being called twice.
* Export of showItemCard and showItemInfo methods for macro writers.

## 0.3.90
* Fix for special durations not working

## 0.3.89
* New optional rule to only choose the best Damage Reduction instead of adding all damage reductions together when applying damage.
* Optional rules work with better rolls. There is a "problem" that if a rule blocks a roll you will get a libWrapper warning. This has no impact on the result, but can be annoying.
* Expanded special durations  to includes skill checks and ability tests. All of these trigger when the roll is made, whether you are attacked or not. Save Success and Save Failure only trigger is you are attacked and need to make a save as a consequence of that.
* Fix for isAttacked special duration not triggering on missed attacks.
* Call midi-qol.DamageRollComplete as soon as the damage roll has been done, rather than waiting for saves.
* Added option for onUseMacros to return {haltEffectsApplication: true} to prevent active effects being applied.
* Added templateId to arguments passed to onUse/DamageBonus macros in case they want to do something with it.
* updated ja.json - thanks @Brother Sharp

## 0.3.88
Fixed a bug that failed to roll an item if you are not displaying the chat card, not using the merge card but were attempting to fast forward rolls.  

## 0.3.87
Fix for failing 0 targets when creature target specified and require targets not set.  
Added DamageDealt special duration, expires when the actor does damage.  
Fix for midi & better rolls 1.4.0 not displaying critical hits correctly, damage dealt was correct.  
Fix for mid & better rolls 1.4.0 not displaying saving throw results on merge card.  

## 0.3.86
support for better rolls 1.4. If you are using better rolls and have updated to 1.4 you need to upgrade midi-qol  

## 0.3.85  
updated en.json  

## 0.3.84  
* Fix for error in tidy sheet version checking.  
* Fix for tempHp and spell scaling

## 0.3.83
* updated sneak attack item
* Fix for ability saves/checks/skill use advantage settings.
* Updated midi-qol to use libWrapper shim. Using libWrapper is strongly recommended and is the configuration that is tested.
* fix for gm sees all messages bug.
* Fix for passing an event to item.roll() being ignored.
* Fix for for hits display being always shown when not using the merge card.
* Removed the special case better rolls flag. Item Cards and magic items will both work with midi + better rolls with no special flags after better rolls 1.4. Until then magic items will just roll to the chat.

[BREAKING] Saving throw multipliers has been reviewed and **some changes were made**.
* TL;DR if you don't know about save multipliers, just ignore this section, the default works like it used to and is pretty much what you'd expect.
  * There is a new config setting, default save multipler (defaults to 0.5). If there are no special overrides then a saving throw will do damage * defaultSaveMultiplier damage. When set to 0.5 saving will do 1/2 damage, like most cases for dnd.
  * There are a number of ways to overide the default multiplier.
  * If the item description includes the text "no damage on save" (or the localised equivalent) then a save will do no damage.
  * If the setting "search spell description" is set, items with the text "half as much damage" (or the localised equivalent) will do 1/2 damage on a save ignoring the defalt multiplier. If the text is not found the save will use the defaultSaveMultiplier.
  * For weapons (only) there are weapon properties for 1/2, full or no damage saves. These properties override any other settings. If not present the save multiplier will be worked out as above. 
  * For weapons (only) the save multiplier appplies to the whole damage roll **UNLESS**...
    * You have enabled "Roll other damage on mwak/rwak" (which is intended specifically to support attacks that have base damage + extra damage with a save). If the weapon has a save specified **AND** the weapon has an Other Damage formula, the saving throw multiplier applies to the Other damage and the base damage is applied as full damage.
    * Because of the way the SRD monsters have been setup, (i.e. extra damage as versatile damage and the the versatile property not set) the versatile formula will be treated as Other Damage if there is no Other Damage formula and the weapon property "versatile" is not set. 
    * For BetterRolls you have to enter the damage into the Other field and enable roll Other in the better rolls settings. Midi will pick up this damage and apply the saving throw result against it.
    
If you are just using standard items you can just leave things at the default and most saves will do 1/2 damage as you'd expect, monsters (like a giant spider) will (if Roll Other Damage is enabled) do base weapon damage and have a save applied to the bonus damage.

For those who have a lot of weapons set up with a save and want the default damage on save to be full damage (which is what a previous version enabled when search spell description was enabled) just edit the items and set the save to full damage save (preferred) or set the default save multiplier to 1;


## 0.3.82 fix for saves not working if speed rolls not enabled.

## 0.3.81
* Clean up keyboard handling for saves/checks/skill rolls to align with the rest of the midi key settings. See the readme.md for more details.
* catch a couple of edge cases that were throwing some errors.
[removed] [BREAKING] If better rolls is enabled there is a new workflow option. Item roll starts workflow, which if enabled will allow MagicItems spells to work as normal, applying damage etc. BUT better rolls item buttons (standard roll etc) will not work as intended. If disabled better rolls item buttons will work as intended but MagicItems spells will not do any auto rolls but better rolls buttons will function as intended. You can't have both, default is disabled.
* [BREAKING] Removed preRollChecks setting. All features of that setting can be enabled from the optional rules settings page.
* [UNBREAKING] for AoE spells (measured template placed) default behaviour is that caster WILL be targeted. Only if the range units field is set to "Special" will the caster be ignored. This means items from the SRD will work as written.

## 0.3.80
[removed] [BREAKING] Measured templates now target the caster ONLY if range has type "any", othewise the csater won't be targeted by the AoE template.
* Added special durations for specific damage type, expires if the target takes damage of the specific type.  
* Added special duration isSave. Effect expires if the character makes a saving throw in response to an item usage against it. Also added ability type specific expiry on save.  
Not really sure how useful the ability/damage type expriry options but at least 1 person has asked for them both.  requires latest DAE to work.
* Added special durations save.success and save.failure.
* Added flags.midi-qol.advantage.concentration which gives advantage to concentration checks.
* Fix for other damage rolls with saves and dual concentration rolls always doing 1/2 damage on save.
* Fix for checking range of thrown weapons when rule disabled.
* Force set on Use Macro when concentration automation is enabled so that the checks will actually do something.
* Support for better rolls 5e 1.3.11. Quite a lot changed under the hood. midi-qol advantage/disadvantage flags and optional rules should work with better rolls now. If you don't update to this version of midi-qol then concentration automation fails with 1.3.11.


## 0.3.78/79 Better rolls compatibility fixes

## 0.3.77
* Tweak to nearby foes disadvantage check. If using a thrown weapon within 5ft of the target, assume that the weapon is not thrown.

## 0.3.76
* updated cn.json thanks Mitch Hwang
* Fixed a bug I could have sworn I already fixed in TrapWorkflow not getting the right token for spell casting purposes. Resulted in AOE spells not targeting the token that triggered the trap.
* Cleaned up better rolls button handling to avoid fetching the item/actor when rendering the chat card.
* Chat damage buttons retained the item in the chat card, this has been removed.
The combined effect of these seems to reduce memory growth a bit.
* Stopped advantage/disadvantage being "sticky" when rolling from the attack button on the chat card.
* Fix for saves display not being shown in non-merge cards when no player characters are doing a saving throw.  
* Fix for causing DND5E Helpers to display cover checks twice.
* Clean up attack/damage buttons when no longer active.
* Slight change to check range optional rule. Melee weapons with the "Thrown" property will check the range/longrange the same as for ranged attacks. They will also incur disadvantage if a foe is nearby, again as if a ranged attack. If you want a pure melee version, create a second item with melee and 5ft range and disable the thrown property.
* Added an additional optional parameter to TrapWorkflow templateLocation
```
  templateLocation: {x: number, y: number, direction: number, removeDelay: number};
```
As well as x,y position and direction you can now specify a delay in real time seconds (not game time seconds) after whih the template will be removed. Gives a nice effect for, say burning hands, which flashes the cone of fire then removes it removeDelay seconds later.
* Support for midi-qol advantage/disadvantage flags in BetterRolls **1.3.11** and later for attacks, ability saves and checks and skill checks.
* In response to popular demand (well 1 person at least) and because I like stats, I've added roll statistics to midi-qol. This is a first cut, so do not expect perfection. 
* To launch the stats display:
  * as GM you can choose show stats from the midi-qol misc settings configuration,
    * or create a macro with the following command, which will work for players and GMs
    ```
    MidiQOL.gameStats.showStats()
    ```
  * See the Readme.md for more details.
* Slight tweak to Sneak Attack. Added a feature "auto sneak attack" which causes the sneak attack feature to get rolled as soon as possible without showing a dialog. Requires you to load the updated sneak attack. If the auto sneak attack feature is removed, or the effect disabled, the dialog will show prompting to use sneak attack.


## 0.3.75
remove accidental debug left in.


## 0.3.74
* More work on range checking when casting. Range checks now occur before consuming a spell slot/rolling item card.
* Localisation Support for new text strings in damage card.


## 0.3.73
updated cn.json, thanks Mitch Hwang.
updated ja.json, thanks to Brother Sharp and @louge
* Fix for reapplying midi-qol calculated values - oops.
* change to chat damage buttons, hopefully more readable.

## 0.3.72 
* Fix for better rolls processing of criticals, was deciding critical when it shouldn't.
* Fix for disadvantage due to nearby foes on ranged attacks.
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
* A change to the damage chat card. Instead of a plethero of buttons a new streamlined display which shows the icon of the token that was damaged (which can be clicked on to highlight the token on the map), a summary fo the damage done, and a drop down list of buttons. Calc means the damage after applying immunities and the numeric multipliers refer to the base rolled damage. The tick applies the currently selected multiplier's damage and the undo always puts the character back to the HP before the attack.
So if the damage was 18 hit points and resistances reduced that to 9, the MQoL multiplier will apply 9 points, the 1X 18, the 2X 36 and the heal will heal the character of 18 points of damage.
* **Many thanks to @Engranado for providing this.**


## 0.3.71
* bugfix in sneak attack damage application.
* Cleaned up range check when attacking, returns disadvantage when above short range and shorter than long range.
* Added a handful of optional rules on a new options tab, mainly for automated advantage/disadvantage. Consider them experimental. And more will come.
  * If attacking token has an effect "hidden" or "invisible" it gets advantage
* Removed some duplicate checks for advantage/disadvantage - any oddities let me know.
* Added support for conditional damage/onUse Macros macros to be of the form ItemMacro.ItemName, the character's items will be searched for an item that matches the name and has an itemMacro defined on it.
* Added additional parameter (tag) to onUse and damageBonus macros args[0] data, which is "OnUse" when called via onUse macro fields and "DamageBonus" when called via damageBonusMacro.
* update ko.json, thanks @KLO


## 0.3.70
* Cleaned up display when re-rolling damage from an existing card. No longer displays old damage on the card while waiting for the roll.
* Provided support for having both bonus damage and rollOtherDamage for things like bite poison damage. If on the merge card both will appear as separate lines, otherwise separate cards.
* Fixed hit and save display ignoring show to gm/player settings for non-merged card rolls.
* Fixed Bonus damage macro rolling by removing dependency on other damage roll setting.
* Display all flavors returned from damageBonusMacro
* Fix for hits/saves display ignoring the workflow display setting if not using merged card.
* Fix for not fast forwarding skill rolls.
* Support for flags.midi-qol.maxDamage.all/flags.midi-qol.maxDamage.rwka/mwak/heal/spell.... which, for non-critical hits, means damage rolls for base damage roll wil be maximum, for actions of the specified type.
* Cleaned up 0.5/full/no damage saves for weapons. If rollOtherDamage is disabled, the item setting will apply to the base damage rolled. If rollOtherDamage is enabled, the base weapon damage will ALWAYS be full damage and the save modifier will apply to the otherDamageRoll damage.
* Put back token selection in saves display (same behaviour as hits/damage cards)

* Better Rolls support got some love.
  * Concentration is now fully supported (except that when casting a spell requiring concentration no prompt is given to the user, concentration is just removed).
  * Cleaned up damage parsing, should be solid now. Won't include "Other" damage in base rolls.
  * If you disable "auto apply item effects" a button will added to the better rolls chat card to allow you to apply the effects to TARGETED tokens. This means you can apply effects even if not using auto damage/saves.
  * Support rollOtherDamage for mwak/rwak and uses the Other field from the better rolls card.
  * Support for damageBonusMacro. Damage will appear as a separate card.
  * Critical hit, advantage and disadvantage are populated from the Better Rolls card so would more accurately represent the better rolls data.


## 0.3.69
Added advantage/disadvantage to data passed to onUse/Damage bonus macros.

## 0.3.68
* A small rearrangement of the onuse/damagebonus macro calling.
* export of midi-qol.getDistance(t1, t2, wallsBlock: boolean). Which will return the straight line distance between two tokens allowing for tokens larger than size 1.
* "Fix" for placing rectangular templates and auto targeting, now treats the origin of the template as the center of the template for checking blocking walls. Fixes and incompatibility with dnd5e helpers that replaces circle templates with equivalently size rectangular templates.

## 0.3.67
* Checking you have tokens targeted now checks the number of tokens targeted.A target type of creature will use the number specified in the spell details and defaults to unlimited if not specified.
* An addition to TrapWorkflow. Instead of taking {x: xpos, y: ypos}, it will now accept {x: xpos, y: ypos, direction: rotation_angle_degrees} for placed templates. Previously direction was hard coded to 0 degrees.
* search spell description is now a case insensitive check and handles "&" escaped utf-8 characters in the description.
* when rolling the attack/damage rolls again, on an existing workflow a new chat card is generated. This works well if you pop out the standard roll and use that to keep rolling damage for repeated damage spells. This also fixes the edge case of rolling a standard roll and having attack/damage keep updating the first card.
* onUse macro will now support a comma separated list of macros to call.
* Put back the special evaluation of (expr)dX for damage bonuses. It turns out this is important for critical damage rolls. 2d6 as a damage bonus will get doubled when rolling a critical hit, but (ceil(@class.rogue.level/2))d6 wont.

**For macro/item creators**
* An additional macro call (similar to onUse macro and enabled via the same setting),which is called during the workflow damage calculation. On a successful attack, when midi-qol is calculating damage, midi calls all macros specified in flags.dnd5e.DamageBonusMacro (comma separated list) passing the same information as is passed to onUseMacro, which can be set via active effects or editing the special traits page. Requires furnace advanced macros to pass arguments.
* midi-qol will capture the return value (**not possible for execute as GM macros**) and examine the return data (for example) {damageRoll: "1d4[piercing], flavor: "a string"}.
  * The damageRoll fields for each macro called will be concatenated tor form a single roll expression, which is evaluated in the context of the actor doing the attack, and used to populate the otherDamage field which is included in the final damage application. You should specify the damage type so that midi can work out what sort of damage is being added, if no type is specified it will default to the damage type of the first damage roll in the item definition.
  * The macro does not have to return a damage bonus and can do anything you want, it is simply called each time you are about to do damage.
  * This is compatible with better rolls, but the damage display is (currently) a separate card.
* Adding damage this way is expensive since it requires a macro compilation and execution each time you do damage. If you can add the damage via bonuses.mwak.damage you should do so.
* Why? If you are using automation, effects like hunter's mark which require conditional bonuses to be applied in the event you are hitting the marked target can't be handled well. If you are not automating, you just need to remember to add 1d6, but when the roll is being auto calculated/applied you don't get the option. So either you need to always prompt for a bonus (and hope you remember) or the bonus damage needs to be calculated for you.
* Most information about the attack/damage rolled so far is available, so you can customise critical damage beyond the extra dice allowed in the bonus critical dice field.

* Here is a sample hunter's mark onUse and damageBonus macro: (If you are not familiar with args[0].value, please see the readme).  The onUse part sets up the active effects required and the damageBOnus part calculates the additonial damage.

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

## 0.3.66
Put back config option to roll Other/Versatile damage on failed save for rwak/mwak.

## 0.3.65
update ja.json thanks @louge
Fix for TrapWorkflow targets not being set

## 0.3.64
* Added flags.midi-qol.superSaver.all/dex/str etc. If set, then saves against the specified ability do 0/0.5 damage instead of 0.5/1 times the damage. Meant for things like rogues evasion. Apply with an active effect and it will apply, failed save+effect = 1/2 damage, save+effect = 0 damage.
* Fixed a bug in concentration check that 0 damage Other/Versatile damage caused a second concentration check.
* Allowed GM to decide if spider bite, (piercing damage + save against poison damage) causes 1 or 2 concentration checks.
* Token being reduced to 0 automatically removes concentration. At the moment the saving throw is still rolled, but I will find a way to avoid that.
* Fix for flags.midi-qol.fail.skill.acr/... not working.
* [For macro writers] Damage only workflows will no longer trigger CUB concentrator if rolling an item as part of the workflow (niche I know, but annoying).
* Re-organised the config settings into a different disorganised layout.
Please update DAE as well.


## 0.3.63
* A couple of fixes for sw5e.
* Updated ja.json thanks @louge
* A new option for hiding DM attack rolls (only works with the merged card). "Show Attack D20", players will only see the d20 result, not the roll total, so they get a feel of how good the monster is. This simulates what the players could see at the table (i.e. see the dice roll) but not know what the total is. Otherwise this option behaves the same as Hide Rol Fomula.
* DamageOnlywokrflow will now display all of the targets as normal hit targets so you can see who took damage.
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

* Some more detail on concentration automation:
  * Caveats:
  * CUB concentration automation is NOT comaptible with midi-qol concentration automation. Midi-checks the settings and will disable CUB concentrator if you accept.
  * Midi-qol REQUIRES that CUB be installed and the "Concentrating" condition be setup for midi-qol concentration automation to work. Midi shows a dialog if this is not the case. 
  * Midi will use the CUB concentrating condition when applying concentration (so you can add extra effects if you like, change the name/icon or whatever).
  * Midi-qol concentration automation will add an item to your world items, "Concnentration Check - Midi QOL". It is required for concentration automation and will be recreated as required each time you start the world if midi-qol concentration automation is enabled.
* DAE 0.2.43 is REQUIRED for this version, a notification will be shown and concentration and auto application of effects wont work if DAE not installed. So upgrade/install DAE if you use those features.
* A fairly recent version of CUB must also be installed and active.

* Features:
  * Enabled via config setting (near auto check saves)
  * If you cast a spell that requires concentration when you already have concentration, the caster is asked to confirm before casting the new spell and the previous concentration is removed.
  * If a token takes damage and doesn't save concentration is removed. The save will be rolled as a "Concentration Check" item and your settings for token saves will be used, i.e. auto roll/LMRTFY etc.
  * If the spell that caused concentration expires concentration is removed
  * Concentration can be removed from the token effects HUD and will work as expected gme.cub.removeCondition("Concnetrating", tokens) will also trigger the rest of concentration removal.
  * If concentration is removed any effects due to the spell on any tokens (self + targets) are removed.
  * If concentration is removed any measured templates associated with the spell are removed.
  * No changes are required to any spells/effects for this to work, it keys off the concentration attribute in the spell details.

* Note this is a first implementation and a) there will be bugs and b) it is quite slow and needs substanitial optimisation and c) there will be bugs.
* Better rolls support is limited (and possibly buggy). There is no query for existing concentration, existing concentration is simply removed.
* For the name replacement on midi hit/save cards I have implemented what I guess the functionality to be. But I have created the behaviour from scratch so might have missed something.


## 0.3.62
* Fix bug for over zealously removing damage buttons. 
* Fix for damage only workflow so that useOther defaults to true.
* Fix for BetterRolls self targeted spells not working.
* Fix for BetterRolls not checking isAttacked/isDamaged expiry

## 0.3.61
* Fix bug not displaying tool item details.
* Fix bug for over zealously removing damage buttons.
* Fix bug in applying damage on auto rolled other damage not including base damage in calculation.
* Fix for possible race condition when expiring specialDuration effects that could cause the effect to be deleted more than once, resulting in server deleted 0 ActiveEffects messages.
* Support for additional argument in the DamageOnlyWorkflow (userOther: boolean, defaults to true) to specify which slot to use on the item card, if it is passed. If true the damage from the roll will be placed immediately below the attack roll, otherwise it will be placed in the normal damage area.
* If CUB is installed and active midi-qol will use CUBs hostile name replacement for hit/save cards. A future release will remove the midi-setting entirely since there is no reason to use midi's hide name if not using CUB hide names.
* New option to DamageOnlyWorkflow, it you pass itemCardId: "new" together with itemData as itemData: itemData, a new chat card for the item will be created and the damage inserted into the chat card. (consider this experimental).
* Fix for rolling self targeted items when no token for the actor exists in the current scene.
* Fix for rolling items if no scene exists in the world.
* Fix for not displaying damage total when 0 damage was rolled.


## 0.3.60
* Now requires dnd5e/sw5e 1.2.3 or later.
* Fix for critical key not being detected for some damage rolls.
* Fix with perfect-vision to not infinite loop.
* Fix for healing damage bonus in other languages not working.
* Fix for Damage vs Healing displayed for healing action types on the item card button.
* Improved (?) behaviour on the 1attack/1hit/isDamaged/isAttacked expiries. There may be some missed edge cases.
* startNextTurn/endNextTurn expiry moved to times-up.
* Implement 5/5/5 distance calcs for ranged area targeting.


## 0.3.59
Fix for rwak/mwak and applying Other/versatile damage always rolling something even if no Other or versatile damage (it would roll the weapon damage again)

## 0.3.58
Fix for 0.3.57 release bug.
Fix for trap workflow not fastforwarding.

## 0.3.57
Fix for self targeted attack/action/hit durations. This required quite a few changes in the workflow so it's possible some cases are not covered so be warned.

## 0.3.56
* Extended the rwak/mwak + saving throw functionality. If the item has "Other" filled in, midi will roll that for the save damage, otherwise it will roll the versatile damage. This change means it should work out of the box with SRD monsters.
* Fix for damage buttons on the item card.

## 0.3.55 Bugfix release
* fix for LMRTFY override to fix libWrapper problem.
* fix for Other rolls sometimes not displaying saving throws.
* [BREAKING] Change to remove buttons settings to configure attack/damage buttons for GM/Player. You need to reset the settings.
* [BREAKING] If auto roll damage is none and no targets were hit or selected the workflow will complete (triggering effect expiry). If you want to have the damage buttons available enable it from the workflow (disable remove damage buttons on completion), you will still need to manually apply damage.
* Addition to onUseMacros arguments. Since it is quite possible to have race issues when calling a macro that applies damage to targets as part of an item attack, for onUseMacros args[0].damageList provides a snapshot of the damage/HP totals in the roll so far. In particular if creating a damageOnlyWorkflow you can pass the damageList to the constructor to have the workflow take those values into account. 
```
  new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "piercing", [target], damageRoll, {flavor: "Giant Slayer bonus damage", damageList: args[0].damageList});
```

* [BREAKINGish] DamageOnlyWorkflow damage results will appear in the space reserved for "Other" damage in the combo chat card. This means that you can have a weapon roll normal damage, and run a macro that does other damage and put that damage in the same combo card.
```
  new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "piercing", [target], damageRoll, {flavor: "Giant Slayer bonus damage", damageList: args[0].damageList, itemCardId: args[0].itemCardId});
```

## 0.3.54 Some big QOL changes in this release. Some significant changes under the hood, so DO NOT UPGRADE on game day.
* fix for advantage from flags.midi-qol.advantage.attack.str/dex on weapons with default ability settings.  Will now check finesse property if ability set to default.  
* Added an apply dynamic effects button which will apply effects to the targeted tokens when pressed.

* [BREAKING] New feature for action type rwak/mwak that have a saving throw. The "Other" formula will be rolled as additional damage. (This required some changes to the damage application logic so should be considered experimental as well)
  * Default is 1/2 damage on save, but you can set the noDamSave or FullDamSave flags to modify the behaviour.
  * The saving throw has no effect on base weapon damage, it always does full damage if the attack hits.
  * You can specify the Other formula as 3d6[poison] and the extra damage will be treated as poison damage for damage resistances/immunities/vulnerabilities.

* [BREAKINGish] Workflows remain active after completion. This means that you can reroll attacks/damage for an item. (This should be considered a little bit "experimental") Because workflows can be restarted there is now much better support for Popped out item cards. A workflow remains viable until another workflow with the same item is started, then it will fail.
  * Popped out item cards. If you pop out the chat card whatever buttons have not been removed remain active (see also setting to keep buttons). So if you pop out magic missile (before the damage is rolled) you can roll the damage multiple times and the damage is applied.  
  * The same applies for attacks and saves. If auto applying damage new damage cards will be created for each set of applied damage. 
  * If the item has an attack and you change targets between one roll and the next the new targets will be used. This does not yet work for damage only items (I need to think about it a bit more).
  * The initial item chat card is updated with new hits/damage. This can be a problem if the display scrolls too far beforeyou want to roll again.
  * New config settings to help with popped out messages, attack/damage buttons can remain active for both player and GM, and will restart the workflow from that point, so rolling the damage again will re-roll the damage and apply it to the targets.  

One obvious use case is that if you auto roll everything, adv-dis the roll to get a complete chat card, and then pop out the card and you can re-roll as often as you want.

* Fix to mark workflow settings as global so that DF Settings Clarity does not report workflow settings are per user.

* Support for "Spell Damage" resistance type (resistance/immunity/vulnerability). Any damage from an item of type "spell" will be checked against this resistance/immunity/vulnerability and if present will change the damage by a factor of 0.5/0/2. You can only get one such multiplier per category, so resistance to "Spell Damage" and Fire will result in a single 0.5 multiplier. The is useful for things like Aura of Warding.  
This is separate to the existing magic resistance support, which gives advantage on saving throws, which remains unchanged.

## 0.3.53
* Improve/Fix advantage/disadvantage on roll buttons when you have flags that set both advantage and disadvantage. Once you have something that sets advantage and disadvantage the roll will always be done as a normal roll.
* Fix for LMRTFY always rolling with advantage if you change the speed roll settings.
* Fix for LMRTFY to recognise adv/dis keys if you request a LMRTFY+Query roll.
* Improve critical damage display on buttons. The hit/miss card will display the raw result of the roll and the button will display the expected critical status after any flags are applied. So they may not be the same.
* If you want to override the critical button you need to bring up the dialog and choose critical/normal from the dialog, i.e. not fast forward roll.
* Small fix for onUseMacro to pass through critical key status in args[0].isCritical

## 0.3.52
Fix for versatile button MIA.

## 0.3.51
* Fix for error being thrown for items that do not have a damage roll.  
[BREAKING] If the action type for an item is blank (so that the damage rolls are not displayed when edited) then no damage button will be displayed/rolled.  
* Yet more advantage/disadvantage/critical changes/improvements (sorry, but hopefully this is the last one).  
Chat card buttons should correctly reflect the status for advantage/disadvantage/critical that midi-qol thinks when displaying the buttons (i.e. not auto rolling) and includes looking at various advantage/disadvantage/grants/critical flags.  

Fast forwarding has been cleaned up/changed.

When clicking from the character sheet/macro/token HUD, adv+dis will toggle the attack auto roll status, i.e. if the attack roll normally auto rolls the attack button will be displayed and vice versa.

The behaviour of ctrl+alt (or adv + disadv if using speed rolls) has been changed. It inverts the next attack/damage fast forward status. So if you auto fastforward attacks ctrl+alt will prompt for the advantage/disadvantage and vice versa. So you can set the workflow for what you do most of the time and use adv+disadv to reverse it.

The same applies for critical rolls and the use of ctrl-alt. In addition if your default critical key is alt then ctrl will be set non-critical for the damage.

Be aware that the critical display includes flags.midi-qol settings so the roll may not be a critical roll but the damage button can correctly display critical.

If you do not auto roll an attack or damage roll the fast forward status will be displayed in the attack/damage button (i.e. what clicking on the button will mean), (fast) means that the roll will fast forward.

I'm sure there will be some workflow that someone uses for whom the changes are utterly unbearable, so feel free to let me know (they work for me).


## 0.3.50
* Fix for damage buttons not being added for non-merge card damage cards.
* Fix some cases of errors being thrown when first loading and canvas not initialised.
* Fix for versatile damage button being displayed when not required.
* If not auto rolling attack rolls and using the merge card, display advantage/disadvantage in the attack button for the item card, as a hint for the roll (based on the various flags that can be set). It will not detect target specific flags however. If auto fast forwarding the roll will be made with the suggested setting, speed keys override the setting as does choosing from the roll dialog.
* Fix for incorrectly displaying advantage/disadvantage on chat card if user selects something else from the damage dialog.
* Fix for blind rolls being completely hidden forever.
* Fix for GM rollNPCSaves set to LMRTFY and player set to auto roll not causing roll to not be completed.

## 0.3.49
* Revamped DM roll flags (again), due to the various interactions that people had with the workflow settings. There are now 4 gm settings:
  * GM Auto Roll Attack: If true the attack roll will be auto rolled for the GM if set.
  * GM Auto fast forward attack rolls: If true the GM attack rolls will be auto fastforwarded. Key modifiers are supported.
  * GM Auto Roll Damage. Options are never, attack hits, always.
  * GM Auto Fast Forward damage: If true roll will be auto fast forwarded. Will pick up whether the attack was critical or not and will recognise critical and No critical keys if the roll was not auto rolled.

## 0.3.48
* More tinkering with dadamage critical rolls. If an attack is critical and damage rolls are auto fastforwarded it will use the critical status from the attack roll.
* If not auto rolling damage rolls and auto fast forwarding damage rolls pressing the disadvantage key (ctrl by default) will force the roll to be a normal roll.  
As always there are likely to be some workflow behaviours that I have not tested so ping me if there are any problems.
* [BREAKING] Split GMFullAuto into GM auto roll attack and GM auto roll damage. GMAutoRollDamage ignores other module settings and will auto roll damage for all GM damage rolls if true and will never auto roll if false. I have to thwart a particular behaviour in my world where players decide to use the shield spell based on how much damage the attack does, but still want their attacks to auto roll damage if they hit.
* Fix for potentially choosing wrong dice in advantage/disadvantage roll checks.
* [BREAKING] removal of the midi-qol created magical flag for weapons - it is now created by default in dnd5e 1.2.1. It appears the properties have the same id so it should move across seamlessly.
* release of dnd5e 1.2.1 fixed an issue when rolling critical damage via the standard damage dialog. The roll will correctly be rolled as critical if selected. This should fix the issue with modifying critical damage according to the midi-qol settings.
* Support for GM LMRTFY save option, which does a LMRTFY + query for NPC saves to the GM. This allows the GM to specify advantage/disadvantage if not auto fastforwarding saves. 

## 0.3.47
* Added it.json thanks @Simone [UTC +1]#6710   
* Fix for flags.midi-qol advantage and speed keys being selected.
* Set spellLevel in rollDamage() call correctly.
* support for tidysheet-5e new version config setting
* private rolls by GM no longer show the dice to the players.

## 0.3.46
* Removed Formula + DSN option from hide roll details. Hiding the roll formula will disable DSN dice on non-gm clients.
* Fix for not displaying hit details on non-combo cards  
First implementation of critical damage flags.  
* flags.midi-qol.critical.all  
* flags.midi-qol.critical.mwak/rwak/msak/rsak/...  
* flags.midi-qol.noCritical.all  
* flags.midi-qol.noCritical.mwak/rwak/msak/rsak/...
* flags.midi-qol.maxRoll.all  
* flags.midi-qol.maxRoll.mwak/rwak/msak/rsak/...
* flags.midi-qol.maxRoll.heal heal damage rolls are always maximised - think "Supreme Healing"

These force the damage roll from attacks by the actor that has the effect to be critical.  

The following grants/fail flags apply ONLY if it is the single target of the attack.
These flags force/disable critical hits when a single target has been hit.  
* flags.midi-qol.grants.critical.all  // All damage rolls are critical  
* flags.midi-qol.grants.critical.mwak/rwak/msak/rsak/other  
If there is a single target (which has the effect) and the attack hit, upgrade the attack to a critical attack. (Think unconscious)  
* flags.midi-qol.fail.critical.all  // no damage rolls are critical  
* flags.midi-qol.fail.critical.mwak/rwak/msak/rsak/other   
Cause attack on the target to not be critical. (Think adamantine armor)  


## 0.3.45  
DSN fix (I hope).  
Support for new tidysheet5e (0.4.0+)  

## 0.3.44  
Fix for some libwrapper incompatibilities.
Fix for multilevel tokens throwing an error


## 0.3.43  
* Fix for spell scaling not working if not auto rolling damage.  
* Fix for AOE magic items spells throwing an error.   
* Fix for ammo damage after libwrapper installed.
* Included merge request to refrain from deleting non-special duration effects at combat end. Thanks @DangerousrDan.  
The first 2 fixes required a change to how keyboard event processing is done. As far as I can tell there are no problems, but there are too many workflow variations for me to test them all, so a bug (or many) is possible.  
Don't update just before game time.

## 0.3.42  
fix for versatile shortcut being ignored.  

## 0.3.41  
fix for spell scaling not working  
fix for item roll errors when initially rolling - broken universe etc. (I hope)  

## 0.3.40  
* Fix for trapworkflow calling onUse macro twice.  
* Some more clean up of critical/advantage settings in workflows. Dont pass an event, use optins values  
* Fix for modifying critical damage on all workflow paths  
Fix for perfect vision incompatibility thanks to the module author for the fix.
Deprecation notice: The player controls invisible tokens setting will be removed in a subsequent release since the "conditional visibility" module does a much better job.  

## 0.3.39  
* updated ja.json thanks @touge  
* fix for auto fast forward ability rolls setting being ignored.  

## 0.3.38
* fix for sw5e and saving throws  
* Add flavor text in item card.  

## 0.3.37
* fix for breaking token-action-hud  

## 0.3.36
* added flags.midi-qol.advantage.deathSave, added flags.midi-qol.disadvantage.deathSave, and death saves also look at flags.midi-qol.(dis)advantage.all
* fix for LMRTFY and speed item roll mappings.
* fix for change from actor.useSpell changes and upscaling of spells.
* use new item.getSaveDC() for spell saves.
* added a new parameter to item.roll({createWorkflow: true}). If you se this to false when calling item.roll a workflow will not be initiated - useful if you have macros that do a complete roll and you don't want midi-qol to start automation for the item roll.


## 0.3.35
* fixed a bug with speed rolls/auto check saves that caused the attacking player to be prompted for the save type for NPCs.
* added support for configurable list of items that have item details displayed
* added current token's tokenId as argument to onUseMacro data.

[BREAKING] change to special expiry effects: (Requires DAE 0.2.27)
* removed from item duration (too cluttered)
* added as option field in Effect Duration panel. (You must use DAE effect editor). The special expiry conditions apply in addition to the normal duration.
* Added support for isAttacked and isDamaged expiry conditions.
Example: Guiding Bolt. Start wi th the SRD guiding bolt spell 
  * Bring up the DAE editor and add an effect.
  * On the duration tab, set the duration to be 1 round + 1 turn and the special expiry isAttacked.
  * On the effects tab add an effect
```
    flags.midi-qol.grants.advantage.attack.all override 1.
```
  * Now when you cast the spell at a target and hit, the effect will be applied that grants advantage on the next attack.


## 0.3.34
* Slight fix to self targets, should now work without targeting self
* added flags.midi-qol.advantage.attack.dex/str/wis etc. to give advantage on dex/str/wis etc. mwak/rwak
* added flags.midi-qol.disadvantage.attack.dex/str/wis etc. to give disadvantage on dex/str/wis etc. mwak/rwak
[BREAKING] "enable workflow automation" is now a client setting, rather than a world setting. This means that players can choose workflow enabled or not independently of the GM and must set it for their client. Default is workflow automation enabled.
* Fix for aborted attack/damage rolls advancing the workflow. Attack/damage buttons remain active until a roll is made (either auto or manual) or a new item roll for that item is started.
* Process damage flavor data for bonus damage (traits/situational bonus) when calculating damage types, so a bonus of 1d6[Fire] will be recognised as fire damage. If no damage flavor is specified ti will be treated as having a flavor euqal to the first damage type in the item spec.
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



## 0.3.33
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
These flags can be set by active effects and are evaluated after derived fields are calculated, so things like dex.mod etc. ar available.

* fix for templates and large tokens.
* fix for npcs requiring players to roll saves.
* Added Hooks.callAll("midi-qol.DamageRollComplete", workflow) after damage has been applied.
* updated de.json thanks @acd-jake


## 0.3.32
Add damage all/restore all buttons to damage card.
Highlight/select enabled for damage card as well as hits card.
Fix for trap workflow not fastforwarding damage rolls
Don't error if target token has no actor data.
Added a "No Damage" damage type for spells like sleep where the applied damage is always 0.
Fix for crit-key = shift causing all spells without an attack to roll crit damage
Process events passed to item.roll({event}), which got dropped by mistake

## 0.3.31

## 0.3.30
* Fix bug in critical damage roll handling of "max base damage".
* Improve, but not completely fix, case of odd number of dice in critical rolls and max crit damage. 
* Correctly pass critical key to feats/spells that do not have an attack roll.
* Fix for speed key setting and advantage/disadvantage flags not working together.
* Export MidiQOL.doCritModify(roll), which will adjust the roll according to the midi-qol critical damage settings. Useful for macro writers writing damage macros that want to deal with critical damage consistently with the midi-qol game settings.
* Call Hooks.callAll("midi-qol.AttackRollComplete",.... when the attack roll is complete for a workflow. This allows processing if the attack missed and/or damage is not rolled.


Example Divine smite onUse macro (assuming divine smite as a spell)
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
new MidiQOL.DamageOnlyWorkflow(actor, token, damageRoll.total, "radiant", target ? [target] : [], damageRoll, {flavor: "Divine Smite - Damage Roll (Radiant)", itemCardId: args[0].itemCardId})
```

## 0.3.29
Fix bug for trap workflow and better rolls workflow when no event passed to constructor.

## 0.3.28
* Fixed a bug in damage processing with negative modifiers (i.e. bonus/situational bonus) when applying damage. (negative mods turn positive)
* Fixed a bug in chat damage buttons (similar to above)
* Ensure that damage dealt can never be negative and end up incorrectly healing the target.

## 0.3.27
* Auto fail on ability check flows through to skill rolls for dependent skills.
* Fix for altKey undefined on skill checks and no speedRolls.
* Fix for saves prompting user for adv/disadv/normal when no speed rolls enabled.
* In the quest to provide ever more arcane key combination support, Capslock now acts as an auto fastforward for attack rolls (like adv+disadv). 
* First installment of:
  flags.midi-qol.fail.spell.all disable all spell casting for the character
  flags.midi-qol.fail.spell.vocal fail casting of spells with vocal components (intended for silenced characters0)
  flags.midi-qol.fail.spell.somatic - perhaps useful for restrained characters or some such.
  flags.midi-qol.fail.spell.material (Can't think when this might be used but added it for completeness)

## 0.3.26
Fix for consuming last of a consumable when not using automation.
Fix for rejecting spell cast when no target selected even if there is nothing to target.
Added speedAbilityRolls flag which applies your speed item rolls settings to ability rolls and skill rolls.
Added info button to inventory buttons - just shows item info.

## 0.3.25
* Ability check advantage/disadvantage now apply to skills based on the ability as well. (I'm told that's how it should be)
* added ability to give attack advantage/disadvantage on attacks (only works for midi-qol generated attacks - not better rolls)
 flags.midi-qol.grants.advantage.all  
 flags.midi-qol.grants.advantage.attack,all
 flags.midi-qol.grants.advantage.attack.mwak/rwak/msak/rsak
 and similarly for disadvantage.

## 0.3.24
* added flags.midi-qol.fail.skill..... support
* corrected behaviour so that having both advantage and disadvantage for a roll will cancel out to be a normal roll.
* updated ko.json thanks @KLO

## 0.3.23
* Support settings config permissions from user permissions, i.e. trusted players instead of only GM users.
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
  

## 0.3.22
* Added option for GM to auto fastforword rolls always, ignoring the rest of the module settings. Intended for GMs who want their players to hit the various roll buttons but skip for their rolls. 
* updated ko.json thans @KLO

## 0.3.21
* Fix for ignoring speed keys when not auto fast-forwarding rolls.

## 0.3.19/3.20
Fix for broken saving throws

## 0.3.18
* Added drag and drop targeting. If you drag a spell/weapon to a target token the token will be targeted and the attack rolled, as if you had targeted and rolled from the character sheet. Thanks to @grape
* Hopefully fix the chat log scroll problem?
* Really hide rolls no longer hides legitimate whisper messages.
* Added on use macro field to the item sheet, plus a setting on the workflow settings to enable it. If a macro name is present then after the roll is complete the macro is called with the following args, the macro is always called, whether you hit or miss or the target saved. Calling the macro does not create any active effects on the target, it is just rune. Use the targets/hitTargets/saves/failed saves to work out which tokens to use. :
                actor: the attacking actors data
                item: the attacking item data
                targets: an array of target actors' data
                hitTargets: an array of the hit targets' data
                saves: am array pf the saved targets data
                failedSaves: an array of the failed saves targets's data
                damageRoll: the damage roll if any
                attackRoll: the attack roll if any
                itemCardId: the id of the item card used to display the roll
                isCritical: critical hit?
                isFumble: fumble?
                spellLevel: the spell level if any
                damageTotal: the total damage applied
                damageDetail: an array of the damage detail, amount and type
This should make adding special weapon/spell effects actions much easier.

## 0.3.17

* Fix for merge cards and dice so nice immediately display card.
* See owned hidden tokens. When token is hidden does not emit light - this is on purpose and contrary to dnd5e spell. Give them a torch token if you want to.
* Some changes to support times-up

## 0.3.15/0.3.16 oops

## 0.3.14
* reinstate token vision for invisible tokens - EXPERIMENTAL.
* Some more error checking for "impossible" situations

## 0.3.13
Fix for a bad bug in application of DAE effects when dynamic effects not installed.

## 0.3.12
Yet another fix for speed mappings. Should finally squash the ctrlKey error and any saved data problems.

## 0.3.11
* Fix for broken key mapping editing and aligned control|Cmd since on some mac keyboards ctrl-click does not work, use CMD click instead.
* Fix for saving throws being displayed even if you asked them not to be.

## 0.3.10
Fix for bug with better rolls and ctl/alt etc. handling.
Include updated cn.json

## 0.3.9
* Rework of ctl/alt/shift keys:
If speed rolls are off, all of the ctl|cmd/alt/shift keys and roll behaviour behave the same as in core. There is one additional feature, if you click on a damage button in chat, CTRL+ALT click will use the critical/normal hit status from the midi-qol roll data.

If speed rolls are on you need to assign the keys yourself, however you can use the defaults.  
* advantage key modifier, defaults to ALT/Meta
* disadvantage key modifier, defaults to CTRL
* versatile key modifier, defaults to Shift.
* critical damage modifier, defaults to ALT/Meta.
* fast-forward key (turn any attack or damage roll into a fastforwarded one) advantage+disadvantage.  
If you assign a key multiple meanings the behaviour is going to be confusing at best.

* A hack for the trap workflow due to tokens not updating in a timely fashion. At least that is what I think the cause is.

* A fix for a bug where message.data.user was being incorrectly set.

* Fixes for Damage Only workflows: This is only relevant to people writing macros. There is a new pararmeter you can pass to your macro, @itemCardId, which refers to the item card that triggered the macro (i.e. weapon attack spell cast). If you pass that id to the DamageOnlyWorkflow constructor the damage will be inserted into the item card if you are using merged rolls.

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
* Support item.roll({versatile: boolean}) as an option for midi-qol to roll versatile attacks, useful for macro writers who want to trigger a midi-qol workflow.
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
2. Enable force hide rolls (new option) which also fixes the problem and lets you use the combo card with better rolls and still hide from nosy players.
* New setting "Force Hide Rolls", if set any hidden roll (blind/gm only/self) will not be displayed at all on clients that can't see the roll. The code for this is based (stolen) from the actually private rolls module by felix.mueller.86@web.de and all credit to him for solving this problem for me. I have included the code in midi-qol simply because it solves a particular problem that otherwise I could not fix.
* Chat Notifications from Moerill. This excellent module has a small incompatibility with midi-qol, namely private/gm/blind rolls appear in full in the notification window. Enable force hide rolls to fix this. There remains a problem with dice-so-nice, chat notifications and combo rolls. I'll look into this in future.
* If you are hiding roll details from the players and using dice-so-nice 3d dice a smart player can examine the dice rolled and deduce the aggregate pluses from the dice rolled compared to the dice total displayed. In 0.3.3 if roll details are to be hidden then the dice rolled on the players screen will be random meaning they cannot deduce the actual pluses from the 3d dice. This may confuse some players who see a d20 roll of 6 but it is reported as a critical. I'll take feedback on this feature to see if it is generally useful.
* Added getTraitMult as an export to midi-qol.
* removed default debug level of warn, it is now set by the module settings.

## 0.3.2
very little bug fix release for damage-only workflows

## 0.3.1
Port minor-qol pre-roll checks to midi-qol. Checks for attack range and incapacity.
Fix auto targeting for ranged spells/attacks.
Fix for temporary hp healing.

## 0.3.0
* fix for better rolls and hiding cards incorrectly.
* re-organise trap workflow to request saves before rolling damage
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
* New setting. Hide roll details. When selected the GM can choose how much of the GM's attack/damage roll to hide from players, none, formula (just the formula is hidden), all - players only receive notification that a roll was done. (combo card only)
* Update to Damage Only workflow to support combo cards. The damage only workflow will add to the existing chat card for the item. This means you can have an item and, via a macro, do custom damage and it all looks like a standard roll, see Readme.md for an example. If the macro is an item macro the item is self contained. (Macro application requires dynamicitems).
* Localisation improvements. Note for translators, options in the config settings are now localisable. Each option has two parts a lower case string that must not be touched and descriptive text that can be changed, e.g. "onHit": "Attack Hits" - do not change "onHit", but feel free to change "Attack Hits". I have added English versions of these to all language files so that the options won't be blank.
* Big update to the readme to cover settings.
**Bug Fixes**:
* Fixed a bug so that doing damage does not require the GM to be on the same scene.

## 0.2.7
* Added support for dice so nice and combo card.
* Added damage buttons to the combo card damage roll. These duplicate the better rolls 5e hover in/out behaviour. Buttons on the combo card and damage card require a target to be selected (useful if not displaying damage application card). Buttons on the apply damage card apply to the targeted token(s), since there is one button per target.
* Always display the item icon in the combo card since it takes up no more room.
* Fix edge case where item card not displayed for items with no effects.
* Added DamageOnlyWorkflow(actor: Actor5e, token: Token, damageTotal: number, damageType: string, targets: [Token])  
Useful for writing macros that have custom damage effects. E.g. Divine Smite that checks target type. This version does not create a a combo card.
* Added auto fast forward for ability saves/checks option, if speed item rolls enabled. Treat ability saves/checks as if Shift was pressed.
* Corrected icons on damage card, which were all the same.
* Corrected incompatibility with MagicItems and speed rolls. If you attempted to speed roll a magic item (i.e. roll the staff attack for a Staff of the Woodlands) the speed item keys would not be passed through, this has been fixed.
* Allow selective removal of item details, to allow showing of PC item descriptions but to hide NPC item descriptions also allow force display of item card. Display an item card if nothing else was being displayed when rolling and item (e.g. no attacks/saves/damage).
* Setting to hide the DC of a saving throw from players in chat cards, chat message prompts and LMRTFY requests.
* Fixed regression that caused speed rolls to get stuck on spell cast (hot fixed to 0.2.6)
* Return a promise resolving to the result of item.roll() as the result of actor.useSpell()

## 0.2.6
* Now requires foundry dnd 0.9.6 or later
* Damage buttons for combo card. Significant update to the undo damage card. You can have the card displayed even if damage is not applied, which gives details of all the hit targets and the damage to be applied. There are now 6 buttons per target, reverse and apply the computed damage which sets the hit points/temp hit points before/after the damage. Then the four normal buttons for each target. These buttons apply directly to the appropriate token, no need to select the target to apply damage. Works for GM only but since players cant apply damage to most tokens it should not matter.
* Users can choose their own sounds via file picker for normal attacks, criticals and fumbles. (Merge Card Only and not better rolls)
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
Which will roll the attack/and or damage and apply to the passed targets. If the item has an area template it will be placed at x,y and targets auto selected inside the template.
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
* Remove attack/damage buttons as they are "used" even if not using combo card.
* Put back ctl/alt/shift clicking on character sheet removed in 0.2.3
* With shift being  versatile attacks, now CTL-ALT substitutes for the "default" fast forward shift.
* Chat damage button disabled until other rolls complete, like attack or placing a template. Corrects problem case of rolling damage before rolling attacks. If you try to roll damage while waiting for a template or attack roll you will get an warning notification.
* Identified, but have not fixed, MESS incompatibility, including with placed templates.
* Improved? background colored player names when highlighting cards.
* If not auto targeting we can wait until the damage roll is done before recording targets. This might enable a workaround for mess not working with midi-qol until a proper fix is found
  * Disable auto roll damage.
  * Let mess place the template
  * then roll damage.
* Set user on auto-rolled ability saving throws thanks @ spider
* Disable damage-only workflow until a better solution is found. This will inactivate divine-smite spell in dynamic-effects.

## v0.2.3
* If player rolled saves is enabled and a token is required to save that has default owner pemission (in addition to tokens  owned by a player) a player will be chosen to roll for that token.
* In merge cards critical hits/fumbles are now highlighted.
* Added a new weapon property "Magical" which is also checked when determining if weapon's attack is magical for damage resistance.
* Corrected a typo in the non-magical damage resistance check. Thanks @Jibby
* Fixed a bug that added all possible buttons to almost every chat card.
* Fixed "inventory button" standard roll to work exactly like a standard roll with no auto rolling.
* Coloring of chat card borders/names now gives npc rolls a GM color instead of the player color if the  player initiated the roll. Mainly relevant for saving throw rolls triggered by a player causing the NPC to save.
* Fix for webm tokens causing an error.
* Added require targets flag in config settings. If enabled items that require pre selected targets won't be allowed to proceed without a target being selected. (Better rolls not supported)

## v0.2.2
Made sure all paths are relative paths.

## v0.2.1
* Fix a saving throw bug where the first player saving throw was hidden.
* Fix a race condition that could case saving throw rolls to fail
* Fix an  inaccurate identification of a damage only workflow.
* Added the ability to set the token name text color OR background color when highlighting chat cards.
* Fixed inability to set range targeting flag.

## v0.2.0 [BREAKING]
* A big change to speed item rolls and auto shift click.  
Speed item rolls now makes no changes to the character sheet, and does not need module support to work with token bars/macro hot bar. Instead when it is enabled the mouse event is recorded when you do the roll. **The meaning of the keys have changed**:  
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
If you have merge cards on for better rolls the saving throw results are not displayed - disable merge card for better rolls.
