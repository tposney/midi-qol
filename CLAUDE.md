# Claude Code Session Notes for midi-qol

**Important**: Read this file at the start of each session to recover context and follow established conventions.

**When to update this file**: After fixing a non-obvious bug or making a design decision that:
- Required multiple attempts to get right
- Has implications for future development (e.g., "always use X, never use Y")
- Involves subtle interactions between systems (dnd5e + midi-qol + Foundry)

Document the **what** and **why** so the same mistake isn't repeated in future sessions.

## Project Context

midi-qol is a Foundry VTT module that enhances the dnd5e system with automated attack rolls, damage application, saving throws, and workflow management.

## Key Resources

### midi-qol Source Code
The midi-qol source code is at:
```
/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-13x/src
```
**IMPORTANT**: Do NOT search in `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol/src` - that is an obsolete v12 codebase. Always use `midi-qol-13x` for v13 development.

### dnd5e Codebase Reference
When working on midi-qol, you can examine the dnd5e system codebase at:
```
/home/timp/foundry-data/foundryv13/Data/systems/dnd5e
```
Use this to verify API methods and understand how dnd5e implements features. **Do not assume methods exist** - always verify against the actual codebase.

### Foundry VTT Source Code Reference
For Foundry VTT core API methods, search the local source code at:
```
/home/timp/foundryv13/resources/app/client-esm
/home/timp/foundryv13/resources/app/common
```
**Important**: Always use v13 API. Do NOT fetch from `foundryvtt.com/api/v12/` - only use v13 documentation or local source code.

### Third-Party Modules
Installed 3rd party modules (chris-premades, dae, times-up, etc.) are located at:
```
/home/timp/foundry-data/foundryv13/Data/modules
```
Use this directory to examine how other modules implement features or handle specific spells/effects.

### Related Module Source Code
The following modules have source code that can be edited:

**times-up-10x** (v13 effect duration management):
```
/home/timp/foundry-data/foundryalpha/Data/modulesrc/times-up-10x/src
```
Key files:
- `module/handleUpdates.ts` - Effect expiration logic, enchantment handling
- `module/settings.ts` - Effect queue, configuration
- `times-up.ts` - Main module entry point

**dae-10x** (v13 Dynamic Active Effects):
```
/home/timp/foundry-data/foundryalpha/Data/modulesrc/dae-10x/src/module
```
Key files:
- `dae.ts` - Main DAE logic, effect application, status reconciliation

### tidy5e-sheet Module
The tidy5e-sheet module source is at:
```
/home/timp/foundry-data/foundryv13/Data/modules/tidy5e-sheet
```

**Note**: The `tidy5e-sheet.js` file is minified Svelte output, but includes readable documentation. Use `tidy5e-sheet.js.map` for source mapping.

**Tidy5e API** (received via `Hooks.once('tidy5e-sheet.ready', (api) => {...})`):

Header Controls (add buttons to sheet headers):
- `api.registerActorHeaderControls({controls: [...]})` - all actor sheets
- `api.registerCharacterHeaderControls({controls: [...]})`
- `api.registerNpcHeaderControls({controls: [...]})`
- `api.registerGroupHeaderControls({controls: [...]})`
- `api.registerVehicleHeaderControls({controls: [...]})`
- `api.registerItemHeaderControls({controls: [...]})` - item sheets

Control object properties:
```javascript
{
  icon: 'fas fa-icon-name',
  label: 'Button Label',
  visible() { return this.document.isOwner; },  // optional
  async onClickAction(event) { /* handler */ },
  ownership: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER  // optional
}
```

Item Summary Commands (buttons in item expand view):
```javascript
api.config.itemSummary.registerCommands([
  {
    label: 'Roll',
    enabled: (params) => params.item.type === 'weapon',
    iconClass: 'fas fa-dice-d20',
    execute: (params) => { params.item.use(); }
  }
]);
```

Custom Content Registration:
- `api.registerCharacterContent(new api.models.HtmlContent({...}))`
- `api.registerNpcContent(...)`
- `api.registerItemContent(...)`
- Similar methods for Group, Vehicle

Custom Tab Registration:
- `api.registerCharacterTab(new api.models.HandlebarsTab({...}))`
- `api.registerItemTab(new api.models.HtmlTab({...}))`
- Constants: `api.constants.TAB_ID_CHARACTER_INVENTORY`, etc.

Other config APIs:
- `api.config.actorItem.registerSectionFooterCommands([...])`
- `api.config.actorPortrait.registerMenuCommands([...])`
- `api.config.actorTraits.registerActorTraits([...])`
- `api.config.actionList.mapActivationTypesToSections({...})`

Hooks provided by tidy5e:
- `tidy5e-sheet.ready` - API is available
- `tidy5e-sheet.getActivitiesForPlay` - filter activities shown in play mode

**Current midi-qol integration** (in Hooks.ts):
1. Uses `api.config.itemSummary.registerCommands()` to add Roll, Attack, Damage buttons
2. Uses `api.registerItemHeaderControls()` to add Midi-QOL on-use macros config button
3. Uses `tidy5e-sheet.getActivitiesForPlay` hook to filter automationOnly and rider activities

### External Documentation
- **Chris-Premades API**: `/home/timp/Documents/ChrisPremades-API-2026-01-06.md` - Comprehensive documentation of the chris-premades module API (classes, utilities, macros, constants)
- **Chris-Premades GitHub**: `https://github.com/chrisk123999/chris-premades` (branch: master) - Source code for chris-premades module
- **Note**: "CPR" and "Cauldron of Plentiful Resources" both refer to the chris-premades module

## User Instructions

### Git Operations (midi-qol-13x and midi-qol-tests)
- **Do not automatically commit or push changes** to midi-qol-13x or midi-qol-tests
- The user wants to review diffs before committing and pushing to GitLab
- Make file changes but leave git operations to the user
- **NEVER run `git checkout` without explicit user approval** - this can destroy uncommitted work that took days to create

### Transient Debug Statements
- **Always use `console.error()` for transient debug statements** - NOT `log()`, `warn()`, or other midi logging functions
- **Never wrap transient debug statements in `if (debugEnabled)`** - they should always execute
- These are temporary debugging aids meant to be removed after the issue is resolved
- `console.error()` ensures visibility in the browser console without needing to change midi-qol debug settings

### Module Imports
- **Always import midi-qol functions directly** using ES module imports, NOT via `globalThis.MidiQOL`
- Example: `import { doSyncRoll } from "../utils.js";` instead of `globalThis.MidiQOL.doSyncRoll(...)`
- `globalThis.MidiQOL` access is only appropriate in the **test suite** (midi-qol-tests) where direct imports aren't available
- This ensures proper bundling and avoids runtime lookup issues

### Documentation Files
- **Always include a datestamp in the filename** when creating documentation files
- Format: `DocumentName-YYYY-MM-DD.md` (e.g., `ChatLog-2026-01-06.md`)
- This applies to files in the `docs/` directory and any other documentation created

### Changelog Separation
- **Test changes go in midi-qol-tests CHANGELOG.md only**, not in midi-qol's Changelog.md
- midi-qol's Changelog.md documents changes to midi-qol itself (features, fixes, API changes)
- midi-qol-tests has its own CHANGELOG.md at `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-tests/CHANGELOG.md`

### Related Modules
- **chatlog-prune**: Standalone chat log pruning module at `/home/timp/foundry-data/foundryalpha/Data/modulesrc/chatlog-prune/`
- **Keep ChatLogPrune and ChatLogMidi in sync**: When modifying `src/module/ChatClasses/ChatLogMidi.ts`, also update `chatlog-prune/src/ChatLogPrune.ts` (and vice versa) unless the change would cause a loss of functionality in one module
- midi-qol's built-in chat log pruning is deprecated (since 13.0.37) and will be removed in v14 - users should install chatlog-prune instead
- **midi-qol-setup-wizard**: Step-by-step configuration wizard for midi-qol at `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-setup-wizard/`
  - Key files: `scripts/wizard.js` (main wizard UI), `scripts/wizard-steps.js` (step definitions and presets), `scripts/setting-definitions.js` (setting UI definitions), `scripts/module-definitions.js` (module lists for compatibility)
  - Launched via hook `Hooks.call("midi-qol-setup-wizard.launch")` from midi-qol's settings
- **item-delete-check**: Item deletion confirmation and inventory/resource change tracking module at `/home/timp/foundry-data/foundryalpha/Data/modules/item-delete-check/`
  - Single source file: `main.js` (plain JS, no build step)
  - Git repo on `master` branch
  - Tracks: item create/delete, quantity changes, uses/charges, currency, spell slots, HP, activity uses
  - Logs changes to chat and/or a journal entry

### TypeScript Typing
- **Avoid using `as any` casts or `: any` type annotations** - always check `globals.ts` and Foundry types (`fvtt-types`) first for existing types
- Before writing `as any` or `: any`, search globals.ts for types like `Activity`, `Workflow`, `Actor`, `Item`, etc.
- Also check if Foundry/dnd5e types exist (e.g., `TokenDocument`, `ChatMessage`, `ActiveEffect`)
- Adding properties to existing types in `globals.ts` is fine (e.g., new flag keys, new properties on existing interfaces)
- **Query the user before creating entirely new types** in `globals.ts`
- Common types defined in globals.ts: `Activity`, `ActivityUseConfiguration`, `RollProcessConfig`, `RollDialogConfig`, flag types for ChatMessage/Item/Actor
- For new flag keys, add them to the appropriate flag type definition in globals.ts (e.g., `"use.otherScaling"?: number | false;` in the midi-qol flags)
- **Prefer updating globals.ts hooks namespace over @ts-expect-error** - when adding new hook handlers, add the hook name to the `MidiHooks` interface in globals.ts rather than using `// @ts-expect-error` comments

### CSS Class Usage
- **Never invent CSS class names** - always verify classes exist in the actual templates/stylesheets before using them
- Search the codebase with `grep` to confirm a CSS class exists before writing selectors that depend on it
- This applies to tour selectors, querySelector calls, and any DOM manipulation

### Foundry Document Type Checking
- **Never compare `documentName` strings directly** to check document types
- Many document types have subclasses that inherit from base classes (e.g., various item types inherit from `Item`)
- **Wrong**: `doc.documentName === "Item"` or `doc.parent?.documentName === "Item"`
- **Correct**: `doc instanceof Item` or `doc.parent instanceof Item`
- This applies to all base document types: `Actor`, `Item`, `ActiveEffect`, `Scene`, `Token`, etc.

### External API Usage
- **Before writing any code that calls dnd5e or Foundry methods**, first search the midi-qol codebase to find existing usage of similar functionality
- Do not write the call first and verify later - search first, then write
- If a method is already being called in the midi-qol code tree, you can assume it has been verified and is correct
- If no existing usage is found, search the dnd5e system source at `/home/timp/foundry-data/foundryv13/Data/systems/dnd5e`
- Never imagine or assume that methods exist - always verify against actual source code
- **When the user questions whether a method exists, ALWAYS verify before responding** - do not make assumptions about Foundry/dnd5e class inheritance or method availability. Check the actual source code or find existing verified usage in the codebase. If you cannot verify, acknowledge uncertainty rather than guessing. (Standard JavaScript/TypeScript types like Map, Set, Array can be trusted without verification.)
- Example: `item.system.activities.getByIdentifier()` does not exist - the correct methods are:
  - `activities.get(id)` - get by activity ID
  - `activities.getByType(type)` - get activities by type (returns array)
  - `activities.find(predicate)` - find activity matching predicate
  - `activities.contents` - array of all activities

### Foundry ApplicationV2 Scrollable Pattern

**Never use raw `overflow-y: auto` CSS hacks for scrolling in ApplicationV2 apps.** Use Foundry's built-in pattern:

1. **Template**: Add `class="scrollable"` to the element that should scroll. This Foundry CSS class handles scrollbar gutter margins.
2. **CSS**: Set `flex: 1; min-height: 0;` on the element so it fills available space within the flex layout and allows shrinking below content size.
3. **PARTS**: Add `scrollable: [".selector"]` to the part definition — this preserves scroll position during re-renders. Use `""` (empty string) for the part root element.

Example (RollStatsDisplay):
```typescript
// PARTS definition
stats: {template: "...", scrollable: ["", ".midi-stats-card-body"]}
```
```html
<!-- Template -->
<section class="tab scrollable {{#if tab.active}}active{{/if}}" ...>
  <div class="midi-stats-card-body scrollable">
```
```css
/* CSS */
#midi-stats-stats-tab { flex: 1; min-height: 0; }
```

For resizable sections, add `resize: vertical; max-height: Npx;` to the CSS.

Reference: Foundry's `.scrollable` class is defined in `foundry2.css` and sets `--scroll-margin`, `margin-right`, `padding-right` for proper scrollbar spacing. The actual scroll behavior comes from the flex layout constraint (`min-height: 0` allows flex items to shrink below content size, triggering overflow).

### SRD Reference Data
- Extracted SRD item/spell data is at `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-13x/SRD/`
  - Folders with a `24` suffix (e.g., `equipment24/`, `spells24/`, `classes24/`) contain **modern (2024 / SRD 5.2)** rules data
  - Folders without the suffix (e.g., `items/`, `spells/`, `classes/`) contain **legacy (2014)** rules data
- **Always check the `24` folder first** if one exists — we target the modern ruleset. Only fall back to the non-24 folder if there is no 24 equivalent
- **Always check the SRD folder first** when creating or verifying sample items — it contains the canonical dnd5e data including activity configurations, damage types, and save DCs
- **SRD filenames use mixed case** (e.g., `Power_Word_Kill_phbsplPowerWordK.json`) — when searching with Glob, use case-insensitive patterns or use Grep instead to avoid missing files

### Sample Item Spell Icons
- **Always use the icon from the dnd5e SRD compendium** when creating sample item spells
- SRD spell source data is at `/home/timp/foundry-data/foundryv13/Data/systems/dnd5e/packs/_source/spells/`
- Do not invent icon paths — verify they exist at `/home/timp/foundryv13/resources/app/public/icons/`
- The SRD icons are the canonical choices and ensure consistency with the base system

## Significant Decisions

### Sample Item / Activity Conventions

1. **Activity effects `onSave` field is counter-intuitive**
   - In the activity `effects` array, each entry has `{ "_id": "effectId", "onSave": bool }`
   - `onSave: false` (default) — only apply the effect when the target **fails** the save
   - `onSave: true` — **always** apply the effect, regardless of save result (i.e. apply even on a successful save)
   - The name `onSave` does NOT mean "only apply if saved" — it means "also apply on save"

2. **Foundry document IDs must be exactly 16 characters**
   - Effect IDs, item IDs, activity IDs — all must be 16 chars
   - Example: `befuddledEffct0` (15 chars) silently fails; `befuddledEffect0` (16 chars) works

### 13.0.38 Changes

1. **Macro calling refactor - callMacro split into helper methods**
   - Refactored the 160+ line `callMacro` method in Workflow.ts into focused helper methods
   - New interfaces added to Workflow.ts:
     - `ResolvedMacro` - Result of macro resolution (macro, macroData, item, activity, sourceItemUuid)
     - `CallMacroContext` - Context for macro call (name, uuid, macroItem, macroActivity, actorToUse)
   - New private helper methods in Workflow class:
     - `parseCallMacroContext()` - Parses macro name and extracts context (actor, item, activity)
     - `resolveFunctionMacro()` - Handles `function.` prefixed macros
     - `resolveItemMacroCall()` - Resolves ItemMacro using helper + DAE fallback
     - `resolveActivityMacroCall()` - Resolves ActivityMacro using helper
     - `resolveWorldMacro()` - Resolves world/compendium macros by name or UUID
     - `executeMacroWithScope()` - Creates Macro instance from data and executes with proper scope
   - Main `callMacro` now has clear 3-phase structure: context parsing, macro resolution, execution

2. **New macro resolution helpers in utils.ts**
   - `resolveItemMacro(macroSpec, context)` - Resolves "ItemMacro", "ItemMacro.name", "ItemMacro.uuid"
     - Returns `{ item, macroData }` or undefined
     - Searches: originItem → actor items by UUID → actor items by name (with macro)
   - `resolveActivityMacro(macroSpec, context)` - Resolves "ActivityMacro", "ActivityMacro.uuid", "ActivityMacro-id"
     - Returns `{ item, activity, macro }` or undefined
     - Searches: originActivity → item activities by UUID/name/identifier
   - `resolveDAEItemData(actor, uuid)` - Extracts DAE itemData from actor effects
     - Used as fallback when origin item is deleted but effect has stored itemData
     - Searches actor.effects for matching `flags.dae.itemData._id`

3. **DAE fallback added to Hooks.ts executeMacroSpec**
   - Added `resolveDAEItemData` fallback to ItemMacro resolution in replacement effect handling
   - If `resolveItemMacro` fails and effect has origin, searches DAE itemData for macro

4. **Macro tests merged into group 4**
   - Macro resolution helper tests merged from group 34 into group 4 (04-onuse-macro-tests.ts)
   - Group 4 renamed from "OnUse Macro Tests" to "Macro Tests"
   - Tests 4.3-4.17 cover: resolveItemMacro, resolveActivityMacro, workflow integration, macroData passing

### 13.0.36 Changes

1. **Vitality damage and healing types**
   - Added "vitality" as both a damage type and healing type in `midi-qol.ts`:
     - `GameSystemConfig.damageTypes["vitality"]` - for vitality damage
     - `GameSystemConfig.healingTypes["vitality"]` - for vitality healing
   - Modified `calculateDamageAmounts()` in GMAction.ts to extract vitality damage separately
   - Vitality damage directly increases `uses.spent` on vitality item, bypassing HP/TempHP entirely
   - Vitality healing directly decreases `uses.spent`, without affecting HP
   - If actor has no vitality item configured, vitality damage/healing is a no-op
   - Can be combined with regular damage types - each is applied separately
   - Created `icons/vitality.svg` - dark heart with white lightning crack
   - Added localization strings: `midi-qol.vitalityDamage`, `midi-qol.vitalityHealing`

### 13.0.35 Changes

1. **grants.fumble and grants.noFumble flags**
   - Added `flags.midi-qol.grants.fumble.all` and `flags.midi-qol.grants.fumble.{attackType}` to force fumbles on attacks against a target
   - Added `flags.midi-qol.grants.noFumble.all` and `flags.midi-qol.grants.noFumble.{attackType}` to prevent fumbles on attacks against a target
   - Follows the same pattern as `grants.critical` and `grants.noCritical`
   - Processed in `processAttackRoll()` in Workflow.ts

2. **Vitality death status - MUST use CONFIG.statusEffects, NOT getDeadStatus()**
   - When vitality reaches 0, always apply the "dead" status regardless of midi settings
   - **WRONG**: `getDeadStatus()` - returns status based on `configSettings.midiDeadCondition`, may return unconscious or other status
   - **CORRECT**: `CONFIG.statusEffects.find(se => se.id === "dead")` - always returns the actual dead status
   - The `setDeadStatus` function removes conflicting statuses (unconscious, incapacitated, prone) before applying dead
   - This prevents "already exists" errors since dnd5e's dead status has these as riders
   - Race conditions in concurrent toggleStatusEffect calls were fixed by:
     - Adding `midiVitalityUpdatePending` flag to damage options
     - Having updateActor hook skip checkWounded when this flag is set
     - Only updateItem hook calls checkWounded for vitality actors

2. **options.midi is set for ALL damage, not just midi workflows**
   - The `dnd5e.preCalculateDamage` hook unconditionally sets `options.midi.totalDamage` for ALL damage calculations
   - This means checking `!options.midi` to detect "non-midi damage" doesn't work
   - **Key insight**: midi-qol uses `actor.update()` directly in GMAction.ts, NOT `actor.applyDamage()`
   - Therefore, the `dnd5e.preApplyDamage` hook only fires for non-midi damage (character sheet, token HUD, etc.)
   - The vitality handling in `preApplyDamage` should NOT check `!options.midi` - it should always run

3. **Damage card multiplier preview**
   - Added real-time preview when changing multiplier dropdown
   - "=" (calc) option as default - uses original calculated damage with saves/resistances
   - Other multipliers (1, ½, 2, ¼, +) recalculate damage ignoring saves
   - Uses `actor.calculateDamage()` for preview without applying

4. **Fixed "=" case apply button**
   - Changed from `actor.applyDamage()` with options to directly setting stored HP values
   - Now uses `actor.update()` with `newHP` and `newTempHP` from stored damage data
   - Matches how reverse button works with `oldHP`/`oldTempHP`

5. **Damage card display updates after apply/reverse**
   - Added `updateDamageDisplay()` helper function in `processUndoDamageCard`
   - After apply: display shows what reverse would do (transition back to oldHP)
   - After reverse: display shows what apply would do (transition to newHP)
   - Shows (0) when current HP equals target HP

6. **Multiplier resets to "=" after operations**
   - Both apply and reverse buttons reset the dropdown to "calc" after execution

7. **Token image interactions on damage card**
   - Click: select token (`token.control()`)
   - Right-click (contextmenu): open actor sheet

8. **Template IDs for dynamic updates**
   - Added IDs to damage display elements: `dmg-total-`, `dmg-temp-`, `dmg-hp-`, `dmg-nochange-`, `dmg-vitality-`
   - Added span classes `.dmg-temp-old`, `.dmg-temp-new`, `.dmg-hp-old`, `.dmg-hp-new` for updating values

9. **Vitality config fix**
   - Fixed `rules.hbs` binding from `vitalityResource` to `vitalityItem`
   - Updated hint in `en.json` with example identifier format

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

### Test Writing Requirements

**CRITICAL: Never remove tests without explicit user consent.** When renumbering, refactoring, or reorganizing tests, preserve all existing tests. Only the user can authorize test removal.

**New test batches must follow the naming convention:**
- Batch ID: `quench.midi-qol.{camelCaseName}` (no number in the ID)
- displayName: `"{number}. {Title} Tests"` (e.g., `"28. Optional Bonus Flags Tests"`)
- Do NOT include "Midi" or "midi-qol" in displayName (exception: `flags.midi-qol` references are OK)
- Use `globalThis.quench.registerBatch(` (not just `quench.registerBatch`)
- Export function: `register{Number}{PascalCaseName}Tests` (e.g., `register28OptionalBonusTests`)

**Every test must start with `await testMessage()`:**
```typescript
it("6.1 overtime run and removed on combat update", async function () {
  await testMessage("6.1", "test overtime effect run and removed on combat update");
  this.timeout(20000);
  // ... rest of test
});
```

The `testMessage()` function logs the test name and description to the console and chat for visibility. Always call it as the first line of every test before `this.timeout()`.

### Quench Test World

Pre-configured world for running midi-qol automated tests.

**Live world location:**
```
/home/timp/foundry-data/foundryv13/Data/worlds/quench-test
```
- This is the actual world you run tests in
- Contains test actors, items, token placements, and world settings
- Has its own git repo connected to `git@gitlab.com:tposney/quench-test-world.git`
- **Note**: Foundry overwrites some world.json fields when played

**Distributable package project:**
```
/home/timp/foundry-data/foundryalpha/Data/modulesrc/quench-test-install
```
- GitLab: https://gitlab.com/tposney/quench-test-install
- Builds a distributable world package from the live quench-test world
- Generates proper `world.json` with installable fields (manifest, download URLs)
- Creates zip file for releases

**Building and releasing quench-test-install:**
```bash
cd /home/timp/foundry-data/foundryalpha/Data/modulesrc/quench-test-install

# 1. Update version in package.json
# 2. Build the distribution
node build.js

# 3. Release (commits, tags, pushes, creates GitLab release with zip)
node build.js release
```

The release command reads version from `package.json` and automates:
- Git commit and tag creation
- Push to GitLab
- Create GitLab release with zip file attached (requires `glab` CLI)

**Manifest URL for installation:**
```
https://gitlab.com/tposney/quench-test-install/-/raw/main/dist/quench-test/world.json
```

Key test actors (must exist in test world):
- `actor1Name` ("actor1") - Primary test actor
- `actor2Name` ("actor2") - Secondary test actor (used for flanking tests)
- `target1Name` ("Orc1"), `target2Name` ("Orc2"), `target3Name` ("Skeleton1") - Test targets

**Target distances**: `target1Name` (Orc1) is 20 feet away from actor1. Use `target2Name` (Orc2) for short-range weapon tests (5ft range weapons like Longsword).

**Vitality system testing notes**:
- Actor needs BOTH vitality > 0 AND HP > 0 to be alive
- To revive an actor, restore vitality FIRST (so HP update doesn't see vitality=0), then restore HP
- Status cleanup: Always clean up prone/dead/defeated in finally blocks (prone is added as rider of dead but not removed when dead is removed)

**dnd5e activity cloning behavior** (important for tests that modify activity properties):
- When `activity.use()` is called, dnd5e clones the item: `let item = this.item.clone({}, { keepId: true })`
- The `this.item` reference in an activity points to the activity's stored item, NOT the updated database version
- After calling `item.update()` to modify activity properties (like `fumbleThreshold`), you MUST get a fresh item reference via `fromUuid(item.uuid)` before calling `completeItemUse()` or `activity.use()`
- The test helpers `completeItemUseNoFumble()` and `completeActivityUseNoFumble()` handle this automatically

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

## Planned Refactors

### Advantage Refactor

**Goal**: Migrate attack advantage/disadvantage processing in `checkAttackAdvantage()` and `checkTargetAdvantage()` (Workflow.ts:3581-4020) to use the centralized `computeAdvantageFlags()` pattern from patching.ts.

**Current State**: ~15 separate `evalAllConditionsAsync`/`evalCondition` calls checking:
- Actor flags: `advantage/disadvantage.all`, `.attack.all`, `.attack.{actType}`, `.attack.{ability}`
- Actor suppression: `noAdvantage/noDisadvantage.attack.all`, `.attack.{actType}`
- Target grants: `grants.advantage/disadvantage.all`, `.attack.all`, `.attack.{actType}`
- Target suppression: `grants.noAdvantage/noDisadvantage.attack.all`, `.attack.{actType}`

**Proposed Solution**:
1. Create `buildAttackAdvantageFlags(actType, abilityId)` that returns an `AdvantageFlags` config
2. Call `computeAdvantageFlags(actor, flags, { sourceActor: target })` - target is "source" because it grants adv/dis
3. Keep special rules separate (flanking, visibility, nearby foe, heavy weapon) - these are geometric/rule-based, not flag-based
4. Extend `computeAdvantageFlags` to return attribution info for the attack card display

**Benefits**:
- Single source of truth for flag processing
- Consistent advantage counting and suppression logic
- ~180 lines reduced to ~20 lines
- Same pattern as saves, death saves, ability checks

**Files to modify**:
- `patching.ts`: Export `computeAdvantageFlags`, add attribution tracking to return value
- `Workflow.ts`: Refactor `checkAttackAdvantage()`, remove flag-based logic from `checkTargetAdvantage()`
