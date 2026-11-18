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

/** A change as a module or a call gives it: no layer (the caller sets it). */
export type StepChangeInput = { [K in StepChange["kind"]]: Omit<Extract<StepChange, { kind: K }>, "layer"> }[StepChange["kind"]];

/**
 * Checked and normalised changes for a layer: inserts anchored on a coarse step go before its first fine step or after
 * its last (`insertAnchor`); replace, wrap and remove need a fine step. A change that isn't one is dropped and described.
 */
export function normaliseChanges(input: readonly unknown[], layer: StepLayer, options: {
  insertAnchor?: (id: string, side: "before" | "after") => string,
  isCoarse?: (id: string) => boolean
} = {}): { changes: StepChange[], problems: string[] } {
  const changes: StepChange[] = [];
  const problems: string[] = [];
  const str = (value: unknown): value is string => typeof value === "string" && value.length > 0;
  for (const raw of input) {
    const change = raw as Record<string, unknown> | null;
    const priority = typeof change?.priority === "number" ? change.priority : undefined;
    const source = str(change?.source) ? change.source : undefined;
    const describe = () => { try { return JSON.stringify(raw); } catch { return String(raw); } };
    switch (change?.kind) {
      case "insert": {
        if (!str(change.step) || (!str(change.before) && !str(change.after))) { problems.push(`insert needs step and before or after: ${describe()}`); continue; }
        if (str(change.before) && str(change.after)) { problems.push(`insert takes before or after, not both: ${describe()}`); continue; }
        const before = str(change.before) ? options.insertAnchor?.(change.before, "before") ?? change.before : undefined;
        const after = str(change.after) ? options.insertAnchor?.(change.after, "after") ?? change.after : undefined;
        changes.push({ kind: "insert", step: change.step, before, after, layer, priority, source });
        continue;
      }
      case "replace": case "wrap": case "remove": {
        const step = change.kind === "replace" ? change.step : change.kind === "wrap" ? change.wrapper : "-";
        if (!str(change.target) || !str(step)) { problems.push(`${change.kind} needs target${change.kind === "remove" ? "" : change.kind === "wrap" ? " and wrapper" : " and step"}: ${describe()}`); continue; }
        if (options.isCoarse?.(change.target)) { problems.push(`${change.kind} needs a step, not the coarse step ${change.target}: ${describe()}`); continue; }
        if (change.kind === "replace") changes.push({ kind: "replace", target: change.target, step, layer, priority, source });
        else if (change.kind === "wrap") changes.push({ kind: "wrap", target: change.target, wrapper: step, layer, priority, source });
        else changes.push({ kind: "remove", target: change.target, layer, priority, source });
        continue;
      }
      default:
        problems.push(`not a step change: ${describe()}`);
    }
  }
  return { changes, problems };
}

/** Every step a use's changes run (inserted, replacements, wrappers). */
export function stepsUsed(changes: readonly StepChange[]): string[] {
  return [...new Set(changes.flatMap(c => c.kind === "insert" || c.kind === "replace" ? [c.step] : c.kind === "wrap" ? [c.wrapper] : []))];
}

/**
 * A use's steps in the order they'd run if every step went on to the next in `flow`: inserts around their anchors,
 * replacements in their place (`a -> b` for b replacing a), wraps as `[w1, w2](step)`, removed steps left out.
 */
export function previewSteps(flow: readonly string[], assembled: AssembledSteps): string[] {
  const list: string[] = [];
  for (const id of flow) {
    const anchor = assembled.anchors[id];
    if (!anchor) { list.push(id); continue; }
    list.push(...anchor.before);
    if (!anchor.removed) {
      const shown = anchor.replacement ? `${id} -> ${anchor.replacement}` : id;
      list.push(anchor.wraps.length ? `[${anchor.wraps.join(", ")}](${shown})` : shown);
    }
    list.push(...anchor.after);
  }
  return list;
}

/** The step after `step` in a flow's list (where a removed step's use goes on to). */
export function stepAfterInFlow(flow: readonly string[], step: string): string | undefined {
  const index = flow.indexOf(step);
  return index >= 0 ? flow[index + 1] : undefined;
}
