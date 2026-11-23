import { defineService, entries, reportServiceProblem } from "../../api/services.js";
import { openMultiattack, openRun, replanRun } from "./run.js";
import { multiattackState } from "./service.js";
import { MultiattackRunSheet, setupMultiattackSheet } from "../../apps/multiattack/MultiattackRunSheet.js";
import { MultiattackPlanEditor, registerMultiattackSection } from "../../apps/multiattack/MultiattackPlanEditor.js";
import { activityRef, bindPlan, parseMultiattack, planRefs, resolvePlan, slug, tokenize, type MultiattackPlan, type PlanItem } from "../../lib/multiattack.js";

/*
 * M21a: a creature's Multiattack plan (M21 plan, 21a). Looked up in order:
 *   1. the GM's own plan for this creature (world setting multiattackPlans, keyed by the creature's compendium source so
 *      every copy and later import shares it; a creature with no source by its actor uuid);
 *   2. the multiattackPlans service's providers, higher priority first: a module's own, then midi's table
 *      (`midi-qol.official`, official.ts, registered as any other module registers);
 *   3. the English text parsed: the item's description, Babele's original, the compendium source item's;
 *   4. a guess from the attacks the text links, for the GM to confirm.
 * A plan naming an attack the creature doesn't have (an edited creature) is passed over for the next source, the reason
 * kept in `skipped`; with nothing left the source is "none". Shipped plans hold no text from the books: a condition,
 * count rule or notes flagged `true` take their words from the creature's own description (so a translated sheet shows
 * its own language).
 */

/** "none": nothing gave a plan (`skipped` says why sources were passed over) */
export type PlanSource = "gm" | "registered" | "parsed" | "guess" | "none";
export interface PlanLookup {
  /** Absent when the source is "none" */
  plan?: MultiattackPlan;
  source: PlanSource;
  /** The registration it came from */
  provider?: string;
  /** The creature's Multiattack feature */
  item: Item.Implementation;
  /** The key a GM's plan is stored under */
  key: string;
  /** Why earlier sources were passed over */
  skipped?: string[];
}

/**
 * A multiattackPlans provider: plans keyed by compendium uuid or `id:<actor identifier>`, a URL of such a JSON object,
 * or a lookup. Returning no plan (or one naming attacks the creature lacks) passes to the next provider.
 *
 *   MidiQOL.services.register("multiattackPlans", "my-module", { url: "modules/my-module/plans.json" }, { priority: 10 });
 */
export interface PlanProvider {
  plans?: Record<string, { item?: string, plan: MultiattackPlan } | MultiattackPlan>;
  url?: string;
  lookup?: (actor: Actor.Implementation, keys: string[]) => MultiattackPlan | undefined | Promise<MultiattackPlan | undefined>;
}

declare module "../../api/services.js" {
  interface MidiServices { multiattackPlans: PlanProvider }
}

const SERVICE = "multiattackPlans" as const;
const urlCache = new Map<string, Promise<Record<string, unknown> | undefined>>();
const SETTING = "multiattackPlans" as const;

type Described = { system?: { description?: { value?: string }, identifier?: string, activities?: { contents?: Activity5e[] } }, flags?: Record<string, unknown> };
type Activity5e = { id: string, type?: string, name?: string, spell?: { uuid?: string }, activation?: { type?: string }, midiProperties?: { automationOnly?: boolean } };

/** Before `midi-qol.registerServices`: providers (midi's table among them) register in that hook */
export function defineMultiattackPlansService() {
  defineService<PlanProvider>(SERVICE, { kind: "contributors", description: "Multiattack plans for creatures, asked in priority order before the description is read" });
}

export const isMultiattackItem = (item: Item.Implementation) =>
  /^multiattack/.test((item as Described).system?.identifier ?? "") || /multiattack/i.test(item.name ?? "");

export function multiattackItem(actor: Actor.Implementation | null | undefined): Item.Implementation | undefined {
  return actor?.items.find(isMultiattackItem);
}

/** The creature's keys: its compendium source, then `id:<identifier>` (CAT's actor identifier, else its name's slug; a token's base actor's name too) */
export function creatureKeys(actor: Actor.Implementation): string[] {
  const stats = (actor as { _stats?: { compendiumSource?: string | null } })._stats;
  const base = (actor as { token?: { baseActor?: { _stats?: { compendiumSource?: string | null } } } | null }).token?.baseActor;
  const source = stats?.compendiumSource ?? base?._stats?.compendiumSource ?? (actor.flags as { core?: { sourceId?: string } })?.core?.sourceId;
  const identifier = (actor.flags as { cat?: { identifier?: string } })?.cat?.identifier ?? slug(actor.name ?? "");
  // A token renamed on the scene ("Red Ettin") is still its base actor
  const baseName = (actor as { token?: { baseActor?: { name?: string | null } } | null }).token?.baseActor?.name;
  const ids = [identifier, baseName ? slug(baseName) : ""].filter((id, i, all) => id && all.indexOf(id) === i);
  return [...(source ? [source] : []), ...ids.map(id => `id:${id}`)];
}

/** The creature's items as the resolver and the checks need them */
function planItems(actor: Actor.Implementation): PlanItem[] {
  return actor.items.map(item => {
    const system = (item as Described).system;
    return {
      id: item.id ?? "", name: item.name ?? "", identifier: system?.identifier ?? null,
      activities: (system?.activities?.contents ?? []).map(a => ({
        id: a.id, type: a.type, ...(a.name ? { name: a.name } : {}), ...(a.activation?.type ? { activation: a.activation.type } : {}),
        ...(a.midiProperties?.automationOnly ? { automationOnly: true } : {}), ...(a.spell?.uuid ? { spell: a.spell.uuid } : {})
      }))
    };
  });
}

export const spellInfo = (uuid: string) => {
  const found = fromUuidSync(uuid) as { name?: string, system?: { identifier?: string } } | null;
  return found ? { name: found.name, identifier: found.system?.identifier ?? null } : undefined;
};

/** The references a plan may use on this creature: its activities, casts and any attack/spell; and its items (a cast's) */
function knownRefs(items: PlanItem[]): { refs: Set<string>, items: Set<string> } {
  const refs = new Set<string>(["attack", "attack:melee", "attack:ranged", "spell"]);
  const ids = new Set<string>();
  for (const item of items) {
    const id = item.identifier || slug(item.name);
    ids.add(id);
    for (const activity of item.activities ?? []) {
      refs.add(activityRef(id, activity.id));
      if (!activity.spell) continue;
      const spell = spellInfo(activity.spell);
      const spellId = spell?.identifier || (spell?.name ? slug(spell.name) : undefined);
      if (spellId) { refs.add(spellId); refs.add(`${id}>${spellId}`); }
    }
  }
  return { refs, items: ids };
}

/** Refs of a (bound) plan the creature doesn't have ("spellcasting>guiding-bolt@4": its casting item counts) */
function missingRefs(plan: MultiattackPlan, known: { refs: Set<string>, items: Set<string> }): string[] {
  return [...new Set(planRefs(plan).filter(ref => {
    const bare = ref.replace(/@\d+$/, "");
    return !known.refs.has(bare) && !(bare.includes(">") && known.items.has(bare.split(">")[0]));
  }))];
}

/** The English texts to read: the description, Babele's original (unverified path, from DAS's note), the source item's */
function textsOf(item: Item.Implementation): string[] {
  const flags = (item as Described).flags ?? {};
  const babele = [foundry.utils.getProperty(flags, "babele.originalPayload.description"), foundry.utils.getProperty(flags, "babele.originalPayload.system.description.value")];
  const source = (item as { _stats?: { compendiumSource?: string | null } })._stats?.compendiumSource;
  const sourceItem = source ? fromUuidSync(source) as Described | null : null;
  return [...babele, sourceItem?.system?.description?.value, (item as Described).system?.description?.value]
    .filter((t): t is string => typeof t === "string" && t.length > 0).reverse();
}

/** Words for a shipped plan's flags, from the creature's own description */
function fillText(plan: MultiattackPlan, item: Item.Implementation, names: string[]): MultiattackPlan {
  const flagged = plan.notes === true || plan.options.some(o => o.condition === true || o.groups.some(g => typeof g.n === "object" && "text" in g.n && g.n.text === true));
  if (!flagged) return plan;
  const parsed = textsOf(item).map(text => parseMultiattack(text, { names })).find(p => p && !p.unread.length);
  const filled: MultiattackPlan = foundry.utils.deepClone(plan);
  if (filled.notes === true) filled.notes = parsed?.notes ?? true;
  filled.options.forEach((option, i) => {
    const own = parsed?.options[i];
    if (option.condition === true && own?.condition) option.condition = own.condition;
    option.groups.forEach((group, g) => {
      const n = own?.groups[g]?.n;
      if (typeof group.n === "object" && "text" in group.n && group.n.text === true && typeof n === "object" && "text" in n) group.n = { text: n.text };
    });
  });
  return filled;
}

/** A plan from a registration's table entry (either `{ item, plan }` or the plan itself) */
const tablePlan = (entry: unknown): MultiattackPlan | undefined => {
  if (!entry || typeof entry !== "object") return undefined;
  return "plan" in entry ? (entry as { plan: MultiattackPlan }).plan : entry as MultiattackPlan;
};

async function fromUrl(url: string): Promise<Record<string, unknown> | undefined> {
  if (!urlCache.has(url)) urlCache.set(url, fetch(url).then(r => r.ok ? r.json() : undefined).catch(() => undefined));
  return urlCache.get(url);
}

async function fromProvider(provider: PlanProvider, actor: Actor.Implementation, keys: string[]): Promise<MultiattackPlan | undefined> {
  if (provider.lookup) return provider.lookup(actor, keys);
  const table = provider.plans ?? (provider.url ? await fromUrl(provider.url) : undefined);
  if (!table) return undefined;
  for (const key of keys) { const plan = tablePlan(table[key]); if (plan) return plan; }
  return undefined;
}

/** The GM's plans, by creature key */
function gmPlans(): Record<string, MultiattackPlan> {
  try { return game.settings?.get("midi-qol", SETTING) ?? {}; }
  catch { return {}; }
}

export function planKey(actor: Actor.Implementation): string {
  return creatureKeys(actor).find(k => k.startsWith("Compendium.")) ?? `actor:${actor.uuid}`;
}

/** The GM saves a plan for this creature (every copy with the same source shares it); null removes it */
export async function setGmPlan(actor: Actor.Implementation, plan: MultiattackPlan | null) {
  if (!game.user?.isGM) throw new Error("midi-qol | only a GM can set a Multiattack plan");
  const plans = { ...gmPlans() };
  const key = planKey(actor);
  if (plan) plans[key] = plan; else delete plans[key];
  await game.settings?.set("midi-qol", SETTING, plans);
  await replanRun(actor);
}

/** The guess when no text reads: one group of the attacks the text links, its count a digit in the text or unknown */
function guessPlan(item: Item.Implementation, items: PlanItem[], names: string[]): MultiattackPlan | undefined {
  const text = (item as Described).system?.description?.value ?? "";
  const { refs } = tokenize(text, { names });
  const attacks = new Set(items.filter(i => i.activities?.some(a => a.type === "attack")).map(i => i.id));
  const linked = refs.filter(r => r.kind === "item").map(r => (r as { id?: string, name?: string }))
    .map(r => items.find(i => (r.id && i.id === r.id) || (r.name && i.name.toLowerCase() === r.name.toLowerCase())))
    .filter((i): i is PlanItem => !!i && attacks.has(i.id));
  if (!linked.length) return undefined;
  const digit = text.replace(/<[^>]+>|\[\[[^\]]*\]\]/g, " ").match(/\b(\d+)\b/);
  return {
    options: [{ groups: [{ n: digit ? Number(digit[1]) : { text: "?" }, refs: [...new Set(linked.map(i => i.identifier || slug(i.name)))] }], extra: [] }],
    replace: []
  };
}

export async function multiattackPlan(actor: Actor.Implementation | null | undefined): Promise<PlanLookup | undefined> {
  const item = multiattackItem(actor);
  if (!actor || !item) return undefined;
  const keys = creatureKeys(actor);
  const key = planKey(actor);
  const items = planItems(actor);
  const names = items.filter(i => !/^multiattack/.test(i.identifier ?? "")).map(i => i.name);
  const known = knownRefs(items);
  const skipped: string[] = [];
  // Each item reference made this creature's exact activities, once, as the plan is chosen (lib bindPlan)
  const bind = (plan: MultiattackPlan) => bindPlan(plan, items, spellInfo);
  const done = (plan: MultiattackPlan, source: PlanSource, provider?: string): PlanLookup =>
    ({ plan: fillText(plan, item, names), source, ...(provider ? { provider } : {}), item, key, ...(skipped.length ? { skipped } : {}) });

  const gm = gmPlans()[key];
  if (gm) {
    const plan = bind(gm);
    const missing = missingRefs(plan, known);
    if (!missing.length) return done(plan, "gm");
    skipped.push(`gm: ${missing.join(", ")} not on the creature`);
  }
  for (const entry of entries(SERVICE)) {
    let plan: MultiattackPlan | undefined;
    try { plan = await fromProvider(entry.provider, actor, keys); }
    catch (err) { reportServiceProblem(SERVICE, entry.id, "its lookup failed and is skipped", err); continue; }
    if (!plan) continue;
    plan = bind(plan);
    const missing = missingRefs(plan, known);
    if (missing.length) { skipped.push(`${entry.id}: ${missing.join(", ")} not on the creature`); continue; }
    return done(plan, "registered", entry.id);
  }
  for (const text of textsOf(item)) {
    const parsed = parseMultiattack(text, { names });
    if (!parsed || parsed.unread.length) continue;
    const resolved = resolvePlan(parsed, { items, spell: spellInfo });
    if (resolved.unresolved) { skipped.push(`text: ${resolved.unresolved.join(", ")} not on the creature`); continue; }
    const plan = bind(resolved);
    const missing = missingRefs(plan, known);
    if (missing.length) { skipped.push(`text: nothing usable on ${missing.join(", ")}`); continue; }
    return done(plan, "parsed");
  }
  const guess = guessPlan(item, items, names);
  if (guess) return done(bind(guess), "guess");
  return { source: "none", item, key, ...(skipped.length ? { skipped } : {}) };
}

export function setupMultiattackPlans() {
  setupMultiattackSheet();
  registerMultiattackSection();
  game.settings?.register("midi-qol", SETTING, { scope: "world", config: false, type: Object, default: {} });
}

export const multiattackApi = {
  plan: multiattackPlan,
  providers: () => entries(SERVICE).map(e => e.id),
  setPlan: setGmPlan,
  key: planKey,
  keys: creatureKeys,
  item: multiattackItem,
  parse: parseMultiattack,
  resolve: resolvePlan,
  // M21b: the open run (this turn's), opening one (as using Multiattack does), the run sheet
  open: (actor: Actor.Implementation) => openRun(actor)?.run,
  // The active multiattack provider's state (midi's or a replacement's)
  state: multiattackState,
  start: openMultiattack,
  sheet: (actor: Actor.Implementation) => MultiattackRunSheet.show(actor),
  edit: (actor: Actor.Implementation) => MultiattackPlanEditor.open(actor)
};
