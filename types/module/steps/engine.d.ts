export declare const SUSPEND = "midi-qol.Suspend";
export declare const ABORT = "midi-qol.Abort";
export declare const FINISHED = "midi-qol.RollFinished";
export declare const COMPLETED = "midi-qol.Completed";
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
    changes?(step: string): {
        before: readonly string[];
        after: readonly string[];
        removed: boolean;
    } | undefined;
    /** Where the use goes on to past a removed step (the next step in its flow). */
    flowNext?(step: string): string | undefined;
    /** A move with inserted steps under way, kept across runs (an inserted step can suspend). */
    move?: StepMove;
}
/**
 * Inserted steps still to run in a move, the step it was going to, and whether the step running came from the queue.
 * The engine never changes one in place: it gives the host a new move whenever it changes (the host stores it).
 */
export interface StepMove {
    readonly queue: readonly string[];
    readonly then: string | undefined;
    readonly inserted: boolean;
}
/** An inserted step that returns this, or nothing, lets the move it was inserted into go on. */
export declare const CONTINUE = "midi-qol.Continue";
/** Runs from `start`; returns why it stopped. */
export declare function runSteps(host: EngineHost, start: string | undefined): Promise<"suspended" | "undefined" | "limit">;
