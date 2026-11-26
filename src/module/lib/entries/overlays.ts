import { MODULE_ID } from "../../../midi-qol.js";
import { automatedBy, registerRule, ruleFor, ruleFromOverlay, type OverlayChange } from "./rules.js";
import { invalidateEntryHomes } from "./engine.js";

/*
 * M11c-2 (plan ~/Documents/midi-next-M11-plan-2026-11-22.md): an overlay's data part, stored (user, 2026-11-22). An
 * overlay's effect or activity that the base item has (by name; an activity by type and name) only adds entries (the
 * rule); one the base lacks is added to the item once, depending on a marker enchantment on the item that records
 * the overlay and its version: visible among the item's enchantments, and deleting it removes what it added (dnd5e's
 * dependents). A new overlay version replaces the added part. The active GM adds it, when the item is created, when a
 * world overlay is made or changed, and at ready for the world's actors.
 *
 * Changed fields (2026-11-25): the overlay's `changes` (fields of the item or of an activity the base has) are the
 * marker's own changes. The marker is an applied enchantment (transfer, on the item), so dnd5e applies them as it
 * prepares the item; nothing of the item's own data is written, and disabling or deleting the marker undoes them.
 *
 * On or off: the world setting Overlay items, which an item's overlayMode (Default / Enable / Disable, on its sheet)
 * overrides. An item overlays don't apply to has no overlay rule, and its marker is disabled (dnd5e suppresses what the
 * marker added); turned back on, the marker is enabled again.
 */

export type OverlayMode = "default" | "enable" | "disable";

export function overlayModeOf(item: Item.Implementation): OverlayMode {
  const mode = item.getFlag(MODULE_ID, "overlayMode");
  return mode === "enable" || mode === "disable" ? mode : "default";
}

/** The world setting (on unless turned off) */
export function overlaysOn(): boolean {
  try { return game.settings?.get(MODULE_ID, "OverlayItems") !== false; }
  catch { return true; }
}

/** Whether overlays apply to the item: its own mode, else the world setting */
export function overlaysApply(item: Item.Implementation): boolean {
  const mode = overlayModeOf(item);
  return mode === "enable" || (mode === "default" && overlaysOn());
}

interface OverlaySource { source: string, item: Item.Implementation }

const overlaysByIdentifier = new Map<string, OverlaySource[]>();

/** The rules registered for an identifier's overlays, in the overlays' order */
const ruleOffs = new Map<string, (() => void)[]>();

/**
 * An identifier's overlays as rules, registered again in their order whenever the list changes: a source's later
 * overlay of the same scope stands in for its earlier one (the registry keeps one rule per source and scope), and the
 * earlier one is back when the later goes.
 */
function syncRules(identifier: string) {
  for (const off of ruleOffs.get(identifier) ?? []) off();
  const offs: (() => void)[] = [];
  for (const { source, item } of overlaysByIdentifier.get(identifier) ?? []) {
    const rule = ruleFromOverlay(item);
    if (rule) offs.push(registerRule(source, rule, { appliesTo: overlaysApply }));
  }
  if (offs.length) ruleOffs.set(identifier, offs);
  else ruleOffs.delete(identifier);
}

/**
 * Which overlay stands when several have an item's identifier: the world's own overlay items, then compendiums the GM
 * marked as overlays (`world:<pack>`), then modules', then midi's; the same rank in the order registered
 */
function overlayRank(source: string): number {
  if (source === "world") return 4;
  if (source.startsWith("world:")) return 3;
  return source === MODULE_ID ? 1 : 2;
}

/** An overlay item as a rule, and its data part kept for the items it overlays */
export function registerOverlay(item: Item.Implementation, source: string): (() => void) | undefined {
  const rule = ruleFromOverlay(item);
  if (!rule) return undefined;
  const list = overlaysByIdentifier.get(rule.identifier) ?? [];
  const entry = { source, item };
  // Kept in rank order (stable): the last is the one that stands (overlayFor, and the rules registry's last)
  overlaysByIdentifier.set(rule.identifier, [...list.filter(o => o.item.uuid !== item.uuid), entry].sort((a, b) => overlayRank(a.source) - overlayRank(b.source)));
  syncRules(rule.identifier);
  const unregister = () => {
    const rest = (overlaysByIdentifier.get(rule.identifier) ?? []).filter(o => o !== entry);
    if (rest.length) overlaysByIdentifier.set(rule.identifier, rest);
    else overlaysByIdentifier.delete(rule.identifier);
    syncRules(rule.identifier);
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

/** The overlay item that matches the item (whether or not overlays apply to it) */
export function overlayItemFor(item: Item.Implementation): Item.Implementation | undefined {
  return overlayFor(item)?.item;
}

function overlayFor(item: Item.Implementation): OverlaySource | undefined {
  const system = item.system as { identifier?: string, source?: { rules?: string } };
  const list = system.identifier ? overlaysByIdentifier.get(system.identifier) : undefined;
  return list?.filter(o => {
    const flag = o.item.getFlag(MODULE_ID, "overlay");
    return (!flag?.rules || flag.rules === system.source?.rules) && (!flag?.type || flag.type === item.type);
  }).at(-1);
}

/** Whether an overlay may act on the item: overlays on for it, and nothing else automating it */
function overlayStands(item: Item.Implementation): boolean {
  return overlaysApply(item) && !automatedBy(item);
}

/** An item update that may give or take the item's other automation (CPR's, CAT's, a macro, its own entries) */
function touchesAutomation(change: unknown): boolean {
  const flags = (change as { flags?: Record<string, Record<string, unknown> | null | undefined> } | undefined)?.flags ?? {};
  if (Object.keys(flags).some(key => ["chris-premades", "cat", "dae"].includes(key.replace(/^-=/, "")))) return true;
  return Object.keys(flags[MODULE_ID] ?? {}).some(key => ["entries", "onUseMacroName"].includes(key.replace(/^-=/, "")));
}

/** What the overlay has that the item lacks: effects (by name) and activities (by type and name) */
function missingParts(overlay: Item.Implementation, item: Item.Implementation) {
  const itemActivities = [...((item.system as { activities?: Iterable<{ type?: string, name?: string }> }).activities ?? [])];
  const overlayActivities = [...((overlay.system as { activities?: Iterable<{ type?: string, name?: string, toObject(): Record<string, unknown> }> }).activities ?? [])];
  // An effect flagged overlayRole only says what the base's effect of its name does: never added (Swallow's, named per creature)
  const effects = overlay.effects.contents.filter(e => !e.getFlag(MODULE_ID, "overlayRole") && !item.effects.some(own => own.name === e.name));
  const activities = overlayActivities.filter(a => !itemActivities.some(own => own.type === a.type && own.name === a.name));
  return { effects, activities };
}

/** Add (or replace, for a new version) the data part of the overlay matching the item, if it lacks anything */
export async function applyOverlayData(item: Item.Implementation): Promise<boolean> {
  if (!(item.parent instanceof Actor)) return false;
  const markers = item.effects.contents.filter(e => typeof e.getFlag(MODULE_ID, "overlayPart") === "object");
  // Overlays off for the item, or it has since got other automation: its marker disabled (what it added is
  // suppressed), enabled again when the overlay is back
  const allowed = overlayStands(item);
  const toggle = markers.filter(e => e.disabled === allowed).map(e => ({ _id: e.id!, disabled: !allowed }));
  if (toggle.length) await item.updateEmbeddedDocuments("ActiveEffect", toggle);
  if (!allowed) return false;
  const found = overlayFor(item);
  if (!found) return false;
  const version = versionOf(found.item);
  const isFound = (e: ActiveEffect.Implementation) => (e.getFlag(MODULE_ID, "overlayPart") as OverlayMarker | undefined)?.overlay === found.item.uuid;
  // Another overlay's marker (an overlay since replaced or moved, e.g. from the sample pack to the overlays pack): gone, with what it added
  const stale = markers.filter(e => !isFound(e)).map(e => e.id!);
  if (stale.length) {
    await item.deleteEmbeddedDocuments("ActiveEffect", stale);
    for (let i = 0; i < 40 && item.effects.some(e => (e.getFlag(MODULE_ID, "overlayPart") as unknown) === true && stale.includes(String(e.getFlag("dnd5e", "dependentOn")))); i++)
      await new Promise(resolve => setTimeout(resolve, 50));
  }
  const current = markers.find(isFound);
  if (current && (current.getFlag(MODULE_ID, "overlayPart") as OverlayMarker).version === version) return false;
  if (current) {
    // dnd5e deletes the marker's dependents after the delete resolves: what the old version added must be gone before
    // the new version's parts are worked out (they would be found present, then go)
    type Part = { flags?: unknown };
    const partsLeft = () => item.effects.some(e => (e.getFlag(MODULE_ID, "overlayPart") as unknown) === true)
      || [...((item.system as { activities?: Iterable<Part> }).activities ?? [])].some(a => isOverlayPart(a.flags) && (a.flags as Record<string, { overlayPart?: unknown }>)[MODULE_ID]?.overlayPart === true);
    await current.delete();
    for (let i = 0; i < 40 && partsLeft(); i++) await new Promise(resolve => setTimeout(resolve, 50));
    if (partsLeft()) {
      const ids = item.effects.filter(e => (e.getFlag(MODULE_ID, "overlayPart") as unknown) === true).map(e => e.id!);
      if (ids.length) await item.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
  }
  const { effects, activities } = missingParts(found.item, item);
  const changes = (found.item.getFlag(MODULE_ID, "overlay")?.changes ?? []).filter(c => typeof c?.key === "string");
  if (!effects.length && !activities.length && !changes.length) return false;
  const [marker] = await item.createEmbeddedDocuments("ActiveEffect", [{
    name: found.item.name ?? "midi overlay", img: found.item.img ?? "icons/svg/aura.svg", type: "enchantment", transfer: true,
    system: { changes: changes.map(c => ({ key: c.key, value: String(c.value), type: c.type ?? "override", priority: 50 })) },
    flags: { [MODULE_ID]: { overlayPart: { overlay: found.item.uuid, version } } }
  } as unknown as ActiveEffect.CreateData]);
  if (!marker?.id) return false;
  // By id, as dnd5e's riders name their enchantment: dnd5e's dependentOrigin looks it up among the item's effects, so
  // a disabled marker suppresses what it added; deleting it deletes them (the dependents registry resolves the id)
  const part = { [`flags.${MODULE_ID}.overlayPart`]: true, "flags.dnd5e.dependentOn": marker.id };
  if (effects.length) {
    await item.createEmbeddedDocuments("ActiveEffect", effects.map(e => foundry.utils.mergeObject(e.toObject(), foundry.utils.expandObject(part))) as ActiveEffect.CreateData[], { keepId: true });
  }
  if (activities.length) {
    const update: Record<string, unknown> = {};
    // Without its entries: the overlay's rule gives them to the activity (by type and name), or they would run twice
    for (const activity of activities) {
      const data = foundry.utils.mergeObject(activity.toObject(), foundry.utils.expandObject(part));
      delete (data as { midiEntries?: unknown }).midiEntries;
      update[`system.activities.${(activity as unknown as { id: string }).id}`] = data;
    }
    await item.update(update);
  }
  return true;
}

/** On the active GM: an item created on an actor gets its overlay's data part; at ready, the world's actors' items */
export function watchOverlayData(): void {
  Hooks.on("deleteItem", item => { const uuid = (item as Item.Implementation).uuid; if (uuid) registeredByUuid.get(uuid)?.(); });
  Hooks.on("createItem", item => {
    if (worldOverlayChanged(item as Item.Implementation)) return;
    if (game.user?.isActiveGM && overlaysByIdentifier.size) void applyOverlayData(item as Item.Implementation).catch(err => console.warn("midi-qol | overlay data", err));
  });
  Hooks.on("updateItem", (item, change) => {
    if (worldOverlayChanged(item as Item.Implementation)) return;
    // The item's overlay mode changed: its rule comes or goes, its marker is enabled or disabled
    if (foundry.utils.hasProperty(change, `flags.${MODULE_ID}.overlayMode`) || foundry.utils.hasProperty(change, `flags.${MODULE_ID}.-=overlayMode`)) {
      invalidateEntryHomes();
      if (game.user?.isActiveGM) void applyOverlayData(item as Item.Implementation).catch(err => console.warn("midi-qol | overlay data", err));
    } else if (touchesAutomation(change) && game.user?.isActiveGM && overlaysByIdentifier.size) {
      // Other automation came or went (CPR's medkit, a macro added): the overlay stands down, or is back
      void applyOverlayData(item as Item.Implementation).catch(err => console.warn("midi-qol | overlay data", err));
    }
  });
}

/** The world setting changed: rules looked up again; the active GM enables or disables the world's markers */
export async function overlaySettingChanged(): Promise<void> {
  invalidateEntryHomes();
  if (game.user?.isActiveGM) await applyOverlayDataToWorld().catch(err => console.warn("midi-qol | overlay data", err));
}

/**
 * A world item that is an untouched import of an overlay already registered (a sample dragged into the Items
 * directory) is a copy of that overlay, not another one: the overlay it came from stays in charge and stays current
 * when midi's samples change. Once it is edited it is the world's own overlay.
 */
function untouchedImport(item: Item.Implementation): boolean {
  const stats = item._stats as { compendiumSource?: string | null, createdTime?: number | null, modifiedTime?: number | null } | undefined;
  // An import is stamped modified a few milliseconds after it is created
  return !!stats?.compendiumSource && registeredByUuid.has(currentSource(stats.compendiumSource)) && Math.abs((stats.modifiedTime ?? 0) - (stats.createdTime ?? 0)) < 1000;
}

/** midi's overlays were in its sample items until they got their own pack (same ids): an import's old source, as it is now */
const OLD_OVERLAY_PACK = "Compendium.midi-qol.midiqol-sample-items.Item.";
const currentSource = (uuid: string) => uuid.startsWith(OLD_OVERLAY_PACK) ? `Compendium.midi-qol.midiqol-overlays.Item.${uuid.slice(OLD_OVERLAY_PACK.length)}` : uuid;

/** A world overlay made or changed: registered as it now is (every client), its data part brought to the world's items (the active GM) */
function worldOverlayChanged(item: Item.Implementation): boolean {
  if (item.parent || item.pack || !item.getFlag(MODULE_ID, "overlay")) return false;
  if (untouchedImport(item)) return true;
  registerOverlay(item, "world");
  applyToWorldSoon();
  return true;
}
/** Once the edits settle (a sheet saves field by field) */
const applyToWorldSoon = foundry.utils.debounce(() => { void applyOverlayDataToWorld().catch(err => console.warn("midi-qol | overlay data", err)); }, 500);

export async function applyOverlayDataToWorld(): Promise<void> {
  if (!game.user?.isActiveGM) return;
  for (const actor of game.actors ?? []) for (const item of actor.items) await applyOverlayData(item).catch(err => console.warn("midi-qol | overlay data", err));
}

/**
 * The overlays in a compendium, registered as rules of `source` (a module's id; midi's own pack at ready), and their
 * data parts brought to the world's items (the active GM, once registrations settle)
 */
export async function registerOverlayPack(packId: string, source: string): Promise<number> {
  const pack = game.packs?.get(packId);
  if (!pack || pack.documentName !== "Item") return 0;
  const index = await pack.getIndex({ fields: ["flags.midi-qol.overlay"] });
  let count = 0;
  for (const entry of index) {
    if (!foundry.utils.getProperty(entry, "flags.midi-qol.overlay.identifier")) continue;
    const item = await pack.getDocument(entry._id) as Item.Implementation | null;
    if (item && registerOverlay(item, source)) count++;
  }
  if (count) applyToWorldSoon();
  return count;
}

/** A compendium's overlays no longer registered (the GM unmarked it) */
export function unregisterOverlayPack(packId: string): number {
  const prefix = `Compendium.${packId}.`;
  const offs = [...registeredByUuid.entries()].filter(([uuid]) => uuid.startsWith(prefix)).map(([, off]) => off);
  for (const off of offs) off();
  return offs.length;
}

/* Overlay compendiums: a module's, marked in its manifest (the pack's `flags.midi-qol.overlays: true`, midi's own
   included), and those the GM marks (the compendium's right-click menu: world setting OverlayPacks) */

export const OVERLAY_PACKS_SETTING = "OverlayPacks";
/** The compendiums registered because the GM marked them (the setting changes only these, never a module's) */
const gmPacks = new Set<string>();

const markedPacks = (): string[] => {
  try {
    const value = game.settings?.get(MODULE_ID, OVERLAY_PACKS_SETTING as never) as unknown;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
};
const manifestMarked = (pack: CompendiumCollection.Any) => (pack.metadata as { flags?: Record<string, { overlays?: unknown }> }).flags?.[MODULE_ID]?.overlays === true;
/** Who an overlay compendium's overlays are from: its module (by manifest), else the GM's (`world:<pack>`) */
const packSource = (pack: CompendiumCollection.Any) => manifestMarked(pack) ? String((pack.metadata as { packageName?: string }).packageName ?? MODULE_ID) : `world:${pack.collection}`;

/** Every overlay compendium registered: those marked in a manifest, then the GM's */
export async function registerOverlayPacks(): Promise<number> {
  let count = 0;
  const marked = new Set(markedPacks());
  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Item" || !(manifestMarked(pack) || marked.has(pack.collection))) continue;
    if (!manifestMarked(pack)) gmPacks.add(pack.collection);
    count += await registerOverlayPack(pack.collection, packSource(pack)).catch(err => { console.warn(`midi-qol | overlays in ${pack.collection}`, err); return 0; });
  }
  return count;
}

export function registerOverlayPackSetting(): void {
  game.settings?.register(MODULE_ID, OVERLAY_PACKS_SETTING as never, {
    scope: "world", config: false, type: Array, default: [],
    // Every client: the compendiums marked or unmarked since, registered or not
    onChange: (value: unknown) => {
      const now = new Set(Array.isArray(value) ? value as string[] : []);
      for (const pack of game.packs ?? []) {
        if (pack.documentName !== "Item" || manifestMarked(pack)) continue;
        if (now.has(pack.collection) && !gmPacks.has(pack.collection)) {
          gmPacks.add(pack.collection);
          void registerOverlayPack(pack.collection, packSource(pack));
        } else if (!now.has(pack.collection) && gmPacks.has(pack.collection)) {
          gmPacks.delete(pack.collection);
          unregisterOverlayPack(pack.collection);
        }
      }
    }
  } as never);
}

/** The GM marks an Item compendium as holding overlays, or not (a manifest's mark can't be changed) */
export function watchOverlayPackMenu(): void {
  Hooks.on("getCompendiumContextOptions" as never, ((_app: unknown, options: { label: string, icon: string, visible?: (li: HTMLElement) => boolean, onClick: (event: Event, li: HTMLElement) => unknown }[]) => {
    const packOf = (li: HTMLElement) => game.packs?.get(li.dataset.pack ?? "");
    const markable = (li: HTMLElement) => { const pack = packOf(li); return !!game.user?.isGM && pack?.documentName === "Item" && !manifestMarked(pack); };
    const set = (li: HTMLElement, on: boolean) => {
      const id = packOf(li)?.collection;
      if (!id) return;
      const list = markedPacks().filter(p => p !== id);
      return game.settings?.set(MODULE_ID, OVERLAY_PACKS_SETTING as never, (on ? [...list, id] : list) as never);
    };
    options.push({
      label: "midi-qol.Overlay.MarkPack", icon: "fa-solid fa-layer-group",
      visible: li => markable(li) && !markedPacks().includes(packOf(li)!.collection),
      onClick: (_event, li) => set(li, true)
    }, {
      label: "midi-qol.Overlay.UnmarkPack", icon: "fa-solid fa-layer-group",
      visible: li => markable(li) && markedPacks().includes(packOf(li)!.collection),
      onClick: (_event, li) => set(li, false)
    });
  }) as never);
}

export function registerWorldOverlays(): number {
  let count = 0;
  for (const item of game.items ?? []) if (item.getFlag(MODULE_ID, "overlay") && !untouchedImport(item) && registerOverlay(item, "world")) count++;
  return count;
}

/* Authoring (11c-2): save an edited copy of a base item as an overlay */

/** Play state and what an overlay carries by other means: not compared */
const ITEM_SKIP = ["identifier", "source", "activities", "description", "container", "quantity", "equipped", "attuned", "prepared", "identified", "uses.spent", "sourceItem", "sourceClass", "advancement"];
const ACTIVITY_SKIP = ["_id", "sort", "uses.spent", "midiEntries", "effects", "flags"];
const skipped = (path: string, list: readonly string[]) => list.some(s => path === s || path.startsWith(`${s}.`));

/**
 * The fields that differ between two sources, as override changes under `prefix`: values that are text, numbers or
 * yes/no. A difference in a list or a set of fields can't be said as one change: its path goes in `unsaid`.
 */
function fieldChanges(now: unknown, base: unknown, prefix: string, skip: readonly string[], unsaid: string[]): OverlayChange[] {
  const a = foundry.utils.flattenObject((now ?? {}) as object) as Record<string, unknown>;
  const b = foundry.utils.flattenObject((base ?? {}) as object) as Record<string, unknown>;
  const changes: OverlayChange[] = [];
  for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (skipped(path, skip)) continue;
    const value = a[path], was = b[path];
    if (JSON.stringify(value ?? null) === JSON.stringify(was ?? null)) continue;
    // "" and null are the same empty field to dnd5e's forms
    if ((value ?? "") === "" && (was ?? "") === "") continue;
    if (["string", "number", "boolean"].includes(typeof value)) changes.push({ key: `${prefix}${path}`, value: String(value), type: "override" });
    else unsaid.push(`${prefix}${path}`);
  }
  return changes;
}

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
  // The item's own source: an overlay's earlier changes (its marker's) are not in it
  const unsaid: string[] = [];
  const sourceOf = (doc: Item.Implementation) => (doc as unknown as { _source: { name?: string, system?: Record<string, unknown> & { activities?: Record<string, unknown> } } })._source;
  const changes = fieldChanges(sourceOf(item).system, sourceOf(base).system, "system.", ITEM_SKIP, unsaid);
  if (sourceOf(item).name !== sourceOf(base).name && sourceOf(item).name) changes.push({ key: "name", value: String(sourceOf(item).name), type: "override" });
  for (const activity of activitiesOf(item)) {
    if (isOverlayPart(activity.flags)) continue;
    const match = baseActivities.find(a => a.type === activity.type && a.name === activity.name) ?? baseActivities.find(a => a.id === activity.id);
    if (!match) activities[activity.id] = activity.toObject();
    else {
      if (activity.midiEntries?.length && !sameEntries(activity.midiEntries, match.midiEntries))
        activities[activity.id] = { _id: activity.id, type: activity.type, name: activity.name, midiEntries: activity.midiEntries };
      changes.push(...fieldChanges(sourceOf(item).system?.activities?.[activity.id], sourceOf(base).system?.activities?.[match.id], `system.activities.${activity.id}.`, ACTIVITY_SKIP, unsaid));
    }
  }
  const effects: ActiveEffect.CreateData[] = [];
  for (const effect of item.effects) {
    // What an overlay added, and its marker, are the overlay's already; an enchantment on the item is not the item's
    if (isOverlayPart(effect.flags) || (effect as { isAppliedEnchantment?: boolean }).isAppliedEnchantment) continue;
    const match = base.effects.find(e => e.name === effect.name);
    const entries = effect.getFlag(MODULE_ID, "entries");
    if (!match) effects.push(effect.toObject());
    else if (entries?.length && !sameEntries(entries, match.getFlag(MODULE_ID, "entries")))
      effects.push({ _id: effect.id, name: effect.name, img: effect.img, flags: { [MODULE_ID]: { entries } } });
  }
  const itemEntries = item.getFlag(MODULE_ID, "entries");
  const ownEntries = itemEntries?.length && !sameEntries(itemEntries, base.getFlag(MODULE_ID, "entries")) ? itemEntries : undefined;
  if (!ownEntries && !effects.length && !Object.keys(activities).length && !changes.length) {
    if (unsaid.length) ui.notifications?.warn(`${game.i18n?.localize("midi-qol.Overlay.Unsaid") ?? "An overlay can't carry these changes"}: ${unsaid.join(", ")}`);
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
    flags: { [MODULE_ID]: { overlay: { identifier, ...(rules ? { rules } : {}), version, ...(changes.length ? { changes } : {}), base: { uuid: base.uuid ?? String(sourceUuid), modifiedTime: base._stats?.modifiedTime ?? undefined } },
      ...(ownEntries ? { entries: ownEntries } : {}) } }
  }], { keepId: true });
  const overlay = created[0] as Item.Implementation | undefined;
  if (overlay) registerOverlay(overlay, "world");
  // Said, not dropped: what differs but can't be one change (a list: damage parts, properties)
  if (overlay && unsaid.length) ui.notifications?.warn(`${game.i18n?.localize("midi-qol.Overlay.Unsaid") ?? "An overlay can't carry these changes"}: ${unsaid.join(", ")}`);
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
    const dataPart = markerFlag ? `data part v${markerFlag.version}${overlay && versionOf(overlay.item) !== markerFlag.version ? ` (overlay now v${versionOf(overlay.item)}: replaced when a GM is connected)` : ""}` : undefined;
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

