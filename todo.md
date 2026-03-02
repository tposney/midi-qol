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
