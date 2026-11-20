import type { Workflow } from "../../Workflow.js";
import type { Activity } from "../../../globals.js";
import { type UseCost } from "./cost.js";
import { type BudgetKindId } from "./ledger.js";
export type EconomyPolicy = "off" | "show" | "warn" | "enforce";
export interface UseIssue {
    id: string;
    label: string;
    /** The contributor that raised it */
    source: string;
    /** A budget issue's kind */
    kind?: BudgetKindId;
    /** What it does; absent: the economy policy of its kind (or show) */
    policy?: EconomyPolicy;
}
export interface IssueQuery {
    activity: Activity;
    actor: Actor.Implementation;
    workflow?: Workflow;
    target?: TokenDocument.Implementation;
    /** What the use costs (MidiQOL.economy.cost) */
    cost: UseCost;
}
export type IssueContributor = (query: IssueQuery) => UseIssue | UseIssue[] | undefined | Promise<UseIssue | UseIssue[] | undefined>;
export declare function registerIssueContributor(id: string, contributor: IssueContributor, options?: {
    priority?: number;
}): () => void;
/** The actor's economy policy for a budget kind: from Enforce reactions / Enforce bonus actions; the action: show */
export declare function economyPolicy(actor: Actor.Implementation, kind: BudgetKindId): EconomyPolicy;
/** What an issue does for this actor */
export declare function issuePolicy(issue: UseIssue, actor: Actor.Implementation): EconomyPolicy;
/** Why `activity` can't be used now (MidiQOL.economy.issues); `only`: those issue ids */
export declare function issues(activity: Activity, options?: {
    workflow?: Workflow;
    target?: TokenDocument.Implementation;
    only?: readonly string[];
}): Promise<UseIssue[]>;
export declare function registerMidiIssueContributors(): void;
export declare const issueContributorsApi: {
    register: typeof registerIssueContributor;
    entries: () => string[];
};
