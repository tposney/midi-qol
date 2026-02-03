import { i18n } from "../../midi-qol.js";
import { RollStats } from "../RollStats.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RollStatsDisplay extends HandlebarsApplicationMixin(ApplicationV2) {

  statsHookId: number;
  playersOnly: boolean;
  stats: RollStats;
  expanded: Record<string, boolean>;
  expandedItems: Record<string, boolean>;
  showLifetime: Record<string, boolean>;
  #renderPending: boolean = false;

  constructor(options) {
    super(options);
    this.stats = options.stats;
    this.playersOnly = options.playersOnly || !game.user?.isGM || false;
    this.expanded = {};
    this.expandedItems = {};
    this.showLifetime = {};
    Object.keys(this.stats.currentStats).forEach(aid => {
      this.expanded[aid] = this.playersOnly;
    })
    this.statsHookId = Hooks.on("midi-qol.StatsUpdated", () => {
      if (this.#renderPending) return;
      this.#renderPending = true;
      setTimeout(() => {
        this.#renderPending = false;
        this.render({force: true});
      }, 500);
    });
  }

  static override DEFAULT_OPTIONS = {
    id: "midi-qol-statistics",
    window: {
      title: "midi-qol.StatsTitle",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 720,
      height: 600
    },
    actions: {
      clearStats: RollStatsDisplay.#onClearStats,
      exportJSON: RollStatsDisplay.#onExportJSON,
      exportCSV: RollStatsDisplay.#onExportCSV,
      endSession: RollStatsDisplay.#onEndSession,
      removeStats: RollStatsDisplay.#onRemoveStats,
      toggleExpand: RollStatsDisplay.#onToggleExpand,
      toggleItems: RollStatsDisplay.#onToggleItems,
      togglePeriod: RollStatsDisplay.#onTogglePeriod,
    }
  };

  static override PARTS = {
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    stats: {template: "modules/midi-qol/templates/stats/stats.hbs"},
    config: {template: "modules/midi-qol/templates/stats/config.hbs"}
  }

  tabGroups = {
    sheet: "stats"
  }

  get title() {
    return i18n("midi-qol.StatsTitle")
  }

  _onClose(options) {
    super._onClose(options);
    Hooks.off("midi-qol.StatsUpdated", this.statsHookId);
  }

  async _prepareContext(options) {
    const context: any = await super._prepareContext(options);
    context.stats = this.stats.prepareStats();
    Object.keys(context.stats).forEach(id => {
      if (this.playersOnly && game.user?.id !== id && game.actors?.get(id)?.permission !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
        delete context.stats[id];
      }
    });
    // Add hasItemStats flag and damage-type breakdowns per actor
    Object.keys(context.stats).forEach(id => {
      context.stats[id].hasItemStats = Object.keys(context.stats[id].itemStats).length > 0;
      context.stats[id].sessionDamageTakenByType = Object.entries(context.stats[id].sessionDamageTakenByType ?? {}).map(([type, amount]) => ({type, amount}));
      context.stats[id].lifetimeDamageTakenByType = Object.entries(context.stats[id].lifetimeDamageTakenByType ?? {}).map(([type, amount]) => ({type, amount}));
      context.stats[id].sessionDamageDealtByType = Object.entries(context.stats[id].sessionDamageDealtByType ?? {}).map(([type, amount]) => ({type, amount}));
      context.stats[id].lifetimeDamageDealtByType = Object.entries(context.stats[id].lifetimeDamageDealtByType ?? {}).map(([type, amount]) => ({type, amount}));
      context.stats[id].sessionDamageAppliedByType = Object.entries(context.stats[id].sessionDamageAppliedByType ?? {}).map(([type, amount]) => ({type, amount}));
      context.stats[id].lifetimeDamageAppliedByType = Object.entries(context.stats[id].lifetimeDamageAppliedByType ?? {}).map(([type, amount]) => ({type, amount}));
    });
    context.hasStats = Object.keys(context.stats).length > 0;
    context.isGm = game.user?.isGM;
    context.tabs = this.#getTabs();
    return context;
  }

  _preparePartContext(partId, context) {
    if (Object.keys(context.tabs).includes(partId)) {
      context.tab = context.tabs[partId];
    }
    return context;
  }

  #getTabs() {
    const tabs = {
      stats: {id: "stats", group: "sheet", label: i18n("midi-qol.RollStats"), active: true},
      config: {id: "config", group: "sheet", label: i18n("midi-qol.RollStatsConfig")}
    };
    return tabs;
  }

  async _onRender(context, options) {
    super._onRender(context, options);
    // Apply expand/collapse and session/lifetime state via CSS classes
    Object.keys(this.stats.currentStats).forEach(id => {
      const card = this.element.querySelector(`.midi-stats-card[data-actor-id="${id}"]`) as HTMLElement | null;
      if (card) {
        if (this.expanded[id]) card.classList.add("expanded");
        if (this.showLifetime[id]) card.classList.add("show-lifetime");
      }
      const itemsSection = this.element.querySelector(`.midi-stats-items-section[data-actor-id="${id}"]`) as HTMLElement | null;
      if (itemsSection && this.expandedItems[id]) {
        itemsSection.classList.add("expanded");
      }
    });
  }

  static #onClearStats(this: RollStatsDisplay) {
    this.stats.clearStats();
  }

  static #onExportJSON(this: RollStatsDisplay) {
    this.stats.exportToJSON();
  }

  static #onExportCSV(this: RollStatsDisplay) {
    this.stats.exportToCSV();
  }

  static #onEndSession(this: RollStatsDisplay) {
    this.stats.endSession();
  }

  static #onRemoveStats(this: RollStatsDisplay, event: Event, target: HTMLElement) {
    const actorId = target.dataset.actorId;
    if (actorId) {
      this.stats.clearActorStats(actorId);
      this.render({force: true});
    }
  }

  static #onToggleExpand(this: RollStatsDisplay, event: Event, target: HTMLElement) {
    const actorId = target.dataset.actorId;
    if (!actorId) return;
    this.expanded[actorId] = !this.expanded[actorId];
    const card = target.closest(".midi-stats-card") as HTMLElement | null;
    if (card) {
      card.classList.toggle("expanded");
    }
  }

  static #onToggleItems(this: RollStatsDisplay, event: Event, target: HTMLElement) {
    const actorId = target.dataset.actorId;
    if (!actorId) return;
    this.expandedItems[actorId] = !this.expandedItems[actorId];
    const section = target.closest(".midi-stats-items-section") as HTMLElement | null;
    if (section) {
      section.classList.toggle("expanded");
    }
  }

  static #onTogglePeriod(this: RollStatsDisplay, event: Event, target: HTMLElement) {
    event.stopPropagation(); // Prevent triggering toggleExpand on the parent header
    const actorId = target.dataset.actorId;
    if (!actorId) return;
    this.showLifetime[actorId] = !this.showLifetime[actorId];
    const card = target.closest(".midi-stats-card") as HTMLElement | null;
    if (card) {
      card.classList.toggle("show-lifetime", this.showLifetime[actorId]);
    }
  }
}
