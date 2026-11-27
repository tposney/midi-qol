import type { Workflow } from "../Workflow.js";

/*
 * How a use came about, as data (tags `use.cause` and `use.casts`, lib/tags.ts), set where uses are launched, never
 * per caller:
 * - "direct": its user chose it; "reaction": its user chose it as a reaction (workflowOptions.reactionTrigger);
 * - "triggered": another use launched it (a Then activity, an entry's `use`: workflowOptions.isTriggered);
 * - "chain": a chain's leap or arc (workflowOptions.chain: Chromatic Orb, Chain Lightning);
 * - "overTime": an effect's tick (workflowOptions.isOverTime);
 * - "area": an area's use on a creature in it (entering it, a turn there: workflowOptions.areaTargets).
 * Casting a spell (`use.casts`): a spell's use its user chose (direct or as a reaction) of an activity that spends a
 * slot (dnd5e's consumption.spellSlot: Moonbeam's move doesn't). Counterspell's condition reads it.
 */

export type UseCause = "direct" | "reaction" | "triggered" | "chain" | "overTime" | "area";

export function useCause(workflow: Workflow): UseCause {
  const options = (workflow.workflowOptions ?? {}) as { isTriggered?: boolean, isOverTime?: boolean, areaTargets?: boolean, chain?: unknown, reactionTrigger?: string };
  if (options.isOverTime) return "overTime";
  if (options.areaTargets) return "area";
  if (options.chain) return "chain";
  if (options.isTriggered) return "triggered";
  if (options.reactionTrigger) return "reaction";
  return "direct";
}

/** Whether the use is the casting of a spell */
export function isCasting(workflow: Workflow): boolean {
  // @ts-expect-error item.type includes dnd5e subtypes
  if (workflow.item?.type !== "spell") return false;
  if (!["direct", "reaction"].includes(useCause(workflow))) return false;
  return (workflow.activity as { consumption?: { spellSlot?: boolean } } | undefined)?.consumption?.spellSlot !== false;
}
