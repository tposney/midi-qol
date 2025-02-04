import { warn, i18n, error, debug } from "../../midi-qol.js";
import { RollStats } from "../RollStats.js";
export class RollStatsDisplay extends FormApplication {

  statsHookId: number;
  playersOnly: boolean;
  // @ts-expect-error will be replaced in v2 anyway (which I have yet to do)
  object: RollStats;
  expanded: {};
  constructor(object: any, options) {
    super(object, options);
    this.playersOnly = options.playersOnly || !game.user?.isGM || false;
    this.expanded = {};
    // @ts-expect-error object set in super
    Object.keys(this.object.currentStats).forEach(aid => {
      this.expanded[aid] = this.playersOnly;
    })
    this.statsHookId = Hooks.on("midi-qol.StatsUpdated", () => {
      this.render();
    })
  }

  async _updateObject() { };

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: i18n("midi-qol.StatsTitle"),
      template: "modules/midi-qol/templates/roll-stats.html",
      id: "midi-qol-statistics",
      width: "500",
      height: "auto",
      resizable: true,
      scrollY: [".tab.stats"],
      tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "stats" }]
    })
  }

  get title() {
    return i18n("midi-qol.StatsTitle")
  }

  async close(options = {}) {
    Hooks.off("midi-qol.StatsUpdated", this.statsHookId);
    return super.close(options)
  }

  getData() {
    let data: any = super.getData();
    data.stats = this.object.prepareStats();
    Object.keys(data.stats).forEach(aid => {
      //@ts-expect-error DOCUMENT_PERMISSION_LEVELS
      const OWNER = foundry.utils.isNewerVersion(game.data.version, "12.0") ? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER : CONST.DOCUMENT_PERMISSION_LEVELS.OWNER;  
      if (this.playersOnly && game.user && game.actors?.get(aid)?.permission !== OWNER && game.user.id !== aid)
        delete data.stats[aid];
        
    })
    data.isGM = game.user?.isGM;
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    Object.keys(this.object.currentStats).forEach(id => {
      /*
            html.find(`#${id}-Items`).on("click", (e) => {
              e.preventDefault();
              this.expanded[id] = !this.expanded[id];
              html.find(`#${id}-Items-X`).toggle();
            })
      */
      if (!this.expanded[id]) html.find(`#${id}-X`).hide();

      html.find(`#${id}`).on("click", (e) => {
        e.preventDefault();
        this.expanded[id] = !this.expanded[id];
        html.find(`#${id}-X`).toggle();
        this.render();
      })

      html.find(`#clear-stats`).on("click", (e) => {
        this.object.clearStats();
      })

      html.find(`#export-stats-json`).on("click", (e) => {
        this.object.exportToJSON();
      })
      html.find(`#export-stats-csv`).on("click", (e) => {
        this.object.exportToCSV();
      })

      html.find(`#end-session`).on("click", (e) => {
        this.object.endSession();
      })

      Object.keys(this.object.currentStats).forEach(id => {
        html.find(`#remove-stats-${id}`).on("click", (e) => {
          this.object.clearActorStats(id);
          this.render();
        })
      });
    });
  }

  createStatsButton(html) {
    const statsButton = $(
      `<button type="button" name="show-stats" id="show-stats">
      <i class="fas fa-dice-d20"></i> {{localize "midi-qol.ShowStats"}}
      </button>`
    );

  }
}
