import type { Workflow } from "../Workflow.js";
import type { DamageDescription } from "../../globals.js";
export interface AttackOutcome {
    hit: boolean;
    critical: boolean;
    fumble: boolean;
    natural?: number;
    total?: number;
    ac?: number;
    by?: number;
}
export interface SaveOutcome {
    ability?: string;
    success: boolean;
    critical: boolean;
    fumble: boolean;
    natural?: number;
    total?: number;
    dc?: number;
}
export interface DamageOutcome {
    /** By type, as rolled */
    rolled: Record<string, number>;
    /** By type, after resistances and the save */
    applied: Record<string, number>;
    /** rolled - applied, where positive */
    prevented: Record<string, number>;
    hp: number;
    temp: number;
    healed: number;
    /** Above 0 hit points before, 0 after */
    droppedToZero: boolean;
}
export interface TargetOutcome {
    /** TokenDocument uuid */
    target: string;
    attack?: AttackOutcome;
    save?: SaveOutcome;
    damage?: DamageOutcome;
    /** uuids of the effects the use applied to the target that are still on it */
    effects: string[];
}
interface DamageEntryLike {
    damages: DamageDescription[];
    calculatedDamages: DamageDescription[];
    hpDamage: number;
    tempDamage: number;
    oldHP: number;
    newHP: number;
}
/** A target's damage from its damage entries (one per damage list: other damage may have its own). Pure. */
export declare function damageOutcome(entries: readonly DamageEntryLike[]): DamageOutcome | undefined;
/** Each target's outcome, by TokenDocument uuid */
export declare function outcomes(workflow: Workflow): Map<string, TargetOutcome>;
export {};
