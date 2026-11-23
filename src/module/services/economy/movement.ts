import { getTokenDocument, toggleStatus } from "../../utils.js";
import { budget, spend } from "./ledger.js";
import { actionKindOf, movementBudget } from "./movementRules.js";

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

function tokenOf(ref: MovementRef): TokenDocument.Implementation | undefined {
  if (ref instanceof TokenDocument) return ref as TokenDocument.Implementation;
  return getTokenDocument(ref as Actor.Implementation) ?? undefined;
}

/** dnd5e's speed for a movement action, after conditions, bonus and multiplier; walk where the creature has none */
export function speedFor(actor: Actor.Implementation | null | undefined, action: string): number {
  const movement = (actor?.system as { attributes?: { movement?: Record<string, unknown> & { speeds?: Record<string, unknown> } } } | undefined)?.attributes?.movement;
  const read = (key: string) => Number(movement?.speeds?.[key] ?? movement?.[key]) || 0;
  return read(action) || read("walk");
}

/** The token's movement this turn, while its combat is running (none outside combat: Foundry records no history) */
export function movementState(ref: MovementRef): MovementState | undefined {
  const token = tokenOf(ref);
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
  Hooks.on("midi-qol.RollComplete", async (workflow: { activity?: { name?: string | null, identifier?: string, item?: Item.Implementation }, actor?: Actor.Implementation, aborted?: boolean }) => {
    if (workflow.aborted || !workflow.actor?.isOwner) return;
    const kind = actionKindOf(workflow.activity);
    if (kind === "dash") await takeDash(workflow.actor);
    else if (kind === "disengage") await takeDisengage(workflow.actor);
  });
}

