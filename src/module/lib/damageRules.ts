/**
 * dnd5e 6.1's attacker damage rules (`dnd5e.damage.ignore.*`, `dnd5e.damage.downgrade` changes), which dnd5e collects
 * per damage roll into `rollConfig.applicationOptions`. midi keeps them once per use and merges them into each
 * target's damage options, as dnd5e's damage card does with its `system.applicationOptions`.
 */

import type { DamageApplicationOptions, Dnd5eRollData } from "../../globals.js";

export const RULE_IGNORES = ["immunity", "resistance", "vulnerability"] as const;
type RuleIgnore = typeof RULE_IGNORES[number];

export type DamageRules = {
  downgrade?: Set<string>;
  ignore?: Partial<Record<RuleIgnore, Set<string>>>;
};

/** As stored on the card: arrays */
export type StoredDamageRules = {
  downgrade?: string[];
  ignore?: Partial<Record<RuleIgnore, string[]>>;
};

type RuleSource = { downgrade?: Iterable<string> | true, ignore?: Partial<Record<string, Iterable<string> | true | unknown>> | true } | null | undefined;

const values = (source: unknown): string[] =>
  source && typeof source !== "string" && typeof (source as Iterable<string>)[Symbol.iterator] === "function"
    ? Array.from(source as Iterable<string>).filter(value => typeof value === "string") : [];

/** The union of rule sets; undefined when there are none */
export function mergeDamageRules(...sources: RuleSource[]): DamageRules | undefined {
  const merged: DamageRules = {};
  for (const source of sources) {
    if (!source) continue;
    const downgrade = values(source.downgrade);
    if (downgrade.length) merged.downgrade = new Set([...(merged.downgrade ?? []), ...downgrade]);
    if (source.ignore === true || !source.ignore) continue;
    for (const category of RULE_IGNORES) {
      const types = values(source.ignore[category]);
      if (!types.length) continue;
      merged.ignore ??= {};
      merged.ignore[category] = new Set([...(merged.ignore[category] ?? []), ...types]);
    }
  }
  return merged.downgrade || merged.ignore ? merged : undefined;
}

export function storeDamageRules(rules: DamageRules | undefined): StoredDamageRules | undefined {
  if (!rules) return undefined;
  const stored: StoredDamageRules = {};
  if (rules.downgrade?.size) stored.downgrade = Array.from(rules.downgrade);
  for (const category of RULE_IGNORES) {
    const types = rules.ignore?.[category];
    if (types?.size) (stored.ignore ??= {})[category] = Array.from(types);
  }
  return stored;
}

export function sameDamageRules(a: DamageRules | undefined, b: DamageRules | undefined): boolean {
  return JSON.stringify(storeDamageRules(a) ?? {}) === JSON.stringify(storeDamageRules(b) ?? {});
}

/** Whether the rules include an option for a damage type, as dnd5e's `DamageMessageData#hasDamageApplicationOption` */
export function hasDamageRule(rules: DamageRules | undefined, option: string, type: string): boolean {
  const set = option === "downgrade" ? rules?.downgrade : rules?.ignore?.[option as RuleIgnore];
  return !!(set?.has(type) || set?.has("ALL"));
}

/**
 * Add the rules to damage options in place (each target's options are its own copy). A category already ignored
 * wholesale (`true`) stays so.
 */
export function applyDamageRules<T extends { downgrade?: true | Set<string>, ignore?: true | object }>(options: T, rules: DamageRules | undefined): T {
  if (!rules) return options;
  if (rules.downgrade?.size && options.downgrade !== true)
    options.downgrade = new Set([...(options.downgrade ?? []), ...rules.downgrade]);
  if (options.ignore === true) return options;
  const ignore: Record<string, true | Set<string> | undefined> = (options.ignore ?? {}) as Record<string, true | Set<string> | undefined>;
  for (const category of RULE_IGNORES) {
    const types = rules.ignore?.[category];
    if (!types?.size) continue;
    const current = ignore[category];
    if (current === true) continue;
    ignore[category] = new Set([...(current ?? []), ...types]);
  }
  if (!foundry.utils.isEmpty(ignore)) Object.assign(options, { ignore });
  return options;
}

/** A copy of damage options to calculate with: dnd5e's and midi's handlers change them, and deepClone shares Sets */
export function copyDamageOptions<T extends DamageApplicationOptions>(options: T): T;
export function copyDamageOptions(options: DamageApplicationOptions | undefined): DamageApplicationOptions;
export function copyDamageOptions(options: DamageApplicationOptions | undefined): DamageApplicationOptions {
  const copy: DamageApplicationOptions = { ...(options ?? {}) };
  if (options?.downgrade instanceof Set) copy.downgrade = new Set(options.downgrade);
  if (options?.ignore && options.ignore !== true) copy.ignore = Object.fromEntries(Object.entries(options.ignore)
    .map(([key, value]) => [key, value instanceof Set ? new Set(value) : value])) as DamageApplicationOptions["ignore"];
  if (options?.midi) copy.midi = { ...options.midi };
  return copy;
}

/**
 * The attacker's rules for damage that has no dnd5e damage roll (applyTokenDamage, DamageOnlyWorkflow), collected as
 * dnd5e's `getDamageConfig` collects them for a roll.
 */
export function collectDamageRules(actor: Actor.Implementation | null | undefined, item?: Item.Implementation | null): DamageRules | undefined {
  const AppliedRules = globalThis.dnd5e?.documents?.AppliedRules;
  if (!actor || !AppliedRules) return undefined;
  // The item's roll data for conditions on it (`item.name`), also for an item on no actor (DamageOnlyWorkflow's own)
  const itemData = item?.getRollData() as Dnd5eRollData | undefined;
  const rollData = (item?.actor === actor && itemData ? itemData : actor.getRollData()) as Dnd5eRollData;
  if (item && item.actor !== actor) rollData.item = itemData?.item ?? rollData.item;
  // As dnd5e's getDamageConfig: the item's physical properties, for rules conditioned on them
  const properties = Array.from(itemData?.item?.properties ?? []).filter(p => CONFIG.DND5E.itemProperties[p]?.isPhysical);
  rollData.roll ??= { properties };
  return mergeDamageRules(AppliedRules.collect("damage:damageApplicationOptions", actor, item ?? undefined).filterWith(rollData).toDamageApplicationOptions());
}
