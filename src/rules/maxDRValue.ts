import { declareRule, ruleId, ruleOn } from "./registry.js";

/*
 * Optional rule maxDRValue (a policy of midi's damage reduction): when several reductions apply, only the largest
 * counts, instead of their sum.
 */

export const MAX_DR_RULE = ruleId("maxDRValue");

/** Several damage reductions: the largest only */
export const largestReductionOnly = () => ruleOn("maxDRValue");

export function registerMaxDRValueRule() {
  declareRule({ id: MAX_DR_RULE, setting: "maxDRValue", service: "policy", label: "Damage reduction: only the largest applies",
    settings: [{ key: "maxDRValue", type: "boolean", label: "midi-qol.MaxDRValue.Name", default: false }] });
}
