import { configSettings } from "../../settings.js";
import { toggleStatus } from "../../utils.js";
import { isForcedAction, speedFor } from "./movement.js";

/*
 * M6: standing up from prone (2024: "spend an amount of movement equal to half your Speed (round down) to right
 * yourself"; not at Speed 0). Recorded in Foundry's own movement history, so dnd5e's ruler, midi's budget and Ctrl+Z
 * handle it like any other movement:
 * - a move by a prone creature in a running combat that is not a crawl, forced movement or a teleport stands it up
 *   first: preUpdateToken adds half its speed to the move's first recorded waypoint and marks the token with the move;
 *   when the move has been made Prone is removed;
 * - standing in place is a move to where it is with midi's unselectable `stand` action (a zero-distance move, which
 *   Foundry records and Ctrl+Z undoes): MidiQOL.economy.standUp, or the Token HUD's button;
 * - Ctrl+Z of that move (the history no longer holding it) puts Prone back.
 * Prone ending any other way (an effect, the GM, a spell) costs nothing. Outside combat Foundry records no history and
 * standing is free.
 */

export const STAND_ACTION = "stand";
const PRONE = "prone";
const FLAG = "standing";

interface StandMark { movementId: string, cost: number }
type HistoryWaypoint = { action?: string, cost?: number | null, movementId?: string | null };

export function registerStandAction() {
  const actions = CONFIG.Token.movement.actions as Record<string, object>;
  actions[STAND_ACTION] ??= {
    label: "midi-qol.Movement.Stand",
    icon: "fa-solid fa-person-arrow-up-from-line",
    img: "icons/svg/up.svg",
    order: 11,
    canSelect: false,
    measure: true,
    teleport: false,
    visualize: false
  };
}

const inCombat = (token: TokenDocument.Implementation) => !!(token.combatant as { combat?: { started?: boolean } } | null)?.combat?.started;

/**
 * The movement standing up takes: flags.midi-qol.movement.standCost when a feature sets it (the Athlete feat's Hop Up:
 * 5), else half the creature's speed for the movement action, rounded down; undefined when it can't stand (speed 0)
 */
export function standCost(token: TokenDocument.Implementation, action = "walk"): number | undefined {
  const speed = speedFor(token.actor, action === STAND_ACTION ? "walk" : action);
  if (speed <= 0) return undefined;
  const stored = foundry.utils.getProperty(token.actor ?? {}, "flags.midi-qol.movement.standCost");
  const set = stored === undefined || stored === null || stored === "" ? NaN : Number(stored);
  return Number.isFinite(set) ? Math.max(0, set) : Math.floor(speed / 2);
}

const markOf = (token: TokenDocument.Implementation) => foundry.utils.getProperty(token, `flags.midi-qol.${FLAG}`) as StandMark | undefined;

/** The token's stand mark, while the move that stood it up is still in this turn's history */
function currentMark(token: TokenDocument.Implementation): StandMark | undefined {
  const mark = markOf(token);
  return mark && token._source._movementHistory.some(w => w.movementId === mark.movementId) ? mark : undefined;
}

/** Whether a move with these waypoints stands a prone creature up first (its own movement, not a crawl) */
export function standsUp(token: TokenDocument.Implementation, waypoints: readonly { action?: string }[]): boolean {
  if (configSettings.proneStanding === "none" || !token.actor?.statuses.has(PRONE) || !inCombat(token)) return false;
  // Already stood up this turn (a move split for an opportunity attack, Prone not yet removed): not again
  if (currentMark(token)) return false;
  const action = waypoints[0]?.action ?? (token as { movementAction?: string }).movementAction ?? "walk";
  if (action === STAND_ACTION) return true;
  if (action === "crawl" || isForcedAction(action, token)) return false;
  return standCost(token, action) !== undefined;
}

/** A prone creature stands where it is (half its speed in combat; free out of combat) */
export async function standUp(ref: TokenDocument.Implementation): Promise<boolean> {
  const token = ref;
  if (!token.actor?.statuses.has(PRONE)) return false;
  if (!inCombat(token) || configSettings.proneStanding === "none") {
    await toggleStatus(token.actor, PRONE, { active: false });
    return true;
  }
  if (standCost(token) === undefined) {
    ui.notifications?.warn(game.i18n?.format("midi-qol.Movement.CantStand", { name: token.name ?? "" }) ?? "");
    return false;
  }
  const { x, y, elevation } = token._source;
  const moved = await token.move([{ x, y, elevation, action: STAND_ACTION }] as never, { animate: false } as never);
  return moved !== false;
}

/** The move's first new waypoint pays for standing; the token is marked with the move (preUpdateToken, the mover's client) */
function onPreUpdate(token: TokenDocument.Implementation, changed: { _movementHistory?: HistoryWaypoint[], flags?: Record<string, unknown> }, options: { isUndo?: boolean, movement?: Record<string, { waypoints?: { action?: string }[] }> }) {
  if (options.isUndo) return onPreUndo(token, changed);
  const history = changed._movementHistory;
  if (!history) return;
  const before = token._source._movementHistory.length;
  const fresh = history.slice(before);
  const first = fresh[0];
  if (!first?.movementId) return;
  const waypoints = options.movement?.[token.id ?? ""]?.waypoints ?? fresh;
  if (!standsUp(token, waypoints)) return;
  const action = waypoints.find(w => w.action && w.action !== STAND_ACTION)?.action ?? "walk";
  const cost = standCost(token, action);
  if (cost === undefined) return;
  first.cost = (first.cost ?? 0) + cost;
  foundry.utils.setProperty(changed, `flags.midi-qol.${FLAG}`, { movementId: first.movementId, cost } satisfies StandMark);
}

/** Ctrl+Z: the history goes back past the stand: Prone back once the undo has been made */
const proneAgain = new WeakSet<TokenDocument.Implementation>();
function onPreUndo(token: TokenDocument.Implementation, changed: { _movementHistory?: HistoryWaypoint[] }) {
  // Only a stand this turn's history still holds (core clears it at each turn start)
  const mark = currentMark(token);
  if (!mark || !changed._movementHistory) return;
  if (changed._movementHistory.some(w => w.movementId === mark.movementId)) return;
  proneAgain.add(token);
}

async function onUpdate(token: TokenDocument.Implementation) {
  if (!proneAgain.has(token)) return;
  proneAgain.delete(token);
  await token.update({ [`flags.midi-qol.-=${FLAG}`]: null } as never);
  if (token.actor && !token.actor.statuses.has(PRONE)) await toggleStatus(token.actor, PRONE, { active: true });
}

/** The move standing it up has been made: Prone ends */
async function onMoved(token: TokenDocument.Implementation, movement: { id?: string }, user: User.Implementation | undefined) {
  if (!user?.isSelf) return;
  const mark = markOf(token);
  if (!mark || mark.movementId !== movement.id || !token.actor?.statuses.has(PRONE)) return;
  await toggleStatus(token.actor, PRONE, { active: false });
}

/** The Token HUD's Stand up button, for a prone creature in combat */
function onRenderTokenHUD(hud: { document?: TokenDocument.Implementation }, html: HTMLElement) {
  const token = hud.document;
  if (!token?.actor?.statuses.has(PRONE) || !token.isOwner || configSettings.proneStanding === "none") return;
  const column = html.querySelector(".col.left");
  if (!column) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon";
  const label = game.i18n?.localize("midi-qol.Movement.StandUp") ?? "Stand up";
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<i class="fa-solid fa-person-arrow-up-from-line" inert></i>`;
  button.addEventListener("click", () => { void standUp(token); });
  column.append(button);
}

export function setupProneStanding() {
  registerStandAction();
  Hooks.on("preUpdateToken", (token, changed, options) => onPreUpdate(token, changed as never, options as never));
  Hooks.on("updateToken", token => { void onUpdate(token); });
  Hooks.on("moveToken", (token, movement, _operation, user) => { void onMoved(token, movement as { id?: string }, user as User.Implementation | undefined); });
  Hooks.on("renderTokenHUD", (hud, html) => onRenderTokenHUD(hud as never, html as HTMLElement));
}
