import { defineService, reportServiceProblem } from "../../api/services.js";

/*
 * statistics (single; M23): who keeps roll statistics. midi feeds it from its cues (lib/statisticsFeed.ts), on the active
 * GM only, while Roll statistics isn't off: one event per attack roll, one per use when it ends, each target's damage
 * taken and saves made, concentration and death saves. midi's provider is its roll statistics (src/plugins/statistics,
 * the Show Statistics window); a module's provider replaces it.
 *
 *   MidiQOL.services.register("statistics", "my-module", { record: event => myLog.push(event) }, { priority: 10 });
 */

/**
 * What is counted. attackRoll: one per attack roll, with how many of its targets it hit and missed. use: one per use
 * that dealt damage or healing or forced saves (when it ends): damage summed over its targets (rolled; applied after
 * resistances and saves), the most applied to one target, healing apart, kills, saves forced and failed. damageTaken,
 * saveMade: per target. concentration, deathSave: a creature's own rolls.
 */
export type StatEvent =
  | { type: "attackRoll"; actorId: string; userId?: string; itemId?: string; itemName: string; natural: number; total: number; critical: boolean; fumble: boolean; advantageMode: number; hits: number; misses: number }
  | { type: "use"; actorId: string; userId?: string; itemId?: string; itemName: string; attack: boolean; critical: boolean; damageRolled: number; damageApplied: number; maxDamage: number; healingDone: number; kills: number; rolledByType: Record<string, number>; appliedByType: Record<string, number>; savesForced: number; savesFailed: number }
  | { type: "damageTaken"; actorId: string; damage: number; healing: number; byType: Record<string, number> }
  | { type: "saveMade"; actorId: string; success: boolean }
  | { type: "concentration"; actorId: string; success: boolean }
  | { type: "deathSave"; actorId: string; successes: number; failures: number };

export interface StatisticsProvider {
  /** An event to count (on the active GM) */
  record(event: StatEvent): unknown;
  /** Open its display */
  show?(): unknown;
  /** The stored statistics changed (the world setting): read them again */
  reload?(): unknown;
}

declare module "../../api/services.js" {
  interface MidiServices { statistics: StatisticsProvider }
}

export let statisticsService: ReturnType<typeof defineService<StatisticsProvider>> | undefined;

export function defineStatisticsService() {
  statisticsService = defineService<StatisticsProvider>("statistics", {
    kind: "single",
    description: "Roll statistics: attacks, damage, saves, damage taken, concentration and death saves"
  });
}

/** The active provider */
export function statisticsProvider(): StatisticsProvider | undefined {
  return statisticsService?.get();
}

export function recordStatistic(event: StatEvent): void {
  const provider = statisticsProvider();
  if (!provider) return;
  try {
    void Promise.resolve(provider.record(event)).catch(err => reportServiceProblem("statistics", "active provider", `record(${event.type}) failed`, err));
  } catch (err) {
    reportServiceProblem("statistics", "active provider", `record(${event.type}) failed`, err);
  }
}
