/*
 * "Moved at least N feet straight toward the target immediately before the hit" (Ram, Trampling Charge, Charge): the
 * last straight run of the mover's path this turn, ending where it stands, measured when it points toward the target.
 * Foundry 14 records a combatant token's moves (`movementHistory`, cleared at its turn's start), so outside combat
 * there is no run. The geometry is pure (unit tested); `chargeToward` reads the tokens.
 */

export interface Point { x: number, y: number }

/** Whether every point lies within `slack` of the line through `start` and `end` (between them) */
function alongLine(points: Point[], start: Point, end: Point, slack: number): boolean {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return points.every(p => Math.hypot(p.x - start.x, p.y - start.y) <= slack);
  for (const p of points) {
    const along = ((p.x - start.x) * dx + (p.y - start.y) * dy) / length;
    if (along < -slack || along > length + slack) return false;
    const across = Math.abs((p.x - start.x) * dy - (p.y - start.y) * dx) / length;
    if (across > slack) return false;
  }
  return true;
}

/**
 * The last straight run of `path` (in order; the last point is where the mover is now) toward `target`: its start and
 * end, or undefined (no movement, or the last run doesn't point toward the target). `slack`: how far a point may stray
 * from the line (a grid path's steps); `cone`: the most the run's direction may differ from the target's (radians).
 */
export function straightRunToward(path: Point[], target: Point, { slack, cone = Math.PI / 4 }: { slack: number, cone?: number }): { start: Point, end: Point } | undefined {
  // Repeated points (a waypoint recorded twice, the current position) add nothing
  const points = path.filter((p, i) => i === 0 || p.x !== path[i - 1].x || p.y !== path[i - 1].y);
  if (points.length < 2) return undefined;
  const end = points[points.length - 1];
  let first = points.length - 1;
  for (let i = points.length - 2; i >= 0; i--) {
    if (!alongLine(points.slice(i), points[i], end, slack)) break;
    first = i;
  }
  if (first === points.length - 1) return undefined;
  const start = points[first];
  const run = Math.atan2(end.y - start.y, end.x - start.x);
  const toward = Math.atan2(target.y - start.y, target.x - start.x);
  let turn = Math.abs(run - toward) % (2 * Math.PI);
  if (turn > Math.PI) turn = 2 * Math.PI - turn;
  return turn <= cone ? { start, end } : undefined;
}

type MovingToken = TokenDocument.Implementation & { movementHistory?: { x: number, y: number, width?: number, height?: number }[] };

/** A token's centre at a recorded top-left position (its size then, else now) */
function centreAt(token: TokenDocument.Implementation, at: { x: number, y: number, width?: number, height?: number }): Point {
  const size = token.parent?.grid?.size ?? canvas?.grid?.size ?? 100;
  return { x: at.x + (at.width ?? token.width ?? 1) * size / 2, y: at.y + (at.height ?? token.height ?? 1) * size / 2 };
}

/** Feet (scene units) the mover last moved in a straight line toward the target, ending where it is now; 0 when none */
export function chargeToward(mover: TokenDocument.Implementation | null | undefined, target: TokenDocument.Implementation | null | undefined): number {
  if (!mover || !target || mover.parent !== target.parent) return 0;
  const history = (mover as MovingToken).movementHistory ?? [];
  if (!history.length) return 0;
  const path = [...history.map(w => centreAt(mover, w)), centreAt(mover, mover)];
  const size = mover.parent?.grid?.size ?? canvas?.grid?.size ?? 100;
  const run = straightRunToward(path, centreAt(target, target), { slack: size * 0.75 });
  if (!run) return 0;
  const grid = (mover.parent?.grid ?? canvas?.grid) as unknown as { measurePath?(waypoints: Point[], options: object): { distance: number } } | undefined;
  const distance = grid?.measurePath?.([run.start, run.end], {})?.distance;
  return Math.round((typeof distance === "number" ? distance : Math.hypot(run.end.x - run.start.x, run.end.y - run.start.y) / size * 5) * 100) / 100;
}
