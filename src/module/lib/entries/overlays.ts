import { MODULE_ID } from "../../../midi-qol.js";
import { automatedBy, registerRule, ruleFor, ruleFromOverlay } from "./rules.js";

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
  const unregister = () => {
    off();
    const rest = (overlaysByIdentifier.get(rule.identifier) ?? []).filter(o => o !== entry);
    if (rest.length) overlaysByIdentifier.set(rule.identifier, rest);
    else overlaysByIdentifier.delete(rule.identifier);
    if (item.uuid && registeredByUuid.get(item.uuid) === unregister) registeredByUuid.delete(item.uuid);
  };
  if (item.uuid) {
    registeredByUuid.get(item.uuid)?.();
    registeredByUuid.set(item.uuid, unregister);
  }
  return unregister;
}

/** Each registered overlay item's unregister: a deleted world overlay stops applying */
const registeredByUuid = new Map<string, () => void>();

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
  Hooks.on("deleteItem", item => { const uuid = (item as Item.Implementation).uuid; if (uuid) registeredByUuid.get(uuid)?.(); });
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

/* Authoring (11c-2): save an edited copy of a base item as an overlay */

const isOverlayPart = (flags: unknown) => !!(flags as Record<string, { overlayPart?: unknown } | undefined> | undefined)?.[MODULE_ID]?.overlayPart;
const sameEntries = (a: unknown, b: unknown) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/**
 * The difference between an item and its base (its compendium source) as a world overlay item: the item's entries if
 * changed; an effect or activity the base has, as a stub with its entries if they changed; one the base lacks, whole
 * (the data part). Saving again for the same identifier updates that overlay and its version. Registered at once.
 */
export async function saveAsOverlay(item: Item.Implementation): Promise<Item.Implementation | undefined> {
  const sourceUuid = item._stats?.compendiumSource;
  const base = sourceUuid ? await fromUuid(sourceUuid) as Item.Implementation | null : null;
  if (!base) {
    ui.notifications?.warn(game.i18n?.localize("midi-qol.Overlay.NoBase") ?? "No base item (compendium source) to compare with");
    return undefined;
  }
  const system = item.system as { identifier?: string, source?: { rules?: string } };
  const identifier = system.identifier || (base.system as { identifier?: string }).identifier;
  if (!identifier) {
    ui.notifications?.warn(game.i18n?.localize("midi-qol.Overlay.NoIdentifier") ?? "The item has no identifier");
    return undefined;
  }
  type ActivityLike = { id: string, type?: string, name?: string, midiEntries?: unknown[], flags?: unknown, toObject(): Record<string, unknown> };
  const activitiesOf = (doc: Item.Implementation) => [...((doc.system as { activities?: Iterable<ActivityLike> }).activities ?? [])];
  const baseActivities = activitiesOf(base);
  const activities: Record<string, unknown> = {};
  for (const activity of activitiesOf(item)) {
    if (isOverlayPart(activity.flags)) continue;
    const match = baseActivities.find(a => a.type === activity.type && a.name === activity.name);
    if (!match) activities[activity.id] = activity.toObject();
    else if (activity.midiEntries?.length && !sameEntries(activity.midiEntries, match.midiEntries))
      activities[activity.id] = { _id: activity.id, type: activity.type, name: activity.name, midiEntries: activity.midiEntries };
  }
  const effects: ActiveEffect.CreateData[] = [];
  for (const effect of item.effects) {
    // What an overlay added, and its marker, are the overlay's already
    if (isOverlayPart(effect.flags)) continue;
    const match = base.effects.find(e => e.name === effect.name);
    const entries = effect.getFlag(MODULE_ID, "entries");
    if (!match) effects.push(effect.toObject());
    else if (entries?.length && !sameEntries(entries, match.getFlag(MODULE_ID, "entries")))
      effects.push({ _id: effect.id, name: effect.name, img: effect.img, flags: { [MODULE_ID]: { entries } } });
  }
  const itemEntries = item.getFlag(MODULE_ID, "entries");
  const ownEntries = itemEntries?.length && !sameEntries(itemEntries, base.getFlag(MODULE_ID, "entries")) ? itemEntries : undefined;
  if (!ownEntries && !effects.length && !Object.keys(activities).length) {
    ui.notifications?.info(game.i18n?.localize("midi-qol.Overlay.NoDifference") ?? "No difference from the base item");
    return undefined;
  }
  const rules = system.source?.rules === "2014" || system.source?.rules === "2024" ? system.source.rules : undefined;
  const existing = game.items?.find(i => i.getFlag(MODULE_ID, "overlay")?.identifier === identifier && i.getFlag(MODULE_ID, "overlay")?.rules === rules);
  const version = String(Number(existing?.getFlag(MODULE_ID, "overlay")?.version ?? 0) + 1);
  // Saved again: the same id (so the same uuid and registration), a new version
  if (existing) await existing.delete();
  const created = await Item.createDocuments([{
    ...(existing?.id ? { _id: existing.id } : {}),
    name: `${item.name} (overlay)`, type: item.type, img: item.img,
    system: { identifier: `${identifier}-overlay`, source: { rules }, activities, description: { value: "" } },
    effects,
    flags: { [MODULE_ID]: { overlay: { identifier, ...(rules ? { rules } : {}), version, base: { uuid: base.uuid ?? String(sourceUuid), modifiedTime: base._stats?.modifiedTime ?? undefined } },
      ...(ownEntries ? { entries: ownEntries } : {}) } }
  }], { keepId: true });
  const overlay = created[0] as Item.Implementation | undefined;
  if (overlay) registerOverlay(overlay, "world");
  return overlay;
}

export function watchOverlayAuthoring(): void {
  Hooks.on("getHeaderControlsItemSheet5e", (app: foundry.applications.api.DocumentSheetV2<Item>, controls: foundry.applications.api.ApplicationV2.HeaderControlsEntry[]) => {
    const item = app.document as Item.Implementation;
    if (!game.user?.isGM || !item._stats?.compendiumSource || item.getFlag(MODULE_ID, "overlay")) return;
    controls.push({
      label: "midi-qol.Overlay.Save",
      icon: "fa-solid fa-layer-group",
      // @ts-expect-error v13-ism
      onClick: () => saveAsOverlay(item)
    });
  });
}

/* The TroubleShooter's automation sources (11c) */

export interface AutomationRow { item: string, identifier?: string, status: string, detail?: string }
export interface OverlayRow { name: string, source: string, identifier: string, rules?: string, version: string, baseChanged?: boolean, base?: string }

const AUTOMATED_BY: Record<string, string> = { "chris-premades": "CPR", cat: "CAT", macro: "a macro", entries: "its own entries" };

/** For each of the actor's items with an identifier something matches: what automates it, or why an overlay doesn't */
export function actorAutomation(actor: Actor.Implementation): AutomationRow[] {
  const rows: AutomationRow[] = [];
  for (const item of actor.items) {
    const identifier = (item.system as { identifier?: string }).identifier;
    const overlay = overlayFor(item);
    const other = automatedBy(item);
    const rule = ruleFor(item);
    const marker = item.effects.find(e => typeof e.getFlag(MODULE_ID, "overlayPart") === "object");
    const markerFlag = marker?.getFlag(MODULE_ID, "overlayPart") as OverlayMarker | undefined;
    const dataPart = markerFlag ? `data part v${markerFlag.version}${overlay && versionOf(overlay.item) !== markerFlag.version ? ` (overlay now v${versionOf(overlay.item)}: replaced at the next change)` : ""}` : undefined;
    if (rule) rows.push({ item: item.name ?? "", identifier, status: `rule: ${rule.source}`, detail: dataPart });
    else if (other && (overlay || overlaysByIdentifier.has(identifier ?? ""))) rows.push({ item: item.name ?? "", identifier, status: AUTOMATED_BY[other] ?? other, detail: "an overlay matches its identifier but doesn't apply: something else automates it" });
    else if (other) rows.push({ item: item.name ?? "", identifier, status: AUTOMATED_BY[other] ?? other });
    else if (identifier && overlaysByIdentifier.has(identifier)) rows.push({ item: item.name ?? "", identifier, status: "no overlay applies", detail: "an overlay has its identifier, for another ruleset or type" });
  }
  return rows;
}

/** The registered overlays, each with whether its base changed since it was saved */
export async function overlayRows(): Promise<OverlayRow[]> {
  const rows: OverlayRow[] = [];
  for (const list of overlaysByIdentifier.values()) {
    for (const { source, item } of list) {
      const flag = item.getFlag(MODULE_ID, "overlay");
      if (!flag) continue;
      let baseChanged: boolean | undefined;
      if (flag.base?.uuid) {
        const base = await fromUuid(flag.base.uuid).catch(() => null) as Item.Implementation | null;
        baseChanged = !base || (!!flag.base.modifiedTime && (base._stats?.modifiedTime ?? 0) > flag.base.modifiedTime);
      }
      rows.push({ name: item.name ?? "", source, identifier: flag.identifier, rules: flag.rules, version: versionOf(item), ...(baseChanged !== undefined ? { baseChanged } : {}), ...(flag.base?.uuid ? { base: flag.base.uuid } : {}) });
    }
  }
  return rows;
}

/** For the TroubleShooter: the world's actors and the viewed scene's unlinked tokens, those with anything to show */
export async function automationReport(): Promise<{ actors: { name: string, rows: AutomationRow[] }[], overlays: OverlayRow[] }> {
  const actors: { name: string, rows: AutomationRow[] }[] = [];
  const seen = new Set<Actor.Implementation>();
  const add = (actor: Actor.Implementation | null | undefined, name?: string) => {
    if (!actor || seen.has(actor)) return;
    seen.add(actor);
    const rows = actorAutomation(actor);
    if (rows.length) actors.push({ name: name ?? actor.name ?? "", rows });
  };
  for (const actor of game.actors ?? []) add(actor);
  for (const token of canvas?.scene?.tokens ?? []) if (!token.actorLink) add(token.actor, `${token.name} (token)`);
  return { actors, overlays: await overlayRows() };
}

