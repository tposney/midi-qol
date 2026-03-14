# dnd5e 5.3.0 Compatibility Changes

Date: 2026-02-27

## Overview

midi-qol now supports both dnd5e 5.2.x and 5.3.0. On 5.3+, midi fully adopts the new nested `damage.active` structure — all boolean flags are set under `active.type` or `active.all` rather than flat on `active`. A new `"maximum"` damage type (max HP reduction) is also integrated.

## Version Detection

```typescript
// In settings.ts
export let isDnd5e53: boolean = false;
export function setDnd5e53(value: boolean) { isDnd5e53 = value; }

// Set in initHooks() (Hooks.ts) during Foundry init
setDnd5e53(foundry.utils.isNewerVersion(game.system.version, "5.2.99"));
```

## The `damage.active` Structure Change

In dnd5e 5.3.0, the `damage.active` object changed from flat keys to nested objects:

- **5.2.x**: `damage.active.resistance`, `damage.active.immunity`, etc.
- **5.3.0**: `damage.active.type.resistance`, `damage.active.all.resistance`, etc.
  - `type` = specific to that damage entry's type (e.g., fire resistance on a fire damage entry)
  - `all` = applies to ALL damage types (e.g., resistance to all damage)

`multiplier` (number) and `threshold` (boolean) remain flat in both versions.

### Helper Functions (Hooks.ts)

Two version-branching helpers centralize all `damage.active` read/write:

```typescript
function setDamageActiveFlag(damage, flag, scope = "type") {
  // 5.3+: damage.active[scope][flag] = true  (scope is "type" or "all")
  // 5.2.x: damage.active[flag] = true
}

function getDamageActiveFlag(damage, flag) {
  // 5.3+: reads from damage.active.type.[flag] || damage.active.all.[flag]
  // 5.2.x: reads from damage.active.[flag]
}
```

All shared functions (`applySaves`, `applyUncannyDodge`, `applyDamageReduction`) and the `_53` variant functions use these helpers, so they produce the correct structure for whichever dnd5e version is running.

## Changes by File

### 1. Damage Calculation Hooks (Hooks.ts)

Separate hook handler functions for pre-5.3 and 5.3+, registered conditionally in `initHooks()`:

| Pre-5.3 Function | 5.3+ Function | Key Change |
|---|---|---|
| `applyTraitMultipliers` | `applyTraitMultipliers_53` | Reads nested `type`/`all` keys for resistance/vulnerability; uses `setDamageActiveFlag` for absorption |
| `applyCustomResistances` | `applyCustomResistances_53` | Reads/writes via `getDamageActiveFlag`/`setDamageActiveFlag` |
| `recalculateTotals` | `recalculateTotals_53` | Adds `damages.tempMax` accumulation for `"maximum"` type; reads DR via `getDamageActiveFlag` |
| `calculateTotalDamage` | `calculateTotalDamage_53` | Skips `"maximum"` type in total (skip list: `["temphp", "midi-none", "maximum"]`) |
| `preCalculateDamageHandler` | `preCalculateDamageHandler_53` | Calls `calculateTotalDamage_53` |
| `calculateDamageHandler` | `calculateDamageHandler_53` | Calls `applyTraitMultipliers_53`, `applyCustomResistances_53`, `recalculateTotals_53` |

**Shared functions** (use helpers for version-appropriate behavior):
- `applySaves` — sets `saved`, `superSaver`, `semiSuperSaver` via `setDamageActiveFlag`
- `applyUncannyDodge` — sets `uncannyDodge` via `setDamageActiveFlag`
- `applyDamageReduction` — creates DR entry with `setDamageActiveFlag`
- `computeSourceIgnores` — unchanged (only modifies `options.ignore`, not `damage.active`)

**Hook registration** moved from module-level scope into `initHooks()` (since `game.system.version` is not available at module load time):

```typescript
// In initHooks() — called during Foundry "init" hook
setDnd5e53(foundry.utils.isNewerVersion(game.system.version, "5.2.99"));
if (isDnd5e53) {
  Hooks.on("dnd5e.preCalculateDamage", preCalculateDamageHandler_53);
  Hooks.on("dnd5e.calculateDamage", calculateDamageHandler_53);
} else {
  Hooks.on("dnd5e.preCalculateDamage", preCalculateDamageHandler);
  Hooks.on("dnd5e.calculateDamage", calculateDamageHandler);
}
```

### 2. DamageApplicationElementMidi (DamageApplicationElementMidi.ts)

`calculateDamage()` updated to read flags from nested structure on 5.3+:
- SET_FLAGS (`modification`, `resistance`, `vulnerability`, `immunity`, `absorption`, `spell`, `magic`, `nonmagic`, `DR`, `uncannyDodge`): reads `damage.active.type.[flag]` and `damage.active.all.[flag]`
- SAVE_FLAGS (`saved`, `superSaver`, `semiSuperSaver`): reads nested, adds `"all"` type for consolidated icon
- BOOL_FLAGS (`threshold`): stays flat in both versions
- Now returns `tempMax` from `damages.tempMax` (new in 5.3)

This was the root cause of the missing resistance/immunity icons — dnd5e 5.3 sets nested keys, but midi's `calculateDamage` was only reading flat keys.

### 3. Damage Tooltip (GMAction.ts — `generateDamageTooltip`)

Version-branched extraction reads all flags from nested structure on 5.3+:
- 5.3+: Iterates `["modification", "resistance", "vulnerability", "immunity", "absorption", "DR", "saved", "uncannyDodge", "spell", "magic", "nonmagic"]` and checks `di.active?.all?.[cat] || di.active?.type?.[cat]`; `threshold` read flat
- 5.2.x: Reads all keys flat from `di.active`, excluding `semiSuperSaver`, `superSaver`, and `multiplier`

Tooltip header now includes Max HP change line when `oldTempMax !== newTempMax`.

### 4. Max HP Damage Type — `"maximum"` (GMAction.ts + templates + CSS)

New damage type in dnd5e 5.3 that reduces `hp.max` via `system.attributes.hp.tempmax`. Not version-gated since the type didn't exist pre-5.3.

#### `calculateDamageAmounts`
Accumulates `tempMax` from `"maximum"` type entries, returned alongside `amount`, `temp`, `healing`, `vitality`.

#### Main damage application
- Extracts `tempMax` from `calculateDamageAmounts`
- Excludes `"maximum"` entries from `totalDamage` reduce
- Uses dnd5e's clamp formula: `Math.clamp(amount - deltaTemp, -hp.damage + tempMax, hp.value - tempMax)` — this forces `hp.value` down when effective max drops below current HP
- Updates `system.attributes.hp.tempmax` when `tempMax !== 0`
- Records `damageItem.oldTempMax` and `damageItem.newTempMax` for undo tracking

#### Damage card buttons (all paths handle tempMax)
- **Apply-all**: includes `newTempMax` in `system.attributes.hp.tempmax` update
- **Reverse-all**: includes `oldTempMax` in `system.attributes.hp.tempmax` update
- **Individual apply ("=" calc case)**: includes `newTempMax` in actor update
- **Individual reverse**: includes `oldTempMax` in actor update
- **Multiplier apply (non-"=" case)**: filters `"maximum"` from `hpDamageDetail` passed to `actor.applyDamage()`, calculates `multipliedTempMaxDamage` separately, applies via separate `actor.update({"system.attributes.hp.tempmax": ...})`

#### Multiplier preview
- Tracks `multipliedTempMaxDamage` in the damage summation loop
- Calculates `newTempMax` from current actor `hp.tempmax` minus `multipliedTempMaxDamage`
- Updates `dmg-tempmax` span display with old/new values
- Includes `tempMaxChanged` in `noChange` check

#### `updateDamageCardDisplay`
- Extracts `oldTempMax`/`newTempMax` from undo entry
- In undo mode: reads current `hp.tempmax` from actor as `fromTempMax`, targets `oldTempMax` as `toTempMax`
- In apply mode: `fromTempMax = oldTempMax`, `toTempMax = newTempMax`
- Calculates `tempMaxDelta` and `tempMaxChanged`
- Updates `dmg-tempmax` span visibility and `.dmg-tempmax-old`/`.dmg-tempmax-new` content
- Includes `tempMaxChanged` in `noChange` check

#### `prepareDamageListItems`
- Sets `tempMaxChanged` on `DamageListContextEntry`
- Includes `tempMax` comparison in `noChange` check

#### `DamageListContextEntry` interface
- Added `tempMaxChanged?: boolean`

#### Templates
Both `damage-results.html` and `damage-results-player.html` include a `dmg-tempmax-{displayUuid}` span between vitality and no-change displays:
- Skull icon (`fas fa-skull`)
- `.dmg-tempmax-old` / `.dmg-tempmax-new` inner spans for old→new values
- Hidden by default via `midi-qol-dmg-hidden` class when `tempMaxChanged` is false

#### CSS (`styles.css`)
- `.midi-qol-dmg-tempmax` added to shared font-size rule (`1.05em`)
- `.midi-qol-dmg-tempmax .fa-skull` added to icon sizing rule (`14px`)
- Skull icon color: `#663399` (purple)

### 5. Consumption Deltas Location (utils.ts, Workflow.ts, MidiActivityMixin.ts)

In dnd5e 5.3, `activity.consume()` stores consumption data at `messageConfig.data.system.deltas` instead of the old `messageConfig.data.flags.dnd5e.use.consumed`. On persisted ChatMessages, this is `message.system.deltas` instead of `message.getFlag("dnd5e", "use.consumed")`.

**Helper function** `getConsumptionData(source)` in `utils.ts` abstracts the location, supporting both 5.2.x and 5.3:
- Accepts a ChatMessage or a messageConfig object
- 5.3+: reads `source.system.deltas` (ChatMessage) or `source.data.system.deltas` (messageConfig)
- 5.2.x fallback: reads `getFlag("dnd5e", "use.consumed")` (ChatMessage) or `source.data.flags.dnd5e.use.consumed` (messageConfig)

**Updated call sites** (all now use `getConsumptionData()`):
- `Workflow.ts` `checkOtherActivityConsumption()` — dialog path and auto-consume path
- `MidiActivityMixin.ts` `#consumeOtherActivity()` — chat button handler
- `MidiActivityMixin.ts` `postChatCardChecks()` — refund on workflow removal

Note: midi-qol stores its own copy of consumption deltas on the chat card under `flags.midi-qol.use.consumed` (via `addUpdatesCacheFlags`). This midi-qol flag is unaffected — only the extraction of data *from dnd5e* needed updating.

### 6. Spell Level Location (Workflow.ts — `spellLevel` getter)

Version-branched: reads from `system.spellLevel` on 5.3+, `flags.dnd5e.use.spellLevel` on 5.2.x. Import added for `isDnd5e53` from settings.

### 7. Type Updates (globals.ts)

**`DamageDescription.active`** updated to support both structures:
- Flat structure for 5.2.x: `modifications`, `resistance`, `vulnerability`, `immunity`
- Nested structure for 5.3+: `all?: {...}` and `type?: {...}` objects with the same keys
- `threshold?: boolean` stays flat
- Midi-specific keys always flat: `absorption`, `DR`, `spell`, `magic`, `nonmagic`, `superSaver`, `semiSuperSaver`, `saved`, `uncannyDodge`
- Index signature `[key: string]: any` for custom resistance type names

**`DamageListEntry`** (extends `PreSetupDamageListEntry`):
- Added `oldTempMax?: number` — actor's `hp.tempmax` before damage
- Added `newTempMax?: number` — actor's `hp.tempmax` after damage

## Files Modified

| File | Nature of Change |
|---|---|
| `src/module/settings.ts` | Added `isDnd5e53` flag and `setDnd5e53` setter |
| `src/module/Hooks.ts` | Split hooks into pre-5.3 / 5.3+ functions; `setDamageActiveFlag`/`getDamageActiveFlag` helpers; version-conditional registration in `initHooks()` |
| `src/module/ChatClasses/DamageApplicationElementMidi.ts` | `calculateDamage` reads nested flags on 5.3+; returns `tempMax` |
| `src/module/GMAction.ts` | `calculateDamageAmounts` accumulates `tempMax`; tooltip reads nested flags; all damage card paths (apply/reverse/multiplier) handle tempMax do/undo; `updateDamageCardDisplay` handles tempMax; `DamageListContextEntry` adds `tempMaxChanged` |
| `src/module/utils.ts` | Added `getConsumptionData()` helper for 5.2/5.3-compatible consumption delta extraction |
| `src/module/Workflow.ts` | `spellLevel` getter version-branch; import `isDnd5e53`; `checkOtherActivityConsumption` uses `getConsumptionData()` |
| `src/module/activities/MidiActivityMixin.ts` | `#consumeOtherActivity` and `postChatCardChecks` use `getConsumptionData()` |
| `src/globals.ts` | `DamageDescription.active` supports both flat and nested structure; `DamageListEntry` adds `oldTempMax`/`newTempMax` |
| `templates/damage-results.html` | Added `dmg-tempmax` span with skull icon for max HP display |
| `templates/damage-results-player.html` | Added `dmg-tempmax` span with skull icon for max HP display |
| `css/styles.css` | Added `.midi-qol-dmg-tempmax` font-size, icon sizing, and purple skull color |

## Testing Notes

- With dnd5e 5.3.0: damage hooks use `_53` functions, icons display correctly via nested keys, `"maximum"` damage reduces max HP
- With dnd5e 5.2.x: damage hooks use original functions, flat keys, behavior unchanged
- Test "maximum" damage type: verify hp.value clamps down when tempmax reduces effective max below current HP; verify undo restores both tempmax and hp.value
- Test multiplier preview and apply for damage containing "maximum" entries
- Test consumption: run test group 28 (other activity consumption) — verifies auto-consume, refund, insufficient uses
- Run test groups 2 (ability rolls), 10, 29 (save/advantage) with both versions
