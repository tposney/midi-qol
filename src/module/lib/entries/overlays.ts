import { MODULE_ID } from "../../../midi-qol.js";
import { automatedBy, registerRule, ruleFromOverlay } from "./rules.js";

/*
 * M11c-2 (plan ~/Documents/midi-next-M11-plan-2026-11-22.md): an overlay's data part, stored (user, 2026-11-22). An
 * overlay's effect or activity that the base item has (by name; an activity by type and name) only adds entries (the
 * rule); one the base lacks is added to the item once, depending on a marker enchantment on the item that records
 * the overlay and its version: visible among the item's enchantments, and deleting it removes what it added (dnd5e's
 * dependents). A new overlay version replaces the added part. The active GM adds it, when the item is created and at
 * ready for the world's actors.
 */

interface OverlaySource { source: string, item: Item.Implementation }

const overlaysByIdentifier = new Map<string, OverlaySource[]>();

/** An overlay item as a rule, and its data part kept for the items it overlays */
export function registerOverlay(item: Item.Implementation, source: string): (() => void) | undefined {
  const rule = ruleFromOverlay(item);
  if (!rule) return undefined;
  const off = registerRule(source, rule);
  const list = overlaysByIdentifier.get(rule.identifier) ?? [];
  const entry = { source, item };
  overlaysByIdentifier.set(rule.identifier, [...list.filter(o => o.item.uuid !== item.uuid), entry]);
  return () => {
    off();
    overlaysByIdentifier.set(rule.identifier, (overlaysByIdentifier.get(rule.identifier) ?? []).filter(o => o !== entry));
  };
}

type OverlayMarker = { overlay: string, version: string };

function versionOf(overlay: Item.Implementation): string {
  return String(overlay.getFlag(MODULE_ID, "overlay")?.version ?? overlay._stats?.modifiedTime ?? "1");
}

function overlayFor(item: Item.Implementation): OverlaySource | undefined {
  const system = item.system as { identifier?: string, source?: { rules?: string } };
  const list = system.identifier ? overlaysByIdentifier.get(system.identifier) : undefined;
  return list?.filter(o => {
    const flag = o.item.getFlag(MODULE_ID, "overlay");
    return (!flag?.rules || flag.rules === system.source?.rules) && (!flag?.type || flag.type === item.type);
  }).at(-1);
}

/** What the overlay has that the item lacks: effects (by name) and activities (by type and name) */
function missingParts(overlay: Item.Implementation, item: Item.Implementation) {
  const itemActivities = [...((item.system as { activities?: Iterable<{ type?: string, name?: string }> }).activities ?? [])];
  const overlayActivities = [...((overlay.system as { activities?: Iterable<{ type?: string, name?: string, toObject(): Record<string, unknown> }> }).activities ?? [])];
  const effects = overlay.effects.contents.filter(e => !item.effects.some(own => own.name === e.name));
  const activities = overlayActivities.filter(a => !itemActivities.some(own => own.type === a.type && own.name === a.name));
  return { effects, activities };
}

/** Add (or replace, for a new version) the data part of the overlay matching the item, if it lacks anything */
export async function applyOverlayData(item: Item.Implementation): Promise<boolean> {
  if (!(item.parent instanceof Actor) || automatedBy(item)) return false;
  const found = overlayFor(item);
  const markers = item.effects.contents.filter(e => !!e.getFlag(MODULE_ID, "overlayPart"));
  if (!found) return false;
  const version = versionOf(found.item);
  const current = markers.find(e => (e.getFlag(MODULE_ID, "overlayPart") as OverlayMarker | undefined)?.overlay === found.item.uuid);
  if (current && (current.getFlag(MODULE_ID, "overlayPart") as OverlayMarker).version === version) return false;
  if (current) await current.delete();
  const { effects, activities } = missingParts(found.item, item);
  if (!effects.length && !activities.length) return false;
  const [marker] = await item.createEmbeddedDocuments("ActiveEffect", [{
    name: found.item.name ?? "midi overlay", img: found.item.img ?? "icons/svg/aura.svg", type: "enchantment", transfer: true,
    flags: { [MODULE_ID]: { overlayPart: { overlay: found.item.uuid, version } } }
  } as unknown as ActiveEffect.CreateData]);
  if (!marker?.uuid) return false;
  const part = { [`flags.${MODULE_ID}.overlayPart`]: true, "flags.dnd5e.dependentOn": marker.uuid };
  if (effects.length) {
    await item.createEmbeddedDocuments("ActiveEffect", effects.map(e => foundry.utils.mergeObject(e.toObject(), foundry.utils.expandObject(part))) as ActiveEffect.CreateData[], { keepId: true });
  }
  if (activities.length) {
    const update: Record<string, unknown> = {};
    for (const activity of activities) update[`system.activities.${(activity as unknown as { id: string }).id}`] = foundry.utils.mergeObject(activity.toObject(), foundry.utils.expandObject(part));
    await item.update(update);
  }
  return true;
}

/** On the active GM: an item created on an actor gets its overlay's data part; at ready, the world's actors' items */
export function watchOverlayData(): void {
  Hooks.on("createItem", item => {
    if (game.user?.isActiveGM && overlaysByIdentifier.size) void applyOverlayData(item as Item.Implementation).catch(err => console.warn("midi-qol | overlay data", err));
  });
}

export async function applyOverlayDataToWorld(): Promise<void> {
  if (!game.user?.isActiveGM || !overlaysByIdentifier.size) return;
  for (const actor of game.actors ?? []) for (const item of actor.items) await applyOverlayData(item).catch(err => console.warn("midi-qol | overlay data", err));
}

/** The world's own overlays (world items flagged midi-qol.overlay), as source "world" */
/** The overlays in a compendium, registered as rules of `source` (midi's sample pack at ready) */
export async function registerOverlayPack(packId: string, source: string): Promise<number> {
  const pack = game.packs?.get(packId);
  if (!pack) return 0;
  const index = await pack.getIndex({ fields: ["flags.midi-qol.overlay"] });
  let count = 0;
  for (const entry of index) {
    if (!foundry.utils.getProperty(entry, "flags.midi-qol.overlay.identifier")) continue;
    const item = await pack.getDocument(entry._id) as Item.Implementation | null;
    if (item && registerOverlay(item, source)) count++;
  }
  return count;
}

export function registerWorldOverlays(): number {
  let count = 0;
  for (const item of game.items ?? []) if (item.getFlag(MODULE_ID, "overlay") && registerOverlay(item, "world")) count++;
  return count;
}
