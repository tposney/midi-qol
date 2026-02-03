import { i18n } from "../../midi-qol.js"
import { configSettings, defaultTargetConfirmationSettings, targetConfirmation } from "../settings.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TargetConfirmationConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  gridMappings = {
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
  selectedPosition: {x: number, y: number} = targetConfirmation.gridPosition ?? foundry.utils.duplicate(defaultTargetConfirmationSettings.gridPosition);

  static override PARTS = {
    main: { template: "modules/midi-qol/templates/apps/TargetConfirmationConfig/targetConfirmationConfig.hbs" }
  };

  static override DEFAULT_OPTIONS = {
    id: "midi-qol-target-confirmation-config",
    window: {
      title: "midi-qol.ConfigTitle",
      contentClasses: ["standard-form"]
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
  };
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
    game.settings.set("midi-qol", "TargetConfirmation", newSettings);
    this.render({ force: true });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const selected = Object.keys(this.gridMappings).find(key => this.gridMappings[key].x === this.selectedPosition.x && this.gridMappings[key].y === this.selectedPosition.y);  
    this.element.querySelector(`#${selected}`)?.classList.add("selected");
    const checkboxes = this.element.querySelectorAll('form .form-group input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("click", () => {
        // @ts-expect-error
        targetConfirmation[checkbox.name] = !targetConfirmation[checkbox.name];
        this.render({force: true});
      })
    })
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
    await game.settings.set("midi-qol", "TargetConfirmation", targetConfirmation);
  }

  static async #onSubmit(this: TargetConfirmationConfig, event, target) {
    this.close();
  }
}