import { defineService, entries as serviceEntries, reportServiceProblem } from "../../api/services.js";
import type { EntryAction, FoundEntry } from "../../lib/entries/types.js";
import type { EventContext } from "../../lib/entries/engine.js";

/*
 * offerControls (contributors): controls an offered entry's row shows once it is ticked, in the same dialog, their
 * values given to the entry's actions as `offer.<name>` (in its conditions and actions' data: run.conditionData.offer).
 * midi's own: the dice of a "choose" reroll (Empowered Spell: tick it and pick its dice in one dialog). A module adds
 * controls for its own actions or entries:
 *
 *   MidiQOL.services.register("offerControls", "my-module", {
 *     controls: ({ action }) => action.myAction ? [{ name: "mode", html: `<select name="mode">…</select>` }] : [],
 *     read: (name, element) => element.querySelector("select")?.value,
 *   });
 *
 * `controls` runs on the client running the event and returns plain data (the dialog may be on the player's client);
 * `read` and `wire` run where the dialog is, so a contributor registers on every client.
 */

export interface OfferControl {
  /** The value's name: `offer.<name>` */
  name: string;
  /** Shown above it */
  label?: string;
  /** Its form (plain HTML; no listeners: `wire` adds them) */
  html: string;
}

export interface OfferControlQuery {
  eventId: string;
  entry: FoundEntry["entry"];
  found: FoundEntry;
  /** One of the entry's actions (each is asked) */
  action: EntryAction;
  context: EventContext;
  conditionData: Record<string, unknown>;
}

export interface OfferControlContributor {
  controls(query: OfferControlQuery): OfferControl[] | undefined | Promise<OfferControl[] | undefined>;
  /** The control's value from its element (where the dialog is); default: the first input's value */
  read?(name: string, element: HTMLElement): unknown;
  /** Its listeners, when the dialog renders (a picker kept to its max) */
  wire?(element: HTMLElement): void;
}

/** A control as the dialog gets it: which contributor reads it */
export interface OfferControlData extends OfferControl { contributor: string }

declare module "../../api/services.js" {
  interface MidiServices { offerControls: OfferControlContributor }
}

export let offerControlsService: ReturnType<typeof defineService<OfferControlContributor>>;

/** The controls every contributor gives an offered entry (each of its actions asked) */
export async function offerControlsFor(query: Omit<OfferControlQuery, "action">): Promise<OfferControlData[]> {
  const list: OfferControlData[] = [];
  for (const action of query.entry.do) {
    for (const { id, provider } of serviceEntries<OfferControlContributor>("offerControls")) {
      try {
        for (const control of (await provider.controls({ ...query, action })) ?? []) list.push({ ...control, contributor: id });
      } catch (err) { reportServiceProblem("offerControls", id, "its controls failed and are left out", err); }
    }
  }
  return list;
}

const contributor = (id: string) => serviceEntries<OfferControlContributor>("offerControls").find(e => e.id === id)?.provider;

/** Wire the controls in a rendered dialog (each contributor once) */
export function wireOfferControls(root: HTMLElement): void {
  const ids = new Set(Array.from(root.querySelectorAll<HTMLElement>(".midi-qol-offer-control[data-contributor]")).map(e => e.dataset.contributor!));
  for (const id of ids) {
    try { contributor(id)?.wire?.(root); } catch (err) { reportServiceProblem("offerControls", id, "wiring its controls failed", err); }
  }
}

/** The values of a ticked option's controls (`element` its controls' container) */
export function readOfferControls(element: HTMLElement): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const control of Array.from(element.querySelectorAll<HTMLElement>(".midi-qol-offer-control[data-contributor][data-name]"))) {
    const { contributor: id, name } = control.dataset as { contributor: string, name: string };
    try {
      const own = contributor(id);
      values[name] = own?.read ? own.read(name, control) : control.querySelector<HTMLInputElement>("input, select, textarea")?.value;
    } catch (err) { reportServiceProblem("offerControls", id, `reading ${name} failed`, err); }
  }
  return values;
}

export function defineOfferControlsService() {
  offerControlsService = defineService<OfferControlContributor>("offerControls", {
    kind: "contributors",
    description: "Controls an offered entry's row shows once ticked (the dice of a reroll), read as offer.<name> by its actions"
  });
}
