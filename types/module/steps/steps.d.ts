import type { StepChange } from "./assembly.js";
export interface Step {
    /** `midi-qol.<name>` for midi's steps. */
    id: string;
    /** The hook and pass name: `pre<name>` / `post<name>`. */
    name: string;
    /** midi's steps: the name of its `Workflow#WorkflowState_<name>` forwarder (old callers), as their method was. */
    method?: string;
    /**
     * A module's step: runs with the workflow; returns the step to go to, or nothing to go on with the move it was
     * inserted into. A wrapper calls `ctx.next()` to run what it wraps; a replacement returns the step to go to.
     */
    run?: (ctx: StepContext) => unknown;
    /** The card's queued writes are written when the step ends (a milestone: the card shows its result). */
    flush?: boolean;
    /** A marker, not run: Suspend. */
    marker?: boolean;
    /**
     * Run where something happens inside another step (a reaction trigger), not by the engine: the use's changes apply
     * (insert around, replace, wrap, remove); midi's own fire no hooks (batch 110's order), inserted steps fire theirs.
     * Its result is what the step gives (a reaction's), not a step to go to.
     */
    inline?: boolean;
    /**
     * What it acts on (M24): the step does its work only for a use whose activity (or its other activity) has one of these;
     * for others it passes the use on. Absent: every use. Declared for the activity-type table (activityTypeSteps), not
     * enforced: the step's own run still decides.
     */
    actsOn?: readonly ActivityCapability[];
    /** Its contract: the workflow fields it reads and writes (midi's steps: SHARED_FIELDS). */
    reads?: readonly string[];
    writes?: readonly string[];
}
/** What an activity can do, from its type's fields (attack, damage...); `area`: its target has a template or emanation */
export type ActivityCapability = "attack" | "damage" | "healing" | "save" | "check" | "utilityRoll" | "area" | "transform";
export interface StepContext {
    workflow: any;
    /** For a wrapper: run the step it wraps (and what that returns). */
    next(): Promise<unknown>;
    /** At a reaction step: who reacts to what (utils doReactions' arguments). */
    /** The reacting token is a TokenDocument (proposal section 18, rule 1); undefined if it can't be resolved */
    reaction?: {
        target: TokenDocument.Implementation | undefined;
        triggerTokenUuid?: string | null;
        triggeringRoll?: unknown;
        triggerType: string;
        options: unknown;
    };
}
export declare function registerStep(step: Step): void;
/** midi's own step gets its implementation (M5: the workflow's step modules, workflowSteps/), keeping its id and method name */
export declare function setStepRun(id: string, run: NonNullable<Step["run"]>): void;
export declare function unregisterStep(id: string): boolean;
/** A change to every use's flow (the global layer), optionally only where `when` says. */
export type GlobalStepChange = StepChange & {
    when?: (workflow: any) => boolean;
};
export declare function addStepChange(change: GlobalStepChange): void;
/** Remove the global changes a source made (by `source`), or one change. */
export declare function removeStepChanges(match: string | GlobalStepChange): number;
/** Every global change (the activity-type table shows the inserted steps) */
export declare function allGlobalStepChanges(): readonly GlobalStepChange[];
/** The global changes that apply to a use (a `when` that throws: not applied), as data. */
export declare function globalStepChangesFor(workflow: unknown): StepChange[];
/** The fields a step promises to write: declared, and for midi's steps those SHARED_FIELDS lists it as writing. */
export declare function stepWrites(id: string): string[];
/** What a replacement leaves out of the step it replaces: the fields that step writes and the replacement doesn't declare. */
export declare function contractGaps(target: string, replacement: string): string[];
export declare function getStep(id: string): Step | undefined;
/** The step a workflow method runs, by the method's name (`WorkflowState_AttackRollComplete`). */
export declare function stepForMethod(method: string | undefined): Step | undefined;
/** Every registered step, in registration order. */
export declare function allSteps(): Step[];
/** Reaction steps (inline), by midi's trigger type: run where the reaction is asked (Workflow#askReactionsStep). */
export declare const REACTION_STEPS: Readonly<Record<string, string>>;
/** midi's own steps (engine-run or inline): a module can't register over them */
export declare function isMidiStep(id: string): boolean;
export declare const STEP_ACTS_ON: Readonly<Record<string, readonly ActivityCapability[]>>;
/**
 * Workflow fields more than one step writes or reads, and which (from the M2 state inventory). M3's step contracts
 * check a replacement step against these; until then they record who owns what. "use" is the code before the first
 * step (MidiActivityMixin.use), "GM" the GM's card actions.
 */
export declare const SHARED_FIELDS: Readonly<Record<string, {
    writers: readonly string[];
    readers: readonly string[];
}>>;
