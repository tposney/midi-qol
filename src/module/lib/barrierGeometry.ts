/*
 * Where a barrier's walls go, pure (no Foundry globals): the segments `[x0, y0, x1, y1]` (pixels, whole numbers) for an
 * area's shapes. Plan: ~/Documents/midi-next-region-barriers-plan-2026-11-25.md, part 1.
 *  - a line (dnd5e's wall and line areas: a ray from its origin): its axis;
 *  - a ring: one circle on its radius, the middle of the band;
 *  - anything else: the outline of the area's polygons (a sphere's dome, a cube's cage).
 */

export type Segment = [number, number, number, number];

export interface ShapeFacts { type: string, x?: number, y?: number, length?: number, rotation?: number, radius?: number }

export type BarrierTrace = "auto" | "axis" | "outline" | "middle";

const round = (segment: number[]): Segment => [Math.round(segment[0]), Math.round(segment[1]), Math.round(segment[2]), Math.round(segment[3])];
const real = (segment: Segment) => segment[0] !== segment[2] || segment[1] !== segment[3];

/** A line shape's axis: from its origin, its length along its rotation (degrees) */
export function lineAxis({ x = 0, y = 0, length = 0, rotation = 0 }: ShapeFacts): Segment {
  const r = rotation * Math.PI / 180;
  return round([x, y, x + Math.cos(r) * length, y + Math.sin(r) * length]);
}

/**
 * Whether a segment passes through a rectangle's inside (Liang-Barsky). `inset` shrinks the rectangle, so a segment
 * along its edge (a wall on the grid line between two spaces) is in neither.
 */
export function segmentCrossesRect([x0, y0, x1, y1]: Segment, rect: { x: number, y: number, width: number, height: number }, inset = 1): boolean {
  const left = rect.x + inset, right = rect.x + rect.width - inset, top = rect.y + inset, bottom = rect.y + rect.height - inset;
  if (left >= right || top >= bottom) return false;
  const dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, x0 - left], [dx, right - x0], [-dy, y0 - top], [dy, bottom - y0]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

export type BarrierSide = "none" | "left" | "right" | "inside" | "outside";

/**
 * The band beside a line that one of its sides affects, as a polygon's points: `depth` out from the axis on that side
 * (left and right as seen along the line), and the line's own half thickness on the other, so the wall itself is in it.
 */
export function sideBand({ x = 0, y = 0, length = 0, rotation = 0 }: ShapeFacts, depth: number, side: "left" | "right", thickness = 0): number[] {
  const r = rotation * Math.PI / 180;
  const along = [Math.cos(r) * length, Math.sin(r) * length];
  // The canvas's y runs down: left of the direction of travel is (sin, -cos)
  const sign = side === "left" ? 1 : -1;
  const out = [Math.sin(r) * sign, -Math.cos(r) * sign];
  const corner = (t: number, d: number) => [Math.round(x + along[0] * t + out[0] * d), Math.round(y + along[1] * t + out[1] * d)];
  return [...corner(0, -thickness / 2), ...corner(1, -thickness / 2), ...corner(1, depth), ...corner(0, depth)];
}

/** A circle as `count` segments */
export function circleSegments({ x = 0, y = 0, radius = 0 }: ShapeFacts, count = 24): Segment[] {
  const points = Array.from({ length: count }, (_, i) => [x + radius * Math.cos(2 * Math.PI * i / count), y + radius * Math.sin(2 * Math.PI * i / count)]);
  return points.map((p, i) => round([...p, ...points[(i + 1) % count]])).filter(real);
}

/**
 * A closed polygon's edges (`[x0, y0, x1, y1, ...]`). A polygon of more than `max` edges (a circle's approximation) is
 * thinned evenly to `max`: walls are documents, and a hundred short ones for one dome are too many.
 */
export function polygonSegments(flat: readonly number[], max = 32): Segment[] {
  let points: number[][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i], flat[i + 1]]);
  if (points.length > max) {
    const step = points.length / max;
    points = Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]);
  }
  if (points.length < 2) return [];
  return points.map((p, i) => round([...p, ...points[(i + 1) % points.length]])).filter(real);
}

/**
 * The segments for an area. `auto`: every shape a line → their axes; a ring among them → its circle; else the outline.
 * @param polygons the area's polygons, each `[x0, y0, x1, y1, ...]` (the region's own, after its holes and constraints)
 */
export function barrierSegments(shapes: readonly ShapeFacts[], polygons: readonly (readonly number[])[], trace: BarrierTrace = "auto", max = 32): Segment[] {
  const lines = shapes.filter(shape => shape.type === "line");
  const ring = shapes.find(shape => shape.type === "ring");
  const how = trace !== "auto" ? trace
    : lines.length && lines.length === shapes.length ? "axis"
    : ring ? "middle" : "outline";
  if (how === "axis" && lines.length) return lines.map(lineAxis).filter(real);
  if (how === "middle" && ring) return circleSegments(ring, Math.min(max, 24));
  return polygons.flatMap(polygon => polygonSegments(polygon, max));
}
