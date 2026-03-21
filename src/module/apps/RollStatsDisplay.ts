import { i18n, gameStats } from "../../midi-qol.js";
import { configSettings } from "../settings.js";
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

  constructor(options: any = {}) {
    super(options);
    this.stats = options.stats ?? gameStats;
    this.playersOnly = options.playersOnly ?? configSettings.playerStatsOnly ?? !game.user?.isGM;
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
      width: 820,
      height: 650
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
    stats: {template: "modules/midi-qol/templates/apps/RollStatsDisplay/stats.hbs", scrollable: ["", ".midi-stats-card-body"]},
    config: {template: "modules/midi-qol/templates/apps/RollStatsDisplay/config.hbs", scrollable: [""]}
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
    this.stats.saveStats();
  }

  async _prepareContext(options) {
    const context: any = await super._prepareContext(options);
    context.stats = this.stats.prepareStats();
    Object.keys(context.stats).forEach(id => {
      if (this.playersOnly && game.user?.id !== id && game.actors?.get(id)?.permission !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
        delete context.stats[id];
      }
    });
    // Add hasItemStats flag and build aligned damage-type column arrays per actor
    Object.keys(context.stats).forEach(id => {
      const s = context.stats[id];
      s.hasItemStats = Object.keys(s.itemStats).length > 0;

      // Damage dealt by type — union of all types across session+lifetime so columns align
      const sDealt = s.sessionDamageDealtByType ?? {};
      const sApplied = s.sessionDamageAppliedByType ?? {};
      const lDealt = s.lifetimeDamageDealtByType ?? {};
      const lApplied = s.lifetimeDamageAppliedByType ?? {};
      const dealtTypes = [...new Set([
        ...Object.keys(sDealt), ...Object.keys(lDealt),
        ...Object.keys(sApplied), ...Object.keys(lApplied)
      ])];
      s.damageDealtTypes = dealtTypes;
      s.sessionDamageByType = dealtTypes.map(type => ({
        dealt: sDealt[type] ?? 0, applied: sApplied[type] ?? 0
      }));
      s.lifetimeDamageByType = dealtTypes.map(type => ({
        dealt: lDealt[type] ?? 0, applied: lApplied[type] ?? 0
      }));

      // Damage taken by type — union across session+lifetime
      const sTaken = s.sessionDamageTakenByType ?? {};
      const lTaken = s.lifetimeDamageTakenByType ?? {};
      const takenTypes = [...new Set([...Object.keys(sTaken), ...Object.keys(lTaken)])];
      s.damageTakenTypes = takenTypes;
      s.sessionDmgTaken = takenTypes.map(type => sTaken[type] ?? 0);
      s.lifetimeDmgTaken = takenTypes.map(type => lTaken[type] ?? 0);
    });
    context.hasStats = Object.keys(context.stats).length > 0;
    context.isGm = game.user?.isGM;
    context.configSettings = configSettings;
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
    // Settings change listeners
    for (const name of ["keepRollStats", "playerStatsOnly"]) {
      this.element.querySelector(`input[name="${name}"]`)?.addEventListener("change", (e) => {
        configSettings[name] = (e.target as HTMLInputElement).checked;
        game.settings.set("midi-qol", "ConfigSettings", configSettings);
      });
    }
    this.element.querySelector('input[name="saveStatsEvery"]')?.addEventListener("change", (e) => {
      configSettings.saveStatsEvery = Number((e.target as HTMLInputElement).value);
      game.settings.set("midi-qol", "ConfigSettings", configSettings);
    });
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
