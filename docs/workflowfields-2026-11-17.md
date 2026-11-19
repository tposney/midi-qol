> [!TIP]
> [Readme](/README.md#table-of-contents) · [Macro Guide](/MACROS.md#table-of-contents) · [Flowchart, default order](/docs/flowchart.md) · [Flowchart with saves before damage](/docs/flowchart_save-before-dmg.md)

# Workflow Fields

*Last updated: 2026-11-19*

(as of midi-qol 14.7.0, Foundry 14 / dnd5e 6.1)

Which fields of a `workflow` exist, and when each holds data.

In the tables, **When** gives the first macro pass at which the field exists, the first pass at which it
holds data when that is later, and the pass after which it is reset, if any. "always" means a getter
that works at every pass.

> [!NOTE]
> **Stable** fields (marked "yes" in the tables) keep their name and meaning. They are the ones other
> modules and midi's sample items use (Chris's Premades, CAT, MISC; inventory 2026-11-19), the rest of
> their family, and the switches meant for macros. The other fields are midi's working state: they may
> become private, be worked out from other fields, or go. Where one does, its name first warns as
> deprecated for a release. Ask for a field to be made stable if a macro of yours needs it.

> [!NOTE]
> `workflow.macroPass` and `workflow.tag` are set when a pass has macros to call, target passes
> such as `isHit` included. They name the most recent pass that ran a macro, not every pass reached.

> [!NOTE]
> In a macro, `args[0].damageDetail`, `otherDamageDetail` and `bonusDamageDetail` are the workflow's
> `rawDamageDetail`, `rawOtherDamageDetail` and `rawBonusDamageDetail`.

> [!NOTE]
> A workflow is rebuilt from its usage card after a reload, and for other users as a read-only copy.
> A rebuilt workflow has what the card stores and what is worked out from it; see
> [What the card stores](#what-the-card-stores).

## Contents

- [Order of passes](#order-of-passes)
- [Identity, item and card](#identity-item-and-card)
- [Targets and token sets](#targets-and-token-sets)
- [Attack](#attack)
- [Damage](#damage)
- [Damage list entries](#damage-list-entries)
- [Saves](#saves)
- [Effects, templates and other activities](#effects-templates-and-other-activities)
- [Flags and state](#flags-and-state)
- [Workflow options midi sets](#workflow-options-midi-sets)
- [What the card stores](#what-the-card-stores)
- [Deprecated and removed](#deprecated-and-removed)
- [Optional bonus passes](#optional-bonus-passes)
- [Optional save bonus](#optional-save-bonus)

## Order of passes

The passes named in the tables, in the order they run for an attack with damage and a save.
State passes (`pre`/`post` + state name) are shown only where a table refers to them.

1. `preTargeting`, then `preItemRoll`: before the usage card exists. `workflow.id` is `undefined`.
2. `postNoAction`: the first state pass. The card exists and the workflow starts to run.
3. `templatePlaced`, `postAoETargetConfirmation`, `isTargeted`, `postPreambleComplete`.
4. `isPreAttacked`, `preAttackRollConfig`, `preAttackRoll`, the attack roll,
   `flags.midi-qol.optional.NAME.attack.*`, `postWaitForAttackRoll`.
5. `isAttacked`, `preCheckHits`, `isHit` / `isMissed`, `postAttackRoll`.
6. `preDamageRoll`, `preDamageRollConfig`, the damage roll, `flags.midi-qol.optional.NAME.damage.*`,
   `postWaitForDamageRoll`.
7. `DamageBonus`, `postDamageRollStarted`, `postDamageRoll`.
8. `preSave`, `isAboutToSave`, `preTargetSave`, `isSave` / `isSaveSuccess` / `isSaveFailure`,
   `postWaitForSaves`, `postSave`.
9. `preTargetDamageApplication`, `isDamaged` / `isHealed`, `preDamageApplication`,
   `postAllRollsComplete`.
10. `preActiveEffects`, `postTargetEffectApplication`, `postActiveEffects`.

With *Roll saves before damage (Experimental)* on (`SavesFirstWorkflow`), step 8 runs before step 6.
A teleport activity runs `preTeleport` and `postTeleport` when its teleport happens: after the
effects and before `postActiveEffects` when midi teleports automatically, otherwise from the card's
teleport button. A damage-only workflow (`damageOnly`) runs no save, effect or
`postActiveEffects` passes.

## Identity, item and card

| Field | Stable | Type | What it holds | When |
| --- | --- | --- | --- | --- |
| `actor` | yes | `Actor5e` | The actor using the activity (`activity.actor`) | always |
| `activity` | yes | activity | The activity in use | `preTargeting`; the scaled copy from `postNoAction` |
| `item` | yes | `Item5e` | The activity's item | `preTargeting`; the scaled copy's item from `postNoAction` |
| `itemUuid`, `itemId` | yes | string | The item's uuid and id | always |
| `token` | yes | `Token` or `undefined` | The user's canvas token | `preTargeting`; set again by `postNoAction` |
| `tokenDocument` | yes | `TokenDocument` | `token.document` | always |
| `tokenUuid` | yes | string | `token.document.uuid` | always |
| `attackingToken` | yes | `Token` | Same as `token` | always |
| `attackingTokenDocument` | yes | `TokenDocument` | Same as `tokenDocument` | always |
| `speaker` | yes | object | The card's speaker data | `preTargeting` |
| `id` | yes | string | The usage card's uuid | `preTargeting` (`undefined`); data from `postNoAction` |
| `itemCardUuid` | yes | string | The usage card's uuid | `preTargeting` (`undefined`); data from `postNoAction` |
| `itemCardId` | yes | string | The usage card's id | always; data from `postNoAction` |
| `chatCard` | yes | `ChatMessage` | The usage card, with queued changes | always; data from `postNoAction` |
| `ownsCard` | yes | boolean | The card is this workflow's own | always; true from `postNoAction` |
| `rolls` | yes | `Roll[]` | The card's rolls | always; empty until a roll is on the card |
| `workflowName` |  | string | Class name, item name (or `workflowOptions.workflowName`), random id | `preTargeting` |
| `workflowType` | yes | string | `"BaseWorkflow"`, or the subclass's type | always |
| `workflowOptions` | yes | object | The caller's options over midi's defaults and the user's settings | `preTargeting` |
| `rollOptions` | yes | object | Roll options: `event`, `fastForwardAttack`, `isCritical`, `rollToggle`... | `preTargeting` |
| `sequenceId` |  | string | `usage.sequenceId`, when the caller gave one | `preTargeting` |
| `systemCard` |  | boolean | dnd5e's `message.systemCard` | `preTargeting` |
| `castData` | yes | object | `{ baseLevel, castLevel, scaling, itemUuid }` | `postNoAction` |
| `spellLevel` | yes | number | The card's level, else `castData.castLevel`, else 0 | always; data from `postNoAction` |
| `onUseMacros` | yes | `OnUseMacros` | The item's and the actor's onUse macros (`items` array) | `preTargeting` |
| `ammunitionOnUseMacros` |  | `OnUseMacros` | The ammunition's onUse macros | always; data once `ammunition` is set |
| `macroPass` | yes | string | The last pass that ran a macro | `preTargeting` |
| `tag` | yes | string | That pass's tag: `"OnUse"`, `"TargetOnUse"` or `"DamageBonus"` | `preTargeting` |

`token` is midi's own Token for an actor with no token on the viewed scene; such a Token has no id or
uuid. Once the card exists it is set from the card's speaker and can be `undefined`. A range check that
picks another attacking token replaces it.

A workflow has no id until dnd5e creates its card. During `preTargeting` and `preItemRoll` find it with
`MidiQOL.Workflow.workflowFor(activity)`; afterwards with `MidiQOL.Workflow.getWorkflow(cardUuid)`.

`castData` is set only for spells and items with `flags.dnd5e.spellLevel`. `sequenceId` is set by
`completeActivityUse` and by attack per target, to wait on the workflow.

## Targets and token sets

Token sets are `MidiQOL.TokenDocumentSet`s. They hold every member's TokenDocument, with a canvas token
or not. `.documents`, `.tokens`, `.uuids` and `.count` read the same in every version. Reading a set
directly (iteration, `size`, `first()`) gives canvas Tokens in 14.7.0 by default, and TokenDocuments
with `MidiQOL.setTokenDocumentSets(true)` and always from 14.8.0. See
[Token sets](/MACROS.md#token-sets) in the macro guide.

| Field | Stable | Type | What it holds | When |
| --- | --- | --- | --- | --- |
| `targets` | yes | `TokenDocumentSet` | The use's targets | `preTargeting` (empty); data from `preItemRoll` |
| `preSelectedTargets` | yes | `TokenDocumentSet` | The user's targets before the use | `preTargeting` |
| `hitTargets` | yes | `TokenDocumentSet` | Targets hit; with no attack, every target | `preTargeting` (empty); data from `isHit` |
| `hitTargetsEC` | yes | `TokenDocumentSet` | Glancing hits (challenge mode armor) | `preTargeting` (empty); data from `isHit` |
| `targetsCanSee` |  | `Set<Token>` | Holds the user's token if a target can see it | `preTargeting` (empty); data from `postNoAction` |
| `targetsCanSense` |  | `Set<Token>` | Holds the user's token if a target can sense it | `preTargeting` (empty); data from `postNoAction` |
| `tokenCanSee` |  | `Set<Token>` | Targets the user's token can see | `preTargeting` (empty); data from `postNoAction` |
| `tokenCanSense` |  | `Set<Token>` | Targets the user's token can sense | `preTargeting` (empty); data from `postNoAction` |
| `selfTargeted` | yes | boolean | `true` for a self-target activity, else `undefined` | `preItemRoll` |
| `rangeDetails` | yes | object | `{ result, attackingToken, range, longRange }` from the range check | `postNoAction` |
| `longRangeAttack` | yes | boolean | Long-range disadvantage applies | `postValidateRoll` |
| `targetDescriptors` | yes | array | The card's `system.targets` (dnd5e's target list with AC) | set at the attack roll |
| `targetACModifiers` |  | `Map` | Actor uuid to AC modifier at the attack roll | `preTargeting` (empty); data from `isHit` |

`targets` for an area activity are the tokens in the template: set when the template is placed
(by `postNoAction` when placed from the use dialog, otherwise by `templatePlaced`), and read again
after target confirmation (`postAoETargetConfirmation`). An area activity that does not auto-target
re-reads the user's targets when damage is rolled and when saves start.

`hitTargets` for an activity with no attack is every target from `postWaitForAttackRoll`. With
*Auto check if attack hits target* off both hit sets are emptied after `postAttackRoll`. A fumble empties them, and
`failedSaves`, after `postDamageRoll`.

The four `Set<Token>` fields are plain Sets of canvas Tokens. They are worked out again when the
targets change at target confirmation or the attacking token changes.

Setting the targets (`workflow.setTargets`) empties every hit and save set and makes `failedSaves` a
copy of the targets.

## Attack

| Field | Stable | Type | What it holds | When |
| --- | --- | --- | --- | --- |
| `attackRollModifierTracker` | yes | `RollModifierTracker` | Advantage, disadvantage, critical, fumble and their sources | `preTargeting`; data from `preAttackRollConfig` |
| `tracker` | yes | `RollModifierTracker` | Same object as `attackRollModifierTracker` | as above |
| `advantage` | yes | boolean | The tracker has advantage (`undefined` with no sources) | `preTargeting`; data from `preAttackRollConfig` |
| `disadvantage` | yes | boolean | The tracker has disadvantage | `preTargeting`; data from `preAttackRollConfig` |
| `noAdvantage`, `noDisadvantage` | yes | boolean | Advantage or disadvantage is suppressed | always |
| `attackAttribution` | yes | object | Attribution map: type, then source, then display name | `preTargeting` (empty); data from `preAttackRollConfig` |
| `flankingAdvantage` | yes | boolean | Flanking gave advantage | `preAttackRollConfig` |
| `flankingAdvantageKind` |  | string | `"flanking"` or `"flanked"` | `preAttackRollConfig` |
| `flankingRollBonus` |  | object | A fixed flanking bonus: `{ bonus, kind, label }` | `preAttackRollConfig` |
| `grantedAttackBonusInRollUuid` |  | string | The target actor whose granted attack bonus is in the roll | set when the attack roll is built |
| `attackRollCount` |  | number | Attack rolls made for the use | `preTargeting` (0); data from `preAttackRoll` |
| `attackRoll` | yes | `D20Roll` | The attack roll | data from the optional attack bonus pass |
| `attackTotal` | yes | number | The attack roll's total | `preTargeting` (-100); data as `attackRoll` |
| `attackMode` | yes | string | The attack mode rolled, e.g. `"oneHanded"`, `"twoHanded"` | data as `attackRoll` |
| `ammunition` | yes | `Item5e` | The loaded ammunition | data as `attackRoll`, or from `postNoAction` |
| `ammunitionActivity` | yes | activity | The ammunition's own activity | data as `attackRoll` |
| `diceRoll` | yes | number | The value the attack's d20 counts as | `preTargeting` (0); data as `attackRoll` |
| `d20AttackRoll` | yes | number | The d20's result | `preTargeting` (-1); data as `attackRoll` |
| `isCritical` | yes | boolean | The attack is a critical (the tracker decides) | `preTargeting`; decided by `preCheckHits` |
| `isFumble` | yes | boolean | The attack is a fumble | `preTargeting`; decided by `preCheckHits` |
| `isHit` | yes | boolean | A target was hit | always; data from `isHit` |
| `isHitEC` | yes | boolean | A target took a glancing hit | always; data from `isHit` |
| `hitDisplayData` | yes | object | The card's hits rows, by target | `isHit` |
| `challengeModeScale` |  | object | Damage scale by target, challenge mode armor only | `isHit` |
| `whisperAttackCard` | yes | boolean | The hits are whispered to the GM | `postAttackRoll` |
| `needsHitTargetsDisplayed` |  | boolean | The card has yet to list its targets | `preTargeting` (true) |
| `activeDefenceDC` |  | number | Active defence: the DC the targets roll against | `ActiveDefenceWorkflow` only |
| `activeDefenceRolls` |  | object | Active defence: each target's roll, by token uuid | `ActiveDefenceWorkflow` only |

The tracker is reset and filled by the advantage check, which runs after the `midi-qol.preAttackRoll`
hook and before the `preAttackRollConfig` macro pass. Assigning `workflow.advantage = true` adds a
source; `false` clears the sources; `undefined` resets the tracker. After the roll the tracker is
reconciled with the roll's advantage mode.

`attackRoll`, `attackTotal`, `attackMode`, `ammunition` and `ammunitionActivity` are set straight after
the attack is rolled, before the optional attack bonus passes. With no optional bonus the first pass
that sees them is `postWaitForAttackRoll`. `ammunition` is set earlier, by `postNoAction`, when the
activity consumes ammunition as a consumption target.

`isCritical` and `isFumble` can be set by the caller before `preTargeting`
(`midiOptions.isCritical` / `isFumble`). The attack roll is processed before `preCheckHits` and
again after it. A damage roll rolled as a critical also sets `isCritical`. Assigning either sets an
override on the tracker.

With *Auto check if attack hits target* off, `isHit` is the attack roll's own success.

`attackTotal`, `diceRoll` and `d20AttackRoll` are read from `attackRoll` each time, so a change a macro
makes to the roll shows in them. A value assigned to one of them holds until the attack roll is
replaced.

## Damage

| Field | Stable | Type | What it holds | When |
| --- | --- | --- | --- | --- |
| `defaultDamageType` | yes | string | The activity's first damage type | `preTargeting` |
| `damageRollCount` |  | number | Damage rolls made since the last attack roll | `preTargeting` (0); data from the optional damage bonus pass |
| `damageRules` |  | object | dnd5e 6.1 attacker rules: `{ ignore, downgrade }` | data from the optional damage bonus pass |
| `damageRolls` | yes | `DamageRoll[]` | The activity's damage rolls | `preTargeting` (empty); data from `postWaitForDamageRoll` |
| `damageRoll` | yes | `DamageRoll` | The damage rolls merged into one | always; data from `postWaitForDamageRoll` |
| `damageTotal` | yes | number | Total of the damage rolls | `preTargeting` (0); data from `postWaitForDamageRoll` |
| `rawDamageDetail` | yes | `DamageDescription[]` | The damage as rolled, by type | `preTargeting` (empty); data from `postWaitForDamageRoll` |
| `damageDetail` | yes | `DamageDescription[]` | A copy of `rawDamageDetail` | `preTargeting` (empty); data from `postWaitForDamageRoll` |
| `flavor` |  | string | The damage roll's label | `postWaitForDamageRoll` |
| `otherDamageRolls` | yes | `DamageRoll[]` | The other activity's and the ammunition's damage rolls | data from `postWaitForDamageRoll` |
| `otherDamageRoll` | yes | `DamageRoll` | The other damage rolls merged into one | always; data as `otherDamageRolls` |
| `otherDamageTotal` | yes | number | Total of the other damage rolls | data as `otherDamageRolls` |
| `rawOtherDamageDetail` | yes | `DamageDescription[]` | The other damage as rolled | `preTargeting` (empty); data as `otherDamageRolls` |
| `otherDamageDetail` | yes | `DamageDescription[]` | A copy of `rawOtherDamageDetail` | `preTargeting` (empty); data as `otherDamageRolls` |
| `otherDamageMatches` |  | `TokenDocumentSet` | Targets the other activity's damage applies to | `undefined` until built; see below |
| `ammunitionDamageMatches` |  | `TokenDocumentSet` | Targets the ammunition's damage applies to | `undefined` until built; see below |
| `otherConsumed` |  | object or `false` | What the other activity consumed; `false` if declined | `undefined` until settled |
| `bonusDamageRolls` | yes | `DamageRoll[]` | Rolls returned by damage bonus macros | data from `postDamageRollStarted` |
| `bonusDamageRoll` | yes | `DamageRoll` | The bonus damage rolls merged into one | always; data as `bonusDamageRolls` |
| `bonusDamageTotal` | yes | number | Total of the bonus damage rolls | data as `bonusDamageRolls` |
| `rawBonusDamageDetail` | yes | `DamageDescription[]` | The bonus damage as rolled | `preTargeting` (empty); data as `bonusDamageRolls` |
| `bonusDamageDetail` | yes | `DamageDescription[]` | A copy of `rawBonusDamageDetail` | `preTargeting` (empty); data as `bonusDamageRolls` |
| `damageList` | yes | `DamageListEntry[]` | One entry per target | `preTargeting` (empty); data from `preTargetDamageApplication` |
| `damageItem` | yes | `DamageListEntry` | The entry of the target being processed | `preTargetDamageApplication` |
| `targetDamage` |  | object | Each target's entries, by token uuid | `preTargetDamageApplication` |
| `midiTargetDetail` |  | object | Uncanny Dodge as the damage calculation applied it, by token uuid | `preTargetDamageApplication` |
| `utilityRolls` | yes | `BasicRoll[]` | The utility (formula) rolls | `preTargeting` (empty); data from `postWaitForUtilityRoll` |
| `utilityRoll` | yes | `BasicRoll` | The utility rolls merged into one | always; data from `postWaitForUtilityRoll` |
| `effectsAlreadyExpired` |  | `string[]` | Special durations already expired for the use | `preTargeting` (empty); see below |

`damageTotal`, `otherDamageTotal` and `bonusDamageTotal` are read from their rolls each time, as the
attack values are; a value assigned to one holds until its rolls are replaced.

The damage roll is kept on the workflow after the optional damage bonus passes, so those passes see
`damageRollCount` and `damageRules` for the roll but not its `damageRolls`. Other damage is rolled
with the damage roll. When the other activity consumes a resource and hits or saves are checked, its
roll waits until the consumption is settled (when saves start, or at `AllRollsComplete`).

`otherDamageMatches` and `ammunitionDamageMatches` are built when other damage is rolled, and
otherwise at the start of `AllRollsComplete`, so they are always set by `preTargetDamageApplication`.
`ammunitionDamageMatches` stays `undefined` with no ammunition activity.

`damageList` is filled one target at a time. At a target's `preTargetDamageApplication` it holds the
targets processed so far, and it is complete from `postAllRollsComplete`. With
*Single Concentration Check* off and other damage rolled, the list is built a second time for the
other damage; `targetDamage` keeps both entries for each target.

`damageItem` is set before a target's `preTargetDamageApplication`, `isDamaged` / `isHealed` and
`preDamageApplication` passes. Changes a macro makes to it are copied back to the entry.

`effectsAlreadyExpired` is emptied in `PreambleComplete`. The passes at which entries are added were
not verified.

## Damage list entries

Each `damageList` entry is one record in dnd5e's terms.

| Field | Stable | Type | What it holds |
| --- | --- | --- | --- |
| `actorUuid`, `actorId` | yes | string | The target's actor |
| `targetUuid`, `sceneId` | yes | string | The target's token uuid and scene |
| `damages` | yes | `DamageDescription[]` | The damage as rolled: what `actor.applyDamage(damages, options)` takes |
| `options` | yes | object | The damage application options, with the attacker's dnd5e 6.1 rules |
| `calculatedDamages` | yes | `DamageDescription[]` | The damage after resistances: what is applied. Change it in place |
| `totalDamage` | yes | number | Total damage after all modifiers |
| `hpDamage`, `tempDamage` | yes | number | Hit points and temporary hit points lost |
| `oldHP`, `newHP` | yes | number | Hit points before and after |
| `oldTempHP`, `newTempHP` | yes | number | Temporary hit points before and after |
| `oldDeathFailures`, `newDeathFailures` | yes | number | Death save failures before and after (massive damage) |
| `oldVitality`, `newVitality` | yes | number | Vitality before and after, with a vitality resource |
| `isHit`, `wasHit` | yes | boolean | The target was hit |
| `saved`, `superSaver`, `semiSuperSaver` | yes | boolean | The target's save result |
| `critical` | yes | boolean | The attack was a critical |
| `uncannyDodge` | yes | boolean | Uncanny Dodge applied |
| `challengeModeScale` | yes | number | Challenge mode armor damage scale |
| `details` | yes | `string[]` | Text breakdown of the damage |

Deprecated names on an entry, each warning when used:

| Old name | Use | Until |
| --- | --- | --- |
| `damageDetail` | `calculatedDamages` | 14.9.0 |
| `rawDamageDetail` | `damages` | 14.9.0 |
| `calcDamageOptions` | `options` | 14.9.0 |
| `damageDetails` | `calculatedDamages` / `damages` filtered by `midiCategory` | 14.8.0 |
| `healingAdjustedTotalDamage` | `hpDamage + tempDamage` | 14.8.0 |

`damageSelector` and `damageMods` are gone. The deprecated names are not enumerable: a copy of an
entry has only the new names.

## Saves

| Field | Stable | Type | What it holds | When |
| --- | --- | --- | --- | --- |
| `hasSave` | yes | boolean | The activity, other activity or ammunition has a save or check | always |
| `saveActivity` | yes | activity | The activity that supplies the save | always |
| `otherSaveActivity` | yes | activity | The save behind the other damage | always |
| `saveItem` | yes | `Item5e` | The save activity's item | always |
| `saveDC` | yes | number | The save DC | `preTargetSave` |
| `saveDetails` | yes | `SaveDetails` | The save details of the latest target set up | `preTargetSave` |
| `targetSaveDetails` | yes | object | Each target's `SaveDetails`, by token uuid | per target, from its `preTargetSave` |
| `saves` | yes | `TokenDocumentSet` | Targets that saved | `preTargeting` (empty); data from `isSave` |
| `failedSaves` | yes | `TokenDocumentSet` | Targets that failed; see below | `preTargeting` (empty); data from `preItemRoll` |
| `superSavers` | yes | `TokenDocumentSet` | Targets with a super saver flag for this save | `preTargeting` (empty); data from `postWaitForSaves` |
| `semiSuperSavers` | yes | `TokenDocumentSet` | Targets with a semi super saver flag for this save | `preTargeting` (empty); data from `postWaitForSaves` |
| `criticalSaves` | yes | `TokenDocumentSet` | Targets whose save was a critical | `preTargeting` (empty); data from `postWaitForSaves` |
| `fumbleSaves` | yes | `TokenDocumentSet` | Targets whose save was a fumble | `preTargeting` (empty); data from `postWaitForSaves` |
| `advantageSaves` | yes | `TokenDocumentSet` | Targets saving with advantage | per target, from its `preTargetSave`; reset after `preSave` |
| `disadvantageSaves` | yes | `TokenDocumentSet` | Targets saving with disadvantage | per target, from its `preTargetSave`; reset after `preSave` |
| `saveResults` | yes | `D20Roll[]` | Every save roll, as a flat array | `preTargeting` (empty); data from `isSave` |
| `tokenSaves` | yes | object | Each target's save roll, by token uuid | `undefined` until a target has rolled; data from `isSave` |
| `saveRoll(token)` | yes | `D20Roll` | One target's save roll (a Token, TokenDocument or uuid) | `undefined` until it has rolled |
| `saveAttribution` | yes | object | Why each save had advantage or disadvantage, by token uuid | always (empty); data from `postWaitForSaves` |
| `saveDisplayData` | yes | array | The card's saves rows | `preTargeting`; data from `postWaitForSaves` |
| `saveDisplayFlavor` |  | string | The saves section's heading | `postWaitForSaves` |
| `pendingSaves` |  | `PendingSaves` | The saves a module or chat card is still to answer, by TokenDocument uuid | `preTargeting` (empty); filled while saves are requested |

`failedSaves` is the targets from `preItemRoll` (hit targets, for an attack, once saves start). When
saves are rolled it becomes the targets that failed. With no save it stays the hit targets (attack) or
all targets, which is what effects and damage read.

Every target's save is rolled before any result is processed. `saveResults` is complete at the first
`isSave` pass. `saves`, `failedSaves`, the critical, fumble and super saver sets, `saveDisplayData` and
`saveAttribution` are then updated one target at a time, around that target's
`isSave` / `isSaveSuccess` / `isSaveFailure` passes, and are complete from `postWaitForSaves`.

The save sets, `saveDisplayData` and `saveResults` are emptied when saves start (after `preSave` and
`isAboutToSave`) and when the targets are set.

`pendingSaves` holds entries only while a save answered by a chat card, Monk's TokenBar, Flash Rolls or
Epic Rolls is awaited (midi-next M5b; it replaced `saveRequests`, `saveRequestKinds` and `saveTimeouts`).
A save or Active Defence roll asked of a player goes through the request core and leaves nothing on the
workflow (`defenceRequests` and `defenceTimeouts` are gone).

## Effects, templates and other activities

| Field | Stable | Type | What it holds | When |
| --- | --- | --- | --- | --- |
| `templateUuids` | yes | `string[]` | The use's templates (regions) | `preTargeting` (empty); data once placed |
| `templateUuid` | yes | string | `templateUuids[0]`, or `""` | as `templateUuids` |
| `template` | yes | document | The first template's region or template document | as `templateUuids` |
| `expectedTemplateCount` |  | number | Templates the activity places | `preTargeting` |
| `placedTemplateCount` |  | number | Templates placed | `preTargeting` (0); data once placed |
| `needTemplate` |  | boolean | Templates remain to be placed | always |
| `rangeTargeting` |  | boolean | Targets come from an emanation with no template | always |
| `tempTargetConfirmation` |  | boolean | Targets come from a template that auto-targets | always |
| `activationMatches` |  | `TokenDocumentSet` | Targets passing the activity's effect condition | `preActiveEffects` |
| `activationFails` |  | `TokenDocumentSet` | Targets failing it | `preActiveEffects` |
| `otherActivationMatches` |  | `TokenDocumentSet` | Targets passing the other activity's effect condition | `preActiveEffects` |
| `otherActivationFails` |  | `TokenDocumentSet` | Targets failing it | `preActiveEffects` |
| `effectTargets` | yes | `TokenDocumentSet` | Targets that get the activity's effects | `preActiveEffects` |
| `otherEffectTargets` | yes | `TokenDocumentSet` | Targets that get the other activity's effects | `preActiveEffects` |
| `effectTargetsOnSave` | yes | `TokenDocumentSet` | Targets that get the activity's "on save" effects | `preActiveEffects` |
| `otherEffectTargetsOnSave` | yes | `TokenDocumentSet` | Targets that get the other activity's "on save" effects | `preActiveEffects` |
| `forceApplyEffects` | yes | boolean | Apply effects whatever the hits and saves | `preTargeting` (false) |
| `otherActivity` | yes | activity | The item's paired other activity | always |
| `otherActivityOrAmmunition` | yes | activity | The other activity, else the ammunition's | always |
| `concentrationId` | yes | string | The concentration effect this use began, from the card | always; data from `postNoAction` |
| `deferredConcentration` |  | object | Concentration to begin once the use can't be cancelled | cleared in `PreambleComplete` |
| `summonedCreatures` |  | `TokenDocument[]` | The tokens a summon activity created | set by dnd5e's `postSummon` |
| `postSummonHookId` |  | number | The hook that records them | `preTargeting` |
| `transformedActors` | yes | `Actor5e[]` | The actors a transform activity transformed | set by the transform |
| `transformedActorUuids` |  | `string[]` | Their uuids | set by the transform |
| `teleportResults` | yes | array | Each teleported token, its plan and whether it moved | `postTeleport` |

The effect target sets are `undefined` until the effects stage, which works them out before
`preActiveEffects`. With *Auto check Saves* off `effectTargets` is set to `failedSaves` when the
workflow stops at the saves.

Templates placed from the use dialog are on the workflow by `postNoAction`; otherwise the workflow
waits in `AwaitTemplate` and they are set by `templatePlaced`. `templateUuids` is replaced, never
changed in place.

`summonedCreatures` and `postSummonHookId` are set only for a summon activity with
*Auto remove summoned creatures* on. `deferredConcentration` is set during the use when the activity
needs concentration, between `preItemRoll` and `postNoAction`.

In the teleport passes `options.teleport` holds `maxDistance` and `tokens` (`preTeleport`) and
`results` (`postTeleport`).

## Flags and state

| Field | Stable | Type | What it holds | When |
| --- | --- | --- | --- | --- |
| `currentStep` | yes | string | The step the workflow is in or waits in: its id, `"midi-qol.WaitForSaves"` | `preTargeting` (`"midi-qol.NoAction"`) |
| `currentAction` | yes | function | The same step as its `WorkflowState_<name>` forwarder, for comparing with `workflow.WorkflowState_<name>`; see below | `preTargeting` (`WorkflowState_NoAction`) |
| `nameForState(step)` | yes | string | A step's name, from its id or forwarder: `nameForState(currentStep)` gives `"WaitForSaves"` | always |
| `suspended` | yes | boolean | The workflow is waiting (for a roll, a button, a template) | `preTargeting` (true); false while states run |
| `executingStates` |  | number | Above 0 while the workflow is running | always |
| `stateTransitionCount` |  | number | States run so far | `postNoAction` |
| `aborted` | yes | boolean | The workflow is aborted; set it to abort | `preTargeting` (false) |
| `abort` |  | boolean | Active defence only: abort when the attack roll resumes | `preTargeting` (false) |
| `outcome` | yes | string | How the use ended up; see below | `preTargeting` (`"ok"`) |
| `itemUseComplete` |  | boolean | dnd5e's use has finished and the card is set up | `preTargeting` (false); true from `postNoAction` |
| `readOnly` | yes | boolean | A copy of another user's workflow: it does not run or write | always |
| `damageOnly` | yes | boolean | A damage roll on its own; no effects or use-level passes | always |
| `useOther` |  | boolean | Damage-only: the damage is shown and stored as other damage | always |
| `inCombat` | yes | boolean | The actor was a combatant when the use started | `preTargeting` |
| `isTurn` | yes | boolean | It was the actor's turn in a started combat when the use started | `preTargeting` |
| `AoO` | yes | boolean | The attack is an attack of opportunity | `preTargeting` (false); data from `postNoAction` |
| `itemUsesReaction` |  | boolean | The use spends the actor's reaction | `postNoAction` |
| `itemUsesBonusAction` |  | boolean | The use spends the actor's bonus action | `postNoAction` |
| `conditionData` | yes | object | The data of the last condition evaluated for the workflow | set when a condition is evaluated |
| `undoData` |  | object | Undo data, with *Support undoing item rolls* on | `postNoAction` |
| `noAutoAttack` | yes | boolean | Never set by midi; a macro can set it | `preTargeting` (`undefined`) |
| `workflowStartTime` |  | number | `Date.now()` when the workflow was made | `preTargeting` |

`outcome` is one of `"ok"`, `"allMissed"`, `"invalid"` (out of range or incapacitated), `"split"`
(an attack per target handed to per-target uses), `"manualSaves"` (saves not checked), `"cancelled"`
(a state hook returned false) and `"aborted"`.

`AoO`, `itemUsesReaction` and `itemUsesBonusAction` are set just after `preItemRoll`, before the card
is created.

`suspended` is true during `preTargeting` and `preItemRoll`, which run before the workflow starts.

midi's steps are registered steps (their ids are `midi-qol.<name>`; see
[Steps, reactions and requests](/docs/StepsAndReactions-2026-11-19.md)), not methods of the workflow.
`workflow.WorkflowState_<name>` remains as one function per step, so `workflow.currentAction ===
workflow.WorkflowState_WaitForSaves` still works. Calling one runs that step and warns as deprecated: use
`workflow.performState("midi-qol.<name>")` to run the workflow from a step, and `MidiQOL.steps` to change
what a step does.

## Workflow options midi sets

| Option | Stable | Type | What it holds | When |
| --- | --- | --- | --- | --- |
| `preSelectedTargetUuids` | yes | `string[]` | The user's targets when the use started | `preTargeting` |
| `ignoreUserTargets` | yes | boolean | The use was given its targets; later states keep them | `preItemRoll` |
| `targetConfirmation` | yes | string | Overrides the target confirmation setting | set by the caller |
| `rollAttackPerTarget` | yes | boolean | This use is one target's attack of an attack per target | `preTargeting` |
| `attackSplit` | yes | object | `{ index, count, ammunition }` for that attack | `preTargeting` |
| `autoRollAttack`, `autoRollDamage` | yes | boolean, string | The auto-roll settings, unless the caller set them | `preTargeting` |
| `fastForwardAttack`, `fastForwardDamage` | yes | boolean | The fast-forward settings, unless the caller set them | `preTargeting` |

An attack-per-target activity with more than one target does not roll in its own workflow. That
workflow ends with `outcome` `"split"`; each target gets a use of its own, with its own workflow and
card, carrying `attackSplit`. The first workflow's card lists each target's result.

## What the card stores

A workflow keeps its state on its usage card, in `card.system.midi` and `card.rolls`. midi's internal
format may change: read it through the workflow.

| Stored | Fields | Where |
| --- | --- | --- |
| Scalars | `isCritical`, `isFumble`, `templateUuids`, `workflowOptions`, `inCombat`, `isTurn` | `system.midi.state` |
| Scalars | `damageOnly`, `damageRules`, `deferredConcentration`, `otherConsumed`, `spentAmmunitionData` | `system.midi.state` |
| Item changes | A modified copy a macro assigned to `workflow.item` / `workflow.activity` | `system.midi.state.useChanges` |
| Counts | `attackRollCount`, `damageRollCount` | `system.midi` |
| Token sets | `targets`, `hitTargets`, `hitTargetsEC`, `saves`, `failedSaves`, `superSavers` | `system.midi.records` |
| Token sets | `semiSuperSavers`, `criticalSaves`, `fumbleSaves` | `system.midi.records` |
| Token facts | `saveAttribution`, `preSelectedTargets`, `otherDamageMatches`, `ammunitionDamageMatches` | `system.midi.records` |
| Rolls | `attackRoll`, `damageRolls`, `otherDamageRolls`, `bonusDamageRolls`, `utilityRolls`, save rolls | `card.rolls` |

`failedSaves` is stored only when the use has a save. Other modules' `workflowOptions` keys are stored
too: a namespace registered with `MidiQOL.registerWorkflowOptionsSchema` as its schema's data, an
unregistered key as it is, with a deprecation warning, until a later release stops storing unregistered
keys. Changes are queued and written at milestones
(or after every step, by the *Chat card updates* setting); `workflow.chatCard` includes queued
changes.

Read from what is stored, not stored themselves: `advantageSaves` and `disadvantageSaves` (each record's
save advantage mode), `attackTotal`, `diceRoll`, `d20AttackRoll` and
the damage totals. Worked out again when a workflow is rebuilt, not stored: `item`, `activity`,
`speaker`, `token`, `currentStep` (where it waits), the damage details, `failedSaves` with no save, `tokenSaves`, and the four can-see / can-sense sets (not on a
read-only copy). A rebuilt workflow is `suspended` with `itemUseComplete` true.

Not kept, so empty on a rebuilt workflow: anything a macro added to the workflow, `undoData`,
`damageList`, `damageItem`, `targetDamage`, the effect target sets, `hitDisplayData`,
`saveDisplayData`, `targetSaveDetails`, `castData`, `rangeDetails`, `conditionData`,
`effectsAlreadyExpired`, and the tracker apart from critical and fumble.

The hook `midi-qol.workflowRebuilt` (workflow, card, `{ readOnly }`) fires when a workflow is rebuilt.

## Deprecated and removed

midi-next keeps midi 14.x's deprecations with their 14.x dates. It matches one 14.x release's state, its
compatibility line (`MidiQOL.compatibilityLine()`, now `"14.7.0"`): a deprecation whose "Until" is a later
release warns; one whose "Until" the line has reached is gone, as in that release (a field reads `undefined`, a
function throws an error naming its replacement). From 14.8.0 token sets give TokenDocuments whatever
`setTokenDocumentSets` says; from 14.9.0 a TokenDocument has no `document`.

Still present, deprecated:

| Field | Use | Until |
| --- | --- | --- |
| `saveRolls` | `tokenSaves`, or `saveRoll(token)` | warns |
| `noAutoDamage` | `workflowOptions.autoRollDamage = "none"`, or return false from `preDamageRollConfig` | 14.8.0 |
| `noOptionalRules` | No effect: optional rules follow the *Optional rules* setting | 14.8.0 |
| `healingAdjustedDamageTotal` | No replacement | 14.8.0 |
| `healingAdjustedBonusDamageTotal` | No replacement | 14.8.0 |
| `healingAdjustedOtherDamageTotal` | No replacement | 14.8.0 |
| `saveTargetsDisplayed` | `saveDisplayData.length` | 14.8.0 |
| `allOtherEffectTargets` | `targets` | 14.8.0 |
| `critFlagSet` | `tracker.critical.isForced` | warns |
| `noCritFlagSet` | `tracker.critical.isSuppressed` | warns |
| `unSuspend(context)` | `resume(event)` | 14.8.0 |
| `uuid` | `id` for the workflow, `itemUuid` for the item | not stated |
| `otherDamageFormula` | No replacement; returns `""` | not stated |
| `attackAdvAttribution` | `attackAttribution` (legacy `"type:source"` Set) | not stated |
| `advReminderAttackAdvAttribution` | `attackAttribution` (Advantage Reminder format) | not stated |
| `templateUuid`, `templateId` | `templateUuids` | compatibility aliases |

Removed since the previous version of this page; reading them gives `undefined`:

| Field | Instead |
| --- | --- |
| `attackRollHTML`, `damageRollHTML`, `bonusDamageRollHTML` | The card draws its rolls from `card.rolls` |
| `otherDamageRollHTML`, `utilityRollHTML` | As above |
| `kickStart`, `onUseCalled`, `attackRolled` | None |
| `otherDamageList` | None; it was never set |

Changed meaning: `isTurn` is now set (it was always `undefined`). `id` is `undefined` before the card
exists (it was the activity's uuid). `rolls` is always the card's rolls. `rangeTargeting` and
`tempTargetConfirmation` are getters, available from `preTargeting`. `saveAttribution` is filled by
midi again.

Card flags from before 14.6.9 (`card.flags.midi-qol.hitTargetUuids` and so on) still read, with a
warning, until 14.8.0; see [Old card flags](/MACROS.md#old-card-flags).

## Optional bonus passes

`workflow` fields are not updated before an optional bonus pass
(`flags.midi-qol.optional.NAME.attack.*`, `damage.*`). They hold what the previous pass saw:
`workflow.macroPass` is still the last pass that ran a macro. Use `args[0].macroPass` and
`args[0].tag === "optional"` to tell that the current pass is an optional bonus; `args[0].roll` is the
roll being changed.

At an attack bonus pass the workflow already has the attack roll (`attackRoll`, `attackTotal`). At a
damage bonus pass it does not yet have the damage rolls.

## Optional save bonus

`flags.midi-qol.optional.NAME.save.*`, `check.*` and `skill.*` are not part of the attacker's
workflow. When such a bonus runs a macro, the macro gets a separate `DummyWorkflow` made for the
call. It never runs a state. Only these fields hold data; the token sets are empty and the rolls
unset.

| Field | Type | What it holds |
| --- | --- | --- |
| `actor` | `Actor5e` | The actor receiving the bonus |
| `token` | `Token` | That actor's token, from its speaker |
| `item` | `Item5e` | The item named by the macro (`ItemMacro.<uuid or name>`), if found |
| `speaker` | object | The actor's speaker data |
| `id` | string | A random id |
| `workflowName` | string | `"workflow <id>"` |
| `workflowOptions` | object | midi's defaults |
| `rollOptions` | object | Empty apart from `fastForward` |
| `currentStep`, `currentAction` | string, function | `"midi-qol.NoAction"`, `WorkflowState_NoAction` |
| `suspended` | boolean | true |
| `aborted` | boolean | false |
| `itemUseComplete` | boolean | false |
| `isCritical`, `isFumble` | boolean | false |
| `forceApplyEffects` | boolean | false |
| `preSelectedTargets` | `TokenDocumentSet` | The user's current targets |

The roll being changed is `args[0].roll`.

> [!TIP]
> [Jump to top](#workflow-fields)
