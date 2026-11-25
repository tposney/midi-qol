import { RollStats } from "./rollStats.js";
import { setApi, type StatisticsPluginApi } from "./api.js";

/*
 * Roll statistics (M23; user 2026-11-25: a plugin inside midi, like the combat recorder): the statistics service's
 * default provider and its Show Statistics window, using only what it is given (midi's public API). midi feeds the
 * service from its cues (lib/statisticsFeed.ts).
 */

let stats: RollStats | undefined;

/** midi's statistics provider (MidiQOL.gameStats) */
export function midiStats(): RollStats | undefined { return stats; }

/** At setup: the world setting RollStats is readable */
export function registerStatisticsPlugin(api: StatisticsPluginApi): RollStats {
  setApi(api);
  stats = new RollStats();
  api.services.register("statistics", "midi-qol.rollStats", stats, { label: "Midi-QOL: roll statistics", priority: -100 });
  return stats;
}

export { RollStatsDisplay } from "./display.js";
export type { Stats } from "./rollStats.js";
