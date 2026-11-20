import { MODULE_ID, getStaticID, i18n } from "../../../midi-qol.js";
import { configSettings } from "../../settings.js";
import { asyncHooksCall, asyncHooksCallAll, createEffectWithId, deleteEffectIfPresent, getBonusActionEffect, getReactionEffect, queueActorEffects } from "../../utils.js";

/*
 * The action economy ledger (M4 stage 2; plan ~/Documents/midi-next-M4-plan-2026-11-20.md, option B agreed 2026-11-20):
 * a budget kind's spends in a window are counted on one window effect on the actor, the kind's marker (reaction:
 * dnd5ereaction000, bonus action: dnd5ebonusaction), made from its status effect. The window ends when the effect
 * expires, by whatever expiry it has (core's at the bearer's turn start, DAE's combat end and short rest, a 1-turn
 * duration for `reactionsReset: "eachTurn"`, or one a module or macro gives it), so resets are effect expiry, never the
 * ledger's. A later spend in the window updates the count in place (the window keeps its start); the effect's changes
 * put the count in the actor's flags (`flags.midi-qol.actions.reactionsUsed` ...), which the ledger reads.
 * Budgets are actor data set by effects: `flags.midi-qol.actions.reactionsMax` (two reactions), `reactionsReset`
 * (eachTurn / rest / never). Writes go through the actor's effect queue (lib: queueActorEffects), so spends on one actor
 * never race; the fixed id keeps one window per kind whoever creates it.
 */

export type BudgetKindId = "action" | "bonus" | "reaction";

interface BudgetKind {
  id: BudgetKindId;
  /** The window effect's id: a status's (the marker) or its own */
  windowId: () => string;
  flags: { exhausted: string, used: string, max: string, round: string, reset: string };
  /** Tracked for this actor: the enforce setting (all, display only, this actor type); the action always */
  tracked: (actor: Actor.Implementation) => boolean;
}

const bySetting = (setting: () => string) => (actor: Actor.Implementation) =>
  ["all", "displayOnly"].includes(setting()) || setting() === actor.type;

const KINDS: Record<BudgetKindId, BudgetKind> = {
  // The turn's window: the action, and the turn's counters (attacks left from the Attack action, a leveled spell cast).
  // Not a status: no token icon, no HUD toggle
  action: {
    id: "action", windowId: () => getStaticID("turn"),
    flags: { exhausted: "action", used: "actionsUsed", max: "actionsMax", round: "actionCombatRound", reset: "actionsReset" },
    tracked: () => true
  },
  reaction: {
    id: "reaction", windowId: () => getStaticID("reaction"),
    flags: { exhausted: "reaction", used: "reactionsUsed", max: "reactionsMax", round: "reactionCombatRound", reset: "reactionsReset" },
    tracked: bySetting(() => configSettings.enforceReactions)
  },
  bonus: {
    id: "bonus", windowId: () => getStaticID("bonusaction"),
    flags: { exhausted: "bonus", used: "bonusActionsUsed", max: "bonusActionsMax", round: "bonusActionCombatRound", reset: "bonusActionsReset" },
    tracked: bySetting(() => configSettings.enforceBonusActions)
  }
};

/** A window's counters besides its count: `flags.midi-qol.actions.<name>` (attacksLeft, leveledSpell, objectInteraction) */
export type WindowCounters = Record<string, number | boolean>;

export interface BudgetState {
  used: number;
  max: number;
  /** used >= max */
  exhausted: boolean;
  /** The window effect, while one is open */
  window?: ActiveEffect.Implementation;
  /** The window's counters (the turn window's attacksLeft, leveledSpell...) */
  counters: WindowCounters;
}

type ActorRef = Actor.Implementation | TokenDocument.Implementation | null | undefined;

function actorOf(ref: ActorRef): Actor.Implementation | undefined {
  if (!ref) return undefined;
  return ref instanceof TokenDocument ? ref.actor ?? undefined : ref;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

/** One of the actor's `flags.midi-qol.actions` values (budgets: reactionsMax, attacksMax...) */
export function actionFlag(actor: Actor.Implementation, name: string): unknown {
  return actionFlags(actor)[name];
}

function actionFlags(actor: Actor.Implementation): Record<string, unknown> {
  const flags: unknown = actor.getFlag(MODULE_ID, "actions");
  return isRecord(flags) ? flags : {};
}

/** The kind's window as created: the reaction and bonus action markers from their status effects; the turn's own */
function template(kind: BudgetKindId): ActiveEffect.Implementation | undefined {
  if (kind === "reaction") return getReactionEffect();
  if (kind === "bonus") return getBonusActionEffect();
  const data: ActiveEffect.CreateData = {
    _id: KINDS.action.windowId(), name: i18n("midi-qol.Economy.TurnWindow"), img: "icons/svg/clockwork.svg",
    // showIcon 0: CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER
    showIcon: 0,
    duration: { expiry: "targetStart" }, flags: { dae: { specialDuration: ["combatEnd", "shortRest"] } }
  };
  return new ActiveEffect.implementation(data);
}

const CORE_FLAGS = (kind: BudgetKind) => new Set([kind.flags.exhausted, kind.flags.used, kind.flags.round]);

/** The open window's counters, from its changes */
function windowCounters(window: ActiveEffect.Implementation | undefined, kind: BudgetKind): WindowCounters {
  const counters: WindowCounters = {};
  const prefix = `flags.${MODULE_ID}.actions.`;
  // @ts-expect-error fvtt-types v14 ActiveEffect
  for (const change of window?.system.changes ?? []) {
    if (typeof change.key !== "string" || !change.key.startsWith(prefix)) continue;
    const name = change.key.slice(prefix.length);
    if (CORE_FLAGS(kind).has(name)) continue;
    counters[name] = change.value === "true" ? true : change.value === "false" ? false : numberOf(change.value, 0);
  }
  return counters;
}

function numberOf(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** A kind's budget for an actor (or a token's actor) */
export function budget(ref: ActorRef, kindId: BudgetKindId): BudgetState {
  const actor = actorOf(ref);
  const kind = KINDS[kindId];
  if (!actor || !kind) return { used: 0, max: 1, exhausted: false, counters: {} };
  const flags = actionFlags(actor);
  // A window that has ended but not gone (core's or DAE's expiry marked it expired, or it was disabled) is closed: its
  // changes no longer apply, and a spend replaces it
  const effect = actor.effects.get(kind.windowId());
  const window = effect?.active ? effect : undefined;
  // The action's count is the window's alone (an old world's stored `actions.action` flag is not a count)
  const used = numberOf(flags[kind.flags.used], 0);
  const max = numberOf(flags[kind.flags.max], 1);
  return { used, max, exhausted: used >= max, window, counters: windowCounters(window, kind) };
}

/** The ledger for an actor or token: each budget kind's state (MidiQOL.economy.ledger) */
export function ledger(ref: ActorRef): Record<BudgetKindId, BudgetState> {
  return { action: budget(ref, "action"), bonus: budget(ref, "bonus"), reaction: budget(ref, "reaction") };
}

function windowChanges(actor: Actor.Implementation, kind: BudgetKind, count: number, counters: WindowCounters = {}) {
  const max = numberOf(actionFlags(actor)[kind.flags.max], 1);
  return [
    { key: `flags.${MODULE_ID}.actions.${kind.flags.exhausted}`, type: "override", value: String(count >= max) },
    { key: `flags.${MODULE_ID}.actions.${kind.flags.used}`, type: "override", value: String(count) },
    { key: `flags.${MODULE_ID}.actions.${kind.flags.round}`, type: "override", value: String(game.combat?.round ?? false) },
    ...Object.entries(counters).map(([name, value]) => ({ key: `flags.${MODULE_ID}.actions.${name}`, type: "override", value: String(value) }))
  ];
}

/** A new window effect for the kind, its expiry from the actor's reset flag */
function newWindow(actor: Actor.Implementation, kind: BudgetKind, count: number, counters: WindowCounters): ActiveEffect.Implementation | undefined {
  const effect = template(kind.id)?.clone({}, { keepId: true });
  if (!effect) return undefined;
  // @ts-expect-error fvtt-types v14 ActiveEffect
  effect.updateSource({ origin: actor.uuid, "system.changes": windowChanges(actor, kind, count, counters) });
  const reset = actionFlags(actor)[kind.flags.reset];
  if (reset === "eachTurn") effect.updateSource({ duration: { value: 1, units: "turns" } });
  if (reset === "rest") effect.updateSource({ duration: { expiry: null }, flags: { dae: { specialDuration: ["shortRest"] } } });
  if (reset === "never") effect.updateSource({ duration: { expiry: null }, flags: { dae: { specialDuration: [] } } });
  return effect;
}

/**
 * Spend of a kind (MidiQOL.economy.spend): the window opened, or its count raised in place; `count` 0 only sets
 * `counters` (the turn window's leveledSpell for a bonus action spell). The reaction's and bonus action's pre hooks may
 * cancel (they get the window as it will be); their post hooks follow.
 */
export async function spend(ref: ActorRef, kindId: BudgetKindId, options: { count?: number, counters?: WindowCounters } = {}): Promise<void> {
  const actor = actorOf(ref);
  const kind = KINDS[kindId];
  if (!actor || !kind || !kind.tracked(actor)) return;
  const by = options.count ?? 1;
  const current = budget(actor, kindId);
  const effect = newWindow(actor, kind, current.used + by, { ...current.counters, ...options.counters });
  if (!effect) return;
  // The hooks by name, as today (and so tools/surface.mjs lists them)
  let allowed: boolean | undefined = true;
  if (kindId === "reaction") allowed = await asyncHooksCall("midi-qol.preSetReactionUsed", actor, effect);
  else if (kindId === "bonus") allowed = await asyncHooksCall("midi-qol.preSetBonusActionUsed", actor, effect);
  if (allowed === false) return;
  await queueActorEffects(actor, async () => {
    // Counted again in the queue: another spend may have landed since
    const now = budget(actor, kindId);
    const changes = windowChanges(actor, kind, now.used + by, { ...now.counters, ...options.counters });
    // @ts-expect-error fvtt-types v14 ActiveEffect
    if (now.window) await now.window.update({ "system.changes": changes });
    else {
      // An ended window still there gives way to the new one
      await deleteEffectIfPresent(actor, kind.windowId());
      const data = effect.toObject();
      foundry.utils.setProperty(data, "system.changes", changes);
      await createEffectWithId(actor, data);
    }
  });
  if (kindId === "reaction") await asyncHooksCallAll("midi-qol.setReactionUsed", actor, effect);
  else if (kindId === "bonus") await asyncHooksCallAll("midi-qol.setBonusActionUsed", actor, effect);
}

/** Give one back (MidiQOL.economy.refund; a use undone): the count lowered, the window closed at none */
export async function refund(ref: ActorRef, kindId: BudgetKindId): Promise<void> {
  const actor = actorOf(ref);
  const kind = KINDS[kindId];
  if (!actor || !kind) return;
  await queueActorEffects(actor, async () => {
    const now = budget(actor, kindId);
    if (!now.window) return;
    const count = now.used - 1;
    if (count <= 0 && !Object.keys(now.counters).length) await deleteEffectIfPresent(actor, now.window.id);
    // @ts-expect-error fvtt-types v14 ActiveEffect
    else await now.window.update({ "system.changes": windowChanges(actor, kind, Math.max(count, 0), now.counters) });
  });
}

/** Close the kind's window (MidiQOL.economy.reset): a rest, or setReactionUsed(actor, false) */
export async function reset(ref: ActorRef, kindId: BudgetKindId): Promise<void> {
  const actor = actorOf(ref);
  const kind = KINDS[kindId];
  if (!actor || !kind) return;
  await queueActorEffects(actor, () => deleteEffectIfPresent(actor, kind.windowId()));
}


