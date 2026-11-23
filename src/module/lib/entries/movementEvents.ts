import { tokenFor } from "../tokenResolver.js";
import { doReactions } from "../../utils.js";
import { forcedMovement, type Point } from "../../services/forcedMovement/service.js";
import { isForcedAction } from "../../services/economy/movement.js";
import { collectEntries, registerAction, registerEvent, runEvent, type ActionRun, type EventContext } from "./engine.js";

/*
 * M6c/d: movement events and actions.
 * - entersReach / leavesReach: raised for the bearer when a creature enters or leaves its reach by its own movement in
 *   a running combat (not forced movement, not a teleport), with the mover as event.creature (its token
 *   event.creatureToken, also the event's target). The move is split at that space (services/economy/opportunity.ts),
 *   so the entry's actions happen with the mover there (Polearm Master's Reactive Strike, Sentinel).
 * - moved: raised about a creature after any move of it (event.forced for forced movement and teleports; near entries
 *   hear it): event.distance, event.cost, event.action, event.from, event.to. In a running combat its reaction items
 *   with `reaction === "isMoved"` are then offered (the reactionmoved trigger, the same event as `event`).
 * - `{ opportunityAttack: true }`: the bearer is offered its melee attacks against event.creature as its reaction.
 * - `{ move: { push | pull | slide: feet, angle?, from? }, to? }`: the subjects pushed away from, or pulled towards,
 *   `from` (user: the use's token, default; bearer; area: the centre of the use's area), or slid at `angle` degrees,
 *   by midi's forcedMovement service (CAT's push when CAT is active). `to`: target (default: the event's target, else
 *   the use's hit targets / failed saves / targets), self, event.creature.
 */

export const ENTERS_REACH = "entersReach";
export const LEAVES_REACH = "leavesReach";
export const MOVED = "moved";

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
async function moveAction(run: ActionRun) {
  const spec = (run.action.move ?? {}) as { push?: unknown, pull?: unknown, slide?: unknown, angle?: unknown, from?: unknown };
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
    if (spec.pull !== undefined) moved = (await forcedMovement.pull(token, { towards: source, distance: await amount(spec.pull, run) })).moved > 0 || moved;
    else moved = (await forcedMovement.push(token, { from: source, distance: await amount(spec.push, run) })).moved > 0 || moved;
  }
  return { success: moved };
}

/** `{ opportunityAttack: true }`: the bearer's melee attacks offered against event.creature, as its reaction */
async function opportunityAttackAction(run: ActionRun) {
  const event = run.context.event as { creatureToken?: TokenDocument.Implementation, bearerToken?: TokenDocument.Implementation } | undefined;
  const creature = event?.creatureToken ?? run.context.target;
  const bearer = event?.bearerToken ?? tokenFor(run.found.actor ?? run.context.actor, { scene: creature?.parent ?? null, near: creature ?? null });
  if (!creature?.uuid || !bearer) return { success: false };
  const result = await doReactions(bearer, creature.uuid, null, "reactionopportunity", { opportunity: true });
  return { success: !!result?.name };
}

/** After any move: `moved` about the creature, then its isMoved reactions, on the moving user's client */
function onMoveToken(token: TokenDocument.Implementation, movement: { method?: string, passed?: { distance?: number, cost?: number, waypoints?: readonly { action?: string }[] }, origin?: Point, destination?: Point }, user: User.Implementation | undefined) {
  if (!user?.isSelf || !token.actor || movement.method === "undo") return;
  const action = movement.passed?.waypoints?.at(-1)?.action ?? "walk";
  const event = {
    distance: movement.passed?.distance ?? 0, cost: movement.passed?.cost ?? 0, action, forced: isForcedAction(action, token),
    from: movement.origin, to: movement.destination, creature: token.actor, creatureToken: token
  };
  const context: EventContext = { actor: token.actor, target: token, event };
  void (async () => {
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
  registerAction("move", moveAction);
  registerAction("opportunityAttack", opportunityAttackAction);
  Hooks.on("moveToken", (token, movement, _operation, user) => onMoveToken(token, movement as never, user as User.Implementation | undefined));
}
