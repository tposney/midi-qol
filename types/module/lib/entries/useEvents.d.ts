import { Workflow } from "../../Workflow.js";
import type { RollKind, RollModifier } from "../../services/rollModifiers/service.js";
import type { DamageContribution } from "../../services/damageContributions/service.js";
import type { DamageChange, DamageStage } from "../../services/damageModifiers/rules.js";
import { type ActionRun, type EventContext } from "./engine.js";
/** A event raised by a use (its contributions go to the use) */
export declare function isUseEvent(eventId: string): boolean;
/** The context of a use event: the user's */
export declare function useContext(workflow: Workflow, event?: Record<string, unknown>): EventContext;
/** The context of a target event: the target is the actor; the user's use is `event.use` */
export declare function targetContext(workflow: Workflow, target: TokenDocument.Implementation, event?: Record<string, unknown>): EventContext | undefined;
/** The step pass hook: raise the events of this pass (Workflow's engine host) */
export declare function raiseUseEvents(workflow: Workflow, prePost: "pre" | "post", step: string | undefined): Promise<void>;
/** `use.configure`: before the use's checks and targeting; false when an entry aborted it */
export declare function raiseUseConfigure(workflow: Workflow, usage: object): Promise<boolean>;
/** `damaged`: a target of the use took damage (with midi's isDamaged); `event.damage` is its damage entry */
export declare function raiseDamaged(workflow: Workflow, target: TokenDocument.Implementation | undefined, damage: Record<string, unknown>): Promise<void>;
interface UseContributions {
    modifiers: {
        actorUuid: string;
        rolls?: readonly RollKind[];
        modifier: RollModifier;
    }[];
    damage: DamageContribution[];
    damageChanges: {
        targetUuid?: string;
        stage: DamageStage;
        change: DamageChange;
    }[];
}
/**
 * Whose `for`/`to` names: "self" the entry's actor (the user at a use event, the bearer at a target event),
 * "target" the event's target or else every target of the use, "attacker"/"event.actor" the use's actor.
 */
export declare function actorsFor(spec: unknown, run: ActionRun, fallback: "self" | "target"): Actor.Implementation[];
export declare function useDamageAction(run: ActionRun, healing: boolean): Promise<void>;
/** A damage change for one target of the use (M29 transfer: what moves to another creature or a pool) */
export declare function addTargetDamageChange(workflow: Workflow, targetUuid: string, stage: DamageStage, change: DamageChange): void;
/** The AC change waiting for the target (and cleared) */
export declare function takeACChange(workflow: Workflow, target: TokenDocument.Implementation): number;
/** For the tests and the why: what the use's entries contributed */
export declare function useContributions(workflow: Workflow): Readonly<UseContributions> | undefined;
export declare function registerUseEvents(): void;
export {};
