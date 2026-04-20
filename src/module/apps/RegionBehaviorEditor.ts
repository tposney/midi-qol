import { i18n, MODULE_ID } from "../../midi-qol.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RegionBehaviorEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  declare activity: any;
  declare _workingRules: Array<{trigger: string, action: string, targetId: string}>;

  constructor(activity: any, appOptions?: Partial<foundry.applications.api.ApplicationV2.Configuration>) {
    super(appOptions);
    this.activity = activity;
    this._workingRules = [...(activity.regionBehavior?.rules ?? [])].map((r: any) => ({
      trigger: r.trigger ?? "entry",
      action: r.action ?? "useActivity",
      targetId: r.targetId ?? "",
    }));
  }

  static override DEFAULT_OPTIONS = {
    id: "midi-qol-region-behavior-editor",
    tag: "form" as const,
    window: {
      title: "midi-qol.REGION_BEHAVIOR.editor.title",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 560,
      height: "auto" as const,
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: false,
    },
    actions: {
      save: RegionBehaviorEditor.#onSave,
      cancel: RegionBehaviorEditor.#onCancel,
      addRule: RegionBehaviorEditor.#onAddRule,
      deleteRule: RegionBehaviorEditor.#onDeleteRule,
    }
  };

  static override PARTS = {
    form: {
      template: "modules/midi-qol/templates/apps/RegionBehaviorEditor/regionBehaviorEditor.hbs",
      scrollable: [""]
    }
  };

  get title(): string {
    return `${i18n("midi-qol.REGION_BEHAVIOR.editor.title")}: ${this.activity?.item?.name ?? ""}`;
  }

  override async _prepareContext(options: foundry.applications.api.ApplicationV2.RenderOptions) {
    const context: Record<string, any> = await super._prepareContext(options);
    const rb = this.activity.regionBehavior ?? {};
    const item = this.activity.item;

    context.enabled = rb.enabled ?? false;
    context.dispositionFilter = rb.dispositionFilter ?? -1;
    context.excludeSource = rb.excludeSource ?? true;
    context.oncePerTurn = rb.oncePerTurn ?? true;
    context.wallRestriction = rb.wallRestriction ?? "none";
    context.regionVisibility = rb.regionVisibility ?? CONST.REGION_VISIBILITY.ALWAYS;

    // Wall restriction dropdown — uses Foundry's EDGE_RESTRICTION_TYPES plus "none"
    // @ts-expect-error fvtt-types missing EDGE_RESTRICTION_TYPES
    const edgeTypes: string[] = CONST.EDGE_RESTRICTION_TYPES as string[];
    context.wallRestrictionOptions = [
      { value: "none", label: i18n("midi-qol.REGION_BEHAVIOR.wallRestriction.none"), selected: context.wallRestriction === "none" },
      ...edgeTypes.map((type: string) => ({
        value: type,
        label: game.i18n?.localize(`REGION.RESTRICTION_TYPES.${type}.label`) ?? type,
        selected: context.wallRestriction === type,
      })),
    ];

    // Region visibility dropdown — uses core REGION_VISIBILITY options
    context.regionVisibilityOptions = Object.entries(CONST.REGION_VISIBILITY).map(([key, value]) => ({
      value: String(value),
      label: game.i18n?.localize(`REGION.VISIBILITY.${key}.label`) ?? key,
      selected: context.regionVisibility === value,
    }));

    // Disposition dropdown
    context.dispositionOptions = [
      { value: "-1", label: i18n("midi-qol.REGION_BEHAVIOR.disposition.enemies"), selected: String(context.dispositionFilter) === "-1" },
      { value: "0", label: i18n("midi-qol.REGION_BEHAVIOR.disposition.all"), selected: String(context.dispositionFilter) === "0" },
      { value: "1", label: i18n("midi-qol.REGION_BEHAVIOR.disposition.allies"), selected: String(context.dispositionFilter) === "1" },
    ];

    // Trigger choices
    context.triggerChoices = [
      { value: "entry", label: i18n("midi-qol.REGION_BEHAVIOR.triggers.entry") },
      { value: "exit", label: i18n("midi-qol.REGION_BEHAVIOR.triggers.exit") },
      { value: "turnStart", label: i18n("midi-qol.REGION_BEHAVIOR.triggers.turnStart") },
      { value: "turnEnd", label: i18n("midi-qol.REGION_BEHAVIOR.triggers.turnEnd") },
    ];

    // Action choices
    context.actionChoices = [
      { value: "useActivity", label: i18n("midi-qol.REGION_BEHAVIOR.actions.useActivity") },
      { value: "applyEffect", label: i18n("midi-qol.REGION_BEHAVIOR.actions.applyEffect") },
      { value: "removeEffect", label: i18n("midi-qol.REGION_BEHAVIOR.actions.removeEffect") },
    ];

    // Target options split by type — activities vs effects
    const activityTargets: { value: string; label: string }[] = [];
    for (const act of item?.system?.activities ?? []) {
      const id = act.identifier || act.midiProperties?.identifier;
      if (id && act.isTriggerableActivity) {
        activityTargets.push({ value: id, label: act.name || id });
      }
    }

    const effectTargets: { value: string; label: string }[] = [];
    for (const effect of item?.effects ?? []) {
      if (effect.transfer) continue;
      effectTargets.push({ value: effect.id, label: effect.name || effect.id });
    }

    // Build rules array from working copy, with per-rule target options
    context.rules = this._workingRules.map((rule, index) => ({
      ...rule,
      index,
      targetOptions: rule.action === "useActivity" ? activityTargets : effectTargets,
    }));

    return context;
  }

  override async _onRender(context: any, options: any): Promise<void> {
    await super._onRender(context, options);
    // When the action dropdown changes, sync and re-render so the target dropdown
    // shows only activities (for useActivity) or effects (for applyEffect/removeEffect)
    for (const select of Array.from(this.element.querySelectorAll<HTMLSelectElement>("select[name$='.action']"))) {
      select.addEventListener("change", () => {
        this.#syncFromForm();
        this.render();
      });
    }
  }

  /** Sync working rules from form inputs before add/delete/save */
  #syncFromForm(): void {
    const form = this.element.querySelector("form");
    if (!form) return;
    const formData = new foundry.applications.ux.FormDataExtended(form);
    const data = foundry.utils.expandObject(formData.object) as Record<string, any>;
    if (data.rules) {
      const rulesObj = data.rules as Record<string, any>;
      for (const [indexStr, ruleData] of Object.entries(rulesObj)) {
        const idx = Number(indexStr);
        if (idx >= 0 && idx < this._workingRules.length && ruleData) {
          this._workingRules[idx].trigger = ruleData.trigger ?? this._workingRules[idx].trigger;
          this._workingRules[idx].action = ruleData.action ?? this._workingRules[idx].action;
          this._workingRules[idx].targetId = ruleData.targetId ?? this._workingRules[idx].targetId;
        }
      }
    }
  }

  static #onAddRule(this: RegionBehaviorEditor): void {
    this.#syncFromForm();
    this._workingRules.push({ trigger: "entry", action: "useActivity", targetId: "" });
    this.render();
  }

  static #onDeleteRule(this: RegionBehaviorEditor, event: Event, target: HTMLElement): void {
    this.#syncFromForm();
    const row = target.closest("[data-index]") as HTMLElement | null;
    const index = Number(row?.dataset.index);
    if (!isNaN(index) && index >= 0 && index < this._workingRules.length) {
      this._workingRules.splice(index, 1);
    }
    this.render();
  }

  static async #onSave(this: RegionBehaviorEditor): Promise<void> {
    this.#syncFromForm();

    const form = this.element.querySelector("form");
    if (!form) return;
    const formData = new foundry.applications.ux.FormDataExtended(form);
    const data = foundry.utils.expandObject(formData.object) as Record<string, any>;

    const update: Record<string, any> = {
      "regionBehavior.enabled": data.enabled ?? false,
      "regionBehavior.dispositionFilter": Number(data.dispositionFilter ?? -1),
      "regionBehavior.excludeSource": data.excludeSource ?? true,
      "regionBehavior.oncePerTurn": data.oncePerTurn ?? true,
      "regionBehavior.wallRestriction": data.wallRestriction ?? "none",
      "regionBehavior.regionVisibility": Number(data.regionVisibility ?? CONST.REGION_VISIBILITY.ALWAYS),
      "regionBehavior.rules": this._workingRules,
    };

    await this.activity.update(update);
    await this.close();
  }

  static #onCancel(this: RegionBehaviorEditor): void {
    this.close();
  }
}
