import type { MultiattackPlan } from "../../lib/multiattack.js";

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

async function lookup(_actor: Actor.Implementation, keys: string[]): Promise<MultiattackPlan | undefined> {
  const packs = await load("index") as unknown as string[] | undefined;
  for (const key of keys) {
    const pack = key.match(/^Compendium\.([^.]+\.[^.]+)\.Actor\./)?.[1];
    if (!pack || !packs?.includes(pack)) continue;
    const plan = (await load(pack))?.plans?.[key]?.plan;
    if (plan) return plan;
  }
  return undefined;
}

Hooks.once("midi-qol.registerServices", services => {
  services.register("multiattackPlans", "midi-qol.official", { lookup }, { priority: -100, label: "Midi-QOL: plans from the books" });
});
