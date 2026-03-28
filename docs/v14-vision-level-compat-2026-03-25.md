# v14 Vision / Multi-Level Compatibility Plan (Implemented)

## Problem

Foundry v14 introduced a **Levels** system (`Scene#levels`, `canvas.level`, `Level` documents) that fundamentally changes how vision, detection, and wall collision testing work. Vision rays are now split across level boundaries, region surfaces can block sight between levels, and all visibility test configs require a `Level` reference.

midi-qol-14x has its own `_canSenseModes()` function (reimplements Foundry's detection pipeline for out-of-turn tokens) and `checkWallCollision()` (for wallsBlockRange distance checks). Both are unaware of the v14 level system and will produce incorrect results when tokens are on different levels.

## Affected Code

All in `src/module/utils.ts`:

| Function | Lines | Issue |
|----------|-------|-------|
| `_canSenseModes()` | ~7896-7983 | Test config missing `level`; test points use `PIXI.Point` (no elevation); LOS cache ignores levels |
| `initializeVision()` | ~7863-7895 | Manual vision source creation doesn't pass `level`; uses v13-era parameter names |
| `checkWallCollision()` | ~2905-2970 | `polygonBackends.sight.testCollision` doesn't account for surface collisions between levels |
| `computeDistance()` | ~3364 | Wall collision checks don't account for levels |
| `getDistance()` | ~3056 | Delegates to `computeDistance` — same issue |

## v14 API Changes

### CanvasVisibilityTest (v14)

```typescript
// v13
{ point: PIXI.Point, elevation: number, los: Map<VisionSource, boolean> }

// v14
{ point: ElevatedPoint, level: Level, los: Map<VisionSource, boolean> }
// where ElevatedPoint = { x: number, y: number, elevation: number }
```

`elevation` on the test itself is deprecated (getter shim until v15). The elevation now lives on `point.elevation`.

### CanvasVisibilityTestConfiguration (v14)

```typescript
// v13
{ object: Token | null, tests: CanvasVisibilityTest[] }

// v14
{ object: Token | null, level: Level, tests: CanvasVisibilityTest[] }
```

The config itself also carries the target's `level`.

### DetectionMode.testVisibility (v14)

```javascript
// v13
testVisibility(visionSource, mode, { object, tests })

// v14
testVisibility(visionSource, mode, { object, level, tests })
```

`_canDetect` now receives `level` and can use it to reject cross-level detection.

### DetectionMode._testCollision (v14 — static, was not present in v13)

New in v14. Splits the collision ray into two segments using `#getIntermediateTValue`:
1. Segment in the viewer's level — tested against the viewer's LOS polygon or wall backend
2. Segment in the target's level — tested against walls in that level

Also calls `canvas.scene.testSurfaceCollision()` to check for region surfaces that block vision between levels.

### PointLightSource.testVisibility (v14)

```javascript
// v14
testVisibility({ tests, level, object }) {
  if ( !(this.data.vision && this._canDetectObject(object, level)) ) return false;
  return tests.some(test => test.level.isView && this.testPoint(test.point));
}
```

Now checks `test.level.isView` — tests for points on non-viewed levels are skipped.

### VisionSource initialization (v14)

```javascript
// v13
vision.initialize({ x, y, elevation, radius, angle, rotation, ... })

// v14
vision.initialize({ x, y, elevation, level, rotation, radius, lightRadius, externalRadius, angle, ... })
```

`level` (the Level document ID) is now a required initialization parameter. The `blinded` property is now an object (`{ blind, darkness, burrow }`) instead of a single boolean.

### PointSourcePolygon.testCollision (v14)

The static method signature is unchanged but it now passes `destination.elevation` through and the `_testCollision` abstract method receives an `ElevatedPoint` destination. The config can include `level` for level-aware edge filtering.

## Changes Required

### 1. `_canSenseModes()` — Add level awareness

**Current code builds tests as:**
```typescript
const tests = offsets.map(o => ({
    point: new PIXI.Point(targetPoint.x + o[0], targetPoint.y + o[1]),
    elevation: target?.document.elevation ?? 0,
    los: new Map()
}));
const config = { tests, object: target };
```

**Change to:**
```typescript
const targetElevation = target.document.elevation ?? 0;
const targetLevel = canvas.scene.levels.get(target.document.level) ?? canvas.level;
const tests = offsets.map(o => ({
    point: { x: targetPoint.x + o[0], y: targetPoint.y + o[1], elevation: targetElevation },
    level: targetLevel,
    los: new Map()
}));
const config = { tests, object: target, level: targetLevel };
```

**Update LOS pre-population (the `token.vision` block):**

Currently does a simple `polygonBackends.sight.testCollision`. For cross-level accuracy, use `DetectionMode._testCollision` instead, which handles the level-split ray logic. However, `_testCollision` is a static method on `DetectionMode` — we can call it if the class exposes it (it's technically `protected static` in v14's source but accessible on the class).

```typescript
// Current:
const collision = CONFIG.Canvas.polygonBackends.sight.testCollision(
    origin, test.point,
    { type: "sight", mode: "any", source: token.vision, useThreshold: true, priority: token.vision.priority }
);
test.los.set(token.vision, !collision);

// Change to use DetectionMode._testCollision which handles levels:
const DetectionModeClass = CONFIG.Canvas.detectionModes.basicSight?.constructor
    ?? foundry.canvas.perception.DetectionMode;
const collision = DetectionModeClass._testCollision(token.vision, test,
    { ...token.vision.los.config, angle: 360 });
test.los.set(token.vision, !collision);
```

If `_testCollision` is not accessible on the configured class, fall back to the simpler approach but add surface collision testing:
```typescript
const collision = CONFIG.Canvas.polygonBackends.sight.testCollision(
    origin, test.point,
    { type: "sight", mode: "any", source: token.vision, useThreshold: true }
) || canvas.scene.testSurfaceCollision(
    { ...origin, elevation: token.document.elevation },
    { ...test.point },
    { type: "sight", mode: "any", level: targetLevel }
);
```

**Update light source loop:**

```typescript
// Current:
const result = lightSource.testVisibility && lightSource.testVisibility(config);

// v14 testVisibility expects { tests, level, object }:
// config already has level after the change above, so this should work as-is.
```

**Update detection mode calls:**

```typescript
// Current:
modes.lightPerception.testVisibility(token.vision, lightPerception, config)
modes.basicSight.testVisibility(token.vision, basicMode, config)
dm?.testVisibility(token.vision, detectionMode, config)

// These pass config which now includes `level` — should work as-is.
```

### 2. `initializeVision()` — Pass level, use v14 API

**Current:**
```typescript
export function initializeVision(tk: Token.Implementation, force = false) {
    tk.document.sight.enabled = true;
    tk.document._prepareDetectionModes();
    const sourceId = tk.sourceId;
    tk.vision = new CONFIG.Canvas.visionSourceClass({ sourceId, object: tk });
    tk.vision.initialize({
        x: tk.center.x, y: tk.center.y,
        elevation: tk.document.elevation,
        radius: Math.clamp(tk.sightRange, 0, canvas.dimensions?.maxR ?? 0),
        externalRadius: tk.externalRadius,
        angle: tk.document.sight.angle,
        // ... v13 params
        blinded: tk.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND)
    });
    // ...
}
```

**Change to use the token's own `_getVisionSourceData()` when available:**
```typescript
export function initializeVision(tk: Token.Implementation, force = false) {
    tk.document.sight.enabled = true;
    tk.document._prepareDetectionModes();
    const sourceId = tk.sourceId;
    tk.vision = new CONFIG.Canvas.visionSourceClass({ sourceId, object: tk });

    // Use the token's own v14-aware data builder when available
    const blindedStates = tk._getVisionBlindedStates?.()
        ?? { blind: tk.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND) };
    for (const state in blindedStates) tk.vision.blinded[state] = blindedStates[state];

    const visionData = tk._getVisionSourceData?.() ?? {
        x: tk.center.x, y: tk.center.y,
        elevation: tk.document.elevation,
        level: tk.document.level,
        radius: tk.sightRange,
        lightRadius: tk.lightPerceptionRange,
        externalRadius: tk.externalRadius,
        angle: tk.document.sight.angle,
        contrast: tk.document.sight.contrast,
        saturation: tk.document.sight.saturation,
        brightness: tk.document.sight.brightness,
        attenuation: tk.document.sight.attenuation,
        rotation: tk.document.rotation,
        visionMode: tk.document.sight.visionMode,
        color: tk.document.sight.color?.toNearest(),
    };
    tk.vision.initialize(visionData);

    if (!tk.vision.los) {
        tk.vision.shape = tk.vision._createRestrictedPolygon();
        tk.vision.los = tk.vision.shape;
    }
    if (tk.vision.visionMode) tk.vision.visionMode.animated = false;
    tk.vision.add();
    return true;
}
```

Key changes:
- Use `tk._getVisionSourceData()` (v14 method on Token) which includes `level`
- Use `tk._getVisionBlindedStates()` which returns `{ blind, burrow }` object instead of single boolean
- Fallback to manual construction for safety, but include `level: tk.document.level`

### 3. `checkWallCollision()` — Add surface collision testing

For the `"center"` case and other cases that use `CONFIG.Canvas.polygonBackends.sight.testCollision`:

```typescript
// Current (center case):
blocked = !!CONFIG.Canvas.polygonBackends.sight.testCollision(origin, dest, {
    source, mode: "any", type: "sight"
});

// Add surface collision check when tokens are on different elevations:
blocked = !!CONFIG.Canvas.polygonBackends.sight.testCollision(origin, dest, {
    source, mode: "any", type: "sight"
});
if (!blocked && options.originElevation !== undefined && options.destElevation !== undefined
    && options.originElevation !== options.destElevation) {
    blocked = canvas.scene.testSurfaceCollision(
        { x: origin.x, y: origin.y, elevation: options.originElevation },
        { x: dest.x, y: dest.y, elevation: options.destElevation },
        { type: "sight", mode: "any" }
    );
}
```

This needs to be applied to the `"center"`, `"alternative"`, and fallback cases. The `"centerLevels"` case already uses the Levels module API which handles 3D collision — that path remains unchanged (though the Levels module itself may need updating for v14).

### 4. `WallCollisionOptions` interface — Add level field

```typescript
interface WallCollisionOptions {
    source?: any;
    wallsBlockRange: string;
    coverVisible?: boolean;
    originElevation?: number;
    destElevation?: number;
    originTopElevation?: number;
    destTopElevation?: number;
    originLevel?: string;  // NEW: Level ID of the origin token
    destLevel?: string;    // NEW: Level ID of the destination token
}
```

## Testing

1. Single-level scene — all existing behaviour unchanged
2. Multi-level scene (if available) — tokens on different levels:
   - `canSense` returns false when surface blocks vision between levels
   - `canSee` returns false when wall on target's level blocks LOS
   - `wallsBlockRange` distance checks correctly block through surfaces
   - `initializeVision` properly initializes with level data
3. Detection modes (darkvision, tremorsense, blindsight) — still function correctly
4. Cover modules (levelsautocover, tokencover, simbuls) — paths unchanged, module APIs handle their own level logic

## Risk Assessment

- `_canSenseModes` is called frequently (every attack, every advantage check). The additional `Level` lookups (`canvas.scene.levels.get()`) should be cheap (Map lookup).
- `DetectionMode._testCollision` is a protected static method — it's accessible but not officially public API. If Foundry makes it private in a future version, we'd need to inline the level-split logic.
- Scenes without levels: `canvas.level` should always exist as a default level. `canvas.scene.levels.get(token.document.level)` should return the default level for tokens without explicit level assignment.
- The `Levels` third-party module (`centerLevels` case) has its own elevation-based collision API that predates v14's native levels. It's unclear if the module will adapt to v14 levels. The existing code path should remain as a fallback.
