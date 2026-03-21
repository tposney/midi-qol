import { i18n, i18nFormat, GameSystemConfig } from "../../midi-qol.js";
import { PreComputedAdvantageData } from "../../globals.js";
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

/** Re-export for backward compatibility - canonical type is PreComputedAdvantageData in globals.ts */
export type PreComputedAdvantage = PreComputedAdvantageData;

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

  /** Typed access to our custom options (ApplicationV2 options are untyped) */
  get midiOptions(): { rollChoices: RollChoice[], choiceType: string, advantageByChoice?: Record<string, PreComputedAdvantage> } {
    const opts = (this as any).options;
    return {
      rollChoices: opts.rollChoices ?? [],
      choiceType: opts.choiceType ?? "ability",
      advantageByChoice: opts.advantageByChoice
    };
  }

  /** Typed wrapper for ApplicationV2._updateFrame (protected method) */
  private _midiUpdateFrame(options: { window: { title: string } }): void {
    (this as any)._updateFrame(options);
  }

  /** Typed wrapper for ApplicationV2.render with parts */
  private _midiRenderParts(parts: string[]): void {
    (this as any).render({ parts });
  }

  /** Mutable default button override — options are frozen by ApplicationV2, so we track it here instead */
  _midiDefaultButton: string | undefined;

  /** @override */
  static DEFAULT_OPTIONS = {
    rollChoices: [] as RollChoice[],
    advantageByChoice: {} as Record<string, PreComputedAdvantage>,
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
    const { rollChoices: choices, choiceType } = this.midiOptions;

    // For skill/tool rolls, add the ability dropdown (replicates SkillToolRollConfigurationDialog)
    // so the player can change which ability is used for the check.
    if (choiceType === "skill" || choiceType === "tool") {
      context.fields.unshift({
        field: new foundry.data.fields.StringField({
          //@ts-expect-error no dnd5e-types
          required: true, blank: false, label: game.i18n.localize("DND5E.Abilities")
        }),
        name: "ability",
        options: Object.entries(CONFIG.DND5E.abilities).map(([value, { label }]) => ({ value, label })),
        value: this.config.ability
      });
    }

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
    const { choiceType, advantageByChoice } = this.midiOptions;

    // Handle ability change on skill/tool rolls (replicates SkillToolRollConfigurationDialog)
    if ((choiceType === "skill" || choiceType === "tool") && event.target?.name === "ability") {
      const ability = event.target.value ?? this.config.ability;
      if (this.config.skill) {
        const skillLabel = GameSystemConfig.skills[this.config.skill]?.label ?? "";
        const abilityLabel = GameSystemConfig.abilities[ability]?.label ?? "";
        const flavor = i18nFormat("DND5E.SkillPromptTitle", { skill: skillLabel, ability: abilityLabel });
        foundry.utils.setProperty(this.message, "data.flavor", flavor);
        this._midiUpdateFrame({ window: { title: flavor } });
      }
    }

    if (event.target?.name === choiceType) {
      const newValue = event.target.value;

      if (choiceType === "tool") {
        // Tool change: update config.tool and window title
        this.config.tool = newValue;
        const toolLabel = getToolLabel(newValue);
        const flavor = i18nFormat("DND5E.ToolPromptTitle", { tool: toolLabel });
        foundry.utils.setProperty(this.message, "data.flavor", flavor);
        this._midiUpdateFrame({ window: { title: flavor } });
      } else if (choiceType === "skill") {
        // Skill change: update config.skill and window title
        this.config.skill = newValue;
        const skillLabel = GameSystemConfig.skills[newValue]?.label ?? "";
        const abilityLabel = GameSystemConfig.abilities[this.config.ability]?.label ?? "";
        const flavor = i18nFormat("DND5E.SkillPromptTitle", { skill: skillLabel, ability: abilityLabel });
        foundry.utils.setProperty(this.message, "data.flavor", flavor);
        this._midiUpdateFrame({ window: { title: flavor } });
      } else {
        // Ability change (save): update config.ability and window title
        this.config.ability = newValue;
        const abilityLabel = GameSystemConfig.abilities[newValue]?.label ?? "";
        const flavor = i18nFormat("DND5E.SavePromptTitle", { ability: abilityLabel });
        foundry.utils.setProperty(this.message, "data.flavor", flavor);
        this._midiUpdateFrame({ window: { title: flavor } });
      }

      // Update advantage/disadvantage from pre-computed object
      const preComputed = advantageByChoice?.[newValue];
      if (preComputed) {
        this._midiDefaultButton = preComputed.defaultButton;
        // Re-render buttons to reflect new advantage state
        this._midiRenderParts(["buttons"]);
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
    // Only override advantageMode if pre-computed flags grant advantage or disadvantage.
    // If neither, don't set anything - let keyboard modifiers (shift/ctrl) work.
    if (!preComputed.hasAdvantage && !preComputed.hasDisadvantage) return;

    rollConfig.options ??= {};
    // @ts-expect-error CONFIG.Dice.D20Roll not typed
    const ADV_MODE: { DISADVANTAGE: number, NORMAL: number, ADVANTAGE: number } = CONFIG.Dice.D20Roll.ADV_MODE;
    if (preComputed.hasAdvantage && !preComputed.hasDisadvantage) {
      rollConfig.options.advantageMode = ADV_MODE.ADVANTAGE;
    } else if (!preComputed.hasAdvantage && preComputed.hasDisadvantage) {
      rollConfig.options.advantageMode = ADV_MODE.DISADVANTAGE;
    }
    // Note: If both hasAdvantage and hasDisadvantage are true, they cancel out - don't override
    // Clear legacy flags so configureModifiers() uses advantageMode directly
    delete rollConfig.options.advantage;
    delete rollConfig.options.disadvantage;
  }

  /**
   * Unified factory to create a buildConfig callback for rebuilding roll parts
   * when the player changes the dropdown selection.
   *
   * - skill/tool: Delegates to dnd5e's actor._buildSkillToolConfig()
   * - save/check: Custom implementation (dnd5e has no public method for this)
   *
   * @param actor - The actor making the roll
   * @param rollType - "save", "check", "skill", or "tool"
   * @param advantageByChoice - Pre-computed advantage data keyed by choice ID
   */
  static createBuildConfig(
    actor: Actor.Implementation,
    rollType: "save" | "check" | "skill" | "tool",
    advantageByChoice?: Record<string, PreComputedAdvantage>
  ): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void {
    return (processConfig, rollConfig, formData, index) => {
      if (index !== 0) return;

      let choiceId: string;

      if (rollType === "skill" || rollType === "tool") {
        // Skill/tool: delegate to dnd5e's _buildSkillToolConfig
        const formField = rollType;
        const newChoice = formData?.get?.(formField) ?? processConfig[formField];
        if (!newChoice || typeof newChoice !== "string") return;

        // Compute hostActor for polymorph skill merging (same as dnd5e's _buildSkillTool)
        //@ts-expect-error no dnd5e-types
        const hostActor = actor.isPolymorphed && actor.flags?.dnd5e?.transformOptions?.mergeSkills && (rollType === "skill")
          //@ts-expect-error no dnd5e-types
          ? game.actors.get(actor.flags.dnd5e?.originalActor) : null;

        // Call dnd5e's method - it handles parts construction, proficiency, bonuses, and exhaustion
        //@ts-expect-error no dnd5e-types
        actor._buildSkillToolConfig(rollType, hostActor, processConfig, rollConfig, formData, index);

        choiceId = newChoice;

      } else {
        // Ability save/check: only rebuild if ability CHANGED via form
        // (dnd5e pre-constructs parts in #rollD20Test, so we don't rebuild on fast-forward or same ability)
        const formAbility = formData?.get?.("ability") as string | null;
        choiceId = formAbility ?? processConfig.ability;
        if (!choiceId) return;

        // Only rebuild parts if user changed the ability in the dialog
        if (formAbility && formAbility !== processConfig.ability) {
          //@ts-expect-error no dnd5e-types
          const abilityData = actor.system.abilities?.[formAbility];
          if (!abilityData) return;

          const rollData = actor.getRollData();
          const profKey = `${rollType}Prof` as "saveProf" | "checkProf";
          const typeCapitalized = rollType.charAt(0).toUpperCase() + rollType.slice(1);

          //@ts-expect-error no dnd5e-types
          const { parts, data } = CONFIG.Dice.D20Roll.constructParts({
            mod: abilityData.mod,
            prof: abilityData[profKey]?.hasProficiency ? abilityData[profKey].term : null,
            [`${formAbility}${typeCapitalized}Bonus`]: abilityData.bonuses?.[rollType],
            //@ts-expect-error no dnd5e-types
            [`${rollType}Bonus`]: actor.system.bonuses?.abilities?.[rollType],
            //@ts-expect-error no dnd5e-types
            cover: (formAbility === "dex" && rollType === "save") ? actor.system.attributes?.ac?.cover : null
          }, rollData);

          //@ts-expect-error no dnd5e-types
          actor.addRollExhaustion?.(parts, data);
          rollConfig.parts = parts;
          rollConfig.data = data;
          processConfig.ability = formAbility;
        }
      }

      // Apply midi's pre-computed advantage (midi-specific, not in dnd5e)
      MidiRollChoiceDialog.applyPreComputedAdvantage(rollConfig, advantageByChoice?.[choiceId]);
    };
  }

  // Convenience wrappers for backward compatibility and clearer call sites

  /** @deprecated Use createBuildConfig(actor, "save", advantageByChoice) instead */
  static createSaveBuildConfig(actor: Actor.Implementation, advantageByChoice?: Record<string, PreComputedAdvantage>) {
    return MidiRollChoiceDialog.createBuildConfig(actor, "save", advantageByChoice);
  }

  /** @deprecated Use createBuildConfig(actor, "check", advantageByChoice) instead */
  static createCheckBuildConfig(actor: Actor.Implementation, advantageByChoice?: Record<string, PreComputedAdvantage>) {
    return MidiRollChoiceDialog.createBuildConfig(actor, "check", advantageByChoice);
  }

  /** @deprecated Use createBuildConfig(actor, "skill", advantageByChoice) instead */
  static createSkillBuildConfig(actor: Actor.Implementation, advantageByChoice?: Record<string, PreComputedAdvantage>) {
    return MidiRollChoiceDialog.createBuildConfig(actor, "skill", advantageByChoice);
  }

  /** @deprecated Use createBuildConfig(actor, "tool", advantageByChoice) instead */
  static createToolBuildConfig(actor: Actor.Implementation, advantageByChoice?: Record<string, PreComputedAdvantage>) {
    return MidiRollChoiceDialog.createBuildConfig(actor, "tool", advantageByChoice);
  }
}
