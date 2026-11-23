import { tokenFor } from "../../lib/tokenResolver.js";
import { configSettings } from "../../settings.js";
import { i18nFormat } from "../../../midi-qol.js";
import { getTokenDocument, toggleStatus } from "../../utils.js";
import { budget, spend } from "./ledger.js";
import { actionKindOf, movementBudget } from "./movementRules.js";
import { registerForcedAction } from "../forcedMovement/service.js";
import { STAND_ACTION, standCost, standsUp } from "./prone.js";

export { actionKindOf, movementBudget };

/*
 * M6a: the movement budget. Spent movement is Foundry's: the token's recorded movement history, which core keeps only
 * while its combat is running and clears at the start of each turn, its waypoints carrying their cost (dnd5e's movement
 * actions and terrain: a speed the creature lacks or difficult terrain costs double). Ctrl+Z truncates the history, so an
 * undone move gives its movement back by itself. Allowed is dnd5e's speed for the movement action, one more for each
 * Dash this turn (a counter on the turn window; the Dashing status shows it, and set by hand counts as one).
 */

export interface MovementState {
  /** The cost of the movement made this turn (the token's recorded history) */
  spent: number;
  /** The creature's speed for the movement action (walk where it has none of its own) */
  speed: number;
  /** Dashes taken this turn */
  dashes: number;
  allowed: number;
  remaining: number;
  action: string;
  units: string;
}

type MovementRef = Actor.Implementation | TokenDocument.Implementation;


/** dnd5e's speed for a movement action, after conditions, bonus and multiplier; walk where the creature has none */
export function speedFor(actor: Actor.Implementation | null | undefined, action: string): number {
  const movement = (actor?.system as { attributes?: { movement?: Record<string, unknown> & { speeds?: Record<string, unknown> } } } | undefined)?.attributes?.movement;
  const read = (key: string) => Number(movement?.speeds?.[key] ?? movement?.[key]) || 0;
  return read(action) || read("walk");
}

/** The token's movement this turn, while its combat is running (none outside combat: Foundry records no history) */
export function movementState(ref: MovementRef): MovementState | undefined {
  const token = tokenFor(ref);
  const actor = token?.actor;
  const combatant = token?.combatant as { combat?: { started?: boolean } } | null | undefined;
  if (!token || !actor || !combatant?.combat?.started) return undefined;
  const history = (token as unknown as { movementHistory?: { cost?: number | null }[] }).movementHistory ?? [];
  const spent = history.reduce((sum, waypoint) => sum + (Number.isFinite(waypoint.cost) ? Number(waypoint.cost) : 0), 0);
  const action = String((token as unknown as { movementAction?: string }).movementAction ?? "walk");
  const speed = speedFor(actor, action);
  // The Dashing status is the dash; the counter, how many (Cunning Action and the action both)
  const counted = Number(budget(actor, "action").counters.dashes) || 0;
  const dashes = actor.statuses.has(DASHING) ? Math.max(1, counted) : 0;
  const units = String((actor.system as { attributes?: { movement?: { units?: string } } }).attributes?.movement?.units ?? "ft");
  return { spent, speed, dashes, action, units, ...movementBudget(spent, speed, dashes) };
}

export const DASHING = "dashing";
export const DISENGAGED = "disengaged";

/** A Dash taken: counted on the turn window and the Dashing status set */
export async function takeDash(actor: Actor.Implementation): Promise<void> {
  const counted = Number(budget(actor, "action").counters.dashes) || 0;
  await spend(actor, "action", { count: 0, counters: { dashes: counted + 1 } });
  if (!actor.statuses.has(DASHING)) await toggleStatus(actor, DASHING, { active: true });
}

/** A Disengage taken: the Disengaged status until the turn's end */
export async function takeDisengage(actor: Actor.Implementation): Promise<void> {
  if (!actor.statuses.has(DISENGAGED)) await toggleStatus(actor, DISENGAGED, { active: true });
}

/** Disengaged: midi's status, or Gambit's Premades' flag (CPR's Disengage items set it) */
export function isDisengaged(actor: Actor.Implementation | null | undefined): boolean {
  if (!actor) return false;
  return actor.statuses.has(DISENGAGED) || !!foundry.utils.getProperty(actor, "flags.gambits-premades.oaImmunity");
}

/** A use of a Dash or Disengage activity takes it (dnd5e's Cunning Action, CPR's Dash and Disengage items, a monster's) */
export function setupMovementActions() {
  registerForcedAction();
  Hooks.on("midi-qol.RollComplete", async (workflow: { activity?: { name?: string | null, identifier?: string, item?: Item.Implementation }, actor?: Actor.Implementation, aborted?: boolean }) => {
    if (workflow.aborted || !workflow.actor?.isOwner) return;
    const kind = actionKindOf(workflow.activity);
    if (kind === "dash") await takeDash(workflow.actor);
    else if (kind === "disengage") await takeDisengage(workflow.actor);
  });
}


/**
 * Forced movement, in dnd5e's form: a movement action that uses none of the creature's movement (costMultiplier 0:
 * dnd5e's fall, Foundry's displace, CAT's catForce, midi's forced) or a teleport. It costs nothing and never provokes.
 */
export function isForcedAction(action: string | undefined | null, token?: TokenDocument.Implementation): boolean {
  if (!action) return false;
  type CostFunction = (cost: number, from: object, to: object, distance: number, segment: object) => number;
  const config = (CONFIG.Token.movement?.actions as Record<string, { teleport?: boolean, getCostFunction?: (token: object, options: object) => CostFunction }> | undefined)?.[action];
  if (!config) return false;
  if (config.teleport) return true;
  // Foundry turns an action's costMultiplier into its cost function when it prepares the config: ask the function
  try { return config.getCostFunction?.(token ?? {}, {})?.(1, {}, {}, 1, {}) === 0; }
  catch { return false; }
}

/* M6b: the budget enforced on a move (preMoveToken, on the moving user's client) */

interface MoveWaypoint { action?: string }
export interface PlannedMove {
  method?: string;
  passed?: { cost?: number, waypoints?: readonly MoveWaypoint[] };
  pending?: { cost?: number, waypoints?: readonly MoveWaypoint[] };
  history?: { cost?: number };
  constrainOptions?: { ignoreCost?: boolean };
}
export type MoveVerdict = { verdict: "free" } | { verdict: "ok" | "warn" | "refuse", total: number, allowed: number, remaining: number, units: string };

/** A move checked against the budget: free (not counted), within it, or past it (warned or refused, as the setting says) */
export function checkMovement(token: TokenDocument.Implementation, move: PlannedMove, options: { gm?: boolean, policy?: string } = {}): MoveVerdict {
  const policy = options.policy ?? configSettings.enforceMovement ?? "displayOnly";
  const waypoints = [...(move.passed?.waypoints ?? []), ...(move.pending?.waypoints ?? [])];
  // Never counted: the GM's moves, undo and paste, cost ignored, forced movement and teleports (isForcedAction)
  if (options.gm ?? game.user?.isGM) return { verdict: "free" };
  if (["undo", "paste", "config"].includes(move.method ?? "") || move.constrainOptions?.ignoreCost) return { verdict: "free" };
  if (waypoints.some(w => isForcedAction(w.action))) return { verdict: "free" };
  const state = movementState(token);
  if (!state || !["warn", "enforce"].includes(policy)) return { verdict: "free" };
  const cost = (n: number | undefined) => Number.isFinite(n) ? Number(n) : 0;
  // A prone creature's move stands it up first: half its speed (recorded with the move: prone.ts)
  const standing = standsUp(token, waypoints) ? standCost(token, waypoints.find(w => w.action && w.action !== STAND_ACTION)?.action ?? "walk") ?? 0 : 0;
  const total = cost(move.history?.cost ?? state.spent) + cost(move.passed?.cost) + cost(move.pending?.cost) + standing;
  // The move's movement action decides the speed (a fly after a walk: the fly speed)
  const action = waypoints.at(-1)?.action ?? state.action;
  const speed = speedFor(token.actor, action);
  const { allowed } = movementBudget(0, speed, state.dashes);
  const remaining = Math.max(0, allowed - cost(move.history?.cost ?? state.spent));
  if (total <= allowed + 1e-6) return { verdict: "ok", total, allowed, remaining, units: state.units };
  return { verdict: policy === "enforce" ? "refuse" : "warn", total, allowed, remaining, units: state.units };
}

export function setupMovementEnforcement() {
  Hooks.on("preMoveToken", (token, move) => {
    let result: MoveVerdict;
    try { result = checkMovement(token, move); }
    catch (err) { console.warn("midi-qol | movement check failed; the move goes ahead", err); return; }
    if (result.verdict === "warn")
      ui.notifications?.warn(i18nFormat("midi-qol.EnforceMovement.Warn", { name: token.name ?? "", total: String(result.total), allowed: String(result.allowed), units: result.units }));
    if (result.verdict === "refuse") {
      ui.notifications?.warn(i18nFormat("midi-qol.EnforceMovement.Refused", { name: token.name ?? "", remaining: String(result.remaining), units: result.units }));
      return false;
    }
  });
}
