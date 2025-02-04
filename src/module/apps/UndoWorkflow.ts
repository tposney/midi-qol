import { gameUser, i18n } from "../../midi-qol.js";
import { configSettings } from "../settings.js";
import { removeMostRecentWorkflow, undoDataQueue, undoMostRecentWorkflow } from "../undo.js";

export class UndoWorkflow extends FormApplication {
  undoAddedHookId: number;
  undoRemvoedHookId: number;

  async _updateObject() {
  };

  constructor(object: any, options: any = {}) {
    super(object, options);
    this.undoAddedHookId = Hooks.on("midi-qol.addUndoEntry", this.render.bind(this));
    this.undoRemvoedHookId = Hooks.on("midi-qol.removeUndoEntry", this.render.bind(this));
    if (!configSettings.undoWorkflow) {
      configSettings.undoWorkflow = true;
      //@ts-expect-error
      game.settings.set("midi-qol", "ConfigSettings", configSettings);
      ui.notifications?.warn("Undo Workflow enabled");
    }
  }

  async getData(options) {
    const data: any = await super.getData(options);
    data.entries = [];
    data.queueSize = new TextEncoder().encode(JSON.stringify(undoDataQueue)).length.toLocaleString();
    data.queueCount = undoDataQueue.length;
    for (let undoEntry of undoDataQueue) {
      const entry: any = {};
      entry.actorName = undoEntry.actorName;
      entry.itemName = undoEntry.itemName;
      entry.userName = undoEntry.userName;
      entry.targets = [];
      for (let targetEntry of undoEntry.allTargets) {
        entry.targets.push(targetEntry);
      }
      data.entries.push(entry)
    }
    return data;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n?.localize("midi-qol.UndoWorkflow.title") ?? "Undo Workflow",
      template: "modules/midi-qol/templates/undo-workflow.html",
      id: "midi-qol-undo-workflow",
      width: 400,
      height: 700,
      resizable: true,
    })
  }
  get title() {
    return i18n("midi-qol.UndoWorkflow.title") ?? "Undow Workflow";
  }

  async close(options = {}) {
    Hooks.off("midi-qol.addUndoEntry", this.undoAddedHookId);
    Hooks.off("midi-qol.removeUndoEntry", this.undoRemvoedHookId);
    return super.close(options);
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(`#undo-first-workflow`).on("click", (e) => {
      undoMostRecentWorkflow();
    })
    html.find(`#remove-first-workflow`).on("click", (e) => {
      removeMostRecentWorkflow();
    })
  }
}

export function showUndoWorkflowApp() {
  if (gameUser()?.isGM) {
    new UndoWorkflow({}).render(true, { focus: true })
  } else {
    ui.notifications?.warn("midi-qol.UndowWorkflow.GMOnly")
  }
}