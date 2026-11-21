import type { Entry } from "./types.js";
import { invalidateEntryHomes } from "./engine.js";

/*
 * M11a (plan ~/Documents/midi-next-M11-plan-2026-11-22.md): rules as data. A rule is entries keyed by an item's
 * identifier (with its ruleset and type when it says), registered by a source (midi, a module, a world script):
 * `MidiQOL.rules.register(source, rule)`. The entry engine collects a matching rule's entries as the item's own (its
 * activities' and effects' by role), for items nothing else automates (one automation per item, user 2026-11-19).
 */

export interface RoleMatch { type?: string; name?: string; status?: string; identifier?: string; id?: string }

export interface Rule {
  identifier: string;
  rules?: "2014" | "2024";
  type?: string;
  entries?: Entry[];
  activities?: { match: RoleMatch, entries: Entry[] }[];
  effects?: { match: RoleMatch, entries: Entry[] }[];
}

interface Registered { source: string, rule: Rule }

const byIdentifier = new Map<string, Registered[]>();

/** Identifiers that are copy leftovers, never matched */
const LEFTOVERS = new Set(["", "feature", "new-item", "item", "weapon", "spell", "feat"]);

export function registerRule(source: string, rule: Rule): () => void {
  if (!rule?.identifier || typeof rule.identifier !== "string") throw new Error(`midi-qol | rules.register(${source}): a rule needs an identifier`);
  const list = byIdentifier.get(rule.identifier) ?? [];
  const registered: Registered = { source, rule };
  byIdentifier.set(rule.identifier, [...list.filter(r => !(r.source === source && sameScope(r.rule, rule))), registered]);
  invalidateEntryHomes();
  return () => {
    const now = byIdentifier.get(rule.identifier)?.filter(r => r !== registered) ?? [];
    if (now.length) byIdentifier.set(rule.identifier, now);
    else byIdentifier.delete(rule.identifier);
    invalidateEntryHomes();
  };
}

const sameScope = (a: Rule, b: Rule) => a.rules === b.rules && a.type === b.type;

export function hasRules(): boolean { return byIdentifier.size > 0; }

type ItemLike = Item.Implementation;

function systemOf(item: ItemLike): { identifier?: string, source?: { rules?: string } } {
  return item.system as { identifier?: string, source?: { rules?: string } };
}

/** What automates the item instead of a registered rule, if anything (its own entries, a macro, CAT, CPR) */
export function automatedBy(item: ItemLike): string | undefined {
  const flags = item.flags as Record<string, Record<string, unknown> | undefined>;
  if (flags["chris-premades"]?.info) return "chris-premades";
  if (flags.cat?.automation) return "cat";
  if (flags.dae?.macro) return "macro";
  const midi = flags["midi-qol"] as { entries?: unknown[], onUseMacroName?: string } | undefined;
  if (midi?.onUseMacroName?.trim()) return "macro";
  if (midi?.entries?.length) return "entries";
  const activities = (item.system as { activities?: Iterable<{ midiEntries?: unknown[] }> }).activities;
  for (const activity of activities ?? []) if (activity.midiEntries?.length) return "entries";
  for (const effect of item.effects) if ((effect.flags as Record<string, { entries?: unknown[] } | undefined>)["midi-qol"]?.entries?.length) return "entries";
  return undefined;
}

/** The rule for an item (the last registered that matches), unless something else automates it */
export function ruleFor(item: ItemLike | undefined | null): Registered | undefined {
  if (!item || !byIdentifier.size) return undefined;
  const { identifier, source } = systemOf(item);
  if (!identifier || LEFTOVERS.has(identifier)) return undefined;
  const candidates = byIdentifier.get(identifier);
  if (!candidates?.length || automatedBy(item)) return undefined;
  const ruleset = source?.rules;
  const matching = candidates.filter(r => (!r.rule.rules || r.rule.rules === ruleset) && (!r.rule.type || r.rule.type === item.type));
  return matching.at(-1);
}

/** Whether a document (an activity or effect) fills a role */
export function matchesRole(document: { type?: string, name?: string, statuses?: Set<string>, identifier?: string, id?: string | null }, match: RoleMatch): boolean {
  if (match.id && document.id !== match.id) return false;
  if (match.type && document.type !== match.type) return false;
  if (match.name && document.name !== match.name) return false;
  if (match.identifier && document.identifier !== match.identifier) return false;
  if (match.status && !document.statuses?.has(match.status)) return false;
  return true;
}

/** The item an effect belongs to: its parent (a transfer effect), else the item its origin names (an applied one) */
export function itemOfEffect(effect: ActiveEffect.Implementation): ItemLike | undefined {
  if (effect.parent instanceof Item) return effect.parent as ItemLike;
  let origin: unknown = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : undefined;
  while (origin && !(origin instanceof Item) && (origin as { parent?: unknown }).parent) origin = (origin as { parent?: unknown }).parent;
  return origin instanceof Item ? origin as ItemLike : undefined;
}

/** For MidiQOL.rules.for(item): the rule automating it and its source, or what automates it instead */
export function describeRuleFor(item: ItemLike): { source: string, identifier: string } | { automatedBy: string } | undefined {
  const other = automatedBy(item);
  if (other) return { automatedBy: other };
  const found = ruleFor(item);
  return found ? { source: found.source, identifier: found.rule.identifier } : undefined;
}

export const rulesApi = {
  register: registerRule,
  for: describeRuleFor,
  sources: () => [...byIdentifier.values()].flat().map(r => ({ source: r.source, identifier: r.rule.identifier, rules: r.rule.rules, type: r.rule.type }))
};
