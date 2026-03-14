# Hex Grid Flanking Implementation Notes

## Current Square Grid Approach

`computeFlankingStatus()` (utils.ts:6936) uses **ray-edge intersection**: cast a ray from each attacker grid-point to each ally grid-point, and check if it crosses **both opposite edges** (top+bottom or left+right) of the target's rectangular space. This is inherently tied to rectangles.

## D&D 5e Hex Flanking Rule (2014 DMG p.251)

Count hexes around the target's perimeter from attacker to ally. Flanking requires:

| Target Size | Hexes Between |
|---|---|
| Medium or smaller | 2 |
| Large | 4 |
| Huge | 5 |
| Gargantuan | 6+ |

For a Medium creature (6 neighbors), "2 hexes between" means the attacker and ally are at exactly opposite hex positions (positions i and (i+3)%6) — a 180° relationship.

Note: flanking was dropped from the 2024 rules entirely, but midi supports it as an optional rule.

## Foundry v13 Hex API Available

Foundry v13 has hex primitives in `HexagonalGrid` (`/home/timp/foundryv13/resources/app/common/grid/hexagonal.mjs`):
- **`canvas.grid.isHexagonal`** — detect hex grid
- **`getCube(coords)`** — get cube coordinates (q, r, s where q+r+s=0)
- **`testAdjacency(coords1, coords2)`** — check if two hexes are adjacent
- **`getAdjacentOffsets(coords)`** — get all 6 neighbors
- **`HexagonalGrid.cubeDistance(a, b)`** — hex distance in grid spaces
- **`getCenterPoint(coords)`** — pixel center of a hex
- Supports both flat-topped (`columns: true`) and pointy-topped hexes

Helper class `GridHex` (`grid-hex.mjs`):
- `new GridHex(coordinates, grid)` — wraps a hex coordinate
- `getNeighbors()` — get neighboring GridHex instances
- `shiftCube(dq, dr, ds)` — shift along cube axes
- `equals(other)` — check equality
- `.center`, `.topLeft`, `.cube`, `.offset` properties

## Suggested Implementation: Angle-Based Flanking

Rather than defining "edges" and "opposite edges" on hexagons, use an **angle-based test**:

### Core Algorithm

```
function isHexFlanking(token, ally, target):
    1. Compute angle θ_a from target.center → token.center
    2. Compute angle θ_b from target.center → ally.center
    3. Compute angular difference = abs(θ_a - θ_b), normalized to [0°, 180°]
    4. Compute minimum flanking angle based on target size
    5. Return angularDifference >= minimumAngle
```

### Minimum Angle by Size

For a 1-hex target with 6 neighbors (60° each):

| Target Size | Hexes Between | Angle Threshold |
|---|---|---|
| Medium/Small (1 hex) | 2 | ~150° (180° minus half a hex-slot tolerance) |
| Large | 4 | Scales with perimeter |
| Huge | 5 | Scales with perimeter |
| Gargantuan | 6+ | Scales with perimeter |

For Medium/Small, "2 hexes between" = positions 3 apart = 180°. With tolerance for imprecise positioning, a threshold of **150°** works. A universal threshold of ~150° should work across sizes.

### Integration Points

1. **Branch at top of `computeFlankingStatus()`**: Check `canvas.grid.isHexagonal`. If true, use angle path. If false, existing ray-intersection path.

2. **Reuse all existing infrastructure**: `findPotentialFlankers()`, `heightIntersects()`, `findNearby()`, incapacitated checks, `canFlank` flag evaluation, reach weapon detection — all grid-agnostic.

3. **Replace only the inner geometric test** (the `tokenPoints`/`allyPoints` double loop with `intersectSegment` calls) with the angle calculation.

4. **Same change in `computeFlankedStatus()`**: Iterates all ally pairs — same angle test applied pairwise.

### Why Angle-Based

- Works for both hex orientations (flat-top and pointy-top) without special-casing
- Handles multi-hex tokens naturally (center-to-center angle)
- Handles reach weapons naturally (further away, same angle)
- Conceptually matches the D&D rule (opposite sides = ~180°)
- Simple: `Math.atan2(dy, dx)` and a difference check
- Square grid path stays untouched (no regression risk)

### What NOT to do

- Don't try to enumerate hex edges and test "opposite edge" intersection
- Don't try to count perimeter hexes for large creatures — angle approach handles it implicitly
- Don't use `testAdjacency()` as the primary test — only works for immediate neighbors, not reach weapons
