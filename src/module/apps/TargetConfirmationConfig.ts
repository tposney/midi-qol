import { i18n } from "../../midi-qol.js"
import { configSettings, defaultTargetConfirmationSettings, targetConfirmation } from "../settings.js";

export class TargetConfirmationConfig extends FormApplication {
  gridMappings: any;
  // @ts-expect-error
  selectedPosition: {x: number, y: number};

  constructor(object, options) {
    super(object, options);
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
    }
  }
  static get defaultOptions(): any {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: i18n("midi-qol.ConfigTitle") ?? "Target Confirmation Config",
      template: "modules/midi-qol/templates/targetConfirmationConfig.html",
      id: "midi-qol-target-confirmation-config",
      width: 400,
      height: "auto",
      closeOnSubmit: true,
      scrollY: [".tab.workflow"],
      tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "gm" }]
    })
  }
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

  activateListeners(html) {
    super.activateListeners(html);
    const selected = Object.keys(this.gridMappings).find(key => this.gridMappings[key].x === this.selectedPosition.x && this.gridMappings[key].y === this.selectedPosition.y);  
    html.find(`#${selected}`).addClass("selected");
    html.find(".midi-enable-target-confirmation").on("click", event => {
      targetConfirmation.enabled = !targetConfirmation.enabled;
      this.render(true);
    });
    html.find(".midi-always-target-confirmation").on("click", event => {
      targetConfirmation.all = !targetConfirmation.all;
      this.render(true);
    });
    const gridItems = document.querySelectorAll(".midi-qol .grid-item");

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

  getData(options?: Application.RenderOptions | undefined): any {
    const data: any = super.getData(options);
    if (!this.selectedPosition) this.selectedPosition = targetConfirmation.gridPosition ?? foundry.utils.duplicate(defaultTargetConfirmationSettings.gridPosition);
    data.targetConfirmation = targetConfirmation;
    return data;
  }

  protected _onSubmit(event: Event, options: any | undefined): Promise<Partial<Record<string, unknown>>> {
    targetConfirmation.gridPosition = this.selectedPosition;
    return super._onSubmit(event, options);
  }
}