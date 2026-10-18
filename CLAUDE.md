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

#### CAT (Covens Automation Toolkit) wiki — authoritative for v14 macro authoring
- **Wiki root**: `https://github.com/chrisk123999/covens-automation-toolkit/wiki`
- **Guidelines for Macro Writers** (v13→v14 changes, helper rename table): `.../wiki/Guidelines-for-Macro-Writers`
- Other pages: `.../wiki/Macro-Scope`, `.../wiki/Events` (trigger prefixes + the `roll` pass list)
- **Fetch the RAW markdown**, not the rendered page — the rendered fetch returns only a summary and drops the rename table:
  `https://raw.githubusercontent.com/wiki/chrisk123999/covens-automation-toolkit/<Page-Name>.md`
- **Reference implementation** upstream cites: `chris-premades` branch `main`, `scripts/macros/modern/spells/chromaticOrb.mjs` (raw: `https://raw.githubusercontent.com/chrisk123999/chris-premades/main/scripts/macros/modern/spells/chromaticOrb.mjs`)
- ⚠ The wiki is written against a **newer CAT than any release** — verify every entry against the local `cat-14x` checkout before adopting it (some documented helpers exist in neither the tag nor `origin/main`).
- **Follow upstream's stated intent** wherever the wiki defines a usage pattern, rather than inventing a local convention.

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
- **item-delete-check** (`/home/timp/foundry-data/foundryv13/Data/modules/item-delete-check/`): Single `main.js`, no build step, `master` branch.

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
   - ALL IDs: item `_id`, effect `_id`, activity `_id`. 15-char IDs cause silent failures: Foundry silently regenerates them on import, breaking any stored references to that ID.
   - **MANDATORY VERIFICATION**: After creating ANY ID, count the characters explicitly (e.g., `sgGuardianSpd000` = s-g-G-u-a-r-d-i-a-n-S-p-d-0-0-0 = 16 ✓). Do NOT rely on visual pattern matching — IDs that "look the right length" are the most common source of bugs.
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

10. **Deprecated flag paths**: Use `flags.midi-qol.advantage.save.xxx` not `flags.midi-qol.advantage.ability.save.xxx`. Same for `disadvantage`, `check`, and `grants` variants. Fail/success/min/max are not flags on dnd6: see #44.

11. **Vitality death status**: Use `CONFIG.statusEffects.find(se => se.id === "dead")`, NOT `getDeadStatus()` — the latter returns status based on settings (may return unconscious). `setDeadStatus` removes conflicting statuses first.

12. **`options.midi` is set for ALL damage** — `dnd5e.preCalculateDamage` sets `options.midi.totalDamage` unconditionally. To detect non-midi damage, note that midi-qol uses `actor.update()` directly (not `actor.applyDamage()`), so `dnd5e.preApplyDamage` only fires for non-midi damage.

13. **Spell scaling via `midiOptions.spellLevel`** — dnd5e's `_prepareUsageScaling` derives scaling from `actor.system.spells[usageConfig.spell.slot].level`. When calling `completeActivityUse` programmatically, midi sets `usage.spell.slot = "spell${midiOptions.spellLevel}"` before `super.use()` so dnd5e's scaling logic works without consuming a slot.

14. **Duration management moved from times-up to DAE (v14)**
    - All duration management lives in DAE (`specialDurations.ts`); times-up-14x is a stub re-exporting utilities.
    - DAE settings: `expiryAction` (special durations: default/update/delete), `coreExpiryAction` (sets `CONFIG.ActiveEffect.expiryAction`), `expireRoundEffectsOnCombatEnd`. Per-effect override `flags.dae.expiryMode`. There is no `durationManagementEnabled`.
    - DAE does no rest-time expiry; midi handles `shortRest`/`longRest` special durations.
    - DAE API exports `expireEffect`, `isEffectExpired`, `isTransferEffect`, `hasDuration`, `hasExpiry`.

15. **Persisted workflow fields go through `PersistedFieldStore`** — Workflow.ts fields backed by chat-card flags (scalars, token Sets, Roll/Roll[], DamageDescription[]) use `this.#persisted.scalar/tokenSet/roll(s)/damageDetail` accessors, not hand-rolled `#field` + getter/setter pairs. The store owns caching, flag fallback, and serialization (including `Roll.fromData` rehydration). New persisted fields should use it; only genuinely special accessors (`currentAction`, `isCritical`/`isFumble`, `activity`, `item`, `token`, `otherDamageMatches`) remain hand-written.

16. **Never call `getRollData()` from `ActiveEffect#getReplacementData` or `#shouldApplyChange`** — both run inside `applyActiveEffects`, i.e. inside data preparation. Re-preparing a document from there recurses until the renderer crashes (no CPU spike, debugger won't pause, CDP evaluate times out). Item-target roll data belongs in DAE's `daeApplyChange` wrapper, where the target document is not the one being prepared.

17. **DAE registers its libWrapper patches in `DAEdnd5e.initActions()`, not `DAESystem.initActions()`** — the dnd5e subclass overrides the base wholesale. Registering in the base silently no-ops: no error, methods just stay unwrapped.

18. **Evaluating effect change values must be gated on a numeric target** — `flags.midi-qol.optional.*` bonuses are roll fragments, so evaluating `"+2"` to `"2"` breaks the formula. DAE gates on the current value being a number or ValidSpec `fieldType === "number"`. Core evaluates formulas only in `NumberField._castChangeDelta`; non-schema keys get `Number(raw) || 0`, which is why arithmetic on flags needed handling at all.

19. **Test keys must be verified to exercise the behaviour under test** — `system.attributes.ac.bonus` has ValidSpec phase `initial` (not final, despite comments claiming otherwise), and dnd5e coerces `system.attributes.movement.walk` to a number in derived data. Both silently made acceptance tests pass against unfixed code. Use `system.attributes.ac.flat` for phase correction and `system.bonuses.*` for FormulaField behaviour.

20. **v14: times-up is not a module; DAE expires effects** — any `installedModules.get("times-up")` / `globalThis.TimesUp` check in the v14 branch is a bug. Effects with a DAE special duration (the reaction and bonus action markers carry `turnStart`, `combatEnd`, `shortRest`) are expired by DAE/core; midi deleting them too races that expiry and throws `ActiveEffect "dnd5ereaction000" does not exist`. Use `isEffectExpired` (delegates to `DAE.isEffectExpired`) and let DAE do the deleting. Core has one `duration.expiry` slot, so DAE keeps `combatEnd` as a special duration when another event takes the slot.

21. **Updating an item effect on an unlinked token can silently no-op** — when the token's delta overrides the item, the server diffs an effect update against the *base* actor's copy; a value the base already has is dropped as "unchanged" while the token keeps its old one. Verify against `token.delta._source`, not the synthetic document.

22. **dae-dnd6-only DAE behaviour that is not backported to dae-14x** — unconditional `ATL.*` → `token.*` conversion, including `ATL.width/height/depth/shape` (dnd5e 6 implements `TokenDocument#_onOverrideSize`; dnd5e 5.x doesn't, so v14 keeps them as `ATL.*`). Keys core can't target (`elevation`, `hidden`, `rotation`) are kept, never deleted, on both branches, and the migration no longer rewriting pre-v10 `data.` keys / midi optional `.all` (no user-visible gain; v14 worlds are already migrated). Their tests are gated with `itDnd6` (batches 24, 25). Per-change/effect-level conditions (batch 19) are a dnd5e 6 feature, not portable. DAE's change-dialog additions (value suggestions and checks, the `hp.max` note, the raise-current-HP checkbox) are dnd6 only; their mechanisms are ported.

23. **`hp.max` ADD replaces a calculated max** — a character whose max dnd5e calculates has `hp.max` null in source; an initial-phase add makes it `0 + X`, which dnd5e then treats as a fixed max (12 → 5). A final-phase add comes after `effectiveMax`, the healing cap and `pct` are set, so it only changes the displayed number. Bonuses go to `hp.tempmax` (any creature; dnd5e's Aid), `hp.bonuses.overall` (a character's calculated max) or `hp.formula` (NPC HP rolled at token placement). DAE's "raise current HP" grant happens once per effect (re-enabling must not heal again), only ever raises current HP, and on removal clamps the stored value — dnd5e clamps current HP only for display.

24. **dnd5e 5.3 effect changes have no `_id`; dnd5e 6 changes do** — anything that identifies a change (DAE's `flags.dae.raiseCurrentHp`, grant records) must fall back to the change key on v14.

25. **dnd5e's `_enrichChatCard` is async** — it draws the avatar header after an await, so anything midi writes to the header in its synchronous override is overwritten. Work that must follow dnd5e's enrichment (the player speaker name) runs on the returned promise, and midi's override returns it so `renderHTML`, which awaits `_enrichChatCard`, waits too.

26. **Adjusting a token as it is created: `preCreateToken`** — core runs the document's `_preCreate` (where dnd5e rolls an unlinked NPC's HP into the delta) before the `preCreateToken` hook, on the same pending document, so the hook sees the rolled values and `updateSource` there lands in the created token without a second update.

27. **dnd5e 6 changes effect expiry; DAE tests must expect each version's rules** — dnd5e 6 owns the source/target expiries (`PSEUDO_EXPIRIES`), clears `duration.value` for them via `expirySupportsDuration` (dae-dnd6 overrides that static so they keep a duration, as on 5.x, and labels "N Rounds, then …"), ends them on any time advance out of combat, and deletes an effect flagged `duration.expired` once its actor is not in that combat (kept in combat, deleted on leaving it). On dnd5e 5.x DAE implements source/target itself and Mark Expired keeps the effect. Out of combat, time passing ends effects as core does (every event but combatStart, at once without a duration); DAE once blocked that for durationless effects, which also stopped dnd6's source/target expiries ending, so don't reintroduce such a guard. On dnd6 only, DAE's Elapsed Time (`updateWorldTime`) expiry is retired in favour of dnd5e's in-combat Turn Start default (mapped to null in DAE's `_preCreate` wrapper, before dnd5e's `_preCreate`; kept as an `isExpiryEvent` alias for stored effects); v14 keeps it in the dropdown, but on dnd5e 5.x DAE reproduces dnd5e 6's in-combat Turn Start default (`defaultInCombatExpiry`, after dnd5e's `_preCreate`) its combat-exit removal of source/target and expired effects (`Combat#_onExit` wrapper) and its deletion of an effect marked expired outside that combat (`updateActiveEffect` hook; unlike dnd5e, never an item's own effect), gated by `daeManagesTurnExpiry` so dnd5e 6 is never doubled; midi/DAE stamp `null` on inherited durations on both. With no combat, core prepares round/turn durations as seconds, so read `_source.duration` for units. Test combats must be `active: true` on a scene, or `game.combat` briefly reads empty after an effect is created and the next effect gets no `start.combat`. DAE's editor must call `super._onRender` (dnd5e's sheet hides duration fields and the base sheet disables read-only forms there). DAE batch 22 asserts both versions (`isDnd5eV6()` branches, `itDnd6`); don't skip a dnd6 difference, assert it.

28. **Foundry 14 message modes: dnd5e's field is still called `rollMode`** — core's `ChatMessage.create` and `Roll#toMessage` take `messageMode` (a `CONFIG.ChatMessage.modes` key: public/gm/blind/self/ic); their `rollMode` option still works but warns. dnd5e 5.3 and 6 keep `rollMode` in their message config and `BasicRoll.toMessage`, but its values are message modes. `ChatMessage.applyMode` silently falls back to the user's default for a legacy name (`gmroll`), so convert with `rollModeToMessageMode`/`applyMessageMode`. dnd5e 5.3 itself calls the deprecated `ChatMessage#applyRollMode` (its suppression pattern only matches the static), so midi's `ChatMessageMidi` overrides it on v14. dnd5e 5.3 marks whispered/blind messages by background colour; dnd5e 6 by a 3px coloured bottom border — midi's border CSS differs per branch accordingly.

29. **Testing deprecations** — `CONFIG.compatibility.mode = FAILURE` throws on any deprecation; narrow it with `includePatterns`, which match the stack as well as the message, so a helper named e.g. `withRollModeFailures` matches `/RollMode/` — use the deprecation texts. `once: true` warnings are keyed by message+stack, so give probe effects unique names. A warning raised inside data preparation must not throw (it breaks the actor): use `ERROR` mode with a temporarily replaced `logger.error`.

30. **`Roll#evaluateSync` cannot roll dice on Foundry 14** — strict throws, non-strict silently skips the dice (`1d4` → 0). Anything that may contain dice must `await roll.evaluate()`. `MidiQOL.addRollTo` stays synchronous (dice-free rolls only, error points to `addRollToAsync`).

31. **An empty array is truthy in dnd5e's sheets** — dnd5e 6's activity sheet builds the effects list when `context.activity.effects` is truthy, then reads the schema's `effects` field. midi's forward activity had `get effects() { return [] }` while dnd5e deletes that field for forwards, so the sheet threw. Don't add fallback getters for fields dnd5e removes from a schema.

32. **dnd5e 6 transform *Select Form*: the activity's effects are the forms** — dnd5e applies only the chosen one, to the caster (or its targeted tokens), in `_triggerSubsequentActions`. midi defers form mode to dnd5e and `resolveEffects` returns none for it, or the workflow applies every form to the targets.

33. **DAE macro arguments: `lastArg` is appended** — an omitted optional trailing argument (e.g. `macro.actorUpdate`'s undo) receives `lastArg`; check `arg === lastArg`. Arguments are also split at `+ * / % , ( ) ^ !` and comparisons, so `+5` must be quoted. Activity macros resolve from `flags.dae.activity` at run time; effects have no `activity` property.

34. **dnd5e 6 moved fields: compatibility aliases exist only on entries dnd5e builds** — e.g. `tools.<id>.bonuses.check` → `roll.bonus`, `abilities.<id>.bonuses.save` → `save.roll.bonus`. Objects DAE creates (a new tool entry) have no alias, so write and read the new paths. `system.tools.all` iterates `CONFIG.DND5E.tools`, not `toolProficiencies` (categories).

35. **fvtt-types (13.x) lacks Foundry 14 fields** — effect `duration.expiry`/`value`: `@ts-expect-error fvtt-types v14 duration` (midi) / `v14 duration.expiry not in fvtt-types yet` (DAE). `messageMode` on `ChatMessage.create` and `ui.chat.updateMessage` are merged in `globals.ts`. `CONFIG.ChatMessage.modes` cannot be merged (inline object type) and takes `@ts-expect-error`.

36. **dnd6: an applied effect's source is `system.origin`, not its `origin`** — DAE/midi record it as dnd5e 6 does (activity or item, concentration in `effect`, card in `message`, profile); dnd5e derives `origin` as the concentration effect, else the activity, so `origin` is not an Item and an activity's `.parent` is system data. Read the source with `DAE.getEffectSource` (parses uuids; safe in preparation) and item data with `DAE.getEffectItemData`/`getEffectItem` (live item, else the card's snapshot); applied effects no longer carry `flags.dae.itemData`. midi passes concentration as `concentrationUuid`, never its own `origin`. Caster-side template/summon/transform effects keep the item as origin, like dnd5e's concentration effect.

37. **Foundry 14 token movement for the teleport activity** — `Token#planMovement` throws unless the user owns the token, so moving others (willing creatures, unwilling targets) uses `canvas.tokens.placeTokens(data, { create: false, preConfirm, preSkip })` as a point picker (a preview; nothing is created) and the GM moves them via midi's `moveToken` (`blink`, walls/tokens ignored). Movement history isn't recorded out of combat, so tests read the action from the `moveToken` hook's `movement.passed.waypoints`. An activity type midi doesn't wrap has no workflow: `completeActivityUse` must not wait for one (`isMidiActivity`).

38. **Fixed-id effects go through the actor's effect queue** — statuses (`dnd5edead0000000`…) and the reaction/bonus action markers have fixed ids, so a concurrent create/delete on one actor fails, and Foundry toasts the error before the promise rejects (catching doesn't hide it). Use `toggleStatus` / `queueActorEffects` (utils.ts), never `actor.toggleStatusEffect` or a bare create/delete. midi checks at turn start and combat end (preferred GM, after 500ms) that DAE removed expired markers.

39. **Custom D&D 5e** — its Conditions config replaces `CONFIG.statusEffects` (midi re-adds its statuses on `customDnd5e.setStatusEffectsConfig`); its average/mob/probabilistic damage cancels dnd5e's damage roll; custom dice set `criticalSuccess`/`criticalFailure`, so midi's crit/fumble checks use those and the kept faces, not 20/1. Settings that clash with midi are reported by `featureOverlaps.ts` (GM card + TroubleShooter Auto Fix). Not ported to v13.

40. **Test world browsers** — v14 on `http://127.0.0.1:30001`, dnd6 on `http://localhost:30002` (separate hosts, or the session cookies collide and login loops). v13 (when :30000 runs quench-test) on `http://127.0.0.2:30000`. Drive the CDP Chrome (:38287) with `~/foundry-cdp/` (`login.mjs`, `reload.mjs`, `nav.mjs`, `window.mjs`, `loadwarnings.mjs`), one window per world; never write a login loop or bring a window to the front. A full suite can outlast `cdp.mjs`'s 15-minute evaluate (dnd6 ~15 min): start it in the page, keep the results on `globalThis`, and poll.

41. **Visibility checks never change the token** — `canSense`/`canSee` check a token without sight with a detached vision source cached per token (`checkVisionSource`, keyed on its vision data and a wall/light/scene generation), never by setting `sight.enabled`, assigning `token.vision` or adding to `canvas.effects.visionSources` (#1571: a later document update reset `sight.enabled` but left a stale source). Callers that must check regardless of *Force vision when checking* pass `{ forceVision: true }` (the workflow's invisible/unseen checks do).

42. **Ability check fields follow the rolled ability** — a skill or tool roll's ability can be passed in or changed in the roll dialog. dnd5e applies its own min/max for the rolled ability; midi applies `abilities.<id>.check.roll.fail`/`success` of a changed ability in `dnd5e.postBuildSkillRollConfig` / `postBuildToolRollConfig` from `config.data.abilityId`, which fire for every build with or without the dialog (#1572). Fields evaluated before the dialog use `config.ability`, not the skill's default.

43. **Versions** — midi's version is `package.json` (`module.json` is a template filled by gulp); DAE's is `src/module.json`. A midi release that relies on a DAE change raises the DAE minimum in midi's `module.json` and says so in the changelog. Bumping DAE's version in `src/module.json` also means updating its `download` zip name (`package/dae-v<version>.zip`) to match, and copying the changed `module.json` into DAE's `package/` folder (the manifest URL serves `package/module.json`).

44. **dnd6: fail/success are conditions on dnd5e's roll fields** — `rollFields.ts` patches `D20RollModificationField.prototype._initialize` on import (SchemaField builds its fields in its constructor, so this must run before dnd5e's models are built) to add `fail`/`success` StringFields to every roll field. They combine as dnd5e combines min/max (save: `abilities.<id>.save.roll` + `rolls.ability.save`; skill/tool add the ability's check fields; attack: `abilities.<id>.attack.roll` + `rolls.attack(.<type>)`; death save only `attributes.death.roll`) via `fieldPaths` in `RollModifierFlags`. min/max are dnd5e's alone. The old `flags.midi-qol.fail/success/min/max.*` keys are DAE field mappings (`rollFieldMappings`), not read by midi; only `fail/success.all`, `.ability.all` and `.save.school.*` remain flags. `evalAllConditions` stores results for `system.` keys under `flags.midi.evaluated.system.` (never write into system data). Not on v14/dnd5e 5.3 (no `rolls.*` fields), by decision. Tests: `resetActors` clears the fields.

45. **dnd6: dnd5e decides advantage; one key model; one d20 wrapper** — `RollModifierTracker` holds midi's sources as dnd5e counts (each side: count, suppressed, override) plus the roll's dnd5e context (`useDnd5eSources`: actor, `mode` fields, `AppliedRules`). `advantageMode`/`isActive` are `AdvantageModeField.combineFields` over the counts and rules (suppression beats override, as in dnd5e), computed on demand; a restored tracker (no actor) uses the verdict saved in `toJSON`. Held keys are not tracked beforehand: dnd5e ORs them into the roll after everything, and `reconcileWithRoll` records the roll as made ("Key Press" or the dialog's choice) — after attacks and in `doD20Roll`. The choice dialog's `buildConfig` writes `advantageMode` only for an open dialog. dnd5e sources are attributed for display only (`attributeDnd5eSources`, `change.applied` skips failed conditions). `applyTrackerAdvantage` clears a side only when a known source claims it (`claims`) but the verdict denies it — dnd5e resolves concentration/death fields apart from its rules, and leaves sources midi doesn't model (travel pace). Flags: one table (`advantageFlagChecks`), async `computeAdvantageFlags` and sync `computeAdvantageFlagsSync` (initiative hook). Keys: `lib/rollKeys.ts` — `heldKeys`, `keyMode` (dnd5e rules + midi's Shift+Alt+Ctrl = forced normal), `decideRollDialog`, `dialogShown`, `releaseForcedNormalKeys` from global `dnd5e.preRollD20TestV2`/`preRollDeathSaveV2` hooks (V2 fire after midi's own pre-roll hooks). Saves, checks, skills and tools share `doD20Roll`; their differences are `D20_ROLL_KINDS` entries. Passed-in advantage (other modules, midi's own hand-offs, macros) replaces midi's evaluation.

## Testing

Tests use the Quench framework in separate test modules (not embedded in the main module source). Each major version branch has its own test module:
- **midi-qol tests (v13)**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-tests/` — for midi-qol-13x, accesses midi-qol via `globalThis.MidiQOL`
- **midi-qol tests (v14)**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-tests-v14x/` — for midi-qol-14x
- **DAE tests (v14 and dnd6)**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/dae-tests-14x/` — one module for both dae-14x (dnd5e 5.x) and dae-dnd6, accesses DAE via `game.modules.get("dae").api` and `globalThis.DAE`. Tests of dae-dnd6-only behaviour must be gated: whole batches with `if (isDnd5eV6()) register…()`, single tests with `const itDnd6 = isDnd5eV6() ? it : it.skip`.

**CRITICAL: Never remove tests without explicit user consent.**

Before running suites on :30001/:30002, "test scene" (`Ha0MAUFx9RWCQmui`) must be the ACTIVE scene (not "test scene (Copy)") with the canonical token layout (see memory `test-scene-active`); otherwise trap, vision and template-height tests fail spuriously. Baseline (2026-10-18): dnd6 full suite (midi, DAE and other test modules) 1539 pass / 21 pending; v14 midi 803 / 19 and DAE 371 / 58 (dnd6-only pending); v13 midi 601 + 24 (damage cards, batch id `midi-qol.damageCardTests`) with only 32.12/32.13 failing (the per-actor status queue is not on v13, by decision). Packaging (`gulp package`) deletes `dist/`, which the dev servers load from — rebuild afterwards.

### Test Conventions
- **midi-qol**: Batch ID `quench.midi-qol.{camelCaseName}`, displayName `"{number}. {Title} Tests"`, export `register{Number}{PascalCaseName}Tests`
- **DAE**: Batch ID `quench.dae.{camelCaseName}`, displayName `"{number}. {Title} Tests"`, export `register{Number}{PascalCaseName}Tests`
- No module name in displayName (exception: `flags.midi-qol` / `flags.dae` references)
- Every test starts with `await testMessage("6.1", "description")` before `this.timeout()`

### Test World
- **Live**: `/home/timp/foundry-data/foundryv13/Data/worlds/quench-test` (git: `git@gitlab.com:tposney/quench-test-world.git`)
- **Distributable**: `/home/timp/foundry-data/foundryalpha/Data/modulesrc/quench-test-install` — run `node build.js` to build, `node build.js release` to release
- **Actors**: `actor1Name` ("actor1"), `actor2Name` ("actor2"), targets: `target1Name` ("Orc1" — 20ft away), `target2Name` ("Orc2" — 5ft), `target3Name` ("Skeleton1")
- **Vitality testing**: Restore vitality FIRST, then HP. Always clean up prone/dead/defeated in finally blocks.
- **Activity cloning**: `activity.use()` clones the item — after `item.update()`, get fresh reference via `fromUuid(item.uuid)` before calling `completeItemUse()`/`activity.use()`. Helpers `completeItemUseNoFumble()`/`completeActivityUseNoFumble()` handle this.

## Build Commands

```bash
npm run build        # Standard build: typeCheck + esbuild → single midi-qol.js. Always use this.
npm run devbuild     # AVOID: outputs to devDir without typecheck. Use `npm run build` instead.
npx gulp devWatch    # Watch mode
npm run compilePacks # JSON (pack-src/) → LevelDB (packs/) for sample items
npm run extractPacks # LevelDB → JSON with ID generation
```

Related modules:
```bash
cd /home/timp/foundry-data/foundryalpha/Data/modulesrc/dae-14x && npm run build   # DAE v14: typeCheck + gulp → dist/dae.js
cd /home/timp/foundry-data/foundryalpha/Data/modulesrc/dae-10x && npm run build   # DAE v13
```

Test modules:
```bash
cd /home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-tests && npm run build      # midi-qol v13 tests
cd /home/timp/foundry-data/foundryalpha/Data/modulesrc/midi-qol-tests-v14x && npm run build # midi-qol v14 tests
cd /home/timp/foundry-data/foundryalpha/Data/modulesrc/dae-tests-14x && npm run build       # DAE v14 tests
```

## Planned Refactors

### Cross-Scene Teleport (Review on Foundry Upgrades)
`_teleportToken` in GMAction.ts reimplements Foundry's cross-scene teleport pattern (create token, migrate combatants, delete origin, pull user) because Foundry's teleport API (`TeleportTokenRegionBehaviorType._teleportToken`) is region-based and requires a `RegionDocument` destination — there's no coordinate-based teleport API. If Foundry adds a public coordinate-based teleport or changes the region teleport behavior (e.g., new hooks, data migration steps), update `_teleportToken` to match. Reference: `foundryv13/resources/app/client-esm/data/region-behaviors/teleport-token.mjs`.

### Advantage Refactor
Migrate `checkAttackAdvantage()` and `checkTargetAdvantage()` (~15 separate eval calls in Workflow.ts:3581-4020) to use centralized `computeAdvantageFlags()` from patching.ts. Keep geometric/rule-based checks (flanking, visibility, nearby foe, heavy weapon) separate. See `patching.ts` for the pattern used by saves/death saves/ability checks.
