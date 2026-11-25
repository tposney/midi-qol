import { RollStatsDisplay } from "./display.js";
import { api } from "./api.js";
import type { StatEvent, StatisticsProvider } from "../../module/services/statistics/service.js";

/*
 * midi's roll statistics (M23; reviewed 2026-11-25): the statistics service's default provider. The active GM counts
 * the service's events into the world setting RollStatistics (saved a few seconds after the last event, and when the GM
 * leaves); every client reads that setting and the Show Statistics window shows it.
 *
 * A creature is kept under its actor id (every token of an unlinked creature together), its items under their ids
 * (the name as the label, kept when the item is gone); each player (a user who isn't a GM) has an entry of its own for
 * what their creatures did. The setting's mode applies to each event: "players" keeps player-owned creatures and the
 * players, "all" every creature.
 *
 * What is counted:
 * - attacks: attack rolls (natural d20, total, critical, fumble, advantage, natural 20 and 1); hits and misses from each
 *   target's attack outcome;
 * - uses: each use that dealt damage or healing or forced saves; damage rolled, applied (after resistances and saves),
 *   prevented, the most applied to one target, applied on criticals, by type; healing apart from damage; kills;
 *   saves its targets made against it (failed);
 * - as a target: damage taken (by type), healing received, saves made, concentration and death saves.
 */

export interface Counters {
  attacks: number; hits: number; misses: number; crits: number; fumbles: number; nat20: number; nat1: number;
  advantage: number; disadvantage: number; d20Total: number; attackTotal: number;
  uses: number; damagingUses: number; damageRolled: number; damageApplied: number; critDamage: number; maxDamage: number;
  healingDone: number; kills: number; savesForced: number; savesFailed: number;
  damageTaken: number; healingReceived: number; savesMade: number; savesMadeSuccess: number;
  conc: number; concSuccess: number; death: number; deathSuccess: number; deathFail: number;
}

export interface PeriodStats {
  counters: Counters;
  rolledByType: Record<string, number>;
  appliedByType: Record<string, number>;
  takenByType: Record<string, number>;
}

export interface ItemStats { name: string, session: Counters, lifetime: Counters }

export interface StatsEntry {
  name: string;
  /** A player's entry (a user), else a creature's (an actor) */
  player?: boolean;
  session: PeriodStats;
  lifetime: PeriodStats;
  items: Record<string, ItemStats>;
}

export interface StatsStore {
  version: 2;
  /** When the current session started (ms) */
  sessionStarted: number;
  creatures: Record<string, StatsEntry>;
  players: Record<string, StatsEntry>;
}

export type Period = "session" | "lifetime";

const SETTING = "RollStatistics";
const SAVE_DELAY_MS = 3000;

export function blankCounters(): Counters {
  return { attacks: 0, hits: 0, misses: 0, crits: 0, fumbles: 0, nat20: 0, nat1: 0, advantage: 0, disadvantage: 0, d20Total: 0, attackTotal: 0,
    uses: 0, damagingUses: 0, damageRolled: 0, damageApplied: 0, critDamage: 0, maxDamage: 0, healingDone: 0, kills: 0, savesForced: 0, savesFailed: 0,
    damageTaken: 0, healingReceived: 0, savesMade: 0, savesMadeSuccess: 0, conc: 0, concSuccess: 0, death: 0, deathSuccess: 0, deathFail: 0 };
}

const blankPeriod = (): PeriodStats => ({ counters: blankCounters(), rolledByType: {}, appliedByType: {}, takenByType: {} });
const blankStore = (): StatsStore => ({ version: 2, sessionStarted: Date.now(), creatures: {}, players: {} });

/** Fill what an older or partial stored entry lacks (and drop non-numbers) */
function normalise(store: unknown): StatsStore {
  const raw = (store && typeof store === "object" && (store as { version?: unknown }).version === 2) ? store as StatsStore : blankStore();
  const fixCounters = (c: Partial<Counters> | undefined): Counters => {
    const out = blankCounters();
    for (const key of Object.keys(out) as (keyof Counters)[]) if (Number.isFinite(c?.[key])) out[key] = c![key] as number;
    return out;
  };
  const fixPeriod = (p: Partial<PeriodStats> | undefined): PeriodStats => ({ counters: fixCounters(p?.counters),
    rolledByType: { ...(p?.rolledByType ?? {}) }, appliedByType: { ...(p?.appliedByType ?? {}) }, takenByType: { ...(p?.takenByType ?? {}) } });
  const fixEntries = (entries: Record<string, StatsEntry> | undefined, player: boolean) => Object.fromEntries(Object.entries(entries ?? {}).map(([id, e]) => [id, {
    name: e?.name ?? "", ...(player ? { player: true } : {}), session: fixPeriod(e?.session), lifetime: fixPeriod(e?.lifetime),
    items: Object.fromEntries(Object.entries(e?.items ?? {}).map(([key, item]) => [key, { name: item?.name ?? "", session: fixCounters(item?.session), lifetime: fixCounters(item?.lifetime) }]))
  }]));
  return { version: 2, sessionStarted: Number.isFinite(raw.sessionStarted) ? raw.sessionStarted : Date.now(),
    creatures: fixEntries(raw.creatures, false), players: fixEntries(raw.players, true) };
}

const add = (into: Record<string, number>, from: Record<string, number>) => {
  for (const [type, value] of Object.entries(from)) if (value > 0) into[type] = Math.round(((into[type] ?? 0) + value) * 100) / 100;
};

export class RollStats implements StatisticsProvider {
  store: StatsStore;
  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #dirty = false;

  constructor() {
    this.store = normalise(game.settings?.get("midi-qol", SETTING));
    // The GM's unsaved counts go with it when it leaves
    window.addEventListener("beforeunload", () => { if (this.#dirty) void this.#save(); });
  }

  /** "players": player-owned creatures and the players; "all": every creature; "off": nothing */
  mode(): "off" | "players" | "all" {
    return api().config().rollStatistics;
  }

  // ==================== The statistics service ====================

  record(event: StatEvent) {
    if (!game.user?.isGM) return;
    const mode = this.mode();
    if (mode === "off") return;
    const creature = this.#creature(event.actorId, mode);
    const player = "userId" in event ? this.#player(event.userId) : undefined;
    const owners = [creature, player].filter((e): e is StatsEntry => !!e);
    const itemsOf = (entry: StatsEntry, itemId: string | undefined, itemName: string) => {
      const key = itemId ? (entry.player ? `${event.actorId}.${itemId}` : itemId) : `name:${itemName}`;
      if (!itemName && !itemId) return undefined;
      const item = entry.items[key] ??= { name: itemName, session: blankCounters(), lifetime: blankCounters() };
      if (itemName) item.name = itemName;
      return item;
    };
    switch (event.type) {
      case "attackRoll":
        for (const entry of owners) {
          const item = itemsOf(entry, event.itemId, event.itemName);
          for (const c of [entry.session.counters, entry.lifetime.counters, item?.session, item?.lifetime]) {
            if (!c) continue;
            c.attacks += 1; c.hits += event.hits; c.misses += event.misses;
            if (event.critical) c.crits += 1;
            if (event.fumble) c.fumbles += 1;
            if (event.natural === 20) c.nat20 += 1;
            if (event.natural === 1) c.nat1 += 1;
            if (event.advantageMode === 1) c.advantage += 1;
            else if (event.advantageMode === -1) c.disadvantage += 1;
            c.d20Total += event.natural; c.attackTotal += event.total;
          }
        }
        break;
      case "use":
        for (const entry of owners) {
          const item = itemsOf(entry, event.itemId, event.itemName);
          for (const c of [entry.session.counters, entry.lifetime.counters, item?.session, item?.lifetime]) {
            if (!c) continue;
            c.uses += 1;
            if (event.damageApplied > 0 || event.damageRolled > 0) c.damagingUses += 1;
            c.damageRolled += event.damageRolled; c.damageApplied += event.damageApplied;
            if (event.critical) c.critDamage += event.damageApplied;
            c.maxDamage = Math.max(c.maxDamage, event.maxDamage);
            c.healingDone += event.healingDone; c.kills += event.kills;
            c.savesForced += event.savesForced; c.savesFailed += event.savesFailed;
          }
          for (const p of [entry.session, entry.lifetime]) { add(p.rolledByType, event.rolledByType); add(p.appliedByType, event.appliedByType); }
        }
        break;
      case "damageTaken":
        if (creature) for (const p of [creature.session, creature.lifetime]) {
          p.counters.damageTaken += event.damage; p.counters.healingReceived += event.healing;
          add(p.takenByType, event.byType);
        }
        break;
      case "saveMade":
        if (creature) for (const p of [creature.session, creature.lifetime]) {
          p.counters.savesMade += 1;
          if (event.success) p.counters.savesMadeSuccess += 1;
        }
        break;
      case "concentration":
        if (creature) for (const p of [creature.session, creature.lifetime]) {
          p.counters.conc += 1;
          if (event.success) p.counters.concSuccess += 1;
        }
        break;
      case "deathSave":
        if (creature) for (const p of [creature.session, creature.lifetime]) {
          p.counters.death += 1; p.counters.deathSuccess += event.successes; p.counters.deathFail += event.failures;
        }
        break;
    }
    if (owners.length) this.#changed();
  }

  show() { this.showStats(); }

  /** The stored statistics changed (another client's view: the GM saved) */
  reload() {
    if (game.user?.isGM) return;
    this.store = normalise(game.settings?.get("midi-qol", SETTING));
  }

  // ==================== Entries ====================

  #creature(actorId: string, mode: "players" | "all"): StatsEntry | undefined {
    const actor = game.actors?.get(actorId);
    const existing = this.store.creatures[actorId];
    if (!actor) return existing;
    if (mode === "players" && !actor.hasPlayerOwner) return undefined;
    const entry = this.store.creatures[actorId] ??= { name: actor.name ?? "", session: blankPeriod(), lifetime: blankPeriod(), items: {} };
    entry.name = actor.name ?? entry.name;
    return entry;
  }

  #player(userId: string | undefined): StatsEntry | undefined {
    const user = userId ? game.users?.get(userId) : undefined;
    if (!user || user.isGM || !userId) return undefined;
    const entry = this.store.players[userId] ??= { name: user.name ?? "", player: true, session: blankPeriod(), lifetime: blankPeriod(), items: {} };
    entry.name = user.name ?? entry.name;
    return entry;
  }

  // ==================== Saving (the active GM) ====================

  #changed() {
    this.#dirty = true;
    Hooks.callAll("midi-qol.StatsUpdated");
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => void this.#save(), SAVE_DELAY_MS);
  }

  async #save() {
    clearTimeout(this.#saveTimer);
    this.#dirty = false;
    if (game.user?.isGM) await game.settings?.set("midi-qol", SETTING, this.store);
  }

  /** Save now (a GM; from another client the GM is asked) */
  async saveStats() {
    if (game.user?.isGM) await this.#save();
    else await api().executeAsGM("saveAllStats", {});
  }

  async GMsaveAllStats() {
    if (game.user?.isGM) await this.#save();
  }

  // ==================== Actions ====================

  showStats() {
    new RollStatsDisplay({ stats: this }).render({ force: true });
  }

  /** A new session: the session figures start again */
  async endSession() {
    if (!game.user?.isGM) return;
    for (const entry of [...Object.values(this.store.creatures), ...Object.values(this.store.players)]) {
      entry.session = blankPeriod();
      for (const item of Object.values(entry.items)) item.session = blankCounters();
    }
    this.store.sessionStarted = Date.now();
    await this.#save();
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  async clearStats() {
    if (!game.user?.isGM) return;
    this.store = blankStore();
    await this.#save();
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  /** Remove a creature's or a player's entry */
  async clearActorStats(id: string) {
    if (!game.user?.isGM) return api().executeAsGM("removeStatsForActorId", { actorId: id });
    return this.GMremoveActorStats(id);
  }

  async GMremoveActorStats(id: string) {
    if (!game.user?.isGM) return;
    delete this.store.creatures[id];
    delete this.store.players[id];
    await this.#save();
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  // ==================== Export ====================

  exportToJSON() {
    foundry.utils.saveDataToFile(JSON.stringify(this.store, null, 2), "text/json", "fvtt-midi-qol-stats.json");
  }

  static readonly CSV_COLUMNS: (keyof Counters)[] = ["attacks", "hits", "misses", "crits", "fumbles", "nat20", "nat1", "advantage", "disadvantage",
    "d20Total", "attackTotal", "uses", "damagingUses", "damageRolled", "damageApplied", "critDamage", "maxDamage", "healingDone", "kills",
    "savesForced", "savesFailed", "damageTaken", "healingReceived", "savesMade", "savesMadeSuccess", "conc", "concSuccess", "death", "deathSuccess", "deathFail"];

  exportToCSV() {
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [["kind", "name", "item", "period", ...RollStats.CSV_COLUMNS].map(quote).join(",")];
    const row = (kind: string, name: string, item: string, period: Period, c: Counters) =>
      lines.push([kind, name, item, period].map(quote).concat(RollStats.CSV_COLUMNS.map(key => String(c[key] ?? 0))).join(","));
    for (const [kind, entries] of [["creature", this.store.creatures], ["player", this.store.players]] as const) {
      for (const entry of Object.values(entries)) for (const period of ["session", "lifetime"] as const) {
        row(kind, entry.name, "", period, entry[period].counters);
        for (const item of Object.values(entry.items)) row(kind, entry.name, item.name, period, item[period]);
      }
    }
    foundry.utils.saveDataToFile(lines.join("\n") + "\n", "text/csv", "fvtt-midi-qol-stats.csv");
  }
}

export { SETTING as STATISTICS_SETTING };
