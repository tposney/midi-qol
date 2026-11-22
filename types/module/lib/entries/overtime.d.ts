import type { Entry } from "./types.js";
/** An effect's OverTime changes as entries (stage 2 phase A); action saves are left to the old path */
export declare function overtimeEntries(effect: ActiveEffect.Implementation, actor: Actor.Implementation): Entry[];
/** An effect's ActivityOverTime changes as entries: each a use of the named activity at the turn it chooses */
export declare function activityOvertimeEntries(effect: ActiveEffect.Implementation): Entry[];
/** A player's roll from an action save's card (chatMessageHandling), answered by the effect's actionSave entry */
export declare const ACTION_ROLL = "overtime.actionRoll";
export declare function registerOvertimeEntries(): void;
