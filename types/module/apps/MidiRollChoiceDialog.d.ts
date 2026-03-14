import { RollModifierTracker } from "../lib/RollModifierTracker.js";
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
declare const D20RollConfigurationDialog: any;
export declare class MidiRollChoiceDialog extends D20RollConfigurationDialog {
    static get rollType(): any;
    get config(): any;
    get message(): any;
    get rolls(): any;
    /** Mutable default button override — options are frozen by ApplicationV2, so we track it here instead */
    _midiDefaultButton: string | undefined;
    /** @override */
    static DEFAULT_OPTIONS: {
        rollChoices: RollChoice[];
        advantageByChoice: Map<string, PreComputedAdvantage>;
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
    static createSaveBuildConfig(actor: Actor.Implementation, advantageByChoice?: Map<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void;
    /**
     * Factory to create a buildConfig callback for rebuilding skill roll parts
     * when the player changes the skill dropdown.
     *
     * Mirrors dnd5e's `_buildSkillToolConfig` callback but for skill-to-skill changes.
     */
    static createSkillBuildConfig(actor: Actor.Implementation, advantageByChoice?: Map<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void;
    /**
     * Factory to create a buildConfig callback for rebuilding tool roll parts
     * when the player changes the tool dropdown.
     *
     * Mirrors dnd5e's `_buildSkillToolConfig` callback but for tool-to-tool changes.
     */
    static createToolBuildConfig(actor: Actor.Implementation, advantageByChoice?: Map<string, PreComputedAdvantage>): (processConfig: any, rollConfig: any, formData: FormData | null, index: number) => void;
}
export {};
