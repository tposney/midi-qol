import { moveToken } from "../../../midi-qol.js";
import { defineService, entries } from "../../api/services.js";
import { configSettings } from "../../settings.js";
import { getTokenDocument } from "../../utils.js";
import { footprintDistance } from "../economy/opportunity.js";

/*
 * forcedMovement (single; M6d): a creature moved without using its own movement (pushed, pulled, slid). In dnd5e's form:
 * forced movement is a movement action that costs none of the creature's movement (dnd5e's `fall`, Foundry's
 * `displace`, CAT's `catForce`, midi's `forced`), so Foundry records it at no cost and it never provokes
 * (movement.ts isForcedAction). The provider makes the move: midi's own, or CAT's slideToken when CAT is active
 * (registered by midi for CAT until CAT registers it itself), so CAT's slide pass and grapple handling run.
 *
 *   MidiQOL.forcedMovement.push(target, { from: attacker, distance: 10 })
 *   MidiQOL.forcedMovement.pull(target, { towards: caster, distance: 10 })   // stops adjacent
 *   MidiQOL.forcedMovement.slide(target, { angle: 90, distance: 15 })        // degrees, 0 = east, clockwise
 */

export interface Point { x: number, y: number }
export type ForcedDirection = "push" | "pull" | "slide";

export interface ForcedMoveRequest {
  token: TokenDocument.Implementation;
  direction: ForcedDirection;
  /** In the scene's units, positive; a hook may change it (0 cancels) */
  distance: number;
  /** push: away from it; pull: towards it */
  source?: TokenDocument.Implementation;
  /** push / pull from or towards a point when there is no source token (an area's centre) */
  point?: Point;
  /** slide: the direction in degrees (0 = east, clockwise) */
  angle?: number;
}

export interface ForcedMoveResult {
  /** How far the creature was moved (0: not moved) */
  moved: number;
}

export interface ForcedMovementProvider {
  move(request: ForcedMoveRequest): Promise<ForcedMoveResult>;
}

declare module "../../api/services.js" {
  interface MidiServices { forcedMovement: ForcedMovementProvider }
}

export let forcedMovementService: ReturnType<typeof defineService<ForcedMovementProvider>>;

/** midi's forced movement action: as dnd5e's `fall` and CAT's `catForce`, never chosen by a user, costing nothing */
export const FORCED_ACTION = "forced";

export function registerForcedAction() {
  const actions = CONFIG.Token.movement.actions as Record<string, object>;
  actions[FORCED_ACTION] ??= {
    label: "midi-qol.Movement.Forced",
    icon: "fa-solid fa-hand-back-fist",
    img: "icons/svg/thrust.svg",
    order: 10,
    canSelect: false,
    costMultiplier: 0,
    measure: false,
    teleport: false,
    terrainAction: null,
    visualize: true
  };
}

/** Where the token is: its source position, set when the move resolves (the prepared x/y follow the animation) */
const positionOf = (token: TokenDocument.Implementation): Point => ({ x: token._source.x, y: token._source.y });

const centre = (token: TokenDocument.Implementation): Point => {
  const size = canvas!.grid!.size;
  return { x: token._source.x + (token.width * size) / 2, y: token._source.y + (token.height * size) / 2 };
};

/** The angle (radians) the request moves the token along, or undefined when it has no direction */
export function forcedAngle(request: ForcedMoveRequest): number | undefined {
  if (request.direction === "slide") return request.angle === undefined ? undefined : Math.toRadians(request.angle);
  const from = request.source ? centre(request.source) : request.point;
  if (!from) return undefined;
  const at = centre(request.token);
  const away = Math.atan2(at.y - from.y, at.x - from.x);
  return request.direction === "push" ? away : away + Math.PI;
}

/** A pull goes no nearer than adjacent to its source (or onto its point) */
export function forcedDistance(request: ForcedMoveRequest): number {
  const grid = canvas!.grid!;
  if (request.direction !== "pull") return request.distance;
  if (request.source) return Math.max(0, Math.min(request.distance, footprintDistance(request.token, request.source) - grid.distance));
  if (request.point) {
    const at = centre(request.token);
    const gap = Math.floor(Math.hypot(request.point.x - at.x, request.point.y - at.y) / grid.size) * grid.distance;
    return Math.max(0, Math.min(request.distance, gap));
  }
  return 0;
}

/** Another creature's token in the space (a forced move stops short of one, as CAT's does) */
function occupied(token: TokenDocument.Implementation, at: Point): boolean {
  const size = canvas!.grid!.size;
  const w = token.width * size, h = token.height * size;
  return !!token.parent?.tokens.some(other => other !== token && !other.hidden
    && other.x < at.x + w - 1 && other.x + other.width * size > at.x + 1 && other.y < at.y + h - 1 && other.y + other.height * size > at.y + 1);
}

/** How far the token went, in whole spaces (scene units) */
function spacesMoved(token: TokenDocument.Implementation, before: Point): number {
  const grid = canvas!.grid!;
  const at = positionOf(token);
  if (at.x === before.x && at.y === before.y) return 0;
  return Math.max(1, Math.round(Math.max(Math.abs(at.x - before.x), Math.abs(at.y - before.y)) / grid.size)) * grid.distance;
}

/** midi's provider: along the line in whole spaces, short of an occupied space; walls stop it (Foundry's move) */
export const midiForcedMovement: ForcedMovementProvider = {
  async move(request) {
    const { token } = request;
    const grid = canvas!.grid!;
    const angle = forcedAngle(request);
    const distance = forcedDistance(request);
    if (angle === undefined || distance <= 0) return { moved: 0 };
    const spaces = Math.max(1, Math.round(distance / grid.distance));
    for (let n = spaces; n > 0; n--) {
      const along = n * grid.size;
      const from = positionOf(token);
      const raw = { x: from.x + Math.cos(angle) * along, y: from.y + Math.sin(angle) * along };
      const at = token.getSnappedPosition(raw);
      if (at.x === from.x && at.y === from.y) continue;
      if (occupied(token, at)) continue;
      const before = from;
      await moveToken(token, { x: at.x + (token.width * grid.size) / 2, y: at.y + (token.height * grid.size) / 2 }, { action: FORCED_ACTION });
      return { moved: spacesMoved(token, before) };
    }
    return { moved: 0 };
  }
};

/** CAT's slideToken (CAT 0.1.x), registered for CAT by midi's CAT integration */
export const catForcedMovement: ForcedMovementProvider = {
  async move(request) {
    const slide = globalThis.cat?.utils?.tokenUtils?.slideToken;
    const distance = forcedDistance(request);
    if (!slide || distance <= 0) return { moved: 0 };
    const before = positionOf(request.token);
    if (request.source && request.direction !== "slide") {
      await slide(request.token, { sourceToken: request.source, distance: request.direction === "pull" ? -distance : distance });
    } else {
      const angle = forcedAngle(request);
      if (angle === undefined) return { moved: 0 };
      const from = centre(request.token);
      const ray = new foundry.canvas.geometry.Ray(from, { x: from.x + Math.cos(angle) * canvas!.grid!.size, y: from.y + Math.sin(angle) * canvas!.grid!.size });
      await slide(request.token, { distance, ray });
    }
    return { moved: spacesMoved(request.token, before) };
  }
};

export function defineForcedMovementService() {
  forcedMovementService = defineService<ForcedMovementProvider>("forcedMovement", {
    kind: "single",
    description: "Moves a creature without its own movement: push, pull, slide (a movement action costing nothing; never provokes)",
    // "auto": the highest priority available (CAT's when CAT is active)
    // A chosen provider that isn't available (CAT not active) falls back to midi's
    selector: () => {
      const chosen = configSettings.forcedMovementProvider;
      if (!chosen || chosen === "auto") return undefined;
      // entries(): the available providers, without asking the selector again (providers() does)
      return entries("forcedMovement").some(p => p.id === chosen) ? chosen : "midi-qol";
    }
  });
  forcedMovementService.register("midi-qol", midiForcedMovement, { label: "Midi-QOL", priority: 0 });
}

type TokenRef = Parameters<typeof getTokenDocument>[0];

async function run(request: ForcedMoveRequest): Promise<ForcedMoveResult> {
  if (Hooks.call("midi-qol.preForcedMovement", request) === false || !(request.distance > 0)) return { moved: 0 };
  const provider = forcedMovementService?.get();
  if (!provider) return { moved: 0 };
  const result = await provider.move(request);
  Hooks.callAll("midi-qol.forcedMovement", request, result);
  return result;
}

const doc = (ref: TokenRef) => getTokenDocument(ref);

export const forcedMovement = {
  push(target: TokenRef, options: { from: TokenRef | Point, distance: number }) {
    const token = doc(target);
    if (!token) return Promise.resolve({ moved: 0 });
    const source = isPoint(options.from) ? undefined : doc(options.from);
    return run({ token, direction: "push", distance: options.distance, source, point: isPoint(options.from) ? options.from : undefined });
  },
  pull(target: TokenRef, options: { towards: TokenRef | Point, distance: number }) {
    const token = doc(target);
    if (!token) return Promise.resolve({ moved: 0 });
    const source = isPoint(options.towards) ? undefined : doc(options.towards);
    return run({ token, direction: "pull", distance: options.distance, source, point: isPoint(options.towards) ? options.towards : undefined });
  },
  slide(target: TokenRef, options: { angle: number, distance: number }) {
    const token = doc(target);
    if (!token) return Promise.resolve({ moved: 0 });
    return run({ token, direction: "slide", distance: options.distance, angle: options.angle });
  },
  move: run
};

function isPoint(value: unknown): value is Point {
  return !!value && typeof value === "object" && !(value instanceof TokenDocument) && !(value instanceof foundry.canvas.placeables.Token)
    && typeof (value as Point).x === "number" && typeof (value as Point).y === "number" && !("document" in (value as object));
}
