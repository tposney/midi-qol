import type { Entry } from "./types.js";

/*
 * An overlay applied to its base item, as stored data, with what it added and changed marked: the item view draws an
 * overlay as the item it makes (~/Documents/midi-next-item-view-redesign-2026-11-27.md, 3.7). As lib/entries/overlays.ts
 * applies one to an actor's item: its changed fields set, its entries given to the item, to the base's activity of
 * the same type and name and to the base's effect of the same name, the activities and effects the base lacks added.
 *
 * Pure: no Foundry.
 */

type Stored = Record<string, unknown>;
const record = (value: unknown): Stored => value && typeof value === "object" && !Array.isArray(value) ? value as Stored : {};
const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
const entriesOf = (value: unknown): Entry[] => Array.isArray(value) ? value.filter(e => e && typeof e === "object") as Entry[] : [];

export interface OverlayFieldChange {
  key: string;
  /** "item", or the activity's id */
  home: string;
  /** The field's path in its home ("range.units") */
  path: string;
  base: unknown;
  value: unknown;
}
export interface OverlayMarks {
  changes: OverlayFieldChange[];
  /** Ids of activities and effects the overlay adds */
  activities: string[];
  effects: string[];
  /** Entries the overlay gives: "item::<id>", "activity:<activity id>:<id>", "effect:<effect id>:<id>" */
  entries: string[];
}

/** A change's stored text as the value its field takes */
export function changeValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (/^[[{]/.test(text)) { try { return JSON.parse(text) as unknown; } catch { /* as written */ } }
  return value;
}

function getPath(object: Stored, path: string): unknown {
  let at: unknown = object;
  for (const key of path.split(".")) at = at && typeof at === "object" ? (at as Stored)[key] : undefined;
  return at;
}
function setPath(object: Stored, path: string, value: unknown): void {
  const keys = path.split(".");
  let at = object;
  for (const key of keys.slice(0, -1)) {
    if (!at[key] || typeof at[key] !== "object") at[key] = {};
    at = at[key] as Stored;
  }
  at[keys.at(-1)!] = value;
}

const entryKey = (home: string, homeId: string, id: string) => `${home}:${homeId}:${id}`;

/** The base item with the overlay applied (a copy: neither is changed), and what the overlay added and changed */
export function mergeOverlay(base: Stored, overlay: Stored): { merged: Stored, marks: OverlayMarks } {
  const merged = clone(base);
  const marks: OverlayMarks = { changes: [], activities: [], effects: [], entries: [] };
  const midi = (doc: Stored) => record(record(doc.flags)["midi-qol"]);
  const flag = record(midi(overlay).overlay);

  const system = record(merged.system);
  merged.system = system;
  const activities = record(system.activities);
  system.activities = activities;
  for (const change of Array.isArray(flag.changes) ? flag.changes as { key?: string, value?: unknown }[] : []) {
    if (typeof change?.key !== "string") continue;
    const found = /^system\.activities\.([^.]+)\.(.+)$/.exec(change.key);
    const home = found ? found[1] : "item";
    const path = found ? found[2] : change.key;
    const target = found ? activities[found[1]] : merged;
    // A field of an activity the base doesn't have changes nothing
    if (!target || typeof target !== "object") continue;
    const value = changeValue(change.value);
    marks.changes.push({ key: change.key, home, path: found ? path : path.replace(/^system\./, ""), base: clone(getPath(target as Stored, path)), value });
    setPath(target as Stored, path, value);
  }

  // The item's entries
  const flags = record(merged.flags);
  merged.flags = flags;
  const own = record(flags["midi-qol"]);
  flags["midi-qol"] = own;
  const given = entriesOf(midi(overlay).entries);
  if (given.length) {
    own.entries = [...entriesOf(own.entries), ...clone(given)];
    marks.entries.push(...given.map(e => entryKey("item", "", e.id)));
  }

  // Its activities: entries for the base's of the same type and name, else the activity itself
  for (const [key, raw] of Object.entries(record(record(overlay.system).activities))) {
    const activity = record(raw);
    const id = String(activity._id ?? key);
    const match = Object.entries(activities).find(([, b]) => record(b).type === activity.type && (record(b).name ?? "") === (activity.name ?? ""));
    const entries = entriesOf(activity.midiEntries);
    if (match) {
      const target = record(match[1]);
      const targetId = String(target._id ?? match[0]);
      if (entries.length) {
        target.midiEntries = [...entriesOf(target.midiEntries), ...clone(entries)];
        marks.entries.push(...entries.map(e => entryKey("activity", targetId, e.id)));
      }
    } else {
      activities[id] = clone(activity);
      marks.activities.push(id);
    }
  }

  // Its effects: entries for the base's of the same name, else the effect itself
  const effects = Array.isArray(merged.effects) ? merged.effects as Stored[] : [];
  merged.effects = effects;
  for (const effect of Array.isArray(overlay.effects) ? overlay.effects as Stored[] : []) {
    const entries = entriesOf(midi(effect).entries);
    const match = effects.find(e => e.name === effect.name);
    if (match) {
      if (!entries.length) continue;
      const matchFlags = record(match.flags);
      match.flags = matchFlags;
      const matchMidi = record(matchFlags["midi-qol"]);
      matchFlags["midi-qol"] = matchMidi;
      matchMidi.entries = [...entriesOf(matchMidi.entries), ...clone(entries)];
      marks.entries.push(...entries.map(e => entryKey("effect", String(match._id ?? ""), e.id)));
    } else if (!midi(effect).overlayRole) {
      effects.push(clone(effect));
      marks.effects.push(String(effect._id ?? ""));
    }
  }
  // It is the item now, not an overlay
  delete own.overlay;
  return { merged, marks };
}
