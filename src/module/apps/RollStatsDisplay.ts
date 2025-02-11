import { warn, i18n, error, debug } from "../../midi-qol.js";
import { RollStats } from "../RollStats.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RollStatsDisplay extends HandlebarsApplicationMixin(ApplicationV2) {

  statsHookId: number;
  playersOnly: boolean;
  stats: RollStats;
  expanded: {};

  constructor(options) {
    super(options);
    this.stats = options.stats;
    this.playersOnly = options.playersOnly || !game.user?.isGM || false;
    this.expanded = {};
    Object.keys(this.stats.currentStats).forEach(aid => {
      this.expanded[aid] = this.playersOnly;
    })
    this.statsHookId = Hooks.on("midi-qol.StatsUpdated", () => {
      this.render({force: true});
    });
  }

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "midi-qol-statistics",
    window: {
      title: "midi-qol.StatsTitle",
      resizable: true
    },
    position: {
      width: 500,
      height: "auto" as "auto"
    }
  }, { inplace: false });

  static PARTS = {
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

  _onRender(context, options) {
    super._onRender(context, options);
    Object.keys(this.stats.currentStats).forEach(id => {
      const elemX = this.element.querySelector(`#${id}-X`);
      // @ts-expect-error
      if (!this.expanded[id] && elemX) elemX.style.display = 'none';
      this.element.querySelector(`#${id}`)?.addEventListener("click", (e) => {
        e.preventDefault();
        this.expanded[id] = !this.expanded[id];
        // @ts-expect-error
        if (elemX) elemX.style.display = elemX.style.display === "" ? "none" : "";
        this.render({force: true});
      });
      this.element.querySelector(`#remove-stats-${id}`)?.addEventListener("click", (e) => {
        this.stats.clearActorStats(id);
        this.render({force: true});
      });
    });
    this.element.querySelector("#clear-stats")?.addEventListener("click", (e) => {
      this.stats.clearStats();
    });
    this.element.querySelector("#export-stats-json")?.addEventListener("click", (e) => {
      this.stats.exportToJSON();
    })
    this.element.querySelector("#export-stats-csv")?.addEventListener("click", (e) => {
      this.stats.exportToCSV();
    })
    this.element.querySelector("#end-session")?.addEventListener("click", (e) => {
      this.stats.endSession();
    })
  }
}
