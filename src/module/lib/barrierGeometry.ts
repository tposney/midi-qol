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
