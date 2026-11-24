import { i18n } from "../../../midi-qol.js";
import type { Activity } from "../../../globals.js";
import type { Workflow } from "../../Workflow.js";
import { stepsApi } from "../../steps/api.js";
import { addUseRollModifier } from "../../lib/entries/useEvents.js";
import { registerUseOptions, type UseOption, type UseOptionContext } from "./registry.js";

/*
 * M27: midi's Metamagic (2024), as use options on a spell: chosen in dnd5e's usage dialog when the spell is cast, never a
 * feature used first. The options are the caster's features by identifier (any source: midi's, CAT's, the PHB's), so a
 * sorcerer needs nothing midi-specific. Sorcery Points are Metamagic Adept's uses, then Font of Magic's. One option per
 * casting; two with Sorcery Incarnate while Innate Sorcery is active. Empowered and Seeking act on rolls and are offered
 * after them (not here).
 */

const PROVIDER = "midi-qol.metamagic";
const ELEMENTS = ["acid", "cold", "fire", "lightning", "poison", "thunder"];
const TWIN_EXCLUDED = ["magic-missile", "scorching-ray", "chromatic-orb"];
const SECONDS: Record<string, number> = { round: 6, turn: 6, minute: 60, hour: 3600, day: 86400 };

type SpellSystem = {
  level?: number, properties?: Set<string>, materials?: { consumed?: boolean, cost?: number | string },
  duration?: { value?: string | number, units?: string }, range?: { units?: string, value?: number | string },
  activities?: { contents: ActivityData[] }
};
type ActivityData = Activity & {
  id: string, type: string, activation?: { type?: string }, save?: { ability?: Set<string> },
  range?: { units?: string, value?: number | string }, duration?: { units?: string, value?: number | string },
  target?: { template?: { type?: string } },
  damage?: { parts?: { types?: Set<string> | string[] }[] },
  _source?: { target?: { override?: boolean, affects?: { count?: unknown }, template?: { type?: string } }, damage?: { parts?: { types?: string[] }[] } },
  updateSource(changes: object): unknown, prepareData?(): void, prepareFinalData?(): void
};
type Usable = Item.Implementation & { identifier?: string, system: { uses?: { value?: number, max?: number | string | null, spent?: number } } };

const sys = (item: Item.Implementation) => item.system as SpellSystem;
const itemFor = (actor: Actor.Implementation, identifier: string) => actor.items.find(i => (i as Usable).identifier === identifier) as Usable | undefined;

interface MetamagicOption {
  cost: number;
  eligible(spell: Item.Implementation, activity: ActivityData): boolean;
  apply(ctx: MetamagicContext): Promise<boolean | void>;
}
type MetamagicContext = UseOptionContext & { activity: ActivityData };

/** Sorcery Point pools, Metamagic Adept's first (it can only be spent on Metamagic) */
function pools(actor: Actor.Implementation): Usable[] {
  return ["metamagic-adept", "font-of-magic"].map(id => itemFor(actor, id)).filter((i): i is Usable => !!i && !!Number(i.system.uses?.max));
}
const points = (actor: Actor.Implementation) => pools(actor).reduce((total, i) => total + Number(i.system.uses?.value ?? 0), 0);

async function spend(actor: Actor.Implementation, amount: number): Promise<{ item: Usable, taken: number }[] | undefined> {
  if (points(actor) < amount) return undefined;
  const receipt: { item: Usable, taken: number }[] = [];
  for (const item of pools(actor)) {
    const taken = Math.min(amount, Number(item.system.uses?.value ?? 0));
    if (!taken) continue;
    await item.update({ "system.uses.spent": Number(item.system.uses?.spent ?? 0) + taken } as never);
    receipt.push({ item, taken });
    amount -= taken;
    if (!amount) break;
  }
  return receipt;
}

/** The activity copy's own data and prepared data, changed together (as use.configure changes are) */
function changeActivity(activity: ActivityData, updates: Record<string, unknown>) {
  activity.updateSource(updates);
  activity.prepareData?.();
  activity.prepareFinalData?.();
}

const hasSave = (spell: Item.Implementation) => (sys(spell).activities?.contents ?? []).some(a => a.type === "save" || !!a.save?.ability?.size);
function durationSeconds(units: string | undefined, value: unknown): number {
  return (SECONDS[units ?? ""] ?? 0) * Number(value || 0);
}
function subtleComponents(spell: Item.Implementation): string[] {
  const materials = sys(spell).materials ?? {};
  const keepMaterial = !!materials.consumed || Number(materials.cost) > 0;
  return ["vocal", "somatic", ...(keepMaterial ? [] : ["material"])].filter(c => sys(spell).properties?.has(c));
}
const damageTypes = (activity: ActivityData) => new Set((activity.damage?.parts ?? []).flatMap(p => [...(p.types ?? [])]));

/** Twinned: the spell gains a target when upcast (its target count written in terms of the cast level, read from the
 * source: the prepared count is evaluated); projectiles scale the same way and are excluded; flags.midi-qol.twinnable
 * on a spell overrides either way */
function twinnable(spell: Item.Implementation): boolean {
  const ruling = spell.getFlag("midi-qol" as never, "twinnable" as never) as unknown;
  if (typeof ruling === "boolean") return ruling;
  if (!sys(spell).level || TWIN_EXCLUDED.includes((spell as Usable).identifier ?? "")) return false;
  const source = (spell as unknown as { _source: { system: { target?: { affects?: { count?: unknown }, template?: { type?: string } } } } })._source.system.target;
  const targets = [source, ...(sys(spell).activities?.contents ?? []).map(a => a._source?.target?.override ? a._source.target : undefined)].filter(Boolean);
  if (targets.some(t => t?.template?.type)) return false;
  return targets.some(t => /@item\.level|@scaling/.test(String(t?.affects?.count ?? "")));
}

async function chooseDamageTypes(activity: ActivityData, title: string): Promise<{ from: string, to: string } | undefined> {
  const present = ELEMENTS.filter(t => damageTypes(activity).has(t));
  const label = (t: string) => i18n((CONFIG as unknown as { DND5E: { damageTypes: Record<string, { label: string }> } }).DND5E.damageTypes[t]?.label ?? t);
  const select = (name: string, types: string[]) => `<select name="${name}">${types.map(t => `<option value="${t}">${label(t)}</option>`).join("")}</select>`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `<div class="form-group"><label>${i18n("midi-qol.Metamagic.TransmuteFrom")}</label><div class="form-fields">${select("from", present)}</div></div>
      <div class="form-group"><label>${i18n("midi-qol.Metamagic.TransmuteTo")}</label><div class="form-fields">${select("to", ELEMENTS)}</div></div>`,
    ok: { callback: (_event: Event, button: HTMLButtonElement) => {
      const form = button.form;
      return { from: (form?.elements.namedItem("from") as HTMLSelectElement)?.value, to: (form?.elements.namedItem("to") as HTMLSelectElement)?.value };
    } },
    rejectClose: false
  }) as { from?: string, to?: string } | null;
  return result?.from && result.to && result.from !== result.to ? { from: result.from, to: result.to } : undefined;
}

const OPTIONS: Record<string, MetamagicOption> = {
  "careful-spell": { cost: 1, eligible: spell => hasSave(spell), apply: async ctx => { mark(ctx.workflow, "careful-spell"); } },
  "distant-spell": {
    cost: 1,
    eligible: (_spell, activity) => activity.range?.units === "touch" || (activity.range?.units === "ft" && Number(activity.range.value) >= 5),
    apply: async ({ activity }) => {
      const range = activity.range ?? {};
      changeActivity(activity, range.units === "touch"
        ? { "range.override": true, "range.units": "ft", "range.value": "30" }
        : { "range.override": true, "range.units": range.units, "range.value": String(Number(range.value) * 2) });
    }
  },
  "extended-spell": {
    cost: 1,
    eligible: (_spell, activity) => durationSeconds(activity.duration?.units, activity.duration?.value) >= 60,
    apply: async ({ activity, workflow, item }) => {
      const { units, value } = activity.duration ?? {};
      const seconds = durationSeconds(units, value);
      const doubled = seconds * 2 > 86400 ? Math.floor(86400 / (seconds / Number(value))) : Number(value) * 2;
      changeActivity(activity, { "duration.override": true, "duration.units": units, "duration.value": String(doubled) });
      if (sys(item).properties?.has("concentration")) mark(workflow, "extended-spell");
    }
  },
  "heightened-spell": { cost: 2, eligible: spell => hasSave(spell), apply: async ctx => { mark(ctx.workflow, "heightened-spell"); } },
  "quickened-spell": {
    cost: 2,
    eligible: (_spell, activity) => activity.activation?.type === "action",
    apply: async ({ activity }) => { changeActivity(activity, { "activation.override": true, "activation.type": "bonus" }); }
  },
  "subtle-spell": {
    cost: 1,
    eligible: spell => subtleComponents(spell).length > 0,
    apply: async ({ item }) => {
      const dropped = subtleComponents(item);
      const kept = [...(sys(item).properties ?? [])].filter(p => !dropped.includes(p));
      foundry.utils.setProperty(item._source, "system.properties", kept);
      foundry.utils.setProperty(item, "system.properties", new Set(kept));
    }
  },
  "transmuted-spell": {
    cost: 1,
    eligible: (_spell, activity) => ELEMENTS.some(t => damageTypes(activity).has(t)),
    apply: async ({ activity, item }) => {
      const change = await chooseDamageTypes(activity, itemFor(activity.actor as Actor.Implementation, "transmuted-spell")?.name ?? item.name ?? "");
      if (!change) return false;
      const parts = (activity._source?.damage?.parts ?? []).map(p => ({ ...p, types: (p.types ?? []).map(t => t === change.from ? change.to : t) }));
      changeActivity(activity, { "damage.parts": parts });
    }
  },
  "twinned-spell": {
    cost: 1,
    eligible: spell => twinnable(spell),
    // 2024: the spell takes effect one level higher than the slot spent
    apply: async ({ item, usageConfig }) => {
      const config = usageConfig as { scaling?: number } | undefined;
      const scaling = Number(config?.scaling ?? 0) + 1;
      if (Number(sys(item).level ?? 0) + scaling > 9) {
        ui.notifications?.warn(i18n("midi-qol.Metamagic.TwinnedMax"));
        return false;
      }
      if (config) config.scaling = scaling;
      item.updateSource({ "flags.dnd5e.scaling": scaling } as never);
      (item as unknown as { prepareFinalAttributes?(): void }).prepareFinalAttributes?.();
    }
  }
};
// Twinned first: it re-prepares the copy, so the other options' changes follow it
/** The options midi offers when a spell is cast: their features aren't uses of their own (the hub leaves them out) */
export const METAMAGIC_OPTIONS: readonly string[] = ["twinned-spell", "careful-spell", "distant-spell", "extended-spell", "heightened-spell", "quickened-spell", "subtle-spell", "transmuted-spell"];
const ORDER = ["twinned-spell", "careful-spell", "distant-spell", "extended-spell", "heightened-spell", "quickened-spell", "subtle-spell", "transmuted-spell"];

/** Marks on the use for the steps after targeting and saving (Careful, Heightened) and after the use (Extended) */
const marks = new WeakMap<Workflow, Set<string>>();
function mark(workflow: Workflow, id: string) {
  const set = marks.get(workflow) ?? new Set<string>();
  set.add(id);
  marks.set(workflow, set);
}
const marked = (workflow: Workflow, id: string) => !!marks.get(workflow)?.has(id);
const protectedTargets = new WeakMap<Workflow, string[]>();

function optionLimit(actor: Actor.Implementation): number {
  const incarnate = itemFor(actor, "sorcery-incarnate");
  if (!incarnate) return 1;
  const sources = [itemFor(actor, "innate-sorcery"), incarnate].filter(Boolean).map(i => i!.uuid ?? "");
  return actor.effects.some(e => e.active && sources.some(uuid => typeof e.origin === "string" && !!uuid && e.origin.startsWith(uuid))) ? 2 : 1;
}

const chaMax = (actor: Actor.Implementation) => Math.max(1, Number((actor.system as { abilities?: { cha?: { mod?: number } } }).abilities?.cha?.mod ?? 0));

/** Pick up to `max` of the use's targets (Careful, Heightened) */
async function pickTargets(workflow: Workflow, title: string, prompt: string, max: number): Promise<TokenDocument.Implementation[]> {
  const targets = [...workflow.targets.documents] as TokenDocument.Implementation[];
  if (!targets.length) return [];
  const escape = (t: string) => foundry.utils.escapeHTML(t);
  const content = `<p>${escape(prompt)}</p>` + targets.map(t => `<label class="checkbox"><input type="checkbox" name="pick" value="${escape(t.uuid ?? "")}"> <img src="${escape(t.texture?.src ?? "")}" width="24" height="24" style="border:none;vertical-align:middle"> ${escape(t.name ?? "")}</label>`).join("");
  const picked = await foundry.applications.api.DialogV2.prompt({
    window: { title }, content,
    ok: { callback: (_event: Event, button: HTMLButtonElement) => Array.from(button.form?.querySelectorAll<HTMLInputElement>("input[name=pick]:checked") ?? []).map(i => i.value).slice(0, max) },
    rejectClose: false,
    render: (_event: Event, app: foundry.applications.api.DialogV2) => {
      app.element.addEventListener("change", () => {
        const boxes = Array.from(app.element.querySelectorAll<HTMLInputElement>("input[name=pick]"));
        const ticked = boxes.filter(b => b.checked).length;
        for (const b of boxes) if (!b.checked) b.disabled = ticked >= max;
      });
    }
  }) as string[] | null;
  return targets.filter(t => (picked ?? []).includes(t.uuid ?? ""));
}

async function afterTargeting({ workflow }: { workflow: Workflow }) {
  const actor = workflow.actor as Actor.Implementation;
  if (marked(workflow, "careful-spell")) {
    const name = itemFor(actor, "careful-spell")?.name ?? "Careful Spell";
    const chosen = await pickTargets(workflow, name, i18n("midi-qol.Metamagic.CarefulPick").replace("{n}", String(chaMax(actor))), chaMax(actor));
    for (const target of chosen) if (target.actor?.uuid) addUseRollModifier(workflow, target.actor.uuid, { effect: "success", label: name }, ["save"]);
    protectedTargets.set(workflow, chosen.map(t => t.uuid ?? ""));
  }
  if (marked(workflow, "heightened-spell")) {
    const name = itemFor(actor, "heightened-spell")?.name ?? "Heightened Spell";
    const [target] = await pickTargets(workflow, name, i18n("midi-qol.Metamagic.HeightenedPick"), 1);
    if (target?.actor?.uuid) addUseRollModifier(workflow, target.actor.uuid, { effect: "disadvantage", label: name }, ["save"]);
  }
}

/** Careful: a protected creature that would take half damage on a success takes none (a super saver) */
function afterSaves({ workflow }: { workflow: Workflow }) {
  const uuids = protectedTargets.get(workflow);
  if (!uuids?.length) return;
  const savers = [...workflow.saves.documents].filter(t => uuids.includes(t.uuid ?? ""));
  workflow.superSavers = new Set([...workflow.superSavers.documents, ...savers]) as never;
}

/** Extended on a concentration spell: advantage on the caster's saves to keep concentrating on it */
async function afterUse(workflow: Workflow) {
  if (!marked(workflow, "extended-spell")) return;
  const actor = workflow.actor as Actor.Implementation & { concentration?: { effects?: Set<ActiveEffect.Implementation> } };
  const concentration = [...(actor.concentration?.effects ?? [])].find(e => typeof e.origin === "string" && !!workflow.item?.uuid && e.origin.startsWith(workflow.item.uuid))
    ?? [...(actor.concentration?.effects ?? [])].at(-1);
  if (!concentration) return;
  const extended = itemFor(actor, "extended-spell");
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `${extended?.name ?? "Extended Spell"}: ${i18n("midi-qol.Metamagic.Concentration")}`, img: extended?.img ?? "icons/svg/aura.svg", origin: extended?.uuid,
    system: { changes: [{ key: "system.attributes.concentration.roll.mode", type: "add", value: "1", phase: "initial" }] },
    flags: { dnd5e: { dependentOn: concentration.uuid } }
  }] as never);
}

/** The hub's hint on a spell cast with an action: the caster can Quicken it (the feature and the points) */
export function quickenHint(item: Item.Implementation | null | undefined, activation: string): string | undefined {
  const actor = item?.actor as Actor.Implementation | null | undefined;
  if (!item || !actor || (item.type as string) !== "spell" || activation !== "action") return undefined;
  const feature = itemFor(actor, "quickened-spell");
  const cost = OPTIONS["quickened-spell"].cost;
  if (!feature || points(actor) < cost) return undefined;
  return i18n("midi-qol.Metamagic.QuickenHint").replace("{name}", feature.name ?? "").replace("{n}", String(cost));
}

export function registerMetamagic() {
  registerUseOptions(PROVIDER, {
    label: "midi-qol.Metamagic.Label",
    offer: ({ activity, item, actor }) => {
      if ((item.type as string) !== "spell" || !pools(actor).length) return [];
      const left = points(actor);
      const options: UseOption[] = [];
      for (const id of ORDER) {
        const feature = itemFor(actor, id);
        const option = OPTIONS[id];
        if (!feature || !option.eligible(item, activity as ActivityData)) continue;
        options.push({ id, label: feature.name ?? id, img: feature.img ?? undefined, cost: option.cost,
          ...(option.cost > left ? { disabled: i18n("midi-qol.Metamagic.NotEnough") } : {}) });
      }
      return options;
    },
    limit: ({ actor }) => optionLimit(actor),
    budget: ({ actor }) => ({ amount: points(actor), label: i18n("midi-qol.Metamagic.SorceryPoints") }),
    apply: async (chosen, ctx) => {
      const cost = chosen.reduce((total, o) => total + (o.cost ?? 0), 0);
      const receipt = await spend(ctx.actor, cost);
      if (!receipt) { ui.notifications?.warn(i18n("midi-qol.Metamagic.NotEnough")); return false; }
      const refund = { refund: async () => { for (const { item, taken } of receipt) await item.update({ "system.uses.spent": Math.max(0, Number(item.system.uses?.spent ?? 0) - taken) } as never); } };
      const ids = new Set(chosen.map(o => o.id));
      for (const id of ORDER) {
        if (!ids.has(id)) continue;
        if (await OPTIONS[id].apply(ctx as MetamagicContext) === false) { await refund.refund(); return false; }
      }
      return refund;
    }
  });
  stepsApi.register({ id: "midi-qol.metamagicTargets", name: "Metamagic: targets", run: afterTargeting });
  stepsApi.insert({ step: "midi-qol.metamagicTargets", after: "midi-qol.PreambleComplete", source: PROVIDER,
    when: workflow => marked(workflow as Workflow, "careful-spell") || marked(workflow as Workflow, "heightened-spell") });
  stepsApi.register({ id: "midi-qol.metamagicSaves", name: "Metamagic: careful saves", run: afterSaves });
  // A step's when is decided as the use's flow is built (before targeting): the option chosen, not its targets
  stepsApi.insert({ step: "midi-qol.metamagicSaves", after: "midi-qol.saves", source: PROVIDER, when: workflow => marked(workflow as Workflow, "careful-spell") });
  Hooks.on("midi-qol.RollComplete" as never, ((workflow: Workflow) => { void afterUse(workflow); }) as never);
}
