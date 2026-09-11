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

### 2026-03-23: MidiRegionActivityBehaviorType — UUID Schema + Token Attachment

**Files:** `MidiRegionActivityBehaviorType.ts`, `MidiActivityMixin.ts`, `lang/en.json`, `css/styles.css`

**1. Behavior type schema: IDs/identifiers → full UUIDs**

The behavior type stored on the Region at cast time now stores full UUIDs instead of item-relative effect IDs and activity identifiers. The activity schema on the Item (edited via `RegionBehaviorEditor`) still stores portable IDs/identifiers (survive compendium import). `_attachRegionActivityBehavior` converts at cast time.

| Old Field | New Field | Type |
|-----------|-----------|------|
| `entryEffectIds` | `entryEffectUuids` | `SetField(DocumentUUIDField({type:"ActiveEffect"}))` |
| `exitEffectIds` | `exitEffectUuids` | `SetField(DocumentUUIDField({type:"ActiveEffect"}))` |
| `onEntryActivities` | `onEntryActivityUuids` | `SetField(StringField)` (Activity is a PseudoDocument, not in `ALL_DOCUMENT_TYPES`) |
| `onExitActivities` | `onExitActivityUuids` | `SetField(StringField)` |
| `onTurnStartActivities` | `onTurnStartActivityUuids` | `SetField(StringField)` |
| `onTurnEndActivities` | `onTurnEndActivityUuids` | `SetField(StringField)` |

Removed `baseLevel` field (unnecessary — retrievable from the activity resolved via UUID).

**Runtime resolution changes:**
- `_applyEffectsToToken`: `fromUuidSync(effectUuid)` instead of `sourceItem.effects.get(effectId)`
- `_removeEffectsFromToken`: matches by `flags.midi-qol.regionSourceEffectUuid` (renamed from `regionSourceEffectId`)
- `_triggerActivity`: takes UUID directly, passes straight to `_executeTriggerActivity` — no identifier→activity lookup
- `_hasTriggeredThisTurn`/`_markTriggeredThisTurn`: derive flag key from UUID last segment via `_activityKeyFromUuid()`

**Activity UUID display:** Overrides `toInput` on each activity UUID `SetField` in `defineSchema()` to resolve UUIDs to activity names via `fromUuidSync()` for the Region behavior config form. Effect fields render natively via `DocumentUUIDField` → `HTMLDocumentTagsElement`.

**2. Cast level fix**

`_usageChatContext` is called during `super.use()` — before `workflow.castData` is set. The old code fell back to the base spell level; the UUID refactor made it fall back to 0.

Fix: Extract spell level from `message.data.system.spellLevel` (set by dnd5e's `_prepareUsageScaling` before `_usageChatContext` is called) and thread it through `_placeEmanationTemplate(workflow, castLevel)` → `_attachRegionActivityBehavior(regionDoc, workflow, overTimeActivity, castLevel)`.

**3. Emanation region attachment to caster token (v14 native)**

After region creation, sets `regionDoc.update({ attachment: { token: tokenId } })` using Foundry v14's native `RegionDocument.attachment.token` field. The region now automatically moves, rotates, and adjusts elevation with the caster token — handled by `Token#computeAttachedRegionUpdates()` in Foundry core. The token also won't trigger its own attached region's enter/exit events during movement.

Removed the walledtemplates-specific `attachTemplate` code path from `_placeEmanationTemplate` since the native mechanism replaces it.

**CSS:** Added `.region-behavior-config` styles to constrain tag element width and fix justification.

### 2026-03-24: Wall Restriction Dropdown — `CONST.EDGE_RESTRICTION_TYPES`

**Files changed:**
- `src/module/activities/MidiActivityMixin.ts` — schema + `_attachRegionActivityBehavior`
- `src/module/regionBehaviors/MidiRegionActivityBehaviorType.ts` — schema
- `src/module/apps/RegionBehaviorEditor.ts` — dropdown context
- `templates/apps/RegionBehaviorEditor/regionBehaviorEditor.hbs` — checkbox → `<select>`
- `lang/en.json` — renamed `wallsBlock` keys to `wallRestriction`, added `none` option

**Problem:** Region activity wall blocking was a boolean (`wallsBlock: true/false`). Foundry v14 Regions support fine-grained restriction types (`CONST.EDGE_RESTRICTION_TYPES`: `["light", "darkness", "sight", "sound", "move"]`) for controlling which wall types block region effects.

**Fix:** Replaced boolean `wallsBlock` with `wallRestriction` StringField. Choices: `"none"` (no wall blocking) plus all `CONST.EDGE_RESTRICTION_TYPES` values. Default: `"move"`. Dropdown labels use Foundry's `REGION.RESTRICTION_TYPES.{type}.label` localization keys. `CONST.EDGE_RESTRICTION_TYPES` required `@ts-expect-error` (fvtt-types only has `WALL_RESTRICTION_TYPES`).

### 2026-03-24: Custom MidiRegionBehaviorConfig Sheet

**Files created:**
- `src/module/apps/MidiRegionBehaviorConfig.ts` — custom sheet extending `RegionBehaviorConfig`
- `templates/apps/MidiRegionBehaviorConfig/midiRegionBehaviorConfig.hbs` — template with rules section

**Files modified:**
- `src/midi-qol.ts` — registered sheet via `DocumentSheetConfig.registerSheet`
- `css/styles.css` — grid layout for rule rows

**Problem:** The `rules` ArrayField on the `midi-qol.regionActivity` behavior type had no `hasFormSupport` in Foundry v14's `ArrayField`, so the rules section was invisible when editing a region behavior in the region editor. Only the simple fields (sourceItemUuid, dispositionFilter, etc.) rendered via the default `RegionBehaviorConfig`.

**Fix:** Registered a custom `RegionBehaviorConfig` subclass for the `midi-qol.regionActivity` type. The sheet renders standard fields via the parent's form support, plus a custom rules section with dynamic add/remove rows. Each rule row has trigger `<select>`, action `<select>`, and `<document-tags single>` for the target UUID (Foundry's built-in element with native drag-and-drop).

### 2026-08-18: Sample Items — ported Counter Mage and Elemental Attunement from v13

Both existed only in `midi-qol-13x/pack-src` and had never been carried across (v13 Features: 34, v14: 32).

**Applied from the 2026-03-21 checklist above:**
- `icon:` in effect creation -> `img:` — Counter Mage (x2). DialogV2 button `icon:` values left alone.
- numeric `mode: N` in programmatic effect data -> `type: "..."` — Counter Mage (x3): `mode: 0` -> `"custom"`,
  `mode: 5` -> `"override"`.
- version stamp `flags.chris-premades.info.version` -> 14.0.12.

Clean on the rest of the checklist: no bare `getProperty`, no `label:` in effect creation, no `effect.changes`,
no Dialog v1 (Elemental Attunement already uses DialogV2).

**APIs verified against v14 before porting:** `MidiQOL.addDependent/createEffects/getItemFromEffectOrigin/
socket/completeActivityUse/getDistance/moveTokenAwayFromPoint`, socket handlers `removeEffect/updateEffects/
updateItems`, and the `midi-qol.ReactionFilter` hook — all present.

**Caveat:** Counter Mage hooks `midi-qol.premades.postAttackRollComplete`, which is fired by **chris-premades**,
not midi. That dependency is identical on v13, but the Antimagic Shot path needs a v14-compatible CPR.

Neither item has been exercised in a running v14 world — static port only.

### 2026-03-24: Sample Items — `flags.dae.showIcon` → Native `showIcon`

**Script:** `/tmp/migrate-showicon.mjs`

**Scope:** 79 effects across 62 JSON files in `pack-src/sampleitems/`.

**Problem:** Sample item effects used the deprecated `flags.dae.showIcon` (boolean) instead of v14's native top-level `showIcon` field (numeric, from `CONST.ACTIVE_EFFECT_SHOW_ICON`).

**Transformations:**
- `flags.dae.showIcon: true` → top-level `showIcon: 2` (ALWAYS)
- `flags.dae.showIcon: false` → top-level `showIcon: 0` (NEVER)
- Removed `showIcon` key from `flags.dae` object in each effect

**Result:** 41 effects migrated from `true` → `2`, 38 effects from `false` → `0`. No `flags.dae.showIcon` references remain in pack-src.

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
