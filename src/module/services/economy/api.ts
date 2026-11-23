import { checkMovement, isDisengaged, movementState, takeDash, takeDisengage } from "./movement.js";
import { budget, ledger, refund, reset, spend } from "./ledger.js";
import { cost, costContributorsApi } from "./cost.js";
import { economyPolicy, issueContributorsApi, issues } from "./issues.js";

/**
 * MidiQOL.economy (M4): the ledger (each kind's window), spend, refund, reset; what a use costs and why it can't be
 * used now; the actor's policy per kind; cost and issue contributors
 */
export const economyApi = {
  ledger, budget, spend, refund, reset, cost, issues, policy: economyPolicy,
  // M6: the movement budget, and taking a Dash or Disengage
  movement: movementState, checkMovement, takeDash, takeDisengage, isDisengaged,
  costContributors: costContributorsApi, issueContributors: issueContributorsApi
};
