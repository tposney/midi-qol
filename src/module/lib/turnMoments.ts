import { MODULE_ID } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { MomentDispatcher, TURN_MOMENTS, type MomentHandler, type TurnMomentName } from "./turnMomentsCore.js";

/*
 * The turn-moment dispatcher (M4 stage 1; plan ~/Documents/midi-next-M4-plan-2026-11-20.md): one place that says a
 * combatant's turn or a round started or ended, raised once, for midi (over-time effects, the economy's resets, M15's
 * triggers) and for modules (MidiQOL.turnMoments.on).
 *
 * It rides core's own combat lifecycle rather than working turns out from updates: core's active GM runs
 * Combat#_onStartTurn / _onEndTurn / _onStartRound / _onEndRound for every boundary a change crosses (several turns or
 * rounds at once, each skipped one marked `skipped`; a change of turn order ends one turn and starts another), and
 * _onEnter / _onExit as combatants join and leave. The moments are raised after the system's own handling (dnd5e's use
 * recovery) and before core's for the same boundary (effect expiry, region turn events): a tick with consequences (damage at
 * the end of its turn, a failed save applying the next stage) happens before an effect ending at that boundary is
 * removed. So:
 * - raised on core's active GM only, as its expiry; with no GM connected, none are (as core's);
 * - round 0 is not a round: its turn end and round end when the combat starts are not raised;
 * - combatStart: round 1 starting from round 0; combatEnd: the combat deleted; rewind: the turn moved back (core raises
 *   nothing for it);
 * - one combat's moments are delivered in the order raised (core doesn't await turn events between updates, so two
 *   quick changes can overlap); a handler that changes the combat must not wait for the moments that raises.
 * Handlers run in priority order, each awaited and isolated, each for at most three seconds: a handler that asks a
 * player starts its own flow and returns.
 */

export type { TurnMomentName };
export { TURN_MOMENTS };

export interface TurnMoment {
  moment: TurnMomentName;
  combat: Combat.Implementation;
  /** The combatant whose turn it is (turn moments), or who joined or left (enter, exit) */
  combatant?: Combatant.Implementation;
  token?: TokenDocument.Implementation | null;
  actor?: Actor.Implementation | null;
  round: number;
  turn: number | null;
  /** Core passed over it on the way to the turn the combat moved to */
  skipped: boolean;
  /** The combat's state before the change */
  previous?: { round: number | null, turn: number | null, combatantId: string | null };
}

interface TurnContext { round?: number, turn?: number | null, skipped?: boolean }

const reportedSlow = new Set<string>();
const dispatcher = new MomentDispatcher<TurnMoment>({
  onError: (id, moment, error) => {
    const message = `midi-qol | turn moment ${moment}: handler ${id} failed`;
    console.warn(message, error);
    TroubleShooter.recordError(error, message);
  },
  onSlow: (id, moment, cap) => {
    if (reportedSlow.has(`${moment}|${id}`)) return;
    reportedSlow.add(`${moment}|${id}`);
    console.warn(`midi-qol | turn moment ${moment}: handler ${id} took over ${cap / 1000}s; the turn went on without it (a handler must not wait for a player)`);
  }
});

function previousOf(combat: Combat.Implementation): TurnMoment["previous"] {
  const previous = combat.previous;
  return previous ? { round: previous.round ?? null, turn: previous.turn ?? null, combatantId: previous.combatantId ?? null } : undefined;
}

function raise(combat: Combat.Implementation, moment: TurnMomentName, context: TurnContext, combatant?: Combatant.Implementation): Promise<void> {
  const token = combatant?.token ?? null;
  return dispatcher.dispatch(combat.id ?? "", {
    moment, combat, combatant, token, actor: combatant?.actor ?? null,
    round: context.round ?? combat.round ?? 0, turn: context.turn ?? combat.turn ?? null, skipped: !!context.skipped,
    previous: previousOf(combat)
  });
}

async function onStartTurn(this: Combat.Implementation, wrapped: Function, combatant: Combatant.Implementation, context: TurnContext) {
  await wrapped(combatant, context);
  await raise(this, "turnStart", context, combatant);
}

async function onEndTurn(this: Combat.Implementation, wrapped: Function, combatant: Combatant.Implementation, context: TurnContext) {
  await wrapped(combatant, context);
  if (!context?.round) return;
  await raise(this, "turnEnd", context, combatant);
}

async function onStartRound(this: Combat.Implementation, wrapped: Function, context: TurnContext) {
  await wrapped(context);
  if (context?.round === 1 && !this.previous?.round) await raise(this, "combatStart", context);
  await raise(this, "roundStart", context);
}

async function onEndRound(this: Combat.Implementation, wrapped: Function, context: TurnContext) {
  await wrapped(context);
  if (!context?.round) return;
  await raise(this, "roundEnd", context);
}

async function onEnter(this: Combat.Implementation, wrapped: Function, combatant: Combatant.Implementation) {
  await wrapped(combatant);
  await raise(this, "enterCombat", {}, combatant);
}

async function onExit(this: Combat.Implementation, wrapped: Function, combatant: Combatant.Implementation) {
  await wrapped(combatant);
  await raise(this, "exitCombat", {}, combatant);
}

type CombatState = { round?: number | null, turn?: number | null } | undefined;

/** The turn moved back: an earlier round, or an earlier turn in the same round */
function rewound(previous: CombatState, current: CombatState): boolean {
  if (!previous || !current || !current.round) return false;
  if ((current.round ?? 0) !== (previous.round ?? 0)) return (current.round ?? 0) < (previous.round ?? 0);
  return (current.turn ?? 0) < (previous.turn ?? 0);
}

type LibWrapperRegister = { register(packageId: string, target: string, fn: (...args: never[]) => unknown, type: string): unknown };

export function setupTurnMoments() {
  const libWrapper = (globalThis as { libWrapper?: LibWrapperRegister }).libWrapper;
  if (!libWrapper) return;
  const prototype = "CONFIG.Combat.documentClass.prototype";
  libWrapper.register(MODULE_ID, `${prototype}._onStartTurn`, onStartTurn, "WRAPPER");
  libWrapper.register(MODULE_ID, `${prototype}._onEndTurn`, onEndTurn, "WRAPPER");
  libWrapper.register(MODULE_ID, `${prototype}._onStartRound`, onStartRound, "WRAPPER");
  libWrapper.register(MODULE_ID, `${prototype}._onEndRound`, onEndRound, "WRAPPER");
  libWrapper.register(MODULE_ID, `${prototype}._onEnter`, onEnter, "WRAPPER");
  libWrapper.register(MODULE_ID, `${prototype}._onExit`, onExit, "WRAPPER");
  Hooks.on("combatTurnChange", (combat: Combat.Implementation, previous: CombatState, current: CombatState) => {
    if (game.user?.isActiveGM && combat.started && rewound(previous, current)) void raise(combat, "rewind", { round: current?.round ?? 0, turn: current?.turn ?? null });
  });
  Hooks.on("deleteCombat", (combat: Combat.Implementation) => {
    if (game.user?.isActiveGM) void raise(combat, "combatEnd", {});
  });
}

/** MidiQOL.turnMoments: add (or replace, by id) a handler for a moment; returns the function that removes it */
export function onTurnMoment(moment: TurnMomentName, id: string, handler: MomentHandler<TurnMoment>, options: { priority?: number, uncapped?: boolean } = {}): () => void {
  if (!(TURN_MOMENTS as readonly string[]).includes(moment)) console.warn(`midi-qol | turnMoments.on: no moment "${moment}" (${TURN_MOMENTS.join(", ")})`);
  return dispatcher.on(moment, id, handler, options);
}

export const turnMomentsApi = {
  moments: TURN_MOMENTS,
  on: onTurnMoment,
  off: (moment: TurnMomentName, id: string) => dispatcher.off(moment, id),
  handlers: (moment: TurnMomentName) => dispatcher.handlers(moment)
};
