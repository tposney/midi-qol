> [!TIP]
> [Readme](/README.md#table-of-contents) · [Macro Guide](/MACROS.md#table-of-contents) · [Flowchart, default order](flowchart.md) · [Workflow Fields](workflowfields-2026-11-17.md)

# Macro Passes for MidiQOL

> With the setting *Roll saves before damage (Experimental)* on (Workflow Settings › Misc). Otherwise the order is the [default one](flowchart.md).

This page shows when and why each macro pass is called. See [Workflow Fields](workflowfields-2026-11-17.md) for the fields available in each pass. In the menu for configuring an item's on use macro calls, some options are shown with a description rather than the name of the pass; each node in the chart gives both.

The chart is arranged by `args[0].tag`, the category of macro pass:

- `OnUse` passes run on the client rolling the item.
- `TargetOnUse` passes run once for each target before proceeding.
- `optional` passes are called only when a macro is named in a `flags.midi-qol.optional.NAME.*` flag ([see here](/FLAGS.md#itemmacro-in-optional-bonus-flags)).
- `DamageBonus` has one pass, called when macros are named in the *Damage Bonus Macro* field in a character's special traits, or set by an effect with `flags.dnd5e.DamageBonusMacro` ([see here](/MACROS.md#damage-bonus-macros)).

A teleport activity (dnd5e 6) also runs `preTeleport` before anyone moves and `postTeleport` after the moves; they are not drawn on the chart.

> [!NOTE]
> If your macro changes a document the calling client may not have permission for, use sockets. Utilities are available in `MidiQOL.socket()`.

```mermaid
---
config:
  themeVariables:
    fontSize: '20px'
---

flowchart TD
  subgraph target["args[0].tag = 'TargetOnUse'"]
    isTargeted["
      isTargeted
      <small>Target is targeted but before item is rolled</small>
    "]
    isPreAttacked["
      isPreAttacked
      <small>Target is about to be attacked, before reactions</small>
    "]
    isAttacked["
      isAttacked
      <small>Target is attacked</small>
    "]
    optAC --> isHit & isMissed
    isHit["
      isHit
      <small>Target of a hit</small>
    "]
    isMissed
    isAboutToSave --> preTargetSave
      preTargetSave["
        preTargetSave
        <small>Target is about to roll a saving throw</small>
      "] -- Has Optional Macro --> optSave
      optSave -- Success --> isSaveSuccess
      optSave -- Fail --> isSaveFailure

    %% extra note included here because connecting these nodes as normal clutters this part of the chart
    isAboutToSave ~~~ a["`preTargetSave -> success/fail if no optional`"]:::edgeLabel
    isSaveSuccess["
      isSaveSuccess
      <small>Target rolled a successful save</small>
    "] --> isSave
    isSaveFailure["
      isSaveFailure
      <small>Target failed a saving throw</small>
    "] --> isSave
    isSave["
      isSave
      <small>Target rolled a save</small>
    "]
    preTargetDamageApplication["
      preTargetDamageApplication
      <small>Target is about to be damaged by an item</small>
    "]
    isDamaged["
      isDamaged
      <small>Target is damaged by an attack</small>
    "]
    isHealed
    postTargetEffectApplication["
      postTargetEffectApplication
      <small>Target has an effect applied by a rolled item</small>
    "]
    eff["`Effects have been applied`"]:::edgeLabel -.-> postTargetEffectApplication
  end

  subgraph optAttack["args[0].tag = 'optional'"]
    direction TB
    flags.midi-qol.optional.NAME.attack.* -- Missed -->
    flags.midi-qol.optional.NAME.attack.fail.*
  end
  subgraph optDamage["args[0].tag = 'optional'"]
    flags.midi-qol.optional.NAME.damage.*
  end
  subgraph optSave["args[0].tag = 'optional'"]
    direction TB
    flags.midi-qol.optional.NAME.save.* -- Failed --> flags.midi-qol.optional.NAME.save.fail.*
    ~~~ flags.midi-qol.optional.NAME.check.*
    flags.midi-qol.optional.NAME.check.* -- Failed --> flags.midi-qol.optional.NAME.check.fail.* ~~~ flags.midi-qol.optional.NAME.skill.*
    flags.midi-qol.optional.NAME.skill.* -- Failed --> flags.midi-qol.optional.NAME.skill.fail.*
  end
  subgraph optAC["args[0].tag = 'optional'"]
    ac["flags.midi-qol.optional.NAME.ac"]
  end

  subgraph onuse["args[0].tag = 'OnUse'"]
    subgraph template[" "]
        preAwaitTemplate --> postAwaitTemplate
        postAwaitTemplate --> preTemplatePlaced
        preTemplatePlaced --> templatePlaced
        templatePlaced["
          templatePlaced
          <small>Only called once a template is placed</small>
        "] --> postTemplatePlaced
        postTemplatePlaced
    end

    subgraph attack[" "]
      preAttackRoll["
        preAttackRoll
        <small>Before Attack Roll</small>
      "] --> isPreAttacked
        isPreAttacked --> preAttackRollConfig
      preAttackRollConfig["
          preAttackRollConfig
        <small>Before Attack Configuration</small>
      "] -- Has Optional Macro --> optAttack
      preAttackRollComplete --> isAttacked
        isAttacked --> preCheckHits
        preCheckHits -- Has Optional Macro --> optAC
        preCheckHits["
          preCheckHits
          <small>Before Check Hits</small>
        "] --> isHit & isMissed
        isHit --> postAttackRoll
        isMissed --> postAttackRoll
      postAttackRoll["
          postAttackRoll
          <small>After Attack Roll</small>
        "] --> postAttackRollComplete
    end

    subgraph damage[" "]
      preWaitForDamageRoll --> preDamageRoll
      preDamageRoll["
        preDamageRoll
        <small>Before Damage Roll</small>
      "] --> preDamageRollConfig
        b["`preDamageRollConfig and optional damage will repeat for damage on an 'other damage' activity`"]:::edgeLabel ~~~ optDamage
      preDamageRollConfig["
        preDamageRollConfig
        <small>Before Damage Configuration</small>
      "] -- Has Optional Macro --> optDamage
      optDamage --> postWaitForDamageRoll
      preDamageRollConfig -- No Optional Macro --> postWaitForDamageRoll
      postWaitForDamageRoll --> preConfirmRoll
      preConfirmRoll --> postConfirmRoll
      postConfirmRoll --> preDamageRollStarted
        preDamageRollStarted --> DamageBonus["
          DamageBonus
          <small>args[0].tag = 'DamageBonus'</small>
          <small>Return a damage bonus</small>
        "]
        DamageBonus --> postDamageRollStarted
      postDamageRollStarted --> preDamageRollComplete
      preDamageRollComplete --> postDamageRoll
      postDamageRoll["
        postDamageRoll
        <small>After Damage Roll</small>
      "] --> postDamageRollComplete
      preDamageApplication["
        preDamageApplication
        <small>Before Damage Application</small>
      "]
    end

    subgraph utility[" "]
      preWaitForUtilityRoll --> postWaitForUtilityRoll
      postWaitForUtilityRoll --> preUtilityRollComplete
      preUtilityRollComplete --> postUtilityRollComplete
    end

    direction TB

    preTargeting["
      preTargeting
      <small>Called before targeting is resolved (*)</small>
    "] --> preItemRoll
    preItemRoll["
      preItemRoll
      <small>Called before the item is rolled (*)</small>
    "] -.-> config:::edgeLabel
    config["`Configure dialog`"] -.-> postNoAction
    postNoAction --> preStart
    preStart --> postStart
      postStart -- Has Template --> preAwaitTemplate
      postTemplatePlaced --> preAoETargetConfirmation
    postStart -- No Template --> preAoETargetConfirmation
    preAoETargetConfirmation --> postAoETargetConfirmation
    postAoETargetConfirmation --> preValidateRoll
      preValidateRoll --> isTargeted
      isTargeted --> postValidateRoll
    postValidateRoll --> prePreambleComplete
    prePreambleComplete --> postPreambleComplete
    postPreambleComplete --> preWaitForAttackRoll

    preWaitForAttackRoll -- Has Attack --> preAttackRoll
      preAttackRollConfig -- No Optional Macro --> postWaitForAttackRoll
    preWaitForAttackRoll -- No Attack --> postWaitForAttackRoll
      optAttack --> postWaitForAttackRoll
    postWaitForAttackRoll -- Has Attack --> preAttackRollComplete
      postAttackRollComplete --> preWaitForSaves 

    postWaitForAttackRoll -- Has Utility --> preWaitForUtilityRoll
      postUtilityRollComplete --> preWaitForSaves
    postWaitForAttackRoll -- No Attack or Utility --> preWaitForSaves

      postDamageRollComplete --> preAllRollsComplete
    preWaitForSaves --> preSave
      preSave["
        preSave
        <small>Before Checking Saves</small>
      "] -- Has Save --> isAboutToSave
      isSave --> postWaitForSaves
    preSave -- No Save --> postWaitForSaves
    postWaitForSaves --> preSavesComplete
    preSavesComplete --> postSave
    postSave["
      postSave
      <small>After Checking Saves</small>
    "] --> postSavesComplete
    postSavesComplete -- Has Damage --> preWaitForDamageRoll
      preAllRollsComplete -- Has Damage --> preTargetDamageApplication
      preTargetDamageApplication -- Damaged --> isDamaged
      preTargetDamageApplication -- Healed --> isHealed
      preTargetDamageApplication -- No Damage --> preDamageApplication 
      isDamaged --> preDamageApplication
      isHealed --> preDamageApplication
      preDamageApplication --> postAllRollsComplete
    postSavesComplete -- No Damage --> preAllRollsComplete
    preAllRollsComplete -- No Damage --> postAllRollsComplete
      hp["`HP changes on targets have been applied`"]:::edgeLabel -.-> postAllRollsComplete
    postAllRollsComplete --> preApplyDynamicEffects
    preApplyDynamicEffects --> preActiveEffects
      preActiveEffects["
        preActiveEffects
        <small>Before Active Effects</small>
      "] --> postTargetEffectApplication
      postTargetEffectApplication --> postApplyDynamicEffects
    postApplyDynamicEffects --> preRollFinished
    preRollFinished --> postActiveEffects
    postActiveEffects["
      postActiveEffects
      <small>After Active Effects</small>
    "] --> postRollFinished
    postRollFinished --> preCleanup
    preCleanup --> postCleanup
    postCleanup --> preCompleted
  end

  classDef node stroke-width:2px
  classDef opt fill:#008a8f

  style onuse fill:#003636
  style target fill:#004343
  style template fill:#017b7f
  style attack fill:#015152
  style utility fill:#016d6f
  style damage fill:#015e60
  class optAttack opt
  class optDamage opt
  class optSave opt
  class optAC opt

  %% color helper at https://www.learnui.design/tools/data-color-picker.html#single
  %% graphic design is my passion 😎
  ```

[Jump to Top](#macro-passes-for-midiqol)
