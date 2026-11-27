import { MODULE_ID, moveToken } from "../../../midi-qol.js";
import { tokenFor } from "../../lib/tokenResolver.js";
import { effectFlag, itemOfEffect } from "../../lib/entries/rules.js";
import { toggleStatus } from "../../utils.js";
import { redrawInside } from "../../lib/insideLook.js";
import { besideSpots, freeSpot, insideSpot, ringSpots, spaceCentres, type Rect, type Spot } from "../../lib/carryGeometry.js";

/*
 * A creature inside another (swallowed, engulfed). Plan: ~/Documents/midi-next-region-barriers-plan-2026-11-25.md,
 * part 2, stage 1.
 *
 * Being inside is an effect: one flagged `flags.midi-qol.inside` on the victim (or whose item's rule says so: an
 * overlay's effect of that name, the book's Swallow), whose origin is the swallower's item.
 * While it lasts the victim's token sits centred in the swallower's space and goes where it goes; when the last such
 * effect from that swallower ends, the victim is put on the nearest free space beside it. Nothing else is recorded,
 * so it survives a reload, and identical unlinked monsters are told apart by the token in the origin.
 *  - placed inside when the effect is created, and beside when it goes: the active GM (createActiveEffect /
 *    deleteActiveEffect);
 *  - the swallower's own move takes those inside along in the same move as a grappler's drag (grapple.ts, at no cost);
 *  - any other move of it (forced, a teleport) is followed afterwards (moveToken, on the mover's client).
 *  - while inside it has the Swallowed status (Engulfed, from an engulf item), the GM's; lib/insideLook.ts draws it.
 * `{ move: { place: "inside" | "beside", from? } }` (movementEvents.ts) places a token the same way without the flag.
 */

export const INSIDE_FLAG = "inside";

type Effect = ActiveEffect.Implementation;
const marksInside = (effect: Effect) => !!effectFlag(effect, INSIDE_FLAG);
const isInsideEffect = (effect: Effect) => !effect.disabled && marksInside(effect);

const rectOf = (token: TokenDocument.Implementation): Rect => {
  const size = canvas!.grid!.size;
  return { x: token._source.x, y: token._source.y, width: token.width * size, height: token.height * size };
};

/** The token an inside effect's victim is in: the one its origin names, on the victim's scene */
function carrierOf(effect: Effect, victim: TokenDocument.Implementation): TokenDocument.Implementation | undefined {
  if (!effect.origin) return undefined;
  // An activity's origin (dnd5e's applied effects): its item's
  const origin = effect.origin.replace(/\.Activity\.[^.]+$/, "");
  const carrier = tokenFor(origin, { scene: victim.parent ?? null, near: victim });
  return carrier && carrier !== victim && carrier.parent === victim.parent ? carrier : undefined;
}

/** The tokens inside this one */
export function insideOf(token: TokenDocument.Implementation): TokenDocument.Implementation[] {
  const scene = token.parent;
  if (!scene) return [];
  return scene.tokens.filter(other => other !== token && !!other.actor
    && other.actor.effects.some(effect => isInsideEffect(effect) && carrierOf(effect, other) === token));
}

/** The token this one is inside, if any */
export function insideWhom(token: TokenDocument.Implementation): TokenDocument.Implementation | undefined {
  for (const effect of token.actor?.effects ?? []) {
    const carrier = isInsideEffect(effect) ? carrierOf(effect, token) : undefined;
    if (carrier) return carrier;
  }
  return undefined;
}

/** A token's space in grid spaces (a Large creature's 4) */
const spaces = (token: TokenDocument.Implementation) => token.width * token.height;

/**
 * Whether `token` fits in the room left inside `carrier`: the carrier's space less those inside it (a Gelatinous Cube's
 * "one Large creature or up to four Medium or Small creatures")
 */
export function fitsInside(token: TokenDocument.Implementation, carrier: TokenDocument.Implementation): boolean {
  const used = insideOf(carrier).filter(t => t !== token).reduce((sum, t) => sum + spaces(t), 0);
  return spaces(token) <= spaces(carrier) - used;
}

/** One is inside the other, or both inside the same creature (a swallowed creature's total cover is against those outside) */
export function sharesInside(a: TokenDocument.Implementation, b: TokenDocument.Implementation): boolean {
  const inA = insideWhom(a), inB = insideWhom(b);
  return inA === b || inB === a || (!!inA && inA === inB);
}

/** Put there at once, whatever is in the way: a teleport (no cost, no opportunity attack). False when already there */
async function put(token: TokenDocument.Implementation, spot: Spot, elevation = token._source.elevation): Promise<boolean> {
  if (Math.abs(token._source.x - spot.x) <= 1 && Math.abs(token._source.y - spot.y) <= 1 && elevation === token._source.elevation) return false;
  const size = canvas!.grid!.size;
  await moveToken(token, { x: spot.x + (token.width * size) / 2, y: spot.y + (token.height * size) / 2, elevation }, { teleport: true });
  return true;
}

/** Where the token sits inside the carrier: centred, on the grid (a Medium creature in a Large one takes one of its spaces) */
function seat(token: TokenDocument.Implementation, carrier: TokenDocument.Implementation): Spot {
  const size = canvas!.grid!.size;
  return token.getSnappedPosition(insideSpot(rectOf(carrier), { width: token.width * size, height: token.height * size })) as Spot;
}
const seated = (token: TokenDocument.Implementation, carrier: TokenDocument.Implementation) => {
  const spot = seat(token, carrier);
  return Math.abs(token._source.x - spot.x) <= 1 && Math.abs(token._source.y - spot.y) <= 1;
};

/** The token centred in the carrier's space, at its elevation */
export async function placeInside(token: TokenDocument.Implementation, carrier: TokenDocument.Implementation): Promise<boolean> {
  if (!canvas?.grid || token.parent !== carrier.parent) return false;
  return put(token, seat(token, carrier), carrier._source.elevation);
}

/** No wall the creature couldn't cross between the carrier's centre and the spot's */
function reachable(carrier: TokenDocument.Implementation, spot: Spot, inner: { width: number, height: number }): boolean {
  const from = rectOf(carrier);
  const origin = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const dest = { x: spot.x + inner.width / 2, y: spot.y + inner.height / 2 };
  try { return !CONFIG.Canvas.polygonBackends.move.testCollision(origin, dest, { mode: "any", type: "move" }); }
  catch { return true; }
}

/** The token on the nearest free space next to the carrier (nearest to where it is, else the carrier's sides first) */
export async function placeBeside(token: TokenDocument.Implementation, carrier: TokenDocument.Implementation): Promise<boolean> {
  if (!canvas?.grid || token.parent !== carrier.parent) return false;
  const size = canvas.grid.size;
  const inner = { width: token.width * size, height: token.height * size };
  const outer = rectOf(carrier);
  const here = rectOf(token);
  const within = seated(token, carrier);
  const spots = besideSpots(outer, inner, size, within ? undefined : { x: here.x + here.width / 2, y: here.y + here.height / 2 })
    .map(spot => token.getSnappedPosition(spot) as Spot);
  const taken = (carrier.parent?.tokens.filter(other => other !== token && !other.hidden) ?? []).map(rectOf);
  const spot = freeSpot(spots, inner, taken, s => reachable(carrier, s, inner)) ?? freeSpot(spots, inner, taken);
  if (!spot) return false;
  return put(token, spot);
}

type AreaRegion = { testPoint(point: { x: number, y: number, elevation: number }): boolean };

/** Which of a token's spaces (at `spot`, default where it is) are in the region */
function spacesIn(token: TokenDocument.Implementation, region: AreaRegion, spot?: Spot): boolean[] {
  const size = canvas!.grid!.size;
  const rect = { ...rectOf(token), ...(spot ?? {}) };
  const elevation = token._source.elevation ?? 0;
  return spaceCentres(rect, size).map(c => region.testPoint({ x: c.x, y: c.y, elevation }));
}

/** Whether a token is partly in an area: some of its spaces in it, some not (not fully contained) */
export function partlyInside(token: TokenDocument.Implementation, region: RegionDocument.Implementation): boolean {
  if (!canvas?.grid || token.parent !== region.parent) return false;
  const inside = spacesIn(token, region as unknown as AreaRegion);
  return inside.some(Boolean) && !inside.every(Boolean);
}

/** The token on the nearest unoccupied space wholly outside the area (Protective Field: those not fully in it) */
export async function placeOutside(token: TokenDocument.Implementation, region: RegionDocument.Implementation): Promise<boolean> {
  if (!canvas?.grid || token.parent !== region.parent) return false;
  const size = canvas.grid.size;
  const inner = { width: token.width * size, height: token.height * size };
  const here = rectOf(token);
  const area = region as unknown as AreaRegion;
  const spots = ringSpots({ x: here.x, y: here.y }, size, 12).map(spot => token.getSnappedPosition(spot) as Spot);
  const taken = (token.parent?.tokens.filter(other => other !== token && !other.hidden) ?? []).map(rectOf);
  const spot = freeSpot(spots, inner, taken, s => !spacesIn(token, area, s).some(Boolean));
  if (!spot) return false;
  return put(token, spot);
}

const victimToken = (effect: Effect): TokenDocument.Implementation | undefined => {
  const actor = effect.parent;
  return actor instanceof Actor ? tokenFor(actor) : undefined;
};

/** The status a creature inside has: Engulfed (an engulf item's), else Swallowed */
export function insideStatus(effect: Effect): "swallowed" | "engulfed" {
  const identifier = (itemOfEffect(effect)?.system as { identifier?: string } | undefined)?.identifier ?? "";
  return identifier.includes("engulf") ? "engulfed" : "swallowed";
}

async function onEffectCreated(effect: Effect) {
  if (!isInsideEffect(effect)) return;
  const victim = victimToken(effect);
  redrawInside(victim);
  if (!game.user?.isActiveGM) return;
  const carrier = victim && carrierOf(effect, victim);
  if (!victim || !carrier) return;
  await placeInside(victim, carrier);
  if (victim.actor && !victim.actor.statuses.has(insideStatus(effect))) await toggleStatus(victim.actor, insideStatus(effect), { active: true });
}

async function onEffectDeleted(effect: Effect) {
  if (!marksInside(effect)) return;
  const victim = victimToken(effect);
  redrawInside(victim);
  if (!game.user?.isActiveGM || !victim) return;
  const carrier = carrierOf(effect, victim);
  // Still inside by another effect of the same creature (its bite and its swallow)
  if (carrier && insideWhom(victim) === carrier) return;
  if (carrier && seated(victim, carrier)) await placeBeside(victim, carrier);
  // Inside no one now: the status goes
  if (!insideWhom(victim) && victim.actor?.statuses.has(insideStatus(effect))) await toggleStatus(victim.actor, insideStatus(effect), { active: false });
}

/** After a move the drag didn't make (forced, a teleport): those inside are put back inside */
async function onMoved(token: TokenDocument.Implementation, user: User.Implementation | undefined) {
  if (!user?.isSelf) return;
  for (const inner of insideOf(token)) await placeInside(inner, token);
}

export function registerCarried() {
  Hooks.on("createActiveEffect", effect => { void onEffectCreated(effect as Effect).catch(err => console.error("midi-qol | placing a creature inside", err)); });
  Hooks.on("deleteActiveEffect", effect => { void onEffectDeleted(effect as Effect).catch(err => console.error("midi-qol | releasing a creature", err)); });
  Hooks.on("moveToken", (token, _movement, _operation, user) => { void onMoved(token, user as User.Implementation | undefined).catch(err => console.error("midi-qol | carrying a creature", err)); });
}
