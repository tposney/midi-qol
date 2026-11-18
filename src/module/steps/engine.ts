/*
 * The step engine: runs a flow's steps from a start step until one suspends or the flow ends (M2 stage 4; plan
 * ~/Documents/midi-next-M2-plan-2026-11-18.md). Pure: everything it does to the world goes through its host (the
 * workflow), so Vitest drives it with fake steps.
 *
 * On each move to a new step: the old step's post pass and hook, then the new step's pre pass and hook. A post or pre
 * hook returning false cancels the use (outcome "cancelled", on to RollFinished) unless the run is aborting; the abort
 * flag set by a pass or hook sends it to Abort. A step that suspends ends the run, unless the event it waits for came
 * while it ran.
 */

export const SUSPEND = "midi-qol.Suspend";
export const ABORT = "midi-qol.Abort";
export const FINISHED = "midi-qol.RollFinished";
export const COMPLETED = "midi-qol.Completed";

export interface EngineHost {
  /** The step the use is in (set by the engine when it moves). */
  currentStep: string | undefined;
  readonly aborted: boolean;
  /** A post/pre hook cancelled the use. */
  cancelled(): void;
  pass(prePost: "pre" | "post", step: string | undefined): Promise<unknown>;
  /** False cancels. */
  hook(prePost: "pre" | "post", step: string | undefined): Promise<boolean | undefined>;
  /** Run a step; the step it goes to next (SUSPEND to wait). */
  run(step: string | undefined): Promise<string | undefined>;
  /** After a step ran (card writes). */
  stepEnded(step: string | undefined, next: string | undefined): Promise<void>;
  /** The step to go on to when the event the suspended step waits for arrived while it ran. */
  pendingNext(step: string | undefined): string | undefined;
  /** Count a transition; false when the run has used up its transitions. */
  countTransition(): boolean;
  suspended: boolean;
  /** Before each step (a yield). */
  tick(): Promise<void>;
  report(message: string): void;
  /** A cancel or abort by a pass or hook (console). */
  note(message: string): void;
  name(step: string | undefined): string;
  /** The use's assembled changes for a step (steps/assembly.ts): inserted before/after, removed. Replacements and wraps are the host's run's business. */
  changes?(step: string): { before: readonly string[], after: readonly string[], removed: boolean } | undefined;
  /** Where the use goes on to past a removed step (the next step in its flow). */
  flowNext?(step: string): string | undefined;
  /** A move with inserted steps under way, kept across runs (an inserted step can suspend). */
  move?: StepMove;
}

/** Inserted steps still to run in a move, the step it was going to, and whether the step running came from the queue. */
export interface StepMove { queue: string[], then: string | undefined, inserted: boolean }

/** An inserted step that returns this, or nothing, lets the move it was inserted into go on. */
export const CONTINUE = "midi-qol.Continue";

/** Runs from `start`; returns why it stopped. */
export async function runSteps(host: EngineHost, start: string | undefined): Promise<"suspended" | "undefined" | "limit"> {
  let next = start;
  let isAborting = host.aborted;
  while (host.countTransition()) {
    const current = host.currentStep;
    // A removed step: on to the step after it in the flow; the steps inserted around it still run
    const aroundRemoved: string[] = [];
    for (let guard = 0; !host.move && next !== undefined && guard < 50 && host.changes?.(next)?.removed; guard++) {
      const removed = host.changes?.(next);
      aroundRemoved.push(...(removed?.before ?? []), ...(removed?.after ?? []));
      next = host.flowNext?.(next);
    }
    // Starting a move from one step to another: its "after" inserts and the next one's "before" inserts run first.
    // A step that aborts is not followed by its "after" inserts.
    if (!host.move && next !== undefined && next !== SUSPEND && current !== next) {
      const leaving = current !== undefined && next !== ABORT && !host.aborted ? host.changes?.(current)?.after ?? [] : [];
      const queue = [...leaving, ...aroundRemoved, ...(host.changes?.(next)?.before ?? [])];
      if (queue.length) {
        host.move = { queue, then: next, inserted: true };
        next = host.move.queue.shift();
      }
    }
    host.suspended = false;
    isAborting ||= host.aborted || next === ABORT;
    if (next === undefined) {
      host.report(`Perform state called with undefined action - previous state was ${host.name(current)}`);
      host.suspended = true;
      return "undefined";
    }
    await host.tick();
    if (current !== next) {
      if (!isAborting || current === COMPLETED) {
        await host.pass("post", current);
        if (await host.hook("post", current) === false && !isAborting) {
          host.note(`${host.name(current)} -> ${host.name(next)} aborted by post ${host.name(current)} Hook`);
          if (!host.aborted) host.cancelled();
          next = host.aborted ? ABORT : FINISHED;
          host.move = undefined;
        }
        if (!isAborting && host.aborted) {
          host.note(`${host.name(current)} -> ${host.name(next)} aborted by post ${host.name(current)} macro pass`);
          next = ABORT;
          host.move = undefined;
          continue;
        }
      }
      await host.pass("pre", next);
      if (await host.hook("pre", next) === false && !isAborting) {
        host.note(`${host.name(current)} -> ${host.name(next)} aborted by pre ${host.name(next)} Hook`);
        if (!host.aborted) host.cancelled();
        next = host.aborted ? ABORT : FINISHED;
        host.move = undefined;
        continue;
      }
      if (host.aborted && !isAborting) {
        host.note(`${host.name(current)} -> ${host.name(next)} aborted by pre ${host.name(next)} macro pass`);
        next = ABORT;
        host.move = undefined;
        continue;
      }
      host.currentStep = next;
      // The move reached the step it was going to
      if (host.move && !host.move.inserted && next === host.move.then) host.move = undefined;
    }
    let after = await host.run(host.currentStep);
    const move = host.move;
    if (move?.inserted && after !== SUSPEND) {
      if (after === undefined || after === CONTINUE) {
        // On with the move: the next inserted step, or the step it was going to
        if (move.queue.length) after = move.queue.shift();
        else { after = move.then; move.inserted = false; }
      } else {
        // An inserted step branched: the move is over
        host.move = undefined;
      }
    }
    await host.stepEnded(host.currentStep, after);
    if (after === SUSPEND) {
      host.suspended = true;
      const pending = host.pendingNext(host.currentStep);
      if (pending !== undefined) {
        host.suspended = false;
        next = pending;
        continue;
      }
      return "suspended";
    }
    next = after;
  }
  return "limit";
}
