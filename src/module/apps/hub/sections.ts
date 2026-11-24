import type { TurnModel } from "../../services/turnModel/model.js";

/*
 * M27: midi's hub is made of sections (plan ~/Documents/midi-next-M27-plan-2026-11-24.md). A section renders its HTML
 * from the creature's turn model; its buttons carry `data-hub-action` (its own actions, or the hub's: use, interaction,
 * dash, disengage, endTurn...). midi's own are sections like any other: a module adds one, replaces one (the same id)
 * or a table turns one off (hub settings).
 *
 *   MidiQOL.hub.sections.register({ id: "my-module.notes", area: "right", order: 70,
 *     render: ({ actor }) => `<div>${actor.name}</div>`, actions: { ping: ({ token }) => … } });
 */

export type HubArea = "left" | "center" | "right";

export interface HubContext {
  actor: Actor.Implementation;
  token?: TokenDocument.Implementation;
  model: TurnModel;
  /** The viewer is a GM */
  gm: boolean;
  /** The viewer owns the creature */
  owner: boolean;
  /** The open tab of the things-to-use section */
  tab: string;
  /** The cost filter (action, bonus, reaction...; "" for all) */
  filter: string;
  /** Re-render the hub */
  refresh(): void;
  /** The drawer (a tab or a filter, above the bar) is pinned open */
  pinned: boolean;
  /** After a use from the hub: the drawer closes unless pinned */
  afterUse(): void;
}

export interface HubSection {
  id: string;
  area: HubArea;
  /** Lower first within its area */
  order: number;
  /** Shown only when this holds (default: always) */
  when?(ctx: HubContext): boolean;
  render(ctx: HubContext): string | Promise<string>;
  /** Its own `data-hub-action` handlers */
  actions?: Record<string, (ctx: HubContext, target: HTMLElement, event: Event) => unknown>;
}

const sections = new Map<string, HubSection>();
let changed: (() => void) | undefined;

export function registerHubSection(section: HubSection): () => void {
  sections.set(section.id, section);
  changed?.();
  return () => { if (sections.get(section.id) === section) { sections.delete(section.id); changed?.(); } };
}

export function hubSections(): HubSection[] {
  return [...sections.values()].sort((a, b) => a.order - b.order);
}

export function onSectionsChanged(callback: () => void) { changed = callback; }

export const escape = (value: unknown) => foundry.utils.escapeHTML(String(value ?? ""));
