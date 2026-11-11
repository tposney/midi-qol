import { Activity, Dnd5eChatMessage } from "../../globals.js";
import { cardMidi } from "./cardState.js";

/**
 * What a use changed in its item and activity (a macro's modified copy: a scaled damage die, a changed DC), kept on its
 * card (state `useChanges`, JSON: the card's state is merged when written, so a changing object would keep stale keys)
 * so a workflow rebuilt from the card has them. Stored as the difference from the card's scaled item, with the use's
 * activity in place of the item's, and the activity's id when the use swapped to another one. What the live item owns
 * (uses spent, quantity) is left out: a copy's stale value would replace it.
 */
type UseChanges = { item?: Record<string, unknown>, activityId?: string };

const VOLATILE = ["_stats", "sort", "ownership", "folder", "system.uses.spent", "system.quantity"];

/** The card's activity and item, scaled to the use: dnd5e's lookup (midi's fallback for synthetic items) */
function cardActivity(card: ChatMessage.Implementation): Activity | undefined {
  return (card as Dnd5eChatMessage).getAssociatedActivity?.({ scaled: true });
}

function strip(diff: Record<string, unknown>) {
  for (const path of VOLATILE) foundry.utils.deleteProperty(diff, path);
  const activities = foundry.utils.getProperty(diff, "system.activities") as Record<string, Record<string, unknown>> | undefined;
  for (const changes of Object.values(activities ?? {})) {
    foundry.utils.deleteProperty(changes, "uses.spent");
    if (foundry.utils.isEmpty(changes.uses ?? {})) delete changes.uses;
  }
  for (const [id, changes] of Object.entries(activities ?? {})) if (foundry.utils.isEmpty(changes)) delete activities![id];
  if (activities && foundry.utils.isEmpty(activities)) delete (diff.system as Record<string, unknown>).activities;
  for (const key of Object.keys(diff)) {
    const value = diff[key];
    if (value && typeof value === "object" && !Array.isArray(value) && foundry.utils.isEmpty(value)) delete diff[key];
  }
}

/** The use's changes as stored, or undefined for none */
export function useChangesJson(card: ChatMessage.Implementation, item: Item.Implementation, activity: Activity): string | undefined {
  const base = cardActivity(card);
  if (!base?.item) return undefined;
  const used = item.toObject() as Record<string, any>;
  if (activity?.id) foundry.utils.setProperty(used, `system.activities.${activity.id}`, activity.toObject());
  const diff = foundry.utils.diffObject(base.item.toObject(), used) as Record<string, unknown>;
  strip(diff);
  const changes: UseChanges = {};
  if (!foundry.utils.isEmpty(diff)) changes.item = diff;
  if (activity?.id && activity.id !== base.id) changes.activityId = activity.id;
  return foundry.utils.isEmpty(changes) ? undefined : JSON.stringify(changes);
}

/** The use's item and activity for a workflow rebuilt from its card: the card's scaled item with the stored changes */
export function restoredUse(card: ChatMessage.Implementation): { item?: Item.Implementation, activity?: Activity } {
  const base = cardActivity(card);
  const stored = cardMidi(card).state?.useChanges;
  let changes: UseChanges | undefined;
  try {
    changes = typeof stored === "string" && stored ? JSON.parse(stored) : undefined;
  } catch {
    console.warn(`midi-qol | the use changes stored on ${card.uuid} can't be read`);
  }
  if (!base?.item || !changes) return { item: base?.item, activity: base };
  const data = foundry.utils.mergeObject(base.item.toObject(), changes.item ?? {}, { inplace: false });
  const item = new CONFIG.Item.documentClass(data as Item.CreateData, { parent: base.item.parent });
  // @ts-expect-error no dnd5e-types
  const activity = item.system.activities?.get(changes.activityId ?? base.id) as Activity | undefined;
  return activity ? { item: activity.item, activity } : { item: base.item, activity: base };
}
