# Midi-QOL TODO

## Settings Consistency: allowUseMacro vs allowActorUseMacro

These two settings have inconsistent behavior and should be made more consistent:

### Current Behavior

1. **`allowUseMacro`** - Controls whether on-use macros are executed during workflow processing:
   - When `true`: Item and actor on-use macros are collected and executed at various workflow points:
     - `preItemRoll`, `postRoll`, `preAttackRoll`, `postAttackRoll`
     - `preDamageRoll`, `postDamageRoll`, `preSave`, `postSave`
     - `preTargetDamageApplication`, `postTargetEffectApplication`
     - Target macros: `isTargeted`, `isAttacked`, `isHit`, `isMissed`, `isDamaged`, `isSave`, etc.
   - When `false`: All `triggerTargetMacros()` and `callMacros()` calls in the workflow are skipped

2. **`allowActorUseMacro`** - Controls whether the "Actor On Use Macros" header button appears on actor sheets:
   - When `true`: A gear icon button appears in actor sheet headers allowing configuration of actor-level on-use macros
   - When `false`: The button is hidden

### Inconsistencies

- `allowUseMacro` controls **execution** of macros (both item and actor)
- `allowActorUseMacro` controls **UI visibility** of actor macro configuration
- The item on-use macros config button always appears (controlled separately by `midiPropertiesTabRole`)
- There is no `allowItemUseMacro` setting to control item macro config UI visibility

### Suggested Improvements

- Consider renaming or restructuring these settings to be clearer:
  - One setting for macro execution (or separate settings for item vs actor macro execution)
  - Consistent UI visibility controls for both item and actor macro configuration
- Document the relationship between these settings more clearly

---

## Flags Help Text in en.json

The flags help text handling in `lang/en.json` has too much duplication and very similar fields. This makes it difficult to maintain and increases the chance of inconsistencies.

### Current Issues

- Many flag descriptions are nearly identical with only minor variations
- Similar fields repeated across different contexts
- Large blocks of repetitive text that are hard to maintain

### Suggested Improvements

- Investigate ways to reduce duplication:
  - Use templating or string interpolation where possible
  - Extract common phrases into reusable strings
  - Consider a more structured approach to flag documentation
- Review all flags help text for opportunities to consolidate
- Make the help text more manageable and easier to update consistently
- Need to include module-added skills/abilities (e.g., from modules that add custom skills or ability scores) in the help text generation

---

## DAE Field Evaluation for Enchantments

DAE currently applies field evaluation (e.g., `@abilities.str.mod`, roll data references) for effects on actors, but this doesn't work for enchantments.

### Current Behavior

- Actor effects: DAE evaluates field references in effect values
- Enchantments: Field evaluation is not applied

### Suggested Improvement

- Extend DAE's field evaluation logic to also apply to enchantments
- This would allow enchantment effects to use dynamic references like actor effects do

---

## Advantage Attribution for Saving Throws

Investigate adding advantage attribution to saving throws, similar to how attack rolls can show why advantage/disadvantage was granted.

### Current State

- Attack rolls can display advantage attribution (showing sources of advantage/disadvantage)
- Saving throws do not have this feature

### Investigation Needed

- Investigate if there is a way to add advantage attribution directly to the d20 roll itself
- Determine what sources can grant advantage/disadvantage on saves (e.g., effects, conditions, spells, features)
- Find a way to track and collect these sources during save rolls
- Design a UI/display method to show the attribution to users (chat card, tooltip, etc.)
- Consider consistency with existing attack roll advantage attribution display

---

## Auto-completion for Midi Functions in Macro Editor

Investigate adding auto-completion support for midi-qol functions in the Foundry macro editor.

### Goal

- Provide auto-completion suggestions for `MidiQOL.*` functions when writing macros
- Help users discover available midi-qol API functions and their signatures

### Investigation Needed

- Research how Foundry's macro editor handles code completion (likely uses CodeMirror or Ace)
- Determine if there's a way to register custom completions or type definitions
- Look at how other modules might have implemented similar functionality
- Consider what functions/methods should be included in the completion list
- Explore providing parameter hints and documentation in the completions
