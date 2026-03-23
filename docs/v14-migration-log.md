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

### 2026-03-22: Source Code — Remaining `.changes` and `CONST.ACTIVE_EFFECT_MODES` References

**Files:** `src/module/utils.ts`, `src/midi-qol.ts`

**Changes (5 sites):**

1. **`utils.ts` `getAllChanges()`** (~line 7815): `foundry.utils.duplicate(e.changes)` → `e.system.changes`
2. **`utils.ts` `cleanCPRFlanked()`** (~line 9385): `foundry.utils.deepClone(cprEffect.changes)` → `cprEffect.system.changes`
3. **`utils.ts` `cleanCPRFlanked()`** (~line 9397): `cprEffect.update({ "changes": ... })` → `{ "system.changes": ... }`
4. **`midi-qol.ts` specials registration** (~line 448): `CONST.ACTIVE_EFFECT_MODES.CUSTOM` → `"custom"` (onUseMacroName)
5. **`midi-qol.ts` specials registration** (~line 450): `CONST.ACTIVE_EFFECT_MODES.CUSTOM` → `"custom"` (optional.NAME.macroToCall)

All 3 `system.changes` accesses needed `@ts-expect-error` — fvtt-types don't include `ActiveEffectTypeDataModel` yet.

### 2026-03-22: `markFlanking` Race Condition Fix

**File:** `src/module/utils.ts` (~line 7511)

**Problem:** `markFlanking` called concurrently from `targetToken` hook (debounced 150ms), workflow `checkFlankingAdvantage`, and `TargetConfirmation`. The CPR effect branch uses check-then-create (`effects.get()` → `createEmbeddedDocuments(..., { keepId: true })`) which isn't atomic — concurrent calls both pass the check, second create throws "effect already exists" with a Foundry UI notification error.

**Fix:** Serialized via promise chain. `markFlanking` is now a synchronous function that queues calls onto `_markFlankingPromise`. The actual logic moved to `_markFlankingImpl`. Each call waits for the previous to complete (success or failure) before executing, eliminating the race window.

```typescript
let _markFlankingPromise: Promise<boolean> = Promise.resolve(false);
export function markFlanking(token?, target?): Promise<boolean> {
  _markFlankingPromise = _markFlankingPromise.then(
    () => _markFlankingImpl(token, target),
    () => _markFlankingImpl(token, target)
  );
  return _markFlankingPromise;
}
```

### 2026-03-22: Lessons — v14 AnyField Value Handling

Two important behavioral differences when using native v14 schema vs the backward-compat shim:

1. **`AnyField` stores values as-is** — no `JSON.parse` conversion. The v13 shim's `#migrateChangeValue` converted `"-10"` → `-10`, `"true"` → `true`. Native v14 schema does not. **Always use string values** for effect changes (preserves Roll expression support). Code consuming values must handle strings.

2. **`type: "override"` replaces Set fields entirely** — For dnd5e Set-based fields (`system.traits.dr.value`, `system.traits.di.value`), override converts the Set to a plain value/Array, breaking `.has()` downstream. **Use `type: "add"` for Set fields** — v14's `SetField._applyChangeAdd` properly adds elements to the existing Set.

### 2026-03-22: MeasuredTemplate → Region Migration

**Problem:** Foundry v14 deprecated `MeasuredTemplate` documents. They are transparently converted to `Region` documents via a compatibility layer (deprecated v14→v16). The compat layer intercepts `createEmbeddedDocuments("MeasuredTemplate", ...)` and creates Regions instead, returning proxy `MeasuredTemplateDocument` objects. However several hooks and patterns break:

- `preCreateMeasuredTemplate` hook does NOT fire (only `preCreateRegion`)
- `deleteMeasuredTemplate` hook does NOT fire (only `deleteRegion`)
- `refreshMeasuredTemplate` fires ONLY during preview placement
- Proxy `.object` (placeable) is undefined after placement — no `shape.contains()` or `template.center`
- Template UUIDs resolve through expensive `scene.templates` compat getter with deprecation warnings

**Files changed:**

| File | Changes |
|------|---------|
| `Hooks.ts` | Added `deleteRegion` hook (filters `flags.core.MeasuredTemplate`, delegates to `checkDeleteTemplate`). Added `preCreateRegion` hook (filters template-backed regions, runs range validation from Region shape data). |
| `patching.ts` | Widened `checkDeleteTemplate` signature to accept `MeasuredTemplateDocument \| RegionDocument` — function only uses `.uuid` and `.getFlag()` which work on both. |
| `activityHelpers.ts` | Modified `computeTargetsFromTemplate()` to fall back to Region when no placeable available: resolves UUID → checks `doc.documentName === "Region"` or looks up `canvas.scene.regions.get(id)`. Added `computeTargetsFromRegion()` using `regionDoc.testPoint({x, y, elevation})`. Added `isTokenInsideRegion()` mirroring `isTokenInside()` with wall-blocking and levels 3D support. |
| `Workflow.ts` | `processPlacedTemplates()` resolves proxy MeasuredTemplate to RegionDocument via `canvas.scene.regions.get(tDoc._id)`, stores Region UUID. `setupTemplateCleanup()` type widened. `template` getter/setter widened to `foundry.abstract.Document.Any`. Template deletion casts updated. `calculateCoverSaveBonus()` accepts pre-computed `templateCoverOrigin` position extracted from Region shape data. TrapWorkflow uses `deleteEmbeddedDocuments("Region", ids)`. |
| `globals.ts` | `ProcessTargetSaveContext` type: added optional `templateCoverOrigin` field. |
| `MidiActivityMixin.ts` | `_placeEmanationTemplate()` resolves proxy to Region, stores Region UUID, passes UUID strings to `selectTargetsFromTemplates()`. WalledTemplates `attachTemplate()` guarded with null check on `.object`. |
| `undo.ts` | Template deletion cast widened to `foundry.abstract.Document.Any`. |

**Key design decisions:**

1. **Region lookup pattern**: `canvas.scene.regions.get(proxyDoc._id)` — proxy `_id` matches Region `_id`.
2. **UUID storage**: Store `Scene.xxx.Region.yyy` UUIDs. Old `MeasuredTemplate` UUIDs still work via compat layer.
3. **Region targeting**: `regionDoc.testPoint({x, y, elevation})` handles 2D polygon containment + elevation range. VolumetricTemplates/WalledTemplates not supported for Region path (those modules need their own v14 updates).
4. **Cover origin**: Pre-computed from Region shape data (or template placeable) and passed through `ProcessTargetSaveContext.templateCoverOrigin`, avoiding dependency on template placeable in `calculateCoverSaveBonus`.

---

## Phase 3 — Enhancement Options (Future Work)

### 3.1 Region token events for auto-retargeting
Use `tokenEnter`/`tokenExit`/`tokenMoveIn`/`tokenMoveOut` events on template-backed Regions to automatically re-target tokens that move in/out of AoE zones. Currently targeting is only computed at placement time or via Overtime polling.

### 3.2 Region turn events for Overtime effects
Use `tokenTurnStart`/`tokenTurnEnd` events instead of polling-based Overtime checks. Template-backed Regions can trigger save/damage at turn boundaries natively.

### 3.3 Elevation-aware targeting
Regions have `elevation.bottom`/`elevation.top` ranges and `testPoint()` checks elevation natively. Could replace VolumetricTemplates dependency for basic 3D containment checks.

### 3.4 Region behaviors for effect application
Foundry v14 Regions support embedded `RegionBehavior` documents. A custom behavior type could automatically apply/remove effects when tokens enter/exit, replacing manual effect management.

### 3.5 Multi-shape Regions
A single Region can have multiple shapes. Could simplify multi-template spells (e.g., Wall of Fire) into a single Region with two shapes.

### 3.6 Built-in token tracking
`region.tokens` Set is maintained by Foundry. Could simplify target enumeration for ongoing AoE effects without manual computation.
