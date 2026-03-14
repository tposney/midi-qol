import { i18n } from "../../midi-qol.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface ModuleReviewItem {
  id: string;
  title: string;
  savedVersion: string;
  currentVersion: string | null;
  status: "active" | "installed" | "missing";
  statusClass: string;
  badgeKey: string;
  badgeClass: string;
  canActivate: boolean;
  checked: boolean;
  versionMatch: boolean;
  versionLower: boolean;
}

export class ModuleReviewDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  savedModules: Record<string, { title: string; active: boolean; installed?: boolean; version: string; compatibility?: string }>;

  constructor(savedModules: Record<string, any>, options = {}) {
    super(options);
    this.savedModules = savedModules;
  }

  static override DEFAULT_OPTIONS = {
    id: "midi-module-review",
    classes: ["midi-module-review"],
    window: {
      title: "midi-qol.ModuleReview.Title",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 550,
      height: 600
    },
    actions: {
      selectAll: ModuleReviewDialog.#onSelectAll,
      deselectAll: ModuleReviewDialog.#onDeselectAll,
      applyModules: ModuleReviewDialog.#onApply
    }
  };

  static override PARTS = {
    modules: {
      template: "modules/midi-qol/templates/apps/ModuleReviewDialog/moduleReview.hbs",
      scrollable: [""]
    }
  };

  async _prepareContext(options) {
    const context: any = await super._prepareContext(options);
    const modules: ModuleReviewItem[] = [];

    for (const [id, saved] of Object.entries(this.savedModules)) {
      const currentModule = game.modules.get(id);
      let status: "active" | "installed" | "missing";
      let canActivate = false;
      let checked = false;

      if (currentModule?.active) {
        status = "active";
      } else if (currentModule) {
        status = "installed";
        canActivate = true;
        checked = true;
      } else {
        status = "missing";
      }

      const currentVersion = currentModule?.version ?? null;
      const versionMatch = currentVersion === saved.version;
      const versionLower = !!(currentVersion && saved.version && !versionMatch
        && foundry.utils.isNewerVersion(saved.version, currentVersion));

      const badgeKeyMap = {
        active: "midi-qol.ModuleReview.Active",
        installed: "midi-qol.ModuleReview.Installed",
        missing: "midi-qol.ModuleReview.NotInstalled"
      };
      const badgeClassMap = {
        active: "badge-active",
        installed: "badge-installed",
        missing: "badge-missing"
      };

      modules.push({
        id,
        title: saved.title ?? id,
        savedVersion: saved.version ?? "?",
        currentVersion,
        status,
        statusClass: status,
        badgeKey: badgeKeyMap[status],
        badgeClass: badgeClassMap[status],
        canActivate,
        checked,
        versionMatch,
        versionLower
      });
    }

    // Sort: missing first, then installed (activatable), then active
    const statusOrder = { missing: 0, installed: 1, active: 2 };
    modules.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.title.localeCompare(b.title));

    context.modules = modules;
    context.hasMissing = modules.some(m => m.status === "missing");
    return context;
  }

  static #onSelectAll(this: ModuleReviewDialog, event: Event) {
    event.preventDefault();
    const checkboxes = Array.from(this.element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)'));
    for (const cb of checkboxes) cb.checked = true;
  }

  static #onDeselectAll(this: ModuleReviewDialog, event: Event) {
    event.preventDefault();
    const checkboxes = Array.from(this.element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)'));
    for (const cb of checkboxes) cb.checked = false;
  }

  static async #onApply(this: ModuleReviewDialog, event: Event) {
    event.preventDefault();
    const checkboxes = Array.from(this.element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked:not(:disabled)'));
    const moduleIds: string[] = [];
    for (const cb of checkboxes) {
      const moduleId = cb.dataset.moduleId;
      if (moduleId) moduleIds.push(moduleId);
    }

    if (moduleIds.length === 0) {
      ui.notifications?.info(i18n("midi-qol.ModuleReview.NoChanges"));
      return;
    }

    // Get current module configuration and enable checked modules
    const moduleConfig = game.settings.get("core", "moduleConfiguration") as Record<string, boolean>;
    let changed = false;
    for (const id of moduleIds) {
      if (!moduleConfig[id]) {
        moduleConfig[id] = true;
        changed = true;
      }
    }

    if (!changed) {
      ui.notifications?.info(i18n("midi-qol.ModuleReview.NoChanges"));
      return;
    }

    await game.settings.set("core", "moduleConfiguration", moduleConfig);
    ui.notifications?.info(i18n("midi-qol.ModuleReview.ReloadPrompt"));
    this.close();
    foundry.utils.debouncedReload();
  }
}
