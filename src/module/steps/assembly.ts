/*
 * Step assembly (M3 stage 1; plan ~/Documents/midi-next-M3-plan-2026-11-18.md): a use's changes to its flow, per
 * anchor step, from the layers that ask for them. Two layers (the 2026-11-18 review): global changes (registered by
 * modules, with a `when` already evaluated by the caller) and the call (completeActivityUse's `steps`). Narrowest wins:
 * the call over global. Within a layer, the higher priority first, then the order the changes were made. Pure.
 */

export type StepLayer = "global" | "call";
const LAYER_RANK: Record<StepLayer, number> = { global: 0, call: 1 };

export type StepChange =
  /** Run `step` before or after the anchor step. */
  | { kind: "insert", step: string, before?: string, after?: string, layer: StepLayer, priority?: number, source?: string }
  /** Run `step` instead of the anchor (`target`). */
  | { kind: "replace", target: string, step: string, layer: StepLayer, priority?: number, source?: string }
  /** Run `wrapper` around the anchor (it calls the anchor's run). */
  | { kind: "wrap", target: string, wrapper: string, layer: StepLayer, priority?: number, source?: string }
  /** Don't run the anchor: the use goes on to the step after it in its flow. */
  | { kind: "remove", target: string, layer: StepLayer, priority?: number, source?: string };

export interface AnchorChanges {
  before: string[];
  after: string[];
  /** The step that runs instead of the anchor. */
  replacement?: string;
  /** Outermost first. */
  wraps: string[];
  removed: boolean;
}

export interface StepConflict {
  anchor: string;
  kind: "replace" | "remove";
  /** The change that wins. */
  winner: string;
  /** The changes that lose to it. */
  losers: string[];
}

export interface AssembledSteps {
  anchors: Record<string, AnchorChanges>;
  conflicts: StepConflict[];
}

type Ranked<T> = T & { order: number };

/** Higher layer (narrower) first, then higher priority, then earlier. */
function byPrecedence(a: Ranked<StepChange>, b: Ranked<StepChange>): number {
  return (LAYER_RANK[b.layer] - LAYER_RANK[a.layer]) || ((b.priority ?? 0) - (a.priority ?? 0)) || (a.order - b.order);
}

/** For inserts and wraps the order to run them in: global before call, then higher priority, then earlier. */
function byRunOrder(a: Ranked<StepChange>, b: Ranked<StepChange>): number {
  return (LAYER_RANK[a.layer] - LAYER_RANK[b.layer]) || ((b.priority ?? 0) - (a.priority ?? 0)) || (a.order - b.order);
}

const label = (change: StepChange) => change.source ?? (change.kind === "wrap" ? change.wrapper : change.kind === "remove" ? `remove ${change.target}` : change.step);

export function assembleSteps(changes: readonly StepChange[]): AssembledSteps {
  const anchors: Record<string, AnchorChanges> = {};
  const anchor = (id: string) => (anchors[id] ??= { before: [], after: [], wraps: [], removed: false });
  const ranked: Ranked<StepChange>[] = changes.map((change, order) => ({ ...change, order }));
  const conflicts: StepConflict[] = [];

  for (const change of ranked.filter(c => c.kind === "insert").sort(byRunOrder)) {
    if (change.kind !== "insert") continue;
    if (change.before) anchor(change.before).before.push(change.step);
    if (change.after) anchor(change.after).after.push(change.step);
  }
  for (const change of ranked.filter(c => c.kind === "wrap").sort(byRunOrder)) {
    if (change.kind === "wrap") anchor(change.target).wraps.push(change.wrapper);
  }
  // Replace and remove compete for an anchor: the change with precedence wins; the others are reported
  const contested = new Map<string, Ranked<StepChange>[]>();
  for (const change of ranked) {
    if (change.kind !== "replace" && change.kind !== "remove") continue;
    const list = contested.get(change.target) ?? [];
    list.push(change);
    contested.set(change.target, list);
  }
  for (const [target, list] of contested) {
    const [winner, ...losers] = [...list].sort(byPrecedence);
    if (winner.kind === "replace") anchor(target).replacement = winner.step;
    else anchor(target).removed = true;
    if (losers.length) conflicts.push({ anchor: target, kind: winner.kind as "replace" | "remove", winner: label(winner), losers: losers.map(label) });
  }
  return { anchors, conflicts };
}

/** The step after `step` in a flow's list (where a removed step's use goes on to). */
export function stepAfterInFlow(flow: readonly string[], step: string): string | undefined {
  const index = flow.indexOf(step);
  return index >= 0 ? flow[index + 1] : undefined;
}
