import { checkMovement, isDisengaged, isForcedAction, movementState, takeDash, takeDisengage } from "./movement.js";
import { footprintDistance, meleeReach, possibleReactors, provokes } from "./opportunity.js";
import { standUp } from "./prone.js";
import { budget, ledger, refund, reset, spend, registerBudgetKind, budgetKinds } from "./ledger.js";
import { cost, costContributorsApi, grantAttacks, grantedAttacks } from "./cost.js";
import { economyPolicy, issueContributorsApi, issues } from "./issues.js";

/**
 * MidiQOL.economy (M4): the ledger (each kind's window), spend, refund, reset; what a use costs and why it can't be
 * used now; the actor's policy per kind; cost and issue contributors
 */
export const economyApi = {
  ledger, budget, spend, refund, reset, cost, issues, policy: economyPolicy,
  // M7: budget kinds a module adds (legendary actions...): their windows, spends, issues and the turn model's view
  registerKind: registerBudgetKind, kinds: budgetKinds,
  // M6: the movement budget, and taking a Dash or Disengage
  movement: movementState, checkMovement, takeDash, takeDisengage, isDisengaged, isForcedAction, standUp,
  // M8: attacks a use grants (Flurry of Blows, Two-Weapon Fighting), used before the action
  grantAttacks, grantedAttacks,
  opportunity: { meleeReach, footprintDistance, possibleReactors, provokes },
  costContributors: costContributorsApi, issueContributors: issueContributorsApi
};
