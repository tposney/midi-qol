# Claude Code Session Notes for midi-qol

**Important**: Read this file at the start of each session to recover context and follow established conventions.

## Project Context

midi-qol is a Foundry VTT module that enhances the dnd5e system with automated attack rolls, damage application, saving throws, and workflow management.

## Key Resources

### dnd5e Codebase Reference
When working on midi-qol, you can examine the dnd5e system codebase at:
```
/home/timp/foundry-data/foundryv13/Data/systems/dnd5e
```
Use this to verify API methods and understand how dnd5e implements features. **Do not assume methods exist** - always verify against the actual codebase.

## User Instructions

### Git Operations
- **Never auto-push or auto-commit changes** - always wait for the user to review and approve before committing or pushing
- The user will handle git operations manually when ready

### External API Usage
- **Before writing any code that calls dnd5e or Foundry methods**, first search the midi-qol codebase to find existing usage of similar functionality
- Do not write the call first and verify later - search first, then write
- If a method is already being called in the midi-qol code tree, you can assume it has been verified and is correct
- If no existing usage is found, search the dnd5e system source at `/home/timp/foundry-data/foundryv13/Data/systems/dnd5e`
- Never imagine or assume that methods exist - always verify against actual source code
- Example: `item.system.activities.getByIdentifier()` does not exist - the correct methods are:
  - `activities.get(id)` - get by activity ID
  - `activities.getByType(type)` - get activities by type (returns array)
  - `activities.find(predicate)` - find activity matching predicate
  - `activities.contents` - array of all activities

## Significant Decisions

### 13.0.34 Changes

1. **TrapWorkflow infinite loop fix**
   - Added `context.attackRoll` check in `WorkflowState_WaitForAttackRoll` to detect when resuming after attack completion
   - Without this check, the method would keep calling `rollAttack()` on resume instead of transitioning to `AttackRollComplete`

2. **TrapWorkflow target sync**
   - Added `targetsPassedToConstructor` flag to TrapWorkflow class
   - Constructor now syncs `game.user.targets` from targets passed to constructor for non-AoE activities

3. **D20Roll.buildPost fix**
   - TrapWorkflow no longer passes `shiftOnlyEvent` to `rollAttack` as it lacks the `target` property that `D20Roll.buildPost` expects

4. **Workflow.ts split into multiple files**
   - Created `src/module/Workflow/` directory with separate files for each workflow subclass
   - Files: types.ts, constants.ts, helpers.ts, SavesFirstWorkflow.ts, ActiveDefenceWorkflow.ts, UserWorkflow.ts, DamageOnlyWorkflow.ts, TrapWorkflow.ts, DDBGameLogWorkflow.ts, DummyWorkflow.ts, WorkflowRegistry.ts, index.ts, BaseWorkflow.ts
   - Original Workflow.ts reduced from 8,434 to 7,465 lines
   - All existing imports continue to work via re-exports for backwards compatibility

5. **skipConcentrationCheck refactor**
   - Changed from actor flags to module-level `Set<string>` for tracking actors that should skip concentration checks
   - Added `skipConcentrationActorUuids` Set in patching.ts
   - `challengeConcentration` now uses `Set.delete()` which returns true if uuid was present (check + remove in one operation)
   - Avoids database writes - faster and no orphaned flags if interrupted
   - Removed `skipConcentrationCheck` from Actor flag type definitions in globals.ts

6. **MidiDependentsRegistry - Dependent document tracking**
   - New file: `src/module/MidiDependentsRegistry.ts`
   - dnd5e's `DependentsRegistry` only supports ActiveEffect as parent type
   - Implemented hybrid approach: use `dnd5e.dependentOn` flag on all dependents, but use `MidiDependentsRegistry` for non-ActiveEffect parents
   - Parent types handled by midi-qol: Actor, Item, Token, MeasuredTemplate, AmbientLight
   - Parent types handled by dnd5e: ActiveEffect
   - Dependent types supported by dnd5e: Actor, Item, ActiveEffect, Activity
   - Dependent types added by midi-qol: Token, MeasuredTemplate, AmbientLight
   - Delete hooks added for: deleteActor, deleteItem, deleteAmbientLight, deleteToken (deleteMeasuredTemplate already existed)
   - `MidiDependentDocumentMixin` applied to document classes in patching.ts
   - `MidiQOL.addDependent(parent, dependent)` helper or set `flags.dnd5e.dependentOn` directly
   - Simplified `checkDeleteTemplate` to use `dnd5e.dependentOn` instead of old `dnd5e.dependents` array

### 13.0.33 Changes

1. **Removed minor-qol backwards compatibility**
   - `MinorQOL.doRoll`, `MinorQOL.applyTokenDamage`, and `"minor-qol.RollComplete"` hook are no longer supported
   - This is a breaking change documented in Changelog.md

2. **activity.use() is the primary workflow trigger**
   - MACROS.md updated to document `activity.use()` as the recommended way to trigger midi-qol workflows
   - `MidiQOL.completeActivityUse()` is available for programmatic workflow execution
   - `MidiQOL.completeItemUse()` is a convenience wrapper

3. **Flanking fix**
   - Fixed flanking advantage not being applied when `checkFlanking` is set to "advonly"
   - Added flanking tests

4. **OverTime effects documentation**
   - README.md updated with OverTime parameter tables and examples
   - Added 10 new OverTime tests in midi-qol-tests module

5. **saveResults initialization fix**
   - Added `this.initSaveResults()` before early return in `WorkflowState_WaitForSaves` to ensure saveResults is always initialized

6. **esbuild bundler migration**
   - Replaced multi-file gulp-typescript output with single bundled `midi-qol.js` using esbuild
   - Build is significantly faster (~100ms vs multi-second)
   - TypeScript type checking runs separately via `tsc --noEmit` before esbuild bundle
   - Source maps fixed to show original TypeScript file structure in browser DevTools

7. **WorkflowRegistry pattern**
   - Replaced `eval(className)` dynamic class lookup with `WorkflowRegistry` object
   - Avoids bundler warnings about eval() usage
   - Registry defined at end of Workflow.ts with all workflow subclasses

8. **Flanked tests (separate from flanking)**
   - Added 4 tests for `midiFlanked` status behavior in midi-qol-tests module
   - Flanking and Flanked are mutually exclusive settings - tests should not overlap

9. **MACROS.md documentation audit and update**
   - Updated midiOptions documentation with full list of options from `MidiOptions` type (utils.ts:1708-1758)
   - Added WorkflowOptions documentation (Workflow.ts:8226-8272)
   - Fixed Hooks Reference - removed non-existent hooks (preambleComplete, preDamageRollComplete), added correct ones (preTargeting, hitsChecked, DamageRollComplete, preFormulaRoll)
   - Updated Macro Passes with complete list from settings.ts:954-983, including workflow state passes
   - Expanded Macro Data Reference (args[0]) with all fields from getMacroData (Workflow.ts:4002-4124)
   - Fixed completeItemUse documentation with correct parameters and chooseActivity option
   - Corrected getByIdentifier example to use activities.find()

## Key Source Files for API Verification

- `src/module/utils.ts` - MidiOptions type (lines 1708-1758), completeActivityUse, completeItemUse
- `src/module/Workflow.ts` - WorkflowOptions type (lines 8226-8272), getMacroData (lines 4002-4124)
- `src/module/settings.ts` - onUseMacroOptions (lines 954-983) - list of macro passes
- `src/globals.ts` - Hook type declarations (lines 65-78)

## File Structure Notes

- `src/module/Workflow.ts` - Main workflow state machine
- `MACROS.md` - Macro API documentation
- `README.md` - Main documentation with OverTime and Midi Properties sections
- `Changelog.md` - Version history

## Testing

The project uses the Quench testing framework for Foundry VTT. Tests are in a separate `midi-qol-tests` module:

- Location: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-tests/`
- Requires: `midi-qol`, `quench`
- Build: `cd midi-qol-tests && npm run build`

The module accesses midi-qol via `globalThis.MidiQOL` and registers Quench test batches.

Key test actors (must exist in test world):
- `actor1Name` ("actor1") - Primary test actor
- `actor2Name` ("actor2") - Secondary test actor (used for flanking tests)
- `target1Name` ("Orc1"), `target2Name` ("Orc2"), `target3Name` ("Skeleton1") - Test targets

**Target distances**: `target1Name` (Orc1) is 20 feet away from actor1. Use `target2Name` (Orc2) for short-range weapon tests (5ft range weapons like Longsword).

## Build Commands

**midi-qol (uses esbuild bundler):**
```bash
npm run build      # Production build - runs typeCheck then esbuild
npm run devbuild   # Development build - outputs to devDir specified in package.json
npx gulp devWatch  # Watch mode for development
```

Build process:
1. TypeScript type checking via `tsc --noEmit`
2. esbuild bundles all TypeScript into single `midi-qol.js`
3. Source maps normalized to show `src/module/...` paths in browser DevTools

**midi-qol-tests:**
```bash
cd /home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-tests
npm run build      # Build test module
```
