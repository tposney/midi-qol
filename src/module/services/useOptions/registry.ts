import { i18n } from "../../../midi-qol.js";
import type { Activity, ActivityUseConfiguration } from "../../../globals.js";
import type { Workflow } from "../../Workflow.js";

/*
 * M27: use options. Choices a player makes as a use starts (Metamagic on a spell; later Heavy Weapon Mastery, a weapon's
 * mastery, a manoeuvre chosen before the attack), each changing this use only and paying its own cost. A provider says
 * what it offers a use; midi asks before dnd5e's use (offers can be async), shows them as a section of dnd5e's usage
 * dialog (or a small prompt when no dialog is shown), and applies the chosen ones after the dialog, on the use's own
 * copy, before the bonus action and reaction checks and before anything is consumed. A provider's apply pays its cost
 * and returns how to give it back; midi refunds when the use stops before its card.
 *
 *   MidiQOL.useOptions.register("my-mod.power", { label: "Power", offer: ctx => [...], apply: async (chosen, ctx) => ... });
 */

export interface UseOption {
  /** Unique within its provider */
  id: string;
  label: string;
  img?: string;
  hint?: string;
  /** What it costs from the provider's budget (Sorcery Points) */
  cost?: number;
  /** Why it can't be chosen now (shown, greyed) */
  disabled?: string;
}

export interface UseOptionContext {
  activity: Activity;
  item: Item.Implementation;
  actor: Actor.Implementation;
  workflow: Workflow;
  /** After the dialog: dnd5e's usage config for the use */
  usageConfig?: ActivityUseConfiguration;
}

export interface UseOptionRefund { refund(): Promise<void> }

/** One of a provider's sections, when it has several (entries: a section per group) */
export interface UseOptionSection { id: string, label: string, options: UseOption[], limit?: number, budget?: { amount: number, label: string } }

export interface UseOptionProvider {
  /** The section's heading (a lang key or text) */
  label: string;
  offer(ctx: UseOptionContext): UseOption[] | Promise<UseOption[]>;
  /** Several sections in place of `offer`'s one; option ids are unique across them */
  sections?(ctx: UseOptionContext): UseOptionSection[] | Promise<UseOptionSection[]>;
  /** How many may be chosen together (default: any) */
  limit?(ctx: UseOptionContext): number;
  /** What the costs are paid from: the amount left and its name ("Sorcery Points") */
  budget?(ctx: UseOptionContext): { amount: number, label: string } | undefined;
  /** Change the use (its copy: ctx.activity, ctx.item) and pay; false stops the use */
  apply(chosen: UseOption[], ctx: UseOptionContext): Promise<false | UseOptionRefund | void>;
}

/** What a use was offered, per provider, as plain data (the dialog and the prompt draw it) */
export interface OfferedSection {
  provider: string;
  /** A provider's own section id (sections()) */
  section?: string;
  label: string;
  options: UseOption[];
  limit?: number;
  budget?: { amount: number, label: string };
}

export interface UseOptionsState {
  offered: OfferedSection[];
  refunds: UseOptionRefund[];
}

const providers = new Map<string, UseOptionProvider>();

export function registerUseOptions(id: string, provider: UseOptionProvider): () => void {
  providers.set(id, provider);
  return () => { providers.delete(id); };
}

/** Before dnd5e's use: what each provider offers this use (the workflow keeps it for the dialog and after) */
export async function collectUseOptions(workflow: Workflow, activity: Activity): Promise<void> {
  const item = activity.item as Item.Implementation | undefined;
  const actor = activity.actor as Actor.Implementation | undefined;
  if (!item || !actor) return;
  const ctx: UseOptionContext = { activity, item, actor, workflow };
  const offered: OfferedSection[] = [];
  for (const [id, provider] of providers) {
    try {
      if (provider.sections) {
        for (const section of await provider.sections(ctx))
          if (section.options.length) offered.push({ provider: id, section: section.id, label: section.label, options: section.options, limit: section.limit, budget: section.budget });
        continue;
      }
      const options = await provider.offer(ctx);
      if (!options.length) continue;
      offered.push({ provider: id, label: i18n(provider.label), options, limit: provider.limit?.(ctx), budget: provider.budget?.(ctx) });
    } catch (err) {
      console.warn(`midi-qol | use options ${id}`, err);
    }
  }
  workflow.useOptions = offered.length ? { offered, refunds: [] } : undefined;
}

/** A use has something to choose (dnd5e then shows its dialog for it) */
export function hasUseOptions(workflow: Workflow | undefined): boolean {
  return !!workflow?.useOptions?.offered.some(section => section.options.some(o => !o.disabled));
}

type DialogConfig = ActivityUseConfiguration & { midiUseOptionsShown?: boolean, midiUseOptionsChosen?: string[] };
const key = (section: OfferedSection, option: UseOption) => `${section.provider}|${option.id}`;
const escape = (text: string) => foundry.utils.escapeHTML(text);

function sectionHTML(section: OfferedSection, chosen: Set<string>): string {
  const head = section.budget ? `${escape(section.label)} <span class="midi-qol-use-options-budget">${escape(section.budget.label)}: ${section.budget.amount}</span>` : escape(section.label);
  const rows = section.options.map(option => {
    const k = key(section, option);
    const cost = option.cost ? ` <span class="midi-qol-use-options-cost">(${option.cost})</span>` : "";
    const img = option.img ? `<img src="${escape(option.img)}" alt="">` : "";
    const tip = option.disabled ?? option.hint;
    return `<label class="checkbox${option.disabled ? " disabled" : ""}"${tip ? ` data-tooltip="${escape(tip)}"` : ""}>
      <input type="checkbox" data-use-option="${escape(k)}" data-provider="${escape(section.provider)}" data-cost="${option.cost ?? 0}"${chosen.has(k) ? " checked" : ""}${option.disabled ? " disabled data-always-disabled" : ""}>
      ${img}${escape(option.label)}${cost}</label>`;
  }).join("");
  return `<fieldset class="midi-qol-use-options" data-provider="${escape(section.provider)}" data-limit="${section.limit ?? ""}" data-budget="${section.budget?.amount ?? ""}">
    <legend>${head}</legend>${rows}</fieldset>`;
}

/** Grey what would go over a section's limit or budget, given what is ticked */
function enforce(root: HTMLElement) {
  for (const fieldset of Array.from(root.querySelectorAll<HTMLElement>("fieldset.midi-qol-use-options"))) {
    const boxes = Array.from(fieldset.querySelectorAll<HTMLInputElement>("input[data-use-option]"));
    const ticked = boxes.filter(b => b.checked);
    const limit = Number(fieldset.dataset.limit) || Infinity;
    const budget = fieldset.dataset.budget === "" ? Infinity : Number(fieldset.dataset.budget);
    const spent = ticked.reduce((total, b) => total + Number(b.dataset.cost), 0);
    for (const box of boxes) {
      if (box.checked || box.hasAttribute("data-always-disabled")) continue;
      box.disabled = ticked.length >= limit || spent + Number(box.dataset.cost) > budget;
      box.closest("label")?.classList.toggle("disabled", box.disabled);
    }
  }
}

const chosenIn = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLInputElement>("input[data-use-option]:checked")).map(b => b.dataset.useOption ?? "");

/** dnd5e's usage dialog (renderActivityUsageDialog): the use's options as sections above its footer. The inputs carry no
 * name, so dnd5e's form ignores them; what is ticked goes on the dialog's config, which is the use's */
export function renderUseOptions(app: { config?: DialogConfig, element?: HTMLElement, setPosition?(): unknown }) {
  const config = app.config;
  const state = config?.workflow?.useOptions;
  const element = app.element;
  if (!config || !state?.offered.length || !element) return;
  config.midiUseOptionsShown = true;
  element.querySelectorAll(".midi-qol-use-options").forEach(e => e.remove());
  const chosen = new Set(config.midiUseOptionsChosen ?? []);
  const holder = document.createElement("div");
  holder.innerHTML = state.offered.map(section => sectionHTML(section, chosen)).join("");
  const footer = element.querySelector(".form-footer");
  const sections = Array.from(holder.children) as HTMLElement[];
  if (footer) footer.before(...sections); else element.querySelector("form, .window-content")?.append(...sections);
  enforce(element);
  for (const section of sections) section.addEventListener("change", () => {
    config.midiUseOptionsChosen = chosenIn(element);
    enforce(element);
  });
  app.setPosition?.();
}

/** No dialog was shown (fast forward): the options in a small prompt; none chosen when it is closed */
async function promptUseOptions(state: UseOptionsState, title: string): Promise<string[]> {
  let picked: string[] = [];
  await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: state.offered.map(section => sectionHTML(section, new Set())).join(""),
    buttons: [
      { action: "use", label: i18n("midi-qol.Use"), default: true, callback: (_event: Event, button: HTMLButtonElement) => { picked = chosenIn(button.form ?? document.body); } },
      { action: "none", label: i18n("midi-qol.UseOptions.None") }
    ],
    rejectClose: false,
    render: (_event: Event, app: foundry.applications.api.DialogV2) => {
      enforce(app.element);
      app.element.addEventListener("change", () => enforce(app.element));
    }
  });
  return picked;
}

/** After dnd5e's dialog, on the use's copy: the chosen options applied and paid; false stops the use */
export async function applyUseOptions(ctx: UseOptionContext & { usageConfig: DialogConfig }): Promise<boolean> {
  const state = ctx.workflow.useOptions;
  if (!state?.offered.length) return true;
  const chosen = ctx.usageConfig.midiUseOptionsShown ? ctx.usageConfig.midiUseOptionsChosen ?? []
    : hasUseOptions(ctx.workflow) ? await promptUseOptions(state, ctx.item.name ?? "") : [];
  // A provider is applied once, with what was chosen in all of its sections
  const byProvider = new Map<string, UseOption[]>();
  for (const section of state.offered) {
    const options = section.options.filter(option => !option.disabled && chosen.includes(key(section, option)));
    if (!providers.has(section.provider) || !options.length) continue;
    // The dialog greyed what went over; a resubmitted or scripted choice is checked again
    const cost = options.reduce((total, o) => total + (o.cost ?? 0), 0);
    if (options.length > (section.limit ?? Infinity) || cost > (section.budget?.amount ?? Infinity)) {
      ui.notifications?.warn(i18n("midi-qol.UseOptions.TooMany").replace("{label}", section.label));
      await refundUseOptions(ctx.workflow);
      return false;
    }
    byProvider.set(section.provider, [...(byProvider.get(section.provider) ?? []), ...options]);
  }
  for (const [id, options] of byProvider) {
    const result = await providers.get(id)!.apply(options, ctx);
    if (result === false) { await refundUseOptions(ctx.workflow); return false; }
    if (result) state.refunds.push(result);
  }
  return true;
}

/** The use stopped before its card: what its options cost is given back */
export async function refundUseOptions(workflow: Workflow | undefined): Promise<void> {
  const refunds = workflow?.useOptions?.refunds.splice(0) ?? [];
  for (const r of refunds) {
    try { await r.refund(); } catch (err) { console.warn("midi-qol | use options refund", err); }
  }
}

export const useOptionsApi = { register: registerUseOptions };
