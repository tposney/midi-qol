/**
 * Handlers for the buttons on a usage card, by action name, installed on each activity type's
 * `metadata.usage.actions` so dnd5e's `Activity#onChatAction` calls them (with the activity as used, scaled).
 * Kept here rather than on midi's activity subclasses so they apply to any activity class registered for the type.
 *
 * Precedence for one type: dnd5e's own handler < one registered for all types < one registered for the type;
 * a `whenAbsent` handler only fills an action nothing else handles.
 */
import type { Activity } from "../../globals.js";
import { Registry } from "../api/registry.js";
import { activityPolicy } from "./activityPrototype.js";

/** Calls the handler this one took the place of (a lower precedence midi handler, else dnd5e's own); arguments default to this call's. */
export type CardActionNext = (event?: PointerEvent, target?: HTMLElement, message?: ChatMessage.Implementation) => unknown;

/** As dnd5e's card action handlers, with `next` to hand the click on. */
export type CardActionHandler = (this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation, next: CardActionNext) => unknown;
type InstalledHandler = (this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) => unknown;

interface CardActionMeta { action: string, types?: string[], whenAbsent?: boolean }

// One entry per action + types + whenAbsent (registry.ts); a higher priority handler is asked before a lower one
const registered = new Registry<CardActionHandler, CardActionMeta>();
// What installCardActions was given and dnd5e's own actions per type, so a later registration is installed too
let installed: { activityTypes: Record<string, { documentClass?: unknown }>, base: Map<string, Record<string, InstalledHandler>> } | undefined;

/** A handler for a card button's action; `types` limits it to those activity types. Register at init or later. */
export function registerCardAction(action: string, handler: CardActionHandler, options: { types?: string[], whenAbsent?: boolean, priority?: number } = {}) {
  const id = `${action}|${(options.types ?? []).join()}|${options.whenAbsent ? "absent" : ""}`;
  registered.set(id, handler, { priority: options.priority }, { action, types: options.types, whenAbsent: options.whenAbsent });
  if (installed) installCardActions(installed.activityTypes);
}

export function registerCardActions(types: string[] | undefined, handlers: Record<string, CardActionHandler>) {
  for (const [action, handler] of Object.entries(handlers)) registerCardAction(action, handler, { types });
}

/** `handler` as dnd5e calls it, with `previous` (the handler it takes the place of) as its `next`. */
function chain(handler: CardActionHandler, previous: InstalledHandler | undefined): InstalledHandler {
  const chained: InstalledHandler = function (event, target, message) {
    const next: CardActionNext = (e = event, t = target, m = message) => previous?.call(this, e, t, m);
    return handler.call(this, event, target, message, next);
  };
  return Object.assign(chained, { midiHandler: handler });
}

/** The actions an activity type's metadata should carry: dnd5e's (`base`) with midi's applied. */
export function cardActionsFor(type: string, base: Record<string, InstalledHandler> = {}): Record<string, InstalledHandler> {
  const actions = { ...base };
  // Chained lowest first, so the highest priority handler of each group is the one called
  const lowestFirst = registered.entries().reverse();
  for (const { value, meta } of lowestFirst) if (!meta.whenAbsent && !meta.types) actions[meta.action] = chain(value, actions[meta.action]);
  for (const { value, meta } of lowestFirst) if (!meta.whenAbsent && meta.types?.includes(type)) actions[meta.action] = chain(value, actions[meta.action]);
  for (const { value, meta } of registered.entries()) if (meta.whenAbsent && (!meta.types || meta.types.includes(type)) && !(meta.action in actions)) actions[meta.action] = chain(value, undefined);
  return actions;
}

type ActivityClassLike = { metadata?: { usage?: { actions?: Record<string, InstalledHandler> } } };

/** Puts the registered handlers on every activity type's class in CONFIG. Run after the classes are registered. */
export function installCardActions(activityTypes: Record<string, { documentClass?: unknown }>) {
  installed ??= { activityTypes, base: new Map() };
  installed.activityTypes = activityTypes;
  const base = installed.base;
  for (const [type, config] of Object.entries(activityTypes)) {
    // Only types midi automates (dnd5e's order, another module's type unless it registers a policy)
    if (!activityPolicy(type).automated) continue;
    const cls = config?.documentClass as ActivityClassLike | undefined;
    const metadata = cls?.metadata;
    if (!cls || !metadata) continue;
    // dnd5e's own actions, as they were before midi's first install
    if (!base.has(type)) base.set(type, { ...(metadata.usage?.actions ?? {}) });
    const actions = cardActionsFor(type, base.get(type));
    Object.defineProperty(cls, "metadata", {
      value: foundry.utils.mergeObject(metadata, { usage: { actions } }, { inplace: false, performDeletions: false }),
      configurable: true, writable: true
    });
  }
}
