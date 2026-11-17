/**
 * Handlers for the buttons on a usage card, by action name, installed on each activity type's
 * `metadata.usage.actions` so dnd5e's `Activity#onChatAction` calls them (with the activity as used, scaled).
 * Kept here rather than on midi's activity subclasses so they apply to any activity class registered for the type.
 *
 * Precedence for one type: dnd5e's own handler < one registered for all types < one registered for the type;
 * a `whenAbsent` handler only fills an action nothing else handles.
 */
import type { Activity } from "../../globals.js";

export type CardActionHandler = (this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) => unknown;

interface CardActionEntry { action: string, handler: CardActionHandler, types?: string[], whenAbsent?: boolean }

const entries: CardActionEntry[] = [];

/** A handler for a card button's action; `types` limits it to those activity types. */
export function registerCardAction(action: string, handler: CardActionHandler, options: { types?: string[], whenAbsent?: boolean } = {}) {
  const existing = entries.findIndex(e => e.action === action && sameTypes(e.types, options.types) && !!e.whenAbsent === !!options.whenAbsent);
  const entry = { action, handler, types: options.types, whenAbsent: options.whenAbsent };
  if (existing >= 0) entries[existing] = entry;
  else entries.push(entry);
}

export function registerCardActions(types: string[] | undefined, handlers: Record<string, CardActionHandler>) {
  for (const [action, handler] of Object.entries(handlers)) registerCardAction(action, handler, { types });
}

function sameTypes(a?: string[], b?: string[]) {
  return (a ?? []).join() === (b ?? []).join();
}

/** The actions an activity type's metadata should carry: dnd5e's (`base`) with midi's applied. */
export function cardActionsFor(type: string, base: Record<string, CardActionHandler> = {}): Record<string, CardActionHandler> {
  const actions = { ...base };
  for (const e of entries) if (!e.whenAbsent && !e.types) actions[e.action] = e.handler;
  for (const e of entries) if (!e.whenAbsent && e.types?.includes(type)) actions[e.action] = e.handler;
  for (const e of entries) if (e.whenAbsent && (!e.types || e.types.includes(type)) && !(e.action in actions)) actions[e.action] = e.handler;
  return actions;
}

type ActivityClassLike = { metadata?: { usage?: { actions?: Record<string, CardActionHandler> } } };

/** Puts the registered handlers on every activity type's class in CONFIG. Run after the classes are registered. */
export function installCardActions(activityTypes: Record<string, { documentClass?: unknown }>) {
  for (const [type, config] of Object.entries(activityTypes)) {
    const cls = config?.documentClass as ActivityClassLike | undefined;
    const metadata = cls?.metadata;
    if (!cls || !metadata) continue;
    const actions = cardActionsFor(type, metadata.usage?.actions);
    Object.defineProperty(cls, "metadata", {
      value: foundry.utils.mergeObject(metadata, { usage: { actions } }, { inplace: false, performDeletions: false }),
      configurable: true, writable: true
    });
  }
}
