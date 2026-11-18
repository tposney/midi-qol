import { PreComputedAdvantageData } from "../../globals.js";
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
declare const D20RollConfigurationDialog: any;
export declare class MidiRollChoiceDialog extends D20RollConfigurationDialog {
    static get rollType(): any;
    get config(): any;
    get message(): any;
    get rolls(): any;
    /** Typed access to our custom options (ApplicationV2 options are untyped) */
    get midiOptions(): {
        rollChoices: RollChoice[];
        choiceType: string;
        advantageByChoice?: Record<string, PreComputedAdvantage>;
        abilityForChoice?: (id: string) => string | undefined;
    };
    /** Typed wrapper for ApplicationV2._updateFrame (protected method) */
    private _midiUpdateFrame;
    /** Typed wrapper for ApplicationV2.render with parts */
    private _midiRenderParts;
    /** Mutable default button override — options are frozen by ApplicationV2, so we track it here instead */
    _midiDefaultButton: string | undefined;
    /** @override */
    static DEFAULT_OPTIONS: {
        rollChoices: RollChoice[];
        advantageByChoice: Record<string, PreComputedAdvantage>;
        choiceType: "ability" | "skill" | "tool";
    };
    /** @override — restore focus to autofocus button after partial re-render of buttons part */
    _syncPartState(partId: any, newElement: any, priorElement: any, state: any): void;
    /** @override — read defaultButton from mutable _midiDefaultButton when set, instead of frozen options */
    _prepareButtonsContext(context: any, options: any): Promise<any>;
    /** @override */
    _prepareConfigurationContext(context: any, options: any): Promise<any>;
    /** @override */
    _onChangeForm(formConfig: any, event: any): void;
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
    static applyPreComputedAdvantage(rollConfig: any, preComputed: PreComputedAdvantage | undefined): void;
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
    static createBuildConfig(actor: Actor.Implementation, rollType: "save" | "check" | "skill" | "tool", advantageByChoice?: Record<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void;
    /** @deprecated Use createBuildConfig(actor, "save", advantageByChoice) instead */
    static createSaveBuildConfig(actor: Actor.Implementation, advantageByChoice?: Record<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void;
    /** @deprecated Use createBuildConfig(actor, "check", advantageByChoice) instead */
    static createCheckBuildConfig(actor: Actor.Implementation, advantageByChoice?: Record<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void;
    /** @deprecated Use createBuildConfig(actor, "skill", advantageByChoice) instead */
    static createSkillBuildConfig(actor: Actor.Implementation, advantageByChoice?: Record<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void;
    /** @deprecated Use createBuildConfig(actor, "tool", advantageByChoice) instead */
    static createToolBuildConfig(actor: Actor.Implementation, advantageByChoice?: Record<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void;
}
export {};
