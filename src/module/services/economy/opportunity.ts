import type { Activity } from "../../../globals.js";
import { configSettings } from "../../settings.js";
import { canSee, checkIncapacitated, createConditionData, doReactions, evalAllConditionsAsync, getTokenDocument, hasNoReactionsMarker, hasUsedReaction, midiFlag } from "../../utils.js";
import type { ResponseContributor } from "../responses/service.js";
import { isDisengaged, isForcedAction, speedFor } from "./movement.js";

/*
 * M6c: opportunity attacks. A creature leaving a hostile's reach by its own movement provokes; the move is split there
 * (decision 1: no regions): it is refused in preMoveToken and made again in two parts, up to the last space in reach,
 * the attack offered through midi's reaction prompt, then the rest (unless the mover can no longer move). Each part is
 * its own movement, so Ctrl+Z gives each back. Not provoking:
 *  - forced movement and teleports: a movement action costing none of its movement (isForcedAction: dnd5e's fall,
 *    Foundry's displace, CAT's catForce, midi's forced: its push and pull), undo, `midiOpportunity: { provokes: false }`;
 *  - Disengaged (midi's status, Gambit's oaImmunity) unless the reactor has flags.midi-qol.ignoreDisengage;
 *  - flags.midi-qol.noOpportunityAttacks on the mover: a condition with the reactor as `target`, `movementAction` and
 *    `attackedThisTurn` (the mover attacked the reactor this turn: Mobile, Fancy Footwork), true for always (Flyby:
 *    `movementAction === "fly"`);
 *  - the hook midi-qol.preOpportunityAttack (mover, reactor, data) returning false, for anything else.
 */

const OPPORTUNITY = "reactionopportunity";

interface Position { x: number, y: number, elevation?: number, width?: number, height?: number, level?: string }
interface PathWaypoint extends Position { action?: string, intermediate?: boolean, explicit?: boolean, [key: string]: unknown }

/** The longest reach of the creature's melee attacks (equipped weapons, natural weapons, a feature's attack); 5 ft at least */
export function meleeReach(actor: Actor.Implementation | null | undefined): number {
  let reach = 5;
  for (const item of actor?.items ?? []) {
    const system = item.system as { equipped?: boolean, type?: { value?: string }, range?: { reach?: number | null }, activities?: { contents?: Activity[] } };
    if ((item.type as string) === "weapon" && system.equipped === false && system.type?.value !== "natural") continue;
    for (const activity of meleeAttacks(item)) reach = Math.max(reach, Number(activity.range?.reach ?? system.range?.reach ?? 5) || 5);
  }
  return reach;
}

function meleeAttacks(item: Item.Implementation): Activity[] {
  const activities = (item.system as { activities?: { contents?: Activity[] } }).activities?.contents ?? [];
  return activities.filter(a => a.type === "attack" && (a as { attack?: { type?: { value?: string } } }).attack?.type?.value === "melee");
}

/** Distance between two token footprints, nearest space to nearest space (diagonals by the scene's rule); gridless, edge to edge */
export function footprintDistance(a: Position, b: Position): number {
  const grid = canvas!.grid!;
  const size = grid.size;
  const dz = Math.abs((a.elevation ?? 0) - (b.elevation ?? 0));
  if (grid.isGridless) {
    const aw = (a.width ?? 1) * size, ah = (a.height ?? 1) * size, bw = (b.width ?? 1) * size, bh = (b.height ?? 1) * size;
    const dx = Math.max(0, b.x - (a.x + aw), a.x - (b.x + bw)), dy = Math.max(0, b.y - (a.y + ah), a.y - (b.y + bh));
    return Math.hypot(Math.hypot(dx, dy) / size * grid.distance, dz);
  }
  // The nearest spaces of the two footprints (the same space where they overlap)
  const nearest = (a0: number, a1: number, b0: number, b1: number): [number, number] =>
    a1 < b0 ? [a1, b0] : b1 < a0 ? [a0, b1] : [Math.max(a0, b0), Math.max(a0, b0)];
  const span = (p: Position, along: "x" | "y") => {
    const start = Math.round(p[along] / size);
    return [start, start + Math.max(1, Math.round((along === "x" ? p.width : p.height) ?? 1)) - 1];
  };
  const [ax0, ax1] = span(a, "x"), [ay0, ay1] = span(a, "y"), [bx0, bx1] = span(b, "x"), [by0, by1] = span(b, "y");
  const [cax, cbx] = nearest(ax0, ax1, bx0, bx1), [cay, cby] = nearest(ay0, ay1, by0, by1);
  const centre = (col: number, row: number, elevation: number) => ({ x: (col + 0.5) * size, y: (row + 0.5) * size, elevation });
  return grid.measurePath([centre(cax, cay, a.elevation ?? 0), centre(cbx, cby, b.elevation ?? 0)] as never, {} as never).distance;
}

/** Attacks made this combat turn: attacker actor uuid → target token uuids (Mobile, Fancy Footwork) */
const attacked = new Map<string, Set<string>>();
let attackedTurn = "";
function turnKey(): string { const c = game.combat; return c ? `${c.id}:${c.round}:${c.turn}` : ""; }
function attackedThisTurn(mover: Actor.Implementation, reactor: TokenDocument.Implementation): boolean {
  return turnKey() === attackedTurn && !!attacked.get(mover.uuid ?? "")?.has(reactor.uuid ?? "");
}

export interface OpportunityData { movementAction: string, forced?: boolean }

/** Whether the mover's leaving the reactor's reach provokes it (the "doesn't provoke" rules above) */
export async function provokes(mover: TokenDocument.Implementation, reactor: TokenDocument.Implementation, data: OpportunityData): Promise<boolean> {
  const actor = mover.actor, reactorActor = reactor.actor;
  if (!actor || !reactorActor || data.forced) return false;
  if (isDisengaged(actor) && !(await evalAllConditionsAsync(reactorActor, midiFlag("ignoreDisengage"), createConditionData({ actor: reactorActor, target: mover })))) return false;
  const conditionData = createConditionData({ actor, target: reactor, extraData: { movementAction: data.movementAction, attackedThisTurn: attackedThisTurn(actor, reactor) } });
  if (await evalAllConditionsAsync(actor, midiFlag("noOpportunityAttacks"), conditionData)) return false;
  return Hooks.call("midi-qol.preOpportunityAttack", mover, reactor, data) !== false;
}

/** The hostiles that could take an opportunity attack at the mover now: in its combat, a reaction left, seeing it, a melee attack */
export function possibleReactors(mover: TokenDocument.Implementation): { token: TokenDocument.Implementation, reach: number }[] {
  const combat = (mover.combatant as { combat?: Combat.Implementation } | null)?.combat;
  if (!combat?.started || !mover.actor) return [];
  const reactors: { token: TokenDocument.Implementation, reach: number }[] = [];
  for (const combatant of combat.combatants) {
    const token = combatant.token as TokenDocument.Implementation | null;
    const actor = token?.actor;
    if (!token || !actor || token === mover || token.parent !== mover.parent) continue;
    if ((token as { level?: string }).level !== (mover as { level?: string }).level) continue;
    if (token.disposition * mover.disposition !== -1) continue;
    if (hasUsedReaction(actor) || hasNoReactionsMarker(actor) || checkIncapacitated(actor, false, false)) continue;
    if (!actor.items.some(item => meleeAttacks(item).length > 0)) continue;
    if (mover.object && token.object && !canSee(token, mover, { forceVision: true })) continue;
    reactors.push({ token, reach: meleeReach(actor) });
  }
  return reactors;
}

export interface OpportunitySplit { index: number, reactors: TokenDocument.Implementation[] }

/** The first position on the path where the mover leaves a reactor's reach: the index of the last position in reach */
export function firstLeaving(path: Position[], reactors: { token: TokenDocument.Implementation, reach: number }[], skip: Set<string> = new Set()): OpportunitySplit | undefined {
  for (let i = 1; i < path.length; i++) {
    const leaving = reactors.filter(({ token, reach }) => !skip.has(token.uuid ?? "")
      && footprintDistance(path[i - 1], token) <= reach + 1e-6 && footprintDistance(path[i], token) > reach + 1e-6);
    if (leaving.length) return { index: i - 1, reactors: leaving.map(r => r.token) };
  }
  return undefined;
}

interface PlannedMove {
  method?: string;
  origin?: PathWaypoint;
  passed?: { waypoints?: readonly PathWaypoint[] };
  pending?: { waypoints?: readonly PathWaypoint[] };
  autoRotate?: boolean; showRuler?: boolean; constrainOptions?: object;
}
interface MidiMoveOptions { midiOpportunity?: { provokes?: boolean, offered?: string[] } }

const WAYPOINT_FIELDS = ["x", "y", "elevation", "width", "height", "depth", "shape", "level", "action", "snapped", "explicit", "checkpoint"];
const waypoint = (w: PathWaypoint) => Object.fromEntries(WAYPOINT_FIELDS.filter(k => w[k] !== undefined).map(k => [k, w[k]]));

/** A mover that can't go on after the attack: down, incapacitated, its speed 0 (Sentinel, grappled) */
function stopped(mover: TokenDocument.Implementation, action: string): boolean {
  const actor = mover.actor;
  if (!actor) return true;
  const hp = (actor.system as { attributes?: { hp?: { value?: number } } }).attributes?.hp?.value;
  return (hp !== undefined && hp <= 0) || !!checkIncapacitated(actor, false, false) || speedFor(actor, action) <= 0;
}

async function animationDone(token: TokenDocument.Implementation) {
  const promise = (token.object as { movementAnimationPromise?: Promise<unknown> } | null)?.movementAnimationPromise;
  if (promise) await promise.catch(() => undefined);
}

/** The split move: up to the last space in reach, the attacks offered, then the rest (checked again for the next reactor) */
async function splitMove(mover: TokenDocument.Implementation, explicit: PathWaypoint[], split: number, at: PathWaypoint, rest: PathWaypoint[], reactors: TokenDocument.Implementation[], move: PlannedMove, offered: string[]) {
  const common = { method: move.method, autoRotate: move.autoRotate, showRuler: move.showRuler, constrainOptions: move.constrainOptions };
  const nowOffered = [...offered, ...reactors.map(r => r.uuid ?? "")];
  if (split > 0 || explicit.length) {
    await mover.move([...explicit, { ...waypoint(at), explicit: true }] as never, { ...common, midiOpportunity: { offered: nowOffered } } as never);
    await animationDone(mover);
  }
  for (const reactor of reactors) {
    try { await doReactions(reactor, mover.uuid, null, OPPORTUNITY, { opportunity: true }); }
    catch (err) { console.error("midi-qol | opportunity attack", err); }
  }
  if (!rest.length || stopped(mover, String(rest.at(-1)?.action ?? "walk"))) return;
  await mover.move(rest.map(waypoint) as never, { ...common, midiOpportunity: { offered: nowOffered } } as never);
}

/** preMoveToken: a move that leaves a hostile's reach is refused and made again split (async, after the hook) */
function onPreMove(mover: TokenDocument.Implementation, move: PlannedMove, options: MidiMoveOptions): boolean | void {
  if (configSettings.opportunityAttacks !== "prompt") return;
  if (options.midiOpportunity?.provokes === false || ["undo", "paste", "config"].includes(move.method ?? "")) return;
  const all = [...(move.passed?.waypoints ?? []), ...(move.pending?.waypoints ?? [])];
  if (!all.length || all.some(w => isForcedAction(w.action))) return;
  const reactors = possibleReactors(mover);
  if (!reactors.length) return;
  const origin = move.origin ?? { x: mover.x, y: mover.y, elevation: mover.elevation, width: mover.width, height: mover.height };
  const path = (mover as unknown as { getCompleteMovementPath(w: PathWaypoint[]): PathWaypoint[] }).getCompleteMovementPath([origin, ...all]);
  const offered = new Set(options.midiOpportunity?.offered ?? []);
  const found = firstLeaving(path, reactors, offered);
  if (!found) return;
  const { index } = found;
  // The doesn't-provoke rules are async (conditions): checked before the move is made again
  void (async () => {
    const action = String(path[index + 1]?.action ?? (mover as { movementAction?: string }).movementAction ?? "walk");
    const provoked: TokenDocument.Implementation[] = [];
    for (const reactor of found.reactors) if (await provokes(mover, reactor, { movementAction: action })) provoked.push(reactor);
    const explicit = path.slice(1, index).filter(w => !w.intermediate);
    const rest = path.slice(index + 1).filter((w, i, list) => !w.intermediate || i === list.length - 1);
    if (!provoked.length) {
      // Not provoked here: the move goes on as planned, these reactors not asked again on it
      await mover.move(all.map(waypoint) as never, { method: move.method, autoRotate: move.autoRotate, showRuler: move.showRuler, constrainOptions: move.constrainOptions, midiOpportunity: { offered: [...offered, ...found.reactors.map(r => r.uuid ?? "")] } } as never);
      return;
    }
    await splitMove(mover, explicit, index, path[index], rest, provoked, move, [...offered, ...found.reactors.filter(r => !provoked.includes(r)).map(r => r.uuid ?? "")]);
  })().catch(err => console.error("midi-qol | opportunity attack move", err));
  return false;
}

/** midi's opportunity attack offer: the reactor's melee attacks that reach the mover */
export const opportunityAttacks: ResponseContributor = {
  for({ actor, triggerType, usedReaction, options }) {
    if (triggerType !== OPPORTUNITY || !options?.opportunity || usedReaction) return [];
    const candidates: { activityUuid: string }[] = [];
    for (const item of actor.items) {
      const system = item.system as { equipped?: boolean, type?: { value?: string } };
      if ((item.type as string) === "weapon" && system.equipped === false && system.type?.value !== "natural") continue;
      for (const activity of meleeAttacks(item)) if (activity.uuid) candidates.push({ activityUuid: activity.uuid });
    }
    return candidates;
  }
};

export function setupOpportunityAttacks() {
  Hooks.on("preMoveToken", (token, move, options) => onPreMove(token, move as unknown as PlannedMove, options as unknown as MidiMoveOptions));
  Hooks.on("midi-qol.AttackRollComplete", async (workflow) => {
    const key = turnKey();
    if (key !== attackedTurn) { attacked.clear(); attackedTurn = key; }
    const uuid = workflow.actor?.uuid;
    if (!uuid) return;
    const set = attacked.get(uuid) ?? new Set<string>();
    for (const target of workflow.targets ?? []) { const doc = getTokenDocument(target as never); if (doc?.uuid) set.add(doc.uuid); }
    attacked.set(uuid, set);
  });
}
