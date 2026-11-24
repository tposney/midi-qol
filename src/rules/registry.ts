import { configSettings } from "../module/settings.js";
import { providers } from "../module/api/services.js";

/*
 * M30: midi's optional rules as contributors or providers of its services, each registered under `midi-qol.rule.<id>`
 * (`id`: the rule's key in the Optional rules settings). A rule stays registered when switched off and is unavailable
 * (its `available` reads the setting, so a change applies at once); a module can unregister one, or register its own
 * under another id. The call sites ask services, never the setting.
 *
 *   MidiQOL.optionalRules.list() → [{ id: "midi-qol.rule.nearbyFoe", setting: "nearbyFoe", service: "rollModifiers", on, registered }]
 */

type OptionalRules = typeof configSettings.optionalRules;
export type RuleSetting = keyof OptionalRules;

export interface RuleInfo {
  /** The provider id: midi-qol.rule.<setting>, or a part of a rule (midi-qol.rule.hiddenAdvantage.perceptive) */
  id: string;
  setting: RuleSetting;
  service: string;
  label: string;
}

const rules = new Map<string, RuleInfo>();

/** The rule's configured value while optional rules are on (undefined while they are off) */
export function ruleValue<K extends RuleSetting>(setting: K): OptionalRules[K] | undefined {
  return configSettings.optionalRulesEnabled ? configSettings.optionalRules[setting] : undefined;
}

/** The rule is on: optional rules on, and its value set ("none", "off", 0, false: off) */
export function ruleOn(setting: RuleSetting): boolean {
  const value = ruleValue(setting) as unknown;
  return !!value && value !== "none" && value !== "off";
}

export const ruleId = (setting: RuleSetting, part?: string) => `midi-qol.rule.${setting}${part ? `.${part}` : ""}`;

/** Recorded as midi's (for rules.list); the rule file registers its provider itself */
export function declareRule(info: RuleInfo): RuleInfo {
  rules.set(info.id, info);
  return info;
}

/** A rule's provider is registered and available (a module may have replaced or removed it) */
export function ruleActive(id: string): boolean {
  const info = rules.get(id);
  return !!info && providers(info.service).some(p => p.id === id && p.available);
}

export const optionalRulesApi = {
  list: () => [...rules.values()].map(info => ({ ...info, on: ruleOn(info.setting),
    registered: providers(info.service).some(p => p.id === info.id), available: ruleActive(info.id) })),
  on: ruleOn,
  active: ruleActive
};
