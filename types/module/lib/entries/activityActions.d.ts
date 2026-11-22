import type { Activity } from "../../../globals.js";
import { type ActionRun } from "./engine.js";
import type { FoundEntry } from "./types.js";
export declare const ACTIVITY_REF = "activity:";
export declare function isActivityRef(value: unknown): value is string;
/** An activity of the entry's item by id, identifier or name */
export declare function entryActivity(f: FoundEntry, ref: string): Activity | undefined;
/** `{ save | check: "activity:<id>" }`: the activity used against the subjects, nothing consumed */
export declare function activityRollAction(run: ActionRun, kind: "save" | "check"): Promise<{
    success?: boolean;
} | void>;
interface DirectSpec {
    ability?: string | string[];
    skill?: string | string[];
    dc?: unknown;
}
/** A save or check the actor rolls here, against a DC (an action's check, rolled by the creature taking it) */
export declare function directRoll(actor: Actor.Implementation, kind: "save" | "check", spec: DirectSpec, conditionData: Record<string, unknown>): Promise<boolean | undefined>;
/**
 * A save or check made by another creature (`by`: Sanctuary's attacker): its owner rolls on their own client through
 * the request core (its deadline; the GM can roll for them); this client rolls when it owns it or nobody else is there.
 */
export declare function rollBy(actor: Actor.Implementation, kind: "save" | "check", spec: DirectSpec, conditionData: Record<string, unknown>, label: string): Promise<boolean | undefined>;
/** `save` / `check` with `by`: rolled by that creature (rollBy) */
export declare function byRollAction(run: ActionRun, kind: "save" | "check"): Promise<{
    success?: boolean;
} | void>;
/** `save` / `check` with `{ ability, skill?, dc }` at an action: the taker rolls */
export declare function actionRollAction(run: ActionRun, kind: "save" | "check"): Promise<{
    success?: boolean;
} | void>;
/**
 * Take an action entry (MidiQOL.entries.takeAction): `effect` the effect holding it (or its uuid), `entryId` its id,
 * `taker` who takes it (default the bearer). Spends the taker's action when the economy tracks it.
 */
export declare function takeAction(effectRef: ActiveEffect.Implementation | string, entryId: string, taker?: Actor.Implementation): Promise<boolean>;
export declare function registerActivityActions(): void;
export {};
