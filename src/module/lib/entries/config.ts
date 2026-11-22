import { MODULE_ID } from "../../../midi-qol.js";
import { optionList, type FieldOption } from "./editorServices.js";
import { itemOfEffect } from "./rules.js";
import type { FoundEntry } from "./types.js";

/*
 * An item's automation settings: what its automation lets the item's owner choose (Spirit Guardians' damage type), as
 * CPR's automations have a config. The automation declares its fields (`flags.midi-qol.configSpec`); the owner's values
 * are `flags.midi-qol.config`. Every entry of the item (its own, its activities', its effects' wherever applied) reads
 * them as `config.<key>` in conditions and `@config.<key>` in formulas, a field's default when unset.
 */

export interface ConfigField {
  key: string;
  label: string;
  type: "select" | "number" | "text" | "checkbox";
  /** select: its values, or a named list (entryOptions) with values of the field's own first */
  options?: readonly FieldOption[] | { list: string, extra?: readonly FieldOption[] };
  default?: unknown;
  hint?: string;
}

type ConfigItem = { getFlag?(scope: string, key: string): unknown } | undefined;

export function configSpec(item: ConfigItem): ConfigField[] {
  const spec = item?.getFlag?.(MODULE_ID, "configSpec");
  return Array.isArray(spec) ? (spec as ConfigField[]).filter(f => f && typeof f.key === "string" && f.key) : [];
}

/** The item's settings: each field's value, else its default */
export function configValues(item: ConfigItem): Record<string, unknown> {
  const stored = (item?.getFlag?.(MODULE_ID, "config") ?? {}) as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const field of configSpec(item)) values[field.key] = stored[field.key] ?? field.default;
  // Values the spec no longer names are kept for entries that still read them
  for (const [key, value] of Object.entries(stored)) if (!(key in values)) values[key] = value;
  return values;
}

export function configOptions(field: ConfigField): FieldOption[] {
  const options = field.options;
  if (!options) return [];
  if (Array.isArray(options)) return [...options];
  const named = options as { list: string, extra?: readonly FieldOption[] };
  return [...(named.extra ?? []), ...optionList(named.list)];
}

/** The item an entry belongs to: its own, its activity's, or the item an effect came from */
export function entryItem(f: FoundEntry): Item.Implementation | undefined {
  const document = f.document as { item?: Item.Implementation, parent?: unknown };
  if (document instanceof Item) return document as Item.Implementation;
  if (document instanceof ActiveEffect) return itemOfEffect(document as ActiveEffect.Implementation) as Item.Implementation | undefined;
  return document.item;
}
