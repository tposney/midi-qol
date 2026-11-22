import type { Activity } from "../../globals.js";
import { type AttributionEntry } from "../Workflow.js";
import { type UseCost } from "../services/economy/cost.js";
import { type UseIssue } from "../services/economy/issues.js";
import { type BonusSource } from "./rollParts.js";
export interface PreviewTarget {
    uuid: string;
    name: string | null;
    /** Grid units, as midi measures it */
    distance?: number;
    /**
     * "normal", "dis" (long range: disadvantage) or "fail" (out of reach), for any activity with a range. `checked`: the
     * use would refuse a target out of range (the Check range setting; not for area targeting); long range gives
     * disadvantage only to ranged and thrown attacks.
     */
    range?: {
        result: string;
        range?: number;
        longRange?: number;
        checked: boolean;
    };
    /** The AC the attack would be compared with, and its cover */
    ac?: {
        effective: number;
        base: number;
        cover: number;
        coverIgnored: boolean;
    };
    /** -1 disadvantage, 0 normal, 1 advantage, and why */
    advantage?: {
        mode: number;
        attribution: AttributionEntry[];
    };
    /** The attacker sees the target / the target sees the attacker */
    sees: boolean;
    seen: boolean;
}
export interface UsePreview {
    activity: string;
    cost: UseCost;
    issues: UseIssue[];
    /** The attack's make-up, before the d20: each part labelled, and the sources behind the Roll Bonus */
    attack?: {
        formula: string;
        bonusSources: BonusSource[];
    };
    save?: {
        dc?: number;
        abilities: string[];
    };
    steps: string[];
    targets: PreviewTarget[];
}
type PreviewOptions = {
    token?: Token.Implementation | TokenDocument.Implementation;
};
/** What a use of `activity` against `targets` would do, without making it (MidiQOL.preview) */
export declare function preview(activity: Activity, targets?: Iterable<Token.Implementation | TokenDocument.Implementation>, options?: PreviewOptions): Promise<UsePreview>;
export {};
