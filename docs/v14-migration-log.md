# midi-qol v14 Migration Log

Tracks all changes made to midi-qol-14x for Foundry v14 compatibility.

## Foundry v14 Key Schema Changes (Reference)

See `dae-14x/docs/v14-migration-log.md` for the full ActiveEffect schema reference. Summary:

- **Changes**: `changes[]` with numeric `mode` -> `system.changes[]` with string `type`
- **Duration**: `duration.seconds/rounds/turns` -> `duration.value` + `duration.units`
- **Start data**: `duration.startTime/startRound/startTurn/combat` -> `start.time/round/turn/combat`
- **Detection modes**: Array -> keyed object
- v14 `migrateData()` auto-migrates all of the above when loading from JSON source

---

## Completed Migrations

### 2026-03-21: Detection Modes fix in utils.ts

**File:** `src/module/utils.ts` (~lines 7853-7941, `_canSenseModes()`)

**Problem:** `tokenDetectionModes.find is not a function` — v14 changed `token.detectionModes` from an array of `{id, enabled, range}` to a keyed object.

**Fix:**
- `.find(m => m.id === id)` -> direct property access `[id]`
- `for (const detectionMode of tokenDetectionModes)` -> `for (const [modeId, detectionMode] of Object.entries(tokenDetectionModes))`

### 2026-03-21: pack-src Sample Items — ActiveEffect Schema Migration

**Script:** `scripts/migrate-pack-src-v14.mjs`

**Scope:** 102 non-folder JSON item files in `pack-src/sampleitems/`.
**Result:** 81 files changed, 99 effects migrated.

**Transformations applied to each effect:**

1. **Moved `changes[]` to `system.changes[]` and converted `mode` -> `type`**:
   - Numeric mode mapping: `{0:"custom", 1:"multiply", 2:"add", 3:"downgrade", 4:"upgrade", 5:"override"}`
   - Top-level `changes` array deleted after move

2. **Converted duration fields**:
   - `duration.seconds: N` -> `duration: {value: N, units: "seconds"}`
   - `duration.rounds: N` -> `duration: {value: N, units: "rounds"}`
   - `duration.turns: N` -> `duration: {value: N, units: "turns"}`
   - All-null duration -> `duration: {}`

3. **Moved start data**:
   - `duration.startTime` -> `start.time`
   - `duration.startRound` -> `start.round`
   - `duration.startTurn` -> `start.turn`
   - `duration.combat` -> `start.combat`
   - `start` object only created if at least one non-null value exists

4. **Removed deprecated `tint: "#ffffff"`** (v14 default is `null`)

**Note:** v14's `ActiveEffect.migrateData()` auto-migrates all the above when loading JSON, so old-format files would still work. But having native v14 format in source avoids deprecation warnings and keeps extracted packs consistent.

### 2026-03-21: pack-src Sample Items — Macro Code v14 Fixes

**Script:** `/tmp/fix-macros-v14.mjs` (automated), `/tmp/fix-dialogs-v14.mjs` (Dialog conversions)

**Phase 1: Automated fixes** — 14 files, 67 changes:

1. **Bare `getProperty()`/`setProperty()` -> `foundry.utils.getProperty()`/`setProperty()`** (5 files)
   - Arcane Ward, Slayer's Prey (x2), Retribution, Sneak Attack 12.4.15, Longsword of Wounding, Rakish Audacity

2. **Numeric `mode: N` in programmatic effect data -> `type: "string"`** (4 files, 10 occurrences)
   - Slayer's Prey (x2): `mode: 5` -> `type: "override"`
   - Emboldening Bond: `mode: 5` -> `type: "override"` (x4)
   - Spirit Guardians: `mode: 0` -> `type: "custom"`, `mode: 5` -> `type: "override"`

3. **`icon:` in effect creation -> `img:`** (4 files)
   - Slayer's Prey (x2), Emboldening Bond, Branding Smite

4. **`label:` in effect creation -> `name:`** (3 files)
   - Slayer's Prey (x2), Emboldening Bond

5. **`effect.changes` / `eff.changes` -> `.system.changes`** (3 files)
   - Fey Ancestry, Absorb Elements (x2), Antitoxin

**Phase 2: Dialog v1 -> DialogV2** — 4 files, 9 conversions:

1. **Sneak Attack / Rakish Audacity confirm dialogs** (3 files)
   - `new Dialog({...}).render(true)` wrapped in Promise
   - -> `await foundry.applications.api.DialogV2.confirm({window: {title}, content, rejectClose: false, modal: true})`
   - Files: Rakish Audacity, Sneak Attack 12.4.15, Sneak Attack

2. **Absorb Elements dropdown dialog** (1 file)
   - Complex Dialog with select dropdown and async callback
   - -> `await foundry.applications.api.DialogV2.prompt({..., ok: {callback: (event, button) => button.form.elements.element.value}})`
   - Effect update logic moved outside the dialog callback

**Not changed (already v14-compatible):**
- Reverse Gravity, Mass Heal: Already use DialogV2-compatible `{ action, label, callback }` button pattern
- Shove: `label` is on a custom action config object, not an ActiveEffect
- ChatMessage.create calls: Still valid in v14
- `activity.actionType`, `activity.damage.parts`: dnd5e activity API, not Foundry core — unchanged in v14
