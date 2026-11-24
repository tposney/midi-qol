import { defineService, reportServiceProblem } from "../../api/services.js";

/*
 * combatRecord (single; M23): what happened in a combat and what is known about creatures, for the hub's "since my last
 * turn" and knowledge card. A module records it (Encounter Chronicle) and decides what knowledge it keeps; midi's own
 * provider is a stub that keeps the current session in memory.
 *
 *   MidiQOL.services.register("combatRecord", "my-module", {
 *     events: ({ subject, since, viewer }) => [...],
 *     knowledge: ({ subject, viewer }) => ({ name: "Orc", ac: { atLeast: 12 } })
 *   }, { priority: 10 });
 *
 * Both answer for one viewer: a provider leaves out what that user shouldn't learn (an unseen creature's name, a hit or
 * miss the reveal policy hides). Records come from midi's cues (`midi-qol.cue` on the using client,
 * `midi-qol.cueReceived` on the others) with their per-target outcomes, and from effects created and deleted.
 */

export type RecordKind = "attacked" | "saved" | "damaged" | "healed" | "effectGained" | "effectEnded";

export interface RecordEvent {
  kind: RecordKind;
  round: number;
  turn: number;
  /** Who did it, as the viewer may know it */
  source?: { uuid?: string, name: string };
  /** What was used */
  item?: string;
  /** damaged / healed */
  amount?: number;
  damageType?: string;
  /** effectGained / effectEnded */
  effect?: string;
  outcome?: "hit" | "miss" | "critical" | "success" | "failure";
}

export interface Knowledge {
  /** The kind, as known ("Orc") */
  name: string;
  /** From hits and misses: its AC is at least / at most this */
  ac?: { atLeast?: number, atMost?: number };
  saves?: { ability: string, seen: number, succeeded: number }[];
  resists?: string[];
  immune?: string[];
  vulnerable?: string[];
  /** Attacks, spells and features seen used */
  uses?: string[];
  /** Anything else the provider records (Study, a check, what the GM grants) */
  notes?: string[];
}

export interface EventsQuery {
  /** Token document uuid */
  subject: string;
  /** Since the subject's last turn ended, or since a point in its combat */
  since: "lastTurn" | { round: number, turn: number };
  kinds?: RecordKind[];
  viewer: User.Implementation;
}

export interface KnowledgeQuery {
  /** Token document uuid of the creature */
  subject: string;
  viewer: User.Implementation;
  /** One character's knowledge (an actor uuid), else the viewer's */
  by?: string;
}

export interface CombatRecordProvider {
  events?(query: EventsQuery): RecordEvent[];
  knowledge?(query: KnowledgeQuery): Knowledge | undefined;
}

declare module "../../api/services.js" {
  interface MidiServices { combatRecord: CombatRecordProvider }
}

export let combatRecordService: ReturnType<typeof defineService<CombatRecordProvider>>;

export function defineCombatRecordService() {
  combatRecordService = defineService<CombatRecordProvider>("combatRecord", {
    kind: "single",
    description: "What happened in a combat and what is known about creatures (the hub's since my last turn, knowledge)"
  });
}

/** The active provider's events (none without one, or on its failure) */
export function recordEvents(query: Omit<EventsQuery, "viewer"> & { viewer?: User.Implementation }): RecordEvent[] {
  const viewer = query.viewer ?? game.user;
  const provider = combatRecordService?.get();
  if (!viewer || !provider?.events) return [];
  try { return provider.events({ ...query, viewer }) ?? []; }
  catch (err) { reportServiceProblem("combatRecord", "active provider", "events failed", err); return []; }
}

/** The active provider's knowledge of a creature */
export function recordKnowledge(query: Omit<KnowledgeQuery, "viewer"> & { viewer?: User.Implementation }): Knowledge | undefined {
  const viewer = query.viewer ?? game.user;
  const provider = combatRecordService?.get();
  if (!viewer || !provider?.knowledge) return undefined;
  try { return provider.knowledge({ ...query, viewer }); }
  catch (err) { reportServiceProblem("combatRecord", "active provider", "knowledge failed", err); return undefined; }
}
