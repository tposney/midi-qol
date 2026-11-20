import { budget, ledger, refund, reset, spend } from "./ledger.js";
import { cost } from "./cost.js";
import { economyPolicy, issues } from "./issues.js";
/**
 * MidiQOL.economy (M4): the ledger (each kind's window), spend, refund, reset; what a use costs and why it can't be
 * used now; the actor's policy per kind; cost and issue contributors
 */
export declare const economyApi: {
    ledger: typeof ledger;
    budget: typeof budget;
    spend: typeof spend;
    refund: typeof refund;
    reset: typeof reset;
    cost: typeof cost;
    issues: typeof issues;
    policy: typeof economyPolicy;
    costContributors: {
        register: typeof import("./cost.js").registerCostContributor;
        entries: () => string[];
    };
    issueContributors: {
        register: typeof import("./issues.js").registerIssueContributor;
        entries: () => string[];
    };
};
