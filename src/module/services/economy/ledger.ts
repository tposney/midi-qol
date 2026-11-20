import { MODULE_ID, getStaticID } from "../../../midi-qol.js";
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

export type BudgetKindId = "reaction" | "bonus";

interface BudgetKind {
  id: BudgetKindId;
  status: string;
  flags: { exhausted: string, used: string, max: string, round: string, reset: string };
  enforce: () => string;
}

const KINDS: Record<BudgetKindId, BudgetKind> = {
  reaction: {
    id: "reaction", status: "reaction",
    flags: { exhausted: "reaction", used: "reactionsUsed", max: "reactionsMax", round: "reactionCombatRound", reset: "reactionsReset" },
    enforce: () => configSettings.enforceReactions
  },
  bonus: {
    id: "bonus", status: "bonusaction",
    flags: { exhausted: "bonus", used: "bonusActionsUsed", max: "bonusActionsMax", round: "bonusActionCombatRound", reset: "bonusActionsReset" },
    enforce: () => configSettings.enforceBonusActions
  }
};

export interface BudgetState {
  used: number;
  max: number;
  /** used >= max */
  exhausted: boolean;
  /** The window effect, while one is open */
  window?: ActiveEffect.Implementation;
}

type ActorRef = Actor.Implementation | TokenDocument.Implementation | null | undefined;

function actorOf(ref: ActorRef): Actor.Implementation | undefined {
  if (!ref) return undefined;
  return ref instanceof TokenDocument ? ref.actor ?? undefined : ref;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function actionFlags(actor: Actor.Implementation): Record<string, unknown> {
  const flags: unknown = actor.getFlag(MODULE_ID, "actions");
  return isRecord(flags) ? flags : {};
}

function template(kind: BudgetKindId): ActiveEffect.Implementation | undefined {
  return kind === "reaction" ? getReactionEffect() : getBonusActionEffect();
}

function numberOf(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** A kind's budget for an actor (or a token's actor) */
export function budget(ref: ActorRef, kindId: BudgetKindId): BudgetState {
  const actor = actorOf(ref);
  const kind = KINDS[kindId];
  if (!actor || !kind) return { used: 0, max: 1, exhausted: false };
  const flags = actionFlags(actor);
  const used = numberOf(flags[kind.flags.used], 0);
  const max = numberOf(flags[kind.flags.max], 1);
  const window = actor.effects.get(getStaticID(kind.status));
  return { used, max, exhausted: used >= max, window };
}

/** The ledger for an actor or token: each budget kind's state (MidiQOL.economy.ledger) */
export function ledger(ref: ActorRef): Record<BudgetKindId, BudgetState> {
  return { reaction: budget(ref, "reaction"), bonus: budget(ref, "bonus") };
}

function windowChanges(actor: Actor.Implementation, kind: BudgetKind, count: number) {
  const max = numberOf(actionFlags(actor)[kind.flags.max], 1);
  return [
    { key: `flags.${MODULE_ID}.actions.${kind.flags.exhausted}`, type: "override", value: String(count >= max) },
    { key: `flags.${MODULE_ID}.actions.${kind.flags.used}`, type: "override", value: String(count) },
    { key: `flags.${MODULE_ID}.actions.${kind.flags.round}`, type: "override", value: String(game.combat?.round ?? false) }
  ];
}

/** The kind is tracked for this actor (the enforce setting: all, display only, or this actor type) */
function tracked(actor: Actor.Implementation, kind: BudgetKind): boolean {
  const setting = kind.enforce();
  return ["all", "displayOnly"].includes(setting) || setting === actor.type;
}

/** A new window effect for the kind, its expiry from the actor's reset flag */
function newWindow(actor: Actor.Implementation, kind: BudgetKind, count: number): ActiveEffect.Implementation | undefined {
  const effect = template(kind.id)?.clone({}, { keepId: true });
  if (!effect) return undefined;
  // @ts-expect-error fvtt-types v14 ActiveEffect
  effect.updateSource({ origin: actor.uuid, "system.changes": windowChanges(actor, kind, count) });
  const reset = actionFlags(actor)[kind.flags.reset];
  if (reset === "eachTurn") effect.updateSource({ duration: { value: 1, units: "turns" } });
  if (reset === "rest") effect.updateSource({ duration: { expiry: null }, flags: { dae: { specialDuration: ["shortRest"] } } });
  if (reset === "never") effect.updateSource({ duration: { expiry: null }, flags: { dae: { specialDuration: [] } } });
  return effect;
}

/**
 * Spend one of a kind (MidiQOL.economy.spend): the window opened, or its count raised in place. The kind's pre hook
 * may cancel (it gets the window as it will be); its post hook follows.
 */
export async function spend(ref: ActorRef, kindId: BudgetKindId): Promise<void> {
  const actor = actorOf(ref);
  const kind = KINDS[kindId];
  if (!actor || !kind || !tracked(actor, kind)) return;
  const effect = newWindow(actor, kind, budget(actor, kindId).used + 1);
  if (!effect) return;
  // The hooks by name, as today (and so tools/surface.mjs lists them)
  const allowed = kindId === "reaction" ? await asyncHooksCall("midi-qol.preSetReactionUsed", actor, effect)
    : await asyncHooksCall("midi-qol.preSetBonusActionUsed", actor, effect);
  if (allowed === false) return;
  await queueActorEffects(actor, async () => {
    // Counted again in the queue: another spend may have landed since
    const count = budget(actor, kindId).used + 1;
    const open = actor.effects.get(getStaticID(kind.status));
    // @ts-expect-error fvtt-types v14 ActiveEffect
    if (open) await open.update({ "system.changes": windowChanges(actor, kind, count) });
    else {
      const data = effect.toObject();
      foundry.utils.setProperty(data, "system.changes", windowChanges(actor, kind, count));
      await createEffectWithId(actor, data);
    }
  });
  if (kindId === "reaction") await asyncHooksCallAll("midi-qol.setReactionUsed", actor, effect);
  else await asyncHooksCallAll("midi-qol.setBonusActionUsed", actor, effect);
}

/** Give one back (MidiQOL.economy.refund; a use undone): the count lowered, the window closed at none */
export async function refund(ref: ActorRef, kindId: BudgetKindId): Promise<void> {
  const actor = actorOf(ref);
  const kind = KINDS[kindId];
  if (!actor || !kind) return;
  await queueActorEffects(actor, async () => {
    const open = actor.effects.get(getStaticID(kind.status));
    if (!open) return;
    const count = budget(actor, kindId).used - 1;
    if (count <= 0) await deleteEffectIfPresent(actor, open.id);
    // @ts-expect-error fvtt-types v14 ActiveEffect
    else await open.update({ "system.changes": windowChanges(actor, kind, count) });
  });
}

/** Close the kind's window (MidiQOL.economy.reset): a rest, or setReactionUsed(actor, false) */
export async function reset(ref: ActorRef, kindId: BudgetKindId): Promise<void> {
  const actor = actorOf(ref);
  const kind = KINDS[kindId];
  if (!actor || !kind) return;
  await queueActorEffects(actor, () => deleteEffectIfPresent(actor, getStaticID(kind.status)));
}

export const economyApi = { ledger, budget, spend, refund, reset };
