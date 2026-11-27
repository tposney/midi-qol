/*
 * Where a creature inside another goes, and where it comes out, pure (no Foundry globals). Positions are a token's
 * top-left corner in pixels; sizes are pixels. Plan: ~/Documents/midi-next-region-barriers-plan-2026-11-25.md, part 2.
 */

export interface Rect { x: number, y: number, width: number, height: number }
export interface Spot { x: number, y: number }

/** The inner token centred in the outer one's space */
export function insideSpot(outer: Rect, inner: { width: number, height: number }): Spot {
  return { x: Math.round(outer.x + (outer.width - inner.width) / 2), y: Math.round(outer.y + (outer.height - inner.height) / 2) };
}

/** Whether the inner token sits where insideSpot puts it (within a pixel) */
export function isInside(outer: Rect, inner: Rect): boolean {
  const spot = insideSpot(outer, inner);
  return Math.abs(spot.x - inner.x) <= 1 && Math.abs(spot.y - inner.y) <= 1;
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;

/**
 * The spaces next to the outer token where the inner one fits touching it, a grid step apart, nearest to `prefer`
 * first (default: the outer token's centre, so the sides come before the corners).
 */
export function besideSpots(outer: Rect, inner: { width: number, height: number }, step: number, prefer?: Spot): Spot[] {
  const spots: Spot[] = [];
  const left = outer.x - inner.width, right = outer.x + outer.width, top = outer.y - inner.height, bottom = outer.y + outer.height;
  for (let x = left; x <= right; x += step) { spots.push({ x, y: top }); spots.push({ x, y: bottom }); }
  for (let y = top + step; y < bottom; y += step) { spots.push({ x: left, y }); spots.push({ x: right, y }); }
  const target = prefer ?? { x: outer.x + outer.width / 2, y: outer.y + outer.height / 2 };
  const distance = (s: Spot) => Math.hypot(s.x + inner.width / 2 - target.x, s.y + inner.height / 2 - target.y);
  return spots.sort((a, b) => distance(a) - distance(b));
}

/** The first spot the inner token can take: none of `taken` in it and `allowed` (walls) says yes */
export function freeSpot(spots: readonly Spot[], inner: { width: number, height: number }, taken: readonly Rect[], allowed: (spot: Spot) => boolean = () => true): Spot | undefined {
  return spots.find(spot => !taken.some(rect => overlaps({ ...spot, ...inner }, rect)) && allowed(spot));
}

/** The centres of the grid spaces a rect covers (a token's spaces: what "in an area" counts for it) */
export function spaceCentres(rect: Rect, step: number): Spot[] {
  const centres: Spot[] = [];
  const across = Math.max(1, Math.round(rect.width / step)), down = Math.max(1, Math.round(rect.height / step));
  const w = rect.width / across, h = rect.height / down;
  for (let i = 0; i < across; i++) for (let j = 0; j < down; j++) centres.push({ x: rect.x + (i + 0.5) * w, y: rect.y + (j + 0.5) * h });
  return centres;
}

/** Spots around `here` a grid step apart, ring by ring up to `rings` steps away, nearest first */
export function ringSpots(here: Spot, step: number, rings: number): Spot[] {
  const spots: Spot[] = [];
  for (let k = 1; k <= rings; k++) {
    for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== k) continue;
      spots.push({ x: here.x + i * step, y: here.y + j * step });
    }
  }
  const distance = (s: Spot) => Math.hypot(s.x - here.x, s.y - here.y);
  return spots.sort((a, b) => distance(a) - distance(b));
}
