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
}

/** Runs from `start`; returns why it stopped. */
export async function runSteps(host: EngineHost, start: string | undefined): Promise<"suspended" | "undefined" | "limit"> {
  let next = start;
  let isAborting = host.aborted;
  while (host.countTransition()) {
    const current = host.currentStep;
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
        }
        if (!isAborting && host.aborted) {
          host.note(`${host.name(current)} -> ${host.name(next)} aborted by pre ${host.name(current)} macro pass`);
          next = ABORT;
          continue;
        }
      }
      await host.pass("pre", next);
      if (await host.hook("pre", next) === false && !isAborting) {
        host.note(`${host.name(current)} -> ${host.name(next)} aborted by pre ${host.name(next)} Hook`);
        if (!host.aborted) host.cancelled();
        next = host.aborted ? ABORT : FINISHED;
        continue;
      }
      if (host.aborted && !isAborting) {
        host.note(`${host.name(current)} -> ${host.name(next)} aborted by pre ${host.name(next)} macro pass`);
        next = ABORT;
        continue;
      }
      host.currentStep = next;
    }
    const after = await host.run(host.currentStep);
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
