import { defineService, entries as serviceEntries, reportServiceProblem } from "../../api/services.js";
import type { EntryAction, FoundEntry } from "../../lib/entries/types.js";
import type { EventContext } from "../../lib/entries/engine.js";
import type { BonusPhase, OfferedBonus, RollBonusQuery } from "../rollBonuses/service.js";

/*
 * promptControls (contributors): controls shown in a prompt's row with what it offers, set in the same dialog:
 * - an offered entry (the offer dialog): shown once it is ticked, its values read by its actions as `offer.<name>`;
 * - a roll's optional bonus (the bonus prompt): its values in the bonus's selection, read by its formula as
 *   `@bonus.inputs.<name>` (a bonus's own `inputs` are these controls too).
 * midi's own: the dice of a "choose" reroll in either (Empowered Spell: tick it and pick its dice). A module adds
 * controls for its own actions, entries or bonuses:
 *
 *   MidiQOL.services.register("promptControls", "my-module", {
 *     controls: query => query.source === "entry" && query.action.myAction
 *       ? [{ name: "mode", label: "Mode", type: "select", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }] : [],
 *   });
 *
 * A control is a standard one (`type`: midi renders and reads it) or the contributor's own form (`html`, read by its
 * `read`, given listeners by its `wire`). `controls` runs on the client running the event or roll and returns plain
 * data (the dialog may be on the player's client); `read` and `wire` run where the dialog is, so a contributor with
 * its own form registers on every client.
 */

export type PromptControlType = "number" | "select" | "multi" | "checkbox" | "text";
export type PromptControlValue = string | number | boolean | readonly string[];

export interface PromptControl {
  /** The value's name: `offer.<name>`, `@bonus.inputs.<name>` */
  name: string;
  /** Shown with it */
  label?: string;
  /** A standard control */
  type?: PromptControlType;
  options?: readonly { value: string, label: string }[];
  /** Its value as first shown */
  default?: PromptControlValue;
  min?: number;
  max?: number;
  /** The contributor's own form (plain HTML; no listeners: `wire` adds them) */
  html?: string;
}

/** An offered entry, asked once per action of it */
export interface EntryControlQuery {
  source: "entry";
  eventId: string;
  entry: FoundEntry["entry"];
  found: FoundEntry;
  action: EntryAction;
  context: EventContext;
  conditionData: Record<string, unknown>;
}

/** An optional bonus in the bonus prompt; asked again as the prompt re-renders (a reroll's new roll) */
export interface BonusControlQuery {
  source: "bonus";
  candidate: OfferedBonus;
  query: RollBonusQuery;
  phase: BonusPhase;
  roll: Roll;
  /** The values set so far (on a re-render): a control shows them */
  values: Record<string, unknown>;
}

export type PromptControlQuery = EntryControlQuery | BonusControlQuery;

export interface PromptControlContributor {
  controls(query: PromptControlQuery): PromptControl[] | undefined | Promise<PromptControl[] | undefined>;
  /** Its own form's value, from its element (where the dialog is) */
  read?(name: string, element: HTMLElement): unknown;
  /** Its own form's listeners, when the dialog renders (a picker kept to its max) */
  wire?(element: HTMLElement): void;
}

/** A control as the dialog gets it: which contributor reads it ("" for the row's own) */
export interface PromptControlData extends PromptControl { contributor: string }

declare module "../../api/services.js" {
  interface MidiServices { promptControls: PromptControlContributor }
}

export let promptControlsService: ReturnType<typeof defineService<PromptControlContributor>>;

async function collect(ask: (provider: PromptControlContributor) => ReturnType<PromptControlContributor["controls"]>, list: PromptControlData[]) {
  for (const { id, provider } of serviceEntries<PromptControlContributor>("promptControls")) {
    try {
      for (const control of (await ask(provider)) ?? []) list.push({ ...control, contributor: id });
    } catch (err) { reportServiceProblem("promptControls", id, "its controls failed and are left out", err); }
  }
}

/** The controls every contributor gives an offered entry (each of its actions asked) */
export async function entryControlsFor(query: Omit<EntryControlQuery, "action" | "source">): Promise<PromptControlData[]> {
  const list: PromptControlData[] = [];
  for (const action of query.entry.do) await collect(provider => provider.controls({ ...query, source: "entry", action }), list);
  return list;
}

/** The controls every contributor gives an optional bonus */
export async function bonusControlsFor(query: Omit<BonusControlQuery, "source">): Promise<PromptControlData[]> {
  const list: PromptControlData[] = [];
  await collect(provider => provider.controls({ ...query, source: "bonus" }), list);
  return list;
}

const contributor = (id: string) => id ? serviceEntries<PromptControlContributor>("promptControls").find(e => e.id === id)?.provider : undefined;
const escape = (text: string) => foundry.utils.escapeHTML(text);

/** A standard control's form, showing `value` */
function standardHTML(control: PromptControl, value: unknown): string {
  const name = escape(control.name);
  const chosen = (option: string) => Array.isArray(value) ? value.includes(option) : String(value ?? "") === option;
  const options = () => (control.options ?? []).map(o => `<option value="${escape(o.value)}"${chosen(o.value) ? " selected" : ""}>${escape(o.label)}</option>`).join("");
  switch (control.type) {
    case "number": return `<input type="number" name="${name}" value="${escape(String(value ?? ""))}"${control.min !== undefined ? ` min="${control.min}"` : ""}${control.max !== undefined ? ` max="${control.max}"` : ""} step="1">`;
    case "checkbox": return `<input type="checkbox" name="${name}"${value ? " checked" : ""}>`;
    case "select": return `<select name="${name}">${options()}</select>`;
    case "multi": return `<select name="${name}" multiple>${options()}</select>`;
    default: return `<input type="text" name="${name}" value="${escape(String(value ?? ""))}">`;
  }
}

/** A control in a prompt's row: its label and form, showing `value` (else its default) */
export function promptControlHTML(control: PromptControlData, value: unknown = control.default): string {
  const form = control.html ?? standardHTML(control, value);
  const type = control.html ? "" : ` data-type="${control.type ?? "text"}"`;
  return `<div class="midi-qol-offer-control" data-contributor="${escape(control.contributor)}" data-name="${escape(control.name)}"${type}>`
    + `${control.label ? `<label>${escape(control.label)}</label>` : ""}${form}</div>`;
}

/** A standard control's value from its element */
function readStandard(type: string, element: HTMLElement): PromptControlValue | undefined {
  const field = element.querySelector<HTMLInputElement & HTMLSelectElement>("input, select, textarea");
  if (!field) return undefined;
  if (type === "checkbox") return field.checked;
  if (type === "number") return Number(field.value);
  if (type === "multi") return Array.from(field.selectedOptions).map(o => o.value);
  return field.value;
}

/** One control's value (`element`: its .midi-qol-offer-control) */
export function readPromptControl(element: HTMLElement): unknown {
  const { contributor: id = "", name = "", type } = element.dataset;
  try {
    if (type) return readStandard(type, element);
    const own = contributor(id);
    return own?.read ? own.read(name, element) : readStandard("text", element);
  } catch (err) {
    reportServiceProblem("promptControls", id, `reading ${name} failed`, err);
    return undefined;
  }
}

/** The values of the controls in `element` */
export function readPromptControls(element: HTMLElement): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const control of Array.from(element.querySelectorAll<HTMLElement>(".midi-qol-offer-control[data-name]")))
    values[control.dataset.name!] = readPromptControl(control);
  return values;
}

/** Wire the contributors' own forms in a rendered dialog (each contributor once) */
export function wirePromptControls(root: HTMLElement): void {
  const ids = new Set(Array.from(root.querySelectorAll<HTMLElement>(".midi-qol-offer-control[data-contributor]:not([data-type])")).map(e => e.dataset.contributor!));
  for (const id of ids) {
    try { contributor(id)?.wire?.(root); } catch (err) { reportServiceProblem("promptControls", id, "wiring its controls failed", err); }
  }
}

export function definePromptControlsService() {
  promptControlsService = defineService<PromptControlContributor>("promptControls", {
    kind: "contributors",
    description: "Controls shown in a prompt's row with an offered entry or an optional bonus (the dice of a reroll), read as offer.<name> / @bonus.inputs.<name>"
  });
}
