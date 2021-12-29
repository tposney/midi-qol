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
  - The sheet will be restoed and the workflow continue.

**Known Issues**. If the item does not have any targets, you will still have to complete the targeting process by clicking away from token targeting.
This is rreally intended for players who really, really can't get the hang of targeting before they do the roll.

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
    ```[postAttackRoll]ItemMacro, [postDmageApplication]ItemMacro``` for multiple passes, or use All
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
* Fix for (I think) longstanding bug that if monster saving rolls would be displayed to plaers - even if midi setting was to hide them.
* Fix to Spirit Guardians to not create multiple sequencer/Automated animations effects. Midi smaple items are in folders if compendium folders is enabled.
* Correction DF Quality of Life is the template targeting preview module (apologies to @flamewave000 for the wrong attribution).
* Change so that if player reacitons are enabled and no logged in player with ownership of the actor exists, the GM will be prompted to do the player's reaction rolls.
* Fixed a problem where midi was trying to get unconnected players to roll saves. It simply would not take no for an answer.
* Fix for divine smite in v9.

* Experimental - first cut integration with ddb-game-logs. **You need to be a patreon of ddb-game-log for this to work**. Requires a yet to be released version of ddb-game-log.
  - Midi will accept attack/damage/saving throw rolls from ddb-game-log. If you roll an attack or roll damage for a feature with no attack, midi will create a workflow and check hits/saves and apply damage using the ddb-game-log rolls.
  - The link is one way, from dnd beyond to midi and there is no feedback from midi-qol to update dnd-beyond, like changing hit points or active effects.
  - Since the character settings are taken from dnd beyond NONE of the midi-qol advantage/disadvantage settings will apply to the roll. Similarly with damage rolls none of the foundry local bonuses etc will apply. Simple summary, everything relating to the dnd beyond generated rolls (attack, damage and saves) is taken from dnd beyond.
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
Not Supported: picking tokens to be exlcuded, the spell will only target enemies.

### 0.8.84
* Fix for triggering reactions (Hellish Rebuke) when someone heals you.
* Fix for duplicated lines in en.json.

### 0.8.83
* Fix for better rolls activation condition processing.
* Added non magical silver physical damage resistance/immunity/vulnerability, which is bypassed by magical and silvered weapons.
* Fix for removing cocnentration effects when one of the target tokens has been removed from the scene.
* Monk's token bar saves now displays the DC based on the midi midi show DC setting.
* Fix for bug introduced in 0.8.81 with critical damage configuration - if you have Default DND5e as you setting, midi would incorrectly interpret that as no damage bonus.
* Fix for 1Reaction effects not expiring on a missed attack.
* Fix for localisation problem if using midi's concentration effect (i.e. no CUB/Convenient Effects).
* Addition to reactions. As well as triggering on attacks, reactions can trigger on damage application. Midi uses the activation condition of the item to work out which one is applicable.  
Most feats/spells have a blank activation conditon and midi will treat those as attack triggered reactions, or if the localised string attacked is in the activation condition.  

Hellish Rebuke, for example, has "Which you take in response to being **damaged** by a creature within 60 feet of you that you can see", and midi will tirgger those with the word damage in the activation conditon when a character is damaged. (Hellish rebuke is a special one since it triggers only if you took damage).

* Added new item field "Active Effect Condtion". If set the activation condition must evaluate to true for the active effect to be applied. The saving throw if any must also be failed for the effect to be applied. For example, the included mace of disruption does additional damage to undead and if an undead fails it's save it is frightened. By setting the Activation Condition and Active Effect Activation Condition to checked only undead will suffer extra damage and be set frightened if they fail the save.

* Implemented Optional Rule: Challenge Mode Armor. See the readme.md for more information. My testing indicates that this is extremly unfavourable to higher level tank characters, dramatically increasing the amount of damage they take. I have implemented a modified version that, 1) scales the damage from an EC hit and 2) Armor provides damage reduction equal to the AR for all hits.

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
* new DamageOnlyWorkflow() reutrns a Promise which when awaited has the completed workflow with damage applied fields filled in etc.
* Preliminary review of 0.9.x compatibility and seems ok (famous last words). 
* update ja.json - thanks @Brother Sharp

### 0.8.73
* A little tidying of active defence rolls so that duplicate rolls are not performed.
* Fix for midi-qol.RollComplete firing too early in the workflow.
* Added fumbleSaves/criticalSaves: Set<Token> to workflow, and fumbleSaves,criticalSaves,fumbleSaveUuids, criticlSaveUuids to onUse/damageBonus macro arguments.
### 0.8.72
* Fix for active defence error in ac defence roll calculation.
* Added support for ItemMacro.UUID in DamageBonusMacros and OnUse macros to refernce item macros for items not in your inventory.

### 0.8.71
* Fix for active defence causing a console error for non gm clients.

### 0.8.70
* Fix for damage type none and better rolls (would always do 0 damage).
* Fix for expiry of type isSave, isCheck, isSkill when doing auto saves/checks/skill rolls.
* Expirmental: Support for the Active Defence variant rule. Enable via optional rules setting Active Defence. Requires LIMRTFY and does **not** work with better rolls. 
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

### 0.8.69
**Changes coming in dnd5e 1.5**:
* dnd5e 1.5 includes per weapon critical threshold and bonus critical damage dice. There is now a configuration setting to enable/disable the midi-qol field on the item sheet. Once dnd5e 1.5 is released, you are stongly encouraged to migrate to the dnd5e setting and disable the midi-qol flag, via Use Midi Critical in the configuration settings. Soon, I will remove the midi-qol field completely. You can run ```MidiQOL.reportMidiCriticalFlags()``` from the console to see which actors/tokens have the midi-qol critical setting defined.
* Enhanced dnd5e critical damage effects. You can make most of the changes that midi-qol supports for critical hits via the new game settings (max base dice, double modifiers as well as dice) and per weapon settings (additional dice). You will need to experiment to cofirm the interaction of the dnd5e critical damage flags and the midi-qol settings, however if you use the dnd5e default setting in midi-qol the rolls will not be modified by midi in any way and the dnd5e system will operate.

### 0.8.68
* Fix for betterrolls and OverTime effects not rolling damage correctly/at all.
* Fix for bettereolls saving throws not being detected in chat message saves workflow.
* Overtime effects saveDC now supports expressions rather than just numbers/field lookups. No dice expressions.
* Fix for reaction checks throwing an error if no midi-qol flags are set on the actor.

### 0.8.65/66/67
* Fixes for template targeting and various module interactions.

### 0.8.64
* Added healing and temp helaing to resistance/immunity/vulnerability types so that actor can be immune to healing.
* ~~Fix for template placing not working.~~

### 0.8.63
* Fix for OverTime effects - now supports stacking of the same effect (should be regarded as experimental).
* Added the ability to use # instead of , to separate OverTime fields. You have to use one or the other for the whole OverTime field.
* Fix for BonusDamageRoll rolls and dice so nice not being displayed.
* new MidiQOL.completeItemRoll function. Can use with  ```await MidiQOL.completeItemRoll(ownedItem, options)``` which will return the worfklow when the entire roll is complete and damage (if any) applied.
* Template targeting clean up. 
  - If using levels you can set the midi-qol optional rule setting to check + levels, which will check template overage including height and levels walls blocking for all attacks. The midi template height check is VERY naive and in addition to 2d targeting simply checks a sphere centered on the template origin and if further away it is considered out of range.
  - If you want proper volumetic templates use the levelsvolumetrictemplates module (patreon) which does a great job of working out how much of the token is in the template and midi uses the result of that calculation. This version supports walls blocking for volumetric templates and uses volumetric templates for the preview targeting.
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
* Added MidiQOL.getConcentrationEffect(actor) which will return the concenttation active effect for the curent passed actor, suitable for MidiQOL.getConcenttrationEffect(actor)?.delete() to remove concentration from an actor.

### 0.8.61
* Various/significant concentration fixes if you have combat-utility-belt AND/OR convenient effects installed or none. Symptoms included, duplicated concentration saves required, not removing concentration, generally breaking.
* Optional rule for saving throws auto save/fail on critical roll/fumble
* Updated Flaming sphere. After a lot of testing, removing the item on expriy/removal of concentration was causing many bugs, which are not present in 0.9. Until then the summoned sphere will not be auto deleted, everything else should work.
* Small fix for potentCantrip if the actor had no other midi-flags set.

### 0.8.60
* Fixed acid arrow (which had the wrong rounds duration 1 instead of 2).
* Fix for healing not working - oops.

Clarification, overtime effects share some features with other active effects.
  - if an overtime effect is applied as a passive effect (think regenerate) then using @fields will evaluate in the scope of the actor that has the effect and be evaluated each turn, no processing is done when creating the effect on the actor.
  - if the overtime effects is applied as a non-transfer effect (i.e. the result of a failed save or an attack that hits) @fields will evaluate in the scope of the caster exactly once when the effect is applied to the target, and ##fields will apply in the scope of the target each time the effect is tested.
  Example: a character with 50 HP with a spell, cast at level 3,  has a applied effect attacks a beast with 20 hp, then a removeCondition (for example) of
  ```@attributes.hp.value < 30 && @spellLevel > 2``` will evaluate to ```50 < 20 && 3 > 2``` before the effect is created on the target actor and will always be false. Of special usefulness is an expression like ```damageRoll=(@spellLevel)d4```, which is evalated when applying the effect and returns an expression like (3)d4 if the spell was cast at level 3.
  ```##attributes.hp.value < 30``` will evaluate to ```@attributes.hp.value < 30``` and will be evaluated each round until the targets hp are less than 30.
  The ## versus @ behaviour is standard for DAE/Midi active effects.

### 0.8.59
* improve condition immunity behaviour. If you try to apply a condition whose statusId (usually name) matches a condition immunity application will be blocked. (For unlinked tokens this is not possible so the condtion is marked as disabled).
* Fix for not applying empty effects (for tracking expiry).
Sample Items:
Added Longsword of sharpness.
Added Acid Arrow.

### 0.8.58
* Added flags.midi-qol.DR.final which is damage reduction applied AFTER damage resistance/saves etc. Not RAW but useful.
* Fixed ranged target selection to support meters. Sorry about that, and I live in a metric country - hangs head in shame.
* Some updates to activation conditions.
  * Since it is so common @raceOrType, will return the targets race (if there is one) or the targets type, in lowercase.
  @worflow provides access to the midi-qol workflow that caused the roll.
* Fix for saving throws not being rolled at all.
Sample items:
Longsword of Lifestealing (has an itemMacro).

### 0.8.57
* Fix for incorrect failed saves calculation if there was a to hit roll as well.

### 0.8.56
* Fix for broken configure settings dialog (oops).

### 0.8.55
* If concentration is set to inactive, taking damage won't trigger a consitution saving throw. I'm not sure it really makes sense to set concentration inactive, but I don't see that it causes any problems and can be convenient when tweakingg Hit Points.
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

You can add the above conditon to the SRD slayer items to make the bonus damage automated based on target type.

If the weapon rolling the attack has ammunition AND the weapon does not have it's own Other Roll defined, the activation condition, Other roll and saving throw from the ammunition will be used. (Arrow of Slaying). **This does not work with Better Rolls (and probably wont)**

There is a new weapon property "Crit Other Roll" which if set means that the "Other Damage" roll will be rolled as critical if the base roll is critical. Previosly Other Damage would never roll critical damage. You can decide if your Arrow of Slaying can do critical damage or not. **This does not work with Better Rolls** (yet)

* Added a few new items to the sample compendium,
  * Flaming Sphere, this does pretty much everything the spell is supposed to do. Requires Active Auras and DAE. (Treat it as experimental - as I have not tried it in game yet).
  * Dragon Slayer LongSword. Example of simple activation roll other damage.
  * Arrow of Slaying (Dragon). Example of ammuniton other roll damage, use it by adding to the character and setting the bow's ammunition to arrow of slaying.

* Updated ko.json - thanks @klo

### 0.8.54
* Fix for Sorcerer's Apprentice OverTime bug. If you have an overtime effect with a label equal to a convenient effect's name AND you are auto applying convenient effects the effect would be applied repeatedly, 1->2->4->8 etc.
* Added OverTime removeCondition=expression which if true will remove the effect. (renamed condition to applyCondtion - but supports the existing condition label as well).
* Oops - I managed to remove a check in one of the previous updates which means OverTime effects are applied for each user logged in. Fixed.

### 0.8.53
* Fix for Damage Reduction being applied to healing
* Added condition=expression to midi-qol OverTime, the rest of the overtime effects are only processed if condition evaluates to true. e.g. @attributes.hp.value > 0. You can use any actor fields in the expression, but not dice rolls. Undefined fields (e.g. flags) will evaluate to 0.
 Added sample Regeneration Item that checks for HP > 0 before applying.

### 0.8.52
* Allow flags.midi-qol.OverTime.NAME (name optional) will allow multiple effects to be recorded on the actor (with or without NAME the effects will still be processed - this is just cosmetic).
* Support rollType = check (default is save) in OverTime speicifcation, roll an ability check instead of an ability save.
* Clarification:
  * "healing" and "temphp" work as damage types doing the obvious - healing damage is a way to implment regeneration. 
  * @field replacement on overtime active effects only works if DAE is enabled.
* Fix for longsword of wounding doing an unnecessary saving throw. Fix for Hold Person not being removed on a save.
* Addition of regeneration feature which adds HP at the start of the turn. If the optional rule for incapacited targets is enabled HP will be regenerated only if the actor has at least 1 HP.
* The ability to do a reaction now resets at the start of an actors next turn.
* Rewrite of Damage Reduction. Should now do something sensible when apportioning damage reduction across attacks with multiple damage types. It is not obvious what should happen in all cases so expect some confusion on this one - don't update 2 minutes before game time. The tests I've done suggest it is doing something sensible. I've enqbled a developer console warning message detailing the DR apportionment midi has done.
* Update for sheet buttons on Better NPC sheets, thanks @mejari (gitlab).
* Only display ChangeLogs module warning once per midi-qol update.
* Comcenration: If a spell/item with concentration has an attack/save only apply concentration to the attack/caster if there are hit targets or some failed saves.

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
  * saveAbility=dex/con/etc The actor's ability to use for rolling the saving throw
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
* Added support for the levels moudle collision checking (which incorporates wall height/floors etc) - in walls block settings (optional rules - center + Levels). This works for templates and range checking. If levelsvolumetrictemplates is installed it will take over the template checking.
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
* Revers better rolls skill/save/check changes - until I can find a beter solution

## 0.8.40
* Added MidiQOL.selectTargetsForTemplate(MeasuredTemplate). If you have a MesasuredTemplateDocument you need to pass templateDocument.object.
* Fix for scaling MagicItems
* Fix for concentration checks not removing concentration with better rolls eneabled.
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
* Fix for special duration isDamage.damageType not expiring when taking dmaage if saved.
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
* Fix for another DamageOnlyWorfklow edge case throwing an error.
* Fix for concentration throwing an error when DAE not installed (DAE is required for concentration to work properly). Fix for concentration icon not being displayed.
* Added option to hide saving throw totals on save ccard.
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
* Fix for DamagaeOnlyWorflows without a passed item causing errors.

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
* Added targetUuids, hitTargetUuis, saveUuids, superSaverUuids and failedSaveUUids to the args[0] argument to onUse/DamageMacro macro calls.
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
* Fix for checking reactions on worflows without an attack roll - i.e. DamageOnlyWorkflows.

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
* Hellish rebuke the player doing the attack, target whoever hit the player and choose hellsih rebuke from the dialog. (TODO auto target the attacker)
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
* Fir asynch LMRTFY _makeRoll patching.
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
  - flags.midi-qol.optional.Name.count - how many uses the effect has (think lukcy which has 3), if absent the bonus will be single use (bardic inspiration)

This should be regarded as experimental since there are certain to be changes over time.
Known Issues:
* Does not work with better rolls - yet. Not sure if it's possible but will investigate.
* The dice roll does not display the inital dice roll with dice so nice, so with dice so nice only the last bonus roll will be displayed. Will be fixed in a later release.
* Pending a change to LMRTFY, unlinked tokens only apply optional effects if they are present on the base actor. Monks token bar and auto rolls take the bonus into account for unlinked tokens.

* Sample Bardic Inspiration and Lucky feats are included in the "MidiQOL Sample Items" compendium included with the module.
* How to use "Bardic Inspiration"
  - Add the "Bardic Inspiration" feature to the bard, and set the number of charges per long rest according to the Bard's level.
  - Inspire someone by targeting the recipient of inspiration and rolling the Bardic Inspiration feature, which will add the Inspiration effect to the target.
  - When Inspiration is present the recipient will be prompted with a dialog to add the bardic inspiration roll on attack/save/check rolls. 
  - The inspiration dice correctly reflect the bards level when applying the effect. A little  fancy footwork was required to get that to work - see the Bardic Inspiration Dice passive effect for how to do that. You need dae for this to work.
  - If you don't use dae then use Bardic Inspirtion (No DAE) and modify the dice settings yourself.
  - Once used, the Inspiration effeect is removed from the target character and no more prompts are shown.
  
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
* If GM sees all hidden rolls is enabled the "privately rolled some dice" message will have it's contents dispayed to the GM. Really hid private/hidden rolls will disable the "privately rolled some dice" messages from being shown

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
* Fix for displaying hits when attacking, not using merge cards, and only showing gm the results which would generate a player does not have permission to create chat messsage.
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
* Fix a bug not allowing you to set the default save modifieer.
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
* Fix for DF Manual Rolls - no longer request roll to be entered twice. Requires ciritical damage to be dnd5e default (fix pending for critical damage).
* Fix for token tooltip showing dmaage resistance/immunity/vulnerabilty not being dislayed on damage card.
* [BRAKING] Setting saving throw roll time out to 0 means that the system will NEVER auto roll the save for the player. If saves are not rolled (either auto or by request) they will never be resolved. This will help in the some cases where players incorrectly place templates.
* Added support for Monks Token Bar saving throws. Can be for players or NPCs. There is no timeout supported for this. The GM can always click on the roll if they get tired of waiting. Monk's token bar rolls do not support setting of advantage by midi-qol.
* Fix for DamageOnlyWorkflow error when initialising with no item.

## 0.8.3
* 0.8.5 compatible and becomes the main branch for midi-qol.
* Fix for error when displaying player character avatar image in damage card.
* Added two hooks, midi-qol.preAttackRoll and midi-qol.preDamageRoll, which are called just before the call to item.rollAttack and item.rollDamage. They are passed the item and the workflow, both as "live" objects so changes will affect the roll that is about to be done. return true for the roll to continue and false for the toll to be aborted. 
* Compatability with BetterRolls 1.1.14-beta seems to work, but only limited testing.
* Players control invisible tokens seems to be working. The player vision set is the union of all their owned tokens and they can see invisble tokens they own.
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
* Added flags.midi-qol.DR.non-physical damage reduction, for damage which is not bludgeoning,slasing or piercing.
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
* Expanded special durations  to includes skill checks and ability tests. All of these trigger when the roll is made, whether you are attacked or not. Save Success and Save Failure only trigger is you are attacked and need to make a save as a consequnce of that.
* Fix for isAttacked special duration not triggering on missed attacks.
* Call midi-qol.DamageRollComplete as soon as the damage roll has been done, rather than waiting for saves.
* Added option for onUseMacros to return {haltEffectsAppication: true} to prevent active effects being applied.
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


## 0.3.82 fix for saves not working if speed rolls not enabled.

## 0.3.81
* Clean up keyboard hadling for saves/checks/skill rolls to align with the rest of the midi key settings. See the readme.md for more details.
* catch a couple of edge cases that were throwing some errors.
[removed] [BREAKING] If better rolls is enabled there is a new workflow option. Item roll starts workflow, which if enabled will allow MagicItems spells to work as normal, applying damage etc BUT better rolls item buttons (standard roll etc) will not work as intended. If disabled better rolls item buttons will work as intended but MagicItems spells will not do any auto rolls but better rolls buttons will function as intended. You can't have both, default is disabled.
* [BREAKING] Removed preRollChecks setting. All features of that setting can be enabled from the optional rules settings page.
* [UNBREAKING] for AoE spells (measured template placed) default behaviour is that caster WILL be targeted. Only if the range units field is set to "Special" will the caster be ignored. This means items from the SRD will work as written.

## 0.3.80
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


## 0.3.69
Added advantage/disadvantage to data passed to onUse/Damage bonus macros.

## 0.3.68
* A small rearrangement of the onuse/damagebonus macro calling.
* export of midi-qol.getDistance(t1, t2, wallsBlock: boolean). Which will return the straight line distance between two tokens allowing for tokens larger than size 1.
* "Fix" for placing rectangular templates and auto targeting, now treats the origin of the template as the center of the template for checking blocking walls. Fixes and incompatibility with dnd5e helpers that replaces circle templates with equivlently size rectangular templates.

## 0.3.67
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
* New option to DamageOnlyWorkflow, it you pass itemCardId: "new" together with itemData as itemData: itemData, a new chat card for the item will be created and the dmage inserted into the chatcard. (consider this experimental).
* Fix for rolling self targeted items when no token for the actor exists in the current scene.
* Fix for rolling items if no scene exists in the world.
* Fix for not displaing damage total when 0 damage was rolled.


## 0.3.60
* Now requires dnd5e/sw5e 1.2.3 or later.
* Fix for critical key not being detected for some damage rolls.
* Fix with perfect-vision to not infinte loop.
* Fix for healing damage bonus in other languages not working.
* Fix for Damage vs Healing displayed for healing action types on the item card button.
* Improved (?) behaviour on the 1attack/1hit/isDamaged/isAttacked expiries. There may be some missed edge cases.
* startNextTurn/endNextTurn expiry moved to times-up.
* Implement 5/5/5 distance calcs for ranged area trgeting.


## 0.3.59
Fix for rwak/mwak and applying Other/versatile damage always rolling something even if no Other or versatile damage (it would roll the weapon damage again)

## 0.3.58
Fix for 0.3.57 release bug.
Fix for trap worfklow not fastforwarding.

## 0.3.57
Fix for self targeted attack/action/hit durations. This required quite a few changes in the workflow so it's possible some cases are not covered so be warned.

## 0.3.56
* Extended the rwak/mwak + saving throw functionality. If the item has "Other" filled in, midi will roll that for the save damage, otherwise it will roll the versatile damage. This change means it should work out of the box with SRD monsters.
* Fix for damage buttons on the item card.

## 0.3.55 Bugfix release
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

## 0.3.54 Some big QOL changes in this release. Some significant changes under the hood, so DO NOT UPGRADE on game day.
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
Chat card buttons should correctly reflect the status for adnvantage/disadvantage/critical that midi-qol thinks when displaying the buttons (i.e. not auto rolling) and includes looking at various advantage/disadvantage/grants/critical flags.  

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
  * GM Auto fast forward attack rolls: If true the GM attack rolls will be auto fastforarded. Key modifiers are supported.
  * GM Auto Roll Damage. Options are never, attack hits, always.
  * GM Auto Fast Forward damage: If true roll will be auto fast forwarded. Will pick up whether the attack was critical or not and will recongnise critical and No critical keys if the roll was not auto rolled.

## 0.3.48
* More tinkering with dadmage critical rolls. If an attack is critical and damage rolls are auto fastforwarded it will use the critical status from the attack roll.
* If not auto rolling damage rolls and auto fast forwarding damage rolls pressing the disadvantage key (ctrl by default) will force the roll to be a normal roll.  
As always there are likely to be some workflow behaviours that I have not tested so ping me if there are any problems.
* [BREAKING] Split GMFullAuto into GM auto roll attack and GM auto roll damage. GMAutoRollDamage ignores other module settings and will auto roll damage for all GM damage rolls if true and will never auto roll if false. I have to thwart a particular bahaviour in my world where players decide to use the shield spell based on how much damage the attack does, but still want their attacks to auto roll damage if they hit.
* Fix for ptentially choosing wrong dice in advantage/disadvantage roll checks.
* [BREAKING] removal of the midi-qol created magical flag for weapons - it is now created by default in dnd5e 1.2.1. It appears the properties have the same id so it should mvoe across seamlessly.
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
* Included merge request to refrain from deleting non-special duration effects at combat end. Thanks @DangereosrDan.  
The first 2 fixes required a change to how keyboard event processing is done. As far as I can tell there are no problems, but there are too many workflow variations for me to test them all, so a bug (or many) is possible.  
Don't update just before game time.

## 0.3.42  
fix for versatile shortcut being ignored.  

## 0.3.41  
fix for spell scaling not working  
fix for item roll errors when initially rolling - broken universe etc (I hope)  

## 0.3.40  
* Fix for trapworkflow calling onUse macro twice.  
* Some more clean up of crtical/advantage settings in workflows. Dont pass an event, use optins values  
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
* added a new paramter to item.roll({createWorkflow: true}). If you se this to false when calling item.roll a workflow will not be initiated - useful if you have macros that do a complete roll and you don't want midi-qol to start automation for the item roll.


## 0.3.35
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


## 0.3.34
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
These flags can be set by active effects and are evaluated after derived fields are calculated, so things like dex.mod etc ar available.

* fix for templates and large tokens.
* fix for npcs requiring players to roll saves.
* Added Hooks.callAll("midi-qol.DamageRollComplete", workflow) after damage has been applied.
* updated de.json thanks @acd-jake


## 0.3.32
Add damage all/restore all buttons to damage card.
Hightlight/select enabled for damage card as well as hits card.
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
* Fix for speed key setting and advnantage/disadvantage flags not working together.
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
* In the quest to provide ever more arcane key combination support, Capslock now acts as an auto fastforward for atttack rolls (like adv+disadv). 
* First installment of:
  flags.midi-qol.fail.spell.all disable all spell casting for the character
  flags.midi-qol.fail.spell.vocal fail casting of spells with vocal components (intended for silenced characters0)
  flags.midi-qol.fail.spell.somatic - perhaps useful for restratined characters or some such.
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
  

## 0.3.22
* Added option for GM to auto fastword rolls always, ignoring the rest of the module settings. Intended for GMs who want their players to hit the various roll buttons but skip for their rolls. 
* updated ko.json thans @KLO

## 0.3.21
* Fix for ignoring speed keys when not auto fast-forwarding rolls.

## 0.3.19/3.20
Fix for broken saving throws

## 0.3.18
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
