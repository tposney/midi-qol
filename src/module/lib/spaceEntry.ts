/*
 * Whose spaces a move enters (pure; lib/entries/movementEvents.ts raises entersSpace from it). The mover's rectangle
 * is followed along its path (top-left points, from where it started), sampled every quarter of a grid space; a
 * creature's space is entered when the moving rectangle first overlaps it (touching edges isn't overlapping). A
 * creature it overlapped where it started isn't entered (it was already there). In the order the path reaches them.
 */

export interface Rect { x: number, y: number, width: number, height: number }
export interface Point { x: number, y: number }

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function spacesEntered<T>(start: Rect, path: readonly Point[], others: readonly { key: T, rect: Rect }[], gridSize: number): T[] {
  const entered: T[] = [];
  const done = new Set<T>(others.filter(o => overlaps(start, o.rect)).map(o => o.key));
  const step = Math.max(1, gridSize / 4);
  let from: Point = { x: start.x, y: start.y };
  for (const to of path) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(length / step));
    for (let i = 1; i <= steps; i++) {
      const at = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, width: start.width, height: start.height };
      for (const other of others) {
        if (done.has(other.key) || !overlaps(at, other.rect)) continue;
        done.add(other.key);
        entered.push(other.key);
      }
    }
    from = to;
  }
  return entered;
}
