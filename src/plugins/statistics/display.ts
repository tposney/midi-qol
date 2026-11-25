import type { Counters, Period, PeriodStats, RollStats, StatsEntry } from "./rollStats.js";
import { midiStats } from "./index.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const i18n = (key: string) => game.i18n?.localize(key) ?? key;
const format = (key: string, data: Record<string, string | number>) => game.i18n?.format(key, data) ?? key;

type Filter = "characters" | "all" | "players";
type SortKey = "name" | "attacks" | "hitPct" | "critPct" | "damage" | "avgDamage" | "healing" | "taken" | "kills" | "saves";

const pct = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 100) : undefined;
const avg = (total: number, count: number) => count > 0 ? Math.round(total / count * 10) / 10 : undefined;
const round = (value: number) => Math.round(value * 10) / 10;
const show = (value: number | undefined, suffix = "") => value === undefined ? "–" : `${value}${suffix}`;

interface Row {
  id: string;
  name: string;
  player: boolean;
  img?: string;
  c: Counters;
  values: Record<SortKey, number | string | undefined>;
  cells: { key: SortKey, text: string }[];
  expanded: boolean;
  detail?: Record<string, unknown>;
}

/**
 * The Show Statistics window (M23, reviewed 2026-11-25): one table, a row per creature (and per player), the session's
 * or lifetime figures; a row opens its detail. A player sees their own creatures and themselves; the GM everything.
 */
export class RollStatsDisplay extends HandlebarsApplicationMixin(ApplicationV2) {
  stats: RollStats;
  period: Period = "session";
  filter: Filter = "characters";
  sort: { key: SortKey, desc: boolean } = { key: "damage", desc: true };
  expanded = new Set<string>();
  #hookId: number;
  #renderPending = false;

  constructor(options: Partial<foundry.applications.api.ApplicationV2.Configuration> & { stats?: RollStats } = {}) {
    const { stats: _stats, ...config } = options;
    super(config);
    this.stats = options.stats ?? midiStats()!;
    if (!game.user?.isGM) this.filter = "all";
    this.#hookId = Hooks.on("midi-qol.StatsUpdated", () => {
      if (this.#renderPending || !this.rendered) return;
      this.#renderPending = true;
      setTimeout(() => { this.#renderPending = false; void this.render(); }, 500);
    });
  }

  static override DEFAULT_OPTIONS = {
    id: "midi-qol-statistics",
    classes: ["midi-stats"],
    window: { title: "midi-qol.StatsTitle", resizable: true, icon: "fas fa-chart-bar", controls: [
      { icon: "fas fa-file-csv", label: "midi-qol.ExportCSV", action: "exportCSV" },
      { icon: "fas fa-file-export", label: "midi-qol.ExportJSon", action: "exportJSON" },
      { icon: "fas fa-clock", label: "midi-qol.EndSession", action: "endSession" },
      { icon: "fas fa-trash", label: "midi-qol.ClearStats", action: "clearStats" }
    ] },
    position: { width: 860, height: 600 },
    actions: {
      period: RollStatsDisplay.#onPeriod,
      sort: RollStatsDisplay.#onSort,
      toggle: RollStatsDisplay.#onToggle,
      removeStats: RollStatsDisplay.#onRemove,
      exportCSV: RollStatsDisplay.#onExportCSV,
      exportJSON: RollStatsDisplay.#onExportJSON,
      endSession: RollStatsDisplay.#onEndSession,
      clearStats: RollStatsDisplay.#onClearStats
    }
  };

  static override PARTS = {
    stats: { template: "modules/midi-qol/templates/apps/RollStatsDisplay/stats.hbs", scrollable: [".midi-stats-rows"] }
  };

  /** The actions in the window's menu are the GM's */
  protected override _getHeaderControls() {
    return game.user?.isGM ? super._getHeaderControls() : [];
  }

  override async close(options?: object) {
    Hooks.off("midi-qol.StatsUpdated", this.#hookId);
    return super.close(options);
  }

  /** The entries this user may see, as rows */
  #rows(): Row[] {
    const store = this.stats.store;
    const gm = !!game.user?.isGM;
    const entries: [string, StatsEntry][] = [];
    if (this.filter === "players") entries.push(...Object.entries(store.players).filter(([id]) => gm || id === game.user?.id));
    else for (const [id, entry] of Object.entries(store.creatures)) {
      const actor = game.actors?.get(id);
      if (!gm && !actor?.isOwner) continue;
      if (this.filter === "characters" && actor && !actor.hasPlayerOwner) continue;
      entries.push([id, entry]);
    }
    const rows = entries.map(([id, entry]) => this.#row(id, entry)).filter(row => this.#hasFigures(row.c));
    const { key, desc } = this.sort;
    rows.sort((a, b) => {
      const x = a.values[key], y = b.values[key];
      const order = typeof x === "string" || typeof y === "string" ? String(x ?? "").localeCompare(String(y ?? "")) : (x ?? -1) - (y ?? -1);
      return desc ? -order : order;
    });
    return rows;
  }

  #hasFigures(c: Counters): boolean {
    return Object.values(c).some(value => value > 0);
  }

  #row(id: string, entry: StatsEntry): Row {
    const period: PeriodStats = entry[this.period];
    const c = period.counters;
    const values: Row["values"] = {
      name: entry.name,
      attacks: c.attacks,
      hitPct: pct(c.hits, c.hits + c.misses),
      critPct: pct(c.crits, c.attacks),
      damage: round(c.damageApplied),
      avgDamage: avg(c.damageApplied, c.damagingUses),
      healing: round(c.healingDone),
      taken: round(c.damageTaken),
      kills: c.kills,
      saves: c.savesMade
    };
    const cells: Row["cells"] = [
      { key: "attacks", text: String(c.attacks || "–") },
      { key: "hitPct", text: show(values.hitPct as number | undefined, "%") },
      { key: "critPct", text: show(values.critPct as number | undefined, "%") },
      { key: "damage", text: String(values.damage || "–") },
      { key: "avgDamage", text: show(values.avgDamage as number | undefined) },
      { key: "healing", text: String(values.healing || "–") },
      { key: "taken", text: entry.player ? "" : String(values.taken || "–") },
      { key: "kills", text: String(c.kills || "–") },
      { key: "saves", text: entry.player || !c.savesMade ? "" : `${c.savesMadeSuccess}/${c.savesMade}` }
    ];
    const expanded = this.expanded.has(id);
    const actor = entry.player ? undefined : game.actors?.get(id);
    return { id, name: entry.name, player: !!entry.player, img: actor?.img ?? undefined, c, values, cells, expanded,
      detail: expanded ? this.#detail(entry, period) : undefined };
  }

  #detail(entry: StatsEntry, period: PeriodStats) {
    const c = period.counters;
    const typeLabel = (type: string) => i18n((CONFIG.DND5E.damageTypes as Record<string, { label?: string } | undefined>)[type]?.label ?? type);
    const types = Object.keys({ ...period.rolledByType, ...period.appliedByType });
    const most = Math.max(1, ...types.map(t => period.rolledByType[t] ?? 0), ...types.map(t => period.appliedByType[t] ?? 0));
    const byType = types.map(type => ({ label: typeLabel(type), rolled: round(period.rolledByType[type] ?? 0), applied: round(period.appliedByType[type] ?? 0),
      rolledWidth: Math.round((period.rolledByType[type] ?? 0) / most * 100), appliedWidth: Math.round((period.appliedByType[type] ?? 0) / most * 100) }))
      .sort((a, b) => b.applied - a.applied);
    const takenTypes = Object.entries(period.takenByType).sort((a, b) => b[1] - a[1]).map(([type, value]) => `${typeLabel(type)} ${round(value)}`);
    const parts = (list: (string | false | undefined)[]) => list.filter(Boolean).join(" · ");
    const attacks = c.attacks ? parts([
      format("midi-qol.stats.AttacksLine", { rolls: c.attacks, hits: c.hits, misses: c.misses }),
      `${i18n("midi-qol.stats.Crits")} ${c.crits}`, `${i18n("midi-qol.stats.fumbles")} ${c.fumbles}`,
      `${i18n("midi-qol.stats.Adv")} ${c.advantage} / ${i18n("midi-qol.stats.Dis")} ${c.disadvantage}`,
      `${i18n("midi-qol.stats.avgRoll")} ${show(avg(c.d20Total, c.attacks))}`, `${i18n("midi-qol.stats.nat20s")} ${c.nat20}`
    ]) : "";
    const prevented = round(c.damageRolled - c.damageApplied);
    const damage = c.uses ? parts([
      format("midi-qol.stats.DamageLine", { rolled: round(c.damageRolled), applied: round(c.damageApplied) }),
      prevented > 0 && format("midi-qol.stats.Prevented", { n: prevented }),
      `${i18n("midi-qol.stats.maxHit")} ${round(c.maxDamage)}`,
      c.crits > 0 && `${i18n("midi-qol.stats.avgCrit")} ${show(avg(c.critDamage, c.crits))}`,
      c.healingDone > 0 && `${i18n("midi-qol.stats.healed")} ${round(c.healingDone)}`,
      c.savesForced > 0 && format("midi-qol.stats.SavesForced", { failed: c.savesFailed, total: c.savesForced })
    ]) : "";
    const defence = entry.player ? "" : parts([
      c.damageTaken > 0 && `${i18n("midi-qol.stats.Taken")} ${round(c.damageTaken)}${takenTypes.length ? ` (${takenTypes.join(", ")})` : ""}`,
      c.healingReceived > 0 && `${i18n("midi-qol.stats.HealingReceived")} ${round(c.healingReceived)}`,
      c.savesMade > 0 && `${i18n("midi-qol.stats.Saves")} ${c.savesMadeSuccess}/${c.savesMade}`,
      c.conc > 0 && `${i18n("midi-qol.stats.conc")} ${c.concSuccess}/${c.conc}`,
      c.death > 0 && `${i18n("midi-qol.stats.death")} ${c.deathSuccess}/${c.deathFail}`
    ]);
    const items = Object.values(entry.items).map(item => ({ name: item.name, c: item[this.period] }))
      .filter(item => this.#hasFigures(item.c))
      .sort((a, b) => b.c.damageApplied - a.c.damageApplied)
      .map(({ name, c: ic }) => ({ name, attacks: ic.attacks || "–", hitPct: show(pct(ic.hits, ic.hits + ic.misses), "%"),
        uses: ic.uses || "–", damage: round(ic.damageApplied) || "–", avgDamage: show(avg(ic.damageApplied, ic.damagingUses)), kills: ic.kills || "–" }));
    return { attacks, damage, byType, defence, items };
  }

  override async _prepareContext(options: foundry.applications.api.ApplicationV2.RenderOptions) {
    const context = await super._prepareContext(options);
    const columns: { key: SortKey, label: string }[] = [
      { key: "attacks", label: "midi-qol.stats.Attacks" }, { key: "hitPct", label: "midi-qol.stats.hitRate" },
      { key: "critPct", label: "midi-qol.stats.CritRate" }, { key: "damage", label: "midi-qol.stats.Damage" },
      { key: "avgDamage", label: "midi-qol.stats.AvgDmg" }, { key: "healing", label: "midi-qol.stats.healed" },
      { key: "taken", label: "midi-qol.stats.Taken" }, { key: "kills", label: "midi-qol.stats.kills" },
      { key: "saves", label: "midi-qol.stats.Saves" }
    ];
    const started = new Date(this.stats.store.sessionStarted);
    return Object.assign(context, {
      rows: this.#rows(),
      columns: columns.map(col => ({ ...col, sorted: this.sort.key === col.key, desc: this.sort.desc })),
      nameSorted: this.sort.key === "name", desc: this.sort.desc,
      period: this.period, session: this.period === "session",
      filters: (["characters", "all", "players"] as const).map(id => ({ id, label: `midi-qol.stats.Filter.${id}`, selected: this.filter === id })),
      sessionSince: format("midi-qol.stats.SessionSince", { date: started.toLocaleString() }),
      off: this.stats.mode() === "off",
      isGM: !!game.user?.isGM
    });
  }

  protected override async _onRender(context: object, options: object) {
    await super._onRender(context as never, options as never);
    this.element.querySelector<HTMLSelectElement>("select[name=filter]")?.addEventListener("change", event => {
      this.filter = (event.target as HTMLSelectElement).value as Filter;
      void this.render();
    });
  }

  static #onPeriod(this: RollStatsDisplay, _event: Event, target: HTMLElement) {
    this.period = target.dataset.period === "lifetime" ? "lifetime" : "session";
    void this.render();
  }

  static #onSort(this: RollStatsDisplay, _event: Event, target: HTMLElement) {
    const key = target.dataset.key as SortKey;
    this.sort = this.sort.key === key ? { key, desc: !this.sort.desc } : { key, desc: key !== "name" };
    void this.render();
  }

  static #onToggle(this: RollStatsDisplay, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-id]")?.dataset.id;
    if (!id) return;
    if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
    void this.render();
  }

  static async #onRemove(this: RollStatsDisplay, event: Event, target: HTMLElement) {
    event.stopPropagation();
    const id = target.closest<HTMLElement>("[data-id]")?.dataset.id;
    const name = id ? (this.stats.store.creatures[id] ?? this.stats.store.players[id])?.name : undefined;
    if (!id || !name) return;
    if (!await DialogV2.confirm({ window: { title: "midi-qol.RemoveStats" }, content: `<p>${format("midi-qol.stats.RemoveConfirm", { name })}</p>` })) return;
    this.expanded.delete(id);
    await this.stats.clearActorStats(id);
  }

  static #onExportCSV(this: RollStatsDisplay) { this.stats.exportToCSV(); }
  static #onExportJSON(this: RollStatsDisplay) { this.stats.exportToJSON(); }

  static async #onEndSession(this: RollStatsDisplay) {
    if (!await DialogV2.confirm({ window: { title: "midi-qol.EndSession" }, content: `<p>${i18n("midi-qol.stats.EndSessionConfirm")}</p>` })) return;
    await this.stats.endSession();
  }

  static async #onClearStats(this: RollStatsDisplay) {
    if (!await DialogV2.confirm({ window: { title: "midi-qol.ClearStats" }, content: `<p>${i18n("midi-qol.stats.ClearConfirm")}</p>` })) return;
    await this.stats.clearStats();
  }
}
