import { i18n, GameSystemConfig } from "../../midi-qol.js";
import { RollModifierTracker } from "../lib/RollModifierTracker.js";
import { getToolLabel } from "../utils.js";

/**
 * A choice entry for the dropdown in the roll dialog.
 */
export interface RollChoice {
  value: string;
  label: string;
  modifier: string;
}

/**
 * Pre-computed advantage data for a specific choice, keyed by ability or skill ID.
 *
 * trackerData: Serialized RollModifierTracker (via toJSON()) for socketlib transfer.
 * tracker: The deserialized RollModifierTracker instance (populated by GMAction).
 *
 * Class instances don't survive socketlib serialization, so Workflow.ts serializes
 * to trackerData, and GMAction deserializes back to tracker before calling doRollAbility.
 */
export interface PreComputedAdvantage {
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  defaultButton: "advantage" | "disadvantage" | "normal";
  trackerData?: object;
  tracker?: RollModifierTracker;
}

/**
 * Custom D20 roll dialog that adds a filtered choice dropdown when multiple
 * abilities or skills are available for a save/check. Follows the same pattern as
 * dnd5e's SkillToolRollConfigurationDialog.
 *
 * The dialog is used via `dialog.applicationClass = MidiRollChoiceDialog` and
 * `dialog.options.rollChoices` / `dialog.options.advantageByChoice`.
 *
 * Set `dialog.options.choiceType` to `"ability"` (default), `"skill"`, or
 * `"tool"` to control which config property the dropdown reads/writes.
 */
//@ts-expect-error D20RollConfigurationDialog is not typed
const D20RollConfigurationDialog = dnd5e.applications?.dice?.D20RollConfigurationDialog;
export class MidiRollChoiceDialog extends D20RollConfigurationDialog {
  // Only here to satisfy the linter
  static get rollType() { return super.rollType; }

  get config(): any { return super.config; }
  get message(): any { return super.message; }
  get rolls(): any { return super.rolls; }

  /** Mutable default button override — options are frozen by ApplicationV2, so we track it here instead */
  _midiDefaultButton: string | undefined;

  /** @override */
  static DEFAULT_OPTIONS = {
    rollChoices: [] as RollChoice[],
    advantageByChoice: new Map<string, PreComputedAdvantage>(),
    choiceType: "ability" as "ability" | "skill" | "tool"
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override — restore focus to autofocus button after partial re-render of buttons part */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    if (partId === "buttons") {
      (newElement.querySelector("[autofocus]") as HTMLElement | null)?.focus();
    }
  }

  /** @override — read defaultButton from mutable _midiDefaultButton when set, instead of frozen options */
  async _prepareButtonsContext(context, options) {
    context = await super._prepareButtonsContext(context, options);
    const overrideButton = this._midiDefaultButton;
    if (overrideButton) {
      for (const [key, btn] of Object.entries(context.buttons ?? {}) as [string, any][]) {
        btn.default = (key === overrideButton);
      }
    }
    return context;
  }

  /** @override */
  async _prepareConfigurationContext(context, options) {
    context = await super._prepareConfigurationContext(context, options);
    const choices: RollChoice[] = (this as any).options.rollChoices;
    const choiceType: string = (this as any).options.choiceType ?? "ability";
    if (choices?.length > 1) {
      context.fields.unshift({
        field: new foundry.data.fields.StringField({
          required: true, blank: false, label: i18n("midi-qol.RollChoice")
        }),
        name: choiceType,
        options: choices.map(c => ({
          value: c.value,
          label: `${c.label} (${c.modifier})`
        })),
        value: choiceType === "skill" ? this.config.skill : choiceType === "tool" ? this.config.tool : this.config.ability
      });
    }
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const choiceType: string = (this as any).options.choiceType ?? "ability";

    if (event.target?.name === choiceType) {
      const newValue = event.target.value;

      if (choiceType === "tool") {
        // Tool change: update config.tool and window title
        this.config.tool = newValue;
        const toolLabel = getToolLabel(newValue);
        //@ts-expect-error i18n format
        const flavor = game.i18n.format("DND5E.ToolPromptTitle", { tool: toolLabel });
        foundry.utils.setProperty(this.message, "data.flavor", flavor);
        (this as any)._updateFrame({ window: { title: flavor } });
      } else if (choiceType === "skill") {
        // Skill change: update config.skill and window title
        this.config.skill = newValue;
        const skillLabel = GameSystemConfig.skills[newValue]?.label ?? "";
        const abilityLabel = GameSystemConfig.abilities[this.config.ability]?.label ?? "";
        //@ts-expect-error i18n format
        const flavor = game.i18n.format("DND5E.SkillPromptTitle", { skill: skillLabel, ability: abilityLabel });
        foundry.utils.setProperty(this.message, "data.flavor", flavor);
        (this as any)._updateFrame({ window: { title: flavor } });
      } else {
        // Ability change (save): update config.ability and window title
        this.config.ability = newValue;
        const abilityLabel = GameSystemConfig.abilities[newValue]?.label ?? "";
        //@ts-expect-error i18n format
        const flavor = game.i18n.format("DND5E.SavePromptTitle", { ability: abilityLabel });
        foundry.utils.setProperty(this.message, "data.flavor", flavor);
        (this as any)._updateFrame({ window: { title: flavor } });
      }

      // Update advantage/disadvantage from pre-computed map
      const advantageMap: Map<string, PreComputedAdvantage> | undefined = (this as any).options.advantageByChoice;
      const preComputed = advantageMap?.get(newValue);
      if (preComputed) {
        this._midiDefaultButton = preComputed.defaultButton;
        // Re-render buttons to reflect new advantage state
        (this as any).render({ parts: ["buttons"] });
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Factory to create a buildConfig callback for rebuilding save roll parts
   * when the player changes the ability dropdown.
   *
   * This follows the same pattern as dnd5e's `_buildSkillToolConfig` callback
   * used by SkillToolRollConfigurationDialog.
   */
  /**
   * Apply pre-computed advantage/disadvantage to a roll config's options so
   * that D20Roll.fromConfig → configureModifiers() produces the correct formula.
   */
  static applyPreComputedAdvantage(rollConfig: any, preComputed: PreComputedAdvantage | undefined): void {
    if (!preComputed) return;
    rollConfig.options ??= {};
    //@ts-expect-error no dnd5e-types
    const ADV = CONFIG.Dice.D20Roll.ADV_MODE;
    if (preComputed.hasAdvantage && !preComputed.hasDisadvantage) {
      rollConfig.options.advantageMode = ADV.ADVANTAGE;
    } else if (!preComputed.hasAdvantage && preComputed.hasDisadvantage) {
      rollConfig.options.advantageMode = ADV.DISADVANTAGE;
    } else {
      rollConfig.options.advantageMode = ADV.NORMAL;
    }
    // Clear legacy flags so configureModifiers() uses advantageMode directly
    delete rollConfig.options.advantage;
    delete rollConfig.options.disadvantage;
  }

  static createSaveBuildConfig(actor: Actor.Implementation, advantageByChoice?: Map<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void {
    return (processConfig, rollConfig, formData, index) => {
      if (index !== 0) return;
      // Get ability from formData if available, otherwise fall back to processConfig for initial render
      const newAbility = formData?.get?.("ability") ?? processConfig.ability;
      if (!newAbility || typeof newAbility !== "string") return;

      //@ts-expect-error no dnd5e-types
      const abilityData = actor.system.abilities?.[newAbility];
      if (!abilityData) return;

      const rollData = actor.getRollData();
      //@ts-expect-error no dnd5e-types
      const { parts, data } = CONFIG.Dice.D20Roll.constructParts({
        mod: abilityData.mod,
        prof: abilityData.saveProf?.hasProficiency ? abilityData.saveProf.term : null,
        [`${newAbility}SaveBonus`]: abilityData.bonuses?.save,
        //@ts-expect-error no dnd5e-types
        saveBonus: actor.system.bonuses?.abilities?.save,
        //@ts-expect-error no dnd5e-types
        cover: (newAbility === "dex") ? actor.system.attributes?.ac?.cover : null
      }, rollData);

      // Add exhaustion if the method exists
      //@ts-expect-error no dnd5e-types
      actor.addRollExhaustion?.(parts, data);

      // Replace the roll parts (not append, since the clone has the original ability's parts)
      rollConfig.parts = parts;
      rollConfig.data = data;
      // Update advantage mode so the formula shows the correct d20 dice
      MidiRollChoiceDialog.applyPreComputedAdvantage(rollConfig, advantageByChoice?.get(newAbility));
      // Update processConfig so postRollConfiguration hook sees the chosen ability
      processConfig.ability = newAbility;
    };
  }

  /**
   * Factory to create a buildConfig callback for rebuilding skill roll parts
   * when the player changes the skill dropdown.
   *
   * Mirrors dnd5e's `_buildSkillToolConfig` callback but for skill-to-skill changes.
   */
  static createSkillBuildConfig(actor: Actor.Implementation, advantageByChoice?: Map<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void {
    return (processConfig, rollConfig, formData, index) => {
      if (index !== 0) return;
      // Get skill from formData if available, otherwise fall back to processConfig for initial render
      const newSkill = formData?.get?.("skill") ?? processConfig.skill;
      if (!newSkill || typeof newSkill !== "string") return;

      //@ts-expect-error no dnd5e-types
      const skillData = actor.system.skills?.[newSkill];
      if (!skillData) return;

      const abilityId = skillData.ability;
      //@ts-expect-error no dnd5e-types
      const ability = actor.system.abilities?.[abilityId];
      const rollData = actor.getRollData();

      //@ts-expect-error no dnd5e-types
      const { calculateSkillToolProficiency } = dnd5e.dataModels.actor.CommonTemplate;
      let prof = calculateSkillToolProficiency(actor, abilityId, { skill: newSkill });

      //@ts-expect-error no dnd5e-types
      const { parts, data } = CONFIG.Dice.D20Roll.constructParts({
        mod: ability?.mod,
        prof: prof?.hasProficiency ? prof.term : null,
        [`${newSkill}Bonus`]: skillData.bonuses?.check,
        [`${abilityId}CheckBonus`]: ability?.bonuses?.check,
        //@ts-expect-error no dnd5e-types
        skillBonus: actor.system.bonuses?.abilities?.skill,
        //@ts-expect-error no dnd5e-types
        abilityCheckBonus: actor.system.bonuses?.abilities?.check
      }, rollData);

      // Add exhaustion if the method exists
      //@ts-expect-error no dnd5e-types
      actor.addRollExhaustion?.(parts, data);

      // Replace the roll parts
      rollConfig.parts = parts;
      rollConfig.data = data;
      // Update advantage mode so the formula shows the correct d20 dice
      MidiRollChoiceDialog.applyPreComputedAdvantage(rollConfig, advantageByChoice?.get(newSkill));
      // Update the ability to match the new skill's ability
      processConfig.ability = abilityId;
    };
  }

  /**
   * Factory to create a buildConfig callback for rebuilding tool roll parts
   * when the player changes the tool dropdown.
   *
   * Mirrors dnd5e's `_buildSkillToolConfig` callback but for tool-to-tool changes.
   */
  static createToolBuildConfig(actor: Actor.Implementation, advantageByChoice?: Map<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void {
    return (processConfig, rollConfig, formData, index) => {
      if (index !== 0) return;
      // Get tool from formData if available, otherwise fall back to processConfig for initial render
      const newTool = formData?.get?.("tool") ?? processConfig.tool;
      if (!newTool || typeof newTool !== "string") return;

      //@ts-expect-error no dnd5e-types
      const toolData = actor.system.tools?.[newTool];
      const abilityId = toolData?.ability || GameSystemConfig.tools[newTool]?.ability || "";
      //@ts-expect-error no dnd5e-types
      const ability = actor.system.abilities?.[abilityId];
      const rollData = actor.getRollData();

      //@ts-expect-error no dnd5e-types
      const { calculateSkillToolProficiency } = dnd5e.dataModels.actor.CommonTemplate;
      let prof = calculateSkillToolProficiency(actor, abilityId, { tool: newTool });

      //@ts-expect-error no dnd5e-types
      const { parts, data } = CONFIG.Dice.D20Roll.constructParts({
        mod: ability?.mod,
        prof: prof?.hasProficiency ? prof.term : null,
        [`${newTool}Bonus`]: toolData?.bonuses?.check,
        [`${abilityId}CheckBonus`]: ability?.bonuses?.check,
        //@ts-expect-error no dnd5e-types
        toolBonus: actor.system.bonuses?.abilities?.tool,
        //@ts-expect-error no dnd5e-types
        abilityCheckBonus: actor.system.bonuses?.abilities?.check
      }, rollData);

      // Add exhaustion if the method exists
      //@ts-expect-error no dnd5e-types
      actor.addRollExhaustion?.(parts, data);

      // Replace the roll parts
      rollConfig.parts = parts;
      rollConfig.data = data;
      // Update advantage mode so the formula shows the correct d20 dice
      MidiRollChoiceDialog.applyPreComputedAdvantage(rollConfig, advantageByChoice?.get(newTool));
      // Update the ability to match the new tool's ability
      processConfig.ability = abilityId;
    };
  }
}
