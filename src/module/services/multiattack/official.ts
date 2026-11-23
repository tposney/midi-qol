import type { MultiattackPlan, PlanRef } from "../../lib/multiattack.js";

/*
 * midi's Multiattack table (`midi-qol.official`): plans generated from the books (tools/multiattack-plans.mjs), one
 * file per pack, fetched on a creature's first lookup. Written as another module would write it: it imports only
 * types, registers in `midi-qol.registerServices` and reads its data by URL, so it keeps the public route working
 * (a vitest fails on any other import) and could move to a module of its own unchanged.
 */

const ROOT = "modules/midi-qol/data/multiattack";
/** Each file: `{ plans: { <compendium uuid>: { item, plan } } }` (item: the Multiattack feature's id) */
const files = new Map<string, Promise<{ plans?: Record<string, { item?: string, plan: MultiattackPlan }> } | undefined>>();
const load = (name: string) => {
  if (!files.has(name)) files.set(name, fetch(foundry.utils.getRoute(`${ROOT}/${name}.json`)).then(r => r.ok ? r.json() : undefined).catch(() => undefined));
  return files.get(name)!;
};

/** index.json: the packs with plans; by name (midi's `id:<slug>` key) each book creature's [uuid, rules] */
type Index = { packs?: string[], names?: Record<string, [string, string | null][]> };
const packOf = (uuid: string) => uuid.match(/^Compendium\.([^.]+\.[^.]+)\.Actor\./)?.[1];

async function planFor(index: Index, uuid: string): Promise<MultiattackPlan | undefined> {
  const pack = packOf(uuid);
  if (!pack || !index.packs?.includes(pack)) return undefined;
  return (await load(pack))?.plans?.[uuid]?.plan;
}

/** The creature's items as a plan names them (identifier, else the name's slug, as midi's keys) */
function itemIds(actor: Actor.Implementation): Set<string> {
  const slug = (name: string) => name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return new Set(actor.items.map(item => (item.system as { identifier?: string }).identifier || slug(item.name ?? "")));
}

/** Activity references ("battleaxe.<id>") made item references ("battleaxe") */
function byItem(plan: MultiattackPlan): MultiattackPlan {
  const item = (ref: PlanRef) => ref.match(/^([a-z0-9-]+)\.[A-Za-z0-9]{16}$/)?.[1] ?? ref;
  const list = (refs: PlanRef[]) => [...new Set(refs.map(item))];
  return {
    ...plan,
    options: plan.options.map(o => ({
      ...o, groups: o.groups.map(g => ({ ...g, refs: list(g.refs) })), extra: o.extra.map(e => ({ ...e, refs: list(e.refs) })),
      ...(o.limits ? { limits: o.limits.map(l => ({ ...l, refs: list(l.refs) })) } : {})
    })),
    replace: plan.replace.map(r => ({ ...r, refs: list(r.refs), ...(r.of ? { of: list(r.of) } : {}) }))
  };
}

const ANY = new Set(["attack", "attack:melee", "attack:ranged", "spell"]);

/** Every item the plan names is on the creature (a cast by its casting item; "attack"/"spell" are anything) */
function fits(plan: MultiattackPlan, ids: Set<string>): boolean {
  const refs = [...plan.options.flatMap(o => [...o.groups.flatMap(g => g.refs), ...o.extra.flatMap(e => e.refs)]), ...plan.replace.flatMap(r => [...r.refs, ...(r.of ?? [])])];
  return refs.every(ref => {
    const bare = ref.replace(/@\d+$/, "");
    return ANY.has(bare) || ids.has(bare.split(">")[0].split(".")[0]);
  });
}

async function lookup(actor: Actor.Implementation, keys: string[]): Promise<MultiattackPlan | undefined> {
  const index = await load("index") as Index | undefined;
  if (!index) return undefined;
  for (const key of keys.filter(k => k.startsWith("Compendium."))) {
    const plan = await planFor(index, key);
    if (plan) return plan;
  }
  // Built in the world: a book creature of the same name and rules whose attacks it has
  const rules = (actor.system as { source?: { rules?: string } }).source?.rules || null;
  const ids = itemIds(actor);
  for (const key of keys.filter(k => k.startsWith("id:"))) {
    for (const [uuid, bookRules] of index.names?.[key.slice(3)] ?? []) {
      if (rules && bookRules && rules !== bookRules) continue;
      const plan = await planFor(index, uuid);
      // Its activity ids are the book creature's: named by item again, midi binds them to this creature's
      if (plan && fits(plan, ids)) return byItem(plan);
    }
  }
  return undefined;
}

Hooks.once("midi-qol.registerServices", services => {
  services.register("multiattackPlans", "midi-qol.official", { lookup }, { priority: -100, label: "Midi-QOL: plans from the books" });
});
