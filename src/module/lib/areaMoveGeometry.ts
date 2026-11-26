/* Moving an area to a picked point (lib/entries/areaMove.ts): pure geometry */

/** An offset snapped to whole grid spaces, no longer than `max` pixels as the grid measures (shortened a space at a time) */
export function snappedOffset(offset: { x: number, y: number }, max: number, size: number, measure: (o: { x: number, y: number }) => number): { x: number, y: number } {
  const length = Math.hypot(offset.x, offset.y);
  let o = length > max && length > 0 ? { x: offset.x * max / length, y: offset.y * max / length } : { ...offset };
  if (size > 0) o = { x: Math.round(o.x / size) * size, y: Math.round(o.y / size) * size };
  while (measure(o) > max + 1e-6 && (o.x !== 0 || o.y !== 0)) {
    const sx = Math.sign(o.x) * size, sy = Math.sign(o.y) * size;
    // Step back along the longer axis first
    if (Math.abs(o.x) >= Math.abs(o.y) && o.x !== 0) o = { ...o, x: o.x - sx };
    else o = { ...o, y: o.y - sy };
  }
  return o;
}
