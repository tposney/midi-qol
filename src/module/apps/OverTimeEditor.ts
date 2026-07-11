import { i18n, MODULE_ID, GameSystemConfig } from "../../midi-qol.js";
import { serializeOvertimeDetails, parseBool, rollModeToMessageMode } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface OverTimeEditorOptions {
  value: string;
  effect: ActiveEffect;
  parent: Actor | Item | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export class OverTimeEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  declare originalValue: string;
  declare effect: ActiveEffect;
  declare parentDoc: Actor | Item | null;
  declare onSubmitCallback: (value: string) => void;
  declare onCancelCallback: () => void;
  declare submitted: boolean;
  declare currentData: Record<string, any>;
  declare originalSerialized: string;
  declare originalPermanent: boolean;

  constructor(editorOptions: OverTimeEditorOptions, appOptions?: Partial<foundry.applications.api.ApplicationV2.Configuration>) {
    super(appOptions);
    this.originalValue = editorOptions.value;
    this.effect = editorOptions.effect;
    this.parentDoc = editorOptions.parent;
    this.onSubmitCallback = editorOptions.onSubmit;
    this.onCancelCallback = editorOptions.onCancel;
    this.submitted = false;
    this.currentData = this.#buildFormData(this.originalValue);
    this.originalSerialized = this.#serializeCurrentData();
    this.originalPermanent = this.currentData.permanent;
  }

  static override DEFAULT_OPTIONS = {
    id: "midi-qol-overtime-editor",
    tag: "form" as const,
    window: {
      title: "midi-qol.OverTimeEditor.Title",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 550,
      height: 700
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: true,
      handler: OverTimeEditor.#onFormChange as any
    },
    actions: {
      save: OverTimeEditor.#onSave,
      cancel: OverTimeEditor.#onCancel
    }
  };

  static override PARTS = {
    form: {
      template: "modules/midi-qol/templates/apps/OverTimeEditor/overTimeEditor.hbs",
      scrollable: [".overtime-editor-scroll"]
    }
  };

  get title(): string {
    return `${i18n("midi-qol.OverTimeEditor.Title")}: ${this.effect?.name ?? ""}`;
  }

  /** Serialize currentData through the same serializer used for saving */
  #serializeCurrentData(): string {
    const data = { ...this.currentData };
    data.saveAbility = data.saveAbilityString;
    data.saveDC = data.saveDCRaw;
    return serializeOvertimeDetails(data);
  }

  get hasUnsavedChanges(): boolean {
    return this.#serializeCurrentData() !== this.originalSerialized;
  }

  override async close(options?: foundry.applications.api.ApplicationV2.ClosingOptions): Promise<this> {
    if (!this.submitted && this.hasUnsavedChanges) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: i18n("midi-qol.OverTimeEditor.UnsavedTitle") },
        content: `<p>${i18n("midi-qol.OverTimeEditor.UnsavedContent")}</p>`,
        yes: { label: i18n("midi-qol.OverTimeEditor.CloseWithoutSaving") },
        no: { label: i18n("midi-qol.OverTimeEditor.Cancel") }
      });
      if (!confirmed) return this;
    }
    return super.close(options);
  }

  /**
   * Parse the raw OverTime string into key=value pairs without @-field evaluation.
   * We don't call parseOvertimeDetails because that evaluates @-expressions via Roll.safeEval,
   * which would lose the raw formula strings the user needs to edit.
   */
  parseRawOvertime(specString: string): Record<string, string> {
    const raw: Record<string, string> = {};
    if (!specString) return raw;

    const cleanSpec = specString.replace(/\s*=\s*/g, "=").replace(/\s*,\s*/g, ",").replace("\n", "");
    let parts: string[];
    if (cleanSpec.includes("#")) parts = cleanSpec.split("#");
    else parts = cleanSpec.split(",");

    for (const part of parts) {
      const p = part.split("=");
      if (p.length >= 2) {
        raw[p[0]] = p.slice(1).join("=");
      }
    }
    return raw;
  }

  /** Build the internal form data representation from a raw OverTime string */
  #buildFormData(specString: string): Record<string, any> {
    const raw = this.parseRawOvertime(specString);

    const data: Record<string, any> = {
      turn: raw.turn || "start",
      label: (raw.name ?? raw.label ?? this.effect?.name ?? "").replace(/"/g, ""),
      rollType: raw.rollType ?? (raw.saveAbility ? "save" : "damage"),
      saveAbilityString: raw.saveAbility ?? "",
      saveDCRaw: raw.saveDC ?? "",
      saveMagic: parseBool(raw.saveMagic, false),
      damageRoll: raw.damageRoll ?? "",
      damageType: raw.damageType ?? "",
      damageBeforeSave: parseBool(raw.damageBeforeSave, false),
      saveDamage: raw.saveDamage ?? "nodamage",
      actionSave: raw.actionSave ?? "none",
      applyCondition: raw.applyCondition ?? raw.condition ?? "",
      removeCondition: raw.removeCondition ?? "",
      macro: raw.macro ?? "",
      itemName: raw.itemName ?? "",
      chatFlavor: raw.chatFlavor ?? "",
      rollMode: (raw.rollMode ? rollModeToMessageMode(raw.rollMode) : undefined) ?? "default",
      fastForwardDamage: parseBool(raw.fastForwardDamage, true),
      fastForwardAttack: parseBool(raw.fastForwardAttack, true),
      autoRollAttack: parseBool(raw.autoRollAttack, true),
      autoRollDamage: parseBool(raw.autoRollDamage, true),
      allowIncapacitated: parseBool(raw.allowIncapacitated, false),
      killAnim: parseBool(raw.killAnim, false),
      // Count fields — defaults
      saveCountEnabled: false,
      saveCountNum: 1,
      saveCountMode: "remove",
      saveCountConsecutive: false,
      saveCountEffectSpec: "",
      failCountEnabled: false,
      failCountNum: 1,
      failCountMode: "permanent",
      failCountConsecutive: false,
      failCountEffectSpec: "",
      // Runtime state from effect flags (not part of spec string)
      permanent: false,
    };

    // Parse save count
    if (raw.saveCount !== undefined) {
      data.saveCountEnabled = true;
      const parsed = this.parseCountFields(raw.saveCount);
      data.saveCountNum = parsed.count;
      data.saveCountMode = parsed.mode;
      data.saveCountConsecutive = parsed.consecutive;
      data.saveCountEffectSpec = parsed.effectSpec;
    } else if (raw.saveRemove !== undefined) {
      foundry.utils.logCompatibilityWarning(`midi-qol | OverTimeEditor | saveRemove is deprecated, use saveCount instead (saveRemove=${raw.saveRemove})`,
        { since: "midi-qol 13.0.43", until: "midi-qol 13.1.0" });
      if (raw.saveRemove === "true" || raw.saveRemove === "1") {
        data.saveCountEnabled = true;
        data.saveCountNum = 1;
        data.saveCountMode = "remove";
      } else if (raw.saveRemove !== "false" && raw.saveRemove !== "0") {
        data.saveCountEnabled = true;
        const parsed = this.parseCountFields(raw.saveRemove);
        data.saveCountNum = parsed.count;
        data.saveCountMode = parsed.mode;
        data.saveCountConsecutive = parsed.consecutive;
        data.saveCountEffectSpec = parsed.effectSpec;
      }
    }

    // Parse fail count
    if (raw.failCount !== undefined) {
      data.failCountEnabled = true;
      const parsed = this.parseCountFields(raw.failCount);
      data.failCountNum = parsed.count;
      data.failCountMode = parsed.mode;
      data.failCountConsecutive = parsed.consecutive;
      data.failCountEffectSpec = parsed.effectSpec;
    } else if (raw.failRemove !== undefined) {
      foundry.utils.logCompatibilityWarning(`midi-qol | OverTimeEditor | failRemove is deprecated, use failCount instead (failRemove=${raw.failRemove})`,
        { since: "midi-qol 13.0.43", until: "midi-qol 13.1.0" });
      data.failCountEnabled = true;
      const parsed = this.parseCountFields(raw.failRemove);
      data.failCountNum = parsed.count;
      data.failCountMode = parsed.mode;
      data.failCountConsecutive = parsed.consecutive;
      data.failCountEffectSpec = parsed.effectSpec;
    }

    // Read permanent flag from effect (runtime state, not part of spec string)
    data.permanent = !!(this.effect as any)?.flags?.[MODULE_ID]?.overtime?.permanent;

    return data;
  }

  override async _prepareContext(options: foundry.applications.api.ApplicationV2.RenderOptions) {
    const context: Record<string, any> = await super._prepareContext(options);

    context.details = this.currentData;

    // Computed visibility flags
    context.isSaveType = ["save", "check", "skill"].includes(this.currentData.rollType);
    context.isSaveRoll = this.currentData.rollType === "save";
    context.isCheckRoll = this.currentData.rollType === "check";
    context.isSkillRoll = this.currentData.rollType === "skill";
    context.showSaveDamage = context.isSaveType && !this.currentData.damageBeforeSave;

    // Selected abilities/skills from saveAbilityString
    const selectedValues = this.currentData.saveAbilityString
      ? this.currentData.saveAbilityString.split("|").map((s: string) => s.trim().toLowerCase())
      : [];
    context.selectedAbilities = selectedValues;
    context.selectedAbility = selectedValues[0] ?? "";

    // Ability options for selectOptions helper (save and check roll types)
    const abilitySelectOptions: Record<string, string> = {};
    for (const [key, value] of Object.entries(CONFIG.DND5E?.abilities ?? {})) {
      abilitySelectOptions[key] = (value as any).label ?? key;
    }
    context.abilitySelectOptions = abilitySelectOptions;

    // Skill options for selectOptions helper (skill roll type)
    const skillSelectOptions: Record<string, string> = {};
    for (const [key, value] of Object.entries(CONFIG.DND5E?.skills ?? {})) {
      skillSelectOptions[key] = (value as any).label ?? key;
    }
    context.skillSelectOptions = skillSelectOptions;

    // Count fields at top level for template access
    context.saveCountEnabled = this.currentData.saveCountEnabled;
    context.saveCountNum = this.currentData.saveCountNum;
    context.saveCountMode = this.currentData.saveCountMode;
    context.saveCountConsecutive = this.currentData.saveCountConsecutive;
    context.saveCountEffectSpec = this.currentData.saveCountEffectSpec;
    context.failCountEnabled = this.currentData.failCountEnabled;
    context.failCountNum = this.currentData.failCountNum;
    context.failCountMode = this.currentData.failCountMode;
    context.failCountConsecutive = this.currentData.failCountConsecutive;
    context.failCountEffectSpec = this.currentData.failCountEffectSpec;
    context.permanent = this.currentData.permanent;

    // Dropdown options
    context.turnOptions = {
      start: "midi-qol.OverTimeEditor.TurnStart",
      end: "midi-qol.OverTimeEditor.TurnEnd"
    };

    context.rollTypeOptions = {
      save: "midi-qol.OverTimeEditor.RollTypeSave",
      check: "midi-qol.OverTimeEditor.RollTypeCheck",
      skill: "midi-qol.OverTimeEditor.RollTypeSkill",
      damage: "midi-qol.OverTimeEditor.RollTypeDamage"
    };

    // Build damage type options from dnd5e config
    const damageTypeOptions: Record<string, string> = { "": "None" };
    const damageTypes = CONFIG.DND5E?.damageTypes ?? {};
    for (const [key, value] of Object.entries(damageTypes)) {
      damageTypeOptions[key] = (value as any).label ?? key;
    }
    const healingTypes = CONFIG.DND5E?.healingTypes ?? {};
    for (const [key, value] of Object.entries(healingTypes)) {
      damageTypeOptions[key] = (value as any).label ?? key;
    }
    // Add vitality if registered by midi-qol
    if (GameSystemConfig.damageTypes?.["vitality"]) {
      damageTypeOptions["vitality"] = GameSystemConfig.damageTypes["vitality"].label ?? "Vitality";
    }
    context.damageTypeOptions = damageTypeOptions;

    context.saveDamageOptions = {
      nodamage: "midi-qol.OverTimeEditor.NoDamage",
      halfdamage: "midi-qol.OverTimeEditor.HalfDamage",
      fulldamage: "midi-qol.OverTimeEditor.FullDamage"
    };

    context.countModeOptions = {
      remove: "midi-qol.OverTimeEditor.CountRemove",
      permanent: "midi-qol.OverTimeEditor.CountPermanent"
    };

    context.actionSaveOptions = {
      none: "midi-qol.OverTimeEditor.ActionSaveNone",
      dialog: "midi-qol.OverTimeEditor.ActionSaveDialog",
      roll: "midi-qol.OverTimeEditor.ActionSaveRoll"
    };

    // v14 message-mode values (was legacy publicroll/gmroll/blindroll/selfroll). Legacy stored values
    // are normalized to v14 on access (see doOverTimeEffect) so old over-time effects keep working.
    context.rollModeOptions = {
      default: "midi-qol.OverTimeEditor.RollModeDefault",
      public: "midi-qol.OverTimeEditor.RollModePublic",
      gm: "midi-qol.OverTimeEditor.RollModeGM",
      blind: "midi-qol.OverTimeEditor.RollModeBlind",
      self: "midi-qol.OverTimeEditor.RollModeSelf"
    };

    return context;
  }

  /** Parse a count action string into its component fields for the form */
  parseCountFields(value: string): { count: number; mode: string; consecutive: boolean; effectSpec: string } {
    let consecutive = false;
    let working = value;
    const digitEnd = working.search(/\D/);
    if (digitEnd > 0 && working[digitEnd] === "c") {
      consecutive = true;
      working = working.substring(0, digitEnd) + working.substring(digitEnd + 1);
    }

    const minusIndex = working.indexOf("-");
    const plusIndex = working.indexOf("+");

    let actionIndex = -1;
    let mode = "remove";
    if (minusIndex > 0 && (plusIndex === -1 || minusIndex < plusIndex)) {
      actionIndex = minusIndex;
      mode = "remove";
    } else if (plusIndex > 0) {
      actionIndex = plusIndex;
      mode = "permanent";
    }

    if (actionIndex === -1) {
      return { count: Number(working) || 1, mode: "remove", consecutive, effectSpec: "" };
    }

    const count = Number(working.substring(0, actionIndex)) || 1;
    const effectSpec = working.substring(actionIndex + 1) || "";
    return { count, mode, consecutive, effectSpec };
  }

  override async _onRender(context: Record<string, any>, options: foundry.applications.api.ApplicationV2.RenderOptions) {
    await super._onRender(context, options);

    // Drag-drop support for itemName and macro fields
    new foundry.applications.ux.DragDrop.implementation({
      dropSelector: "input[name='itemName'], input[name='macro']",
      callbacks: {
        drop: this.#onDrop.bind(this)
      }
    }).bind(this.element);
  }

  async #onDrop(ev: DragEvent): Promise<void> {
    ev.preventDefault();
    const data: any = foundry.applications.ux.TextEditor.getDragEventData(ev);
    if (data.uuid && ev.target) {
      (ev.target as HTMLInputElement).value = data.uuid;
    }
  }

  /** Handle form changes (submitOnChange) — updates internal state and re-renders */
  static async #onFormChange(
    this: OverTimeEditor,
    event: Event | SubmitEvent,
    form: HTMLFormElement,
    formData: foundry.applications.ux.FormDataExtended
  ): Promise<void> {
    const data = foundry.utils.expandObject(formData.object) as Record<string, any>;

    // Handle save ability/skill selection (multi-select returns array, single select returns string)
    if ("saveAbility" in data) {
      const val = data.saveAbility;
      if (Array.isArray(val)) {
        this.currentData.saveAbilityString = val.join("|");
      } else {
        this.currentData.saveAbilityString = val ?? "";
      }
    }

    // Handle renamed field
    if ("saveDC" in data) {
      this.currentData.saveDCRaw = data.saveDC;
    }

    // Direct-mapped fields (form name matches currentData name)
    // Only update if the field is present in the form data (hidden fields won't be)
    const directFields = [
      "turn", "label", "rollType", "saveMagic",
      "damageRoll", "damageType", "damageBeforeSave", "saveDamage",
      "actionSave", "applyCondition", "removeCondition",
      "macro", "itemName", "chatFlavor", "rollMode",
      "fastForwardDamage", "fastForwardAttack", "autoRollAttack", "autoRollDamage",
      "allowIncapacitated", "killAnim",
      "saveCountEnabled", "saveCountNum", "saveCountMode", "saveCountConsecutive", "saveCountEffectSpec",
      "failCountEnabled", "failCountNum", "failCountMode", "failCountConsecutive", "failCountEffectSpec",
      "permanent",
    ];

    for (const field of directFields) {
      if (field in data) {
        this.currentData[field] = data[field];
      }
    }

    this.render();
  }

  /** Save action — serialize current data and call the callback */
  static async #onSave(this: OverTimeEditor): Promise<void> {
    const data = { ...this.currentData };
    // Map internal names to what serializeOvertimeDetails expects
    data.saveAbility = data.saveAbilityString;
    data.saveDC = data.saveDCRaw;

    const result = serializeOvertimeDetails(data);

    // Update permanent flag on effect only if it changed
    if (this.currentData.permanent !== this.originalPermanent) {
      const flagUpdate: Record<string, any> = {
        [`flags.${MODULE_ID}.overtime.permanent`]: this.currentData.permanent || null
      };
      await (this.effect as ActiveEffect.Implementation).update(flagUpdate);
    }

    this.submitted = true;
    this.onSubmitCallback(result);
    this.close();
  }

  static #onCancel(this: OverTimeEditor): void {
    this.submitted = true;
    this.onCancelCallback();
    this.close();
  }

  override async _preClose(options): Promise<void> {
    await super._preClose(options);
    if (!this.submitted) {
      this.onCancelCallback();
    }
  }
}
