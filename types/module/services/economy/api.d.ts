import { budget, ledger, refund, reset, spend } from "./ledger.js";
import { cost } from "./cost.js";
/** MidiQOL.economy (M4): the ledger (each kind's window), spend, refund, reset; what a use costs; cost contributors */
export declare const economyApi: {
    ledger: typeof ledger;
    budget: typeof budget;
    spend: typeof spend;
    refund: typeof refund;
    reset: typeof reset;
    cost: typeof cost;
    costs: {
        register: typeof import("./cost.js").registerCostContributor;
        entries: () => string[];
    };
};
