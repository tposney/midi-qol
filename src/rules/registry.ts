import { configSettings } from "../module/settings.js";
import { providers } from "../module/api/services.js";

/*
 * M30: midi's optional rules as contributors or providers of its services, each registered under `midi-qol.rule.<id>`
 * (`id`: the rule's key in the Optional rules settings). A rule stays registered when switched off and is unavailable
 * (its `available` reads the setting, so a change applies at once); a module can unregister one, or register its own
 * under another id. The call sites ask services, never the setting.
 *
 *   MidiQOL.optionalRules.list() → [{ id: "midi-qol.rule.nearbyFoe", setting: "nearbyFoe", service: "rollModifiers", on, registered,
 *     settings: [{ key: "nearbyFoe", type: "number", label, value }] }]
 *   MidiQOL.optionalRules.set("nearbyFoe", "nearbyFoe", 5)
 *
 * A rule declares its settings (RuleSettingSpec), so a configuration panel can be drawn from the rules (M17).
 */

type OptionalRules = typeof configSettings.optionalRules;
export type RuleSetting = keyof OptionalRules;

/**
 * A setting a rule declares, so a configuration panel can be drawn from the rules alone (M17's panel; the Optional rules
 * tab meanwhile). midi's rules keep their values in ConfigSettings.optionalRules (`key` its key there); a module's rule
 * supplies `get` and `set` for its own storage.
 */
export interface RuleSettingSpec {
  key: string;
  type: "boolean" | "number" | "string";
  /** Lang keys */
  label: string;
  hint?: string;
  /** For a select: value → label (or Foundry's select options) */
  choices?: Record<string, unknown>;
  default?: unknown;
  get?(): unknown;
  set?(value: unknown): Promise<void>;
}

export interface RuleInfo {
  /** The provider id: midi-qol.rule.<setting>, or a part of a rule (midi-qol.rule.hiddenAdvantage.perceptive) */
  id: string;
  /** midi's: its key in the Optional rules settings; a module's: any name */
  setting: RuleSetting | string;
  service: string;
  label: string;
  /** The rule's settings, the switch first */
  settings?: RuleSettingSpec[];
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

type OptionalRulesStore = Record<string, unknown>;
const isMidiSetting = (setting: string): setting is RuleSetting => setting in configSettings.optionalRules;

/** A rule setting's value: its own getter, else midi's stored optional rules */
export function ruleSettingValue(spec: RuleSettingSpec): unknown {
  return spec.get ? spec.get() : (configSettings.optionalRules as unknown as OptionalRulesStore)[spec.key];
}

/** Sets a rule setting (the GM's: midi's are world settings): its own setter, else midi's stored optional rules */
export async function setRuleSetting(ruleIdOrSetting: string, key: string, value: unknown): Promise<void> {
  const info = rules.get(ruleIdOrSetting) ?? [...rules.values()].find(r => r.setting === ruleIdOrSetting);
  const spec = info?.settings?.find(s => s.key === key);
  if (!spec) throw new Error(`midi-qol | no rule setting ${ruleIdOrSetting} ${key}`);
  if (spec.set) return spec.set(value);
  (configSettings.optionalRules as unknown as OptionalRulesStore)[key] = value;
  await game.settings?.set("midi-qol", "ConfigSettings" as never, configSettings as never);
}

export const optionalRulesApi = {
  /** The rules with their state and their settings' current values (for a configuration panel) */
  list: () => [...rules.values()].map(info => ({ ...info, on: isMidiSetting(info.setting) ? ruleOn(info.setting) : ruleActive(info.id),
    registered: providers(info.service).some(p => p.id === info.id), available: ruleActive(info.id),
    settings: (info.settings ?? []).map(spec => ({ ...spec, value: ruleSettingValue(spec) })) })),
  /** A module's rule: its provider registered by the module; declared here for the list and the panel */
  declare: (info: RuleInfo) => declareRule(info),
  undeclare: (id: string) => { rules.delete(id); },
  set: setRuleSetting,
  on: ruleOn,
  active: ruleActive
};
