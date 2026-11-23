import { i18n } from "../../../midi-qol.js";
import { activityRef, planRefs, slug, type MultiattackPlan, type PlanGroup, type PlanOption, type PlanReplace } from "../../lib/multiattack.js";
import { isMultiattackItem, multiattackPlan, planKey, setGmPlan, spellInfo } from "../../services/multiattack/plans.js";
import { planView, refName } from "./planView.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/*
 * M21: the GM's Multiattack plan for a creature. The feature's sheet shows the plan in use and where it came from (the
 * GM's, a registration, the text read, a guess, none, and why sources were passed over), with Edit, Confirm (a guess)
 * and Reset (the GM's plan). The editor starts from the plan in use; attacks are chosen from the creature's own items
 * and cast activities, never typed. Saved for the creature's compendium source (every copy shares it), else the actor.
 */

type ItemSystem = { identifier?: string, activities?: { contents?: { id: string, type?: string, spell?: { uuid?: string }, activation?: { type?: string }, midiProperties?: { automationOnly?: boolean } }[] } };

/** The references the creature's plan can use: its items, its casts, any attack/spell; and any the plan already has */
function refChoices(actor: Actor.Implementation, plan: MultiattackPlan): { value: string, label: string }[] {
  const values = new Set<string>(["attack", "attack:melee", "attack:ranged", "spell"]);
  for (const item of actor.items) {
    if (isMultiattackItem(item)) continue;
    const system = item.system as ItemSystem;
    const id = system.identifier || slug(item.name ?? "");
    // Every activity, named with its item ("Pincer: Attack", "Pincer: Escape Check"), the GM choosing; not midi's
    // automation-only ones (another activity triggers them); a cast by its spell
    for (const activity of system.activities?.contents ?? []) {
      if (activity.midiProperties?.automationOnly) continue;
      const info = activity.spell?.uuid ? spellInfo(activity.spell.uuid) : undefined;
      const spell = info?.identifier || (info?.name ? slug(info.name) : undefined);
      values.add(spell ? `${id}>${spell}` : activityRef(id, activity.id));
    }
  }
  for (const ref of planRefs(plan)) values.add(ref);
  return [...values].map(value => ({ value, label: refName(actor, value, { full: true }) })).sort((a, b) => a.label.localeCompare(b.label));
}

const countToText = (n: PlanGroup["n"]) => typeof n === "number" ? String(n) : n === "any" ? "any" : "formula" in n ? n.formula : (n.text === true ? "?" : n.text);
function countFromText(text: string): PlanGroup["n"] {
  const t = text.trim();
  if (/^\d+$/.test(t)) return Number(t);
  if (/^any$/i.test(t)) return "any";
  if (!t || t === "?") return { text: "?" };
  return /[@(]/.test(t) || /^\d+d\d+$/.test(t) ? { formula: t } : { text: t };
}
const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) as T[] : [];
const refsOf = (value: unknown): string[] => (Array.isArray(value) ? value : typeof value === "string" && value ? [value] : []).filter(Boolean);

const emptyOption = (): PlanOption => ({ groups: [{ n: 1, refs: [] }], extra: [] });

export class MultiattackPlanEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form" as const,
    classes: ["midi-qol", "midi-qol-multiattack-editor"],
    window: { title: "midi-qol.Multiattack.EditorTitle", icon: "fa-solid fa-burst", resizable: true, contentClasses: ["standard-form"] },
    position: { width: 640, height: "auto" as const },
    form: { handler: MultiattackPlanEditor.#onChange, submitOnChange: true, closeOnSubmit: false },
    actions: {
      maAdd: MultiattackPlanEditor.#onAdd,
      maRemove: MultiattackPlanEditor.#onRemove,
      maSave: MultiattackPlanEditor.#onSave,
      maReset: MultiattackPlanEditor.#onReset
    }
  };

  static PARTS = {
    body: { template: "modules/midi-qol/templates/apps/Multiattack/editor.hbs", scrollable: [""] },
    footer: { template: "modules/midi-qol/templates/apps/Multiattack/editor-footer.hbs" }
  };

  actor: Actor.Implementation;
  #plan: MultiattackPlan;

  constructor(actor: Actor.Implementation, plan: MultiattackPlan | undefined) {
    super({ id: `midi-qol-multiattack-editor-${actor.id}` });
    this.actor = actor;
    this.#plan = plan ? foundry.utils.deepClone(plan) : { options: [emptyOption()], replace: [] };
    if (!this.#plan.options.length) this.#plan.options.push(emptyOption());
  }

  static async open(actor: Actor.Implementation) {
    const found = await multiattackPlan(actor);
    return new MultiattackPlanEditor(actor, found?.plan).render({ force: true });
  }

  get title() { return i18n("midi-qol.Multiattack.EditorTitle").replace("{name}", this.actor.name ?? ""); }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const choices = refChoices(this.actor, this.#plan);
    const pick = (refs: string[]) => choices.map(c => ({ ...c, selected: refs.includes(c.value) }));
    const shared = planKey(this.actor).startsWith("Compendium.");
    return {
      ...context,
      scope: i18n(shared ? "midi-qol.Multiattack.SavedShared" : "midi-qol.Multiattack.SavedActor"),
      options: this.#plan.options.map((option, o) => ({
        index: o,
        groups: option.groups.map((g, i) => ({ index: i, count: countToText(g.n), choices: pick(g.refs) })),
        extra: option.extra.map((e, i) => ({ index: i, ifAvailable: !!e.ifAvailable, choices: pick(e.refs) })),
        limits: (option.limits ?? []).map((l, i) => ({ index: i, max: l.max, choices: pick(l.refs) })),
        condition: option.condition === true ? "" : option.condition ?? ""
      })),
      replace: this.#plan.replace.map((r, i) => ({ index: i, n: String(r.n), choices: pick(r.refs), of: pick(r.of ?? []) })),
      notes: Array.isArray(this.#plan.notes) ? this.#plan.notes.join("\n") : "",
      preview: planView(this.actor, this.#plan)
    };
  }

  /** The form into the plan (every change: the form submits on change) */
  static async #onChange(this: MultiattackPlanEditor, _event: Event, _form: HTMLFormElement, formData: { object: Record<string, unknown> }) {
    const data = foundry.utils.expandObject(formData.object) as Record<string, unknown>;
    this.#plan = {
      options: asArray<Record<string, unknown>>(data.options).map(option => {
        const limits = asArray<Record<string, unknown>>(option.limits).map(l => ({ max: Math.max(0, Number(l.max) || 0), refs: refsOf(l.refs) }));
        const condition = String(option.condition ?? "").trim();
        return {
          groups: asArray<Record<string, unknown>>(option.groups).map(g => ({ n: countFromText(String(g.count ?? "")), refs: refsOf(g.refs) })),
          extra: asArray<Record<string, unknown>>(option.extra).map(e => ({ refs: refsOf(e.refs), ...(e.ifAvailable ? { ifAvailable: true } : {}) })),
          ...(condition ? { condition } : {}),
          ...(limits.length ? { limits } : {})
        };
      }),
      replace: asArray<Record<string, unknown>>(data.replace).map(r => {
        const n = String(r.n ?? "1").trim();
        const of = refsOf(r.of);
        return { n: /^any$/i.test(n) ? "any" : Math.max(1, Number(n) || 1), refs: refsOf(r.refs), ...(of.length ? { of } : {}) } as PlanReplace;
      }),
      ...(String(data.notes ?? "").trim() ? { notes: String(data.notes).split("\n").map(s => s.trim()).filter(Boolean) } : {})
    };
    void this.render({ parts: ["body"] });
  }

  static #onAdd(this: MultiattackPlanEditor, _event: PointerEvent, target: HTMLElement) {
    const { kind, option } = target.dataset;
    const o = this.#plan.options[Number(option)];
    if (kind === "option") this.#plan.options.push(emptyOption());
    else if (kind === "group") o?.groups.push({ n: 1, refs: [] });
    else if (kind === "extra") o?.extra.push({ refs: [] });
    else if (kind === "limit" && o) (o.limits ??= []).push({ max: 1, refs: [] });
    else if (kind === "replace") this.#plan.replace.push({ n: 1, refs: [] });
    void this.render({ parts: ["body"] });
  }

  static #onRemove(this: MultiattackPlanEditor, _event: PointerEvent, target: HTMLElement) {
    const { kind, option, index } = target.dataset;
    const o = this.#plan.options[Number(option)];
    const i = Number(index);
    if (kind === "option") this.#plan.options.splice(Number(option), 1);
    else if (kind === "group") o?.groups.splice(i, 1);
    else if (kind === "extra") o?.extra.splice(i, 1);
    else if (kind === "limit") o?.limits?.splice(i, 1);
    else if (kind === "replace") this.#plan.replace.splice(i, 1);
    if (!this.#plan.options.length) this.#plan.options.push(emptyOption());
    void this.render({ parts: ["body"] });
  }

  static async #onSave(this: MultiattackPlanEditor) {
    const plan = this.#plan;
    if (plan.options.some(o => o.groups.some(g => !g.refs.length)) || plan.replace.some(r => !r.refs.length)) {
      ui.notifications?.warn(i18n("midi-qol.Multiattack.EmptyRow"));
      return;
    }
    await setGmPlan(this.actor, plan);
    ui.notifications?.info(i18n("midi-qol.Multiattack.Saved").replace("{name}", this.actor.name ?? ""));
    await this.close();
  }

  static async #onReset(this: MultiattackPlanEditor) {
    await setGmPlan(this.actor, null);
    const found = await multiattackPlan(this.actor);
    this.#plan = found?.plan ? foundry.utils.deepClone(found.plan) : { options: [emptyOption()], replace: [] };
    void this.render({ parts: ["body"] });
  }
}

const SECTION = "modules/midi-qol/templates/apps/Multiattack/section.hbs";

/** The Multiattack feature's sheet: the plan in use, where it came from, Edit / Confirm / Reset (GM only) */
export function registerMultiattackSection() {
  Hooks.on("renderItemSheet5e", async (app: { document: unknown }, html: HTMLElement) => {
    const item = app.document;
    if (!(item instanceof Item) || !game.user?.isGM || !isMultiattackItem(item)) return;
    const actor = item.parent;
    if (!(actor instanceof Actor)) return;
    const tab = html.querySelector<HTMLElement>('section.tab[data-tab="description"]');
    if (!tab) return;
    const found = await multiattackPlan(actor);
    tab.querySelector(".midi-qol-multiattack-section")?.remove();
    const content = await foundry.applications.handlebars.renderTemplate(SECTION, {
      source: i18n(`midi-qol.Multiattack.Source.${found?.source ?? "none"}`),
      provider: found?.provider,
      skipped: found?.skipped ?? [],
      view: found?.plan ? planView(actor, found.plan) : undefined,
      guess: found?.source === "guess",
      gm: found?.source === "gm"
    });
    const holder = document.createElement("div");
    holder.innerHTML = content;
    const section = holder.firstElementChild as HTMLElement | null;
    if (!section) return;
    const rerender = () => (app as { render?: () => unknown }).render?.();
    section.querySelector("[data-ma-edit]")?.addEventListener("click", () => { void MultiattackPlanEditor.open(actor); });
    section.querySelector("[data-ma-confirm]")?.addEventListener("click", async () => { if (found?.plan) { await setGmPlan(actor, found.plan); rerender(); } });
    section.querySelector("[data-ma-reset]")?.addEventListener("click", async () => { await setGmPlan(actor, null); rerender(); });
    const descriptions = tab.querySelector(".item-descriptions");
    if (descriptions) descriptions.after(section);
    else tab.append(section);
  });
  // A GM plan saved or reset: open Multiattack sheets redraw
  Hooks.on("updateSetting", (setting: { key?: string }) => {
    if (setting.key !== "midi-qol.multiattackPlans") return;
    for (const app of foundry.applications.instances.values()) {
      const doc = (app as { document?: unknown }).document;
      if (doc instanceof Item && isMultiattackItem(doc)) void (app as { render(): unknown }).render();
    }
  });
}
