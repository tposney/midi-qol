import { tokenFor } from "../tokenResolver.js";
import { doReactions } from "../../utils.js";
import { forcedMovement, type Point } from "../../services/forcedMovement/service.js";
import { isForcedAction } from "../../services/economy/movement.js";
import { insideOf, partlyInside, placeBeside, placeInside, placeOutside } from "../../services/interactions/carried.js";
import { spacesEntered, type Rect } from "../spaceEntry.js";
import { collectEntries, registerAction, registerEvent, runEvent, type ActionRun, type EventContext } from "./engine.js";

/*
 * M6c/d: movement events and actions.
 * - entersReach / leavesReach: raised for the bearer when a creature enters or leaves its reach by its own movement in
 *   a running combat (not forced movement, not a teleport), with the mover as event.creature (its token
 *   event.creatureToken, also the event's target). The move is split at that space (services/economy/opportunity.ts),
 *   so the entry's actions happen with the mover there (Polearm Master's Reactive Strike, Sentinel).
 * - entersSpace: raised for a creature after its own move (not forced, not a teleport) for each creature whose space
 *   the move entered for the first time (lib/spaceEntry.ts), in the order it reached them, the entered creature as
 *   event.creature (event.creatureToken, the event's target); before `moved` (the Gelatinous Cube's Engulf).
 * - spaceEntered: raised for each of those creatures, the mover as event.creature (and the event's target): a creature
 *   walking into a Gelatinous Cube's space (Ooze Cube).
 * - moved: raised about a creature after any move of it (event.forced for forced movement and teleports; near entries
 *   hear it): event.distance, event.cost, event.action, event.from, event.to. In a running combat its reaction items
 *   with `reaction === "isMoved"` are then offered (the reactionmoved trigger, the same event as `event`).
 * - `{ move: { place: "inside" | "beside", from? }, to? }`: the subjects put centred in `from`'s space, or on the nearest
 *   free space next to it (services/interactions/carried.ts), at once and through anything.
 * - `{ move: { place: "outside" }, to? }`: the creatures partly in the use's area (not fully contained: some of their
 *   spaces in it), or `to`, put on the nearest unoccupied space wholly outside it (Protective Field).
 * - `{ opportunityAttack: true }`: the bearer is offered its melee attacks against event.creature as its reaction.
 * - `{ move: { push | pull | slide: feet, angle?, from? }, to? }`: the subjects pushed away from, or pulled towards,
 *   `from` (user: the use's token, default; bearer; area: the centre of the use's area), or slid at `angle` degrees,
 *   by midi's forcedMovement service (CAT's push when CAT is active). `to`: target (default: the event's target, else
 *   the use's hit targets / failed saves / targets), self, event.creature.
 */

export const ENTERS_REACH = "entersReach";
export const LEAVES_REACH = "leavesReach";
export const MOVED = "moved";
export const ENTERS_SPACE = "entersSpace";
export const SPACE_ENTERED = "spaceEntered";

/** Whether the actor has its own entries for the event (not near ones: the reach events are about a particular bearer) */
export function hasOwnEntries(eventId: string, actor: Actor.Implementation): boolean {
  return collectEntries(eventId, { actor } as EventContext).some(f => !f.near);
}

/** The reach event for a bearer, with the mover where it is now (the move split there) */
export async function raiseReachEvent(eventId: typeof ENTERS_REACH | typeof LEAVES_REACH, bearer: TokenDocument.Implementation, mover: TokenDocument.Implementation, data: { movementAction: string, reach: number }) {
  const actor = bearer.actor;
  if (!actor || !mover.actor) return;
  const context: EventContext = { actor, target: mover, event: { creature: mover.actor, creatureToken: mover, bearerToken: bearer, ...data } };
  try { await runEvent(eventId, context); }
  catch (err) { console.error(`midi-qol | ${eventId} entries of ${actor.name}`, err); }
}

type TokenSet = { documents?: TokenDocument.Implementation[] } | undefined;
const documentsOf = (set: TokenSet) => set?.documents ?? [];

/** Who a movement action moves */
function moveSubjects(run: ActionRun): TokenDocument.Implementation[] {
  const { context, found } = run;
  const to = typeof run.action.to === "string" ? run.action.to : "target";
  if (to === "self") {
    const bearer = found.actor ?? context.actor;
    const token = tokenFor(bearer, { near: context.target ?? null });
    return token ? [token] : [];
  }
  if (to === "event.creature") {
    const token = (context.event as { creatureToken?: TokenDocument.Implementation } | undefined)?.creatureToken;
    return token ? [token] : [];
  }
  if (context.target) return [context.target];
  const workflow = context.workflow;
  if (!workflow) return [];
  if (workflow.activity?.attack) return documentsOf(workflow.hitTargets as TokenSet);
  const failed = documentsOf(workflow.failedSaves as TokenSet);
  const saves = documentsOf(workflow.saves as TokenSet);
  if (failed.length || saves.length) return failed;
  return documentsOf(workflow.targets as TokenSet);
}

/** The centre of the area the use placed (a region on Foundry 14) */
function areaCentre(run: ActionRun): Point | undefined {
  const area = (run.context.workflow as { template?: { shapes?: { type?: string, x?: number, y?: number }[], object?: { bounds?: { x: number, y: number, width: number, height: number } } } } | undefined)?.template;
  const shape = area?.shapes?.[0];
  if (shape && ["circle", "ellipse"].includes(shape.type ?? "") && typeof shape.x === "number" && typeof shape.y === "number") return { x: shape.x, y: shape.y };
  const b = area?.object?.bounds;
  return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : undefined;
}

function moveSource(run: ActionRun, from: unknown): TokenDocument.Implementation | Point | undefined {
  if (from === "area") return areaCentre(run);
  if (from === "bearer") return tokenFor(run.found.actor ?? run.context.actor, { near: run.context.target ?? null });
  const useToken = run.context.workflow?.token as { document?: TokenDocument.Implementation } | TokenDocument.Implementation | undefined;
  if (useToken) return useToken instanceof TokenDocument ? useToken : useToken.document;
  return tokenFor(run.found.actor ?? run.context.actor, { near: run.context.target ?? null });
}

async function amount(value: unknown, run: ActionRun): Promise<number> {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return 0;
  try { return (await new Roll(value, run.conditionData).evaluate()).total ?? 0; }
  catch { return 0; }
}

/** `{ move: { push | pull | slide, angle?, from? }, to? }` */
/** The area the use placed (a region on Foundry 14) */
function useArea(run: ActionRun): RegionDocument.Implementation | undefined {
  const area = (run.context.workflow as { template?: unknown } | undefined)?.template;
  return area instanceof RegionDocument ? area as RegionDocument.Implementation : undefined;
}

/** `{ move: { place: "outside" }, to? }`: the creatures partly in the use's area (default), or `to`, put outside it */
async function placeOutsideAction(run: ActionRun) {
  const area = useArea(run);
  if (!area?.parent) return { success: false };
  const subjects = typeof run.action.to === "string" ? moveSubjects(run) : area.parent.tokens.filter(t => !!t.actor && !t.hidden && partlyInside(t, area));
  let moved = false;
  for (const token of subjects) moved = (await placeOutside(token, area)) || moved;
  return { success: moved };
}

async function moveAction(run: ActionRun) {
  const spec = (run.action.move ?? {}) as { push?: unknown, pull?: unknown, slide?: unknown, angle?: unknown, from?: unknown, place?: unknown };
  if (spec.place === "outside") return placeOutsideAction(run);
  const subjects = moveSubjects(run);
  if (!subjects.length) return { success: false };
  let moved = false;
  for (const token of subjects) {
    if (spec.slide !== undefined) {
      const distance = await amount(spec.slide, run);
      moved = (await forcedMovement.slide(token, { angle: Number(spec.angle) || 0, distance })).moved > 0 || moved;
      continue;
    }
    const source = moveSource(run, spec.from);
    if (!source || source === token) continue;
    if (spec.place === "inside" || spec.place === "beside") {
      if (!(source instanceof TokenDocument)) continue;
      moved = (await (spec.place === "inside" ? placeInside(token, source) : placeBeside(token, source))) || moved;
      continue;
    }
    if (spec.pull !== undefined) moved = (await forcedMovement.pull(token, { towards: source, distance: await amount(spec.pull, run) })).moved > 0 || moved;
    else moved = (await forcedMovement.push(token, { from: source, distance: await amount(spec.push, run) })).moved > 0 || moved;
  }
  return { success: moved };
}

/** `{ opportunityAttack: true }`: the bearer's melee attacks offered against event.creature, as its reaction */
async function opportunityAttackAction(run: ActionRun) {
  const event = run.context.event as { creatureToken?: TokenDocument.Implementation, bearerToken?: TokenDocument.Implementation } | undefined;
  // A near entry's creature (Sentinel: the one that hit someone else, or disengaged)
  const creature = event?.creatureToken ?? run.found.near?.token ?? run.context.target;
  const bearer = event?.bearerToken ?? tokenFor(run.found.actor ?? run.context.actor, { scene: creature?.parent ?? null, near: creature ?? null });
  if (!creature?.uuid || !bearer) return { success: false };
  const result = await doReactions(bearer, creature.uuid, null, "reactionopportunity", { opportunity: true });
  return { success: !!result?.name };
}

type MoveWaypoint = { x?: number, y?: number, action?: string };

/** The tokens whose spaces the move entered, in order (not those inside the mover: they go with it) */
function enteredTokens(token: TokenDocument.Implementation, origin: { x?: number, y?: number, width?: number, height?: number } | undefined, path: readonly MoveWaypoint[]): TokenDocument.Implementation[] {
  const scene = token.parent;
  const size = canvas?.grid?.size ?? scene?.grid.size ?? 100;
  if (!scene || typeof origin?.x !== "number" || typeof origin.y !== "number") return [];
  const rectOf = (t: { x: number, y: number, width: number, height: number }): Rect => ({ x: t.x, y: t.y, width: t.width * size, height: t.height * size });
  const start = rectOf({ x: origin.x, y: origin.y, width: origin.width ?? token.width, height: origin.height ?? token.height });
  const carried = new Set(insideOf(token));
  const others = scene.tokens.filter(t => t !== token && !t.hidden && !!t.actor && !carried.has(t))
    .map(t => ({ key: t, rect: rectOf({ x: t._source.x, y: t._source.y, width: t.width, height: t.height }) }));
  const points = path.filter((w): w is MoveWaypoint & { x: number, y: number } => typeof w.x === "number" && typeof w.y === "number");
  return spacesEntered(start, points, others, size);
}

/** After any move: `entersSpace` for each creature its own move entered, `moved` about it, then its isMoved reactions, on the moving user's client */
function onMoveToken(token: TokenDocument.Implementation, movement: { method?: string, passed?: { distance?: number, cost?: number, waypoints?: readonly MoveWaypoint[] }, origin?: Point & { width?: number, height?: number }, destination?: Point }, user: User.Implementation | undefined) {
  if (!user?.isSelf || !token.actor || movement.method === "undo") return;
  const action = movement.passed?.waypoints?.at(-1)?.action ?? "walk";
  const event = {
    distance: movement.passed?.distance ?? 0, cost: movement.passed?.cost ?? 0, action, forced: isForcedAction(action, token),
    from: movement.origin, to: movement.destination, creature: token.actor, creatureToken: token
  };
  const context: EventContext = { actor: token.actor, target: token, event };
  void (async () => {
    if (!event.forced && token.actor) {
      const mine = collectEntries(ENTERS_SPACE, { actor: token.actor } as EventContext).length > 0;
      for (const entered of enteredTokens(token, movement.origin, movement.passed?.waypoints ?? [])) {
        if (!entered.actor) continue;
        if (mine) await runEvent(ENTERS_SPACE, { actor: token.actor, target: entered, event: { creature: entered.actor, creatureToken: entered, bearerToken: token, action } });
        if (collectEntries(SPACE_ENTERED, { actor: entered.actor } as EventContext).length)
          await runEvent(SPACE_ENTERED, { actor: entered.actor, target: token, event: { creature: token.actor, creatureToken: token, bearerToken: entered, action } });
      }
    }
    if (collectEntries(MOVED, context).length) await runEvent(MOVED, context);
    // Reactions are turn-timed: in a running combat only
    if ((token.combatant as { combat?: { started?: boolean } } | null)?.combat?.started && token.uuid)
      await doReactions(token, token.uuid, null, "reactionmoved", { event });
  })().catch(err => console.error(`midi-qol | moved entries / reactions of ${token.name}`, err));
}

export function registerMovementEvents() {
  registerEvent(ENTERS_REACH, { label: "A creature enters the bearer's reach (its own movement, in combat)" });
  registerEvent(LEAVES_REACH, { label: "A creature leaves the bearer's reach (its own movement, in combat)" });
  registerEvent(MOVED, { label: "The creature has moved (event.forced for forced movement)" });
  registerEvent(ENTERS_SPACE, { label: "The creature's own move entered another creature's space (once each per move)" });
  registerEvent(SPACE_ENTERED, { label: "Another creature's own move entered the creature's space (once per move)" });
  registerAction("move", moveAction);
  registerAction("opportunityAttack", opportunityAttackAction);
  Hooks.on("moveToken", (token, movement, _operation, user) => onMoveToken(token, movement as never, user as User.Implementation | undefined));
}
