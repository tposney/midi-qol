# Distance Measurement in midi-qol

## Token-to-Token: `getDistance()` (utils.ts)

`getDistance()` is the main **token-to-token** distance function. It only accepts two tokens (or token references).

For **token-to-point** distance (template placement), use `getPerimeterDistanceToPoint()` instead -- see "Template Placement Distance" below.

**Settings that affect measurement** (used at various levels of the call stack):

| Setting | Values | Source | Used by |
|---------|--------|--------|---------|
| `distanceMeasurement` | `"default"` / `"center"` / `"perimeter"` | midi-qol mechanics tab | `getDistance` routing |
| `griddedGridless` | `true` / `false` | midi-qol mechanics tab | Sub-functions (`midiMeasureDistances`, `measurePointDistance`, `computePerimeterDistance`) |
| `gridDiagonals` | `EXACT`, `EQUIDISTANT`, `APPROXIMATE`, `ALTERNATING_1`, `ALTERNATING_2`, `RECTILINEAR`, `ILLEGAL` | Foundry core setting | `canvas.grid.measurePath`, SquareGrid proxy |

**Routing in `getDistance`** is a simple three-way branch on `measurementMode`:

```
"default"   → canvas.grid.measurePath(token1.center, token2.center)
"center"    → computeDistance(t1, t2, options)
"perimeter" → computePerimeterDistance(t1, t2, options) + gridify
```

The `griddedGridless` setting is **not** checked at the routing level -- it is handled deeper inside the sub-functions (e.g., `midiMeasureDistances` creates a SquareGrid proxy on gridless scenes when enabled, `computePerimeterDistance` chooses Euclidean vs proxy measurement based on it).

---

## Path 0: Default -- Foundry Core (line 3087)

**When**: `distanceMeasurement` is `"default"`.

**Token-to-token**: Calls `canvas.grid.measurePath([token1.center, token2.center])` -- whatever Foundry would normally return. No fudge factor, no grid snapping, no token-size awareness.

**Token-to-point**: Same -- `canvas.grid.measurePath([token.center, point])`.

---

## Path 1: Center-to-Center via `computeDistance()` (line 3187)

### Gridded Scenes

Iterates over all occupied grid squares of both tokens (perimeter squares only for large tokens -- interior squares are skipped via the `y = t1DocHeight - t1StartY` optimization). For each pair of occupied squares, it:

1. Gets the **center point** of each grid square via `canvas.grid.getCenterPoint()`
2. Optionally checks wall collision between those points
3. Creates a Ray from each source center to each target center
4. Measures all rays via `midiMeasureDistances()` and takes the **minimum**

Diagonal rule behavior on gridded scenes:
- **Equidistant**: Diagonal movement costs the same as orthogonal (5ft). Two tokens 1 square apart diagonally = 5ft.
- **Exact**: True Euclidean distance along the grid path. Diagonal = 5ft x sqrt(2) = 7.07ft.
- Other diagonal modes (Alternating, Approximate, Rectilinear) all work natively -- Foundry's grid handles them.

**No fudge factor** is applied -- grid snapping naturally gives correct results (adjacent 1x1 tokens have centers exactly 1 grid unit apart = 5ft).

### Gridless Scenes

**griddedGridless OFF**: When measurement mode is "center" or "perimeter" but griddedGridless is disabled, `getDistance` returns 0 (the routing conditions are not met). Use "default" mode for raw Foundry Euclidean measurement on gridless scenes without griddedGridless.

**griddedGridless ON**: Same per-square iteration as gridded, but uses a `SquareGrid` proxy to fake a grid over the gridless scene. Goes through `midiMeasureDistances()`:

- **Equidistant / Alternating**: Endpoints are **snapped** to the nearest virtual grid center before measuring. This quantizes the distance to grid-square counts. Fudge factor is **not** applied (snapping handles it).
- **Exact**: No snapping. Measures raw distance through the proxy, then subtracts `gridlessFudge` (scaled by sqrt(2) if diagonal). This compensates for center-to-center measurement overcounting by ~half a grid unit.
- **Approximate**: Snaps to grid centers. Fudge subtracted only if there are diagonal moves.
- **Rectilinear**: No snapping. Fudge subtracted (Manhattan distance).

The fudge factor exists because on gridless scenes, token centers aren't aligned to grid boundaries, so adjacent tokens measure as ~5ft apart rather than the expected 0-5ft range.

### Elevation Handling

If `includeElevation` is enabled (defaults to `distanceIncludesHeight` setting), computes the height difference via `computeTokenHeightDifference()` which accounts for token volume -- overlapping elevation ranges yield 0 height difference, otherwise the gap plus one grid unit. The horizontal distance and height difference are then combined via `combineDistanceWithHeight()` using the active diagonal rule (e.g., EXACT uses sqrt(2) for diagonal movement, EQUIDISTANT treats the shorter axis as free, etc.).

### How `midiMeasureDistances()` Works (line 7821)

- **Gridded scene or gridless without griddedGridless**: Calls `canvas.grid.measurePath()` directly -- Foundry handles diagonal rules natively.
- **Gridless with griddedGridless**: Creates a `SquareGrid` proxy around `canvas.grid` that intercepts method calls and redirects them to `SquareGrid.prototype`. This makes the gridless scene behave as if it had a square grid for measurement purposes. Before measuring:
  - For EQUIDISTANT, APPROXIMATE, ALTERNATING_1/2: **Snaps** endpoints to the nearest virtual grid center first, then measures. This ensures grid-aligned counting.
  - For EXACT, RECTILINEAR: No pre-snapping. After measuring, subtracts the `gridlessFudge` factor (scaled by sqrt(2) if there are diagonal moves).
  - For APPROXIMATE: Subtracts fudge factor only if there are diagonal moves.

---

## Path 2: Perimeter-to-Perimeter via `computePerimeterDistance()` (line 2911)

### How Perimeter Points Are Found

Each token's shape is converted to a world-coordinate polygon via `getTokenPerimeterPolygon()` -- supports all v13 token shapes (rectangle, hexagon, ellipse, trapezoid, circle). The closest points between the two polygons are found iteratively using `foundry.utils.closestPointToSegment()` on polygon edges.

If the shapes overlap, distance is **0**.

### Token-to-Token Raw Distance Calculation

The raw pixel distance between the two closest perimeter points is measured differently depending on scene type:

| Scene Type | Grid Mode | How Distance is Measured |
|------------|-----------|--------------------------|
| Gridless, no griddedGridless | Pure gridless | Euclidean: `sqrt(dx^2 + dy^2) / gridSize * gridDistance` |
| Gridless with griddedGridless | Virtual square grid | `createSquareGridProxy().measurePath()` -- respects diagonal rules |
| Gridded | Native grid | `canvas.grid.measurePath()` -- respects diagonal rules |

### Token-to-Point Measurement

`getPerimeterDistanceToPoint()` is the dedicated function for token-to-point distance (e.g., template placement). It ignores elevation differences -- only flat distance matters for placement range checks. Internally it uses `measureTokenToPointPerimeter()`:

1. Converts the token to a perimeter polygon via `getTokenPerimeterPolygon()`
2. Checks if the point is **inside** the polygon -- if so, returns raw distance 0
3. Finds the **closest point on the perimeter** to the destination via `closestPointOnPerimeter()`
4. Measures the gap via `measurePointDistance()`, which respects griddedGridless (uses SquareGrid proxy on gridless scenes when enabled)

### Gridification in `getDistance()` (token-to-token)

The raw perimeter distance is converted to D&D grid units. There is **no** early return for raw = 0 -- all non-negative values go through the formula:

```
distance = gridDistance + max(0, rawDistance - fudgeFactor)
```

- **0 <= raw <= fudgeFactor**: **5ft** (one grid unit) -- this includes overlapping/adjacent tokens
- **raw > fudgeFactor**: **5 + (rawDistance - fudgeFactor)** -- linear, no rounding

The base grid unit (5ft) accounts for the D&D convention that adjacent tokens (perimeter distance near 0) are still 5ft apart. The fudge factor absorbs imprecision from token edges not aligning perfectly with grid lines.

### Gridification in `getPerimeterDistanceToPoint()` (token-to-point)

Similar formula, but with an early return for points inside the token:

- **raw = 0** (point inside token perimeter): **0ft** -- returned before the formula
- **raw > 0**: same formula as above: `gridDistance + max(0, rawDistance - fudgeFactor)`

The 0ft return for "inside token" is intentional for template placement -- a template origin inside the caster's own token should not consume range.

### Elevation

If `includeElevation` is enabled (defaults to `distanceIncludesHeight` setting), elevation is handled the same way as center mode: `computeTokenHeightDifference()` calculates the gap accounting for token volume, then `combineDistanceWithHeight()` combines it with horizontal distance using the active diagonal rule. Both center and perimeter modes now use the same diagonal-aware elevation logic.

### Key Difference from Center Mode

Center mode measures between grid square centers and takes the minimum across all occupied square pairs. Perimeter mode measures between the actual closest points on each token's shape boundary, then quantizes to grid increments. Perimeter mode gives more intuitive results for large tokens -- a 3x3 token adjacent to a 1x1 token measures 5ft (perimeter-to-perimeter) rather than potentially 10-15ft (center-to-center of nearest squares). Both modes use the same diagonal-aware elevation logic (`computeTokenHeightDifference` + `combineDistanceWithHeight`).

---

## Template Placement Distance

Template placement constraints always use **perimeter-based measurement** regardless of the `distanceMeasurement` config setting, via `getPerimeterDistanceToPoint()`. This ensures consistent behavior: templates measure from the token's actual shape boundary, not its center.

`getPerimeterDistanceToPoint()` applies the same gridification formula as `getDistance` in perimeter mode:
```
distance = gridDistance + max(0, rawDistance - fudgeFactor)
```

Used in:
- `preCreateMeasuredTemplate` hook (Hooks.ts) -- validates final placement is within range
- `clampPointToRange()` (patching.ts) -- clamps template preview to max range during drag
- `getTokenBorderPoint()` (patching.ts) -- finds the point on the token's perimeter polygon where a ray from center to target intersects, for cone/ray anchoring

---

## Fudge Factor Centralization

All fudge factor application is centralized:

| Mode | Where fudge is applied | How |
|------|----------------------|-----|
| **Default** | Nowhere | Raw Foundry `measurePath` -- no midi adjustments |
| **Center** (gridless+griddedGridless) | `midiMeasureDistances` | Subtracts fudge based on diagonal rule |
| **Center** (gridded) | Nowhere | Native grid handles it |
| **Perimeter** | `getDistance` / `getPerimeterDistanceToPoint` | `gridDistance + max(0, raw - fudgeFactor)` |

`checkActivityRange` does **not** apply any fudge -- it uses the distance from `getDistance` directly.

---

## Point-to-Point Helper: `measurePointDistance()` (utils.ts:3012)

Used by the token-to-point perimeter path. Measures between two `{x, y}` points respecting the grid mode:

- **Gridless with griddedGridless**: Uses `createSquareGridProxy().measurePath()` -- respects diagonal rules
- **Otherwise**: Uses `canvas.grid.measurePath()` directly

---

## Summary Matrix

| Scene | griddedGridless | Measurement | Path | Diagonal Rules | Fudge Factor |
|-------|----------------|-------------|------|----------------|--------------|
| Any | n/a | Default | `canvas.grid.measurePath` on token centers | Native only | No |
| Gridded | n/a | Center | `computeDistance` -> `midiMeasureDistances` | Yes (native grid) | No (grid handles it) |
| Gridded | n/a | Perimeter | `computePerimeterDistance` -> `measurePath` -> gridify in `getDistance` | Yes (native grid) | Yes (subtracted before gridify) |
| Gridless | ON | Center | `computeDistance` -> `midiMeasureDistances` with SquareGrid proxy | Yes (via proxy) | Yes (in `midiMeasureDistances`) |
| Gridless | ON | Perimeter | `computePerimeterDistance` -> SquareGrid proxy `measurePath` -> gridify in `getDistance` | Yes (via proxy) | Yes (subtracted before gridify) |

Note: When `distanceMeasurement` is "center" or "perimeter" but the scene is gridless with griddedGridless OFF, `getDistance` returns 0 (the routing conditions are not met and no fallback path is taken).

## Foundry Diagonal Rules Effect

The core `gridDiagonals` setting affects how grid-based measurement counts diagonal movement:

| Setting | Diagonal Cost | D&D Equivalent |
|---------|--------------|----------------|
| EQUIDISTANT | 1 square | Each diagonal = 5ft |
| EXACT | sqrt(2) squares | True Euclidean |
| APPROXIMATE | 1.5 squares | Average of 1 and 2 |
| ALTERNATING_1 | 1, 2, 1, 2... | PHB 5e variant (5/10/5/10) |
| ALTERNATING_2 | 2, 1, 2, 1... | Starts with 10ft |
| RECTILINEAR | 2 squares | Manhattan distance |
| ILLEGAL | No diagonals | Only orthogonal movement |

These only matter when going through a grid-aware path (native gridded scene, or gridless with griddedGridless proxy). The default mode uses whatever Foundry returns natively.

---

## Elevation Helpers (utils.ts)

Both center and perimeter modes share two helpers for elevation:

### `computeTokenHeightDifference(token1, token2)`

Computes the elevation gap between two tokens accounting for token volume:
- Each token has a bottom elevation (`document.elevation`) and a top elevation (`elevation + max(width, height) * gridDistance`)
- If either token's bottom elevation falls within the other's elevation range, the height difference is **0** (overlapping volumes)
- Otherwise, the gap between the ranges plus one grid unit (to account for the D&D convention that adjacent tokens at different elevations are at least 5ft apart vertically)

### `combineDistanceWithHeight(distance, heightDifference)`

Combines a flat (horizontal) distance with a height difference using the current `core.gridDiagonals` setting. Treats the shorter of horizontal/vertical as the "diagonal" component and the remainder as "straight":

| Diagonal Rule | Diagonal Cost |
|---------------|---------------|
| EQUIDISTANT | nd (free) |
| EXACT | sqrt(2) * nd |
| APPROXIMATE | 1.5 * nd |
| RECTILINEAR | 2 * nd |
| ALTERNATING_1/2 | Alternating 5/10 pattern |
| ILLEGAL | 2 * nd (no diagonal movement) |

Where `nd = min(distance, heightDifference)` and the final distance is `straight + diagonalCost`.
