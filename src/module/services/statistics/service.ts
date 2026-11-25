import { defineService, reportServiceProblem } from "../../api/services.js";

/*
 * statistics (single; M23): who keeps roll statistics. midi feeds it from its cues (lib/statisticsFeed.ts), on the active
 * GM only, while Keep Roll Statistics is on: one event per attack roll, a use's damage and saves when it ends, each
 * target's damage taken, concentration and death saves. midi's provider is its roll statistics (src/plugins/statistics,
 * the Show Statistics window); a module's provider replaces it.
 *
 *   MidiQOL.services.register("statistics", "my-module", { record: event => myLog.push(event) }, { priority: 10 });
 */

export type StatEvent =
  | { type: "attackRoll"; actorId: string; userId: string | undefined; itemName: string; rawRoll: number; fumble: boolean; critical: boolean; total: number; advantageMode: number }
  | { type: "damage"; actorId: string; userId: string | undefined; itemName: string; hpDamage: number; totalDamage: number; maxDamage: number; healingDone: number; kills: number; hasAttackActivity: boolean; critical: boolean }
  | { type: "saveResult"; actorId: string; userId: string | undefined; itemName: string; numSaves: number; numSuccess: number; numFail: number }
  | { type: "damageTaken"; actorId: string; hpDamage: number; damageByType: Record<string, number> }
  | { type: "damageDealtByType"; actorId: string; userId: string | undefined; dealtByType: Record<string, number>; appliedByType: Record<string, number> }
  | { type: "concentrationResult"; actorId: string; success: boolean }
  | { type: "deathSaveResult"; actorId: string; successes: number; failures: number };

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
