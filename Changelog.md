### 13.0.22
* Fix (hopefully) for tokens losing vision after making an attack.
* Fixed localisation display in midi custom sounds setting for quick settings.
* Fix for flags.midi-qol.onUseMacroName passive effects pointing to the wrong origin.
* Fix for flags.midi-qol.onUseMacroName and ItemMacro failing to roll.
* Fix for extra DSN dice being rolled when rolling ability saves/ability checks/skills/tool rolls when displaying before and after card.
* Fix for broken TrapWorkflow.
* Midi no longer uses the preRollXXXV2 hooks, just the preRollXXX hooks.
* By popular demand the midi item/activity configuration control has been added to the header of the item sheet for tidy sheets.
* Added flags.midi-qol.canFlank.
  - if the flag evaluates to false the token won't be considered for flanking/flanked checks even if it has the right disposition.

### 13.0.21
* Fix for AoE targeting getting incorrectly being failed as "target blocked by wall" when using something like a fireball.
* Added option to target confirmation to clear all targets.
* Slight reorganisation of targeting/walls block configuration to move walls block options to the workflow tab.
* Fix when using levels auto cover for determining ranged attack blocked by wall.
* Fix for duplicate DNS rolls when doing tool checks.
* Added chatLog pruning for popped out chat log.
* Chat log is more aggressively pruned.
* Event listeners on chat log elements are now explicitly removed when the element is dropped from the chat log.

### 13.0.20
* Fix for duplicate DNS display when rolling saves from the chat card.
* Fix for hiding PC names in hit/save displays when using the Hide  NPC names module.

### 13.0.19
* Fix for a rare race condition that could cause damage rolls not to display.
* Fix for player saves dice so nice dice being displayed twice when rolling a hidden roll mode.
* Fix for gm private/self/blind rolls always triggering extra damage/attack card or extra DSN rolls.
* Fix for players seeing "missed" color highlight when settings are to disable everything.
* Fix for TroubleShooter not loading older troubleshooter files.
* Target confirmation knows about whether the chat log is expanded or hidden and positions accordingly.
* Fix for case where damage bonus not being correctly applied - thanks @thatlonelybugber.
* Introduced a change in emanation/radius targeting. Instead of using "self" use "-self" to indicate that the caster should not be included. Use of "self" will generate a deprecation warning and will be removed eventually.
* Updated pt.br.json and it.json - thanks @kharmans and GregoryWarn
* New setting to control if using an item waits for damage application to complete before finishing. In mechanics tab. 
  - Waiting for the completion adds an overhead so it defaults to false. 
* For macro writers - the new setting to control if a workflow waits for target hit point updates to complete may impact processing, i.e if you expect updates to be completed on return from await item.use (for example).
  - If you rely on the hp update completing when the workflow completes, you can set MidiQOL.currentConfigSettings.waitForDamageApplication=true in code and it will then wait for completion.

### 13.0.18
* midi-qol now requires DAE v13.0.12 or later.
* Fix for midi not correctly displaying dnd5e damage application buttons.
* Fix for parenthetical damage formulas being broken - i.e. (@details.level)d6
* Fix for reaction dialog content display not being localised.
* Fix for ammunition consumption displaying the damage configuration dialog when not required.
* An improvement in the midi performance degrading over time issue. It's a bit of a hack but seems to help significantly - the DOM chat log is pruned as new messages are added.
* I've done a lot of work on the cached updates setting in midi. If you have a slow (or remote) server it is a good idea to set that to something like 150-200 (ms) which should improve performance. For local servers the benefit is about 10-20%.
* Support for actors having more than 1 reaction/bonus action per round.
  - There is no UI for this, you must set the reactions/bonus action maximum via an active effect.
  - flags.midi-qol.actions.reactionsMax and flags.midi-qol.actions.bonusActionsMax can be set to the required value.
  - These fields should be set via OVERRIDE as the default value is "undefined" and is interpreted as 1, so ADD 1 will set the field to 1 and will still be 1 reaction/bonusAction.
  - You can make the actor unable to take reactions (or bonus actions) by setting reactionMax/bonusReactionMax to 0.
* Support for reactions/bonus actions used being reset at different times.
  - There is no UI for this, you must set the flags via an active effect.
  - flags.midi-qol.actions.reactionsReset/flags.midi-qol.actions.bonusActionsReset.
     Options are:
      - **onTurnStart** (the default) - reactions/bonus actions used reset at the start of the actor's turn.
      - **eachTurn** - reactions/bonus actions used reset every turn.
      - **rest** - reactions/bonus actions used reset when a short or long rest is taken
      - **never** - reactions/bonus actions used never reset (effect will have to be removed manually).
* **Breaking** for module developers/macro writers. 
  - Midi now uses a custom damage application element (midi-damage-application) instead of the default damage-application. The class definition can be accessed via MidiQOL.ChatClasses.DamageApplicationElementMidi
  - Midi now uses a custom ChatLog, ChatLogMidi, which is functionally identical to ChatLog5e but deals with the midi custom damage element and supports pruning the DOM as messages are added.

### 13.0.17
* Fix for trigger activities not allowing activity configuration - it is now **on** by default.
  - You can configure the triggered activity to block the configuration / consumption dialog or to autoConsume (on the activity midi-qol tab) if preferred.
* Fix for AoE rejecting multiple targets when Target Confirmation is set and no targets are specified in activity/item.
* Fix for Maxwell's Manual of Malificious Maladies not triggering when midi is active.
* Fix for automation only activities showing in the default dnd5e character sheet drop down.
* Fix for TroubleShooter midi summary settings not being localised.
  - fix for canUse returning false for automation only activities which can cause some problems.
* **Breaking** Prompts to roll a skill/save/ability check will now display the token name in the roll configuration dialog if the token is an unlinked token (usually an npc). This let's you know which of the hundred or so orcs is saving (assuming they have different token names).
* **Breaking** Forcing consumption/rolling/damage configuration dialogs has changed. The options are now choice fields:
  - "Default" - do the midi default
  - "Never" - never show the configuration dialog. If there is consumption that would cause the item not to be used the roll will fail. If you want to be prompted in such cases set autoConsume to true which will pop the configuration dialog if the activity use would otherwise fail.
  - "Always" - always show the configuration dialog unless overridden by a key press (shift/alt/ctl)
  - The previous boolean fields are now overridden by the new fields. For older activities the value will now be "blank" and will equate to use midi settings. So you will need to edit activities that had force dialog etc set.
  - As a reminder autoConsume means if the actor has enough of the requisite consumption components (spell slots, resources, item uses etc) the roll will automatically consume them and continue otherwise the roll configuration dialog will be presented.
* ChatCard rollDamage button now respects workflow.workflowOptions.isCritical if set.

### 13.0.16
* Fix for Use Activity display having expanded rolls.
* Fix for Check Activities always failing the roll.
* Updated Auto Consumption to support all dnd5e consumption types. If there are insufficient resources/spell slots midi will present the item usage configuration dialog.
* Added auto consume option to the midi properties tab for activities. If set midi will attempt to auto consume resources/spell slots/item ro activity uses when the activity is rolled.
* Fix for critical damage calculation when clicking on the damage configuration card - applying critical changes twice or not removing critical damage.

### 13.0.15
* Active defence rolls now use the Active Defence Modifier field. 
  - The active defence roll DC = ActiveDefenceModifier + Attack Roll Bonus
  - The active defence roll will be (AC - Active Defence Modifier) + 1d20.
  - You can set that value to whatever you want, common choices are 12, 0 or 10, each of which makes the DC or the defence roll more obvious.
  - Cleaned up the dice so nice handling for active defence rolls so that the DSN dice are only shown once.
* Active defence now supports isAttacked/isHit reactions which means, for example, the Shield spell can be triggered with active defence enabled.
* Revisited the attack and save display to better align with the dnd5e visibility settings.
  - Midi will use the most restrictive of the dnd5e settings and the midi settings. So you can tailor it a bit.
  - Added a new option "check and only gm sees anything" - if enabled players will see nothing for the saves/hits display.
  - Removed the display AC setting from midi-qol workflow settings - use the dnd5e attack visibility setting instead. The current dnd5e setting is displayed on the midi workflow tab.
* Support dnd5e 5.1 self enchant option.
* If you roll an activity that has effects to apply, with no target type and no targets selected midi would remove the apply effects button if the settings include remove buttons. However that means you would never be able to apply the effect. So in that special case midi will always leave the apply effects button.
* Midi will now remember the last rolled default damage for an activity that does damage and use that as the default damage for any activity that rolls damage but has not damage specified. An example use for this would be if you don't automate sneak attack. Roll the weapon that does the sneak attack and if you want to roll sneak attack (making sure it is specified with no damage types) and it will pick up the weapon damage type. Can be useful for low automation environments.
* Fixed a few localisation issues on the Workflow Settings app.
* Updated it.json and pt-br.json thanks to @GregoryWarn and @Kharmans.
* Added "collectDamageRollTypes" merge request npm- thanks @thatlonelybugbear.
* **For macro writers** Midi will now use the values stored in flags.dnd5e.targets (dnd5e's TargetDescriptors) when checking hits. So if you change the ac value stored there (for example when rolling an attack) midi will respect the change.
  - The change is noted before hits are checked and changes to the target AC, for example reactions/3rd party reactions will still work and workflow.
  - checkHits can be called multiple times without issue.

### 13.0.14
* Fix for all rolls being critical or miss if optional rules are disabled.

### 13.0.13
* For otherActivities, if they have the midi setting Display Activity Name set, midi will display the activity name, rather than "Other" in the chat card.
  - So for example, Mace of Disruption, Undead Damage activity set Display Activity Name to checked and the chat card will display Undead Damage for the damage that only applies to undead targets.
* Allow macro writers to overwrite the options set in reactionDialog.
* Fix some cases where an item roll would silently fail with no targets selected.
* Fixed bug in ActorOnUse macro app when deleting a macro.
* When rolling damage and the specified roll contains multiple damage types the configure damage dialog will always be displayed to allow you to choose the actual damage type for the roll.
* Some fixes for displaying attack config when no ammunition is available.
* Fixed behaviour of Target Confirmation "no targets selected".
* Corrected some out of date fa icons thanks @morepurplemorebetter
* Revered Active defence to the original calculations of DC: 12 + attack bonus and defence roll AC - 10 + 1d20 due to popular demand.
* Couple of fixes for ActorOnUseMacro/ItemOnUseMacro localisation.
* Updated pt.br.json - thanks @kharmans
* Some 5.1 compatibility changes - thanks @michael.
* Massive refactor/retyping - thanks (and amazement) @michael
* Fix for some edge cases of damage calculation.
  - Only healing can have negative values when a damage roll is set, others will be set to 0, in line with dnd5e behaviour.
  - **For macro/symbiotic module writers** As a side effect of this, if your macro changes the damage rolls of a workflow you **must** call workflow.setDamageRolls(workflow.damageRolls) for the changes to be recorded.
* Quite a lot of changes to chat message update caching.

### 13.0.12
* version bump for failed tag update

### 13.0.11
* Fix for toggleEffect not getting its heading displayed.

### 13.0.10
* Added an option to not display item properties in the chat card - saves some space.
* Fix for not picking up critical damage rolls when using the damage button.
* Module missing warnings are now only displayed if debug is set to warn.
* Auto fail saves/checks/skills will always roll a 1.
* Respect allow critical flag on otherActivity damage rolls.
* Updated Mace of disruption to only use activities and deal with all effects (I think).

### 13.0.9
* This release is now a general release of midi-qol for v13. If you have not yet installed the public alpha please read through the changelog especially the notes for 13.0.4.
* Please be aware that many of the modules built on top of midi-qol are not yet fully ready for v13 so there will be a delay before you may be able to run your games in v13 with midi.
* Fixes for Damage Reduction/Damage Resistance/Saves damage calculations to implement specified ordering.
  - You an configure when saves are applied, either before or after damage reduction/modification.
  - You can configure when midi specific damage modification is applied, system.traits.dm.midi.xxxx, either before saves/resistance or after. Note dnd5e damage modification is always applied before resistance/immunity/vulnerability.
* Active defence now works again with some little changes.
  - If not auto forwarding attack rolls the attacker will be presented with the normal attack roll dialog allowing you to set advantage/bonuses to attack which will be taken into account in the active defence roll.
  - The defence roll is 1d20 + AC + cover with a DC of 22 + attack bonus. This is the original form of the optional rule.
  - Advantage/disadvantage are calculated appropriately.
  - The is a workflow setting (on the optional rules tab) to hide/display the active defence DC when prompting players for an active defence roll.
  - **Note** not all reaction processing is working with active defence.
* Removed all references to flags.midiProperties - now always on activity.midiProperties.
* Tooltip on GM reverse damage ard now visible - thanks @Michael
* Allow evaluation of `flags.midi-qol.ignoreNearbyFoes` thanks @SagaTympana
* Added midi types - thanks @Tminz

### 13.0.8
* Tokens with the hidden status are no longer targetable.
* Fix for not setting activity.ammunitionItem correctly in some cases.
* Fix for reactions when using emanation/emanation no template targeting.
* Fix for versatile weapon usage (i.e. changing from 1 handed to two handed) not failing when checking for a shield equipped.
* Fix for config.attackMode (onehanded/twohanded) being overridden when using an item.
* Added option to force summoned tokens to be friendly to summoner.
* Item and activity macros are specified in the midi-qol macros app in the item header buttons.
* Properly link the context data and damageTotal to the doEffectsData object - thanks @thatlonelybugbear
* Fix for spellLevel in chooseEffects() - thanks @thatlonelybugbear
* Added new macroPass, preAttackRollConfig.
* ActorOnUseMacro editor is not accessed from the header controls on the actor sheet.
  * This finalises the changes to actor/item/activity macros for v13.
  * Actor macros (specified in the actor on UseMacro header control app) are called when any actor's item is used at the appropriate pass. You may reference any item/activity/world macro when specifying the macro to call.
  * Item macros are called when any activity on the item is called, at the appropriate pass.
  * Activity macros are called when the specified activity is run, at the appropriate pass.


* Moved to fvtt-types 13.345.0 - quite a lot of changes from this. (Relevant to those who have forked midi)

### 13.0.7
* Fix for summons with instantaneous duration throwing an error

### 13.0.6
* First open beta for midi-qol and foundry v13 dnd5e v5. This is **NOT** ready for gameplay but we are actively seeking feedback on any issues. Please read the whole changelog as there are substantial changes. The main one being that the item midi-qol tab is no more.
* Requires the v13 branch of dae: https://gitlab.com/tposney/dae/raw/v13/package/module.json
* Fix for reactions using a save activity not rolling the save.
* Fix for sometimes generating extra concentration checks on combat start or advancing combat. thanks @thatlonelybugbear
* Proper effect data to remove summoned creature on expiry. thanks @thatlonelybugbrear

* Known issues:
  * Allow Critical/Critical bonus not displaying headings on save/check activities.
  * Using levels to check visibility is not working properly with walls - any wall blocks visibility - affects advantage/disadvantage, but not distance calculations.
  * Midi still hooks renderChatMessage and has not migrated to renderChatMessageHTML, so you will get a bunch of compatibility warnings.

### 13.0.5
* Added flags.midi-qol.optional.NAME.XXX.displayBonusRolls
  - false means no bonus rolls change chat messages will be displayed
  - true means bonus rolls change chat message will be displayed.
  - Overrides the config setting.
* Fix for error in activity .hbs file which meant you could not edit activities - oops.

### 13.0.4
* Change so that preferred GM is stored as an id rather than a name.
* Fix for stack overflow when computing distance between very large tokens - thanks @woodser
* Fix for target confirmation dialog - thanks @Elwin
* Fix for target confirmation dialog leaving canvas selection tool in odd state if closing dialog.
* Fix for respecting roll mode when doing a skill roll and changing it in the roll dialog.
* Fix for reaction setting displayOnly to actually display the reaction effect on tokens.
* Respect activity options, dnd5e.concentrationCheck.
* Reinstate 1 second/1 turn time out for instantaneous templates removal.
* If ignoring temphp when doing concentration checks, no concentration check will be triggered if only temphp damage is done for both midi's item roll concentration check and dnd5e's chat message.
  - For the midi item roll temphp damage will not be included in the concentration dc calculation.
  - For the dnd5e chat message, temphp damage will be included in the concentration dc calculation.
* Fix for items which trigger multiple damage rolls only applying last damage done.
* Fix for chat card activity action resulting in cannot read metadata on undefined. Thanks @thatlonelybugbear
* Include fix for auto consumption not distinguishing spells/non-spells correctly.Thanks @thatlonelybugbear
* Fix for importing midi settings from misc tab.
* Fix for items that are not weapons with reaction cast activities.
* Fix for reaction activities that are a self target forward activity not targeting self.
* migrate to the v13 version of fvtt-types
* Added support for hide-npc-names to replace the now defunct anonymous module for hiding token names.
* Added new onUseMacro pass, preDamageRollConfig, called before confirming damage config.
* Fix for preDamageRollConfig not being setup correctly - thanks @Elwin
* Added Czech language files - thanks @Lethrendis

* **Breaking** The midi-qol tab on the item sheet has been removed. Fields that will continue to be supported have been moved to the activity sheet instead.
  - Magic Damage has moved to the activity midi-tab and only affects the activity.
  - Magic Effect has moved to the activity midi-tab and only affects the activity.
  - Toggle Effect has moved to the activity midi-tab and only affects the activity.
  - noConcentrationSave is moved to the activity midi-tab and only affects the activity.
  - Friends fail/save moved to the save activity sheet.
  
  **Breaking** Instead of the previous onUseMacro field on the midi tab, a new header bar app, "midi-qol" (courtesy of @micheal) is supported. This allows you to specify access to item based macros (called on all activity workflows), custom macros (called on all activity workflows) or activity macros (called when the specified activity is run). This is improved functionality compared to the v12 version where all macros were called on all activities.

* **Breaking** Settings for applying convenient effects have been moved to be per activity.
  - There will be a possible convenient effect (CE) for an activity if there is a CE that matches the activity name, and if not, matches the item name.
  - The possible settings are:
    Midi Settings: Use the midi workflow settings to decide
    Only activity effects: Only apply activity effects, ignore CE effects
    Apply activity effects, if absent apply CE: Prefer the activity effects and if none present use the CE effect if present.
    Apply CE, if absent apply activity effects: Prefer to apply the CE effect if present.
    Apply CE and activity effect: Apply both activity and CE effects.

### 13.0.3
* Add usage.midiOptions.triggeringWorkflowId and usage.midiOptions.triggeringActivityUuid to triggered activities.

**v12** ported changes
  * Fix for MidiQOL.moveToken and MidiQOL.moveTokenAwayFromPoint to avoid positioning tokens in the middle of squares.
  * Fix for workflow.castData.spellLevel when casting a cantrip, will now be 0.

### 13.0.2
* Port of 12.4.48
* Change to handling of saving throws when not auto checking saves. Any saves rolled from the chat card will use the currently set roll mode for both players and GM. This is the same as the basic dnd5e behaviour.
* New options when auto checking saves via "none" as the player roll mode, "None (public roll)" and "None (private roll)", which will set the roll mode for the auto rolled player save.
* GM save roll modes will be determined via the auto check saves setting. (Private roll unless all see results plus rolls).

### 13.0.1
* Fixed a bug when rolling a bonus in optional.name fields which led to an term is already evaluated and immutable error.
**v12** ported changes
* Fix for sharpshooter flag
* If not checking save results, player saves rolled from the chat card will default to the player's roll mode and GM saves will be private GM rolls.
* Fix for edge case optional.name bonuses (each-turn/each-round) not resetting on new combat start.
* Fix for utility rolls not displaying correctly

### 13.0.0
* This is a testing version only and **not** ready for game play so that other module writers can tell what is not working. Requires dae 13.0.0 as well
* Remove reference to deprecated hooks in dnd5e (all the v2 versions).
* Remove support for legacy item.use, activityUse etc (activityUseV2 renamed to activityUse)
* Couple of bug fixes that have come to light.
 
### 12.4.44
* Fix for chooseEffects being called with the wrong arguments.

### 12.4.43
* Fix for triggered activities failing when triggered on tokens the player does not own. The activity use is now passed to the GM for rolling. This fixes Ice Knife in the sample items.
* Undid the "respect target value passed in attackRoll call" changes. This should fix problems with AC bonus/Cover calculations when checking hits.
* Fix for workflow.castData not being set when item is set to not consume the spell slot.
* Fix for gm rolls incorrectly displaying hit/miss on player chat logs when not auto checking hits.

### 12.4.42
* Some fixes for concentration item rolls not respecting the calculated save dc.
* Roll tooltips for player saves are now always available for player's rolls if at least save results are displayed.
* Added back attack roll and damage roll buttons to tidy sheet 5e item details. These buttons roll and attack/damage without triggering a workflow, i.e. checking for hits/applying damage.
* Ability to specify the roll mode for player auto rolled saves. This can be overridden by the item settings. Meant as a way for the gm to configure things so players always see each others rolls.
  - For GM auto rolled saves the default remains to not show any roll chat card.
* Fix for workflow.castData being incorrect for scroll casting.
* Change so that effect choice dialog is only shown when the effect is going to be applied.
* Added merge requests
  - Add a reference to the triggering activity for chooseEffects.
  - Respect target value passed in attackRoll call when checking hits.

### 12.4.41
* If autoCheckSaves is "none" player rolled saves will use the user chat mode instead of always being private.
* Fix for forwarded activities not respecting consumption.
* Fix for activation automation not respecting item attunement/equipped.
* Fix for overtime activities not responding to confirm button.
* Fix for flanking/flanked calculations with large tokens.
* Fix for running items when there is no preferredGM (or is inactive) and there is no active GM on the current scene.
* If an activities "otherActivity" has a saving throw/ability check and the base activity does not,display the save/check buttons for the other activity in the chat card. Only displayed if the settings include showing the save/check buttons.

### 12.4.40
* Fix for critical modifiers not working on manual damage rolls.
* Fix for Slayer's Prey item reference to the wrong activity.
* Fix for midi-sample-items shove item throwing token permission error. Thanks @thatlonelybugbear
* Fix for versatile key not working.
* Fix for potent cantrip flag not working.
* Fix for activity overtime effects to use the source actor for calculating saving throw DCs etc.
* Fix for ammunition deleted by consumption not being picked up in damage rolls.
* Fix for damage being displayed when a non-gm makes a blind roll.
* Fix for damage on save helper text not being displayed - thanks @Michael
* Added flags.midi-qol.grants.bonus.damage.all/mwak/heal etc. The first target will be checked for the flag and if present will be treated as extra damage to be rolled.
  - e.g. flags.midi-qol.grants.bonus.damage.mwak override 1d4[cold] will add 1d4 cold damage to the damage rolled against the target.
  - If damage type is specified the assumed damage type will be the same as the first line in the item damage.
* Added new setting Preferred GM, which tells midi which GM to pass roll requests etc to. Only set this if you have the case of multiple GMs active and requests for rolls/reactions are sent to the "wrong" GM otherwise leave it as "none".
* New option (in the mechanics tab) Activation Automation. Allows auto rolling of self targeting activities that trigger on long/short rest, start of combat, turn start/end in combat. 
  - Options are: (default chat)
    - "None": no processing of any end of turn/start of turn etc activities.
    - "Chat": (same as default dnd5e behaviour) a link to the activity is displayed in chat.
    - "Auto"; self targeting activities are auto rolled, others display the activity in chat.
      - Item "Regeneration (Activity Only)" added to sample items as an example. This is probably the simplest implementation of regeneration and requires no macros or active effects.
      - When set to "auto" midi will **not** trigger turnStart activities on combat end. This is different to dnd5e behaviour which will generate a chat message for such activities.
      - If the use condition is not met the activity will be silently failed, although a message will be logged to the chat log.
* Changes to Midi Custom Sound Config to make it more forgiving when a Playlist does not exist.
  - When saving/updating midi will warn of any sounds missing from playlists that are referenced in the settings.
  - If you create a playlist by hand you will need to refresh/save settings for it to be picked up by Midi.
  - Saving settings when there are sounds that are not present in the playlist (or the playlist is not present) is now allowed, but you'll be warned.
  - References to sounds that do not exist in the specified playlist are prefixed with "Missing:".

### 12.4.39
* Fix for using monks token bar and skill checks for check activities.
* Fix for other activities not functioning when set to auto. Thanks @michael

### 12.4.38.1
* Remove some testing code accidentally left if - thanks @Elwin

### 12.4.38
* Fix for incorrect dc being used when doing concentration checks chat message+roll.
* Fix for concentration/saves auto completing with a "1" result when not auto rolling saves in some combinations of settings.
* Fix so that "not checking saves" leaves dnd5e save buttons on the chat card if remove all buttons is not set.
* Fix for flags.midi-qol.optional.NAME.save.xxx custom ItemMacro not being able to roll the macro.
* Fix for globalThis.MidiQOL not being correctly initialised.
* Fix for target AC display when a target grants an attack bonus.
* New set of flags, flags.midi-qol.rollModifiers.damage.itemOrActionType.damageType.
  - itemOrActionType can be all/weapon/spell/feat/tool/mwak/msak/heal etc
  - damageType can be all/piercing/fire etc
  - you can specify any of the dnd5e roll modifiers, like r<3, x etc, i.e. any of the foundry roll modifier strings.
  - The modifier will be appended to each of the dice terms in the damage roll.
  - change priority can be used to specify the order in which the modifiers are added to the roll.
  so for example:
    flags.midi-qol.rollModifiers.damage.spell.fire override rr<3 and
    flags.midi-qol.rollModifiers.damage.spell.fire override x
    will roll spell fire damage as reroll any 1s or 2s and then explode the resulting rolls.
* Similarly for flags.midi-qol.rollModifiers.attack.itemOrActionType
  - itemOrActionType can be all/weapon/spell/feat/tool/mwak/msak/heal etc
* For macro writers.
  - preTargeting and preItemUse macro calls now include usage, dialog and message in the options variable.
    - these are "live" versions, so changes made will affect the rest of the workflow. i.e. options.dialog.configure = false will skip the configure dialog for the activity.

### 12.4.37
* Fix for counting every attack as an Attack of Opportunity.
* For Macro writers
  - Added new versions of the preItemRoll and preTargeting hooks,
    - preItemRollV2(workflow, usage, dialog, message)
    - preTargetingV2(workflow, usage, dialog, message)
  - The existing hooks are still called with the existing signatures
    - preItemRoll(activity, token, config, dialog, message)
    - preTargeting(activity, token, config, dialog, message)
    In both of the old form hooks workflow can be accessed via config.workflow.
  - For all the versions of these hooks, Workflow.getWorkflow(activity.uuid) will fail, the workflow is not recorded until after the chat card is created.

### 12.4.36
* Fix for chat card damage button not picking up critical hits when not auto rolling damage.
* Change to attack/damage roll behaviour - backing out of the roll configuration dialog no longer aborts the workflow.
* Addition to triggeredActivityIds. You may now use an activity identifier (shown on the midi-qol tab) rather than an ID or uuid. This should make enchantments that add triggered activities simpler since you will know the identifier of the activity you added via the enchantment.
* **Breaking** Adding effects when reaching 0 HP now supports toggling defeated in the combat tracker via check boxes, one for player characters (and tokens they control) and one for GM controlled actors.
* For Macro writers
  - moved pre-targeting macro/hook calls prior to targets being set.
  - preItemUse hooks/macro calls prior to item card being displayed.
  - moved incapacitated check prior to item card being displayed.
  - moved verbal/somatic/material checks prior to item card being displayed.
  - moved use condition check prior to item card being displayed.
* Updated dragon slayer weapons to not require attunement.

### 12.4.35
* Fix for rolling attacks/damage when actor sheet is popped out.
* Fix for completeItemUse not actually doing anything in some cases.
* Fix for AoE template checking - thanks @thatlonelybugbear
* Change to otherActivity selection, activities must be marked as Other Activity Compatible for the activity to be used as an otherActivity.

### 12.4.34
* Fix for failing to scroll to bottom when waiting for a manual damage roll.
* Don't display targets if the activity affects no targets.
* Set default otherActivity to none for save/check/use activities.
* Remove otherActivity setting from summons, cast, damage, forward, enchant and heal activities.
* Some more tweaking of completeActivityUse

### 12.4.33
* Fix for check activities not passing the workflow in config.
* Expunge an accidental reference to activity.targets
* Fix for some backward compatibility problems in computeCoverBonus - midi will still accept an item in the computeCoverBonus call, but this should be switched to an activity.
* Disable changing targets in the damage roll once set.
* Fix for error thrown when pre roll workflow checks fail.
* Target confirmation now include range/cover for more activity types.
* Fix for ignoring alt/ctl/shift when auto rolling an attack.

### 12.4.32
* Thanks to @michael for adding ability to consume activity uses in optional effects:
  flags.midi-qol.optional.NAME.count OVERRIDE then one of
    ActivityUses.identifier.special-mace.super-attack
    ActivityUses.partialNameMatch.mace.super
    ActivityUses.id.iLKpfoGF7rGpvNWD.NegUUOdFH35S3xNi
    ActivityUses.exactNameMatch.Special Mace.Super Attack
    ActivityUses.Special Mace.Super Attack
* New midi property "Choose Effect". If an activity has multiple effects in its apply effect section, setting choose effect on the activity's midi-qol tab will prompt you to choose the effect to be applied when the activity is used. 
  - Only effects listed in the activity effect section are presented for selection.
  - This is functionally the same as having multiple activities, but can be less onerous to setup, i.e. only one activity but multiple effects. 
  - Currently only lets you choose one effect, but in the future this support a multi select.
* **Breaking** Midi properties for "toggle effect" and "ignore full cover" have been migrated to the activity midi-qol tab. They will remain on the item tab (and used) for a period to allow migration.
* Moved "add chat damage buttons" to the midi-qol workflow tab damage section. The previous setting will be auto imported on first load.
* Target confirmation now reflects the number of targets you are allowed to target and stops you from continuing if you have more than that selected.
  - Target list is now scrollable when it gets too long.
  - Fix? (not sure if it fixes all cases) of the disappearing tokens on display after using the target confirmation dialogue.I think this was related to target vision calculations during confirmation.
* Some reorganisation of when pre roll checks are done. You will see some cases where the chat card is displayed, a confirmation check fails and the card is removed. This will be refined over time.
* Fix for triggered activities when the template is an emanation template.
* Reinstated ability to apply self targeted effects even if there is no token for the actor on the scene. Generally the behaviour when there is no token on the scene should have improved.
* Fix for [Midi 12.4.31] Error in activities with "apply to self" effects.
* Fix for emanation templates throwing an error.
* Fix for Utility Activities aborting if auto roll damage was enabled.
* Fix for Attack activities and rolling from the advantage button on the chat card not working.
* Fix for most items in the midi sample items compendium having the wrong system version.
* When midi displays save targets prior to the save rolls being made it was incorrectly showing a fixed value of a dc 15 dex save no matter what the actual save should have been. It's now displays the dc and type of the first save specified.
  - if not auto checking saves midi will leave the correct dnd5e buttons for the save on display to facilitate manual checking.
* The dnd5e save buttons (if displayed) are inactive until the damage roll has been made. This is on purpose so that players know what is at stake when they need to do a save and because saves from the buttons are not recorded before the damage is rolled. Dnd5e buttons do not currently work with the auto check saves options (other than chat card). Will be fixed in a subsequent release.
* Fix for item use applied effects, now will exclude enchantment effects in application.
* Fix for template placement triggering workflow states twice.
* Made the apply/restore all buttons on the gm damage card readable again.
* Fixes for midi concentration handling:
  - The chat card options now correctly tests the returned roll (was ignored).
  - Enable/Disable "temphp damage triggers a concentration check", now works for all settings. Note this is a homebrew rule not official dnd5e
  - Whatever the temp hp setting, temp hp will be included when calculating the DC of any concentration check.
  - If concentration tracking is disabled in dnd5e the midi concentration settings panel will be unavailable.

**For Macro Writers**
* Fix for completeItemUse when targetsToUse and targetUuids are passed.
* Cleaned up workflowOptions and completeItemUseV2.
  - calling completeItemUse with configure.midiOptions =  {autoRollAttack:true , autoRollDamage "always", fastForwardAttack: true, fastForwardDamage: true}, auto roll and fast forward both attack and damage rolls.
  - workflowOptions passed to the workflow constructor will be stored and used during the rest of the workflow lifecycle.
  - workflow.rollOptions now is only used for event/keypress (or at the macro writers discretion other) once off roll configuration.
* I'm switching all of the damage application code to use actor Uuids instead of token uuids. 
  - By the time it gets to damage application you don't need the token anymore (although, if available, it is still included in the data), which is reversing a decision made ages ago when token.actor.uuid pointed to the base actor rather than the synthetic actor on a token. 
  - The upshot of this is that (amongst other things) over time effects can apply to actors with no token on the scene and all of the self target activities now work without a token on the scene. This is a work in progress so it will ripple further up the evaluation chain as time permits. 
  - The problem case is still application of active effects via dae which are sill via tokenUuid, but that will get revisited as well.
* Workflows can now be stored in chat cards (new world setting save workflow to chat card) - which means workflows can be accessed from any client and survive reload - fetch via MidiQOL.Workflow.getWorkflow(chatCardUuid). So you can complete a workflow from any client and complete an incomplete workflow after reload. 
  - It is still experimental and definitely not ready for game play. This can be enabled/disabled without requiring a reload, but toggling the setting will zero out all of the stored workflows.
    - Chat card updates for workflow state are piggy backed off the existing chat card updates, so there should be no (or very little) increased database activity.
  - There is also a setting to enable weak references which should reduce the memory requirements for midi - workflows are only stored in memory while active (actually subject to the whims of the garbage collector) and are subsequently recreated from the chat card if required and the save to chat card setting is enabled.
  - You should see no changes from all of this if you use full auto everything - since the workflow will run to completion before the reference to it can be lost.

### 12.4.31
* Don't remove existing workflow on construction as there could well be another workflow in flight.
* Slight change to behaviour in activity.use, if you pass a workflow in usage, midi will reuse that workflow rather than creating a new one. Can be useful if you want to pre-configure the workflow. (TrapWorkflow does this).
* Fixed a bug where an attack activity would return itself as it's own other activity if there were no others and it's set to auto.
* Midi was incorrectly removing a workflow when another was created in some circumstances.
* Fix? for flags.onUseMacro ItemMacro, macroPass.
* Included a new sample item mortar, which places a template then makes a ranged weapon attack against each target in the template to show off the attack roll per target in dnd5e 4.x. The idea of using a Use activity to target then a trigger activity to deal with the targets might have more general use.
* Added a world setting Use Weak References. Don't enable this unless you know what it means - only meant for GM and dev testing - will be removed eventually.
* Fix for the debacle with not being able to do most rolls.
* Roll an attack per target now respects the per item settings.
* Fix for optional bonus expressions (i.e. @abilities.int.mod * 2) not working, throwing an unevaluated expression error.
* When rolling a save activity the targets required to save is displayed prior to the rolls being requested so everyone can see who is saving (unless it's GM only) and after the damage is rolled.
* Fix for setting confirm targets on activities' midi-qol tab.
* Fix for flanking/flanked applied by players - thanks @thatlonelybugbear.
* Fixed dumb error in midi's flanked status effect - should work properly now.
  - if using Cauldron of Plentiful resources midi will automatically update the flanked effect.
* Fix for midi sound configuration not opening when the settings reference sounds that cannot be found.
  - Any referenced playlists or sounds that no longer exist will be flagged and you won't be able to save your settings until that is corrected.
* Added a use condition reason, which is displayed if the item use condition failed.
* Added game.time.worldTime as worldTime for condition evaluation. Used in sample items Revivify to check how long target had been dead.
* Added full target rollData as target. in condition evaluation.
* **Breaking** the flag flags.traits.idi.value now means downgrade damage immunity to resistance. If you want to completely ignore immunity, set flags.traits.idi.value **and** flags.traits.idr.value.
* Fix for problem when Auto Animations and Midi's autoRemoveInstantaneousTemplates sometimes causing AA to lose the template data and place the animation incorrectly. If Boss Loot Assets is active it will also remove the template too early for AA to get the information.
* Separate roll per target now will correctly do a targetless roll if you roll with no targets selected.
* Utility Activities got a little more love with the dnd5e button being displayed and rolls completing as expected and the various keys (shift/F) etc working.
  - Utility rolls currently auto fast forward based on the damage fast forward setting.
* When rolling a save activity and not auto rolling saves (via Epic Rolls/Monks Token Bar or midi's auto rolling) the dnd5e save buttons are left on display for the gm/players to use. They only have an effect after damage is rolled.
* Various improvements to damage application integration with dnd5e apply damage tray.
  - ignore damage immunity now displays as being applied in damage tray.
  - selected targets now include ignore immunity/resistance etc in damage try.
* Support for dnd5e always apply effects being applied by midi-qol.


* **For macro writers** Midi workflows are now keyed by the chatcard.uuid that spawned the workflow. Moving forwards to get a particular workflow you will need to use MidiQOL.Workflow.getWorkflow(chatCardUuid).
  - Midi inserts the workflow in the config and usage elements for most of the dnd5e rolls, e.g rollAttack(config,....), activity.use(usage,....) and the down stream calls. So hooking dnd5e.xxx should allow you to recover the workflow via config.workflow, or usage.config as appropriate.
  - For a limited period fetching workflows via activity uuid will continue to work.
  - If you are intercepting the dnd5e rollAttack/rollDamage etc functions to do processing config.workflow will be instantiated to the appropriate workflow.
  - Midi no longer stores any data in the activity, so activity.workflow and activity.targets will not be defined.
  - As a side effect of this change there can be multiple workflows active for the same activity and this should be correctly resolved.
  - During the deprecation period Workflow.getWorkflow(activity.uuid) will return the most recent workflow rolled for that activity uuid.
* Socketed completeActivityUse now correctly sets targets.
    

### 12.4.29
* Fix for Utility activities to display rolls in the chat card, like other activities.
* Fix so that auto consume is disabled when roll toggle is pressed.
* Fix for triggered activities not being properly prepared when rolled. (Affects saving throws amongst other things).
* Fix for reroll-with bonus not correctly looking up actor data when triggered via MTB.
* Fix for drag and drop targeting. Now works correctly in both gridded and gridless scenes.
* Fixes for spellSniper and sharpShooter thanks @Elwin.
* Cast and Forward activities cannot be selected as triggered activities due to issues with targeting, once resolved they will be enabled, but only for item owner triggered activities.
* Adjusted some flags for noAdvantage/noDisadvantage to apply to attacks and saves, checks and skill rolls.
* Fix for MidiQOL.chooseEffect not counting down the time remaining before timeout correctly.
For macro writers
* Fix for forced rolls via GMAction.RollAbilityV2 not correctly setting options for the roll. Manifested in contested roll not correctly picking up the skill requested, but would also affect any automated skill rolls.
* Fix for not passing correct workflow options to preTemplateTargets - thanks @Elwin
* Fix for various other typos/bugs thanks @Micheal @thatlonelybugbear.
* Slight re-organization of config settings and removal of some extra boxes on the config panel.
* First cut of support for separate attack rolls per target for attack activities.
* Removed support for the deprecated **system.details.race === 'notarget'** test for checking if a token is a valid target.
  - Added support for secret tokens to be ignored in targeting by midi.
* Removed searching item description for 1/2 "damage on save" etc, since it now must be specified in the relevant activity.
* As a first step to making workflows survive reloads (not really started in this release).... **Major breaking** workflow.uuid is now deprecated, since it was never a uuid that could be looked up. Workflow.id is now the preferred usage (and the key into Workflow._workflows) and is the same as workflow.itemCardUuid. For a short period workflow.uuid will return workflow.itemUuid, workflow.itemUuid is preferred for fetching the workflow's item's uuid.

### 12.4.28
* Fix for contested roll when using a skill. Thanks @michael.
* Added in some bug fix merges from @thatLonelyBugbear - thanks.
* Fix for 1/2 damage application when base activity is a check activity.
* New setting on activity's midi-qol tab. Display activity name - default false - if true the activity's name will be added to the chat card.
* Fix for failing to allow a roll when out of ammunition and a new ammunition type is selected from the configure dialog.
* Fix for flanked not being applied when targeted by non-gm.
* Fix for edge case bug where checking flanked/flanking for large tokens included squares covered by large tokens not in contact with the target token.
  - Adjusted flanking/flanked calculations to allow for exact distance measured worlds.
* New midi property for activities, rollMode so that you can force an activity to roll with a particular mode. Can be useful for some overtime activities (matches the roll mode setting in old overtime effects), but applies to any midi activity.
* Added flags.midi-qol.grants.noAdvantage/noDisadvantage.attack.all/rwak etc and deprecated (with warning) flags.midi-qol.grants.fail.advantage/disadvantage.attack.all/rwak etc.
* New Acid Arrow included in midi sample items, which implements the whole Acid Arrow spell with no macros, and uses a combination of overtime effects and triggered activities.
* Updated Regeneration included in sample items to use new overtime activities.
* Corrected Spider Bite sample item.
* New feature Overtime Activity effects. 
  - Any midi activity may be designated as an overtime activity. (If fact any activity can be used, but it may not behave as you'd expect).
  - There is a new midi effect flag, flags.midi-qol.ActivityOverTime (much like flags.midi-qol.overTime) which allows you to specify an activity to be called. This is either the uuid of the activity to call or the identifier of the activity on the same item as the activity applying the effect to the target. Be careful about referencing by uuid, as the activity's uuid may change if the actor/item is exported/imported to another world, compendium uuids should be fine.
  - For example, you have a bleeding effect which does 1d4 necrotic damage at the start of the target's and then if successful DC 12 con save is made the effect is removed.
    - Step 1. Create a Save activity (called Bleeding Save), which has a con dc of 12, and does 1d4 necrotic damage (full damage on successful save). You want the activity to target self (since it will be rolled by the actor that has the effect applied) but otherwise could be anything. Set overtime activity true, "turn start: and "save removes" on the midi properties tab for the activity.
    - Step 2. On the item's attack activity specify an effect to apply, flags.midi-qol.ActivityOvertime and enter bleeding-save in the field (or copy and paste the Bleeding Save activity's uuid)
  - The overtime activity's use condition will be checked before calling the overtime effect, i.e. attributes.hp.value > 0 (no point flogging a dead horse).
  - You can create multiple overtime change entries on the same effect and they will be executed in order of the changes "turn start", then "turn end", and priority (lowest first). So you can split effects to have some run at the start of the turn and some at the end of the turn and have an assortment of remove conditions and effects.
  - Overtime activities will use the spell level of the original cast to allow for scaling of damage in the dependent activity - disable scaling in the dependent activity if you don't want this to be applied.
  - When creating overtime activities make sure to have them target self - most of the time that is what you want.
  - You can include AoE activities as overtime activities (choose emanation or emanation no template to have them centered on the target token with the effect). Other target options will prompt for the placement of a template.
  - Any activity can be chosen as a dependent activity, so you could for example summon an imp each round or force a bagpipes check each round to avoid taking damage. I've not tested all activities as dependent activities, but save, check, damage and summon have been tested.


### 12.4.27.1
* Fix for infinite loop.

Although this is the first non-beta release midi has been working with dnd5e 4.x for more than a month so this release should be fairly solid. Please do read the following notes
* If you have not yet migrated to v4 you **really really** should make a backup of your world before installing midi.
* It is **strongly recommended** that when you first run the upgraded world that you disable all modules so that dnd5e can do it's best to migrate items.
* There are likely to be issues with any items that end up having a utility effect created (this means any item that has other damage defined) so please check them once updated and midi is enabled.
* If this is the first time you have run midi with dnd4, there are quite a lot of changes:
  - midi now uses activities, most directly for attack activities that can also roll extra damage, such as a spider bite via an "other" activity. This replaces the previous "other damage" mechanism. 
    - Have a look at the SRD spider bite item plus the spider bite included in the midi sample items (which shows a few tweaks).
  - Most midi properties are being migrated from the item to activities, which is not yet complete. 
  - Use/active effect conditions are now per activity (rather than per item - although the existing per item conditions are still supported while they are deprecated).
    - Reaction activities check the Use condition to decide if the activity should be offered as a reaction option.
  - Support for a triggered activity on all midi activities, which allows you to chain a new activity after the first activity is complete. Have a look at ice knife as an example use case for this.
  - The previous mechanism for area effect items centered on the caster have been revised.
      - Target range/self shape=radius/emanation will now auto place the template on the caster (the size of the template will scale with the size of the caster's token due to a dnd5e enhancement)
      - Target range/self shape=radius/emanation - no template which will auto target tokens within range of the target. 
      - To avoid targeting the caster in the template put the special target "self" in the target type setting.
* For some items (dragon slayer, life stealer, wounding) there is a new way to mange those items. The items in the sample items compendium are "generator" items (which utilise a very clever idea from the dungeon master's guide foundry module) which allow you to drag the generator's effect (an enchantment) to a target weapon which will imbue it with the relevant changes. 

### 12.4.27
* Midi-qol has been appv2ified, due to @michael many thanks for all his work to do this.
* Fix for tool rolls not returning the right sort of rolls and throwing errors in various cases.
* Clean up of initiative handling to be less intrusive - uses the newish dnd5e.preConfigureInitiative hook instead.
* Reinstated flags.dnd5e.initiativeHalfProficiency both as an active effect change and as a special traits setting.
* Fix for onUseMacro calls triggered by postTemplatePlaced not triggering.
* Fix for spell sniper and sharp shooter. Spell Sniper and Sharp Shooter can be set from the special traits popup on the character sheet or via active effects.
  * flags.midi-qol.sharpShooter is deprecated in favour of flags.dnd5e.sharpShooter.
* Midi now implements it's own flanking/flanked conditions and supports CPR's conditions if they are present in addition to continuing to support convenient effects flanking/flanked.
  - The GM can choose to disable midi flanking/flanked checking and apply the effects by hand from the token HUD which midi will still use when rolling an attack.
* New setting for gm/players requires an item that consumes ammunition to have at least 1 of the ammunition to be able to use the item. If insufficient ammunition exists when starting the roll configure dialog will be displayed to let you select different ammunition, if there is still insufficient ammo the item use will be aborted.

Known issues
* Roll statistics is not implemented for dnd5e v4 yet, roll statistics settings are not displayed at present
* Active defense not working.

### 12.4.26
* Sneak attack bonus now inherits the properties of the weapon that did the attack, i.e. magic etc.
* Fix for untarget options getting overwritten by GM settings.
* Fix for self effects (dae setting apply when rolling/applying active effects) not expiring with special durations start/end of turn.
* Fix for target confirmation not being shown on enchant/summons activities.
* App v2 changes - many thanks @michael.

### 12.4.25
* This is hopefully the last beta release - I will use it on my game tomorrow to make sure there are no major issues outstanding.
* Align origin set by midi-qol application of active effects to that of dnd5e.
* DamageOnlyWorkflow now completes via AllRollsComplete, rather than RollFinished, which means isDamaged will be called for DamageOnlyWorkflows.
* Using a legendary action won't be treated as a reaction when checking AoO is enabled.
* Rolling a death save will no longer trigger an error in bonusDialog.
* Fix for error being thrown when placing templates in some cases.
* Reenable apply damage buttons for players if set. Only targets they own will be displayed in the targets they can apply damage to.
* Fix for reach property usage - still uses item's range rather than activities range.
* A review of all the midi sample items which should work in v4.
* Fix for shove item to use Athletics for the attacker.
* Change so that attacks that do negative damage (i.e. healing) don't trigger isDamaged reactions.
* Fix for rolling saves/checks via Ripper's Epic Rolls.
* Fix for onTargetUpdate processing.
* Allow triggeredActivityId to be a full activity uuid. There is no UI support for this, but enchantments can set the field. Implemented to allow adding a triggered activity to an item (for things like weapon of dragon slaying) that won't clobber the base items behaviour.
* Fix for supporting changes to saving throw target value via dnd5e.preRollSavingThrow etc.
* Fix for itemMacro calls when the item that sourced the macro has been deleted from the source actor, e.g. consumables.
* Removed configSettings.v3DamageApplication.
* **Breaking** Now call the ammunition items macros for each midi state. 
* Moved to the latest version of @league-of-foundry-developers/fvtt-types, which results in 11 semantic errors on build (due to circular references) but otherwise is a good thing. Many thanks to @michael for holding my hand, and doing mammoth amounts of work, through this traumatic process.

### 12.4.24
* Fix for ignoring always confirm targets activity setting if no targets selected when activity rolled.
* Fix for optional bonus rolls being performed on player clients for failed saves not working.
* Fix for item details displaying as [Object Object] in chat card with dnd5e 4.2.
* Added optional bonus reroll-withBonus - thanks @thatlonbelybugbear
* Added identifier, exactNameMatch or omitted, partialNameMatch when matching activity names for optional bonuses - thanks @thatlonelybugbear
* Moved auto target details from the item midi-qol tab to the activity midi-qol tab.
* Finalised deprecation of idi,idr,idv,ida flags from items. Now are set per activity from the midi-qol tab.

### 12.4.23
* Fix for not evaluating some flags.midi-qol with mode custom when they should evaluate to a boolean.

### 12.4.22
* Fix for error being thrown when activity.use({},{},{create: false}) to roll an activity without a chat card.
* Fix for midi-check activity not picking up rolls without skill/tool and treating them as tool rolls.
* Fix for attempting tool checks via monk's token bar, which does not support them. Now handled automatically by midi.
* Fix for attempting to set allowCritical in damage rolls when not needed.
* Fix for not picking up attack/damage options when rolling from the chat card.
* Fix for drag and drop targeting not respecting automation only flags on activities.
* Fix for some errors with vision detection when using levels - thanks @thatlonelybugbear
* Allow roll toggle key (F) to function when rolling from the chat card.
* Some fixes for onUseMacro calling.
* Added ability to configure activities as suitable candidates for use by Midi's AttackActivity. Defaults to true for those that are possible other activities, damage, heal, save, check, utility.
* Requires dae 12.0.11

### 12.4.21
* Fix for dm.midi.amount.xxx, system.traits.dr.midi.mwak/etc fields not processing.
* Fix for saves/ability checks not displaying roll details.
* Fix for template targeting not recording targeted tokens in some cases.
* Fix for not picking up item enchantments when using an item (for example magicalBonus when doing an attack).
* Added Midi Enchnant, no extra functionality but allows pre-item use checks etc to be performed.
* Cleanup of system.traits.da.xxx keys.
* Respect trait bypasses for some of the "special" midi da/dr/dv/di/dm, midi.mwak, midi.rwak and midi.physical.
  - In particular dm.midi.physical allows you to set a maximum damage reduction across all physical damage, and bypass that via system.traits.dm.bypasses.
* Cleanup of midi fields and field browser data
* Requires dae upgrade to 12.0.10 or later

### 12.4.20
* Fix for workflows incorrectly being reused on subsequent activity/item uses - thanks @Elwin
* Reinstate target advantage, inadvertently disabled in 12.4.19
* Fix for optional bonus flags not working for skill/saves/checks from character sheet.
* Fix for interaction with CPR setting display DSN after all macros complete.
* Cometic change to treatment of flags.grants.attack.bonus.xxx, the bonus will be displayed on the chat card as a subtraction to the targets AC.
* Fix for flags.grants.advantage/disadvantage not being processed.
* Fix for error thrown with tidy item sheet - thanks @kgar.
* Fix for duplicate healing buttons on healing activities.

### 12.4.19
* Fix for template targeting when levels is installed and levels volumetric templates is not.
* Support for 2024 and 2014 heavy weapon disadvantage rules. Midi examines the dnd5e rules version setting to decide which to apply.
* Fix for template activities not having targets correctly recorded in dnd5e damage application.
* If auto removing instantaneous templates do not create an effect on the caster to remove the template.
* Reinstate damage absorption behaviour which was inadvertently removed.
* **Breaking** Change to damage absorption. 
- All of the damage absorption midi fields now support a numeric value indicating the multiplier to apply to the damage.
- system.traits.da.fire override -1 means that an actor hit with 10 points of fire damage will in fact cure 10 points. (The sign convention is in line with dnd5e damage modification). 
- A system.traits.da.midi.physical of -0.5 means the actor heals half the physical damage applied.
- system.traits.da.midi.mwak of 0.5 means the actor will take half as damage from melee weapon attacks and 1.5 means the actor will take half as much damage again as was rolled.
- You can (but will make things more confusing) combine dr/dv and da, so if you have system.traits.dr.value ADD fire and system.traits.da.fire -1 which will heal half the fire damage rolled (dr halves the damage and da converts what's left to healing), or system.traits.dv.value add fire system.traits.da.fire -1 which will heal two times the damage.

### 12.4.18
* Fix for monk's token bar saves not working.
* Fix for chat prompt saves not functioning.

### 12.4.17.1
* Fix for a couple of typos - thanks @thatlonelybugbear and @michael.
* Actually pass the token to the preItemRoll and preTarget hooks.

### 12.4.17
* Midi has changed how buttons are shown of the activity chart card for all buttons except attack and damage and now supports all dnd5e buttons being displayed on the activity card. As far as I can tell they work, but probably have not checked everything.
* Added new option in remove buttons to remove all.
* Attack activity "Other activity" default relabeled as "Auto" (which it was supposed to be).  
  - Midi will look for a suitable other activity when doing the attack and use it if present.
* Fix for summoning activity not displaying the right configuration dialog.
* Fix for utility activities (when used as attack activities other activity) displaying the utility roll twice.
* **Breaking** The signature for the hooks midi-qol.preItemRoll and midi-qol.preTargeting have changed. The arguments are now {activity, token, config, dialog, message}. You can fetch the item via activity.item and the actor via activity.actor. 
  - For a short period you will be able to recover the workflow via activity.workflow, but in a subsequent release the calls will be made before the workflow has been initialised.

### 12.4.16
* Fix for errors being thrown for group actors and damage calculation.
* Fixed a couple of bugs when rolling activities without any targets defined in the activity.
* Add isHitCritical special duration for target effect expiry. (requires dae upate).
* Added 1Critical and 1Fumble special duration for actor effect expiry. (requires dae update)
* Fix so that the place template button is not displayed for emanation AoE activities.
* Fix for critical damage (when handled by midi) with extra critical damage dice from the character traits setting and extra damage from the activity setting.
  - Note that the extra damage from the activity setting is NOT subject to the critical damage rules, it is just rolled as is. This is consistent with how dnd5e handles it.
* Fix for superSavers and semiSuperSavers not being recognised.
* **Breaking** All AoE templates will, by default, target the caster. This includes emanation AoE activities. To avoid including the caster put "self" in the special field. The current item property AoETargetTypeIncludeSelf is deprecated without replacement.
* Change to activity.identifier. If the activity name is not set the identifier will be the sluggified dnd5e activity name. This is done so that identifiers for activities will not change when the midi prefix setting is enabled/disabled.
  - This has no effect when a name for the activity, or an identifier is set.
* Midi will look at the choose targets field and if set will display the target confirmation app.
* All midi activities have the ability to trigger another activity (which starts a new roll/workflow (with a new chatcard) of the triggered activity).
  - There is also a trigger condition which must evaluate to true for the forward activity to be called.
  - This allows for arbitrarily long sequences of activities to be created.
  - You can choose which targets to use for the next activity. Template placement will override the target setting.
  - There is a rollAs setting to have the triggered activity rolled as if by someone else. An example of this is ice knife, which can now be implemented without macros. A sample ice knife is included in the sample items.
* Added config setting (misc tab activity name prefix - defaults to true) to put the Midi prefix in front of default activity name, if false activity names revert to the default dnd5e names. If boss loot FX is enabled this is force set to false so that default activity names are not modified by midi.
* Added activity choice dialog logic to completeItemUseV2 (i.e. if there is more than one possible activity to be rolled the player is given a choice dialog).
* Synthetic items being used (defined as no _id on the item) will have their item data added to chatMessages: (flags.dnd5e.item.data). To retrieve the item at a later time, use chatcard.getAssociatedItem() (which will work for any used item - not just synthetic ones and deals with deleted items due to consumption).

### 12.4.15
* Midi Conditions and most other fields are now on a separate midi-qol tab on the activity sheet. More properties will be migrated to that tab over time.
**Breaking** moved ignore damage resistance/immunity/vulnerability/absorption to the activity sheet midi tab. The existing fields on the item sheet will be supported for a short time.
**Breaking** moved confirm targets settings from the item sheet to the activity sheet midi tab without a deprecation period. You can now configure target confirmation per activity.
* AoE targeting now respects the max number of creatures/allies/enemies in the spell details.
 - Midi won't target more than the specified number of targets. The choice of which targets to exclude is arbitrary.
* Target Confirmation won't let you target more than the maximum number of targets.
* Fixes for emanation and emanationNoTemplate targeting.
* Fixes for TargetConfirmation sometimes being displayed twice.
* Fix for never displaying save dc.
* Added activity.identifer (for midi activities only) which is settable on the midi-qol acitivty tab and defaults to the sluggified version of the activity name, e.g. Midi Attack -> midi-attack. 
* If there is exactly one midi automation activity on an item the midi attack activity will preferentially chose that over other activities to use as the other item.
* If Boss Loot Assets premium/free is active, the auto delete instantaneous templates settings is disabled.
* Added a guard to hasCondition if system.traits.ci.value is not a set - which should not be the case. Turns out this is the case for group actors.
* **Breaking** completeActivityUse now returns the workflow (or workflow data) that the activity caused to be created.
* For overetime effects the actor with the effect is considered the target so all of the condition fields relating to the target are available, e.g. raceOrType. As currently none of the workflow fields are available.
* First stage of supporting activity macros. Requires DAE v12.0.6.
  - The midi tab on the activity sheet now has a button to create/edit the activity macro as well as the familiar pen on the sheet header. Thanks @michael for the code to add it to the header.
  - On the item sheet you can specify ActivityMacro (similarly to specifing ItemMacro) as onUseMacros. (Eventually this will be on an activity basis, but for the present it is still per time), but see below on how which activity macro is run.
  - If you only put ActivityMacro in the field then the macro associated with the activity being run will be called, if present. If not present will not throw an error/warning.
  - If you put a full uuid of the activity (i.e. ActivityMacro.uuid) then that specific activity macro will be run.
  - If you put something like ActivityMacro.Midi Attack, then the macro of the activity that matches the specified name on the item being rolled will be called (if present). Similarly with an id instead of a name.
  - You can also specifigy ActivityMacro.identifier (e.g. ActivityMacto.midi-attack) to allow you to specify identifiers that won't change it the activity is renamed.
  * Like ItemMacro onUseMacros, midi will instantiate macroActivity (the activity that provides the macro) and rolledActivity, the activity that is being performed. **Breaking** rolledActivity replaces **scope.activity** in the scope which is no longer supported.
  - **DamageBonusMacros** There is a limitation on this implementation that you can only specifiy either a complete activity uuid, an itemUuid (the first activity's macro will be run) or just ActivityMacro in which case the activity macro of the activity being run will be called.
  * DAE also has support for macro.activityMacro with similar semantics to macro.itemMacro
  * Added some new items, Wounding Weapon, Dragon Slayer - Weapon, Dragon Slayer - Ammunition and Life Stealer - Weapon to the sample items compendium. 
    - These allow you to convert an existing weapon (or ammunition for Dragon Slayer Ammuntion) to the enhanced equivalent.
    - To use these drag the Wounding Weapon effect (for example) to a target weapon (i.e. Longsword) and it will become a Longsword of Wounding with the appropriate damage, etc. To convert it back just remove the effect from the weapon. These are all based on  a pattern developed in the excellent (and improving) Dungeon Master's Guide premium content.
    - If playing with these I strongly recommend using TidySheet 5e since its item sheet correctly reflects changes made via the enchantment effects, while the standard dnd5e sheet does not seem to do so.

### 12.4.14
* Fixes for self applied effects, both always and if token hits.
* Fix for chat card targets not being set in dnd5e damage application.
* Fix for parenthetical terms and critical damage rolls.
* Tidy sheet now omits midi automation only activities from the drop down list - thanks @kgar
* Fix for Midi Check Activity not rolling the activity.
  - If you specify multiple tools/skills in a Midi Check the first in the list will be used.
  - If you specify a tool roll to be made and the target does not have the specified tool the roll will automatically fail.
  - If no tool is specified in the check activity, the item will be used for the tool check.
* Some rework of MidiCheck activity so that rolling the check, with no targets selected/specified will cause the owner of the item to roll a tool/skill check. 

### 12.4.13
* Change to behaviour of replace activity setting. This won't affect most users.
- When enabled **ALL** activities that have a midi equivalent will be replaced with the midi equivalent which means very little setup is required as most activities will just work. If the setting is subsequently disabled or midi is disabled they will revert to the dnd5e equivalent.
 - Enabling this setting is recommended for most users.
 -  If the settings is disabled midi activities will be created separately to dnd5e activities and will disappear from the item if the setting is subsequently enabled or midi is disabled.  In additon SRD monsters/items will **not** trigger midi automation. Disabling this setting is only recommended if you plan to mainly use dnd5e activities and have a few midi activities enabled for special items or want to easily compare midi activity behaviour with dnd5e activity behaviour without needing to reload you world.

### 12.4.12
* Refactored min/max roll options for ability/concentration etc to align with dnd5e v4 settings. No longer uses setMin/MaxRoll.
* Fix for rolls not completing when auto roll attack is disabled.
* Fix for spells not scaling when damage is rolled from the chat card (instead of auto rolling).
* Fix for midi SaveActivity not being able to do critical damage.
* Fix for removing concentration not removing dependent effects.
* Fix for idi/idr etc not working.
* Fix for not supporting backwards compatible ability checks/saving throws/skill checks.
* Change to default midi key for roll toggle - turns out T is a bad choice when mixed with ctrl/alt. It is now F (toggle fast forward - which is what the key does now).
* All keyboard event processing now goes through the dnd5e event processing so it is all consistent.
* A little clean up to the midi UtilityActivity so you can have the choice to roll the utility roll or not.
* Added support for cast activities on items to be available for reactions. The item with the spell must be equipped and attuned (if required).
* Dropped support for magic items in reactions. Use the dnd5e cast activity instead.
* Fix for completeActivityUse overwriting workflowOptions thanks @Elwin

### 12.4.11.3
* Clean up some of the damage roll edge cases/buttons mentioned in 12.4.11 

### 12.4.11.2
* Fix for healing activities not working

### 12.4.11.1
* Fix for quick settings not being visible.
* Fix for GMAction completeItemUse calling the wrong thing plus clean up target handling.
* Fix for DamageOnlyWorkflow failing when passed "minimal" itemData

### 12.4.11
* Midi advantage/disadvantage/fastforward keys have been removed and midi now uses dnd5e key bindings throughout. 
* The dnd5e skipDialog/skipDialogAdvantage/skipDialogDisadvantage are now supported and will auto roll with a normal/advantage/disadvantage roll of the first activity on an item. There are certain to be some odd edge cases so please report anomalous behaviour, remembering that the keys only apply to the first roll in the activity.
* The versatile key (default v) now toggles versatile for an item. If the item is set to default roll 1 handed v+click will roll 2 handed and vice versa.
* The toggle key now reverses the default midi attack and damage roll fastforwarding. If you normally fast forward those rolls, using toggle will force the display of the configuration dialog.
* If an activity has more than one damage type specified, the configure damage dialog will always be displayed.
* Midi now checks when rolling a two handed or off hand attack that you don't have a shield equipped and will fail the roll if you do. There is a config setting in the mechanics section to enable/disable this check.
* More work on ammunition consumption checking. If you try to roll an attack and have none of the default ammunition, the configure roll dialog will be displayed so you can choose another ammunition type. (See also the gm/player setting to confirm ammunition usage).
* There is an addition option in mechanics to fail rolls if you try to roll without sufficient ammunition.
* When a token is marked as dead from failed death saves, the dead status will be displayed as overlayed and the unconscious status will be converted to non-overlay.
* Added new property on midi activities, midiAutomationOnly, which when set means the activity is only meant to be used in midi automation. Such activities will not be displayed when prompting for choosing an activity to roll (created MidiActivityChoiceDialog) and won't be displayed in the expanded list of activities on the character sheet (patched ActorSheet5eCharacter2 _prepareItem).
* Added some trivial behaviour for utility items, if there is a roll formula midi will always roll it and then proceed with the workflow. The result of the utility roll is stored in workflow.uitilityRoll.
* Support for MidiUtility activities as otherActivities. This only for legacy support since anything that a MidiUtility activity can do a MidiDamage activity does better.
* removed Hooks/onUsemacro calls to preambleComplete, use prePreambleComplete instead.
* Fixed a bug when auto applying CE effects and also an "apply to self effect" in the same activity.
**Breaking** Removed the midi property critOther without deprecation. Use the allow critical activity flag instead.
**Breaking** Removed the midi property offHandWeapon. Use the attack mode on the activity instead.

### 12.4.10
* Some fixes courtesy @micheal and @thatlonelybugbear.
* Add additional hooks called when doing a state transition
  - midi-qol.premades.pre/post.StateName which are called after onUse macros are called and after the midi-qo.pre/post.StateName calls.

### 12.4.9
* Moved replace core activities setting to main midi settings and tagged as requires reload.
* Fix for typo in monks support for saving throws.
* Fix for skill rolls not displaying dsn dice.
* Fix for concentration always being removed when using dnd5e concentration rolls - midi concentration item already works. Some clean up of the concentration code.
* When an actor reaches 0 hp and concentration auto remove is set no concentration save will be rolled, concentration is just removed.
* flags.midi-qol.max.skill.acr/per/etc is deprecated in favour of system.skills.acr/per/etc.roll.max
* flags.midi-qol.min.skill.acr/per/etc is deprecated in favour of system.skills.acr/per/etc.roll.min
* flags.midi-qol.max.ability.save.concentration is deprecated in favor of system.attributes.concentration.roll.max 
* flags.midi-qol.min.ability.save.concentration is deprecated in favor of system.attributes.concentration.roll.min 
* removed MidiQOL.setConcentrationData, MidiQOL.addConcentration functions.
* Death saves work properly again.

### 12.4.8
* Fix for damage button not working when extra buttons displayed.
* Fix for not fast forwarding rolls when adv/disadv/critical/nocritical buttons are pressed.
* Fix for cancel/confirm buttons not working
* Fix for player rolled saves not working..
* Fix to support old Monks Token bar for saves.

This is the first open beta for midi-qol in dnd5e v4. It is definitely a beta and not ready for full time game play. In addition it will take time for the supporting modules (CPR/MISC etc) to catch up.
It must be installed via a manifest install from https://gitlab.com/tposney/midi-qol/raw/v12dnd4/Changelog.md
You must install **dae version 12.0.2** or later avialble via url install from https://gitlab.com/tposney/dae/raw/dndv4/package/module.json
This version of midi also requires dnd5e v4.1+. 
This first v4 compatible release was 12.4.0, so see the complete changelog for what's changed at https://gitlab.com/tposney/midi-qol/raw/v12dnd4/Changelog.md

## Major Changes:
* Midi now uses activities to handle all of the actions that it performs, but for the moment also maintains a workflow for each activity being rolled.
* Midi provides its own version of most core activities.
  - You can configure midi to automatically replace core activities with midi versions - useful if you want to use midi for most activities. Otherwise midi activities must be manually added to items. (On this misc tab).
* The midi attack activity allows you to specify an additional activity - the "other activity" which supports things like spider bite. The other activity can roll a saving throw and/or apply damage and has its own effects. There is a new midi setting (on this misc tab), where midi will check the activity's item and if there is exactly 1 possible "other activity" midi will use it automatically. This is intended to make the transition easier and things like the SRD spider's bite attack will work with no changes required.
* Each activity has a "use" condition which must be met for the activity to be rolled.
* Each activity has an "effect" condition which must be true for the effects attached to the activity to be applied.
* non-merge card is no longer supported.
* Ranged template targeting has changed. Where previously you would specify a range and template type self/ally/enemy, now you specifiy either emanation targeting (which will draw a template centered on the caster) or "emanation - no template" which will target creatures within the specified template size.
* Most items from the midi sample items have been migrated to v4. A lot of them have changed (the name has v4 added if there are changes to the item).
* There is a lot less need for macros with the new dnd5e activity setup. 

## Known issues:
* Multiple templates are not yet supported.
* There are still some deprecation warnings which I will work to reduce over time.
* The major refactor of rolls in dnd5e v4.1 meant a swag of changes to midi - which seem to be working, but have not been as extensively tested as the rest of the midi migration to v4.
* A lot of the automatic migration of items, performed by dnd5e, when migrating to v4.x do **NOT** result in workable midi items, so you will have to check them on a case by case basis. Generally this is the creation of a superflous midi-utility activity.
* Active defence has not been implemented yet.
* No testing of cover calculations has been done.
* Vitality resource has not been tested yet.

## For macro writers.
* All of the existing macro calls/hooks remain supported, with the addition of passing the current activity to the macro.
* Many macros will require rewriting as many data elements that used to be on items are not on activities. Generally if you get an item deprecation warning you can try activity.xxx instead of item.system.xxx. Also the structure of damage.parts has changed and will require rework in all macros that reference it.
* Some midi features are no longer required, since activities give you a choice of things to do with an item without requiring any special code. A good example is lay on hands which is implemented using just core features, and choose blessing, which simply has multiple activities for you to choose from.

### 12.4.7
* Removed references to rolling/evaluating rolls with {async: true/false}
* Support for new targeting type - emanation - no template, which targets creatures within the template distance of the token using the activity. The replaces the previous settings for ranged targets. This, plus emanation targeting, replaces midi's previous solution for self centered template effects. The functionality is identical, but will require all such items to be edited to conform to the new scheme.
* Add MidiQOL.addDependent(document, dependent), which adds dependent as a dependent to the passed document.
* Fix for Healing Activities not rolling healing.
* Added activity to the availabe data in midi called macros.
* Fix for preActivitySave macros being called.
* Fix for ItemMacro calling for removed consumables.
* New setting for gm/players - confirm ammunition - if set whenever an item consuming ammunition is rolled (and there is more than one ammunition choice) the roll config dialog will be displayed so that you can choose the ammunition to use. In addition, if the current ammunition for the item is expired the dialog will be displayed so you can choose alternate ammunition. This replaces functionality provided by dnd5e scriptlets to prompt for ammunition consumption.
* Ammunition confers its properties (magical/silvered etc) on an attack made with that ammunition.
* Added combatRound, combatTurn and combatTime (combatRound + combatTurn/100) to condition data.
* Incapacitated actors can't take reactions.
* Reinstated over time effects removal on successful save (if set).


### 12.4.6
* Include changes from merge request 183 (deathSaveBonus)
* Include changes from merge request 184 (computeDistance)
* Include changes from merge request 185 (moveToken)
* Include changes from merge request 186 (stack overflow when displaying midi tab)
* Include changes from merge request 187 (modifyDamageBy)
* Include changes from merge request 188 (physicalDamageTypes)
* Include changes from merge request 189 (healedDamaged)
* Implement auto consume resources/spell slot settings.
* Implement auto template placement for emanation templates.
* First pass of TrapWorkflow implementation.
* Support dnd5e choose targets option - triggers target confirmation.
* Fix for DamageOnlyWorkflow. Reinstated support for adding damage to existing chat card.
* Fix for ammunition selector not displaying
* Fix for spell damage scaling not working.

### 12.4.5
* Couple of little fixes for critical/advantage settings

### 12.4.4
* Fixes for Tidy sheets to work again

* Known not working:
  - multiple template targeting.

### 12.4.3
* Added Heal Activity
* Reinstated dice so nice rolling.
* Fix for reactions with conditions not firing.
* Added in change for 11.6.25.1
* I may well have missed some other cases of not using the correct useCondition (still to be found) - so if it seems that the use condition is being ignored try putting the condition in the midi properties instead and I'll have a look

### 12.4.2
* Change dae dependency to 12.0.0 (in dndv4 dae branch).
* add changes for 11.6.25

### 12.4.1
* Changed workflow so that other damage supports arrays of rolls meaning other activities can return multiple damage results which will be included in the overall roll.
* If the only activities on an item are a midi attack roll and a single otherActivity that will be used by the attack roll (either by setting it in the attack activity or enabling auto merge activities in the config settings) midi will skip the choose activity dialog.
* A reminder, if it was not obvious, Check Activities can do damage/apply effects and can be used as other activities, so you can have activities that require an acrobatics check or take damage. 
* The otherActivity can be quite fliexible, for example Dragon Slaying Weapons are very simply implemented with an attack activity doing base damage and an "other" Damage activity with a use condition to ensure the target is a dragon.
* Items that require a to hit roll and a save with no damage/1/2 on save can be implemented with an attack activity that does no damage and a Save otherActivity (no need for dummy damage on the attack activity anymore).
* The module.json for the module has been updated so you can check for updates without having to install the zip file every time.
* Incorporated merge request from @michael - thanks.

### 12.4.0
This is an alpha test for midi and dnd5e v4.0. There has been a major rewrite of midi and there is a great deal still to do. It is likely that the workflow system will be reworked in the future to have more activity based workflows, but not initially.

This verssion requires dae version 11.3.65, which has not been publically released since there are reports of dae causing problems in dnd5e v4. I'm not aware of these so consider this also an alpha test for dae in v4.

Major changes
* Removed support for non-merge cards.
* Midi now uses activities to handle automation. 
* The workflow now contains the activity that initiated the worlfow.
* All of the existing workflow phases are still present and the onuse macro calls and hook calls still behave as they used to.

* Working?:
  - normal attacks with damage and effect application (see below).
  - items with saves
  - attacks with saves (via a save activity).
  - DamageOnlyWorkflow? at least one test case works.
  - calling onuse macros which are still setup per item. The workflow contains the activity that caused the macro to be called. If/when activities get proper flags I'll look at setting these per activity.
  - damage application
  - active effect application - see below for changes. Midi supports the "activity always apply effects" activity setting.
  - babonus optional effects causing the configure dialog to be displayed.
  - overTime effects.
  - most of the pre-roll checks, but not exhaustively tested.
  - Target confirmation
  - template targeting
  - reactions that don't rely on magic items. Needs much more testing/bug fixing. There is also no way to specify 0 cost reactions anymore. Either will need to hack the dnd sheet, add it as some sort of midi property or something else.
  - new config setting for players/gm - items with ammunition cause the configure aatrtack roll dialog to pop for attack rolls so you can choose the ammunition.

* Not Working
  - TrapWorkflow
  - DDB Gamelog
  - range template targeting (the new emmanation targeting).

* Midi implements "Midi Attack", "Midi Save", "Midi Check", "Midi Utility", "Midi Damage" activites.
  - All Midi Activities have an "acitivity use" condition and an effect application condition.
    - if the use condition evaluates to false the activity cannot be used. If no use condition is specified on the activity the item activation condition will be used.
    - if the effect condition evaluates to false the activities effects won't be applied. If no effect condition is specified on the activity the item effect condtion will be used.
    - The combination of the above is to allow some extra flexibiltiy, you can specify effects that are applied if the attack hit (even if there is a save) and effects that will only be applied if the save failed even if the attack hit. If an effect condition is present it must evaluate to true for the effect to be applied.
    - The default midi behaviour is to replace any existing core activities with the midi versions. Midi then takes over the initiation and configuration of use, rollAttack, rollDamage etc rolls. This can be disabled via configuration settings meaning that only hand created midi activities will cause the midi workflow.
  - The attack acivity adds the ability to specify a save activity or damage activity that midi will use to roll "other damage" for things like spider bite and so on.
  - The Midi Check activity allows you to add damage if the check (ability or skill) roll is failed.
- There is a config setting to have midi check that if the only activities on an item are a Midi Attack and one midi save/check/damage/utility activity, midi will automatically merge those and treat the item as if the "other" is linked to the Midi Attack Activity. This will cover the bulk of cases since most items will only have a single activity, possibly with a save activity.
* Midi Attack activites with effects will always apply the effects if the target is hit and the effect condition is true.
* Midi Save activities with effects will apply the effect if the target fails to save or the effect is marked as always apply. If the Save activity is linked to an attack activity then the target must be hit as well for the effects to be applied.
* Midi attack activities allow you to specify 1/2 handed and the default ammunition to use so that you can avoid the configure dialog if you want.
* Midi activities also have a force dialog setting that will cause the configure dialog to appear when the activity is rolled.

* getSaveMultiplierForItem is now deprecated since all save activities specify the save multiplier to use for the save.
* The config settings for rolling other have been removed as have the midi properties for those.
* The midi properties for save multipliers on the midi tab have been removed.
* The midi properties have not been migrated to be activity properties, so they remain on the item. This includes activation, other damage and reaction conditions. Which are the fallback if the item activities do not specify a use or effect condition. Eventually the conditions will be removed from the midi properties.

### 11.6.25
* Fix for display hit miss check mark to players when it should not be.

### 11.6.24 
* Fix for item dependents growing indefinitely.

### 11.6.23
* Fix for damage rolls not enriching the damage type on non midi chat cards.

### 11.6.22
* A merge from @thatlonelybugbear
### 11.6.21
* Some cleanup of traits.dm.midi.xxxx. Midi won't include damage types none or midi-none when applying dm.midi.xxx.

### 11.6.20
* The Fix sticky keys setting should now really fix sticky keys (thanks @kgar).
* Fox for some edge cases of complete item use not resetting targets.

For Macro writers
* Fix for addRollTo not preserving roll options.
* Rolls that benefit from an optional bonus will have flags.midi-qol.optionsUsed (an array of strings) updated to list the optional bonuses applied.
  - workflow.attackRoll and workflow.damageRolls[0] will have the annotated roll.
  - Added workflow.tokenSaves which is an object keyed by token uuid containing the save roll
  - rolls returned by actor.rollAbilitySave, item.rollAttack etc will have the flags set.

### 11.6.19.1
* Fix for bug introduced in 11.6.19

### 11.6.19
* Fix for not applying system.traits.dr.midi.xxx when "Only use the most effective Damage Reduction" is set to on.

### 11.6.18
* Fix for targets being incorrectly set when initialising workflow if no token is attached to a workflow.

### 11.6.16
* Fix for error when checking canSense when casting spells/features

### 11.6.15
* Fix for rolling other damage with single concentration check false throwing an error and not applying other damage.

### 11.6.14
* Fix for token can see target checks

### 11.6.13
 * Updated full auto quick setting to be more usable.
 * Fix for error being throw when not using single concentration check.
 * Fix for completeItemUse not completely setting up the item to be rolled when passing the request to the GM.
 * Fix for completeItemUse not returning when the workflow is aborted - will now return the aborted workflow.
 * Fix for some edge cases when checking if a token can see another - thanks @thatlonelybugbear
 * Updated Sneak Attack feature to inherit the weapon properties, like magical attack etc, to fix an error when monsters have resistance to non-magical (for example) weapons.

 ### 11.6.12
 * Fix to make group actors untargetable for spells/weapons.

### 11.6.11
* Fix for max stack depth exceeded when applying 0 damage to a target. (A combo of core/SimpleCalendar/Midi behaviour - but it's easiest to fix in midi).

### 11.6.10.1
* Fix for typo "midi-non" in Hooks
* Fix for error thrown with pre 11.6.10 midi undo damage card.

### 11.6.10
* **Breaking** Midi 11.7 will remove the option for the non-merge card. There are simply too many things that are difficult to support correctly in the non-merge card case.
* Fix for saving throws dice tooltip showing the wrong modifier to the save.
* Reinstated behaviour of color hit/miss save display miscellaneous setting to apply to attack results and save results. This applies after the dnd5e settings to display attack/challenge are processed. I expect most people to set this on.
* Added Only Highlight critical attack/fumble attack rolls - default false. When set attack rolls are only colored on critical/fumble not hit/miss. (overrides dnd5e settings). I expect old school enthusiasts to have this on, the rest off.
* Fix for workflowOptions.damageRollDSN and workflowOptions.otherDamageRollDSN not working. These settings only work for the merge card.
* Support select hit targets and select missed targets from chat card context menu.
* Fix for Apply Temporary HP in chat card context menu.
* Fix for concentration, all options (chat/chat+roll/midi item) now support flags.midi-qol concentraton settings and system concentration setting (adv/save bonus etc).
* Re-implement support for workflow.workflowOptions.noConcentrationCheck when rolling the midi concentration check item. Not supported for chat message concentration options.

### 11.6.9
* Change to not call post action hooks when aborting.
* Preserve options used between dnd5e.precalculdateDamage/dnd5e.calculateDamage and midi's calls to dnd5e.preApplyDamage/dnd5e.applyDamage

### 11.6.8
* Make Hammer of Thunderbolts RAW - belt/gauntlets do not need to be attuned.

### 11.6.7
* Fix for not displaying correct total damage in apply damage card.
* Add removeBonusActionUsed and removeActionUsed to MidiQOL.
* Added Hammer of Thunderbolts, requires effectMacro. As far as I can tell this is a complete implementation of Hammer of Thunderbolts.
  - If the item is equipped and attuned and you have equipped (and attuned) gauntlets of ogre power and equipped (and attuned) a belt of giant strength
    - the strength bonus will be applied +4
    - a new item hammer of thunderbolts thrown will be added to the player inventory that does the whole thrown hammer effect/damage.
  - Warning there is a bug in foundry that if you have a belt of giant strength equipped and attuned plues gauntlets of ogre power equippped and attuned the actors strength will become undefined. Suggested fix, set the gauntlets of ogre power's effect to be override 19 with a priority of 1.

### 11.6.6.1
* Fix for non-damage spells failing to complete.

### 11.6.6
* Fix for effect does not exist error when auto removing concentration, the actor goes to 0 hp, and incapacitated is applied.
* Fix for hasCondtion failing when passed a string actorUuid.
* Updated Hunter's Mark item to illustrate a good way to roll bonus damage, damage type, critical and flavor are all set so that the roll will do the right type and amount of damage and the item name will appear in the chat card.
* Updated Mace of Disruption to show the preferred way to add extra damage for a roll. This checks that the target failed the save, has <= 25 hp remaining, is a fiend or undead and if so adds just enough damage to take the target hp to 0. It also adds a descriptive line so you can see why there was extra damage.

### 11.6.5
* Fix for incorrect total damage display on the apply damage chat card. Cosmetic only.
* Fix for double counting temphp when applying damage.
* Fix for ignoring damage resistance bypasses.
* damage type "no-damage" again does no damage to the target.
* clean up the player damage card being shown with the new damage application details.

### 11.6.4.3
* Fix for error thrown when deleting dependents (e.g. templates etc) if there is a non-gm logged in.

### 11.6.4.2
* Re-enabled magic items spells as reactions.

### 11.6.4.1
* Fix for removing template's (etc) dependents.
* Fix for items that just do tempHP healing.

### 11.6.4
* Changes to dependent handling to remove a race condition when deleting dependents.
* Fix for the midi-qol.preTargeting hook not aborting the workflow.
* Added createDamageDetail to globalThis.MidiQOL.

* More changes to damage application - targeted at macro writes.
  - added createDamageDetail to MidiQOL global.
  - Midi now calls dnd5e.preApplyDamage with values that match what dnd5e does - should resolve the problem with Custom 5e.
  - Eventually midi will move to only processing dnd5e damages when applying damage. This is only relevant to macro writers that change the amount of damage done.
    - With this release midi will still process changes performed by update ditem.hpDamage. If that does not match the damage from ditem.damageDetail (which is the rolled damage after immunity/modification is applied) midi will report an error, but use ditem.hpDamage
    - There is a new config setting (settable by program/hand only) configSettings.useDamageDetail (defaults to false) that when true will only accept the damage in ditem.damageDetail and still report discrepancies. Useful for macro writers to check if there are any changes needed.
    - As well as ditem.damageDetail there is ditem.rawDamageDetail which is the damage rolled before immunities/damage modification was applied.
    - some fields names in workflow.damageList have changed.
    - workflow now supports workflow.damageDetail and workflow.rawDamageDetail etc. Where damageDetail is updated after the damage is calculated against the actor, rawDamageDetail is always the rolled damage.

### 11.6.3
* I've rewritten gridless handling in midi-qol. The fudge factor has returned (for some settings) and is an amount midi reduces the evaluated distance by so that tokens can still hit when "near" to a target without using a micrometer to make sure they are next to the token.
  - For EQUIDISTANT(1), APPROXIMATE (1.5), ALTERNATING_1 (1/2/1) and ALTERNATING_2 (2/1/2) the attacking and target token are snapped to the nearest grid position and then the distance is measured using the square grid measurement.
    - For APPROXIMATE **only** the fudge factor is subtracted from the returned distance if there is at least one diagonal in the distance measure, since otherwise you can't hit from a diagonal corner.
- For EXACT(1) and RECTILINEAR the tokens are **not** snapped to the nearest grid position.
    - For EXACT if there is a diagonal in the measurement Math.SQRT2 * fudgeFactor is subtracted from the measured distance, otherwise fudgeFactor is subtracted from the measured distance.
    - For RECTILINEAR if there is a diagonal in the measurement than 2 * fudgeFactor is subtracted from the measured distance, other wise fudgeFactor is subtracted.

* Another change to damage handling. Midi follows the dn5e mechanism of applying tempHP **after** damage calculation. So if an attack does 20 hp damage and 15 points of temphp healing, 20 points of damage is applied and then 15 points of temp healing is applied.
* Midi now calls (and use the results of) dnd5e.preDamageApplication.

### 11.6.2
* Fix for temp hp calculation and dnd5e damage apply buttons

### 11.6.1
Some bug fixes:
* Fix for optional conditions with numeric value and non-custom settings - thanks @michael
* Fix for fetching unconscious condition - thanks @Elwin
* Fix for multiple advantage/disadvantage conditions sometimes throwing an error.
* Update for gridless distance measuring.

* This release **only** supports using dnd5e damage application - which is significantly better than midi's native damage application. Most things are unchanged when comparing between the two. 
  - The most obvious differences are that the apply damage buttons on the chat card are now the dnd5e v3 buttons, which are greatly superior to what midi provided.
  - The second obvious difference is that the midi flags flags.midi-qol.DR have migrated to system.traits.dm.xxx and system.traits.dm.midi.yyy. Also **the sign has changed** so system.traits.dm.slashing override -5 will reduce incoming slahsing damage by 5, +5 will increase the damage done.
  - lastly the tooltip on the midi damage card has been enhanced to give a detailed list of all the damage applied and what resistance/modifications were applied.

* Eventually you will need to migrate all of the flags.midi-qol.DR and flags.midi-qol.dr settings to the corresponding dnd5e settings. Midi will automatically map existing flags to the new structure to give you time to migrate

* **Damage Reduction** There is a slight change in the way damage reduction (modification in dnd5e terms) since dnd5e supports damage modifications itself. Midi now uses the dnd5e damage modification and adds some extra features.
  - Any traits.system.dm.xxxx (i.e slashing/piercing etc) are applied to incoming damage. These are always per damage type and are always applied by midi - the calculation is wholly handled by dnd5e.
  - After those damage modifications are applied the midi specific ones are applied. The midi specific damage modifications are calculated and added as an extra damage entry (with a negative sign) to account for the reduction. So if damage of 8 points slashing and 8 points poison was applied and the target had 3 points of poison modification (system.traits.dm.poison -3) and 7 points of all modification (system.traits.dm.midi.all -7), the display would appear as 8 points of slashing, 5 points of poison (due to the poison specfic modifcation) and -7 points of DR for a total of 6 points of damage.
  The system.traits.dm.mid can **only** be set via an active effect.
  - The possible values for damage modification (reduction) are: 
    -system.traits.dm.midi.all: Applies to all remaining damage in the attack
    - system.traits.dm.midi.abil/ench/other/heal/spell/summ/util/mwak/msak/rwak/rsak: These look at the action type of the item and apply accordingly
    - system.traits.dm.midi...
      physical: applies if the damage is physical. This type **only** respects the actor modification bypasses.
      non-adamantine-physical: applies if the damage is physical and the weapon is not adamantine
      non-magical-physical: applies if the damage is physical and the item causing the damage is not magical
      non-silver-physical: applies if the damage is physical the item causing the weapon is not silvered
      non-physical: applies if the damage is not physical
      magical: applies if the item is magical
      non-magical: applies if the item is not magical
      spell: applies to spell damage
      non-spell: applies to non spell damage
  * When applying system.traits.dm.midi modifications, the midi setting to only apply the highest damage modification or to let them accumulate applies, but **not** to the system.traits.dm.slashing etc.

**Damage Resistance etc**
* Due to popular demand (well at least form Moto Moto) I added back the custom dr/di/dv/da settings that were previously deprecated.
  * The existing midi behaviour for system.traits.dr/di/dv.da continues, but now is implemented using the dnd5e calculations
* Midi also provides some extra features for damage resistance/immunity/vulnerability and adds damage absorption.
  - damage absorption turns damage of the appropriate type into healing.
  - dnd5e does the calculation for system.traits.dr/di/dv.type and midi does not change that.
  - Midi also supports some custom values (system.traits.dr/dv/di.custom) which may make things easier     
    - spell: Applies if the item applying the damage is a spell.
    - not-spell: Applies if the item applying the damage is not a spell.
    - magic: Applies if the item has the magic property  
    - non-magic: Applies if the item applying the damage does not have the magical property
    - physical: applies if the damage type is physical. This is a simpler way to specify damage resistance etc, to all physical types compared to ticking all of the various physical damage types and remembering to update if you add an extra physical damage type. This setting **only** respects any bypasses set on the actor.
    - non-magical-physical: Applies if the damage type is physical and the item applying the damage does not have the magical property.
    - non-silver-physical: Applies to physical damage if the item applying the damage does not have the silvered property.
    - non-adamant-physical: Applies to physical damage if the item applying the damage does not have the adamantine property.
    - If you specify overlapping resistances, e.g. non-spell and non-magical, resistance will only be applied once.
  - These can be applied via an active effect (sytem.traits.dr.custom etc) or by entering **exactly** the custom type above into the custom field, which is a semi colon separated list.
  - Currently these does not support dnd5e downgrade, it is all or nothing for the protection, downgrade = not applied.

### 11.5.0
* Requires dnd5e v3.3+
* Requires dae 11.3.47+ - now uses Schema Fields for any midi added fields.
* midi branch is now dnd33 (not dnd3) for those forking.
* Support for Dfreds Convenient Effects v7+ (foundry v12).
* A fix to remove flanking when using an item that does not benefit from flanking.
**midi-qol 11.4.48 remains available as a module.json install** from the foundry package page for those not on dnd5e 3.3+

### 11.4.48
* Support (correctly) flags.midi-qol.fail.spell.vocal (previously verbal).
* Fix for error thrown in ChatMessageMidi when using dnd5e 3.1.x

### 11.4.47
* Fix for arrow keys stuck after dialog v2 open in v12.
* Fix for npc vision not being refreshd after lighting changes for targeting.
* Fix for distance calculation to wall when wall-heights is enabled.
* Fix for tooltip display in tokaenDamageMany when using v3DamageApplication.
* Effects added vi choseEffect from an item that has concentration will now be added as dependents to the concentration effect. Meaning they will be removed if concentration is lost.

### 11.4.46
* As far as I can tell dnd5e damage application is now feature complete. Baring any issues I'll do the 11.6 release next week.
* Support for immediately removing templates for items with duration instantaneous, rather than currently waiting for the end of turn. Configurable via setting.
* Added isConcentrationSave, isConcentrationSaveSuccess, isConcentrationSaveFailure special duration expiries.
* Added confirm(title: string, {content: string, defaultYes: boolean}) to midi sandbox meaning you can have flags that prompt to be applied, e.g.
flags.midi-qol.advantage.ability.save.dex override confirm("Advantage because of a reason"), which will prompt whenever you do a dex save. Only available in async evaluated conditions, which is almost all of them. 
  - You do not need to await the confirm call, midi will replace confirm with await confirm when evaluating the expression.
* Added contestedRoll to functions available in condition evaluation.
* Fix for broken bonus action checking.
* Fix for gridless grid in v12. Now supports/uses the full range of core measurement settings. There is no support for the fudge factor in v12 since it is built in to the core settings.
* Changes to MidiQOL.computeDistance, the first object passed must be a Placeable (token, light, tile, sound) and the second can be a Placeable or a wall. Walls blocking is not supported when measuring distance to a wall, but height of the wall is included.
* Fix for damage amount passed in Hook call to dnd5e.preApplyDamage.
* Fix for attack rolls being highlighted as hit/miss when dnd5e setting is set to disable it.
* Removed workflow.concentrationData and actor.flags.midi-qol.concentration-data.
* Fix for arguments passed to preTargetDamageApplicaiton with dnd5e damage processing to match midi-qol damage application.
* preTargetDamageApplication will now replicate the midi-damage application with damageItem.damageDetail, rather than damageItem.damageItem.
* Fix for completeItemUse thanks @thatlonelybugbear.
* workflow.workflowOptions.targetConfirmation will now take precedence over other settings, thanks @motoMoto, @thatlonelybugbear.
* Converted MidiQOL.applyTokenDamage to use dndv3 damage application if enabled.

### 11.4.45
* Fix for ddb gamelong and undo workflow enabled throwing an error.
* Reinstated hover/click/right click for targets in target display.
* Recommended settings for dnd5e damage application in v3.3+, if auto applying damage and effects, dnd5e "Collapse Trays in Chat" set to Collapse All, midi setting for collapsible targets set to unchecked.
* Some changes for non-merge cards to work better with 3.3 (and probably 3.2) damage processing.
* Fix for some non-merge card oddities (duplicate targets in multi target select), very large token in chat card
* Fix for applyTokenDamageMany failing

### 11.4.44.1
* Fix for Math.clamp error

### 11.4.44
* Better fix for sticky keys thanks @Andrea
* Custom bypasses now work with midi-qol damage.
* Fix for chat card display broken when checking for hits and only GM sees.
* Midi mostly respects the 3.3.1 dnd5e setting Attack Roll Visibility. The most restrictive setting takes precedence, and disabling hit checking in midi takes absolute precedence.
* Change so that collapsible targets is only available in dnd 3.3+

### 11.4.43.1
* Fix for not being able to disable automatic template removal.
* Fix for mace of disruption when not using dnd5e damage application - create a dummy details that is ignored in midi damage application.

### 11.4.43
* Fix for levelsVolumetricTemplates not getting elevation set correctly in v12.
* Fix for reaction/bonus action checking failing in v11 when using Convenient Effects set to replace status effects.
* vocal/somatic/material flags now can be conditions instead of true/false.
* Fix for completeItemUse not using targeted tokens by default.
* **Breaking** To sidestep a problem with midi accelerator keys getting stuck when using the electron app, midi will now clear all such keys when the roll completes. This means you will have to release and press the advantage key (for example) after each attack .
* Midi marked as compatible with dnd5e 3.3. A sight change to hit target displays to align with dnd5e chat card.
* Option to use collapsible targets, as dnd5e does, set in the misc tab.
* Fix for bonus damage rolls with max critical damage dice.
* Fix for item.getRollData(), which would overwrite the system.type information with item.type. You can get item.type (i.e. weapon/feature etc) from rollData.item.itemType. rollData.item.type will be item.system.type.
* dnd5e damage application now uses the same data structures as midi-qol damage application.
  - single/dual concentration checks now work.
  - player damage card now works.
  - Should now call the right isDamaged hooks/onUse macros (WIP). Only oldHP, hpDamage, oldTempHP, tempDamage, oldVitality and newVitality are "live" (i.e. used in calculating damage applied), changing these will change the damage appied to the target. Others are cosmetic only for the reverse damage card.
  - Now calls dnd5e.preDamageApplication to allow macros to block/modify damage application after all calculations are complete. Passes the updates that will be applied to the token, providing a last place to modify the damage applied.
  - workflow.damageItem is the live damage item being processed inside the hook/macro call.
  - for other hooks pcalled rior to damage being calculated workflow.damageList is the live damage that midi will apply,
  - As well as the dnd5e.preCalculateDamage and dnd5e.calculateDamage hooks (called by dnd5e), midi will call midi-qol.dnd5ePreCalculdateDamage and midi-qol.dnd5eCalculateDamage, same arguments as the dnd5e hooks, but guaranteed to be called after midi has done its calculations. The damages object passed in these hooks is "live" so changes made will affect the damage applied to the target, These hooks are not async. 
  - The hooks will be called multiple times for the same item roll as dnd5e calls calculate damage multiple times due to the chat card updates. When processing the hook you can check options.midi.applyDamage. If true this is the calculate damage call that will actually apply damage to the target.
  - See Mace of disruption for a damage hook/onuseMacro combination that works with both dnd5e/midi damage.
  - Macros/hooks have the ability to include flavor text in the damage application tooltip. damageItem.details is an array of strings that will be included in the reverse damage chat card. See mace of disruption for an example.


### 11.4.42
* Fix for super savers and semi super savers in dnd damage application.
* Fix for @item.level references in other damage rolls.
* Fix for typo when checking diseased conditon - thanks @thatlonelybugbear
* Fix for activation dontions not working - thanks @thatlonelybugbear
* Added flag setting for manually applying reactions - thanks @thatlonelybugbear

### 11.4.41.1
* Fix for wrong combat round flag being used in reactions/bonus actions.

### 11.4.41
* Support uncanny-dodge with dnd5e damage application. Updated uncanny dodge item to check attacker visibility.
* Enable support for ddb-game-long again. If using make sure to enable it in both midi's settings and ddb-game-logs settings.
* Added flags.midi-qol.grants.noCritical.all/attack type. This will eventually replace flags.midi-qol.fail.critical.all/attack type.
* Support apply damage right click for midi chat cards, will pick up the damage rolls, but won't apply immunity/resistance to selected tokens.
* Reactions
  - midi now creates reaction and bonus action status effects. These are used elusively by midi when managin reactions/bonus actions - CE/CLT effects are no longer used.
  - You can configure the midi status effects by modifying CONFIG.statusEffects. Do so with care.
* Change so that attack advantage is only processed once.
* Changed item use condition evaluation to be async.
* Corrected minflags condition evaluation to be async.
* Changed reaction condition to be async evaluation. 
* Corrected evaluation of flags.grants.critical.attackType to be async.
* Concentration
  - Call dnd5e.preRollConcentration/dnd5e.rollConcentration hooks are now called when using the midi concentration item.
  - Option Chat + auto roll will now only display a simplified chat card and auto roll the concentration save.
* Remove reference to now non-existent alernative token cover setting, which means using alternative token cover now works again. thanks @thatlonelybugbear.


### 11.4.40.1
* Fix for conditionData not initialising correctly.

### 11.4.40
* Fix for DamageOnlyWorkflows not applying.
* If you use Monk's combat details you need to choose either Monks or Midi to apply the dead status (when reaching 0 HP). Either is fine but both will result in errors about duplicate/missing effects in embedded collections. Midi troubleshooter will generate an error if both are enabled.

* Two new options for flags.midi-qol.optional.NAME effects
  - flags.midi-qol.optional.NAME.activation, which determines if the optional effect is available. If present it must evaluate to true or the optional effect will be skipped.
  - flags.midi-qol.optional.NAME.force, which determines if the optional effect should always be applied. If present and it evaluates to true the effect will be auto applied and not appear in the dialog.
  - The flags are checked in order, so .activation first (and if it's false .force will have no impact) then .force.
  - if .activation and .force mean there are no effects that the player can choose from the dialog will be skipped.

### 11.4.39
* Midi has it's own method for working out what types of damage are present in a damage roll. DND5e v3.2 introduces a much better solution. 
* If you have version 3.2 of dnd5e installed midi will automatically use this better way of working out the damage present. 
  - As a byproduct of doing this, issues with parenthetical rolls (@item.level) * 1d4 [for example] are resolved and apply the right damage. The support for this is better in foundry v12 (the chat card will be correct) than in v11 (the damage breakdown will display incorrectly).
  - This change works with both dnd5e damage application and midi damage application.

### 11.4.38
* Midi will now recongnise the core statusEffect "Hiding" (or hidden) as providing advantage/disadvantage when set. Added MidiQOL.removeHiddenCondition(tokenRef) and midiQOL.removeInvisibleCondition(tokenRef).
* new option to completeItemUse, options.ignoreUserTargets which, if set, causes completeItemUse to both ignore game.user.targets (only using options.targetUuids) and to leave game.user.targets unchanged during the call.
  - overtime effects now set options.ignoreUserTargets when rolling the overtime item. Should resolve the interaction between overtime effects and monk's combat details.
* Fix for setting damageRolls options.properties incorrectly.
* Fix for regression in 11.4.37 for flanking.
* Fix for regression in 11.4.37 not displaying apply effects buttons when requested.
* Token macro "isTargeted" will trigger even if the item being used does not have an attack.
* export removeReactionUsed in MidiQOL.
* Updated some items for dnd5e 3.x, changes to attunement checking mainly, removal of some deprecation warnings for macros.
* Rewrite of Flaming Sphere to use dnd5e summoning instead of warpgate. Casting the spell will (if no flaming sphere actor exists) create one in the game which will be used thereafter. Supports spell scaling for all damage and requires Active Auras.
* Fix to shield spell, thanks @thatlonelybugbear

**For Macro Writers**
* Added support for user created workflow classes. 
  - item.use(config, options), now supports config.midi.workflowClass, which must be a subclass of MidiQOL.Workflow, which will be used when constructing a workflow
  - midi-qol will now use globalThis.MidiQOL.workflowClass when instantiating a workflow when rolling an item, so you can change the default class midi will use when using an item - use this at your own risk. It must be a sublcass of MidiQOL.Workflow.
  - midi-qol predefines UserWorkflow, which extends Workflow, as a handy way for you to experiment with custom workflows. Change UserWorkflow however you want (perhaps via libwrapper/monkey patching) and use that when doing an item.user(config, options) or (better) you can define your own class which must extend MidiQOL.Workflow.
  - When a workflow is created, the created workflow starts in the WorkflowState_NoAction state and is marked suspended until item.use creates the chat card, manages targets and signals that processing is complete and will then transition to WorkflowState_Start. You can change that behaviour by overriding Workflow.WorflowState_NoAction, or having the constructor perform a different state, which is what DamageOnlyWorkflow does.
* Two new hooks called by midi, "midi-qol.ready" and "midi-qol.setup", called after midi's ready/setup processing is completed. globalThis.MidiQOL will be created and complete when "midi-qol.setup" is called, so can be used for user defined workflow creation.
* An FYI I discovered. If you run a macro on preItemUse, any spell will have rolledItem.system.level set to the base level of the spell since the user has not chosen a spell level yet.

### 11.4.37
* Fix for incorrect processing of some damage details passed to doEffects.
* Remove deprecation warning for debounce in v12
* Switch to newer multi select for blind rolls choices.
* Fix for dsn integration breaking in v12
* Fix for action save overtime dialog messages being wrong on skill rolls.
* Fix for multiple damage lines not inheriting the weapon properties correctly, in particular magical/silvered etc. when using dnd5e damage application. The change is noticeable when using CPR Sneak Attack, which would do non-magical sneak attack damage even if the weapon is magical.
* Fix for not setting fastforward to false for rolls with optional babonuses defined.
* Fix for weapons target single opponent overriding specific settings for the item. Thanks @Michael
* Support for auto expiring summoned creatures when the summoning item has a duration. Enable via config flag.
* **Breaking** Skill/Save/Check rolls set to be blind will also be blind when the GM rolls them.
  - if a roll is set to be blind, the before and after chat card will also be blind.
* **Breaking** Midi concentration is now fully deprecated in favour of dnd5e concentration. 
  - The concentration automation setting has been removed and if was enabled midi will enable dnd5e concentration automation and disable midi-concentration.
  - All of the other midi concentration settings still apply.
* **Breaking** SRD thrown weapons are defined as melee weapons with the thrown property (dagger, dart etc). Accodingly midi's checking for nearby foes granting disadvantage has changed to
  - If the item is making a ranged attack (rwak/rsak) a nearby foe will cause disadvantage.
  - If the item has the thrown property and mwak/msak and the range is less than the disadvantage threshold midi will treat the attack as a mwak/msak and not apply disadvantage to the roll.
* **Breaking** Midi damage application decides if damage is magical/silvered/adamantine based only on the item's properties used to roll the damage. These properties are inheritied for EVERY damage roll (base damage, bonus damage/other Damage). So a non-magical weapon with Hunter's Mark will do non-magical damage.
  - DND5e Damage application assigns the weapon properties to all base damage rolls and OtherDamage roll, bonusDamage rolls have their own independent properties. So a non-magical weapon doing Hunter's Mark damage can do magical Hunter's Mark Damage.
* Preferred route for bonus damage rolls is now to return a DamageRoll, which allows you to specify additional damage properties. e.g. for Hunter's Mark return await (newDamageRoll("1d6", {}, {properties: ["mgc", flavor: "Hunter's Mark"]})). The existing mechanism is still supported.

### 11.4.36
* Midi's config panel will now put in english versions for any options missing from the translated version in drop down lists.

### 11.4.35
* Display saving throw results when using non-merge cards - which was broken.
* Fix for audio-helper error when using midi sounds.

### 11.4.34
* Fix for overtime effects not expiring correctly when players advance the combat turn.
* Fix for physical damage bypasses not working in dnd5e 3.2 using midi damage application.
* Special durations on applied enchantments now work.
* Fix for detecting vision when global illumination enabled.
* More changes for tokens unable to see attacker. Should now work with levels 3d canvas.
* Added workflow.targetsCanSee, workflow.targets.canSense, workflow.tokenCanSee, workflow.tokenCanSense. These are sets containing targets that can see/sense the token using the item and which of the targets the token can see/sense. This is set just after targeting is complete. These values are available in condition evaluation via canSee/canSense (the token can see/sense the target) and target.canSee/target.canSense (the target can see/Sense the token doing the attack).
* **Breaking** for dnd version 3.2 and above effect.addDependents has been retired, you should now use effect.addDependent[...arrayOfDependents] instead of effect.addDependents[arrayofDependents]. 
* For v12, Math.clamped is replaced by Math.clamp. Math.clamped will return a deprecation warning.

### 11.4.33
* Fix for some deprecation watnings thrown in v12
* Fix for undo workflow throwing errors.
* Fix for checking distance not working in v12 latest.
* Fix for displaying 2 actor on use macro buttons on the dnd5e 3.2 character sheet.
* Include saving throws in dnd5e damaage application as well as midi damage application. Midi will remember the saves status for a target and will display (and apply it) in the 5e damage application buttons.
* Fix for new attunement data in dnd5e 3.2

### 11.4.32
* Fix for ItemMacro onuseMacro effects when the effect is subject to coentration not working.
* Added socketlib/libwrapper not installed to Trouble shooter.
* Added macroPass and tag to workflow when calling macros.
* Added findNearbyCount which returns the number of nearby tokens, rather than a list of nearby tokens that findNearby does.
* implemented hp.dt (damage threshold) for dnd5e damage application, already works for midi-qol damage application.
* More fixes for changes thanks @Elwin

### 11.4.31
* More v3.2 changes thanks @Elwin

### 11.4.30
* First cut of changes for dnd5e 3.2

### 11.4.29
* **Breaking** Midi no longer supports concentration on weapons. DnD5e now has an expanded list of items that support concentration and midi aligns with that. The midi concentration property has been removed and you will need to edit feats/tools that support concentration.
* Moved midi to now **always** use dnd5e concentration dependents for effect removal. 
  - The existing midi settings are still supported
  - If midi concentration automation is enabled:
    - There will only ever be one concentration effect on an actor.
    - actor.flags.midi-qol.concentrationData will still be set.
    - Automatic concentration checks will roll a concentration item rather than putting a message in chat (just like it always did).
  * Concentration saves now has multiple options, none - don't do any concentration save processing, Chat Message Only - display a chat message with the save roll button (only valid if using dnd5e concentation), chat Message + Roll - display a chat message and automatically roll the save (only valid if using dnd5e concentration), item - use the existing midi concentration item roll, which will display the item card and the results of the save.
* Fix to application of temphp damage in dnd5ev3 damage calculation.
* Enable target preview when using 3d volumetric templates in a 3d world.
* Yet another adjustment to including height in range attacks. thanks @spoob
* For Macro writers
  - Overtime effects moved from _preUpdate to updateActor hook. Overtime effects will now be handled after the combat tracker has updated, rather than before. There may be some other interactions because of this.
  - Added attackTotal to hitsDisplayData
  - Change to behaviour when all attacks miss. This will not complete the workflow unless workflowOptions.forceCompletion is true (which it is for completeItemUse workflows and single attack per target workflows). The preferred way to ensure that the workflow does not complete unexpectedly is to use the confirm workflow setting.
  - Fix for complete item use not returning in some cases.
  - Fix for MidiQOL.applyTokenDamage ignoring any saves passed through.
  - Additional option for completeItemUse, asUser: userId which will route the item use to the specified user's client if active, else to the GM.
  - Added ``asyncHooksCallAll("midi-qol.hitsChecked", workflow)`` which is called after hit's checking is completed but before hits are displayed. Should allow altering the hits results. Only called if auto checking of hits is enabled.
  - Updating actor concentrationData via setConcentrationData(actor, data) will also update the dependents the concentration effect associated with the data.item or the first concentration effect midi finds otherwise.
  - getConcentrationEffect has changed to getConcentrationEffect(actor, itemRef?), (itemRef is a string itemUuid, an item name, or an Item) if no itemRef is passed midi will just return the first concentration effect it finds, otherwise it will search for concentration associated with the itemRef and return that if it exists.
  - Added effect.addDependents to add an array of dependent documents.
  - Added support for workflowOptions.onlyOnUseItemMacros, which if true means only call Item onuse macros (not actor onUse macros) when processing the workflow.

### 11.4.28
* Overtime effects
  - Fix for not displaying targets sometimes.
  - Support for an item Uuid in the itemName field.
  - Fix for overtime effects throwing an error when an invalid damageType is passed.
* Support for charcter's damage rolls to be averaged (in addition to npc rolls). It's a world setting so applies to all characters. Options are none/npcs/characters/all actors
* Previoulsy items that dealt damage (or healing) or applied active effects would only display the list of affected targets if there was an attack roll or a save. Midi will now display the list of affeted targets for such items. (Cure wounds is a good example).

### 11.4.27.3
* Fix for overtime effects not rolling the saving throw for non actionSave effects.
* Fix for damageOnlyWorkflow not setting the roll correctly when specifying a damage amount.
* Change so that player save roll total are always displayed in the save results chat card. Only non-player owned save results are hidden.

### 11.4.27
* Added setting for lowest user role that can access midi's item properties tab. (Requires midi properties tab to be enabled and a change requires a reload on all clients if using tidy-sheet).
* Correct the display AC settings not working.
* Reinstate special expiries not firing for (at least) "isHit".
* Enforce single target per attack for weapon attacks will take precedence over none target setting in the item when checking if targets are selected/required.
* Fix for error thrown when removing unconscious from npc tokens.
* Fix for overtime actionSave dialog not completing when player save timeout is 0/undefined.
* Bonus dialogs now display only the label for macro bonus actions. If debug is enabled they will display the macro that will be called when the bonus is used.
* A little clean up of the reaction dialog too.

### 11.4.26
** Make sure to upgrade dae/times-up as well**
* Fix for non merge cards displaying damage rolls twice (once in the item chat card and once in the damage card).
* Fix for preItemRoll macros setting workflow.aborted not aborting workflow.
* Fix for overtime effects with magicSave set consuming a spell slot thanks @thatlonelybugbear
* Added flags.midi-qol.fail.disadvantage.heavy to the list of auto complete items
* Added isTargeted token macro trigger. Called before the roll is validated, but after targeting. Allows changing of workflow targets for example. @Elwin
* Added isPreAttacked macro trigger. Called before reactions are checked. @Elwin
* Fix for displaying hits in the merge card. AC was not being shown to the GM (it is now always shown to the GM). AC is also shown to the players if the target is owned by a player. If the show AC setting is enabled in workflow settings AC for non-player owned targets will be displayed, otherwise hidden from players. The dnd5e setting  challenge visibility is checked to disable showing AC to the players.
* Overtime rollMode. The specified roll mode will be applied to all chat cards display when processing the overtime effect. The exception is actionSaves from the actionSave chatcard (see below) as there seems to be no way to get dnd5e to roll the save other than default roll mode.
* Chat card item info display has been tweaked. The default behaviour is to display item info for both GM/PC for all items (previous default was to display none). There is also a quicksetting to enable displaying all item info in chat cards.
* Added sample divine strike item which integrates with dnd5e life domain advancement to roll 1d8/2d8 bonus damage on weapon attacks. It's interesting because it has a passive effect to provide the damage bonus which expires on a hit and an each turn macro to renable the effect, which being passive is simply disabled on expiry. Makes for a pretty simple item.
* Updated regeneration effect to whisper the results of the effect to the owner - players now don't see that the troll regenerated and know they have to do something.
* Changes to overTime action saves.
  - There are now two modes, roll or dialog. The previous treatment as a boolean is deprecated.
  - By default if you specify actionSave=roll (and for a limited time only "true"), midi will display a chat card with a roll save button that the player can click to do the action save for each of the possible saves.
    - The roll can be clicked any time until the turn is ended. If the player clicks on the button the appropriate save will be rolled and the result adjudicated. 
    - If you set dnd5e display challenge visibility that will be respected when displaying the chat card.
    - At the end of the players turn, or after they do a roll the chat card(s) will be removed.
  - New option for overTime effects. actionSave=dialog, will (at the start of the charcters turn) present a dialog to the user indicating that the character can roll an action save with buttons for each of the possible saves,and if confirmed roll a saving throw and if successful remove the effect. Turn start effects will still be processed.

* **For dnd5e damage application only**. I've changed the behaviour of the midi specific effects for healing.
  - Any of the midi system.traits.dm.midi.non-magical etc will not apply to healing damage
  - Similarly the system.traits.dr/di/dv.custom fields won't apply to healing damage.
  - healing damage is any damage type listed in game.system.config.healingTypes.
  - Fix for healing not applying in some cases.
git 
### 11.4.25
* Fix for gridless grid not triggering correctly - thanks @Michael
* Fix for end of turn over time effects not firing when skipping forward a whole round.
* Fix for players forcing a gm rolled save throwing an error.
* For item/actor onUse macros, which are either world macros or functions, macroItem will **always** be the same as rolledItem.
* For macros tirggered via flags.midi-qol.onUseMacro, macroItem will refer to the item source of the macro (for ItemMacro change.values) or origin of the effect that applied the flag (scope.macroItem for function..../Macro./ItemMacro macro calls).
* If dnd5e hide challenge visibility is set, midi will hide the results of hits/saves in the hits/saves display, both the DC/AC and result of the roll.
* **Breaking** As of this release references to item in onUse macros will **always** refer to the rolledItem. You must use **macroItem** to refer to the item that is the source of the macro. This has had a deprecation warning since v11.2 of midi.

### 11.4.24
* Ensure fulldam/halfdam/nodam midiproperties are cleared when editing an item
* Tiny/small creatures using a heavy weapon will do so at disadvantage. Added flags.midi-qol.fail.disadvantage.heavy which disables it.
* First pass of reporting deprecation warnings for {async: false} dice rolls.
* Fix for monk's token bar not picking up midi advantage/disadvantage settings. A side effect of the fix is that when using alt/ctrl on the monk's card alt=advantage,ctrl=disadvantage no matter what the midi settings are.
* Added MidiQOL.addConcentrationDependent(actor, dependent, item?) which will add dependent (which must support dependent.uuid) to the entities to be deleted when concentration is removed from the actor. If using midi concentration midi will find the existing concentration, if it exists. If using dnd5e concentration and an item is passed midi will add the dependent to the concentration effect corresponnding to the item, if it exists. If item is not passed midi will pick the first concentration item it finds, if any. If midi can't find a concentration effect/concentration data on the actor nothing will be done.
* Fix for midi sometimes removing attack/damage buttons when an attick misses.
* added doSyncRoll - which will test synchronous rolls for v12 compatibility - it will provoke a warning for invalid rolls in v11 and ignore dice terms in v12. So look for warnings about rolls that will fail in v12.
* First pass at v12 compatibility - so far all are backwards compatible to v11
  - remove lots of deprecation warnings in midi/dae/
  - changes to gridless to work with the new grid scheme.
  - changes to canSee/vision processing to work in v12
  - discovered bug in dnd5e check distance in v12 - will need to wait for a fix in dnd5e for that.
  - Added some warnings for dice expressions not supported in v12. These still work in v11 but will fail in v12 and so are warned in v11 midi/dae
  * Most flags.midi.xxxx.xxxx do support dice expressions in v12. This has meant that a few internal functions have changed from sync to async
  * There is now evalAllConditions and evalAllCondistionAsync, the async version will allow dice expressions and returns a promise so must be awaited.
  * evalCondition now takes an additional option async, when true evalCondition will allow dice expressions and returns a promise, so needs to be awaited.
  * In v12 new Roll("1d4").evaluate({async: false}) will not work as expected, you need to do (await new Roll("1d4").evaluate()). evalCondition with async true will support such expressions.
  * In v11 any of the reported issues are meant to just be warnings - so if something breaks let me know.
  * some changes to deal with foundry v12 getProperty not working with an undefined object.
  
### 11.4.23
* Fix for auto setting dead when death saves fail and using CE.
* Fix for midi incorrectly returning true for "empty" condition flags.
* Fix for midi properties being overwritten by old version flags (often manifests as other damage saves not being settable).
* Fix for flags.midi-qol.advantage.mwak/etc throwing and error and applying.
* Incorporated some new styling courtesy @andrea
* Some clean up of damage calculation problems in midi damage calculation for special flags.
* Updated mulitattack automation item - thanks @christopher
* Fix for flags.midi-qol.max.ability.save.concentration thanks @Michael
* Fix for flags.midi-qol.advantage.concentration thanks @PaLaDiN-X
* Updated midi sample item hunter's mark to work with dnd5e 3.1+ (now requires dnd5e concentration).
* Added dependents to Actors, Items, TokenDocuments, TemplateDocuments, WallDocuments, TileDocuments, AmbientLightDocuments, AmbientSoundDocuments.
  - use with document.addDependent(entity) - add entity as a dependent of document (provided entity.uuid exists).
  - When document is deleted any dependents are also deleted.
  - Added document.removeDependent(entity) - remove the entity from the documents dependents.
  - Added example scalable weapon spell that creates a weapon in the casters inventory and links it to an effect which will delete the weapon when the effect is deleted/expires.

### 11.4.22
* Mark actors as dead/defeated if they fail their death saves.
* Some more tidying of the config app.
* Fix for not using babonus saveDC correctly - thanks @thatlonelybugbear
* Fix for error being thrown when using remote completeItemUse - thanks @Elwin

## 11.4.21
* Fix for dnd5e damage application failing when SaveDRdr is selected and the target saves
* Fix for concentration saves failing if the actor's owner is not logged in.
* Fix for damage rolls failing when damage debug is enabled and adding chat damage buttons.
* Fix for temphp healing in dnd5e damage application. midi will apply the healing correctly - there is some strangeness in dnd5e's treatment of temphp so dont trust the damage buttons.
* Added a settings search field to the midi config app which will hide settings that don't reference the text, e.g. attack/save or whatever. Thanks @theRipper93
* Fix for "cannot delete xxxx from embedded collection" when concentration effects expire and using dnd5e concentration checking.
* When evaluating condition flags (e.g. advantage) midi was only evaluating the last applied flag. Midi will now check all effects that apply the flag and evaluate them. Midi will treat the result as a boolean and return true if any of the evaluated flags return true.
* As well as evaluating the conditions, midi will track the results and set flags.midi-qol.evaluated.advantage.xxx (etc), to {value: result, effects: Array<string>} where effects are any effects that evaluated to true. If there are no effects, but the flag is set effects will be ["flag"].
* Updated the advantage attribution to include the name of the effect granting advantage. Not as nice as the advantage reminder module, but better than it was.

## 11.4.20
* Added flags.midi-qol.max/min.ability.save.concentration.
* Fix for not setting template height correctly when using levelsVolumetricTemplates.
* Fix for flags.midi-qol.critical/noCritical not being deferred evaluation.
* Made DamageOnlyWorkflow a little more tolerant when passing unawaited/unevaluated damage rolls.
* Do not display dnd5e effects application buttons if midi set to remove apply effects button.
* Disable midi concentration automation if dnd5e concentration enabled.
* Improve prompt for overtime action saves.
* Fix for otherDamage condition being ignored when using dnd5e damage application.
* As a reminder dnd5e damage application is still experimental. I've run one session with it and will do another tomorrow. I'm hoping that some brave souls will tinker with it.
* For dnd5e damage application - damage absorption will disable dr/dv/di for the target damage type. 
* For dnd5e damage application - absorption will not absorb healing types.
* For dnd5e damage application only. Implemented system.traits.idi/ida/idr/idv.damage type|all to ignore targets damage immunity/absorption/resitance/vulnerabiltiy when applying damage of a particular type. Intended for some of the elemental adept features. Midi will apply damge ignoring the specified effect, but the dnd5e damage buttons will still have them enabled.
* For dnd5e damage application - fix for midi tooltip failing when doing healing.
* For dnd5e damage application only. Implemented custom system.traits.dr/dv/di/da:
      Non Silver Physical - not required/implemented, core dnd5e does this perfectly.
      Non Adamantine Physical - not required/implemented, core dnd5e does this perfectly.
      Non Magical Physical - not required/implemented, core dnd5e does this perfectly.
      Spell - rolled item must be of type spell.
      Non Magical - rolled item must not have magical property or midi magicDamage property and must not be a spell.
      Magical - rolled item must have mgc property, magic damage property or be a spell.
  - Only one of da, dv, di, dr (chosen in that order) will be applied for each of the custom types.
* With the addition of a magical bonus for weapons/equipment in dnd5e 3.1.x, which is enabled by the magical item property, it is now strongly advised that you change the midi setting "Require Magical Property" to "non spells do non-magical damage".
* Also note that legacy +x weapons or equipment are not migrated to the new magical bonus by dnd5e, so you will have to do that yourself, but so long as they are marked magical the damage will be treated as magical.

## 11.4.19
* Enable calling isDamaged/isHealded macros/hooks when using dnd5e damage application.
* Expire effects marked as special expiry isDamaged/isHealded when using dnd5e damage application.
* Correct error with saving throws not being rolled

## 11.4.18.1
* Incorrect package released in 11.4.18

## 11.4.18
* I think dnd5e damage application is ready for testing by other users.
* Fix for non-gm applicaiton of damage when using dnd5e damage application.
* Implemented all of the flags.midi-qol.DR.specials in dnd5e damage calculation. These are currently applied after resistance/immunity which is not RAW.
* Fix for overtime effects with type check failing. Thanks @hi25114
* More QA fixes courtesy @Elwin.

## 11.4.17
* When dnd5e concentration is enabled, and midi is configured to do a concentration check, midi will auto roll concentration (prompting the actor's owner) when a concentration chat card is displayed.
* Fix for a raft of bugs introduced by a bad auto format of the code in 11.4.16 - many thanks to the eagle eyed @Elwin

## 11.4.16.2
* Fix for rolling concentration saves whenever the player takes damage.

## 11.4.16.1
* Fix for blank damage types failing when doing damage application.

## 11.4.16
* Support for actorOnUse macro config in tidy sheet 5e - thanks @kagar
* Support for flags.midi-qol.bonuses.spell.all.damage which is a bonus added for any spell that rolls damage, not just msak/rsak.
* Added checkDistance(t1: any, t2: any, distance: number,  wallsBlocking?: boolean, ): boolean
* Negative DR.all will now mirror the damage display for +ve damage application.
* Allow midi to work with core concentration or with midi's own concentration. All of the midi concentration settings still work. You just choose disable midi's concentration automation and enable dnd5e's concentration automation or vice versa.
* Dnd5e will generate a concentration save card when required (rather than rolling a concentration item), midi will monitor the results of rolling that chat card and success/failure will leave/remove concentration appropriately.
* If CE/CLT has removed the dnd5e concentration effect midi will add one back.
* Midi concentration advantage/disadvantage and save bonus are applied to dnd5e concentration rolls.
* Support for removing concentration when all dependent effects/templates are removed from targets.

* First support for using dnd5e's damage calculations instead of midi's. Whilst not identical they are very similar. Eventually I will switch midi to use dnd5e damage application as the default and no further work will be done on midi's damage application.
* Enable in workflow settings (use dnd5e damage calculation), **changing the setting requires a reload**. If not enabled no changes will be made and core damage calculations will **not** pick up midi flags.
* There are certain to be bugs so don't enable just before game time.
* The damage chat card tooltips have been enhanced to provide more information about the calculation, including the amount applied, the amount of each type applied, the amount of DR available for each type and any resistance etc applied.
* If support for dnd5e v3 damage application is enabled - adding chat damage buttons will enable dnd5e damage application buttons rather than creating the midi damage buttons. The dnd5e damage application buttons are much more flexible than midi's.

* **Differences**
* flags.midi-qol.DR.fire 5 => system.traits.dm.amount.fire value -5.
* flags.midi-qol.absorption.fire => system.traits.da.amount.value fire/etc
* flags.midi-qol.dr/di/dv.fire => system.traits.dr/di/dv.value fire/etc
* flags.midi-qol.DR.all/rwak/etc value 10  => system.traits.dm.midi.all/rwak/etc value -10 with type none. These are applied after resistance/immunity (will be fixed in a subsequent release).
* All of the midi special DR values will be displayed in as type No Type
* Midi allows enforcing of Save->Damage Reduction->Damage resistance (pretty much RAW), and support this in midi's application of damage. The core damage application buttons **do not** allow saves before reduction.
* Currently only the base dm types are applied before resistances, the specials (rwak)
* All flags.midi-qol.dr/di/dv will automatically convert to system.traits.di/dv/dr.
* DND5e uses the opposite sign convention to midi. +ve system.trais.dm increases damage and -ve system.traits.dm.xxx decreases damage. All of the midi flags.midi-qol.DR will be automatically translated to actor.system.traits.dm.amount and the sign reversed if v3 damage application is enabled.
* In the dnd5e damage application display DR.all/rwak/mwak.etc will be displayed as damage modification with a type of "none" and are applied against the applied damage after all type specific modifications/resistances have been applied.

## 11.4.15
* Customize damage dialog has had an overhaul to work in dnd5e 3.0+. It now allows you to select which of the various damage parts, versatile and/or other formula to roll as part of the base damage for an item. This is a poor man's version of what roll groups let's you do.
* Support for magicitems which is the mainstream version of magic-items-2
* Support for new 3.1 chat cards.
* NOT compatible with dnd5e concentration yet.
* NOT compatible with dnd5e damage application yet.

## 11.4.14
* Display save dc in monks token bar if requested.
* Skills rolls will now roll with ghost dice if skill rolls are rolled blind.
* The test to roll other damage has changed slightly for the If Save & Condition. If a condition is present (i.e not blank) and evaluates to true roll other damage even if no save is present. If a save is present on the item and the other condition is true (which includes blank conditions) roll other damage.
* Updates to various items to fix activation conditions:
  Arrow of Slaying, Divine Smite No Macro, Dragon Slayer Longsword, Legendary Resistance (now only rolls for failed saves), Longsword of Life Stealing, Power Word Stun.
  * MUlti attack automation now deal with monsters from DDBI and whose attack is already plural (e.g. claws).

## 11.4.13.1
* Various fixes for midi custom sounds.
* Fix for not being able to call itemMacros in Italian.
* Fix for saving throws failing in some niche cases.
* Fix for use of Math.X functions in condition evaluations - again.

## 11.4.12
* Fix for optional.name not allowing more than one bonus to be applied
* Optional name dialog will now show each bonus as it is applied
* Fix for before and after optional bonus dialog card not being shown if the dialog is closed.
* Before/After card will replace the normal roll card if enabled.
* Fix for optional.name effects targeting damage rolls.
* Slight change to the styling of saves/hits to try and take up less chat log room
* Display calclutated cover bonus on the hits chat card.
* Reinstate support for Alternative Token cover module to calculate cover.
* Ensure that actor.appliedEffects is used everywhere instead of actor.effects;
* Fix for flags.midi-qol expression evaluation failing with MATH expressions.
* Provide some additional paths to find a concentration effect as a stop gap until dnd5e 3.1 comes out. This means Convenient Effects and CLT can be used to supply concentration effects.
* Added detection of potentially broken concentration effects to midi troubleshooter.

## 11.4.11.1
* Fix for dsn bonus roll not matching what is in the chat card.

## 11.4.11
* **BREAKING** Removed support for system activation condition. This may break items so do not upgrade just before game time. Version 11.4.10 is available via a manifest install just in case from https://gitlab.com/tposney/midi-qol/raw/dnd3/package/module11410.json
* Hit and saves display will now deal with very long token names.
* Slight change to token display in hits/saves card to make the token image more visible.
* Fix for checking tokens in range when the attacker has elevation and the target is large.
* Setting "Weapons attack single target" will now trigger target confirmation (if enabled) as if target type none was in fact 1 creature.
* Re-enabled chat card damage buttons that apply damage to selected tokens and take into account damage resistance, DR etc, enabled for merge and non-merge damage cards. Enable from the main midi settings, not the workflow settings.
* Fix for special duration 0 HP to work with passive effects.
* Fix for midi sounds not picking up all base weapons in the drop down lists.
* Fix for displaying dice so nice dice multiple times when using a bonus dialog for rolls/saves/skills etc, especially when showing the before and after chat card.
* Fix for function.MidiQOL.chooseEffect which was not processing the effect's changes before applying them to the targets, with the result that @fields were always evaluated on the target and not on the actor applying the effect. With this change @abilities.dex.mod will be the dex mod of the actor applying the effect, if you want to use the target's value use ##abilities.dex.mod etc
* workflow.dnd5eConsumptionConfig now holds the dnd5e consumption config from dnd5e.preItemUsageConsumption in case you need to check what, if anything, was consumed.
* Added new macro MidiQOL.GMShowPlayerDamageCards which will make player damage cards visible - normally the GM cannot see these cards. They will remain visible until the next reload and new player damage cards will not be shown. Useful if you are cleaning up the chat log.
* New monster feature "Multiattack Automation", for the DM who finds clicking on each of a creature's multi attacks too tiresome. Add the feature and click **Multiattack** in the monster's features.
* **Breaking** Swtich to preferentially using dnd5e concentration effect, if available. When using the dnd5e concentration status effect, removing concentration from the token hud will also expire dependent effects. Midi will recognise concentration applied via the token hud is present when using an item that requires concentration. 
* **Breaking** Expect concentration handling to change when dnd5e 3.1 arrives which will take most aspects of concentration handling into core.

## 11.4.10
* Removed an accidental debug left in.
* Incorporate PR for it.json
* **Warning** **Breaking** next release of midi (11.4.11) will remove support for using the system activation condition in item checks, for item use checks, other damage roll checks etc. Only the midi conditions will be checked.

## 11.4.9
* Support advantage/disadvantage settings for saving throws using Epic Rolls. Adv/Dis will be highlighted for the per actor rolls and will apply to the roll.
* In the config panel note if a saving throw module dependency is not installed.
* Incorporate changes for new perceptive 3.2.1. Midi will only use perceptive if it is active and at least version 3.2.1
* Fix for potential infinite loop when calling DamageOnlyWorkflow.
* Actor On Use Macro button now only displays when the sheet is in edit mode and is now located at the bottom of the traits list.
* Updated sneak attack for change in system.properties.has("fin").

## 11.4.8
* Support for epic rolls when doing saving throws etc.
* Fix for not removing chat cards when undoing workflows.
* Fix for template targeting in rippers 3d modules.
* Re-enabled dr/di/dv for healing/tempHp - requires dae update to 11.3.12
* Incorporate some changes for ddb gamelog.
* Fix for incapacitated check when using vitality resource.

## 11.4.7 
* Support for custom damage types (custom dnd5e module)
* Fix for flags.midi-qol.mwak/rsak/etc.type.
* Added some tests for flags.DR.

## 11.4.6
* Fix for special duration expiries, 1Hit, 1Attack etc
* Fix for bonus dialogs displaying "This is a test".
* Fix for not matching custom damage types when applying immunity/resistance

## 11.4.5.1
* Back out changes for system.traits.dm. If you updated to 11.4.5 you should upgrade to this version

## 11.4.5
* Fix for not calling onUseMacros
* Fix for not removing apply active effects buttons on cards.
* Fix for some cases when otherdamage roll would throw an error.
* Midi will make transfer effects as disabled rather than deleting them on effect expiry.
* Allow tool rolls again.
* **Breaking** Damage type "None" will be applied as damage to the target actor. This is in line with what dnd5e does.
* optional.NAME.damage.XXX flags now work again. There is a change in the behaviour, the bonus damage only applies to the first damage roll for the item, relevant for re-roll actions.

**Known Issues**
* Rolls not obfuscated when doing reactions.
* Epic rolls support not implemented yet

**For Macro Writers**
* **Braking** Dmaage only workflows currently must create a new chat card rather than adding to an existing chat card and will do so even if an existing item card id is passed in. (you don't need to change your macros) I will revisit this later.
* Midi expects concentration, reaction, bonus action, flanked and flanking to be non-transfer effects. Things will break if they are not.

## 11.4.4.1
* Fix for always rolling versatile as other damage.
* Monks token bar works for saves again

## 11.4.4
* Active defence works again.
* Changed hits and save cards to be more like dnd5e cards. **As with item cards please do not bug the dnd5e guys with issues on the midi chat cards** They cannot help and are not responsible in any way for those cards.
* Fix for rolling versatile damage as other damage when weapon is not versatile.
* Cleaned up roll hiding.
* The existing setting to show numeric results for hits will now simply display the target armor class in the hits summary card. Since you could always do the arithmetic there's not much point doing anything else.
* Rolling a save from the item card now picks up bonuses/prof.
* Fix for target type None causing workflow to block.
* Player skill/save/check rolls that are marked as always blind will now be blind for gmrolls.
* Reactions wont prompt for target confirmation anymore unless the item specifies it.
* Midi now integrates with Anonymous again to hide target token names.
* The tool tips /hover behaviour has changed slightly - all for the GM.
  - Hovering over the targets name will highlight it on the map.
  - Left clicking on the targets name will select the target
  - Right clicking on the target's name will open the character sheet for the target.
  - For saves hovering over the targets name will also show the gm the roll breakdown plus roll results.

**Known Issues**
  * Monk's token bar not working for saving throws. There has been a change in how saves are returned and I'm not sure how to extract the inforation I need.
  * Reactions still do not obfuscate the chat card roll when prompting for reactions.
  * Support for epic rolls has not been implemented - so ignore the option in the drop down - but it's coming.

**For Macro Writers**
* Midi will call dnd5e.calculateDamage with the damage midi will apply. Next version will switch to dnd5e damage application.
* workflow.chatCard will return the cached version of the workflow chatCard which you can use in updates. 
  - Provided you fetch the item card via ``message = workflow.chatCard``, you can use ``message.update(updates)`` to make changes. (This has only been tested a bit - so expect errors - if you change the update cache time to 0 and retest in the event of problems that can tell you if the cached updates are an issue.)
* New prettier EffectChooser - thanks @thatlonelybugbear
* Change all references from CUB to CLT.
* For those manipulating transfer effects, you need to be aware that in dnd5e 3.0+ transfer effect origins point to the item that was added to the actor (i.e. the world/compendium item) rather than the actor item. Dae 11.3.7 provided the option to rewrite those to the actor's item. Longer term you should be depending on effect.parent for transfer effects and effect.origin for non-transfer effects.

## 11.4.3
* onUseMacros referencing ItemMacro for passive effects will now ignore the origin and use the effect's parent item. This should resolve most of the issues with item origins being wrong.
* reinstated the correct handling of options.noOnuseMacro when calling a completeItemUse.
* added options.noTargetOnusemacro for completeItemUse to block triggering of target macros.
* workflow.setDamageRoll(roll) will coerce the roll into a damage rol and if no damage type is set will set it to the damage typeof the first damage line in workflow.item
* Added MidiQOL.getTokenForActor, MidiQOL.getTokenForActorAsSet

## 11.4.2
* This is the first public beta release of midi-qol for dnd5e 3.0+. You cannot install this from the foundry modules list, you must install via the module.json link:
  https://gitlab.com/tposney/midi-qol/raw/dnd3/package/module.json
  - Once installed, updates can be handled via the update button. To go back to the dnd5e 2.4 version uninstall and re-install midi from the install module list.
  - You must be on dae 11.3.3.
* Disclaimer: **While Midi's attack/damage chat card is based on the dnd5e chat card it is NOT the same. Any problems with the chat card should be reported here and not in the dnd5e foundry discord. They are not responsible for the card and connot help.**
* If you are updating your world to dnd5e 3.0 you **MUST** **MUST** take a backup before doing so. Foundry really makes this easy so make sure you take a backup. If things break you will need the backup to recover.
* This is a **beta** release so please do **not** update to this if you can't deal with bugs - there are bound to be some - and certainly don't do update close to game time.
* This release requires the latest versions of dae and (if using it) times-up.
* The major change is the shift to the new dnd5e chat cards. This has rquired a lot of changes under the hood.
* You're imported chat log will be rendered, but the roll break downs are not compatible with the new chat card style. I can't see anything to do about that - sorry.
* Once you start your world, there are likely to be many duplicated passive effects on actors.  Especially if you are using DAE. DAE will create macros to fix these. See the DAE release notes - and you need to be on the latest version.

Proposed Migration Steps:
1. Set the world to safe startup (i.e. disable all modules). From the edit world options - this is important.
2. Upgrade dnd5e
3. Launch the world (**MAKE A BACKUP** - I cannot overstate how important this is)
4. expect lot's of errors (1 for each chat card at least).
5. Enable midi-qol and depenencies
6. Restart
7. Run the DAE included macros to clean up dae created passive effects (dae will create the world macros you need), at least run the actors macro and then for each scene.
8. You should be ready to go

* Midi does a lot of updates to the chat card and with the dnd5e chat card enrichment this can be quite expensive, for example 9 chat card database updates and 6 chat card enrichments for a single weapon attack workflow.
  - On slower machines, or with a slow database this can result in a noticeable delay in completing rolls. 
  - A new experimental world setting, Chat Message Cache Time has been introduced which batches updates to the midi item chat card and releases them every N milliseconds - 0 disables the cache. On my test machine a cache time of 10ms, drops the database and chat message enrichement counts to 3 and 3 and is noticeably faster. However this may interact very badly with modules/macros that update midi's chat card so be aware of the potential issue and feel free to disable the cache by setting the cache time to 0.
* Improved midi's tooltip handling. If set to put the formula in the tooltip it does so for all rolls.
* Implemented the GM roll hiding settings for the new chat card.
* If you specify damage parts as ``1d4 + @mod + 2d4[fire] + 6``, with a weapon damage type of bludgeoning, midi will interpret that as ``1d4 + @mod + 6`` bludgeoning and ``2d4`` fire. This is a slight change to 11.3.X which would treat it as ``1d4 + @mod`` bludgeoning and ``2d4 + 6`` fire.  I don't expect that to impact many users.
  - It is recommended that you use multiple damage lines for different damgae types.
* **Breaking** Removed support for putting concentration in the activation condition text, use the system property or the midi property.

**Known Issues**: 
* When prompting for reactions the chat card is not obfuscated so players can see the attack/damage rolls.

**Not Tested**:
  Challenge Mode Armor
  Active Defence.

**Bug Fixes**:
  - More changes to concentration which now integrates properly with times-up and is much simplified, midi now complains if your times-up version is out of date.
   Fix for rolling versatile damage as other damage when it shouldn't
  - Switched createEffects, gmSetFlag and gmUnsetFlag to be always allowed in SaferSocket
  - Fixed deprecation warnings for typeLabels
  - Fixed deprecation warnings for system.components -> system.properties
  - Deprecated chatMessage.flags.midi-qol.roll in favor of ChatMessage.rolls.

* **For macro writers**
* **Breaking** (for some). workflow.damageRoll -> workflow.damageRolls (an array). Midi provides backward compatible workflow.damageRoll get/set methods, but migration to arrays of rolls is strongly recommened.
* **Breaking** bonusDamageRoll -> bonusDamageRolls (an array). Backwards compatible get/set methods included.
* Bonus Damage Macro returns have been enhanced. 
  - You may now return {damageRoll: string, damageType: string, flavor: string } or [{damageRoll, damageType, flavor}],  each of the damage rolls will be converted into a DamageRoll with a type "damageType".
  - if no damageType is present the flavor will be tried as a damage type
  - if there is still no damage type the damage type of the first entry in item.data.parts[0][1] will be used (so that the damage will be the same type as the weapon that attack)
  - failing that it will default to midi-none which is an untyped damage.
* Midi will now correctly split out damage types for xdn[damageType] in damage roll specs as well.
* As discussed above midi can buffer chat card updates so if you access the chat card your version will be out of whack with what midi thinks it is.
  - MidiQOL.getCachedDocument(documentUuid) will return midi's internal verison of the document, currently midi only buffers chat card updates.
  - MidiQOL.debouncedUpdate(document, changes) - will update the document and include midi's internally cached changes.

## 11.4.1
- closed alpha

## 11.4.0
  * Alpha version:
    - system.properties is now a set, rather than an object, so any reference inside macros will have to change.
    - **BREAKING** If an item has more than one damage line it it's damage roll dnd5e will return an array of rolls, each containing a roll for the line. 
      - There is a paramater to dnd5e.damageRoll to return a single roll for backwards compatibiltiy, but that will only return the first line of the damage spec.
      - workflow.damageRoll is a join of all the damageRolls
      - workflow.damageRolls is all of the results. Midi will use workflow.damageRolls interenally for calculations.
  * **Breaking** Removed support for putting concentration in the activation condition text, use the system property or the midi property.
  * I have tested simple, items, items with other rolls set, saving throws, template targeting, spells, applying effects, advantage attribution, damage application, undoing damage via chat cards, passive effects, macro.createItem, macro.executeMacro, macro.ItemMacro, Status Effects (but there is some strangeness there sitll), bleeding/dead status updates, concentration (for some reason it does not time out - will need to look at that), merged/unmerged cards and probably some other stuff.
  * I have not tested undo workflows at all, so treat with caution.
  * I have not tested bonus damage rolls.
  * You will need the updated times-up for effect expiration to work.


## 11.3.18
* Some more enhancements to optional.Name.macroToCall and optional.name.xxxx CUSTOM ItemMacro/Macro/function
  - Optional.Name.macroToCall is called whenever a flag selector matches in the optional.NAME effect,
    e.g. optional.NAME.save.all OVERRIDE 1d4 / optional.NAME.macroToCall CUSTOM macro.myMacro. myMacro will be called whenever a saving throw is made. The macro can return a roll (which will replace the entire saving throw), a string (which is any of the optional.NAME roll modifiers which will replace the 1d4 effect) or anything else which will be ignored and the 1d4 bonus will be applied.
  - Optional.NAME.save.all CUSTOM Macro.myMacro will be called whenever there is a save and can return a roll (whill replace the entire saving throw) or 1 of the optional.NAME modifiers which will be used as the roll modifier, anything else will be ignored and the bonus will have no effect on the roll.
  - If there is a optional.NAME.XXX CUSTOM Macro.mymacro that will be called in preference to optional.NAME.macroToCall. That is only one macro call per bonus.
  - In all cases args[0].macroPass will have the full selector, e.g. flags.midi-qol.optional.NAME.save.str that identifies the roll being performed, options.roll will have the roll to date, with any previous bonus modifiers applied.

## 11.3.17
* The item property ignore total cover will now also ignore walls blocking an attack.
* added item.name to the fields available in an activation condition.
* Cover check will now use the overridden attacking token if there is one.
* Cleaned up the reaction message including fixing an error in the case that there is no attack roll.
* Added superSavers, semiSuperSavers to effects that can have evaluation conditions. See the new sample Item Circle of Power.
* Fix for TrapWorkflow looping on damage rolls.
* Fix for drag/drop targeting in gridless scenes.
* Fix for auto template removal triggering removal of caster self effects.
* Fix for uncanny dodge being counted twice when Save/DR/dr is set for the damage application order.
* For overtime effects, chatFlavor=some text, in the overtime definition will be used as the chat flavor for the item when rolled. Further the overtime effect description will be copied to the overtime items chat description.
* Added @spellLevel to the data available in other damage rolls, e.g. (@spellLevel)d8 as the other damage formula
* For macro writers
  - bonus dialog macro calls (optional.name.XXX) now have the full flag setting in args[0].macroPass, e.g. flags.optional.NAME.save.con for a con save, the roll is available in options.roll, which is the complete roll so far including any other optional bonuses that have been applied.
  - Macros for preDamageRollComplete (preferred) and postDamageRoll (deprecated) are called after all damage rolls have been done (including bonus damage rolls), but before any processing of the rolls. So you can freely change (via the workflow.setDamageRoll/setOtherDamageRoll/setBonusDamageRoll) at that point and the changes will be included in the rest of the damage application processing.
  - added utility MidiQOL.addRollTo(roll: Roll, bonusRoll: Roll): Roll, which will merge the terms from roll and bonusRoll and return a new roll from the merged result. If required a "+" term will be inserted. If either roll has not be evaluated it will be in the call.
    - for example workflow.setDamageRoll(MidiQOL.addRollTo(workflow.damageRoll, new Roll("1d4)))

## 11.3.16
* Fix for not display base damage  save multiplier correctly.
* Fix for incorrectly migrating existing save multiplier fields when editing an item with other damage.
* Added attack roll per target as a per item setting, midi-settings, always, never. Never should be useful for those items that do not work correctly with multiple attack rolls.
* Fix for auto cancelling attacks resetting the targeted tokens when doing attack roll per target.

## 11.3.15
* Added missing text for undo chat card color label/hint.
* Fixed reaction "isMissed".
* Fixed countdown timer on bonus dialog.
* If multiple GMs are connected midi will pass executeAsGM calls to a GM on the player's viewed scene, if there is one. This also means that if there is more than GM midi will prompt for reactions from a GM viewing the scene if possible.
* Fixed magic items 2 api call not being awaited when doing a reaction. The current version of magic items 2 (1.4.7) seems to have a bug in the api so reactions with magic items won't work until that is resolved.
* Added the option for optional.name.whatever CUSTOM ItemMacro/function/Macro to support the macro returning a string which will be used as the roll modifier, e.g. reroll, 1d4, 6 etc. The existing functionality of the macro/function returning a roll instance to replace the roll will still work.
* Added MidiQOL.canSee(token, target) which returns true if the token can see the target. Thanks @Elwin
* If base damage/bonus damage have the same save setting, or there is no save for the item the damage from both is combined into a single pool, so that damage resistance will behave as expected.

## 11.3.14
* Various fixes - thanks @Elwin
* Fix for MiM2 being disabled via a late change in 1.3.13 to fix concentration effect not found in embedded collection errors.
* Added setting to keep "undone" workflow chatcards - which can be recoloured when undone - LemonChiffon is my preferred colour. The chat cards are live and allow you to apply damage as you wish.
* Fix to support Monks Token Bar skip roll dialog setting.


## 11.3.13
* Final changes to auto place templates. (sorry about the mucking around) Only radius/squared-radius templates are auto placed. 
  - If using 555 measurement use Squared Radius (which is the equivalent distance when using 555 distance).
  - If using Euclidean measurement use radius. Template sizes will automatically adjust for the size of the token that caused the placement of the template (does not require walled templates).
  - For squared radius templates midi auto targeting will calculate walls blocking from the center of the token placing the template, rather than the origin of the template. 
  - If using walled templates set the per item setting for walled templates to walls do not block template.
* Support for Magic Items 2 and reactions - all aspects (that I have tested) work with magic items 2.
* Midi-qol Settings can now be configured to be a separate tab on default(like) item sheets sheets. Setting in Misc settings tab, default is true.
* Fix for very old items not displaying correctly (created before midi had midiProperties defined). Should now just work.
* GMs can add fake dice to the Dice So Nice displayed rolls (to screw with their players). Midi will add between 1 and the number of dice rolled to each DSN roll (at most one to attack roll D20s). You need to make sure the players don't see the roll formula else it will be pretty obvious what is going on.
* Fix for concentration saves with a saveBonus defined.
* Added a new function MidiQOL.chooseEffect, designed to be used as an onUseMacro function call that lets you choose one effect on the item to apply. Midi will select effects that are **not** transfer effects and must have the **do not apply** setting checked on the effect. This lets you have several effects and the user of the item can choose which one to apply. Have a look at the sample item ChooseBlessing.
* Another fix for double rolls when using bonus/reactions.
* Additional option in concentration checking. do concentration check, enabled means roll a concentration save when damage is taken. This works with the existing remove concentration of failed save.
* midi can now import settings from a trouble shooter file without having to first load them into the troubleshooter, import settings from the misc tab.
* Added a hack so the the item sheet window display properly when there are lots of modules adding tabs to item sheet.

* **Maybe Breaking** Big changes to activation conditions, effect application, other damage application and reaction processing.
  * The existing mechanisms for rolling other damage and applying effects continue to work as before, i.e. the midi settings and so on.
  * There is now a much simpler way to handle these which (if set) will **replace** the default behaviour, that means if they are present all other checks are ignored. To reiterate if a condition is specified it will completely override the existing behaviour and will be the only thing midi looks at. If the condition is empty then midi will use the pre 11.3.13 logic for other damage, reactions etc.
  * Each item now has 4 conditions defined by midi-qol, item activation, other damage, effect application and reaction activation, the existing dnd5e item activation condition can be bypassed completely.
    * Item activation specifies that the condition must evaluate to true or the item roll will be cancelled (if using undo workflow ammo/spell slots etc will be restored).
      - See the spell mass cure wounds as an example. The condition is evaluated after targeting is complete and before any attack/damage rolls have been made.
    * Other damage specifies that the condition must evaluate to true or other damage won't be rolled. If other damage is rolled it will be used when applying damage. This is called after the attack roll is completed and hits have been checked.
      - An empty condition means that the prior midi process for deciding other damage will be used, so existing items don't have to change. 
      - The condition uses the item that midi thinks is the source of other damage. This matters for ammo where the "other damage" item will be the ammunition if it has "other damage", so midi will usse the ammo condition to test. See the new Arrow of slaying as an example.
      - If an other damage condition is present the midi-property alsoRollOther (which will be removed in a later release), like other settings for other damage, is ignored. 
    * Effect application means that the condition must evaluate to true (against the target) or the item effects won't be applied to the target. If effect condition is present all other settings are ignored and only the result of the effect condition is used to determine if the effect should be applied. 
    - The existing requirements that a target must be hit/fail a save for the effect to be applied are ignored if the effect activation conditions is present and such tests must be coded in the condition. Some quick properties are available in the condition test, target.saved, target.failedSave, target.superSaver, target.semiSuperSaver, target.isHit, target.isHitEC.
    - See the mace of disruption for an example.
    - A shorthand isAttuned is available for conditions, to let you filter for items that are attuned or attunement not required. Have a look at Sword of Sharpness.
  * If those conditions are present they will **override** any other settings, this includes having the condition as simply "true".
  * The change for other damage rolling should resolve many of the existing tricks with rolling other damage and means you can create items that do not depend on midi settings to work.
  * (I still recommend setting roll other damage to if save present in the midi settings so that SRD monsters etc will work without change).
  * The change for item activation means you can avoid using macros to stop the item rolling. The item activation condition is evaluated **after** targeting is complete so ammo usage, spell slot usage, concentration removal will have taken place. If you enable the undo workflow setting any changes made will be undone if the activation condition fails.
    - Have a look at mass cure wounds as an example.
  * The **current** treatment of save damage setting is confusing/opaque/cryptic.
    - There are two cases
      1. No "Other damage" present (i.e not rolled), a save will be applied to base damage/bonus damage
      2. "Other Damage" present (i.e. rolled), base damage will be full no matter what the save, and other damage will be affected by the setting.
  * The per item save damage has now been split into 3 type, base item damage, bonus damage and other damage. So that you can decide how each of those are affected by a save.
* Reaction conditions.
  - if present the reaction condition will trigger if the reaction fires or not.
  - If a reaction condition is NOT present on an item then the existing reaction action type will be used to determine triggering.
  - If a reaction condition is present the condition returning true will cause the item to be prompted as a reaction option. (this also works for magic-itms-2 items).
  There are now many options for triggering reactions:
    - reactionTargeted - not yet
    - reaction pre attack (preAttack)
    - reactionAttacked (isAttacked)
    - reactionMissed - (isMissed)
    - reactionHit (isHit)
    - reactionDamaged (isDamaged)
    - reactionNotDamaged - not yet
    - reactionSave (isSave)
    - reactionSaveSuccess (isSaveSuccess)
    - reactionSaveFailure (isSaveFailure)
    - reactionMoved - not yet (will be after 3rd party reactions)
    - reactionItemRolled - not yet
  - When evaluating a reaction condition you can test reaction === "isHit" for example to present the reaction option during the isHit reaction phase.

## 11.3.12.2
* Due to some cases I forgot to consider auto placing templates (when range is self) only takes place for "radius", "sphere", "cylinder" and "cube" templates. You can use "cube" instead of "square" for replicating range targeting.
* Fix to stop doing double damage on auto targeted template spells.

## 11.3.12.1
* Fix for damage button removal.

## 11.3.12
* **BREAKING** Switch from "Token Visibility" to "Token Cover" for cover calculations due to upcomfing changes in token visibility/token cover - thanks @caewok. As of this release token visibility is no longer supported for cover calculations.
  - The are two ways to calculate cover
    - **Enable** cover calculation in midi's mechanics tab and **disable** cover calculations in token cover (you can still configure how cover is calculated - point/area/etc - in token cover's settings) or
    - **Disable** cover calculations in midi's mechanics tab and **enable** cover calculations in token cover.
    - If both are enabled you will double up some cover calculations. 
    - Midi's calculation always uses the targeted tokens and the token making the attack during the workflow and applies cover separately for each target.
    - This applies to any of the cover modules that midi supports
* Fix for concentration not expiring if none of the targets have an effect and a template was placed. (requires updated times-up).
* Fix for concentration always being removed on 0 hp, ignoring concentration removal on failed save setting.
* Fix for drag and drop targeting on gridless scenes.
* Fix for workflows being marked as incomplete if waiting for a damage roll when the attack missed. These will now allow you to roll the item without the dialog popping up.
* Fix for workflows blocking when placing a template if bonus action checking is applied.
* New setting in the misc tab, auto complete workflow. 
  - When enabled, any roll of the same item, which would result in a "workflow not complete" prompt, will instead mark the previous workflow as complete (as if you had hit the complete workflow button in the dialog)
  - no extra rolls will be done, no damage applied, it will simply mark it as finished. 
  - Only recommended if you frequently have incomplete workflows in your game and is not resolved by the above fixes. (I'd appreciate reports or erroneous reporting of workflow not complete).
* Fix for a couple of typos in optional.fail.attack flags processing - thanks @Garhi.
* Updated sword of sharpness.
* Reinstated the Hooks.call for preambleComplete which was removed by mistake.
* Reinstated preTargetDamageApplication hook which passes in the "live" damageItem for the workflow which means you can change the damage that will be applied, including changing the hit status. (In 11.3.11 this was changed to the isDamaged/isHealed hooks).
* isDamaged/isHealed now fire after the damage calculation has been finalised - so can definitely be used to respond to a target being damaged/healed - and cannot alter the damage done. The damage item is still passed to the hooks for informational purposes.
* Quite a few additions to template targeting.
  * If walled templates is installed midi will use "walled template" to draw the template. This means you can use midi targeting all (instead of walls block) if walled templates is set to wrap around walls. This is recommended way to auto target.
  * Current range targeting (distance/target type) will continue as is - so no changes required to existing items - yet.
  * Additional midi property for AoE items, target type.
      Any: Any target token disposition
      Ally: Target token dispostion same as caster
      Non Ally: Target token disposition different to the caster.
      Enemy: Target token disposition reverse of caster
      Non Enemy: Target token disposition not the opposite of the caster
      Neutral: Target token disposition Neutral
      Non Neutral: Target token disposition not Neutral
      Hostile: Target token disposition Hostile
      Non Hostile: Target token disposition not Hostile
      Friendly: Target token disposition Friendly
      Non Friendly: Target token disposition not Friendly
  * Additional midi property for AoE items, include self as target.
    - These apply to any AoE template item.
  * AoE spells can now override midi's auto targeting behaviour on a per item basis.
  * Any template with a range of self will be auto placed by midi, centered on the caster, including square templates.
  * If 'walled templates' is active you can attach the template to the caster.
  * Auto placed templates now respect the walled templates' item setting "add token size to template", so that the placed template extends the specified distance beyond the token boundaries.
  * You can use these settings to replicate the existing ranged target feature, by placing a square template 2* as big as the range and adding the target width (via the checkbox).
  * Spells like mass cure wounds now work out of the box, just set to target allies or non-enemies only, include self and override the auto targeting to all exclude dead.
* saveItemUuid is now passed in 'options' to any saving throws generated by midi (auto/monks etc) for sw5e.


## 11.3.11
* Death saves added to list of blind save rolls in the mechanics tab.
* Fix for arrow of slaying (and other ammo types) that use other damage/activation conditions to apply damage.
* Update to optional bonus flags. If an attack roll is a fumble only bonuses that allow for the re-roll of the attack roll will be presented,
* Updated DamageOnlyWorkflow, so that if a roll passed in the constructor undefined midi will use the damageTotal/damageType to apply the damage.
* Fix for flags.midi-qoil.optional.NAME.attack.fail.all/mwak etc to work even if attack.all is not specified.
* Fix for item sheet not displaying midi properties in sw5e.
* New concetration automation setting. If concentration automation is enabled, and concentration removal on application of an incapacitated condition is set in concentration configuration, applying any of the incapacitating status effects will remove concentration from the actor. The incapacitating status effects are
  incapacitated, "Convenient Effect: Incapacitated", unconscious, "Convenient Effect: Unconscious" dead, "Convenient Effect: Dead", stunned, "Convenient Effect: Stunned", paralyzed, paralysis, "Convenient Effect: Paralyzed", which are defined in MidiQOL.incapacitatedConditions and can be changed by updating MidiQOL.incapacitatedConditions.
* Reworked midi item properties so that 
  - Save damage is now a drop down of midi settings/half/full/no damage on save
  - Confirm targets is now a drop down of settings/never/always indicating that target confirmation for the item will follow the target confirmation settings, never confirm targets or always confirm targets.
* First cut of support for midi fields on the tidy sheet 5e item sheet.
  - A separate tab for midi settings. The formatting is way off, pending some changes in tidy/rework by me, but is functional and it's probably better to have it working but ugly.
  - Added midi item description buttons for roll/attack/damage to tidy item sheet.
  - The midi "fiddling" of the distance type field (for ranged targets) is not yet supported in tidy 5e sheet. But see below.
* I plan to deprecate the current method of ranged AoE targets (setting distance/feet/metres and creature) and instead use radius targets (which actually captures the requirement better and are a plug and play replacement for the existing range targets). In a future release I will auto migrate any edited items to the new schema and provide a deprecation warning for the old schema.
  - An item that specifies a target of, for example, 30 feet radius, will auto place a template centered on the caster of 30 foot radius and target tokens inside that template according to self/special/any.
  - You don't need to do anything other than setting the radius for the range target and special/self/any in the range field.
  - Radius templates can be specified to move with the token if using walled templates - think detect magic.
  - Radius templates will auto delete at the end of the turn if duration is instantaneous otherwise when the spell expires.
* Added rangeDetails to the workflow, which has {result: "dis"|"normal"|fail, reason: string, range: number | undefined, longRange: number | undefined}. It includes all modifiers to range (spellSniper, sharpShooter, midi flags)

## 11.3.10
* MidiQOL.doConcentrationCheck can now be performed by a non-gm client.
* Adding concentration when not auto checking hits/saves will now be applied if the item has concentration. Should also stop applying concentration when rolling without checking hits/saves when not needed.
* Added 
  ``flags.midi-qol.range.mwak/rwak/etc/all ADD expression``
  ``flags.midi-qol.long.mwak/rwak/etc/all ADD expression``
  - The expression will be evaluated and added to an item's range when checking range for the item.
  - The expression can be negative which will reduce the range of the item, but the resulting range/long range will be at least 0.
  - The expression can reference the item/actor, e.g. +(item.baseItem==="longbow" ? item.range.value : 0) to double the range of any longbows.
  - if you want to restrict blinded actors to have a range of only 5 feet for all attacks add the following to your blind active effect:
    ```flags.midi-qol.range.all ADD 5 - item.range.value``` and
    ```flags.midi-qol.long.all ADD 5 - item.long.value```
  - Alternatively you can add an effect with
  ```flags.midi-qol.range.all ADD -(hasCondition("@actorUuid", "blind") ? item.range.value - 5 : 0)```
  ```flags.midi-qol.long.all ADD -(hasCondition("@actorUuid", "blind") ? item.range.long - 5 : 0)```
  
  NOTE: You cannot directly manipulate the item's range with these flags, only a valued added to the item's range when midi checks that targets are in range.
  ADD/OVERRIDE/etc are applied to the flag string value (i.e 5 - item.range.value) rather than the item's range.

## 11.3.9
* Fix for MidiQOL.doConcentrationCheck(actor, saveDC) not working.

## 11.3.8
* Fix for anonymous module not being used.

## 11.3.7.1
* Remove debug left in 11.3.7

## 11.3.7
* Added Countdown timer for reactions/optional bonuses
* Fixed error in optional bonuses when the value is just a number

## 11.3.6
* Fix for a dnd5e 2.4 dependency introduced. dnd5e 2.4+ is strongly recommended

## 11.3.5
* Fix for sw5e skills for starships.

## 11.3.4.1
* Fix for babonus check.

## 11.3.4
* Fixed some error with the application of active effects via apply active effects button
* Added isHealed (as well as isDamaged), for hooks, onUseMacros calls.
  - If auto applying damage this will check the actual damage applied in an item roll, rather than just if there is any damage.
* special durations isHealed/isDamaged now check the actual damage done, rather than if there is some healing/damage rolled.
* If an actor has a Build a Bonus optional bonus for attacks/damage fast forwarding will be overridden to give you the chance to use the bonus.

## 11.3.3
* Incorporate changes from @TMinz for stealth/hidden.

## 11.3.2.1
* Some typo fixes thanks @Elwin

## 11.3.2
* Fix for spells with AoE type radius not targeting in some cases. AoE type radius with target type special, self, any will auto create the template centred on the caster and not prompt for placing the template.

## 11.3.1.2
* Fix for "never roll damage" setting not allowing workflow to proceed.
* Reinstate Confirm Hit behaviour.

## 11.3.1.1
* Improve attack per target behaviour to allow rolls if no targets are selected.

## 11.3.1
* Fix for calling target isDamaged macro twice.
* Added option to specify Damage Reduction before Saves or Saves before Damage Reduction in workflow tab. Default (which is the same as current behaviour) is DR before Saves.
* Fix bug with player version of token names if anonymous installed but not active.
* Fix for error thrown in migrateTraits/prepareTratits when actor groups are present on the scene
* Fix for midi-none displaying as mdi-none instead of No Damage.
* Fix for breakage in sw5e with customDamageResistanceTypes.
**For developers**
* Refactor of Workflow class. Should have no impact on behaviour (famous last words) - so an installable 11.2.4 has been left available.
  - A rewrite of the state management code.
    - warning level debug gives a **much** clearer indication of what is going on and the call stack is much cleaner.
    - Midi will call preState/postState hooks for all states in the workflow, return false to stop the workflow, set workflow.aborted to true to abort and remove the workflow. Existing macroPasses and Hooks are still called.
    - Midi will call pre/postState macroPass for each state (so you can add specific macros at each state transition), return false to stop the workflow
    - macros/hooks can change the state transition behaviour
    - MidiQOL.Workflow.stateTable shows all of the states defined for a workflow
    - MidiQOL.Workflow.stateHooks shows all of the hooks that midi will call for state transitions.
    - developers can override/change the behaviour of states/workflows
    ``js
    class MyWorkflow exends MidiQOL.Workflow {
      constructor(...args) {return super(...args)};
      async WorkflowState_Start() { return this.WorkflowState_Cancel };
      }
      w = new MyWorkflow(_token.actor, _token.actor.items.getName("Item name")_, ChatMessage.getSpeaker);
      w.performState(a.WorkflowState_Start);
    ```
    All of the states defined for a Workflow exist within the newly created workflow, so you can selectively change the behaviour of the workflow states by replacing with your own code. Subsequent releases of midi will provide more granularity for such overrides.
  * Deprecated any reference to workflow.currentState and Workflow.WORKFLOWSTATES. Prefer to use
  ```js
    workflow.currentAction === workflow.WorkflowState_ConfirmRoll
  ```
  and
  ```js
    Workflow.stateTable
  ```
- Rewrite of the attack per target code to improve behaviour and process ammunition/spell slots/resources "appropriately". Probably still a work in progress.


## 11.2.4
* Fix so that Target confirmation does not fire when passing {TargetConfirmation: false} to item.use(config, options) as an option, which include completeItemUse calls.
* Fix so that Target Confirmation when using AoE spells fires after the template is placed.
* Showing the targets actor sheet from the target confirmation dialog no longer also pings the token.
* Fix for error thrown in checkIncapacitated.
* Fix for incorrect item chat description being displayed.
* Fix for wallsBlockIncapacitated/alwaysBlockIncapacitated in midi targeting.
* Actors that can't use an item because they are incapacitated now report the condition that causes them to be incapacitated.
* **Walled Templates** After some experimentation it seems that midi auto targeting with walled templates now works. You can enable midi's targeting and disable walled template's targeting (if you want to ignore incapacitated). Choose one.
  - For midi's "walls block" settings to function correctly you need to enable "Walls block templates" in walled templates.

## 11.2.3
* Fix for troubleshooter failing to get game settings - now uses "safeGetGameSetting" which will return undefined if no setting exits, rather than throwing an error. safeGetGameSetting is exported as MidiQOL.safeGetGameSetting.
* Fix for target confirmation nonTargeted firing with target type None.
* Gridded Gridless was a little bit too intrusive, so now it only affects distance measures that midi-qol does and you can specify how big to make the fudge factor.
  - dnd5e scriptlets will have a version that forces gridded mode distance calculations on gridless grids.
* Fixed the irritating, but cosmetic, config settings not closing when submit is pressed and no changes had been made.
* Added MiqiQOL.humanoid which is an array of strings that midi uses when testing if a token is humanoid in condition evaluation. This can be modified. @Elwin
* Some additions to Target Confirmation.
  - Hovering over a target in the confirmation dialog will highlight it on the canvas.
  - Clicking on a target in the dialog will "ping" its location on the canvas
  - Right clicking on a token in the dialog will remove it from the dialog.
* flags.grants.fail.(dis)advatnage.attack.all/mwak etc now overrides keyboard (dis)advantage.

### For macro writers.
* To avoid some ambiguity a changec to calling macro behaviour. Inside macros called by midi
  - rolledItem (always available) is the item which was rolled to initiate the macro call and is usually workflow.item, but can be workflow.ammo
  - macroItem (available if the macro was sourced from an item) is the item that contains the macro being called
  - item (always available) will change it's meaning in 11.3 to **always** be rolledItem that casued the macro to be called (currently it is either macroItem if defined otherwise rolledItem).
  - a deprecation period (until 11.3) where references to item inside ItemMacros will generate a deprecation warning.

## 11.2.2.1
* Fix for late targeting config appearing on reload.
* Fix for typo in late targeting dialog.

## 11.2.2
* Fix isDamaged macro call not being called when auto apply damage enabled.
  - reorder (slightly) macro calls when damaged. preTargetDamageApplication is called before isDamaged, so that special case changes to applied damage will override damage application.
* Some clean up of checkWounded/Dead to try and avoid errors being thrown. Please check your settings.
  - if you specify adding wounded but don't specify a condition or the condition can't be found you will get an error.
  - You may choose to only mark defeated/dead on player controlled tokens or gm controlled tokens or both.
  * Cleaned up token links in chat cards/target confirmation for the GM.
    - Hover will still highlight the token, but the link will open the token's actor sheet.
    - Should also resolve the issue with anonymous names being rendered strangely.
    - Since the link reference provides access to the token's actor it is recommended that you enable "Use Token Names" in midi settings.
* Items with a target type of Self will now auto target the token when the item is rolled. This may be **breaking** if you have been targeting others when the item has a target of self.
* **Breaking** Changes to late targeting (now called Target Confirmation) to support more flexibility.
  - Target Confirmation is now **only** a client setting (no separate GM setting for it). Use one of the force sync settings modules if you want to have consistent settings for GM/players. I use Force Client Settings and that seems to work, but you need to configure midi-qol.TargetConfirmation to locked inside the Force Client Setting module settings.
  - Separate config app for Target Confirmation settings accessed from Midi-qol settings (NOT workflow settings).
  - Ability to specify where the Target Confirmation dialog will appear.
  - Items can be marked as Conf Targets which means midi will display the confirm targets dialog when the item is rolled (after template/range template targeting as required) so that players can review the targets midi has selected - useful for Mass Cure Wounds etc.
  - if you had Late Targeting set you will be prompted to set your target confirmation settings on first load.
* Added property to items to force target confirmation when the item is used. Useful for some spells that often result in bad target selection, wall of fire, radiance etc
* First support for using midi in a gridless map. Enable gridded gridless in the mechanics tab and all distances will be based on the grid distance settings even though the canvas is gridless
  - midi will round distances so that nearly in range is counted as in range - makes those melee attacks usable.
  - Will also impact all other distance calculations, like drag ruler, flanking, flanked, nearby foes and so on which will all round to the nearest grid unit plus fudge factor.
  - NOT extensively tested so expect edge cases to abound.

## 11.2.1.1
* Fix for not being able to use feat reactions thanks @thatlonelybugbear

## 11.2.1
* Fixes for dnd5e 2.4 compatibility - should be backwards compatible with dnd5e 2.3
* some clean up of config.html - should not have any effect - but....
* removed dn5e-tooltips from incompatible module checks
* Added support for acctor.system.details.race being a String or an Item.
* Replace references to item.getCriticalThreshold() with item.criticalThreshold
* **Breaking** added typeOrRace and changed raceOrType in condition evaluation
  - typeOrRace will return the type if there is one, else the race.
  - raceorType will (now) return the race if there is one else the type.
  In most cases you will want to use typeOrRace rather than raceOrType.
* Added ``MidiQOL.raceOrType(Actor|Token|TokenDocument|Uuid): string`` and
``MidiQOL.typeOrRace(Actor|Token|TokenDocument|Uuid): string``



## 11.1.13
* Fix for a couple of typos - thanks @thatLonelyBugbear and @Elwin
* Change to wounded/unconscious/dead handling. Instead of fixed conditions, you can now specify the status effect to be applied for wounded/unconscious/dead.
  - By default the convenient effect "Wounded" is not a status effect, you will need to "Toggle status effect" on the CE Wounded effect for it to be available in the midi config panel
  - Please review your settings after upgrade since the changes might not migrate properly.

## 11.1.12
* Added option to ignore dead or dead and incapacitated when targeting with area effect spells.
  - Previous ignore dead setting (which was incapacitated) will get mapped to ignore dead - you may wish to change that to ignore dead/incapacitated.
* Fix for untargeting of tokens being triggered on combat updates that do not update the combat round or turn.
* Implemented flags.midi-qol.optional.NAME.XXXX CUSTOM ItemMacro (either ItemMacro.uuid or just ItemMacro which will be rewritten with the source items uuid), Macro or function., which will allow you to call the specified macro as the bonus action. 
  - The macro is awaited so can perform async operations.
  - If the macro returns a Roll it will be used to replace the existing roll.
  - Any other return will be ignored and the original roll used.
* New option for optional.NAME, reroll-query which will do a reroll of the current roll and query the player to keep the reroll or not. (not sure if this is really useful since reroll-kh/reroll-hl seems to cover everything).
* Fix for checking saving throw advantage/disadvantage when saving throw triggered  via a workflow. e.g. ``flags.midi-qol.advantage.attacks.all CUSTOM item.school === "evo"``
* Fix for isDamaged test (expiry/macro calls) firing if the target was missed by an attack.
* **Breaking** This version **requires** DAE 11.0.24 and if times-up is installed it must be verison 11.0.4.
* Troubleshooter now reports modules whose version number is too low to be used by midi-qol. 
  - This includes DAE which will not be utilised by midi if the version number is too low

## 11.1.11
* Only call preTargetDamageApplication macros if the target token was hit. Was calling for all targeted tokens
* Fix for condition data's workflow.item being incorrectly set to workflow.actor.getRollData(). So now workflow.item.name etc will work as expected. As a reminder you can just use item.name etc since item is available directly.
* Fix for chat messages from a deleted user throwing an error.
* Troubleshooter will treat a verified version of 11 as verified for all version numbers starting with 11

## 11.1.10.1
* Fix for error thrown when removing concentration if the concentration effect was added by hand.

## 11.1.10
* **Breaking** flags.midi-qol.onUseMacro Custom ItemMacro will no longer rewrite the change value when the effect is created on an actor. Rather it will be done when the effect is evaluated, so that it won't get out of date.
  - This means that effects with flags.onUseMacro ItemMacro will need to be reapplied, in particular any transfer effects, to "undo" the rewrite of ItemMacro -> ItemMacro.origin
  - Requires DAE updated to 11.0.22
* Enchanced MidiQOL.getChanges(actorOrItem, key: string) to also return the effect that has the change.
* Added first pass of creating api definitions for Monaco Macro editor for MidiQOL.function auto complete. I've not done much testing so feel free to respond with issues.

## 11.1.9
* Fix for error thrown when removing template => remove concentration
* Put back option to not show dead/unconscious when hp reach 0

## 11.1.8
* Added name="item name" to overtime effects (just for consistency)
* New option for overTime effects, fastForwardDamage: boolean, true damage roll is always fast forwarded, false damage roll is never fastforwarded, absent use the module settings.
* Added config option to apply wounded as an overlay effect.
* Fix for actor inventory standard roll/attack/damage buttons not being displayed after doing a roll.
* Fix for rolling an item when there is no canvas.
* Fix for error introduced when rolling saving throws.
* Clarify Monks Token Bar config setting in TroubleShoorter.
* updateEffects in GMAction is now trusted player instead of the accidental gm only.
* DAE bug fix to allow editing item macros from character sheet.

## 11.1.7
* Fix for actor using a reach weapon not being able to gain flanking when 2 squares away.
* Fix for weapons with range touch and property reach not being able to attack from 2 squares away.
* Fix for Actor groups throwing an error in prepare data with dex undefined.
* Fix for challenge mode armor calculations of EC/AR when using challengeModeArmor scaling house rule and other places.
* Functions called by asyncHooksCallAll can now set workflow.aborted to true to cause the workflow to terminate prematurely.
* Fix for trouble shooter not recording call stack for some cases.
* BonusDialog rolls can now reference item data, if present.
* midiProperties now added to equipment type items, but be warned some (many) of them don't make any sense and midi lets you set them to whatever you want.

## 11.1.6
* Enhanced Late targeting dialog to show flanking, cover and range.
* Updated computeCoverBonus to include checking for sharpShooter/Spell sniper which were previously handled outside of the computeCover call.

## 11.1.5
* Added some more flags which grant the target of an attack advantage/disadvantage on saves against the attack. These flags do NOT affect saves which are not prompted for by midi-qol when auto checking saves.
  - flags.midi-qol.grants.advantage.save.all/dex/str..., flags.grants.advatnage.check.all/dex/str..., flags.grants.advantage.skill.all/dex/str...
  - flags.midi-qol.grants.disadvantage.save.all/dex/str..., flags.grants.disadvatnage.check.all/dex/str..., flags.grants.disadvantage.skill.all/dex/str...
  - The flags evaluate the value as a condition, so an item (called "Test Item") with a passive condition
  ```
  flags.midi-qol.grants.advantage.save.all CUSTOM item.name === "Test Item"
  ```
  will give advantage to all saves against "Test Items"s saves.
* added getRollData item.name and name which were inexplicably missing.
* Fix for attacks === AC not hitting if optional rules disabled.
* Put back the gm auto fast forward damage setting on the config panel.
* When debug warn is enabled midi will check flags.onUseMacroName fields to have mode custom - required else they won't work properly.
* Fix for not removing isDamaged special duration effects when taking damage from spell that don't have an attack.
* If you specify LMRTFY for saving throws and the module is not active midi will fall back to the standard dnd5e roll dialog instead of auto rolling the save.


## 11.1.4.3
* Fix for updates with no target specified

## 11.1.4.2
* Remove debug of scale value left in

## 11.1.4.1
* MidiQOL.socket()
  - Move updateActor to trusted player permissions
  - Move checkReations to all players
* Fix potential error when race not set - thanks @thatlonelybugbear
* Fix case when noConcentrationCheck would not work when reappying damage. thanks @thatlonelybugbear

## 11.1.4
* The fast forward ability rolls setting will now fast forward initiative rolls
* Rolling initiative from the character sheet now supports ctl/alt (or whatever key configuration you have set) to roll initiative with disadvantage/advantage.
* Flanking checks now allows flanked/flanking to include allies that are 2 squares away from the target if they have an equipped reach weapon.
* Pass options to DummyWorkflow. Thanks @Elwin
* MidiQOL.createActor now allows you to pass an array of actor data to create multiple actors and returns the ids of any created actors. Also now supports data.context which is passed to the createDocuments call. Thanks @thatlonelybugbear
* Fix for concentration removal when no-concentration data/no effects present.
* Cleaned up handling of range target specs so that invalid combinations are not saved.
* Fix for edge case where confirming a roll as a miss can lock being able to roll future attacks.
* Provide feedback to GM/Player when confirm buttons will not function.
* MoveToken and MoveTokenAwayFromPoint now accept an additional option, animate: boolean to control animating the token move. Thanks @thatlonelybugbear.
* Added new item property, No Conc Save, which if set means that no concentration save will be done if damage is applied by the item.
* New ChallengeModeArmor setting (and layout of options has changed) scale + noAR, same as the scaling version, but armor provides no AR damage reduction.
* Active defence will now use the standard dnd5e roll dialog if LMRTFY is not installed.
  - Save throw DC is displayed to player if GM setting to show roll formula is "all" (since the DC reveals the attackers pluses).
  - Roll success failure indicated if show hits to all players is enabled.
* MidiQO.socket() now filters the actions that non GMs can perform. 
  - Most of the functions used internally by midi will be rejected
  - Calls to "addConvenientEffect", "chooseReactions", "createActor", "createEffects", "createReverseDamageCard", "deleteItemEffects", "deleteToken" and "removeEffects" require the user to be a Trusted Player. For a short time calls to these will throw a deprecation warning and still be allowed.
  - Calls to "applyEffects", "bonusCheck", "completeItemUse", "confirmDamageRollComplete", "confirmDamageRollCompleteHit", "confirmDamageRollCompleteMiss", "createChatMessage", "D20Roll", "monksTokenBarSaves", "moveToken", "moveTokenAwayFromPoint", "removeWorkflow" and "rollAbility" are callable by all players
  - MidQOL.socket().canCall(name: string) will return true/false if the current user can call the specified handler.


## 11.1.3
* Fix for permission issue on macro execution

## 11.1.2
* Added some more cover/targeting module checks to the TroubleShooter
* Added merge courtesy @caewok

## 11.1.1.1
* Fix for trobulshooter misreporting saving throw module status reporting

## 11.1.1
* Fix for sw5e sheet patching error

## 11.1.0
* Added Troubleshooter checks for cover calcs when required module not installed.
* Added check for saving throw module dependencies not installed.
* Fix for typo preTargetSsave in en.json.
* Deprecated the use of this to refer to the workflow inside midi Item onUse or Actor onUse macros. 11.0.22 left available in case this causes any problems.

## 11.0.22
* Fix for workflow settings not updating the open settings app.
* Fix for Troubleshooter error with latest ddbbi.
* Fix for compatibility warning for criticalThreshold
* Include merge for ATV cover calculations. Thanks @caewok
* Fix for tool checks not rolling blind after seting blind roll in configuration dialog.

## 11.0.21.2
* Late targeting now works with animated tokens.
* Fix for messed up damage rolls.

## 11.0.21.1
* Fix for incorrect initialisation of blind player ability checks field which caused saving settings to fail.
* Fix for bad bug with macro calling dropping the return value.

## 11.0.21
* If a roll is awaiting confirmation, the player won't be able to roll the same item again until the roll is confirmed/cancelled.
* Deleting a chat card removes, but does not undo, the workflow.
* Cancelling an item roll removes the workflow and undoes any changes for that workflow (like consuming ammo etc) provided undo workflows is enabled.
* Fix for not displaying other damage dice so nice dice rolls.
* Rolling an attack a second time won't consume the ammo again.
* Modify character/npc sheet behaviour so that filtering for reactions picks up all reaction types, not just "reaction".
* Player blind roll settings are now multi select lists instead of boolean. So you can select which skills/saves/checks are to be rolled blind rather than all or nothing.
* Added an option for monsters to roll average damage.
* Fix for undo workflows not correctly putting back effects.
* Make the check for maroPass case insensitive.

## 11.0.20.2
* Fix for hidden advantage/disadvantage check when attackeer is hidden giving both advantage and disadvantage.
* Fix for overtime effects throwing an error when roll confirmation is on.

## 11.0.20.1
* Fix for not displaying attack button in some circumstances

## 11.0.20
* Created MidiQOL.incapacitatedConditions which is those conditions, if present on an actor make it incapacitated (as well as 0 Hp/Vitality Resource). You can change the field to change what conditions count as incapacitated. Default value is: ["incapacitated", "Convenient Effect: Incapacitated", "stunned", "Convenient Effect: Stunned", "paralyzed", "paralysis", "Convenient Effect: Paralyzed"].
* Fix for hasCondition not working with upper case statuses.
* Fix for incorrectly displaying damage card when the only damage for an attack is type "midi-none" (No Damage).
* Added targetUuids, hitTargetUuids, hitTargetECUuids, saveUuids, failedSaveUuids to flags.midi-qol on the merge item card.
* When computing nearby foes, neutral tokens will only count hostile tokens as enemies, no longer including neutral tokens.
* Added confirm miss/confirm hit buttons which will complete the roll as a hit or miss. If completing the roll and the roll hits, the confirm/confirm hit buttons will be inactive until damage has been rolled.
* Added a cancel button so that (only) the GM can cancel a workflow - this requires undo workflows to be enabled.
* Players will see a confirm button on the item chat card (even if they can't confirm the roll) which is removed when the gm completes the roll, so that they can wait for the GM to confirm the workflow before they roll the item again.

## 11.0.19
* Reworking of concentration removal - I think this is better and less prone to errots being thrown.
* Confrim button is only active after damage has been rolled or attack misses - will do nothing until then.

## 11.0.18
* Fix for not being able to call world macros in onUseMacros
* Fix for issue when using midi-qol in babele enabled games.
* Added rolls to before/after chat message and set message type to roll.
* fix initialisation of MidiQOL.MQOnUseOptions
* Force flagsmidi-qol.onUseMacroName to be CUSTOM
* corrrect flags.midi-qol.optional.Name.attack.fail to flags.midi-qol.optional.Name.attack.fail.all
* Some fixes for removing concentration throwing an error with non-existent item in embedded collectiopn, but not all. The error is now only cosmetic.
* Fixed compatibility with group rolls. If using group rolls you need to deselect add other buttons - else the merge card will look strange.

## 11.0.17
* Fix for uncanny dodge now checkes that it can see the attacker
* resolved a reported error when doing overtime effects with a blank saveDC
* put back macroData.uuid to fix ddbi booming blade
* Fix for errors thrown when undo workflow not enabled.

## 11.0.16.3
* Fix for applyTokenDamage when called with a set of TokenDocuments rather than the correct set of Tokens.

## 11.0.16.2
* Fix for effects being applied on fumbled rolls.

## 11.0.16.1
* Fix for effects not being applied

## 11.0.16
* Fix for calling target onuse macros not finding the item macro.
  - set the actor and token macro variables to the actor/token rolling the macro.
* Workflows awaitng confirmation will have the chat card removed if the same item is rolled again by the same player (since the workflow can never be completed if the item is re-rolled).
* **Breaking** If an attack is fumbled and auto roll damage is set to tru midi will from the damage

## 11.0.15.5
* Restyled the buttons in the chat card.

## 11.0.15.2/3/4
* Fix for incorrectly set confirmDamage roll on startup.

## 11.0.15.1
* Fix for Item onUse macro dropdown not being populated.
* Pass full damage detail to preTargetDamageApplication macros.

## 11.0.15
* Added DAE Item Macro Editor button on item sheet.
* When adding an item onUse macro default the name to ItemMacro.
* Change the order of display of settings to move fast forward ability rolls and late targeting to the top of the list.
* Remove itemacro from the list of checked modules - you no longer need to install itemacro at all.
* getTokenDocument will also accept an actor.
* Fix for calculating cover bonus when using alternative token vision.
* Fix for optional.NAME.fail.all thanks @thatlonelybugbear
* Fix for duplicating optional.NAME buttons when fail.all effect is present.
* Fix a bug in reaction processing when reaction items make a change to the attacking actor.
* Item onUse macro fields now support dragging and dropping items/macros onto the field.
* New mechanic to configure if bonus rolls display a "before and after" card or not.
* **Breaking** Change to how Item onUseMacros/Actor onUse macros are specified:
  - ItemMacro: use the macro stored on the item being rolled (if any)
  - ItemMacro.ItemName: Lookup the item on the current actor by name and use it's macro
  - Macro.name: Lookup a world macro by name
  - a UUID, referring to an item or macro
* New misc setting to provide additional buttons on the chat card, roll with  disadvantage/advantage and not critical/critical. When enabled additional buttons are added to the chat card to support rolling with advantage/disadvantage/midi calculated advantage critical/nocritical/midi calculated critical damage. 
* New misc setting, Confirm Roll which can be none, player/GM, GM Only. If enabled the player/GM must confirm the roll (on the chat card) before the damage/saves/active effects are applied. Until confirmed you can re-roll the attack or damage to your heart's content. Once confirmed rolling an attack or damage will start a new workflow.
  - If undo workflows is enabled (now strongly recommended) and you re-roll an attack all reactions and bonus checks done during the roll are undone as if they were never used and the choices are re-represented.
 
## 11.0.14.1
## 11.0.14.2
* Fix for error thrown when optional rules disabled
* Added item flags/midiFlags to item.getRollData() as item.getRollData().flags, item.getRollData.midiFlags

## 11.0.14
* Check token isTargetable when using walled templates - thanks @Elwin
* New option when displaying apply damage card, + misses, will generate a separate damage card for targets that midi adjudicated as misses. This is just a shorthand way for DMs to overrule the decision that an attack missed and be able to apply damage. The misses damage card will not auto apply damage, leaving it to the DM to apply the damage.
* New optional rule to allow DRAll, DR.rwak, DR.rsak, DR.mwak, DR.msak to apply to the total damage of an attack (i.e. weapon, bonus dmaage and **other** damage). For example DR.rwak 5,against a spider bite that does piercing damage and poison (other damage) will reduce both the piercing by 5 **and** poison (other damage) by 5, if enabled. If not checked DR.rwak will reduce the total damage by 5. Enabled corresponds to the pre 11.0.14 behaviour.
* Fix for trying to update a deleted chat card when not auto applying damage.
* When rolling an item if the roll is blocked by the preTargeting Hook, perTargeting macro, or preItemRoll macro midi will no longer display a ui.notification.warn, so if you want something to be displayed to the user you will need to do so in the macro/hook.


## 11.0.13
* **Breaking** Change to how walls blocking attacks is implemented. Midi used to check for a line of sight to the target and if there was none then the attack was blocked. With the new vision checking and wall types it seems to make more sense for walll blocking to apply if there is a movement blocking wall between the attacker and the token. So now you can slash at the monster hidden behind the curtain.
  - If using the vision testing such attacks will be at disadvantage if the target can't be seen, but will be possible, previously this would be blocked by wall blocking.
  - If using levels to calculate collisions midi will use type "collision" instead of "sight"
* Troubleshoot won't shout error messages on load. Only "Errors" that will definitely cause midi to misbehave.
* Slight change to how midi decides which detection modes cancel invisibility advantage, now uses the detectionMode.imprecise setting.

### Item/Spell changes
* Cleaned up some warnings in Broach of Shielding and Shield spell.
* Fixed Spirit Guardians to avoid global declarations (probably wont affect you).

## 11.0.12
* Fix for attack rolls not happening when checking vision.
* Fix for reactions not being removed.

## 11.0.11.1
* Fix for typo in canSense affecting checking when force Invisibility Vision is checked.

## 11.0.11
### Bug Fixes
* Fix for badly specified language files that leave blank the text fields use to check the spell description for 1/2, none or full damage. A blank string for "full damage" in the language file would always match and spells would do full damage on a save.
* Updated es.json to include english names for spells that do no damage on saves.
* Fix for checking advantage/disadvantage using RAW/sight checking.
* Fix for flags.midi-qol.fail.all/flags.midi-qol.fail.attack.XXX not working for attacks.
* Forcing all player skill rolls to be blind was still displaying the dice so nice dice, this has been fixed.


### New Features
* Added optional rule setting: Invisibility Vision. Checked => tokens behave as if vision is enabled when checking if they can sense another token, unchecked => tokens without vision can sense everything.
* **Breaking** When using an item with ammunition midi will now also call item macros for the ammunition, if present, as well as calling macros for the item using the ammunition.
* Troubleshooter will now display any detected problems on foundry load as notification errors on the GM client.
* completeItemuse will now accept an item uuid as well as an item.
* Added workflowOptions.otherDamageRollDSN, false means don't show dice so nice dice rolls when rolling other damage, only works with merge card.
* Support for "Alternative Token Visibility". Out of the box support by ATV for midi is excellent, so you may not need to do anything.
  - You can choose to use ATV for walls block targeting calculations (TOTAL/HIGH) cover blocks an attack.
  - You can also choose to let midi use ATV for cover calculations. Disabling midi support in ATV means that midi will call ATV when it needs to check a cover bonus using the dnd5e definitions for the AV/Save bonus granted. If you have customised your cover bonuses in ATV then do NOT disable midi support, since midi will not pick up the changes you have made.
* Verified the support for "Walled Templates".
  - The correct way to set this up is to set midi's template targeting to Walled Templates and turn **ON** auto targeting in walled templates, anything else can cause odd effects and is not supported. If you don't want to have walled templates auto target disable the module.
  - Trouble shooter will detect incorrect settings and display this in the trouble shooter.
* Support for a slightly different workflow when an AoE spell is cast with template type **radius**. midi interprets that to mean a circular AoE whose template is centered on the caster and the template will be auto placed on cast (ignoring the place template setting in the configure usage dialog).
  - A range of **Special** means ignore the caster when targeting. **Self** and **Any** will include the caster as a target.
  - Midi will auto place the template centered on the caster.  If Walled Templates is enabled the template will be attached to the token and move with the token. Allowing for ongoing AoE activation via (for example) the module Template Macros.
* ``MidiQOL.resolveTlatetargeting(item, {title: string, forceDisplay: boolean): boolean`` added to api, which will display a late targeting dialog (forceDisplay to override midi-qol settings) which will update game.user.targets with the selected targets. This can be used to encourage the user to select a specified group of targets (used in the new Spirit Guardians to choose immune tokens). A return of false means the user closed the dialog rather than choosing roll.
* ``MidiQOL.isTargetable(token: Token): boolean`` added to the api. Checks if midi thinks the token can be targeted, checks core **hidden**, any of the midi specific settings (flags.midi-qol.neverTarget etc) and that it has an attached actor.

### New Items
* New version of Spirit Guardians. This **requires** template macros and **dae 11.0.9** to operate. This utilises the new midi-qol feature for ranged templates to create a template around the actor, that moves with the actor and applies the spirit guardians' slow feature and does damage when tokens enter the template or start their turn in the template.
  - When cast the caster is prompted to select targets that are immune to the spell.
  - Supports walled templates for templates that are blocked by walls, wrap around corners and so on.
  - Supports casting at a higher level for the damage done.
  - Can be used as a template for lots of other similar spells that are centered on the casting token.
  - Requires walled templates (to attach the template to the token) and template macros to do the various effect/damage application. The code highlights a couple of gotchas for template macros, especially when the template is created/moved. Overall template macros is a nice way to do some of these spells.

## 11.0.10.1
* Fix for throwing error when checking for disadvantage when there is a nearby ally (houe rule).
* Slight change for late targetting when using an item with ammunition and dnd5e-scriptlets to respect late targeting settings.

## 11.0.10
* New setting, "Enforce Single Weapon Target". When set weapons can only target a single creature if the target definition is empty. (This allows you to use weapons from the SRD unchanged without having to set a creature spec to enforce target counts). You can always set a number of creatures in the item if it needs to able to target more than 1.
* Fix for **bad** bug of not processing fumble attacks correctly.

## 11.0.9.1
* Fix for "Chat Message saves" not working.
This release mainly adds to the TroubleShoorter Functions
* Added MidiQOL.``TroubleShooter.exportTroubleShooterData()`` which will create and export trouble shooter data.
* Midi will auto create two world accessible macros ``MidiQOL.showTroubleShooter`` and ``MidiQOL.exportTroubleShooterData`` which can be dragged to the hotbar and run by any client.
* Added midi settings data to exported Trouble Shooter data.
* Added option to overwrite local midi settings with the settings from a loaded trouble shooter file. (This means you no longer need to have users export midi settings, just the trouble shooter file).
* Added first two auto fix problems. ItemMacro charsheet setting and midi enable workflow (more to come). Clicking on Auto Fix will fix the settings.
* Report some more details about the world and current scene.
* Report foundry identified module problems (same data as displayed in the foundry support tool) on the problems tab.
* Sanitize any urls in the trouble shooter data.

## 11.0.9
* Added trouble shooter app. At this stage it is mainly a tool to report your settings and loaded modules (and their settings).
* There are two modes Local Client Settings (visible on the summary tab) and Settings from File. Local Client settings means the data reported is from the current foundry client, Settings from File means the display is a snapshot from  another client exported from the TroubleShooter app and then imported.
  - There are a small handful of "problems" that the app can diagnose, more to come.
  - Midi has been reworked to log some/most errors (errors logged will improve as time progresses) it encounters to the trouble shooter app and the last 10 errors are displayed in the app.
  - next release of DAE will have some (not much) support for logging errors into the midi-qol TroubleShooter app
  - Error display updates as new errors are recorded if in Local Client Settings mode.
  - Data can be exported and loaded on another client - to help the support guys looking at the status of a user's setting/modules.
  - An option to clear errors (which resets to Local Client Settings mode), so you can see the errors from a single midi action in the error display, by clearing and then running the failing action. To report a specific problem to one of the helpers, clear errors, run the problem workflow and then export the data which should include the error.

## 11.0.8 testing versions

## 11.0.7.1
* Fix for AoE targeting broken.

## 11.0.7
### Bug fixes
* Fix for some convenient effects throwing an error because effect.flags may not be defined.
* Fix for anomalous behaviour if you both set hide save rolls and then roll the save as a public roll (overriding the midi specified blind roll).
* Check number of tokens targeted before checking token range. Should be more obvious that you have multiple tokens targeted.
* Range AoE, template AoE and normal targeting won't throw an error if there are tokens with no actor attached to them, the token just won't be targeted.
* Fix so that RAW invisibility advantage/disadvantage really is Rules as written. Thanks @Krigsmaskine
* Updated Banishment spell
* Updated Absorb Elements spell
* Update Chill Touch Spell
* Updated Melf's Minute Meteors

### New Stuff
* Invisibility advantage/disadvantage checking now supports 3 options,
	- none - don't check (but if using Convenient Effects advantage/disadvantage is always applied via the invisible convenient effect),
	- Rules as Written - being invisible/hidden will ALWAYS give advantage. Attacks against an invisible foe will have disadvantage if the foe cannot be seen by the attacker. Hidden foes will be attacked with disadvantage.
	- Use Token Vision - an invisible attacker will have advtantage if the defender can't see them (hearing, detect Evil and Good, detect Magic, detect poision and disiease and detect thoughts) do not prevent advantage or disadvantage.
	- If using "Use Token Vision" or "Rules as Written" and Convenient effects you will need to edit the convenient effect Invisible to remove the automatically granted advantage/disadvantage changes.
* Change to default behaviour of flags.midi-qol.* CUSTOM.
	- Fields that are not deffered evaluation fields will be evaluated via midi's evalCondition code, meaning that most of the time the condition will be evaluated according to the expression passed in the change.value.
	- Deferred evaluation fields will be left as text and evaluated when accessed for a roll.
* Some additional modes for late targeting, "all including AoE/Ranged Area" items, "all ONLY for AoE/Ranged Area" items.
* First try at checking invisibility for advantage/disadvantage even if the token does not have vision enabled (will use the tokens vision settings as if vision was enabled). As far as I can see it works, but I'm certain I have not considered all edge cases - so treat it as experimental.
* Added support for MidiQOL.WallsBlockConditions (an array of string condition names) that if targeting has walls block set, targets with these conditions won't be targeted. Current list is "burrowing", so ranged attacks, AoE or range area of effects won't target these tokens. (e.g. you can't fireball someone who is underground).
* Added support for flags.midi-qol.neverTarget, if set on an actor midi won't target it. Over time this will replace the previous race/type setting trigger.
	- Added sample feature in NeverTarget in Midi Qol Sample Items/Misc which when dropped on an actor means midi won't target it.

### For macro writers:
* Added MidiQOL.configSettings().showDSN, which can be altered by macro to enable or disable/denable all midi dsn rolls, defaults to true.
* flags.midi-qol.grants.criticalThreshold is now be evaluated as an expression when checking if an attack is critical.
* Added another target onUseMacro postTargetEffectApplication called after effects are applied to a token. Only called for tokens that have effects applied by the used item.
* Added midiFlags to actor.getRollData() as a shorthand, meaning effects expressions can reference midiFlags.advantage.all etc. instead of flags["midi-qol]. and do check for defined i.e. ``midiFlags?.yourFlag`` instead of ``flags["midi-qol"] && flags["midi-qol"].yourFlag``
* Added ``async MidiQOL.moveToken(token: TokenRef, {x: number, y: number})``
	- move the specified token to the specified position on the canvas. Executes as GM so no permission issues.
	- TokenRef is one of Token | TokenDocument | TokenDoucment.uuid
* Added async ``MidiQOL.moveTokenFromPoint(token: TokenRef, distance: number, {x: number, y: number})``
	- Move the token "distance" feet (or meters depending on the grid) on a line drawn between the token's center and the specified point. For example to move a token 5 feet away from your token 
	- `` MidiQOL.moveTokenFromPoint(targetToken, 5, myToken.center)``.
	- TokenRef as above.
* Added support for contested rolls.
```js
async Added MidiQOL.contestedRoll(
  source: {token: TokenRef, rollType: "test" | "save" | "skill", ability: string, rollOptions: any},
  target: {token: TokenRef, rollType: "test" | "save" | "skill", ability: stringm, rollOptions: any},
  displayResults: boolean, // Should the results of contest be displayed to chat
  itemCardId: string, // the itemCardId of a merge card item card to put the results in (if absent a new chat message is created)
  flavor: string, // The name of the contested roll - e.g. Shove, if not passed Contested Roll will be used
  rollOptions: any, // controls how the roll is displayed,
// fastForward: false display the roll configuration dialog
// chatMessage: true/false display the roll chat card.
  success, failure, drawn // call back functions called by midi.
});
```
- ability can be str/dex/con etc for test/save, and acr/ath etc for skills. You can also use the long name forms, Strength/Dexterity or Athletics/Percpetion if you prefer.
- When called midi will find the player for the token and prompt them to make the appropriate roll (or just do the roll if fastForward is true) and compare the roll results, calling the appropriate callbacks as needed and displaying the result of the roll if requested.
- rollOptions can be passed in the main call or specified per token, token specific rollOptions take precedence.
- The result of the roll {result: number, rolls: [Roll]} is returned by the function. The result is the first roll results - the second , so +ve is success, -ve failure and 0 is drawn. The rolls return has the rolls done by the tokens.
- You don't have to use the callback functions, you can just await the contested roll and examine the results.
- If one of the players closes the roll dialog without rolling the contested roll is aborted.
- Midi will also use the players roll saves timeout and auto roll if the player does not roll in the required timeframe
- Here's an example from the sample Shove Item in the midi sample items compendium
```js
const  targetSkill = target.actor.system.skills.ath.total > target.actor.system.skills.acr.total ? "ath" : "acr";
await  MidiQOL.contestedRoll({
	source: {token, rollType:  "skill", ability:  "Acrobatics"},
	target: {token:  target, rollType:  "skill", ability:  targetSkill},
	flavor:  item.name, 
	success:  success.bind(this, token, target), 
	displayResults: true,
	itemCardId:  workflow.itemCardId,
	rollOptions: {fastForward:  false, chatMessage:  true}
});
```
* Which says, roll an acrobatics check for token and an athletics or acrobatics check for the target token.   
The flavor is the item name (in this case Shove), on success call the function success, display the results to a chat message (and since this is an item onUse macro wtih merge cards enabled I pass in the itecCardId) of the item chat card and the results will be displayed in that card.  
The rolls are not fastForwarded so the appropriate players get presented with a roll configuration dialog and the results of each roll are displayed as ability/skill chat cards.

## 11.0.6
* Fix for fail optional bonuses still creating a dialog even if no effects with charges is available.
* Fix for concentration checks being triggered when player is healed - same fix as in v10 but no reported error.
* If a save/check/skill roll is made with a target value the resultant roll.options.success will be set to true/false. If there is no target value roll.options. success wil be undefined,
* Fix for nearby foes check when using a thrown weapon of type mwak (midi was checking the nearby foes and should not).
* First cut of hiding activation condition expressions in the chat card.
* Added checkNearby to the functions available in condition evaluation
* Additional options for checkNearby/FindNearby, as well as -1, 0, 1 for HOSTILE, NEUTRAL, FRIENDY you can use the strings "Hostile", "Neutral", "Friendly". You can use "all" instead of passing null. You can mix and match between strings or numbers.
* You may pass an array of dispositions to check, e.g. ["Friendly", "Neutral"] will return friendly and neutral tokens.
* Additonal option, relative (defaults to true) which means use the token disposition to identify potential nearby tokens. If the target has a HOSTILE disposition, asking for "Friendly" with relative set to true will return tokens with a HOSTILE disposition. This is the same behaviour as previously, but you can specify relative: false to find tokens with a specific disposition.
  - MidiQOL.checkNearby("Friendly", token, 5) find all tokens friendly to the token within 5 feet
  - MidiQOL.checkNearby("Friendly", token, 5 , {relative: false}) find all tokens with a disposition of friendly within 5 feet
  - MidiQOL.checkNearby(["Friendly", 0], token, 5) find all tokens friendly or neutral towards the token within 5 feet
* Enhancement to MidiQOL.canSense(target, token) you can pass an array of detection modes to limit which of the tokens vsion modes to check. Any of 
['basicSight', 'seeInvisibility', 'senseInvisibility', 'feelTremor', 'seeAll', 'senseAll'] can be used
  - If you have detection/vision modes installed you can pass any of
['blindsight', 'basicSight', 'detectEvilAndGood', 'detectMagic', 'detectPoisonAndDisease', 'detectThoughts', 'devilsSight', 'divineSense', 'echolocation', 'ghostlyGaze', 'hearing', 'lightPerception', 'seeInvisibility', 'senseAll', 'senseInvisibility', 'feelTremor', 'seeAll']
  - example MidiQOL.canSense(token, target, ["basicSight"]) will test if the token can see the token with basic sight. The token must have the specified detetion mode for canSense to returnt true;
* Added casnSenseModes(token, target) will return all of the modes that the token can see the target with, you can also pass an array of modes to check against. 
* When checking for disadvantage against invisible foes midi only checks 
          'blindsight', 'basicSight', 'devilsSight', 'divineSense', 'echolocation', 'ghostlyGaze', 'lightPerception', 'seeInvisibility', 'senseAll', 'senseInvisibility', 'feelTremor', 'seeAll'. 
  - if you can only hear your opponent you will still get disadvantage
  - This list of modes that midi will check when determining disadvantage is stored in MidiQOL.InvisibleDisadvantageVisionModes and is modifiable.

## 11.0.5
* Added MidiQOL.getTokenPlayerName(token: TokenDocument | Token, checkGM: boolean = false) which returns the player (or GM is asGM true) version of the thoken's name. if checkGM is true and the player is a GM just returns the tokens name. Mainly a shim to the anonymous module.
* Added new player saving throw option "Auto roll but show roll dialog". This option will auto roll the save on the player's client but show the roll configuration dialog before doing the roll. This is an alternative to LMRTFY/Monks TB.

## 11.0.4
* Temp fix for calling actor.prepareData when doing reactions which causes add effects to accumulate on the actor, which I think is a foundry/dnd5e bug.

## 11.0.3
* Various fixes from @thatlonelybugbear for Convenient Effects/Condition Lab and Triggler.
* Fixes for reaction/bonus action recording getting out of synch when CE/CLT effect is removed by hand.
* Fix for always checking range even if disabled in options->mechanics.
* Fix for item-piles (and others) where the flags for an actor would get cleared when first creating a token.
* Added isHealed special duration - will expire if the result of an item roll increases the HP of the target
* Added isDamaged.healing special duration - will expire if there is any damage of type healing present in the items applied damage.

## 11.0.2
* Fix for off hand attack still adding dex/str bonus to damage for off hand attacks.
* Little change to thrown weapons. If the weapon is marked as a melee weapon, then using it at a range greater than touch will be treated as a ranged attack and nearby foe will cause disadvantage. If used within 5 feet then it will be treated as a melee weapon attack and disadvantage will not apply.
* Tokens that are gm Hidden (from the token HUD) will not be treated as visiable by canSense - so will not cause disadvantage for nearby foes and ranged attacks etc.
* GM Hidden tokens (i.e. hidden from token HUD) cannot be targeted in AoE templates. This highlighted that foundry has (again) changed visibility of MeasuredTemplate shape functions. I think this version gets around the problems - but have not tested with levels volumetric templates etc.

## 11.0.1
* Moved concentration effect removal after dependent effects/items removal
* With dae 10.0.36 ghost effects should be fixed.

## 11.0.0
* Removed Combat utility belt support
* Fix for non-circular template placement throwing an error.
* Midi now respects the dice so nice setting for ghost rolls. If ghost rolls is not enabled in dice so nice midi won't display ghost dice.

## 10.0.49
* Add "isMiss" target onUse macro call - called when an attack misses a target, called for each missed target.
* Fix for @spellLevel arguments always being 0.
* Fix for auto concentration not using CE custom effect.
* Fix for occasional deadlock in removing removing effects.
* Clean up for marking dead/wounded tokens.
* Fix for toggle keyboard shortcut not overriding roll fast forward.
* Added option to have long range attacks roll at disadvantage rather than failing.
* Fix for skills not respecting roll mode in the roll options for skill rolls.
* Added warning for Combat Utility Belt not being supported in foundry v11 and midi dropping support in midi v11.1
  - Anonymous is supported by midi and replaces the CUB token name hiding.
  - condition-lab-triggler is supported by midi and provides a direct replacement for CUB enhanced conditions
  - CE is supported by midi and provides an alternative to most features of CUB enhanced conditions
* This will probably be the last found v10 release with new features. I still push updates for bug fixes but otherwise no more work on v10.

## 10.0.48.3
* find nearby has an additional option, includeToken whcih when set will include the source token in the returned array of tokens.
* fix for Concentration in v11. Midi requires Convenient effects v5.0.1

## 10.0.48.2
* Fix for critical rolls not working
* Fix for token macros isSave, isSaveSuccess and isSaveFail
* Fix for concentration being removed on template removal even if the item placed no template.

### 10.0.48.1
* Fix for occasional damageListItem.damageDetail[1] is not iterable.

### 10.0.48
* Monkey patch of lmrtfy causing lmrtfy rolls to be ignored.
* Fix for optional.name not rolling for saves/checks.
* Pass additional damage information to DAE macro.execute and DAE macro.ItemMacro effects. 
  - Arguments @damageComponents.damage type are supported, e.g. @damageComponents.necrotic.
  - Correct @damage to be all of the damage done in the attack (base, other and bonus damage).
  - Added @damageApplied which is the amount of damage applied to the token after reisitances etc.
* Changed missing module messages to be flagged as optional module missing.
* Fix for skill rolls dice so nice display being out of synch with the display.
* Fix for completeItemUse ignoring autoRollAtttack, fastForwardAttack, autoRollDamage, fastForwardDamage

### 10.0.47
* Various fixes for the units field that was reinstated in 10.0.46
* Fix for deleting then re-adding the same onUse macro
* **Breaking** flags.midi-qol.optional.Name.save.fail now needs to be flags.midi-qol.optional.Name.save.fail.all. Added support for flags.midi-qol.optional.Name.save.fail.str/dex etc. e.g. flags.midi-qol.optional.Name.save.fail.dex OVERRIDE success will alow the saver to optionally convert a failed dex save to a success.
* A patch so the LMRTFY 3.1.7 will work with dnd 2.2x - temporary until LMRTFY issues it's own fix.

### 10.0.46
* Fix for player save/check/skill checks blind rolls not working.
* Added removing templates to undo workflow.
* Removed some extraneous advantage labels when Advantage Reminder is in use.
* Fix for self apply CE effects.
* Added option for GM to see active defence rolls always.
* Fixes for displaying saving throws too often for player rolls.
* Fix for showing tool check dice for nice rolls twice.
* Add another critical dice option, max base dice and explode critical dice.
* Include player characters with race NoTarget in the check for ignorning those actors.
* Stopgap fix for disappearing units in item target specification.
* **Breaking** Actions/reactions and bonus actions are recorded in actor.flags["midi-qol"].actions.bonus/reaction/action true or false, the flag denoting the combat round the bonus action or reaction was use is stored in actor.flags["midi-qol"].actions.reactionCombatRound/bonusActionCombatRound.

### 10.0.45
* Fix for fey ancestry item macro typo - thanks @thatlonelybugber
* Fix for shield macro typo - thanks @thatlonelybugear
* Fix for broach of shielding and 10.0.45 argument calling.
* Fix for erroneous preTargetdamageApplication macro call - thanks @Elwin
* Fix for reaction/bonus action used icon not being added when enforce reactions set to display status icon.
* (v11) Fix for unconscious/dead getting stuck on a token. Only fix once it occurs seems to be to delete and recreate the token.
* fix dnd5e 2.2 generating deprecation warnings for CONFIG.DND5E.abilities.
* Any items updated in the sample items compendium will have the version number moved to the description, rather than the name. This means you will need to watch the release notes/announcement for notification of changes.


### 10.0.44
* Fix for DR and slivered damage resistance. Incorrectly any item with a + to hit was considered silvered. Now obeys the midi config settings workflow tab.
* Fix for incorrectly applying DR to temphp healing.
* Support roll mode when presenting optional bonus dialogs, blindrolls won't display the dice roll that is being adjusted.
* **BREAKING** Another change to macro execution. The workflow that triggered the macro is available via 'workflow' or 'scope.workflow'.
  - Macros that reference the workflow via 'this' will throw a deprecation warning and will fail to execute after midi v11.1.0 is released.
  - Macros that declare workflow [as in const workflow = MidiQOL.Workflow.getWorkflow(args[0].uuid))] will throw a deprecation warning but still operate. This will fail in midi version 11.1.0 and later.
  - Hopefully this is the last change. In midi v11.1.0 macro calling will switch to core foundry v11 macro calling.
* **BREAKING** preApplyTargetDamage renamed to preTargetDamageApplication and remains a target onUse macro. That is, the macro to be called is looked up on the target not the actor rolling the attack. It is called for each target that was damaged by using the item, not just those that were hit. So you'll need to check that in your macros.
  - workflow.damageItem has the details of the damage to be applied and can be modified by the macro. In particular setting damageItem.hpDamage will set how much damage is done to the actor. Don't use this feature when di/dr/dv or DR.XXX will do what you need since the changes won't be obvious from the damage card.
  - Sample Broach of Shielding item to neutralise magic missile damage included.
* Actor onUse preDamageApplication macro fetches macros from the actor doing the attack. workflow.damageList has the damage details for all tokens that are attacked. Updated Mace of disruption to show how it can be used.
* Updated Fey Ancestry (Elven) to implement advantage for saves against charm. Thanks @thatlonelybugbear#4393
* Updated shield spell to provide immunity to magic missile.
* Added export of async function reactionDialog. See readme for details.
* For onUse macros, item, damageBonus and actor onUse macros args[0].tagis  set to "OnUse" and for target onUse macros the tag will be "TargetOnUse". This allows you to have a single macro that deals with both sorts of calls.
* Readme.md updated with more information on macros, arguments and when they are called.
* Added a helper function for macro writers who want to assist midi in cleaning the chat log when undoing a workflow. Midi monitors created chat messages whilst until the workflow is complete and adds them to the list of things to be removed when undoing the workflow However, macros that create chat messages escape the list. You can add a message to be deleted by calling MidiQOL.addUndoChatMessage(message: ChatMessage | Promise<ChatMessage>).
  - Updated the shillelagh spell as an example.

### 10.0.43
* **BREAKING** added dae as a dependency.
* When using ghost rolls for the GM or blind rolls for players the GM will see the dice so nice dice being rolled.
* midi macro calling is now compatible with v11 argument handling. "scope" is defined meaning scope.args, scope.theWorkflow and scope.item are all defined (also available without the scope., so args, theWorkflow and item are all defined in the macro). args is, once again, an array.
* Fix for an error when a save/check fails causing the workflow to fail instead of assuming 1 for the save. Should also fix the deadlock on concentration checks failing..
* Added button color coding on the damage card - green the button is active, red the button is not.
* Fix for inline rolls not working for unlinked tokens.
* Added first cut of a UI for undoing workflows, start the app by calling MidiQOL.showUndoWorkflowApp() - only accessible to a GM client. 
  - All undoable workflows will be displayed in the app. You may only undo/remove the top item from the list. Undoing the workflow will restore all affected actors/tokens to the state before the workflow started (including any changes done by hand after the workflow completed, e.g. adding an item to an actor, adjusting hit points etc) so keep that in mind. 
  - You may remove the top item without undoing the workflow. However if you undo another workflow that references any of the same actors as the removed workflow, their backup was taken before the removed workflow, so undoing those workflows will undo any changes done by the removed workflow for those actors. Generally it is less confusing to undo to the point you want and then make any changes/rerolls from that point.
  - Only the last 15 workflows are kept for undoing. The limit is arbitrary, but lots of data is kept so a limit seems prudent. Also after 15 completed workflows the likelihood is that there undoing changes is best handled by the GM. 

### 10.0.42
* Changed the preTargetSave hook call to be just before the roll is done and the passed workflow now includes saveDetails comprising
```js
saveDetails: { advantage: boolean | undefined,
          disadvantage: boolean | undefined,
          isFriendly: boolean | undefined,
          isMagicSave: boolean | undefined,
          isConcentrationCheck: boolean | undefined,
          rollDC: number }
```
which can be changed in the preTargetSave Hook. Sample item Antitoxin in Midi sample items as an example for advantage against poison saves.
* Added actionType to ReactionFilter hook call which be one of reaction, reactiondamage, reactionattack. As a reminder the hook will fire on both the attacking client and on the attackee client.
* Reaction timeout changes. There is now a timeout for selecting the reaction and a timeout for finishing rolling the reaction item, both equal to the reaction timeout setting on the reaction tab.
* findNearby will ignore tokens with system.details.type.custom set to "NoTarget".
* findNearby now supports options canSee (the potential nearby token can see the designated token), and isSeen (the designated token can see the potential nearby token).
* Changed the default for allowIncapacitated in overtime effects to true, rather than false.
* Fix for flags.midi-qol.DR.all to not apply for healing/temphp - this is damage **reduction** not damage **resistance**.
* Fix for flags.midi-qol.DR.non-adamant not working properly.
* Effects that create a flags.midi-ol.onUseMacro can now just refer to ItemMacro in the change.value and midi will convert it to ItemMacro.ItemUuid when the effect is created. The ItemUuid is the uuid of the origin item (if there is one).
* Added flags.midi-qol.optional.NAME.rollMode which will use the specified roll mode (pulbicroll, gmroll, blindroll, selfroll) for both the bonus and the save/check/skill roll that triggered it.
* Added config setting All Player ability checks/save/skill checks are rolled blind. This allows you to force player rolls to be done as blind rolls. Useful if ask your players do do a perception roll, but don't want them to see the result and they forget to do the roll blind.
* Critical Damage treatment is now configurable for players and GMs separately. GM setting will be copied form previous setting on first load.
* Added ability to choose exploding critical dice for all, npcs only or characters only.
* Merged change from @MrPrimate for Active Auras and not calling macros.
* More work on undoing workflows. Should now delete most chat cards associated with a workflow, rather than just the item card and damage application card. Restoring concentration now works. Templates not looked at yet. Reminder this is EXPERIMENTAL and probably will do terrible things to your world. Always make a copy of any linked characters when testing.
* There is now a dedicated discord server for my modules: https://discord.gg/Xd4NEvw5d7

### 10.0.41
* Reverted original change that caused applyTokenDamage problems. Added applyTokenDamage to my test cases, so should not happen again.
* Fix for undoWorkflow to remove flags that should be removed. Thanks @thatlonelybugbear
* More enhancements to undoing workflows.

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
* Support for new item flag, Toggle Effect, each use of the item will toggle any associated active effects/convenient effects. One use to turn on, next use turns off. This can be a viable alternative to passive effects where you click to enable and click again to remove. Should also simplifyy a range of effects currently done as macro.execute/macro.itemMacro where the on/off cases just enable/remove effects. For active effects (as opposed to convenient effects) toggling requires DAE 0.10.01.
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
