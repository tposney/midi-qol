import { declareRule, ruleId, ruleValue } from "./registry.js";

/*
 * Optional rule vitalityItem (a policy of midi's damage application): a creature's vitality, kept as the uses of an
 * item it owns with this name; damage past 0 hit points comes off it.
 */

export const VITALITY_RULE = ruleId("vitalityItem");

/** The vitality item's name, while the rule is on */
export function vitalityItemName(): string | undefined {
  const name = ruleValue("vitalityItem");
  return typeof name === "string" && name ? name : undefined;
}

export function registerVitalityItemRule() {
  declareRule({ id: VITALITY_RULE, setting: "vitalityItem", service: "policy", label: "Vitality (an item's uses past 0 hit points)",
    settings: [{ key: "vitalityItem", type: "string", label: "midi-qol.OptionalRuleVitality.Name", hint: "midi-qol.OptionalRuleVitality.Hint", default: "" }] });
}
