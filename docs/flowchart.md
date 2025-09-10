> [!tip] Navigation
> [Go to Readme](/README.md#item-onuse-macro-actor-onuse-macro-and-damage-bonus-macro-actor-special-traits-fields) <br>
> [Go to Workflow Fields](docs/workflowfields.md)

# Macro Passes for MidiQOL 
> *(as of v12.4.64)*

This page provides information on when, where, and why a pass is called. Check the [Workflow Fields](workflowfields.md) page to see what fields are available in each pass.

<!-- the links here in optional and damagebonus really need to be replaced with something that won't possibly break, like a dedicated .md or a wiki on gitlab pages -->
The chart is arranged by `args[0].tag`, which holds a string representing a category of macro passes:
- `OnUse` contains passes that run on the client rolling the item.
- `TargetOnUse` contains passes that run on the client being targeted, if any.
- `optional` passes are a special case called only when a macro is specified in a `flags.midi-qol.optional.NAME.*` flag ([see here](https://gitlab.com/tposney/midi-qol#optional-bonus-effects:~:text=ItemMacro.%3CitemUUID%3E,implementation%20as%20above.)). These are called on whichever client will benefit from the bonus.
- `DamageBonus` is a tag with one pass called if one or more macros are specified in the "*Damage Bonus Macro*" field in the special traits on a character sheet, or set by an effect using flag `flags.dnd5e.DamageBonusMacro` ([see here](https://gitlab.com/tposney/midi-qol#optional-bonus-effects:~:text=your%20custom%20roll.-,Damage%20bonus%20macros,-are%20called%20after)). These are called on the client rolling the damage.

<!-- provide a page detailing sockets? -->
>>> [!note] 
If your macro makes changes to a document when the calling client may not have permission, you will need to use sockets. Utilities are available in `MidiQOL.socket()`.
>>>
```mermaid
---
config:
  themeVariables:
    fontSize: '20px'
---

flowchart TD
  subgraph target["args[0].tag = 'TargetOnUse'"]
    isTargeted
    isPreAttacked
    isAttacked
    isHit
    isMissed
    isAboutToSave --> preTargetSave
      preTargetSave -- Has Optional Macro --> optSave
      optSave -- Success --> isSaveSuccess
      optSave -- Fail --> isSaveFailure

    %% extra note included here because connecting these nodes as normal clutters this part of the chart
    isAboutToSave ~~~ a["`preTargetSave -> success/fail if no optional`"]:::edgeLabel
    isSaveSuccess --> isSave
    isSaveFailure --> isSave
    isSave
    preTargetDamageApplication
    isDamaged
    postTargetEffectApplication
  end

  subgraph optAttack["args[0].tag = 'optional'"]
    flags.midi-qol.optional.NAME.attack.*
  end
  subgraph optDamage["args[0].tag = 'optional'"]
    flags.midi-qol.optional.NAME.damage.*
  end
  subgraph optSave["args[0].tag = 'optional'"]
    %% invisible links here force verticality
    %% only an issue in gitlab - are they using an old version of mermaid?
    flags.midi-qol.optional.NAME.save.* ~~~ flags.midi-qol.optional.NAME.check.*
    flags.midi-qol.optional.NAME.check.* ~~~ flags.midi-qol.optional.NAME.skill.*
    flags.midi-qol.optional.NAME.skill.*
  end

  subgraph onuse["args[0].tag = 'OnUse'"]
    subgraph template[" "]
        preAwaitTemplate --> postAwaitTemplate
        postAwaitTemplate --> preTemplatePlaced
        preTemplatePlaced --> templatePlaced
        templatePlaced --> postTemplatePlaced
        postTemplatePlaced
    end

    subgraph attack[" "]
        preAttackRoll --> isPreAttacked
        isPreAttacked -- Has Optional Macro --> optAttack
      preAttackRollComplete --> isAttacked
        isAttacked --> preCheckHits
        preCheckHits -- Hit --> isHit
        preCheckHits -- Miss --> isMissed
        isHit --> postAttackRoll
        isMissed --> postAttackRoll
      postAttackRoll --> postAttackRollComplete
    end

    subgraph damage[" "]
      preDamageRoll --> preDamageRollConfig
      preConfirmRoll --> postConfirmRoll
      postConfirmRoll --> preDamageRollStarted
        preDamageRollStarted --> DamageBonus["
          DamageBonus
          <small>args[0].tag = 'DamageBonus'</small>
        "]
        DamageBonus --> postDamageRollStarted
      postDamageRollStarted --> preDamageRollComplete
      preDamageRollComplete --> postDamageRoll
      postDamageRoll --> postDamageRollComplete
      preDamageApplication
    end

    subgraph utility[" "]
      preWaitForUtilityRoll --> postWaitForUtilityRoll
      postWaitForUtilityRoll --> preUtilityRollComplete
      preUtilityRollComplete --> postUtilityRollComplete
    end

    direction TB

    preTargeting --> preItemRoll
    preItemRoll --> postNoAction
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
      flags.midi-qol.optional.NAME.attack.* --> postWaitForAttackRoll 
      isPreAttacked -- No Optional Macro --> postWaitForAttackRoll
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
      preSave -- Has Save --> isAboutToSave
      isSave --> postWaitForSaves
    preSave -- No Save --> postWaitForSaves
    postWaitForSaves --> preSavesComplete
    preSavesComplete --> postSave
    postSave --> postSavesComplete
    postSavesComplete --> 
      preAllRollsComplete -- Has Damage --> preTargetDamageApplication
      preTargetDamageApplication -- Was Hit / Failed Save / Saved for Half --> isDamaged
      preTargetDamageApplication -- Was Missed / Saved for 0 --> preDamageApplication 
      isDamaged --> preDamageApplication
      preDamageApplication --> postAllRollsComplete
    preAllRollsComplete -- No Damage --> postAllRollsComplete
    postAllRollsComplete --> preApplyDynamicEffects
    preApplyDynamicEffects --> preActiveEffects
      preActiveEffects --> postTargetEffectApplication
      postTargetEffectApplication --> postApplyDynamicEffects
    postApplyDynamicEffects --> preRollFinished
    preRollFinished --> postActiveEffects
    postActiveEffects --> postRollFinished
    postRollFinished --> preCleanup
    preCleanup --> postCleanup
    postCleanup --> preCompleted

    %% these keep TargetOnUse to the left
    pad:::hidden
    pad1:::hidden
    preCompleted ~~~ pad[" "]
    pad1[" "] ~~~~~~~~~~ pad
  end

  classDef node stroke-width:2px
  classDef hidden display:none
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

  %% color helper at https://www.learnui.design/tools/data-color-picker.html#single
  %% graphic design is my passion 😎
  ```

  > [!tip] [Jump to Top](#macro-passes-for-midiqol)