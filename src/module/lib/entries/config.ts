import { MODULE_ID } from "../../../midi-qol.js";
import { optionList, type FieldOption } from "./editorServices.js";
import { itemOfEffect, ruleFor } from "./rules.js";
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
  /**
   * The default for a creature's item, by the creature (`flags.cat.identifier`, else its name slugified): one
   * automation for an item many creatures share (Swallow: the Giant Toad's damage at the end of its turn)
   */
  byCreature?: Record<string, unknown>;
  hint?: string;
}

type ConfigItem = { getFlag?(scope: string, key: string): unknown } | undefined;

/** The item's settings: its own, else its rule's (an overlay's) */
export function configSpec(item: ConfigItem): ConfigField[] {
  let spec = item?.getFlag?.(MODULE_ID, "configSpec");
  if ((!Array.isArray(spec) || !spec.length) && item instanceof Item) spec = ruleFor(item)?.rule.config;
  return Array.isArray(spec) ? (spec as ConfigField[]).filter(f => f && typeof f.key === "string" && f.key) : [];
}

/** The creature an item belongs to, as a field's byCreature names it */
function creatureKey(item: ConfigItem): string | undefined {
  const actor = item instanceof Item ? item.actor : undefined;
  if (!actor) return undefined;
  const cat = actor.getFlag("cat" as never, "identifier" as never) as unknown;
  return typeof cat === "string" && cat ? cat : actor.name?.slugify({ strict: true });
}

/** A field's default for the item: its creature's, else the field's */
export function fieldDefault(field: ConfigField, item: ConfigItem): unknown {
  const key = field.byCreature ? creatureKey(item) : undefined;
  return key && field.byCreature && key in field.byCreature ? field.byCreature[key] : field.default;
}

/** The item's settings: each field's value, else its default */
export function configValues(item: ConfigItem): Record<string, unknown> {
  const stored = (item?.getFlag?.(MODULE_ID, "config") ?? {}) as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const field of configSpec(item)) values[field.key] = stored[field.key] ?? fieldDefault(field, item);
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
