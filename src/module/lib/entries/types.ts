/*
 * M15: the entry format (wave B spike, ~/Documents/midi-next-format-spike-2026-11-20.md "The format"). An entry is
 * data on an activity (`midiEntries`), an item or an effect (`flags.midi-qol.entries`): at a event, for whom, if a
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
  /** Someone near: the event is about a creature within `within` feet of the bearer (or of the effect's origin); `filter` an expression */
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
  /** A list only for an `action` entry: who may take it */
  who?: EntryWho | EntryWho[];
  /** What a card or prompt calls it (an action's button) */
  label?: string;
  /** What it does, in a line for the prompt that offers it (text or a lang key) */
  description?: string;
  if?: string;
  /** "casting": chosen as the use starts (dnd5e's usage dialog, lib/entries/castingOffers.ts), run at its own event */
  offer?: "always" | "ask" | "reaction" | "toggle" | "casting";
  activity?: string;
  cost?: EntryCost;
  choose?: Record<string, unknown>;
  limit?: EntryLimit;
  group?: string;
  /** How many of the group a use may take (default 1): a number or a midi expression; the largest on offer counts */
  groupLimit?: number | string;
  stacks?: boolean;
  do: EntryAction[];
}

/** Uses spent from the actor's items, by identifier and in order (Sorcery Points: Metamagic Adept's, then Font of Magic's) */
export interface EntryCost {
  amount: number | string;
  from: string[];
  /** What the uses are called ("Sorcery Points"); else the first item's name */
  label?: string;
}

/** Where an entry was found */
export type EntryHome = "activity" | "item" | "effect" | "registry";

/** An entry found for a event: where it came from, and whose it is */
export interface FoundEntry {
  entry: Entry;
  home: EntryHome;
  /** The document holding it (activity, item or effect) */
  document: foundry.abstract.Document.Any | { uuid: string };
  /** Its who, the home's default filled in */
  who: EntryWho;
  /** The actor the entry belongs to (the effect's bearer, the item's owner) */
  actor?: Actor.Implementation;
  /** A near entry (`who: { within }`): the creature the event is about, its token, how far */
  near?: { creature: Actor.Implementation, token: TokenDocument.Implementation, distance: number };
}
