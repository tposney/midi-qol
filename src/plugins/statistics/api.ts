import type { StatisticsProvider } from "../../module/services/statistics/service.js";

/** What the statistics plugin is given: midi's public API only (it can move into a module as it is) */
export interface StatisticsPluginApi {
  services: { register(serviceId: "statistics", providerId: string, provider: StatisticsProvider, options?: { label?: string, priority?: number }): unknown };
  /** midi's Keep Roll Statistics settings (the live object: the display's config tab edits them) */
  config(): { keepRollStats: boolean, playerStatsOnly: boolean, saveStatsEvery: number };
  saveConfig(): Promise<unknown>;
  /** Run a registered GM action (midi's: removeStatsForActorId, saveAllStats) */
  executeAsGM(action: string, data: Record<string, unknown>): Promise<unknown>;
}

let current: StatisticsPluginApi | undefined;
export function setApi(api: StatisticsPluginApi) { current = api; }
export function api(): StatisticsPluginApi {
  if (!current) throw new Error("midi-qol | statistics plugin used before registration");
  return current;
}
