import { i18n, MODULE_ID } from "../../midi-qol.js";

/**
 * Custom RegionBehaviorConfig sheet for the midi-qol.regionActivity behavior type.
 *
 * The default RegionBehaviorConfig skips the `rules` ArrayField because ArrayField
 * has no `hasFormSupport`. This subclass renders the standard simple fields via the
 * parent's `_getFields()` and adds a dynamic rules section with add/remove rows.
 * Each rule has trigger/action selects and a `<document-tags single>` element for
 * the target UUID (native drag-and-drop support).
 *
 * Rules are maintained as a local working copy (_workingRules) and only persisted
 * to the document on form submit via _prepareSubmitData.
 */

const RegionBehaviorConfig = foundry.applications.sheets.RegionBehaviorConfig;

export class MidiRegionBehaviorConfig extends RegionBehaviorConfig {
  /** Local working copy of rules, synced from document on first render. */
  declare _workingRules: Array<{ trigger: string; action: string; targetUuid: string }>;

  static override DEFAULT_OPTIONS = {
    classes: ["region-behavior-config", "midi-region-behavior-config"],
    window: {
      contentClasses: ["standard-form"],
      icon: undefined as string | undefined,
    },
    position: { width: 600 },
    form: {
      closeOnSubmit: true,
    },
    actions: {
      addRule: MidiRegionBehaviorConfig.#onAddRule,
      deleteRule: MidiRegionBehaviorConfig.#onDeleteRule,
    }
  };

  static override PARTS = {
    form: {
      template: "modules/midi-qol/templates/apps/MidiRegionBehaviorConfig/midiRegionBehaviorConfig.hbs",
      scrollable: [""]
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  override async _prepareContext(options: any) {
    const context: any = await super._prepareContext(options);

    // Initialize working rules from document source on first render
    if (!this._workingRules) {
      const source = (this as any).document._source;
      const docRules = source.system?.rules ?? [];
      this._workingRules = docRules.map((r: any) => ({
        trigger: r.trigger ?? "entry",
        action: r.action ?? "useActivity",
        targetUuid: r.targetUuid ?? "",
      }));
    }

    context.triggerChoices = [
      { value: "entry", label: i18n("midi-qol.REGION_BEHAVIOR.triggers.entry") },
      { value: "exit", label: i18n("midi-qol.REGION_BEHAVIOR.triggers.exit") },
      { value: "turnStart", label: i18n("midi-qol.REGION_BEHAVIOR.triggers.turnStart") },
      { value: "turnEnd", label: i18n("midi-qol.REGION_BEHAVIOR.triggers.turnEnd") },
    ];

    context.actionChoices = [
      { value: "useActivity", label: i18n("midi-qol.REGION_BEHAVIOR.actions.useActivity") },
      { value: "applyEffect", label: i18n("midi-qol.REGION_BEHAVIOR.actions.applyEffect") },
      { value: "removeEffect", label: i18n("midi-qol.REGION_BEHAVIOR.actions.removeEffect") },
    ];

    context.rules = this._workingRules.map((rule, index) => ({
      ...rule,
      index,
    }));

    return context;
  }

  /** Sync working rules from form inputs before mutations or submit. */
  #syncFromForm(): void {
    const form = (this as any).element?.querySelector?.("form") ?? (this as any).element;
    if (!form) return;
    const ruleRows = Array.from(form.querySelectorAll(".rule-row")) as HTMLElement[];
    for (let i = 0; i < ruleRows.length; i++) {
      if (i >= this._workingRules.length) break;
      const row = ruleRows[i];
      const triggerSelect = row.querySelector("select[data-field='trigger']") as HTMLSelectElement | null;
      const actionSelect = row.querySelector("select[data-field='action']") as HTMLSelectElement | null;
      const tagsEl = row.querySelector("document-tags") as any;
      if (triggerSelect) this._workingRules[i].trigger = triggerSelect.value;
      if (actionSelect) this._workingRules[i].action = actionSelect.value;
      if (tagsEl) this._workingRules[i].targetUuid = tagsEl.value ?? "";
    }
  }

  /**
   * Collect rules data from the working copy and merge into the submit data
   * so the rules ArrayField is properly updated on save.
   */
  override _prepareSubmitData(event: SubmitEvent, form: HTMLFormElement, formData: any, updateData?: any): Record<string, any> {
    const data: Record<string, any> = super._prepareSubmitData(event, form, formData, updateData);
    this.#syncFromForm();
    data["system.rules"] = this._workingRules;
    return data;
  }

  static #onAddRule(this: MidiRegionBehaviorConfig): void {
    this.#syncFromForm();
    this._workingRules.push({ trigger: "entry", action: "useActivity", targetUuid: "" });
    this.render();
  }

  static #onDeleteRule(this: MidiRegionBehaviorConfig, event: Event, target: HTMLElement): void {
    const row = target.closest("[data-index]") as HTMLElement | null;
    const index = Number(row?.dataset.index);
    if (isNaN(index) || index < 0 || index >= this._workingRules.length) return;
    this.#syncFromForm();
    this._workingRules.splice(index, 1);
    this.render();
  }
}
