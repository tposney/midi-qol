import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig, MidiUsageChatContext } from "../../globals.js";
import { Workflow } from "../Workflow.js";
import { type UseState } from "./useRelaunch.js";
export declare class MidiConditionField extends globalThis.dnd5e.dataModels.fields.FormulaField {
    _validateType(value: unknown): value is string;
    constructor(options: any);
    static get _defaults(): any;
    /**
     * Override _toInput to wrap the text input with a condition editor button.
     * The button opens the ConditionEditor which provides autocomplete for condition expressions.
     */
    _toInput(config: any): HTMLElement;
}
/**
 * The activity an ammunition item contributes, if any.
 *
 * `automationOnly` wins: that is the deliberate marker for an activity meant to be triggered rather
 * than used directly. The fallback exists because `otherActivityCompatible` defaults to true, so
 * most activities qualify and a homebrew item may not mark one.
 *
 * Takes the item rather than reading it off an activity, because the caller sometimes holds a
 * rebuilt copy: ammunition with `uses.autoDestroy` is deleted by dnd5e as the last piece is spent,
 * and midi reconstructs it from the chat card.
 */
export declare function findAmmunitionActivity(ammunitionItem: any): any | undefined;
export declare function setupMidiActivityMixin(): void;
export declare function registerUsageMessageHooks(): void;
/** An activity of a type midi uses (adoptActivityType): midi's functions apply to it */
export declare function isMidiActivityType(activity: Activity | null | undefined): activity is MidiActivity;
/** midi's region settings on an activity (activitySchema.ts `regionBehavior`) */
interface ActivityRegionBehavior {
    enabled: boolean;
    dispositionFilter: number;
    excludeSource: boolean;
    oncePerTurn: boolean;
    wallRestriction: string;
    regionVisibility: number;
    attachToken: string;
    moveDistance: number;
    moveDirection: string;
    moveTiming: string;
    templateOrigin: string;
    rules: {
        trigger: string;
        action: string;
        targetId: string;
    }[];
}
/** midi's region light on an activity (activitySchema.ts `regionLight`) */
interface ActivityRegionLight {
    enabled: boolean;
    dim: number;
    bright: number;
    color: string | null;
    alpha: number;
    luminosity: number;
    animationType: string | null;
    animationSpeed: number;
    animationIntensity: number;
}
/** An activity midi uses: dnd5e's, with midi's fields (activitySchema.ts) and getters (activityPrototype.ts) */
export type MidiActivity = Activity & {
    regionBehavior?: ActivityRegionBehavior;
    regionLight?: ActivityRegionLight;
    effectiveActivationType?: string;
    isSelfTriggerableOnly?: boolean;
    use?(usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<unknown>;
};
export declare function doConfirmation(activity: MidiActivity, actionToCall: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
export declare function useAs(used: MidiActivity, actor: Actor.Implementation | null | undefined, usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
/**
 * midi's use (M10, activities/useRelaunch.ts): calls dnd5e's use with a use key, which midi's preUseActivity
 * listener cancels and restarts after midi's pre-use work; returns the restart's result. The restarted call
 * (marked) is dnd5e's use itself, so other listeners see one use.
 */
export declare function prepareUse(used: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<{
    done: true;
    result: unknown;
} | {
    done: false;
    state: UseState;
}>;
/** dnd5e's preUseActivity for used use (its workflow): the scaled activity dnd5e uses, and dnd5e's copy of the usage */
export declare function onUsePreUse(activity: MidiActivity, state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): boolean;
/** dnd5e's activityConsumption for activity use: the activity consumption and the card run on, deferred concentration */
export declare function onUseConsumption(activity: MidiActivity, state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): void;
/**
 * midi's work after dnd5e's use (M10 stage 1): the card's workflow, the checks after the card, templates, undo data,
 * the reaction and bonus action markers, cast data, then the workflow's first step. Returns what use() returns.
 */
export declare function finishUse(used: MidiActivity, state: UseState, useResults: any): Promise<unknown>;
/**
 * Check if used activity has consumption configured.
 * @returns true if used activity has consumption targets configured
 */
export declare function hasConsumption(activity: MidiActivity): boolean;
/**
 * Determines whether activity activity should auto-consume resources without showing a dialog.
 * @param workflow - The workflow for getting auto-consume settings
 * @returns true if consumption should be automatic, false if a dialog should be shown
 */
export declare function shouldAutoConsume(activity: MidiActivity, workflow?: Workflow): boolean;
export declare function checkAutoConsume(activity: MidiActivity, usage: ActivityUseConfiguration, dialog?: RollDialogConfig): Promise<boolean>;
export declare function setupCanSeeSense(activity: MidiActivity, usage: {
    workflow?: Workflow;
}): Promise<void>;
export declare function setupTargets(activity: MidiActivity, config: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean>;
export declare function confirmTargets(activity: MidiActivity): Promise<void>;
export declare function preTargetingChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
export declare function preChatChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
export declare function postChatCardChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
export declare function resolveAttachTokenId(activity: MidiActivity, workflow: Workflow | undefined, mode: "caster" | "target"): Promise<string | undefined>;
export declare function promptAttachTargetPicker(activity: MidiActivity, targets: Token.Implementation[]): Promise<string | undefined>;
export declare function placeEmanationTemplate(activity: MidiActivity, workflow: Workflow | undefined): Promise<import("fvtt-types/src/utils/index.mjs")._Override<RegionDocument, {
    readonly id: string;
    _id: string;
    readonly uuid: string;
    _source: import("fvtt-types/src/utils/index.mjs")._Override<{
        _id: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.DefaultOptions>;
        name: string;
        color: string;
        shapes: import("fvtt-types/src/foundry/common/data/fields.mjs").TypedSchemaField.PersistedType<import("fvtt-types/src/foundry/common/data/data.mjs").BaseShapeData.Types, import("fvtt-types/src/foundry/common/data/fields.mjs").TypedSchemaField.DefaultOptions>[];
        elevation: {
            bottom: import("fvtt-types/src/foundry/common/data/fields.mjs").ExtendedNumberField.PersistedType<{
                required: true;
                extension: number;
            }>;
            top: import("fvtt-types/src/foundry/common/data/fields.mjs").ExtendedNumberField.PersistedType<{
                required: true;
                extension: number;
            }>;
            topInclusive: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
        };
        levels: string[];
        restriction: {
            enabled: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
            type: "darkness" | "light" | "sight" | "move" | "sound";
            priority: number;
        };
        attachment: {
            token: import("fvtt-types/src/foundry/common/data/fields.mjs").ForeignDocumentField.PersistedType<{
                idOnly: true;
                nullable: true;
                initial: null;
            }>;
        };
        behaviors: {
            system: any;
            _id: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.DefaultOptions>;
            name: string;
            type: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"adjustDarknessLevel" | "applyActiveEffect" | "changeLevel" | "defineSurface" | "displayScrollingText" | "executeMacro" | "executeScript" | "modifyMovementCost" | "pauseGame" | "suppressWeather" | "teleportToken" | "toggleBehavior" | (`${string}.${string}` & import("fvtt-types/src/utils/index.mjs").Branded<"Document.ModuleSubtype">) | "midi-qol.regionActivity", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentTypeField.MergedOptions<typeof import("fvtt-types/src/foundry/common/documents/region-behavior.mjs").default, import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentTypeField.DefaultOptions>>>, {
                initial: undefined;
            }>>;
            disabled: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
            flags: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentFlagsField._TwoLevelPartial<import("fvtt-types/src/utils/index.mjs").InterfaceToObject<import("fvtt-types/src/foundry/common/abstract/document.mjs").default.CoreFlags>>;
            _stats: {
                coreVersion: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    required: true;
                    blank: false;
                    nullable: true;
                    initial: () => string;
                }>>>;
                systemId: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    required: true;
                    blank: false;
                    nullable: true;
                    initial: () => string | null;
                }>>>;
                systemVersion: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    required: true;
                    blank: false;
                    nullable: true;
                    initial: () => string | null;
                }>>>;
                createdTime: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.DefaultOptions>;
                modifiedTime: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.DefaultOptions>;
                lastModifiedBy: import("fvtt-types/src/foundry/common/data/fields.mjs").ForeignDocumentField.PersistedType<{
                    idOnly: true;
                }>;
                compendiumSource: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentUUIDField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentUUIDField.DefaultOptions>;
                duplicateSource: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentUUIDField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentUUIDField.DefaultOptions>;
                exportSource: import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.PersistedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentStatsField.ExportSourceSchema, {
                    nullable: true;
                }>;
            };
        }[];
        visibility: CONST.REGION_VISIBILITY | null;
        highlightMode: keyof RegionDocument.HighlightModeChoices;
        displayMeasurements: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
        hidden: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
        locked: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
        ownership: Record<string, CONST.DOCUMENT_OWNERSHIP_LEVELS>;
        flags: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentFlagsField._TwoLevelPartial<{
            "midi-qol"?: {
                magical?: boolean;
                magicSchool?: string;
                activityTemplate?: boolean;
                itemUuid?: string;
                actorUuid?: string;
                sourceTokenUuid?: string;
                maxRange?: number;
                workflowId?: string;
                itemCardUuid?: string;
            };
        } & import("fvtt-types/src/utils/index.mjs").InterfaceToObject<import("fvtt-types/src/foundry/common/abstract/document.mjs").default.CoreFlags>>;
        _shapeConstraints: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<number[], {
            nullable: true;
            initial: null;
        }>;
    }, {
        _id: string;
    }>;
    toJSON(): import("fvtt-types/src/utils/index.mjs")._Override<{
        _id: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.DefaultOptions>;
        name: string;
        color: string;
        shapes: import("fvtt-types/src/foundry/common/data/fields.mjs").TypedSchemaField.PersistedType<import("fvtt-types/src/foundry/common/data/data.mjs").BaseShapeData.Types, import("fvtt-types/src/foundry/common/data/fields.mjs").TypedSchemaField.DefaultOptions>[];
        elevation: {
            bottom: import("fvtt-types/src/foundry/common/data/fields.mjs").ExtendedNumberField.PersistedType<{
                required: true;
                extension: number;
            }>;
            top: import("fvtt-types/src/foundry/common/data/fields.mjs").ExtendedNumberField.PersistedType<{
                required: true;
                extension: number;
            }>;
            topInclusive: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
        };
        levels: string[];
        restriction: {
            enabled: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
            type: "darkness" | "light" | "sight" | "move" | "sound";
            priority: number;
        };
        attachment: {
            token: import("fvtt-types/src/foundry/common/data/fields.mjs").ForeignDocumentField.PersistedType<{
                idOnly: true;
                nullable: true;
                initial: null;
            }>;
        };
        behaviors: {
            system: any;
            _id: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.DefaultOptions>;
            name: string;
            type: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"adjustDarknessLevel" | "applyActiveEffect" | "changeLevel" | "defineSurface" | "displayScrollingText" | "executeMacro" | "executeScript" | "modifyMovementCost" | "pauseGame" | "suppressWeather" | "teleportToken" | "toggleBehavior" | (`${string}.${string}` & import("fvtt-types/src/utils/index.mjs").Branded<"Document.ModuleSubtype">) | "midi-qol.regionActivity", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentTypeField.MergedOptions<typeof import("fvtt-types/src/foundry/common/documents/region-behavior.mjs").default, import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentTypeField.DefaultOptions>>>, {
                initial: undefined;
            }>>;
            disabled: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
            flags: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentFlagsField._TwoLevelPartial<import("fvtt-types/src/utils/index.mjs").InterfaceToObject<import("fvtt-types/src/foundry/common/abstract/document.mjs").default.CoreFlags>>;
            _stats: {
                coreVersion: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    required: true;
                    blank: false;
                    nullable: true;
                    initial: () => string;
                }>>>;
                systemId: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    required: true;
                    blank: false;
                    nullable: true;
                    initial: () => string | null;
                }>>>;
                systemVersion: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    required: true;
                    blank: false;
                    nullable: true;
                    initial: () => string | null;
                }>>>;
                createdTime: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.DefaultOptions>;
                modifiedTime: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.DefaultOptions>;
                lastModifiedBy: import("fvtt-types/src/foundry/common/data/fields.mjs").ForeignDocumentField.PersistedType<{
                    idOnly: true;
                }>;
                compendiumSource: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentUUIDField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentUUIDField.DefaultOptions>;
                duplicateSource: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentUUIDField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentUUIDField.DefaultOptions>;
                exportSource: import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.PersistedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentStatsField.ExportSourceSchema, {
                    nullable: true;
                }>;
            };
        }[];
        visibility: CONST.REGION_VISIBILITY | null;
        highlightMode: keyof RegionDocument.HighlightModeChoices;
        displayMeasurements: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
        hidden: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
        locked: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
        ownership: Record<string, CONST.DOCUMENT_OWNERSHIP_LEVELS>;
        flags: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentFlagsField._TwoLevelPartial<{
            "midi-qol"?: {
                magical?: boolean;
                magicSchool?: string;
                activityTemplate?: boolean;
                itemUuid?: string;
                actorUuid?: string;
                sourceTokenUuid?: string;
                maxRange?: number;
                workflowId?: string;
                itemCardUuid?: string;
            };
        } & import("fvtt-types/src/utils/index.mjs").InterfaceToObject<import("fvtt-types/src/foundry/common/abstract/document.mjs").default.CoreFlags>>;
        _shapeConstraints: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<number[], {
            nullable: true;
            initial: null;
        }>;
    }, {
        _id: string;
    }>;
    parent: Scene;
    parentCollection: "regions";
    collection: import("fvtt-types/src/foundry/common/abstract/embedded-collection.mjs").default<import("fvtt-types/src/utils/index.mjs")._Override<RegionDocument, /*elided*/ any>, Scene, import("fvtt-types/src/foundry/common/abstract/embedded-collection.mjs").default.Methods<import("fvtt-types/src/utils/index.mjs")._Override<RegionDocument, /*elided*/ any>>>;
    readonly inCompendium: boolean;
    readonly compendium: CompendiumCollection<"Scene"> | null;
}>[] | undefined>;
/**
 * Attach a MidiRegionActivityBehaviorType to a RegionDocument.
 * If `regionBehavior.enabled` is set on activity activity, uses the stored config.
 * Otherwise falls back to auto-deriving from the overtime sibling activity.
 * @param regionDoc The Region to attach the behavior to
 * @param workflow The current workflow
 * @param overTimeActivity The activity with isOverTimeFlag (may differ from `activity` if `activity` is the Cast activity)
 * @param castLevel The spell level from the usage message (set by dnd5e's _prepareUsageScaling before _usageChatContext)
 */
export declare function attachRegionActivityBehavior(activity: MidiActivity, regionDoc: RegionDocument.Implementation, workflow: Workflow, overTimeActivity: any, castLevel?: number): Promise<void>;
/** midi's additions to the usage context; not named `_usageChatContext`, which would keep dnd5e's legacy content path. */
export declare function midiUsageContext(activity: MidiActivity, message: any): MidiUsageChatContext;
export {};
