# Simple Cover 5e Integration

This document describes the Simple Cover 5e module integration in midi-qol, updated for Simple Cover 5e v1.3.1.

## Overview

Midi-qol integrates with Simple Cover 5e to provide automatic cover calculation during attacks. The integration supports:

- **Geometric cover calculation** based on token/wall obstruction
- **Line of Sight (LoS) checking** for total cover from walls
- **Activity-based cover rules** (ignore/override cover based on item properties)
- **Token-based cover** (creatures providing half cover)

---

## Configuration

### Cover Calculation Setting

| Setting | Location | Value |
|---------|----------|-------|
| `coverCalculation` | Optional Rules > Cover Calculation | `simplecover5e` |

### Walls Block Range Setting

| Setting | Location | Value | Effect |
|---------|----------|-------|--------|
| `wallsBlockRange` | Optional Rules > Walls Block Range | `simplecover5e` | Enables LoS checking - blocked LoS treated as total cover |

When `wallsBlockRange` is set to `simplecover5e`, the integration passes `losCheck: true` to the Simple Cover 5e API, which returns total cover (bonus = null) when line of sight is blocked by walls.

---

## API Integration

### Simple Cover 5e API (v1.3.1)

Midi-qol calls the `getCover()` function with the following parameters:

```javascript
simpleCoverApi.getCover({
  attacker,           // Token - the attacking token
  target,             // Token - the target token
  scene,              // Scene - attacker.scene
  losCheck,           // boolean - true when wallsBlockRange === "simplecover5e"
  activity            // Activity5e|undefined - the activity being used (for cover rules)
})
```

### Return Value

The API returns:

```typescript
{
  cover: "none" | "half" | "threeQuarters" | "total",
  bonus: 0 | 2 | 5 | null,  // AC bonus (null = total cover)
  debugSegments?: any[],
  debugTokenShapes?: any[]
}
```

Or `null` if attacker, target, or scene is missing.

### Cover Bonus Mapping

| Simple Cover 5e | Cover Level | midi-qol Constant | Value |
|-----------------|-------------|-------------------|-------|
| `bonus: 0` | None | - | 0 |
| `bonus: 2` | Half | `HALF_COVER` | 2 |
| `bonus: 5` | Three-Quarters | `THREE_QUARTERS_COVER` | 5 |
| `bonus: null` | Total | `FULL_COVER` | 999 |

---

## Implementation Details

### Location

`src/module/utils.ts` - `computeCoverBonus()` function, case `"simplecover5e"`

### Code Flow

1. Check if Simple Cover 5e module is installed and has API
2. Determine if LoS checking should be enabled based on `wallsBlockRange` setting
3. Build options object with attacker, target, scene, losCheck
4. Add activity to options if defined (for ignore-cover rules)
5. Call `simpleCoverApi.getCover(options)`
6. Handle null return (default to no cover)
7. Use `bonus` property if available (v1.3.1+ API)
8. Fall back to string-based `cover` property for older API versions

### Fallback Support

The implementation includes fallback support for older Simple Cover 5e versions that don't return the `bonus` property:

```typescript
if (coverResult.bonus !== undefined) {
  // New API: use bonus directly
  if (coverResult.bonus === null) {
    coverBonus = FULL_COVER;
  } else {
    coverBonus = coverResult.bonus;
  }
} else {
  // Fallback to string-based cover level
  switch (coverResult.cover) {
    case "none": coverBonus = 0; break;
    case "half": coverBonus = HALF_COVER; break;
    case "threeQuarters": coverBonus = THREE_QUARTERS_COVER; break;
    default: coverBonus = FULL_COVER;
  }
}
```

---

## Walls Block Range Implementation

When `wallsBlockRange` is set to `simplecover5e`, midi-qol uses Simple Cover 5e to determine if walls block ranged attacks.

### Location

`src/module/utils.ts` - `computeDistance()` function

### How It Works

1. **Pre-check** (lines 2078-2095): Before calculating segment distances, midi-qol calls Simple Cover 5e's `getCover()` with `losCheck: true`
2. If the result indicates total cover (`bonus === null` or `cover === "total"`), the function returns -1 immediately (attack blocked)
3. If LoS is clear, `coverVisible` is set to true and distance calculation proceeds normally
4. **Switch case** (lines 2170-2178): A fallback case handles any edge cases where the pre-check didn't run

### Code

```typescript
} else if (installedModules.get("simplecover5e") &&
           configSettings.optionalRules.wallsBlockRange === "simplecover5e" &&
           wallsBlock) {
  const simpleCoverApi = game.modules.get("simplecover5e")?.api;
  if (simpleCoverApi) {
    const coverResult = simpleCoverApi.getCover({
      attacker: t1,
      target: t2,
      scene: t1.scene,
      losCheck: true
    });
    // If total cover (no LoS), return -1 to indicate blocked
    if (coverResult?.bonus === null || coverResult?.cover === "total") {
      return -1;
    }
    coverVisible = true;
  }
}
```

---

## Activity Integration

When an activity is passed to the API, Simple Cover 5e checks if the activity has cover-ignoring properties (e.g., Sharpshooter feat, certain spell properties) and adjusts the cover result accordingly.

This is handled internally by Simple Cover 5e's `getIgnoreCover(activity, cover)` function which:
- Checks activity flags for cover ignore rules
- Returns adjusted cover level and bonus

---

## Version Requirements

| Module | Minimum Version | Notes |
|--------|-----------------|-------|
| Simple Cover 5e | 1.3.1 | Required for `losCheck`, `activity` params, and `bonus` return value |

The required version is specified in `src/module/setupModules.ts`:

```typescript
"simplecover5e": "1.3.1"
```

---

## Test Coverage

Test file: `midi-qol-tests/src/32-simple-cover-tests.ts`

### Test Cases

| Test | Description | Expected Result |
|------|-------------|-----------------|
| 32.1 | Module availability | Simple Cover 5e API should be available |
| 32.2 | No cover (actor3 → Orc1) | Cover bonus = 0 (NO_COVER) |
| 32.3 | Half cover from token (actor3 → Orc2) | Cover bonus = 2 (HALF_COVER) |
| 32.4 | Full cover from wall (actor3 → Orc3, LoS enabled) | Cover bonus = 999 (FULL_COVER) |
| 32.5 | Cover with activity | Cover calculation respects activity rules |
| 32.6 | LoS disabled (actor3 → Orc3) | Wall should not provide full cover when LoS checking disabled |
| 32.7 | computeDistance blocks when wall blocks LoS | Distance = -1 (blocked) |
| 32.8 | Complete attack workflow with cover | Cover bonus = 2 applied to attack |

### Test Setup Requirements

- `actor3` - Attacker token for ranged attacks (must have a ranged weapon)
- `Orc1` - Target with clear line of sight from actor3 (no cover)
- `Orc2` - Target with token obstruction (half cover from actor3)
- `Orc3` - Target with wall between it and actor3 (full cover when LoS enabled)

---

## Changes Made (2026-01-05)

### Issue #1546 - Enhanced Simple Cover 5e Integration

1. **Added `losCheck` parameter** - Tied to `wallsBlockRange === "simplecover5e"` setting
2. **Added `activity` parameter** - Passed when defined for cover rule processing
3. **Added `bonus` value handling** - Direct use of numeric bonus from new API
4. **Added null check** - Handle case where `getCover()` returns null
5. **Added fallback support** - String-based cover for older API versions
6. **Added "simplecover5e" to wallsBlockRangeOptionsNew** in settings.ts
7. **Added localization** - `lang/en.json` entry for "simplecover5e"
8. **Updated version requirement** - `setupModules.ts` requires v1.3.1
9. **Added wallsBlockRange support in computeDistance()** - When `wallsBlockRange === "simplecover5e"`, the `computeDistance()` function now calls Simple Cover 5e's API with `losCheck: true` to determine if walls block ranged attacks. Returns -1 (blocked) if total cover is detected.

### Verification

The implementation was verified against Simple Cover 5e v1.3.1 source code:

| Component | File | Verified |
|-----------|------|----------|
| API signature | `scripts/utils/api.mjs` | getCover accepts losCheck, activity params |
| Return type | `scripts/utils/api.mjs` | Returns { cover, bonus, ... } |
| Bonus values | `scripts/config/constants.config.mjs` | COVER.BONUS: none=0, half=2, threeQuarters=5, total=null |
| LoS handling | `scripts/utils/api.mjs` | losCheck=true + no LoS sets cover="total", bonus=null |
| Activity handling | `scripts/utils/api.mjs` | Calls getIgnoreCover(activity, cover) |

All tests pass (32.1-32.8) with Simple Cover 5e v1.3.1 installed.
