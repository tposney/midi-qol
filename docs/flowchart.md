> [!tip] Navigation
> [Go to Readme](/README.md#table-of-contents) <br>
> [Go to Macro Guide](/MACROS.md#table-of-contents) <br>
> [Go to Flowchart (v13.0.23+)](docs/flowchart_save-before-dmg.md) <br>
> [Go to Workflow Fields](docs/workflowfields.md)

# Macro Passes for MidiQOL

> *(versions 12.4.64 to 13.0.22)*

::include{file=flowchart-description.md}

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
      preDamageRoll["
        preDamageRoll
        <small>Before Damage Roll</small>
      "] --> preDamageRollConfig["
        preDamageRollConfig
        <small>Before Damage Configuration</small>
      "]
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
    preWaitForAttackRoll -- No Attack --> postWaitForAttackRoll
      optAttack --> postWaitForAttackRoll 
      preAttackRollConfig -- No Optional Macro --> postWaitForAttackRoll
    postWaitForAttackRoll -- Has Attack --> preAttackRollComplete
      postAttackRollComplete --> preWaitForDamageRoll 

    postWaitForAttackRoll -- Has Utility --> preWaitForUtilityRoll
      postUtilityRollComplete --> preWaitForDamageRoll
    postWaitForAttackRoll -- No Attack or Utility --> preWaitForDamageRoll
  
    preWaitForDamageRoll -- Has Damage --> preDamageRoll
      preDamageRollConfig -- Has Optional Macro --> optDamage
      b["`preDamageRollConfig and optional damage will repeat for damage on an 'other damage' activity`"]:::edgeLabel ~~~ optDamage
      optDamage --> postWaitForDamageRoll
      preDamageRollConfig -- No Optional Macro --> postWaitForDamageRoll 
    preWaitForDamageRoll -- No Damage --> postWaitForDamageRoll
    postWaitForDamageRoll -- Has Damage --> preConfirmRoll
      postDamageRollComplete --> preWaitForSaves
    postWaitForDamageRoll -- No Damage --> preWaitForSaves
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
    postSavesComplete --> 
      preAllRollsComplete -- Has Damage --> preTargetDamageApplication
      preTargetDamageApplication -- Damaged --> isDamaged
      preTargetDamageApplication -- Healed --> isHealed
      preTargetDamageApplication -- No Damage --> preDamageApplication
      isDamaged --> preDamageApplication
      isHealed --> preDamageApplication
      preDamageApplication ---> postAllRollsComplete
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

  > [!tip] [Jump to Top](#macro-passes-for-midiqol)
