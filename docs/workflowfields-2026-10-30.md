> [!tip] Navigation
> [Go to Readme](/README.md#table-of-contents) <br>
> [Go to Macro Guide](/MACROS.md#table-of-contents) <br>
> [Go to Flowchart (v12.4.64 to v13.0.22)](docs/flowchart.md) <br>
> [Go to Flowchart (v13.0.23+)](docs/flowchart_save-before-dmg.md)

# Workflow Fields

*Last updated: 2026-10-30*

> *(as of midi-qol 14.6.5, Foundry 14 / dnd5e 6.0)*

This page provides information on when each field of `workflow` is given data:
 - The **first** pass in which a field is available is shown in the *"Field Added"* column. The field may be null, undefined, or empty if the *"Field Given Data"* column shows a different pass. 
 - The **first** pass in which a field contains data is shown in the *"Field Given Data"* column.
 - A few fields are reset **after** a certain pass. Booleans are toggled back to their default value, sets are cleared out, etc. These are marked in the *"Field Reset"* column.

>>> [!note]
`workflow.macroPass` and `workflow.tag` are set by every macro call, including target passes such as `isHit`, so they show the most recent pass. In macros, `args[0].damageDetail` is the workflow's `rawDamageDetail` (before resistances), not `workflow.damageDetail`.
<br><br>
`workflow` fields are not updated before optional bonus passes. They will contain the data available to the previous pass. For example, `workflow.macroPass` will be `"isPreAttacked"` on a `flags.midi-qol.optional.NAME.attack.*` pass. Instead, use `args[0].macroPass` and `args[0].tag === 'optional'` to check whether the current pass is an optional bonus.
<br><br>
`flags.midi-qol.optional.NAME.save.*` is a special case that initiates a separate workflow. See the [table](#optional-save-bonus) at the bottom for the fields available.
>>>

| **Field**                       | **Type**             | **Value**                                                                | **Field Added**                                                                       | **Field Given Data**                                                                                                                                                                          | **Field Reset**                                                                                    |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| itemCardUuid | string |  | `preTargeting` (undefined) | `postNoAction` |  |
| chatCard | ChatMessageMidi |  | `postNoAction` | `postNoAction` |  |
| actor | Actor5e | actor rolling item | `preTargeting` | `preTargeting` |  |
| abort |  | undefined | `preTargeting` |  |  |
| itemUseComplete | bool | true | `preTargeting` (false) | `postNoAction` (true) |  |
| token | Token | token rolling item | `preTargeting` | `preTargeting` |  |
| workflowOptions | object |  | `preTargeting` | `preTargeting` |  |
| activity |  | the rolled activity (at `preTargeting`/`preItemRoll` a copy before scaling; the scaled activity from `postNoAction`) | `preTargeting` | `preTargeting` |  |
| item | Item5e | the rolled item (the scaled activity's item from `postNoAction`) | `preTargeting` | `preTargeting` |  |
| speaker | object |  | `preTargeting` | `preTargeting` |  |
| targets | Set | contains Token | `preTargeting` (undefined) | targeted before starting workflow: `preItemRoll`<br><br>targeted after starting workflow: `postAoETargetConfirmation` |  |
| targetsCanSee | Set | contains rolling Token | `preTargeting` (empty) | targeted before starting workflow: `postNoAction`<br><br>targeted after starting workflow: `postAoETargetConfirmation` |  |
| targetsCanSense | Set | contains rolling Token | `preTargeting` (empty) | targeted before starting workflow: `postNoAction`<br><br>targeted after starting workflow: `postAoETargetConfirmation` |  |
| tokenCanSee | Set | contains targeted Token | `preTargeting` (empty) | targeted before starting workflow: `postNoAction`<br><br>targeted after starting workflow: `postAoETargetConfirmation` |  |
| tokenCanSense | Set | contains targeted Token | `preTargeting` (empty) | targeted before starting workflow: `postNoAction`<br><br>targeted after starting workflow: `postAoETargetConfirmation` |  |
| templateUuid | string | compatibility alias for `templateUuids[0]`; `""` with no template | `preTargeting` (undefined) | `postNoAction` |  |
| summonedCreatures | Array | contains TokenDocument5e; only with *Auto remove summoned creature* on | `preTargeting` (undefined) | `postNoAction` |  |
| postSummonHookId | int | only with *Auto remove summoned creature* on | `preTargeting` | `preTargeting` |  |
| AoO | bool | false *(true if opportunity attack)* | `preTargeting` (false) | `preItemRoll` (set just after it, in the pre-use checks) |  |
| damageList | Array | contains a DamageListEntry for each target. At a target's `preTargetDamageApplication` it holds only the targets processed so far; it can be rebuilt for the other damage | `preTargeting` (empty) | `preTargetDamageApplication` |  |
| isTurn |  | never set (always undefined) | `preTargeting` |  |  |
| saveDisplayFlavor | string |  | `preTargeting` (undefined) | `postWaitForSaves` |  |
| id | string | the activity uuid until the card exists, then the card uuid | `preTargeting` | `preTargeting`; the card uuid from `postNoAction` |  |
| currentAction | function | workflow state from which current pass was called | `preTargeting` | `preTargeting` |  |
| isCritical | bool | false — delegates to `tracker.critical.isActive` | `preTargeting` (false) | `preCheckHits` (true if threshold met) |  |
| isFumble | bool | false — delegates to `tracker.fumble.isActive` | `preTargeting` (false) | `preCheckHits` (true if threshold met) |  |
| d20AttackRoll | int |  | `preTargeting` (-1) | `preCheckHits` *(set when the attack roll is shown)* |  |
| hitTargets | Set | contains Token | `preTargeting` (empty) | `isHit` |  |
| hitTargetsEC | Set | contains Token: hits under challenge mode armour (EC) | `preTargeting` (empty) | `isHit` / `isMissed` |  |
| attackRoll | D20Roll |  | `preTargeting` (undefined) | `flags.midi-qol.optional.NAME.attack.*`<br><br>`postWaitForAttackRoll` if no optional |  |
| diceRoll | int |  | `preTargeting` (undefined) | `preCheckHits` |  |
| attackTotal | int |  | `preTargeting` (-100) | `flags.midi-qol.optional.NAME.attack.*`<br><br>`postWaitForAttackRoll` if no optional |  |
| attackRollHTML | string |  | `preTargeting` (undefined) | `flags.midi-qol.optional.NAME.attack.*`<br><br>`postWaitForAttackRoll` if no optional |  |
| attackRollCount | int |  | `preTargeting` (0) | `flags.midi-qol.optional.NAME.attack.*`<br><br>`postWaitForAttackRoll` if no optional |  |
| noAutoAttack |  | never set by midi; a macro can set it to stop the auto attack roll | `preTargeting` |  |  |
| hitDisplayData | object |  | `preTargeting` (undefined) | `isHit` / `isMissed` |  |
| rolls |  | getter: the card's rolls, only with *Save to chat card* on | `preTargeting` (undefined) |  |  |
| damageRolls | Array | contains DamageRoll | `preTargeting` (empty) | `postWaitForDamageRoll` |  |
| bonusDamageRolls | Array | contains DamageRoll | `preTargeting` (undefined) | `postDamageRollStarted` *(empty unless DamageBonus returns values)* |  |
| otherDamageRolls | Array | contains DamageRoll | `preTargeting`(undefined) | `postWaitForDamageRoll` *(only if other activity has damage)* |  |
| utilityRolls | Array | contains BasicRoll | `preTargeting` (empty) | `postWaitForUtilityRoll` |  |
| utilityRoll | BasicRoll | getter: all utility rolls merged into one | `postWaitForUtilityRoll` | `postWaitForUtilityRoll` |  |
| saveRolls | Array | **deprecated** (warns): `Object.values(tokenSaves)`; use `tokenSaves` | `preTargeting` (undefined) | `preTargetSave` *(empty unless any target rolled)* |  |
| damageTotal | int |  | `preTargeting` (undefined) | `postWaitForDamageRoll`<br><br>or `preDamageRollConfig` if called a second time by an other damage activity |  |
| rawDamageDetail | Array | contains object | `preTargeting` (empty) | `postWaitForDamageRoll`<br><br>or `preDamageRollConfig` if called a second time by an other damage activity |  |
| rawOtherDamageDetail | Array | contains object | `preTargeting` (empty) | `postWaitForDamageRoll` *(only if other activity has damage)* |  |
| rawBonusDamageDetail | Array | contains object | `preTargeting` (empty) | `postDamageRollStarted` *(empty unless DamageBonus present)* |  |
| damageRollHTML | string |  | `preTargeting` | `postWaitForDamageRoll` |  |
| damageRollCount | int |  | `preTargeting` (0) | `flags.midi-qol.optional.NAME.damage.*`<br><br>or `preDamageRollConfig` if called a second time by an other damage activity<br><br>`postWaitForDamageRoll` if no optional |  |
| defaultDamageType | string |  | `preTargeting` | `preTargeting` |  |
| effectsAlreadyExpired | Array | contains string | `postPreambleComplete` (empty) | `postDamageRoll` (special durations expired on the roll); `preDamageRoll` with the *Expire 1Hit/1Attack/1Action on roll* mechanic |  |
| noAutoDamage |  | never set by midi; a macro can set it to stop the auto damage roll | `preTargeting` |  |  |
| saves | Set | contains Token | `preTargeting` (empty) | `isSaveSuccess` / `isSaveFailure` *(contains successes)* |  |
| superSavers | Set | contains Token | `preTargeting` (undefined) | `preItemRoll` (empty)<br><br>`postWaitForSaves` (any targets with flag) |  |
| semiSuperSavers | Set | contains Token | `preTargeting` (undefined) | `preItemRoll` (empty)<br><br>`postWaitForSaves` (any targets with flag) |  |
| failedSaves | Set | contains Token | `preTargeting` (empty) | `preItemRoll` *(all targeted before starting workflow)*<br><br>`postAoETargetConfirmation` *(all targeted after starting workflow)*<br><br>`isSaveSuccess` / `isSaveFailure` *(actual fails)* |  |
| fumbleSaves | Set | contains Token | `preTargeting` (empty) | `postWaitForSaves` |  |
| criticalSaves | Set | contains Token | `preTargeting` (empty) | `postWaitForSaves` |  |
| advantageSaves | Set | contains Token | `preTargeting` (empty) | per target, before that target's `preTargetSave` | cleared when saves start (`postWaitForSaves` / save checks), after `preSave` |
| saveRequests | object |  | `preTargeting` (empty) | `preTargetSave` only if prompted for saves | `preTargetSave` (empty) |
| saveTimeouts | object |  | `preTargeting` (empty) | `preTargetSave` only if prompted for saves | `preTargetSave`(empty) |
| saveDisplayData | Array | contains object (includes `modifierTracker` and `attributionTooltip`) | `preTargeting` (empty) | per target, after that target's `isSave`/`isSaveSuccess`/`isSaveFailure`; complete from `postWaitForSaves` |  |
| saveAttribution | Record | restored from the card only; no longer filled by midi | `preTargeting` (empty) | `isSaveSuccess` / `isSaveFailure` |  |
| targetSaveDetails | Record | target token uuid → SaveDetails (per-target save tracking with modifierTracker) | `preTargeting` (undefined) | per target, before that target's `preTargetSave` |  |
| flagTags |  | never set by midi; a macro can set flags here to add them to the damage card | `preTargeting` |  |  |
| onUseMacros | OnUseMacros (object) | contains one property "items", an array of OnUseMacro objects | `preTargeting` | `preTargeting` |  |
| ammunitionOnUseMacros | OnUseMacros (object) | contains one property "items", an array of OnUseMacro objects | `preTargeting` (undefined) | `flags.midi-qol.optional.NAME.attack.*`<br><br>`postWaitForAttackRoll` if no optional |  |
| attackRollModifierTracker | RollModifierTracker | centralized tracker for advantage/disadvantage/critical/fumble/modifiers | `preTargeting` | `preAttackRollConfig` (fully populated after `checkAttackAdvantage`) |  |
| tracker | RollModifierTracker | alias for `attackRollModifierTracker` | `preTargeting` | `preAttackRollConfig` |  |
| attackAttribution | AttributionMap | structured map: type → source → displayName | `preTargeting` (empty) | `preAttackRollConfig` (delegates to `attackRollModifierTracker.attribution`) |  |
| attackAdvAttribution | Set | **deprecated** — use `attackAttribution`. Legacy `"${type}:${source}"` format | `preTargeting` (empty) | `preAttackRollConfig` (delegates to `attackRollModifierTracker.legacyAttribution`) |  |
| advReminderAttackAdvAttribution | Set | **deprecated** — use `attackAttribution`. For adv-reminder compat | `preTargeting` (empty) | `preAttackRollConfig` (delegates to `attackRollModifierTracker.advReminderAttribution`) |  |
| noOptionalRules | bool | false *(dependent on settings)* | `preTargeting` | `preTargeting` |  |
| undoData |  | set with *Support undoing item rolls* on | `preTargeting` | `postNoAction` |  |
| needTemplate | bool | getter: true while templates remain to be placed | `preTargeting` (false) | `preTargeting` |  |
| disadvantageSaves | Set | contains Token | `preTargeting` (empty) | per target, before that target's `preTargetSave` | cleared when saves start (`postWaitForSaves` / save checks), after `preSave` |
| saveResults | Array | contains Roll (flat array) | `preTargeting` (empty) | after every save has resolved, before the per-target passes |  |
| suspended | bool | true if any dialog was used during pass | `preTargeting` | `preTargeting` | false on any pass without a dialog |
| aborted | bool | false | `preTargeting` | `preTargeting` |  |
| workflowName | string | "<class name> <`workflowOptions.workflowName` or item name> <random id>" | `preTargeting` | `preTargeting` |  |
| advantage | bool | false — delegates to `tracker.advantage` | `preTargeting` (undefined) | `preAttackRollConfig` (after `checkAttackAdvantage`) | if from no vision: `preCheckHits` (false)<br><br>flags or setting from macro are retained |
| disadvantage | bool | false — delegates to `tracker.disadvantage` | `preTargeting` (undefined) | `preAttackRollConfig` (after `checkAttackAdvantage`) | if from no vision: `preCheckHits` (false)<br><br>flags or setting from macro are retained |
| defenceRequests | object |  | `preTargeting` (empty) |  |  |
| defenceTimeouts | object |  | `preTargeting` (empty) |  |  |
| forceApplyEffects | bool | false | `preTargeting` | `preTargeting` |  |
| onUseCalled | bool | always false (never set) | `preTargeting` | `preTargeting` |  |
| attackRolled | bool | false | `preTargeting` | `preTargeting` |  |
| rollOptions | object |  | `preTargeting` (empty) | `preAttackRoll` |  |
| preSelectedTargets | Set | contains Token, empty unless targeted before starting workflow | `preTargeting` | `preTargeting` |  |
| kickStart | bool | false (true only in DDB Game Log workflows) | `preTargeting` | `preTargeting` |  |
| sequenceId |  | the use's `usage.sequenceId` (`completeActivityUse` and attack per target set one to wait on the workflow) | `preTargeting` | `preTargeting` |  |
| systemCard |  | dnd5e's `message.systemCard` | `preTargeting` | `preTargeting` |  |
| macroPass | string |  | `preTargeting` | `preTargeting` |  |
| tag | string |  | `preTargeting` | `preTargeting` |  |
| spellLevel | int | getter: the card's level, else `castData.castLevel`, else 0. (`castLevel` is `args[0].castLevel` in macros) | `preTargeting` (0) | `postNoAction` |  |
| castData | object | `{ baseLevel, castLevel, scaling, itemUuid }`; for spells and items with `flags.dnd5e.spellLevel` | `postNoAction` | `postNoAction` |  |
| itemUsesReaction | bool | false | `postNoAction` | `postNoAction` |  |
| itemUsesBonusAction | bool | false | `postNoAction` | `postNoAction` |  |
| rangeDetails | object |  | `postNoAction` | `postNoAction` |  |
| stateTransitionCount | int |  | `postNoAction` | `postNoAction` |  |
| selfTargeted | bool | true for a self-target activity, else undefined | `preItemRoll` | `preItemRoll` |  |
| workflowStartTime | int |  | `preTargeting` | `preTargeting` |  |
| rangeTargeting | bool | false | `postStart` | `postStart` |  |
| tempTargetConfirmation | bool | false *(true if template)* | `postStart` | `postStart` |  |
| utilityRollHTML | string | property not present if no utility | `postWaitForUtilityRoll` | `postWaitForUtilityRoll` |  |
| flankingAdvantage | bool | false *(dependent on settings)*<br><br>property not present if no attack | `preAttackRollConfig` | `preAttackRollConfig` |  |
| conditionData | object | the data of the most recent condition evaluated for this workflow | `flags.midi-qol.optional.NAME.attack.*`<br><br>`postWaitForAttackRoll` if no optional | `flags.midi-qol.optional.NAME.attack.*`<br><br>`postWaitForAttackRoll` if no optional |  |
| attackMode | string |  | `flags.midi-qol.optional.NAME.attack.*`<br><br>`postWaitForAttackRoll` if no optional | `flags.midi-qol.optional.NAME.attack.*`<br><br>`postWaitForAttackRoll` if no optional |  |
| ammunition | Item5e | the loaded ammunition (also set before the roll when a consumption target is ammunition) | `flags.midi-qol.optional.NAME.attack.*`<br><br>`postWaitForAttackRoll` if no optional | after the attack roll |  |
| challengeModeScale | object |  | `isHit` / `isMissed` | `isHit` / `isMissed` |  |
| critFlagSet | bool | **deprecated** — use `tracker.critical.isForced` | `isHit` / `isMissed` | `isHit` / `isMissed` |  |
| noCritFlagSet | bool | **deprecated** — use `tracker.critical.isSuppressed` | `isHit` / `isMissed` | `isHit` / `isMissed` |  |
| whisperAttackCard | bool | false *(true if private GM roll)* | `postAttackRoll` | `postAttackRoll` |  |
| needsHitTargetsDisplayed | bool | true *(dependent on settings)* (was `hitTargetsDisplayed`) | `postAttackRoll` | `postAttackRoll` |  |
| healingAdjustedDamageTotal | int |  | `postWaitForDamageRoll` | `postWaitForDamageRoll` |  |
| flavor | string |  | `postWaitForDamageRoll` | `postWaitForDamageRoll` |  |
| damageDetail | Array | contains object | `postWaitForDamageRoll` | `postWaitForDamageRoll` |  |
| bonusDamageTotal | int |  | `postDamageRollStarted` | `postDamageRollStarted` |  |
| healingAdjustedBonusDamageTotal | int |  | `postDamageRollStarted` | `postDamageRollStarted` |  |
| bonusDamageRollHTML | string | empty unless bonus present | `postDamageRollStarted` | `postDamageRollStarted` |  |
| bonusDamageDetail | Array | empty unless bonus present | `postDamageRollStarted` | `postDamageRollStarted` |  |
| saveTargetsDisplayed | bool | true *(dependent on settings)* | `preTargetSave` | `preTargetSave` |  |
| tokenSaves | object | getter: target token uuid → save roll; undefined for a target until it has rolled | `preTargetSave` (empty) | per target, after that target's `isSave` passes; complete from `postWaitForSaves` |  |
| saveDC | int |  | `preTargetSave` | `preTargetSave` |  |
| otherDamageMatches | Set | contains Token | `preTargetDamageApplication` | `preTargetDamageApplication` |  |
| damageItem | DamageListEntry | the DamageListEntry of the target being processed: set before that target's `preTargetDamageApplication` and `preDamageApplication`; changes a macro makes are copied back | `preTargetDamageApplication` | `preTargetDamageApplication` |  |
| activationMatches | Set | contains Token | `preActiveEffects` | `preActiveEffects` |  |
| otherActivationMatches | Set | contains Token | `preActiveEffects` | `preActiveEffects` |  |
| activationFails | Set | contains Token | `preActiveEffects` | `preActiveEffects` |  |
| otherActivationFails | Set | contains Token | `preActiveEffects` | `preActiveEffects` |  |
| effectTargets | Set | contains Token | `preActiveEffects` | `preActiveEffects` |  |
| otherEffectTargets | Set | contains Token | `preActiveEffects` | `preActiveEffects` |  |
| allOtherEffectTargets | Set | contains Token | `preActiveEffects` | `preActiveEffects` |  |
| effectTargetsOnSave | Set | contains Token | `preActiveEffects` | `preActiveEffects` |  |
| otherEffectTargetsOnSave | Set | contains Token | `preActiveEffects` | `preActiveEffects` |  |

## Fields not in the table above

| **Field** | **Type** | **When set** | **Meaning** |
| --- | --- | --- | --- |
| workflowOptions.attackSplit | `{ index, count, ammunition? }` | from `preTargeting` | this use is one target's attack of an attack per target |
| workflowOptions.rollAttackPerTarget | bool | from `preTargeting` | this use is one iteration of a per-target attack |
| workflowOptions.targetConfirmation | string | caller | overrides the target confirmation setting (`"always"`, `"none"`/`"never"`) |
| workflowOptions.ignoreUserTargets | bool | before `preItemRoll` | the use was given its own targets; later states don't re-read the user's |
| workflowOptions.preSelectedTargetUuids | string[] | start of the use | the user's targets before template placement |
| ammunitionActivity | Activity | after the attack roll | the loaded ammunition's activity (separate from `otherActivity`) |
| otherActivity / otherActivityOrAmmunition | Activity (getters) | always | the item's paired other activity / that or the ammunition's activity |
| saveActivity / otherSaveActivity / hasSave | getters | always | which activity supplies the save |
| grantedAttackBonusInRollUuid | string | attack roll configuration | the target whose granted attack bonus is already part of the roll |
| flankingRollBonus / flankingAdvantageKind | object / string | `preAttackRollConfig` | a fixed flanking bonus; `"flanking"` or `"flanked"` |
| targetDescriptors | getter/setter | once the card exists | the card's `system.targets` |
| templateUuids / expectedTemplateCount / placedTemplateCount / template | string[] / number / number / getter | template placement | multi-template support; `template` is the region or template document |
| itemCardId | getter | `postNoAction` | the card's id |
| ammunitionDamageMatches | Set\<Token\> | `postAllRollsComplete` | targets the ammunition's damage applies to |
| otherDamageTotal / healingAdjustedOtherDamageTotal / otherDamageRollHTML | number / number / string | other damage rolled | the other activity's damage |
| midiTargetDetail | Record | `postAllRollsComplete` | per target, the damage actually applied |
| saveDetails | SaveDetails | per target before `preTargetSave` | the latest target's save details |
| longRangeAttack | bool | `postValidateRoll` | long-range disadvantage applies |
| concentrationId | getter | once the card exists | the concentration effect this use began |
| teleportResults | array | teleport activity | dnd5e's teleport results |
| transformedActors / transformedActorUuids | arrays | transform activity | the transformed actors |
| noAdvantage / noDisadvantage | bool getters | — | advantage or disadvantage suppressed on the tracker |
| executingStates | number | while running | above 0 while the workflow is running |
| nameForState(state) | method | — | a state's name, e.g. `workflow.nameForState(workflow.currentAction)` → `"WaitForSaves"` |

**Not set by midi**: `isTurn`, `noAutoAttack`, `noAutoDamage`, `flagTags`, `onUseCalled`, `otherDamageList` (declared, always undefined). Macros may set `noAutoAttack`, `noAutoDamage` and `flagTags`.

**Not verified**: `saveRequests`, `saveTimeouts`, `defenceRequests`, `defenceTimeouts` (active defence), the vision resets of `advantage`/`disadvantage`, and the Optional Save Bonus table below.

> [!tip] [Jump to Top](#workflow-fields)

## Optional Save Bonus
The `flags.midi-qol.optional.NAME.save.*` passes are given their own separate workflow. All except the following fields are undefined, empty, or not present:

| **Field**                 | **Type** | **Value**                         |
| ------------------------- | -------- | --------------------------------- |
| actor                     | Actor5e  | actor receiving bonus             |
| itemUseComplete           | bool     | false                             |
| token                     | Token    | token receiving bonus             |
| workflowOptions           | object   |                                   |
| item                      | Item5e   | the item providing the bonus      |
| speaker                   | object   |                                   |
| id                        | string   |                                   |
| currentAction             | function | WorkflowState_NoAction            |
| isCritical                | bool     | true/false                        |
| isFumble                  | bool     | true/false                        |
| defaultDamageType         | string   |                                   |
| noOptionalRules           | bool     | false                             |
| suspended                 | bool     | true if optional dialog           |
| aborted                   | bool     | false                             |
| workflowName              | string   | "workflow < workflow ID >"        |
| forceApplyEffects         | bool     | false                             |
| onUseCalled               | bool     | false                             |
| attackRolled              | bool     | false                             |
| rollOptions               | object   |                                   |
| preSelectedTargets        | Set      | contains Token                    |
| kickStart                 | bool     | false                             |

> [!tip] [Jump to Top](#workflow-fields)