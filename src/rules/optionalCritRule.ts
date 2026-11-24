import { i18n } from "../midi-qol.js";
import { attackOutcomeService, type AttackOutcomeContributor } from "../module/services/outcomeRules/service.js";
import { declareRule, ruleId, ruleValue } from "./registry.js";

/*
 * Optional rule optionalCritRule: an attack on one target crits only when it beats the AC by the set margin (-1: off);
 * with criticalNat20 a natural 20 still crits.
 */

const margin: AttackOutcomeContributor = {
  for({ total, ac, critical, targetCount }) {
    if (targetCount !== 1) return undefined;
    if (ruleValue("criticalNat20") && critical) return undefined;
    const by = Number(ruleValue("optionalCritRule"));
    return { critical: total >= ac + by, key: "optionalCritRule", label: i18n("midi-qol.OptionalCritRule") };
  }
};

export function registerOptionalCritRule() {
  const rule = declareRule({ id: ruleId("optionalCritRule"), setting: "optionalCritRule", service: "attackOutcome", label: "Critical hits by a margin over the AC",
    settings: [
      { key: "optionalCritRule", type: "number", label: "midi-qol.OptionalCritRule.Name", hint: "midi-qol.OptionalCritRule.Hint", default: -1 },
      { key: "criticalNat20", type: "boolean", label: "midi-qol.CriticalNat20.Name", hint: "midi-qol.CriticalNat20.Hint", default: false }
    ] });
  // -1 is off; 0 (crit on any hit that meets the AC) is on
  attackOutcomeService.register(rule.id, margin, { label: rule.label, available: () => Number(ruleValue("optionalCritRule") ?? -1) > -1 });
}
