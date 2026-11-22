import type { AttributionEntry, Workflow } from "../Workflow.js";
import type { BonusSource, RollChange } from "./rollParts.js";
export interface WhyTerm {
    label: string;
    value: number;
    formula?: string;
}
export interface WhyRoll {
    formula: string;
    total?: number;
    /** -1 disadvantage, 0 normal, 1 advantage */
    mode: number;
    /** Each term after the d20 (a damage roll: every term), with its label */
    terms: WhyTerm[];
    /** The effects, sheet value and rules behind a combined bonus */
    bonusSources: BonusSource[];
    /** The advantage sources, auto results and criticals */
    attribution: AttributionEntry[];
    /** Changes made after the roll, in order, each with the total before it (the roll's total is after the last) */
    changes: RollChange[];
}
export interface UseWhy {
    attack?: WhyRoll & {
        reasons: {
            label: string;
            value?: string;
            kind?: string;
        }[];
        targets: {
            uuid: string;
            name: string | null;
            ac?: number | null;
            hit: boolean;
        }[];
    };
    saves: (WhyRoll & {
        uuid: string;
        name: string | null;
        dc?: number;
        saved: boolean;
    })[];
    damage: (WhyRoll & {
        type?: string;
    })[];
}
/** Why a use's attack, saves and damage came out as they did */
export declare function why(workflow: Workflow): UseWhy;
