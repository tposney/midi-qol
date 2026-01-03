# Changes Made by Claude

This document records all changes made by Claude to the midi-qol-13x codebase.

---

## 2026-01-03: MidiDependentsRegistry - Dependent Document Tracking

### Files Modified
- `src/module/MidiDependentsRegistry.ts` (new file)
- `src/module/Hooks.ts`
- `src/module/patching.ts`
- `src/module/utils.ts`
- `src/midi-qol.ts`
- `src/globals.ts`

### Problem
dnd5e's built-in `DependentsRegistry` only supports ActiveEffect as a parent type. When trying to use Actor, Item, Token, MeasuredTemplate, or AmbientLight as parents, `dnd5e.registry.dependents.get()` fails with "cannot read properties of null (reading 'pack')" because it assumes the parent is an ActiveEffect.

### Solution
Implemented a hybrid approach:
1. Use the unified `dnd5e.dependentOn` flag on all dependent documents (user-friendly - one flag to know)
2. Use `MidiDependentsRegistry` for tracking/retrieval when parent is Actor, Item, Token, MeasuredTemplate, or AmbientLight
3. Let dnd5e's built-in system handle ActiveEffect parents

### Implementation

**MidiDependentsRegistry.ts:**
```typescript
export class MidiDependentsRegistry {
  static #dependents = new Map<string, Set<string>>();

  static get(document: foundry.abstract.Document.Any | string): foundry.abstract.Document.Any[] {
    const uuid = typeof document === "string" ? document : document?.uuid;
    if (!uuid) return [];
    return Array.from(this.#dependents.get(uuid) ?? [])
      .map(depUuid => fromUuidSync(depUuid, { strict: false }))
      .filter((d): d is foundry.abstract.Document.Any => !!d);
  }

  static track(parentUuid: string, dependent: foundry.abstract.Document.Any) { ... }
  static untrack(parentUuid: string, dependent: foundry.abstract.Document.Any) { ... }
  static async deleteDependents(parentUuid: string): Promise<void> { ... }
  static clear() { ... }
}

export function MidiDependentDocumentMixin<T extends new (...args: any[]) => any>(Base: T) {
  // Reads dnd5e.dependentOn flag and tracks in MidiDependentsRegistry
  // via prepareData() and _onDelete()
}
```

**Hooks.ts - Delete hooks for cascade deletion:**
```typescript
Hooks.on("deleteActor", (deletedActor, options, user) => {
  if (!preferredActiveGM()?.isSelf || options.undo) return;
  MidiDependentsRegistry.deleteDependents(deletedActor.uuid);
});
// Similar hooks for deleteItem, deleteAmbientLight, deleteToken
```

**patching.ts - Apply mixin to document classes:**
```typescript
class MidiMeasuredTemplateDocument extends MidiDependentDocumentMixin(
  globalThis.dnd5e.documents.mixins.DependentDocumentMixin(CONFIG.MeasuredTemplate.documentClass)
) {};
// Similar for Token, AmbientLight, ActiveEffect, Item, Actor
```

**utils.ts - addDependent helper:**
```typescript
export async function addDependent(parent, dependent) {
  if (!parent?.uuid || !dependent?.setFlag) return;
  await dependent.setFlag("dnd5e", "dependentOn", parent.uuid);
}
```

### Parent/Dependent Support

| Parent Type | Handler |
|-------------|---------|
| ActiveEffect | dnd5e built-in |
| Actor, Item, Token, MeasuredTemplate, AmbientLight | MidiDependentsRegistry |

| Dependent Type | Source |
|----------------|--------|
| Actor, Item, ActiveEffect, Activity | dnd5e built-in |
| Token, MeasuredTemplate, AmbientLight | Added by midi-qol |

### Benefits
1. Users only need to know one flag: `dnd5e.dependentOn` - also a potential disadvantage since it might collide with future dnd5e changes.
2. Supports all common document types as parents (not just ActiveEffect)
3. Integrates cleanly with dnd5e's existing system

---

## 2026-01-03: skipConcentrationCheck Refactor

### Files Modified
- `src/module/patching.ts`
- `src/module/activities/MidiActivityMixin.ts`
- `src/globals.ts`

### Problem
The `skipConcentrationCheck` feature used actor flags to track which actors should skip their next concentration check. This had issues:
1. Database writes for a transient flag (slow)
2. Risk of orphaned flags if the workflow was interrupted
3. More complex code

### Solution
Replaced actor flags with a module-level `Set<string>` to track actor UUIDs.

### Implementation

**patching.ts:**
```typescript
// Module-level Set to track actors that should skip concentration checks
export const skipConcentrationActorUuids = new Set<string>();

export async function challengeConcentration(this: Actor.Implementation, wrapped, { dc = 10, ability = null } = {}) {
  // Set.delete() returns true if the uuid was in the set (check + remove in one operation)
  if (skipConcentrationActorUuids.delete(this.uuid)) {
    return;
  }
  // ... rest of function
}
```

**MidiActivityMixin.ts:**
```typescript
import { skipConcentrationActorUuids } from "../patching.js";

// Before activity use:
if (activity.midiProperties?.skipConcentrationCheck && this.actor &&
    activity.consumption.targets.some(t => t.target === "attributes.hp.value"))
  skipConcentrationActorUuids.add(this.actor.uuid);

// Cleanup in finally block:
if (this.actor) skipConcentrationActorUuids.delete(this.actor.uuid);
```

**globals.ts:**
- Removed `skipConcentrationCheck?: boolean` from Actor midi-qol flags type definition

### Benefits
1. No database writes - faster operation
2. No orphaned flags possible
3. Simpler code - `Set.delete()` returns boolean for check+remove in one operation
4. The Set doesn't need to survive page reloads since the flag is only needed for milliseconds during activity use

---

## 2026-01-02: Fix TrapWorkflow Infinite Loop and Target Sync

### Files Modified
- `src/module/Workflow.ts`

### Problem
TrapWorkflow was experiencing multiple issues:
1. **Infinite loop**: When `WorkflowState_WaitForAttackRoll` called `rollAttack()` and suspended, on resume it would call `rollAttack()` again instead of proceeding to `AttackRollComplete`, causing an infinite loop that exceeded 250 state transitions.
2. **Targets not synced**: Targets passed to the TrapWorkflow constructor were not being synced to `game.user.targets`, causing targeting issues.
3. **D20Roll.buildPost error**: The `shiftOnlyEvent` passed to `rollAttack` lacked the `target` property that `D20Roll.buildPost` expected.

### Changes

**WorkflowState_WaitForAttackRoll (TrapWorkflow):**
```typescript
async WorkflowState_WaitForAttackRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
  // Check if we're being unsuspended after attack roll completed
  if (context.attackRoll) return this.WorkflowState_AttackRollComplete;

  if (!this.activity.attack && !this.activity.hasAttack) {
    // No attack on activity, all targets are hit
    this.hitTargets = new Set(this.targets);
    this.hitTargetsEC = new Set();
    return this.WorkflowState_WaitForSaves;
  }
  // Don't pass event - shiftOnlyEvent doesn't have target property that D20Roll.buildPost expects
  this.activity.rollAttack?.({ workflow: this, midiOptions: { workflowOptions: this.workflowOptions } }, {}, {});
  return this.WorkflowState_Suspend;
}
```

**TrapWorkflow Constructor:**
Added `targetsPassedToConstructor` flag and sync logic:
```typescript
this.targetsPassedToConstructor = targets !== undefined;
// Sync game.user.targets from targets passed to constructor (for non-AoE activities)
if (this.targetsPassedToConstructor && targets && targets.length > 0) {
  game.user?.targets.forEach(t => t.setTarget(false, { releaseOthers: false }));
  game.user?.targets.clear();
  for (const t of targets) {
    t.setTarget(true, { releaseOthers: false });
    game.user?.targets.add(t);
  }
}
```

### Result
- TrapWorkflow no longer enters infinite loop when using activities with attacks
- Targets passed to constructor are properly synced to `game.user.targets`
- D20Roll.buildPost no longer errors on undefined target

---

## 2025-12-31: Fix Player Damage Card Healing Display

### Files Modified
- `src/module/GMAction.ts`
- `templates/damage-results-player.html`
- `lang/en.json`

### Problem
When healing was applied, the player damage card showed confusing values like "0 Rolled -> -10 Applied" instead of properly displaying the healing amount.

The root cause was in `prepareDamageListItems`:
- `rawAmount` and `rawHealing` were calculated separately
- `rawTotalDamage` was set to just `rawAmount`, excluding healing
- For pure healing, this resulted in `rawTotalDamage = 0`

### Changes

**GMAction.ts:**
1. Fixed `rawTotalDamage` calculation (line 1047):
   - Changed from `rawAmount` to `rawAmount + rawHealing`
   - Healing values are negative, so this correctly shows negative total for healing

2. Added computed properties to `DamageListContextEntry` interface:
   - `isHealing: boolean` - true when rawTotalDamage or playerViewTotalDamage is negative
   - `absRawTotalDamage: number` - absolute value for display
   - `absPlayerViewTotalDamage: number` - absolute value for display

**damage-results-player.html:**
- Added conditional display for healing vs damage:
  - Healing: "+10 Healing Rolled -> +10 Healing Applied"
  - Damage: "10 Rolled -> 8 Applied"

**lang/en.json:**
- Added `midi-qol.HealingRolled` and `midi-qol.HealingApplied` localization strings

### Result
- Healing now shows: "+10 Healing Rolled -> +10 Healing Applied"
- Damage still shows: "10 Rolled -> 8 Applied"

---

## 2025-12-31: Expanded ignoreTraits for Individual Damage Types

### Files Modified
- `src/module/Workflow.ts`
- `src/module/utils.ts` (if applicable)

### Problem
The existing `ignoreTraits` activity property (`idi`, `idr`, `idv`, `ida`) only supported ignoring ALL of a trait type. Users wanted the ability to bypass specific damage type immunities/resistances while leaving others intact (e.g., a fire sword that ignores fire immunity but not cold immunity).

### Solution
Extended the `ignoreTraits` parsing to support damage-type-specific suffixes:

| Flag | Meaning |
|------|---------|
| `idi` | Ignore ALL damage immunities |
| `idi.fire` | Ignore fire immunity only |
| `idi.cold` | Ignore cold immunity only |
| `idr` | Ignore ALL damage resistances |
| `idr.fire` | Ignore fire resistance only |
| `idv` | Ignore ALL damage vulnerabilities |
| `idv.lightning` | Ignore lightning vulnerability only |
| `ida` | Ignore ALL damage absorption |
| `ida.necrotic` | Ignore necrotic absorption only |

### Implementation Details

The `ignoreTraits` Set on activities can now contain entries like `"idi.fire"`. The damage calculation code was updated to:

1. Check for the general flag first (e.g., `idi` ignores all immunities)
2. If not present, check for specific damage type flags (e.g., `idi.fire` for fire damage)
3. Only bypass the trait if the appropriate flag matches the damage type being processed

```typescript
// Pseudocode for the check
const ignoreAllImmunity = ignoreTraits.has("idi");
const ignoreSpecificImmunity = ignoreTraits.has(`idi.${damageType}`);
if (ignoreAllImmunity || ignoreSpecificImmunity) {
  // Bypass immunity for this damage type
}
```

### Test Coverage
Added tests in `ignore-traits-tests.ts` covering:
- Baseline tests (immunity/resistance works without ignore flags)
- `idi` ignoring all immunities
- `idi.fire` ignoring only fire immunity (cold immunity still applies)
- `idr` ignoring all resistances
- `idr.cold` ignoring only cold resistance
- `idv` ignoring all vulnerabilities
- `idv.lightning` ignoring only lightning vulnerability
- `ida` ignoring all absorption
- `ida.necrotic` ignoring only necrotic absorption

---

## 2025-12-28: esbuild Build System Migration

### Files Modified
- `gulpfile.js`
- `package.json`
- `module.json`

### Changes
Migrated from multi-file gulp-typescript output to single bundled `midi-qol.js` using esbuild.

### Implementation Details

**gulpfile.js:**
- Added `const esbuild = require("esbuild")` import
- Added `typeCheck()` function that runs TypeScript type checking via `tsc --noEmit`
- Added `buildSourceEsbuild(minifySources, output)` function for bundling
- Updated `buildManifest()` to accept `bundled` parameter for single-file esmodules
- Modified all build tasks (default, dev, zip, watch, devWatch) to use new functions
- Added source map post-processing to normalize paths

**esbuild configuration:**
```javascript
await esbuild.build({
  entryPoints: ["src/midi-qol.ts"],
  bundle: true,
  format: "esm",
  outfile: path.join(outdir, "midi-qol.js"),
  sourcemap: true,
  sourcesContent: true,
  minify: minifySources,
  target: "es2022",
  platform: "browser",
  logLevel: "info",
});
```

**Source map path normalization:**
```javascript
// Fix source map paths to show nicely in browser DevTools
map.sources = map.sources.map(s => {
  const match = s.match(/src\/(module\/|midi-qol\.ts).*$/);
  return match ? "src/" + match[0].substring(4) : s;
});
```

**package.json:**
- Added `"esbuild": "^0.24.0"` to dependencies

**module.json:**
- Changed `esmodules` to use `{{sources}}` placeholder (replaced with `["midi-qol.js"]`)

### Benefits
- Build time reduced from multi-second to ~100ms
- Single bundled file simplifies distribution
- Source maps work correctly in browser DevTools under `modules/midi-qol/src/`
- TypeScript type checking still runs before bundling

---

## 2025-12-28: WorkflowRegistry Pattern

### File Modified
`src/module/Workflow.ts`

### Problem
esbuild (and other bundlers) warn about using `eval()` for dynamic code execution. The original code used:
```javascript
const actionClass = eval(className);
```

### Solution
Created a `WorkflowRegistry` object at the end of Workflow.ts:

```typescript
// Registry of workflow classes for dynamic lookup (avoids eval)
export const WorkflowRegistry: Record<string, new (...args: any[]) => Workflow> = {
  Workflow,
  SavesFirstWorkflow,
  ActiveDefenceWorkflow,
  UserWorkflow,
  DamageOnlyWorkflow,
  TrapWorkflow,
  DDBGameLogWorkflow,
  DummyWorkflow,
};
```

### Usage
Changed from:
```javascript
const actionClass = eval(className);
```
To:
```javascript
const actionClass = WorkflowRegistry[className];
if (actionClass && (actionClass === Workflow || actionClass.prototype instanceof Workflow)) {
```

### Type Notes
Used `new (...args: any[]) => Workflow` instead of `typeof Workflow` because subclasses like `DamageOnlyWorkflow` have different constructor signatures.

---

## 2025-12-27: checkSaves Refactoring - Phase 4

### Files Modified
- `src/module/Workflow.ts`
- `src/globals.ts`

### Changes
Major refactoring of `checkSaves` to reduce code duplication and improve type safety.

### New Types Added to `globals.ts`

| Type | Purpose |
|------|---------|
| `SaveRollInfo` | Roll type, ability, skill, tool, and action function |
| `MagicSaveInfo` | Magic save flags (isMagicSave, resistance, vulnerability) |
| `SaveDisplayOptions` | Display settings (whisper, showRoll, showRollDialog, simulate) |
| `SavePlayerInfo` | Player context (player, GMprompt, playerChat) |
| `ModuleIntegrationFlags` | Module enable flags (MonksTB, FlashTB, EpicRolls, RER) |
| `ModuleIntegrationRequests` | Module request arrays for player/gm rolls |
| `QueueSaveRollOptions` | Combined options type for `queueTargetSaveRoll()` |
| `SaveDetails` | Structured type for save details object |
| `ProcessTargetSaveContext` | Context for `processTargetSaveResult()` |

### Helper Methods Extracted

| Method | Purpose |
|--------|---------|
| `queueTargetSaveRoll(options)` | Refactored from 24+ positional parameters to structured options object |
| `processTargetSaveResult()` | Processes a single target's save result (~90 lines extracted) |
| `updateSaveFailSets()` | Updates saves/failedSaves sets based on save result |
| `applyFailedSaveBonuses()` | Applies fail bonuses (flags.midi-qol.save.fail) if save failed |
| `computeModuleIntegrationSettings()` | Returns module flags and request arrays for external modules |
| `buildSaveDetailsForTarget()` | Builds SaveDetails including magic resistance/vulnerability checks |
| `normalizeRollResults()` | Converts raw roll results to consistent Roll[][] arrays |

### Code Cleanup
- Removed unused `promptPlayer` variable from `determineTargetRollSettings()` destructuring
- Removed empty `finally` block
- Removed self-assignments at end of `checkSaves` (e.g., `this.saves = this.saves`)
- Removed unused `BasicRoll` import in `checkSaves`

### Impact
- Reduced `checkSaves` from ~310 lines to ~130 lines
- `queueTargetSaveRoll` now uses a single structured options parameter instead of 24+ positional parameters
- Created reusable types in globals.ts to reduce duplication
- Added `save.fail` flag type to Actor flags in globals.ts

---

## 2025-12-27: README Flags Cross-Reference Update

### File Modified
`README.md`

### Changes
Cross-referenced the Flags Reference section against actual flag definitions in the codebase (midi-qol.ts, patching.ts, Workflow.ts, utils.ts, Hooks.ts). Added missing flags and expanded documentation.

### New Flag Documentation Added

**Grants Flags (greatly expanded):**
| Category | Flags Added |
|----------|-------------|
| Attack Modifiers | `grants.advantage.all`, `grants.noAdvantage.attack.*`, `grants.noDisadvantage.attack.*`, `grants.attack.fail.*`, `grants.attack.success.*` per attack type |
| Critical Modifiers | `grants.critical.range`, `grants.noCritical.*` per attack type |
| Save Modifiers | `grants.advantage.save.*`, `grants.disadvantage.save.*`, `grants.noAdvantage.save`, `grants.noDisadvantage.save` |
| Check/Skill Modifiers | `grants.advantage.check.*`, `grants.advantage.skill.*`, `grants.disadvantage.check/skill.*` |
| Damage Modifiers | `grants.max.damage.*`, `grants.min.damage.*`, `grants.bonus.damage.*` |

**New Sections:**
| Section | Flags Documented |
|---------|-----------------|
| Save Bonuses | `save.fail.all`, `save.fail.str/dex/etc` |
| Roll Modifiers | `rollModifiers.attack.*`, `rollModifiers.damage.*` |
| Action Tracking | `actions.reaction`, `actions.reactionsUsed`, `actions.reactionCombatRound`, `actions.reactionsReset`, `actions.bonus`, `actions.bonusActionsUsed`, `actions.bonusActionCombatRound`, `actions.bonusActionsReset` |
| Item Flags | `onUseMacroName`, `syntheticItem` |

**Special Flags expanded:**
- `magicResistance.str/dex/etc` (ability-specific)
- `magicVulnerability.str/dex/etc` (ability-specific)
- `deathSaveBonus`
- `fail.disadvantage.heavy`

**OverTime Effects expanded:**
- Added full parameter table with all supported options
- Added example syntax
- Parameters: turn, damageRoll, damageType, saveDC, saveAbility, rollType, saveMagic, actionSave, actionType, damageBeforeSave, label/name, chatFlavor, rollMode, applyCondition/condition

**Deprecation note:**
- `fail.critical.all` marked as deprecated (use `grants.noCritical.all`)

### Impact
- README Flags Reference now accurately reflects the full set of flags available in midi-qol
- Added ~80 new flag entries across multiple categories
- Improved discoverability of lesser-known flags

---

## 2025-12-27: README Hooks Section Update

### File Modified
`README.md`

### Changes
Completely rewrote the Hooks Reference section from the simple 9-hook table to a reference with 50+ hooks organized by category.

### New Hook Categories

| Category | Hooks Documented |
|----------|------------------|
| Workflow State Hooks | 13 main states with pre/post variants (26 hooks) |
| Activity Hooks | 7 hooks (preTargeting, preItemRoll, preAttackRoll, etc.) |
| Workflow Event Hooks | 12 hooks (targetingComplete, preCheckHits, healed, damaged, etc.) |
| Damage Calculation Hooks | 2 hooks (dnd5ePreCalculateDamage, dnd5eCalculateDamage) |
| Reaction Hooks | 1 hook (ReactionFilter) |
| System Hooks | 9 hooks (setup, ready, midiReady, ConfigSettingsChanged, etc.) |
| Premade Hooks | Documented `midi-qol.premades.*` pattern |

### Key Improvements
- Documented item-specific hook pattern (`.{item.uuid}`, `.{activity.uuid}`)
- Added return value behavior (`false` to abort)
- Documented hook arguments where they differ from workflow
- Listed all workflow states including lesser-known ones (AoETargetConfirmation, ConfirmRoll, etc.)
- Documented v2 API variants (preTargetingV2, preItemRollV2)

### Source Files Referenced
- `src/module/Workflow.ts` - WorkflowState_* methods and asyncHooksCall* calls
- `src/module/utils.ts` - asyncHooksCall/asyncHooksCallAll definitions
- `src/module/activities/MidiActivityMixin.ts` - Activity hooks
- `src/module/activities/AttackActivity.ts` - Attack hooks
- `src/midi-qol.ts` - System hooks
- `src/module/Hooks.ts` - Damage calculation hooks

---

## 2025-12-26: Fix advantage/disadvantage override bug in patching.ts

### File Modified
`src/module/patching.ts`

### Problem
The `||=` operator was used for advantage/disadvantage assignment, which treats explicit `false` as falsy and overwrites it. This caused `grants.noAdvantage` (which sets `advantage: false` in `checkSaves`) to be overridden by actor flags in `procAbilityAdvantage`.

### Changes
Changed `||=` to `??=` (nullish coalescing assignment) in select locations so that explicit `false` values from `checkSaves` are preserved:

| Line | Function | Change | Reason |
|------|----------|--------|--------|
| 187-188 | Skill roll handler | `\|\|=` → `??=` | Preserve caller's explicit value |
| 586-587 | Ability roll handler | `\|\|=` → `??=` | Preserve caller's explicit value |
| 819-820 | `procAbilityAdvantage` | `\|\|=` → `??=` | Key fix for `grants.noAdvantage` on saves |

**Note:** `procAdvantageSkill` (lines 835-836, 851-852) keeps `||=` because:
- It's only called for skill rolls (not saves)
- Skill-specific flags need to be able to add advantage even if ability-based settings didn't find any
- Save rolls use `doRollAbility` which only calls `procAbilityAdvantage`, not `procAdvantageSkill`

### Technical Explanation
- `||=` assigns if the left side is falsy (false, undefined, null, 0, "")
- `??=` assigns only if the left side is `undefined` or `null`
- This allows `checkSaves` to pass `advantage: false` and have it respected by `procAbilityAdvantage`

---

## 2025-12-26: Fix advantageSaves Using Wrong Property

### File Modified
`src/module/Workflow.ts`

### Problem
The code at lines 5487-5491 was checking `result[0]?.options?.advantage` and `result[0]?.options?.disadvantage` (booleans), but dnd5e rolls store advantage state in `options.advantageMode` (a number: 1 = advantage, -1 = disadvantage, 0 = normal).

This caused the "tracks advantage saves separately per target" test to fail because `options.advantage` was always `undefined` even when the roll was made with advantage.

### Changes
Restructured lines 5487-5502 to:
1. First check `result[0]?.options?.advantageMode` for standard dnd5e rolls
2. Fall back to `result[0]?.terms?.[0]?.options?.advantage/disadvantage` for custom roll modules (e.g., Better Rolls)

This matches the pattern used for attack rolls at lines 4430-4441.

```javascript
const advantageMode = result[0]?.options?.advantageMode;
if (advantageMode !== undefined) {
  // Standard dnd5e roll with advantageMode
  if (advantageMode === 1) this.advantageSaves.add(target);
  else this.advantageSaves.delete(target);
  if (advantageMode === -1) this.disadvantageSaves?.add(target);
  else this.disadvantageSaves?.delete(target);
} else {
  // Fallback for custom rolls that set terms[0].options
  if (result[0]?.terms?.[0]?.options?.advantage) this.advantageSaves.add(target);
  else this.advantageSaves.delete(target);
  if (result[0]?.terms?.[0]?.options?.disadvantage) this.disadvantageSaves?.add(target);
  else this.disadvantageSaves?.delete(target);
}
```

### Technical Explanation
dnd5e uses `D20Roll.ADV_MODE`:
- `ADV_MODE.ADVANTAGE` = 1
- `ADV_MODE.DISADVANTAGE` = -1
- `ADV_MODE.NORMAL` = 0

The roll's `options.advantageMode` reflects how the roll was actually made. Custom roll modules like Better Rolls may instead set `terms[0].options.advantage` via `createRollResultFromCustomRoll()`, so the fallback ensures compatibility.

---

## 2025-12-26: checkSaves Refactoring - Phase 1

### File Modified
`src/module/Workflow.ts`

### Changes
Started incremental refactoring of the `checkSaves` method to improve readability. The original method was ~860 lines.

### Helper Methods Extracted

| Method | Lines | Purpose |
|--------|-------|---------|
| `evaluateGrantsAdvantage()` | 4869-4904 | Evaluates caster's grants.advantage/disadvantage/noAdvantage/noDisadvantage flags |
| `checkMagicResistanceAndVulnerability()` | 4914-4962 | Checks target for magic resistance/vulnerability traits and flags |
| `calculateCoverSaveBonus()` | 4972-5028 | Calculates DEX save cover bonus from template position or caster |
| `determineCriticalOrFumble()` | 4981-4992 | Checks if a save roll is a natural 20 (critical) or natural 1 (fumble) |
| `updateAdvantageTrackingFromRoll()` | 4999-5021 | Updates `advantageSaves` and `disadvantageSaves` sets based on roll result's `advantageMode` |
| `determineRollTypeAndAction()` | 5028-5085 | Determines roll type (save/check/skill/tool), roll action function, and related properties from saveActivity |

### Technical Details

**determineRollTypeAndAction()**
- Returns: `{ rollAction, rollType, rollAbility, rollSkill, rollTool, flagRollType }`
- Handles save activities, check activities (ability/skill/tool)
- Added early return guard in `checkSaves` if `rollAction` is undefined

**updateAdvantageTrackingFromRoll(target, result)**
- Checks `result[0].options.advantageMode` for dnd5e rolls (1 = advantage, -1 = disadvantage)
- Falls back to `result[0].terms[0].options.advantage/disadvantage` for custom roll modules
- Handles advantage/disadvantage cancellation

**determineCriticalOrFumble(saveRoll, fallbackTotal)**
- Returns: `{ isCritical: boolean, isFumble: boolean }`
- Checks dice term options for custom fumble/critical thresholds
- Used in 3 places within `checkSaves` (initial calculation, after macro triggers, after bonus checks)

**evaluateGrantsAdvantage(conditionData, flagRollType, rollAbility)**
- Returns: `{ advantage: boolean | undefined, disadvantage: boolean | undefined }`
- Checks `flags.midi-qol.grants.advantage.*` and `grants.disadvantage.*` on caster
- Also checks `grants.noAdvantage` and `grants.noDisadvantage` to force false

**checkMagicResistanceAndVulnerability(target, conditionData, rollAbility, isMagicSave)**
- Returns: `{ advantage, disadvantage, magicResistance, magicVulnerability }`
- Checks target's DR traits for "Magic Resistant" text
- Checks for Magic Resistance feat by name
- Evaluates `flags.midi-qol.magicResistance.*` and `magicVulnerability.*`

**calculateCoverSaveBonus(target, template, rollAbility)**
- Returns: `Promise<number>` - the cover bonus to add to save total
- Only applies to DEX saves
- Supports levels-autocover, simbuls-cover-calculator, and tokencover modules
- Handles area-of-effect templates with position adjustment for rect templates

### Impact
- Reduced `checkSaves` method by ~100 lines
- Extracted 6 reusable helper methods with clear responsibilities
- Improved code organization and readability
- Eliminated duplicated critical/fumble detection logic (was repeated 3 times)

---

## 2025-12-26: checkSaves Refactoring - Phase 2

### File Modified
`src/module/Workflow.ts`

### Changes
Continued incremental refactoring of the `checkSaves` method, extracting 4 more helper methods.

### Helper Methods Extracted

| Method | Lines | Purpose |
|--------|-------|---------|
| `getFriendlyTargetRoll()` | 4867-4888 | Returns auto-pass/fail roll for friendly targets based on activity settings |
| `determineTargetRollSettings()` | 4947-4998 | Determines player, prompt settings, and module integration flags for target rolls |
| `getTargetPortraitImage()` | 4896-4910 | Gets portrait image for target, handling player portrait preference and video thumbnails |
| `checkSculptOrCarefulSpells()` | 4919-4938 | Checks if target should auto-succeed due to Sculpt Spells or Careful Spells features |

### Technical Details

**getFriendlyTargetRoll(saveDetails)**
- Returns: `Promise<Roll> | null`
- Checks `this.activity.friendlySave` for "friendlyFail" or "friendlySuccess"
- Also checks item description for `i18n("midi-qol.autoFailFriendly")` text
- Returns BasicRoll("-1") for auto-fail, BasicRoll("99") for auto-success, null otherwise

**determineTargetRollSettings(target, flagRollType, simulate)**
- Returns: Object with `player`, `promptPlayer`, `showRollDialog`, `GMprompt`, `gmMonksTB`, `gmFlashTB`, `gmRER`, `playerChat`
- Handles monks-tokenbar, flash-rolls-5e, and epic-rolls-5e module integration
- Respects linked vs unlinked NPC roll settings

**getTargetPortraitImage(target)**
- Returns: `Promise<string>` - the image URL
- Uses `configSettings.usePlayerPortrait` to prefer actor image for characters
- Generates video thumbnails for animated token textures

**checkSculptOrCarefulSpells(target)**
- Returns: `boolean` - true if target should auto-succeed
- Sculpt Spells: Checks evocation school and adds target to superSavers
- Careful Spells: Checks preSelectedTargets for metamagic

### Impact
- Further reduced `checkSaves` method by ~30 lines
- Extracted 4 additional reusable helper methods
- Removed unused `targetDocument` variable from main loop
- Total helper methods extracted from checkSaves: 10

---

## 2025-12-26: checkSaves Refactoring - Phase 3

### File Modified
`src/module/Workflow.ts`

### Changes
Continued incremental refactoring of the `checkSaves` method, extracting 2 more helper methods.

### Helper Methods Extracted

| Method | Lines | Purpose |
|--------|-------|---------|
| `buildSaveDisplayEntry()` | 4977-5018 | Builds and stores save display entry including advantage/disadvantage display, cover bonus, and roll rendering |
| `applyConcentrationSaveBonus()` | 4951-4975 | Applies concentration save bonus when item has isConcentrationCheck flag and target has concentrationSaveBonus |

### Technical Details

**buildSaveDisplayEntry(target, saveRoll, saveRollTotal, saved, rollDC, coverSaveBonus)**
- Returns: `Promise<void>`
- Handles advantage/disadvantage text display
- Gets target portrait via `getTargetPortraitImage()`
- Renders roll HTML via `midiRenderRoll()`
- Pushes to `this.saveRolls`, `this.tokenSaves`, and `this.saveDisplayData`

**applyConcentrationSaveBonus(target, saveRoll, resultDC, isCritical, isFumble)**
- Returns: `Promise<{ saveRoll: Roll, saveRollTotal: number, saved: boolean } | null>`
- Only applies when `this.item.flags[MODULE_ID].isConcentrationCheck` is true
- Only applies when target has `concentrationSaveBonus` flag
- Adds bonus roll and recalculates saved status

### Impact
- Further reduced `checkSaves` method by ~45 lines
- Extracted 2 additional reusable helper methods
- Total helper methods extracted from checkSaves: 12
