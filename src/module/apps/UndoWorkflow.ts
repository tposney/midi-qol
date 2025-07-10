import { i18n } from "../../midi-qol.js";
import { configSettings } from "../settings.js";
import { removeMostRecentWorkflow, undoDataQueue, undoMostRecentWorkflow } from "../undo.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class UndoWorkflow extends HandlebarsApplicationMixin(ApplicationV2) {
  undoAddedHookId: number;
  undoRemovedHookId: number;

  constructor(options) {
    super(options);
    //@ts-expect-error
    this.undoAddedHookId = Hooks.on("midi-qol.addUndoEntry", this.render.bind(this));
    //@ts-expect-error
    this.undoRemovedHookId = Hooks.on("midi-qol.removeUndoEntry", this.render.bind(this));
    if (!configSettings.undoWorkflow) {
      configSettings.undoWorkflow = true;
      //@ts-expect-error
      game.settings.set("midi-qol", "ConfigSettings", configSettings);
      ui.notifications?.warn("Undo Workflow enabled");
    }
  }
  
  static override PARTS = {
    main: { template: "modules/midi-qol/templates/undo-workflow.hbs" },
  };
  
  static override DEFAULT_OPTIONS = {
    id: "midi-qol-undo-workflow",
    window: {
      title: "midi-qol.UndoWorkflow.title",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 400,
      height: 700
    }
  };
  
  async _prepareContext(options) {
    const context: any = await super._prepareContext(options);
    context.entries = [];
    context.queueSize = new TextEncoder().encode(JSON.stringify(undoDataQueue)).length.toLocaleString();
    context.queueCount = undoDataQueue.length;
    for (let undoEntry of undoDataQueue) {
      const entry: any = {};
      entry.actorName = undoEntry.actorName;
      entry.itemName = undoEntry.itemName;
      entry.userName = undoEntry.userName;
      entry.targets = [];
      for (let targetEntry of undoEntry.allTargets) {
        entry.targets.push(targetEntry);
      }
      context.entries.push(entry)
    }
    return context;
  }

  async _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("#undo-first-workflow")?.addEventListener("click", (e) => {
      undoMostRecentWorkflow();
    });
    this.element.querySelector("#remove-first-workflow")?.addEventListener("click", (e) => {
      removeMostRecentWorkflow();
    })
  }

  get title() {
    return i18n("midi-qol.UndoWorkflow.title") ?? "Undo Workflow";
  }

  async close(options = {}) {
    //@ts-expect-error
    Hooks.off("midi-qol.addUndoEntry", this.undoAddedHookId);
    //@ts-expect-error
    Hooks.off("midi-qol.removeUndoEntry", this.undoRemovedHookId);
    return super.close(options);
  }
}

export function showUndoWorkflowApp() {
  if (game.user?.isGM) {
    new UndoWorkflow({}).render({force: true});
  } else {
    ui.notifications?.warn("midi-qol.UndoWorkflow.GMOnly")
  }
}