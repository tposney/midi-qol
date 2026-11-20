import { budget, ledger, refund, reset, spend } from "./ledger.js";
import { cost, costContributorsApi } from "./cost.js";
import { economyPolicy, issueContributorsApi, issues } from "./issues.js";

/**
 * MidiQOL.economy (M4): the ledger (each kind's window), spend, refund, reset; what a use costs and why it can't be
 * used now; the actor's policy per kind; cost and issue contributors
 */
export const economyApi = {
  ledger, budget, spend, refund, reset, cost, issues, policy: economyPolicy,
  costContributors: costContributorsApi, issueContributors: issueContributorsApi
};
