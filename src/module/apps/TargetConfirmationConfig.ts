import { i18n } from "../../midi-qol.js"
import { configSettings, defaultTargetConfirmationSettings, targetConfirmation } from "../settings.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TargetConfirmationConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  gridMappings: any;
  selectedPosition: {x: number, y: number};
i
  constructor(options) {
    super(options);
    this.gridMappings = {
      "midi-qol-grid1": {x: -1, y: -1},
      "midi-qol-grid2": {x: 0, y: -1},
      "midi-qol-grid3": {x: 1, y: -1},
      "midi-qol-grid4": {x: -1, y: 0},
      "midi-qol-grid5": {x: 0, y: 0},
      "midi-qol-grid6": {x: 1, y: 0},
      "midi-qol-grid7": {x: -1, y: 1},
      "midi-qol-grid8": {x: 0, y: 1},
      "midi-qol-grid9": {x: 1, y: 1}
    };
    this.selectedPosition = targetConfirmation.gridPosition ?? foundry.utils.duplicate(defaultTargetConfirmationSettings.gridPosition);
  }

  static PARTS = {
    main: { template: "modules/midi-qol/templates/targetConfirmationConfig.hbs" }
  };

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "midi-qol-target-confirmation-config",
    window: {
      title: "midi-qol.ConfigTitle"
    },
    position: {
      width: 400,
      height: "auto" as "auto"
    },
    form: {
      closeOnSubmit: true
    },
    actions: {
      submit: TargetConfirmationConfig.#onSubmit
    }
  }, { inplace: false });
    // scrollY: [".tab.workflow"],
    // tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "gm" }]

  async _updateObject(event, formData) {
    formData = foundry.utils.expandObject(formData);
    let newSettings = foundry.utils.mergeObject(targetConfirmation, formData, { overwrite: true, inplace: false })
    // const newSettings = foundry.utils.mergeObject(configSettings, expand, {overwrite: true})
    if (!newSettings.enabled) {
      newSettings = foundry.utils.duplicate(defaultTargetConfirmationSettings);
      newSettings.gridPosition = formData.gridPosition;
    }
    //@ts-expect-error
    game.settings?.set("midi-qol", "TargetConfirmation", newSettings);
    this.render(true);
    //@ts-expect-error
    game.settings?.set("midi-qol", "LateTargeting", "none");
    if (game.user?.isGM) configSettings.gmLateTargeting = "none";
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const selected = Object.keys(this.gridMappings).find(key => this.gridMappings[key].x === this.selectedPosition.x && this.gridMappings[key].y === this.selectedPosition.y);  
    this.element.querySelector(`#${selected}`)?.classList.add("selected");
    this.element.querySelector(".midi-enable-target-confirmation")?.addEventListener("click", event => {
      targetConfirmation.enabled = !targetConfirmation.enabled;
      this.render({force: true});
    });
    this.element.querySelector(".midi-always-target-confirmation")?.addEventListener("click", event => {
      targetConfirmation.all = !targetConfirmation.all;
      this.render({force: true});
    });
    const gridItems = this.element.querySelectorAll(".midi-qol .grid-item");
    gridItems.forEach((item) => {
      item.addEventListener("click", () => {
        gridItems.forEach((other) => {
          other.classList.remove("selected");
        });
        item.classList.toggle("selected");
        this.selectedPosition = this.gridMappings[item.id];
      });
    });
  }

  get title() {
    return i18n("Target Confirmation Config") ?? "Target Confirmation Config";
  }

  async _prepareContext(options) {
    const context: any = await super._prepareContext(options);
    context.targetConfirmation = targetConfirmation;
    return context;
  }

  async _preClose(options) {
    targetConfirmation.gridPosition = this.selectedPosition;
  }

  static async #onSubmit(event, target) {
    // @ts-expect-error
    this.close();
  }
}