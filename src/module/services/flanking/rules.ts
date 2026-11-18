/*
 * Flanking geometry. Pure: no Foundry globals.
 * Square grids: two creatures flank a target when a line between their cells crosses opposite sides of its box.
 * Hex grids and gridless: when they stand at least 150° apart around it.
 */

export interface Point { x: number; y: number }
/** A box in canvas pixels: top-left corner and size. */
export interface Box { x: number; y: number; width: number; height: number }

/** Whether segments a-b and c-d meet, ends included: Foundry's lineSegmentIntersection, same tolerance. */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point, epsilon = 1e-8): boolean {
  if ((a.x === b.x && a.y === b.y) || (c.x === d.x && c.y === d.y)) return false;
  const denominator = (d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y);
  if (denominator === 0) return false;
  const t0 = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / denominator;
  if (t0 < -epsilon || t0 > 1 + epsilon) return false;
  const t1 = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / denominator;
  return t1 >= -epsilon && t1 <= 1 + epsilon;
}

/** Whether the line from p1 to p2 crosses both the top and bottom of the box, or both its left and right. */
export function crossesOppositeSides(box: Box, p1: Point, p2: Point): boolean {
  const tl = { x: box.x, y: box.y };
  const tr = { x: box.x + box.width, y: box.y };
  const bl = { x: box.x, y: box.y + box.height };
  const br = { x: box.x + box.width, y: box.y + box.height };
  const topAndBottom = segmentsIntersect(p1, p2, tl, tr) && segmentsIntersect(p1, p2, bl, br);
  const leftAndRight = segmentsIntersect(p1, p2, tl, bl) && segmentsIntersect(p1, p2, tr, br);
  return topAndBottom || leftAndRight;
}

/** Whether a and b stand at least `minDegrees` apart around `centre`. */
export function opposedByAngle(centre: Point, a: Point, b: Point, minDegrees = 150): boolean {
  const angleA = Math.atan2(a.y - centre.y, a.x - centre.x);
  const angleB = Math.atan2(b.y - centre.y, b.x - centre.x);
  let diff = Math.abs(angleA - angleB);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff >= (minDegrees / 180) * Math.PI;
}

/** The Check flanking settings whose rule is "the target is flanked" (rather than "the attacker is flanking"). */
export const FLANKED_MODES: readonly string[] = ["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"];
