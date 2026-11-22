import type { Activity } from "../../globals.js";
import type { BonusCost } from "../services/rollBonuses/rules.js";
export interface PromptCost {
    badges: string[];
    reaction: boolean;
}
/** A row a prompt shows for another part (M32a step 3: a failed save's reactions in its bonus prompt) */
export interface PromptRow {
    id: string;
    label: string;
    img?: string;
    tooltip?: string;
    badges: string[];
    exclusive?: string;
    checked?: boolean;
    standingKey?: string;
    standingLabel?: string;
    choice?: string;
    choices?: {
        value: string;
        label: string;
    }[];
}
/** Rows shown in a bonus prompt for another part: what was ticked comes back in `chosen` (undefined: not answered) */
export interface PromptResponses {
    rows: PromptRow[];
    chosen?: string[];
    shown?: boolean;
}
/** A bonus's declared cost (rollBonuses) as badges */
export declare function bonusCostBadges(cost: BonusCost | undefined): PromptCost;
/** A reaction activity's cost: its activation, its uses or its item's, a spell's slot level */
export declare function activityCostBadges(activity: Activity): PromptCost;
/** An offer's declared cost (responses contract 2) */
export declare function offerCostBadges(cost: {
    actions?: Partial<Record<string, number>>;
} | undefined): PromptCost;
/** Rows sharing a `data-exclusive` group (those spending the reaction) are one choice: ticking one clears the others */
export declare function wirePickOne(element: HTMLElement): void;
