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
}
/** Runs from `start`; returns why it stopped. */
export declare function runSteps(host: EngineHost, start: string | undefined): Promise<"suspended" | "undefined" | "limit">;
