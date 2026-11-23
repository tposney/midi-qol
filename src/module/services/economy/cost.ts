import { Registry } from "../../api/registry.js";
import type { Workflow } from "../../Workflow.js";
import type { Activity } from "../../../globals.js";
import { tagValue } from "../../lib/tags.js";
import { actionFlag, budget, spend, type BudgetKindId } from "./ledger.js";

/*
 * What a use costs and its charge (M4 stage 3; plan ~/Documents/midi-next-M4-plan-2026-11-20.md).
 * - `cost(activity, workflow)` (MidiQOL.economy.cost): the action, bonus action and reaction a use spends. Midi's base
 *   is today's: a reaction or bonus action as the use checks decided it (an opportunity attack is a reaction), the
 *   action only in combat on the actor's own turn. Cost contributors (MidiQOL.economy.costContributors.register) change it in
 *   priority order: Cunning Action making Dash a bonus action, Quickened Spell.
 * - `chargeUse(workflow)`: spends it on the ledger when the use is under way. A weapon attack's Attack action carries
 *   the attacks it allows (`flags.midi-qol.actions.attacksMax`, Extra Attack 2): the first spends the action and leaves
 *   attacksMax - 1 on the turn window, the next ones spend those. A spell cast with a slot sets the turn window's
 *   `leveledSpell` (the one-slot-per-turn rule, stage 4). A kind already used up is not charged again (as before).
 * Refunds: undo restores the actor as it was before the use (its snapshot is taken before the charge), window included.
 */

export interface UseCost { action: number, bonus: number, reaction: number }

export interface CostQuery {
  activity: Activity;
  actor: Actor.Implementation;
  workflow?: Workflow;
  /** The cost so far (midi's base, then earlier contributors) */
  cost: UseCost;
}

/** Returns the cost to use instead, or undefined to leave it */
export type CostContributor = (query: CostQuery) => UseCost | undefined;

const contributors = new Registry<CostContributor>();

export function registerCostContributor(id: string, contributor: CostContributor, options: { priority?: number } = {}): () => void {
  contributors.set(id, contributor, { priority: options.priority });
  return () => { contributors.delete(id); };
}

/** midi's base cost: the rules midi charged by before the ledger */
function baseCost(activity: Activity, workflow: Workflow | undefined): UseCost {
  const activation = workflow?.activity?.effectiveActivationType ?? activity.activation?.type;
  if (!workflow) return { action: activation === "action" ? 1 : 0, bonus: activation === "bonus" ? 1 : 0, reaction: activation === "reaction" ? 1 : 0 };
  const options = workflow.workflowOptions ?? {};
  // An over-time tick (a repeated save, damage each turn) is not the bearer's use: it costs nothing
  if (options.isOverTime) return { action: 0, bonus: 0, reaction: 0 };
  return {
    reaction: workflow.itemUsesReaction || options.castUsesReaction ? 1 : 0,
    bonus: workflow.itemUsesBonusAction || options.castUsesBonusAction ? 1 : 0,
    action: workflow.inCombat && workflow.isTurn && !workflow.AoO && activity.activation?.type === "action" ? 1 : 0
  };
}

/** What `activity` costs `actor` (MidiQOL.economy.cost) */
export function cost(activity: Activity, workflow?: Workflow): UseCost {
  const actor = workflow?.actor ?? activity.actor;
  let current = baseCost(activity, workflow);
  if (!actor) return current;
  for (const entry of contributors.entries()) {
    try {
      const changed = entry.value({ activity, actor, workflow, cost: { ...current } });
      if (changed) current = { action: changed.action ?? 0, bonus: changed.bonus ?? 0, reaction: changed.reaction ?? 0 };
    } catch (err) {
      console.warn(`midi-qol | economy cost contributor ${entry.id} failed`, err);
    }
  }
  return current;
}

function attacksMax(actor: Actor.Implementation): number {
  const value = Number(actionFlag(actor, "attacksMax"));
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

/** Charge the use's cost on the ledger; returns what was charged */
export async function chargeUse(workflow: Workflow): Promise<UseCost> {
  const actor = workflow.actor;
  const charged: UseCost = { action: 0, bonus: 0, reaction: 0 };
  if (!actor || !workflow.activity) return charged;
  const due = cost(workflow.activity, workflow);
  for (const kind of ["reaction", "bonus"] as BudgetKindId[]) {
    if (!due[kind] || budget(actor, kind).exhausted) continue;
    await spend(actor, kind);
    charged[kind] = 1;
  }
  const weaponAttack = ["mwak", "rwak"].includes(String(tagValue(workflow, "use.attack") ?? ""));
  const leveledSpell = workflow.inCombat && workflow.isTurn && Number(tagValue(workflow, "use.spellSlot") ?? 0) > 0;
  if (due.action) {
    const turn = budget(actor, "action");
    const attacksLeft = Number(turn.counters.attacksLeft ?? 0);
    if (weaponAttack && turn.window && attacksLeft > 0) {
      await spend(actor, "action", { count: 0, counters: { attacksLeft: attacksLeft - 1, ...(leveledSpell ? { leveledSpell: true } : {}) } });
    } else if (!turn.exhausted) {
      await spend(actor, "action", { counters: { ...(weaponAttack ? { attacksLeft: attacksMax(actor) - 1 } : {}), ...(leveledSpell ? { leveledSpell: true } : {}) } });
      charged.action = 1;
    }
  } else if (leveledSpell) await spend(actor, "action", { count: 0, counters: { leveledSpell: true } });
  return charged;
}

/**
 * One attack of the Attack action, outside a use (2024 Grapple and Shove replace one attack): an attack left on the
 * turn window if there is one, else the action, leaving the rest of its attacks (Extra Attack)
 */
export async function spendAttack(actor: Actor.Implementation): Promise<void> {
  const turn = budget(actor, "action");
  const attacksLeft = Number(turn.counters.attacksLeft ?? 0);
  if (turn.window && attacksLeft > 0) await spend(actor, "action", { count: 0, counters: { attacksLeft: attacksLeft - 1 } });
  else if (!turn.exhausted) await spend(actor, "action", { counters: { attacksLeft: attacksMax(actor) - 1 } });
}

/** Whether the actor has an attack left this turn (one left on the turn window, or its action) */
export function canAttack(actor: Actor.Implementation): boolean {
  const turn = budget(actor, "action");
  return (!!turn.window && Number(turn.counters.attacksLeft ?? 0) > 0) || !turn.exhausted;
}

export const costContributorsApi = { register: registerCostContributor, entries: () => contributors.entries().map(entry => entry.id) };
