export interface Step {
    /** `midi-qol.<name>` for midi's steps. */
    id: string;
    /** The hook and pass name: `pre<name>` / `post<name>`. */
    name: string;
    /** The workflow method that runs it (stage 1). */
    method: string;
    /** The card's queued writes are written when the step ends (a milestone: the card shows its result). */
    flush?: boolean;
    /** A marker, not run: Suspend. */
    marker?: boolean;
}
export declare function registerStep(step: Step): void;
export declare function getStep(id: string): Step | undefined;
/** The step a workflow method runs, by the method's name (`WorkflowState_AttackRollComplete`). */
export declare function stepForMethod(method: string | undefined): Step | undefined;
/** Every registered step, in registration order. */
export declare function allSteps(): Step[];
/**
 * Workflow fields more than one step writes or reads, and which (from the M2 state inventory). M3's step contracts
 * check a replacement step against these; until then they record who owns what. "use" is the code before the first
 * step (MidiActivityMixin.use), "GM" the GM's card actions.
 */
export declare const SHARED_FIELDS: Readonly<Record<string, {
    writers: readonly string[];
    readers: readonly string[];
}>>;
