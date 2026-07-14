# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**When to update this file**: After fixing a non-obvious bug or making a design decision that:
- Required multiple attempts to get right
- Has implications for future development (e.g., "always use X, never use Y")
- Involves subtle interactions between systems (dnd5e + midi-qol + Foundry)

Document the **what** and **why** so the same mistake isn't repeated in future sessions.

## Project Context

midi-qol is a Foundry VTT module that enhances the dnd5e system with automated attack rolls, damage application, saving throws, and workflow management. Compatibility: Foundry v13, dnd5e 5.2.4–5.3.x. Required modules: socketlib, lib-wrapper, dae.

## Architecture

The module is **workflow-centric**. The `Workflow` class in `Workflow.ts` orchestrates the entire attack→target→save→damage pipeline. All other systems feed into or extend this pipeline.

### Key Source Files (`src/module/`)

| File | Role |
|------|------|
| **Workflow.ts** (~9K lines) | Core workflow orchestration — attack/damage/save rolls, effect application, targeting |
| **utils.ts** (~9.5K lines) | Utilities: target validation, advantage computation, damage application, roll rendering |
| **patching.ts** (~2.7K lines) | Monkey-patches dnd5e via lib-wrapper (actor rolls, vision, ability checks, death saves) |
| **Hooks.ts** | Foundry hook handlers (init, ready, setup), socket registration, flanking, concentration, over-time effects |
| **GMAction.ts** | Socket communication — GM-only actions via socketlib (damage application, effect creation, token movement) |
| **settings.ts** | Module settings registration (`checkRule`, `configSettings`) |
| **chatMessageHandling.ts** | Chat log filtering, damage card processing |

### Subdirectories (`src/module/`)

- **`activities/`** — Activity type implementations for dnd5e 5.3+. `MidiActivityMixin.ts` (112KB) patches all activity types; `AttackActivity.ts`, `SaveActivity.ts`, etc. handle specific types. `activityHelpers.ts` manages template targeting and confirmation dialogs.
- **`apps/`** — UI components (all ApplicationV2-based): `ConfigPanel.ts`, `TroubleShooter.ts`, `TargetConfirmation.ts`, `ConditionEditor.ts`, etc.
- **`ChatClasses/`** — Chat message/log overrides: `ChatMessageMidi.ts` (damage buttons), `ChatLogMidi.ts` (filtering), `DamageApplicationElementMidi.ts`
- **`lib/`** — Internal utilities: `midiCompletions.ts` (macro autocomplete), `RollModifierTracker.ts` (advantage/disadvantage flags), `MidiDependentsRegistry.ts` (effect dependencies)

### Entry Point

`src/midi-qol.ts` exports 70+ functions/classes to `globalThis.MidiQOL`. Key exports: `Workflow`, `TrapWorkflow`, `completeItemUse`, `completeActivityUse`, `applyTokenDamage`, `hasCondition`, `createEffects`. Types are declared in `src/globals.ts`.

### Patterns

- **Hook-driven**: ~100 custom hooks (`midi-qol.preItemRoll`, `midi-qol.AttackRollComplete`, etc.) allow other modules to extend behavior
- **Socket communication**: socketlib for GM-only operations — players request via socket, GM validates and executes
- **lib-wrapper patching**: Safe monkey-patching of dnd5e methods without direct modification

## Key Resources

### Source Code Paths
- **midi-qol source**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-13x/src`
  - **IMPORTANT**: Do NOT use `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol/src` — that is the obsolete v12 codebase
- **dnd5e system**: `/home/timp/foundry-data/foundryv13/Data/systems/dnd5e` — verify API methods here, never assume they exist
- **Foundry VTT core**: `/home/timp/foundryv13/resources/app/client-esm` and `.../common` — always use v13 API, never fetch v12 docs
- **3rd-party modules** (chris-premades, dae, times-up, etc.): `/home/timp/foundry-data/foundryv13/Data/modules`

### Editable Related Module Source
- **times-up-10x**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/times-up-10x/src` — effect duration management (v13 only; v14 duration management moved to DAE)
- **times-up-14x**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/times-up-14x/src` — stub module (v14); all duration management moved to dae-14x
- **dae-10x**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/dae-10x/src/module` — Dynamic Active Effects (v13, branch `v13`)
- **dae-14x**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/dae-14x/src/module` — Dynamic Active Effects + duration management (v14, branch `v14`)

### Foundry v14 Investigation
- **Investigation doc**: `/home/timp/Documents/foundryv14-investigation-2026-03-13.md`
- **Foundry v14 core**: `/home/timp/foundryv14/resources/app/`
- **Branch management**: Use `dae-14x` (branch `v14`) for v14 work, `dae-10x` (branch `v13`) for v13 fixes. Each directory stays on its respective branch — no need to switch branches.

### Tidy5e-sheet
Source: `/home/timp/foundry-data/foundryv13/Data/modules/tidy5e-sheet` (minified Svelte, use `.js.map` for source mapping)

API via `Hooks.once('tidy5e-sheet.ready', (api) => {...})`. Current midi-qol integration (in Hooks.ts):
1. `api.config.itemSummary.registerCommands()` — Roll, Attack, Damage buttons
2. `api.registerItemHeaderControls()` — on-use macros config button
3. `tidy5e-sheet.getActivitiesForPlay` hook — filter automationOnly and rider activities

For full API details (header controls, custom content/tabs, config APIs), read the tidy5e-sheet source directly.

### External Documentation
- **Chris-Premades API**: `/home/timp/Documents/ChrisPremades-API-2026-01-06.md`
- **Chris-Premades GitHub**: `https://github.com/chrisk123999/chris-premades` (branch: master)
- "CPR" and "Cauldron of Plentiful Resources" both refer to the chris-premades module

### SRD Reference Data
- Location: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-13x/SRD/`
- Folders with `24` suffix (e.g., `spells24/`) = **modern 2024 / SRD 5.2** rules — check these first
- Folders without suffix = **legacy 2014** rules
- **Always check SRD folder first** when creating/verifying sample items
- SRD filenames use mixed case — use case-insensitive patterns or Grep

### Ember Packs Module
- Location: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/ember-packs/`
- Separate module for modified ember Character Options compendium data
- `pack-src/character-options/` — JSON source files (ancestries, cultures, attunements, paths, soulbound, features)
- `pack-src/automated-items/` — Standalone copies of modified creature items (mirroring ember-creatures folder hierarchy)
- `packs/*/` — Compiled LevelDB output
- Build: `npm run compilePacks` (JSON → LevelDB), `npm run extractPacks` (LevelDB → JSON)
- Deploy: `npx gulp deploy` (compiles and copies to dev modules directory)
- In-game sync: Run `scripts/sync-pack-src.mjs` as a world macro (requires symlink: `ln -s /path/to/ember-packs/pack-src <devDir>/ember-packs/pack-src`)
- **IMPORTANT**: When modifying any item on a creature in `ember-creatures`, also add/update a standalone copy of that item in `pack-src/automated-items/` under the matching folder path. The standalone item needs a new 16-char `_id`, `_key` format `!items!<id>`, and `flags.chris-premades.info` with `source: "ember-packs.automated-items"` and `version` matching the module version.

### Extracting LevelDB Compendium Packs
The preferred method is `@foundryvtt/foundryvtt-cli`:
1. Copy the LevelDB pack to a `packs/` directory
2. Use `foundryvttCli.extractPack(packPath, destPath, { folders: true })` to extract to JSON
3. Use `foundryvttCli.compilePack(srcPath, destPath, { recursive: true })` to compile back
4. The `cleanPackFolderNames()` utility renames extracted `Name_ID` directories to `Name`

For quick one-off extraction without the CLI, use `classic-level` from Foundry's node_modules:
```bash
NODE_PATH=/home/timp/foundryv13/resources/app/node_modules node extract-script.js
```
Note: This approach doesn't handle embedded document hierarchy (effects stored as ID references) — prefer the CLI for round-trippable extraction.

### Sample Item Spell Icons
- Use icons from the dnd5e SRD compendium: `/home/timp/foundry-data/foundryv13/Data/systems/dnd5e/packs/_source/spells/`
- Verify icon paths exist at `/home/timp/foundryv13/resources/app/public/icons/`

## User Instructions

### Git Operations
- **Do not automatically commit or push changes** to midi-qol-13x or midi-qol-tests — user reviews diffs first
- **NEVER run `git checkout` without explicit user approval** — can destroy uncommitted work

### Tool Usage
- **`sed` and `find` commands**: Allowed via Bash without asking for permission when you have read/write access to the target directory. No need to use the dedicated Read/Edit/Glob tools exclusively — use whichever is most efficient for the task.

### Coding Conventions
- **Comments**: Use sparingly. Only comment complex or non-obvious code.
- **Transient debug**: Always use `console.error()`, never `log()`/`warn()`/midi logging. Never wrap in `if (debugEnabled)`.
- **Imports**: Always use ES module imports, NOT `globalThis.MidiQOL` (except in test suite where direct imports aren't available)
- **TypeScript**: Avoid `as any` / `: any` — check `globals.ts` and fvtt-types first. Query user before creating new types in globals.ts. Prefer updating globals.ts hooks namespace over `@ts-expect-error`.
  - **NEVER add `as any` casts without explicit user approval.** Always propose alternatives first (globals.ts types, `@ts-expect-error`, interface augmentation).
  - **NEVER add `@ts-expect-error` without explicit user approval.** The error may be solvable via globals.ts type definitions. Present the error and proposed solutions to the user.
  - For dnd5e-specific properties on `actor.system` / `item.system` that lack types, use `@ts-expect-error no dnd5e types` — but still ask first.
  - These rules apply to midi-qol, dae, and all related modules.
- **CSS classes**: Never invent class names — always verify they exist in templates/stylesheets
- **Document type checking**: Use `instanceof Item` not `doc.documentName === "Item"` — applies to all base document types
- **External API calls**: Search midi-qol codebase for existing usage FIRST, then dnd5e source. Never assume methods exist.
  - `activities.getByIdentifier()` does NOT exist — use `activities.get(id)`, `activities.getByType(type)`, `activities.find(predicate)`, or `activities.contents`
- **Actor effects**: `actor.appliedEffects` returns transfer effects, but `token.actor.effects` (the embedded collection) does NOT include transfer effects from items. To iterate all effects including transfers, use `actor.allApplicableEffects()` (a generator). In dnd5e, skip non-applied enchantments: `ef.type === "enchantment" && !ef.isAppliedEnchantment`.
- **Dialogs**: Never use `Dialog` (v1) — always use `foundry.applications.api.DialogV2`. This applies to all code: midi-qol, sample items, macros, templates, etc.
- **Applications**: Never use `Application` (v1) — always use `foundry.applications.api.ApplicationV2`. All new application classes should extend `ApplicationV2`.
- **Token status effects**: `token.toggleStatusEffect()` is deprecated — use `token.actor.toggleStatusEffect()` instead.

### Documentation & Changelog
- **Datestamp filenames**: `DocumentName-YYYY-MM-DD.md` for all docs
- **Changelog separation**: Test changes go in midi-qol-tests CHANGELOG.md only, not midi-qol's Changelog.md

### Related Modules
- **chatlog-prune** (`/home/timp/foundry-data/foundryalpha/Data/modulesrc/chatlog-prune/`): Keep `ChatLogPrune.ts` and `ChatLogMidi.ts` in sync. midi-qol's built-in chat log pruning deprecated since 13.0.37.
- **midi-qol-setup-wizard** (`/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-setup-wizard/`): Key files: `scripts/wizard.js`, `wizard-steps.js`, `setting-definitions.js`, `module-definitions.js`. Launched via `Hooks.call("midi-qol-setup-wizard.launch")`.
- **item-delete-check** (`/home/timp/foundry-data/foundryalpha/Data/modules/item-delete-check/`): Single `main.js`, no build step, `master` branch.

### Foundry ApplicationV2 Scrollable Pattern
Never use raw `overflow-y: auto`. Use Foundry's built-in pattern:
1. **Template**: `class="scrollable"` on the scrolling element
2. **CSS**: `flex: 1; min-height: 0;` on same element
3. **PARTS**: `scrollable: [".selector"]` in part definition (preserves scroll position on re-render; `""` for root element)

### Aura Effects Module (NOT ActiveAuras)
Use **Aura Effects** (`auraeffects`), NOT ActiveAuras (`flags.ActiveAuras`), for new sample items. Source: `/home/timp/foundry-data/foundryv13/Data/modules/auraeffects/`

Aura effects use type `"auraeffects.aura"` with config in `system` property (not flags). Key properties: `distanceFormula` (string), `disposition` (-1=enemies, 0=any, 1=allies), `applyToSelf`, `collisionTypes`, `canStack`, `combatOnly`, `disableOnHidden`. See module source for full list.

Applied aura copies get `flags.auraeffects.fromAura: true`. Old `flags.ActiveAuras` blocks on existing items are harmless (set to `isAura: false`).

## Significant Decisions

### Sample Item / Activity Conventions

1. **Activity effects `onSave` field is counter-intuitive**
   - `onSave: false` (default) — only apply effect when target **fails** the save
   - `onSave: true` — **always** apply, regardless of save result
   - The name `onSave` means "also apply on save", NOT "only apply if saved"

2. **CRITICAL: Foundry document IDs must be exactly 16 characters**
   - ALL IDs: item `_id`, effect `_id`, activity `_id`. 15-char IDs cause silent failures, undefined `uuid`, tidy5e crashes.
   - IDs in `_key` fields must be consistent. Filename `Name_Id.json` must match `_id`.
   - When in doubt, pad with trailing zeros: `Befuddlement0000` not `Befuddlement000`

3. **Self-only effects must set `flags.dae.selfTarget: true`**
   - Activity `target.affects.type: "self"` is NOT enough — effects still apply to all targets
   - `selfTargetAlways` applies the self-effect even when there are no targets

4. **DAE effect changes are reapplied on every actor recalculation — never use them for mutable state**
   - For flags a macro needs to modify, initialize in the `args[0] === "on"` handler instead
   - Effect changes are only for static values (e.g., `macro.itemMacro`, `system.attributes.ac.bonus`)

5. **Skipping the consume/configuration dialog**: Use `midiProperties.forceConsumeDialog: "never"`, NOT `summon.prompt`

6. **Multi-activity items: set `otherActivityId: "none"`** on activities that should NOT auto-pair. Empty string `""` = auto-detect (wrong for items like Delayed Blast Fireball). Also set `otherActivityCompatible: false`.

7. **Sample item macro variable names**: Use `rolledActivity`/`rolledItem` (the weapon attack) and `macroActivity`/`macroItem` (the spell that owns the macro). Never bare `activity`/`item`.

8. **DamageBonusMacro transfer effects must use bare `"ItemMacro"`** — not `"ItemMacro.{itemId}"`. DAE rewrites bare `"ItemMacro"` to the full UUID. Same for `"ActivityMacro"`.

9. **ActivityOverTime identifiers must not contain hyphens** — DAE's `evalArgs` evaluates change values as formulas. `"deferred-damage"` → subtraction → `0`. Always use camelCase.

10. **Deprecated flag paths**: Use `flags.midi-qol.advantage.save.xxx` not `flags.midi-qol.advantage.ability.save.xxx`. Same for `disadvantage`, `check`, and `grants` variants.

11. **Vitality death status**: Use `CONFIG.statusEffects.find(se => se.id === "dead")`, NOT `getDeadStatus()` — the latter returns status based on settings (may return unconscious). `setDeadStatus` removes conflicting statuses first.

12. **`options.midi` is set for ALL damage** — `dnd5e.preCalculateDamage` sets `options.midi.totalDamage` unconditionally. To detect non-midi damage, note that midi-qol uses `actor.update()` directly (not `actor.applyDamage()`), so `dnd5e.preApplyDamage` only fires for non-midi damage.

13. **Spell scaling via `midiOptions.spellLevel`** — dnd5e's `_prepareUsageScaling` derives scaling from `actor.system.spells[usageConfig.spell.slot].level`. When calling `completeActivityUse` programmatically, midi sets `usage.spell.slot = "spell${midiOptions.spellLevel}"` before `super.use()` so dnd5e's scaling logic works without consuming a slot.

14. **Duration management moved from times-up to DAE (v14)**
    - In v14, all duration management (seconds↔rounds conversion, transfer effect disable-on-expiry, effect creation setup, combat start/end handling) lives in `dae-14x/src/module/specialDurations.ts`.
    - times-up-14x is a stub — its `handleUpdates.ts` re-exports utility functions for backward compat only.
    - DAE settings: `durationManagementEnabled`, `enablePassiveEffects`, `updatePassiveEffects`, `expireRoundEffectsOnCombatEnd` (registered under `"dae"` namespace).
    - DAE's `maxShortDuration` (seconds, default 600) replaces times-up's `MaxRoundsToConvert` (rounds).
    - `CONFIG.ActiveEffect.expiryAction = "delete"` is now set by DAE's init hook.
    - `flags.times-up.durationSeconds` flag path kept for backward compat with existing effects.
    - DAE API (`game.modules.get("dae").api`) exports: `expireEffect`, `isEffectExpired`, `isTransferEffect`, `hasDuration`, `hasExpiry`.
    - One-time migration from times-up settings runs at `ready` via `migrateTimesUpSettings()`.

15. **v14 ActiveEffect change values must remain strings** — v14's `AnyField` stores values as-is (no auto-coercion). The v13 backward-compat shim's `#migrateChangeValue` ran `JSON.parse` on string values (`"-10"` → `-10`), but native v14 schema does not. Always use string values in effect changes — this preserves support for Roll expressions (`"1d6"`, `"@abilities.str.mod"`). Code consuming change values should handle strings (e.g., `new Roll(value)`, `Number.isNumeric()`).

16. **v14 Set-based trait fields: `add` adds *and* removes** — dnd5e Set trait fields (`system.traits.dr.value`, `di.value`, `dv.value`, `bypasses`, proficiencies, languages, `ci.value`) are `SetField`s. `override` yields a valid Set (so `.has()` works — the earlier "breaks `.has()`" note was a stale apply path) but **replaces the whole Set, wiping existing entries** — avoid it for incremental changes.
    - **`add` both adds and removes.** dnd5e's `ActiveEffect5e.applyChange`/`applyChangeField` (NOT the base Foundry `SetField`, whose `_applyChangeAdd` is a plain `union`) special-cases Set traits in `add` mode: each value is stripped of a leading `-`, and if it had one it is `current.delete()`d, else `current.add()`ed. So `add: acid` adds and `add: -acid` **removes** acid — in stock dnd5e, no modules. `subtract` (= `difference`, bare value, no `-`) also removes.
    - **DAE preserves this.** DAE delegates all non-`custom` changes to dnd5e's `applyChange` (dae-14x `daeApplyChange` → `wrapped`; dae-10x → `c.effect.apply`), so `add -value` removal flows through to dnd5e identically with DAE active. DAE's own `-value` handling (`doCustomArrayValue`) is an *additional* path that only runs in `custom` mode. (Earlier "`-value` is custom-mode only" was wrong.)
    - **DAE editor (dae-14x):** Set-backed pickers default to `add` (type unrestricted; `override` would wipe the Set) and show `-value` removal options in **both `custom` and `add`** modes (filtered out only for `subtract`/`override`, which take bare values).

17. **v14 `markFlanking` must be serialized** — The function can be called concurrently from the `targetToken` hook, the workflow, and `TargetConfirmation`. The CPR effect branch's check-then-create (`effects.get()` → `createEmbeddedDocuments(..., { keepId: true })`) isn't atomic. Fixed by serializing via a promise chain so only one `_markFlankingImpl` runs at a time.

18. **Persisted workflow fields go through `PersistedFieldStore`** — Workflow.ts fields backed by chat-card flags (scalars, token Sets, Roll/Roll[], DamageDescription[]) use `this.#persisted.scalar/tokenSet/roll(s)/damageDetail` accessors, not hand-rolled `#field` + getter/setter pairs. The store owns caching, flag fallback, and serialization (including `Roll.fromData` rehydration). New persisted fields should use it; only genuinely special accessors (`currentAction`, `isCritical`/`isFumble`, `activity`, `item`, `token`, `otherDamageMatches`) remain hand-written.

## Testing

Tests use the Quench framework in a separate module:
- **Location**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-tests/`
- **Build**: `cd midi-qol-tests && npm run build`
- Accesses midi-qol via `globalThis.MidiQOL`

**CRITICAL: Never remove tests without explicit user consent.**

### Test Conventions
- Batch ID: `quench.midi-qol.{camelCaseName}`, displayName: `"{number}. {Title} Tests"`
- No "Midi" or "midi-qol" in displayName (exception: `flags.midi-qol` references)
- Export: `register{Number}{PascalCaseName}Tests`
- Every test starts with `await testMessage("6.1", "description")` before `this.timeout()`

### Test World
- **Live**: `/home/timp/foundry-data/foundryv13/Data/worlds/quench-test` (git: `git@gitlab.com:tposney/quench-test-world.git`)
- **Distributable**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/quench-test-install` — run `node build.js` to build, `node build.js release` to release
- **Actors**: `actor1Name` ("actor1"), `actor2Name` ("actor2"), targets: `target1Name` ("Orc1" — 20ft away), `target2Name` ("Orc2" — 5ft), `target3Name` ("Skeleton1")
- **Vitality testing**: Restore vitality FIRST, then HP. Always clean up prone/dead/defeated in finally blocks.
- **Activity cloning**: `activity.use()` clones the item — after `item.update()`, get fresh reference via `fromUuid(item.uuid)` before calling `completeItemUse()`/`activity.use()`. Helpers `completeItemUseNoFumble()`/`completeActivityUseNoFumble()` handle this.

## Build Commands

```bash
npm run build        # Production: typeCheck + esbuild → single midi-qol.js. USE THIS — never devbuild.
npx gulp devWatch    # Watch mode (only when explicitly working on a dev-server flow)
npm run compilePacks # JSON (pack-src/) → LevelDB (packs/) for sample items
npm run extractPacks # LevelDB → JSON with ID generation
```

Tests are in a separate module:
```bash
cd /home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-tests && npm run build
```

## Planned Refactors

### Cross-Scene Teleport (Review on Foundry Upgrades)
`_teleportToken` in GMAction.ts reimplements Foundry's cross-scene teleport pattern (create token, migrate combatants, delete origin, pull user) because Foundry's teleport API (`TeleportTokenRegionBehaviorType._teleportToken`) is region-based and requires a `RegionDocument` destination — there's no coordinate-based teleport API. If Foundry adds a public coordinate-based teleport or changes the region teleport behavior (e.g., new hooks, data migration steps), update `_teleportToken` to match. Reference: `foundryv13/resources/app/client-esm/data/region-behaviors/teleport-token.mjs`.

### Advantage Refactor
Migrate `checkAttackAdvantage()` and `checkTargetAdvantage()` (~15 separate eval calls in Workflow.ts:3581-4020) to use centralized `computeAdvantageFlags()` from patching.ts. Keep geometric/rule-based checks (flanking, visibility, nearby foe, heavy weapon) separate. See `patching.ts` for the pattern used by saves/death saves/ability checks.
