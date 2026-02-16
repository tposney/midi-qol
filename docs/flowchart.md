> [!tip] Navigation
> [Go to Readme](/README.md#table-of-contents) <br>
> [Go to Macro Guide](/MACROS.md#table-of-contents) <br>
> [Go to Flowchart (Saves Before Damage)](docs/flowchart_save-before-dmg.md) <br>
> [Go to Workflow Fields](docs/workflowfields.md)

# Macro Passes for MidiQOL

> *(versions 12.4.64+ with default setting)*

>>> [!important] 
This flowchart shows the default sequence, damage rolled before saves. In MidiQOL v13.0.23+, you may roll saves before damage by enabling the setting at `MidiQOL > Workflow Settings > Misc > Roll saves before damage`. The flowchart for this setting is [here](docs/flowchart_save-before-dmg.md).
>>>

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
    isAboutToSave -.-> saveTarget:::edgeLabel
    saveTarget["<p style='width:200px; text-wrap:balance;'>Save Target Shown On Card</p>"] -.-> preTargetSave
      preTargetSave["
        preTargetSave
        <small>Target is about to roll a saving throw</small>
      "] -.-> configureSave
      configureSave["<p style='width:200px; text-wrap:balance;'>Save Roll Configure Dialog (Skipped with Fast Forward enabled)</p>"]:::edgeLabel -.-> optSave
      optSave -- Success --> isSaveSuccess
      optSave -- Fail --> isSaveFailure
    isSaveSuccess["
      isSaveSuccess
      <small>Target rolled a successful save</small>
    "] --> isSave
    isSaveFailure["
      isSaveFailure
      <small>Target failed a saving throw</small>
    "] --> isSave["
      isSave
      <small>Target rolled a save</small>
    "]
    isSave-.-> saveResult["<p style='width:200px; text-wrap:balance;'>Save Result Shown On Card</p>"]:::edgeLabel
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
    eff["<p style='width:200px; text-wrap:balance;'>Effects Applied</p>"]:::edgeLabel -.-> postTargetEffectApplication
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
      preAttackRollConfig["
          preAttackRollConfig
        <small>Before Attack Configuration</small>
      "] --> preAttackRoll
      preAttackRoll["
        preAttackRoll
        <small>Before Attack Roll</small>
      "] -.-> configureAttack
      configureAttack["<p style='width:200px; text-wrap:balance;'>Attack Roll Configure Dialog (Skipped with Fast Forward enabled)</p>"]:::edgeLabel -.-> optAttack
      preAttackRollComplete --> isAttacked
        isAttacked --> preCheckHits
        preCheckHits["
          preCheckHits
          <small>Before Check Hits</small>
        "] -.-> showAttack
        showAttack["<p style='width:200px; text-wrap:balance;'>Attack Roll Shown On Card</p>"]:::edgeLabel -.-> optAC
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
      "] --> preDamageRollConfig
      preDamageRollConfig["
        preDamageRollConfig
        <small>Before Damage Configuration</small>
      "] -.-> configureDamage
      configureDamage["<p style='width:200px; text-wrap:balance;'>Damage Roll Configure Dialog (Skipped with Fast Forward enabled)</p>"]:::edgeLabel -.-> optDamage
        b["<p style='width:200px; text-wrap:balance;'>preDamageRollConfig will repeat for damage on 'other' activities</p>"]:::edgeLabel ~~~ optDamage
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
      "] -.-> showDamage:::edgeLabel
      showDamage["<p style='width:200px; text-wrap:balance;'>Damage Roll Shown On Card</p>"] -.-> postDamageRollComplete
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
    "] -.-> confirm:::edgeLabel
    confirm["<p style='width:200px; text-wrap:balance;'>Target Confirmation</p>"] -.-> preItemRoll
    preItemRoll["
      preItemRoll
      <small>Called before the item is rolled (*)</small>
    "] -.-> config:::edgeLabel
    config["<p style='width:200px; text-wrap:balance;'>Configure Dialog</p>"] -.-> consume:::edgeLabel
    consume["<p style='width:200px; text-wrap:balance;'>Item Use Consumption Targets Updated</p>"] -.-> card:::edgeLabel
    card["<p style='width:200px; text-wrap:balance;'>Chat Card Created</p>"] -.-> postNoAction
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

    preWaitForAttackRoll -- Has Attack --> isPreAttacked
      isPreAttacked --> preAttackRollConfig
    preWaitForAttackRoll -- No Attack --> postWaitForAttackRoll
      optAttack --> postWaitForAttackRoll 
    postWaitForAttackRoll -- Has Attack --> preAttackRollComplete
      postAttackRollComplete --> preWaitForDamageRoll 

    postWaitForAttackRoll -- Has Utility --> preWaitForUtilityRoll
      postUtilityRollComplete --> preWaitForDamageRoll
    postWaitForAttackRoll -- No Attack or Utility --> preWaitForDamageRoll
  
    preWaitForDamageRoll -- Has Damage --> preDamageRoll
      optDamage --> postWaitForDamageRoll
    preWaitForDamageRoll -- No Damage --> postWaitForDamageRoll
    postWaitForDamageRoll -- Has Damage --> preConfirmRoll
      postDamageRollComplete --> preWaitForSaves
    postWaitForDamageRoll -- No Damage --> preWaitForSaves
    preWaitForSaves --> preSave
      preSave["
        preSave
        <small>Before Checking Saves</small>
      "] -- Has Save --> isAboutToSave
      saveResult --> postWaitForSaves
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
      preDamageApplication -.-> hp:::edgeLabel
      hp["<p style='width:200px; text-wrap:balance;'>Target HP Updated</p>"] -.-> postAllRollsComplete
    preAllRollsComplete -- No Damage --> postAllRollsComplete
    postAllRollsComplete --> preApplyDynamicEffects
    preApplyDynamicEffects --> preActiveEffects
      preActiveEffects["
        preActiveEffects
        <small>Before Active Effects</small>
      "] -.-> eff
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
