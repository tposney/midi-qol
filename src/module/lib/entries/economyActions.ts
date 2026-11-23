import { grantAttacks } from "../../services/economy/cost.js";
import type { BudgetKindId } from "../../services/economy/ledger.js";
import { registerAction, type ActionRun } from "./engine.js";

/*
 * M8: `{ grantAttacks: { count, filter, kind?, spends? } }`: the entry's actor may make `count` more attacks this turn
 * (a formula in the entry's roll data: "@scale.monk.flurry-of-blows", "2 + (@classes.monk.levels >= 10 ? 1 : 0)"),
 * with attacks `filter` allows (unarmed, light, weapon, an item identifier), on `kind`'s window (default: the kind the
 * use spent: Flurry of Blows' bonus action), each spending `spends` (default nothing: the use paid; Two-Weapon
 * Fighting's off-hand attack: "bonus"). Granted attacks are used before the action (services/economy/cost.ts).
 */

const KINDS: readonly BudgetKindId[] = ["action", "bonus", "reaction"];

function useKind(run: ActionRun): BudgetKindId {
  const activation = (run.context.workflow?.activity as { activation?: { type?: string } } | undefined)?.activation?.type;
  return KINDS.includes(activation as BudgetKindId) ? activation as BudgetKindId : "action";
}

async function count(value: unknown, run: ActionRun): Promise<number> {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return 0;
  try { return (await new Roll(value, run.conditionData).evaluate()).total ?? 0; }
  catch { return 0; }
}

async function grantAttacksAction(run: ActionRun) {
  const spec = (run.action.grantAttacks ?? {}) as { count?: unknown, filter?: string, kind?: string, spends?: string };
  const actor = run.found.actor ?? run.context.actor;
  const n = await count(spec.count ?? 1, run);
  if (!actor || !(n > 0)) return { success: false };
  const kind = KINDS.includes(spec.kind as BudgetKindId) ? spec.kind as BudgetKindId : useKind(run);
  const spends = KINDS.includes(spec.spends as BudgetKindId) ? spec.spends as BudgetKindId : undefined;
  await grantAttacks(actor, { kind, count: n, filter: spec.filter || "weapon", ...(spends ? { spends } : {}) });
  return { success: true };
}

export function registerEconomyActions() {
  registerAction("grantAttacks", grantAttacksAction);
}
