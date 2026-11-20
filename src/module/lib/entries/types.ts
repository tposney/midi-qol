/*
 * M15: the entry format (wave B spike, ~/Documents/midi-next-format-spike-2026-11-20.md "The format"). An entry is
 * data on an activity (`midiEntries`), an item or an effect (`flags.midi-qol.entries`): at a moment, for whom, if a
 * condition holds, within a limit, it runs its actions, each a contribution to a service or a step change.
 */

export type EntryWho =
  /** Uses of this item or activity (the default on an activity or item) */
  | "this"
  /** Any use by the item's owner */
  | "owner"
  /** The effect's bearer (the default on an effect) */
  | "bearer"
  /** The creature whose use applied the effect */
  | "origin"
  /** Someone near (stage 4) */
  | { within: number | "reach", of: "bearer" | "origin" | string, filter?: string };

export interface EntryLimit { per: "turn" | "round" | "use" | "effect", max?: number }

export interface EntryAction {
  /** Run only if this midi expression holds */
  if?: string;
  /** save / check / use: actions run on the result */
  then?: EntryAction[];
  else?: EntryAction[];
  [key: string]: unknown;
}

export interface Entry {
  id: string;
  on: string | string[];
  who?: EntryWho;
  if?: string;
  offer?: "always" | "ask" | "reaction" | "toggle";
  activity?: string;
  choose?: Record<string, unknown>;
  limit?: EntryLimit;
  group?: string;
  stacks?: boolean;
  do: EntryAction[];
}

/** Where an entry was found */
export type EntryHome = "activity" | "item" | "effect" | "registry";

/** An entry found for a moment: where it came from, and whose it is */
export interface FoundEntry {
  entry: Entry;
  home: EntryHome;
  /** The document holding it (activity, item or effect) */
  document: foundry.abstract.Document.Any | { uuid: string };
  /** Its who, the home's default filled in */
  who: EntryWho;
  /** The actor the entry belongs to (the effect's bearer, the item's owner) */
  actor?: Actor.Implementation;
}
