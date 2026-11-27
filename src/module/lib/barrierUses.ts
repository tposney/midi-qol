import { MODULE_ID } from "../../midi-qol.js";
import type { Activity } from "../../globals.js";

/*
 * A barrier to uses (region barriers plan, part 1 stage 4): a region whose barrier behaviour has `uses` stops uses
 * crossing its boundary. A use is stopped between a creature (or an area's origin) on one side and a target on the
 * other: `usesDirection` "both", "into" (from outside to inside) or "out" (from inside to outside). `uses`: "all", or
 * "harmful" (an attack, a save or damage: Shield of the Cavalier's Protective Field lets healing through).
 *
 * What a stopped use does to that target: nothing. It is total cover whatever midi's cover settings
 * (utils hasCoverTotal: targeting refused, an attack misses, an aura's damage held back), and an area placed outside
 * leaves out those inside (area targeting).
 */

export type UsesDirection = "both" | "into" | "out";
export type ElevatedPoint = { x: number, y: number, elevation?: number };

interface UseBarrier { region: RegionDocument.Implementation, uses: string, direction: UsesDirection }

type BarrierSystem = { uses?: string, usesDirection?: string };
type Behavior = { type: string, active?: boolean, disabled?: boolean, system: BarrierSystem };

/** The scene's active barriers to uses */
function useBarriers(scene: Scene.Implementation | null | undefined): UseBarrier[] {
  if (!scene) return [];
  const found: UseBarrier[] = [];
  for (const region of scene.regions) {
    for (const behavior of region.behaviors as unknown as Iterable<Behavior>) {
      if (behavior.type !== `${MODULE_ID}.regionBarrier` || behavior.disabled || behavior.active === false) continue;
      const uses = behavior.system.uses ?? "none";
      if (uses === "none") continue;
      const direction = (["into", "out"].includes(behavior.system.usesDirection ?? "") ? behavior.system.usesDirection : "both") as UsesDirection;
      found.push({ region, uses, direction });
    }
  }
  return found;
}

/** Whether an activity is one a "harmful" barrier stops: an attack, a save or damage (not healing) */
export function isHarmfulActivity(activity: Activity | undefined | null): boolean {
  const type = (activity as { type?: string } | undefined)?.type;
  if (!type) return true;
  return ["attack", "save", "damage"].includes(type);
}

/** A token's centre at its elevation */
function pointOf(token: TokenDocument.Implementation): ElevatedPoint {
  const size = token.parent?.grid.size ?? canvas?.grid?.size ?? 100;
  return { x: token.x + (token.width * size) / 2, y: token.y + (token.height * size) / 2, elevation: token.elevation ?? 0 };
}

function inside(region: RegionDocument.Implementation, point: ElevatedPoint): boolean {
  return (region as unknown as { testPoint(p: { x: number, y: number, elevation: number }): boolean })
    .testPoint({ x: point.x, y: point.y, elevation: point.elevation ?? 0 });
}

/**
 * The barrier that stops a use by `from` (a token, or a point: an area's origin) reaching `to`, if any. `activity`:
 * the use's, for a "harmful" barrier (unknown: treated as harmful).
 */
export function useBarrierBetween(from: TokenDocument.Implementation | ElevatedPoint | undefined, to: TokenDocument.Implementation | undefined, activity?: Activity | null): RegionDocument.Implementation | undefined {
  if (!from || !to || from === to) return undefined;
  const scene = to.parent;
  if (from instanceof TokenDocument && from.parent !== scene) return undefined;
  const origin = from instanceof TokenDocument ? pointOf(from) : from;
  const target = pointOf(to);
  for (const barrier of useBarriers(scene)) {
    if (barrier.uses === "harmful" && activity && !isHarmfulActivity(activity)) continue;
    const a = inside(barrier.region, origin), b = inside(barrier.region, target);
    if (a === b) continue;
    if (barrier.direction === "both" || (barrier.direction === "into" ? b : a)) return barrier.region;
  }
  return undefined;
}

/** Whether a token is inside a barrier to uses (the creatures a Protective Field shelters) */
export function insideUseBarrier(token: TokenDocument.Implementation, region: RegionDocument.Implementation): boolean {
  return inside(region, pointOf(token));
}
